// ─── Řízení rizika před bleskem — ČSN EN 62305-2 ed. 2 ───────────────────────
// Riziko R1 (ztráty na lidských životech) pro stavbu jako jednu zónu:
//   R1 = RA + RB + RU + RV   (RC, RM, RW, RZ jen u staveb s rizikem výbuchu,
//   nemocnic apod. — tady se neuvažují)
// Rx = Nx × Px × Lx (rovnice 5–13), počty událostí podle přílohy A,
// pravděpodobnosti podle přílohy B, ztráty podle přílohy C.
// Ověřeno na případové studii E.2 (venkovský dům): R1 = 2,51·10⁻⁵ bez ochrany.

export const RT_L1 = 1e-5; // tabulka 4

// Tabulka A.1 — činitel polohy stavby CD
export const CD = [
  { k: 0.25, t: "Obklopena vyššími objekty" },
  { k: 0.5, t: "Obklopena objekty stejné výšky nebo nižšími" },
  { k: 1, t: "Osamocená, žádné objekty v sousedství (do 3·H)" },
  { k: 2, t: "Osamocená na vrcholu kopce" },
];
// Tabulka A.2 — činitel instalace vedení CI
export const CI = [
  { k: 1, t: "Venkovní (vzdušné)" },
  { k: 0.5, t: "V zemi" },
  { k: 0.01, t: "V zemi uvnitř mřížové soustavy uzemnění" },
];
// Tabulka A.3 — činitel typu vedení CT
export const CT = [
  { k: 1, t: "Silové NN, telekomunikační, datové" },
  { k: 0.2, t: "Silové VN (s transformátorem VN/NN)" },
];
// Tabulka A.4 — činitel prostředí CE
export const CE = [
  { k: 1, t: "Venkovské" },
  { k: 0.5, t: "Předměstské" },
  { k: 0.1, t: "Městské" },
  { k: 0.01, t: "Městské s budovami nad 20 m" },
];
// Tabulka B.2 — PB podle třídy LPS
export const PB = { "": 1, IV: 0.2, III: 0.1, II: 0.05, I: 0.02 };
// Tabulka B.7 — PEB podle LPL, pro niž jsou navrženy SPD na vstupu vedení
export const PEB = { "": 1, "III-IV": 0.05, II: 0.02, I: 0.01 };
// Tabulka B.1 — PTA (součin, když je opatření víc)
export const PTA = [
  { id: "napisy", k: 0.1, t: "Varovné nápisy" },
  { id: "izolace", k: 0.01, t: "Elektrická izolace svodů (např. 3 mm síťovaný PE)" },
  { id: "ekvip", k: 0.01, t: "Účinné ekvipotenciální propojení v půdě" },
  { id: "zabrana", k: 0, t: "Fyzické omezení nebo konstrukce budovy jako soustava svodů" },
];
// Tabulka B.6 — PTU
export const PTU = [
  { id: "napisy", k: 0.1, t: "Výstražné nápisy" },
  { id: "izolace", k: 0.01, t: "Elektrická izolace" },
  { id: "zabrana", k: 0, t: "Fyzické zábrany" },
];
// Tabulka B.4 — CLD a CLI podle stínění vedení
export const STINENI = [
  { id: "nestinene", cld: 1, cli: 1, t: "Nestíněné venkovní / kabelové vedení" },
  { id: "pen", cld: 1, cli: 0.2, t: "Silové vedení s vícenásobně uzemněnou nulou" },
  { id: "stin-zem-nespoj", cld: 1, cli: 0.3, t: "Stíněné podzemní, stínění nespojeno s přípojnicí pospojování" },
  { id: "stin-venk-nespoj", cld: 1, cli: 0.1, t: "Stíněné venkovní, stínění nespojeno s přípojnicí pospojování" },
  { id: "stin-spoj", cld: 1, cli: 0, t: "Stíněné (podzemní i venkovní), stínění spojeno s přípojnicí" },
  { id: "kanal", cld: 0, cli: 0, t: "Kabely v kanálech / kovových trubkách pro ochranu před bleskem" },
];
// Tabulka B.8 — PLD podle Uw (kV) a odporu stínění
export const UW = [1, 1.5, 2.5, 4, 6];
const PLD_TAB = {
  nestinene: [1, 1, 1, 1, 1],
  "rs5-20": [1, 1, 0.95, 0.9, 0.8],
  "rs1-5": [0.9, 0.8, 0.6, 0.3, 0.1],
  "rs<1": [0.6, 0.4, 0.2, 0.04, 0.02],
};
export const RS = [
  { id: "nestinene", t: "Nestíněné / stínění nespojeno s přípojnicí" },
  { id: "rs5-20", t: "Stíněné, 5 Ω/km < Rs ≤ 20 Ω/km" },
  { id: "rs1-5", t: "Stíněné, 1 Ω/km < Rs ≤ 5 Ω/km" },
  { id: "rs<1", t: "Stíněné, Rs ≤ 1 Ω/km" },
];
// Tabulka C.3 — rt podle povrchu
export const RT_POVRCH = [
  { k: 1e-2, t: "Zemědělská, betonová (≤ 1 kΩ)" },
  { k: 1e-3, t: "Mramorová, keramická (1–10 kΩ)" },
  { k: 1e-4, t: "Štěrk, mozaika, koberec (10–100 kΩ)" },
  { k: 1e-5, t: "Asfalt, linoleum, dřevo (≥ 100 kΩ)" },
];
// Tabulka C.4 — rp
export const RP = [
  { k: 1, t: "Žádná opatření" },
  { k: 0.5, t: "Hasicí přístroje, ruční hasicí/poplachová instalace, hydranty, požární úseky, únikové cesty" },
  { k: 0.2, t: "Automatická hasicí nebo poplachová instalace" },
];
// Tabulka C.5 — rf (požár; výbuch se zde neuvažuje)
export const RF = [
  { k: 1e-1, t: "Vysoké riziko požáru (hořlavé materiály, hořlavá střecha, > 800 MJ/m²)" },
  { k: 1e-2, t: "Obvyklé riziko požáru (400–800 MJ/m²)" },
  { k: 1e-3, t: "Nízké riziko požáru (< 400 MJ/m², málo hořlavin)" },
  { k: 0, t: "Žádné riziko požáru" },
];
// Tabulka C.6 — hz
export const HZ = [
  { k: 1, t: "Žádné zvláštní riziko" },
  { k: 2, t: "Nízká úroveň paniky (do 2 podlaží, do 100 osob)" },
  { k: 5, t: "Průměrná úroveň paniky (100–1000 osob)" },
  { k: 5, t: "Obtížná evakuace (nepohybliví, nemocnice)" },
  { k: 10, t: "Vysoká úroveň paniky (nad 1000 osob)" },
];
// Tabulka C.2 — LF (hmotná škoda)
export const LF = [
  { k: 1e-1, t: "Obytné budovy, hotel, škola, nemocnice, občanská výstavba" },
  { k: 5e-2, t: "Veřejná zábava, kostel, muzeum" },
  { k: 2e-2, t: "Průmyslový, komerční" },
  { k: 1e-2, t: "Ostatní" },
];
const LT = 1e-2; // tabulka C.2, D1 — všechny typy

