// ─── Servisní zpráva (Servis → ticket → 📝 Servisní zpráva) ───────────────────
// Technik u zákazníka zkontroluje předvyplněné údaje (závada, provedené práce,
// práce a materiál, čas příjezdu/odjezdu, doporučení, fotky), podepíše se on
// i zákazník na displeji. Vznikne PDF (HTML → html2canvas → jsPDF kvůli
// diakritice), uloží se do bucketu servisni-zpravy a edge funkce
// servis-zprava-odeslat ho pošle zákazníkovi e-mailem z firemní schránky.

import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import * as ui from "./ui.js";
import { SignaturePad } from "./Podpisy.jsx";
import { COMPANY } from "./invoicingUtils.js";

const BUCKET = "servisni-zpravy";
const dnesIso = () => new Date().toLocaleDateString("sv-SE");
const fmtDatum = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("cs-CZ") : "");
const kc = (n) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kč`;
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hm = (t) => String(t || "").slice(0, 5);
const jeObrazek = (p) => /\.(jpe?g|png|webp|gif|heic)$/i.test(String(p.storage_path || p.url || "")) || /^image\//.test(p.mime || "");

async function naDataUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("foto");
  const b = await r.blob();
  return await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(b); });
}

function htmlZpravy(d) {
  const radkyPrace = d.polozky.map((p) => `<tr><td>${esc(p.popis)}</td><td style="text-align:right">${esc(p.mnozstvi)}</td><td style="text-align:right">${d.placeny ? esc(kc(p.castka)) : "záruka"}</td></tr>`).join("");
  const fotky = d.fotky.map((f) => `<img src="${f}" style="width:236px;height:170px;object-fit:cover;border-radius:4px;border:1px solid #ddd" />`).join("");
  const podpis = (img, jmeno, kdo) => `<div style="flex:1"><div style="height:90px;border-bottom:1px solid #999;display:flex;align-items:flex-end;justify-content:center">${img ? `<img src="${img}" style="max-height:86px;max-width:100%" />` : ""}</div><div style="font-size:12px;color:#555;margin-top:4px">${esc(kdo)}: ${esc(jmeno)}</div></div>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:40px 44px;font-size:13px;line-height:1.45">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0E3B5E;padding-bottom:12px">
    <div><div style="font-size:24px;font-weight:700;color:#0E3B5E">Servisní zpráva</div><div style="color:#555">č. ${esc(d.cislo)} · ${esc(fmtDatum(d.datum))}</div></div>
    <div style="text-align:right;font-size:12px;color:#444"><b>${esc(COMPANY.name)}</b><br>${esc(COMPANY.addressLine)}, ${esc(COMPANY.city)}<br>IČO ${esc(COMPANY.ico)} · DIČ ${esc(COMPANY.dic)}${COMPANY.tel || COMPANY.mobil ? `<br>${esc(COMPANY.mobil || COMPANY.tel)}` : ""}${COMPANY.email ? ` · ${esc(COMPANY.email)}` : ""}</div>
  </div>
  <table style="width:100%;margin-top:14px;border-collapse:collapse;font-size:13px">
    <tr><td style="color:#666;width:150px;padding:3px 0">Zákazník</td><td><b>${esc(d.zakaznik)}</b></td></tr>
    <tr><td style="color:#666;padding:3px 0">Místo</td><td>${esc(d.adresa)}</td></tr>
    <tr><td style="color:#666;padding:3px 0">Zakázka</td><td>${esc(d.zakazka)}</td></tr>
    <tr><td style="color:#666;padding:3px 0">Technik</td><td>${esc(d.technik)}</td></tr>
    <tr><td style="color:#666;padding:3px 0">Příjezd – odjezd</td><td>${esc(d.prijezd || "—")} – ${esc(d.odjezd || "—")}</td></tr>
    <tr><td style="color:#666;padding:3px 0">Druh servisu</td><td>${d.placeny ? "Placený servis" : "Záruční servis (bez úhrady)"}</td></tr>
  </table>
  <div style="margin-top:14px"><div style="font-weight:700;color:#0E3B5E">Nahlášená závada</div><div style="white-space:pre-wrap">${esc(d.zavada)}</div></div>
  <div style="margin-top:12px"><div style="font-weight:700;color:#0E3B5E">Provedené práce</div><div style="white-space:pre-wrap">${esc(d.reseni || "—")}</div></div>
  ${d.polozky.length ? `<table style="width:100%;margin-top:12px;border-collapse:collapse;font-size:12.5px"><thead><tr style="background:#F1F4F8"><th style="text-align:left;padding:5px">Práce a materiál</th><th style="text-align:right;padding:5px;width:90px">Množství</th><th style="text-align:right;padding:5px;width:110px">Cena</th></tr></thead><tbody>${radkyPrace}</tbody>${d.placeny ? `<tfoot><tr><td colspan="2" style="text-align:right;padding:5px;font-weight:700">Celkem bez DPH</td><td style="text-align:right;padding:5px;font-weight:700">${esc(kc(d.polozky.reduce((s, p) => s + (Number(p.castka) || 0), 0)))}</td></tr></tfoot>` : ""}</table>` : ""}
  ${d.doporuceni ? `<div style="margin-top:12px"><div style="font-weight:700;color:#0E3B5E">Doporučení a další kroky</div><div style="white-space:pre-wrap">${esc(d.doporuceni)}</div></div>` : ""}
  ${fotky ? `<div style="margin-top:14px"><div style="font-weight:700;color:#0E3B5E;margin-bottom:6px">Fotky z výjezdu</div><div style="display:flex;flex-wrap:wrap;gap:8px">${fotky}</div></div>` : ""}
  <div style="margin-top:18px;font-size:12px;color:#555">Zákazník svým podpisem potvrzuje provedení uvedených prací${d.placeny ? " a jejich rozsah k vyúčtování" : ""}.</div>
  <div style="display:flex;gap:40px;margin-top:10px">${podpis(d.podpisTechnik, d.technik, "Technik")}${podpis(d.podpisZakaznik, d.podepsal, "Zákazník")}</div>
  <div style="margin-top:6px;font-size:11px;color:#888">Podepsáno ${esc(new Date().toLocaleString("cs-CZ"))}</div>
