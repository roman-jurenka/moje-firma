// ─── Elektro CAD: značky, popisky, rámeček a razítko ─────────────────────────
// Vše se kreslí v milimetrech listu (osa y dolů) jako jednoduché primitivy:
//   { k:"l",  p:[x1,y1,x2,y2], s, w, vr }      úsečka
//   { k:"pl", b:[[x,y],…], z, f, s, w, vr }    lomená čára (z = uzavřená, f = vyplněná)
//   { k:"c",  x, y, r, f, vr }                 kružnice
//   { k:"t",  x, y, h, t, a, rot, vr }          text (y = účaří, a = l/c/r, rot 0/90)
// Stejné primitivy pak vykreslí obrazovka (SVG), PDF (jsPDF) i DXF, takže
// výstupy vypadají stejně jako editor. Styl čáry s: "plna" | "carka" | "cerch".

export const VRSTVY = {
  RAMEC: { barva: 7 }, ZNACKY: { barva: 7 }, VODICE: { barva: 7 }, PE: { barva: 3 },
  TEXT: { barva: 7 }, POPISY: { barva: 7 }, RAZITKO: { barva: 7 }, ROZVADECE: { barva: 1 },
};

export const FORMATY = {
  A4: { w: 297, h: 210, nazev: "A4 na šířku" },
  A3: { w: 420, h: 297, nazev: "A3 na šířku" },
  A2: { w: 594, h: 420, nazev: "A2 na šířku" },
};

export const MRIZKA = 2.5;
export const snap = (v, m = MRIZKA) => Math.round(v / m) * m;

// ── pomocníci pro tvorbu primitiv ──
const L = (x1, y1, x2, y2, s = "plna", w) => ({ k: "l", p: [x1, y1, x2, y2], s, w });
const C = (x, y, r, f = false) => ({ k: "c", x, y, r, f });
const T = (x, y, h, t, a = "c") => ({ k: "t", x, y, h, t, a, rot: 0 });
const PL = (b, z = true, f = false) => ({ k: "pl", b, z, f });
const R = (x0, y0, x1, y1, f = false) => PL([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, f);
const elipsa = (cx, cy, rx, ry, n = 28) => PL(Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((2 * Math.PI * i) / n), cy + ry * Math.sin((2 * Math.PI * i) / n)]), true);
const oblouk = (cx, cy, r, a0, a1, n = 12) => PL(Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }), false);
const sipkaDolu = (x, y, d = 1.6) => PL([[x - d / 2, y - d], [x + d / 2, y - d], [x, y]], true, true);

const ROZTEC = 6; // rozteč pólů mm

// Spínací kontakt jednoho pólu (svislý, nahoře 0, dole d)
function kontakt(x, d, { krizek = false, odpinac = false, stykac = false, rozpinaci = false } = {}) {
  const o = [L(x, 0, x, d * 0.28), L(x, d * 0.72, x, d), L(x, d * 0.72, x - d * 0.24, d * 0.3)];
  if (rozpinaci) o.push(L(x, d * 0.28, x - d * 0.28, d * 0.28));
  if (krizek) { const c = d * 0.28, s = 1.1; o.push(L(x - s, c - s, x + s, c + s), L(x - s, c + s, x + s, c - s)); }
  if (odpinac) o.push(L(x - 1, d * 0.28, x + 1, d * 0.28));
  if (stykac) o.push(oblouk(x, d * 0.28 - 0.9, 0.9, 0, Math.PI));
  return o;
}
function spojeniPolu(n, y, x0 = -1.8) {
  if (n < 2) return [];
  return [L(x0 - (y > 0 ? 0 : 0), y, (n - 1) * ROZTEC - 1.8, y, "carka")];
}

