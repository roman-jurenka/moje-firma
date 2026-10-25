// ─── Dokumenty zakázky: miniatury + otevřený náhled jako podklad ─────────────
// Mřížka miniatur dokumentů zakázky (smlouvy, protokoly, formuláře, PDF, Office,
// fotky dokumentů). Klik otevře NÁHLED V PANELU, který zůstane otevřený vedle
// práce (na počítači přichycený vpravo nebo vlevo, jde zvětšit/zmenšit) —
// slouží jako podklad při doplňování formulářů nebo pro kontrolu. Na telefonu
// přes celou obrazovku.
// Soubory z OneDrivu: miniatura i prohlížeč (PDF, Word, Excel) přes Microsoft
// Graph. Soubory v Supabase Storage: podepsaná adresa, PDF v prohlížeči
// prohlížeče, obrázky se zoomem.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase.js";
import { getThumbnailUrl, getPreviewUrl, getDirectDownloadUrl } from "./onedrive.js";

const OBRAZKY = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "avif"];
const IKONY = { pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊", csv: "📊", zip: "🗜️", dwg: "📐", txt: "📃" };
const PUBLIC = "/storage/v1/object/public/";
const DOKUMENTOVE_KATEGORIE = ["Dokumenty", "Předávací protokol", "Smlouva", "Revize", "Formulář"];

const pripona = (f) => {
  const z = String(f.storage_path || String(f.url || "").split("?")[0]).split("/").pop();
  return (z.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "").toLowerCase();
};
const nazev = (f) => f.description || String(f.storage_path || f.url || "").replace(/^onedrive:/, "").split("/").pop() || "Dokument";
// dokument = cokoli mimo obrázek, nebo obrázek v dokumentové kategorii (sken smlouvy…)
const jeDokumentZakazky = (f) => !OBRAZKY.includes(pripona(f)) || DOKUMENTOVE_KATEGORIE.includes(f.category);

async function podepsat(url) {
  const i = String(url || "").indexOf(PUBLIC);
  if (i < 0) return url;
  const rest = url.slice(i + PUBLIC.length).split("?")[0];
  const s = rest.indexOf("/");
  const { data } = await supabase.storage.from(rest.slice(0, s)).createSignedUrl(decodeURIComponent(rest.slice(s + 1)), 3600);
  return data?.signedUrl || url;
}

function Miniatura({ f, onClick, aktivni }) {
  const [src, setSrc] = useState(null);
  const p = pripona(f);
  const obrazek = OBRAZKY.includes(p);
  useEffect(() => {
    let zrus = false;
    (async () => {
      let u = null;
      if (f.item_id) u = await getThumbnailUrl(f.item_id, "medium");
      if (!u && obrazek) u = await podepsat(f.url);
      if (!zrus) setSrc(u);
    })();
    return () => { zrus = true; };
  }, [f.item_id, f.url, obrazek]);
  return (
    <button type="button" onClick={onClick} title={nazev(f)} aria-pressed={aktivni}
      style={{ display: "flex", flexDirection: "column", gap: 4, padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", minWidth: 0 }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "3 / 4", width: "100%", borderRadius: 8, overflow: "hidden", border: aktivni ? "2px solid #0E3B5E" : "1px solid #DDE2E8", background: "#F5F6F8" }}>
        {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          : <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: "#4B5563" }}><span style={{ fontSize: 28 }} aria-hidden="true">{IKONY[p] || "📎"}</span><b style={{ fontSize: 11, textTransform: "uppercase" }}>{p || "soubor"}</b></span>}
      </span>
      <span style={{ fontSize: 11.5, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nazev(f)}</span>
      {f.category && <span style={{ fontSize: 10.5, color: "#6B7280", marginTop: -3 }}>{f.category}</span>}
    </button>
  );
}

// Náhled v panelu (portál do <body>, zůstane otevřený nad vším)
function NahledDokumentu({ soubory, index, onIndex, onZavrit }) {
  const f = soubory[index];
  const [obsah, setObsah] = useState(null); // { druh: "iframe"|"img"|"odkaz", url, stahnout }
  const [strana, setStrana] = useState("vpravo");
  const [sirka, setSirka] = useState(46); // % šířky okna
  const [zoom, setZoom] = useState(1);
  const [mobil, setMobil] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const h = (e) => setMobil(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  useEffect(() => {
    if (!f) return undefined;
    let zrus = false;
    Promise.resolve().then(() => { if (!zrus) { setObsah(null); setZoom(1); } });
    (async () => {
      const p = pripona(f);
      if (OBRAZKY.includes(p)) {
        const u = (f.item_id && await getDirectDownloadUrl(f.item_id)) || await podepsat(f.url);
        if (!zrus) setObsah({ druh: "img", url: u, stahnout: u });
        return;
      }
      if (f.item_id) {
        const pv = await getPreviewUrl(f.item_id);
        const dl = await getDirectDownloadUrl(f.item_id);
        if (!zrus) setObsah(pv ? { druh: "iframe", url: pv, stahnout: dl || f.url } : { druh: "odkaz", url: f.url, stahnout: dl || f.url });
        return;
      }
      const u = await podepsat(f.url);
      if (!zrus) setObsah(p === "pdf" ? { druh: "iframe", url: u, stahnout: u } : { druh: "odkaz", url: u, stahnout: u });
    })();
    return () => { zrus = true; };
  }, [f]);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") onZavrit();
      if (e.key === "ArrowRight" && e.altKey) onIndex((index + 1) % soubory.length);
      if (e.key === "ArrowLeft" && e.altKey) onIndex((index - 1 + soubory.length) % soubory.length);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [index, soubory.length, onIndex, onZavrit]);
  if (!f) return null;

  const tl = { background: "rgba(255,255,255,.14)", border: "none", color: "#fff", borderRadius: 6, padding: "5px 9px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600 };
  const okno = mobil
    ? { position: "fixed", inset: 0, zIndex: 3000 }
    : { position: "fixed", top: "calc(var(--lista-h, 52px) + env(safe-area-inset-top))", bottom: 0, [strana === "vpravo" ? "right" : "left"]: 0, width: `${sirka}vw`, zIndex: 3000, boxShadow: "0 0 24px #0003" };
  return createPortal(
    <div role="dialog" aria-label={`Náhled: ${nazev(f)}`} style={{ ...okno, background: "#1F2937", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "#0E3B5E", color: "#fff", flexWrap: "wrap" }}>
        <b style={{ flex: "1 1 160px", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 14 }} title={nazev(f)}>{nazev(f)}</b>
        {soubory.length > 1 && <>
          <button type="button" style={tl} onClick={() => onIndex((index - 1 + soubory.length) % soubory.length)} aria-label="Předchozí dokument">‹</button>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{index + 1} / {soubory.length}</span>
          <button type="button" style={tl} onClick={() => onIndex((index + 1) % soubory.length)} aria-label="Další dokument">›</button>
        </>}
        {obsah?.druh === "img" && <>
          <button type="button" style={tl} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zmenšit">−</button>
          <span style={{ fontSize: 12, minWidth: 38, textAlign: "center" }}>{Math.round(zoom * 100)} %</span>
          <button type="button" style={tl} onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zvětšit">+</button>
        </>}
        {!mobil && <>
          <button type="button" style={tl} onClick={() => setSirka((s) => (s >= 70 ? 34 : s + 12))} title="Širší / užší">{sirka >= 70 ? "⇥ užší" : "⇤ širší"}</button>
          <button type="button" style={tl} onClick={() => setStrana((s) => (s === "vpravo" ? "vlevo" : "vpravo"))} title="Přesunout na druhou stranu">⇄</button>
        </>}
        {obsah?.stahnout && <a href={obsah.stahnout} target="_blank" rel="noreferrer" style={{ ...tl, textDecoration: "none" }}>↗ Otevřít</a>}
        <button type="button" style={{ ...tl, background: "rgba(255,255,255,.25)" }} onClick={onZavrit} aria-label="Zavřít náhled">✕</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", background: "#F5F6F8", display: "flex", justifyContent: "center", alignItems: obsah?.druh === "img" ? "flex-start" : "stretch" }}>
        {!obsah ? <div style={{ margin: "auto", color: "#6B7280" }}>Načítám náhled…</div>
          : obsah.druh === "img" ? <img src={obsah.url} alt={nazev(f)} style={{ width: `${zoom * 100}%`, maxWidth: "none", height: "auto", display: "block" }} />
          : obsah.druh === "iframe" ? <iframe title={nazev(f)} src={obsah.url} style={{ flex: 1, width: "100%", border: "none", background: "#fff" }} />
          : <div style={{ margin: "auto", textAlign: "center", color: "#374151", padding: 20 }}>Tento soubor nejde zobrazit přímo v aplikaci.<br /><a href={obsah.url} target="_blank" rel="noreferrer" style={{ color: "#0E3B5E", fontWeight: 700 }}>Otevřít v novém okně</a></div>}
      </div>
    </div>,
    document.body,
  );
}

// Mřížka miniatur; klik otevře náhled v panelu.
export default function DokumentyZakazky({ soubory = [], prazdne = "Zatím žádné dokumenty — nahraj je přes Fotky / Nahrát do: Dokumenty." }) {
  const docs = soubory.filter(jeDokumentZakazky);
  const [otevreny, setOtevreny] = useState(null);
  if (!docs.length) return <div style={{ fontSize: 13, color: "#6B7280" }}>{prazdne}</div>;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 10 }}>
        {docs.map((f, i) => <Miniatura key={f.id || i} f={f} aktivni={otevreny === i} onClick={() => setOtevreny(i)} />)}
      </div>
      {otevreny != null && <NahledDokumentu soubory={docs} index={otevreny} onIndex={setOtevreny} onZavrit={() => setOtevreny(null)} />}
    </>
  );
}