export const vychoziRiziko = (n) => ({
  ng: 3,                 // hustota úderů do země (1/km²/rok) — podle mapy ČHMÚ pro místo stavby
  L: n?.delka ?? 12, W: n?.sirka ?? 9, H: null, // H = null → výška hřebene z modelu
  cd: 1,
  ptaOpatreni: [],
  ptuOpatreni: [],
  rtPovrch: 1e-5,       // uvnitř: dřevo, linoleum
  rp: 1, rf: 1e-3, hz: 1, lf: 1e-1,
  nzNt: 1, tz: 8760,
  vedeni: [
    { id: "sil", nazev: "Silové vedení NN", delka: 1000, ci: 0.5, ct: 1, ce: 1, stineni: "nestinene", rs: "nestinene", uw: 2.5, sousedni: null },
    { id: "tlc", nazev: "Telekomunikační vedení", delka: 1000, ci: 1, ct: 1, ce: 1, stineni: "nestinene", rs: "nestinene", uw: 1.5, sousedni: null },
  ],
});

const pld = (v) => PLD_TAB[v.rs]?.[UW.indexOf(Number(v.uw))] ?? 1;
const stin = (v) => STINENI.find(s => s.id === v.stineni) || STINENI[0];
const soucin = (seznam, vybrane) => seznam.filter(x => (vybrane || []).includes(x.id)).reduce((p, x) => p * x.k, 1);

