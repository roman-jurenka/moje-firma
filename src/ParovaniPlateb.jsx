// ─── Párování plateb z bankovního výpisu ─────────────────────────────────────
// Nahraje se výpis z internetového bankovnictví (KB: formát GPC/ABO, nebo CSV).
// Příchozí platby se spárují s nezaplacenými vydanými fakturami podle
// variabilního symbolu (a když chybí, navrhne se faktura podle částky).
// Nic se nezapíše samo — uživatel zkontroluje a potvrdí. Potvrzení navýší
// „Uhrazeno“, doplní datum úhrady a plně zaplacenou fakturu označí Zaplacena.
import { useState } from "react";
import { supabase } from "./supabase.js";
import { getInvoicePaymentInfo, cisloFaktury, fmtKc2 } from "./invoicingUtils.js";

const kc = (v) => `${fmtKc2(v)} Kč`;
const bezNul = (s) => String(s || "").replace(/\D/g, "").replace(/^0+/, "");

// GPC (ABO) — řádky 075 = pohyby; pozice podle standardu (číslováno od 1)
function parseGpc(text) {
  return text.split(/\r?\n/).filter((l) => l.startsWith("075")).map((l) => {
    const kod = l.charAt(60);
    const castka = Number(l.slice(48, 60)) / 100;
    const d = l.slice(91, 97);
    const datum = /^\d{6}$/.test(d) ? `20${d.slice(4, 6)}-${d.slice(2, 4)}-${d.slice(0, 2)}` : "";
    return { prichozi: kod === "2", castka, vs: bezNul(l.slice(61, 71)), datum, protistrana: l.slice(97, 117).trim(), ucet: l.slice(19, 35).replace(/^0+/, "") };
  }).filter((p) => p.prichozi && p.castka > 0);
}

// CSV — sloupce se najdou podle názvu v hlavičce
function parseCsv(text) {
  const radky = text.split(/\r?\n/).filter((l) => l.trim());
  if (!radky.length) return [];
  const odd = (radky.find((l) => /;/.test(l)) ? ";" : ",");
  const rozdel = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === odd && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const hlavIdx = radky.findIndex((l) => /částka|castka|amount/i.test(l));
  if (hlavIdx < 0) return [];
  const hlav = rozdel(radky[hlavIdx]).map((h) => h.toLowerCase());
  const najdi = (re) => hlav.findIndex((h) => re.test(h));
  const iCastka = najdi(/částka|castka|amount/), iVs = najdi(/variabiln|^vs$|\bvs\b/), iDatum = najdi(/datum|date/);
  const iNazev = najdi(/název protiúčtu|nazev protiuctu|protistrana|název|nazev|popis|zpráva|zprava/), iUcet = najdi(/protiúčet|protiucet|účet|ucet/);
  const iZprava = najdi(/zpráva|zprava|poznámka|poznamka|popis/);
  return radky.slice(hlavIdx + 1).map((l) => {
    const c = rozdel(l);
    const castka = Number(String(c[iCastka] || "").replace(/\s/g, "").replace(",", "."));
    let datum = String(c[iDatum] || "").trim();
    const m = datum.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/);
    if (m) datum = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const vsZeZpravy = iVs < 0 ? (String(c[iZprava] || "").match(/VS[:\s]*(\d{1,10})/i)?.[1] || "") : "";
    return { prichozi: castka > 0, castka, vs: bezNul(iVs >= 0 ? c[iVs] : vsZeZpravy), datum: datum.slice(0, 10), protistrana: c[iNazev] || "", ucet: c[iUcet] || "" };
  }).filter((p) => p.prichozi && Number.isFinite(p.castka));
}