// Definice značek. Každá vrací { prim, piny, bbox } v místních souřadnicích.
// Vlastnosti v: póly (poly), druh atd. Piny jsou body, kam se napojí vodič.
export const ZNACKY = {
  jistic: {
    nazev: "Jistič", skupina: "Přístroje", vychozi: { ozn: "FA", poly: 1, char: "B", In: 16, vyrobce: "", typ: "" },
    kresli: (v) => {
      const n = +v.poly || 1, d = 16, prim = [], piny = [];
      for (let i = 0; i < n; i++) { const x = i * ROZTEC; prim.push(...kontakt(x, d, { krizek: true })); piny.push([x, 0], [x, d]); }
      prim.push(...spojeniPolu(n, d * 0.5));
      return { prim, piny, bbox: [-4.5, 0, (n - 1) * ROZTEC + 1.5, d] };
    },
  },
  chranic: {
    nazev: "Proudový chránič", skupina: "Přístroje", vychozi: { ozn: "FI", poly: 2, In: 25, IdN: 30, typRcd: "A", vyrobce: "", typ: "" },
    kresli: (v) => {
      const n = +v.poly || 2, d = 18, prim = [], piny = [];
      for (let i = 0; i < n; i++) { const x = i * ROZTEC; prim.push(...kontakt(x, d, { odpinac: true })); piny.push([x, 0], [x, d]); }
      const sir = (n - 1) * ROZTEC;
      prim.push(elipsa(sir / 2, d * 0.84, sir / 2 + 2.6, 1.3));
      prim.push(L(sir / 2 + sir / 2 + 2.6, d * 0.84, sir + 4, d * 0.84), L(sir + 4, d * 0.84, sir + 4, d * 0.5), L(sir + 4, d * 0.5, -1.8, d * 0.5, "carka"));
      prim.push(R(sir + 2.8, d * 0.18, sir + 5.2, d * 0.36), L(sir + 4, d * 0.36, sir + 4, d * 0.5, "carka"));
      return { prim, piny, bbox: [-4.5, 0, sir + 5.5, d] };
    },
  },
  jisticChranic: {
    nazev: "Jistič s chráničem", skupina: "Přístroje", vychozi: { ozn: "FI", poly: 2, char: "B", In: 16, IdN: 30, typRcd: "A", vyrobce: "", typ: "" },
    kresli: (v) => {
      const n = +v.poly || 2, d = 18, prim = [], piny = [];
      for (let i = 0; i < n; i++) { const x = i * ROZTEC; prim.push(...kontakt(x, d, { krizek: true })); piny.push([x, 0], [x, d]); }
      const sir = (n - 1) * ROZTEC;
      prim.push(elipsa(sir / 2, d * 0.84, sir / 2 + 2.6, 1.3));
      prim.push(L(sir + 2.6, d * 0.84, sir + 4, d * 0.84), L(sir + 4, d * 0.84, sir + 4, d * 0.5), L(sir + 4, d * 0.5, -1.8, d * 0.5, "carka"));
      return { prim, piny, bbox: [-4.5, 0, sir + 5, d] };
    },
  },
  odpinac: {
    nazev: "Vypínač / odpínač", skupina: "Přístroje", vychozi: { ozn: "QS", poly: 3, In: 63, vyrobce: "", typ: "" },
    kresli: (v) => {
      const n = +v.poly || 1, d = 16, prim = [], piny = [];
      for (let i = 0; i < n; i++) { const x = i * ROZTEC; prim.push(...kontakt(x, d, { odpinac: true })); piny.push([x, 0], [x, d]); }
      prim.push(...spojeniPolu(n, d * 0.5));
      return { prim, piny, bbox: [-4.5, 0, (n - 1) * ROZTEC + 1.5, d] };
    },
  },
  stykac: {
    nazev: "Stykač (hlavní kontakty)", skupina: "Přístroje", vychozi: { ozn: "KM", poly: 2, In: 25, vyrobce: "", typ: "" },
    kresli: (v) => {
      const n = +v.poly || 1, d = 16, prim = [], piny = [];
      for (let i = 0; i < n; i++) { const x = i * ROZTEC; prim.push(...kontakt(x, d, { stykac: true })); piny.push([x, 0], [x, d]); }
      prim.push(...spojeniPolu(n, d * 0.5));
      return { prim, piny, bbox: [-4.5, 0, (n - 1) * ROZTEC + 1.5, d] };
    },
  },
  prepinac: {
    nazev: "Přepínač I-0-II", skupina: "Přístroje", vychozi: { ozn: "SA", poly: 2, In: 16, popis: "SÍŤ / 0 / FVE", vyrobce: "", typ: "" },
    kresli: (v) => {
      const n = +v.poly || 1, d = 16, prim = [], piny = [], rt = 9;
      for (let i = 0; i < n; i++) {
        const x = i * rt;
        prim.push(L(x - 3, 0, x - 3, 5), L(x + 3, 0, x + 3, 5), L(x, d, x, 11), L(x, 11, x - 2.4, 5.4));
        prim.push(C(x - 3, 5, 0.5), C(x + 3, 5, 0.5));
        piny.push([x - 3, 0], [x + 3, 0], [x, d]);
      }
      if (n > 1) prim.push(L(-2, 8, (n - 1) * rt - 1, 8, "carka"));
      return { prim, piny, bbox: [-4.5, 0, (n - 1) * rt + 3.5, d] };
    },
  },
  pojistka: {
    nazev: "Pojistka", skupina: "Přístroje", vychozi: { ozn: "FU", poly: 1, char: "gG", In: 25, vyrobce: "", typ: "" },
    kresli: (v) => {
      const n = +v.poly || 1, d = 16, prim = [], piny = [];
      for (let i = 0; i < n; i++) { const x = i * ROZTEC; prim.push(L(x, 0, x, d), R(x - 1.3, 3.5, x + 1.3, 12.5)); piny.push([x, 0], [x, d]); }
      return { prim, piny, bbox: [-2, 0, (n - 1) * ROZTEC + 2, d] };
    },
  },
  svodic: {
    nazev: "Svodič přepětí (SPD)", skupina: "Přístroje", vychozi: { ozn: "FV", poly: 1, typSpd: "T1+T2", vyrobce: "", typ: "" },
    kresli: (v) => {
      const n = +v.poly || 1, prim = [], piny = [];
      for (let i = 0; i < n; i++) {
        const x = i * ROZTEC;
        prim.push(L(x, 0, x, 4), R(x - 2, 4, x + 2, 12), L(x, 5.2, x, 10.4), sipkaDolu(x, 10.8), L(x, 12, x, 15));
        piny.push([x, 0], [x, 15]);
      }
      if (n > 1) prim.push(L(0, 15, (n - 1) * ROZTEC, 15));
      return { prim, piny, bbox: [-2.5, 0, (n - 1) * ROZTEC + 2.5, 15] };
    },
  },
  rele: {
    nazev: "Cívka relé / stykače", skupina: "Přístroje", vychozi: { ozn: "KA", vyrobce: "", typ: "" },
    kresli: () => ({ prim: [L(0, 0, 0, 4), R(-3.5, 4, 3.5, 9), L(0, 9, 0, 13)], piny: [[0, 0], [0, 13]], bbox: [-3.5, 0, 3.5, 13] }),
  },
  kontaktZ: {
    nazev: "Kontakt spínací", skupina: "Přístroje", vychozi: { ozn: "KA", vyrobce: "", typ: "" },
    kresli: () => ({ prim: kontakt(0, 12), piny: [[0, 0], [0, 12]], bbox: [-3.5, 0, 1, 12] }),
  },
  kontaktV: {
    nazev: "Kontakt rozpínací", skupina: "Přístroje", vychozi: { ozn: "KA", vyrobce: "", typ: "" },
    kresli: () => ({ prim: [L(0, 0, 0, 3.4), L(0, 8.6, 0, 12), L(0, 8.6, 1.6, 3.2), L(0, 3.4, 2, 3.4)], piny: [[0, 0], [0, 12]], bbox: [-1, 0, 2.5, 12] }),
  },
  elektromer: {
    nazev: "Elektroměr", skupina: "Měření a zdroje", vychozi: { ozn: "PJ", popis: "" },
    kresli: () => ({ prim: [L(0, 0, 0, 3), R(-5, 3, 5, 15), T(0, 10, 2.6, "kWh"), L(0, 15, 0, 18)], piny: [[0, 0], [0, 18]], bbox: [-5, 0, 5, 18] }),
  },
  hdo: {
    nazev: "Přijímač HDO", skupina: "Měření a zdroje", vychozi: { ozn: "HDO", popis: "" },
    kresli: () => ({ prim: [L(0, 0, 0, 3), R(-6, 3, 6, 13), T(0, 9.3, 2.6, "HDO"), L(0, 13, 0, 16)], piny: [[0, 0], [0, 16]], bbox: [-6, 0, 6, 16] }),
  },
  stridac: {
    nazev: "Střídač", skupina: "Měření a zdroje", vychozi: { ozn: "GU", P: 3, popis: "", vyrobce: "", typ: "" },
    kresli: () => ({
      prim: [R(-9, 0, 9, 18), L(-9, 18, 9, 0), T(-4.5, 7, 3, "DC"), T(4.5, 15, 3, "AC"), L(-7, 3.2, -2, 3.2), L(2, 13.8, 7, 13.8)],
      piny: [[-9, 6], [-9, 12], [9, 9], [0, 0], [0, 18]], bbox: [-9, 0, 9, 18],
    }),
  },
  fv: {
    nazev: "FV pole", skupina: "Měření a zdroje", vychozi: { ozn: "FV", pocet: 6, Wp: 475, popis: "" },
    kresli: () => ({
      prim: [R(-8, 0, 8, 8), PL([[-6.5, 1.8], [-6.5, 6.2], [-3, 4]], true), L(-3, 1.8, -3, 6.2), T(2.5, 6, 4.2, "FV")],
      piny: [[-3, 8], [3, 8]], bbox: [-8, 0, 8, 8],
    }),
  },
  baterie: {
    nazev: "Baterie", skupina: "Měření a zdroje", vychozi: { ozn: "GB", kWh: 10, popis: "" },
    kresli: () => ({ prim: [L(0, 0, 0, 6), L(-4.5, 6, 4.5, 6), L(-2, 7.6, 2, 7.6, "plna", 0.5), L(0, 7.6, 0, 13.6), T(3.8, 4.8, 2.2, "+")], piny: [[0, 0], [0, 13.6]], bbox: [-4.5, 0, 4.5, 13.6] }),
  },
  zdroj: {
    nazev: "Napájení (síť)", skupina: "Měření a zdroje", vychozi: { ozn: "", popis: "3PEN ~50 Hz 230/400 V TN-C" },
    kresli: () => ({ prim: [C(0, 5, 5), T(0, 6.6, 4, "~"), L(0, 10, 0, 14)], piny: [[0, 14]], bbox: [-5, 0, 5, 14] }),
  },
  svitidlo: {
    nazev: "Spotřebič (kruh s křížem)", skupina: "Spotřebiče", vychozi: { ozn: "E", P: 2, popis: "" },
    kresli: () => {
      const r = 4.5, c = 3 + r, k = r * 0.7071;
      return { prim: [L(0, 0, 0, 3), C(0, c, r), L(-k, c - k, k, c + k), L(-k, c + k, k, c - k)], piny: [[0, 0], [0, c + r]], bbox: [-r, 0, r, c + r] };
    },
  },
  topne: {
    nazev: "Topné těleso", skupina: "Spotřebiče", vychozi: { ozn: "EH", P: 2, popis: "" },
    kresli: () => {
      const z = [[0, 4]]; for (let i = 0; i < 6; i++) z.push([i % 2 ? -2.2 : 2.2, 5 + i * 1.4]); z.push([0, 13.4]);
      return { prim: [L(0, 0, 0, 3), R(-4, 3, 4, 14.4), PL(z, false), L(0, 14.4, 0, 17)], piny: [[0, 0], [0, 17]], bbox: [-4, 0, 4, 17] };
    },
  },
  motor: {
    nazev: "Motor / TČ", skupina: "Spotřebiče", vychozi: { ozn: "M", P: 3, popis: "", faze: 3 },
    kresli: (v) => ({ prim: [L(0, 0, 0, 3), C(0, 9, 6), T(0, 9.6, 4.2, "M"), T(0, 13, 2.2, (+v.faze || 3) === 1 ? "1~" : "3~")], piny: [[0, 0]], bbox: [-6, 0, 6, 15] }),
  },
  zasuvka: {
    nazev: "Zásuvka", skupina: "Spotřebiče", vychozi: { ozn: "XS", P: 2, popis: "" },
    kresli: () => ({ prim: [L(0, 0, 0, 5), oblouk(0, 5, 4, 0, Math.PI), L(-4, 5, 4, 5), L(0, 9, 0, 11)], piny: [[0, 0]], bbox: [-4, 0, 4, 11] }),
  },
  spotrebic: {
    nazev: "Spotřebič obecný", skupina: "Spotřebiče", vychozi: { ozn: "", P: 2, zkratka: "TČ", popis: "" },
    kresli: (v) => ({ prim: [L(0, 0, 0, 3), R(-6, 3, 6, 13), T(0, 9.4, 3, v.zkratka || "")], piny: [[0, 0], [0, 13]], bbox: [-6, 0, 6, 13] }),
  },
  uzemneni: {
    nazev: "Uzemnění", skupina: "Spojení", vychozi: { ozn: "" },
    kresli: () => ({ prim: [L(0, 0, 0, 4), L(-4, 4, 4, 4), L(-2.6, 5.4, 2.6, 5.4), L(-1.2, 6.8, 1.2, 6.8)], piny: [[0, 0]], bbox: [-4, 0, 4, 7] }),
  },
  svorka: {
    nazev: "Svorka", skupina: "Spojení", vychozi: { ozn: "X" },
    kresli: () => ({ prim: [C(0, 0, 0.9)], piny: [[0, 0]], bbox: [-1, -1, 1, 1] }),
  },
  svorkovnice: {
    nazev: "Přípojnice PE/N", skupina: "Spojení", vychozi: { ozn: "PE", delka: 40 },
    kresli: (v) => { const d = +v.delka || 40; return { prim: [L(0, 0, d, 0, "plna", 0.7)], piny: Array.from({ length: Math.floor(d / 5) + 1 }, (_, i) => [i * 5, 0]), bbox: [0, -1, d, 1] }; },
  },
};

