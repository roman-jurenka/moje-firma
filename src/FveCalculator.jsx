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

// Vzhled kalkulačky po sekcích (Materiál / Služby a práce / Ostatní) a lišta
// s cenou přilepená dole. Na mobilu je řádek dvouřádkový (název + položka,
// pod tím množství a cena s DPH); lišta sedí nad spodní navigací.
const FK_CSS = `
.fk-row { display: grid; grid-template-columns: 170px minmax(0, 1fr) 72px 100px 78px 112px 112px 36px; gap: 10px; align-items: center; padding: 5px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
.fk-head { padding: 9px 16px; font-size: 11px; font-weight: 700; color: #475569; letter-spacing: .4px; background: #fff; border-bottom: 1px solid #e2e8f0; }
.fk-num { text-align: right; white-space: nowrap; }
.fk-zak .fk-int { display: none !important; }
.fk-zak .fk-row { grid-template-columns: 170px minmax(0, 1fr) 72px 140px 140px 36px; }
.fk-hlava { display: flex; align-items: center; gap: 14px; padding: 12px 16px; }
.fk-soucty { display: flex; gap: 20px; text-align: right; }
.fk-lista { position: sticky; bottom: 0; z-index: 30; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 -8px 24px rgba(15, 23, 42, .10); padding: 12px 18px; margin: 8px 0 16px; }
.fk-l { display: block; font-size: 12px; color: #475569; }
.fk-v { font-size: 18px; font-weight: 800; white-space: nowrap; }
.fk-varovani { flex-basis: 100%; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 8px; padding: 6px 10px; font-size: 13px; font-weight: 700; }
@media (max-width: 900px) {
  .fk-row, .fk-zak .fk-row { grid-template-columns: 72px minmax(0, 1fr) 36px; row-gap: 6px; padding: 8px 12px; }
  .fk-row > .fk-lbl, .fk-row > .fk-pol { grid-column: 1 / -1; }
  .fk-row > .fk-int, .fk-row > .fk-mhide { display: none !important; }
  .fk-head > .fk-pol { display: none; }
  .fk-hlava { flex-wrap: wrap; }
  .fk-soucty { width: 100%; justify-content: flex-end; }
}
@media (max-width: 768px) {
  .fk-lista { bottom: calc(66px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; padding: 8px 10px 8px 70px; gap: 6px 10px; }
  .fk-lista .fk-li-mhide { display: none; }
  .fk-lista .fk-v { font-size: 16px !important; }
  .fk-lista .fk-l { font-size: 11px; }
  .fk-lista > div { text-align: left !important; min-width: 0; }
  .fk-lista .fk-varovani { grid-column: 1 / -1; }
  .fk-lista .fk-dph { padding: 0 9px !important; white-space: nowrap; }
}
`;
const PRESET_NAZVY = { light: "LIGHT", basic: "BASIC", optimal: "OPTIMAL", premium: "PREMIUM", emobilita: "E-MOBILITA", servis: "SERVIS", custom: "Vlastní sestava" };
const MIN_MARZE = 0.35; // pod touhle marží je potřeba schválení (dosavadní pravidlo)
const SEKCE_VZHLED = {
  material: { nazev: "Materiál", popis: "Panely, konstrukce, střídač, baterie a řízení", bd: "#bae6fd", bg: "#e0f2fe", ik: "#0369a1", barva: "#075985", text: "#0c4a6e", pridat: "+ Přidat vlastní položku materiálu" },
  sluzby: { nazev: "Služby a práce", popis: "Montáž v MD, vyřízení dotace a připojení, doprava, revize, ELMR", bd: "#ddd6fe", bg: "#ede9fe", ik: "#6d28d9", barva: "#5b21b6", text: "#4c1d95", pridat: "+ Přidat vlastní službu nebo práci" },
  ostatni: { nazev: "Ostatní", popis: "Drobný elektro materiál, back-up, wallbox, bojler a vlastní položky", bd: "#fde68a", bg: "#fef3c7", ik: "#b45309", barva: "#92400e", text: "#78350f", pridat: "+ Přidat vlastní ostatní položku" },
};
const svgIkona = (d) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const IKONY_SEKCI = {
  material: svgIkona(<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>),
  sluzby: svgIkona(<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z" />),
  ostatni: svgIkona(<><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M17 14v6M14 17h6" /></>),
};

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
const noveIdRadku = () => Date.now() + Math.random();
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

export default function FveCalculator({ value, onChange, currentUser, onUseAsTarget, S, customerName, quoteName, jobType, onSave, cenaVNabidce, cisloNabidky, vystaveno, customerAddress, customerEmail, odeslane, onOdeslano, uZakaznika, onUZakaznika }) {
  const cfg = value || PRAZDNA_FVE();
  const set = (patch) => onChange({ ...cfg, ...patch });
  const setItem = (key, patch) => onChange({ ...cfg, [key]: { ...cfg[key], ...patch } });

  const [cenik, setCenik] = useState(null); // { panely: [...], ... }
  const [adminOpen, setAdminOpen] = useState(false);
  const [savingCenik, setSavingCenik] = useState(false);
  const [newZahrnuto, setNewZahrnuto] = useState("");
  const [newNezahrnuto, setNewNezahrnuto] = useState("");
  const [nahledOtevren, setNahledOtevren] = useState(false);
  // Režim „U zákazníka“: schová náklady, marže a provize (obrazovka jde ukázat
  // zákazníkovi). Nepoužité řádky (0 ks, „Bez …“) jsou schované, dokud se neukážou.
  const [uZakLokalne, setUZakLokalne] = useState(false);
  const uZak = uZakaznika ?? uZakLokalne;
  const setUZak = onUZakaznika || setUZakLokalne;
  const [ukazNepouzite, setUkazNepouzite] = useState({});
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
  let dotaceDuvod = "";
  if (cfg.dotaceOn) {
    let zaklad = dotaceZaklad.cena + (vykonFve - 2) * 10000 + Math.min(bateriKwh, vykonFve * 2) * 10000 + ((cfg.wallbox.qty > 0) ? 20000 : 0) + 5000;
    const strop = 205000 + ((cfg.wallbox.qty > 0) ? 20000 : 0);
    dotaceDuvod = "podle výkonu a baterie";
    if (zaklad > strop) { zaklad = strop; dotaceDuvod = `strop ${fmtKc(strop)}`; }
    if (cenaDphRounded * 0.5 < zaklad) dotaceDuvod = "max. 50 % ceny s DPH";
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

  const addCustomRow = (sekce = "ostatni") => {
    set({ customRows: [...(cfg.customRows || []), { id: noveIdRadku(), name: "", qty: 1, cena: 0, sekce }] });
  };
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

  // ── Kalkulace po sekcích: Materiál / Služby a práce / Ostatní ──
  // Jen jiné rozdělení a zobrazení — výpočet ceny (náklad, marže, DPH,
  // zaokrouhlení, dotace) je beze změny výše.
  const kDph = 1 + dph;
  const inpS = { ...S.input, marginBottom: 0 };
  const pctTxt = (f) => `${Math.round(f * 1000) / 10} %`;
  const cislo = (x) => Number(x) || 0;
  const nepouzita = (item, cfgItem) => !(cislo(cfgItem?.qty) > 0) || /^Bez /.test(item?.name || "");
  const RADKY_MAT = [
    ["panel", "Panely", cenik.panely, panel], ["konstrukce", "Konstrukce", cenik.konstrukce, konstr],
    ["stridac", "Střídač", cenik.stridace, stridac], ["baterie", "Baterie", cenik.baterie, baterie],
    ["bms", "BMS", cenik.bms, bms], ["rozvadecDc", "Rozvaděč DC", cenik.rozvadec_dc, rozvadecDc],
    ["regulace", "Regulace (AZrouter)", cenik.regulace, regulace],
  ];
  const RADKY_OST = [
    ["ostatniFixed", "Elektro drobný materiál", cenik.ostatni, ostatniFixed], ["backup", "Back-up", cenik.ostatni, backup],
    ["wallbox", "Wallbox / regulace navíc", cenik.ostatni, wallbox], ["bojler", "Bojler", cenik.bojlery, bojler],
  ];
  const vlastniRadky = (sekce) => (cfg.customRows || []).filter((r) => (r.sekce || "ostatni") === sekce);
  const nVlastni = (sekce) => vlastniRadky(sekce).reduce((sum, r) => sum + cislo(r.qty) * cislo(r.cena), 0);
  const nRadku = ([key, , , item]) => item.cena * cislo(cfg[key].qty);
  const sRadku = (radek) => nRadku(radek) * (1 + rowMarzeFrac(cfg[radek[0]]));
  const provizeZakl = cislo(cfg.zakladniProvize);
  const sluzbyBezProvize = nakladSvc - provizeZakl;
  const nSluzby = nakladPrace + sluzbyBezProvize + nVlastni("sluzby");
  const nMatVlastni = zarukaCena + nVlastni("material");
  const sekceSum = {
    material: {
      n: RADKY_MAT.reduce((sum, rr) => sum + nRadku(rr), 0) + nMatVlastni,
      s: RADKY_MAT.reduce((sum, rr) => sum + sRadku(rr), 0) + nMatVlastni * (1 + marze),
    },
    sluzby: { n: nSluzby, s: nSluzby * (1 + marze) },
    ostatni: {
      n: RADKY_OST.reduce((sum, rr) => sum + nRadku(rr), 0) + nVlastni("ostatni"),
      s: RADKY_OST.reduce((sum, rr) => sum + sRadku(rr), 0) + nVlastni("ostatni") * (1 + marze),
    },
  };
  const podil = (n) => (naklad > 0 ? Math.round((n / naklad) * 100) : 0);
  const nizkaMarze = marze < MIN_MARZE;
  const dphPct = Math.round(dph * 100);
  const sazbyDph = [12, 21, ...([12, 21].includes(dphPct) ? [] : [dphPct])];
  const presunNa = (id) => document.getElementById(`fk-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Jeden řádek kalkulace (stejné sloupce ve všech sekcích).
  const radek = ({ klic, nazev, polozka, mnozstvi, n, frac, marzeBunka, akce, slabe }) => (
    <div key={klic} className="fk-row" style={slabe ? { opacity: 0.6 } : undefined}>
      <div className="fk-lbl" style={{ fontWeight: 600, minWidth: 0 }}>{nazev}</div>
      <div className="fk-pol" style={{ minWidth: 0 }}>{polozka}</div>
      <div>{mnozstvi}</div>
      <div className="fk-num fk-int" style={{ color: "#475569" }}>{fmtKc(n)}</div>
      <div className="fk-num fk-int">{marzeBunka || <span style={{ color: "#64748b" }} title="Společná marže">{pctTxt(frac)}</span>}</div>
      <div className="fk-num fk-mhide" style={{ fontWeight: 700 }}>{fmtKc(n * (1 + frac))}</div>
      <div className="fk-num" style={{ fontWeight: 700, color: "#075985" }}>{fmtKc(n * (1 + frac) * kDph)}</div>
      <div>{akce}</div>
    </div>
  );
  const hlavickaSloupcu = (c1, c2, q) => (
    <div className="fk-row fk-head">
      <span className="fk-lbl">{c1}</span><span className="fk-pol">{c2}</span><span style={{ textAlign: "center" }}>{q}</span>
      <span className="fk-num fk-int">NÁKLAD</span><span className="fk-num fk-int">MARŽE</span>
      <span className="fk-num fk-mhide">{uZak ? "BEZ DPH" : "S MARŽÍ"}</span><span className="fk-num">S DPH {dphPct} %</span><span />
    </div>
  );
  const pocetInput = (label, value, onChangeVal) => (
    <input type="number" min="0" aria-label={label} style={{ ...inpS, textAlign: "center", padding: "6px 4px" }} value={value} onChange={(e) => onChangeVal(e.target.value)} />
  );
  const radekMat = ([key, nazev, list, item]) => {
    const c = cfg[key];
    const prepsano = c.marzeOverride !== "" && c.marzeOverride != null;
    return radek({
      klic: key, nazev, n: nRadku([key, nazev, list, item]), frac: rowMarzeFrac(c), slabe: nepouzita(item, c),
      polozka: <Sel list={list} value={item.name} onChange={(name) => setItem(key, { name })} style={{ ...S.select, marginBottom: 0, width: "100%" }} />,
      mnozstvi: pocetInput(`Množství – ${nazev}`, c.qty, (v) => setItem(key, { qty: v })),
      marzeBunka: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <input type="number" min="0" max="100" step="1" aria-label={`Marže – ${nazev}`} placeholder={String(Math.round(marze * 100))}
            title="Vlastní marže řádku — prázdné = společná marže"
            style={{ ...inpS, width: 50, textAlign: "right", padding: "4px 6px", fontSize: 13, color: prepsano ? "#0369a1" : "#64748b", fontWeight: prepsano ? 700 : 400, borderColor: prepsano ? "#0369a1" : undefined }}
            value={c.marzeOverride ?? ""} onChange={(e) => setItem(key, { marzeOverride: e.target.value })} />
          <span style={{ fontSize: 12, color: "#64748b" }}>%</span>
        </span>
      ),
    });
  };
  const radekVlastni = (rv) => radek({
    klic: rv.id, n: cislo(rv.qty) * cislo(rv.cena), frac: marze,
    nazev: <input aria-label="Název vlastní položky" placeholder="Název položky" style={inpS} value={rv.name} onChange={(e) => updateCustomRow(rv.id, { name: e.target.value })} />,
    polozka: uZak ? <span /> : (
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" min="0" aria-label="Náklad za kus (Kč bez DPH)" placeholder="náklad Kč/ks" style={{ ...inpS, maxWidth: 160 }} value={rv.cena} onChange={(e) => updateCustomRow(rv.id, { cena: e.target.value })} />
        <span className="fk-int" style={{ fontSize: 12, color: "#64748b" }}>náklad za kus</span>
      </span>
    ),
    mnozstvi: pocetInput("Množství", rv.qty, (v) => updateCustomRow(rv.id, { qty: v })),
    akce: <button type="button" aria-label="Odebrat položku" title="Odebrat" onClick={() => removeCustomRow(rv.id)} style={{ ...S.btnGhost, padding: "4px 9px" }}>✕</button>,
  });
  const sazbaTxt = (t) => <span style={{ fontSize: 13, color: "#475569" }}>{t}</span>;
  const radkyPrace = [
    { klic: "mdElektro", nazev: "Elektro práce", sazba: prace.elektro },
    { klic: "mdStrecha", nazev: "Střecha práce", sazba: prace.strecha },
    { klic: "mdInstalater", nazev: "Instalatérské práce", sazba: prace.instalater },
  ].map((pr) => ({ ...pr, n: pr.sazba * cislo(cfg[pr.klic]), nepouzito: !(cislo(cfg[pr.klic]) > 0) }));
  const radkySluzeb = [
    { klic: "svcDotace", nazev: "Vyřízení dotace", sazba: `${fmtKc(sluzby.dotace)} / ks`, n: sluzby.dotace * cislo(cfg.svcDotace) },
    { klic: "svcDs", nazev: "Připojení k DS", sazba: `${fmtKc(sluzby.ds)} / ks`, n: sluzby.ds * cislo(cfg.svcDs) },
    { klic: "svcDopravaKm", nazev: "Doprava (km tam i zpět)", sazba: `${fmtKc(sluzby.doprava)} / km × dny práce`, n: dopravaCena },
    { klic: "svcRevize", nazev: "Revize", sazba: `${fmtKc(sluzby.revize)} / ks`, n: sluzby.revize * cislo(cfg.svcRevize) },
  ].map((sv) => ({ ...sv, nepouzito: !(cislo(cfg[sv.klic]) > 0) }));
  const elmrNepouzito = !(elmr.cena > 0);

  const sekceBlok = (id, obsah, pocetNepouzitych, pocetPouzitych) => {
    const v = SEKCE_VZHLED[id];
    const sum = sekceSum[id];
    const ukaz = !!ukazNepouzite[id];
    return (
      <section id={`fk-${id}`} style={{ border: `1px solid ${v.bd}`, borderRadius: 14, overflow: "hidden", marginBottom: 16, scrollMarginTop: 70 }}>
        <div className="fk-hlava" style={{ background: v.bg }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: v.ik, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{IKONY_SEKCI[id]}</span>
          <div style={{ flexGrow: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: v.barva }}>{v.nazev}</div>
            <div style={{ fontSize: 13, color: v.text }}>{v.popis}</div>
          </div>
          <div className="fk-soucty">
            {!uZak && <div><div style={{ fontSize: 12, color: v.text }}>náklad</div><div style={{ fontSize: 15, fontWeight: 700, color: v.text }}>{fmtKc(sum.n)}</div></div>}
            <div><div style={{ fontSize: 12, color: v.text }}>bez DPH</div><div style={{ fontSize: 18, fontWeight: 800, color: v.barva }}>{fmtKc(sum.s)}</div></div>
            <div><div style={{ fontSize: 12, color: v.text }}>s DPH {dphPct} %</div><div style={{ fontSize: 18, fontWeight: 800, color: v.barva }}>{fmtKc(sum.s * kDph)}</div></div>
          </div>
        </div>
        {!ukaz && pocetPouzitych === 0 ? (
          <div style={{ padding: "12px 16px", fontSize: 13, color: "#64748b" }}>
            Zatím tu nic není.{pocetNepouzitych > 0 ? ` Klikni na „Nepoužité (${pocetNepouzitych})“ a vyber, co se dodává, nebo přidej vlastní položku.` : " Přidej vlastní položku."}
          </div>
        ) : obsah(ukaz)}
        <div style={{ display: "flex", gap: 10, padding: "10px 16px", flexWrap: "wrap" }}>
          {pocetNepouzitych > 0 && (
            <button type="button" onClick={() => setUkazNepouzite((u) => ({ ...u, [id]: !u[id] }))}
              style={{ height: 38, border: "none", background: "#f1f5f9", color: "#334155", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {ukaz ? "Skrýt nepoužité" : `Nepoužité (${pocetNepouzitych})`}
            </button>
          )}
          <button type="button" onClick={() => addCustomRow(id)}
            style={{ flexGrow: 1, height: 38, border: `1px dashed ${v.ik}`, background: "#fff", color: v.barva, borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{v.pridat}</button>
        </div>
      </section>
    );
  };

  return (
    <div style={S.card} className={uZak ? "fk-wrap fk-zak" : "fk-wrap"}>
      <style>{FK_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1A1A1A" }}>☀️ Kalkulačka FVE</div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>{[PRESET_NAZVY[cfg.preset] || "Vlastní sestava", vykonFve > 0 ? `${Math.round(vykonFve * 10) / 10} kWp` : null, bateriKwh > 0 ? `${Math.round(bateriKwh * 10) / 10} kWh` : null, cfg.dotaceOn ? "s dotací" : "bez dotace"].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" aria-pressed={uZak} onClick={() => setUZak(!uZak)} title="Schová náklady, marže a provize — obrazovku jde ukázat zákazníkovi"
            style={{ display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 14px", borderRadius: 10, border: `1px solid ${uZak ? "#93c5fd" : "#cbd5e1"}`, background: uZak ? "#eff6ff" : "#fff", color: uZak ? "#1e3a8a" : "#334155", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            <span aria-hidden="true" style={{ width: 34, height: 20, borderRadius: 10, background: uZak ? "#0369a1" : "#cbd5e1", display: "flex", alignItems: "center", padding: 2, boxSizing: "border-box", justifyContent: uZak ? "flex-end" : "flex-start" }}><span style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff" }} /></span>
            Režim „U zákazníka“
          </button>
          {!uZak && <button style={{ ...S.btnGhost, padding: "8px 12px", fontSize: 12 }} onClick={() => setAdminOpen((v) => !v)}>⚙️ Ceník {isAdmin ? "(admin)" : ""}</button>}
        </div>
      </div>
      {uZak && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: "#1e3a8a" }}>
          Zákazník vidí jen položky a ceny — náklady, marže a provize jsou skryté. Vypneš přepínačem vpravo nahoře.
        </div>
      )}

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

      {!uZak && naklad > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, color: "#475569", marginBottom: 6, flexWrap: "wrap" }}>
            <b>Skladba nákladu</b>
            <span>Náklad celkem <b style={{ color: "#b91c1c", fontSize: 15 }}>{fmtKc(naklad)}</b></span>
          </div>
          <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden" }}>
            {[["material", "#0369a1", sekceSum.material.n, "Materiál"], ["sluzby", "#6d28d9", sekceSum.sluzby.n, "Služby"], ["ostatni", "#b45309", sekceSum.ostatni.n, "Ostatní"], [null, "#64748b", provizeZakl, "Provize OZ"]]
              .filter(([, , n]) => n > 0)
              .map(([id, barva, n, nazev]) => (
                <button key={nazev} type="button" onClick={() => id && presunNa(id)} title={`${nazev}: ${fmtKc(n)} · ${podil(n)} %`}
                  style={{ width: `${(n / naklad) * 100}%`, minWidth: 4, background: barva, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, textAlign: "left", paddingLeft: 8, overflow: "hidden", whiteSpace: "nowrap", cursor: id ? "pointer" : "default", fontFamily: "inherit" }}>
                  {podil(n) >= 12 ? `${nazev} ${podil(n)} %` : ""}
                </button>
              ))}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#334155", marginTop: 6 }}>
            {[["#0369a1", "Materiál", sekceSum.material.n], ["#6d28d9", "Služby a práce", sekceSum.sluzby.n], ["#b45309", "Ostatní", sekceSum.ostatni.n], ["#64748b", "Provize OZ (základní)", provizeZakl]].map(([barva, nazev, n]) => (
              <span key={nazev} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: barva }} />{nazev} {fmtKc(n)} · {podil(n)} %
              </span>
            ))}
          </div>
        </div>
      )}

      {sekceBlok("material", (ukaz) => (
        <>
          {hlavickaSloupcu("ŘÁDEK", "POLOŽKA", "KS")}
          {RADKY_MAT.filter(([key, , , item]) => ukaz || !nepouzita(item, cfg[key])).flatMap((rr) => [
            radekMat(rr),
            rr[0] === "stridac" && (ukaz || cfg.zaruka) ? radek({
              klic: "zaruka", nazev: "Záruka 10 let", n: zarukaCena, frac: marze, slabe: !cfg.zaruka,
              polozka: (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={!!cfg.zaruka} onChange={(e) => set({ zaruka: e.target.checked })} />
                  Prodloužená záruka na střídač ({fmtKc(zarukaItem.cena)})
                </label>
              ),
              mnozstvi: <span style={{ display: "block", textAlign: "center", color: "#64748b" }}>{cfg.zaruka ? 1 : 0}</span>,
            }) : null,
          ])}
          {vlastniRadky("material").map(radekVlastni)}
        </>
      ), RADKY_MAT.filter(([key, , , item]) => nepouzita(item, cfg[key])).length + (cfg.zaruka ? 0 : 1),
      RADKY_MAT.filter(([key, , , item]) => !nepouzita(item, cfg[key])).length + (cfg.zaruka ? 1 : 0) + vlastniRadky("material").length)}

      {sekceBlok("sluzby", (ukaz) => (
        <>
          {hlavickaSloupcu("PRÁCE", "SAZBA", "MD")}
          {radkyPrace.filter((pr) => ukaz || !pr.nepouzito).map((pr) => radek({
            klic: pr.klic, nazev: pr.nazev, n: pr.n, frac: marze, slabe: pr.nepouzito,
            polozka: sazbaTxt(`${fmtKc(pr.sazba)} / MD`),
            mnozstvi: pocetInput(pr.nazev, cfg[pr.klic], (v) => set({ [pr.klic]: v })),
          }))}
          {hlavickaSloupcu("SLUŽBY", "SAZBA", "POČET")}
          {radkySluzeb.filter((sv) => ukaz || !sv.nepouzito).map((sv) => radek({
            klic: sv.klic, nazev: sv.nazev, n: sv.n, frac: marze, slabe: sv.nepouzito,
            polozka: sazbaTxt(sv.sazba),
            mnozstvi: pocetInput(sv.nazev, cfg[sv.klic], (v) => set({ [sv.klic]: v })),
          }))}
          {(ukaz || !elmrNepouzito) && radek({
            klic: "elmr", nazev: "Úprava ELMR", n: elmr.cena, frac: marze, slabe: elmrNepouzito,
            polozka: (
              <select aria-label="Úprava ELMR" style={{ ...S.select, marginBottom: 0, width: "100%" }} value={cfg.elmr} onChange={(e) => set({ elmr: e.target.value })}>
                {(cenik.elmr || []).map((x) => <option key={x.name} value={x.name}>{x.name} — {fmtKc(x.cena)}</option>)}
              </select>
            ),
            mnozstvi: <span style={{ display: "block", textAlign: "center", color: "#64748b" }}>{elmrNepouzito ? 0 : 1}</span>,
          })}
          {vlastniRadky("sluzby").map(radekVlastni)}
        </>
      ), radkyPrace.filter((pr) => pr.nepouzito).length + radkySluzeb.filter((sv) => sv.nepouzito).length + (elmrNepouzito ? 1 : 0),
      radkyPrace.filter((pr) => !pr.nepouzito).length + radkySluzeb.filter((sv) => !sv.nepouzito).length + (elmrNepouzito ? 0 : 1) + vlastniRadky("sluzby").length)}

      {sekceBlok("ostatni", (ukaz) => (
        <>
          {hlavickaSloupcu("ŘÁDEK", "POLOŽKA", "KS")}
          {RADKY_OST.filter(([key, , , item]) => ukaz || !nepouzita(item, cfg[key])).map(radekMat)}
          {vlastniRadky("ostatni").map(radekVlastni)}
        </>
      ), RADKY_OST.filter(([key, , , item]) => nepouzita(item, cfg[key])).length,
      RADKY_OST.filter(([key, , , item]) => !nepouzita(item, cfg[key])).length + vlastniRadky("ostatni").length)}

      {!uZak && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", background: "#f8fafc", marginBottom: 8 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Provize OZ a sleva</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div><label style={S.label} htmlFor="fk-prov-z">Základní provize (Kč) — v nákladu</label><input id="fk-prov-z" type="number" style={inpS} value={cfg.zakladniProvize} onChange={(e) => set({ zakladniProvize: e.target.value })} /></div>
            <div>
              <label style={S.label} htmlFor="fk-prov-p">Plovoucí provize (%) — doporučeno {Math.round(doporucenoPct * 10) / 10} %</label>
              <input id="fk-prov-p" type="text" inputMode="decimal" style={inpS}
                value={cfg.plovouciProvizePct == null ? Math.round(doporucenoPct * 10) / 10 : cfg.plovouciProvizePct}
                onChange={(e) => set({ plovouciProvizePct: e.target.value })}
                onBlur={(e) => { let v = parseFloat(String(e.target.value).replace(",", ".")); if (isNaN(v)) v = doporucenoPct; v = Math.max(1, Math.min(10, v)); set({ plovouciProvizePct: v }); }} />
            </div>
            <div><label style={S.label} htmlFor="fk-sleva">Sleva z ceny s DPH (Kč)</label><input id="fk-sleva" type="number" style={inpS} value={cfg.sleva} onChange={(e) => set({ sleva: e.target.value })} /></div>
          </div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 8 }}>Provize OZ celkem <b>{fmtKc(provizeCelkem)}</b> (zákl. {fmtKc(provizeZakl)} + plovoucí {Math.round(plovouciPct * 10) / 10} % = {fmtKc(provizeKc)})</div>
        </div>
      )}

      <div className="fk-lista">
        {!uZak && jobType !== "SRV" && (
          <>
            <div className="fk-li-mhide"><span className="fk-l">Náklad</span><span className="fk-v" style={{ color: "#b91c1c" }}>{fmtKc(naklad)}</span></div>
            <div>
              <label className="fk-l" htmlFor="fk-marze">Marže</label>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input id="fk-marze" type="number" min="0" max="200" step="1" value={Math.round(marze * 1000) / 10}
                  onChange={(e) => set({ marze: e.target.value === "" ? 0 : Number(e.target.value) / 100 })}
                  style={{ ...inpS, width: 72, fontWeight: 800, fontSize: 16, padding: "6px 8px", border: `2px solid ${nizkaMarze ? "#dc2626" : "#cbd5e1"}`, background: nizkaMarze ? "#fef2f2" : "#fff" }} />
                <span style={{ fontWeight: 700, color: "#475569" }}>%</span>
              </span>
            </div>
            <div className="fk-li-mhide"><span className="fk-l">Marže v Kč</span><span className="fk-v" style={{ color: nizkaMarze ? "#b91c1c" : "#15803d" }}>{fmtKc(marzeKc)}</span></div>
          </>
        )}
        <div className={jobType === "SRV" ? undefined : "fk-li-mhide"}><span className="fk-l">{jobType === "SRV" ? "Cena servisu bez DPH" : "Cena bez DPH"}</span><span className="fk-v" style={{ color: "#075985" }}>{fmtKc(cenaNabidkyBezDphFinal)}</span></div>
        <div>
          <span className="fk-l">DPH</span>
          <span role="group" aria-label="Sazba DPH" style={{ display: "flex", gap: 4 }}>
            {sazbyDph.map((sz) => {
              const akt = sz === dphPct;
              const neplatna = ![12, 21].includes(sz);
              return (
                <button key={sz} type="button" className="fk-dph" aria-pressed={akt} onClick={() => set({ dph: sz / 100 })} title={neplatna ? "Nestandardní sazba" : undefined}
                  style={{ height: 34, padding: "0 12px", borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: akt ? (neplatna ? "#b45309" : "#0369a1") : "#fff", color: akt ? "#fff" : "#334155", border: `1px solid ${akt ? (neplatna ? "#b45309" : "#0369a1") : "#cbd5e1"}` }}>
                  {sz} %
                </button>
              );
            })}
          </span>
        </div>
        <div className="fk-li-mhide" style={{ flexGrow: 1 }} />
        <div style={{ textAlign: "right" }}>
          <span className="fk-l">Cena s DPH{jobType !== "SRV" && <span className="fk-li-mhide" style={{ color: "#64748b" }}> (zaokr. na tisíce)</span>}</span>
          <span className="fk-v" style={{ fontSize: 22 }}>{fmtKc(cenaNabidkySDph)}</span>
        </div>
        {jobType !== "SRV" && cfg.dotaceOn && (
          <div style={{ textAlign: "right", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: "6px 12px" }}>
            <span className="fk-l" style={{ color: "#166534" }}>Po dotaci<span className="fk-li-mhide"> · dotace {fmtKc(dotace)} ({dotaceDuvod})</span></span>
            <span className="fk-v" style={{ fontSize: 22, color: "#166534" }}>{fmtKc(cenaPoDotaci)}</span>
          </div>
        )}
        {!uZak && jobType !== "SRV" && nizkaMarze && (
          <div className="fk-varovani" role="alert">⚠️ Marže {pctTxt(marze)} je pod {Math.round(MIN_MARZE * 100)} % — je potřeba schválit u Romana.</div>
        )}
        {![12, 21, 0].includes(dphPct) && (
          <div className="fk-varovani">Sazba DPH {dphPct} % se už nepoužívá — zvol 12 % (rodinné domy) nebo 21 %.</div>
        )}
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
          customerEmail={customerEmail || ""}
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
