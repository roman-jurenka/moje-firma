import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import FveCalculator from "./FveCalculator.jsx";

const S = {
  app:      { fontFamily: "'DM Sans', sans-serif", background: "#080b12", minHeight: "100vh", color: "#e2e8f0", padding: "20px 28px" },
  card:     { background: "#0f1320", borderRadius: 12, padding: 22, border: "1px solid #1a2035", marginBottom: 16 },
  input:    { background: "#0a0d14", border: "1px solid #252d45", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" },
  select:   { background: "#0a0d14", border: "1px solid #252d45", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" },
  label:    { fontSize: 11, color: "#64748b", marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  btn:      (c = "#2E9BE0") => ({ background: c, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  btnGhost: { background: "transparent", color: "#2E9BE0", border: "1px solid #2E9BE0", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  th:       { textAlign: "left", padding: "7px 8px", fontSize: 11, color: "#64748b", borderBottom: "1px solid #1a2035", textTransform: "uppercase", letterSpacing: "0.05em" },
  td:       { padding: "5px 8px", fontSize: 13, color: "#e2e8f0" },
};

const fmtKc = (n) => (Number(n) || 0).toLocaleString("cs-CZ") + " Kč";
const uid = () => Date.now() + Math.random();
const RATE_PER_KM = 6.5; // Kč/km — stejný paušál jako v Knize jízd

// Stejné typy jako u poptávek/zakázek (App.jsx JOB_TYPES, Contracts.jsx
// TYPY_ZAKAZEK) — typ se řetězí celou cestou Nabídka → Poptávka → Zakázka.
const JOB_TYPES = [
  { id: "FVE", label: "FVE — Fotovoltaika" },
  { id: "HRM", label: "HRM — Hromosvody" },
  { id: "ELK", label: "ELK — Elektroinstalace" },
  { id: "SRV", label: "SRV — Servis" },
];

const PRAZDNA_NABIDKA = () => ({
  interni: {
    sazbaMd: 3200,   // Kč / MD (člověko-den) — jednotná sazba pro celou nabídku
    radky: [],       // [{id, popis, dopravaKm, materialKc, pocetMd, pocetLidi}]
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
const radekVypocet = (r, sazbaMd) => {
  const dny = Number(r.pocetMd) || 0;
  const lide = Number(r.pocetLidi) || 1;
  const md = dny * lide;
  const doprava = (Number(r.dopravaKm) || 0) * RATE_PER_KM * dny;
  const material = Number(r.materialKc) || 0;
  const laborKc = md * (Number(sazbaMd) || 0);
  const cena = laborKc + doprava + material;
  return { dny, lide, md, doprava, material, laborKc, cena };
};

// ─── Tabulka interního nacenění (MD) ────────────────────────────────────────
function InterniTabulka({ radky, setRadky, sazbaMd }) {
  const update = (id, key, value) => setRadky(radky.map(r => r.id === id ? { ...r, [key]: value } : r));
  const remove = (id) => setRadky(radky.filter(r => r.id !== id));
  const add = () => setRadky([...radky, { id: uid(), popis: "", dopravaKm: "", materialKc: "", pocetMd: "", pocetLidi: "" }]);

  const cols = [
    { key: "popis", label: "Popis (fáze / úkon)", width: "100%", type: "text" },
    { key: "dopravaKm", label: "Doprava (km / 1 den)", width: 110, type: "number" },
    { key: "pocetMd", label: "Počet MD (dní)", width: 100, type: "number" },
    { key: "pocetLidi", label: "Počet lidí", width: 90, type: "number" },
    { key: "materialKc", label: "Materiál (Kč, celkem)", width: 130, type: "number" },
  ];

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {cols.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}
            <th style={S.th}>Celkem MD</th>
            <th style={S.th}>Cena</th>
            <th style={S.th}></th>
          </tr>
        </thead>
        <tbody>
          {radky.map(r => {
            const v = radekVypocet(r, sazbaMd);
            return (
              <tr key={r.id}>
                {cols.map(c => (
                  <td key={c.key} style={S.td}>
                    <input type={c.type} style={{ ...S.input, marginBottom: 0, width: c.width }} value={r[c.key] ?? ""} onChange={e => update(r.id, c.key, e.target.value)} />
                  </td>
                ))}
                <td style={{ ...S.td, color: "#a78bfa", fontWeight: 700, whiteSpace: "nowrap" }}>{Math.round(v.md * 100) / 100}</td>
                <td style={{ ...S.td, color: "#f87171", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtKc(v.cena)}</td>
                <td style={S.td}><button onClick={() => remove(r.id)} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11 }}>✕</button></td>
              </tr>
            );
          })}
          {radky.length === 0 && (
            <tr><td colSpan={cols.length + 3} style={{ ...S.td, color: "#334155", padding: "12px 8px" }}>Zatím žádné řádky interního nacenění.</td></tr>
          )}
        </tbody>
      </table>
      <button onClick={add} style={{ ...S.btnGhost, marginTop: 10, padding: "6px 14px", fontSize: 12 }}>+ Přidat řádek</button>
    </div>
  );
}

// ─── Samostatné položky (revize, dokumentace, cokoli mimo fáze) ─────────────
function PolozkyTabulka({ polozky, setPolozky, sazbaMd }) {
  const update = (id, key, value) => setPolozky(polozky.map(p => p.id === id ? { ...p, [key]: value } : p));
  const remove = (id) => setPolozky(polozky.filter(p => p.id !== id));
  const add = () => setPolozky([...polozky, { id: uid(), nazev: "", md: "" }]);

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Samostatné položky (mimo fáze výše) — např. revize, dokumentace, zaškolení.</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={S.th}>Název položky</th><th style={S.th}>MD</th><th style={S.th}>Cena</th><th style={S.th}></th></tr></thead>
        <tbody>
          {polozky.map(p => {
            const md = Number(p.md) || 0;
            const cena = md * (Number(sazbaMd) || 0);
            return (
              <tr key={p.id}>
                <td style={S.td}><input style={{ ...S.input, marginBottom: 0 }} placeholder="např. Revize, Dokumentace..." value={p.nazev} onChange={e => update(p.id, "nazev", e.target.value)} /></td>
                <td style={S.td}><input type="number" style={{ ...S.input, marginBottom: 0, width: 90 }} value={p.md} onChange={e => update(p.id, "md", e.target.value)} /></td>
                <td style={{ ...S.td, color: "#f87171", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtKc(cena)}</td>
                <td style={S.td}><button onClick={() => remove(p.id)} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11 }}>✕</button></td>
              </tr>
            );
          })}
          {polozky.length === 0 && (
            <tr><td colSpan={4} style={{ ...S.td, color: "#334155", padding: "10px 8px" }}>Zatím žádné samostatné položky.</td></tr>
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
            <tr><td colSpan={3} style={{ ...S.td, color: "#334155", padding: "12px 8px" }}>Zatím žádné sekce — přidej vlastní členění, které dává smysl u téhle zakázky.</td></tr>
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
            <tr><td colSpan={4} style={{ ...S.td, color: "#334155", padding: "12px 8px" }}>Zatím žádné naplánované dny.</td></tr>
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
  const [typeFilter, setTypeFilter] = useState("vse");

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

  const openQuote = (q) => {
    setActiveId(q.id);
    setName(q.name);
    setCustomerId(q.customer_id ? String(q.customer_id) : "");
    setStatus(q.status || "Návrh");
    setType(q.type || "");
    setData(normalize(q.data));
  };

  const newQuote = () => {
    setActiveId(null);
    setName("");
    setCustomerId("");
    setStatus("Návrh");
    setType("");
    setData(PRAZDNA_NABIDKA());
  };

  const closeQuote = () => { setActiveId(null); setData(null); };

  // ── Výpočty ──
  const sazbaMd = data?.interni?.sazbaMd || 0;
  const radkyVypoctene = data ? data.interni.radky.map(r => ({ r, v: radekVypocet(r, sazbaMd) })) : [];
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
      await supabase.from("quotes").update(row).eq("id", activeId);
      setQuotes(quotes.map(q => q.id === activeId ? { ...q, ...row } : q));
    } else {
      const { data: inserted } = await supabase.from("quotes").insert(row).select().single();
      if (inserted) { setQuotes([inserted, ...quotes]); setActiveId(inserted.id); }
    }
    setSaving(false);
  };

  const deleteQuote = async (id) => {
    if (!confirm("Smazat tuto nabídku?")) return;
    await supabase.from("quotes").delete().eq("id", id);
    setQuotes(quotes.filter(q => q.id !== id));
    if (activeId === id) closeQuote();
  };

  const convertToDeal = async () => {
    if (!activeId) { alert("Nejdřív nabídku uložte."); return; }
    if (!onConvertToDeal) return;
    const cust = customers.find(c => c.id === Number(customerId));
    const { data: dealRow } = await supabase.from("deals").insert({
      name, value: Math.round(cilovaCena), stage: "Nový",
      customer_id: customerId ? Number(customerId) : null,
      assigned_to: currentUser?.name || "",
      type: type || null,
    }).select().single();
    if (dealRow) {
      await supabase.from("quotes").update({ deal_id: dealRow.id, status: "Odesláno" }).eq("id", activeId);
      setQuotes(quotes.map(q => q.id === activeId ? { ...q, deal_id: dealRow.id, status: "Odesláno" } : q));
      onConvertToDeal(dealRow, cust);
    }
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
      "<style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:22px;margin-bottom:2px}h2{font-size:13px;color:#555;font-weight:normal;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-bottom:10px}th{background:#334155;color:#fff;padding:6px 8px;text-align:left;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px}.total{font-size:16px;font-weight:bold;margin-top:16px;text-align:right}@media print{body{padding:16px}}</style>" +
      "</head><body>" +
      "<h1>Interní nacenění – " + name + "</h1>" +
      "<h2>Sazba: " + fmtKc(sazbaMd) + " / MD</h2>" +
      "<table><thead><tr><th>Popis</th><th>Doprava km/den</th><th>Počet dní</th><th>Počet lidí</th><th>Celkem MD</th><th>Materiál</th><th>Cena</th></tr></thead><tbody>" +
      radkyVypoctene.map(({ r, v }) => `<tr><td>${r.popis || "—"}</td><td>${r.dopravaKm || 0}</td><td>${v.dny}</td><td>${v.lide}</td><td>${Math.round(v.md * 100) / 100}</td><td>${fmtKc(r.materialKc)}</td><td>${fmtKc(v.cena)}</td></tr>`).join("") +
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
    .filter(q => typeFilter === "vse" || q.type === typeFilter || (typeFilter === "bez" && !q.type));

  const typeBadgeColor = (id) => ({ FVE: "#f59e0b", HRM: "#a78bfa", ELK: "#2E9BE0", SRV: "#34d399" }[id] || "#64748b");

  // ─── SEZNAM NABÍDEK ──────────────────────────────────────────────────────
  if (!data) {
    return (
      <div style={S.app}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0 }}>💰 Nacenění</h1>
          <button style={S.btn()} onClick={newQuote}>+ Nová nabídka</button>
        </div>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 18 }}>Interní nacenění po MD (člověko-dnech) + rozvrh po dnech + volné sekce pro zákazníka. Následně překlop na obchodní případ.</p>
        <input style={{ ...S.input, marginBottom: 16, maxWidth: 340 }} placeholder="Hledat nabídku..." value={search} onChange={e => setSearch(e.target.value)} />

        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {[["vse", "Vše"], ...JOB_TYPES.map(t => [t.id, t.label]), ["bez", "Bez typu"]].map(([k, l]) => (
            <button key={k} onClick={() => setTypeFilter(k)}
              style={{
                background: typeFilter === k ? "#2E9BE0" : "#0f1320", color: typeFilter === k ? "#fff" : "#94a3b8",
                border: "1px solid " + (typeFilter === k ? "#2E9BE0" : "#252d45"), borderRadius: 8,
                padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && <div style={{ color: "#334155", fontSize: 13 }}>Zatím žádné nabídky.</div>}
          {filtered.map(q => {
            const cust = customers.find(c => c.id === q.customer_id);
            return (
              <div key={q.id} onClick={() => openQuote(q)}
                style={{ ...S.card, marginBottom: 0, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{q.name}</div>
                    {q.type && (
                      <span style={{ background: typeBadgeColor(q.type) + "22", color: typeBadgeColor(q.type), border: "1px solid " + typeBadgeColor(q.type), borderRadius: 6, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>
                        {q.type}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{cust ? cust.name : "bez zákazníka"} · {q.status}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteQuote(q.id); }} style={{ ...S.btn("#ef4444"), padding: "5px 12px", fontSize: 11 }}>✕</button>
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
      <button onClick={closeQuote} style={{ ...S.btnGhost, padding: "6px 14px", marginBottom: 14 }}>← Zpět na seznam</button>

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

      {/* FVE KALKULAČKA — jen u typu FVE, přesně podle Excelu */}
      {type === "FVE" && (
        <FveCalculator
          value={data.fve}
          onChange={(fve) => setData({ ...data, fve })}
          currentUser={currentUser}
          S={S}
          onUseAsTarget={(kc) => setData({ ...data, zakaznik: { ...data.zakaznik, cilovaCena: String(Math.round(kc)) } })}
        />
      )}

      {/* INTERNÍ NACENĚNÍ — po MD */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}>🧮 Interní nacenění — po MD (člověko-dnech)</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>Počet MD (dní) a počet lidí se u každého řádku píší ručně — appka je vynásobí (2 dny × 3 lidi = 6 MD) a tím se počítá práce (MD × sazba). Doprava se násobí jen počtem dní (stejná cesta bez ohledu na počet lidí). Materiál se nenásobí vůbec — je to vždy celková částka za řádek. Jen pro vnitřní potřebu — zákazník tohle nevidí.</div>
        <div style={{ maxWidth: 200, marginBottom: 14 }}>
          <label style={S.label}>Sazba (Kč / MD)</label><input type="number" style={S.input} value={data.interni.sazbaMd} onChange={e => setData({ ...data, interni: { ...data.interni, sazbaMd: e.target.value } })} />
        </div>
        <InterniTabulka
          radky={data.interni.radky}
          setRadky={radky => setData({ ...data, interni: { ...data.interni, radky } })}
          sazbaMd={sazbaMd}
        />
        <PolozkyTabulka
          polozky={data.interni.polozky}
          setPolozky={polozky => setData({ ...data, interni: { ...data.interni, polozky } })}
          sazbaMd={sazbaMd}
        />
        <div style={{ marginTop: 14, display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
          <div><span style={{ color: "#64748b" }}>Celkem MD: </span><b style={{ color: "#a78bfa" }}>{Math.round(celkemMd * 100) / 100}</b></div>
          <div><span style={{ color: "#64748b" }}>Doprava: </span><b>{fmtKc(celkemDoprava)}</b></div>
          <div><span style={{ color: "#64748b" }}>Práce + položky: </span><b>{fmtKc(celkemPrace)}</b></div>
          <div><span style={{ color: "#64748b" }}>Materiál: </span><b>{fmtKc(celkemMaterial)}</b></div>
          <div><span style={{ color: "#64748b" }}>Celkem interní náklad: </span><b style={{ color: "#f87171" }}>{fmtKc(celkemNaklad)}</b></div>
        </div>
      </div>

      {/* ROZVRH PO DNECH */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}>📅 Rozvrh po dnech</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>Kolik lidí je potřeba který den — přenese se do projektu a zakázky jako plán, proti kterému appka srovná skutečnou docházku.</div>
        <DenniPlanTabulka plan={data.denniPlan} setPlan={plan => setData({ ...data, denniPlan: plan })} />
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <span style={{ color: "#64748b" }}>Naplánováno: </span><b>{planDniPocet} dní, {planClovekDni} člověko-dní celkem</b>
          {celkemMd > 0 && (
            <span style={{ marginLeft: 10, color: Math.abs(planClovekDni - celkemMd) < 0.5 ? "#34d399" : "#f59e0b" }}>
              {Math.abs(planClovekDni - celkemMd) < 0.5 ? "✓ odpovídá nacenění" : `⚠️ nacenění počítá s ${Math.round(celkemMd * 100) / 100} MD — rozvrh ${Math.abs(planClovekDni - celkemMd) > 0 ? (planClovekDni > celkemMd ? "přesahuje" : "nepokrývá") : "sedí"} o ${Math.round(Math.abs(planClovekDni - celkemMd) * 100) / 100}`}
            </span>
          )}
        </div>
      </div>

      {/* NABÍDKA PRO ZÁKAZNÍKA — po sekcích */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}>📋 Nabídka pro zákazníka — po sekcích</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>To, co uvidí zákazník: vlastní pojmenované sekce a jejich cena, bez vnitřního rozpisu hodin a nákladů.</div>
        <div style={{ maxWidth: 260, marginBottom: 14 }}>
          <label style={S.label}>Cílová prodejní cena celkem (Kč) <span style={{ textTransform: "none" }}>— prázdné = návrh {fmtKc(Math.round(celkemNaklad * 1.25))}</span></label>
          <input type="number" style={S.input} placeholder={String(Math.round(celkemNaklad * 1.25))} value={data.zakaznik.cilovaCena} onChange={e => setData({ ...data, zakaznik: { ...data.zakaznik, cilovaCena: e.target.value } })} />
        </div>
        <SekceTabulka sekce={data.zakaznik.sekce} setSekce={sekce => setData({ ...data, zakaznik: { ...data.zakaznik, sekce } })} />
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <span style={{ color: "#64748b" }}>Součet sekcí: </span><b>{fmtKc(sekceSuma)}</b>
          <span style={{ marginLeft: 10, color: Math.abs(sekceRozdil) < 1 ? "#34d399" : "#f59e0b" }}>
            {Math.abs(sekceRozdil) < 1 ? "✓ sedí na cílovou cenu" : `⚠️ nerozděleno: ${fmtKc(sekceRozdil)}`}
          </span>
        </div>
      </div>

      <div style={S.card}>
        <label style={S.label}>Poznámka k nabídce</label>
        <textarea style={{ ...S.input, minHeight: 70, resize: "vertical" }} value={data.notes} onChange={e => setData({ ...data, notes: e.target.value })} />
      </div>

      <div style={{ ...S.card, background: "#0a0d14" }}>
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
          {activeId && <button style={S.btn("#F5C518")} onClick={convertToDeal}>➡️ Převést na obchodní případ</button>}
        </div>
      </div>
    </div>
  );
}