export const SKUPINY = ["Přístroje", "Měření a zdroje", "Spotřebiče", "Spojení"];

// ── transformace (otočení po 90° kolem počátku značky, pak posun) ──
export function bodPrvku(p, [x, y]) {
  const r = ((p.rot || 0) % 360 + 360) % 360;
  let X = x, Y = y;
  if (r === 90) { X = -y; Y = x; } else if (r === 180) { X = -x; Y = -y; } else if (r === 270) { X = y; Y = -x; }
  if (p.zrcadlo) X = -X;
  return [p.x + X, p.y + Y];
}

function preneseni(p, pr) {
  const b = (pt) => bodPrvku(p, pt);
  if (pr.k === "l") { const [a, c] = [b([pr.p[0], pr.p[1]]), b([pr.p[2], pr.p[3]])]; return { ...pr, p: [...a, ...c] }; }
  if (pr.k === "pl") return { ...pr, b: pr.b.map(b) };
  if (pr.k === "c") { const [x, y] = b([pr.x, pr.y]); return { ...pr, x, y }; }
  if (pr.k === "t") { const [x, y] = b([pr.x, pr.y - pr.h * 0.35]); return { ...pr, x, y: y + pr.h * 0.35 }; }
  return pr;
}

const fmtCislo = (x) => String(x ?? "").replace(".", ",");

