import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

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

export const PRAZDNA_FVE = () => ({
  preset: "optimal",
  kraj: "ostatni",
  dotaceOn: true,
  dotaceZaklad: "Dotace Hybridní střídač",
  panel: { name: "Canadian Solar 455 Wp", qty: 12 },
  konstrukce: { name: "Šikmá střecha", qty: 12 },
  stridac: { name: "GW6,5K-ET", qty: 1 },
  zaruka: false,
  baterie: { name: "HV Energy Storage System - Titan GS-HV-3.74", qty: 3 },
  bms: { name: "BMS - Energy Storage System - Titan", qty: 1 },
  rozvadecDc: { name: "Rozvaděč DC - 1 string (DC1 nebo A1)", qty: 1 },
  ostatniFixed: { name: "Ostatní elektro materiál (M4, 50m DC, 10m AC)", qty: 1 },
  backup: { name: "Rozvaděč Back-up - okruhy (M5+P3F)", qty: 1 },
  wallbox: { name: "Bez Back-up", qty: 0 },
  regulace: { name: "Bez regulace", qty: 0 },
  bojler: { name: "Bez bojleru", qty: 0 },
  customRows: [],
  mdElektro: 3, mdStrecha: 2, mdInstalater: 0,
  svcDotace: 1, svcDs: 1, svcDopravaKm: 200, svcRevize: 1,
  elmr: "Úprava ELMR ČEZ 1: základní",
  zakladniProvize: 6400,
  plovouciProvizePct: null, // null = ještě nedotčeno, dopočte se z marže
  marze: 0.45, dph: 0.15, sleva: 0,
});

// Reálné výchozí kusovníky šablon — přesně podle listů LIGHT/BASIC/OPTIMAL/
// PREMIUM/E-MOBILITA/SERVIS v Excelu.
const PRESETY = {
  light: { panel: ["Canadian Solar 455 Wp", 8], konstrukce: ["Šikmá střecha", 8], stridac: ["GW3600D-NS", 1], baterie: ["Bez baterie", 0], bms: ["Bez BMS", 0], regulace: ["AZrouter - 1x slave", 1], mdElektro: 2, mdStrecha: 2, marze: 0.45, dph: 0.15 },
  basic: { panel: ["Canadian Solar 455 Wp", 8], konstrukce: ["Šikmá střecha", 8], stridac: ["GW3648D-ES", 1], baterie: ["LV Pylontech - US3000C", 2], bms: ["Bez BMS", 0], backup: ["Rozvaděč Back-up - okruhy (M5+P3F)", 1], regulace: ["Bez regulace", 0], mdElektro: 3, mdStrecha: 2, marze: 0.45, dph: 0.15 },
  optimal: { panel: ["Canadian Solar 455 Wp", 12], konstrukce: ["Šikmá střecha", 12], stridac: ["GW6,5K-ET", 1], baterie: ["HV Energy Storage System - Titan GS-HV-3.74", 3], bms: ["BMS - Energy Storage System - Titan", 1], backup: ["Rozvaděč Back-up - okruhy (M5+P3F)", 1], regulace: ["Bez regulace", 0], mdElektro: 3, mdStrecha: 2, marze: 0.45, dph: 0.15 },
  premium: { panel: ["Canadian Solar 455 Wp", 16], konstrukce: ["Šikmá střecha", 16], stridac: ["GW8K-ET", 1], baterie: ["HV Energy Storage System - Titan GS-HV-3.74", 3], bms: ["BMS - Energy Storage System - Titan", 1], rozvadecDc: ["Rozvaděč DC - 2 string (DC2 nebo A2)", 1], backup: ["Rozvaděč Back-up - okruhy (M5+P3F)", 1], regulace: ["Bez regulace", 0], mdElektro: 3, mdStrecha: 4, marze: 0.40, dph: 0.15 },
  emobilita: { panel: ["Canadian Solar 455 Wp", 20], konstrukce: ["Šikmá střecha", 20], stridac: ["GW10K-ET", 1], baterie: ["HV Energy Storage System - Titan GS-HV-3.74", 3], bms: ["BMS - Energy Storage System - Titan", 1], rozvadecDc: ["Rozvaděč DC - 2 string (DC2 nebo A2)", 1], backup: ["Bez Back-up", 1], wallbox: ["AZcharger wallbox", 1], regulace: ["AZrouter - pouze master", 1], mdElektro: 4, mdStrecha: 4, marze: 0.40, dph: 0.15 },
  servis: { panel: ["Bez panelů", 0], konstrukce: ["Bez konstrukce", 0], stridac: ["Bez střídače", 0], baterie: ["Bez baterie", 0], bms: ["Bez BMS", 0], backup: ["Bez Back-up", 0], wallbox: ["Bez Back-up", 0], regulace: ["Bez regulace", 0], mdElektro: 0, mdStrecha: 0, marze: 0.45, dph: 0.21 },
};