</div>`;
}

async function vytvoritPdf(d) {
  const [{ jsPDF }, h2c] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const el = document.createElement("div");
  Object.assign(el.style, { position: "fixed", left: "-10000px", top: "0", width: "794px", background: "#fff" });
  el.innerHTML = htmlZpravy(d);
  document.body.appendChild(el);
  try {
    const canvas = await h2c.default(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const stranaPx = Math.floor(canvas.width * (297 / 210));
    for (let y = 0, i = 0; y < canvas.height; y += stranaPx, i++) {
      const c = document.createElement("canvas");
      c.width = canvas.width; c.height = Math.min(stranaPx, canvas.height - y);
      c.getContext("2d").drawImage(canvas, 0, y, canvas.width, c.height, 0, 0, canvas.width, c.height);
      if (i > 0) doc.addPage();
      doc.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, (c.height / canvas.width) * 210);
    }
    return doc.output("blob");
  } finally {
    document.body.removeChild(el);
  }
}

export default function ServisniZprava({ t, zakazka, zakaznik, technik, naklady = [], fotky = [], currentUser, onZavrit }) {
  const [f, setF] = useState(() => ({
    datum: dnesIso(), prijezd: "", odjezd: "",
    zavada: [t.nazev, t.popis].filter(Boolean).join("\n"), reseni: t.reseni || "", doporuceni: "",
    email: zakaznik?.email || "", podepsal: t.kontakt || zakaznik?.name || "",
  }));
  const obrazky = fotky.filter(jeObrazek);
  const [vybraneFotky, setVybraneFotky] = useState(() => obrazky.slice(0, 4).map((p) => p.id));
  const [podpisTechnik, setPodpisTechnik] = useState(null);
  const [podpisZakaznik, setPodpisZakaznik] = useState(null);
  const [stav, setStav] = useState(null); // { text, chyba, pdfUrl }
  const [pracuji, setPracuji] = useState(false);
  const [predchozi, setPredchozi] = useState([]);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    let zruseno = false;
    // příjezd/odjezd technika z dnešní docházky (jde přepsat)
    if (t.technik_id) {
      supabase.from("attendance").select("checkin, checkout").eq("employee_id", t.technik_id).eq("date", dnesIso()).order("checkin").then(({ data }) => {
        if (zruseno || !data?.length) return;
        setF((x) => ({ ...x, prijezd: x.prijezd || hm(data[0].checkin), odjezd: x.odjezd || hm(data[data.length - 1].checkout) }));
      });
    }
    supabase.from("servisni_zpravy").select("id, cislo, odeslano_at, email_komu, chyba, pdf_path, created_at").eq("ticket_id", t.id).order("created_at", { ascending: false })
      .then(({ data }) => { if (!zruseno) setPredchozi(data || []); });
    return () => { zruseno = true; };
  }, [t.id, t.technik_id]);

  const polozky = naklady.map((x) => ({ popis: x.description || x.cost_type, mnozstvi: `${Number(x.quantity) || 1} ${x.unit || ""}`.trim(), castka: Number(x.amount_client) || 0 }));

  const odeslat = async () => {
    setStav(null);
    if (!podpisTechnik || !podpisZakaznik) { setStav({ chyba: true, text: "Chybí podpis technika nebo zákazníka — podepište a klepněte na Uložit podpis." }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { setStav({ chyba: true, text: "Zadej platný e-mail zákazníka." }); return; }
    if (!f.podepsal.trim()) { setStav({ chyba: true, text: "Napiš jméno zákazníka, který podepisuje." }); return; }
    setPracuji(true);
    try {
      const cislo = `SZ-${t.cislo || t.id}-${predchozi.length + 1}`;
      const fotoData = [];
      for (const p of obrazky.filter((x) => vybraneFotky.includes(x.id))) {
        try { fotoData.push(await naDataUrl(p.url)); } catch { /* fotka z OneDrivu bez přístupu — přeskočit */ }
      }
      const data = {
        cislo, datum: f.datum, prijezd: f.prijezd, odjezd: f.odjezd, placeny: !!t.placeny,
        zakaznik: [zakaznik?.company, zakaznik?.name].filter(Boolean).join(" – ") || t.kontakt || "",
        adresa: t.adresa || zakazka?.address || zakaznik?.address || "", zakazka: [zakazka?.code, zakazka?.name].filter(Boolean).join(" · "),
        technik: technik?.name || currentUser?.name || "", zavada: f.zavada, reseni: f.reseni, doporuceni: f.doporuceni,
        polozky, fotky: fotoData, podpisTechnik, podpisZakaznik, podepsal: f.podepsal.trim(),
      };
      const blob = await vytvoritPdf(data);
      const cesta = `${t.id}/${cislo}.pdf`;
      const { error: uErr } = await supabase.storage.from(BUCKET).upload(cesta, blob, { contentType: "application/pdf", upsert: true });
      if (uErr) throw new Error("PDF se nepodařilo uložit: " + uErr.message);
      const obsah = { ...data, fotky: undefined, podpisTechnik: undefined, podpisZakaznik: undefined, nazev: t.nazev, firma: COMPANY.name };
      const { data: row, error: iErr } = await supabase.from("servisni_zpravy").insert({
        ticket_id: t.id, cislo, obsah, pdf_path: cesta, email_komu: f.email.trim(), podepsal: f.podepsal.trim(),
        podepsano_at: new Date().toISOString(), vytvoril: currentUser?.name || null,
      }).select().single();
      if (iErr) throw new Error("Zprávu se nepodařilo uložit: " + iErr.message);
      const pdfUrl = URL.createObjectURL(blob);
      const { data: odp, error: fErr } = await supabase.functions.invoke("servis-zprava-odeslat", { body: { id: row.id } });
      if (fErr || !odp?.ok) {
        let detail = fErr?.message || "";
        try { const j = await fErr?.context?.json?.(); if (j?.error === "smtp_not_configured") detail = "odesílání e-mailů zatím není nastavené"; else if (j?.detail) detail = j.detail; } catch { /* bez detailu */ }
        setStav({ chyba: true, text: `Zpráva je podepsaná a uložená, ale e-mail se neodeslal (${detail}). PDF si můžeš stáhnout a poslat ručně.`, pdfUrl, cislo });
      } else {
        setStav({ chyba: false, text: `✓ Servisní zpráva ${cislo} je podepsaná a odeslaná na ${f.email.trim()}.`, pdfUrl, cislo });
      }
      setPredchozi((p) => [row, ...p]);
    } catch (e) {
      setStav({ chyba: true, text: e.message || String(e) });
    }
    setPracuji(false);
  };

  const otevritUlozenou = async (z) => {
    const okno = window.open("", "_blank");
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(z.pdf_path, 600);
    if (data?.signedUrl && okno) okno.location.href = data.signedUrl; else okno?.close();
  };

  const lbl = { ...ui.popisek, textTransform: "none", letterSpacing: 0, fontSize: 12, fontWeight: 700 };
  const pole = { ...ui.pole, fontSize: 15 };
  return (
    <div role="dialog" aria-modal="true" aria-label="Servisní zpráva" style={{ ...ui.okno, zIndex: 1200 }} onClick={(e) => { if (e.target === e.currentTarget && !pracuji) onZavrit(); }}>
      <div style={{ ...ui.oknoObsah, width: 720, textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: ui.barvy.textSlaby, fontWeight: 700 }}>{t.cislo} · {t.placeny ? "Placený servis" : "Záruka"}</div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>📝 Servisní zpráva</div>
          </div>
          <button type="button" aria-label="Zavřít" onClick={onZavrit} disabled={pracuji} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: ui.barvy.textSlaby }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <div><label style={lbl} htmlFor="sz-datum">Datum</label><input id="sz-datum" type="date" style={pole} value={f.datum} onChange={(e) => set({ datum: e.target.value })} /></div>
          <div><label style={lbl} htmlFor="sz-prijezd">Příjezd</label><input id="sz-prijezd" type="time" style={pole} value={f.prijezd} onChange={(e) => set({ prijezd: e.target.value })} /></div>
          <div><label style={lbl} htmlFor="sz-odjezd">Odjezd</label><input id="sz-odjezd" type="time" style={pole} value={f.odjezd} onChange={(e) => set({ odjezd: e.target.value })} /></div>
        </div>
        <div><label style={lbl} htmlFor="sz-zavada">Nahlášená závada</label><textarea id="sz-zavada" style={{ ...pole, minHeight: 56 }} value={f.zavada} onChange={(e) => set({ zavada: e.target.value })} /></div>
        <div><label style={lbl} htmlFor="sz-reseni">Provedené práce</label><textarea id="sz-reseni" style={{ ...pole, minHeight: 70 }} value={f.reseni} placeholder="Co se na místě udělalo" onChange={(e) => set({ reseni: e.target.value })} /></div>
        {polozky.length > 0 && (
          <div style={{ fontSize: 13, border: `1px solid ${ui.barvy.okraj}`, borderRadius: 8 }}>
            <div style={{ padding: "6px 10px", fontWeight: 700, background: "#F5F7FA" }}>Práce a materiál (z ticketu)</div>
            {polozky.map((p, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 10px", borderTop: `1px solid ${ui.barvy.okrajJemny}` }}><span>{p.popis} · {p.mnozstvi}</span><span>{t.placeny ? kc(p.castka) : "záruka"}</span></div>)}
          </div>
        )}
        <div><label style={lbl} htmlFor="sz-dop">Doporučení / další kroky</label><textarea id="sz-dop" style={{ ...pole, minHeight: 50 }} value={f.doporuceni} placeholder="např. doporučujeme výměnu svodiče přepětí, další kontrola za 12 měsíců" onChange={(e) => set({ doporuceni: e.target.value })} /></div>
        {obrazky.length > 0 && (
          <div>
            <span style={lbl}>Fotky do zprávy</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {obrazky.map((p) => {
                const on = vybraneFotky.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => setVybraneFotky((v) => (on ? v.filter((x) => x !== p.id) : [...v, p.id]))}
                    style={{ width: 76, height: 76, padding: 0, borderRadius: 8, overflow: "hidden", border: on ? "3px solid #0E3B5E" : `1px solid ${ui.barvy.okraj}`, cursor: "pointer", background: "#f1f5f9", position: "relative" }}>
                    <img src={p.url} alt={p.description || "Fotka"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {on && <span style={{ position: "absolute", top: 2, right: 4, color: "#fff", fontWeight: 800, textShadow: "0 0 3px #000" }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <div><label style={lbl} htmlFor="sz-email">E-mail zákazníka (sem přijde zpráva)</label><input id="sz-email" type="email" inputMode="email" style={pole} value={f.email} onChange={(e) => set({ email: e.target.value })} /></div>
          <div><label style={lbl} htmlFor="sz-jmeno">Jméno zákazníka, který podepisuje</label><input id="sz-jmeno" style={pole} value={f.podepsal} onChange={(e) => set({ podepsal: e.target.value })} /></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div>
            <span style={lbl}>Podpis technika ({technik?.name || currentUser?.name || ""})</span>
            {podpisTechnik ? <div style={{ border: `1px solid ${ui.barvy.okraj}`, borderRadius: 8, padding: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}><img src={podpisTechnik} alt="Podpis technika" style={{ maxHeight: 70 }} /><button type="button" style={ui.tlacitkoObrys("male")} onClick={() => setPodpisTechnik(null)}>Znovu</button></div>
              : <SignaturePad onSave={setPodpisTechnik} height={140} />}
          </div>
          <div>
            <span style={lbl}>Podpis zákazníka</span>
            {podpisZakaznik ? <div style={{ border: `1px solid ${ui.barvy.okraj}`, borderRadius: 8, padding: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}><img src={podpisZakaznik} alt="Podpis zákazníka" style={{ maxHeight: 70 }} /><button type="button" style={ui.tlacitkoObrys("male")} onClick={() => setPodpisZakaznik(null)}>Znovu</button></div>
              : <SignaturePad onSave={setPodpisZakaznik} height={140} />}
          </div>
        </div>

        {stav && (
          <div role={stav.chyba ? "alert" : "status"} style={{ fontSize: 14, fontWeight: 700, color: stav.chyba ? ui.barvy.chyba : ui.barvy.uspech, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>{stav.text}</span>
            {stav.pdfUrl && <a href={stav.pdfUrl} download={`Servisni-zprava-${stav.cislo}.pdf`} style={{ ...ui.tlacitkoObrys("male"), textDecoration: "none" }}>📄 Stáhnout PDF</a>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" style={ui.tlacitkoObrys()} onClick={onZavrit} disabled={pracuji}>Zavřít</button>
          <button type="button" style={ui.tlacitko(ui.barvy.akcent, "velke")} onClick={odeslat} disabled={pracuji}>{pracuji ? "Vytvářím a odesílám…" : "✍️ Podepsáno — vytvořit PDF a odeslat"}</button>
        </div>

        {predchozi.length > 0 && (
          <div style={{ borderTop: `1px solid ${ui.barvy.okraj}`, paddingTop: 10, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Dřívější zprávy k ticketu</div>
            {predchozi.map((z) => (
              <div key={z.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", flexWrap: "wrap" }}>
                <span>{z.cislo} · {new Date(z.created_at).toLocaleDateString("cs-CZ")} · {z.odeslano_at ? `✓ odesláno na ${z.email_komu}` : `⚠ neodesláno${z.chyba ? ` (${z.chyba})` : ""}`}</span>
                {z.pdf_path && <button type="button" style={ui.tlacitkoObrys("male")} onClick={() => otevritUlozenou(z)}>📄 PDF</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