// Řádky popisku přístroje (pod označením)
export function radkyPopisku(p) {
  const v = p.v || {}, o = [];
  if (v.vyrobce || v.typ) o.push([v.vyrobce, v.typ].filter(Boolean).join(" "));
  if (p.typ === "jistic" && v.In) o.push(`${v.char || ""}${v.In}/${v.poly || 1}`);
  if (p.typ === "pojistka" && v.In) o.push(`${v.char || "gG"} ${v.In} A`);
  if ((p.typ === "chranic" || p.typ === "jisticChranic") && v.In) o.push(`${p.typ === "jisticChranic" ? (v.char || "B") : ""}${v.In}/${v.poly || 2}/${String((+v.IdN || 30) / 1000).replace("0.", "0,")}-${v.typRcd || "A"}`);
  if (p.typ === "odpinac" && v.In) o.push(`${v.In} A, ${v.poly || 1}p`);
  if (p.typ === "stykac" && v.In) o.push(`${v.In} A AC1, ${v.poly || 1}Z`);
  if (p.typ === "prepinac" && v.In) o.push(`${v.In}A, ${v.poly || 1}p přepínač`);
  if (p.typ === "svodic" && v.typSpd) o.push(`SPD ${v.typSpd}`);
  if (p.typ === "fv" && v.pocet) o.push(`${v.pocet} × ${v.Wp || ""} Wp = ${fmtCislo(((+v.pocet || 0) * (+v.Wp || 0)) / 1000)} kWp`);
  if (p.typ === "stridac" && v.P) o.push(`${fmtCislo(v.P)} kW`);
  if (p.typ === "baterie" && v.kWh) o.push(`${fmtCislo(v.kWh)} kWh`);
  if (["svitidlo", "topne", "motor", "zasuvka", "spotrebic"].includes(p.typ) && v.P) o.push(`${fmtCislo(v.P)} kW`);
  for (const r of String(v.popis || "").split("\n")) if (r.trim()) o.push(r.trim());
  return o;
}

