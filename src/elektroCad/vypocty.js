// ─── Elektro CAD: výpočty nad schématem ──────────────────────────────────────
// Vývod = vodič s vyplněným kabelem (typ, průřez, délka, uložení, zátěž) a
// přiřazeným jisticím přístrojem. Výpočty:
//  • dovolený proud kabelu Iz (ČSN 33 2000-5-52, tab. B.52.2 až B.52.5, Cu/Al PVC 70 °C,
//    přepočet teplotou okolí a souběhem; solární kabely 90 °C ve vzduchu)
//  • koordinace Ib ≤ In ≤ Iz (u jističů a pojistek gG I2 ≤ 1,45·Iz pokryto In ≤ Iz)
//  • úbytek napětí v úseku i od napájecího bodu (řetězení přes „napájeno z“)
//  • impedance poruchové smyčky Zs, jednofázový zkrat Ik1 a samočinné
//    odpojení v soustavě TN (ČSN 33 2000-4-41: 0,4 s koncové obvody ≤ 32 A, jinak 5 s)
//  • bilance příkonu (instalovaný Pi, soudobost β, soudobý Pp, výpočtový proud)

export const ULOZENI = {
  A1: "A1 – izolované vodiče v trubce v tepelně izolační stěně",
  A2: "A2 – kabel v trubce v tepelně izolační stěně",
  B1: "B1 – vodiče v trubce na/ve zdi",
  B2: "B2 – kabel v trubce / liště na zdi",
  C: "C – kabel přímo na/ve zdi (pod omítkou)",
  D: "D – kabel v zemi (v chráničce)",
  E: "E – kabel volně ve vzduchu / na roštu",
  SOLAR: "Solární kabel 90 °C ve vzduchu",
};

export const PRUREZY = [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];

// Iz [A] pro Cu PVC 70 °C, 30 °C (v zemi 20 °C): [2 zatížené žíly, 3 zatížené žíly]
const IZ_CU = {
  A1: { 1: [11, 10.5], 1.5: [14.5, 13.5], 2.5: [19.5, 18], 4: [26, 24], 6: [34, 31], 10: [46, 42], 16: [61, 56], 25: [80, 73], 35: [99, 89], 50: [119, 108], 70: [151, 136], 95: [182, 164], 120: [210, 188] },
  A2: { 1: [11, 10], 1.5: [14, 13], 2.5: [18.5, 17.5], 4: [25, 23], 6: [32, 29], 10: [43, 39], 16: [57, 52], 25: [75, 68], 35: [92, 83], 50: [110, 99], 70: [139, 125], 95: [167, 150], 120: [192, 172] },
  B1: { 1: [13.5, 12], 1.5: [17.5, 15.5], 2.5: [24, 21], 4: [32, 28], 6: [41, 36], 10: [57, 50], 16: [76, 68], 25: [101, 89], 35: [125, 110], 50: [151, 134], 70: [192, 171], 95: [232, 207], 120: [269, 239] },
  B2: { 1: [13, 11.5], 1.5: [16.5, 15], 2.5: [23, 20], 4: [30, 27], 6: [38, 34], 10: [52, 46], 16: [69, 62], 25: [90, 80], 35: [111, 99], 50: [133, 118], 70: [168, 149], 95: [201, 179], 120: [232, 206] },
  C: { 1: [15, 13.5], 1.5: [19.5, 17.5], 2.5: [27, 24], 4: [36, 32], 6: [46, 41], 10: [63, 57], 16: [85, 76], 25: [112, 96], 35: [138, 119], 50: [168, 144], 70: [213, 184], 95: [258, 223], 120: [299, 259] },
  D: { 1: [18, 15], 1.5: [22, 18], 2.5: [29, 24], 4: [37, 30], 6: [46, 38], 10: [60, 50], 16: [78, 64], 25: [99, 82], 35: [119, 98], 50: [140, 116], 70: [173, 143], 95: [204, 169], 120: [231, 192] },
  E: { 1: [17, 14.5], 1.5: [22, 18.5], 2.5: [30, 25], 4: [40, 34], 6: [51, 43], 10: [70, 60], 16: [94, 80], 25: [119, 101], 35: [148, 126], 50: [180, 153], 70: [232, 196], 95: [282, 238], 120: [328, 276] },
  SOLAR: { 1.5: [30, 30], 2.5: [41, 41], 4: [55, 55], 6: [70, 70], 10: [98, 98], 16: [132, 132], 25: [176, 176], 35: [218, 218] },
};
const AL_KOEF = 0.78; // Al vůči Cu (orientačně, průřezy ≥ 16 mm²)

