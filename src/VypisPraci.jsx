// ─── Denní výpis prací u zakázky ────────────────────────────────────────────
// Po dnech: kdo, kdy (bloky), kolik hodin (po pauze), co se dělalo a jaký
// materiál se spotřeboval. Data z docházky (popis_prace) a attendance_materials.
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { efektivniHodinyZaznamu, hhmm, fmtH } from "./denniZapis.js";

const datumCz = (d) => new Date(d + "T00:00:00").toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", year: "numeric" });

export default function VypisPraci({ contractId, zaznamy, vsechnyZaznamy, employees }) {
  const [materialy, setMaterialy] = useState(null);

  const idsBloku = zaznamy.map((z) => z.id).filter((id) => typeof id === "number");
  const klic = idsBloku.join(",");
  useEffect(() => {
    let zruseno = false;
    const dotazy = [supabase.from("attendance_materials").select("*").eq("contract_id", contractId)];
    if (klic) dotazy.push(supabase.from("attendance_materials").select("*").in("attendance_id", klic.split(",").map(Number)).is("contract_id", null));
    Promise.all(dotazy).then((vys) => {
      if (zruseno) return;
      const vse = vys.flatMap((v) => v.data || []);
      setMaterialy([...new Map(vse.map((m) => [m.id, m])).values()]);
    });
    return () => { zruseno = true; };
  }, [contractId, klic]);

  const jmeno = (id) => employees.find((e) => String(e.id) === String(id))?.name || `#${id}`;
  const dny = [...new Set([...zaznamy.map((z) => z.date), ...(materialy || []).map((m) => m.date).filter(Boolean)])].sort((a, b) => b.localeCompare(a));
  const celkemH = zaznamy.reduce((s, z) => s + efektivniHodinyZaznamu(z, vsechnyZaznamy), 0);

  if (!dny.length) return <div style={{ color: "#64748b", fontSize: 14, padding: 16 }}>Zatím žádný zápis práce k této zakázce.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
      <div style={{ fontSize: 13, color: "#475569" }}>Celkem {fmtH(celkemH)} práce · {dny.length} {dny.length === 1 ? "den" : dny.length < 5 ? "dny" : "dnů"}{materialy?.length ? ` · ${materialy.length} řádků materiálu` : ""}</div>
      {dny.map((d) => {
        const bloky = zaznamy.filter((z) => z.date === d).sort((a, b) => String(a.checkin).localeCompare(String(b.checkin)));
        const mat = (materialy || []).filter((m) => m.date === d);
        const lide = [...new Set(bloky.map((b) => b.employee_id ?? b.employeeId).concat(mat.map((m) => m.employee_id)))];
        return (
          <div key={d} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>{datumCz(d)}</div>
            {lide.map((emp) => {
              const bl = bloky.filter((b) => String(b.employee_id ?? b.employeeId) === String(emp));
              const mt = mat.filter((m) => String(m.employee_id) === String(emp));
              const h = bl.reduce((s, b) => s + efektivniHodinyZaznamu(b, vsechnyZaznamy), 0);
              return (
                <div key={emp} style={{ borderTop: "1px solid #f1f5f9", padding: "6px 0", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <b>👷 {jmeno(emp)}</b>
                    <span style={{ color: "#475569" }}>
                      {bl.map((b) => `${hhmm(b.checkin)}–${b.checkout ? hhmm(b.checkout) : "…"}`).join(", ")}{bl.length ? ` · ${fmtH(h)}` : ""}
                      {bl.length > 0 && (bl.every((b) => b.schvaleno) ? <span style={{ color: "#15803d", fontWeight: 700 }}> · ✓ schváleno</span> : <span style={{ color: "#b45309", fontWeight: 700 }}> · čeká na schválení</span>)}
                    </span>
                  </div>
                  {bl.filter((b) => b.popis_prace || b.activity).map((b) => (
                    <div key={b.id} style={{ color: "#0f172a", marginTop: 3, whiteSpace: "pre-wrap" }}>📝 {b.popis_prace || b.activity}</div>
                  ))}
                  {mt.length > 0 && (
                    <div style={{ marginTop: 4, color: "#334155" }}>
                      🧰 {mt.map((m) => `${m.item_name} ${String(m.quantity).replace(".", ",")} ${m.unit || ""}${m.schvaleno ? "" : " (neschváleno)"}`).join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