// Primitivy jednoho prvku na listu (značka + popisek)
export function kresliPrvek(p) {
  const z = ZNACKY[p.typ];
  if (!z) return { prim: [], piny: [], bbox: [p.x, p.y, p.x, p.y] };
  const { prim, piny, bbox } = z.kresli({ ...z.vychozi, ...(p.v || {}) });
  const out = prim.map(pr => ({ ...preneseni(p, pr), vr: "ZNACKY" }));
  const rohy = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]].map(b => bodPrvku(p, b));
  const xs = rohy.map(r => r[0]), ys = rohy.map(r => r[1]);
  const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  // popisek vpravo od značky (nebo vlevo), posun lx/ly
  const v = p.v || {};
  if (!v.skrytPopis) {
    const vlevo = v.popisVlevo;
    const x = (vlevo ? bb[0] - 1.5 : bb[2] + 1.5) + (+v.lx || 0);
    let y = bb[1] + 3.5 + (+v.ly || 0);
    const a = vlevo ? "r" : "l";
    if (v.ozn) { out.push({ k: "t", x, y, h: 3.2, t: v.ozn, a, rot: 0, vr: "POPISY" }); y += 3; }
    for (const r of radkyPopisku(p)) { out.push({ k: "t", x, y, h: 1.9, t: r, a, rot: 0, vr: "POPISY" }); y += 2.5; }
  }
  return { prim: out, piny: piny.map(b => bodPrvku(p, b)), bbox: bb };
}

