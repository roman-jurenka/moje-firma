// ─── Nástěnka oddělení (Průběh → záložky Obchod / Back office / Realizace) ───
// Otevřené zakázky jednoho oddělení (jenOdd) nebo všech: řádky podle fází
// (pod sebou), v nich zakázky vedle sebe jako jednořádkové štítky (kdo je na
// tahu, kolik dní ve fázi, termín, kdo). Zakázka za obchodem je v back office
// i v realizaci zároveň — každé oddělení ji vidí ve své fázi. Back office má
// zvlášť přípravu a uzavření. Klik na kartu otevře zakázku.
import { useState } from "react";
import { FAZE, fazeById, nazevFaze, naTahuMy, naTahuKratky, nazevDuvodu } from "./prubehFaze.js";
import { ODDELENI, stavOddeleni, soubezne, aktivni, oddFaze, CEKA } from "./oddeleniZakazky.js";

const dnyOd = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);
const fmtDatum = (iso) => { if (!iso) return ""; const [, m, d] = String(iso).slice(0, 10).split("-").map(Number); return `${d}. ${m}.`; };
const inicialy = (jmeno) => String(jmeno || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const TYP_BARVY = { FVE: ["#fef3c7", "#92400e"], FVR: ["#ffedd5", "#9a3412"], FVO: ["#fef9c3", "#854d0e"], REA: ["#f1f5f9", "#334155"], SRV: ["#dcfce7", "#166534"], HRM: ["#ede9fe", "#5b21b6"], ELK: ["#e0f2fe", "#075985"] };

// Kde je zakázka v daném oddělení: { sloupec, od, termin, kdo } nebo null.
function poloha(z, odd, st) {
  if (odd === "ob") return soubezne(z) ? null : { sloupec: z.faze, od: z.faze_od, termin: z.dalsi_krok_termin, kdo: z.dalsi_krok_kdo || z.vlastnik_obchod };
  if (!soubezne(z)) return null;
  const t = st[odd];
  if (aktivni(t)) return { sloupec: t.faze, od: t.od, termin: t.termin, kdo: t.kdo || z[odd === "bo" ? "vlastnik_bo" : "vlastnik_re"] };
  if (odd === "bo" && t?.faze === CEKA) return { sloupec: CEKA, od: t.od, termin: null, kdo: t.kdo || z.vlastnik_bo };
  return null;
}

// jenOdd = jen jedno oddělení (bez sbalování); filtrKarty(z) = rychlý filtr z Průběhu.
export default function TabuleOddeleni({ rows = [], zakaznik, kodZakazky, dnes, ja, onOtevrit, jenOdd = null, filtrKarty = null }) {
  const [jenMoje, setJenMoje] = useState(false);
  const [skryte, setSkryte] = useState({});
  const [skrytPrazdne, setSkrytPrazdne] = useState(false);
  const otevrene = rows.filter((z) => z.stav === "otevrena" && (!filtrKarty || filtrKarty(z)));
  const stavy = Object.fromEntries(otevrene.map((z) => [z.id, stavOddeleni(z)]));
  const oddeleni = jenOdd ? ODDELENI.filter((o) => o.id === jenOdd) : ODDELENI;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 14, color: "#334155" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={jenMoje} onChange={(e) => setJenMoje(e.target.checked)} /> Jen moje
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={skrytPrazdne} onChange={(e) => setSkrytPrazdne(e.target.checked)} /> Skrýt prázdné fáze
        </label>
        {jenOdd !== "ob" && <span style={{ fontSize: 13, color: "#64748b" }}>Po podpisu smlouvy je zakázka v back office i v realizaci zároveň — každé oddělení ji vidí ve své fázi.</span>}
      </div>
      {oddeleni.map((o) => {
        // Back office: příprava → čekání na realizaci → uzavření (s nadpisy).
        const sloupec = (f) => ({ id: f.id, nazev: f.nazev, faze: f });
        const fazeOdd = FAZE.filter((f) => oddFaze(f) === o.id);
        const sloupce = o.id === "bo"
          ? [...fazeOdd.filter((f) => f.sekce !== "uz").map(sloupec), { id: CEKA, nazev: "Čeká na dokončení realizace" }, ...fazeOdd.filter((f) => f.sekce === "uz").map(sloupec)]
          : fazeOdd.map(sloupec);
        const prvniUz = fazeOdd.find((f) => f.sekce === "uz")?.id;
        const nadpisPred = o.id === "bo" ? { [sloupce[0]?.id]: "Příprava · souběžně s realizací", [prvniUz]: "Uzavření · po předání díla" } : {};
        const karty = otevrene.map((z) => ({ z, p: poloha(z, o.id, stavy[z.id]) })).filter(({ z, p }) => p && (!jenMoje || p.kdo === ja || z.dalsi_krok_kdo === ja));
        const poTerminu = karty.filter(({ p }) => p.termin && p.termin < dnes).length;
        const zabaleno = !jenOdd && !!skryte[o.id];
        return (
          <section key={o.id} aria-label={o.nazev} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
            <button type="button" disabled={!!jenOdd} onClick={() => setSkryte((s) => ({ ...s, [o.id]: !s[o.id] }))} aria-expanded={!zabaleno}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: o.svetla, border: "none", borderBottom: zabaleno ? "none" : `1px solid ${o.barva}33`, cursor: jenOdd ? "default" : "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: o.barva }} />
              <b style={{ fontSize: 17, color: o.tmava }}>{o.nazev}</b>
              <span style={{ fontSize: 14, color: "#334155" }}>{karty.length} {karty.length === 1 ? "zakázka" : karty.length >= 2 && karty.length <= 4 ? "zakázky" : "zakázek"}</span>
              {poTerminu > 0 && <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 999, padding: "2px 9px", fontSize: 12, fontWeight: 700 }}>{poTerminu} po termínu</span>}
              {!jenOdd && <span style={{ marginLeft: "auto", fontSize: 13, color: o.tmava }}>{zabaleno ? "▸ rozbalit" : "▾ sbalit"}</span>}
            </button>
            {!zabaleno && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {sloupce.map((s) => {
                  const vSloupci = karty.filter(({ p }) => p.sloupec === s.id)
                    .sort((a, b) => String(a.p.termin || "9999").localeCompare(String(b.p.termin || "9999")));
                  const nadpis = nadpisPred[s.id];
                  if (skrytPrazdne && vSloupci.length === 0) return nadpis ? <div key={s.id} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 800, color: o.tmava, background: o.svetla, borderTop: "1px solid #eef2f6" }}>{nadpis}</div> : null;
                  return (
                    <div key={s.id}>
                      {nadpis && <div style={{ padding: "6px 12px", fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: o.tmava, background: o.svetla, borderTop: "1px solid #eef2f6" }}>{nadpis}</div>}
                      <div className="tab-radek" style={{ display: "grid", gridTemplateColumns: "170px minmax(0, 1fr)", borderTop: "1px solid #eef2f6", minHeight: 42 }}>
                        <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, background: "#f8fafc", borderRight: "1px solid #eef2f6" }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: s.id === CEKA ? "#64748b" : "#0f172a" }}>{s.id === CEKA ? "⏸ " : ""}{s.nazev}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: vSloupci.length ? o.tmava : "#94a3b8" }}>{vSloupci.length}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 10px", alignItems: "center", minWidth: 0 }}>
                          {vSloupci.length === 0 && <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span>}
                          {vSloupci.map(({ z, p }) => {
                            const po = p.termin && p.termin < dnes;
                            const dlouho = s.faze && dnyOd(p.od) > (fazeById[s.id]?.dny || 999);
                            const tb = TYP_BARVY[z.typ] || ["#f1f5f9", "#334155"];
                            const my = naTahuMy(z);
                            return (
                              <button key={z.id} type="button" onClick={() => onOtevrit?.(z.id, o.id)}
                                title={`${z.nazev} — otevřít zakázku${s.faze ? ` (${nazevFaze(s.faze, z.typ)})` : ""}${my ? "" : ` · ${nazevDuvodu(z.duvod_cekani)}`}`}
                                style={{ textAlign: "left", background: po ? "#fef2f2" : "#fff", border: `1px solid ${po ? "#fca5a5" : "#e2e8f0"}`, borderLeft: `4px solid ${po ? "#dc2626" : o.barva}`, borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 7, maxWidth: "100%", minWidth: 0 }}>
                                {s.id !== CEKA && <span style={{ flexShrink: 0, borderRadius: 5, padding: "0 6px", fontSize: 11, fontWeight: 800, background: my ? "#dbeafe" : "#fef3c7", color: my ? "#1e40af" : "#78350f" }}>{naTahuKratky(z)}</span>}
                                <span style={{ fontWeight: 800, fontSize: 13, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{z.nazev}</span>
                                {(kodZakazky?.(z) || zakaznik?.(z.customer_id)?.name) && <span style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{[kodZakazky?.(z), zakaznik?.(z.customer_id)?.name].filter(Boolean).join(" · ")}</span>}
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, whiteSpace: "nowrap" }}>
                                  {z.typ ? <span style={{ background: tb[0], color: tb[1], borderRadius: 5, padding: "0 5px", fontWeight: 700 }}>{z.typ}</span> : <span style={{ color: "#b45309", fontWeight: 700 }}>⚠ typ</span>}
                                  <span style={{ color: dlouho ? "#c2410c" : "#64748b", fontWeight: dlouho ? 700 : 400 }}>{dnyOd(p.od)} d</span>
                                  {p.termin ? <span style={{ color: po ? "#b91c1c" : "#475569", fontWeight: po ? 800 : 500 }}>{po ? "⚠ " : ""}do {fmtDatum(p.termin)}</span>
                                    : s.id !== CEKA && <span style={{ color: "#b45309", fontWeight: 700 }}>bez termínu</span>}
                                  {p.kdo && <span title={p.kdo} style={{ width: 20, height: 20, borderRadius: "50%", background: o.svetla, color: o.tmava, fontWeight: 800, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{inicialy(p.kdo)}</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
