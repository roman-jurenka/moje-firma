// ─── 3D návrh domu — výpočty bez vykreslování ────────────────────────────────
// Dům je kvádr délka × šířka (osa x = délka, osa z = šířka, y nahoru),
// přední stěna je na +z. Střecha se počítá ve vlastní soustavě (hřeben vždy
// podél její osy x) a do světa se otočí o `otoceni` (0/90/180/270°).
// Všechny délky jsou v metrech, úhly ve stupních.

export const STRANY = [
  { id: "predni", nazev: "Přední" },
  { id: "prava", nazev: "Pravá" },
  { id: "zadni", nazev: "Zadní" },
  { id: "leva", nazev: "Levá" },
];

export const TYPY_STRECHY = [
  { id: "sedlova", nazev: "Sedlová" },
  { id: "valbova", nazev: "Valbová / stanová" },
  { id: "polovalba", nazev: "Polovalba" },
  { id: "pultova", nazev: "Pultová" },
  { id: "plocha", nazev: "Plochá" },
];

// Rozestupy svodů a velikost oka mřížové soustavy podle třídy LPS (ČSN EN 62305-3).
export const TRIDY_LPS = {
  I: { svody: 10, oko: 5 },
  II: { svody: 10, oko: 10 },
  III: { svody: 15, oko: 15 },
  IV: { svody: 20, oko: 20 },
};

export const vychoziNavrh = () => ({
  id: "n" + Date.now().toString(36),
  nazev: "Nový návrh",
  zakaznik: "",
  delka: 12,
  sirka: 9,
  vyskaOkapu: 6,
  strecha: "sedlova",
  sklon: 35,
  presah: 0.5,
  otoceni: 0,
  azimutPredni: 180,
  barvaStrechy: "#8b3a2b",
  fotky: {},        // { predni: { data, orez: { l, p, n, d } } } — data je zmenšené JPEG dataURL
  panel: { sirka: 1.134, vyska: 1.762, wp: 450 },
  okrajFve: 0.3,
  mezeraFve: 0.02,
  polovalba: { vyska: 1, hloubka: 1.5 },  // valbička na štítu: svislý pokles od hřebene, délka podél hřebene
  pristavky: [],    // [{ id, typ: "pristresek"|"pristavek", stena, posun, delka, hloubka, vyskaUDomu, vyskaVenku, presah }]
  prekazky: [],     // komín, střešní okno…: { id, typ: "komin"|"okno"|"jina", plocha, u, v, sirka, hloubka, vyska }
  fve: [],          // pole panelů: { id, plocha, u, v, radky, sloupce, orientace: "vysku"|"sirku", naklon }
  hromosvod: { trida: "III", vedeni: [], svody: [], tyce: [], zemnic: true, odstup: 0.5 },
  mereni: [],
  upraveno: new Date().toISOString(),
});

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// ── vektory jako pole [x, y, z] ──
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};

// Rozměry střechy v její soustavě: A = podél hřebene, B = napříč.
export function soustavaStrechy(n) {
  let rot = (((Number(n.otoceni) || 0) % 360) + 360) % 360;
  let kolmo = rot === 90 || rot === 270;
  let A = kolmo ? n.sirka : n.delka;
  let B = kolmo ? n.delka : n.sirka;
  // Valbová střecha má hřeben vždy podél delší strany.
  if (n.strecha === "valbova" && A < B) { rot = (rot + 90) % 360; [A, B] = [B, A]; }
  const th = rad(rot);
  return { A, B, c: Math.cos(th), s: Math.sin(th) };
}

const doSveta = (S, rx, y, rz) => [rx * S.c + rz * S.s, y, -rx * S.s + rz * S.c];
const doStrechy = (S, x, z) => [x * S.c - z * S.s, x * S.s + z * S.c];

// Rozměry polovalby: ve výšce yk se štít „seřízne“ malou valbou, která sahá
// od kraje střechy (včetně přesahu) o hloubku d k hřebeni.
export function rozmeryPolovalby(n, S = soustavaStrechy(n)) {
  const t = Math.tan(rad(n.sklon)) || 1e-6;
  const a = S.A / 2 + Math.max(0, Number(n.presah) || 0);
  const yr = n.vyskaOkapu + (S.B / 2) * t;
  const hv = Math.max(0.1, Math.min(Number(n.polovalba?.vyska) || 1, (S.B / 2) * t * 0.9));
  const d = Math.max(0.2, Math.min(Number(n.polovalba?.hloubka) || 1.5, a * 0.9));
  return { a, yr, hv, d, yk: yr - hv, k: hv / d, e: a - d, zc: hv / t };
}

// Výška střechy domu v soustavě střechy (platí i pro přesah).
function vyskaDomu(n, S, rx, rz) {
  const H = n.vyskaOkapu, t = Math.tan(rad(n.sklon));
  switch (n.strecha) {
    case "sedlova": return H + (S.B / 2 - Math.abs(rz)) * t;
    case "valbova": return H + Math.min(S.B / 2 - Math.abs(rz), S.A / 2 - Math.abs(rx)) * t;
    case "polovalba": {
      const pv = rozmeryPolovalby(n, S);
      return Math.min(H + (S.B / 2 - Math.abs(rz)) * t, pv.yk + (pv.a - Math.abs(rx)) * pv.k);
    }
    case "pultova": return H + (S.B / 2 - rz) * t;
    default: return H;
  }
}

