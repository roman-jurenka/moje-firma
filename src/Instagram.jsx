// ─── Instagram: plán příspěvků z fotek realizací ────────────────────────────
// Projde fotky zakázek, navrhne plán na několik týdnů (karusel realizace, tip
// měsíce, před a po, zákulisí) s textem a hashtagy. S připojeným firemním
// Instagramem (edge funkce instagram) se zveřejňuje přímo — hned, nebo
// autopilotem v naplánovaný čas — a vrací se statistiky. Bez připojení
// „Sdílet“ v mobilu pošle fotky a text do Instagramu, na počítači se fotky
// stáhnou a text zkopíruje. Logika plánu je v instagramPlan.js.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import * as ui from "./ui.js";
import { OneDriveThumb } from "./storageUrl.jsx";
import { getDirectDownloadUrl } from "./onedrive.js";
import { FORMATY, TRENDY_FORMATU, tematMesice, realizaceZFotek, navrhnoutPlan, klicRealizace, fotkyProFormat, popisek as navrhPopisku, hashtagy as navrhHashtagu } from "./instagramPlan.js";

const DNY_TYDNE = [[1, "Po"], [2, "Út"], [3, "St"], [4, "Čt"], [5, "Pá"], [6, "So"], [0, "Ne"]];
const datumText = (d) => new Date(d + "T12:00:00").toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" });
const dnes = () => new Date().toLocaleDateString("sv-SE");
const nahled = { width: 64, height: 64, objectFit: "cover", borderRadius: 6, display: "block" };

// Uložená „veřejná“ adresa ze soukromého úložiště → dočasný podepsaný odkaz
// (jako ve storageUrl.jsx); adresy odjinud beze změny.
async function podepsanaAdresa(url) {
  const m = String(url || "").split("?")[0].match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!m) return url;
  const { data } = await supabase.storage.from(m[1]).createSignedUrl(decodeURIComponent(m[2]), 600);
  return data?.signedUrl || url;
}

