// ─── Údaje firmy na faktuře (hlavička, účet, kontakty) ──────────────────────
// Název, sídlo a DIČ se kontrolují podle ARES (jedním klikem převzít), kontakty
// a bankovní účet se doplní ručně. Ukládá se do app_settings („firma_udaje“)
// a hned se použije na nové i znovu vytištěné faktury (PDF, QR platba, ISDOC).
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { COMPANY, FIRMA_KEY, nastavFirmu } from "./invoicingUtils.js";
import { nactiZAres } from "./ares.js";

const POLE_ARES = [["name", "Název firmy"], ["addressLine", "Ulice a číslo"], ["city", "PSČ a obec"], ["dic", "DIČ"]];
const POLE_RUCNE = [["mobil", "Mobil", "+420 777 123 456"], ["tel", "Telefon", ""], ["email", "E-mail", "info@…"], ["www", "Web", "www.…"], ["fax", "Fax", ""]];
const POLE_UCET = [["bankPrefix", "Předčíslí", "123"], ["bankAccount", "Číslo účtu", "8729910267"], ["bankCode", "Kód banky", "0100"]];
const bez = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "").trim();

export default function UdajeFirmy({ onClose }) {
  const [f, setF] = useState(() => ({ ...COMPANY }));
  const [ares, setAres] = useState(null);       // { name, addressLine, city, dic } | null
  const [stav, setStav] = useState("");
  const [pracuji, setPracuji] = useState(false);

  const zkontrolovat = async (ico = f.ico) => {
    setStav("Kontroluji v ARES…");
    try {
      const a = await nactiZAres(ico);
      if (!a) { setAres(null); setStav("Firma s tímto IČO v ARES není — zkontroluj IČO."); return; }
      setAres({ name: a.nazev, addressLine: a.ulice, city: [a.psc, a.obec].filter(Boolean).join(" "), dic: a.dic, zanikla: a.zanikla });
      setStav(a.zanikla ? "⚠ Firma je podle ARES zaniklá." : "");
    } catch (e) { setStav(e.message || String(e)); }
  };
  // při otevření jednou zkontrolovat uložené IČO
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { Promise.resolve().then(() => zkontrolovat(COMPANY.ico)); }, []);

  const rozdily = ares ? POLE_ARES.filter(([k]) => ares[k] && bez(ares[k]) !== bez(f[k])) : [];
  const set = (k, v) => { setStav(""); setF((x) => ({ ...x, [k]: v })); };

  const ulozit = async () => {
    if (!/^\d{8}$/.test(String(f.ico).replace(/\D/g, ""))) { setStav("IČO musí mít 8 číslic."); return; }
    if (!f.bankAccount || !/^\d{1,4}$/.test(String(f.bankCode).trim())) { setStav("Vyplň číslo účtu a kód banky."); return; }
    setPracuji(true);
    const udaje = Object.fromEntries(Object.keys(COMPANY).map((k) => [k, String(f[k] ?? "").trim()]));
    const { error } = await supabase.from("app_settings").upsert({ key: FIRMA_KEY, value: udaje, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setPracuji(false);
    if (error) { setStav("Nepodařilo se uložit: " + error.message); return; }
    nastavFirmu(udaje);
    setStav("✓ Uloženo — platí pro nové i znovu stažené faktury.");
  };

  const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 3 };
  const mrizka = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };

  return (
    <div role="dialog" aria-modal="true" aria-label="Údaje firmy na faktuře" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 600, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflow: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 14, color: "#0f172a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🏢 Údaje firmy na faktuře</div>
          <button type="button" onClick={onClose} aria-label="Zavřít" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}>✕</button>
        </div>

        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "0 1 180px" }}><label style={lbl} htmlFor="uf-ico">IČO</label><input id="uf-ico" style={pole} value={f.ico} onChange={(e) => set("ico", e.target.value)} /></div>
            <button type="button" onClick={() => zkontrolovat()} style={{ background: "#fff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🔎 Zkontrolovat v ARES</button>
            {ares && !rozdily.length && <span style={{ color: "#15803d", fontWeight: 700, fontSize: 13 }}>✓ Název, sídlo a DIČ odpovídají ARES</span>}
          </div>
          {rozdily.length > 0 && (
            <div role="alert" style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 12px", fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
              <b style={{ color: "#92400e" }}>⚠ Neodpovídá ARES:</b>
              {rozdily.map(([k, l]) => <div key={k}>{l}: na faktuře <b>{f[k] || "—"}</b>, v ARES <b>{ares[k]}</b></div>)}
              <button type="button" onClick={() => setF((x) => ({ ...x, ...Object.fromEntries(rozdily.map(([k]) => [k, ares[k]])) }))}
                style={{ alignSelf: "flex-start", background: "#92400e", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Převzít z ARES</button>
              <span style={{ fontSize: 12, color: "#92400e" }}>Na faktuře má být sídlo zapsané v obchodním rejstříku. Provozovnu nebo doručovací adresu případně uveď do kontaktů.</span>
            </div>
          )}
          <div style={mrizka}>
            {POLE_ARES.map(([k, l]) => (
              <div key={k}><label style={lbl} htmlFor={`uf-${k}`}>{l} <span style={{ fontWeight: 400, color: "#94a3b8" }}>· z ARES</span></label>
                <input id={`uf-${k}`} style={{ ...pole, borderColor: rozdily.some(([x]) => x === k) ? "#f59e0b" : pole.border }} value={f[k] || ""} onChange={(e) => set(k, e.target.value)} /></div>
            ))}
            <div><label style={lbl} htmlFor="uf-country">Stát</label><input id="uf-country" style={pole} value={f.country || ""} onChange={(e) => set("country", e.target.value)} /></div>
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Kontakty v hlavičce</div>
          <div style={mrizka}>
            {POLE_RUCNE.map(([k, l, ph]) => (
              <div key={k}><label style={lbl} htmlFor={`uf-${k}`}>{l}</label><input id={`uf-${k}`} style={pole} placeholder={ph} value={f[k] || ""} onChange={(e) => set(k, e.target.value)} /></div>
            ))}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Bankovní účet <span style={{ fontWeight: 400, fontSize: 12, color: "#64748b" }}>(QR platba se přepočítá sama)</span></div>
          <div style={mrizka}>
            {POLE_UCET.map(([k, l, ph]) => (
              <div key={k}><label style={lbl} htmlFor={`uf-${k}`}>{l}</label><input id={`uf-${k}`} style={pole} placeholder={ph} inputMode="numeric" value={f[k] || ""} onChange={(e) => set(k, e.target.value)} /></div>
            ))}
          </div>
        </section>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" disabled={pracuji} onClick={ulozit} style={{ background: "#0369a1", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{pracuji ? "Ukládám…" : "💾 Uložit údaje"}</button>
          <button type="button" onClick={onClose} style={{ background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Zavřít</button>
          {stav && <span role="status" style={{ fontSize: 13, color: stav.startsWith("✓") ? "#15803d" : stav.startsWith("Kontroluji") ? "#64748b" : "#b45309" }}>{stav}</span>}
        </div>
      </div>
    </div>
  );
}
