// ─── Zjednodušené statické posouzení FVE na střeše ───────────────────────────
// Zatížení sněhem podle ČSN EN 1991-1-3 (+ NA), větrem podle ČSN EN 1991-1-4
// (+ NA), kombinace podle ČSN EN 1990 (6.10), dřevo podle ČSN EN 1995-1-1.
//  • Šikmá střecha: krokev jako prostý nosník mezi vaznicemi — ohyb, smyk
//    a průhyb před a po montáži FVE; síly na střešní háky (tah a tlak).
//  • Plochá střecha: zátěžový (balastní) systém — potřebná zátěž proti
//    nadzvednutí a posunu, přitížení střechy v kN/m².
// Je to orientační posouzení, nenahrazuje statický posudek autorizované osoby.

const rad = (d) => (d * Math.PI) / 180;
const G = 9.81 / 1000; // kg → kN

// Sněhové oblasti (NA ČR) — charakteristická hodnota s_k v kN/m²
export const SNEH_OBLASTI = [
  { id: "I", sk: 0.7 }, { id: "II", sk: 1.0 }, { id: "III", sk: 1.5 }, { id: "IV", sk: 2.0 },
  { id: "V", sk: 2.5 }, { id: "VI", sk: 3.0 }, { id: "VII", sk: 4.0 }, { id: "VIII", sk: null },
];
// Součinitel expozice C_e (tab. 5.1)
export const EXPOZICE = [
  { k: 0.8, t: "Otevřená krajina (vítr odfoukává sníh)" },
  { k: 1.0, t: "Normální" },
  { k: 1.2, t: "Chráněná poloha (okolní budovy, stromy)" },
];
// Větrné oblasti (NA ČR) — výchozí základní rychlost větru v_b,0 v m/s
export const VITR_OBLASTI = [
  { id: "I", vb: 22.5 }, { id: "II", vb: 25 }, { id: "III", vb: 27.5 }, { id: "IV", vb: 30 }, { id: "V", vb: 36 },
];
// Kategorie terénu (tab. 4.1)
export const TERENY = [
  { id: "I", z0: 0.01, zmin: 1, t: "I – jezera, plochá oblast bez překážek" },
  { id: "II", z0: 0.05, zmin: 2, t: "II – nízká vegetace, izolované překážky (volná krajina)" },
  { id: "III", z0: 0.3, zmin: 5, t: "III – vesnice, předměstí, les" },
  { id: "IV", z0: 1.0, zmin: 10, t: "IV – město, min. 15 % plochy zastavěno budovami nad 15 m" },
];
// Střešní krytina a vrstvy — stálé zatížení v kN/m² plochy střechy
export const KRYTINY = [
  { id: "palena", g: 0.55, t: "Pálená taška" },
  { id: "betonova", g: 0.6, t: "Betonová taška" },
  { id: "bridlice", g: 0.5, t: "Břidlice / vláknocementové desky" },
  { id: "eternit", g: 0.25, t: "Vlnité vláknocementové desky (eternit)" },
  { id: "sindel", g: 0.3, t: "Asfaltový šindel na bednění" },
  { id: "plech", g: 0.12, t: "Plechová krytina (trapéz, falc, tašková tabule)" },
];
export const VRSTVY = [
  { id: "late", g: 0.1, t: "Latě, kontralatě, pojistná fólie" },
  { id: "izolace", g: 0.1, t: "Tepelná izolace mezi krokvemi" },
  { id: "podhled", g: 0.15, t: "Podhled ze sádrokartonu" },
];
// Rostlé dřevo podle ČSN EN 338 — MPa, kN/m³
export const DREVA = [
  { id: "C16", fmk: 16, fvk: 3.2, E: 8000, rho: 3.7, t: "C16 – starší / neověřené dřevo" },
  { id: "C24", fmk: 24, fvk: 4.0, E: 11000, rho: 4.2, t: "C24 – běžné konstrukční dřevo" },
];
export const KMOD = 0.9, GAMMA_M = 1.3, KDEF = 0.6, KCR = 0.67;