// Stěny domu bez výšek: start → konec zleva doprava při pohledu zvenku.
function zakladSten(n) {
  const L = n.delka / 2, W = n.sirka / 2;
  return [
    { id: "predni", a: [-L, W], b: [L, W], ven: [0, 0, 1] },
    { id: "prava", a: [L, W], b: [L, -W], ven: [1, 0, 0] },
    { id: "zadni", a: [L, -W], b: [-L, -W], ven: [0, 0, -1] },
    { id: "leva", a: [-L, -W], b: [-L, W], ven: [-1, 0, 0] },
  ].map(d => {
    const delka = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
    return { ...d, delka, dir: [(d.b[0] - d.a[0]) / delka, (d.b[1] - d.a[1]) / delka] };
  });
}

// Přístřešky / přístavky u stěn domu (starší návrhy měly jen jeden: n.pristavek).
export const seznamPristavku = (n) => (Array.isArray(n.pristavky)
  ? n.pristavky
  : n.pristavek?.zapnuto ? [{ ...n.pristavek, id: "p1" }] : []);

export const pristavky = (n) => seznamPristavku(n).map((pr, i) => ({ ...geomPristavku(n, pr), id: pr.id, poradi: i + 1 }));

// Přístřešek / přístavek u stěny domu s pultovou střechou spadající od domu.
function geomPristavku(n, pr) {
  const st = zakladSten(n).find(x => x.id === pr.stena) || zakladSten(n)[3];
  // může přesahovat rohy stěny (posun záporný = začíná před levým rohem)
  const s0 = Math.max(-30, Math.min(st.delka - 0.5, Number(pr.posun) || 0));
  const s1 = Math.max(s0 + 0.5, s0 + (Number(pr.delka) || 3));
  const D = Math.max(0.5, Number(pr.hloubka) || 3);
  const p2 = Math.max(0, Number(pr.presah) || 0);
  const yIn = Math.max(1, Number(pr.vyskaUDomu) || 3);
  const yOut = Math.max(1, Math.min(yIn, Number(pr.vyskaVenku) || yIn));
  const spad = (yIn - yOut) / D;
  const vyska = (dist) => yIn - dist * spad;
  const bod = (si, dist) => [st.a[0] + st.dir[0] * si + st.ven[0] * dist, st.a[1] + st.dir[1] * si + st.ven[2] * dist];
  const mistni = (x, z) => [(x - st.a[0]) * st.dir[0] + (z - st.a[1]) * st.dir[1], (x - st.a[0]) * st.ven[0] + (z - st.a[1]) * st.ven[2]];
  return { st, s0, s1, D, p2, yIn, yOut, vyska, bod, mistni, typ: pr.typ || "pristresek" };
}

// Výška povrchu střechy nad bodem (x, z) ve světě — platí i pro přesah.
export function vyskaStrechy(n, x, z) {
  // mimo střechu domu (včetně přesahu) může být střecha přístřešku
  const p = Math.max(0, Number(n.presah) || 0);
  if (Math.abs(x) > n.delka / 2 + p + 1e-6 || Math.abs(z) > n.sirka / 2 + p + 1e-6) {
    let y = null;
    for (const pr of pristavky(n)) {
      const [si, dist] = pr.mistni(x, z);
      if (si >= pr.s0 - pr.p2 - 1e-6 && si <= pr.s1 + pr.p2 + 1e-6 && dist >= -1e-6 && dist <= pr.D + pr.p2 + 1e-6) y = Math.max(y ?? -Infinity, pr.vyska(dist));
    }
    if (y != null) return y;
  }
  const S = soustavaStrechy(n);
  const [rx, rz] = doStrechy(S, x, z);
  return vyskaDomu(n, S, rx, rz);
}

export const vyskaHrebene = (n) => {
  const S = soustavaStrechy(n), t = Math.tan(rad(n.sklon));
  if (n.strecha === "plocha") return n.vyskaOkapu;
  if (n.strecha === "pultova") return n.vyskaOkapu + S.B * t;
  return n.vyskaOkapu + (S.B / 2) * t;
};

// Opačný výpočet: z výšky hřebene sklon.
export const sklonZHrebene = (n, hreben) => {
  const S = soustavaStrechy(n);
  const run = n.strecha === "pultova" ? S.B : S.B / 2;
  return Math.max(0, Math.min(75, deg(Math.atan(Math.max(0, hreben - n.vyskaOkapu) / run))));
};

function smerNaText(az) {
  const t = ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"];
  return t[Math.round((((az % 360) + 360) % 360) / 45) % 8];
}

// Kompasový azimut vodorovného směru ve světě (přední stěna míří na azimutPredni).
export function azimutSmeru(n, d) {
  return (((n.azimutPredni || 0) + deg(Math.atan2(-d[0], d[2]))) % 360 + 360) % 360;
}

