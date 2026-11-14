// ─── Elektro CAD: nový projekt a šablony schémat ─────────────────────────────

import { novyId } from "./znacky.js";

export function vychoziProjekt(uzivatel = "") {
  const d = new Date();
  return {
    id: novyId(),
    nazev: "Nové schéma",
    format: "A4",
    contractId: null,
    razitko: {
      investor: "", adresa: "", cisloZak: "", stupen: "RDS", datum: `${d.getMonth() + 1}.${d.getFullYear()}`, meritko: "–",
      projektant: uzivatel, vypracoval: uzivatel, kontroloval: "", zkratka: "",
      druhVykresu: "Přehledové schéma", podnazev: "", nazevVykresu: "", kod: "", priloha: "1", cast: "", kopie: "",
    },
    napajeni: { popis: "3/PEN ~50 Hz 230/400 V, TN-C-S", U0: 230, Us: 400, Zs: 0.4, maxDu: 3, soudobost: 1, cos: 0.95 },
    zprava: { predmet: "", popis: "", ochrana: "", vlivy: "", zaver: "" },
    prvky: [], vodice: [], ramecky: [], texty: [], bilanceRucne: [],
  };
}

const P = (id, typ, x, y, v, rot = 0) => ({ id, typ, x, y, rot, v });
const W = (id, b, o = {}) => ({ id, b, styl: "faze", ...o });

