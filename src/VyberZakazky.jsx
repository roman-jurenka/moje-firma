// Výběr zakázky s hledáním (píše se, co hledám; bez diakritiky, s tolerancí
// překlepů, nejpodobnější nahoře) — malá verze SearchSelect pro tabulky.
import { useEffect, useRef, useState } from "react";
import { seraditPodleShody } from "./hledani.js";

export default function VyberZakazky({ contracts = [], customers = [], value, onChange, placeholder = "— bez zakázky —", disabled = false, style = {}, id, ariaLabel = "Zakázka" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [poloha, setPoloha] = useState(null); // seznam je fixed, ať ho neořízne posuvná tabulka
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const zavrit = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    window.addEventListener("scroll", zavrit, true);
    return () => window.removeEventListener("scroll", zavrit, true);
  }, [open]);
  const otevrit = (el) => {
    const r = el.getBoundingClientRect();
    const dole = window.innerHeight - r.bottom > 270;
    setPoloha({ left: Math.max(8, Math.min(r.left, window.innerWidth - 328)), ...(dole ? { top: r.bottom + 2 } : { bottom: window.innerHeight - r.top + 2 }), sirka: Math.max(r.width, 320) });
    setOpen(true); setQ("");
  };
  const jmeno = (cid) => { const c = customers.find((x) => x.id === cid); return c ? (c.company || c.name || "") : ""; };
  const vybrana = contracts.find((c) => String(c.id) === String(value));
  const popisek = (c) => [c.code, c.name].filter(Boolean).join(" · ");
  const nalezene = seraditPodleShody(contracts, q, (c) => `${c.name || ""} ${c.code || ""} ${jmeno(c.customer_id)} ${c.address || ""}`).slice(0, 40);
  const vybrat = (cid) => { onChange?.(cid); setQ(""); setOpen(false); };

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <input id={id} aria-label={ariaLabel} disabled={disabled}
        style={{ border: `1px solid ${vybrana ? "#86efac" : "#cbd5e1"}`, borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", background: disabled ? "#f1f5f9" : "#fff", width: "100%", boxSizing: "border-box" }}
        value={open ? q : (vybrana ? popisek(vybrana) : "")} placeholder={placeholder}
        onFocus={(e) => otevrit(e.currentTarget)}
        onChange={(e) => { setQ(e.target.value); if (!open) otevrit(e.currentTarget); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); e.currentTarget.blur(); }
          if (e.key === "Enter" && nalezene[0]) { e.preventDefault(); vybrat(nalezene[0].id); e.currentTarget.blur(); }
        }} />
      {open && !disabled && poloha && (
        <div style={{ position: "fixed", top: poloha.top, bottom: poloha.bottom, left: poloha.left, width: poloha.sirka, maxWidth: "calc(100vw - 16px)", zIndex: 700, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 260, overflowY: "auto", boxShadow: "0 6px 16px #00000022", textAlign: "left" }}>
          {value && <div onMouseDown={(e) => e.preventDefault()} onClick={() => vybrat(null)} style={{ padding: "7px 10px", fontSize: 12, color: "#64748b", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>— bez zakázky —</div>}
          {nalezene.length === 0 && <div style={{ padding: "8px 10px", fontSize: 12, color: "#64748b" }}>Nic podobného.</div>}
          {nalezene.map((c) => (
            <div key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => vybrat(c.id)}
              style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer", background: String(c.id) === String(value) ? "#eff6ff" : "transparent", borderBottom: "1px solid #f8fafc" }}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{[c.code, jmeno(c.customer_id), c.status].filter(Boolean).join(" · ")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
