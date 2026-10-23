// ─── Vyfotit fakturu / účtenku (terén) ───────────────────────────────────────
// Zaměstnanec vyfotí doklad (i víc stránek), volitelně napíše, kam patří
// (zakázka, auto – nafta / oprava, fungování firmy) a jestli platil ze svého.
// Fotky jdou do bucketu faktury-fronta (foto/<uid>/…) a doklad do Fronty
// k přiřazení (invoice_queue, source „foto“). Hlavičku a řádky z fotky vyčte
// naplánovaný agent „Doplnění řádků faktur“, přiřazení potvrdí kancelář.
// Pod formulářem je seznam mých vyfocených dokladů se stavem.

import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { compressImage } from "./imageUtils.js";
import VyberZakazky from "./VyberZakazky.jsx";
import { zakazkaVeVyberu } from "./zakazkyVyber.js";

const BUCKET = "faktury-fronta";
const KAM = [
  ["", "Nevím — rozhodne kancelář"],
  ["zakazka", "🧱 Zakázka"],
  ["auto", "🚐 Auto"],
  ["rezie", "🏢 Fungování firmy"],
  ["sklad", "📦 Sklad"],
];
const TYP_AUTA = [["nafta", "⛽ Nafta / palivo"], ["oprava", "🔧 Oprava / servis"], ["jine", "Jiné (myčka, dálnice…)"]];

const stavDokladu = (d, maRadky) => {
  if (d.status === "schvalena") return ["✓ Přiřazeno", "#15803d", "#dcfce7"];
  if (d.status === "zamitnuta") return ["Zamítnuto", "#64748b", "#f1f5f9"];
  if (d.status === "castecne_prirazena") return ["Přiřazuje se", "#b45309", "#fef3c7"];
  if (maRadky || d.total_amount != null) return ["Přečteno — čeká na přiřazení", "#0369a1", "#e0f2fe"];
  return ["Čeká na přečtení", "#475569", "#f1f5f9"];
};