// Plochy střechy s místní soustavou: u podél okapu, v nahoru po spádu.
export function plochyStrechy(n) {
  const S = soustavaStrechy(n);
  const p = Math.max(0, Number(n.presah) || 0);
  const a = S.A / 2 + p, b = S.B / 2 + p;
  const P = (rx, rz) => [rx, vyskaDomu(n, S, rx, rz), rz];
  let polys;
  if (n.strecha === "sedlova") {
    polys = [[P(-a, b), P(a, b), P(a, 0), P(-a, 0)], [P(a, -b), P(-a, -b), P(-a, 0), P(a, 0)]];
  } else if (n.strecha === "valbova") {
    const e = Math.max(0, S.A / 2 - S.B / 2);
    polys = [
      [P(-a, b), P(a, b), P(e, 0), P(-e, 0)],
      [P(a, -b), P(-a, -b), P(-e, 0), P(e, 0)],
      [P(a, b), P(a, -b), P(e, 0)],
      [P(-a, -b), P(-a, b), P(-e, 0)],
    ];
  } else if (n.strecha === "polovalba") {
    const { e, zc } = rozmeryPolovalby(n, S);
    polys = [
      [P(-a, b), P(a, b), P(a, zc), P(e, 0), P(-e, 0), P(-a, zc)],
      [P(a, -b), P(-a, -b), P(-a, -zc), P(-e, 0), P(e, 0), P(a, -zc)],
      [P(a, zc), P(a, -zc), P(e, 0)],
      [P(-a, -zc), P(-a, zc), P(-e, 0)],
    ];
  } else {
    polys = [[P(-a, b), P(a, b), P(a, -b), P(-a, -b)]];
  }
  const nazvy = ["sedlova", "valbova", "polovalba"].includes(n.strecha) ? null : ["Střecha"];
  const plochy = polys.map((poly, i) => plochaZBodu(n, poly.map(q => doSveta(S, q[0], q[1], q[2])), i, nazvy?.[i]));
  const prs = pristavky(n);
  for (const pr of prs) {
    const D2 = pr.D + pr.p2;
    const body = [[pr.s0 - pr.p2, D2], [pr.s1 + pr.p2, D2], [pr.s1 + pr.p2, 0], [pr.s0 - pr.p2, 0]]
      .map(([si, dist]) => { const [x, z] = pr.bod(si, dist); return [x, pr.vyska(dist), z]; });
    const nazev = (pr.typ === "pristavek" ? "Přístavek" : "Přístřešek") + (prs.length > 1 ? ` ${pr.poradi}` : "");
    plochy.push({ ...plochaZBodu(n, body, plochy.length, nazev), pristavekId: pr.id });
  }
  return plochy;
}

// Rovinná plocha z bodů ve světě: místní soustava u (podél dolní hrany), v (nahoru po spádu).
function plochaZBodu(n, poly, i, nazevPevny) {
  {
    // odstraň zdvojené body (valba bez hřebene = stan)
    const body = poly.filter((q, j) => j === 0 || v3.dist(q, poly[j - 1]) > 1e-6)
      .filter((q, j, arr) => j < arr.length - 1 || v3.dist(q, arr[0]) > 1e-6);
    let O = body[0];
    let U = v3.norm(v3.sub(body[1], body[0]));
    const stred = v3.mul(body.reduce((s, q) => v3.add(s, q), [0, 0, 0]), 1 / body.length);
    const k = v3.sub(stred, O);
    let V = v3.norm(v3.sub(k, v3.mul(U, v3.dot(k, U))));
    let N = v3.cross(U, V);
    if (N[1] < 0) { O = body[1]; U = v3.mul(U, -1); N = v3.cross(U, V); }
    const poly2d = body.map(q => { const d = v3.sub(q, O); return [v3.dot(d, U), v3.dot(d, V)]; });
    const sklon = deg(Math.acos(Math.min(1, Math.abs(N[1]))));
    const vodor = [N[0], 0, N[2]];
    const az = v3.len(vodor) > 1e-6 ? azimutSmeru(n, v3.norm(vodor)) : null;
    const nazev = nazevPevny || `Plocha ${az == null ? i + 1 : smerNaText(az)}`;
    return { index: i, body, O, U, V, N, poly2d, sklon, azimut: az, nazev, smer: az == null ? "—" : smerNaText(az) };
  }
}

export const bodPlochy = (f, u, v, nad = 0) => v3.add(v3.add(v3.add(f.O, v3.mul(f.U, u)), v3.mul(f.V, v)), v3.mul(f.N, nad));

// Stěny: start → konec zleva doprava při pohledu zvenku, `ven` = vnější normála.
export function steny(n) {
  const S = soustavaStrechy(n);
  // u polovalby se štít láme tam, kde se potká valbička s hlavní plochou
  let zw = null;
  if (n.strecha === "polovalba") {
    const pv = rozmeryPolovalby(n, S);
    zw = (pv.hv - (pv.a - S.A / 2) * pv.k) / (Math.tan(rad(n.sklon)) || 1e-6);
  }
  return zakladSten(n).map(d => {
    const { delka, dir } = d;
    // body zlomu horní hrany: kde je rx nebo rz = 0 nebo ±(A−B)/2 (a u polovalby ±zw)
    const [rx0, rz0] = doStrechy(S, d.a[0], d.a[1]);
    const [drx, drz] = doStrechy(S, dir[0], dir[1]);
    const e = Math.abs(S.A - S.B) / 2;
    const ss = new Set([0, delka]);
    for (const c of [0, e, -e, ...(zw != null && zw > 0 ? [zw, -zw] : [])]) {
      if (Math.abs(drx) > 1e-9) ss.add((c - rx0) / drx);
      if (Math.abs(drz) > 1e-9) ss.add((c - rz0) / drz);
    }
    const s = [...ss].filter(x => x >= -1e-9 && x <= delka + 1e-9).sort((p, q) => p - q);
    const horni = s.map(si => { const [rx, rz] = doStrechy(S, d.a[0] + dir[0] * si, d.a[1] + dir[1] * si); return [si, vyskaDomu(n, S, rx, rz)]; });
    const obrys = [[0, 0], [delka, 0], ...horni.slice().reverse()];
    const maxT = Math.max(...horni.map(h => h[1]));
    return { ...d, delka, dir, obrys, maxT, nazev: STRANY.find(x => x.id === d.id).nazev };
  });
}

