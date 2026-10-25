// ─── Dokumenty zakázky: miniatury, náhled a stažení ──────────────────────────
// Na jednom místě všechny dokumenty zakázky:
//  • VYGENEROVANÉ (smlouva, předávací protokol, dodatky, nabídka) se berou
//    přímo z aplikace z aktuálních údajů — náhled z HTML, stažení = Word
//    ze šablony (prop vygenerovane, sestavuje Průběh),
//  • z OneDrivu jen PODEPSANÉ / nahrané soubory ve složce Dokumenty (skeny,
//    PDF) — vygenerované kopie (Smlouva o dílo…, Předávací protokol…,
//    Dodatek…, Nabídka… .docx/.html) se přeskočí,
//  • dokumenty nahrané do appky mimo OneDrive (contract_photos — PDF, skeny),
//  • servisní zprávy podepsané u zákazníka (PDF),
//  • vydané faktury k zakázce (náhled a PDF se vyrobí na klik).
// Klik na miniaturu otevře NÁHLED V PANELU přichyceném k okraji obrazovky —
// zůstane otevřený jako podklad při doplňování nebo pro kontrolu. Každý
// dokument jde i stáhnout. Na telefonu je náhled přes celou obrazovku.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase.js";
import { getThumbnailUrl, getPreviewUrl, getDirectDownloadUrl, isConnected, connectSharedAccount } from "./onedrive.js";
import { seznamDokumentu } from "./dokumentyOneDrive.js";
import { buildInvoicePreview, downloadInvoicePDF, cisloFaktury } from "./invoicingUtils.js";

const OBRAZKY = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "avif"];
const IKONY = { smlouva: "📜", protokol: "🤝", dodatek: "📎", nabidka: "💼", pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊", csv: "📊", zip: "🗜️", dwg: "📐", txt: "📃", faktura: "🧾", servis: "🔧" };
const DOKUMENTOVE_KATEGORIE = ["Dokumenty", "Předávací protokol", "Smlouva", "Revize", "Formulář"];
const PUBLIC = "/storage/v1/object/public/";
const pripona = (jmeno) => (String(jmeno || "").split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || "").toLowerCase();
const fmtDatum = (iso) => (iso ? new Date(iso).toLocaleDateString("cs-CZ") : "");
// druh podle názvu vygenerovaného souboru
const druhPodleJmena = (n) => (/smlouv/i.test(n) ? "Smlouva" : /protokol/i.test(n) ? "Předávací protokol" : /dodatek/i.test(n) ? "Dodatek" : /nab[ií]dk/i.test(n) ? "Nabídka" : /revi/i.test(n) ? "Revize" : "Dokument");

async function podepsat(url, bucket) {
  if (bucket) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(url, 3600);
    return data?.signedUrl || null;
  }
  const i = String(url || "").indexOf(PUBLIC);
  if (i < 0) return url;
  const rest = url.slice(i + PUBLIC.length).split("?")[0];
  const s = rest.indexOf("/");
  const { data } = await supabase.storage.from(rest.slice(0, s)).createSignedUrl(decodeURIComponent(rest.slice(s + 1)), 3600);
  return data?.signedUrl || url;
}

// ── načtení obsahu pro náhled / stažení podle zdroje ──
async function nacistNahled(d) {
  if (d.zdroj === "gen") {
    // stejný soubor jako při stažení (vlastní šablona Word, jinak záložní HTML)
    const s = await d.soubor();
    if (!s?.blob) return { druh: "chyba" };
    if (/\.docx$/i.test(s.soubor)) return { druh: "docx", blob: s.blob };
    return { druh: "html", html: await s.blob.text() };
  }
  if (d.zdroj === "od") {
    if (OBRAZKY.includes(d.ext)) { const u = await getDirectDownloadUrl(d.itemId); return { druh: "img", url: u }; }
    const pv = await getPreviewUrl(d.itemId);
    return pv ? { druh: "iframe", url: pv } : { druh: "odkaz", url: d.webUrl };
  }
  if (d.zdroj === "faktura") return { druh: "html", html: await buildInvoicePreview(d.faktura, d.zakaznik) };
  const u = await podepsat(d.url, d.bucket);
  if (OBRAZKY.includes(d.ext)) return { druh: "img", url: u };
  if (d.ext === "pdf") return { druh: "iframe", url: u };
  return { druh: "odkaz", url: u };
}
async function stahnout(d) {
  if (d.zdroj === "gen") { await d.stahnout(); return; }
  if (d.zdroj === "faktura") { await downloadInvoicePDF(d.faktura, d.zakaznik); return; }
  const u = d.zdroj === "od" ? await getDirectDownloadUrl(d.itemId) : await podepsat(d.url, d.bucket);
  if (!u) { alert("Soubor se nepodařilo stáhnout."); return; }
  const a = document.createElement("a");
  a.href = u; a.download = d.nazev; a.target = "_blank"; a.rel = "noreferrer";
  document.body.appendChild(a); a.click(); a.remove();
}