// Součinitele vnějšího tlaku c_pe,10 pro sedlovou střechu (tab. 7.4a/b),
// obálka přes směry větru θ = 0° a 90°, podle sklonu 5–75°.
const SKLONY = [5, 15, 30, 45, 60, 75];
const CPE = {
  H: { sani: [-0.7, -0.6, -0.8, -0.9, -0.8, -0.8], tlak: [0, 0.2, 0.4, 0.6, 0.7, 0.8] },
  G: { sani: [-1.7, -1.3, -1.4, -1.4, -1.2, -1.2], tlak: [0, 0.7, 0.7, 0.7, 0.7, 0.8] },
};
export const ZONY_SIKMA = [
  { id: "H", t: "Střední část střechy (zóna H) – pole min. e/10 od okrajů" },
  { id: "G", t: "Zasahuje do okrajových pásů (zóny F/G)" },
];
// Volně stojící pultová střecha, φ = 0 (tab. 7.6) — součinitel síly c_f podle sklonu panelů
const SKLONY_PANEL = [0, 5, 10, 15, 20, 25, 30];
const CF_PANEL = { max: [0.2, 0.4, 0.5, 0.7, 0.8, 1.0, 1.2], min: [-0.5, -0.7, -0.9, -1.1, -1.3, -1.6, -1.8] };
// Součinitel polohy k: krajní řady jsou obtékané jako volný přístřešek (k = 1),
// vnitřní řady kryjí řady před nimi (zjednodušeně k = 0,5). Níž jen
// s podklady výrobce systému (zkoušky ve větrném tunelu).
export const ZONY_PLOCHA = [
  { id: "stred", k: 0.5, t: "Vnitřní řady" },
  { id: "okraj", k: 1.0, t: "Krajní řady a okrajové pásy střechy" },
];

function interpol(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}
export const cpeSikma = (zona, sklon) => {
  const t = CPE[zona] || CPE.H;
  return { sani: interpol(SKLONY, t.sani, sklon), tlak: interpol(SKLONY, t.tlak, sklon) };
};
export const cfPanel = (sklon) => ({ min: interpol(SKLONY_PANEL, CF_PANEL.min, sklon), max: interpol(SKLONY_PANEL, CF_PANEL.max, sklon) });

// Tvarový součinitel zatížení sněhem μ1 (tab. 5.2)
export const mu1 = (a) => (a <= 30 ? 0.8 : a < 60 ? (0.8 * (60 - a)) / 30 : 0);

// Charakteristický maximální dynamický tlak q_p(z) v kN/m² (4.8), c_o = 1
export function tlakVetru({ vb, teren, z }) {
  const T = TERENY.find(x => x.id === teren) || TERENY[2];
  const zz = Math.max(Number(z) || 0, T.zmin);
  const kr = 0.19 * (T.z0 / 0.05) ** 0.07;
  const ln = Math.log(zz / T.z0);
  const cr = kr * ln;
  const vm = cr * vb;
  const Iv = 1 / ln;
  const qp = ((1 + 7 * Iv) * 0.5 * 1.25 * vm * vm) / 1000;
  return { z: zz, z0: T.z0, kr, cr, vm, Iv, qp };
}

const num = (x, d = 0) => { const n = Number(String(x ?? "").replace(",", ".")); return Number.isFinite(n) ? n : d; };

export const vychoziPosudek = () => ({
  nazev: "", zakaznik: "", adresa: "", contractId: "",
  typ: "sikma",
  // lokalita
  snehOblast: "II", skVlastni: "", ce: 1.0, vitrOblast: "II", teren: "III", vyska: 8,
  // FVE panely
  pocet: 20, panelDelka: 1.762, panelSirka: 1.134, panelHmotnost: 22,
  // šikmá střecha
  sklon: 35, krytina: "palena", vrstvy: ["late"], krokevRozpeti: 3.5, krokevRozestup: 0.9, krokevB: 100, krokevH: 160, drevo: "C16",
  zonaSikma: "H", konstrukceKgM2: 3, hakRozestup: 1.2, hakTlakRd: 1.2, hakTahRd: 1.5,
  // plochá střecha
  naklon: 15, konstrukceKgPanel: 8, kStred: 0.5, kOkraj: 1.0, treni: 0.5, roztecRad: 2.3, zatezPrvekKg: 25, pocetOkraj: 6, rezerva: "",
  poznamka: "",
});

export function vypocet(v) {
  const S = SNEH_OBLASTI.find(x => x.id === v.snehOblast);
  const sk = S?.sk ?? num(v.skVlastni, 0);
  const vb = (VITR_OBLASTI.find(x => x.id === v.vitrOblast) || VITR_OBLASTI[1]).vb;
  const vitr = tlakVetru({ vb, teren: v.teren, z: num(v.vyska, 8) });
  const Ap = num(v.panelDelka) * num(v.panelSirka);
  const zaklad = { sk, ce: num(v.ce, 1), vb, vitr, Ap, pocet: Math.round(num(v.pocet)) };
  return v.typ === "plocha" ? { ...zaklad, ...vypocetPlocha(v, zaklad) } : { ...zaklad, ...vypocetSikma(v, zaklad) };
}

