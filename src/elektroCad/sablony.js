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

// ── předuložené projekty (hotové zakázky jako vzor) ──
// Otevřou se s pevným id, takže se po úpravě uloží do zařízení a příště se
// otevře uložená verze; „Obnovit původní“ vrátí tuto podobu.

// Vantová, Přítoky 70 – FVE ohřev TUV včetně stávajícího domovního rozvaděče
function vantovaPritoky70() {
  const p = fveTuv("Roman Jurenka");
  return {
    ...p,
    id: "pred-vantova-pritoky-70",
    predulozeny: "vantova",
    nazev: "Vantová, Přítoky 70 – FVE ohřev TUV",
    razitko: {
      ...p.razitko, investor: "Hana Vantová", adresa: "Přítoky 70", cisloZak: "JE-26-102", stupen: "RDS", datum: "2.2026",
      projektant: "Roman Jurenka", vypracoval: "Roman Jurenka", zkratka: "R.J.", priloha: "1",
    },
    prvky: [
      ...p.prvky,
      // stávající domovní rozvaděč
      P("qf2", "jistic", 198, 82, { ozn: "QF2", poly: 1, char: "B", In: 16 }),
      P("fa01", "jistic", 215, 82, { ozn: "FA01", poly: 1, char: "B", In: 2 }),
      P("hdo", "hdo", 215, 100, { ozn: "", popis: "Přijímač HDO", skrytPopis: false }),
      P("ka1c", "rele", 215, 118, { ozn: "KA1", popisVlevo: true }),
      P("ka1", "stykac", 240, 90, { ozn: "KA1", poly: 2, In: 25 }),
      P("qf", "jistic", 258, 82, { ozn: "QF", poly: 3, char: "B", In: 32 }),
      P("re", "elektromer", 258, 102, { ozn: "RE PJ" }),
      P("fu", "pojistka", 258, 124, { ozn: "FU", poly: 3, char: "gG", In: 32 }),
    ],
    vodice: [
      ...p.vodice,
      W("pas", [[194, 78], [258, 78]], { styl: "pripojnice" }),
      W("s1", [[198, 78], [198, 82]]), W("s2", [[215, 78], [215, 82]]), W("s3", [[240, 78], [240, 90]]), W("s4", [[258, 78], [258, 82]]),
      W("s5", [[215, 98], [215, 100]]), W("s6", [[215, 116], [215, 118]]),
      W("s7", [[258, 98], [258, 102]]), W("s8", [[258, 120], [258, 124]]),
      W("qf2out", [[198, 98], [198, 112]], { popis: "→ R-DC1T1 vstup síť", lx: 0 }),
      W("ntepel", [[240, 106], [240, 116]], { popis: "N-tepel", lx: 0 }),
      W("dist", [[258, 140], [258, 150]], { popis: "Distribuce", lx: 0 }),
    ],
    ramecky: [
      { ...p.ramecky[0], popis: "" },
      { id: "r2", x: 186, y: 72, w: 102, h: 74, nazev: "Stávající domovní rozvaděč", popis: "" },
    ],
    texty: [
      p.texty[0], p.texty[1],
      ...["Typ: R-DC1T1-16P+BPAC", "Výrobce: A-Z TRADERS s.r.o., IČ 07462522", "Napětí: 500 V DC / 230 V AC, proud 15 A DC / 16 A AC", "Plastová rozvodnice s dveřmi BC-O-1/12-ECO, 1 × 12 modulů", "Krytí IP40/IP20"]
        .map((t, i) => ({ id: `d${i}`, x: 178, y: 40 + i * 2.7, h: 1.9, t, a: "l" })),
      { id: "t3", x: 178, y: 58, h: 2, t: "Přechod mezi režimem SÍŤ / FVE vždy přes stav 0 –", a: "l" },
      { id: "t4", x: 178, y: 61, h: 2, t: "FVE je galvanicky oddělena od sítě.", a: "l" },
      { id: "t5", x: 107, y: 28, h: 2, t: "Vstup – síť (z QF2 stáv. RD)", a: "c" },
      { id: "t6", x: 229, y: 76, h: 1.7, t: "3PEN stř. 50 Hz 230 V // TN-C-S", a: "c" },
      ...["Relé KA1:", "blokuje TUV", "min. nabití TUV", "odděluje N-tepel"].map((t, i) => ({ id: `k${i}`, x: 188, y: 122 + i * 2.5, h: 1.7, t, a: "l" })),
    ],
  };
}

export const PREDULOZENE = [
  { id: "pred-vantova-pritoky-70", nazev: "Vantová, Přítoky 70 – FVE ohřev TUV", vytvor: vantovaPritoky70 },
];

export const SABLONY = [
  { id: "prazdny", nazev: "Prázdný výkres", vytvor: (u) => vychoziProjekt(u) },
  { id: "fveTuv", nazev: "FVE ohřev TUV (A-Z WATER INVERTER)", vytvor: fveTuv },
  { id: "rd", nazev: "Rozvaděč RD – jednopólové schéma", vytvor: rozvadecRd },
];
