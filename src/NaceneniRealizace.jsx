// ─── Nacenění realizace na objednávku (REA) → konečná faktura ───────────────
// U zakázek „jen realizace“ se necení nabídkou, ale:
//  1. kalkulačkou v Excelu — soubor se nahraje (uloží do Dokumenty na OneDrivu),
//     appka zkusí najít mezisoučty Střecha / Elektro / Doprava / Materiál
//     (případně „Celkem“) a částky předvyplní,
//  2. podle daného ceníku — u položek ceníku se zapíše skutečně provedené
//     množství a cena se dopočítá.
// Vše se dělí na části Střecha, Elektro, Doprava a Materiál (mezisoučty,
// řádky faktury po částech). Z výsledku se vystaví konečná faktura.
// Rozpracovaný stav se drží v zakazky_prubeh.naceneni_rea, ceník v app_settings.

import { Fragment, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { computeInvoiceTotals, nextInvNum } from "./invoicingUtils.js";
import { ulozitDoDokumentu } from "./dokumentyOneDrive.js";

export const CENIK_REA_KEY = "rea_cenik";
const JEDNOTKY = ["ks", "m", "hod", "kpl", "m²", "kg", "km"];
// Části nacenění realizace (pořadí = pořadí na faktuře)
const CASTI = [
  { id: "strecha", nazev: "Střecha", ikona: "🏠", hledat: /střech|strech|konstrukc/i },
  { id: "elektro", nazev: "Elektro", ikona: "⚡", hledat: /elektr/i },
  { id: "doprava", nazev: "Doprava", ikona: "🚚", hledat: /doprav|cestovn|\bkm\b/i },
  { id: "material", nazev: "Materiál", ikona: "📦", hledat: /materi/i },
];
const castById = Object.fromEntries(CASTI.map((c) => [c.id, c]));
const castPolozky = (p) => (castById[p.cast] ? p.cast : "elektro"); // starší položky bez části → Elektro

const karta = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" };
const btn = (bg, fg = "#fff") => ({ background: bg, color: fg, border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const btnGhost = { background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 9px", fontSize: 14, fontFamily: "inherit", color: "#0f172a", background: "#fff" };
const lbl = { fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 };
const fmtKc = (n) => `${Math.round(Number(n) || 0).toLocaleString("cs-CZ")} Kč`;
// „1 250,50 Kč“ → 1250.5; prázdné → 0; nesmysl → NaN
const cislo = (v) => {
  const t = String(v ?? "").replace(/kč/gi, "").replace(/\s/g, "").replace(",", ".");
  return t === "" ? 0 : Number(t);
};
const naText = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
const novyId = () => Math.random().toString(36).slice(2, 9);
const zaDni = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Projde sešit: mezisoučty jednotlivých částí (řádek s názvem části a „celkem /
// součet / mezisoučet“) a celkový součet. Bere poslední nenulové číslo v řádku.
async function castkyZExcelu(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const casti = {};
  let celkem = null;
  for (const jmeno of wb.SheetNames) {
    const radky = XLSX.utils.sheet_to_json(wb.Sheets[jmeno], { header: 1, raw: true, blankrows: false });
    for (const r of radky) {
      const text = r.filter((c) => typeof c === "string").join(" ").trim();
      if (!/celkem|součet|soucet|total|k\s*úhradě/i.test(text)) continue;
      const cisla = r.filter((c) => typeof c === "number" && Number.isFinite(c) && c !== 0);
      if (!cisla.length) continue;
      const castka = cisla[cisla.length - 1];
      const cast = CASTI.find((c) => c.hledat.test(text));
      if (cast) casti[cast.id] = { castka, popis: text, list: jmeno };
      else celkem = { castka, popis: text, list: jmeno };
    }
  }
  return { casti, celkem };
}

export default function NaceneniRealizace({ zak, zakaznik, kodZakazky, slozka, smiNastavit, ja, onUlozit, onZavrit, zajistitZakazku, ukazHlasku }) {
  const ulozene = zak.naceneni_rea || {};
  const [varianta, setVarianta] = useState(ulozene.varianta || "cenik");
  // Excel: částky po částech; starší uložená jedna částka → Elektro
  const [excel, setExcel] = useState(() => {
    const e = ulozene.excel || {};
    return { ...e, castky: e.castky || (e.castka ? { elektro: e.castka } : {}) };
  });
  const [polozky, setPolozky] = useState(ulozene.polozky || null); // [{ id, cast, nazev, jednotka, cena, mnozstvi }]
  const [dph, setDph] = useState(ulozene.dph ?? 21);
  const [cenik, setCenik] = useState(null);
  const [upravaCeniku, setUpravaCeniku] = useState(null); // kopie ceníku při úpravě
  const [pracuji, setPracuji] = useState(false);
  const [zprava, setZprava] = useState(null); // { text, chyba }
  const faktura = ulozene.invoice_id ? { id: ulozene.invoice_id, cislo: ulozene.invoice_number } : null;

  useEffect(() => {
    let zruseno = false;
    supabase.from("app_settings").select("value").eq("key", CENIK_REA_KEY).maybeSingle().then(({ data }) => {
      if (zruseno) return;
      const c = data?.value?.polozky || [];
      setCenik(c);
      // nová kalkulace: všechny položky ceníku s nulovým množstvím
      setPolozky((p) => p || c.map((x) => ({ id: novyId(), cast: castPolozky(x), nazev: x.nazev, jednotka: x.jednotka, cena: x.cena, mnozstvi: "" })));
    });
    return () => { zruseno = true; };
  }, []);

  // Položky faktury podle zvolené varianty — seřazené po částech
  const polozkyFaktury = () => {
    if (varianta === "excel") {
      return CASTI.filter((c) => cislo(excel.castky?.[c.id]) > 0).map((c) => ({
        desc: `${c.nazev} — realizace dle kalkulace${zak.nazev ? ` (${zak.nazev})` : ""}`, qty: 1, unit: "kpl",
        price: Math.round(cislo(excel.castky[c.id]) * 100) / 100, vatRate: Number(dph), cast: c.id,
      }));
    }
    return CASTI.flatMap((c) => (polozky || [])
      .filter((p) => castPolozky(p) === c.id && String(p.nazev || "").trim() && cislo(p.mnozstvi) > 0)
      .map((p) => ({ desc: p.nazev.trim().toLowerCase().startsWith(c.nazev.toLowerCase()) ? p.nazev.trim() : `${c.nazev}: ${p.nazev.trim()}`, qty: cislo(p.mnozstvi), unit: p.jednotka || "ks", price: cislo(p.cena), vatRate: Number(dph), cast: c.id })));
  };
  const spatnaCisla = varianta === "excel"
    ? CASTI.some((c) => Number.isNaN(cislo(excel.castky?.[c.id])))
    : (polozky || []).some((p) => Number.isNaN(cislo(p.mnozstvi)) || Number.isNaN(cislo(p.cena)));
  const radkyFaktury = polozkyFaktury();
  const souhrn = computeInvoiceTotals(radkyFaktury);
  // Mezisoučty částí bez DPH
  const rozpis = Object.fromEntries(CASTI.map((c) => [c.id, radkyFaktury.filter((r) => r.cast === c.id).reduce((s, r) => s + r.qty * r.price, 0)]));

  const stav = () => ({ ...ulozene, varianta, excel, polozky, dph: Number(dph), rozpis, upraveno: new Date().toISOString(), kdo: ja || null });

  const ulozit = async () => {
    setPracuji(true);
    const ok = await onUlozit({ naceneni_rea: stav() }, null);
    setPracuji(false);
    if (ok) { ukazHlasku("✓ Nacenění realizace uložené"); onZavrit(); }
  };

  // ── Excel: nahrát soubor, uložit na OneDrive, najít částky ──
  const nahratExcel = async (file) => {
    if (!file) return;
    setPracuji(true);
    setZprava(null);
    let nalez = { casti: {}, celkem: null };
    try { nalez = await castkyZExcelu(file); } catch (e) { console.warn("Excel se nepodařilo přečíst:", e); }
    let onedrive = null, chyba = null;
    try {
      const r = await ulozitDoDokumentu(slozka, `Kalkulace realizace ${kodZakazky || ""} ${file.name}`.replace(/\s+/g, " "), file, file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      if (r) onedrive = r.webUrl; else chyba = "OneDrive není připojený";
    } catch (e) { chyba = e.message || String(e); }
    const nalezene = CASTI.filter((c) => nalez.casti[c.id]);
    setExcel((x) => ({
      ...x, soubor: file.name, onedrive,
      castky: nalezene.length ? Object.fromEntries(nalezene.map((c) => [c.id, naText(nalez.casti[c.id].castka)])) : x.castky,
      celkemExcel: nalez.celkem ? nalez.celkem.castka : null,
    }));
    setPracuji(false);
    setZprava({
      chyba: !!chyba || !nalezene.length,
      text: [
        onedrive ? "✓ Kalkulace uložená na OneDrive do složky Dokumenty." : `⚠ Kalkulace se na OneDrive neuložila (${chyba}) — nahraj ji prosím znovu, až bude OneDrive připojený.`,
        nalezene.length ? `Předvyplněno: ${nalezene.map((c) => `${c.nazev} (z řádku „${nalez.casti[c.id].popis}“)`).join(", ")} — zkontroluj, jestli jsou částky bez DPH.`
          : `Mezisoučty Střecha / Elektro / Doprava / Materiál jsem v souboru nenašel — rozepiš částky ručně.${nalez.celkem ? ` Celkem v kalkulaci: ${fmtKc(nalez.celkem.castka)}.` : ""}`,
      ].join(" "),
    });
  };

  // ── Ceník (admin / vedoucí) ──
  const ulozitCenik = async () => {
    if (upravaCeniku.some((x) => String(x.nazev || "").trim() && Number.isNaN(cislo(x.cena)))) { setZprava({ chyba: true, text: "V ceníku je cena, která není číslo (např. 450 nebo 450,50)." }); return; }
    const c = upravaCeniku.filter((x) => String(x.nazev || "").trim())
      .map((x) => ({ cast: castPolozky(x), nazev: x.nazev.trim(), jednotka: x.jednotka || "ks", cena: cislo(x.cena) || 0 }))
      .sort((a, b) => CASTI.findIndex((k) => k.id === a.cast) - CASTI.findIndex((k) => k.id === b.cast));
    const { error } = await supabase.from("app_settings").upsert({ key: CENIK_REA_KEY, value: { polozky: c }, updated_at: new Date().toISOString() });
    if (error) { setZprava({ chyba: true, text: "Ceník se nepodařilo uložit: " + error.message }); return; }
    setCenik(c);
    // doplnit nové položky ceníku do rozpracovaného soupisu, u nevyplněných aktualizovat cenu a část
    setPolozky((p) => {
      const pole = [...(p || [])];
      c.forEach((x) => {
        const i = pole.findIndex((y) => y.nazev === x.nazev);
        if (i < 0) pole.push({ id: novyId(), cast: x.cast, nazev: x.nazev, jednotka: x.jednotka, cena: x.cena, mnozstvi: "" });
        else if (!cislo(pole[i].mnozstvi)) pole[i] = { ...pole[i], cast: x.cast, jednotka: x.jednotka, cena: x.cena };
      });
      return pole;
    });
    setUpravaCeniku(null);
    setZprava({ chyba: false, text: "✓ Ceník uložený — platí pro všechny zakázky „jen realizace“." });
  };

  // ── Faktura ──
  const vystavit = async () => {
    const items = polozkyFaktury().map((r) => { const radek = { ...r }; delete radek.cast; return radek; });
    const { total, totalTax } = computeInvoiceTotals(items);
    if (spatnaCisla) { setZprava({ chyba: true, text: "Některé číslo není platné (např. 12 nebo 12,5)." }); return; }
    if (!items.length || total <= 0) { setZprava({ chyba: true, text: varianta === "excel" ? "Zadej částky z kalkulace (aspoň jednu část)." : "Zapiš u položek ceníku skutečně provedené množství." }); return; }
    if (!zak.customer_id) { setZprava({ chyba: true, text: "Zakázka nemá zákazníka (objednatele) — doplň ho, jinak fakturu nejde vystavit." }); return; }
    setPracuji(true);
    setZprava(null);
    const contractId = await zajistitZakazku(zak);
    const vystaveno = new Date().toISOString().slice(0, 10);
    const splatno = zaDni(Number(zakaznik?.payment_terms_days) || 14);
    let row = null;
    for (let pokus = 0; pokus < 5 && !row; pokus++) {
      const { data: cisla } = await supabase.from("invoices").select("number");
      const cisloF = nextInvNum(cisla || []);
      const { data, error } = await supabase.from("invoices").insert({
        number: cisloF, customer_id: zak.customer_id, amount: total - totalTax, tax: totalTax, status: "Čeká",
        issued: vystaveno, due: splatno, items, invoice_type: "vydaná", is_deposit: false,
        order_ref: kodZakazky || zak.nazev, variable_symbol: cisloF.replace(/\D/g, ""), contract_id: contractId || null,
      }).select().single();
      if (!error) row = data;
      else if (error.code !== "23505") { setPracuji(false); setZprava({ chyba: true, text: "Fakturu se nepodařilo vystavit: " + error.message }); return; }
    }
    if (!row) { setPracuji(false); setZprava({ chyba: true, text: "Fakturu se nepodařilo vystavit (číslo faktury se opakovaně srazilo), zkus to znovu." }); return; }
    await supabase.from("invoice_events").insert({ invoice_id: row.id, type: "vystavena" });
    const textRozpisu = CASTI.filter((c) => rozpis[c.id] > 0).map((c) => `${c.nazev} ${fmtKc(rozpis[c.id])}`).join(", ");
    const ok = await onUlozit({
      naceneni_rea: { ...stav(), invoice_id: row.id, invoice_number: row.number, vyfakturovano: total - totalTax },
      hodnota: Math.round(total - totalTax),
      hotove_ukoly: { ...(zak.hotove_ukoly || {}), "vyuctovani.faktura": true },
    }, `Konečná faktura ${row.number} vystavená z nacenění realizace (${varianta === "excel" ? "kalkulace v Excelu" : "ceník podle skutečnosti"}) — ${fmtKc(total - totalTax)} bez DPH (${textRozpisu}).`);
    setPracuji(false);
    if (ok) { ukazHlasku(`✓ Faktura ${row.number} vystavená — najdeš ji ve Fakturaci`); onZavrit(); }
  };

  const zmenitPolozku = (id, k, v) => setPolozky((p) => p.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const zalozka = (id, text) => (
    <button type="button" role="tab" aria-selected={varianta === id} onClick={() => setVarianta(id)} disabled={!!faktura}
      style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `2px solid ${varianta === id ? "#0369a1" : "#e2e8f0"}`, background: varianta === id ? "#eff6ff" : "#fff", color: varianta === id ? "#0369a1" : "#475569", fontWeight: 800, fontSize: 14, cursor: faktura ? "default" : "pointer", fontFamily: "inherit" }}>{text}</button>
  );
  const vyberCasti = (hodnota, onChange, popisek) => (
    <select style={inp} aria-label={popisek} value={hodnota} disabled={!!faktura} onChange={(e) => onChange(e.target.value)}>
      {CASTI.map((c) => <option key={c.id} value={c.id}>{c.ikona} {c.nazev}</option>)}
    </select>
  );
  const mrizka = "1fr 90px 80px 110px 100px";
  const nadpisCasti = (c, soucet) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingBottom: 4, borderBottom: "2px solid #e2e8f0", fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
      <span>{c.ikona} {c.nazev}</span>
      <span style={{ color: soucet > 0 ? "#0369a1" : "#94a3b8" }}>{soucet > 0 ? fmtKc(soucet) : "—"}</span>
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rea-titulek" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 9000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}>
      <div style={{ textAlign: "left", background: "#f8fafc", borderRadius: 16, width: "100%", maxWidth: 760, padding: 18, boxShadow: "0 20px 50px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div id="rea-titulek" style={{ fontSize: 18, fontWeight: 800 }}>💰 Nacenění realizace → faktura</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>{[kodZakazky, zak.nazev, zakaznik?.name].filter(Boolean).join(" · ")}</div>
          </div>
          <button type="button" onClick={onZavrit} aria-label="Zavřít" style={{ ...btnGhost, fontSize: 18, padding: "2px 10px" }}>✕</button>
        </div>

        {faktura && (
          <div style={{ ...karta, background: "#f0fdf4", borderColor: "#bbf7d0", color: "#166534", fontSize: 14 }}>
            ✓ Faktura <b>{faktura.cislo}</b> je vystavená ({fmtKc(ulozene.vyfakturovano)} bez DPH). Úpravy nebo dobropis řeš ve Fakturaci.
          </div>
        )}

        <div role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {zalozka("excel", "📊 1. Kalkulace v Excelu")}
          {zalozka("cenik", "📋 2. Ceník podle skutečnosti")}
        </div>

        {varianta === "excel" ? (
          <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, color: "#475569" }}>Nahraj vyplněnou kalkulačku (.xlsx). Uloží se k zakázce do složky Dokumenty na OneDrivu a appka zkusí najít mezisoučty Střecha / Elektro / Doprava / Materiál.</div>
            <label style={{ ...btnGhost, alignSelf: "flex-start", display: "inline-flex", gap: 6, alignItems: "center", opacity: faktura ? 0.5 : 1 }}>
              📎 {excel.soubor ? "Nahrát jinou kalkulaci" : "Nahrát kalkulaci z Excelu"}
              <input type="file" accept=".xlsx,.xls,.xlsm,.csv" disabled={pracuji || !!faktura} style={{ display: "none" }} onChange={(e) => { nahratExcel(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {excel.soubor && (
              <div style={{ fontSize: 13, color: "#334155" }}>
                📄 {excel.soubor}{excel.onedrive ? <> · <a href={excel.onedrive} target="_blank" rel="noreferrer">otevřít na OneDrivu</a></> : <span style={{ color: "#b91c1c" }}> · neuloženo na OneDrive</span>}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              {CASTI.map((c) => (
                <div key={c.id}><label style={lbl} htmlFor={`rea-${c.id}`}>{c.ikona} {c.nazev} — bez DPH (Kč)</label>
                  <input id={`rea-${c.id}`} style={{ ...inp, borderColor: Number.isNaN(cislo(excel.castky?.[c.id])) ? "#f87171" : "#cbd5e1" }} inputMode="decimal" placeholder="0" disabled={!!faktura}
                    value={excel.castky?.[c.id] || ""} onChange={(e) => setExcel({ ...excel, castky: { ...(excel.castky || {}), [c.id]: e.target.value } })} /></div>
              ))}
            </div>
            {excel.celkemExcel > 0 && (
              <div style={{ fontSize: 13, color: Math.abs(excel.celkemExcel - (souhrn.total - souhrn.totalTax)) < 1 ? "#15803d" : "#b45309" }}>
                Celkem v kalkulaci {fmtKc(excel.celkemExcel)} · rozepsáno {fmtKc(souhrn.total - souhrn.totalTax)}
                {Math.abs(excel.celkemExcel - (souhrn.total - souhrn.totalTax)) < 1 ? " ✓ sedí" : " — nesedí, zkontroluj rozpis (nebo jde o částku s DPH)"}
              </div>
            )}
          </div>
        ) : (
          <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: "#475569" }}>U položek zapiš <b>skutečně provedené</b> množství — cena se dopočítá podle ceníku.</div>
              {smiNastavit && !upravaCeniku && <button type="button" style={btnGhost} onClick={() => setUpravaCeniku((cenik || []).map((x) => ({ ...x, cast: castPolozky(x), id: novyId() })))}>⚙ Upravit ceník</button>}
            </div>

            {upravaCeniku ? (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#92400e" }}>Ceník realizací (společný pro všechny zakázky „jen realizace“)</div>
                {CASTI.map((c) => (
                  <Fragment key={c.id}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>{c.ikona} {c.nazev}</div>
                    {upravaCeniku.filter((x) => castPolozky(x) === c.id).map((x) => (
                      <div key={x.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 100px 34px", gap: 6 }}>
                        <input style={inp} aria-label="Položka ceníku" placeholder="např. Montáž panelu na střechu" value={x.nazev} onChange={(e) => setUpravaCeniku((cc) => cc.map((y) => (y.id === x.id ? { ...y, nazev: e.target.value } : y)))} />
                        {vyberCasti(castPolozky(x), (v) => setUpravaCeniku((cc) => cc.map((y) => (y.id === x.id ? { ...y, cast: v } : y))), "Část")}
                        <select style={inp} aria-label="Jednotka" value={x.jednotka || "ks"} onChange={(e) => setUpravaCeniku((cc) => cc.map((y) => (y.id === x.id ? { ...y, jednotka: e.target.value } : y)))}>
                          {JEDNOTKY.map((j) => <option key={j}>{j}</option>)}
                        </select>
                        <input style={inp} aria-label="Cena za jednotku bez DPH" inputMode="decimal" placeholder="Kč / jedn." value={x.cena ?? ""} onChange={(e) => setUpravaCeniku((cc) => cc.map((y) => (y.id === x.id ? { ...y, cena: e.target.value } : y)))} />
                        <button type="button" aria-label="Odebrat položku" style={{ ...btnGhost, padding: 0 }} onClick={() => setUpravaCeniku((cc) => cc.filter((y) => y.id !== x.id))}>✕</button>
                      </div>
                    ))}
                    <button type="button" style={{ ...btnGhost, alignSelf: "flex-start", padding: "4px 10px", fontSize: 12 }} onClick={() => setUpravaCeniku((cc) => [...cc, { id: novyId(), cast: c.id, nazev: "", jednotka: c.id === "doprava" ? "km" : "ks", cena: "" }])}>+ Položka — {c.nazev}</button>
                  </Fragment>
                ))}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
                  <button type="button" style={btnGhost} onClick={() => setUpravaCeniku(null)}>Zrušit</button>
                  <button type="button" style={btn("#b45309")} onClick={ulozitCenik}>Uložit ceník</button>
                </div>
              </div>
            ) : polozky === null ? (
              <div style={{ fontSize: 13, color: "#64748b" }}>Načítám ceník…</div>
            ) : (
              <>
                {!polozky.length && <div style={{ fontSize: 13, color: "#92400e" }}>Ceník je zatím prázdný{smiNastavit ? " — nastav ho tlačítkem ⚙ Upravit ceník, nebo přidej položku jen pro tuto zakázku." : " — požádej vedoucího o nastavení, nebo přidej položku jen pro tuto zakázku."}</div>}
                {CASTI.map((c) => {
                  const vCasti = polozky.filter((p) => castPolozky(p) === c.id);
                  return (
                    <Fragment key={c.id}>
                      {nadpisCasti(c, rozpis[c.id])}
                      {vCasti.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: mrizka, gap: 6, fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>
                          <span>Položka</span><span>Skutečnost</span><span>Jedn.</span><span>Kč / jedn.</span><span style={{ textAlign: "right" }}>Celkem</span>
                        </div>
                      )}
                      {vCasti.map((p) => {
                        const zCeniku = (cenik || []).some((x) => x.nazev === p.nazev);
                        const radek = cislo(p.mnozstvi) * cislo(p.cena);
                        return (
                          <div key={p.id} style={{ display: "grid", gridTemplateColumns: mrizka, gap: 6, alignItems: "center", opacity: cislo(p.mnozstvi) > 0 ? 1 : 0.75 }}>
                            {zCeniku ? <span style={{ fontSize: 14, fontWeight: cislo(p.mnozstvi) > 0 ? 700 : 400 }}>{p.nazev}</span>
                              : <input style={inp} aria-label="Vlastní položka" placeholder="Vlastní položka" value={p.nazev} disabled={!!faktura} onChange={(e) => zmenitPolozku(p.id, "nazev", e.target.value)} />}
                            <input style={{ ...inp, borderColor: Number.isNaN(cislo(p.mnozstvi)) ? "#f87171" : "#cbd5e1" }} aria-label={`Skutečné množství — ${p.nazev}`} inputMode="decimal" placeholder="0" value={p.mnozstvi} disabled={!!faktura} onChange={(e) => zmenitPolozku(p.id, "mnozstvi", e.target.value)} />
                            {zCeniku ? <span style={{ fontSize: 13, color: "#475569" }}>{p.jednotka}</span>
                              : <select style={inp} aria-label="Jednotka" value={p.jednotka || "ks"} disabled={!!faktura} onChange={(e) => zmenitPolozku(p.id, "jednotka", e.target.value)}>{JEDNOTKY.map((j) => <option key={j}>{j}</option>)}</select>}
                            <input style={{ ...inp, borderColor: Number.isNaN(cislo(p.cena)) ? "#f87171" : "#cbd5e1" }} aria-label={`Cena za jednotku — ${p.nazev}`} inputMode="decimal" value={p.cena ?? ""} disabled={!!faktura} onChange={(e) => zmenitPolozku(p.id, "cena", e.target.value)} />
                            <span style={{ textAlign: "right", fontSize: 14, fontWeight: 700 }}>{radek > 0 ? fmtKc(radek) : "—"}</span>
                          </div>
                        );
                      })}
                      {!faktura && (
                        <button type="button" style={{ ...btnGhost, alignSelf: "flex-start", padding: "4px 10px", fontSize: 12 }}
                          onClick={() => setPolozky((p) => [...p, { id: novyId(), cast: c.id, nazev: "", jednotka: c.id === "doprava" ? "km" : "ks", cena: "", mnozstvi: "" }])}>+ Vlastní položka — {c.nazev}</button>
                      )}
                    </Fragment>
                  );
                })}
              </>
            )}
          </div>
        )}

        <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
            {CASTI.map((c) => (
              <div key={c.id} style={{ background: rozpis[c.id] > 0 ? "#eff6ff" : "#f8fafc", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{c.ikona} {c.nazev}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: rozpis[c.id] > 0 ? "#0f172a" : "#94a3b8" }}>{fmtKc(rozpis[c.id])}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ width: 150 }}>
              <label style={lbl} htmlFor="rea-dph">DPH</label>
              <select id="rea-dph" style={inp} value={dph} disabled={!!faktura} onChange={(e) => setDph(Number(e.target.value))}>
                <option value={21}>21 %</option><option value={12}>12 %</option><option value={0}>0 % (přenesená povinnost)</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 220, textAlign: "right", fontSize: 14, color: "#334155" }}>
              <div>Bez DPH: <b>{fmtKc(souhrn.total - souhrn.totalTax)}</b> · DPH: {fmtKc(souhrn.totalTax)}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>Celkem {fmtKc(souhrn.total)}</div>
            </div>
          </div>
        </div>

        {zprava && (
          <div role={zprava.chyba ? "alert" : "status"} style={{ ...karta, background: zprava.chyba ? "#fef2f2" : "#f0fdf4", borderColor: zprava.chyba ? "#fecaca" : "#bbf7d0", color: zprava.chyba ? "#991b1b" : "#166534", fontSize: 13 }}>{zprava.text}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" style={btnGhost} onClick={onZavrit}>Zavřít</button>
          {!faktura && <button type="button" style={btnGhost} disabled={pracuji} onClick={ulozit}>💾 Uložit rozpracované</button>}
          {!faktura && <button type="button" style={btn("#15803d")} disabled={pracuji || spatnaCisla} onClick={vystavit}>{pracuji ? "Pracuji…" : `🧾 Vystavit konečnou fakturu (${fmtKc(souhrn.total)})`}</button>}
        </div>
      </div>
    </div>
  );
}
