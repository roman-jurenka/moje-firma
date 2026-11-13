// Pošta — firemní e-mailová schránka u WEDOSu přímo v appce (na principu Outlooku):
// složky vlevo, seznam zpráv uprostřed, čtení vpravo, odpověď / přeposlání / nový e-mail.
// Stahování a odesílání dělá edge funkce `posta` (IMAP + SMTP WEDOS), zprávy jsou
// v tabulce posta_zpravy, přílohy v bucketu `posta`.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { barvy, pismo } from "./ui.js";
import { COMPANY } from "./invoicingUtils.js";

const SLOZKY = [
  { id: "prijate", nazev: "Doručená pošta", ikona: "ti-inbox" },
  { id: "odeslane", nazev: "Odeslaná pošta", ikona: "ti-send" },
  { id: "rozepsane", nazev: "Rozepsané", ikona: "ti-file-pencil" },
];
const NASTAVENI = [
  { id: "sablony", nazev: "Šablony", ikona: "ti-template" },
  { id: "podpisy", nazev: "Podpisy", ikona: "ti-signature" },
];

async function volej(akce, extra = {}) {
  const { data, error } = await supabase.functions.invoke("posta", { body: { akce, ...extra } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.detail || j.error || msg; } catch { /* obecná zpráva */ }
    throw new Error(msg);
  }
  return data;
}

const dnes = (d) => new Date(d).toDateString() === new Date().toDateString();
const fmtKratce = (iso) => !iso ? "" : dnes(iso)
  ? new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
  : new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "2-digit" });
const fmtDlouze = (iso) => iso ? new Date(iso).toLocaleString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const fmtVelikost = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`;
const seznamAdres = (a) => (a || []).map((x) => x.jmeno ? `${x.jmeno} <${x.email}>` : x.email).join(", ");
const kratkaAdresa = (a) => (a || []).map((x) => x.jmeno || x.email).join(", ");

// HTML e-mailu se zobrazuje v izolovaném iframu bez skriptů; vzdálené obrázky
// (sledovací pixely) jsou zablokované, dokud je uživatel nepovolí.
// Telefon: přebíjí desktopové inline styly (proto !important)
const POSTA_MOBIL = `
@media (max-width: 899px) {
  .posta-slozky { flex-wrap: nowrap !important; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding-bottom: 2px; }
  .posta-slozky::-webkit-scrollbar { display: none; }
  .posta-slozky > button { flex: none; white-space: nowrap; padding: 8px 12px !important; font-size: 14px !important; border: 1px solid #E3E6EA !important; border-radius: 999px !important; }
  .posta-slozky > button.posta-novy { position: fixed; right: 16px; bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 130; border: none !important; border-radius: 16px !important; padding: 15px 18px !important; font-size: 15px !important; box-shadow: 0 6px 18px rgba(14,59,94,.35); }
  .posta-radek { padding: 12px 14px !important; }
  .posta-od { font-size: 15.5px !important; }
  .posta-predmet { font-size: 14.5px !important; }
  .posta-nahled { font-size: 13.5px !important; }
  .posta-cteni { padding: 0 12px 16px !important; }
  .posta-cteni h2 { font-size: 18px !important; }
  .posta-lista { position: sticky; top: 0; z-index: 2; background: #fff; margin: 0 -12px 12px !important; padding: 8px 12px; border-bottom: 1px solid #EEF0F2; flex-wrap: nowrap !important; justify-content: space-between; }
  .posta-lista > button { padding: 9px 11px !important; font-size: 18px !important; }
  .posta-lista .posta-popis { display: none; }
  .posta-hlavicka { flex-wrap: wrap; }
  .posta-datum { width: 100%; box-sizing: border-box; padding-left: 50px; margin-top: -4px; }
  .posta-psani-pozadi { padding: 0 !important; align-items: stretch !important; }
  .posta-psani { width: 100% !important; max-height: none !important; height: 100dvh; border-radius: 0 !important; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); box-sizing: border-box; }
}
`;

function TeloZpravy({ zprava, obrazky }) {
  const [cidStav, setCidStav] = useState({ id: null, mapa: {} });
  useEffect(() => {
    let zruseno = false;
    const inline = (zprava.prilohy || []).filter((p) => p.cid && p.cesta);
    if (!inline.length || !zprava.html) return;
    supabase.storage.from("posta").createSignedUrls(inline.map((p) => p.cesta), 3600).then(({ data }) => {
      if (zruseno || !data) return;
      setCidStav({ id: zprava.id, mapa: Object.fromEntries(inline.map((p, i) => [p.cid, data[i]?.signedUrl]).filter((x) => x[1])) });
    });
    return () => { zruseno = true; };
  }, [zprava]);
  const cidUrl = cidStav.id === zprava.id ? cidStav.mapa : {};

  if (!zprava.html) {
    return <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55, color: barvy.text, wordBreak: "break-word" }}>{zprava.text || "(prázdná zpráva)"}</div>;
  }
  let html = zprava.html.replace(/cid:([^"'\s)>]+)/gi, (m, cid) => cidUrl[cid] || m);
  const supabaseHost = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const csp = obrazky
    ? "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https:; font-src https: data:"
    : `default-src 'none'; img-src data: ${supabaseHost}; style-src 'unsafe-inline'`;
  html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:14px;color:#1F2937;margin:0;word-break:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}@media (max-width:600px){body{font-size:15px}table,tbody,tr,td,th,div,p,img{max-width:100%!important;box-sizing:border-box}table{width:100%!important;table-layout:auto}td,th{width:auto!important}pre{white-space:pre-wrap}}</style></head><body>${html}</body></html>`;
  return <IframeAutoVyska html={html} />;
}