function applyPreset(cfg, key) {
  const p = PRESETY[key];
  if (!p) return { ...cfg, preset: key };
  const next = { ...cfg, preset: key, marze: p.marze, dph: p.dph, mdElektro: p.mdElektro, mdStrecha: p.mdStrecha };
  if (p.panel) next.panel = { name: p.panel[0], qty: p.panel[1] };
  if (p.konstrukce) next.konstrukce = { name: p.konstrukce[0], qty: p.konstrukce[1] };
  if (p.stridac) next.stridac = { name: p.stridac[0], qty: p.stridac[1] };
  if (p.baterie) next.baterie = { name: p.baterie[0], qty: p.baterie[1] };
  if (p.bms) next.bms = { name: p.bms[0], qty: p.bms[1] };
  if (p.rozvadecDc) next.rozvadecDc = { name: p.rozvadecDc[0], qty: p.rozvadecDc[1] };
  if (p.backup) next.backup = { name: p.backup[0], qty: p.backup[1] };
  if (p.wallbox) next.wallbox = { name: p.wallbox[0], qty: p.wallbox[1] };
  if (p.regulace) next.regulace = { name: p.regulace[0], qty: p.regulace[1] };
  return next;
}

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

export default function FveCalculator({ value, onChange, currentUser, onUseAsTarget, S }) {
  const cfg = value || PRAZDNA_FVE();
  const set = (patch) => onChange({ ...cfg, ...patch });
  const setItem = (key, patch) => onChange({ ...cfg, [key]: { ...cfg[key], ...patch } });

  const [cenik, setCenik] = useState(null); // { panely: [...], ... }
  const [adminOpen, setAdminOpen] = useState(false);
  const [savingCenik, setSavingCenik] = useState(false);
  const isAdmin = currentUser?.role === "admin";

  const loadCenik = () => {
    supabase.from("fve_cenik_items").select("*").eq("active", true).order("sort_order").then(({ data }) => {
      const grouped = {};
      (data || []).forEach((it) => { (grouped[it.category] = grouped[it.category] || []).push(it); });
      setCenik(grouped);
    });
  };
  useEffect(loadCenik, []);

  if (!cenik) return <div style={{ ...S.card, color: "#64748b" }}>Načítám ceník…</div>;

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

  const matRows = [
    ["panel", panel, cfg.panel.qty],
    ["konstrukce", konstr, cfg.konstrukce.qty],
    ["stridac", stridac, cfg.stridac.qty],
    ["baterie", baterie, cfg.baterie.qty],
    ["bms", bms, cfg.bms.qty],
    ["rozvadecDc", rozvadecDc, cfg.rozvadecDc.qty],
    ["ostatniFixed", ostatniFixed, cfg.ostatniFixed.qty],
    ["backup", backup, cfg.backup.qty],
    ["wallbox", wallbox, cfg.wallbox.qty],
    ["regulace", regulace, cfg.regulace.qty],
    ["bojler", bojler, cfg.bojler.qty],
  ];
  let nakladMat = matRows.reduce((s, [, it, qty]) => s + it.cena * (Number(qty) || 0), 0);
  const zarukaCena = cfg.zaruka ? zarukaItem.cena : 0;
  nakladMat += zarukaCena;
  const customTotal = (cfg.customRows || []).reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.cena) || 0), 0);
  nakladMat += customTotal;

  const nakladPrace = prace.elektro * (Number(cfg.mdElektro) || 0) + prace.strecha * (Number(cfg.mdStrecha) || 0) + prace.instalater * (Number(cfg.mdInstalater) || 0);
  const dopravaCena = (Number(cfg.svcDopravaKm) || 0) * sluzby.doprava * ((Number(cfg.mdElektro) || 0) + (Number(cfg.mdStrecha) || 0) / 2 + (Number(cfg.mdInstalater) || 0));
  const nakladSvc = sluzby.dotace * (Number(cfg.svcDotace) || 0) + sluzby.ds * (Number(cfg.svcDs) || 0) + dopravaCena + sluzby.revize * (Number(cfg.svcRevize) || 0) + elmr.cena + (Number(cfg.zakladniProvize) || 0);

  const naklad = nakladMat + nakladPrace + nakladSvc;
  const marze = Number(cfg.marze) || 0;
  const dph = Number(cfg.dph) || 0;
  const sleva = Number(cfg.sleva) || 0;
  const prodejniSDph = naklad * (1 + marze) * (1 + dph);
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

  const selStyle = { ...S.select, marginBottom: 0 };
  const qtyStyle = { ...S.input, marginBottom: 0, width: 70 };

  const row = (label, key, list, item, qty) => (
    <tr key={key}>
      <td style={S.td}>{label}</td>
      <td style={S.td}><Sel list={list} value={item.name} onChange={(name) => setItem(key, { name })} style={selStyle} /></td>
      <td style={S.td}><input type="number" min="0" style={qtyStyle} value={qty} onChange={(e) => setItem(key, { qty: e.target.value })} /></td>
      <td style={{ ...S.td, textAlign: "right", color: "#64748b", whiteSpace: "nowrap" }}>{fmtKc(item.cena * (Number(qty) || 0))}</td>
    </tr>
  );

  return (
    <div style={S.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontWeight: 700, color: "#fff" }}>☀️ Kalkulačka FVE — přesně podle Excelu</div>
        <button style={{ ...S.btnGhost, padding: "5px 12px", fontSize: 11 }} onClick={() => setAdminOpen((v) => !v)}>⚙️ Ceník {isAdmin ? "(admin)" : ""}</button>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>Materiál, práce, služby, dotace a provize se počítají stejně jako v excelové kalkulačce sestav. Ceník je natažený z databáze.</div>

      {adminOpen && (
        <div style={{ background: "#0a0d14", border: "1px solid #252d45", borderRadius: 10, padding: 14, marginBottom: 16 }}>
          {!isAdmin && <div style={{ color: "#f59e0b", fontSize: 12, marginBottom: 10 }}>Ceník smí upravovat jen role administrátor — tady je jen náhled.</div>}
          {Object.keys(cenik).map((cat) => (
            <details key={cat} style={{ marginBottom: 8 }}>
              <summary style={{ cursor: "pointer", color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>{CAT_LABELS[cat] || cat} ({cenik[cat].length})</summary>
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
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, background: "#0a0d14", border: "1px solid #252d45", borderRadius: 8, padding: "0 10px" }}>
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

      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Materiál</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
        <thead><tr><th style={S.th}>Řádek</th><th style={S.th}>Položka</th><th style={S.th}>Množ.</th><th style={S.th}>Cena</th></tr></thead>
        <tbody>
          {row("Panely", "panel", cenik.panely, panel, cfg.panel.qty)}
          {row("Konstrukce", "konstrukce", cenik.konstrukce, konstr, cfg.konstrukce.qty)}
          {row("Střídač", "stridac", cenik.stridace, stridac, cfg.stridac.qty)}
          <tr>
            <td style={S.td} colSpan={3}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <input type="checkbox" checked={cfg.zaruka} onChange={(e) => set({ zaruka: e.target.checked })} /> + Záruka 10 let na střídač (0 % marže)
              </label>
            </td>
            <td style={{ ...S.td, textAlign: "right", color: "#64748b" }}>{fmtKc(zarukaCena)}</td>
          </tr>
          {row("Baterie", "baterie", cenik.baterie, baterie, cfg.baterie.qty)}
          {row("BMS", "bms", cenik.bms, bms, cfg.bms.qty)}
          {row("Rozvaděč DC", "rozvadecDc", cenik.rozvadec_dc, rozvadecDc, cfg.rozvadecDc.qty)}
          {row("Ostatní elektro materiál", "ostatniFixed", cenik.ostatni, ostatniFixed, cfg.ostatniFixed.qty)}
          {row("Back-up", "backup", cenik.ostatni, backup, cfg.backup.qty)}
          {row("Wallbox / regulace navíc", "wallbox", cenik.ostatni, wallbox, cfg.wallbox.qty)}
          {row("Regulace (AZrouter)", "regulace", cenik.regulace, regulace, cfg.regulace.qty)}
          {row("Bojler", "bojler", cenik.bojlery, bojler, cfg.bojler.qty)}
        </tbody>
      </table>

      {(cfg.customRows || []).map((r) => (
        <div key={r.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <input style={{ ...S.input, marginBottom: 0, flex: 1 }} placeholder="Název nespecifikované položky" value={r.name} onChange={(e) => updateCustomRow(r.id, { name: e.target.value })} />
          <input type="number" style={{ ...S.input, marginBottom: 0, width: 70 }} placeholder="ks" value={r.qty} onChange={(e) => updateCustomRow(r.id, { qty: e.target.value })} />
          <input type="number" style={{ ...S.input, marginBottom: 0, width: 100 }} placeholder="Kč/ks" value={r.cena} onChange={(e) => updateCustomRow(r.id, { cena: e.target.value })} />
          <span style={{ width: 90, textAlign: "right", fontSize: 13, color: "#64748b" }}>{fmtKc((Number(r.qty) || 0) * (Number(r.cena) || 0))}</span>
          <button onClick={() => removeCustomRow(r.id)} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11 }}>✕</button>
        </div>
      ))}
      <button onClick={addCustomRow} style={{ ...S.btnGhost, marginBottom: 16, padding: "6px 14px", fontSize: 12 }}>+ Přidat nespecifikovanou položku</button>

      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Práce (MD)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        <div><label style={S.label}>Elektro práce ({fmtKc(prace.elektro)}/MD)</label><input type="number" style={S.input} value={cfg.mdElektro} onChange={(e) => set({ mdElektro: e.target.value })} /></div>
        <div><label style={S.label}>Střecha práce ({fmtKc(prace.strecha)}/MD)</label><input type="number" style={S.input} value={cfg.mdStrecha} onChange={(e) => set({ mdStrecha: e.target.value })} /></div>
        <div><label style={S.label}>Instalatérské práce ({fmtKc(prace.instalater)}/MD)</label><input type="number" style={S.input} value={cfg.mdInstalater} onChange={(e) => set({ mdInstalater: e.target.value })} /></div>
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Služby</div>
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

      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Provize OZ</div>
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
        <div style={{ background: "#0a0d14", border: "1px solid #252d45", borderRadius: 10, padding: 14 }}><div style={S.label}>Celkem náklad</div><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtKc(naklad)}</div></div>
        <div style={{ background: "#0a0d14", border: "1px solid #252d45", borderRadius: 10, padding: 14 }}><div style={S.label}>Cena s DPH po zaokrouhlení</div><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtKc(cenaDphRounded)}</div></div>
        {cfg.dotaceOn && <div style={{ background: "#0a2b1f", border: "1px solid #14532d", borderRadius: 10, padding: 14 }}><div style={{ ...S.label, color: "#34d399" }}>Dotace</div><div style={{ fontSize: 22, fontWeight: 800, color: "#34d399" }}>{fmtKc(dotace)}</div></div>}
        {cfg.dotaceOn && <div style={{ background: "#0a1a2b", border: "1px solid #1e3a5f", borderRadius: 10, padding: 14 }}><div style={{ ...S.label, color: "#2E9BE0" }}>Cena po dotaci</div><div style={{ fontSize: 22, fontWeight: 800, color: "#2E9BE0" }}>{fmtKc(cenaPoDotaci)}</div></div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        <div style={{ background: "#0a0d14", border: "1px solid #252d45", borderRadius: 10, padding: 10 }}><div style={S.label}>Marže Kč</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtKc(marzeKc)}</div></div>
        <div style={{ background: "#0a0d14", border: "1px solid #252d45", borderRadius: 10, padding: 10, gridColumn: "span 2" }}><div style={S.label}>Provize OZ celkem</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtKc(provizeCelkem)} <span style={{ color: "#64748b", fontWeight: 400 }}>(zákl. {fmtKc(cfg.zakladniProvize)} + plov. {Math.round(plovouciPct * 10) / 10}% = {fmtKc(provizeKc)})</span></div></div>
        <div style={{ background: "#0a0d14", border: "1px solid #252d45", borderRadius: 10, padding: 10 }}><div style={S.label}>Výkon / Baterie</div><div style={{ fontSize: 14, fontWeight: 700 }}>{Math.round(vykonFve * 10) / 10} kWp / {Math.round(bateriKwh * 10) / 10} kWh</div></div>
      </div>

      {onUseAsTarget && (
        <button style={S.btn("#F5C518")} onClick={() => onUseAsTarget(cfg.dotaceOn ? cenaPoDotaci : cenaDphRounded)}>
          ➡️ Použít jako cílovou cenu pro zákazníka
        </button>
      )}
    </div>
  );
}