// ── vodiče ──
export const STYLY_VODICE = {
  faze: { nazev: "Fázový / obecný", s: "plna", w: 0.35, vr: "VODICE" },
  pe: { nazev: "PE (čerchovaný)", s: "cerch", w: 0.35, vr: "PE" },
  n: { nazev: "N (čárkovaný)", s: "carka", w: 0.35, vr: "VODICE" },
  ovladani: { nazev: "Ovládací (tenký)", s: "plna", w: 0.18, vr: "VODICE" },
  pripojnice: { nazev: "Přípojnice (tlustá)", s: "plna", w: 0.9, vr: "VODICE" },
  mech: { nazev: "Mechanická vazba", s: "carka", w: 0.18, vr: "VODICE" },
};

export function popisKabelu(k) {
  if (!k) return "";
  const s = k.zil ? `${k.zil}x${fmtCislo(k.prurez)}` : `1x${fmtCislo(k.prurez)}`;
  return [k.typ, k.prurez ? s : ""].filter(Boolean).join(" ");
}

export function kresliVodic(w) {
  const st = STYLY_VODICE[w.styl] || STYLY_VODICE.faze, out = [];
  for (let i = 1; i < w.b.length; i++) out.push({ k: "l", p: [...w.b[i - 1], ...w.b[i]], s: st.s, w: st.w, vr: st.vr });
  // popis kabelu u nejdelšího úseku
  const text = w.popis || (w.kabel?.zobrazit !== false ? popisKabelu(w.kabel) : "");
  if (text && w.b.length > 1) {
    let best = 1, delka = -1;
    for (let i = 1; i < w.b.length; i++) { const d = Math.hypot(w.b[i][0] - w.b[i - 1][0], w.b[i][1] - w.b[i - 1][1]); if (d > delka) { delka = d; best = i; } }
    const [a, b] = [w.b[best - 1], w.b[best]];
    const svisly = Math.abs(a[0] - b[0]) < Math.abs(a[1] - b[1]);
    const mx = (a[0] + b[0]) / 2 + (+w.lx || 0), my = (a[1] + b[1]) / 2 + (+w.ly || 0);
    out.push(svisly ? { k: "t", x: mx - 1, y: my, h: 1.9, t: text, a: "c", rot: 90, vr: "POPISY" } : { k: "t", x: mx, y: my - 1, h: 1.9, t: text, a: "c", rot: 0, vr: "POPISY" });
  }
  return out;
}

