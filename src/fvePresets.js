import { seznamyPodleTypu } from "./nabidkaTexty.js";
// ─── Výchozí konfigurace a šablony FVE kalkulačky ───────────────────────────
// Odděleno od FveCalculator.jsx, protože ten soubor smí exportovat jen
// komponentu (Fast Refresh / react-refresh/only-export-components) — tohle
// jsou čistá data a funkce sdílené i mimo kalkulačku (např. Pricing.jsx u
// typu "FVR — FVE rozšíření").

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
  marze: 0.45, dph: 0.12, sleva: 0,
  cisloOP: "",          // číslo obchodního případu do nabídky pro zákazníka (RJ-XX-XX-XXXX)
  adresaInstalace: "",  // prázdné = použije se jméno zákazníka
  rocniVynosOverride: "", // prázdné = dopočte se odhadem z výkonu FVE
  // Co je / není v ceně — přesně podle firemní šablony, každou položku lze
  // pro konkrétní nabídku odškrtnout nebo přidat vlastní.
  zahrnutoItems: [
    { id: "z1", text: "Dodávka FVE a všech komponent", checked: true },
    { id: "z2", text: "Instalace FVE", checked: true },
    { id: "z3", text: "Odborná montáž panelů", checked: true },
    { id: "z4", text: "Provedení elektroinstalačních prací", checked: true },
    { id: "z5", text: "Revize systému", checked: true },
    { id: "z6", text: "Vyřízení připojení k distribuční síti", checked: true },
    { id: "z7", text: "Konečné zprovoznění a předání FVE", checked: true },
    { id: "z8", text: "Back-up kompletní záloha domu s přepínačem", checked: true },
  ],
  nezahrnutoItems: [
    { id: "n1", text: "Úprava odběrného místa (elektroměrový sloupek) dle požadavků distribuční společnosti", checked: true },
  ],
});

// Reálné výchozí kusovníky šablon — přesně podle listů LIGHT/BASIC/OPTIMAL/
// PREMIUM/E-MOBILITA/SERVIS v Excelu.
const PRESETY = {
  light: { panel: ["Canadian Solar 455 Wp", 8], konstrukce: ["Šikmá střecha", 8], stridac: ["GW3600D-NS", 1], baterie: ["Bez baterie", 0], bms: ["Bez BMS", 0], regulace: ["AZrouter - 1x slave", 1], mdElektro: 2, mdStrecha: 2, marze: 0.45, dph: 0.12 },
  basic: { panel: ["Canadian Solar 455 Wp", 8], konstrukce: ["Šikmá střecha", 8], stridac: ["GW3648D-ES", 1], baterie: ["LV Pylontech - US3000C", 2], bms: ["Bez BMS", 0], backup: ["Rozvaděč Back-up - okruhy (M5+P3F)", 1], regulace: ["Bez regulace", 0], mdElektro: 3, mdStrecha: 2, marze: 0.45, dph: 0.12 },
  optimal: { panel: ["Canadian Solar 455 Wp", 12], konstrukce: ["Šikmá střecha", 12], stridac: ["GW6,5K-ET", 1], baterie: ["HV Energy Storage System - Titan GS-HV-3.74", 3], bms: ["BMS - Energy Storage System - Titan", 1], backup: ["Rozvaděč Back-up - okruhy (M5+P3F)", 1], regulace: ["Bez regulace", 0], mdElektro: 3, mdStrecha: 2, marze: 0.45, dph: 0.12 },
  premium: { panel: ["Canadian Solar 455 Wp", 16], konstrukce: ["Šikmá střecha", 16], stridac: ["GW8K-ET", 1], baterie: ["HV Energy Storage System - Titan GS-HV-3.74", 3], bms: ["BMS - Energy Storage System - Titan", 1], rozvadecDc: ["Rozvaděč DC - 2 string (DC2 nebo A2)", 1], backup: ["Rozvaděč Back-up - okruhy (M5+P3F)", 1], regulace: ["Bez regulace", 0], mdElektro: 3, mdStrecha: 4, marze: 0.40, dph: 0.12 },
  emobilita: { panel: ["Canadian Solar 455 Wp", 20], konstrukce: ["Šikmá střecha", 20], stridac: ["GW10K-ET", 1], baterie: ["HV Energy Storage System - Titan GS-HV-3.74", 3], bms: ["BMS - Energy Storage System - Titan", 1], rozvadecDc: ["Rozvaděč DC - 2 string (DC2 nebo A2)", 1], backup: ["Bez Back-up", 1], wallbox: ["AZcharger wallbox", 1], regulace: ["AZrouter - pouze master", 1], mdElektro: 4, mdStrecha: 4, marze: 0.40, dph: 0.12 },
  servis: { panel: ["Bez panelů", 0], konstrukce: ["Bez konstrukce", 0], stridac: ["Bez střídače", 0], baterie: ["Bez baterie", 0], bms: ["Bez BMS", 0], backup: ["Bez Back-up", 0], wallbox: ["Bez Back-up", 0], regulace: ["Bez regulace", 0], mdElektro: 0, mdStrecha: 0, marze: 0.45, dph: 0.21 },
};

// Položky kalkulace, které patří jen k nové instalaci FVE. U servisu a
// rozšíření se dřív omylem přebíraly z PRAZDNA_FVE (dotace, připojení k DS,
// úprava ELMR, 200 km dopravy, revize, provize 6 400 Kč…) a nafukovaly cenu.
export const POLOZKY_NOVE_INSTALACE = {
  dotaceOn: false, svcDotace: 0, svcDs: 0, svcDopravaKm: 0, svcRevize: 0,
  elmr: "Bez úpravy", zakladniProvize: 0,
};
// Popis pro upozornění v kalkulaci: které z těch položek má nabídka zapnuté.
export function zapnutePolozkyNoveInstalace(cfg) {
  const c = cfg || {};
  return [
    c.dotaceOn && "dotace",
    Number(c.svcDotace) > 0 && "vyřízení dotace",
    Number(c.svcDs) > 0 && "vyřízení připojení k DS",
    Number(c.svcDopravaKm) > 0 && `doprava ${c.svcDopravaKm} km`,
    Number(c.svcRevize) > 0 && "revize",
    c.elmr && c.elmr !== "Bez úpravy" && "úprava ELMR",
    Number(c.zakladniProvize) > 0 && "základní provize OZ",
  ].filter(Boolean);
}

export const applyPreset = (cfg, key) => {
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
};

// Výchozí kalkulace pro servis (SRV) a rozšíření (FVR): prázdná sestava,
// bez položek nové instalace a s vlastním seznamem "co je / není v ceně".
// Co je u konkrétní zakázky potřeba (doprava, revize, práce…), se přidá ručně.
export function vychoziSluzba(jobType) {
  const cfg = applyPreset(PRAZDNA_FVE(), "servis");
  return {
    ...cfg,
    ...POLOZKY_NOVE_INSTALACE,
    rozvadecDc: { ...cfg.rozvadecDc, qty: 0 },
    ostatniFixed: { ...cfg.ostatniFixed, qty: 0 },
    ...seznamyPodleTypu(jobType),
  };
}