function fveTuv(uzivatel) {
  const p = vychoziProjekt(uzivatel);
  return {
    ...p,
    nazev: "FVE ohřev TUV – přehledové schéma",
    razitko: { ...p.razitko, druhVykresu: "Přehledové schéma", podnazev: "Technologie fotovoltaického ohřevu TUV", nazevVykresu: "Schéma fotovoltaického ohřevu do TUV", kod: "R-DC1T1-16P+BPAC" },
    zprava: { ...p.zprava, predmet: "Předmětem dokumentace je připojení fotovoltaického ohřevu teplé užitkové vody (FVE 6 × 475 Wp) přes střídač do topné patrony zásobníku TUV. Přepínání režimu SÍŤ / 0 / FVE probíhá vždy přes polohu 0, FVE je tak galvanicky oddělena od distribuční sítě." },
    prvky: [
      P("fv", "fv", 38, 18, { ozn: "", pocet: 6, Wp: 475, popis: "6x AIKO 475Wp" }),
      P("fadc", "jistic", 35, 52, { ozn: "FA-DC", poly: 2, char: "B", In: 16, vyrobce: "AZT", typ: "GYM9-DC", popis: "500 V DC" }),
      P("spd", "svodic", 50, 82, { ozn: "FV/DC", poly: 2, typSpd: "T1+T2", vyrobce: "AZT", typ: "GSP9-C40PV", popis: "600 V DC", popisVlevo: false }),
      P("gu1", "stridac", 62, 150, { ozn: "GU1", ly: -10, P: 3, vyrobce: "", typ: "A-Z WATER INVERTER", popis: "1. fázový" }),
      P("sa1", "prepinac", 110, 58, { ozn: "SA1", poly: 1, In: 16, vyrobce: "EATON", typ: "Z-S/2WM", popis: "SÍŤ / VYP / FVE" }),
      P("fa1", "jistic", 110, 80, { ozn: "FA1", poly: 1, char: "B", In: 16, vyrobce: "EATON", typ: "PL6-B16/1" }),
      P("fi1", "chranic", 110, 100, { ozn: "FI1", poly: 2, In: 25, IdN: 30, typRcd: "A", vyrobce: "EATON", typ: "PF6-25/2/003-A" }),
      P("tuv", "svitidlo", 110, 132, { ozn: "TUV1", P: 2, popis: "Topná patrona" }),
      P("zem", "uzemneni", 28, 136, { ozn: "", skrytPopis: true }),
    ],
    vodice: [
      W("dcp", [[35, 26], [35, 52]], { kabel: { typ: "H1Z2Z2-K", zil: 1, prurez: 6, delka: 20, ulozeni: "SOLAR", soustava: "DC", Udc: 230, I: 13.5, jisticId: "fadc", nazev: "FV string (+/−)" } }),
      W("dcm", [[41, 26], [41, 52]], { popis: "SOLAR 1x6" }),
      W("dcp2", [[35, 68], [35, 156], [53, 156]], { popis: "A(+) SOLAR 1x4 až 1x6" }),
      W("dcm2", [[41, 68], [41, 162], [53, 162]], { popis: "B(−) SOLAR 1x4 až 1x6", lx: 3 }),
      W("spdp", [[35, 75], [50, 75], [50, 82]]),
      W("spdm", [[41, 78], [56, 78], [56, 82]]),
      W("spdpe", [[53, 97], [53, 125]], { styl: "pe", popis: "CY 16 ŽZ" }),
      W("pe", [[24, 125], [100, 125]], { styl: "pe" }),
      W("pezem", [[28, 125], [28, 136]], { styl: "pe" }),
      W("ac", [[71, 159], [95, 159], [95, 50], [113, 50], [113, 58]], { kabel: { typ: "CYKY-J", zil: 3, prurez: 2.5, delka: 3, ulozeni: "C", soustava: "1f", P: 2, cos: 1, jisticId: "fa1", nazev: "Střídač → přepínač" } }),
      W("sit", [[107, 30], [107, 58]], { kabel: { typ: "CYKY-J", zil: 3, prurez: 2.5, delka: 15, ulozeni: "C", soustava: "1f", P: 2, cos: 1, jisticId: "fa1", nazev: "Vstup – síť (z RD)" }, ly: -6 }),
      W("w1", [[110, 74], [110, 80]]),
      W("w2", [[110, 96], [110, 100]]),
      W("tuvw", [[110, 118], [110, 132]], { kabel: { typ: "CYKY-J", zil: 3, prurez: 2.5, delka: 8, ulozeni: "C", soustava: "1f", P: 2, cos: 1, jisticId: "fa1", predchoziId: "sit", nazev: "Výstup – topná patrona" } }),
    ],
    ramecky: [{ id: "r1", x: 22, y: 42, w: 150, h: 88, nazev: "R-DC1T1-16P+BPAC", nazevA: "r", popis: "Typ: R-DC1T1-16P+BPAC\nVýrobce: A-Z TRADERS s.r.o.\nNapětí: 500 V DC / 230 V AC\nProud: 15 A DC / 16 A AC\nPlastová rozvodnice s dveřmi\nkrytí IP40/IP20" }],
    texty: [
      { id: "t1", x: 232, y: 22, h: 4.5, t: "Přehledové schéma", a: "c" },
      { id: "t2", x: 232, y: 29, h: 3.2, t: "Zapojení A-Z WATER INVERTER", a: "c" },
      { id: "t3", x: 178, y: 112, h: 2, t: "Přechod mezi režimem SÍŤ / FVE vždy přes stav 0 –", a: "l" },
      { id: "t4", x: 178, y: 115, h: 2, t: "FVE je galvanicky oddělena od sítě.", a: "l" },
      { id: "t5", x: 107, y: 28, h: 2, t: "Vstup – síť", a: "c" },
    ],
  };
}