// Body spojení: konec vodiče, který leží uvnitř úseku jiného vodiče (T‑spoj)
export function spojovaciBody(vodice) {
  const out = [];
  const naUseku = ([x, y], [a, b], [c, d]) => {
    const e = 0.01;
    if (Math.abs(a - c) < e && Math.abs(x - a) < e) return y > Math.min(b, d) + e && y < Math.max(b, d) - e;
    if (Math.abs(b - d) < e && Math.abs(y - b) < e) return x > Math.min(a, c) + e && x < Math.max(a, c) - e;
    return false;
  };
  for (const w of vodice) {
    for (const kon of [w.b[0], w.b[w.b.length - 1]]) {
      if (!kon) continue;
      for (const u of vodice) {
        if (u === w) continue;
        let hit = false;
        for (let i = 1; i < u.b.length && !hit; i++) hit = naUseku(kon, u.b[i - 1], u.b[i]);
        if (hit) { out.push({ k: "c", x: kon[0], y: kon[1], r: 0.7, f: true, vr: "VODICE" }); break; }
      }
    }
  }
  return out;
}

// ── rozvaděč (čárkovaný rámeček s názvem) ──
export function kresliRamecek(r) {
  const out = [{ k: "pl", b: [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]], z: true, s: r.styl === "plna" ? "plna" : "carka", w: 0.35, vr: "ROZVADECE" }];
  if (r.nazev) out.push({ k: "t", x: r.x + r.w / 2, y: r.y - 1.5, h: 2.8, t: r.nazev, a: "c", rot: 0, vr: "ROZVADECE" });
  let y = r.y + 4;
  for (const t of String(r.popis || "").split("\n")) if (t.trim()) { out.push({ k: "t", x: r.x + r.w + 2, y, h: 1.9, t: t.trim(), a: "l", rot: 0, vr: "POPISY" }); y += 2.6; }
  return out;
}

export function kresliText(t) {
  return [{ k: "t", x: t.x, y: t.y, h: +t.h || 2.5, t: t.t || "", a: t.a || "l", rot: t.rot || 0, vr: "TEXT" }];
}

// ── rámeček listu a razítko ──
export function kresliList(projekt, firma) {
  const f = FORMATY[projekt.format] || FORMATY.A4;
  const ml = 10, m = 5, out = [];
  const x0 = ml, y0 = m, x1 = f.w - m, y1 = f.h - m;
  out.push({ k: "pl", b: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z: true, s: "plna", w: 0.5, vr: "RAMEC" });
  out.push(...razitko(x1 - 180, y1 - 48, projekt.razitko || {}, firma, projekt.format));
  return out;
}

