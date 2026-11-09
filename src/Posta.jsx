// Pošta — firemní e-mailová schránka u WEDOSu přímo v appce (na principu Outlooku):
// složky vlevo, seznam zpráv uprostřed, čtení vpravo, odpověď / přeposlání / nový e-mail.
// Stahování a odesílání dělá edge funkce `posta` (IMAP + SMTP WEDOS), zprávy jsou
// v tabulce posta_zpravy, přílohy v bucketu `posta`.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { barvy, pismo } from "./ui.js";

const SLOZKY = [
  { id: "prijate", nazev: "Doručená pošta", ikona: "ti-inbox" },
  { id: "odeslane", nazev: "Odeslaná pošta", ikona: "ti-send" },
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
  html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:14px;color:#1F2937;margin:0;word-break:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
  return <IframeAutoVyska html={html} />;
}

function IframeAutoVyska({ html }) {
  const ref = useRef(null);
  const [vyska, setVyska] = useState(300);
  const prizpusob = () => {
    try { const d = ref.current?.contentDocument; if (d) setVyska(Math.max(120, d.documentElement.scrollHeight + 8)); } catch { /* jiný původ */ }
  };
  // allow-same-origin jen kvůli měření výšky; skripty zůstávají zakázané
  return <iframe ref={ref} title="Obsah e-mailu" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={html} onLoad={prizpusob}
    style={{ width: "100%", height: vyska, border: "none", background: "#fff" }} />;
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

function Psani({ predloha, onZavrit, onOdeslano }) {
  const [komu, setKomu] = useState(predloha.komu || "");
  const [kopie, setKopie] = useState(predloha.kopie || "");
  const [predmet, setPredmet] = useState(predloha.predmet || "");
  const [text, setText] = useState(predloha.text || "");
  const [prilohy, setPrilohy] = useState(predloha.prilohy || []); // [{nazev, typ, velikost, cesta}]
  const [nahravam, setNahravam] = useState(false);
  const [odesilam, setOdesilam] = useState(false);
  const [chyba, setChyba] = useState(null);
  const souborRef = useRef(null);
  const textRef = useRef(null);
  useEffect(() => { (predloha.komu ? textRef.current : null)?.setSelectionRange?.(0, 0); }, [predloha]);

  const pridej = async (files) => {
    setNahravam(true); setChyba(null);
    try {
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) { setChyba(`${f.name} je větší než 15 MB.`); continue; }
        const cesta = `odchozi/${crypto.randomUUID()}/${f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_")}`;
        const { error } = await supabase.storage.from("posta").upload(cesta, f, { contentType: f.type || "application/octet-stream" });
        if (error) { setChyba(`Přílohu ${f.name} se nepodařilo nahrát: ${error.message}`); continue; }
        setPrilohy((p) => [...p, { nazev: f.name, typ: f.type, velikost: f.size, cesta }]);
      }
    } finally { setNahravam(false); }
  };

  const odeslat = async () => {
    if (!komu.trim()) { setChyba("Vyplňte příjemce."); return; }
    if (!predmet.trim() && !window.confirm("Odeslat e-mail bez předmětu?")) return;
    setOdesilam(true); setChyba(null);
    try {
      const r = await volej("odeslat", { komu, kopie, predmet, text, odpovedNaId: predloha.odpovedNaId || null, prilohy });
      onOdeslano(r);
    } catch (e) { setChyba(e.message); setOdesilam(false); }
  };

  const pole = { width: "100%", border: "none", borderBottom: `1px solid ${barvy.okrajJemny}`, padding: "9px 4px", fontSize: 14, fontFamily: pismo, outline: "none", background: "transparent", color: barvy.text, boxSizing: "border-box" };
  const radek = (popis, hodnota, set, ph) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 60, fontSize: 13, color: barvy.textSlaby }}>{popis}</span>
      <input style={pole} value={hodnota} onChange={(e) => set(e.target.value)} placeholder={ph} />
    </label>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "min(760px, 100%)", maxHeight: "94vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,.25)", fontFamily: pismo }}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${barvy.okraj}` }}>
          <b style={{ flex: 1, fontSize: 15, color: barvy.text }}>{predloha.titulek || "Nová zpráva"}</b>
          <button type="button" onClick={onZavrit} aria-label="Zavřít" style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: barvy.textSlaby }}><i className="ti ti-x" /></button>
        </div>
        <div style={{ padding: "4px 16px" }}>
          {radek("Komu", komu, setKomu, "adresa@example.cz, další…")}
          {radek("Kopie", kopie, setKopie, "")}
          {radek("Předmět", predmet, setPredmet, "")}
        </div>
        <textarea ref={textRef} value={text} onChange={(e) => setText(e.target.value)} autoFocus={!!predloha.komu}
          style={{ flex: 1, minHeight: 260, margin: "8px 16px", border: "none", outline: "none", resize: "vertical", fontFamily: pismo, fontSize: 14, lineHeight: 1.5, color: barvy.text }} />
        {prilohy.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 16px 8px" }}>
            {prilohy.map((p, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: barvy.pozadi, borderRadius: 6, padding: "4px 8px", fontSize: 12.5 }}>
                <i className="ti ti-paperclip" /> {p.nazev} <span style={{ color: barvy.textSlaby }}>{fmtVelikost(p.velikost || 0)}</span>
                <button type="button" aria-label={`Odebrat ${p.nazev}`} onClick={() => setPrilohy((x) => x.filter((_, j) => j !== i))} style={{ border: "none", background: "none", cursor: "pointer", color: barvy.textSlaby }}><i className="ti ti-x" /></button>
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
          <button type="button" onClick={onZavrit} style={{ border: "none", background: "none", color: barvy.textSlaby, cursor: "pointer", fontFamily: pismo, fontSize: 13 }}>Zahodit</button>
        </div>
      </div>
    </div>
  );
}

export default function Posta({ customers = [] }) {
  const [slozka, setSlozka] = useState("prijate");
  const [zpravy, setZpravy] = useState([]);
  const [nacitam, setNacitam] = useState(true);
  const [stahuji, setStahuji] = useState(false);
  const [chyba, setChyba] = useState(null);
  const [vybranaId, setVybranaId] = useState(null);
  const [hledat, setHledat] = useState("");
  const [jenNeprectene, setJenNeprectene] = useState(false);
  const [psani, setPsani] = useState(null);
  const [obrazky, setObrazky] = useState({});
  const [neprecteno, setNeprecteno] = useState(0);
  const [stav, setStav] = useState(null);
  const [uzke, setUzke] = useState(() => window.innerWidth < 900);
  useEffect(() => { const f = () => setUzke(window.innerWidth < 900); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  const zakaznici = useMemo(() => Object.fromEntries((customers || []).filter((c) => c.email).map((c) => [String(c.email).trim().toLowerCase(), c])), [customers]);

  const nacti = useCallback(async () => {
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

  const stahni = useCallback(async (tichy = false) => {
    setStahuji(true); if (!tichy) setChyba(null);
    try {
      for (const sl of ["prijate", "odeslane"]) {
        for (let i = 0; i < 20; i++) {
          const r = await volej("sync", { slozka: sl });
          if (r.nove) await nacti();
          if (!r.zbyva) break;
        }
      }
      setChyba(null);
    } catch (e) { setChyba("Stažení pošty se nepovedlo: " + e.message); }
    setStahuji(false);
    nacti();
  }, [nacti]);

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
    setPsani({ titulek: vsem ? "Odpovědět všem" : "Odpovědět", komu, kopie, predmet: sPredponou("Re", d.predmet), text: citace(d), odpovedNaId: d.id });
  };
  const preposlat = () => {
    const d = detail; if (!d) return;
    setPsani({ titulek: "Přeposlat", predmet: sPredponou("Fwd", d.predmet), text: citace(d), prilohy: (d.prilohy || []).filter((p) => p.cesta && !p.cid) });
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
    <div style={{ width: uzke ? "auto" : 210, flexShrink: 0, display: "flex", flexDirection: uzke ? "row" : "column", gap: 4, flexWrap: "wrap" }}>
      <button type="button" onClick={() => setPsani({})} style={{ ...tlacitko, background: barvy.primarni, color: "#fff", border: "none", fontWeight: 700, padding: "10px 14px", justifyContent: "center", marginBottom: uzke ? 0 : 10 }}>
        <i className="ti ti-pencil" /> Nový e-mail
      </button>
      {SLOZKY.map((s) => (
        <button key={s.id} type="button" onClick={() => zmenSlozku(s.id)}
          style={{ display: "flex", alignItems: "center", gap: 10, border: "none", borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontFamily: pismo, fontSize: 14, textAlign: "left",
            background: slozka === s.id ? "#E6EEF5" : "transparent", color: slozka === s.id ? barvy.primarni : barvy.text, fontWeight: slozka === s.id ? 700 : 500 }}>
          <i className={`ti ${s.ikona}`} style={{ fontSize: 18 }} />
          <span style={{ flex: 1 }}>{s.nazev}</span>
          {s.id === "prijate" && neprecteno > 0 && <span style={{ fontWeight: 700, color: barvy.primarni }}>{neprecteno}</span>}
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
              <div key={z.id} role="button" tabIndex={0} onClick={() => setVybranaId(z.id)} onKeyDown={(e) => { if (e.key === "Enter") setVybranaId(z.id); }}
                style={{ padding: "10px 12px 10px 14px", borderBottom: `1px solid ${barvy.okrajJemny}`, cursor: "pointer", position: "relative",
                  background: aktivni ? "#E6EEF5" : "#fff", borderLeft: `3px solid ${!z.precteno ? barvy.primarni : "transparent"}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: z.precteno ? 500 : 700, color: barvy.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {slozka === "odeslane" ? `Komu: ${kratkaAdresa(z.komu)}` : (z.od_jmeno || z.od_email)}
                  </span>
                  <span style={{ fontSize: 12, color: !z.precteno ? barvy.primarni : barvy.textSlaby, fontWeight: z.precteno ? 400 : 700, flexShrink: 0 }}>{fmtKratce(z.datum)}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ flex: 1, fontSize: 13, color: z.precteno ? barvy.textMekky : barvy.primarni, fontWeight: z.precteno ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.predmet || "(bez předmětu)"}</span>
                  {(z.prilohy || []).some((p) => !p.cid) && <i className="ti ti-paperclip" style={{ color: barvy.textSlaby, fontSize: 14 }} title="Má přílohu" />}
                </div>
                <div style={{ fontSize: 12, color: barvy.textSlaby, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.nahled}</div>
                {zak && <span style={{ display: "inline-block", marginTop: 4, fontSize: 11, background: "#FFF4E8", color: "#9A4A06", borderRadius: 4, padding: "1px 6px" }}><i className="ti ti-user" /> {zak.name}</span>}
              </div>
            );
          })}
      </div>
    </div>
  );

  const cteni = detail ? (
    <div style={{ flex: 1, minWidth: 0, overflowY: "auto", background: "#fff", padding: uzke ? 12 : "16px 24px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {uzke && <button type="button" onClick={() => setVybranaId(null)} style={tlacitko}><i className="ti ti-arrow-left" /> Zpět</button>}
        <button type="button" onClick={() => odpovedet(false)} style={tlacitko}><i className="ti ti-arrow-back-up" /> Odpovědět</button>
        <button type="button" onClick={() => odpovedet(true)} style={tlacitko}><i className="ti ti-arrow-back-up-double" /> Všem</button>
        <button type="button" onClick={preposlat} style={tlacitko}><i className="ti ti-arrow-forward-up" /> Přeposlat</button>
        <button type="button" onClick={() => { nastavPrecteno(detail, false); setVybranaId(null); }} style={tlacitko}><i className="ti ti-mail" /> Nepřečtené</button>
        <button type="button" onClick={smazat} style={{ ...tlacitko, color: barvy.chyba }}><i className="ti ti-trash" /> Smazat</button>
      </div>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: barvy.text, margin: "0 0 12px", wordBreak: "break-word" }}>{detail.predmet || "(bez předmětu)"}</h2>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: barvy.primarni, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>
          {(detail.od_jmeno || detail.od_email || "?").trim().charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: barvy.textMekky, lineHeight: 1.5 }}>
          <div style={{ color: barvy.text, fontSize: 14 }}><b>{detail.od_jmeno || detail.od_email}</b> {detail.od_jmeno && <span style={{ color: barvy.textSlaby }}>&lt;{detail.od_email}&gt;</span>}</div>
          <div style={{ wordBreak: "break-word" }}>Komu: {seznamAdres(detail.komu)}</div>
          {detail.kopie?.length > 0 && <div style={{ wordBreak: "break-word" }}>Kopie: {seznamAdres(detail.kopie)}</div>}
          {zakaznikZpravy(detail) && <div style={{ color: "#9A4A06" }}><i className="ti ti-user" /> Zákazník: {zakaznikZpravy(detail).name}</div>}
        </div>
        <div style={{ fontSize: 12, color: barvy.textSlaby, flexShrink: 0 }}>{fmtDlouze(detail.datum)}</div>
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
    <div style={{ fontFamily: pismo, display: "flex", flexDirection: "column", gap: 10, height: uzke ? "auto" : "calc(100vh - 120px)", minHeight: 480 }}>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      {chyba && <div style={{ background: "#FEF3F2", color: barvy.chyba, border: "1px solid #FECDCA", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>{chyba}</div>}
      <div style={{ display: "flex", flexDirection: uzke ? "column" : "row", gap: uzke ? 10 : 14, flex: 1, minHeight: 0 }}>
        {panelSlozek}
        <div style={{ flex: 1, display: "flex", minHeight: 0, border: `1px solid ${barvy.okraj}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          {(!uzke || !detail) && seznam}
          {(!uzke || detail) && cteni}
        </div>
      </div>
      {psani && <Psani predloha={psani} onZavrit={() => setPsani(null)} onOdeslano={() => { setPsani(null); if (slozka === "odeslane") nacti(); }} />}
    </div>
  );
}
