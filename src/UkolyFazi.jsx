// ─── Úkoly fází z Průběhu, kde jsem na řadě ──────────────────────────────────
// Jeden pohled „Moje úkoly“: vedle úkolů z modulu Úkoly (tabulka tasks, sem
// patří i úkoly k zakázce) ukáže nehotové úkoly fáze u zakázek, kde je
// přihlášený odpovědný za fázi svého oddělení (obchod / kancelář / realizace).
// Klik otevře zakázku v Průběhu, kde se úkol odškrtne (často s formulářem).
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { NASTAVENI_KEY, fazeById, nazevFaze, pouzijNastaveni, ukolHotovy, ukolyPro } from "./prubehFaze.js";
import { ODDELENI, aktivni, soubezne, stavOddeleni } from "./oddeleniZakazky.js";

const dnyOd = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);
const fmtDatum = (iso) => { if (!iso) return ""; const [, m, d] = String(iso).slice(0, 10).split("-").map(Number); return `${d}. ${m}.`; };

export default function UkolyFazi({ ja, onOtevrit, kompakt = false }) {
  const [zakazky, setZakazky] = useState(null);
  const [rozbaleno, setRozbaleno] = useState(!kompakt);

  useEffect(() => {
    let zruseno = false;
    Promise.all([
      supabase.from("app_settings").select("value").eq("key", NASTAVENI_KEY).maybeSingle(),
      supabase.from("zakazky_prubeh").select("*").eq("stav", "otevrena"),
    ]).then(([nast, z]) => {
      if (zruseno) return;
      pouzijNastaveni(nast.data?.value || null);
      setZakazky(z.data || []);
    });
    return () => { zruseno = true; };
  }, []);

  if (!ja || !zakazky) return null;
  const dnes = new Date().toLocaleDateString("sv-SE");
  const moje = [];
  for (const z of zakazky) {
    const st = stavOddeleni(z);
    for (const odd of ODDELENI) {
      if (odd.id === "ob" && soubezne(z)) continue;
      const t = st[odd.id];
      if (!aktivni(t)) continue;
      const kdo = odd.id === "ob" ? (z.dalsi_krok_kdo || z.vlastnik_obchod) : (t.kdo || z[odd.vlastnik]);
      if (kdo !== ja) continue;
      const f = fazeById[t.faze];
      if (!f) continue;
      // automaticky splnitelné úkoly (faktura zaplacená apod.) tady neukazujeme — stav zná jen Průběh
      const ukoly = ukolyPro(f, z).filter((u) => !u.auto && !ukolHotovy(z, f, u));
      moje.push({ z, odd, f, ukoly, termin: t.termin || (odd.id === "ob" ? z.dalsi_krok_termin : null), od: t.od || z.faze_od });
    }
  }
  moje.sort((a, b) => String(a.termin || "9999").localeCompare(String(b.termin || "9999")) || dnyOd(b.od) - dnyOd(a.od));
  const pocet = moje.reduce((s, m) => s + m.ukoly.length, 0);
  if (!moje.length) return kompakt ? null : (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#64748b" }}>📋 V Průběhu teď nejsi na řadě u žádné zakázky.</div>
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: kompakt ? 0 : 16, overflow: "hidden", textAlign: "left" }}>
      <button type="button" onClick={() => setRozbaleno((x) => !x)} aria-expanded={rozbaleno}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "#f8fafc", border: "none", borderBottom: rozbaleno ? "1px solid #e2e8f0" : "none", padding: "10px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>📋 Na řadě v Průběhu</span>
        <span style={{ fontSize: 12, color: "#475569" }}>{moje.length} {moje.length === 1 ? "zakázka" : moje.length < 5 ? "zakázky" : "zakázek"} · {pocet} {pocet === 1 ? "úkol" : pocet < 5 ? "úkoly" : "úkolů"} {rozbaleno ? "▲" : "▼"}</span>
      </button>
      {rozbaleno && moje.map(({ z, odd, f, ukoly, termin, od }) => {
        const poTerminu = termin && termin < dnes;
        return (
          <div key={`${z.id}-${odd.id}`} role="button" tabIndex={0} onClick={() => onOtevrit?.(z.id)} onKeyDown={(e) => { if (e.key === "Enter") onOtevrit?.(z.id); }}
            style={{ padding: "9px 14px", borderTop: "1px solid #f1f5f9", cursor: onOtevrit ? "pointer" : "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>
                <span style={{ background: odd.svetla, color: odd.tmava, borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 800, marginRight: 6 }}>{odd.nazev}</span>
                {z.nazev}
              </span>
              <span style={{ fontSize: 12, color: poTerminu ? "#b91c1c" : "#64748b", fontWeight: poTerminu ? 700 : 400 }}>
                {nazevFaze(f, z.typ)} · {dnyOd(od)} d{termin ? ` · termín ${fmtDatum(termin)}${poTerminu ? " ⚠" : ""}` : ""}
              </span>
            </div>
            {ukoly.length > 0 ? (
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13, color: "#334155" }}>
                {ukoly.slice(0, kompakt ? 2 : 6).map((u) => <li key={u.id}>{u.text}</li>)}
                {ukoly.length > (kompakt ? 2 : 6) && <li style={{ color: "#64748b", listStyle: "none" }}>… a další {ukoly.length - (kompakt ? 2 : 6)}</li>}
              </ul>
            ) : <div style={{ fontSize: 12, color: "#15803d", marginTop: 3 }}>✓ úkoly fáze hotové — posuň zakázku dál</div>}
          </div>
        );
      })}
    </div>
  );
}