// Sběrná plocha osamocené pravoúhlé stavby (A.2)
export const sbernaPlocha = (L, W, H) => L * W + 2 * (3 * H) * (L + W) + Math.PI * (3 * H) ** 2;

// Výpočet R1 pro danou třídu LPS a LPL SPD na vstupu vedení.
export function vypocetR1(vst, { lps = "", spd = "" } = {}) {
  const ng = Number(vst.ng) || 0;
  const AD = sbernaPlocha(Number(vst.L), Number(vst.W), Number(vst.H));
  const ND = ng * AD * Number(vst.cd) * 1e-6;                       // (A.4)
  const k = (Number(vst.nzNt) || 1) * (Number(vst.tz) || 8760) / 8760;
  const LA = vst.rtPovrch * LT * k;                                 // (C.1)
  const LU = vst.rtPovrch * LT * k;                                 // (C.2)
  const LB = vst.rp * vst.rf * vst.hz * vst.lf * k;                 // (C.3), LV = LB
  const pb = PB[lps] ?? 1;
  const peb = PEB[spd] ?? 1;
  const PA = soucin(PTA, vst.ptaOpatreni) * pb;                     // (B.1)
  const RA = ND * PA * LA;
  const RB = ND * pb * LB;
  let RU = 0, RV = 0;
  const vedeni = (vst.vedeni || []).map(v => {
    const AL = 40 * (Number(v.delka) || 1000);                       // (A.9)
    const NL = ng * AL * v.ci * v.ce * v.ct * 1e-6;                  // (A.8)
    let NDJ = 0;
    if (v.sousedni) {
      const ADJ = sbernaPlocha(Number(v.sousedni.L), Number(v.sousedni.W), Number(v.sousedni.H));
      NDJ = ng * ADJ * (Number(v.sousedni.cd) || 1) * v.ct * 1e-6;   // (A.5)
    }
    const { cld } = stin(v);
    const PLD = pld(v);
    const PU = soucin(PTU, vst.ptuOpatreni) * peb * PLD * cld;       // (B.8)
    const PV = peb * PLD * cld;                                      // (B.9)
    const ru = (NL + NDJ) * PU * LU, rv = (NL + NDJ) * PV * LB;       // (10), (11)
    RU += ru; RV += rv;
    return { ...v, AL, NL, NDJ, PLD, PU, PV, RU: ru, RV: rv };
  });
  const R1 = RA + RB + RU + RV;
  return { AD, ND, LA, LU, LB, PA, PB: pb, PEB: peb, RA, RB, RU, RV, R1, vedeni, vyhovuje: R1 <= RT_L1 };
}

// Varianty ochrany seřazené od nejjednodušší; první vyhovující je doporučená.
export function variantyOchrany(vst) {
  const varianty = [
    { nazev: "Bez ochrany", lps: "", spd: "" },
    { nazev: "SPD na vstupu vedení (LPL III–IV)", lps: "", spd: "III-IV" },
    { nazev: "LPS IV + SPD (LPL III–IV)", lps: "IV", spd: "III-IV" },
    { nazev: "LPS III + SPD (LPL III–IV)", lps: "III", spd: "III-IV" },
    { nazev: "LPS II + SPD (LPL II)", lps: "II", spd: "II" },
    { nazev: "LPS I + SPD (LPL I)", lps: "I", spd: "I" },
  ];
  return varianty.map(v => ({ ...v, ...vypocetR1(vst, v) }));
}

// ─── Návrh SPD — ČSN EN 62305-1 ed. 2, příloha E ─────────────────────────────
// Úder do stavby s LPS (S1): polovina bleskového proudu teče do uzemnění, druhá
// polovina se dělí mezi vstupující sítě (E.4: ke = 0,5/n) a v síti mezi vodiče
// (E.5: ke' = ke/n'). Úder přímo do vedení (S3): tabulky E.2 (NN) a E.3 (telekom.).
export const VRCHOL_PROUDU = { I: 200, II: 150, "III-IV": 100 };      // kA, 62305-1 tab. 3
const S3_NN = { I: 10, II: 7.5, "III-IV": 5 };                        // kA 10/350 na vodič, tab. E.2
const S3_TLC = { I: 2, II: 1.5, "III-IV": 1 };                        // kA 10/350 na vodič, tab. E.3