function IframeAutoVyska({ html }) {
  const ref = useRef(null);
  const [vyska, setVyska] = useState(300);
  // Široký e-mail (pevná šířka 600–700 px) se na telefonu zmenší na šířku displeje,
  // jinak by roztáhl celou stránku do šířky („oddálená“ appka).
  const prizpusob = () => {
    try {
      const el = ref.current, d = el?.contentDocument;
      if (!d) return;
      const koren = d.documentElement;
      koren.style.zoom = "";
      const sirka = el.clientWidth, obsah = koren.scrollWidth;
      if (sirka > 0 && obsah > sirka + 4) koren.style.zoom = String(sirka / obsah);
      requestAnimationFrame(() => setVyska(Math.max(120, Math.ceil(koren.getBoundingClientRect().height) + 16)));
    } catch { /* jiný původ */ }
  };
  // allow-same-origin jen kvůli měření výšky; skripty zůstávají zakázané
  return <iframe ref={ref} title="Obsah e-mailu" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={html} onLoad={prizpusob}
    style={{ width: 1, minWidth: "100%", maxWidth: "100%", height: vyska, border: "none", background: "#fff", display: "block" }} />;
}

function Prilohy({ prilohy }) {
  const viditelne = (prilohy || []).filter((p) => !p.cid || !p.typ?.startsWith("image/"));
  if (!viditelne.length) return null;
  const otevri = async (p) => {
    if (!p.cesta) { alert("Příloha je příliš velká — otevřete ji ve webmailu."); return; }
    const { data, error } = await supabase.storage.from("posta").createSignedUrl(p.cesta, 600, { download: p.nazev });
    if (error) { alert("Přílohu se nepodařilo otevřít: " + error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0" }}>
      {viditelne.map((p, i) => (
        <button key={i} type="button" onClick={() => otevri(p)} title="Stáhnout přílohu"
          style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${barvy.okraj}`, borderRadius: 8, background: "#fff", padding: "6px 10px", cursor: "pointer", fontFamily: pismo, fontSize: 12.5, color: barvy.text, maxWidth: 260 }}>
          <i className={`ti ${p.typ === "application/pdf" ? "ti-file-type-pdf" : p.typ?.startsWith("image/") ? "ti-photo" : "ti-paperclip"}`} style={{ fontSize: 18, color: barvy.primarni }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nazev}</span>
          <span style={{ color: barvy.textSlaby, flexShrink: 0 }}>{fmtVelikost(p.velikost || 0)}</span>
        </button>
      ))}
    </div>
  );
}

// Šablony: zástupné texty {jmeno} (jméno příjemce) a {datum} (dnešek).
const vyplnSablonu = (t, jmeno) => String(t || "")
  .replace(/\{jmeno\}/g, jmeno || "")
  .replace(/\{datum\}/g, new Date().toLocaleDateString("cs-CZ"));
const jmenoZAdresy = (a) => { const m = String(a || "").split(",")[0].match(/^\s*"?([^"<]+?)"?\s*</); return m ? m[1].trim() : ""; };
const sPodpisem = (telo, podpis, citace) => [telo.replace(/\s+$/, ""), podpis ? `\n\n-- \n${podpis.text}` : "", citace || ""].join("");

function Psani({ predloha, sablony, podpisy, onZavrit, onOdeslano, onKoncept }) {
  const vychozi = podpisy.find((p) => p.vychozi) || podpisy[0] || null;
  const [komu, setKomu] = useState(predloha.komu || "");
  const [kopie, setKopie] = useState(predloha.kopie || "");
  const [predmet, setPredmet] = useState(predloha.predmet || "");
  const [telo, setTelo] = useState(predloha.telo || "");
  const [citace] = useState(predloha.citace || "");
  const [podpisId, setPodpisId] = useState(predloha.konceptId ? (predloha.podpisId ?? "") : (vychozi?.id ?? ""));
  const [prilohy, setPrilohy] = useState(predloha.prilohy || []); // [{nazev, typ, velikost, cesta}]
  const [nahravam, setNahravam] = useState(false);
  const [odesilam, setOdesilam] = useState(false);
  const [chyba, setChyba] = useState(null);
  const [ulozeno, setUlozeno] = useState(predloha.konceptId ? "Koncept" : null);
  const [ukazCitaci, setUkazCitaci] = useState(false);
  const souborRef = useRef(null);
  const textRef = useRef(null);
  const konceptRef = useRef(predloha.konceptId || null);
  const zmenenoRef = useRef(false);
  const ukladaniRef = useRef(Promise.resolve());
  const podpis = podpisy.find((p) => String(p.id) === String(podpisId)) || null;

  // Rozepsaný e-mail se sám ukládá do konceptů (1,5 s po poslední změně).
  const ulozKoncept = useCallback(() => {
    if (!zmenenoRef.current) return ukladaniRef.current;
    zmenenoRef.current = false;
    const radek = { komu, kopie, predmet, telo, citace, podpis_id: podpisId || null, prilohy, odpoved_na_id: predloha.odpovedNaId || null, updated_at: new Date().toISOString() };
    ukladaniRef.current = ukladaniRef.current.then(async () => {
      const dotaz = konceptRef.current
        ? supabase.from("posta_koncepty").update(radek).eq("id", konceptRef.current).select("id").single()
        : supabase.from("posta_koncepty").insert(radek).select("id").single();
      const { data, error } = await dotaz;
      if (error) { setUlozeno("Koncept se nepodařilo uložit"); return; }
      konceptRef.current = data.id;
      setUlozeno(`Koncept uložen ${new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`);
      onKoncept?.();
    });
    return ukladaniRef.current;
  }, [komu, kopie, predmet, telo, citace, podpisId, prilohy, predloha.odpovedNaId, onKoncept]);
  useEffect(() => {
    if (!zmenenoRef.current || odesilam) return;
    const t = setTimeout(ulozKoncept, 1500);
    return () => clearTimeout(t);
  }, [ulozKoncept, odesilam]);
  const zmen = (set) => (v) => { zmenenoRef.current = true; set(v); };

  const vlozSablonu = (id) => {
    const s = sablony.find((x) => String(x.id) === String(id));
    if (!s) return;
    const jmeno = jmenoZAdresy(komu);
    zmenenoRef.current = true;
    if (!predmet.trim() && s.predmet) setPredmet(vyplnSablonu(s.predmet, jmeno));
    setTelo((t) => vyplnSablonu(s.text, jmeno) + (t.trim() ? "\n" + t : ""));
    textRef.current?.focus();
  };

  const pridej = async (files) => {
    setNahravam(true); setChyba(null);
    try {
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) { setChyba(`${f.name} je větší než 15 MB.`); continue; }
        const cesta = `odchozi/${crypto.randomUUID()}/${f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_")}`;
        const { error } = await supabase.storage.from("posta").upload(cesta, f, { contentType: f.type || "application/octet-stream" });
        if (error) { setChyba(`Přílohu ${f.name} se nepodařilo nahrát: ${error.message}`); continue; }
        zmenenoRef.current = true;
        setPrilohy((p) => [...p, { nazev: f.name, typ: f.type, velikost: f.size, cesta }]);
      }
    } finally { setNahravam(false); }
  };

  const odeslat = async () => {
    if (!komu.trim()) { setChyba("Vyplňte příjemce."); return; }
    if (!predmet.trim() && !window.confirm("Odeslat e-mail bez předmětu?")) return;
    setOdesilam(true); setChyba(null);
    try {
      await ukladaniRef.current;
      const r = await volej("odeslat", { komu, kopie, predmet, text: sPodpisem(telo, podpis, citace), odpovedNaId: predloha.odpovedNaId || null, prilohy });
      if (konceptRef.current) await supabase.from("posta_koncepty").delete().eq("id", konceptRef.current);
      onOdeslano(r);
    } catch (e) { setChyba(e.message); setOdesilam(false); }
  };
  const zavrit = async () => { await ulozKoncept(); onZavrit(); };
  const zahodit = async () => {
    const neco = telo.trim() || predmet.trim() || prilohy.length;
    if (neco && !window.confirm("Zahodit rozepsaný e-mail?")) return;
    zmenenoRef.current = false;
    await ukladaniRef.current;
    if (konceptRef.current) await supabase.from("posta_koncepty").delete().eq("id", konceptRef.current);
    onKoncept?.();
    onZavrit();
  };

  const pole = { width: "100%", border: "none", borderBottom: `1px solid ${barvy.okrajJemny}`, padding: "9px 4px", fontSize: 14, fontFamily: pismo, outline: "none", background: "transparent", color: barvy.text, boxSizing: "border-box" };
  const vyber = { border: `1px solid ${barvy.okraj}`, borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: pismo, background: "#fff", color: barvy.text, maxWidth: 200 };
  const radek = (popis, hodnota, set, ph) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 60, fontSize: 13, color: barvy.textSlaby }}>{popis}</span>
      <input style={pole} value={hodnota} onChange={(e) => zmen(set)(e.target.value)} placeholder={ph} />
    </label>
  );
  return (
    <div className="posta-psani-pozadi" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div className="posta-psani" style={{ background: "#fff", borderRadius: 12, width: "min(780px, 100%)", maxHeight: "94vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,.25)", fontFamily: pismo }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${barvy.okraj}` }}>
          <b style={{ flex: 1, fontSize: 15, color: barvy.text }}>{predloha.titulek || "Nová zpráva"}</b>
          {ulozeno && <span style={{ fontSize: 12, color: barvy.textSlaby }}>{ulozeno}</span>}
          <button type="button" onClick={zavrit} aria-label="Zavřít (koncept zůstane uložený)" title="Zavřít — rozepsaný e-mail zůstane v Rozepsaných" style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: barvy.textSlaby }}><i className="ti ti-x" /></button>
        </div>
        <div style={{ padding: "4px 16px" }}>
          {radek("Komu", komu, setKomu, "adresa@example.cz, další…")}
          {radek("Kopie", kopie, setKopie, "")}
          {radek("Předmět", predmet, setPredmet, "")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 16px 0" }}>
          <select style={vyber} value="" onChange={(e) => vlozSablonu(e.target.value)} aria-label="Vložit šablonu">
            <option value="">📄 Vložit šablonu…</option>
            {sablony.map((s) => <option key={s.id} value={s.id}>{s.nazev}</option>)}
          </select>
          <select style={vyber} value={podpisId} onChange={(e) => zmen(setPodpisId)(e.target.value)} aria-label="Podpis">
            <option value="">✍ Bez podpisu</option>
            {podpisy.map((p) => <option key={p.id} value={p.id}>✍ {p.nazev}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <textarea ref={textRef} value={telo} onChange={(e) => zmen(setTelo)(e.target.value)} autoFocus={!!predloha.komu} placeholder="Text e-mailu…"
            style={{ minHeight: 220, margin: "8px 16px 0", border: "none", outline: "none", resize: "vertical", fontFamily: pismo, fontSize: 14, lineHeight: 1.5, color: barvy.text }} />
          {podpis && <div style={{ margin: "0 16px", padding: "6px 0", whiteSpace: "pre-wrap", fontSize: 13.5, color: barvy.textMekky, borderTop: `1px dashed ${barvy.okraj}` }}>{podpis.text}</div>}
          {citace && (
            <div style={{ margin: "6px 16px" }}>
              <button type="button" onClick={() => setUkazCitaci((v) => !v)} style={{ border: `1px solid ${barvy.okraj}`, background: barvy.pozadi, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 12, color: barvy.textMekky, fontFamily: pismo }}>
                {ukazCitaci ? "Skrýt původní zprávu" : "… původní zpráva"}
              </button>
              {ukazCitaci && <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, color: barvy.textSlaby, marginTop: 6 }}>{citace.trim()}</div>}
            </div>
          )}
        </div>
        {prilohy.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 16px" }}>
            {prilohy.map((p, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: barvy.pozadi, borderRadius: 6, padding: "4px 8px", fontSize: 12.5 }}>
                <i className="ti ti-paperclip" /> {p.nazev} <span style={{ color: barvy.textSlaby }}>{fmtVelikost(p.velikost || 0)}</span>
                <button type="button" aria-label={`Odebrat ${p.nazev}`} onClick={() => { zmenenoRef.current = true; setPrilohy((x) => x.filter((_, j) => j !== i)); }} style={{ border: "none", background: "none", cursor: "pointer", color: barvy.textSlaby }}><i className="ti ti-x" /></button>
              </span>
            ))}
          </div>
        )}
        {chyba && <div style={{ margin: "0 16px 8px", color: barvy.chyba, fontSize: 13 }}>{chyba}</div>}
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 16px", borderTop: `1px solid ${barvy.okraj}` }}>
          <button type="button" onClick={odeslat} disabled={odesilam || nahravam}
            style={{ background: barvy.primarni, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, fontSize: 14, cursor: odesilam ? "wait" : "pointer", fontFamily: pismo, opacity: odesilam || nahravam ? 0.65 : 1 }}>
            <i className="ti ti-send" /> {odesilam ? "Odesílám…" : "Odeslat"}
          </button>
          <button type="button" onClick={() => souborRef.current?.click()} disabled={nahravam}
            style={{ border: `1px solid ${barvy.okraj}`, background: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: pismo, color: barvy.text }}>
            <i className="ti ti-paperclip" /> {nahravam ? "Nahrávám…" : "Přiložit"}
          </button>
          <input ref={souborRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { pridej([...e.target.files]); e.target.value = ""; }} />
          <span style={{ flex: 1 }} />
          <button type="button" onClick={zavrit} style={{ border: "none", background: "none", color: barvy.primarni, cursor: "pointer", fontFamily: pismo, fontSize: 13 }}>Uložit koncept</button>
          <button type="button" onClick={zahodit} style={{ border: "none", background: "none", color: barvy.textSlaby, cursor: "pointer", fontFamily: pismo, fontSize: 13 }}>Zahodit</button>
        </div>
      </div>
    </div>
  );
}

// Správa šablon (sdílené pro celou firmu) a podpisů (každý má své).
function Sprava({ druh, polozky, onZmena, currentUser }) {
  const jeSablona = druh === "sablony";
  const tabulka = jeSablona ? "posta_sablony" : "posta_podpisy";
  const [upravy, setUpravy] = useState({}); // id → rozpracované hodnoty
  const [nova, setNova] = useState(null);
  const [chyba, setChyba] = useState(null);
  const predvyplnenyPodpis = `S pozdravem\n\n${currentUser?.name || ""}\n${COMPANY?.name || ""}${COMPANY?.phone ? `\ntel.: ${COMPANY.phone}` : ""}${COMPANY?.web ? `\n${COMPANY.web}` : ""}`;

  const ulozit = async (p) => {
    setChyba(null);
    const radek = jeSablona ? { nazev: p.nazev?.trim() || "Bez názvu", predmet: p.predmet || "", text: p.text || "" } : { nazev: p.nazev?.trim() || "Podpis", text: p.text || "", vychozi: !!p.vychozi };
    if (!jeSablona && radek.vychozi) await supabase.from("posta_podpisy").update({ vychozi: false }).neq("id", p.id || 0);
    const { error } = p.id ? await supabase.from(tabulka).update(radek).eq("id", p.id) : await supabase.from(tabulka).insert(radek);
    if (error) { setChyba("Uložení se nepovedlo: " + error.message); return; }
    if (p.id) setUpravy((u) => { const n = { ...u }; delete n[p.id]; return n; }); else setNova(null);
    onZmena();
  };
  const smazat = async (p) => {
    if (!window.confirm(`Smazat ${jeSablona ? "šablonu" : "podpis"} „${p.nazev}“?`)) return;
    const { error } = await supabase.from(tabulka).delete().eq("id", p.id);
    if (error) { setChyba("Smazání se nepovedlo: " + error.message); return; }
    onZmena();
  };

  const pole = { width: "100%", border: `1px solid ${barvy.okraj}`, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontFamily: pismo, boxSizing: "border-box", color: barvy.text };
  const tl = { border: `1px solid ${barvy.okraj}`, background: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: pismo, color: barvy.text };
  const karta = (p, set, jeNova) => (
    <div key={p.id || "nova"} style={{ border: `1px solid ${barvy.okraj}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
      <input style={{ ...pole, fontWeight: 700 }} value={p.nazev || ""} placeholder={jeSablona ? "Název šablony (např. Poděkování za poptávku)" : "Název podpisu (např. Formální)"} onChange={(e) => set({ ...p, nazev: e.target.value })} />
      {jeSablona && <input style={pole} value={p.predmet || ""} placeholder="Předmět (nepovinné)" onChange={(e) => set({ ...p, predmet: e.target.value })} />}
      <textarea style={{ ...pole, minHeight: jeSablona ? 140 : 110, resize: "vertical", lineHeight: 1.5 }} value={p.text || ""} placeholder={jeSablona ? "Text šablony… {jmeno} = jméno příjemce, {datum} = dnešní datum" : "Text podpisu"} onChange={(e) => set({ ...p, text: e.target.value })} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {!jeSablona && <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, color: barvy.textMekky }}><input type="checkbox" checked={!!p.vychozi} onChange={(e) => set({ ...p, vychozi: e.target.checked })} /> Výchozí — vloží se do každého nového e-mailu</label>}
        <span style={{ flex: 1 }} />
        {jeNova
          ? <button type="button" style={tl} onClick={() => setNova(null)}>Zrušit</button>
          : <button type="button" style={{ ...tl, color: barvy.chyba }} onClick={() => smazat(p)}><i className="ti ti-trash" /> Smazat</button>}
        <button type="button" style={{ ...tl, background: barvy.primarni, color: "#fff", border: "none", fontWeight: 700 }} onClick={() => ulozit(p)}>Uložit</button>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16, background: barvy.pozadi, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: barvy.text }}>{jeSablona ? "Šablony e-mailů" : "Moje podpisy"}</div>
          <div style={{ fontSize: 12.5, color: barvy.textSlaby }}>{jeSablona ? "Sdílené pro celou kancelář. Při psaní je vložíte tlačítkem „Vložit šablonu“." : "Vaše vlastní podpisy. Výchozí se vloží do každého nového e-mailu, při psaní jde přepnout."}</div>
        </div>
        {!nova && <button type="button" style={{ ...tl, background: barvy.primarni, color: "#fff", border: "none", fontWeight: 700 }} onClick={() => setNova(jeSablona ? { nazev: "", predmet: "", text: "Dobrý den,\n\n" } : { nazev: polozky.length ? "" : "Můj podpis", text: predvyplnenyPodpis, vychozi: !polozky.length })}><i className="ti ti-plus" /> {jeSablona ? "Nová šablona" : "Nový podpis"}</button>}
      </div>
      {chyba && <div style={{ color: barvy.chyba, fontSize: 13 }}>{chyba}</div>}
      {nova && karta(nova, setNova, true)}
      {polozky.map((p) => karta(upravy[p.id] || p, (v) => setUpravy((u) => ({ ...u, [p.id]: v })), false))}
      {!polozky.length && !nova && <div style={{ color: barvy.textSlaby, fontSize: 13 }}>{jeSablona ? "Zatím žádné šablony." : "Zatím nemáte podpis — přidejte si ho tlačítkem „Nový podpis“."}</div>}
    </div>
  );
}