export default function ParovaniPlateb({ invoices, onClose, onUlozeno }) {
  const [platby, setPlatby] = useState(null);   // [{ ...platba, invoiceId, stav, vybrano }]
  const [chyba, setChyba] = useState("");
  const [pracuji, setPracuji] = useState(false);
  const [hotovo, setHotovo] = useState("");

  const nezaplacene = invoices.filter((i) => (i.invoice_type || "vydaná") === "vydaná" && !getInvoicePaymentInfo(i).isPaid && i.status !== "Storno");
  const vsFaktury = (i) => bezNul(i.variable_symbol || cisloFaktury(i));

  const nacist = async (file) => {
    setChyba(""); setHotovo("");
    const buf = await file.arrayBuffer();
    // KB exportuje GPC ve windows-1250, CSV bývá UTF-8 — zkusí se obojí
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1250").decode(buf);
    const seznam = /^0(74|75)/m.test(text) && text.split(/\r?\n/).some((l) => l.startsWith("075")) ? parseGpc(text) : parseCsv(text);
    if (!seznam.length) { setChyba("Ve výpisu jsem nenašel žádné příchozí platby. Nahraj výpis ve formátu GPC (ABO) nebo CSV z internetového bankovnictví."); setPlatby([]); return; }
    const pouzite = new Set();
    setPlatby(seznam.map((p, idx) => {
      let inv = p.vs ? nezaplacene.find((i) => vsFaktury(i) === p.vs && !pouzite.has(i.id)) : null;
      let podleCastky = false;
      if (!inv) {
        const shoda = nezaplacene.filter((i) => !pouzite.has(i.id) && Math.abs(getInvoicePaymentInfo(i).outstanding - p.castka) < 1);
        if (shoda.length === 1) { inv = shoda[0]; podleCastky = true; }
      }
      if (inv) pouzite.add(inv.id);
      const zbyva = inv ? getInvoicePaymentInfo(inv).outstanding : 0;
      const stav = !inv ? "nenalezeno" : podleCastky ? "castka" : Math.abs(zbyva - p.castka) < 1 ? "sedi" : p.castka < zbyva ? "castecne" : "preplatek";
      return { ...p, idx, invoiceId: inv?.id || "", stav, vybrano: stav === "sedi" || stav === "castecne" };
    }));
  };

  const zmenit = (idx, patch) => setPlatby((ps) => ps.map((p) => (p.idx === idx ? { ...p, ...patch } : p)));
  const vybrane = (platby || []).filter((p) => p.vybrano && p.invoiceId);

  const potvrdit = async () => {
    setPracuji(true); setChyba("");
    const zmeny = [];
    // víc plateb na jednu fakturu se sečte
    const poFakture = new Map();
    for (const p of vybrane) poFakture.set(p.invoiceId, [...(poFakture.get(p.invoiceId) || []), p]);
    for (const [id, ps] of poFakture) {
      const inv = invoices.find((i) => String(i.id) === String(id));
      if (!inv) continue;
      const info = getInvoicePaymentInfo(inv);
      const prijato = ps.reduce((s, p) => s + p.castka, 0);
      const paid_amount = Math.round(((Number(inv.paid_amount) || 0) + prijato) * 100) / 100;
      const datum = ps.map((p) => p.datum).filter(Boolean).sort().pop() || new Date().toISOString().slice(0, 10);
      const patch = { paid_amount, paid_date: datum, ...(paid_amount + 0.01 >= info.toPay ? { status: "Zaplacena" } : {}) };
      const { error } = await supabase.from("invoices").update(patch).eq("id", inv.id);
      if (error) { setChyba(`Fakturu ${cisloFaktury(inv)} se nepodařilo uložit: ${error.message}`); continue; }
      await supabase.from("invoice_events").insert({ invoice_id: inv.id, type: "platba", amount: prijato, note: `Spárováno z bankovního výpisu (${ps.map((p) => p.protistrana || p.ucet).filter(Boolean).join(", ") || "platba"})` });
      if (patch.status === "Zaplacena") await supabase.from("invoice_events").insert({ invoice_id: inv.id, type: "zaplacena" });
      zmeny.push({ id: inv.id, patch });
    }
    setPracuji(false);
    onUlozeno(zmeny);
    setHotovo(`✓ Zapsáno ${zmeny.length} ${zmeny.length === 1 ? "faktura" : zmeny.length < 5 ? "faktury" : "faktur"}.`);
    setPlatby((ps) => ps.map((p) => (p.vybrano && p.invoiceId ? { ...p, vybrano: false, stav: "zapsano" } : p)));
  };

  const STAV = {
    sedi: ["✓ sedí", "#15803d"], castecne: ["částečná platba", "#b45309"], preplatek: ["přeplatek", "#b45309"],
    castka: ["návrh podle částky — zkontroluj", "#7c3aed"], nenalezeno: ["faktura nenalezena", "#64748b"], zapsano: ["✓ zapsáno", "#15803d"],
  };
  const th = { padding: "6px 8px", fontSize: 11, color: "#64748b", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "6px 8px", fontSize: 13, verticalAlign: "top" };

  return (
    <div role="dialog" aria-modal="true" aria-label="Spárovat platby z výpisu" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 600, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflow: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: "min(980px, 100%)", display: "flex", flexDirection: "column", gap: 12, color: "#0f172a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🏦 Spárovat platby z bankovního výpisu</div>
          <button type="button" onClick={onClose} aria-label="Zavřít" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: "#475569" }}>
          V internetovém bankovnictví (Mojebanka) stáhni výpis pohybů ve formátu <b>GPC (ABO)</b> nebo <b>CSV</b> a nahraj ho sem.
          Příchozí platby se spárují s nezaplacenými fakturami podle variabilního symbolu. Nic se nezapíše, dokud nepotvrdíš.
        </div>
        <label style={{ alignSelf: "flex-start", background: "#0369a1", color: "#fff", borderRadius: 10, padding: "9px 16px", fontWeight: 800, cursor: "pointer" }}>
          📄 Nahrát výpis (.gpc, .csv)
          <input type="file" accept=".gpc,.csv,.txt,.abo" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) nacist(f); }} />
        </label>
        {chyba && <div role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{chyba}</div>}
        {platby && platby.length > 0 && (<>
          <div style={{ fontSize: 13 }}>
            Příchozích plateb: <b>{platby.length}</b> · spárováno: <b>{platby.filter((p) => p.invoiceId).length}</b> · nezaplacených faktur: <b>{nezaplacene.length}</b>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}></th><th style={th}>Datum</th><th style={th}>Od koho</th><th style={th}>VS</th><th style={{ ...th, textAlign: "right" }}>Částka</th><th style={th}>Faktura</th><th style={th}>Stav</th></tr></thead>
              <tbody>
                {platby.map((p) => {
                  const inv = invoices.find((i) => String(i.id) === String(p.invoiceId));
                  const [stavText, stavBarva] = STAV[p.stav] || ["", "#64748b"];
                  return (
                    <tr key={p.idx} style={{ borderTop: "1px solid #f1f5f9", background: p.vybrano ? "#f0f9ff" : undefined }}>
                      <td style={td}><input type="checkbox" aria-label="Zapsat tuto platbu" disabled={!p.invoiceId || p.stav === "zapsano"} checked={!!p.vybrano} onChange={(e) => zmenit(p.idx, { vybrano: e.target.checked })} /></td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{p.datum ? new Date(p.datum + "T00:00:00").toLocaleDateString("cs-CZ") : "–"}</td>
                      <td style={td}>{p.protistrana || p.ucet || "–"}</td>
                      <td style={td}>{p.vs || "–"}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{kc(p.castka)}</td>
                      <td style={td}>
                        <select value={p.invoiceId} disabled={p.stav === "zapsano"} aria-label="Faktura k platbě"
                          onChange={(e) => zmenit(p.idx, { invoiceId: e.target.value, stav: e.target.value ? "rucne" : "nenalezeno", vybrano: !!e.target.value })}
                          style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px", fontSize: 12, maxWidth: 240 }}>
                          <option value="">— nepárovat —</option>
                          {nezaplacene.map((i) => <option key={i.id} value={i.id}>{cisloFaktury(i)} · zbývá {kc(getInvoicePaymentInfo(i).outstanding)}</option>)}
                          {inv && !nezaplacene.includes(inv) && <option value={inv.id}>{cisloFaktury(inv)}</option>}
                        </select>
                        {inv && <div style={{ fontSize: 11, color: "#64748b" }}>k úhradě {kc(getInvoicePaymentInfo(inv).outstanding)}</div>}
                      </td>
                      <td style={{ ...td, color: stavBarva, fontWeight: 700, fontSize: 12 }}>{p.stav === "rucne" ? "vybráno ručně" : stavText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" disabled={pracuji || !vybrane.length} onClick={potvrdit}
              style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              {pracuji ? "Zapisuji…" : `✓ Zapsat vybrané platby (${vybrane.length})`}
            </button>
            {hotovo && <span role="status" style={{ color: "#15803d", fontWeight: 700 }}>{hotovo}</span>}
          </div>
        </>)}
      </div>
    </div>
  );
}