export function navrhSpd(vst, lpl, { blizkoFve = 0, maFve = false } = {}) {
  if (!lpl) return null;
  const I = VRCHOL_PROUDU[lpl];
  const vedeni = vst.vedeni || [];
  const n = vedeni.length + (Number(vst.dalsiSite) || 0);
  const ke = n ? 0.5 / n : 0.5;                                         // (E.4)
  const polozky = vedeni.map(v => {
    const silove = !/tele|tlc|dat/i.test(v.nazev || "") && v.id !== "tlc";
    const vodicu = Number(v.vodicu) || (silove ? 4 : 2);
    const stinene = v.stineni && v.stineni !== "nestinene" && v.stineni !== "pen";
    const s1 = (ke * I) / vodicu;                                         // (E.1), (E.5)
    const s3 = (silove ? S3_NN : S3_TLC)[lpl] * (stinene ? 0.5 : 1);
    const iimp = Math.max(s1, s3);
    const uw = Number(v.uw) || 2.5;
    return {
      id: v.id, nazev: v.nazev, silove, vodicu, iimp, s1, s3,
      typ: silove ? "SPD typ 1+2 (svodič bleskových proudů a přepětí)" : "SPD pro telekomunikační vedení, kategorie D1 (10/350 µs)",
      misto: silove ? "v hlavním rozvaděči / na vstupu vedení do budovy, připojit na hlavní ochrannou přípojnici" : "na vstupu vedení do budovy, uzemnit na hlavní ochrannou přípojnici",
      up: 0.8 * uw,
      text: silove
        ? `Iimp (10/350 µs) ≥ ${iimp.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} kA na pól, ${vodicu} ${vodicu >= 2 && vodicu <= 4 ? "póly" : "pólů"} (${vodicu === 4 ? "TN-C: L1, L2, L3, PEN" : vodicu === 5 ? "TN-S/TT: L1, L2, L3, N, PE" : `${vodicu} vodiče`}), Up ≤ ${(0.8 * uw).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} kV`
        : `Iimp (10/350 µs) ≥ ${iimp.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} kA na vodič, ${vodicu} vodiče, Up ≤ ${(0.8 * uw).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} kV`,
    };
  });
  if (maFve) {
    polozky.push(blizkoFve
      ? { id: "fve-dc", nazev: "FVE – strana DC", typ: "SPD typ 1+2 DC pro FV", misto: "u střídače na každý vstup MPPT (a v rozvodnici na střeše u delšího vedení)", text: `Dostatečná vzdálenost od LPS není u ${blizkoFve} panelů dodržena → konstrukci FVE pospojovat s LPS a použít svodič typu 1+2 DC, Ucpv ≥ 1,2 × Uoc stringu`, iimp: null }
      : { id: "fve-dc", nazev: "FVE – strana DC", typ: "SPD typ 2 DC pro FV", misto: "u střídače na každý vstup MPPT", text: "Dostatečná vzdálenost od LPS je dodržena → svodič typu 2 DC, Ucpv ≥ 1,2 × Uoc stringu", iimp: null });
    polozky.push({ id: "fve-ac", nazev: "FVE – strana AC střídače", typ: "SPD typ 2", misto: "na výstupu střídače, pokud je vzdálenost k hlavnímu rozvaděči se SPD typu 1+2 větší než 10 m", text: "In (8/20 µs) ≥ 20 kA na pól, Up ≤ 1,5 kV", iimp: null });
  }
  return { lpl, I, n, ke, polozky };
}

