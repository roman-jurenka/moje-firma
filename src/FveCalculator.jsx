import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PRAZDNA_FVE, applyPreset, POLOZKY_NOVE_INSTALACE, zapnutePolozkyNoveInstalace } from "./fvePresets.js";
import { DRUHY_SERVISU, UKON_DOPRAVA, ZMENA_PRIPOJENI, textyNabidky, ukonyZCfg, cenaUkonu, soucetUkonu, ukonBezCeny, seznamyPodleTypu, maSeznamNoveFve, odhadVynosu } from "./nabidkaTexty.js";
import NabidkaNahled from "./NabidkaNahled.jsx";

// ─── FVE kalkulačka — přesně podle Excelu "Kalkulačka sestav" ──────────────
// Materiál/práce/služby se vybírají z ceníku (tabulka fve_cenik_items),
// který je natažený z databáze a editovat ho smí jen role "admin" (stejný
// vzor jako zbytek appky — currentUser.role === "admin").
//
// Vzorce (ověřené a odsouhlasené v interaktivním návrhu):
// - H = G × (1 + marže), I = H × (1 + DPH)  — u záruky/ELMR/marketingu marže 0 %
// - Doprava = km × sazba × (MD elektro + MD střecha/2 + MD instalatér)
// - Cena s DPH po zaokrouhlení = CEILING(cena, 1000) − sleva
// - Dotace (nested IF, viz Excel řádek 46): základ podle typu dotace +
//   (kWp−2)×10000 + min(kWh, 2×kWp)×10000 + 20000 (wallbox) + 5000,
//   strop 205000(+20000 wallbox), strop 50 % ceny, ×1.1 −500 v zvýhodněném
//   kraji, +10000 při wallboxu.
// - Provize OZ = základní (řádek 36, ruční Kč) + plovoucí (řádek 49, ruční
//   %, doporučeno 20 %×marže−5 %, klapka 1–10 %, schvaluje Roman pod 35 % marže).

const fmtKc = (n) => Math.round(Number(n) || 0).toLocaleString("cs-CZ") + " Kč";

function findItem(list, name) {
  return (list || []).find((x) => x.name === name) || { name: name || "", cena: 0, wp: null, kwh: null };
}

const CAT_LABELS = { panely: "Panely", konstrukce: "Konstrukce", stridace: "Střídače", baterie: "Baterie", bms: "BMS", rozvadec_dc: "Rozvaděč DC", ostatni: "Ostatní materiál (Back-up, wallbox, drobný materiál)", regulace: "Regulace", bojlery: "Bojlery", prace: "Práce", sluzby: "Služby", elmr: "Úpravy ELMR", dotace_zaklad: "Základ dotace (podle typu střídače)", zaruky_stridac: "Záruka 10 let (podle střídače)" };

function Sel({ list, value, onChange, style }) {
  return (
    <select style={style} value={value} onChange={(e) => onChange(e.target.value)}>
      {(list || []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
    </select>
  );
}

// Servisní úkony (jen SRV) — co přesně se bude dělat. Nejčastější se
// přidají jedním kliknutím s předvyplněným popisem, jde přidat i vlastní.
// V nabídce se vypíšou v tabulce "Co pro Vás provedeme" (úkon | počet ks |
// popis | cena). Cena servisu = součet úkonů (cena za kus × ks), materiál
// v kalkulaci níže u servisu slouží jen k popisu stávající soustavy.
const noveIdUkonu = () => `u${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

function ServisUkony({ ukony, onChange, dph, S }) {
  const pridat = (u) => onChange([...ukony, { id: noveIdUkonu(), ...u }]);
  const upravit = (id, patch) => onChange(ukony.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  const smazat = (id) => onChange(ukony.filter((u) => u.id !== id));
  const chybi = !ukony.some((u) => (u.nazev || "").trim());
  const bezCeny = ukony.filter(ukonBezCeny).length;
  const soucet = soucetUkonu(ukony);
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("cs-CZ") + " Kč";
  return (
    <div style={{ background: "#eff6ff", border: `1px solid ${chybi ? "#fca5a5" : "#bfdbfe"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a8a", marginBottom: 2 }}>Co se bude provádět (úkony servisu)</div>
      <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>Každý úkon se v nabídce vypíše s popisem a cenou. <b>Cena servisu = součet úkonů</b> (cena za kus bez DPH × ks). Stávající soustavu (panely, střídač, baterie…) zadej do materiálu níže — v nabídce z ní bude specifikace, <b>do ceny se nepočítá</b>. Náhradní díly zadej jako úkon (např. „Výměna pojistky“ s cenou).</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: ukony.length ? 10 : 6 }}>
        {DRUHY_SERVISU.map((d) => {
          const uz = ukony.some((u) => u.typ === d.id);
          return (
            <button key={d.id} disabled={uz} style={{ ...S.btnGhost, padding: "5px 12px", fontSize: 12, opacity: uz ? 0.45 : 1 }}
              onClick={() => pridat({ typ: d.id, nazev: d.label, popis: d.popis })}>+ {d.label}</button>
          );
        })}
        <button disabled={ukony.some((u) => u.typ === UKON_DOPRAVA.typ)} style={{ ...S.btnGhost, padding: "5px 12px", fontSize: 12, opacity: ukony.some((u) => u.typ === UKON_DOPRAVA.typ) ? 0.45 : 1 }}
          onClick={() => pridat({ ...UKON_DOPRAVA })}>+ {UKON_DOPRAVA.nazev}</button>
        <button style={{ ...S.btnGhost, padding: "5px 12px", fontSize: 12 }} onClick={() => pridat({ typ: "vlastni", nazev: "", popis: "" })}>+ Vlastní úkon</button>
      </div>
      {ukony.map((u) => (
        <div key={u.id} style={{ display: "grid", gridTemplateColumns: "200px 70px 1fr 130px auto", gap: 8, marginBottom: 8, alignItems: "start" }}>
          <input style={{ ...S.input, marginBottom: 0 }} placeholder="Název úkonu, např. Výměna pojistek" value={u.nazev} onChange={(e) => upravit(u.id, { nazev: e.target.value })} />
          <input type="number" min="0" style={{ ...S.input, marginBottom: 0 }} placeholder="ks" title="Počet ks (nepovinné)" value={u.ks ?? ""} onChange={(e) => upravit(u.id, { ks: e.target.value })} />
          <textarea style={{ ...S.input, marginBottom: 0, minHeight: 38, resize: "vertical" }} placeholder="Co přesně se udělá" value={u.popis} onChange={(e) => upravit(u.id, { popis: e.target.value })} />
          <div>
            <input type="number" min="0" style={{ ...S.input, marginBottom: 0, borderColor: ukonBezCeny(u) ? "#f87171" : undefined }} placeholder="Kč/ks bez DPH" title="Cena za kus bez DPH" value={u.cena ?? ""} onChange={(e) => upravit(u.id, { cena: e.target.value })} />
            {!ukonBezCeny(u) && String(u.ks ?? "").trim() !== "" && Number(u.ks) !== 1 && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>celkem {fmt(cenaUkonu(u))}</div>}
          </div>
          <button style={{ ...S.btnGhost, padding: "6px 10px" }} title="Odebrat úkon" onClick={() => smazat(u.id)}>✕</button>
        </div>
      ))}
      {chybi && <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>Zatím není zadaný žádný úkon — nabídka by neříkala, co se bude dělat.</div>}
      {bezCeny > 0 && <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>{bezCeny === 1 ? "1 úkon nemá" : `${bezCeny} úkony nemají`} vyplněnou cenu — počítá se jako 0 Kč.</div>}
      {ukony.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#1e3a8a" }}>
          Cena servisu: <b>{fmt(soucet)}</b> bez DPH · <b>{fmt(Math.round(soucet * (1 + dph)))}</b> s DPH {Math.round(dph * 100)} %
        </div>
      )}
    </div>
  );
}