// Přepočet teplotou okolí (PVC 70 °C; v zemi vztaženo k 20 °C)
const KT_VZDUCH = { 10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71, 55: 0.61, 60: 0.5 };
const KT_ZEM = { 10: 1.1, 15: 1.05, 20: 1, 25: 0.95, 30: 0.89, 35: 0.84, 40: 0.77, 45: 0.71, 50: 0.63 };
const KT_SOLAR = { 30: 1, 35: 1, 40: 1, 45: 0.96, 50: 0.92, 55: 0.87, 60: 0.84, 70: 0.75 };
// Souběh (svazek na povrchu / v trubce), tab. B.52.17
const KS = { 1: 1, 2: 0.8, 3: 0.7, 4: 0.65, 5: 0.6, 6: 0.57, 7: 0.54, 8: 0.52, 9: 0.5, 12: 0.45, 16: 0.41, 20: 0.38 };

const tabulka = (t, k) => {
  const klice = Object.keys(t).map(Number).sort((a, b) => a - b);
  const x = Number(k);
  if (x <= klice[0]) return t[klice[0]];
  for (let i = 1; i < klice.length; i++) if (x <= klice[i]) { const a = klice[i - 1], b = klice[i]; return t[a] + ((t[b] - t[a]) * (x - a)) / (b - a); }
  return t[klice[klice.length - 1]];
};

export function dovolenyProud(k) {
  const ul = IZ_CU[k.ulozeni] ? k.ulozeni : "C";
  const radek = IZ_CU[ul][k.prurez];
  if (!radek) return null;
  const zatizene = k.soustava === "3f" ? 1 : 0;
  let iz = radek[zatizene];
  if (k.material === "Al") iz *= AL_KOEF;
  const kt = tabulka(ul === "SOLAR" ? KT_SOLAR : ul === "D" ? KT_ZEM : KT_VZDUCH, k.teplota ?? (ul === "D" ? 20 : 30));
  const ks = tabulka(KS, k.soubeh || 1);
  return { iz0: iz, kt, ks, iz: iz * kt * ks };
}

// Vybavovací proud Ia pro samočinné odpojení
// Jističe: B 5·In, C 10·In, D 20·In (okamžitá spoušť → splní 0,4 s i 5 s)
// Pojistky gG: orientační Ia pro 0,4 s a 5 s z vypínacích charakteristik
const GG_04 = { 2: 16, 4: 32, 6: 47, 10: 82, 13: 98, 16: 107, 20: 145, 25: 180, 32: 265, 40: 310, 50: 460, 63: 550, 80: 750, 100: 1000, 125: 1350, 160: 1700 };
const GG_5 = { 2: 9, 4: 19, 6: 28, 10: 47, 13: 56, 16: 65, 20: 85, 25: 110, 32: 150, 40: 190, 50: 250, 63: 320, 80: 425, 100: 580, 125: 715, 160: 950 };
export function vybavovaciProud(pristroj, cas04) {
  if (!pristroj) return null;
  const In = +pristroj.v?.In || 0, ch = (pristroj.v?.char || "B").toUpperCase();
  if (!In) return null;
  if (pristroj.typ === "pojistka" || ch === "GG") return tabulka(cas04 ? GG_04 : GG_5, In);
  return In * ({ B: 5, C: 10, D: 20, K: 14, Z: 3 }[ch] || 5);
}

const RHO = { Cu: 0.0225, Al: 0.036 }; // Ω·mm²/m při provozní teplotě (pro úbytek i smyčku)
const X_KM = 0.08; // Ω/km reaktance kabelu

export function proudVyvodu(k, nap) {
  if (+k.I > 0) return +k.I;
  const P = (+k.P || 0) * 1000, cos = +k.cos || 1;
  if (!P) return 0;
  if (k.soustava === "DC") return P / (+k.Udc || +nap.Udc || 400);
  if (k.soustava === "3f") return P / (Math.sqrt(3) * (+nap.Us || 400) * cos);
  return P / ((+nap.U0 || 230) * cos);
}