function rozvadecRd(uzivatel) {
  const p = vychoziProjekt(uzivatel);
  return {
    ...p,
    nazev: "Rozvaděč RD – jednopólové schéma",
    razitko: { ...p.razitko, druhVykresu: "Jednopólové schéma", podnazev: "Domovní rozvaděč RD", nazevVykresu: "Schéma rozvaděče RD", kod: "RD" },
    prvky: [
      P("zdroj", "zdroj", 30, 10, { ozn: "", popis: "3/PEN ~50 Hz 230/400 V TN-C" }),
      P("pj", "elektromer", 30, 28, { ozn: "PJ", popis: "Elektroměr ERÚ" }),
      P("qf1", "jistic", 30, 60, { ozn: "QF1", poly: 3, char: "B", In: 25, popis: "Hlavní jistič" }),
      P("spd", "svodic", 180, 98, { ozn: "FV1", poly: 3, typSpd: "T1+T2" }),
      P("fa1", "jisticChranic", 55, 98, { ozn: "FA1", poly: 2, char: "B", In: 16, IdN: 30, popis: "Zásuvky kuchyň" }),
      P("fa2", "jisticChranic", 95, 98, { ozn: "FA2", poly: 2, char: "B", In: 10, IdN: 30, popis: "Osvětlení" }),
      P("fa3", "jistic", 135, 98, { ozn: "FA3", poly: 3, char: "C", In: 16, popis: "Tepelné čerpadlo" }),
      P("xs1", "zasuvka", 55, 134, { ozn: "XS1", P: 2.5, beta: 0.5 }),
      P("e1", "svitidlo", 95, 134, { ozn: "E1", P: 0.5, beta: 0.8 }),
      P("m1", "motor", 135, 134, { ozn: "TČ", P: 6, faze: 3, beta: 1 }),
      P("zem", "uzemneni", 192, 128, { ozn: "", skrytPopis: true }),
    ],
    vodice: [
      W("w0", [[30, 24], [30, 28]]),
      W("privod", [[30, 46], [30, 60]], { kabel: { typ: "CYKY-J", zil: 5, prurez: 10, delka: 15, ulozeni: "C", soustava: "3f", P: 9, cos: 0.95, jisticId: "qf1", nazev: "Přívod RE → RD" }, lx: -3 }),
      W("w1", [[30, 76], [30, 90]]),
      W("pas", [[30, 90], [192, 90]], { styl: "pripojnice" }),
      W("v1", [[55, 90], [55, 98]]), W("v2", [[95, 90], [95, 98]]), W("v3", [[135, 90], [135, 98]]), W("v4", [[180, 90], [180, 98]]),
      W("k1", [[55, 116], [55, 134]], { kabel: { typ: "CYKY-J", zil: 3, prurez: 2.5, delka: 22, ulozeni: "C", soustava: "1f", P: 2.5, cos: 1, jisticId: "fa1", predchoziId: "privod", nazev: "Zásuvky kuchyň" } }),
      W("k2", [[95, 116], [95, 134]], { kabel: { typ: "CYKY-J", zil: 3, prurez: 1.5, delka: 28, ulozeni: "C", soustava: "1f", P: 0.5, cos: 0.95, jisticId: "fa2", predchoziId: "privod", nazev: "Osvětlení" } }),
      W("k3", [[135, 114], [135, 134]], { kabel: { typ: "CYKY-J", zil: 5, prurez: 2.5, delka: 15, ulozeni: "C", soustava: "3f", P: 6, cos: 0.9, jisticId: "fa3", predchoziId: "privod", nazev: "Tepelné čerpadlo" } }),
      W("spdz", [[192, 113], [192, 128]], { styl: "pe" }),
    ],
    ramecky: [{ id: "r1", x: 20, y: 54, w: 192, h: 70, nazev: "RD – rozvaděč domovní", popis: "" }],
    texty: [{ id: "t1", x: 232, y: 22, h: 4.5, t: "Jednopólové schéma rozvaděče", a: "c" }],
  };
}

export const SABLONY = [
  { id: "prazdny", nazev: "Prázdný výkres", vytvor: (u) => vychoziProjekt(u) },
  { id: "fveTuv", nazev: "FVE ohřev TUV (A-Z WATER INVERTER)", vytvor: fveTuv },
  { id: "rd", nazev: "Rozvaděč RD – jednopólové schéma", vytvor: rozvadecRd },
];
