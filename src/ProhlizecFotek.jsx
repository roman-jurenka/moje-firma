// ─── Prohlížeč fotek přes celou obrazovku (Průběh, Zakázka → Fotky) ─────────
// Šipky / klávesy ← → / tažení prstem, Esc zavře. fotky = řádky
// contract_photos, i = index zobrazené fotky. Dokument (PDF, Word…) se ukáže
// jako dlaždice s odkazem na originál. S onKategorie jde fotku přeřadit.
import { useEffect, useRef } from "react";
import { OneDriveThumb, StorageLink } from "./storageUrl.jsx";

export default function ProhlizecFotek({ fotky, i, onI, onClose, kategorie = null, onKategorie = null }) {
  const p = fotky[i];
  const tah = useRef(null);
  useEffect(() => {
    const klavesa = (e) => {
      if (e.target?.tagName === "SELECT") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && i > 0) onI(i - 1);
      else if (e.key === "ArrowRight" && i < fotky.length - 1) onI(i + 1);
    };
    window.addEventListener("keydown", klavesa);
    return () => window.removeEventListener("keydown", klavesa);
  }, [i, fotky.length, onI, onClose]);
  if (!p) return null;
  const sipka = { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 48, height: 48, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.9)", color: "#0f172a", fontSize: 26, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div role="dialog" aria-modal="true" aria-label="Prohlížeč fotek" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => { tah.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (tah.current == null) return;
        const dx = e.changedTouches[0].clientX - tah.current;
        tah.current = null;
        if (dx > 50 && i > 0) onI(i - 1);
        else if (dx < -50 && i < fotky.length - 1) onI(i + 1);
      }}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(15,23,42,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 10 }}>
      <div style={{ position: "absolute", top: 12, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {i + 1} / {fotky.length} · {p.category || "Bez kategorie"}{p.date ? ` · ${new Date(p.date + "T00:00:00").toLocaleDateString("cs-CZ")}` : ""}
          {p.description ? <span style={{ fontWeight: 400 }}> · {p.description}</span> : null}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {onKategorie && kategorie && (
            <select aria-label="Přeřadit do kategorie" value={p.category || ""} onChange={(e) => onKategorie(p, e.target.value || null)}
              style={{ background: "rgba(255,255,255,.95)", color: "#0f172a", border: "none", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
              <option value="">Bez kategorie</option>
              {kategorie.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
          <StorageLink href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", fontSize: 13, fontWeight: 600, border: "1px solid rgba(255,255,255,.5)", borderRadius: 8, padding: "6px 10px", textDecoration: "none" }}>Otevřít originál</StorageLink>
          <button type="button" aria-label="Zavřít prohlížeč" onClick={onClose} style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: "none", borderRadius: 8, width: 36, height: 34, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
      </div>
      <OneDriveThumb key={p.id} itemId={p.item_id} fallbackUrl={p.url} cesta={p.storage_path} alt={`${p.category || "Fotka"} ${i + 1} z ${fotky.length}`}
        style={{ maxWidth: "min(1200px, 92vw)", maxHeight: "80vh", objectFit: "contain", borderRadius: 8, background: "#0f172a", minWidth: 160, minHeight: 160 }} />
      {i > 0 && <button type="button" aria-label="Předchozí fotka" onClick={() => onI(i - 1)} style={{ ...sipka, left: 16 }}>‹</button>}
      {i < fotky.length - 1 && <button type="button" aria-label="Další fotka" onClick={() => onI(i + 1)} style={{ ...sipka, right: 16 }}>›</button>}
    </div>
  );
}