// ── Šikmá střecha ──
function vypocetSikma(v, { sk, ce, vitr, Ap }) {
  const a = Math.min(75, Math.max(0, num(v.sklon)));
  const c = Math.cos(rad(a)), sn = Math.sin(rad(a));
  const m1 = mu1(a);
  const s = m1 * ce * sk; // kN/m² půdorysu
  const cp = cpeSikma(v.zonaSikma, a);
  const wTlak = cp.tlak * vitr.qp, wSani = cp.sani * vitr.qp; // kN/m² plochy střechy

  const D = DREVA.find(x => x.id === v.drevo) || DREVA[0];
  const roz = num(v.krokevRozestup, 0.9), L = num(v.krokevRozpeti, 3.5);
  const b = num(v.krokevB, 100), h = num(v.krokevH, 160);
  const krytina = KRYTINY.find(x => x.id === v.krytina) || KRYTINY[0];
  const vrstvy = VRSTVY.filter(x => (v.vrstvy || []).includes(x.id));
  const gKrokev = ((b / 1000) * (h / 1000) * D.rho) / (roz || 1);
  const gStrecha = krytina.g + vrstvy.reduce((t, x) => t + x.g, 0) + gKrokev; // kN/m² plochy střechy
  const gFve = ((num(v.panelHmotnost) / (Ap || 1)) + num(v.konstrukceKgM2)) * G; // kN/m² plochy panelů

  const Ls = L / (c || 1); // délka krokve mezi podporami (šikmo)
  const W = (b * h * h) / 6, I = (b * h ** 3) / 12, A = b * h; // mm
  const kh = Math.min(1.3, Math.max(1, (150 / h) ** 0.2));
  const fmd = (KMOD * D.fmk * kh) / GAMMA_M, fvd = (KMOD * D.fvk) / GAMMA_M;
  const sPerp = s * c * c; // kolmo na krokev, na m² plochy střechy

  const krokev = (g) => {
    const gp = g * c * roz, sp = sPerp * roz, wp = Math.max(0, wTlak) * roz; // kN/m
    const q1 = 1.35 * gp + 1.5 * sp + 1.5 * 0.6 * wp; // sníh hlavní
    const q2 = 1.35 * gp + 1.5 * wp + 1.5 * 0.5 * sp; // vítr hlavní
    const qd = Math.max(q1, q2);
    const M = (qd * Ls * Ls) / 8, V = (qd * Ls) / 2; // kNm, kN
    const sigma = (M * 1e6) / W, tau = (1.5 * V * 1000) / (KCR * A); // MPa
    const prh = (q) => (5 * q * (Ls * 1000) ** 4) / (384 * D.E * I); // q v kN/m = N/mm → mm
    const wFin = prh(gp) * (1 + KDEF) + prh(sp) + prh(wp) * 0; // ψ2 sníh = 0 (do 1000 m n. m.), vítr ψ2 = 0
    const wLim = (Ls * 1000) / 200;
    return { gp, sp, wp, q1, q2, qd, M, V, sigma, tau, uM: sigma / fmd, uV: tau / fvd, wFin, wLim, uW: wFin / wLim };
  };
  const pred = krokev(gStrecha), po = krokev(gStrecha + gFve);

  // Střešní háky: zatěžovací plocha = rozteč háků × polovina rozměru panelu kolmo na lištu
  const sirkaListy = Math.max(num(v.panelDelka), num(v.panelSirka)) / 2;
  const Ah = num(v.hakRozestup, 1.2) * sirkaListy;
  const hakTah = (1.5 * Math.abs(Math.min(0, wSani)) - 1.0 * gFve * c) * Ah;
  const hakTlak = Math.max(1.35 * gFve * c + 1.5 * sPerp + 0.9 * Math.max(0, wTlak), 1.35 * gFve * c + 1.5 * Math.max(0, wTlak) + 0.75 * sPerp) * Ah;
  const hakSpad = (1.35 * gFve + 1.5 * s * c) * sn * Ah; // síla ve směru spádu (informativně)
  const tahRd = num(v.hakTahRd, 1.5), tlakRd = num(v.hakTlakRd, 1.2);
  const hakyUTah = hakTah > 0 ? hakTah / (tahRd || 1) : 0, hakyUTlak = hakTlak / (tlakRd || 1);
  const pocetHaku = Math.ceil((Math.round(num(v.pocet)) * Ap) / (Ah || 1));

  const krokevOk = po.uM <= 1 && po.uV <= 1;
  const hakyOk = hakyUTah <= 1 && hakyUTlak <= 1;
  const predOk = pred.uM <= 1 && pred.uV <= 1;
  const narust = pred.uM ? (po.uM / pred.uM - 1) : 0;
  return {
    sklon: a, mu1: m1, s, cp, wTlak, wSani, drevo: D, krytina, vrstvy, gKrokev, gStrecha, gFve,
    Ls, W, I, kh, fmd, fvd, sPerp, pred, po, narust,
    sirkaListy, Ah, hakTah, hakTlak, hakSpad, tahRd, tlakRd, hakyUTah, hakyUTlak, pocetHaku,
    krokevOk, hakyOk, predOk, vyhovuje: krokevOk && hakyOk,
  };
}