// ── FVE ──
export function rozmerPanelu(n, pole) {
  const { sirka, vyska } = n.panel;
  return pole.orientace === "sirku" ? { pw: vyska, ph: sirka } : { pw: sirka, ph: vyska };
}

// Rozteč řad: u naklopených panelů (plochá střecha) se počítá se stínem při slunci 18° nad obzorem.
export function roztecRad(n, pole) {
  const { ph } = rozmerPanelu(n, pole);
  const a = rad(pole.naklon || 0);
  return a > 0 ? ph * Math.cos(a) + (ph * Math.sin(a)) / Math.tan(rad(18)) : ph + n.mezeraFve;
}

// Půdorysy jednotlivých panelů v místní soustavě plochy.
export function panelyPole(n, pole) {
  const { pw, ph } = rozmerPanelu(n, pole);
  const hloubka = ph * Math.cos(rad(pole.naklon || 0));
  const krok = roztecRad(n, pole);
  const out = [];
  for (let r = 0; r < pole.radky; r++) for (let s = 0; s < pole.sloupce; s++) {
    const u = pole.u + s * (pw + n.mezeraFve);
    const v = pole.v + r * krok;
    out.push({ r, s, u, v, pw, ph, hloubka });
  }
  return out;
}

const uvnitr = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const vzdOdUsecky2 = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
export function bodSeVejde(poly, x, y, okraj) {
  if (!uvnitr(poly, x, y)) return false;
  for (let i = 0; i < poly.length; i++) if (vzdOdUsecky2([x, y], poly[i], poly[(i + 1) % poly.length]) < okraj - 1e-6) return false;
  return true;
}
export const TYPY_PREKAZEK = {
  komin: { nazev: "Komín", sirka: 0.6, hloubka: 0.6, vyska: 1.0 },
  okno: { nazev: "Střešní okno", sirka: 0.78, hloubka: 1.18, vyska: 0.1 },
  jina: { nazev: "Jiná překážka", sirka: 0.5, hloubka: 0.5, vyska: 0.5 },
};

export function panelSeVejde(n, plocha, pan) {
  const rohy = [[pan.u, pan.v], [pan.u + pan.pw, pan.v], [pan.u + pan.pw, pan.v + pan.hloubka], [pan.u, pan.v + pan.hloubka]];
  if (!rohy.every(([x, y]) => bodSeVejde(plocha.poly2d, x, y, n.okrajFve))) return false;
  // od překážek stejný odstup jako od okraje střechy
  const m = n.okrajFve;
  return !(n.prekazky || []).some(o => o.plocha === plocha.index &&
    pan.u < o.u + o.sirka + m && pan.u + pan.pw > o.u - m && pan.v < o.v + o.hloubka + m && pan.v + pan.hloubka > o.v - m);
}