async function souborFotky(f, i) {
  const url = (f.item_id && await getDirectDownloadUrl(f.item_id)) || await podepsanaAdresa(f.url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fotku ${i + 1} se nepodařilo stáhnout`);
  const blob = await r.blob();
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  return new File([blob], `jurenka-elektro-${i + 1}.${ext}`, { type: blob.type || "image/jpeg" });
}

// Instagram bere jen JPEG s poměrem stran 4:5 až 1,91:1 — fotka z mobilu na
// výšku (3:4) by neprošla. Všechny fotky příspěvku se proto oříznou na střed
// na stejný poměr podle první fotky: na výšku 4:5 (1080×1350), jinak 1:1.
async function fotkyProInstagram(soubory) {
  const obrazky = await Promise.all(soubory.map(async (s, i) => {
    try { return await createImageBitmap(s); }
    catch { throw new Error(`Fotku ${i + 1} neumí prohlížeč zpracovat (např. HEIC) — vyberte jinou.`); }
  }));
  const pomer = obrazky[0] && obrazky[0].width < obrazky[0].height ? 4 / 5 : 1;
  const W = 1080, H = Math.round(W / pomer);
  return Promise.all(obrazky.map(async (img, i) => {
    const sw = Math.min(img.width, img.height * pomer), sh = sw / pomer;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    c.getContext("2d").drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
    return new File([blob], `jurenka-elektro-${i + 1}.jpg`, { type: "image/jpeg" });
  }));
}

// Edge funkce instagram; chybová hláška z těla odpovědi (invoke ji jinak schová)
async function volatIg(akce, extra = {}) {
  const { data, error } = await supabase.functions.invoke("instagram", { body: { akce, ...extra } });
  if (error) {
    const telo = await error.context?.json?.().catch(() => null);
    throw new Error(telo?.error || error.message);
  }
  return data;
}

const IG_STATE = "ig_oauth_state";
const REDIRECT = window.location.origin + "/";

export default function Instagram({ currentUser }) {
  const [data, setData] = useState(null);
  const [prispevky, setPrispevky] = useState([]);
  const [chyba, setChyba] = useState("");
  const [info, setInfo] = useState("");
  const [nast, setNast] = useState({ tydnu: 4, dny: [2, 4, 0], cas: "18:30" });
  const [zobrazit, setZobrazit] = useState("plan");
  const [prace, setPrace] = useState(null);

  const nacist = useCallback(async () => {
    const [c, p, f, ig] = await Promise.all([
      supabase.from("contracts").select("id, name, type, address, status"),
      supabase.from("zakazky_prubeh").select("id, nazev, typ, contract_id"),
      supabase.from("contract_photos").select("id, contract_id, prubeh_id, ticket_id, category, url, item_id, storage_path, date, created_at").is("ticket_id", null),
      supabase.from("instagram_prispevky").select("*").order("datum").order("id"),
    ]);
    const e = [c, p, f, ig].find((x) => x.error)?.error;
    if (e) setChyba(e.message);
    setData({ contracts: c.data || [], prubehy: p.data || [], fotky: f.data || [] });
    setPrispevky(ig.data || []);
  }, []);
   
  useEffect(() => { nacist(); }, [nacist]);

  // Přímé propojení: stav účtu, návrat z přihlášení do Instagramu (?code=…&state=ig-…)
  const [ucet, setUcet] = useState(null);
  const nacistUcet = useCallback(() => volatIg("stav").then(setUcet).catch((e) => setUcet({ chyba: e.message })), []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code"), state = q.get("state");
    if (code && state?.startsWith("ig-")) {
      window.history.replaceState(null, "", window.location.pathname);
      let ulozeny = null;
      try { ulozeny = localStorage.getItem(IG_STATE); localStorage.removeItem(IG_STATE); } catch { /* bez úložiště */ }
      if (state !== ulozeny) {
         
        setChyba("Přihlášení do Instagramu se nepodařilo ověřit — zkuste „Připojit Instagram“ znovu.");
        nacistUcet();
        return;
      }
      volatIg("pripojit", { code, redirect_uri: REDIRECT })
        .then((r) => setInfo(`Instagram @${r.username || ""} je připojený. Příspěvky teď jdou zveřejnit přímo odsud.`))
        .catch((e) => setChyba(e.message))
        .finally(nacistUcet);
    } else nacistUcet();
  }, [nacistUcet]);

  const pripojit = () => {
    const state = "ig-" + crypto.randomUUID();
    try { localStorage.setItem(IG_STATE, state); } catch { /* ověření pak selže a nabídne zkusit znovu */ }
    const q = new URLSearchParams({ client_id: ucet.app_id, redirect_uri: REDIRECT, response_type: "code", scope: "instagram_business_basic,instagram_business_content_publish", state });
    window.location.href = `https://www.instagram.com/oauth/authorize?${q}`;
  };
  const odpojit = async () => {
    if (!window.confirm("Odpojit firemní Instagram? Autopilot přestane zveřejňovat.")) return;
    try { await volatIg("odpojit"); nacistUcet(); } catch (e) { setChyba(e.message); }
  };
  const pripojeno = !!ucet?.pripojeno;

  const realizace = useMemo(() => (data ? realizaceZFotek(data) : []), [data]);
  const fotkaPodleId = useMemo(() => new Map((data?.fotky || []).map((f) => [f.id, f])), [data]);
  const realizacePodleKlice = useMemo(() => new Map(realizace.map((r) => [r.key, r])), [realizace]);
  const vPlanu = useMemo(() => new Set(prispevky.map(klicRealizace).filter(Boolean)), [prispevky]);
  const cekajici = realizace.filter((r) => !vPlanu.has(r.key));
  const planovane = prispevky.filter((p) => p.stav !== "zverejneno");
  const zverejnene = prispevky.filter((p) => p.stav === "zverejneno").reverse();

  const vytvoritPlan = async () => {
    setChyba(""); setInfo("");
    const nove = navrhnoutPlan({ realizace, existujici: prispevky, tydnu: nast.tydnu, dny: nast.dny, cas: nast.cas, vytvoril: currentUser?.name || null });
    if (!nove.length) { setInfo("Všechny termíny v plánu už jsou obsazené."); return; }
    const { data: ulozene, error } = await supabase.from("instagram_prispevky").insert(nove).select();
    if (error) { setChyba(error.message); return; }
    setPrispevky((x) => [...x, ...ulozene].sort((a, b) => a.datum.localeCompare(b.datum) || a.id - b.id));
    setInfo(`Přidáno ${ulozene.length} příspěvků do plánu.`);
  };

  const pridatRealizaci = async (r) => {
    const posledni = planovane.at(-1)?.datum;
    const d = new Date((posledni && posledni >= dnes() ? posledni : dnes()) + "T12:00:00");
    d.setDate(d.getDate() + 2);
    const format = fotkyProFormat("pred_po", r.fotky).length ? "pred_po" : "realizace";
    const radek = {
      datum: d.toLocaleDateString("sv-SE"), cas: nast.cas, format, contract_id: r.contract_id, prubeh_id: r.prubeh_id,
      foto_ids: fotkyProFormat(format, r.fotky).map((f) => f.id), popisek: navrhPopisku(format, { druh: r.druh, obec: r.obec, varianta: r.fotky.length }),
      hashtagy: navrhHashtagu(r.druh, r.obec), stav: "planovano", vytvoril: currentUser?.name || null,
    };
    const { data: ulozeny, error } = await supabase.from("instagram_prispevky").insert(radek).select().single();
    if (error) { setChyba(error.message); return; }
    setPrispevky((x) => [...x, ulozeny].sort((a, b) => a.datum.localeCompare(b.datum) || a.id - b.id));
  };

  const ulozit = async (id, patch) => {
    setPrispevky((x) => x.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await supabase.from("instagram_prispevky").update(patch).eq("id", id);
    if (error) setChyba(error.message);
    // autopilot zveřejní připravené fotky — po změně výběru je připravit znovu
    const p = prispevky.find((x) => x.id === id);
    if (!error && patch.foto_ids && p?.automaticky) pripravit({ ...p, ...patch }).catch((e) => setChyba(e.message));
  };

  // Fotky příspěvku oříznout a nahrát do bucketu instagram (odtud si je bere
  // Instagram při zveřejnění). Vrací nové cesty, staré soubory smaže.
  const pripravit = async (p) => {
    const fotky = (p.foto_ids || []).map((id) => fotkaPodleId.get(id)).filter(Boolean).slice(0, 10);
    if (!fotky.length) throw new Error("Příspěvek nemá žádnou fotku.");
    const soubory = await fotkyProInstagram(await Promise.all(fotky.map(souborFotky)));
    const znacka = Date.now();
    const cesty = [];
    for (const [i, s] of soubory.entries()) {
      const cesta = `${p.id}/${znacka}_${i + 1}.jpg`;
      const { error } = await supabase.storage.from("instagram").upload(cesta, s, { contentType: "image/jpeg" });
      if (error) throw new Error("Nahrání fotky se nepodařilo: " + error.message);
      cesty.push(cesta);
    }
    if (p.soubory?.length) await supabase.storage.from("instagram").remove(p.soubory);
    const { error } = await supabase.from("instagram_prispevky").update({ soubory: cesty }).eq("id", p.id);
    if (error) throw new Error(error.message);
    setPrispevky((x) => x.map((y) => (y.id === p.id ? { ...y, soubory: cesty } : y)));
    return cesty;
  };

  const zverejnitTed = async (p) => {
    if (!window.confirm(`Zveřejnit příspěvek na Instagram @${ucet?.username || ""} hned teď?`)) return;
    setChyba(""); setInfo(""); setPrace(p.id);
    try {
      await pripravit(p);
      const r = await volatIg("zverejnit", { id: p.id });
      setPrispevky((x) => x.map((y) => (y.id === p.id ? { ...y, ...r } : y)));
      setInfo("Příspěvek je na Instagramu. 🎉");
    } catch (e) {
      setChyba(e.message);
      setPrispevky((x) => x.map((y) => (y.id === p.id ? { ...y, chyba: e.message } : y)));
    } finally { setPrace(null); }
  };

  const prepnoutAuto = async (p, zapnout) => {
    setChyba(""); setPrace(p.id);
    try {
      if (zapnout) await pripravit(p);
      await ulozit(p.id, { automaticky: zapnout, chyba: null });
    } catch (e) { setChyba(e.message); }
    finally { setPrace(null); }
  };

  const autopilotVse = async () => {
    const k = planovane.filter((p) => !p.automaticky && p.stav === "planovano" && p.foto_ids?.length && p.datum >= dnes());
    if (!k.length) { setInfo("Všechny příspěvky s fotkami už mají autopilota."); return; }
    if (!window.confirm(`Zapnout automatické zveřejnění u ${k.length} příspěvků? Vyjdou samy v naplánovaný den a čas.`)) return;
    setChyba(""); setInfo(`Připravuji fotky 0 / ${k.length}…`);
    let n = 0;
    for (const p of k) {
      try { await pripravit(p); await ulozit(p.id, { automaticky: true, chyba: null }); n++; setInfo(`Připravuji fotky ${n} / ${k.length}…`); }
      catch (e) { setChyba(`${datumText(p.datum)}: ${e.message}`); }
    }
    setInfo(`Autopilot zapnutý u ${n} příspěvků.`);
  };

  const obnovitStatistiky = async () => {
    setChyba("");
    try { const r = await volatIg("statistiky"); await nacist(); setInfo(`Statistiky obnoveny (${r.obnoveno} příspěvků).`); }
    catch (e) { setChyba(e.message); }
  };

  // Co funguje u vás: průměrný dosah a lajky podle formátu
  const vykonFormatu = useMemo(() => {
    const m = new Map();
    for (const p of prispevky) {
      if (p.stav !== "zverejneno" || p.dosah == null) continue;
      const x = m.get(p.format) || { n: 0, dosah: 0, lajky: 0 };
      x.n++; x.dosah += p.dosah || 0; x.lajky += p.lajky || 0;
      m.set(p.format, x);
    }
    return [...m.entries()].map(([f, x]) => ({ f, n: x.n, dosah: Math.round(x.dosah / x.n), lajky: Math.round(x.lajky / x.n) })).sort((a, b) => b.dosah - a.dosah);
  }, [prispevky]);

  const smazat = async (p) => {
    if (!window.confirm(`Smazat příspěvek z ${datumText(p.datum)}?`)) return;
    const { error } = await supabase.from("instagram_prispevky").delete().eq("id", p.id);
    if (error) { setChyba(error.message); return; }
    setPrispevky((x) => x.filter((y) => y.id !== p.id));
  };

  const textPrispevku = (p) => [p.popisek, p.hashtagy].filter(Boolean).join("\n\n");

  const kopirovat = async (p) => {
    try { await navigator.clipboard.writeText(textPrispevku(p)); setInfo("Text příspěvku je zkopírovaný."); }
    catch { setChyba("Text se nepodařilo zkopírovat — označte ho v poli a zkopírujte ručně."); }
  };

  // Mobil: systémové Sdílet s fotkami (vyberete Instagram). Instagram text ze
  // sdílení často zahodí, proto se vždy i zkopíruje — stačí ho vložit.
  // Počítač / appka bez sdílení souborů: fotky se stáhnou a text zkopíruje.
  const sdilet = async (p) => {
    setChyba(""); setInfo(""); setPrace(p.id);
    try {
      const fotky = (p.foto_ids || []).map((id) => fotkaPodleId.get(id)).filter(Boolean);
      const soubory = await fotkyProInstagram(await Promise.all(fotky.map(souborFotky)));
      const text = textPrispevku(p);
      try { await navigator.clipboard.writeText(text); } catch { /* zkopírovat jde i ručně */ }
      if (soubory.length && navigator.canShare?.({ files: soubory })) {
        await navigator.share({ files: soubory, text });
        setInfo("Text je zkopírovaný — v Instagramu ho vložte do popisku. Po zveřejnění klikněte na „Zveřejněno“.");
      } else {
        for (const s of soubory) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(s); a.download = s.name; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        }
        setInfo(`Staženo ${soubory.length} fotek a text je zkopírovaný. Na instagram.com klikněte na Vytvořit, nahrajte fotky a vložte text.`);
      }
    } catch (e) {
      if (e?.name !== "AbortError") setChyba(e?.message || "Sdílení se nepodařilo.");
    } finally { setPrace(null); }
  };

  if (!data) return <div style={{ padding: 24, color: ui.barvy.textMekky }}>Načítám fotky z realizací…</div>;

  const temata = tematMesice();
  const seznam = zobrazit === "plan" ? planovane : zverejnene;

  return (
    <div style={{ textAlign: "left", maxWidth: 980 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={ui.nadpis}><i className="ti ti-brand-instagram" aria-hidden="true"></i> Instagram</h1>
      </div>
      <div style={{ fontSize: 13, color: ui.barvy.textMekky, marginBottom: 16 }}>
        Plán příspěvků z fotek realizací. {realizace.length} realizací s fotkami, {cekajici.length} ještě nemá příspěvek.
      </div>

      {chyba && <div role="alert" style={{ ...ui.karta, padding: 12, borderColor: ui.barvy.chyba, color: ui.barvy.chyba, marginBottom: 12 }}>{chyba}</div>}
      {info && <div role="status" style={{ ...ui.karta, padding: 12, borderColor: ui.barvy.uspech, color: ui.barvy.uspech, marginBottom: 12 }}>{info}</div>}

      {/* Přímé propojení s Instagramem */}
      <div style={{ ...ui.karta, marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <i className="ti ti-brand-instagram" aria-hidden="true" style={{ fontSize: 28, color: pripojeno ? "#C13584" : ui.barvy.textSlaby }}></i>
        <div style={{ flex: 1, minWidth: 200 }}>
          {!ucet ? <span style={{ color: ui.barvy.textMekky }}>Zjišťuji propojení…</span>
            : ucet.chyba ? <span style={{ color: ui.barvy.chyba }}>Propojení nejde ověřit: {ucet.chyba}</span>
            : pripojeno ? (
              <>
                <div style={{ fontWeight: 700 }}>Připojeno: @{ucet.username}</div>
                <div style={{ fontSize: 12, color: ui.barvy.textSlaby }}>Příspěvky jdou zveřejnit přímo odsud, autopilot je vydá sám v naplánovaný čas.</div>
              </>
            ) : !ucet.nastaveno ? (
              <>
                <div style={{ fontWeight: 700 }}>Instagram zatím není propojený</div>
                <div style={{ fontSize: 12, color: ui.barvy.textSlaby }}>Chybí přístupové údaje aplikace na Meta for Developers (INSTAGRAM_APP_ID a INSTAGRAM_APP_SECRET v Supabase). Než budou, funguje sdílení přes mobil.</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>Instagram není připojený</div>
                <div style={{ fontSize: 12, color: ui.barvy.textSlaby }}>Přihlaste se firemním účtem — připojení se dělá jednou, ve webové verzi ProudOS.</div>
              </>
            )}
        </div>
        {pripojeno && <button type="button" style={ui.tlacitko(ui.barvy.akcent)} onClick={autopilotVse}><i className="ti ti-robot" aria-hidden="true"></i> Zapnout autopilota pro celý plán</button>}
        {pripojeno && <button type="button" style={ui.tlacitkoObrys("male")} onClick={odpojit}>Odpojit</button>}
        {ucet?.nastaveno && !pripojeno && <button type="button" style={ui.tlacitko("#C13584")} onClick={pripojit}><i className="ti ti-plug-connected" aria-hidden="true"></i> Připojit Instagram</button>}
      </div>

      {/* Co funguje u vás — ze statistik zveřejněných příspěvků */}
      {pripojeno && (
        <div style={{ ...ui.karta, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontWeight: 700, flex: 1 }}>📈 Co funguje u vás</div>
            <button type="button" style={ui.tlacitkoObrys("male")} onClick={obnovitStatistiky}><i className="ti ti-refresh" aria-hidden="true"></i> Obnovit</button>
          </div>
          {vykonFormatu.length ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {vykonFormatu.map((v, i) => (
                <div key={v.f} style={{ border: `1px solid ${i === 0 ? ui.barvy.uspech : ui.barvy.okraj}`, borderRadius: 8, padding: "8px 12px", minWidth: 150 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{i === 0 && "🏆 "}{FORMATY[v.f]?.label || v.f}</div>
                  <div style={{ fontSize: 12, color: ui.barvy.textMekky }}>👁 {v.dosah} dosah · ❤️ {v.lajky} · {v.n}×</div>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 13, color: ui.barvy.textMekky }}>Po prvních zveřejněných příspěvcích tu bude vidět, který formát má největší dosah — podle toho se pak plánuje víc toho, co funguje.</div>}
        </div>
      )}

      {/* Trendy a témata měsíce */}
      <div style={{ ...ui.karta, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>🔥 Co teď funguje</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {temata.map((t) => <span key={t.nazev} style={ui.stitek(ui.barvy.uspech)} title={t.text}>{t.nazev}</span>)}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: ui.barvy.textMekky, lineHeight: 1.6 }}>
          {TRENDY_FORMATU.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </div>

      {/* Nastavení a vytvoření plánu */}
      <div style={{ ...ui.karta, marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
        <label>
          <span style={ui.popisek}>Na kolik týdnů</span>
          <select style={{ ...ui.pole, width: 90 }} value={nast.tydnu} onChange={(e) => setNast({ ...nast, tydnu: Number(e.target.value) })}>
            {[1, 2, 4, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div>
          <span style={ui.popisek}>Dny vydání</span>
          <div style={{ display: "flex", gap: 4 }}>
            {DNY_TYDNE.map(([d, l]) => {
              const on = nast.dny.includes(d);
              return (
                <button key={d} type="button" aria-pressed={on} style={on ? ui.tlacitko(ui.barvy.primarni, "male") : ui.tlacitkoObrys("male")}
                  onClick={() => setNast({ ...nast, dny: on ? nast.dny.filter((x) => x !== d) : [...nast.dny, d] })}>{l}</button>
              );
            })}
          </div>
        </div>
        <label>
          <span style={ui.popisek}>Čas</span>
          <input type="time" style={{ ...ui.pole, width: 110 }} value={nast.cas} onChange={(e) => setNast({ ...nast, cas: e.target.value })} />
        </label>
        <button type="button" style={ui.tlacitko(ui.barvy.akcent)} disabled={!nast.dny.length} onClick={vytvoritPlan}>
          <i className="ti ti-sparkles" aria-hidden="true"></i> Vytvořit plán příspěvků
        </button>
      </div>

      <div style={{ fontSize: 12, color: ui.barvy.varovani, marginBottom: 14 }}>
        ⚠️ Před zveřejněním zkontrolujte, že zákazník souhlasí a na fotkách není číslo domu, SPZ ani obličeje. V textu je jen obec, ne adresa.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button type="button" style={zobrazit === "plan" ? ui.tlacitko(ui.barvy.primarniTmava, "male") : ui.tlacitkoObrys("male")} onClick={() => setZobrazit("plan")}>Naplánované ({planovane.length})</button>
        <button type="button" style={zobrazit === "hotove" ? ui.tlacitko(ui.barvy.primarniTmava, "male") : ui.tlacitkoObrys("male")} onClick={() => setZobrazit("hotove")}>Zveřejněné ({zverejnene.length})</button>
      </div>

      {!seznam.length && (
        <div style={{ ...ui.karta, textAlign: "center", color: ui.barvy.textMekky }}>
          {zobrazit === "plan" ? "Zatím žádný plán — klikněte na „Vytvořit plán příspěvků“." : "Zatím nic zveřejněného."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {seznam.map((p) => (
          <Prispevek key={p.id} p={p} fotkaPodleId={fotkaPodleId} realizace={realizacePodleKlice.get(klicRealizace(p))}
            zpozdeny={p.stav !== "zverejneno" && p.datum < dnes()} pracuje={prace === p.id} pripojeno={pripojeno}
            onUlozit={(patch) => ulozit(p.id, patch)} onSdilet={() => sdilet(p)} onKopirovat={() => kopirovat(p)} onSmazat={() => smazat(p)}
            onZverejnit={() => zverejnitTed(p)} onAuto={(on) => prepnoutAuto(p, on)} />
        ))}
      </div>

      {zobrazit === "plan" && cekajici.length > 0 && (
        <div style={{ ...ui.karta, marginTop: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>📸 Realizace bez příspěvku</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cekajici.map((r) => (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {fotkyProFormat("realizace", r.fotky).slice(0, 3).map((f) => (
                    <OneDriveThumb key={f.id} itemId={f.item_id} fallbackUrl={f.url} cesta={f.storage_path} alt="" style={{ ...nahled, width: 48, height: 48 }} />
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.nazev}</div>
                  <div style={{ fontSize: 12, color: ui.barvy.textSlaby }}>{r.fotky.length} fotek · poslední {r.posledni ? new Date(r.posledni.slice(0, 10) + "T12:00:00").toLocaleDateString("cs-CZ") : "—"}</div>
                </div>
                <button type="button" style={ui.tlacitkoObrys("male")} onClick={() => pridatRealizaci(r)}><i className="ti ti-plus" aria-hidden="true"></i> Do plánu</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Prispevek({ p, fotkaPodleId, realizace, zpozdeny, pracuje, pripojeno, onUlozit, onSdilet, onKopirovat, onSmazat, onZverejnit, onAuto }) {
  const [vyber, setVyber] = useState(false);
  const fmt = FORMATY[p.format] || FORMATY.realizace;
  const fotky = (p.foto_ids || []).map((id) => fotkaPodleId.get(id)).filter(Boolean);
  const nabidka = realizace?.fotky || fotky;
  const prepnout = (id) => {
    const ids = p.foto_ids || [];
    onUlozit({ foto_ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 10) });
  };
  return (
    <div style={{ ...ui.karta, padding: 16, borderLeft: `4px solid ${ui.sjednot(fmt.barva)}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input type="date" aria-label="Datum vydání" style={{ ...ui.pole, width: 150, padding: "6px 8px" }} value={p.datum} onChange={(e) => e.target.value && onUlozit({ datum: e.target.value })} />
        <input type="time" aria-label="Čas vydání" style={{ ...ui.pole, width: 100, padding: "6px 8px" }} value={p.cas || ""} onChange={(e) => onUlozit({ cas: e.target.value })} />
        <span style={{ fontSize: 12, color: ui.barvy.textSlaby }}>{datumText(p.datum)}</span>
        <span style={ui.stitek(fmt.barva)}><i className={`ti ${fmt.ikona}`} aria-hidden="true"></i> {fmt.label}</span>
        {p.tema && <span style={ui.stitek(ui.barvy.uspech)}>{p.tema}</span>}
        {realizace && <span style={{ fontSize: 12, color: ui.barvy.textMekky }}>{realizace.nazev}</span>}
        {zpozdeny && <span style={ui.stitek(ui.barvy.chyba)}>Nezveřejněno včas</span>}
        {p.stav === "zverejneno" && <span style={ui.stitek(ui.barvy.uspech)}>✓ Zveřejněno</span>}
        {p.stav === "odesilani" && <span style={ui.stitek(ui.barvy.varovani)}>⏳ Odesílá se na Instagram…</span>}
        {p.automaticky && p.stav === "planovano" && <span style={ui.stitek("#C13584")}>🤖 Vyjde automaticky</span>}
      </div>

      {p.chyba && p.stav !== "zverejneno" && (
        <div role="alert" style={{ fontSize: 12, color: ui.barvy.chyba, background: ui.barvy.chyba + "12", borderRadius: 6, padding: "6px 10px", marginBottom: 10 }}>
          Zveřejnění se nepovedlo: {p.chyba}
        </div>
      )}
      {p.stav === "zverejneno" && (p.ig_permalink || p.dosah != null || p.lajky != null) && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 13, marginBottom: 10 }}>
          {p.dosah != null && <span>👁 <b>{p.dosah}</b> dosah</span>}
          {p.lajky != null && <span>❤️ <b>{p.lajky}</b></span>}
          {p.komentare != null && <span>💬 <b>{p.komentare}</b></span>}
          {p.ig_permalink && <a href={p.ig_permalink} target="_blank" rel="noreferrer" style={{ color: ui.barvy.primarni, fontWeight: 600 }}>Otevřít na Instagramu ↗</a>}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        {fotky.map((f, i) => (
          <div key={f.id} style={{ position: "relative" }}>
            <OneDriveThumb itemId={f.item_id} fallbackUrl={f.url} cesta={f.storage_path} alt={`Fotka ${i + 1}`} style={nahled} />
            {i === 0 && <span style={{ position: "absolute", left: 3, top: 3, ...ui.stitek("#0E3B5E"), background: "#fffe", fontSize: 10, padding: "0 5px" }}>1.</span>}
          </div>
        ))}
        {!fotky.length && <span style={{ fontSize: 12, color: ui.barvy.textSlaby }}>Bez fotky — přidejte ji, Instagram příspěvek bez fotky nevezme.</span>}
        {nabidka.length > 0 && (
          <button type="button" style={ui.tlacitkoObrys("male")} aria-expanded={vyber} onClick={() => setVyber((v) => !v)}>
            <i className="ti ti-photo-edit" aria-hidden="true"></i> {vyber ? "Hotovo" : "Upravit fotky"}
          </button>
        )}
      </div>

      {vyber && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, padding: 8, background: ui.barvy.pozadi, borderRadius: 8 }}>
          {nabidka.map((f) => {
            const i = (p.foto_ids || []).indexOf(f.id);
            return (
              <button key={f.id} type="button" aria-pressed={i >= 0} title={f.category || "Bez kategorie"} onClick={() => prepnout(f.id)}
                style={{ padding: 0, border: `3px solid ${i >= 0 ? ui.barvy.akcent : "transparent"}`, borderRadius: 9, background: "none", cursor: "pointer", position: "relative" }}>
                <OneDriveThumb itemId={f.item_id} fallbackUrl={f.url} cesta={f.storage_path} alt="" style={{ ...nahled, width: 56, height: 56, opacity: i >= 0 ? 1 : 0.55 }} />
                {i >= 0 && <span style={{ position: "absolute", right: 2, bottom: 2, background: ui.barvy.akcent, color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "0 5px" }}>{i + 1}</span>}
              </button>
            );
          })}
        </div>
      )}

      <textarea aria-label="Text příspěvku" style={{ ...ui.pole, minHeight: 120, resize: "vertical", marginBottom: 6 }} defaultValue={p.popisek || ""}
        onBlur={(e) => e.target.value !== (p.popisek || "") && onUlozit({ popisek: e.target.value })} />
      <input aria-label="Hashtagy" style={{ ...ui.pole, marginBottom: 10, color: ui.barvy.primarni }} defaultValue={p.hashtagy || ""}
        onBlur={(e) => e.target.value !== (p.hashtagy || "") && onUlozit({ hashtagy: e.target.value })} />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {pripojeno && p.stav === "planovano" && (
          <>
            <button type="button" style={ui.tlacitko("#C13584")} disabled={pracuje || !fotky.length} onClick={onZverejnit}>
              <i className="ti ti-send" aria-hidden="true"></i> {pracuje ? "Pracuji…" : "Zveřejnit teď"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "0 6px", cursor: fotky.length ? "pointer" : "default" }}>
              <input type="checkbox" checked={!!p.automaticky} disabled={pracuje || !fotky.length} onChange={(e) => onAuto(e.target.checked)} />
              Autopilot ({p.cas || "—"})
            </label>
          </>
        )}
        {p.stav !== "odesilani" && (
          <button type="button" style={pripojeno ? ui.tlacitkoObrys() : ui.tlacitko()} disabled={pracuje || !fotky.length} onClick={onSdilet}>
            <i className="ti ti-share" aria-hidden="true"></i> {pracuje && !pripojeno ? "Připravuji fotky…" : pripojeno ? "Sdílet z mobilu" : "Sdílet na Instagram"}
          </button>
        )}
        <button type="button" style={ui.tlacitkoObrys()} onClick={onKopirovat}><i className="ti ti-copy" aria-hidden="true"></i> Kopírovat text</button>
        {p.stav === "planovano"
          ? <button type="button" style={ui.tlacitkoObrys()} onClick={() => onUlozit({ stav: "zverejneno", zverejneno_at: new Date().toISOString() })}><i className="ti ti-check" aria-hidden="true"></i> Zveřejněno</button>
          : p.stav === "zverejneno" && !p.ig_media_id && <button type="button" style={ui.tlacitkoObrys()} onClick={() => onUlozit({ stav: "planovano", zverejneno_at: null })}>Vrátit do plánu</button>}
        <button type="button" style={{ ...ui.tlacitkoObrys(), color: ui.barvy.chyba, marginLeft: "auto" }} onClick={onSmazat}><i className="ti ti-trash" aria-hidden="true"></i> Smazat</button>
      </div>
    </div>
  );
}