function Miniatura({ d, onNahled, aktivni }) {
  const [src, setSrc] = useState(null);
  const [stahuji, setStahuji] = useState(false);
  const jenOdkaz = !!d.otevrit;
  useEffect(() => {
    let zrus = false;
    (async () => {
      let u = null;
      if (d.zdroj === "gen" || d.zdroj === "odkaz") { if (!zrus) setSrc(null); return; }
      if (d.zdroj === "od") u = await getThumbnailUrl(d.itemId, "medium");
      else if (OBRAZKY.includes(d.ext)) u = await podepsat(d.url, d.bucket);
      if (!zrus) setSrc(u);
    })();
    return () => { zrus = true; };
  }, [d.zdroj, d.itemId, d.url, d.bucket, d.ext]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <button type="button" onClick={onNahled} title={d.novy ? `Vygenerovat: ${d.nazev}` : `Náhled: ${d.nazev}`} aria-pressed={aktivni}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "3 / 4", width: "100%", borderRadius: 8, overflow: "hidden", border: aktivni ? "2px solid #0E3B5E" : d.novy ? "1.5px dashed #94A3B8" : "1px solid #DDE2E8", background: d.novy ? "#fff" : "#F5F6F8", cursor: "pointer", padding: 0, opacity: d.novy ? 0.85 : 1 }}>
        {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          : <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: "#4B5563" }}><span style={{ fontSize: 28 }} aria-hidden="true">{IKONY[d.ikona || d.ext] || "📎"}</span><b style={{ fontSize: 11, textTransform: "uppercase" }}>{d.stitek || (d.ikona === "faktura" ? "faktura" : d.ikona === "servis" ? "pdf" : d.ext || "soubor")}</b></span>}
      </button>
      <span title={d.nazev} style={{ fontSize: 11.5, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nazev}</span>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, marginTop: -2 }}>
        <span style={{ fontSize: 10.5, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[d.kategorie, d.datum].filter(Boolean).join(" · ")}</span>
        {!jenOdkaz && <button type="button" disabled={stahuji} onClick={async () => { setStahuji(true); try { await stahnout(d); } finally { setStahuji(false); } }} aria-label={`Stáhnout ${d.nazev}`} title={d.zdroj === "gen" ? "Stáhnout Word ze šablony" : "Stáhnout"}
          style={{ border: "1px solid #DDE2E8", background: "#fff", borderRadius: 6, padding: "1px 6px", cursor: "pointer", fontSize: 12 }}>{stahuji ? "…" : "⬇"}</button>}
      </span>
    </div>
  );
}

// Word (.docx) vykreslený v prohlížeči — stejný soubor, jaký se stáhne
function NahledDocx({ blob }) {
  const el = useRef(null);
  const [chyba, setChyba] = useState(false);
  useEffect(() => {
    let zrus = false;
    (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (zrus || !el.current) return;
        el.current.innerHTML = "";
        await renderAsync(blob, el.current, undefined, { inWrapper: true, ignoreWidth: false, breakPages: true, className: "docx" });
      } catch { if (!zrus) setChyba(true); }
    })();
    return () => { zrus = true; };
  }, [blob]);
  if (chyba) return <div style={{ margin: "auto", color: "#374151" }}>Word se nepodařilo zobrazit — stáhni ho tlačítkem ⬇ Stáhnout.</div>;
  return <div ref={el} style={{ width: "100%", minHeight: "100%" }} />;
}