// Interval u, kde vodorovná přímka v místní soustavě protíná plochu.
export function rozsahU(poly, v) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    if ((y1 <= v && y2 >= v) || (y2 <= v && y1 >= v)) {
      if (Math.abs(y2 - y1) < 1e-9) xs.push(x1, x2);
      else xs.push(x1 + ((v - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

// Vyplní plochu co nejvíce panely; řady se stejnou šířkou se sloučí do jednoho pole.
export function vyplnPlochu(n, plocha, orientace, naklon = 0) {
  const vzor = { orientace, naklon };
  const { pw } = rozmerPanelu(n, vzor);
  const hloubka = rozmerPanelu(n, vzor).ph * Math.cos(rad(naklon));
  const krok = roztecRad(n, vzor);
  const m = n.okrajFve, g = n.mezeraFve;
  const vs = plocha.poly2d.map(q => q[1]);
  const radky = [];
  for (let v = Math.min(...vs) + m; v + hloubka <= Math.max(...vs) - m + 1e-9; v += krok) {
    const r1 = rozsahU(plocha.poly2d, v), r2 = rozsahU(plocha.poly2d, v + hloubka);
    if (!r1 || !r2) continue;
    let lo = Math.max(r1[0], r2[0]) + m, hi = Math.min(r1[1], r2[1]) - m;
    const pocet = Math.floor((hi - lo + g) / (pw + g));
    if (pocet < 1) continue;
    // řada se vycentruje a každý panel se zkusí zvlášť — šikmé hrany (valba)
    // a překážky (komín, okno) v řadě udělají mezeru, zbytek zůstane
    const u0 = lo + (hi - lo - (pocet * pw + (pocet - 1) * g)) / 2;
    let beh = null;
    for (let i = 0; i <= pocet; i++) {
      const u = u0 + i * (pw + g);
      const ok = i < pocet && panelSeVejde(n, plocha, { u, v, pw, ph: hloubka, hloubka });
      if (ok) { if (beh) beh.sloupce++; else beh = { u, v, radky: 1, sloupce: 1, orientace, naklon }; }
      else if (beh) { radky.push(beh); beh = null; }
    }
  }
  // pod sebou ležící řady stejné šířky se sloučí do jednoho pole
  const pole = [];
  for (const r of radky) {
    const nad = pole.find(p => p.sloupce === r.sloupce && Math.abs(p.u - r.u) < 1e-6 && Math.abs(p.v + p.radky * krok - r.v) < 1e-6);
    if (nad) nad.radky++;
    else pole.push({ ...r, id: "f" + Math.random().toString(36).slice(2, 9), plocha: plocha.index });
  }
  return pole;
}

// ── Hromosvod ──
const nove = (p) => p + Math.random().toString(36).slice(2, 9);

export function navrhniHromosvod(n) {
  const S = soustavaStrechy(n);
  const p = Math.max(0, Number(n.presah) || 0);
  const a = S.A / 2 + p, b = S.B / 2 + p;
  const P = (rx, rz) => { const w = doSveta(S, rx, 0, rz); return [w[0], vyskaStrechy(n, w[0], w[2]) + NAD_STRECHOU, w[2]]; };
  const trida = TRIDY_LPS[n.hromosvod?.trida || "III"];
  const vedeni = [];
  if (n.strecha === "sedlova") {
    vedeni.push([P(-a, 0), P(a, 0)]);
    vedeni.push([P(-a, b), P(-a, 0), P(-a, -b)]);
    vedeni.push([P(a, b), P(a, 0), P(a, -b)]);
  } else if (n.strecha === "valbova") {
    const e = Math.max(0, S.A / 2 - S.B / 2);
    if (e > 0) vedeni.push([P(-e, 0), P(e, 0)]);
    vedeni.push([P(-a, b), P(-e, 0), P(-a, -b)]);
    vedeni.push([P(a, b), P(e, 0), P(a, -b)]);
  } else if (n.strecha === "polovalba") {
    // hřeben, hrany valbiček a pod nimi štítové hrany
    const { e, zc } = rozmeryPolovalby(n, S);
    vedeni.push([P(-e, 0), P(e, 0)]);
    vedeni.push([P(-a, b), P(-a, zc), P(-e, 0), P(-a, -zc), P(-a, -b)]);
    vedeni.push([P(a, b), P(a, zc), P(e, 0), P(a, -zc), P(a, -b)]);
  } else {
    // obvod + mřížová soustava s okem podle třídy
    vedeni.push([P(-a, b), P(a, b), P(a, -b), P(-a, -b), P(-a, b)]);
    const nx = Math.ceil((2 * a) / trida.oko) - 1, nz = Math.ceil((2 * b) / trida.oko) - 1;
    for (let i = 1; i <= nx; i++) { const x = -a + (2 * a * i) / (nx + 1); vedeni.push([P(x, b), P(x, -b)]); }
    for (let i = 1; i <= nz; i++) { const z = -b + (2 * b * i) / (nz + 1); vedeni.push([P(-a, z), P(a, z)]); }
  }
  // svody: rohy + další po stěnách tak, aby rozestup nepřesáhl limit třídy
  const svody = [];
  for (const st of steny(n)) {
    const dalsi = Math.ceil(st.delka / trida.svody) - 1;
    svody.push({ id: nove("s"), x: st.a[0], z: st.a[1] });
    for (let i = 1; i <= dalsi; i++) {
      const s = (st.delka * i) / (dalsi + 1);
      svody.push({ id: nove("s"), x: st.a[0] + st.dir[0] * s, z: st.a[1] + st.dir[1] * s });
    }
  }
  // svody uprostřed okapové stěny napojit svodem po spádu až na hřeben
  if (["sedlova", "valbova", "polovalba"].includes(n.strecha)) {
    const e = n.strecha === "valbova" ? Math.max(0, S.A / 2 - S.B / 2) : n.strecha === "polovalba" ? rozmeryPolovalby(n, S).e : a;
    for (const sv of svody) {
      const kraj = trasaSvodu(n, sv)[2];
      const [rx, rz] = doStrechy(S, kraj[0], kraj[2]);
      if (Math.abs(Math.abs(rz) - b) > 0.05 || Math.abs(Math.abs(rx) - a) < 0.05) continue;
      vedeni.push([P(rx, rz), P(Math.max(-e, Math.min(e, rx)), 0)]);
    }
  }
  // komíny: jímací tyč u komínu (o 0,5 m výš) a vedení od její paty na hřeben
  const tyce = (n.hromosvod?.tyce || []).filter(t => !t.kKominu);
  const plochy = plochyStrechy(n);
  for (const o of (n.prekazky || []).filter(o => o.typ === "komin")) {
    const f = plochy[o.plocha];
    if (!f) continue;
    const pata = bodPlochy(f, o.u + o.sirka + 0.25, o.v + o.hloubka / 2);
    tyce.push({ id: nove("t"), x: pata[0], z: pata[2], vyska: (Number(o.vyska) || 1) + 0.5, kKominu: true });
    if (["sedlova", "valbova", "polovalba"].includes(n.strecha)) {
      const [rx] = doStrechy(S, pata[0], pata[2]);
      const e = n.strecha === "sedlova" ? a : n.strecha === "polovalba" ? rozmeryPolovalby(n, S).e : Math.max(0, S.A / 2 - S.B / 2);
      const hreben = doSveta(S, Math.max(-e, Math.min(e, rx)), 0, 0);
      vedeni.push([[pata[0], 0, pata[2]], [hreben[0], 0, hreben[2]]]);
    }
  }

  // přístřešek: vedení po vnější hraně a z obou rohů svody po sloupcích k zemi
  for (const pr of pristavky(n)) {
    if (pr.D + pr.p2 <= (Number(n.presah) || 0) + 0.1) continue;
    const D2 = pr.D + pr.p2;
    const [x1, z1] = pr.bod(pr.s0 - pr.p2, D2), [x2, z2] = pr.bod(pr.s1 + pr.p2, D2);
    vedeni.push([[x1, 0, z1], [x2, 0, z2]]);
    vedeni.push([[x1, 0, z1], [x1, 0, z1, 1]]);
    vedeni.push([[x2, 0, z2], [x2, 0, z2, 1]]);
  }
  return {
    ...n.hromosvod,
    vedeni: vedeni.map(body => ({ id: nove("v"), body })),
    svody,
    tyce,
  };
}

// Svod: svislá trasa po stěně + napojení na okraj střechy.
export function trasaSvodu(n, sv) {
  const L = n.delka / 2, W = n.sirka / 2, p = Math.max(0, Number(n.presah) || 0);
  let ox = 0, oz = 0;
  if (Math.abs(Math.abs(sv.x) - L) < 0.05) ox = Math.sign(sv.x);
  if (Math.abs(Math.abs(sv.z) - W) < 0.05) oz = Math.sign(sv.z);
  const odst = 0.08;
  const hStena = vyskaStrechy(n, sv.x, sv.z);
  const dole = [sv.x + ox * odst, 0, sv.z + oz * odst];
  const nahore = [sv.x + ox * odst, Math.min(hStena, vyskaStrechy(n, sv.x + ox * p, sv.z + oz * p)) - 0.05, sv.z + oz * odst];
  const okraj = [sv.x + ox * p, vyskaStrechy(n, sv.x + ox * p, sv.z + oz * p) + NAD_STRECHOU, sv.z + oz * p];
  return [dole, nahore, okraj];
}

// Výška vodiče nad krytinou (podpěry).
export const NAD_STRECHOU = 0.15;
// Bod vedení: [x, y, z] leží na střeše (výška se dopočítá), [x, y, z, 1] je pevný
// bod mimo střechu — na fasádě nebo u země (ručně kreslený svod).
export const jePevny = (b) => b[3] === 1;
export const poziceBodu = (n, b) => (jePevny(b) ? [b[0], b[1], b[2]] : [b[0], vyskaStrechy(n, b[0], b[2]) + NAD_STRECHOU, b[2]]);

const delkaLomene = (body) => body.slice(1).reduce((s, q, i) => s + v3.dist(q, body[i]), 0);

// Vedení na střeše kopíruje její povrch: úseky mezi dvěma střešními body se
// navzorkují po 0,25 m a položí NAD_STRECHOU nad krytinu. Úsek s pevným bodem
// (fasáda, zem) je rovný.
export function drahaVedeni(n, body) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (i > 0 && !jePevny(b) && !jePevny(body[i - 1])) {
      const [px, , pz] = body[i - 1], [x, , z] = b;
      const kroku = Math.max(1, Math.ceil(Math.hypot(x - px, z - pz) / 0.25));
      for (let k = 1; k < kroku; k++) {
        const xi = px + ((x - px) * k) / kroku, zi = pz + ((z - pz) * k) / kroku;
        out.push([xi, vyskaStrechy(n, xi, zi) + NAD_STRECHOU, zi]);
      }
    }
    out.push(poziceBodu(n, b));
  }
  return out;
}

// Délka vedení rozdělená na část po střeše (jímací) a mimo ni (svod).
export function delkyVedeni(n, body) {
  let strecha = 0, svod = 0;
  for (let i = 1; i < body.length; i++) {
    const d = delkaLomene(drahaVedeni(n, [body[i - 1], body[i]]));
    if (jePevny(body[i - 1]) || jePevny(body[i])) svod += d; else strecha += d;
  }
  return { strecha, svod };
}

const vzdOdLomene = (p, draha) => {
  let m = Infinity;
  for (let i = 1; i < draha.length; i++) m = Math.min(m, vzdBoduOdUsecky3(p, draha[i - 1], draha[i]));
  return draha.length === 1 ? v3.dist(p, draha[0]) : m;
};

// Konce vodičů a jestli na něco navazují (jiné vedení, svod, zem/zemnič).
export function spoje(n) {
  const hs = n.hromosvod || {};
  const vodice = [
    ...(hs.vedeni || []).map(v => ({ id: v.id, draha: drahaVedeni(n, v.body) })),
    ...(hs.svody || []).map(sv => ({ id: sv.id, draha: trasaSvodu(n, sv), svod: true })),
    ...(hs.tyce || []).map(t => { const q = patyTyce(n, t); return { id: t.id, draha: [q, [q[0], q[1] + t.vyska, q[2]]], tyc: true }; }),
  ];
  const out = [];
  for (const vo of vodice) {
    if (vo.tyc) continue;
    const konce = vo.svod ? [vo.draha[vo.draha.length - 1]] : [vo.draha[0], vo.draha[vo.draha.length - 1]];
    konce.forEach((k, i) => {
      const uZeme = k[1] < 0.3;
      const uzavrene = !vo.svod && konce.length === 2 && v3.dist(konce[0], konce[1]) < 0.25;
      const naJiny = vodice.some(o => o !== vo && vzdOdLomene(k, o.draha) < 0.25);
      if (i === 1 && uzavrene) return;
      out.push({ bod: k, id: vo.id, propojeno: uZeme || naJiny || uzavrene, zem: uZeme });
    });
  }
  return out;
}
export const patyTyce = (n, t) => [t.x, vyskaStrechy(n, t.x, t.z), t.z];

function vzdBoduOdUsecky3(p, a, b) {
  const ab = v3.sub(b, a);
  const t = Math.max(0, Math.min(1, v3.dot(v3.sub(p, a), ab) / (v3.dot(ab, ab) || 1)));
  return v3.dist(p, v3.add(a, v3.mul(ab, t)));
}

// Panely, které jsou blíž k jímací soustavě než dostatečná vzdálenost s.
export function blizkePanely(n) {
  const plochy = plochyStrechy(n);
  const s = Number(n.hromosvod?.odstup) || 0;
  const useky = [];
  for (const ved of n.hromosvod?.vedeni || []) {
    const d = drahaVedeni(n, ved.body);
    for (let i = 1; i < d.length; i++) useky.push([d[i - 1], d[i]]);
  }
  for (const t of n.hromosvod?.tyce || []) { const p = patyTyce(n, t); useky.push([p, [p[0], p[1] + t.vyska, p[2]]]); }
  const blizke = new Set();
  if (!s || !useky.length) return blizke;
  for (const pole of n.fve) {
    const f = plochy[pole.plocha];
    if (!f) continue;
    for (const pan of panelyPole(n, pole)) {
      const body = [];
      for (const fu of [0, 0.5, 1]) for (const fv of [0, 0.5, 1]) body.push(bodPlochy(f, pan.u + fu * pan.pw, pan.v + fv * pan.hloubka, 0.12));
      if (body.some(b => useky.some(([a, c]) => vzdBoduOdUsecky3(b, a, c) < s))) blizke.add(`${pole.id}:${pan.r}:${pan.s}`);
    }
  }
  return blizke;
}

// Soupis pro nacenění.
export function soupis(n) {
  const plochy = plochyStrechy(n);
  const panelu = n.fve.reduce((s, p) => s + p.radky * p.sloupce, 0);
  const poPlochach = plochy.map(f => {
    const pocet = n.fve.filter(p => p.plocha === f.index).reduce((s, p) => s + p.radky * p.sloupce, 0);
    return { nazev: f.nazev, smer: f.smer, sklon: f.sklon, pocet, kwp: (pocet * n.panel.wp) / 1000 };
  }).filter(x => x.pocet > 0);
  const hs = n.hromosvod || {};
  const delky = (hs.vedeni || []).map(v => delkyVedeni(n, v.body));
  const jimaci = delky.reduce((s, d) => s + d.strecha, 0);
  const svodyRucne = (hs.vedeni || []).filter(v => { const k = v.body[v.body.length - 1]; return jePevny(k) && k[1] < 0.3; }).length;
  const svodyDelka = (hs.svody || []).reduce((s, sv) => s + delkaLomene(trasaSvodu(n, sv)), 0) + delky.reduce((s, d) => s + d.svod, 0);
  const zemnic = hs.zemnic ? 2 * (n.delka + 2) + 2 * (n.sirka + 2) : 0;
  const pocetSvodu = (hs.svody || []).length + svodyRucne;
  return {
    panelu,
    kwp: (panelu * n.panel.wp) / 1000,
    plochaPanelu: panelu * n.panel.sirka * n.panel.vyska,
    poPlochach,
    jimaci, svodyDelka, pocetSvodu, zemnic,
    tyci: (hs.tyce || []).length,
    podperyStrecha: Math.ceil(jimaci / 1.0),
    podperyStena: Math.ceil(svodyDelka / 1.0),
    svorkyZkusebni: pocetSvodu,
    svorkyZemnic: pocetSvodu,
    blizko: blizkePanely(n).size,
    nepropojeno: spoje(n).filter(x => !x.propojeno).length,
  };
}

// ── Valivá koule (ČSN EN 62305-3) ──
// Poloměr koule podle třídy LPS.
export const POLOMER_KOULE = { I: 20, II: 30, III: 45, IV: 60 };

// Body jímací soustavy (vedení, svody, tyče) navzorkované po ~0,25 m.
export function bodyJimaci(n) {
  const hs = n.hromosvod || {};
  const out = [];
  const vzorkuj = (a, b) => {
    const k = Math.max(1, Math.ceil(v3.dist(a, b) / 0.25));
    for (let i = 0; i <= k; i++) out.push(v3.add(a, v3.mul(v3.sub(b, a), i / k)));
  };
  for (const v of hs.vedeni || []) { const d = drahaVedeni(n, v.body); for (let i = 1; i < d.length; i++) vzorkuj(d[i - 1], d[i]); }
  for (const sv of hs.svody || []) { const d = trasaSvodu(n, sv); for (let i = 1; i < d.length; i++) vzorkuj(d[i - 1], d[i]); }
  for (const t of hs.tyce || []) { const p = patyTyce(n, t); vzorkuj(p, [p[0], p[1] + t.vyska, p[2]]); }
  return out;
}

// Směry, ze kterých se koule může k bodu přiblížit (horní polokoule).
const SMERY_KOULE = (() => {
  const s = [[0, 1, 0]];
  for (const el of [75, 60, 45, 30, 15, 5]) for (let az = 0; az < 360; az += 20) {
    const e = (el * Math.PI) / 180, a = (az * Math.PI) / 180;
    s.push([Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]);
  }
  return s;
})();

// Vyhodnocení: bod střechy je nechráněný, když se ho koule může dotknout,
// aniž by se dotkla jímací soustavy, země nebo jiné části střechy.
// Zjednodušení: střecha se bere jako výšková plocha (vyskaStrechy), stěny se nekontrolují.
export function valivaKoule(n, krok = 0.5) {
  const R = POLOMER_KOULE[n.hromosvod?.trida || "III"] || 45;
  const lps = bodyJimaci(n);
  const volno = (C) => {
    if (C[1] < R - 0.05) return false;                                 // země
    if (C[1] - R < vyskaStrechy(n, C[0], C[2]) - 0.05) return false;    // střecha pod středem koule
    for (const q of lps) {
      const dx = C[0] - q[0], dy = C[1] - q[1], dz = C[2] - q[2];
      if (dx * dx + dy * dy + dz * dz < (R - 0.02) * (R - 0.02)) return false;
    }
    return true;
  };
  const plochy = plochyStrechy(n);
  const body = [];
  for (const f of plochy) {
    const us = f.poly2d.map(q => q[0]), vs = f.poly2d.map(q => q[1]);
    for (let u = Math.min(...us) + krok / 2; u < Math.max(...us); u += krok) {
      for (let v = Math.min(...vs) + krok / 2; v < Math.max(...vs); v += krok) {
        if (!bodSeVejde(f.poly2d, u, v, 0.05)) continue;
        const P = bodPlochy(f, u, v, 0.02);
        const zasah = SMERY_KOULE.some(d => volno(v3.add(P, v3.mul(d, R))));
        body.push({ p: P, chranen: !zasah, plocha: f.index });
      }
    }
  }
  // koule „položená“ na jímací soustavu nad středem každé plochy (průhyb koule)
  const koule = plochy.map(f => {
    const stredPlochy = v3.mul(f.body.reduce((s, q) => v3.add(s, q), [0, 0, 0]), 1 / f.body.length);
    const minVzd = (C) => lps.reduce((m, q) => Math.min(m, v3.dist(C, q)), Infinity);
    let lo = 0, hi = R + 30;
    if (minVzd(v3.add(stredPlochy, v3.mul(f.N, lo))) >= R) hi = lo;
    for (let i = 0; i < 40 && hi - lo > 0.01; i++) {
      const mid = (lo + hi) / 2;
      if (minVzd(v3.add(stredPlochy, v3.mul(f.N, mid))) >= R) hi = mid; else lo = mid;
    }
    const t = Math.max(hi, 0);
    return { plocha: f.index, nazev: f.nazev, stred: v3.add(stredPlochy, v3.mul(f.N, t)), rezerva: t - R, bodStrechy: stredPlochy };
  });
  const chraneno = body.filter(b => b.chranen).length;
  return { R, body, koule, procento: body.length ? (100 * chraneno) / body.length : 100, nechranenych: body.length - chraneno };
}

// ── Odstupy prvku (FVE pole, komín, okno) od okrajů plochy ──
// Měří se v rovině střechy: vlevo/vpravo ve výšce středu prvku, k okapu
// a k hřebeni (horní hraně) ve svislici středu prvku. Vlevo/vpravo při pohledu
// na plochu zvenku (okap dole).
const rozsahV = (poly, u) => rozsahU(poly.map(([a, b]) => [b, a]), u);

export function obdelnikPrvku(n, prvek, jePole) {
  if (!jePole) return { u: prvek.u, v: prvek.v, w: prvek.sirka, h: prvek.hloubka };
  const p = panelyPole(n, prvek);
  const { pw } = rozmerPanelu(n, prvek);
  const posl = p[p.length - 1];
  return { u: prvek.u, v: prvek.v, w: prvek.sloupce * pw + (prvek.sloupce - 1) * n.mezeraFve, h: posl.v + posl.hloubka - prvek.v };
}

export function odstupy(plocha, r) {
  const vm = r.v + r.h / 2, um = r.u + r.w / 2;
  const rh = rozsahU(plocha.poly2d, vm) || [r.u, r.u + r.w];
  const rv = rozsahV(plocha.poly2d, um) || [r.v, r.v + r.h];
  return { vlevo: r.u - rh[0], vpravo: rh[1] - (r.u + r.w), okap: r.v - rv[0], hreben: rv[1] - (r.v + r.h), rh, rv, um, vm };
}

// Nová poloha prvku tak, aby měl zadaný odstup od zvolené hrany.
// U šikmých hran (valba, polovalba) se rozsah mění s polohou — proto pár iterací.
export function polohaPodleOdstupu(plocha, r, strana, hodnota) {
  let { u, v } = r;
  for (let i = 0; i < 4; i++) {
    const o = odstupy(plocha, { ...r, u, v });
    if (strana === "vlevo") u = o.rh[0] + hodnota;
    else if (strana === "vpravo") u = o.rh[1] - r.w - hodnota;
    else if (strana === "okap") v = o.rv[0] + hodnota;
    else if (strana === "hreben") v = o.rv[1] - r.h - hodnota;
  }
  return { u: Math.round(u * 1000) / 1000, v: Math.round(v * 1000) / 1000 };
}
