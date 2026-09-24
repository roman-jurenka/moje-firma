import { useState, useEffect, useRef, Fragment } from "react";
import { supabase } from "./supabase.js";
import FveCalculator from "./FveCalculator.jsx";
import { vychoziSluzba } from "./fvePresets.js";
import NabidkaNahled from "./NabidkaNahled.jsx";
import { textyNabidky, seznamyPodleTypu } from "./nabidkaTexty.js";
import { fazeById, terminFaze, planovaneMd } from "./prubehFaze.js";

const S = {
  app:      { fontFamily: "'DM Sans', sans-serif", background: "#f0f4f8", minHeight: "100vh", color: "#1A1A1A", padding: "20px 28px" },
  card:     { background: "#ffffff", borderRadius: 12, padding: 22, border: "1px solid #e2e8f0", marginBottom: 16, boxShadow: "0 1px 4px #0000000a" },
  input:    { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", color: "#1A1A1A", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" },
  select:   { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", color: "#1A1A1A", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" },
  label:    { fontSize: 11, color: "#475569", marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  btn:      (c = "#0369a1") => ({ background: c, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  btnGhost: { background: "transparent", color: "#0369a1", border: "1px solid #0369a1", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  th:       { textAlign: "left", padding: "7px 8px", fontSize: 11, color: "#475569", borderBottom: "1px solid #e2e8f0", textTransform: "uppercase", letterSpacing: "0.05em" },
  td:       { padding: "5px 8px", fontSize: 13, color: "#1A1A1A" },
};

const fmtKc = (n) => (Number(n) || 0).toLocaleString("cs-CZ") + " Kč";
const uid = () => Date.now() + Math.random();
const RATE_PER_KM = 6.5; // Kč/km — stejný paušál jako v Knize jízd

// Stejné typy jako u poptávek/zakázek (App.jsx JOB_TYPES, Contracts.jsx
// TYPY_ZAKAZEK) — typ se řetězí celou cestou Nabídka → Poptávka → Zakázka.
const JOB_TYPES = [
  { id: "FVE", label: "FVE — Fotovoltaika" },
  { id: "FVR", label: "FVR — FVE rozšíření" },
  { id: "HRM", label: "HRM — Hromosvody" },
  { id: "ELK", label: "ELK — Elektroinstalace" },
  { id: "SRV", label: "SRV — Servis" },
];

// Číslo nabídky: N-{typ}-{rok}-{pořadí}, např. N-SRV-2026-0001 nebo
// N-FVE-2026-0001. Pořadí se počítá zvlášť pro každý typ a rok z čerstvých
// dat v databázi (ne z lokálního stavu), duplicitu hlídá UNIQUE index
// quotes_cislo_key (sql-cislo-nabidky.sql).
const CISLOVANE_TYPY = ["FVE", "FVR", "SRV", "HRM", "ELK"];
// Hromosvody a elektroinstalace: nabídka pro zákazníka se skládá ze sekcí
// (název, popis, cena bez DPH) — cílová cena je u nich BEZ DPH.
const SEKCOVE_TYPY = ["HRM", "ELK"];
const SAZBY_DPH = [
  { v: 21, label: "21 %" },
  { v: 12, label: "12 % (bytová výstavba)" },
  { v: 0, label: "0 % (přenesená daňová povinnost)" },
];
async function dalsiCisloNabidky(typ) {
  const prefix = `N-${typ}-${new Date().getFullYear()}-`;
  const { data, error } = await supabase.from("quotes").select("cislo").like("cislo", `${prefix}%`);
  if (error) throw error;
  const max = (data || []).reduce((m, r) => Math.max(m, Number(String(r.cislo).slice(prefix.length)) || 0), 0);
  return prefix + String(max + 1).padStart(4, "0");
}

const PRAZDNA_NABIDKA = () => ({
  interni: {
    sazbaMd: 3200,   // Kč / MD (člověko-den) — jednotná sazba pro celou nabídku
    sazbaBod: 0,     // Kč / bod — pro řádky elektroinstalace účtované po bodech
    sazbaHod: 0,     // Kč / hodina — pro řádky elektroinstalace účtované hodinově
    radky: [],       // [{id, popis, dopravaKm, materialKc, pocetMd, pocetLidi, jednotka, kusovnik}]
    polozky: [],     // [{id, nazev, md}] — samostatné položky mimo fáze, např. revize, dokumentace
  },
  zakaznik: {
    cilovaCena: "",  // prodejní cena BEZ DPH — u FVE/FVR/SRV se přebírá z kalkulace, jinak = náklad + marže
    marzePct: "",    // marže jako přirážka k nákladu v % (HRM, ELK, bez typu); prázdné = VYCHOZI_MARZE
    dph: 21,         // sazba DPH v % — připočítá se až k ceně bez DPH
    sekce: [],       // [{id, nazev, castka}] — volné sekce, appka je nijak nepředepisuje
  },
  denniPlan: [],     // [{id, datum, pocetLidi, poznamka}] — rozvrh po dnech, přenese se do projektu/zakázky
  notes: "",
  fve: null,         // konfigurace FVE kalkulačky (jen u typu FVE) — viz FveCalculator.jsx
});

// Cena řádku interního nacenění: Počet MD (dní) se píše ručně a když na tom
// dni dělá víc lidí, Počet lidí to dál násobí (2 dny × 3 lidi = 6 MD).
// Celkovým MD se násobí práce; doprava se násobí jen počtem dní (stejná
// cesta, ať jede kdokoliv). Materiál je samostatný — nenásobí se vůbec,
// je to prostě celková částka materiálu na daný řádek.
// Samostatná (bezstavová) verze výpočtu celkové ceny nabídky — používá se
// pro KPI v seznamu nabídek, kde nechceme znovu procházet celý editor.
// ─── Cena nabídky: NÁKLAD + MARŽE = CENA BEZ DPH, + DPH = CENA S DPH ───────
// Všechny částky se vedou bez DPH, DPH se připočítá až na konci. U FVE,
// rozšíření a servisu počítá cenu kalkulace výše (FVE: materiál, práce,
// služby + marže; servis: součet úkonů) a do nabídky se propíše sama.
// U hromosvodů, elektroinstalací a nabídek bez typu je náklad z interního
// nacenění a marže se zadává v % jako přirážka k nákladu.
const VYCHOZI_MARZE = 25;
const KALKULACNI_TYPY = ["FVE", "FVR", "SRV"];
function marzeNabidky(d, naklad) {
  const z = d?.zakaznik || {};
  if (z.marzePct !== undefined && z.marzePct !== "" && z.marzePct !== null) return Number(z.marzePct) || 0;
  // starší nabídka s ručně zadanou cenou → dopočítat, jaké marži odpovídá
  if (z.cilovaCena !== "" && z.cilovaCena != null && naklad > 0) return Math.round((Number(z.cilovaCena) / naklad - 1) * 10000) / 100;
  return VYCHOZI_MARZE;
}
function cenaNabidkyBezDph(d, typ, naklad) {
  if (KALKULACNI_TYPY.includes(typ)) return Math.round(Number(d?.zakaznik?.cilovaCena) || 0);
  return Math.round(naklad * (1 + marzeNabidky(d, naklad) / 100));
}

// Řetězec ceny — stejné zobrazení v kartě nabídky i v souhrnu dole.
function RetezecCeny({ naklad, marzeKc, marzePct, cenaBez, dphPct, cenaS, poznamka }) {
  const dlazdice = [
    ["Náklad (bez DPH)", fmtKc(naklad), "#f87171"],
    [`+ Marže${marzePct != null ? ` ${String(marzePct).replace(".", ",")} %` : ""}`, fmtKc(marzeKc), marzeKc >= 0 ? "#16a34a" : "#dc2626"],
    ["= Cena bez DPH", fmtKc(cenaBez), "#0369a1"],
    [`+ DPH ${dphPct} %`, fmtKc(cenaS - cenaBez), "#64748b"],
    ["= Cena s DPH", fmtKc(cenaS), "#1A1A1A"],
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
        {dlazdice.map(([l, v, c], i) => (
          <div key={l} style={{ background: i === 4 ? "#eff6ff" : "#fff", border: "1px solid " + (i === 4 ? "#93c5fd" : "#e2e8f0"), borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ ...S.label, marginBottom: 2 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c, whiteSpace: "nowrap" }}>{v}</div>
          </div>
        ))}
      </div>
      {poznamka && <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>{poznamka}</div>}
    </div>
  );
}

function computeQuoteTotals(qdata, typ) {
  const d = qdata || {};
  const sazbaMd = d?.interni?.sazbaMd || 0;
  const sazbaBod = d?.interni?.sazbaBod || 0;
  const sazbaHod = d?.interni?.sazbaHod || 0;
  const radky = d?.interni?.radky || [];
  const polozky = d?.interni?.polozky || [];
  const radkyV = radky.map(r => radekVypocet(r, sazbaMd, sazbaBod, sazbaHod));
  const celkemPolozkyMd = polozky.reduce((s, p) => s + (Number(p.md) || 0), 0);
  const celkemPolozkyKc = celkemPolozkyMd * sazbaMd;
  const celkemDoprava = radkyV.reduce((s, v) => s + v.doprava, 0);
  const celkemMaterial = radkyV.reduce((s, v) => s + v.material, 0);
  const celkemPrace = radkyV.reduce((s, v) => s + v.laborKc, 0) + celkemPolozkyKc;
  const celkemNaklad = celkemDoprava + celkemMaterial + celkemPrace;
  const cilovaCena = cenaNabidkyBezDph(d, typ, celkemNaklad); // bez DPH
  return { celkemNaklad, cilovaCena };
}

// Rozpis materiálu na položky (kusovník) — když u řádku existuje, materiál
// řádku se z něj dopočítá; jinak se použije ruční částka v materialKc.
const kusovnikSoucet = (items) => (items || []).reduce((s, it) => s + (Number(it.mnozstvi) || 0) * (Number(it.cenaZaJednotku) || 0), 0);

// Jednotka práce u řádku — výchozí "md" (člověko-den, počítá se jako dřív:
// dny × lidé × sazbaMd). "bod" a "hod" jsou pro menší zakázky (elektroinstalace
// po bodech/hodinách) — množství se čte ze stejného pole (pocetMd) a násobí
// příslušnou sazbou, bez násobení počtem lidí.
const radekVypocet = (r, sazbaMd, sazbaBod, sazbaHod) => {
  const jednotka = r.jednotka || "md";
  const material = (r.kusovnik && r.kusovnik.length > 0) ? kusovnikSoucet(r.kusovnik) : (Number(r.materialKc) || 0);

  if (jednotka === "bod" || jednotka === "hod") {
    const mnozstvi = Number(r.pocetMd) || 0;
    const sazba = jednotka === "bod" ? (Number(sazbaBod) || 0) : (Number(sazbaHod) || 0);
    const laborKc = mnozstvi * sazba;
    const doprava = (Number(r.dopravaKm) || 0) * RATE_PER_KM;
    return { dny: 0, lide: 0, md: 0, doprava, material, laborKc, cena: laborKc + doprava + material };
  }

  const dny = Number(r.pocetMd) || 0;
  const lide = Number(r.pocetLidi) || 1;
  const md = dny * lide;
  const doprava = (Number(r.dopravaKm) || 0) * RATE_PER_KM * dny;
  const laborKc = md * (Number(sazbaMd) || 0);
  const cena = laborKc + doprava + material;
  return { dny, lide, md, doprava, material, laborKc, cena };
};

// ─── Tabulka interního nacenění (MD) ────────────────────────────────────────
const JEDNOTKY_RADKU = [
  { id: "md", label: "MD (den)" },
  { id: "bod", label: "Bod" },
  { id: "hod", label: "Hodina" },
];

// Nejčastější položky u hromosvodů — rychlé tlačítko rovnou přidá řádek
// kusovníku, ať se nepíše pokaždé ručně od nuly.
const HRM_KUSOVNIK_POLOZKY = ["Jímač", "Svod", "Zemnič", "Svorka"];

// Rozpis materiálu na položky (množství × cena/jednotku) pro jeden řádek
// interního nacenění — používá se hlavně u hromosvodů, kde je materiál
// přirozeně v kusech/metrech, ne v jedné souhrnné částce.
function KusovnikRozpis({ kusovnik, setKusovnik }) {
  const items = kusovnik || [];
  const update = (id, key, value) => setKusovnik(items.map(it => it.id === id ? { ...it, [key]: value } : it));
  const remove = (id) => setKusovnik(items.filter(it => it.id !== id));
  const add = (nazev = "") => setKusovnik([...items, { id: uid(), nazev, mnozstvi: "", jednotka: "ks", cenaZaJednotku: "" }]);

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {HRM_KUSOVNIK_POLOZKY.map(n => (
          <button key={n} onClick={() => add(n)} style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 11 }}>+ {n}</button>
        ))}
        <button onClick={() => add("")} style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 11 }}>+ jiná položka</button>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "#64748b" }}>Zatím žádné položky rozpisu — materiál se počítá z pole „Materiál (Kč)" vedle.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={S.th}>Položka</th>
              <th style={S.th}>Množství</th>
              <th style={S.th}>Jednotka</th>
              <th style={S.th}>Cena / jednotku</th>
              <th style={S.th}>Celkem</th>
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id}>
                <td style={S.td}><input style={{ ...S.input, marginBottom: 0 }} value={it.nazev ?? ""} onChange={e => update(it.id, "nazev", e.target.value)} /></td>
                <td style={S.td}><input type="number" style={{ ...S.input, marginBottom: 0, width: 80 }} value={it.mnozstvi ?? ""} onChange={e => update(it.id, "mnozstvi", e.target.value)} /></td>
                <td style={S.td}>
                  <select style={{ ...S.select, width: 70 }} value={it.jednotka || "ks"} onChange={e => update(it.id, "jednotka", e.target.value)}>
                    <option value="ks">ks</option>
                    <option value="m">m</option>
                  </select>
                </td>
                <td style={S.td}><input type="number" style={{ ...S.input, marginBottom: 0, width: 100 }} value={it.cenaZaJednotku ?? ""} onChange={e => update(it.id, "cenaZaJednotku", e.target.value)} /></td>
                <td style={{ ...S.td, fontWeight: 600 }}>{fmtKc((Number(it.mnozstvi) || 0) * (Number(it.cenaZaJednotku) || 0))}</td>
                <td style={S.td}><button onClick={() => remove(it.id)} style={{ ...S.btn("#ef4444"), padding: "3px 8px", fontSize: 11 }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function InterniTabulka({ radky, setRadky, sazbaMd, sazbaBod, sazbaHod }) {
  const update = (id, key, value) => setRadky(radky.map(r => r.id === id ? { ...r, [key]: value } : r));
  const remove = (id) => setRadky(radky.filter(r => r.id !== id));
  const add = () => setRadky([...radky, { id: uid(), popis: "", dopravaKm: "", materialKc: "", pocetMd: "", pocetLidi: "", jednotka: "md", kusovnik: [] }]);
  const [rozbaleno, setRozbaleno] = useState(() => new Set());
  const toggleRozpis = (id) => setRozbaleno(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={S.th}>Popis (fáze / úkon)</th>
            <th style={S.th}>Jednotka</th>
            <th style={S.th}>Doprava (km)</th>
            <th style={S.th}>Množství</th>
            <th style={S.th}>Počet lidí</th>
            <th style={S.th}>Materiál (Kč)</th>
            <th style={S.th}>Celkem MD</th>
            <th style={S.th}>Cena</th>
            <th style={S.th}></th>
          </tr>
        </thead>
        <tbody>
          {radky.map(r => {
            const v = radekVypocet(r, sazbaMd, sazbaBod, sazbaHod);
            const jednotka = r.jednotka || "md";
            const maRozpis = (r.kusovnik || []).length > 0;
            return (
              <Fragment key={r.id}>
                <tr>
                  <td style={S.td}><input style={{ ...S.input, marginBottom: 0 }} value={r.popis ?? ""} onChange={e => update(r.id, "popis", e.target.value)} /></td>
                  <td style={S.td}>
                    <select style={{ ...S.select, width: 92 }} value={jednotka} onChange={e => update(r.id, "jednotka", e.target.value)}>
                      {JEDNOTKY_RADKU.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
                    </select>
                  </td>
                  <td style={S.td}><input type="number" style={{ ...S.input, marginBottom: 0, width: 90 }} value={r.dopravaKm ?? ""} onChange={e => update(r.id, "dopravaKm", e.target.value)} /></td>
                  <td style={S.td}><input type="number" style={{ ...S.input, marginBottom: 0, width: 90 }} value={r.pocetMd ?? ""} onChange={e => update(r.id, "pocetMd", e.target.value)} /></td>
                  <td style={S.td}><input type="number" style={{ ...S.input, marginBottom: 0, width: 80 }} disabled={jednotka !== "md"} value={r.pocetLidi ?? ""} onChange={e => update(r.id, "pocetLidi", e.target.value)} /></td>
                  <td style={S.td}>
                    {maRozpis ? (
                      <input type="number" style={{ ...S.input, marginBottom: 0, width: 110 }} value={v.material} disabled title="Spočítáno z rozpisu materiálu níže" />
                    ) : (
                      <input type="number" style={{ ...S.input, marginBottom: 0, width: 110 }} value={r.materialKc ?? ""} onChange={e => update(r.id, "materialKc", e.target.value)} />
                    )}
                  </td>
                  <td style={{ ...S.td, color: "#a78bfa", fontWeight: 700, whiteSpace: "nowrap" }}>{Math.round(v.md * 100) / 100}</td>
                  <td style={{ ...S.td, color: "#f87171", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtKc(v.cena)}</td>
                  <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                    <button onClick={() => toggleRozpis(r.id)} style={{ ...S.btnGhost, padding: "4px 9px", fontSize: 11, marginRight: 4 }}>{rozbaleno.has(r.id) ? "▲" : "▼"} rozpis</button>
                    <button onClick={() => remove(r.id)} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11 }}>✕</button>
                  </td>
                </tr>
                {rozbaleno.has(r.id) && (
                  <tr>
                    <td colSpan={9} style={{ ...S.td, padding: "6px 8px 14px" }}>
                      <KusovnikRozpis kusovnik={r.kusovnik} setKusovnik={kusovnik => update(r.id, "kusovnik", kusovnik)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {radky.length === 0 && (
            <tr><td colSpan={9} style={{ ...S.td, color: "#64748b", padding: "12px 8px" }}>Zatím žádné řádky interního nacenění.</td></tr>
          )}
        </tbody>
      </table>
      <button onClick={add} style={{ ...S.btnGhost, marginTop: 10, padding: "6px 14px", fontSize: 12 }}>+ Přidat řádek</button>
    </div>
  );
}

// ─── Samostatné položky (revize, dokumentace, cokoli mimo fáze) ─────────────
// historicke = ploché pole položek ze VŠECH dřívějších nabídek (napříč typy,
// tedy i mimo FVE — servis, hromosvody, elektroinstalace...), aby appka
// mohla při psaní napovědět, kolik MD podobná položka trvala naposledy,
// místo aby se to pokaždé odhadovalo od nuly.
function PolozkyTabulka({ polozky, setPolozky, sazbaMd, historicke }) {
  const [suggestFor, setSuggestFor] = useState(null); // id řádku, u kterého se zrovna napovídá
  const update = (id, key, value) => setPolozky(polozky.map(p => p.id === id ? { ...p, [key]: value } : p));
  const remove = (id) => setPolozky(polozky.filter(p => p.id !== id));
  const add = () => setPolozky([...polozky, { id: uid(), nazev: "", md: "" }]);

  const findSuggestions = (text) => {
    if (!text || text.length < 2 || !historicke?.length) return [];
    const q = text.toLowerCase();
    const matches = historicke.filter(h => h.nazev?.toLowerCase().includes(q));
    const byName = new Map();
    matches.forEach(h => byName.set(h.nazev.toLowerCase(), h)); // poslední v pořadí (od nejnovější nabídky) vyhraje
    return [...byName.values()].slice(0, 6);
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>Samostatné položky (mimo fáze výše) — např. revize, dokumentace, zaškolení. Při psaní appka napoví z dřívějších nabídek, kolik MD podobná položka trvala.</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={S.th}>Název položky</th><th style={S.th}>MD</th><th style={S.th}>Cena</th><th style={S.th}></th></tr></thead>
        <tbody>
          {polozky.map(p => {
            const md = Number(p.md) || 0;
            const cena = md * (Number(sazbaMd) || 0);
            const suggestions = suggestFor === p.id ? findSuggestions(p.nazev) : [];
            return (
              <tr key={p.id}>
                <td style={{ ...S.td, position: "relative" }}>
                  <input style={{ ...S.input, marginBottom: 0 }} placeholder="např. Revize, Dokumentace..." value={p.nazev}
                    onChange={e => { update(p.id, "nazev", e.target.value); setSuggestFor(p.id); }}
                    onBlur={() => setTimeout(() => setSuggestFor(s => s === p.id ? null : s), 150)} />
                  {suggestions.length > 0 && (
                    <div style={{ position: "absolute", zIndex: 99, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, minWidth: 220, top: "100%", boxShadow: "0 4px 16px #0000001a" }}>
                      {suggestions.map((h, i) => (
                        <div key={i} style={{ padding: "7px 11px", cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between", gap: 10, borderBottom: "1px solid #f1f5f9" }}
                          onClick={() => { update(p.id, "nazev", h.nazev); update(p.id, "md", h.md); setSuggestFor(null); }}>
                          <span style={{ color: "#1A1A1A", fontWeight: 500 }}>{h.nazev}</span>
                          <span style={{ color: "#475569", flexShrink: 0 }}>{h.md} MD</span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td style={S.td}><input type="number" style={{ ...S.input, marginBottom: 0, width: 90 }} value={p.md} onChange={e => update(p.id, "md", e.target.value)} /></td>
                <td style={{ ...S.td, color: "#f87171", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtKc(cena)}</td>
                <td style={S.td}><button onClick={() => remove(p.id)} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11 }}>✕</button></td>
              </tr>
            );
          })}
          {polozky.length === 0 && (
            <tr><td colSpan={4} style={{ ...S.td, color: "#64748b", padding: "10px 8px" }}>Zatím žádné samostatné položky.</td></tr>
          )}
        </tbody>
      </table>
      <button onClick={add} style={{ ...S.btnGhost, marginTop: 10, padding: "6px 14px", fontSize: 12 }}>+ Přidat položku</button>
    </div>
  );
}

// ─── Tabulka sekcí pro zákazníka ─────────────────────────────────────────────
function SekceTabulka({ sekce, setSekce }) {
  const update = (id, key, value) => setSekce(sekce.map(s => s.id === id ? { ...s, [key]: value } : s));
  const remove = (id) => setSekce(sekce.filter(s => s.id !== id));
  const add = () => setSekce([...sekce, { id: uid(), nazev: "", popis: "", castka: "" }]);

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={S.th}>Název sekce (vlastní)</th><th style={S.th}>Popis pro zákazníka</th><th style={S.th}>Částka (Kč)</th><th style={S.th}></th></tr></thead>
        <tbody>
          {sekce.map(s => (
            <tr key={s.id}>
              <td style={{ ...S.td, width: "28%" }}><input style={{ ...S.input, marginBottom: 0 }} placeholder="např. Materiál, Montáž, Doprava a revize..." value={s.nazev} onChange={e => update(s.id, "nazev", e.target.value)} /></td>
              <td style={S.td}><textarea style={{ ...S.input, marginBottom: 0, minHeight: 36, resize: "vertical", fontFamily: "inherit" }} placeholder="co přesně zahrnuje (nepovinné)" value={s.popis ?? ""} onChange={e => update(s.id, "popis", e.target.value)} /></td>
              <td style={S.td}><input type="number" style={{ ...S.input, marginBottom: 0, width: 130 }} value={s.castka} onChange={e => update(s.id, "castka", e.target.value)} /></td>
              <td style={S.td}><button onClick={() => remove(s.id)} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11 }}>✕</button></td>
            </tr>
          ))}
          {sekce.length === 0 && (
            <tr><td colSpan={4} style={{ ...S.td, color: "#64748b", padding: "12px 8px" }}>Zatím žádné sekce — přidej vlastní členění, které dává smysl u téhle zakázky.</td></tr>
          )}
        </tbody>
      </table>
      <button onClick={add} style={{ ...S.btnGhost, marginTop: 10, padding: "6px 14px", fontSize: 12 }}>+ Přidat sekci</button>
    </div>
  );
}

// ─── Co je / není v ceně (hromosvody, elektroinstalace) ─────────────────────
// Stejné chování jako v kalkulačce FVE: položky jde odškrtnout, smazat nebo
// přidat vlastní; do nabídky jdou jen zaškrtnuté.
function SeznamVCene({ nadpis, polozky, onChange }) {
  const [novy, setNovy] = useState("");
  const pridat = () => {
    if (!novy.trim()) return;
    onChange([...polozky, { id: String(uid()), text: novy.trim(), checked: true }]);
    setNovy("");
  };
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>{nadpis}</div>
      {polozky.map(it => (
        <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <input type="checkbox" checked={it.checked} onChange={() => onChange(polozky.map(x => x.id === it.id ? { ...x, checked: !x.checked } : x))} />
          <span style={{ flex: 1, fontSize: 13, color: it.checked ? "#1A1A1A" : "#64748b", textDecoration: it.checked ? "none" : "line-through" }}>{it.text}</span>
          <button onClick={() => onChange(polozky.filter(x => x.id !== it.id))} style={{ ...S.btn("#ef4444"), padding: "2px 8px", fontSize: 10 }}>✕</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input style={S.input} placeholder="+ přidat položku" value={novy} onChange={e => setNovy(e.target.value)} onKeyDown={e => e.key === "Enter" && pridat()} />
        <button style={{ ...S.btnGhost, padding: "6px 12px", fontSize: 12 }} onClick={pridat}>Přidat</button>
      </div>
    </div>
  );
}

// ─── Tabulka rozvrhu po dnech ────────────────────────────────────────────────
function DenniPlanTabulka({ plan, setPlan }) {
  const update = (id, key, value) => setPlan(plan.map(p => p.id === id ? { ...p, [key]: value } : p));
  const remove = (id) => setPlan(plan.filter(p => p.id !== id));
  const add = () => setPlan([...plan, { id: uid(), datum: "", pocetLidi: 1, poznamka: "" }]);

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={S.th}>Datum</th><th style={S.th}>Počet lidí</th><th style={S.th}>Poznámka</th><th style={S.th}></th></tr></thead>
        <tbody>
          {plan.map(p => (
            <tr key={p.id}>
              <td style={S.td}><input type="date" style={{ ...S.input, marginBottom: 0, width: 150 }} value={p.datum} onChange={e => update(p.id, "datum", e.target.value)} /></td>
              <td style={S.td}><input type="number" min={1} style={{ ...S.input, marginBottom: 0, width: 90 }} value={p.pocetLidi} onChange={e => update(p.id, "pocetLidi", e.target.value)} /></td>
              <td style={S.td}><input style={{ ...S.input, marginBottom: 0 }} value={p.poznamka} onChange={e => update(p.id, "poznamka", e.target.value)} /></td>
              <td style={S.td}><button onClick={() => remove(p.id)} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11 }}>✕</button></td>
            </tr>
          ))}
          {plan.length === 0 && (
            <tr><td colSpan={4} style={{ ...S.td, color: "#64748b", padding: "12px 8px" }}>Zatím žádné naplánované dny.</td></tr>
          )}
        </tbody>
      </table>
      <button onClick={add} style={{ ...S.btnGhost, marginTop: 10, padding: "6px 14px", fontSize: 12 }}>+ Přidat den</button>
    </div>
  );
}

// Náhled nabídky pro hromosvody (HRM) a elektroinstalace (ELK): položky =
// sekce (název, popis, cena bez DPH), specifikace = u HRM rozpis materiálu
// z kusovníků, u ELK počet bodů / hodin. Úpravy textů jdou do data.zakaznik.nahled.
function NahledSekcove({ type, data, setData, cilovaCena, dphPct, customer, quote, currentUser, odeslane, onOdeslano, onSave }) {
  const sekce = data.zakaznik.sekce || [];
  const ukony = sekce
    .filter(s => (s.nazev || "").trim() || (s.popis || "").trim())
    .map(s => ({ id: s.id, nazev: s.nazev || "", popis: s.popis || "", cena: s.castka ?? "", ks: "" }));
  const radkyInt = data.interni.radky || [];
  let radky = [];
  if (type === "HRM") {
    const grouped = {};
    radkyInt.flatMap(r => r.kusovnik || []).forEach(it => {
      const nazev = (it.nazev || "").trim();
      if (!nazev) return;
      const klic = nazev + "|" + (it.jednotka || "ks");
      if (!grouped[klic]) grouped[klic] = { nazev, jednotka: it.jednotka || "ks", mnozstvi: 0 };
      grouped[klic].mnozstvi += Number(it.mnozstvi) || 0;
    });
    radky = Object.values(grouped).filter(g => g.mnozstvi > 0)
      .map(g => ({ label: g.nazev, ks: `${Math.round(g.mnozstvi * 100) / 100} ${g.jednotka}`, hodnota: "" }));
  } else {
    const sumBod = radkyInt.filter(r => r.jednotka === "bod").reduce((s, r) => s + (Number(r.pocetMd) || 0), 0);
    const sumHod = radkyInt.filter(r => r.jednotka === "hod").reduce((s, r) => s + (Number(r.pocetMd) || 0), 0);
    if (sumBod) radky.push({ label: "Elektroinstalační body (zásuvky, vypínače, světelné vývody…)", ks: `${sumBod}`, hodnota: "" });
    if (sumHod) radky.push({ label: "Práce v hodinové sazbě", ks: `${sumHod} h`, hodnota: "" });
  }
  const texty = textyNabidky({ jobType: type, ukony, radky });
  const vychozi = seznamyPodleTypu(type);
  const zahrnuto = (data.zakaznik.zahrnutoItems || vychozi.zahrnutoItems).filter(it => it.checked).map(it => it.text);
  const nezahrnuto = (data.zakaznik.nezahrnutoItems || vychozi.nezahrnutoItems).filter(it => it.checked).map(it => it.text);
  const cenaBezDph = Math.round(Number(cilovaCena) || 0);
  const cenaSDph = Math.round(cenaBezDph * (1 + dphPct / 100));
  const soucetSekci = sekce.reduce((s, x) => s + (Number(x.castka) || 0), 0);
  const upozorneni = [
    cenaBezDph <= 0 && "cena (vyplň interní nacenění — cena = náklad + marže)",
    ukony.length > 0 && Math.abs(soucetSekci - cenaBezDph) >= 1 && `součet položek ${fmtKc(soucetSekci)} nesedí na cenu bez DPH ${fmtKc(cenaBezDph)} (uprav sekce)`,
  ].filter(Boolean);
  const nastavZakaznik = (patch) => setData({ ...data, zakaznik: { ...data.zakaznik, ...patch } });
  return (
    <NabidkaNahled
      texty={texty}
      ukony={ukony}
      onUkonyChange={(nove) => nastavZakaznik({
        sekce: sekce.map(s => { const x = nove.find(n => n.id === s.id); return x ? { ...s, nazev: x.nazev, popis: x.popis } : s; }),
      })}
      cenaSDph={cenaSDph}
      cenaBezDph={cenaBezDph}
      dphPct={dphPct}
      zahrnuto={zahrnuto}
      nezahrnuto={nezahrnuto}
      seznamNoveFve={false}
      upozorneni={upozorneni}
      poznamkaVychozi={data.notes || ""}
      upravy={data.zakaznik.nahled}
      onUpravy={(nahled) => nastavZakaznik({ nahled })}
      customerName={customer?.name}
      adresa={(data.zakaznik.adresa || "").trim() || customer?.address}
      customerEmail={customer?.email || customer?.email_contact || ""}
      cisloNabidky={quote?.cislo}
      vystaveno={quote?.vystaveno}
      oz={{ jmeno: currentUser?.name || "", email: currentUser?.email || "", employeeId: currentUser?.employeeId ?? null }}
      odeslane={odeslane}
      onOdeslano={onOdeslano}
      isAdmin={currentUser?.role === "admin"}
      onSave={onSave}
      typ={type}
      S={S}
    />
  );
}

export default function Pricing({ customers, currentUser, onConvertToDeal }) {
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState("Návrh");
  const [type, setType] = useState("");
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const savedSnapshotRef = useRef(null);
  const [typeFilter, setTypeFilter] = useState("vse");
  const [nahledOtevren, setNahledOtevren] = useState(false);
  // Režim „U zákazníka“ z kalkulačky FVE — schová i souhrn nákladů a marže pod ní.
  const [uZakaznika, setUZakaznika] = useState(false);
  // Krátká potvrzovací hláška nahoře (uloženo, odesláno, zkopírováno…).
  const [hlaska, setHlaska] = useState(null);
  const hlaskaTimer = useRef(null);
  const ukazHlasku = (text) => {
    clearTimeout(hlaskaTimer.current);
    setHlaska(text);
    hlaskaTimer.current = setTimeout(() => setHlaska(null), 4000);
  };
  useEffect(() => () => clearTimeout(hlaskaTimer.current), []);
  const hlaskaEl = hlaska && (
    <div role="status" style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#15803d", color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, boxShadow: "0 6px 20px rgba(0,0,0,.2)", maxWidth: "90vw" }}
      onClick={() => setHlaska(null)}>
      {hlaska}
    </div>
  );
  const nahledRef = useRef(null);
  const [statusFilter, setStatusFilter] = useState("vse");

  useEffect(() => {
    supabase.from("quotes").select("*").order("updated_at", { ascending: false }).then(({ data: d }) => setQuotes(d || []));
  }, []);

  // Stará data (před přechodem na interní/MD model) nemusí mít nové klíče —
  // doplníme prázdnou kostru, ať appka nespadne na starších nabídkách.
  const normalize = (d) => ({
    ...PRAZDNA_NABIDKA(),
    ...d,
    interni: { ...PRAZDNA_NABIDKA().interni, ...(d?.interni || {}) },
    zakaznik: { ...PRAZDNA_NABIDKA().zakaznik, ...(d?.zakaznik || {}) },
    denniPlan: d?.denniPlan || [],
    fve: d?.fve || null,
  });

  // Evidence odeslaných nabídek (kopie HTML) pro otevřenou nabídku.
  const [odeslane, setOdeslane] = useState([]);
  const nactiOdeslane = async (quoteId) => {
    if (!quoteId) { setOdeslane([]); return; }
    const { data: rows } = await supabase.from("nabidky_odeslane")
      .select("id, cislo, cena, odeslal, created_at").eq("quote_id", quoteId).order("created_at", { ascending: true });
    setOdeslane(rows || []);
  };
  useEffect(() => {
    let zruseno = false;
    if (!activeId) return undefined;
    supabase.from("nabidky_odeslane").select("id, cislo, cena, odeslal, created_at").eq("quote_id", activeId)
      .order("created_at", { ascending: true })
      .then(({ data: rows }) => { if (!zruseno) setOdeslane(rows || []); });
    return () => { zruseno = true; };
  }, [activeId]);

  // Nabídka odeslána zákazníkovi: uloží přesnou kopii a přepne stav na Odesláno
  // (Schváleno/Zamítnuto se nepřepisuje). Jen pro uloženou nabídku bez
  // neuložených změn, ať kopie odpovídá tomu, co je v databázi.
  const oznacitOdeslano = async ({ html, cena }) => {
    if (!activeId) { alert("Nabídku nejdřív ulož."); return; }
    if (hasUnsavedChanges()) { alert("Máš neuložené změny — nejdřív nabídku ulož (💾 Uložit), ať odeslaná kopie odpovídá uložené nabídce."); return; }
    const cislo = quotes.find((q) => q.id === activeId)?.cislo || null;
    const { error } = await supabase.from("nabidky_odeslane").insert({
      quote_id: activeId, cislo, cena: Math.round(Number(cena) || 0), html, odeslal: currentUser?.name || null,
    });
    if (error) { alert("Kopii nabídky se nepodařilo uložit: " + error.message); return; }
    if (status === "Návrh") {
      const { error: e2 } = await supabase.from("quotes").update({ status: "Odesláno", updated_at: new Date().toISOString() }).eq("id", activeId);
      if (e2) { alert("Kopie je uložená, ale stav se nepodařilo změnit: " + e2.message); }
      else {
        setStatus("Odesláno");
        setQuotes(quotes.map((q) => (q.id === activeId ? { ...q, status: "Odesláno" } : q)));
        savedSnapshotRef.current = JSON.stringify({ name, customerId, status: "Odesláno", type, data });
      }
    }
    await nactiOdeslane(activeId);
    ukazHlasku(status === "Návrh" ? "✓ Označeno jako odeslané — kopie uložena, stav změněn na Odesláno" : "✓ Odeslání zaznamenáno — kopie nabídky uložena");
  };

  const hasUnsavedChanges = () => {
    if (savedSnapshotRef.current === null) return false;
    return savedSnapshotRef.current !== JSON.stringify({ name, customerId, status, type, data });
  };

  const confirmDiscardChanges = () => {
    if (!hasUnsavedChanges()) return true;
    return confirm("Máte neuložené změny v nabídce. Opravdu chcete pokračovat bez uložení?");
  };

  const openQuote = (q) => {
    if (!confirmDiscardChanges()) return;
    const cId = q.customer_id ? String(q.customer_id) : "";
    const st = q.status || "Návrh";
    const ty = q.type || "";
    const normalized = normalize(q.data);
    setActiveId(q.id);
    setName(q.name);
    setCustomerId(cId);
    setStatus(st);
    setType(ty);
    setData(normalized);
    setNahledOtevren(false);
    savedSnapshotRef.current = JSON.stringify({ name: q.name, customerId: cId, status: st, type: ty, data: normalized });
  };

  const newQuote = () => {
    if (!confirmDiscardChanges()) return;
    const fresh = PRAZDNA_NABIDKA();
    setActiveId(null);
    setName("");
    setCustomerId("");
    setStatus("Návrh");
    setType("");
    setData(fresh);
    savedSnapshotRef.current = JSON.stringify({ name: "", customerId: "", status: "Návrh", type: "", data: fresh });
  };

  const closeQuote = () => { setActiveId(null); setData(null); setNahledOtevren(false); savedSnapshotRef.current = null; };

  // ── Výpočty ──
  const sazbaMd = data?.interni?.sazbaMd || 0;
  const sazbaBod = data?.interni?.sazbaBod || 0;
  const sazbaHod = data?.interni?.sazbaHod || 0;
  const radkyVypoctene = data ? data.interni.radky.map(r => ({ r, v: radekVypocet(r, sazbaMd, sazbaBod, sazbaHod) })) : [];
  const polozkyVypoctene = data ? data.interni.polozky.map(p => ({ p, md: Number(p.md) || 0, cena: (Number(p.md) || 0) * sazbaMd })) : [];
  const celkemPolozkyMd = polozkyVypoctene.reduce((s, x) => s + x.md, 0);
  const celkemPolozkyKc = polozkyVypoctene.reduce((s, x) => s + x.cena, 0);
  const celkemMd = radkyVypoctene.reduce((s, x) => s + x.v.md, 0) + celkemPolozkyMd;
  const celkemDoprava = radkyVypoctene.reduce((s, x) => s + x.v.doprava, 0);
  const celkemMaterial = radkyVypoctene.reduce((s, x) => s + x.v.material, 0);
  const celkemPrace = radkyVypoctene.reduce((s, x) => s + x.v.laborKc, 0) + celkemPolozkyKc;
  const celkemNaklad = celkemDoprava + celkemMaterial + celkemPrace;

  // Náklad + marže = cena bez DPH, + DPH = cena s DPH (viz RetezecCeny).
  // U FVE/FVR je náklad z kalkulace (materiál, práce, služby), u ostatních
  // z interního nacenění níže.
  const kalkulacni = KALKULACNI_TYPY.includes(type);
  const nakladZKalkulace = type === "FVE" || type === "FVR";
  const nakladNabidky = nakladZKalkulace ? Math.round(Number(data?.zakaznik?.nakladKalkulace) || 0) : celkemNaklad;
  const marzeZadana = kalkulacni ? null : marzeNabidky(data, celkemNaklad);
  const cilovaCena = data ? cenaNabidkyBezDph(data, type, celkemNaklad) : 0; // cena BEZ DPH
  const dphPct = data?.zakaznik?.dph ?? 21;
  // u kalkulace přesně její cena s DPH (FVE se zaokrouhluje na tisíce), jinak dopočet
  const cenaSDph = kalkulacni && data?.zakaznik?.cenaSDph ? Math.round(Number(data.zakaznik.cenaSDph)) : Math.round(cilovaCena * (1 + dphPct / 100));
  const marze = cilovaCena - nakladNabidky;
  const marzePct = nakladNabidky > 0 ? Math.round((marze / nakladNabidky) * 1000) / 10 : null; // přirážka k nákladu

  const sekceSuma = data ? data.zakaznik.sekce.reduce((s, x) => s + (Number(x.castka) || 0), 0) : 0;
  const sekceRozdil = cilovaCena - sekceSuma;

  // ── Nabídka pro zákazníka u hromosvodů a elektroinstalací (náhled) ──
  const sekcova = SEKCOVE_TYPY.includes(type);

  // Plán práce v MD: u FVE/FVR z kalkulace, jinak z interního nacenění.
  const planMd = data ? (nakladZKalkulace ? planovaneMd(data, type) : celkemMd) : 0;
  const planMdZdroj = nakladZKalkulace ? "kalkulace" : "nacenění";
  const planClovekDni = data ? data.denniPlan.reduce((s, p) => s + (Number(p.pocetLidi) || 0), 0) : 0;
  const planDniPocet = data ? data.denniPlan.length : 0;

  const save = async () => {
    if (!name.trim()) { alert("Zadejte název nabídky."); return; }
    setSaving(true);
    // Servis a rozšíření dostanou při prvním uložení číslo nabídky a datum
    // vystavení; pak už se nemění. Při kolizi čísla (dva lidé ukládají
    // současně, hlídá UNIQUE index) se zkusí další volné číslo.
    const puvodni = activeId ? quotes.find(q => q.id === activeId) : null;
    const potrebaCislo = CISLOVANE_TYPY.includes(type) && !puvodni?.cislo;
    for (let pokus = 0; pokus < 5; pokus++) {
      const row = {
        name: name.trim(),
        customer_id: customerId ? Number(customerId) : null,
        status,
        type: type || null,
        data,
        updated_at: new Date().toISOString(),
      };
      if (potrebaCislo) {
        try {
          row.cislo = await dalsiCisloNabidky(type);
        } catch (e) {
          alert("Nepodařilo se přidělit číslo nabídky: " + (e?.message || e));
          setSaving(false);
          return;
        }
        row.vystaveno = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD v místním čase
      }
      let error;
      let inserted = null;
      if (activeId) {
        ({ error } = await supabase.from("quotes").update(row).eq("id", activeId));
      } else {
        ({ data: inserted, error } = await supabase.from("quotes").insert(row).select().single());
      }
      if (error) {
        if (potrebaCislo && error.code === "23505") continue; // číslo mezitím obsadil někdo jiný
        alert("Nabídku se nepodařilo uložit: " + error.message);
        setSaving(false);
        return;
      }
      if (activeId) setQuotes(quotes.map(q => q.id === activeId ? { ...q, ...row } : q));
      else if (inserted) { setQuotes([inserted, ...quotes]); setActiveId(inserted.id); }
      setName(row.name);
      savedSnapshotRef.current = JSON.stringify({ name: row.name, customerId, status, type, data });
      setSaving(false);
      ukazHlasku(row.cislo ? `✓ Nabídka uložena — přiděleno číslo ${row.cislo}` : "✓ Nabídka uložena");
      return;
    }
    alert("Nabídku se nepodařilo uložit: nepodařilo se přidělit volné číslo nabídky. Zkus to prosím znovu.");
    setSaving(false);
  };

  const deleteQuote = async (id) => {
    if (!confirm("Smazat tuto nabídku?")) return;
    const { error } = await supabase.from("quotes").delete().eq("id", id);
    if (error) { alert("Nabídku se nepodařilo smazat: " + error.message); return; }
    setQuotes(quotes.filter(q => q.id !== id));
    if (activeId === id) closeQuote();
    ukazHlasku("Nabídka smazána");
  };

  // Duplikace nabídky — ušetří přepisování celého interního nacenění, když
  // je nová poptávka hodně podobná nějaké dřívější (typický případ: stejná
  // sestava FVE u jiného zákazníka). Kopie vždy začíná jako "Návrh" a bez
  // vazby na obchodní případ, ať omylem nevznikne dojem, že jde o tu samou
  // nabídku, která už třeba byla odeslaná/schválená.
  const duplicateQuote = async (q) => {
    const row = {
      name: (q.name || "Nabídka") + " (kopie)",
      customer_id: q.customer_id,
      status: "Návrh",
      type: q.type,
      data: q.data,
      updated_at: new Date().toISOString(),
    };
    const { data: inserted, error } = await supabase.from("quotes").insert(row).select().single();
    if (error) { alert("Nabídku se nepodařilo zkopírovat: " + error.message); return; }
    if (inserted) { setQuotes([inserted, ...quotes]); ukazHlasku(`✓ Nabídka zkopírována jako „${row.name}“`); }
  };

  const convertToDeal = async () => {
    if (!activeId) { alert("Nejdřív nabídku uložte."); return; }
    if (!onConvertToDeal) return;
    setConverting(true);
    const cust = customers.find(c => c.id === Number(customerId));
    const aktivni = quotes.find(q => q.id === activeId);
    // Nabídka už v Průběhu zakázek je → jen ji tam otevřít, nic nezakládat podruhé.
    const { data: podleNabidky } = await supabase.from("zakazky_prubeh").select("id").eq("quote_id", activeId);
    let prubehId = podleNabidky?.[0]?.id || null;
    if (!prubehId && aktivni?.deal_id) {
      const { data: podleDealu } = await supabase.from("zakazky_prubeh").select("id").eq("deal_id", aktivni.deal_id);
      prubehId = podleDealu?.[0]?.id || null;
    }
    if (prubehId) {
      setConverting(false);
      onConvertToDeal(null, cust, prubehId);
      return;
    }
    // Obchodní případ se dál zakládá na pozadí (úkoly, zprávy, přehledy);
    // pracuje se s ním v Průběhu zakázek.
    let dealRow = null;
    if (aktivni?.deal_id) {
      const { data } = await supabase.from("deals").select("*").eq("id", aktivni.deal_id).maybeSingle();
      dealRow = data;
    }
    if (!dealRow) {
      const { data, error } = await supabase.from("deals").insert({
        name, value: Math.round(cilovaCena), stage: "Nabídka",
        customer_id: customerId ? Number(customerId) : null,
        assigned_to: currentUser?.name || "",
        type: type || null,
        site_address: cust?.address || null,
      }).select().single();
      if (error) {
        alert("Nabídku se nepodařilo předat do Průběhu zakázek: " + error.message);
        setConverting(false);
        return;
      }
      dealRow = data;
    }
    if (dealRow) {
      const { data: pr, error: prErr } = await supabase.from("zakazky_prubeh").insert({
        nazev: name || "Zakázka", customer_id: customerId ? Number(customerId) : null, typ: type || null,
        hodnota: Math.round(cilovaCena) || null, deal_id: dealRow.id, quote_id: activeId, faze: "jednani", stav: "otevrena",
        vlastnik_obchod: currentUser?.name || null, dalsi_krok: "Zákazník se k nabídce vyjádřil", dalsi_krok_kdo: currentUser?.name || null,
        dalsi_krok_termin: terminFaze(fazeById.jednani), misto_adresa: cust?.address || null,
      }).select().single();
      if (pr) {
        prubehId = pr.id;
        await supabase.from("zakazky_poznamky").insert({ prubeh_id: pr.id, kdo: currentUser?.name || "Systém", text: `Předáno z Nacenění (nabídka ${aktivni?.cislo || name}) — čeká se na vyjádření zákazníka.`, system: true });
      } else if (prErr) {
        console.warn("Zápis do Průběhu zakázek selhal (převezme se při otevření):", prErr.message);
      }
      const { error: updErr } = await supabase.from("quotes").update({ deal_id: dealRow.id, status: "Odesláno" }).eq("id", activeId);
      if (updErr) {
        alert("Obchodní případ vznikl, ale nabídku se nepodařilo označit jako odeslanou: " + updErr.message);
      } else {
        setQuotes(quotes.map(q => q.id === activeId ? { ...q, deal_id: dealRow.id, status: "Odesláno" } : q));
      }
      onConvertToDeal(dealRow, cust, prubehId);
    }
    setConverting(false);
  };

  // Technický souhrn podle typu zakázky — vytáhne z interních dat to, co
  // dává zákazníkovi smysl vidět (u HRM rozpis hromosvodu, u ELK rozsah
  // prací, u FVE/FVR klíčové technické parametry). Nic ručně nepřepisuje —
  // jde navíc k sekcím, které si uživatel sám vyplní v SekceTabulka.
  const buildTypeSummaryHtml = async () => {
    if (type === "HRM") {
      const vsechny = (data.interni.radky || []).flatMap(r => r.kusovnik || []);
      if (vsechny.length === 0) return "";
      const grouped = {};
      vsechny.forEach(it => {
        const klic = (it.nazev || "—") + "|" + (it.jednotka || "ks");
        if (!grouped[klic]) grouped[klic] = { nazev: it.nazev || "—", jednotka: it.jednotka || "ks", mnozstvi: 0 };
        grouped[klic].mnozstvi += Number(it.mnozstvi) || 0;
      });
      const radky = Object.values(grouped);
      if (radky.length === 0) return "";
      return "<h2 style='margin-top:22px;font-size:15px;color:#111;font-weight:700'>Rozpis materiálu</h2>" +
        "<table><thead><tr><th>Položka</th><th>Množství</th></tr></thead><tbody>" +
        radky.map(r => `<tr><td>${r.nazev}</td><td>${r.mnozstvi} ${r.jednotka}</td></tr>`).join("") +
        "</tbody></table>";
    }
    if (type === "ELK") {
      const radky = data.interni.radky || [];
      const sumBod = radky.filter(r => r.jednotka === "bod").reduce((s, r) => s + (Number(r.pocetMd) || 0), 0);
      const sumHod = radky.filter(r => r.jednotka === "hod").reduce((s, r) => s + (Number(r.pocetMd) || 0), 0);
      if (!sumBod && !sumHod) return "";
      let radkyHtml = "";
      if (sumBod) radkyHtml += `<tr><td>Počet bodů</td><td>${sumBod}</td></tr>`;
      if (sumHod) radkyHtml += `<tr><td>Počet hodin</td><td>${sumHod}</td></tr>`;
      return "<h2 style='margin-top:22px;font-size:15px;color:#111;font-weight:700'>Rozsah prací</h2>" +
        "<table><thead><tr><th>Ukazatel</th><th>Hodnota</th></tr></thead><tbody>" + radkyHtml + "</tbody></table>";
    }
    if ((type === "FVE" || type === "FVR") && data.fve) {
      const cfg = data.fve;
      const { data: items } = await supabase.from("fve_cenik_items").select("*").eq("active", true);
      const najdi = (kat, nazev) => (items || []).find(i => i.category === kat && i.name === nazev) || {};
      const panel = najdi("panely", cfg.panel?.name);
      const baterie = najdi("baterie", cfg.baterie?.name);
      const stridac = najdi("stridace", cfg.stridac?.name);
      const vykonFve = (panel.wp || 0) * (Number(cfg.panel?.qty) || 0) / 1000;
      const bateriKwh = (baterie.kwh || 0) * (Number(cfg.baterie?.qty) || 0);
      const maPanely = Number(cfg.panel?.qty) > 0;
      const maStridac = Number(cfg.stridac?.qty) > 0;
      const maBaterii = Number(cfg.baterie?.qty) > 0 && bateriKwh > 0;
      // Nic nevyplněno (prázdný "servis" preset apod.) — radši nezobrazit
      // prázdnou/matoucí tabulku se samými "Bez ..." položkami z ceníku.
      if (!vykonFve && !maPanely && !maStridac && !maBaterii) return "";
      let radkyHtml = "";
      if (vykonFve > 0) radkyHtml += `<tr><td>Instalovaný výkon</td><td>${Math.round(vykonFve * 10) / 10} kWp</td></tr>`;
      if (maPanely) radkyHtml += `<tr><td>Počet panelů</td><td>${cfg.panel.qty} ks</td></tr>`;
      if (maStridac) radkyHtml += `<tr><td>Střídač</td><td>${stridac.name}</td></tr>`;
      if (maBaterii) radkyHtml += `<tr><td>Bateriové úložiště</td><td>${Math.round(bateriKwh * 100) / 100} kWh</td></tr>`;
      if (!radkyHtml) return "";
      return "<h2 style='margin-top:22px;font-size:15px;color:#111;font-weight:700'>Technická specifikace</h2>" +
        "<table><thead><tr><th>Parametr</th><th>Hodnota</th></tr></thead><tbody>" + radkyHtml + "</tbody></table>";
    }
    return "";
  };

  // Nabídka pro zákazníka — technický souhrn podle typu (viz výše) + sekce +
  // celková cena, žádný vnitřní rozpis nákladů. Rozložení (barva/nadpis) se
  // liší podle typu zakázky, ať je hned vidět, o jaký druh práce jde.
  const printQuote = async () => {
    const w = window.open("", "_blank");
    w.document.write("<!DOCTYPE html><html><body style='font-family:Arial,sans-serif;padding:32px;color:#64748b'>Připravuji nabídku…</body></html>");
    const cust = customers.find(c => c.id === Number(customerId));
    const typeInfo = JOB_TYPES.find(t => t.id === type);
    const accent = typeBadgeColor(type);
    const sekceHtml = data.zakaznik.sekce.length === 0 ? "" : `
      <h2 style="margin-top:22px;font-size:15px;color:#111;font-weight:700">Nabízené položky</h2>
      <table><thead><tr><th>Položka</th><th>Cena</th></tr></thead><tbody>
      ${data.zakaznik.sekce.map(s => `<tr><td>${s.nazev || "—"}</td><td>${fmtKc(s.castka)}</td></tr>`).join("")}
      </tbody></table>`;
    const typeSummaryHtml = await buildTypeSummaryHtml();
    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Nabídka – " + name + "</title>" +
      "<style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:22px;margin-bottom:2px;border-left:6px solid " + accent + ";padding-left:12px}h2.top{font-size:13px;color:#555;font-weight:normal;margin-bottom:4px;padding-left:18px}.typebadge{display:inline-block;margin-left:18px;margin-bottom:20px;font-size:11px;font-weight:700;color:#fff;background:" + accent + ";padding:3px 10px;border-radius:10px}table{width:100%;border-collapse:collapse;margin-bottom:10px}th{background:#0E3B5E;color:#fff;padding:8px 12px;text-align:left;font-size:13px}td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}.total{font-size:20px;font-weight:bold;margin-top:18px;text-align:right}@media print{body{padding:16px}}</style>" +
      "</head><body>" +
      "<h1>Nabídka – " + name + "</h1>" +
      "<h2 class='top'>" + (cust ? cust.name : "") + " · " + new Date().toLocaleDateString("cs-CZ") + "</h2>" +
      "<span class='typebadge'>" + (typeInfo ? typeInfo.label : "") + "</span>" +
      typeSummaryHtml +
      sekceHtml +
      "<div class='total'>Cena bez DPH: " + fmtKc(cilovaCena) + "<br>DPH " + dphPct + " %: " + fmtKc(cenaSDph - cilovaCena) + "<br>Celková cena s DPH: " + fmtKc(cenaSDph) + "</div>" +
      (data.notes ? "<p style='margin-top:20px;white-space:pre-wrap;font-size:13px'>" + data.notes + "</p>" : "") +
      "<script>window.onload=function(){window.print();}</script></body></html>";
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Interní přehled — MD rozpis, jen pro vlastní potřebu firmy (necháváme si to interně).
  const printInterni = () => {
    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Interní nacenění – " + name + "</title>" +
      "<style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:22px;margin-bottom:2px}h2{font-size:13px;color:#555;font-weight:normal;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-bottom:10px}th{background:#64748b;color:#fff;padding:6px 8px;text-align:left;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px}.total{font-size:16px;font-weight:bold;margin-top:16px;text-align:right}@media print{body{padding:16px}}</style>" +
      "</head><body>" +
      "<h1>Interní nacenění – " + name + "</h1>" +
      (nakladZKalkulace
        ? "<h2>Práce podle kalkulace: elektro " + (Number(data.fve?.mdElektro) || 0) + " MD · střecha " + (Number(data.fve?.mdStrecha) || 0) + " MD · instalatér " + (Number(data.fve?.mdInstalater) || 0) + " MD</h2>"
        : "<h2>Sazba: " + fmtKc(sazbaMd) + " / MD</h2>" +
      "<table><thead><tr><th>Popis</th><th>Doprava km/den</th><th>Počet dní</th><th>Počet lidí</th><th>Celkem MD</th><th>Materiál</th><th>Cena</th></tr></thead><tbody>" +
      radkyVypoctene.map(({ r, v }) => `<tr><td>${r.popis || "—"}</td><td>${r.dopravaKm || 0}</td><td>${v.dny}</td><td>${v.lide}</td><td>${Math.round(v.md * 100) / 100}</td><td>${fmtKc(v.material)}</td><td>${fmtKc(v.cena)}</td></tr>`).join("") +
      "</tbody></table>" +
      (polozkyVypoctene.length ? "<h2 style='margin-top:14px'>Samostatné položky</h2><table><thead><tr><th>Název</th><th>MD</th><th>Cena</th></tr></thead><tbody>" +
        polozkyVypoctene.map(({ p, md, cena }) => `<tr><td>${p.nazev || "—"}</td><td>${Math.round(md * 100) / 100}</td><td>${fmtKc(cena)}</td></tr>`).join("") +
        "</tbody></table>" : "")) +
      "<div class='total'>Celkem MD: " + (Math.round(planMd * 100) / 100) + " · Náklad: " + fmtKc(nakladNabidky) + " · Marže: " + fmtKc(marze) + (marzePct != null ? " (" + marzePct + " %)" : "") + " · Cena bez DPH: " + fmtKc(cilovaCena) + " · Cena s DPH " + dphPct + " %: " + fmtKc(cenaSDph) + "</div>" +
      "<script>window.onload=function(){window.print();}</script></body></html>";
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  };

  const filtered = quotes
    .filter(q => !search || (q.name || "").toLowerCase().includes(search.toLowerCase()))
    .filter(q => typeFilter === "vse" || q.type === typeFilter || (typeFilter === "bez" && !q.type))
    .filter(q => statusFilter === "vse" || q.status === statusFilter);

  const typeBadgeColor = (id) => ({ FVE: "#f59e0b", FVR: "#ea580c", HRM: "#a78bfa", ELK: "#0369a1", SRV: "#34d399" }[id] || "#475569");
  const statusColor = (s) => ({ "Návrh": "#64748b", "Odesláno": "#0369a1", "Schváleno": "#34d399", "Zamítnuto": "#ef4444" }[s] || "#64748b");

  // KPI nad seznamem — kolik nabídek je rozpracovaných/schválených a jaká je
  // hodnota otevřené pipeline (bez zamítnutých), ať je vidět stav bez klikání
  // do každé nabídky zvlášť.
  const kpiSchvaleno = quotes.filter(q => q.status === "Schváleno");
  const kpiOtevreno = quotes.filter(q => q.status !== "Zamítnuto");
  const kpiHodnotaOtevrenych = kpiOtevreno.reduce((s, q) => s + computeQuoteTotals(q.data, q.type).cilovaCena, 0);

  // Historie samostatných položek napříč VŠEMI nabídkami (i mimo FVE) — pro
  // ceník/napovídání v PolozkyTabulka.
  const historickePolozky = quotes.flatMap(q => (q.data?.interni?.polozky || []).filter(p => p.nazev));

  // ─── SEZNAM NABÍDEK ──────────────────────────────────────────────────────
  if (!data) {
    return (
      <div style={S.app}>
        {hlaskaEl}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", margin: 0 }}>💰 Nacenění</h1>
          <button style={S.btn()} onClick={newQuote}>+ Nová nabídka</button>
        </div>
        <p style={{ color: "#475569", fontSize: 13, marginBottom: 18 }}>Interní nacenění po MD (člověko-dnech) + rozvrh po dnech + volné sekce pro zákazníka. Následně překlop na obchodní případ.</p>

        {/* KPI */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
          <div style={S.card}>
            <div style={S.label}>Celkem nabídek</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0369a1" }}>{quotes.length}</div>
          </div>
          <div style={S.card}>
            <div style={S.label}>Schváleno</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#34d399" }}>{kpiSchvaleno.length}</div>
          </div>
          <div style={S.card}>
            <div style={S.label}>Hodnota otevřené pipeline (bez DPH)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b" }}>{fmtKc(kpiHodnotaOtevrenych)}</div>
          </div>
        </div>

        <input style={{ ...S.input, marginBottom: 16, maxWidth: 340 }} placeholder="Hledat nabídku..." value={search} onChange={e => setSearch(e.target.value)} />

        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {[["vse", "Vše"], ...JOB_TYPES.map(t => [t.id, t.label]), ["bez", "Bez typu"]].map(([k, l]) => (
            <button key={k} onClick={() => setTypeFilter(k)}
              style={{
                background: typeFilter === k ? "#0369a1" : "#f8fafc", color: typeFilter === k ? "#fff" : "#475569",
                border: "1px solid " + (typeFilter === k ? "#0369a1" : "#e2e8f0"), borderRadius: 8,
                padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {["vse", "Návrh", "Odesláno", "Schváleno", "Zamítnuto"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{
                background: statusFilter === s ? statusColor(s === "vse" ? "" : s) : "#f8fafc",
                color: statusFilter === s ? "#fff" : "#475569",
                border: "1px solid " + (statusFilter === s ? statusColor(s === "vse" ? "" : s) : "#e2e8f0"), borderRadius: 8,
                padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
              {s === "vse" ? "Všechny stavy" : s}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && <div style={{ color: "#64748b", fontSize: 13 }}>Zatím žádné nabídky.</div>}
          {filtered.map(q => {
            const cust = customers.find(c => c.id === q.customer_id);
            return (
              <div key={q.id} onClick={() => openQuote(q)}
                style={{ ...S.card, marginBottom: 0, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 14 }}>{q.name}</div>
                    {q.type && (
                      <span style={{ background: typeBadgeColor(q.type) + "22", color: typeBadgeColor(q.type), border: "1px solid " + typeBadgeColor(q.type), borderRadius: 6, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>
                        {q.type}
                      </span>
                    )}
                    <span style={{ background: statusColor(q.status) + "22", color: statusColor(q.status), border: "1px solid " + statusColor(q.status), borderRadius: 6, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>
                      {q.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{q.cislo ? <b>{q.cislo} · </b> : ""}{cust ? cust.name : "bez zákazníka"} · {fmtKc(computeQuoteTotals(q.data, q.type).cilovaCena)} bez DPH</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={e => { e.stopPropagation(); duplicateQuote(q); }} title="Duplikovat nabídku" style={{ ...S.btnGhost, padding: "5px 12px", fontSize: 11 }}>📋 Duplikovat</button>
                  <button onClick={e => { e.stopPropagation(); deleteQuote(q.id); }} style={{ ...S.btn("#ef4444"), padding: "5px 12px", fontSize: 11 }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── EDITOR NABÍDKY ──────────────────────────────────────────────────────
  return (
    <div style={S.app}>
      {hlaskaEl}
      <button onClick={() => { if (confirmDiscardChanges()) closeQuote(); }} style={{ ...S.btnGhost, padding: "6px 14px", marginBottom: 14 }}>← Zpět na seznam</button>

      <div style={{ ...S.card, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12 }}>
        <div><label style={S.label}>Název nabídky</label><input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="např. FVE Novák 9kWp" /></div>
        <div>
          <label style={S.label}>Typ zakázky</label>
          <select style={S.select} value={type} onChange={e => setType(e.target.value)}>
            <option value="">— nezadáno —</option>
            {JOB_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Zákazník</label>
          <select style={S.select} value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">— bez zákazníka —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Stav</label>
          <select style={S.select} value={status} onChange={e => setStatus(e.target.value)}>
            {["Návrh", "Odesláno", "Schváleno", "Zamítnuto"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* FVE KALKULAČKA — u FVE i FVR (rozšíření stávající instalace) přesně
          podle Excelu; u SRV (servis stávající FVE) slouží k popisu
          servisované soustavy a vygenerování servisní nabídky (Word) */}
      {(type === "FVE" || type === "FVR" || type === "SRV") && (
        <FveCalculator
          value={data.fve || ((type === "FVR" || type === "SRV") ? vychoziSluzba(type) : null)}
          onChange={(fve) => setData({ ...data, fve })}
          currentUser={currentUser}
          S={S}
          quoteName={name}
          customerName={customers.find((c) => c.id === Number(customerId))?.name}
          customerAddress={customers.find((c) => c.id === Number(customerId))?.address}
          customerEmail={(() => { const c = customers.find((x) => x.id === Number(customerId)); return c?.email || c?.email_contact || ""; })()}
          cisloNabidky={quotes.find((q) => q.id === activeId)?.cislo}
          vystaveno={quotes.find((q) => q.id === activeId)?.vystaveno}
          odeslane={activeId ? odeslane : []}
          onOdeslano={oznacitOdeslano}
          jobType={type}
          uZakaznika={uZakaznika}
          onUZakaznika={setUZakaznika}
          onSave={save}
          cenaVNabidce={data.zakaznik}
          onUseAsTarget={({ cenaBezDph, cenaSDph: sDphKalk, dphPct: dphKalk, naklad }) => setData({ ...data, zakaznik: {
            ...data.zakaznik, cilovaCena: String(cenaBezDph), cenaSDph: String(sDphKalk), dph: dphKalk,
            ...(naklad != null ? { nakladKalkulace: String(naklad) } : {}),
          } })}
        />
      )}

      {/* INTERNÍ NACENĚNÍ — po MD (u FVE/FVR ne: práce, náklad i MD jsou v kalkulaci výše) */}
      {!nakladZKalkulace && (
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>🧮 Interní nacenění — po MD (člověko-dnech)</div>
        {type === "SRV" && (
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#1e3a8a", marginBottom: 10 }}>
            U servisu je tady náklad (lidé, dny, doprava, materiál) — cena je součet úkonů v kalkulaci výše, marže = cena − tento náklad.
          </div>
        )}
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>Počet MD (dní) a počet lidí se u každého řádku píší ručně — appka je vynásobí (2 dny × 3 lidi = 6 MD) a tím se počítá práce (MD × sazba). Doprava se násobí jen počtem dní (stejná cesta bez ohledu na počet lidí). Materiál se nenásobí vůbec — je to vždy celková částka za řádek. U řádků s jednotkou „Bod" nebo „Hodina" se práce počítá jako množství × příslušná sazba, bez násobení počtem lidí. Jen pro vnitřní potřebu — zákazník tohle nevidí.</div>
        <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 160 }}>
            <label style={S.label}>Sazba (Kč / MD)</label><input type="number" style={S.input} value={data.interni.sazbaMd} onChange={e => setData({ ...data, interni: { ...data.interni, sazbaMd: e.target.value } })} />
          </div>
          <div style={{ maxWidth: 160 }}>
            <label style={S.label}>Sazba (Kč / bod)</label><input type="number" style={S.input} value={data.interni.sazbaBod} onChange={e => setData({ ...data, interni: { ...data.interni, sazbaBod: e.target.value } })} />
          </div>
          <div style={{ maxWidth: 160 }}>
            <label style={S.label}>Sazba (Kč / hodina)</label><input type="number" style={S.input} value={data.interni.sazbaHod} onChange={e => setData({ ...data, interni: { ...data.interni, sazbaHod: e.target.value } })} />
          </div>
        </div>
        <InterniTabulka
          radky={data.interni.radky}
          setRadky={radky => setData({ ...data, interni: { ...data.interni, radky } })}
          sazbaMd={sazbaMd}
          sazbaBod={sazbaBod}
          sazbaHod={sazbaHod}
        />
        <PolozkyTabulka
          polozky={data.interni.polozky}
          setPolozky={polozky => setData({ ...data, interni: { ...data.interni, polozky } })}
          sazbaMd={sazbaMd}
          historicke={historickePolozky}
        />
        <div style={{ marginTop: 14, display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
          <div><span style={{ color: "#475569" }}>Celkem MD: </span><b style={{ color: "#a78bfa" }}>{Math.round(celkemMd * 100) / 100}</b></div>
          <div><span style={{ color: "#475569" }}>Doprava: </span><b>{fmtKc(celkemDoprava)}</b></div>
          <div><span style={{ color: "#475569" }}>Práce + položky: </span><b>{fmtKc(celkemPrace)}</b></div>
          <div><span style={{ color: "#475569" }}>Materiál: </span><b>{fmtKc(celkemMaterial)}</b></div>
          <div><span style={{ color: "#475569" }}>Celkem interní náklad: </span><b style={{ color: "#f87171" }}>{fmtKc(celkemNaklad)}</b></div>
        </div>
      </div>
      )}

      {/* ROZVRH PO DNECH — u FVR (rozšíření) skrytý, obvykle jde o jednodenní zásah */}
      {type !== "FVR" && !(uZakaznika && kalkulacni) && (
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>📅 Rozvrh po dnech</div>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>Kolik lidí je potřeba který den — přenese se do projektu a zakázky jako plán, proti kterému appka srovná skutečnou docházku.{nakladZKalkulace ? ` Plán práce z kalkulace: ${Math.round(planMd * 100) / 100} MD.` : ""}</div>
          <DenniPlanTabulka plan={data.denniPlan} setPlan={plan => setData({ ...data, denniPlan: plan })} />
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <span style={{ color: "#475569" }}>Naplánováno: </span><b>{planDniPocet} dní, {planClovekDni} člověko-dní celkem</b>
            {planMd > 0 && (
              <span style={{ marginLeft: 10, color: Math.abs(planClovekDni - planMd) < 0.5 ? "#15803d" : "#b45309" }}>
                {Math.abs(planClovekDni - planMd) < 0.5 ? `✓ odpovídá ${planMdZdroj}` : `⚠️ ${planMdZdroj} počítá s ${Math.round(planMd * 100) / 100} MD — rozvrh ${planClovekDni > planMd ? "přesahuje" : "nepokrývá"} o ${Math.round(Math.abs(planClovekDni - planMd) * 100) / 100}`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* NABÍDKA PRO ZÁKAZNÍKA — po sekcích */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>📋 Nabídka pro zákazníka — po sekcích</div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>To, co uvidí zákazník: vlastní pojmenované sekce a jejich cena, bez vnitřního rozpisu hodin a nákladů.</div>
        {kalkulacni ? (
          <div style={{ fontSize: 12, color: "#1e3a8a", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
            Cenu počítá kalkulace výše ({type === "SRV" ? "součet úkonů" : "náklad + marže"}) a propisuje se sem sama:
            {" "}<b>{fmtKc(cilovaCena)} bez DPH</b> · DPH {dphPct} % · <b>{fmtKc(cenaSDph)} s DPH</b>.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "160px 240px 1fr", gap: 12, marginBottom: 6, alignItems: "end" }}>
            <div>
              <label style={S.label}>Marže (% k nákladu)</label>
              <input type="number" min="0" step="1" style={S.input} value={data.zakaznik.marzePct ?? ""} placeholder={String(marzeZadana)}
                onChange={e => setData({ ...data, zakaznik: { ...data.zakaznik, marzePct: e.target.value } })} />
            </div>
            <div>
              <label style={S.label}>Sazba DPH v nabídce</label>
              <select style={S.select} value={dphPct} onChange={e => setData({ ...data, zakaznik: { ...data.zakaznik, dph: Number(e.target.value) } })}>
                {SAZBY_DPH.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 12, color: "#475569", paddingBottom: 12 }}>
              Náklad {fmtKc(celkemNaklad)} + marže {String(marzeZadana).replace(".", ",")} % = <b>{fmtKc(cilovaCena)} bez DPH</b>, + DPH {dphPct} % = <b>{fmtKc(cenaSDph)} s DPH</b>.
              {celkemNaklad <= 0 && <span style={{ color: "#b91c1c" }}> Nejdřív vyplň interní nacenění výše.</span>}
            </div>
          </div>
        )}
        {sekcova && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={S.label}>Místo realizace <span style={{ textTransform: "none" }}>— prázdné = adresa zákazníka</span></label>
              <input style={S.input} value={data.zakaznik.adresa ?? ""} placeholder={customers.find(c => c.id === Number(customerId))?.address || "např. Zábřeh, Krumpach 12"}
                onChange={e => setData({ ...data, zakaznik: { ...data.zakaznik, adresa: e.target.value } })} />
            </div>
          </div>
        )}
        <SekceTabulka sekce={data.zakaznik.sekce} setSekce={sekce => setData({ ...data, zakaznik: { ...data.zakaznik, sekce } })} />
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <span style={{ color: "#475569" }}>Součet sekcí: </span><b>{fmtKc(sekceSuma)}</b>
          <span style={{ marginLeft: 10, color: Math.abs(sekceRozdil) < 1 ? "#34d399" : "#f59e0b" }}>
            {Math.abs(sekceRozdil) < 1 ? "✓ sedí na cenu bez DPH"
              : sekceRozdil > 0 ? `⚠️ zbývá rozdělit ${fmtKc(sekceRozdil)} (sekce se zadávají bez DPH)`
                : `⚠️ sekce jsou o ${fmtKc(-sekceRozdil)} víc než cena bez DPH`}
          </span>
          {Math.abs(sekceRozdil) >= 1 && sekceSuma > 0 && cilovaCena > 0 && (
            <button style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 12, marginLeft: 10 }}
              title="Přepočítá částky sekcí ve stejném poměru tak, aby dohromady dávaly cenu bez DPH"
              onClick={() => {
                const sekce = data.zakaznik.sekce;
                let zbyva = cilovaCena;
                const nove = sekce.map((x, i) => {
                  if (i === sekce.length - 1) return { ...x, castka: String(zbyva) };
                  const c = Math.round((Number(x.castka) || 0) / sekceSuma * cilovaCena);
                  zbyva -= c;
                  return { ...x, castka: String(c) };
                });
                setData({ ...data, zakaznik: { ...data.zakaznik, sekce: nove } });
              }}>⚖️ Dorovnat sekce na cenu</button>
          )}
        </div>
        {sekcova && (() => {
          const vychozi = seznamyPodleTypu(type);
          const zahrnutoItems = data.zakaznik.zahrnutoItems || vychozi.zahrnutoItems;
          const nezahrnutoItems = data.zakaznik.nezahrnutoItems || vychozi.nezahrnutoItems;
          return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
              <SeznamVCene nadpis="V ceně JE zahrnuto" polozky={zahrnutoItems}
                onChange={polozky => setData({ ...data, zakaznik: { ...data.zakaznik, zahrnutoItems: polozky, nezahrnutoItems } })} />
              <SeznamVCene nadpis="V ceně NENÍ zahrnuto" polozky={nezahrnutoItems}
                onChange={polozky => setData({ ...data, zakaznik: { ...data.zakaznik, zahrnutoItems, nezahrnutoItems: polozky } })} />
            </div>
          );
        })()}
        {sekcova && (
          <div style={{ marginTop: 14 }}>
            <button style={S.btn("#0369a1")} onClick={() => setNahledOtevren(v => !v)}>📝 {nahledOtevren ? "Skrýt náhled nabídky" : "Náhled nabídky pro zákazníka"}</button>
          </div>
        )}
        {sekcova && nahledOtevren && (
          <div ref={nahledRef}>
            <NahledSekcove
              type={type} data={data} setData={setData} cilovaCena={cilovaCena} dphPct={dphPct}
              customer={customers.find(c => c.id === Number(customerId))}
              quote={quotes.find(q => q.id === activeId)} currentUser={currentUser}
              odeslane={activeId ? odeslane : []} onOdeslano={oznacitOdeslano} onSave={save}
            />
          </div>
        )}
      </div>

      {!(uZakaznika && kalkulacni) && <div style={S.card}>
        <label style={S.label}>{!type || sekcova ? "Poznámka k nabídce — zobrazí se zákazníkovi" : "Interní poznámka — zákazník ji nevidí"}</label>
        <textarea style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={data.notes} onChange={e => setData({ ...data, notes: e.target.value })} />
      </div>}

      <div style={{ ...S.card, background: "#f8fafc" }}>
        {!(uZakaznika && kalkulacni) && <div style={{ marginBottom: 14 }}>
          <RetezecCeny naklad={nakladNabidky} marzeKc={marze} marzePct={marzePct} cenaBez={cilovaCena} dphPct={dphPct} cenaS={cenaSDph}
            poznamka={nakladZKalkulace ? "Náklad a marže z kalkulace FVE výše." : type === "SRV" ? "Cena = součet úkonů servisu, náklad = interní nacenění." : "Marže je přirážka k nákladu. Všechny částky kromě poslední jsou bez DPH."} />
        </div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={S.btn("#34d399")} onClick={save} disabled={saving}>{saving ? "Ukládám…" : "💾 Uložit nabídku"}</button>
          {/* Nabídka pro zákazníka: u FVE/FVR/SRV náhled v kalkulačce, u HRM/ELK
              náhled u sekcí; starý jednoduchý tisk jen u nabídky bez typu */}
          {sekcova && (
            <button style={S.btn("#0369a1")} onClick={() => { setNahledOtevren(true); setTimeout(() => nahledRef.current?.scrollIntoView({ behavior: "smooth" }), 50); }}>
              📝 Náhled nabídky pro zákazníka
            </button>
          )}
          {!type && <button style={S.btnGhost} onClick={printQuote}>🖨️ Nabídka pro zákazníka</button>}
          {!(uZakaznika && kalkulacni) && <button style={S.btnGhost} onClick={printInterni}>📊 Interní přehled (MD)</button>}
          {activeId && <button style={S.btn("#F5C518")} disabled={converting} onClick={convertToDeal}>{converting ? "Předávám…" : "➡️ Předat do Průběhu zakázek"}</button>}
        </div>
        {!type && <div style={{ fontSize: 12, color: "#b45309", marginTop: 10 }}>Vyber nahoře typ zakázky — podle něj se připraví nabídka pro zákazníka s číslem, podmínkami a evidencí odeslání.</div>}
        {(type === "FVE" || type === "FVR" || type === "SRV") && <div style={{ fontSize: 12, color: "#475569", marginTop: 10 }}>Nabídku pro zákazníka otevřeš tlačítkem „📝 Náhled nabídky pro zákazníka“ v kalkulaci nahoře.</div>}
      </div>
    </div>
  );
}
