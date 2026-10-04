// ─── Nacenění realizace na objednávku (REA) → konečná faktura ───────────────
// U zakázek „jen realizace“ se necení nabídkou, ale:
//  1. kalkulačkou v Excelu — soubor se nahraje (uloží do Dokumenty na OneDrivu),
//     appka zkusí najít řádek „Celkem“ a částku předvyplní,
//  2. podle daného ceníku — u položek ceníku se zapíše skutečně provedené
//     množství a cena se dopočítá.
// Z výsledku se vystaví konečná faktura (stejně jako ve Fakturaci / Servisu).
// Rozpracovaný stav se drží v zakazky_prubeh.naceneni_rea, ceník v app_settings.

import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { computeInvoiceTotals, nextInvNum } from "./invoicingUtils.js";
import { ulozitDoDokumentu } from "./dokumentyOneDrive.js";

export const CENIK_REA_KEY = "rea_cenik";
const JEDNOTKY = ["ks", "m", "hod", "kpl", "m²", "kg", "km"];

const karta = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" };
const btn = (bg, fg = "#fff") => ({ background: bg, color: fg, border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const btnGhost = { background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 9px", fontSize: 14, fontFamily: "inherit", color: "#0f172a", background: "#fff" };
const lbl = { fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 };
const fmtKc = (n) => `${Math.round(Number(n) || 0).toLocaleString("cs-CZ")} Kč`;
// „1 250,50 Kč“ → 1250.5; prázdné → 0; nesmysl → NaN
const cislo = (v) => {
  const t = String(v ?? "").replace(/kč/gi, "").replace(/[\s ]/g, "").replace(",", ".");
  return t === "" ? 0 : Number(t);
};
const novyId = () => Math.random().toString(36).slice(2, 9);

// Najde v sešitu poslední řádek s „celkem / total“ a vezme z něj poslední číslo.
async function celkemZExcelu(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  let nalez = null;
  for (const jmeno of wb.SheetNames) {
    const radky = XLSX.utils.sheet_to_json(wb.Sheets[jmeno], { header: 1, raw: true, blankrows: false });
    for (const r of radky) {
      if (!r.some((c) => typeof c === "string" && /celkem|total|k\s*úhradě/i.test(c))) continue;
      const cisla = r.filter((c) => typeof c === "number" && Number.isFinite(c) && c !== 0);
      if (cisla.length) nalez = { castka: cisla[cisla.length - 1], list: jmeno, popis: r.filter((c) => typeof c === "string").join(" ").trim() };
    }
  }
  return nalez;
}

export default function NaceneniRealizace({ zak, zakaznik, kodZakazky, slozka, smiNastavit, ja, onUlozit, onZavrit, zajistitZakazku, ukazHlasku }) {
  const ulozene = zak.naceneni_rea || {};
  const [varianta, setVarianta] = useState(ulozene.varianta || "cenik");
  const [excel, setExcel] = useState(ulozene.excel || { popis: `Realizace dle kalkulace — ${zak.nazev}`, castka: "" });
  const [polozky, setPolozky] = useState(ulozene.polozky || null); // [{ id, nazev, jednotka, cena, mnozstvi }]
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
      setPolozky((p) => p || c.map((x) => ({ id: novyId(), nazev: x.nazev, jednotka: x.jednotka, cena: x.cena, mnozstvi: "" })));
    });
    return () => { zruseno = true; };
  }, []);

  // Položky faktury podle zvolené varianty
  const polozkyFaktury = () => {
    if (varianta === "excel") {
      const c = cislo(excel.castka);
      return c > 0 ? [{ desc: excel.popis || `Realizace — ${zak.nazev}`, qty: 1, unit: "kpl", price: Math.round(c * 100) / 100, vatRate: Number(dph) }] : [];
    }
    return (polozky || [])
      .filter((p) => String(p.nazev || "").trim() && cislo(p.mnozstvi) > 0)
      .map((p) => ({ desc: p.nazev.trim(), qty: cislo(p.mnozstvi), unit: p.jednotka || "ks", price: cislo(p.cena), vatRate: Number(dph) }));
  };
  const spatnaCisla = varianta === "excel"
    ? Number.isNaN(cislo(excel.castka))
    : (polozky || []).some((p) => Number.isNaN(cislo(p.mnozstvi)) || Number.isNaN(cislo(p.cena)));
  const souhrn = computeInvoiceTotals(polozkyFaktury());

  const stav = () => ({ ...ulozene, varianta, excel, polozky, dph: Number(dph), upraveno: new Date().toISOString(), kdo: ja || null });

  const ulozit = async () => {
    setPracuji(true);
    const ok = await onUlozit({ naceneni_rea: stav() }, null);
    setPracuji(false);
    if (ok) { ukazHlasku("✓ Nacenění realizace uložené"); onZavrit(); }
  };

  // ── Excel: nahrát soubor, uložit na OneDrive, najít částku ──
  const nahratExcel = async (file) => {
    if (!file) return;
    setPracuji(true);
    setZprava(null);
    let nalez = null;
    try { nalez = await celkemZExcelu(file); } catch (e) { console.warn("Excel se nepodařilo přečíst:", e); }
    let onedrive = null, chyba = null;
    try {
      const r = await ulozitDoDokumentu(slozka, `Kalkulace realizace ${kodZakazky || ""} ${file.name}`.replace(/\s+/g, " "), file, file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      if (r) onedrive = r.webUrl; else chyba = "OneDrive není připojený";
    } catch (e) { chyba = e.message || String(e); }
    setExcel((x) => ({ ...x, soubor: file.name, onedrive, ...(nalez ? { castka: String(Math.round(nalez.castka * 100) / 100).replace(".", ","), nalezeno: `${nalez.popis} (list ${nalez.list})` } : { nalezeno: null }) }));
    setPracuji(false);
    setZprava({
      chyba: !!chyba || !nalez,
      text: [
        onedrive ? "✓ Kalkulace uložená na OneDrive do složky Dokumenty." : `⚠ Kalkulace se na OneDrive neuložila (${chyba}) — nahraj ji prosím znovu, až bude OneDrive připojený.`,
        nalez ? `Částka předvyplněná z řádku „${nalez.popis}“ — zkontroluj, jestli je bez DPH.` : "Řádek „Celkem“ jsem v souboru nenašel — částku bez DPH opiš ručně.",
      ].join(" "),
    });
  };

  // ── Ceník (admin / vedoucí) ──
  const ulozitCenik = async () => {
    const c = upravaCeniku.filter((x) => String(x.nazev || "").trim()).map((x) => ({ nazev: x.nazev.trim(), jednotka: x.jednotka || "ks", cena: cislo(x.cena) || 0 }));
    if (upravaCeniku.some((x) => String(x.nazev || "").trim() && Number.isNaN(cislo(x.cena)))) { setZprava({ chyba: true, text: "V ceníku je cena, která není číslo (např. 450 nebo 450,50)." }); return; }
    const { error } = await supabase.from("app_settings").upsert({ key: CENIK_REA_KEY, value: { polozky: c }, updated_at: new Date().toISOString() });
    if (error) { setZprava({ chyba: true, text: "Ceník se nepodařilo uložit: " + error.message }); return; }
    setCenik(c);
    // doplnit nové položky ceníku do rozpracovaného soupisu, ceny u nevyplněných aktualizovat
    setPolozky((p) => {
      const pole = [...(p || [])];
      c.forEach((x) => {
        const i = pole.findIndex((y) => y.nazev === x.nazev);
        if (i < 0) pole.push({ id: novyId(), nazev: x.nazev, jednotka: x.jednotka, cena: x.cena, mnozstvi: "" });
        else if (!cislo(pole[i].mnozstvi)) pole[i] = { ...pole[i], jednotka: x.jednotka, cena: x.cena };
      });
      return pole;
    });
    setUpravaCeniku(null);
    setZprava({ chyba: false, text: "✓ Ceník uložený — platí pro všechny zakázky „jen realizace“." });
  };

  // ── Faktura ──
  const vystavit = async () => {
    const items = polozkyFaktury();
    const { total, totalTax } = computeInvoiceTotals(items);
    if (spatnaCisla) { setZprava({ chyba: true, text: "Některé číslo není platné (např. 12 nebo 12,5)." }); return; }
    if (!items.length || total <= 0) { setZprava({ chyba: true, text: varianta === "excel" ? "Zadej částku z kalkulace." : "Zapiš u položek ceníku skutečně provedené množství." }); return; }
    if (!zak.customer_id) { setZprava({ chyba: true, text: "Zakázka nemá zákazníka (objednatele) — doplň ho, jinak fakturu nejde vystavit." }); return; }
    setPracuji(true);
    setZprava(null);
    const contractId = await zajistitZakazku(zak);
    const vystaveno = new Date().toISOString().slice(0, 10);
    const splatno = new Date(Date.now() + (Number(zakaznik?.payment_terms_days) || 14) * 86400000).toISOString().slice(0, 10);
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
    const ok = await onUlozit({
      naceneni_rea: { ...stav(), invoice_id: row.id, invoice_number: row.number, vyfakturovano: total - totalTax },
      hodnota: Math.round(total - totalTax),
      hotove_ukoly: { ...(zak.hotove_ukoly || {}), "vyuctovani.faktura": true },
    }, `Konečná faktura ${row.number} vystavená z nacenění realizace (${varianta === "excel" ? "kalkulace v Excelu" : "ceník podle skutečnosti"}) — ${fmtKc(total - totalTax)} bez DPH.`);
    setPracuji(false);
    if (ok) { ukazHlasku(`✓ Faktura ${row.number} vystavená — najdeš ji ve Fakturaci`); onZavrit(); }
  };

  const zmenitPolozku = (id, k, v) => setPolozky((p) => p.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const zalozka = (id, text) => (
    <button type="button" role="tab" aria-selected={varianta === id} onClick={() => setVarianta(id)} disabled={!!faktura}
      style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `2px solid ${varianta === id ? "#0369a1" : "#e2e8f0"}`, background: varianta === id ? "#eff6ff" : "#fff", color: varianta === id ? "#0369a1" : "#475569", fontWeight: 800, fontSize: 14, cursor: faktura ? "default" : "pointer", fontFamily: "inherit" }}>{text}</button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rea-titulek" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 9000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}>
      <div style={{ background: "#f8fafc", borderRadius: 16, width: "100%", maxWidth: 760, padding: 18, boxShadow: "0 20px 50px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", gap: 12 }}>
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
            <div style={{ fontSize: 13, color: "#475569" }}>Nahraj vyplněnou kalkulačku (.xlsx). Uloží se k zakázce do složky Dokumenty na OneDrivu a appka zkusí najít řádek „Celkem“.</div>
            <label style={{ ...btnGhost, alignSelf: "flex-start", display: "inline-flex", gap: 6, alignItems: "center", opacity: faktura ? 0.5 : 1 }}>
              📎 {excel.soubor ? "Nahrát jinou kalkulaci" : "Nahrát kalkulaci z Excelu"}
              <input type="file" accept=".xlsx,.xls,.xlsm,.csv" disabled={pracuji || !!faktura} style={{ display: "none" }} onChange={(e) => { nahratExcel(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {excel.soubor && (
              <div style={{ fontSize: 13, color: "#334155" }}>
                📄 {excel.soubor}{excel.onedrive ? <> · <a href={excel.onedrive} target="_blank" rel="noreferrer">otevřít na OneDrivu</a></> : <span style={{ color: "#b91c1c" }}> · neuloženo na OneDrive</span>}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <div><label style={lbl} htmlFor="rea-popis">Text na faktuře</label>
                <input id="rea-popis" style={inp} value={excel.popis || ""} disabled={!!faktura} onChange={(e) => setExcel({ ...excel, popis: e.target.value })} /></div>
              <div><label style={lbl} htmlFor="rea-castka">Částka bez DPH (Kč)</label>
                <input id="rea-castka" style={inp} inputMode="decimal" value={excel.castka || ""} disabled={!!faktura} placeholder="např. 48 500" onChange={(e) => setExcel({ ...excel, castka: e.target.value })} /></div>
            </div>
          </div>
        ) : (
          <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: "#475569" }}>U položek zapiš <b>skutečně provedené</b> množství — cena se dopočítá podle ceníku.</div>
              {smiNastavit && !upravaCeniku && <button type="button" style={btnGhost} onClick={() => setUpravaCeniku((cenik || []).map((x) => ({ ...x, id: novyId() })))}>⚙ Upravit ceník</button>}
            </div>

            {upravaCeniku ? (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#92400e" }}>Ceník realizací (společný pro všechny zakázky „jen realizace“)</div>
                {upravaCeniku.map((x) => (
                  <div key={x.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 34px", gap: 6 }}>
                    <input style={inp} aria-label="Položka ceníku" placeholder="např. Montáž panelu na střechu" value={x.nazev} onChange={(e) => setUpravaCeniku((c) => c.map((y) => (y.id === x.id ? { ...y, nazev: e.target.value } : y)))} />
                    <select style={inp} aria-label="Jednotka" value={x.jednotka || "ks"} onChange={(e) => setUpravaCeniku((c) => c.map((y) => (y.id === x.id ? { ...y, jednotka: e.target.value } : y)))}>
                      {JEDNOTKY.map((j) => <option key={j}>{j}</option>)}
                    </select>
                    <input style={inp} aria-label="Cena za jednotku bez DPH" inputMode="decimal" placeholder="Kč / jedn." value={x.cena ?? ""} onChange={(e) => setUpravaCeniku((c) => c.map((y) => (y.id === x.id ? { ...y, cena: e.target.value } : y)))} />
                    <button type="button" aria-label="Odebrat položku" style={{ ...btnGhost, padding: 0 }} onClick={() => setUpravaCeniku((c) => c.filter((y) => y.id !== x.id))}>✕</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <button type="button" style={btnGhost} onClick={() => setUpravaCeniku((c) => [...c, { id: novyId(), nazev: "", jednotka: "ks", cena: "" }])}>+ Položka ceníku</button>
                  <span style={{ display: "flex", gap: 8 }}>
                    <button type="button" style={btnGhost} onClick={() => setUpravaCeniku(null)}>Zrušit</button>
                    <button type="button" style={btn("#b45309")} onClick={ulozitCenik}>Uložit ceník</button>
                  </span>
                </div>
              </div>
            ) : polozky === null ? (
              <div style={{ fontSize: 13, color: "#64748b" }}>Načítám ceník…</div>
            ) : (
              <>
                {!polozky.length && <div style={{ fontSize: 13, color: "#92400e" }}>Ceník je zatím prázdný{smiNastavit ? " — nastav ho tlačítkem ⚙ Upravit ceník, nebo přidej položku jen pro tuto zakázku." : " — požádej vedoucího o nastavení, nebo přidej položku jen pro tuto zakázku."}</div>}
                {polozky.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 80px 110px 100px", gap: 6, fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                    <span>Položka</span><span>Skutečnost</span><span>Jedn.</span><span>Kč / jedn.</span><span style={{ textAlign: "right" }}>Celkem</span>
                  </div>
                )}
                {polozky.map((p) => {
                  const zCeniku = (cenik || []).some((x) => x.nazev === p.nazev);
                  const radek = cislo(p.mnozstvi) * cislo(p.cena);
                  return (
                    <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 80px 110px 100px", gap: 6, alignItems: "center", opacity: cislo(p.mnozstvi) > 0 ? 1 : 0.75 }}>
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
                {!faktura && <button type="button" style={{ ...btnGhost, alignSelf: "flex-start" }} onClick={() => setPolozky((p) => [...p, { id: novyId(), nazev: "", jednotka: "ks", cena: "", mnozstvi: "" }])}>+ Vlastní položka (jen tato zakázka)</button>}
              </>
            )}
          </div>
        )}

        <div style={{ ...karta, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
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