// ─── Postup podle obrázku 1 ČSN EN 62305-2 ───────────────────────────────────
// Ze stavby bez ochrany se postupně přidávají ochranná opatření, dokud R1 ≤ RT:
// - bez LPS a RA + RB > RT → LPS (nejnižší třída, s povinným ekvipotenciálním
//   pospojováním = SPD na vstupu vedení pro odpovídající LPL);
// - bez LPS a RA + RB ≤ RT → kompletní LPS není nutný, postačí SPD podle
//   ČSN EN 62305-3 na vstupu vedení (poznámka a k obr. 1);
// - jinak se zesiluje opatření u převažující součásti (LPS pro RA + RB, SPD pro RU + RV).
const POR_LPS = ["IV", "III", "II", "I"];
const POR_SPD = ["III-IV", "II", "I"];
export const lplProLps = (lps) => ({ I: "I", II: "II", III: "III-IV", IV: "III-IV" }[lps] || "");
const vyssiSpd = (a, b) => (POR_SPD.indexOf(a) >= POR_SPD.indexOf(b) ? a : b);
const HORNI = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const fmt = (x) => { if (!x) return "0"; const e = Math.floor(Math.log10(Math.abs(x))); return `${(x / 10 ** e).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })}·10${String(e).split("").map(c => HORNI[c]).join("")}`; };

export function postupNormy(vst) {
  let lps = "", spd = "";
  let r = vypocetR1(vst, { lps, spd });
  const kroky = [{ krok: "Stavba bez ochranných opatření", lps, spd, ...r }];
  for (let i = 0; i < 12 && !r.vyhovuje; i++) {
    const rab = r.RA + r.RB, ruv = r.RU + r.RV;
    let krok;
    if (!lps) {
      if (rab > RT_L1) {
        lps = "IV"; spd = spd ? vyssiSpd(spd, lplProLps(lps)) : lplProLps(lps);
        krok = `R1 > RT, stavba bez LPS a RA + RB = ${fmt(rab)} > RT → nainstalovat LPS třídy IV (včetně ekvipotenciálního pospojování – SPD na vstupu vedení)`;
      } else if (!spd) {
        spd = "III-IV";
        krok = `R1 > RT, ale RA + RB = ${fmt(rab)} ≤ RT → kompletní LPS není nutný, postačí SPD na vstupu vedení podle ČSN EN 62305-3 (obr. 1, pozn. a), LPL III–IV`;
      } else if (spd !== "I") {
        spd = POR_SPD[POR_SPD.indexOf(spd) + 1];
        krok = `R1 stále > RT, převažuje RU + RV = ${fmt(ruv)} → SPD pro vyšší hladinu LPL ${spd}`;
      } else {
        lps = "IV";
        krok = "SPD pro LPL I nestačí → nainstalovat LPS třídy IV";
      }
    } else if (rab >= ruv && lps !== "I") {
      lps = POR_LPS[POR_LPS.indexOf(lps) + 1]; spd = vyssiSpd(spd || "III-IV", lplProLps(lps));
      krok = `R1 > RT, převažuje RA + RB = ${fmt(rab)} → LPS vyšší třídy ${lps}`;
    } else if (spd !== "I") {
      spd = POR_SPD[POR_SPD.indexOf(spd || "III-IV") + (spd ? 1 : 0)];
      krok = `R1 > RT, převažuje RU + RV = ${fmt(ruv)} → SPD pro LPL ${spd}`;
    } else if (lps !== "I") {
      lps = POR_LPS[POR_LPS.indexOf(lps) + 1];
      krok = `R1 > RT → LPS vyšší třídy ${lps}`;
    } else {
      kroky.push({ krok: "Ani LPS I se SPD pro LPL I nestačí → nutná jiná ochranná opatření podle tabulky 3 (např. omezení dotykových napětí, protipožární opatření)", lps, spd, ...r, konec: true });
      break;
    }
    r = vypocetR1(vst, { lps, spd });
    kroky.push({ krok, lps, spd, ...r });
  }
  return { kroky, lps, spd, vysledek: r };
}

// Posouzení navrženého řešení: LPS z výkresu hromosvodu + SPD požadované postupem
// normy (u LPS vždy alespoň SPD pro odpovídající LPL – ekvipotenciální pospojování).
export function posouzeniNavrhu(vst, lpsVykres) {
  const postup = postupNormy(vst);
  let spd = postup.spd;
  if (lpsVykres) spd = spd ? vyssiSpd(spd, lplProLps(lpsVykres)) : lplProLps(lpsVykres);
  const lps = lpsVykres || postup.lps;
  return { postup, lps, spd, ...vypocetR1(vst, { lps, spd }), lpsZVykresu: !!lpsVykres };
}
