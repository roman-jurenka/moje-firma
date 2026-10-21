// ─── Stav zakázky po odděleních (detail zakázky v Průběhu) ───────────────────
// Tři dráhy pod sebou — obchod, kancelář, realizace — každá s fázemi, ve které
// právě je, termínem a člověkem. Kliknutím na dráhu se úkoly, průvodce
// a tlačítko „Hotovo →“ přepnou na dané oddělení.
import { fazeById, nazevFaze, fazeKRozhodnuti } from "./prubehFaze.js";
import { ODDELENI, fazeOddeleni, stavFazeOdd, aktivni, CEKA, HOTOVO } from "./oddeleniZakazky.js";

const dnyOd = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);
const dny = (n) => `${n} ${n === 1 ? "den" : n >= 2 && n <= 4 ? "dny" : "dní"}`;
const fmtDatum = (iso) => { if (!iso) return ""; const [r, m, d] = String(iso).slice(0, 10).split("-").map(Number); return `${d}. ${m}.${r !== new Date().getFullYear() ? " " + r : ""}`; };
const inp = { boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "4px 6px", fontSize: 13, fontFamily: "inherit", color: "#0f172a", background: "#fff" };

export default function StavZakazkyGraf({ z, st, vybrane, dnes, lide = [], otevrena, onVybrat, onUlozitOdd }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>Stav zakázky po odděleních</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>Kancelář a realizace běží souběžně — klikni na oddělení, na kterém chceš pracovat</span>
      </div>
      {ODDELENI.map((o) => {
        const t = st[o.id] || {};
        const ted = aktivni(t);
        const vybrano = ted && vybrane === o.id;
        const po = ted && t.termin && t.termin < dnes;
        const stav = t.faze === HOTOVO ? "✓ hotovo"
          : t.faze === CEKA ? (o.id === "bo" && st.ob?.faze === HOTOVO ? "⏸ příprava hotová · čeká na dokončení realizace" : "⏸ čeká na podpis smlouvy")
            : `● ${nazevFaze(fazeById[t.faze], z.typ)} · ${dny(dnyOd(t.od))}`;
        const fz = fazeOddeleni(z, o.id);
        return (
          <div key={o.id} role={ted && !vybrano ? "button" : undefined} tabIndex={ted && !vybrano ? 0 : undefined}
            onClick={() => { if (ted && !vybrano) onVybrat?.(o.id); }}
            onKeyDown={(e) => { if (ted && !vybrano && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onVybrat?.(o.id); } }}
            aria-pressed={ted ? vybrano : undefined}
            style={{ display: "grid", gridTemplateColumns: "minmax(170px, 230px) minmax(0, 1fr)", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 12,
              border: `2px solid ${vybrano ? o.barva : po ? "#fca5a5" : "#f1f5f9"}`, background: vybrano ? o.svetla : t.faze === HOTOVO ? "#f8fafc" : "#fff", cursor: ted && !vybrano ? "pointer" : "default" }}
            className="pr-drahy">
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: o.barva, flexShrink: 0 }} />
                <b style={{ color: o.tmava }}>{o.nazev}</b>
                {vybrano && <span style={{ fontSize: 11, fontWeight: 700, color: o.tmava }}>· pracuješ tady</span>}
              </div>
              <div style={{ fontSize: 13, color: t.faze === HOTOVO ? "#15803d" : "#334155", fontWeight: ted ? 700 : 500 }}>{stav}</div>
              {ted && o.id !== "ob" && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <input type="date" aria-label={`Termín — ${o.nazev}`} style={{ ...inp, width: 128, borderColor: po ? "#f87171" : "#cbd5e1", color: po ? "#b91c1c" : "#0f172a" }}
                    value={t.termin || ""} disabled={!otevrena} onChange={(e) => onUlozitOdd?.(o.id, { termin: e.target.value || null })} />
                  <select aria-label={`Kdo — ${o.nazev}`} style={{ ...inp, maxWidth: 120 }} value={t.kdo || ""} disabled={!otevrena}
                    onChange={(e) => onUlozitOdd?.(o.id, { kdo: e.target.value || null })}>
                    <option value="">— kdo —</option>{lide.map((j) => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
              )}
              {ted && o.id === "ob" && (z.dalsi_krok_termin || z.dalsi_krok_kdo) && (
                <div style={{ fontSize: 12, color: po ? "#b91c1c" : "#64748b" }}>{[z.dalsi_krok_kdo, z.dalsi_krok_termin ? `do ${fmtDatum(z.dalsi_krok_termin)}` : null].filter(Boolean).join(" · ")}</div>
              )}
              {po && <div style={{ fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>po termínu {dny(dnyOd(t.termin))}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", paddingBottom: 2 }}>
              {fz.map((f, i) => {
                const pres = (z.preskocene || []).includes(f.id);
                const s = pres ? "preskoceno" : stavFazeOdd(st, f);
                const mozna = s === "ceka" && fazeKRozhodnuti(f, z);
                const kruh = s === "hotovo" ? { background: "#16a34a", color: "#fff", border: "2px solid #16a34a" }
                  : s === "ted" ? { background: o.barva, color: "#fff", border: `2px solid ${o.barva}`, boxShadow: `0 0 0 3px ${o.svetla}` }
                    : s === "preskoceno" || mozna ? { background: "#fff", color: "#94a3b8", border: "2px dashed #cbd5e1" }
                      : { background: "#fff", color: "#94a3b8", border: "2px solid #e2e8f0" };
                return (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
                    {i > 0 && <div aria-hidden="true" style={{ width: 14, height: 3, background: s === "hotovo" || s === "ted" ? "#86efac" : "#e2e8f0" }} />}
                    <div title={`${nazevFaze(f, z.typ)}${s === "ted" ? " — teď" : s === "hotovo" ? " — hotovo" : pres ? " — přeskočeno" : mozna ? " — možná (rozhodne se)" : ""}`}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 68 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, ...kruh }}>
                        {s === "hotovo" ? "✓" : s === "preskoceno" ? "⏭" : i + 1}
                      </div>
                      <div style={{ fontSize: 11, lineHeight: 1.15, textAlign: "center", maxWidth: 84, fontWeight: s === "ted" ? 800 : 500,
                        color: s === "ted" ? o.tmava : s === "hotovo" ? "#166534" : "#94a3b8", textDecoration: pres ? "line-through" : "none" }}>
                        {nazevFaze(f, z.typ)}{mozna ? " ?" : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