function razitko(X, Y, r, firma, format) {
  const o = [], l = (a, b, c, d, w = 0.25) => o.push({ k: "l", p: [X + a, Y + b, X + c, Y + d], s: "plna", w, vr: "RAZITKO" });
  const t = (x, y, h, s, a = "l") => s && o.push({ k: "t", x: X + x, y: Y + y, h, t: String(s), a, rot: 0, vr: "RAZITKO" });
  const W = 180, H = 48;
  l(0, 0, W, 0, 0.5); l(0, 0, 0, H, 0.5); l(W, 0, W, H, 0.5); l(0, H, W, H, 0.5);
  // pravý sloupec
  l(135, 0, 135, H, 0.5);
  const radky = [["IČO", firma?.ico], ["stupeň dok.", r.stupen], ["číslo zak.", r.cisloZak], ["formát", r.formatu || `1 ${format || "A4"}`], ["datum", r.datum], ["měřítko", r.meritko]];
  radky.forEach(([n, v], i) => {
    const y = i * 6;
    if (i) l(135, y, W, y);
    t(136, y + 4.1, 1.7, n);
    t(167.5, y + 4.3, 2.4, v, "c");
  });
  l(155, 6, 155, 36); l(135, 36, W, 36, 0.5);
  l(150, 36, 150, H); l(165, 36, 165, H);
  t(136, 38.6, 1.6, "č. kopie"); t(151, 38.6, 1.6, "část"); t(166, 38.6, 1.6, "č. příl.");
  t(142.5, 45, 3, r.kopie, "c"); t(157.5, 45, 3, r.cast, "c"); t(172.5, 46, 5, r.priloha, "c");
  // horní pás
  l(0, 16, 135, 16, 0.5); l(20, 0, 20, 16);
  t(10, 10.5, 6, r.zkratka || inicialy(r.projektant), "c");
  t(22, 5, 2.8, [firma?.name, [firma?.addressLine, firma?.city].filter(Boolean).join(", ")].filter(Boolean).join(" "));
  l(20, 7.5, 135, 7.5);
  [58, 96].forEach(x => l(x, 7.5, x, 16));
  [["PROJEKTANT", r.projektant, 39], ["VYPRACOVAL", r.vypracoval, 77], ["KONTROLOVAL", r.kontroloval, 115.5]].forEach(([n, v, x]) => { t(x, 10.4, 1.7, n, "c"); t(x, 14.6, 2.2, v, "c"); });
  l(20, 11.4, 135, 11.4, 0.18);
  // střední pás
  l(0, 34, 135, 34, 0.5);
  t(67.5, 21, 2.6, [r.investor, r.adresa].filter(Boolean).join(", "), "c");
  t(3, 27, 3.4, r.druhVykresu);
  t(3, 32, 2.4, r.podnazev);
  // spodní pás
  t(3, 40.5, 3.6, r.nazevVykresu);
  t(3, 46, 3.6, r.kod);
  return o;
}

const inicialy = (s) => String(s || "").split(/\s+/).filter(Boolean).map(x => x[0].toUpperCase() + ".").join("");

// ── celý výkres jako primitivy ──
export function vsechnyPrimitivy(projekt, firma) {
  const out = [...kresliList(projekt, firma)];
  for (const r of projekt.ramecky || []) out.push(...kresliRamecek(r));
  for (const w of projekt.vodice || []) out.push(...kresliVodic(w));
  out.push(...spojovaciBody(projekt.vodice || []));
  for (const p of projekt.prvky || []) out.push(...kresliPrvek(p).prim);
  for (const t of projekt.texty || []) out.push(...kresliText(t));
  return out;
}

// Odhad šířky textu (mm) — pro výběr a zarovnání tam, kde není měření písma
export const sirkaTextu = (t, h) => String(t).length * h * 0.56;

// Kolik zabírá text (osa x/y) — pro klepnutí do textu v editoru
export function rozmerTextu(pr) {
  const w = sirkaTextu(pr.t, pr.h);
  const dx = pr.a === "c" ? -w / 2 : pr.a === "r" ? -w : 0;
  if (pr.rot === 90) return [pr.x - pr.h, pr.y - dx - w, pr.x, pr.y - dx];
  return [pr.x + dx, pr.y - pr.h, pr.x + dx + w, pr.y + pr.h * 0.25];
}

export const novyId = () => Math.random().toString(36).slice(2, 10);