export default function Posta({ customers = [], currentUser, otevritId = null }) {
  const [slozka, setSlozka] = useState("prijate");
  const [zpravy, setZpravy] = useState([]);
  const [nacitam, setNacitam] = useState(true);
  const [stahuji, setStahuji] = useState(false);
  const [chyba, setChyba] = useState(null);
  const [vybranaId, setVybranaId] = useState(otevritId); // z oznámení „nový e-mail“ rovnou otevřít zprávu
  const [hledat, setHledat] = useState("");
  const [jenNeprectene, setJenNeprectene] = useState(false);
  const [psani, setPsani] = useState(null);
  const [obrazky, setObrazky] = useState({});
  const [neprecteno, setNeprecteno] = useState(0);
  const [stav, setStav] = useState(null);
  const [uzke, setUzke] = useState(() => window.innerWidth < 900);
  useEffect(() => { const f = () => setUzke(window.innerWidth < 900); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  const zakaznici = useMemo(() => Object.fromEntries((customers || []).filter((c) => c.email).map((c) => [String(c.email).trim().toLowerCase(), c])), [customers]);

  const [koncepty, setKoncepty] = useState([]);
  const [sablony, setSablony] = useState([]);
  const [podpisy, setPodpisy] = useState([]);
  const nactiDoplnky = useCallback(async () => {
    const [k, sa, po] = await Promise.all([
      supabase.from("posta_koncepty").select("*").order("updated_at", { ascending: false }),
      supabase.from("posta_sablony").select("*").order("poradi").order("nazev"),
      supabase.from("posta_podpisy").select("*").order("id"),
    ]);
    setKoncepty(k.data || []); setSablony(sa.data || []); setPodpisy(po.data || []);
  }, []);
  useEffect(() => { Promise.resolve().then(nactiDoplnky); }, [nactiDoplnky]);
  const otevriKoncept = (k) => setPsani({ titulek: "Rozepsaný e-mail", konceptId: k.id, komu: k.komu, kopie: k.kopie, predmet: k.predmet, telo: k.telo, citace: k.citace, podpisId: k.podpis_id ?? "", prilohy: k.prilohy || [], odpovedNaId: k.odpoved_na_id });
  const smazatKoncept = async (k) => {
    if (!window.confirm("Smazat rozepsaný e-mail?")) return;
    await supabase.from("posta_koncepty").delete().eq("id", k.id);
    nactiDoplnky();
  };

  const nacti = useCallback(async () => {
    if (slozka === "rozepsane" || slozka === "sablony" || slozka === "podpisy") { setNacitam(false); return; }
    const [{ data, error }, { count }, { data: st }] = await Promise.all([
      supabase.from("posta_zpravy").select("id, slozka, od_email, od_jmeno, komu, predmet, datum, nahled, precteno, oznaceno, prilohy, customer_id")
        .eq("slozka", slozka).eq("smazano", false).order("datum", { ascending: false }).limit(500),
      supabase.from("posta_zpravy").select("id", { count: "exact", head: true }).eq("slozka", "prijate").eq("smazano", false).eq("precteno", false),
      supabase.from("posta_stav").select("*"),
    ]);
    if (error) setChyba(error.message); else setZpravy(data || []);
    setNeprecteno(count || 0);
    setStav(st || []);
    setNacitam(false);
  }, [slozka]);

  // stahování nezávisí na otevřené složce (jinak by se pošta stahovala při každém přepnutí)
  const nactiRef = useRef(nacti);
  useEffect(() => { nactiRef.current = nacti; }, [nacti]);
  const stahni = useCallback(async (tichy = false) => {
    setStahuji(true); if (!tichy) setChyba(null);
    try {
      for (const sl of ["prijate", "odeslane"]) {
        for (let i = 0; i < 20; i++) {
          const r = await volej("sync", { slozka: sl });
          if (r.nove) await nactiRef.current();
          if (!r.zbyva) break;
        }
      }
      setChyba(null);
    } catch (e) { setChyba("Stažení pošty se nepovedlo: " + e.message); }
    setStahuji(false);
    nactiRef.current();
  }, []);

  useEffect(() => { Promise.resolve().then(nacti); }, [nacti]);
  const zmenSlozku = (id) => { if (id === slozka) return; setNacitam(true); setVybranaId(null); setSlozka(id); };
  // při otevření a pak každé 2 minuty stáhnout nové zprávy ze serveru
  useEffect(() => {
    const t0 = setTimeout(() => stahni(true), 0);
    const t = setInterval(() => { if (!document.hidden) stahni(true); }, 120_000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [stahni]);

  const [nactenyDetail, setDetail] = useState(null);
  const detail = nactenyDetail && nactenyDetail.id === vybranaId ? nactenyDetail : null;
  useEffect(() => {
    if (!vybranaId) return;
    let zruseno = false;
    supabase.from("posta_zpravy").select("*").eq("id", vybranaId).single().then(({ data }) => {
      if (zruseno || !data) return;
      setDetail(data);
      if (!data.precteno) {
        setZpravy((z) => z.map((x) => x.id === data.id ? { ...x, precteno: true } : x));
        setNeprecteno((n) => Math.max(0, n - 1));
        volej("precteno", { id: data.id, precteno: true }).catch(() => supabase.from("posta_zpravy").update({ precteno: true }).eq("id", data.id));
      }
    });
    return () => { zruseno = true; };
  }, [vybranaId]);

  const zobrazene = useMemo(() => {
    const q = hledat.trim().toLowerCase();
    return zpravy.filter((z) => (!jenNeprectene || !z.precteno)
      && (!q || [z.od_email, z.od_jmeno, z.predmet, z.nahled, kratkaAdresa(z.komu)].join(" ").toLowerCase().includes(q)));
  }, [zpravy, hledat, jenNeprectene]);

  const citace = (d) => `\n\n\n-------- Původní zpráva --------\nOd: ${d.od_jmeno ? `${d.od_jmeno} <${d.od_email}>` : d.od_email}\nDatum: ${fmtDlouze(d.datum)}\nPředmět: ${d.predmet || ""}\nKomu: ${seznamAdres(d.komu)}\n\n${(d.text || (d.nahled || "")).split("\n").map((r) => "> " + r).join("\n")}`;
  const sPredponou = (p, s) => (new RegExp(`^${p}:`, "i").test(s || "") ? s : `${p}: ${s || ""}`);
  const odpovedet = (vsem) => {
    const d = detail; if (!d) return;
    const ja = new Set(); // vlastní adresu z kopie vyřadí server (je to odesílatel), stačí nevracet odesílatele dvakrát
    const komu = d.slozka === "odeslane" ? seznamAdres(d.komu) : (d.od_jmeno ? `${d.od_jmeno} <${d.od_email}>` : d.od_email);
    const kopie = vsem ? [...(d.slozka === "odeslane" ? [] : d.komu || []), ...(d.kopie || [])].filter((x) => x.email !== d.od_email && !ja.has(x.email)).map((x) => x.email).join(", ") : "";
    setPsani({ titulek: vsem ? "Odpovědět všem" : "Odpovědět", komu, kopie, predmet: sPredponou("Re", d.predmet), citace: citace(d), odpovedNaId: d.id });
  };
  const preposlat = () => {
    const d = detail; if (!d) return;
    setPsani({ titulek: "Přeposlat", predmet: sPredponou("Fwd", d.predmet), citace: citace(d), prilohy: (d.prilohy || []).filter((p) => p.cesta && !p.cid) });
  };
  const smazat = async () => {
    const d = detail; if (!d || !window.confirm("Přesunout zprávu do koše?")) return;
    try {
      await volej("smazat", { id: d.id });
      setZpravy((z) => z.filter((x) => x.id !== d.id)); setVybranaId(null);
    } catch (e) { alert("Smazání se nepovedlo: " + e.message); }
  };
  const nastavPrecteno = async (z, hodnota) => {
    setZpravy((x) => x.map((y) => y.id === z.id ? { ...y, precteno: hodnota } : y));
    setNeprecteno((n) => Math.max(0, n + (hodnota ? -1 : 1)));
    try { await volej("precteno", { id: z.id, precteno: hodnota }); } catch { /* příznak v appce zůstane */ }
  };

  const posledniSync = (stav || []).map((s) => s.synchronizovano_at).filter(Boolean).sort().pop();
  const zakaznikZpravy = (z) => zakaznici[(z.slozka === "odeslane" ? z.komu?.[0]?.email : z.od_email) || ""] || (z.customer_id && (customers || []).find((c) => c.id === z.customer_id)) || null;

  const tlacitko = { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${barvy.okraj}`, background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", fontFamily: pismo, color: barvy.text };

  const panelSlozek = (
    <div className="posta-slozky" style={{ width: uzke ? "auto" : 210, flexShrink: 0, display: "flex", flexDirection: uzke ? "row" : "column", gap: 4, flexWrap: "wrap" }}>
      <button type="button" className="posta-novy" aria-label="Nový e-mail" onClick={() => setPsani({})} style={{ ...tlacitko, background: barvy.primarni, color: "#fff", border: "none", fontWeight: 700, padding: "10px 14px", justifyContent: "center", marginBottom: uzke ? 0 : 10 }}>
        <i className="ti ti-pencil" /> <span>Nový e-mail</span>
      </button>
      {SLOZKY.map((s) => (
        <button key={s.id} type="button" onClick={() => zmenSlozku(s.id)}
          style={{ display: "flex", alignItems: "center", gap: 10, border: "none", borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontFamily: pismo, fontSize: 14, textAlign: "left",
            background: slozka === s.id ? "#E6EEF5" : "transparent", color: slozka === s.id ? barvy.primarni : barvy.text, fontWeight: slozka === s.id ? 700 : 500 }}>
          <i className={`ti ${s.ikona}`} style={{ fontSize: 18 }} />
          <span style={{ flex: 1 }}>{s.nazev}</span>
          {s.id === "prijate" && neprecteno > 0 && <span style={{ fontWeight: 700, color: barvy.primarni }}>{neprecteno}</span>}
          {s.id === "rozepsane" && koncepty.length > 0 && <span style={{ color: barvy.textSlaby }}>{koncepty.length}</span>}
        </button>
      ))}
      {!uzke && <div style={{ height: 1, background: barvy.okraj, margin: "8px 4px" }} />}
      {NASTAVENI.map((s) => (
        <button key={s.id} type="button" onClick={() => zmenSlozku(s.id)}
          style={{ display: "flex", alignItems: "center", gap: 10, border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontFamily: pismo, fontSize: 13.5, textAlign: "left",
            background: slozka === s.id ? "#E6EEF5" : "transparent", color: slozka === s.id ? barvy.primarni : barvy.textMekky, fontWeight: slozka === s.id ? 700 : 500 }}>
          <i className={`ti ${s.ikona}`} style={{ fontSize: 17 }} /> {s.nazev}
        </button>
      ))}
      {!uzke && (
        <div style={{ marginTop: 16, fontSize: 11.5, color: barvy.textSlaby, lineHeight: 1.5 }}>
          {stahuji ? "Stahuji novou poštu…" : posledniSync ? `Staženo ${fmtKratce(posledniSync)}` : ""}
          {stav?.[0]?.schranka && <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{stav[0].schranka}</div>}
        </div>
      )}
    </div>
  );

  const seznam = (
    <div style={{ width: uzke ? "100%" : 360, flexShrink: 0, borderRight: uzke ? "none" : `1px solid ${barvy.okraj}`, display: "flex", flexDirection: "column", minHeight: 0, background: "#fff" }}>
      <div style={{ display: "flex", gap: 6, padding: 10, borderBottom: `1px solid ${barvy.okrajJemny}` }}>
        <input value={hledat} onChange={(e) => setHledat(e.target.value)} placeholder="Hledat v poště…" aria-label="Hledat v poště"
          style={{ flex: 1, border: `1px solid ${barvy.okraj}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: pismo, minWidth: 0 }} />
        <button type="button" onClick={() => stahni(false)} disabled={stahuji} title="Stáhnout novou poštu" aria-label="Stáhnout novou poštu" style={{ ...tlacitko, padding: "7px 10px" }}>
          <i className={`ti ti-refresh`} style={stahuji ? { animation: "spin 1s linear infinite" } : undefined} />
        </button>
      </div>
      {slozka === "prijate" && (
        <div style={{ display: "flex", gap: 14, padding: "6px 12px", fontSize: 12.5, borderBottom: `1px solid ${barvy.okrajJemny}` }}>
          {[[false, "Vše"], [true, "Nepřečtené"]].map(([v, t]) => (
            <button key={t} type="button" onClick={() => setJenNeprectene(v)} style={{ border: "none", background: "none", padding: "2px 0", cursor: "pointer", fontFamily: pismo, fontSize: 12.5, color: jenNeprectene === v ? barvy.primarni : barvy.textSlaby, fontWeight: jenNeprectene === v ? 700 : 500, borderBottom: jenNeprectene === v ? `2px solid ${barvy.primarni}` : "2px solid transparent" }}>{t}</button>
          ))}
        </div>
      )}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {nacitam ? <div style={{ padding: 20, color: barvy.textSlaby, fontSize: 13 }}>Načítám…</div>
          : !zobrazene.length ? <div style={{ padding: 20, color: barvy.textSlaby, fontSize: 13 }}>{stahuji ? "Stahuji poštu ze serveru…" : hledat ? "Nic nenalezeno." : "Žádné zprávy."}</div>
          : zobrazene.map((z) => {
            const zak = zakaznikZpravy(z);
            const aktivni = z.id === vybranaId;
            return (
              <div key={z.id} className="posta-radek" role="button" tabIndex={0} onClick={() => setVybranaId(z.id)} onKeyDown={(e) => { if (e.key === "Enter") setVybranaId(z.id); }}
                style={{ padding: "10px 12px 10px 14px", borderBottom: `1px solid ${barvy.okrajJemny}`, cursor: "pointer", position: "relative",
                  background: aktivni ? "#E6EEF5" : "#fff", borderLeft: `3px solid ${!z.precteno ? barvy.primarni : "transparent"}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span className="posta-od" style={{ flex: 1, fontSize: 14, fontWeight: z.precteno ? 500 : 700, color: barvy.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {slozka === "odeslane" ? `Komu: ${kratkaAdresa(z.komu)}` : (z.od_jmeno || z.od_email)}
                  </span>
                  <span style={{ fontSize: 12, color: !z.precteno ? barvy.primarni : barvy.textSlaby, fontWeight: z.precteno ? 400 : 700, flexShrink: 0 }}>{fmtKratce(z.datum)}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="posta-predmet" style={{ flex: 1, fontSize: 13, color: z.precteno ? barvy.textMekky : barvy.primarni, fontWeight: z.precteno ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.predmet || "(bez předmětu)"}</span>
                  {(z.prilohy || []).some((p) => !p.cid) && <i className="ti ti-paperclip" style={{ color: barvy.textSlaby, fontSize: 14 }} title="Má přílohu" />}
                </div>
                <div className="posta-nahled" style={{ fontSize: 12, color: barvy.textSlaby, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.nahled}</div>
                {zak && <span style={{ display: "inline-block", marginTop: 4, fontSize: 11, background: "#FFF4E8", color: "#9A4A06", borderRadius: 4, padding: "1px 6px" }}><i className="ti ti-user" /> {zak.name}</span>}
              </div>
            );
          })}
      </div>
    </div>
  );

  const seznamKonceptu = (
    <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
      {!koncepty.length ? <div style={{ padding: 20, color: barvy.textSlaby, fontSize: 13 }}>Žádné rozepsané e-maily. Co začnete psát, se tu samo uloží.</div>
        : koncepty.map((k) => (
          <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${barvy.okrajJemny}` }}>
            <div role="button" tabIndex={0} onClick={() => otevriKoncept(k)} onKeyDown={(e) => { if (e.key === "Enter") otevriKoncept(k); }} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 14, color: barvy.chyba, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>[Koncept] <span style={{ color: barvy.text }}>{k.komu || "(bez příjemce)"}</span></span>
                <span style={{ fontSize: 12, color: barvy.textSlaby }}>{fmtKratce(k.updated_at)}</span>
              </div>
              <div style={{ fontSize: 13, color: barvy.textMekky, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.predmet || "(bez předmětu)"}</div>
              <div style={{ fontSize: 12, color: barvy.textSlaby, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(k.telo || "").replace(/s+/g, " ").slice(0, 160)}</div>
            </div>
            <button type="button" onClick={() => smazatKoncept(k)} aria-label="Smazat koncept" title="Smazat koncept" style={{ border: "none", background: "none", cursor: "pointer", color: barvy.textSlaby, fontSize: 17 }}><i className="ti ti-trash" /></button>
          </div>
        ))}
    </div>
  );

  const cteni = detail ? (
    <div className="posta-cteni" style={{ flex: 1, minWidth: 0, overflowY: "auto", background: "#fff", padding: uzke ? 12 : "16px 24px" }}>
      <div className="posta-lista" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {uzke && <button type="button" aria-label="Zpět na seznam" onClick={() => setVybranaId(null)} style={tlacitko}><i className="ti ti-arrow-left" /> <span className="posta-popis">Zpět</span></button>}
        <button type="button" aria-label="Odpovědět" title="Odpovědět" onClick={() => odpovedet(false)} style={tlacitko}><i className="ti ti-arrow-back-up" /> <span className="posta-popis">Odpovědět</span></button>
        <button type="button" aria-label="Odpovědět všem" title="Odpovědět všem" onClick={() => odpovedet(true)} style={tlacitko}><i className="ti ti-arrow-back-up-double" /> <span className="posta-popis">Všem</span></button>
        <button type="button" aria-label="Přeposlat" title="Přeposlat" onClick={preposlat} style={tlacitko}><i className="ti ti-arrow-forward-up" /> <span className="posta-popis">Přeposlat</span></button>
        <button type="button" aria-label="Označit jako nepřečtené" title="Označit jako nepřečtené" onClick={() => { nastavPrecteno(detail, false); setVybranaId(null); }} style={tlacitko}><i className="ti ti-mail" /> <span className="posta-popis">Nepřečtené</span></button>
        <button type="button" aria-label="Smazat" title="Smazat" onClick={smazat} style={{ ...tlacitko, color: barvy.chyba }}><i className="ti ti-trash" /> <span className="posta-popis">Smazat</span></button>
      </div>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: barvy.text, margin: "0 0 12px", wordBreak: "break-word" }}>{detail.predmet || "(bez předmětu)"}</h2>
      <div className="posta-hlavicka" style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: barvy.primarni, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>
          {(detail.od_jmeno || detail.od_email || "?").trim().charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: barvy.textMekky, lineHeight: 1.5 }}>
          <div style={{ color: barvy.text, fontSize: 14 }}><b>{detail.od_jmeno || detail.od_email}</b> {detail.od_jmeno && <span style={{ color: barvy.textSlaby }}>&lt;{detail.od_email}&gt;</span>}</div>
          <div style={{ wordBreak: "break-word" }}>Komu: {seznamAdres(detail.komu)}</div>
          {detail.kopie?.length > 0 && <div style={{ wordBreak: "break-word" }}>Kopie: {seznamAdres(detail.kopie)}</div>}
          {zakaznikZpravy(detail) && <div style={{ color: "#9A4A06" }}><i className="ti ti-user" /> Zákazník: {zakaznikZpravy(detail).name}</div>}
        </div>
        <div className="posta-datum" style={{ fontSize: 12, color: barvy.textSlaby, flexShrink: 0 }}>{fmtDlouze(detail.datum)}</div>
      </div>
      <Prilohy prilohy={detail.prilohy} />
      {detail.html && !obrazky[detail.id] && /<img[^>]+src=["']?https?:/i.test(detail.html) && (
        <div style={{ background: barvy.pozadi, borderRadius: 6, padding: "6px 10px", fontSize: 12.5, color: barvy.textMekky, margin: "8px 0" }}>
          Obrázky z internetu jsou kvůli soukromí zablokované. <button type="button" onClick={() => setObrazky((o) => ({ ...o, [detail.id]: true }))} style={{ border: "none", background: "none", color: barvy.primarni, cursor: "pointer", fontWeight: 700, fontFamily: pismo, fontSize: 12.5, padding: 0 }}>Zobrazit obrázky</button>
        </div>
      )}
      <div style={{ borderTop: `1px solid ${barvy.okrajJemny}`, paddingTop: 14, marginTop: 8 }}>
        <TeloZpravy zprava={detail} obrazky={!!obrazky[detail.id]} />
      </div>
    </div>
  ) : (
    <div style={{ flex: 1, display: uzke ? "none" : "flex", alignItems: "center", justifyContent: "center", color: barvy.textSlaby, fontSize: 14, flexDirection: "column", gap: 8 }}>
      <i className="ti ti-mail-opened" style={{ fontSize: 44, opacity: 0.4 }} />
      Vyberte zprávu ke čtení
    </div>
  );

  return (
    <div style={{ fontFamily: pismo, textAlign: "left", display: "flex", flexDirection: "column", gap: 10, height: uzke ? "auto" : "calc(100vh - 120px)", minHeight: 480 }}>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}" + POSTA_MOBIL}</style>
      {chyba && <div style={{ background: "#FEF3F2", color: barvy.chyba, border: "1px solid #FECDCA", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>{chyba}</div>}
      <div style={{ display: "flex", flexDirection: uzke ? "column" : "row", gap: uzke ? 10 : 14, flex: 1, minHeight: 0 }}>
        {panelSlozek}
        <div style={{ flex: 1, display: "flex", minHeight: 0, border: `1px solid ${barvy.okraj}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          {slozka === "rozepsane" ? seznamKonceptu
            : slozka === "sablony" ? <Sprava key="s" druh="sablony" polozky={sablony} onZmena={nactiDoplnky} currentUser={currentUser} />
            : slozka === "podpisy" ? <Sprava key="p" druh="podpisy" polozky={podpisy} onZmena={nactiDoplnky} currentUser={currentUser} />
            : <>{(!uzke || !detail) && seznam}{(!uzke || detail) && cteni}</>}
        </div>
      </div>
      {psani && <Psani predloha={psani} sablony={sablony} podpisy={podpisy} onKoncept={nactiDoplnky} onZavrit={() => { setPsani(null); nactiDoplnky(); }} onOdeslano={() => { setPsani(null); nactiDoplnky(); if (slozka === "odeslane") nacti(); }} />}
    </div>
  );
}