export default function FotoDokladu({ currentUser, contracts = [], customers = [] }) {
  const [fotky, setFotky] = useState([]);         // File[]
  const [nahledy, setNahledy] = useState([]);     // object URLs
  const [druh, setDruh] = useState("uctenka");
  const [kam, setKam] = useState("");
  const [zakazka, setZakazka] = useState("");
  const [auto, setAuto] = useState("");
  const [typAuta, setTypAuta] = useState("nafta");
  const [zeSveho, setZeSveho] = useState(false);
  const [poznamka, setPoznamka] = useState("");
  const [pracuji, setPracuji] = useState(false);
  const [zprava, setZprava] = useState(null);
  const [auta, setAuta] = useState([]);
  const [moje, setMoje] = useState(null);

  const nactiMoje = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) { setMoje([]); return; }
    const { data } = await supabase.from("invoice_queue").select("id, created_at, supplier_name, total_amount, status, doc_type, navrh_cil, note")
      .eq("source", "foto").eq("nahral_uid", u.user.id).order("created_at", { ascending: false }).limit(30);
    setMoje(data || []);
  };
  useEffect(() => {
    supabase.from("vehicles").select("id, name, spz").order("name").then(({ data }) => setAuta(data || []));
    Promise.resolve().then(nactiMoje);
  }, []);
  useEffect(() => () => nahledy.forEach((u) => URL.revokeObjectURL(u)), [nahledy]);

  const pridatFotky = (soubory) => {
    const obr = [...soubory].filter((f) => String(f.type || "").startsWith("image/") || f.type === "application/pdf");
    if (!obr.length) return;
    setFotky((f) => [...f, ...obr]);
    setNahledy((n) => [...n, ...obr.map((f) => (f.type === "application/pdf" ? "" : URL.createObjectURL(f)))]);
    setZprava(null);
  };
  const odebrat = (i) => { setFotky((f) => f.filter((_, j) => j !== i)); setNahledy((n) => n.filter((_, j) => j !== i)); };

  const odeslat = async () => {
    if (!fotky.length) { setZprava({ chyba: true, text: "Nejdřív vyfoť doklad." }); return; }
    if (kam === "zakazka" && !zakazka) { setZprava({ chyba: true, text: "Vyber zakázku, nebo zvol „Nevím“." }); return; }
    if (kam === "auto" && !auto) { setZprava({ chyba: true, text: "Vyber auto, nebo zvol „Nevím“." }); return; }
    setPracuji(true); setZprava(null);
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) { setPracuji(false); setZprava({ chyba: true, text: "Nejsi přihlášený — přihlas se a zkus to znovu." }); return; }
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    const zaklad = `foto/${uid}/${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    const cesty = [];
    try {
      for (let i = 0; i < fotky.length; i++) {
        const f = fotky[i];
        const soubor = f.type === "application/pdf" ? f : await compressImage(f, { maxDim: 2400, quality: 0.85 });
        const ext = f.type === "application/pdf" ? "pdf" : (String(soubor.type).split("/")[1] || "jpg").replace("jpeg", "jpg");
        const cesta = `${zaklad}_${i + 1}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(cesta, soubor, { contentType: soubor.type || "image/jpeg" });
        if (error) throw error;
        cesty.push(cesta);
      }
      const navrhCil = kam === "zakazka" ? `z:${zakazka}` : kam === "auto" ? `auto:${auto}` : kam || null;
      const { error } = await supabase.from("invoice_queue").insert({
        direction: "prijata", source: "foto", status: "nova", doc_type: druh === "uctenka" ? "uctenka" : "faktura",
        pdf_storage_path: cesty[0], fotky: cesty, nahral: currentUser?.name || null, nahral_uid: uid,
        uhradil_zamestnanec: zeSveho, navrh_cil: navrhCil, navrh_typ: kam === "auto" ? typAuta : null,
        note: poznamka.trim() || null, issue_date: d.toLocaleDateString("sv-SE"),
        stitky: kam === "auto" ? [typAuta === "nafta" ? "Pohonné hmoty" : typAuta === "oprava" ? "Opravy aut" : "Auta"] : [],
      });
      if (error) throw error;
      setFotky([]); setNahledy([]); setPoznamka(""); setKam(""); setZakazka(""); setAuto(""); setZeSveho(false);
      setZprava({ chyba: false, text: "✓ Doklad odeslán. Agent ho přečte a kancelář přiřadí." });
      nactiMoje();
    } catch (e) {
      if (cesty.length) await supabase.storage.from(BUCKET).remove(cesty);
      setZprava({ chyba: true, text: "Doklad se nepodařilo odeslat: " + (e.message || e) });
    }
    setPracuji(false);
  };

  const box = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 };
  const lbl = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 4, display: "block" };
  const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 10px", fontSize: 15, fontFamily: "inherit", width: "100%", boxSizing: "border-box", background: "#fff" };
  const volba = (aktivni) => ({ border: `1px solid ${aktivni ? "#0E3B5E" : "#cbd5e1"}`, background: aktivni ? "#0E3B5E" : "#fff", color: aktivni ? "#fff" : "#334155", borderRadius: 999, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 22 }}>
      <div style={box}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#0E3B5E" }}>📷 Vyfotit fakturu nebo účtenku</div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Druh dokladu">
          {[["uctenka", "🧾 Účtenka"], ["faktura", "📄 Faktura"]].map(([id, t]) => (
            <button key={id} type="button" aria-pressed={druh === id} style={volba(druh === id)} onClick={() => setDruh(id)}>{t}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ background: "#F5821F", color: "#fff", borderRadius: 12, padding: "14px 18px", fontWeight: 800, fontSize: 16, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
            📷 {fotky.length ? "Vyfotit další stránku" : "Vyfotit doklad"}
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { pridatFotky(e.target.files); e.target.value = ""; }} />
          </label>
          <label style={{ border: "1px solid #cbd5e1", borderRadius: 12, padding: "12px 14px", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#334155" }}>
            🖼 Z galerie / PDF
            <input type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={(e) => { pridatFotky(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {fotky.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {fotky.map((f, i) => (
              <div key={i} style={{ position: "relative", width: 84, height: 108, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#64748b" }}>
                {nahledy[i] ? <img src={nahledy[i]} alt={`Stránka ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "PDF"}
                <span style={{ position: "absolute", left: 4, bottom: 4, background: "#0E3B5Ecc", color: "#fff", borderRadius: 6, padding: "0 5px", fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                <button type="button" aria-label={`Odebrat stránku ${i + 1}`} onClick={() => odebrat(i)}
                  style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#fff", color: "#b91c1c", fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div>
          <span style={lbl}>Kam doklad patří? (nepovinné — pomůže kanceláři)</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Kam doklad patří">
            {KAM.map(([id, t]) => <button key={id || "nevim"} type="button" aria-pressed={kam === id} style={volba(kam === id)} onClick={() => setKam(id)}>{t}</button>)}
          </div>
        </div>
        {kam === "zakazka" && (
          <div><span style={lbl}>Zakázka</span>
            <VyberZakazky contracts={contracts.filter((c) => zakazkaVeVyberu(c, zakazka))} customers={customers} value={zakazka} onChange={(id) => setZakazka(id ? String(id) : "")} placeholder="Napiš název, zákazníka nebo kód…" /></div>
        )}
        {kam === "auto" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <div><label style={lbl} htmlFor="fd-auto">Auto</label>
              <select id="fd-auto" style={pole} value={auto} onChange={(e) => setAuto(e.target.value)}>
                <option value="">— vyber auto —</option>
                {auta.map((a) => <option key={a.id} value={a.id}>{a.name}{a.spz ? ` · ${a.spz}` : ""}</option>)}
              </select></div>
            <div><span style={lbl}>Co to je</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {TYP_AUTA.map(([id, t]) => <button key={id} type="button" aria-pressed={typAuta === id} style={volba(typAuta === id)} onClick={() => setTypAuta(id)}>{t}</button>)}
              </div></div>
          </div>
        )}
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input type="checkbox" checked={zeSveho} onChange={(e) => setZeSveho(e.target.checked)} style={{ width: 18, height: 18 }} /> Platil(a) jsem ze svého — proplatit mi
        </label>
        <div><label style={lbl} htmlFor="fd-pozn">Poznámka</label>
          <input id="fd-pozn" style={pole} value={poznamka} onChange={(e) => setPoznamka(e.target.value)} placeholder="např. šrouby na Kovaříka, nafta cestou do Luhačovic" /></div>

        {zprava && <div role={zprava.chyba ? "alert" : "status"} style={{ fontSize: 14, fontWeight: 700, color: zprava.chyba ? "#b91c1c" : "#15803d" }}>{zprava.text}</div>}
        <button type="button" disabled={pracuji} onClick={odeslat}
          style={{ background: "#0E3B5E", color: "#fff", border: "none", borderRadius: 12, padding: "14px 18px", fontWeight: 800, fontSize: 16, cursor: pracuji ? "wait" : "pointer", fontFamily: "inherit" }}>
          {pracuji ? "Odesílám…" : `Odeslat doklad${fotky.length > 1 ? ` (${fotky.length} stránky)` : ""}`}
        </button>
      </div>

      {moje && moje.length > 0 && (
        <div style={box}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Moje vyfocené doklady</div>
          {moje.map((d) => {
            const [t, fg, bg] = stavDokladu(d, false);
            return (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13, borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
                <span>{new Date(d.created_at).toLocaleDateString("cs-CZ")} · {d.doc_type === "uctenka" ? "účtenka" : "faktura"}{d.supplier_name ? ` · ${d.supplier_name}` : ""}{d.total_amount != null ? ` · ${Math.round(Number(d.total_amount)).toLocaleString("cs-CZ")} Kč` : ""}</span>
                <span style={{ background: bg, color: fg, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>{t}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
