import { useState, useRef } from "react";

// Pole s nabídkou hodnot — vlastní rozbalovací seznam přímo pod polem (místo
// <datalist>, který některé prohlížeče vykreslí mimo pole). Dá se psát i vlastní
// hodnota; šipky ↑↓ + Enter vyberou, Esc zavře, ▾ rozbalí celý seznam.
export default function PoleSNabidkou({ id, value, onChange, moznosti, placeholder, style }) {
  const [otevreno, setOtevreno] = useState(false);
  const [aktivni, setAktivni] = useState(-1);
  const pole = useRef(null);
  const q = String(value || "").trim().toLowerCase();
  const presna = moznosti.some((m) => m.toLowerCase() === q);
  const seznam = !q || presna ? moznosti : moznosti.filter((m) => m.toLowerCase().includes(q));
  const vybrat = (m) => { onChange(m); setOtevreno(false); setAktivni(-1); };
  return (
    <div style={{ position: "relative" }}>
      <input id={id} ref={pole} role="combobox" aria-expanded={otevreno && seznam.length > 0} aria-autocomplete="list" aria-controls={`${id}-seznam`}
        autoComplete="off" style={{ ...style, paddingRight: 34 }} value={value} placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOtevreno(true); setAktivni(-1); }}
        onFocus={() => setOtevreno(true)}
        onBlur={() => setTimeout(() => setOtevreno(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOtevreno(true); setAktivni((a) => Math.min(a + 1, seznam.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAktivni((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && otevreno && aktivni >= 0 && seznam[aktivni]) { e.preventDefault(); vybrat(seznam[aktivni]); }
          else if (e.key === "Escape") setOtevreno(false);
        }} />
      <button type="button" tabIndex={-1} aria-label="Zobrazit nabídku" onMouseDown={(e) => { e.preventDefault(); setOtevreno((o) => !o); pole.current?.focus(); }}
        style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#64748b", fontSize: 14, cursor: "pointer", padding: "4px 8px" }}>▾</button>
      {otevreno && seznam.length > 0 && (
        <ul id={`${id}-seznam`} role="listbox"
          style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60, margin: "4px 0 0", padding: 4, listStyle: "none", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,.15)", maxHeight: 220, overflowY: "auto", textAlign: "left" }}>
          {seznam.map((m, i) => (
            <li key={m} role="option" aria-selected={i === aktivni || m.toLowerCase() === q}
              onMouseDown={(e) => { e.preventDefault(); vybrat(m); }} onMouseEnter={() => setAktivni(i)}
              style={{ padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 14, background: i === aktivni ? "#e0f2fe" : m.toLowerCase() === q ? "#f1f5f9" : "transparent", fontWeight: m.toLowerCase() === q ? 700 : 400 }}>
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
