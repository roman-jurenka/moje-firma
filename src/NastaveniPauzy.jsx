// ─── HR → zaměstnanec: neodečítat 1 h pauzy od data (jen administrátor) ─────
// Datum může být i zpětně: databáze (nastav_bez_pauzy) pak přepočítá náklady
// práce na zakázkách u dnů od toho data. Vyfakturované náklady nemění.
import { useState } from "react";
import { supabase } from "./supabase.js";

const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("cs-CZ") : "");

export default function NastaveniPauzy({ emp, onUlozeno }) {
  const [zap, setZap] = useState(!!emp.bez_pauzy);
  const [od, setOd] = useState(emp.bez_pauzy_od || "");
  const [pracuji, setPracuji] = useState(false);
  const [zprava, setZprava] = useState(null);
  const zmeneno = zap !== !!emp.bez_pauzy || (zap && (od || "") !== (emp.bez_pauzy_od || ""));

  const ulozit = async () => {
    const dnes = new Date().toLocaleDateString("sv-SE");
    if (zap && od && od < dnes && !window.confirm(`Datum ${fmt(od)} je zpětně. Náklady práce na zakázkách se od tohoto dne přepočítají (bez odečtu pauzy). Vyfakturované se nezmění. Pokračovat?`)) return;
    if (!zap && emp.bez_pauzy && !window.confirm("Vypnout? U dnů, kde se pauza neodečítala, se náklady práce přepočítají zpět s odečtem 1 h.")) return;
    setPracuji(true); setZprava(null);
    const { data, error } = await supabase.rpc("nastav_bez_pauzy", { p_employee_id: emp.id, p_bez_pauzy: zap, p_od: zap && od ? od : null });
    setPracuji(false);
    if (error) { setZprava({ chyba: true, text: "Nepodařilo se uložit: " + error.message }); return; }
    onUlozeno(zap, zap && od ? od : null);
    const casti = ["Uloženo."];
    if (data?.upraveno) casti.push(`Přepočteno ${data.upraveno} ${data.upraveno === 1 ? "náklad" : data.upraveno < 5 ? "náklady" : "nákladů"} práce na zakázkách.`);
    if (data?.vyfakturovano) casti.push(`${data.vyfakturovano}× vyfakturovaný náklad se nezměnil — zkontrolujte ručně.`);
    setZprava({ chyba: !!data?.vyfakturovano, text: casti.join(" ") });
  };

  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, minHeight: 32, cursor: "pointer" }}>
        <input type="checkbox" checked={zap} onChange={(e) => setZap(e.target.checked)} />
        Neodečítat 1 h pauzy (den nad 6 h)
      </label>
      {zap && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 4, flexWrap: "wrap" }}>
          od
          <input type="date" value={od} onChange={(e) => setOd(e.target.value)}
            style={{ border: "1px solid #CDD2D8", borderRadius: 6, padding: "5px 8px", fontFamily: "inherit" }} />
          <span style={{ fontSize: 11, color: "#64748b" }}>{od ? "" : "prázdné = odjakživa"}</span>
        </label>
      )}
      {zmeneno && (
        <button type="button" onClick={ulozit} disabled={pracuji}
          style={{ marginTop: 6, background: "#0369a1", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
          {pracuji ? "Ukládám…" : "Uložit nastavení pauzy"}
        </button>
      )}
      {zprava && <div role="status" style={{ fontSize: 12, marginTop: 4, color: zprava.chyba ? "#b45309" : "#15803d" }}>{zprava.text}</div>}
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Nastavuje jen administrátor. Platí pro výkaz, mzdy i náklady práce na zakázkách — i zpětně od zvoleného data.</div>
    </div>
  );
}