// Spočte všechny vývody; vrací pole výsledků (pořadí jako vodiče)
export function spocitejVyvody(projekt) {
  const nap = projekt.napajeni || {};
  const vodice = (projekt.vodice || []).filter(w => w.kabel && +w.kabel.prurez > 0);
  const podleId = Object.fromEntries(vodice.map(w => [w.id, w]));
  const prvky = Object.fromEntries((projekt.prvky || []).map(p => [p.id, p]));
  const cache = {};
  const spocti = (w, hloubka = 0) => {
    if (cache[w.id]) return cache[w.id];
    const k = { soustava: "1f", material: "Cu", ulozeni: "C", teplota: 30, soubeh: 1, cos: 1, delka: 0, ...w.kabel };
    const mat = k.material === "Al" ? "Al" : "Cu";
    const S = +k.prurez, Spe = +k.prurezPe || S, L = +k.delka || 0;
    const Ib = proudVyvodu(k, nap);
    const iz = dovolenyProud(k);
    const pristroj = prvky[k.jisticId] || null;
    const In = +pristroj?.v?.In || 0;
    const R1 = (RHO[mat] * L) / S; // Ω jednoho vodiče
    const cos = k.soustava === "DC" ? 1 : +k.cos || 1, sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    const X1 = k.soustava === "DC" ? 0 : (X_KM / 1000) * L;
    let dU, Un;
    if (k.soustava === "3f") { dU = Math.sqrt(3) * Ib * (R1 * cos + X1 * sin); Un = +nap.Us || 400; }
    else if (k.soustava === "DC") { dU = 2 * Ib * R1; Un = +k.Udc || +nap.Udc || 400; }
    else { dU = 2 * Ib * (R1 * cos + X1 * sin); Un = +nap.U0 || 230; }
    const dUp = Un ? (100 * dU) / Un : 0;
    const rodic = k.predchoziId && podleId[k.predchoziId] && hloubka < 30 ? spocti(podleId[k.predchoziId], hloubka + 1) : null;
    const dUcelk = dUp + (rodic && rodic.soustava !== "DC" && k.soustava !== "DC" ? rodic.dUcelk : rodic && k.soustava === "DC" && rodic.soustava === "DC" ? rodic.dUcelk : 0);
    // smyčka (jen AC TN): fáze + PE
    let Zs = null, Ik1 = null, Ia = null, odpojeni = null, casLimit = null;
    if (k.soustava !== "DC") {
      const Zprev = rodic && rodic.Zs != null ? rodic.Zs : +nap.Zs || 0.4;
      const Rs = (RHO[mat] * L) / S + (RHO[mat] * L) / Spe;
      Zs = Math.hypot(Rs, 2 * X1) + Zprev;
      Ik1 = (0.95 * (+nap.U0 || 230)) / Zs;
      const koncovy = k.koncovy ?? (In > 0 && In <= 32);
      casLimit = koncovy ? 0.4 : 5;
      Ia = vybavovaciProud(pristroj, koncovy);
      odpojeni = Ia ? Ik1 >= Ia : null;
    }
    const maxDu = k.soustava === "DC" ? +nap.maxDuDc || 1 : +nap.maxDu || 3;
    const r = {
      id: w.id, nazev: k.nazev || popisVyvodu(w, pristroj), soustava: k.soustava, kabel: k, S, L, Ib, In, Iz: iz?.iz ?? null, iz,
      pristroj, koordinace: In && iz ? Ib <= In + 1e-9 && In <= iz.iz + 1e-9 : iz ? Ib <= iz.iz : null,
      dU, dUp, dUcelk, maxDu, uOk: dUcelk <= maxDu + 1e-9, Zs, Ik1, Ia, odpojeni, casLimit,
    };
    r.ok = r.koordinace !== false && r.uOk && r.odpojeni !== false;
    cache[w.id] = r;
    return r;
  };
  return vodice.map(w => spocti(w));
}

function popisVyvodu(w, pristroj) {
  return [pristroj?.v?.ozn, w.kabel?.typ].filter(Boolean).join(" – ") || "Vývod";
}

// Bilance příkonu ze spotřebičů ve schématu (prvky s P) + ruční řádky
export function bilance(projekt) {
  const nap = projekt.napajeni || {};
  const radky = [];
  for (const p of projekt.prvky || []) {
    if (!["svitidlo", "topne", "motor", "zasuvka", "spotrebic"].includes(p.typ)) continue;
    const Pi = +p.v?.P || 0;
    if (!Pi) continue;
    radky.push({ id: p.id, nazev: [p.v?.ozn, p.v?.popis?.split("\n")[0]].filter(Boolean).join(" – ") || p.typ, Pi, beta: p.v?.beta != null && p.v.beta !== "" ? +p.v.beta : 1 });
  }
  for (const r of projekt.bilanceRucne || []) if (+r.Pi) radky.push({ ...r, Pi: +r.Pi, beta: r.beta === "" || r.beta == null ? 1 : +r.beta, rucne: true });
  const Pi = radky.reduce((s, r) => s + r.Pi, 0);
  const PpRadky = radky.reduce((s, r) => s + r.Pi * r.beta, 0);
  const betaC = nap.soudobost === "" || nap.soudobost == null ? 1 : +nap.soudobost;
  const Pp = PpRadky * betaC;
  const cos = +nap.cos || 0.95;
  const Ip3 = (Pp * 1000) / (Math.sqrt(3) * (+nap.Us || 400) * cos);
  const Ip1 = (Pp * 1000) / ((+nap.U0 || 230) * cos);
  const JISTICE = [10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
  const doporuc = (I) => JISTICE.find(j => j >= I) || null;
  return { radky, Pi, Pp, betaC, cos, Ip3, Ip1, jistic3: doporuc(Ip3), jistic1: doporuc(Ip1) };
}

export const cislo = (x, d = 2) => (x == null || Number.isNaN(+x) ? "–" : Number(x).toLocaleString("cs-CZ", { minimumFractionDigits: d, maximumFractionDigits: d }));