function NahledDokumentu({ soubory, index, onIndex, onZavrit }) {
  const d = soubory[index];
  const [obsah, setObsah] = useState(null);
  const [strana, setStrana] = useState("vpravo");
  const [sirka, setSirka] = useState(46);
  const [zoom, setZoom] = useState(1);
  const [mobil, setMobil] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const h = (e) => setMobil(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  useEffect(() => {
    if (!d) return undefined;
    let zrus = false;
    Promise.resolve().then(() => { if (!zrus) { setObsah(null); setZoom(1); } });
    nacistNahled(d).then((o) => { if (!zrus) setObsah(o); }).catch(() => { if (!zrus) setObsah({ druh: "chyba" }); });
    return () => { zrus = true; };
  }, [d]);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") onZavrit();
      if (e.altKey && e.key === "ArrowRight") onIndex((index + 1) % soubory.length);
      if (e.altKey && e.key === "ArrowLeft") onIndex((index - 1 + soubory.length) % soubory.length);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [index, soubory.length, onIndex, onZavrit]);
  if (!d) return null;
  const tl = { background: "rgba(255,255,255,.14)", border: "none", color: "#fff", borderRadius: 6, padding: "5px 9px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, textDecoration: "none" };
  const okno = mobil ? { position: "fixed", inset: 0, zIndex: 3000 }
    : { position: "fixed", top: "calc(var(--lista-h, 52px) + env(safe-area-inset-top))", bottom: 0, [strana === "vpravo" ? "right" : "left"]: 0, width: `${sirka}vw`, zIndex: 3000, boxShadow: "0 0 24px #0003" };
  return createPortal(
    <div role="dialog" aria-label={`Náhled: ${d.nazev}`} style={{ ...okno, background: "#1F2937", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "#0E3B5E", color: "#fff", flexWrap: "wrap" }}>
        <b style={{ flex: "1 1 160px", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 14 }} title={d.nazev}>{d.nazev}</b>
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
        <button type="button" style={tl} onClick={() => stahnout(d)}>⬇ Stáhnout</button>
        <button type="button" style={{ ...tl, background: "rgba(255,255,255,.25)" }} onClick={onZavrit} aria-label="Zavřít náhled">✕</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", background: "#F5F6F8", display: "flex", justifyContent: "center", alignItems: obsah?.druh === "img" ? "flex-start" : "stretch" }}>
        {!obsah ? <div style={{ margin: "auto", color: "#6B7280" }}>Načítám náhled…</div>
          : obsah.druh === "img" ? <img src={obsah.url} alt={d.nazev} style={{ width: `${zoom * 100}%`, maxWidth: "none", height: "auto", display: "block" }} />
          : obsah.druh === "iframe" ? <iframe title={d.nazev} src={obsah.url} style={{ flex: 1, width: "100%", border: "none", background: "#fff" }} />
          : obsah.druh === "docx" ? <NahledDocx blob={obsah.blob} />
          : obsah.druh === "html" ? <iframe title={d.nazev} srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">${obsah.html}</body>`} style={{ flex: 1, width: "100%", border: "none", background: "#fff" }} />
          : <div style={{ margin: "auto", textAlign: "center", color: "#374151", padding: 20 }}>{obsah.druh === "chyba" ? "Náhled se nepodařilo načíst." : "Tento soubor nejde zobrazit přímo v aplikaci."}<br />
            {obsah.url && <a href={obsah.url} target="_blank" rel="noreferrer" style={{ color: "#0E3B5E", fontWeight: 700 }}>Otevřít v novém okně</a>}{" "}
            <button type="button" onClick={() => stahnout(d)} style={{ border: "none", background: "none", color: "#0E3B5E", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Stáhnout</button></div>}
      </div>
    </div>,
    document.body,
  );
}

// slozka = název složky zakázky na OneDrivu (jako u fotek), contractId = zakázka
const VYGENEROVANY = /^(Smlouva o d[ií]lo|P[řr]ed[aá]vac[ií] protokol|Dodatek|Nab[ií]dka)\b.*\.(docx?|html?)$/i;

export default function DokumentyZakazky({ soubory = [], slozka, contractId, vygenerovane = [], typ, prubehId }) {
  const [od, setOd] = useState(null);           // soubory ze složky Dokumenty na OneDrivu (null = načítám)
  const [ostatni, setOstatni] = useState({ servis: [], faktury: [], zakaznik: null });
  const [otevreny, setOtevreny] = useState(null);

  useEffect(() => {
    let zrus = false;
    (async () => {
      let seznam = [];
      try {
        if (slozka && (isConnected() || await connectSharedAccount())) seznam = (await seznamDokumentu(slozka))?.soubory || [];
      } catch { seznam = []; }
      if (!zrus) setOd(seznam.filter((x) => x.file && !VYGENEROVANY.test(x.name)));
    })();
    return () => { zrus = true; };
  }, [slozka]);

  useEffect(() => {
    if (!contractId) return undefined;
    let zrus = false;
    (async () => {
      const [{ data: tickety }, { data: faktury }, { data: k }] = await Promise.all([
        supabase.from("service_tickets").select("id").eq("contract_id", contractId),
        supabase.from("invoices").select("*").eq("contract_id", contractId).neq("status", "Storno").order("issued", { ascending: false }),
        supabase.from("contracts").select("customer_id").eq("id", contractId).maybeSingle(),
      ]);
      const ids = (tickety || []).map((t) => t.id);
      const { data: zpravy } = ids.length ? await supabase.from("servisni_zpravy").select("id, cislo, pdf_path, created_at").in("ticket_id", ids).not("pdf_path", "is", null) : { data: [] };
      const { data: zk } = k?.customer_id ? await supabase.from("customers").select("*").eq("id", k.customer_id).maybeSingle() : { data: null };
      if (!zrus) setOstatni({ servis: zpravy || [], faktury: (faktury || []).filter((f) => (f.invoice_type || "vydaná") === "vydaná"), zakaznik: zk });
    })();
    return () => { zrus = true; };
  }, [contractId]);

  // Automaticky: knihovna dokumentů podle typu zakázky (+ pro všechny typy)
  // a dokumenty k výrobním číslům (záruční listy, datasheety)
  const [automaticke, setAutomaticke] = useState({ typ: [], sn: [] });
  useEffect(() => {
    let zrus = false;
    (async () => {
      const typy = ["*", ...(typ ? [typ] : [])];
      const podminka = [contractId && `contract_id.eq.${contractId}`, prubehId && `prubeh_id.eq.${prubehId}`].filter(Boolean).join(",");
      const [{ data: kt }, { data: sn }] = await Promise.all([
        supabase.from("dokumenty_typu").select("id, typ, nazev, cesta, popis, poradi, created_at").in("typ", typy).order("poradi"),
        podminka ? supabase.from("vyrobni_cisla").select("id, sn, nazev, dokumenty").or(podminka) : Promise.resolve({ data: [] }),
      ]);
      if (!zrus) setAutomaticke({ typ: (kt || []).sort((a, b) => (a.typ === "*") - (b.typ === "*") || (a.poradi || 0) - (b.poradi || 0)), sn: sn || [] });
    })();
    return () => { zrus = true; };
  }, [typ, contractId, prubehId]);
  // dokument sdílený víc SN (nahraný najednou) jen jednou
  const snDokumenty = [];
  for (const v of automaticke.sn) for (const d of v.dokumenty || []) {
    const ex = snDokumenty.find((x) => x.url === d.cesta);
    if (ex) ex.sn.push(v.sn); else snDokumenty.push({ url: d.cesta, nazev: d.nazev, sn: [v.sn], produkt: v.nazev });
  }

  // sjednocený seznam: OneDrive Dokumenty → nahrané v appce (mimo OneDrive) → servisní zprávy → faktury
  const jmenaOD = new Set((od || []).map((x) => x.name));
  const docs = [
    ...vygenerovane.map((g) => ({ ...g, zdroj: g.otevrit ? "odkaz" : "gen", ext: "docx", ikona: g.ikona || "docx" })),
    ...(od || []).map((x) => ({ klic: `od-${x.id}`, zdroj: "od", itemId: x.id, webUrl: x.webUrl, nazev: x.name, ext: pripona(x.name), kategorie: druhPodleJmena(x.name), datum: fmtDatum(x.lastModifiedDateTime) })),
    ...soubory.filter((f) => {
      const ext = pripona(f.storage_path || f.url);
      const dokument = !OBRAZKY.includes(ext) || DOKUMENTOVE_KATEGORIE.includes(f.category);
      const jmeno = String(f.storage_path || "").replace(/^onedrive:/, "").split("/").pop();
      return dokument && !jmenaOD.has(jmeno);
    }).map((f) => {
      const jmeno = f.description || String(f.storage_path || f.url || "").replace(/^onedrive:/, "").split("/").pop();
      return f.item_id
        ? { klic: `cp-${f.id}`, zdroj: "od", itemId: f.item_id, webUrl: f.url, nazev: jmeno, ext: pripona(f.storage_path || f.url), kategorie: f.category, datum: fmtDatum(f.created_at) }
        : { klic: `cp-${f.id}`, zdroj: "st", url: f.url, nazev: jmeno, ext: pripona(f.storage_path || f.url), kategorie: f.category, datum: fmtDatum(f.created_at) };
    }),
    ...ostatni.servis.map((z) => ({ klic: `sz-${z.id}`, zdroj: "st", bucket: "servisni-zpravy", url: z.pdf_path, nazev: `Servisní zpráva ${z.cislo || ""}.pdf`.replace(" .pdf", ".pdf"), ext: "pdf", ikona: "servis", kategorie: "Servisní zpráva", datum: fmtDatum(z.created_at) })),
    ...automaticke.typ.map((d) => ({ klic: `kt-${d.id}`, zdroj: "st", bucket: "dokumenty-typu", url: d.cesta, nazev: d.nazev, ext: pripona(d.nazev || d.cesta), kategorie: d.typ === "*" ? "📚 Pro všechny zakázky" : `📚 Podklady ${d.typ}`, datum: d.popis || "" })),
    ...snDokumenty.map((d) => ({ klic: `sn-${d.url}`, zdroj: "st", bucket: "vyrobni-cisla", url: d.url, nazev: d.nazev, ext: pripona(d.nazev || d.url), kategorie: `🔢 ${d.produkt || "SN"} ${d.sn.length > 1 ? `(${d.sn.length} SN)` : d.sn[0]}`, datum: "" })),
    ...ostatni.faktury.map((f) => ({ klic: `fa-${f.id}`, zdroj: "faktura", faktura: f, zakaznik: ostatni.zakaznik, nazev: `${f.is_deposit ? "Záloha" : "Faktura"} ${cisloFaktury(f)}`, ext: "pdf", ikona: "faktura", kategorie: f.is_deposit ? "Zálohová faktura" : "Faktura", datum: fmtDatum(f.issued) })),
  ];

  return (
    <>
      {od === null && <div style={{ fontSize: 12.5, color: "#6B7280", marginBottom: 6 }}>Načítám dokumenty…</div>}
      {od !== null && !docs.length && <div style={{ fontSize: 13, color: "#6B7280" }}>Zatím žádné dokumenty. Vygenerované smlouvy, protokoly a dodatky, podepsané skeny (Fotky → Nahrát do: Dokumenty), servisní zprávy a faktury se ukážou tady.</div>}
      {docs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 12 }}>
          {docs.map((d, i) => <Miniatura key={d.klic} d={d} aktivni={otevreny === i} onNahled={() => (d.otevrit ? d.otevrit() : setOtevreny(i))} />)}
        </div>
      )}
      {otevreny != null && docs[otevreny] && <NahledDokumentu soubory={docs} index={otevreny} onIndex={setOtevreny} onZavrit={() => setOtevreny(null)} />}
    </>
  );
}