// Cena nabídky (seznam nabídek, obchodní případ, souhrn v kartě) je vždy
// stejná jako cena v nabídce pro zákazníka — do nabídky se automaticky
// propíše cena BEZ DPH, sazba DPH a u FVE/FVR i náklad z kalkulace (pro
// marži). Samostatná komponenta, ať je hook mimo podmíněný return.
function SyncCilovaCena({ cenaBezDph, cenaSDph, dphPct, naklad, aktualni, onSync }) {
  useEffect(() => {
    if (!onSync || !Number.isFinite(cenaBezDph)) return;
    const z = aktualni || {};
    const stejne = String(cenaBezDph) === String(z.cilovaCena ?? "") && String(cenaSDph) === String(z.cenaSDph ?? "") && Number(z.dph) === dphPct
      && (naklad == null || String(naklad) === String(z.nakladKalkulace ?? ""));
    if (!stejne) onSync({ cenaBezDph, cenaSDph, dphPct, naklad });
  }, [cenaBezDph, cenaSDph, dphPct, naklad, aktualni, onSync]);
  return null;
}

export default function FveCalculator({ value, onChange, currentUser, onUseAsTarget, S, customerName, quoteName, jobType, onSave, cenaVNabidce, cisloNabidky, vystaveno, customerAddress, odeslane, onOdeslano }) {
  const cfg = value || PRAZDNA_FVE();
  const set = (patch) => onChange({ ...cfg, ...patch });
  const setItem = (key, patch) => onChange({ ...cfg, [key]: { ...cfg[key], ...patch } });

  const [cenik, setCenik] = useState(null); // { panely: [...], ... }
  const [adminOpen, setAdminOpen] = useState(false);
  const [savingCenik, setSavingCenik] = useState(false);
  const [newZahrnuto, setNewZahrnuto] = useState("");
  const [newNezahrnuto, setNewNezahrnuto] = useState("");
  const [nahledOtevren, setNahledOtevren] = useState(false);
  const isAdmin = currentUser?.role === "admin";

  const loadCenik = () => {
    supabase.from("fve_cenik_items").select("*").eq("active", true).order("sort_order").then(({ data }) => {
      const grouped = {};
      (data || []).forEach((it) => { (grouped[it.category] = grouped[it.category] || []).push(it); });
      setCenik(grouped);
    });
  };
  useEffect(loadCenik, []);

  // Doplnění nové položky do ceníku (jen admin) — vloží prázdný řádek rovnou
  // do databáze, ať se objeví ve výběrových seznamech ihned po uložení.
  const addCenikItem = async (cat) => {
    const maxSort = Math.max(0, ...(cenik[cat] || []).map((x) => x.sort_order || 0));
    const { data: inserted } = await supabase.from("fve_cenik_items")
      .insert({ category: cat, name: "Nová položka", cena: 0, sort_order: maxSort + 1 })
      .select().single();
    if (inserted) setCenik({ ...cenik, [cat]: [...(cenik[cat] || []), inserted] });
  };

  if (!cenik) return <div style={{ ...S.card, color: "#475569" }}>Načítám ceník…</div>;

  const panel = findItem(cenik.panely, cfg.panel.name);
  const konstr = findItem(cenik.konstrukce, cfg.konstrukce.name);
  const stridac = findItem(cenik.stridace, cfg.stridac.name);
  const zarukaItem = findItem(cenik.zaruky_stridac, cfg.stridac.name);
  const baterie = findItem(cenik.baterie, cfg.baterie.name);
  const bms = findItem(cenik.bms, cfg.bms.name);
  const rozvadecDc = findItem(cenik.rozvadec_dc, cfg.rozvadecDc.name);
  const ostatniFixed = findItem(cenik.ostatni, cfg.ostatniFixed.name);
  const backup = findItem(cenik.ostatni, cfg.backup.name);
  const wallbox = findItem(cenik.ostatni, cfg.wallbox.name);
  const regulace = findItem(cenik.regulace, cfg.regulace.name);
  const bojler = findItem(cenik.bojlery, cfg.bojler.name);
  const elmr = findItem(cenik.elmr, cfg.elmr);
  const dotaceZaklad = findItem(cenik.dotace_zaklad, cfg.dotaceZaklad);
  const prace = { elektro: findItem(cenik.prace, "Elektro práce").cena, strecha: findItem(cenik.prace, "Střecha práce").cena, instalater: findItem(cenik.prace, "Instalatérské práce + materiál").cena };
  const sluzby = { dotace: findItem(cenik.sluzby, "Vyřízení dotace").cena, ds: findItem(cenik.sluzby, "Vyřízení připojení k DS").cena, doprava: findItem(cenik.sluzby, "Doprava (km z Prahy - Instalace a zpět)").cena, revize: findItem(cenik.sluzby, "Revize").cena };

  // Řádky materiálu z ceníku — každý si může nést vlastní marži
  // (cfgItem.marzeOverride, v procentech; prázdné/nezadané = použije se
  // společná marže níže). Beze změny na jediném řádku vychází prodejní cena
  // úplně stejně jako dřív (jedna marže na celý naklad).
  const matRows = [
    ["panel", panel, cfg.panel],
    ["konstrukce", konstr, cfg.konstrukce],
    ["stridac", stridac, cfg.stridac],
    ["baterie", baterie, cfg.baterie],
    ["bms", bms, cfg.bms],
    ["rozvadecDc", rozvadecDc, cfg.rozvadecDc],
    ["ostatniFixed", ostatniFixed, cfg.ostatniFixed],
    ["backup", backup, cfg.backup],
    ["wallbox", wallbox, cfg.wallbox],
    ["regulace", regulace, cfg.regulace],
    ["bojler", bojler, cfg.bojler],
  ];
  const marze = Number(cfg.marze) || 0;
  const rowMarzeFrac = (cfgItem) => {
    const ov = cfgItem?.marzeOverride;
    return (ov === "" || ov == null) ? marze : (Number(ov) || 0) / 100;
  };
  const nakladMatRadky = matRows.reduce((s, [, it, cfgItem]) => s + it.cena * (Number(cfgItem.qty) || 0), 0);
  const prodejMatRadky = matRows.reduce((s, [, it, cfgItem]) => s + it.cena * (Number(cfgItem.qty) || 0) * (1 + rowMarzeFrac(cfgItem)), 0);
  const zarukaCena = cfg.zaruka ? zarukaItem.cena : 0;
  const customTotal = (cfg.customRows || []).reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.cena) || 0), 0);
  const nakladMat = nakladMatRadky + zarukaCena + customTotal;

  const nakladPrace = prace.elektro * (Number(cfg.mdElektro) || 0) + prace.strecha * (Number(cfg.mdStrecha) || 0) + prace.instalater * (Number(cfg.mdInstalater) || 0);
  const dopravaCena = (Number(cfg.svcDopravaKm) || 0) * sluzby.doprava * ((Number(cfg.mdElektro) || 0) + (Number(cfg.mdStrecha) || 0) / 2 + (Number(cfg.mdInstalater) || 0));
  const nakladSvc = sluzby.dotace * (Number(cfg.svcDotace) || 0) + sluzby.ds * (Number(cfg.svcDs) || 0) + dopravaCena + sluzby.revize * (Number(cfg.svcRevize) || 0) + elmr.cena + (Number(cfg.zakladniProvize) || 0);

  const naklad = nakladMat + nakladPrace + nakladSvc;
  const dph = Number(cfg.dph) || 0;
  const sleva = Number(cfg.sleva) || 0;
  // Materiálové řádky se sčítají už s vlastní (případně přepsanou) marží;
  // zbytek (záruka, vlastní řádky, práce, služby) pořád jede na společnou
  // marži jako dřív — beze změny na řádcích je výsledek identický.
  const nakladOstatni = zarukaCena + customTotal + nakladPrace + nakladSvc;
  const prodejniSDph = (prodejMatRadky + nakladOstatni * (1 + marze)) * (1 + dph);
  const cenaDphRounded = Math.ceil(prodejniSDph / 1000) * 1000 - sleva;

  const vykonFve = (panel.wp || 0) * (Number(cfg.panel.qty) || 0) / 1000;
  const bateriKwh = (baterie.kwh || 0) * (Number(cfg.baterie.qty) || 0);

  let dotace = 0;
  if (cfg.dotaceOn) {
    let zaklad = dotaceZaklad.cena + (vykonFve - 2) * 10000 + Math.min(bateriKwh, vykonFve * 2) * 10000 + ((cfg.wallbox.qty > 0) ? 20000 : 0) + 5000;
    const strop = 205000 + ((cfg.wallbox.qty > 0) ? 20000 : 0);
    if (zaklad > strop) zaklad = strop;
    dotace = Math.min(zaklad, cenaDphRounded * 0.5);
    if (cfg.kraj === "zvyhodnene") dotace = dotace * 1.1 - 500;
    if (cfg.wallbox.qty > 0) dotace += 10000;
    if (dotace < 0) dotace = 0;
  }
  const cenaPoDotaci = cenaDphRounded - dotace;
  const marzeKc = cenaDphRounded / (1 + dph) - naklad;

  const doporucenoPct = Math.max(1, Math.min(10, (0.2 * marze - 0.05) * 100));
  const plovouciPct = cfg.plovouciProvizePct == null ? doporucenoPct : Math.max(1, Math.min(10, Number(cfg.plovouciProvizePct) || 0));
  const provizeKc = (cenaDphRounded / (1 + dph)) * (plovouciPct / 100);
  const provizeCelkem = (Number(cfg.zakladniProvize) || 0) + provizeKc;

  const addCustomRow = () => set({ customRows: [...(cfg.customRows || []), { id: Date.now() + Math.random(), name: "", qty: 1, cena: 0 }] });
  const updateCustomRow = (id, patch) => set({ customRows: cfg.customRows.map((r) => r.id === id ? { ...r, ...patch } : r) });
  const removeCustomRow = (id) => set({ customRows: cfg.customRows.filter((r) => r.id !== id) });

  // Checklist "co je / není v ceně" — položky se dají odškrtnout (nepůjdou
  // do nabídky) nebo přidat vlastní; do dokumentu jde jen zaškrtnuté.
  const toggleItem = (key, id) => set({ [key]: cfg[key].map((it) => it.id === id ? { ...it, checked: !it.checked } : it) });
  const removeItem = (key, id) => set({ [key]: cfg[key].filter((it) => it.id !== id) });
  const addItem = (key, text, clear) => {
    if (!text.trim()) return;
    set({ [key]: [...(cfg[key] || []), { id: Date.now() + Math.random(), text: text.trim(), checked: true }] });
    clear("");
  };

  // Specifikace sestavy a cena pro zákazníka — žádný vnitřní rozpis nákladů,
  // Nabídka pro zákazníka jako Word dokument — přesně podle firemní šablony
  // (public/templates/nabidka_fve_sablona.docx), jen se do ní zapíšou
  // hodnoty. Formát, styl písma i rozvržení zůstávají beze změny, protože
  // se mění jen text v existujících místech šablony, ne formátování.
  const fmt1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toFixed(1).replace(".", ",");
  const fmtCz = (n) => (Math.round((Number(n) || 0) * 100) / 100).toString().replace(".", ",");
  const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString("cs-CZ");

  const generateWordOffer = async () => {
    try {
      const res = await fetch("/templates/nabidka_fve_sablona.docx");
      if (!res.ok) throw new Error("Šablona nenalezena");
      const buf = await res.arrayBuffer();
      const zip = new PizZip(buf);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      const vykonStr = fmt1(vykonFve);
      const bateriStr = fmtCz(bateriKwh);
      const vykonVeta = vykonFve > 0 ? `${vykonStr} kWp${bateriKwh > 0 ? ` a bateriového úložiště ${bateriStr} kWh` : ""}` : "—";
      const rocniVynos = cfg.rocniVynosOverride || (vykonFve > 0 ? `${fmt1(vykonFve * 1.0)}–${fmt1(vykonFve * 1.1)}` : "");
      // FVR (rozšíření stávající FVE) má jinou úvodní větu než FVE (nová
      // instalace) — šablona teď má na tomto místě placeholder {fveVeta}.
      const fveVeta = jobType === "FVR" ? "na rozšíření stávající fotovoltaické elektrárny" : "fotovoltaické elektrárny";

      doc.render({
        fveVeta,
        vykonVeta,
        cisloOP: cfg.cisloOP || "—",
        adresaInstalace: cfg.adresaInstalace || customerName || "—",
        vykon: vykonStr,
        panely: cfg.panel.qty > 0 ? `${cfg.panel.qty}x ${panel.name}` : "neuvedeno",
        konstrukce: cfg.konstrukce.qty > 0 ? `${cfg.konstrukce.qty}x konstrukce pro uchycení panelů` : "neuvedeno",
        stridac: cfg.stridac.qty > 0 ? `${cfg.stridac.qty}x ${stridac.name}` : "neuvedeno",
        baterieText: cfg.baterie.qty > 0 ? `${cfg.baterie.qty} x ${baterie.name} (${bateriStr}kWh)${cfg.bms.qty > 0 ? " + BMS" : ""}` : "Bez baterie",
        regulace: cfg.regulace.qty > 0 ? regulace.name : "Bez regulace",
        elektromobilita: cfg.wallbox.qty > 0 ? wallbox.name : "",
        rocniVynos,
        cenaCelkem: fmtNum(cenaDphRounded),
        dotace: fmtNum(dotace),
        cenaPoDotaci: fmtNum(cfg.dotaceOn ? cenaPoDotaci : cenaDphRounded),
        dph: String(Math.round(dph * 100)),
        zahrnuto: (cfg.zahrnutoItems || []).filter((it) => it.checked).map((it) => it.text),
        nezahrnuto: (cfg.nezahrnutoItems || []).filter((it) => it.checked).map((it) => it.text),
      });

      const blob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const PRESET_LABELS = { light: "LIGHT", basic: "BASIC", optimal: "OPTIMAL", premium: "PREMIUM", emobilita: "E-MOBILITA", servis: "SERVIS", custom: "Vlastni" };
      const now = new Date();
      const datumStr = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const jmenoPrijmeni = (customerName || quoteName || "Zakaznik").replace(/[^\p{L}\p{N} ]+/gu, "").trim().replace(/\s+/g, "_");
      const fileName = `FVE_${jmenoPrijmeni}_${PRESET_LABELS[cfg.preset] || "Vlastni"}_${vykonStr}kWp_${datumStr}.docx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Nepodařilo se vygenerovat nabídku ve Wordu: " + (err?.message || err));
    }
  };

  // Nabídka pro zákazníka — nová FVE, servis (SRV) i rozšíření (FVR) se
  // skládají jako náhled přímo v appce (NabidkaNahled.jsx), texty podle typu
  // z nabidkaTexty.js. Specifikace = komponenty s množstvím > 0 (bez položek
  // "Bez …" z ceníku): u FVE celá sestava, u SRV stávající soustava,
  // u FVR to, co se přidává. Word šablona zůstává u FVE jako záloha.
  const RADEK_LABELS = {
    panel: "Fotovoltaické panely", konstrukce: "Konstrukce", stridac: "Střídač", baterie: "Baterie",
    bms: "BMS", rozvadecDc: "Rozvaděč DC", ostatniFixed: "Ostatní elektro materiál", backup: "Back-up",
    wallbox: "Wallbox / nabíjení EV", regulace: "Regulace", bojler: "Bojler",
  };
  const maNahled = jobType === "SRV" || jobType === "FVR" || jobType === "FVE";
  // Cena nabídky se u všech tří typů bere automaticky z kalkulace.
  const synchronizovatCenu = maNahled;
  const ukonyNabidky = ukonyZCfg(cfg);
  const vNabidce = (item, cfgItem) => Number(cfgItem?.qty) > 0 && !/^Bez /.test(item?.name || "");
  // Nová FVE: jen to, co zákazníka zajímá (jako dřív ve Wordu) — rozvaděč DC
  // a drobný elektro materiál jsou v "Dodávka FVE a všech komponent".
  const FVE_RADKY = {
    panel: "Fotovoltaické panely", konstrukce: "Konstrukce pro uchycení panelů", stridac: "Střídač", baterie: "Baterie",
    backup: "Záložní napájení (back-up)", regulace: "Regulace do TUV", wallbox: "Elektromobilita", bojler: "Bojler",
  };
  const radkyNabidky = matRows
    .filter(([key, item, cfgItem]) => vNabidce(item, cfgItem) && (jobType !== "FVE" || FVE_RADKY[key]))
    .map(([key, item, cfgItem]) => ({
      label: (jobType === "FVE" ? FVE_RADKY[key] : RADEK_LABELS[key]) || key,
      hodnota: key === "baterie" && bateriKwh > 0
        ? `${item.name} (celkem ${fmtCz(bateriKwh)} kWh)${jobType === "FVE" && vNabidce(bms, cfg.bms) ? " + BMS" : ""}`
        : item.name,
      ks: String(cfgItem.qty),
    }));
  (cfg.customRows || [])
    .filter((r) => (r.name || "").trim() && Number(r.qty) > 0)
    .forEach((r) => radkyNabidky.push({ label: "Další položka", hodnota: r.name.trim(), ks: String(r.qty) }));
  // Cena v nabídce: u servisu součet úkonů (zaokrouhleno jen na celé Kč),
  // u FVE a rozšíření cena díla z kalkulace; dotace se v nabídce ukáže
  // zvlášť (cena díla − dotace = cena pro zákazníka), platby jsou z ceny díla.
  const cenaNabidkyBezDph = jobType === "SRV" ? soucetUkonu(ukonyNabidky) : null;
  const cenaNabidkySDph = jobType === "SRV" ? Math.round(cenaNabidkyBezDph * (1 + dph)) : cenaDphRounded;
  const cenaNabidkyBezDphFinal = jobType === "SRV" ? cenaNabidkyBezDph : Math.round(cenaNabidkySDph / (1 + dph));
  const dotaceNabidky = jobType !== "SRV" && cfg.dotaceOn ? Math.round(dotace) : 0;
  const textyNahledu = maNahled ? textyNabidky({
    jobType,
    ukony: ukonyNabidky,
    radky: radkyNabidky,
    vykonKwp: vykonFve,
    bateriKwh,
    sDotaci: dotaceNabidky > 0,
    rocniVynos: String(cfg.rocniVynosOverride || "").trim() || odhadVynosu(vykonFve),
    maBaterii: vNabidce(baterie, cfg.baterie),
    prodlouzenaZarukaStridace: !!cfg.zaruka,
    cisloOP: String(cfg.cisloOP || "").trim(),
  }) : null;
  // "Co je / není v ceně" pro náhled: zaškrtnuté položky + u rozšíření změna
  // připojení u distributora podle volby (někdy v ceně, někdy ne).
  const zmenaPripojeni = ZMENA_PRIPOJENI[cfg.zmenaPripojeni];
  const zahrnutoNahled = [
    ...(cfg.zahrnutoItems || []).filter((it) => it.checked).map((it) => it.text),
    ...(jobType === "FVR" && cfg.zmenaPripojeni === "vcene" ? [zmenaPripojeni.text] : []),
  ];
  const nezahrnutoNahled = [
    ...(cfg.nezahrnutoItems || []).filter((it) => it.checked).map((it) => it.text),
    ...(jobType === "FVR" && cfg.zmenaPripojeni === "mimo" ? [zmenaPripojeni.text] : []),
  ];
  // Nabídka z dřívějška může mít zapnuté položky nové instalace FVE nebo
  // její seznam "co je v ceně" — upozornit a nabídnout opravu jedním klikem.
  const polozkyNoveFve = maNahled && jobType === "FVR" ? zapnutePolozkyNoveInstalace(cfg) : [];
  const seznamNoveFve = (jobType === "SRV" || jobType === "FVR") && maSeznamNoveFve(cfg);
  const opravitNaSluzbu = () => set({
    ...(jobType === "FVR" ? POLOZKY_NOVE_INSTALACE : {}),
    ...(seznamNoveFve ? seznamyPodleTypu(jobType) : {}),
  });

  const selStyle = { ...S.select, marginBottom: 0 };
  const qtyStyle = { ...S.input, marginBottom: 0, width: 70 };

  const row = (label, key, list, item, cfgItem) => {
    const qty = cfgItem.qty;
    const cenaBezMarze = item.cena * (Number(qty) || 0);
    const rowFrac = rowMarzeFrac(cfgItem);
    const cenaSMarzi = cenaBezMarze * (1 + rowFrac);
    const prepsano = cfgItem.marzeOverride !== "" && cfgItem.marzeOverride != null;
    return (
      <tr key={key}>
        <td style={S.td}>{label}</td>
        <td style={S.td}><Sel list={list} value={item.name} onChange={(name) => setItem(key, { name })} style={selStyle} /></td>
        <td style={S.td}><input type="number" min="0" style={qtyStyle} value={qty} onChange={(e) => setItem(key, { qty: e.target.value })} /></td>
        <td style={{ ...S.td, textAlign: "right", color: "#475569", whiteSpace: "nowrap" }}>{fmtKc(cenaBezMarze)}</td>
        <td style={{ ...S.td, textAlign: "right", color: "#94a3b8", whiteSpace: "nowrap" }}>{fmtKc(item.cena)}</td>
        <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
            <input
              type="number" min="0" max="100" step="1"
              placeholder={String(Math.round(marze * 100))}
              style={{ ...S.input, marginBottom: 0, width: 46, textAlign: "right", fontSize: 11, padding: "4px 5px", color: prepsano ? "#0369a1" : "#94a3b8" }}
              value={cfgItem.marzeOverride ?? ""}
              onChange={(e) => setItem(key, { marzeOverride: e.target.value })}
              title="Marže pro tento řádek — prázdné = použije se společná marže"
            />
            <span style={{ fontSize: 11, color: "#94a3b8" }}>%</span>
            <b style={{ color: "#34d399" }}>{fmtKc(cenaSMarzi)}</b>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div style={S.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontWeight: 700, color: "#1A1A1A" }}>☀️ Kalkulačka FVE — přesně podle Excelu</div>
        <button style={{ ...S.btnGhost, padding: "5px 12px", fontSize: 11 }} onClick={() => setAdminOpen((v) => !v)}>⚙️ Ceník {isAdmin ? "(admin)" : ""}</button>
      </div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>Materiál, práce, služby, dotace a provize se počítají stejně jako v excelové kalkulačce sestav. Ceník je natažený z databáze.</div>

      {maNahled && (polozkyNoveFve.length > 0 || seznamNoveFve) && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#7f1d1d" }}>
          <b>⚠️ Tahle nabídka má nastavení pro novou instalaci FVE:</b>{" "}
          {[...polozkyNoveFve, seznamNoveFve && "seznam „Co je v ceně“ (Dodávka FVE, Instalace FVE, připojení k DS…)"].filter(Boolean).join(", ")}.
          {jobType === "FVR" && polozkyNoveFve.length > 0 && " Tyhle položky se počítají do ceny."}
          <div style={{ marginTop: 8 }}>
            <button style={{ ...S.btn("#dc2626"), padding: "5px 12px", fontSize: 12 }} onClick={opravitNaSluzbu}>
              Nastavit pro {jobType === "SRV" ? "servis" : "rozšíření"}
            </button>
            <span style={{ marginLeft: 8, color: "#991b1b" }}>(vynuluje je a dá výchozí seznam pro {jobType === "SRV" ? "servis" : "rozšíření"}; pak zkontroluj cenu)</span>
          </div>
        </div>
      )}
      {jobType === "SRV" && <ServisUkony ukony={ukonyZCfg(cfg)} onChange={(ukony) => set({ ukony })} dph={dph} S={S} />}
      {jobType === "FVR" && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#7c2d12" }}>
          <b>Rozšíření FVE:</b> do materiálu níže zadávej jen to, co se <b>přidává</b> (např. 8 panelů, 1 baterie). V nabídce se z toho udělá seznam „Co se bude přidávat“ včetně přidaného výkonu.
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <b>Vyřízení změny připojení u distributora:</b>
            <select style={{ ...S.select, marginBottom: 0, width: "auto", borderColor: cfg.zmenaPripojeni ? undefined : "#f87171" }}
              value={cfg.zmenaPripojeni || ""} onChange={(e) => set({ zmenaPripojeni: e.target.value || undefined })}>
              <option value="">— vyber —</option>
              {Object.entries(ZMENA_PRIPOJENI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <span style={{ color: "#9a3412" }}>propíše se do „Co je / není v ceně“</span>
          </div>
        </div>
      )}

      {adminOpen && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 16 }}>
          {!isAdmin && <div style={{ color: "#f59e0b", fontSize: 12, marginBottom: 10 }}>Ceník smí upravovat jen role administrátor — tady je jen náhled.</div>}
          {Object.keys(cenik).map((cat) => (
            <details key={cat} style={{ marginBottom: 8 }}>
              <summary style={{ cursor: "pointer", color: "#64748b", fontSize: 12, fontWeight: 700 }}>{CAT_LABELS[cat] || cat} ({cenik[cat].length})</summary>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
                <tbody>
                  {cenik[cat].map((it) => (
                    <tr key={it.id}>
                      <td style={{ ...S.td, padding: "3px 6px" }}>
                        <input disabled={!isAdmin} style={{ ...S.input, marginBottom: 0 }} value={it.name}
                          onChange={(e) => setCenik({ ...cenik, [cat]: cenik[cat].map((x) => x.id === it.id ? { ...x, name: e.target.value } : x) })} />
                      </td>
                      <td style={{ ...S.td, padding: "3px 6px", width: 120 }}>
                        <input disabled={!isAdmin} type="number" style={{ ...S.input, marginBottom: 0 }} value={it.cena}
                          onChange={(e) => setCenik({ ...cenik, [cat]: cenik[cat].map((x) => x.id === it.id ? { ...x, cena: e.target.value } : x) })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isAdmin && (
                <button style={{ ...S.btnGhost, marginTop: 6, padding: "4px 10px", fontSize: 11 }} onClick={() => addCenikItem(cat)}>+ Přidat položku</button>
              )}
            </details>
          ))}
          {isAdmin && (
            <button style={{ ...S.btn("#34d399"), marginTop: 10, padding: "6px 16px", fontSize: 12 }} disabled={savingCenik}
              onClick={async () => {
                setSavingCenik(true);
                const updates = Object.values(cenik).flat().map((it) => ({ id: it.id, name: it.name, cena: Number(it.cena) || 0, updated_at: new Date().toISOString() }));
                for (const u of updates) {
                  await supabase.from("fve_cenik_items").update({ name: u.name, cena: u.cena, updated_at: u.updated_at }).eq("id", u.id);
                }
                setSavingCenik(false);
                loadCenik();
              }}>{savingCenik ? "Ukládám…" : "💾 Uložit ceník"}</button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <select style={{ ...S.select, flex: 1, minWidth: 160 }} value={cfg.preset} onChange={(e) => onChange(applyPreset(cfg, e.target.value))}>
          <option value="custom">Vlastní sestava</option>
          <option value="light">LIGHT</option>
          <option value="basic">BASIC</option>
          <option value="optimal">OPTIMAL</option>
          <option value="premium">PREMIUM</option>
          <option value="emobilita">E-MOBILITA</option>
          <option value="servis">SERVIS (úpravy stávající instalace)</option>
        </select>
        <select style={{ ...S.select, width: 170 }} value={cfg.kraj} onChange={(e) => set({ kraj: e.target.value })}>
          <option value="ostatni">Ostatní kraje</option>
          <option value="zvyhodnene">Zvýhodněné kraje</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0 10px" }}>
          <input type="checkbox" checked={cfg.dotaceOn} onChange={(e) => set({ dotaceOn: e.target.checked })} /> S dotací
        </label>
      </div>

      {cfg.dotaceOn && (
        <div style={{ marginBottom: 14, maxWidth: 320 }}>
          <label style={S.label}>Typ dotace (podle střídače)</label>
          <select style={S.select} value={cfg.dotaceZaklad} onChange={(e) => set({ dotaceZaklad: e.target.value })}>
            {(cenik.dotace_zaklad || []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
          </select>
        </div>
      )}

      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>Údaje pro nabídku pro zákazníka — nepočítají se, jen se vypíšou do nabídky.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          <div><label style={S.label}>Číslo obchodního případu</label><input style={S.input} placeholder="RJ-26-08-0001" value={cfg.cisloOP} onChange={(e) => set({ cisloOP: e.target.value })} /></div>
          <div><label style={S.label}>Adresa instalace</label><input style={S.input} placeholder={customerAddress ? `prázdné = ${customerAddress}` : "např. Zábřeh, Krumpach 12"} value={cfg.adresaInstalace} onChange={(e) => set({ adresaInstalace: e.target.value })} /></div>
          <div><label style={S.label}>Roční výnos FVE (MWh) — prázdné = odhad</label><input style={S.input} placeholder="např. 6,0–6,9" value={cfg.rocniVynosOverride} onChange={(e) => set({ rocniVynosOverride: e.target.value })} /></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Ve výše uvedené ceně elektrárny JE zahrnuto</div>
            {cfg.zahrnutoItems.map((it) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={it.checked} onChange={() => toggleItem("zahrnutoItems", it.id)} />
                <span style={{ flex: 1, fontSize: 13, color: it.checked ? "#1A1A1A" : "#64748b", textDecoration: it.checked ? "none" : "line-through" }}>{it.text}</span>
                <button onClick={() => removeItem("zahrnutoItems", it.id)} style={{ ...S.btn("#ef4444"), padding: "2px 8px", fontSize: 10 }}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input style={{ ...S.input, marginBottom: 0 }} placeholder="+ přidat položku" value={newZahrnuto} onChange={(e) => setNewZahrnuto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem("zahrnutoItems", newZahrnuto, setNewZahrnuto)} />
              <button style={{ ...S.btnGhost, padding: "6px 12px", fontSize: 12 }} onClick={() => addItem("zahrnutoItems", newZahrnuto, setNewZahrnuto)}>Přidat</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Ve výše uvedené ceně elektrárny NENÍ zahrnuto</div>
            {cfg.nezahrnutoItems.map((it) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={it.checked} onChange={() => toggleItem("nezahrnutoItems", it.id)} />
                <span style={{ flex: 1, fontSize: 13, color: it.checked ? "#1A1A1A" : "#64748b", textDecoration: it.checked ? "none" : "line-through" }}>{it.text}</span>
                <button onClick={() => removeItem("nezahrnutoItems", it.id)} style={{ ...S.btn("#ef4444"), padding: "2px 8px", fontSize: 10 }}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input style={{ ...S.input, marginBottom: 0 }} placeholder="+ přidat položku" value={newNezahrnuto} onChange={(e) => setNewNezahrnuto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem("nezahrnutoItems", newNezahrnuto, setNewNezahrnuto)} />
              <button style={{ ...S.btnGhost, padding: "6px 12px", fontSize: 12 }} onClick={() => addItem("nezahrnutoItems", newNezahrnuto, setNewNezahrnuto)}>Přidat</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>Materiál</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
        <thead><tr><th style={S.th}>Řádek</th><th style={S.th}>Položka</th><th style={S.th}>Množ.</th><th style={S.th}>Cena bez marže</th><th style={S.th}>Cena za kus</th><th style={S.th}>Cena s marží ({Math.round(marze * 100)} %)</th></tr></thead>
        <tbody>
          {row("Panely", "panel", cenik.panely, panel, cfg.panel)}
          {row("Konstrukce", "konstrukce", cenik.konstrukce, konstr, cfg.konstrukce)}
          {row("Střídač", "stridac", cenik.stridace, stridac, cfg.stridac)}
          <tr>
            <td style={S.td} colSpan={5}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <input type="checkbox" checked={cfg.zaruka} onChange={(e) => set({ zaruka: e.target.checked })} /> + Záruka 10 let na střídač (0 % marže)
              </label>
            </td>
            <td style={{ ...S.td, textAlign: "right", color: "#475569" }}>{fmtKc(zarukaCena)}</td>
          </tr>
          {row("Baterie", "baterie", cenik.baterie, baterie, cfg.baterie)}
          {row("BMS", "bms", cenik.bms, bms, cfg.bms)}
          {row("Rozvaděč DC", "rozvadecDc", cenik.rozvadec_dc, rozvadecDc, cfg.rozvadecDc)}
          {row("Ostatní elektro materiál", "ostatniFixed", cenik.ostatni, ostatniFixed, cfg.ostatniFixed)}
          {row("Back-up", "backup", cenik.ostatni, backup, cfg.backup)}
          {row("Wallbox / regulace navíc", "wallbox", cenik.ostatni, wallbox, cfg.wallbox)}
          {row("Regulace (AZrouter)", "regulace", cenik.regulace, regulace, cfg.regulace)}
          {row("Bojler", "bojler", cenik.bojlery, bojler, cfg.bojler)}
        </tbody>
      </table>

      {(cfg.customRows || []).map((r) => (
        <div key={r.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <input style={{ ...S.input, marginBottom: 0, flex: 1 }} placeholder="Název nespecifikované položky" value={r.name} onChange={(e) => updateCustomRow(r.id, { name: e.target.value })} />
          <input type="number" style={{ ...S.input, marginBottom: 0, width: 70 }} placeholder="ks" value={r.qty} onChange={(e) => updateCustomRow(r.id, { qty: e.target.value })} />
          <input type="number" style={{ ...S.input, marginBottom: 0, width: 100 }} placeholder="Kč/ks" value={r.cena} onChange={(e) => updateCustomRow(r.id, { cena: e.target.value })} />
          <span style={{ width: 90, textAlign: "right", fontSize: 13, color: "#475569" }}>{fmtKc((Number(r.qty) || 0) * (Number(r.cena) || 0))}</span>
          <button onClick={() => removeCustomRow(r.id)} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11 }}>✕</button>
        </div>
      ))}
      <button onClick={addCustomRow} style={{ ...S.btnGhost, marginBottom: 16, padding: "6px 14px", fontSize: 12 }}>+ Přidat nespecifikovanou položku</button>

      <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>Práce (MD)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        <div><label style={S.label}>Elektro práce ({fmtKc(prace.elektro)}/MD)</label><input type="number" style={S.input} value={cfg.mdElektro} onChange={(e) => set({ mdElektro: e.target.value })} /></div>
        <div><label style={S.label}>Střecha práce ({fmtKc(prace.strecha)}/MD)</label><input type="number" style={S.input} value={cfg.mdStrecha} onChange={(e) => set({ mdStrecha: e.target.value })} /></div>
        <div><label style={S.label}>Instalatérské práce ({fmtKc(prace.instalater)}/MD)</label><input type="number" style={S.input} value={cfg.mdInstalater} onChange={(e) => set({ mdInstalater: e.target.value })} /></div>
      </div>

      <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>Služby</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
        <div><label style={S.label}>Vyřízení dotace</label><input type="number" style={S.input} value={cfg.svcDotace} onChange={(e) => set({ svcDotace: e.target.value })} /></div>
        <div><label style={S.label}>Vyřízení připojení k DS</label><input type="number" style={S.input} value={cfg.svcDs} onChange={(e) => set({ svcDs: e.target.value })} /></div>
        <div><label style={S.label}>Doprava (km z Prahy tam i zpět)</label><input type="number" style={S.input} value={cfg.svcDopravaKm} onChange={(e) => set({ svcDopravaKm: e.target.value })} /></div>
        <div><label style={S.label}>Revize</label><input type="number" style={S.input} value={cfg.svcRevize} onChange={(e) => set({ svcRevize: e.target.value })} /></div>
        <div style={{ gridColumn: "span 2" }}>
          <label style={S.label}>Úprava ELMR</label>
          <select style={S.select} value={cfg.elmr} onChange={(e) => set({ elmr: e.target.value })}>
            {(cenik.elmr || []).map((x) => <option key={x.name} value={x.name}>{x.name} — {fmtKc(x.cena)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>Provize OZ</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div><label style={S.label}>Základní provize (Kč)</label><input type="number" style={S.input} value={cfg.zakladniProvize} onChange={(e) => set({ zakladniProvize: e.target.value })} /></div>
        <div>
          <label style={S.label}>Plovoucí provize (%) — doporučeno {Math.round(doporucenoPct * 10) / 10} %</label>
          <input type="text" inputMode="decimal" style={S.input}
            value={cfg.plovouciProvizePct == null ? Math.round(doporucenoPct * 10) / 10 : cfg.plovouciProvizePct}
            onChange={(e) => set({ plovouciProvizePct: e.target.value })}
            onBlur={(e) => { let v = parseFloat(String(e.target.value).replace(",", ".")); if (isNaN(v)) v = doporucenoPct; v = Math.max(1, Math.min(10, v)); set({ plovouciProvizePct: v }); }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 6 }}>
        <div><label style={S.label}>Marže</label><input type="range" min="0" max="0.6" step="0.01" value={cfg.marze} onChange={(e) => set({ marze: e.target.value })} style={{ width: "100%" }} /><div style={{ fontSize: 13 }}>{Math.round(marze * 100)} %</div></div>
        <div><label style={S.label}>DPH</label><input type="range" min="0" max="0.21" step="0.01" value={cfg.dph} onChange={(e) => set({ dph: e.target.value })} style={{ width: "100%" }} /><div style={{ fontSize: 13 }}>{Math.round(dph * 100)} %</div></div>
        <div><label style={S.label}>Sleva (Kč)</label><input type="number" style={S.input} value={cfg.sleva} onChange={(e) => set({ sleva: e.target.value })} /></div>
      </div>
      {marze < 0.35 && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 10 }}>⚠️ Marže pod 35 % je potřeba schválit u Romana.</div>}

      <div style={{ display: "grid", gridTemplateColumns: cfg.dotaceOn ? "repeat(2,1fr)" : "repeat(2,1fr)", gap: 12, marginBottom: 12, marginTop: 6 }}>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}><div style={S.label}>Celkem náklad</div><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtKc(naklad)}</div></div>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}><div style={S.label}>Cena s DPH po zaokrouhlení</div><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtKc(cenaDphRounded)}</div></div>
        {cfg.dotaceOn && <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: 14 }}><div style={{ ...S.label, color: "#16a34a" }}>Dotace</div><div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>{fmtKc(dotace)}</div></div>}
        {cfg.dotaceOn && <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 14 }}><div style={{ ...S.label, color: "#0369a1" }}>Cena po dotaci</div><div style={{ fontSize: 22, fontWeight: 800, color: "#0369a1" }}>{fmtKc(cenaPoDotaci)}</div></div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}><div style={S.label}>Marže Kč</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtKc(marzeKc)}</div></div>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, gridColumn: "span 2" }}><div style={S.label}>Provize OZ celkem</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtKc(provizeCelkem)} <span style={{ color: "#475569", fontWeight: 400 }}>(zákl. {fmtKc(cfg.zakladniProvize)} + plov. {Math.round(plovouciPct * 10) / 10}% = {fmtKc(provizeKc)})</span></div></div>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}><div style={S.label}>Výkon / Baterie</div><div style={{ fontSize: 14, fontWeight: 700 }}>{Math.round(vykonFve * 10) / 10} kWp / {Math.round(bateriKwh * 10) / 10} kWh</div></div>
      </div>

      {jobType === "SRV" && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#1e3a8a" }}>
          U servisu je cena nabídky <b>součet úkonů: {fmtKc(cenaNabidkySDph)} s DPH</b>. Čísla výše (materiál z popisu soustavy) se do nabídky nepočítají.
        </div>
      )}
      {synchronizovatCenu && (
        <SyncCilovaCena cenaBezDph={Math.round(cenaNabidkyBezDphFinal)} cenaSDph={Math.round(cenaNabidkySDph)} dphPct={Math.round(dph * 100)}
          naklad={jobType === "SRV" ? null : Math.round(naklad)} aktualni={cenaVNabidce} onSync={onUseAsTarget} />
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {maNahled && <button style={S.btn("#0369a1")} onClick={() => setNahledOtevren((v) => !v)}>📝 {nahledOtevren ? "Skrýt náhled nabídky" : "Náhled nabídky pro zákazníka"}</button>}
        {jobType === "FVE" && (
          <button style={S.btnGhost} onClick={generateWordOffer} title="Původní Word šablona — bez čísla nabídky a evidence odeslání">📄 Word (původní šablona)</button>
        )}
      </div>
      {maNahled && nahledOtevren && (
        <NabidkaNahled
          texty={textyNahledu}
          ukony={ukonyNabidky}
          onUkonyChange={(ukony) => set({ ukony })}
          cenaSDph={cenaNabidkySDph}
          cenaBezDph={cenaNabidkyBezDphFinal}
          dphPct={Math.round(dph * 100)}
          seznamNoveFve={seznamNoveFve}
          zahrnuto={zahrnutoNahled}
          nezahrnuto={nezahrnutoNahled}
          chybiPripojeni={jobType === "FVR" && !zmenaPripojeni}
          upravy={cfg.nahled}
          onUpravy={(nahled) => set({ nahled })}
          typ={jobType}
          dotace={dotaceNabidky}
          customerName={customerName}
          adresa={cfg.adresaInstalace || customerAddress}
          cisloNabidky={cisloNabidky}
          vystaveno={vystaveno}
          oz={{ jmeno: currentUser?.name || "", email: currentUser?.email || "", employeeId: currentUser?.employeeId ?? null }}
          odeslane={odeslane}
          onOdeslano={onOdeslano}
          isAdmin={isAdmin}
          onSave={onSave}
          S={S}
        />
      )}
    </div>
  );
}