// ── Plochá střecha, zátěžový systém ──
function vypocetPlocha(v, { sk, ce, vitr, Ap }) {
  const beta = Math.min(30, Math.max(0, num(v.naklon)));
  const c = Math.cos(rad(beta)), sn = Math.sin(rad(beta));
  const mu = Math.max(0.05, num(v.treni, 0.5));
  const cf = cfPanel(beta);
  const G0 = (num(v.panelHmotnost) + num(v.konstrukceKgPanel)) * G; // kN na panel
  const prvek = Math.max(1, num(v.zatezPrvekKg, 25));
  const pocet = Math.round(num(v.pocet)), pocetOkraj = Math.min(pocet, Math.max(0, Math.round(num(v.pocetOkraj))));
  // půdorys jednoho panelu: rozteč řad × šířka panelu v řadě (panely na šířku → delší strana)
  const pudorys = num(v.roztecRad, 2.3) * num(v.panelDelka);

  const zona = (z) => {
    const Fup = Math.abs(cf.min) * z.k * vitr.qp * Ap; // kN, kolmo na panel (sání)
    const Fdn = cf.max * z.k * vitr.qp * Ap;           // kN, kolmo na panel (tlak)
    const bNadzv = (1.5 * Fup * c) / 0.9 - G0;
    const bPosunSani = (1.5 * Fup * (sn + mu * c)) / (0.9 * mu) - G0;
    const bPosunTlak = (1.5 * Fdn * (sn - mu * c)) / (0.9 * mu) - G0;
    const potreba = Math.max(0, bNadzv, bPosunSani, bPosunTlak); // kN
    const rozhoduje = potreba <= 0 ? "vlastní tíha stačí" : potreba === bNadzv ? "nadzvednutí" : potreba === bPosunSani ? "posun (sání)" : "posun (tlak)";
    const kusy = Math.ceil(potreba / G / prvek - 1e-9);
    const balastKg = kusy * prvek;
    const celkemKg = G0 / G + balastKg;
    const pritizeni = (celkemKg * G) / (pudorys || 1); // kN/m²
    return { ...z, Fup, Fdn, bNadzv, bPosunSani, bPosunTlak, potrebaKg: potreba / G, rozhoduje, kusy, balastKg, celkemKg, pritizeni };
  };
  const stred = zona({ ...ZONY_PLOCHA[0], k: num(v.kStred, 0.5) }), okraj = zona({ ...ZONY_PLOCHA[1], k: num(v.kOkraj, 1) });
  const balastCelkemKg = (pocet - pocetOkraj) * stred.balastKg + pocetOkraj * okraj.balastKg;
  const hmotnostCelkemKg = (pocet - pocetOkraj) * stred.celkemKg + pocetOkraj * okraj.celkemKg;
  const prumer = (hmotnostCelkemKg * G) / ((pocet || 1) * (pudorys || 1));
  const rezerva = String(v.rezerva ?? "").trim() === "" ? null : num(v.rezerva);
  const maxPritizeni = Math.max(stred.pritizeni, pocetOkraj ? okraj.pritizeni : 0);
  return {
    naklon: beta, mu, cf, G0, prvek, pudorys, stred, okraj, pocetOkraj, balastCelkemKg, hmotnostCelkemKg, prumer, maxPritizeni,
    s: 0.8 * ce * sk, rezerva,
    vyhovuje: rezerva == null ? null : maxPritizeni <= rezerva,
  };
}

// Údaje z 3D návrhu FVE (záložka 3D návrh) → vstupy posudku
export function zNavrhu3D(n, vyskaHrebene, roztecRad) {
  const pole = n.fve || [];
  const pocet = pole.reduce((t, p) => t + (p.radky || 0) * (p.sloupce || 0), 0);
  const plocha = n.strecha === "plocha";
  const out = {
    nazev: n.nazev || "", zakaznik: n.zakaznik || "",
    typ: plocha ? "plocha" : "sikma",
    vyska: Math.round(vyskaHrebene(n) * 10) / 10,
    panelDelka: Math.max(n.panel?.sirka || 0, n.panel?.vyska || 0) || 1.762,
    panelSirka: Math.min(n.panel?.sirka || 0, n.panel?.vyska || 0) || 1.134,
  };
  if (pocet) out.pocet = pocet;
  if (!plocha) out.sklon = n.sklon;
  else if (pole[0]) {
    out.naklon = pole[0].naklon || 0;
    out.roztecRad = Math.round(roztecRad(n, pole[0]) * 100) / 100;
  }
  return out;
}
