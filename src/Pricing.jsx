import { useState, useEffect, useRef, Fragment } from "react";
import { supabase } from "./supabase.js";
import FveCalculator from "./FveCalculator.jsx";
import { PRAZDNA_FVE, applyPreset } from "./fvePresets.js";

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

const PRAZDNA_NABIDKA = () => ({
  interni: {
    sazbaMd: 3200,   // Kč / MD (člověko-den) — jednotná sazba pro celou nabídku
    sazbaBod: 0,     // Kč / bod — pro řádky elektroinstalace účtované po bodech
    sazbaHod: 0,     // Kč / hodina — pro řádky elektroinstalace účtované hodinově
    radky: [],       // [{id, popis, dopravaKm, materialKc, pocetMd, pocetLidi, jednotka, kusovnik}]
    polozky: [],     // [{id, nazev, md}] — samostatné položky mimo fáze, např. revize, dokumentace
  },
  zakaznik: {
    cilovaCena: "",  // cílová prodejní cena celkem — co uvidí zákazník; prázdné = návrh z interní ceny + marže
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
function computeQuoteTotals(qdata) {
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
  const cilovaZadana = d?.zakaznik?.cilovaCena;
  const cilovaCena = cilovaZadana !== "" && cilovaZadana != null ? Number(cilovaZadana) : Math.round(celkemNaklad * 1.25);
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
  const add = () => setSekce([...sekce, { id: uid(), nazev: "", castka: "" }]);

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={S.th}>Název sekce (vlastní)</th><th style={S.th}>Částka (Kč)</th><th style={S.th}></th></tr></thead>
        <tbody>
          {sekce.map(s => (
            <tr key={s.id}>
              <td style={S.td}><input style={{ ...S.input, marginBottom: 0 }} placeholder="např. Materiál, Montáž, Doprava a revize..." value={s.nazev} onChange={e => update(s.id, "nazev", e.target.value)} /></td>
              <td style={S.td}><input type="number" style={{ ...S.input, marginBottom: 0, width: 130 }} value={s.castka} onChange={e => update(s.id, "castka", e.target.value)} /></td>
              <td style={S.td}><button onClick={() => remove(s.id)} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11 }}>✕</button></td>
            </tr>
          ))}
          {sekce.length === 0 && (
            <tr><td colSpan={3} style={{ ...S.td, color: "#64748b", padding: "12px 8px" }}>Zatím žádné sekce — přidej vlastní členění, které dává smysl u téhle zakázky.</td></tr>
          )}
        </tbody>
      </table>
      <button onClick={add} style={{ ...S.btnGhost, marginTop: 10, padding: "6px 14px", fontSize: 12 }}>+ Přidat sekci</button>
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

  const closeQuote = () => { setActiveId(null); setData(null); savedSnapshotRef.current = null; };

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

  const cilovaCenaZadana = data?.zakaznik?.cilovaCena;
  const cilovaCena = cilovaCenaZadana !== "" && cilovaCenaZadana != null ? Number(cilovaCenaZadana) : Math.round(celkemNaklad * 1.25);
  const marze = cilovaCena - celkemNaklad;
  const marzePct = cilovaCena ? Math.round((marze / cilovaCena) * 1000) / 10 : 0;

  const sekceSuma = data ? data.zakaznik.sekce.reduce((s, x) => s + (Number(x.castka) || 0), 0) : 0;
  const sekceRozdil = cilovaCena - sekceSuma;

  const planClovekDni = data ? data.denniPlan.reduce((s, p) => s + (Number(p.pocetLidi) || 0), 0) : 0;
  const planDniPocet = data ? data.denniPlan.length : 0;

  const save = async () => {
    if (!name.trim()) { alert("Zadejte název nabídky."); return; }
    setSaving(true);
    const row = {
      name: name.trim(),
      customer_id: customerId ? Number(customerId) : null,
      status,
      type: type || null,
      data,
      updated_at: new Date().toISOString(),
    };
    if (activeId) {
      const { error } = await supabase.from("quotes").update(row).eq("id", activeId);
      if (error) {
        alert("Nabídku se nepodařilo uložit: " + error.message);
        setSaving(false);
        return;
      }
      setQuotes(quotes.map(q => q.id === activeId ? { ...q, ...row } : q));
    } else {
      const { data: inserted, error } = await supabase.from("quotes").insert(row).select().single();
      if (error) {
        alert("Nabídku se nepodařilo uložit: " + error.message);
        setSaving(false);
        return;
      }
      if (inserted) { setQuotes([inserted, ...quotes]); setActiveId(inserted.id); }
    }
    setName(row.name);
    savedSnapshotRef.current = JSON.stringify({ name: row.name, customerId, status, type, data });
    setSaving(false);
  };

  const deleteQuote = async (id) => {
    if (!confirm("Smazat tuto nabídku?")) return;
    await supabase.from("quotes").delete().eq("id", id);
    setQuotes(quotes.filter(q => q.id !== id));
    if (activeId === id) closeQuote();
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
    const { data: inserted } = await supabase.from("quotes").insert(row).select().single();
    if (inserted) setQuotes([inserted, ...quotes]);
  };

  const convertToDeal = async () => {
    if (!activeId) { alert("Nejdřív nabídku uložte."); return; }
    if (!onConvertToDeal) return;
    setConverting(true);
    const cust = customers.find(c => c.id === Number(customerId));
    const { data: dealRow, error } = await supabase.from("deals").insert({
      name, value: Math.round(cilovaCena), stage: "Nový",
      customer_id: customerId ? Number(customerId) : null,
      assigned_to: currentUser?.name || "",
      type: type || null,
    }).select().single();
    if (error) {
      alert("Nabídku se nepodařilo převést na obchodní případ: " + error.message);
      setConverting(false);
      return;
    }
    if (dealRow) {
      const { error: updErr } = await supabase.from("quotes").update({ deal_id: dealRow.id, status: "Odesláno" }).eq("id", activeId);
      if (updErr) {
        alert("Obchodní případ vznikl, ale nabídku se nepodařilo označit jako odeslanou: " + updErr.message);
      } else {
        setQuotes(quotes.map(q => q.id === activeId ? { ...q, deal_id: dealRow.id, status: "Odesláno" } : q));
      }
      onConvertToDeal(dealRow, cust);
    }
    setConverting(false);
  };

  // Nabídka pro zákazníka — jen sekce a celková cena, žádný vnitřní rozpis.
  const printQuote = () => {
    const cust = customers.find(c => c.id === Number(customerId));
    const sekceHtml = data.zakaznik.sekce.length === 0 ? "" : `
      <table><thead><tr><th>Položka</th><th>Cena</th></tr></thead><tbody>
      ${data.zakaznik.sekce.map(s => `<tr><td>${s.nazev || "—"}</td><td>${fmtKc(s.castka)}</td></tr>`).join("")}
      </tbody></table>`;
    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Nabídka – " + name + "</title>" +
      "<style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:22px;margin-bottom:2px}h2{font-size:13px;color:#555;font-weight:normal;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-bottom:10px}th{background:#0E3B5E;color:#fff;padding:8px 12px;text-align:left;font-size:13px}td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}.total{font-size:20px;font-weight:bold;margin-top:18px;text-align:right}@media print{body{padding:16px}}</style>" +
      "</head><body>" +
      "<h1>Nabídka – " + name + "</h1>" +
      "<h2>" + (cust ? cust.name : "") + " · " + new Date().toLocaleDateString("cs-CZ") + "</h2>" +
      sekceHtml +
      "<div class='total'>Celková cena: " + fmtKc(cilovaCena) + "</div>" +
      (data.notes ? "<p style='margin-top:20px;white-space:pre-wrap;font-size:13px'>" + data.notes + "</p>" : "") +
      "<script>window.onload=function(){window.print();}</script></body></html>";
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  };

  // Interní přehled — MD rozpis, jen pro vlastní potřebu firmy (necháváme si to interně).
  const printInterni = () => {
    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Interní nacenění – " + name + "</title>" +
      "<style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:22px;margin-bottom:2px}h2{font-size:13px;color:#555;font-weight:normal;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-bottom:10px}th{background:#64748b;color:#fff;padding:6px 8px;text-align:left;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px}.total{font-size:16px;font-weight:bold;margin-top:16px;text-align:right}@media print{body{padding:16px}}</style>" +
      "</head><body>" +
      "<h1>Interní nacenění – " + name + "</h1>" +
      "<h2>Sazba: " + fmtKc(sazbaMd) + " / MD</h2>" +
      "<table><thead><tr><th>Popis</th><th>Doprava km/den</th><th>Počet dní</th><th>Počet lidí</th><th>Celkem MD</th><th>Materiál</th><th>Cena</th></tr></thead><tbody>" +
      radkyVypoctene.map(({ r, v }) => `<tr><td>${r.popis || "—"}</td><td>${r.dopravaKm || 0}</td><td>${v.dny}</td><td>${v.lide}</td><td>${Math.round(v.md * 100) / 100}</td><td>${fmtKc(v.material)}</td><td>${fmtKc(v.cena)}</td></tr>`).join("") +
      "</tbody></table>" +
      (polozkyVypoctene.length ? "<h2 style='margin-top:14px'>Samostatné položky</h2><table><thead><tr><th>Název</th><th>MD</th><th>Cena</th></tr></thead><tbody>" +
        polozkyVypoctene.map(({ p, md, cena }) => `<tr><td>${p.nazev || "—"}</td><td>${Math.round(md * 100) / 100}</td><td>${fmtKc(cena)}</td></tr>`).join("") +
        "</tbody></table>" : "") +
      "<div class='total'>Celkem MD: " + (Math.round(celkemMd * 100) / 100) + " · Celkem interní náklad: " + fmtKc(celkemNaklad) + " · Cílová cena: " + fmtKc(cilovaCena) + " · Marže: " + fmtKc(marze) + " (" + marzePct + " %)</div>" +
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
  const kpiHodnotaOtevrenych = kpiOtevreno.reduce((s, q) => s + computeQuoteTotals(q.data).cilovaCena, 0);

  // Historie samostatných položek napříč VŠEMI nabídkami (i mimo FVE) — pro
  // ceník/napovídání v PolozkyTabulka.
  const historickePolozky = quotes.flatMap(q => (q.data?.interni?.polozky || []).filter(p => p.nazev));

  // ─── SEZNAM NABÍDEK ──────────────────────────────────────────────────────
  if (!data) {
    return (
      <div style={S.app}>
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
            <div style={S.label}>Hodnota otevřené pipeline</div>
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
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{cust ? cust.name : "bez zákazníka"} · {fmtKc(computeQuoteTotals(q.data).cilovaCena)}</div>
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

      {/* FVE KALKULAČKA — u FVE i FVR (rozšíření stávající instalace), přesně podle Excelu */}
      {(type === "FVE" || type === "FVR") && (
        <FveCalculator
          value={data.fve || (type === "FVR" ? applyPreset(PRAZDNA_FVE(), "servis") : null)}
          onChange={(fve) => setData({ ...data, fve })}
          currentUser={currentUser}
          S={S}
          quoteName={name}
          customerName={customers.find((c) => c.id === Number(customerId))?.name}
          onUseAsTarget={(kc) => setData({ ...data, zakaznik: { ...data.zakaznik, cilovaCena: String(Math.round(kc)) } })}
        />
      )}

      {/* INTERNÍ NACENĚNÍ — po MD */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>🧮 Interní nacenění — po MD (člověko-dnech)</div>
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

      {/* ROZVRH PO DNECH — u FVR (rozšíření) skrytý, obvykle jde o jednodenní zásah */}
      {type !== "FVR" && (
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>📅 Rozvrh po dnech</div>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>Kolik lidí je potřeba který den — přenese se do projektu a zakázky jako plán, proti kterému appka srovná skutečnou docházku.</div>
          <DenniPlanTabulka plan={data.denniPlan} setPlan={plan => setData({ ...data, denniPlan: plan })} />
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <span style={{ color: "#475569" }}>Naplánováno: </span><b>{planDniPocet} dní, {planClovekDni} člověko-dní celkem</b>
            {celkemMd > 0 && (
              <span style={{ marginLeft: 10, color: Math.abs(planClovekDni - celkemMd) < 0.5 ? "#34d399" : "#f59e0b" }}>
                {Math.abs(planClovekDni - celkemMd) < 0.5 ? "✓ odpovídá nacenění" : `⚠️ nacenění počítá s ${Math.round(celkemMd * 100) / 100} MD — rozvrh ${Math.abs(planClovekDni - celkemMd) > 0 ? (planClovekDni > celkemMd ? "přesahuje" : "nepokrývá") : "sedí"} o ${Math.round(Math.abs(planClovekDni - celkemMd) * 100) / 100}`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* NABÍDKA PRO ZÁKAZNÍKA — po sekcích */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>📋 Nabídka pro zákazníka — po sekcích</div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>To, co uvidí zákazník: vlastní pojmenované sekce a jejich cena, bez vnitřního rozpisu hodin a nákladů.</div>
        <div style={{ maxWidth: 260, marginBottom: 14 }}>
          <label style={S.label}>Cílová prodejní cena celkem (Kč) <span style={{ textTransform: "none" }}>— prázdné = návrh {fmtKc(Math.round(celkemNaklad * 1.25))}</span></label>
          <input type="number" style={S.input} placeholder={String(Math.round(celkemNaklad * 1.25))} value={data.zakaznik.cilovaCena} onChange={e => setData({ ...data, zakaznik: { ...data.zakaznik, cilovaCena: e.target.value } })} />
        </div>
        <SekceTabulka sekce={data.zakaznik.sekce} setSekce={sekce => setData({ ...data, zakaznik: { ...data.zakaznik, sekce } })} />
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <span style={{ color: "#475569" }}>Součet sekcí: </span><b>{fmtKc(sekceSuma)}</b>
          <span style={{ marginLeft: 10, color: Math.abs(sekceRozdil) < 1 ? "#34d399" : "#f59e0b" }}>
            {Math.abs(sekceRozdil) < 1 ? "✓ sedí na cílovou cenu" : `⚠️ nerozděleno: ${fmtKc(sekceRozdil)}`}
          </span>
        </div>
      </div>

      <div style={S.card}>
        <label style={S.label}>Poznámka k nabídce</label>
        <textarea style={{ ...S.input, minHeight: 70, resize: "vertical" }} value={data.notes} onChange={e => setData({ ...data, notes: e.target.value })} />
      </div>

      <div style={{ ...S.card, background: "#f8fafc" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div><div style={S.label}>Celkem interní náklad</div><div style={{ fontSize: 20, fontWeight: 800, color: "#f87171" }}>{fmtKc(celkemNaklad)}</div></div>
          <div><div style={S.label}>Cílová cena</div><div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>{fmtKc(cilovaCena)}</div></div>
          <div><div style={S.label}>Marže</div><div style={{ fontSize: 20, fontWeight: 800, color: marze >= 0 ? "#34d399" : "#f87171" }}>{fmtKc(marze)}</div></div>
          <div><div style={S.label}>Marže %</div><div style={{ fontSize: 20, fontWeight: 800, color: marze >= 0 ? "#34d399" : "#f87171" }}>{marzePct} %</div></div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={S.btn("#34d399")} onClick={save} disabled={saving}>{saving ? "Ukládám…" : "💾 Uložit nabídku"}</button>
          <button style={S.btnGhost} onClick={printQuote}>🖨️ Nabídka pro zákazníka</button>
          <button style={S.btnGhost} onClick={printInterni}>📊 Interní přehled (MD)</button>
          {activeId && <button style={S.btn("#F5C518")} disabled={converting} onClick={convertToDeal}>{converting ? "Převádím…" : "➡️ Převést na obchodní případ"}</button>}
        </div>
      </div>
    </div>
  );
}
