// ─── 3D návrh domu: fotky ze stran → 3D model → FVE a hromosvod ──────────────
// Model se staví z rozměrů (délka, šířka, výška okapu, typ a sklon střechy),
// fotky jednotlivých stran se napnou na stěny jako textura. Do modelu se pak
// klikáním kreslí pole fotovoltaických panelů, jímací vedení, svody a jímací
// tyče; z výkresu vznikne soupis materiálu. Návrhy se ukládají v zařízení.
// Výpočty (střechy, rozmístění panelů, hromosvod) jsou v navrh3dGeometrie.js.

import { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import * as ui from "./ui.js";
import {
  STRANY, TYPY_STRECHY, TRIDY_LPS, vychoziNavrh, plochyStrechy, steny, vyskaHrebene, sklonZHrebene, delkyStrechy, rozmerZDelkyStrechy, soustavaStrechy,
  panelyPole, panelSeVejde, rozmerPanelu, vyplnPlochu, bodPlochy, navrhniHromosvod, trasaSvodu,
  drahaVedeni, patyTyce, blizkePanely, soupis, v3, poziceBodu, jePevny, spoje, vyskaStrechy, NAD_STRECHOU, pristavky, seznamPristavku, TYPY_PREKAZEK, valivaKoule, POLOMER_KOULE, obdelnikPrvku, odstupy, polohaPodleOdstupu,
} from "./navrh3dGeometrie.js";
import { vyrovnejFotku } from "./perspektiva.js";
import * as rz from "./rizikoBlesk.js";
import { vytvorMontazniDokumentaci, vytvorListRizika } from "./montazniDokumentace.js";
import { nactiSeznam, nactiNavrh, ulozNavrh as ulozDoDatabaze, smazNavrh, nactiZakazky } from "./navrhyCloud.js";

const ODSTUP_FASADA = 0.08;

// Nejbližší bod na obvodu domu (líc stěny) k bodu (x, z).
function nejblizsiStena(n, x, z) {
  let nej = null;
  for (const st of steny(n)) {
    const si = Math.max(0, Math.min(st.delka, (x - st.a[0]) * st.dir[0] + (z - st.a[1]) * st.dir[1]));
    const px = st.a[0] + st.dir[0] * si, pz = st.a[1] + st.dir[1] * si;
    const d = Math.hypot(x - px, z - pz);
    if (!nej || d < nej.d) nej = { st, si, x: px, z: pz, d, ven: st.ven };
  }
  return nej;
}

// Vodič jako válce + podpěry á 1 m (na střeše svislý držák, na fasádě vodorovný).
function kresliVodic(n, g, draha, mat, matPodp) {
  for (let i = 1; i < draha.length; i++) g.add(valec(draha[i - 1], draha[i], 0.03, mat));
  let t = 0.5;
  for (let i = 1; i < draha.length; i++) {
    const a = draha[i - 1], b = draha[i], len = v3.dist(a, b);
    while (t <= len) {
      const P = v3.add(a, v3.mul(v3.sub(b, a), t / (len || 1)));
      const yS = vyskaStrechy(n, P[0], P[2]);
      if (Math.abs(P[1] - (yS + NAD_STRECHOU)) < 0.03) {
        g.add(valec([P[0], yS, P[2]], P, 0.012, matPodp));
        const pata = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.14), matPodp);
        pata.position.set(P[0], yS + 0.015, P[2]);
        g.add(pata);
      } else {
        const w = nejblizsiStena(n, P[0], P[2]);
        if (w.d < 0.3 && P[1] > 0.3) g.add(valec(P, [w.x, P[1], w.z], 0.012, matPodp));
      }
      t += 1;
    }
    t -= len;
  }
}

const KLIC = "navrh3d.navrhy";
const nactiNavrhy = () => { try { return JSON.parse(localStorage.getItem(KLIC) || "[]"); } catch { return []; } };
const ulozNavrhy = (arr) => { try { localStorage.setItem(KLIC, JSON.stringify(arr)); return true; } catch { return false; } };

const cislo = (x, d = 2) => Number(x || 0).toLocaleString("cs-CZ", { minimumFractionDigits: d, maximumFractionDigits: d });
const noveId = (p) => p + Math.random().toString(36).slice(2, 9);

const SVETOVE_STRANY = [["S", 0], ["SV", 45], ["V", 90], ["JV", 135], ["J", 180], ["JZ", 225], ["Z", 270], ["SZ", 315]];
const BARVY_STRECHY = [["Pálená", "#8b3a2b"], ["Antracit", "#3b4048"], ["Hnědá", "#5a3d2b"], ["Šedá", "#7d8590"], ["Plech zelený", "#3f5e4a"]];

const REZIMY = [
  { id: "pohled", nazev: "Otáčet", ikona: "ti-rotate-360", napoveda: "Tažením otáčíte, kolečkem / dvěma prsty přibližujete. Klepnutím vyberete prvek." },
  { id: "fve", nazev: "FVE pole", ikona: "ti-solar-panel", napoveda: "Klepněte na střechu – vloží se pole panelů. Pole přesunete tažením." },
  { id: "vedeni", nazev: "Jímací vedení", ikona: "ti-line", napoveda: "Klepejte body vedení po střeše, přes okraj na stěnu a k zemi (= svod). Zelený bod se přichytí. Hotovo / Enter, nebo „Svod k zemi“." },
  { id: "svod", nazev: "Svod", ikona: "ti-arrow-down-bar", napoveda: "Klepněte na stěnu – přidá se svod. Existující svod přetáhněte po fasádě jinam." },
  { id: "tyc", nazev: "Jímací tyč", ikona: "ti-antenna", napoveda: "Klepněte na střechu, kam se má postavit jímací tyč." },
  { id: "prekazka", nazev: "Komín / okno", ikona: "ti-box", napoveda: "Klepněte na střechu – vloží se vybraný prvek v nastaveném rozměru (záložka FVE). Tažením ho posunete, odstupy od okrajů zadáte čísly." },
  { id: "merit", nazev: "Měřit", ikona: "ti-ruler-measure", napoveda: "Klepněte na dva body – změří se vzdálenost." },
  { id: "mazat", nazev: "Mazat", ikona: "ti-eraser", napoveda: "Klepněte na panel, vedení, svod nebo tyč – smaže se." },
];

// Běžné rozměry překážek (šířka × délka po spádu, m)
const PRESETY_PREKAZEK = {
  okno: [["55×78", 0.55, 0.78], ["66×98", 0.66, 0.98], ["66×118", 0.66, 1.18], ["78×98", 0.78, 0.98], ["78×118", 0.78, 1.18], ["78×140", 0.78, 1.4], ["94×118", 0.94, 1.18], ["114×118", 1.14, 1.18], ["134×98", 1.34, 0.98]],
  komin: [["30×30", 0.3, 0.3], ["45×45", 0.45, 0.45], ["60×60", 0.6, 0.6], ["90×60", 0.9, 0.6], ["120×60", 1.2, 0.6]],
  jina: [["15×15", 0.15, 0.15], ["30×30", 0.3, 0.3], ["50×50", 0.5, 0.5], ["100×50", 1, 0.5]],
};
const IKONY_PREKAZEK = { komin: "ti-building-factory-2", okno: "ti-window", jina: "ti-box" };

const ZALOZKY = [["rozmery", "1 Rozměry"], ["fotky", "2 Fotky"], ["fve", "3 FVE"], ["hromosvod", "4 Hromosvod"], ["riziko", "5 Riziko"], ["soupis", "6 Soupis"]];

// Vědecký zápis pro rizika: 2,51·10⁻⁵
const HORNI = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const exp10 = (x) => {
  if (!x) return "0";
  const e = Math.floor(Math.log10(Math.abs(x)));
  return `${(x / 10 ** e).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })}·10${String(e).split("").map(c => HORNI[c]).join("")}`;
};

const S = {
  karta: { ...ui.karta, padding: 14 },
  pole: { ...ui.pole, padding: "7px 9px" },
  popisek: ui.popisek,
  btn: (c, v = "male") => ({ ...ui.tlacitko(c, v), cursor: "pointer" }),
  obrys: { ...ui.tlacitkoObrys("male"), cursor: "pointer" },
  mrizka: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  radek: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  stitek: (a) => ({ padding: "6px 10px", borderRadius: 8, border: `1px solid ${a ? ui.barvy.primarni : ui.barvy.okraj}`, background: a ? ui.barvy.primarni : "#fff", color: a ? "#fff" : ui.barvy.text, fontSize: 12, fontWeight: 600, cursor: "pointer" }),
  maly: { fontSize: 12, color: ui.barvy.textMekky },
};

// Zmenšení fotky do dataURL (úložiště v zařízení má jen pár MB).
async function nactiFotku(file) {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k);
  c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close?.();
  return c.toDataURL("image/jpeg", 0.72);
}

// Textura panelu: tmavé články s mřížkou a stříbrným rámem (vytvoří se jednou).
const texturyPanelu = {};
function texturaPanelu(naSirku) {
  if (texturyPanelu[naSirku]) return texturyPanelu[naSirku];
  const c = document.createElement("canvas");
  const [w, h, sl, ra] = naSirku ? [200, 128, 10, 6] : [128, 200, 6, 10];
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#c9d1d9"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#17233a"; g.fillRect(3, 3, w - 6, h - 6);
  g.strokeStyle = "#3d5378"; g.lineWidth = 1;
  for (let i = 1; i < sl; i++) { const x = 3 + ((w - 6) * i) / sl; g.beginPath(); g.moveTo(x, 3); g.lineTo(x, h - 3); g.stroke(); }
  for (let i = 1; i < ra; i++) { const y = 3 + ((h - 6) * i) / ra; g.beginPath(); g.moveTo(3, y); g.lineTo(w - 3, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (texturyPanelu[naSirku] = t);
}

// Číselné pole, které nepřepisuje rozepsanou hodnotu (desetinná čárka i tečka).
function CisloVstup({ value, onChange, krok, min, style }) {
  const [text, setText] = useState(String(value));
  const [fokus, setFokus] = useState(false);
  const zobrazeno = fokus ? text : String(value);
  return (
    <input type="text" inputMode="decimal" style={style} value={zobrazeno} data-krok={krok}
      onFocus={() => { setText(String(value)); setFokus(true); }}
      onBlur={() => setFokus(false)}
      onChange={e => {
        setText(e.target.value);
        const x = Number(e.target.value.replace(",", ".").trim());
        if (e.target.value.trim() !== "" && Number.isFinite(x) && (min == null || x >= min)) onChange(x);
      }} />
  );
}

// onKlik = kóta jde zadat ručně (klepnutím se otevře zadání přesné délky)
function stitek3d(text, styl = {}, onKlik = null) {
  const d = document.createElement("div");
  d.textContent = text;
  Object.assign(d.style, {
    background: "rgba(255,255,255,0.9)", border: "1px solid #cbd5e1", borderRadius: "5px", padding: "1px 6px",
    font: "700 11px " + ui.pismo, color: "#0E3B5E", whiteSpace: "nowrap", pointerEvents: "none", ...styl,
  });
  if (onKlik) {
    Object.assign(d.style, { pointerEvents: "auto", cursor: "pointer", textDecoration: "underline dotted" });
    d.title = "Klepněte a zadejte přesnou délku";
    d.addEventListener("pointerdown", (e) => e.stopPropagation());
    d.addEventListener("click", (e) => { e.stopPropagation(); onKlik(d); });
  }
  return new CSS2DObject(d);
}

function valec(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const delka = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(delka, 0.001), 8), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

// Valivá koule: body střechy (zelená = chráněno, červená = koule se dotkne) a výseč
// koule opřené o jímací soustavu nad každou plochou. Objekty mají userData.koule,
// aby šly při snímcích pro dokumentaci skrýt/ukázat.
function kresliKouli(skupina, koule, { silne = false, jenBody = false } = {}) {
  const pos = [], col = [];
  for (const b of koule.body) { pos.push(...b.p); col.push(...(b.chranen ? [0.09, 0.64, 0.29] : [0.86, 0.15, 0.15])); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const body = new THREE.Points(g, new THREE.PointsMaterial({ size: silne ? 0.24 : 0.18, vertexColors: true }));
  body.userData = { typ: "ignor", koule: true };
  skupina.add(body);
  if (jenBody) return;
  const alfa = Math.asin(Math.min(1, 9 / koule.R));
  for (const k of koule.koule) {
    const barva = k.rezerva < 0 ? "#dc2626" : "#0369a1";
    for (const [mat] of [
      [new THREE.MeshBasicMaterial({ color: barva, transparent: true, opacity: silne ? 0.2 : 0.1, side: THREE.DoubleSide, depthWrite: false })],
      [new THREE.MeshBasicMaterial({ color: barva, wireframe: true, transparent: true, opacity: silne ? 0.3 : 0.12 })],
    ]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(koule.R, 72, 24, 0, Math.PI * 2, Math.PI - alfa, alfa), mat);
      m.position.set(...k.stred);
      m.userData = { typ: "ignor", koule: true };
      skupina.add(m);
    }
  }
}

function vycisti(skupina) {
  while (skupina.children.length) {
    const o = skupina.children[0];
    skupina.remove(o);
    o.traverse(x => {
      x.geometry?.dispose?.();
      if (x.material && !x.material.userData?.sdileny) (Array.isArray(x.material) ? x.material : [x.material]).forEach(m => m.dispose());
    });
  }
}

// Mnohoúhelník (2D obrys + funkce na 3D bod + uv) → mesh.
function meshZObrysu(obrys2d, na3d, uv, mat) {
  const tri = THREE.ShapeUtils.triangulateShape(obrys2d.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const pos = [], uvs = [];
  for (const t of tri) for (const i of t) { pos.push(...na3d(obrys2d[i])); uvs.push(...uv(obrys2d[i])); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// Označení 4 rohů stěny na fotce (pro narovnání perspektivy). Body jdou táhnout.
const NAZVY_ROHU = ["levý dolní roh (u země)", "pravý dolní roh (u země)", "pravý horní roh (okap)", "levý horní roh (okap)"];
function RohyEditor({ foto, nazev, onUlozit, onZavrit }) {
  const [body, setBody] = useState(foto.rohy || []);
  const ref = useRef(null);
  const tah = useRef(null);
  const pozice = (e) => {
    const r = ref.current.getBoundingClientRect();
    const k = (x) => Math.max(0, Math.min(1, x));
    return [k((e.clientX - r.left) / r.width), k((e.clientY - r.top) / r.height)];
  };
  return (
    <div style={ui.okno} onClick={onZavrit}>
      <div style={{ ...ui.oknoObsah, width: 960, maxWidth: "96vw", padding: 16 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.radek, justifyContent: "space-between", marginBottom: 8 }}>
          <b>Narovnat fotku – {nazev}</b>
          <button style={S.obrys} onClick={onZavrit}>✕</button>
        </div>
        <div style={{ fontSize: 13, marginBottom: 8, color: ui.barvy.textMekky }}>
          {body.length < 4
            ? <>Klepněte na <b style={{ color: ui.barvy.akcent }}>{body.length + 1}. {NAZVY_ROHU[body.length]}</b> stěny. Horní rohy jsou tam, kde stěna končí pod střechou (výška okapu), ne vrchol štítu.</>
            : "Hotovo – body můžete dotáhnout přesněji tažením. Rohy schované za keřem odhadněte."}
        </div>
        <div ref={ref} style={{ position: "relative", userSelect: "none", touchAction: "none", cursor: body.length < 4 ? "crosshair" : "default" }}
          onPointerDown={e => {
            const i = e.target?.dataset?.i;
            if (i != null) { tah.current = Number(i); e.currentTarget.setPointerCapture(e.pointerId); return; }
            if (body.length < 4) setBody(b => [...b, pozice(e)]);
          }}
          onPointerMove={e => { if (tah.current != null) { const q = pozice(e); setBody(b => b.map((x, j) => (j === tah.current ? q : x))); } }}
          onPointerUp={() => { tah.current = null; }}>
          <img src={foto.data} alt="" draggable={false} style={{ width: "100%", display: "block", borderRadius: 6, maxHeight: "68vh", objectFit: "contain" }} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {body.length > 1 && <polygon points={body.map(([u, v]) => `${u * 100},${v * 100}`).join(" ")} fill="rgba(245,130,31,0.18)" stroke="#f5821f" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
          </svg>
          {body.map(([u, v], i) => (
            <div key={i} data-i={i} style={{ position: "absolute", left: `${u * 100}%`, top: `${v * 100}%`, width: 24, height: 24, marginLeft: -12, marginTop: -12, borderRadius: "50%", background: "#f5821f", border: "2px solid #fff", color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", boxShadow: "0 1px 4px #0006" }}>{i + 1}</div>
          ))}
        </div>
        <div style={{ ...S.radek, justifyContent: "flex-end", marginTop: 10 }}>
          <button style={S.obrys} onClick={() => setBody([])}>Začít znovu</button>
          <button style={S.btn(ui.barvy.uspech, "normal")} disabled={body.length < 4} onClick={() => onUlozit(body)}>Narovnat</button>
        </div>
      </div>
    </div>
  );
}

// Návrh, na kterém někdo opravdu pracoval (prázdný nový návrh se do databáze neukládá).
const maObsah = (n) => !!(Object.keys(n.fotky || {}).length || n.fve?.length || n.prekazky?.length || n.hromosvod?.vedeni?.length
  || n.hromosvod?.svody?.length || (n.nazev && n.nazev !== "Nový návrh") || n.zakaznik || n.contractId);

export default function Navrh3D({ currentUser } = {}) {
  const [navrhy, setNavrhy] = useState(nactiNavrhy);
  const [navrh, setNavrh] = useState(() => nactiNavrhy()[0] || vychoziNavrh());
  const [zalozka, setZalozka] = useState("rozmery");
  const [rezim, setRezim] = useState("pohled");
  const [vybrane, setVybrane] = useState(null);           // { typ: "pole"|"vedeni"|"svod"|"tyc", id }
  const [rozpracovane, setRozpracovane] = useState([]);   // body rozkreslovaného vedení
  const [merBod, setMerBod] = useState(null);
  const [novePole, setNovePole] = useState({ radky: 2, sloupce: 5, orientace: "vysku", naklon: 15 });
  const [vyskaTyce, setVyskaTyce] = useState(2);
  const [novaPrekazka, setNovaPrekazka] = useState("komin");
  const [rozmeryNove, setRozmeryNove] = useState(() => Object.fromEntries(Object.entries(TYPY_PREKAZEK).map(([k, t]) => [k, { sirka: t.sirka, hloubka: t.hloubka, vyska: t.vyska }])));
  const [editRohy, setEditRohy] = useState(null);
  const [generuji, setGeneruji] = useState(false);         // id stěny, jejíž rohy se značí
  const [chybaUlozeni, setChybaUlozeni] = useState(false);
  const [sirokyDisplej, setSirokyDisplej] = useState(() => window.innerWidth >= 980);

  const mountRef = useRef(null);
  const sc = useRef(null);
  const historie = useRef([]);
  const texCache = useRef(new Map());

  const plochy = useMemo(() => plochyStrechy(navrh), [navrh]);
  const souhrn = useMemo(() => soupis(navrh), [navrh]);
  const blizko = useMemo(() => blizkePanely(navrh), [navrh]);
  // valivá koule se počítá chvíli — s malým zpožděním po poslední změně
  const [koule, setKoule] = useState(null);
  useEffect(() => {
    if (!navrh.hromosvod?.koule) { const t0 = setTimeout(() => setKoule(null), 0); return () => clearTimeout(t0); }
    const t = setTimeout(() => setKoule(valivaKoule(navrh)), 350);
    return () => clearTimeout(t);
  }, [navrh]);

  // Změna návrhu s možností vrátit zpět.
  const kotaKlikRef = useRef(null);
  const zmen = (fn, { doHistorie = true } = {}) => setNavrh(prev => {
    if (doHistorie) { historie.current.push(prev); if (historie.current.length > 60) historie.current.shift(); }
    const dalsi = typeof fn === "function" ? fn(prev) : { ...prev, ...fn };
    return { ...dalsi, upraveno: new Date().toISOString() };
  });
  const zpet = () => { const p = historie.current.pop(); if (p) setNavrh(p); };
  const zmenHs = (fn) => zmen(n => ({ ...n, hromosvod: { ...n.hromosvod, ...(typeof fn === "function" ? fn(n.hromosvod) : fn) } }));

  // ── Databáze: seznam návrhů, zakázky, průběžné ukládání ──
  const [cloudSeznam, setCloudSeznam] = useState([]);
  const [stavDb, setStavDb] = useState("nacitam");   // nacitam | ok | uklada | chyba
  const [zakazky, setZakazky] = useState([]);
  const posledniUlozeni = useRef("");
  const uzivatel = currentUser?.name || currentUser?.email || "";
  useEffect(() => {
    let zivy = true;
    nactiSeznam().then(x => { if (zivy) { setCloudSeznam(x); setStavDb("ok"); } }).catch(() => zivy && setStavDb("chyba"));
    nactiZakazky().then(x => zivy && setZakazky(x)).catch(() => {});
    return () => { zivy = false; };
  }, []);
  useEffect(() => {
    if (!maObsah(navrh)) return undefined;
    const t = setTimeout(async () => {
      const otiskNavrhu = JSON.stringify({ ...navrh, upraveno: null });
      if (otiskNavrhu === posledniUlozeni.current) return;
      setStavDb("uklada");
      try {
        const fotky = await ulozDoDatabaze(navrh, uzivatel);
        posledniUlozeni.current = otiskNavrhu;
        // cesty k nahraným fotkám a autor zpět do návrhu (bez zápisu do historie)
        const zmenaFotek = Object.entries(fotky).some(([k, f]) => f?.cesta !== navrh.fotky?.[k]?.cesta);
        if (zmenaFotek || !navrh.vytvoril) {
          setNavrh(prev => (prev.id !== navrh.id ? prev : {
            ...prev, vytvoril: prev.vytvoril || uzivatel || "?",
            fotky: Object.fromEntries(Object.entries(prev.fotky || {}).map(([k, f]) => [k, fotky[k]?.cesta && f?.data === fotky[k].data ? { ...f, cesta: fotky[k].cesta, otisk: fotky[k].otisk } : f])),
          }));
        }
        setCloudSeznam(prev => [{ id: navrh.id, nazev: navrh.nazev, zakaznik: navrh.zakaznik, contract_id: navrh.contractId || null, updated_at: new Date().toISOString(), upravil: uzivatel }, ...prev.filter(x => x.id !== navrh.id)]);
        setStavDb("ok");
      } catch {
        setStavDb("chyba");
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [navrh, uzivatel]);

  // Automatické ukládání do zařízení.
  useEffect(() => {
    const t = setTimeout(() => {
      setNavrhy(prev => {
        const dalsi = [navrh, ...prev.filter(x => x.id !== navrh.id)];
        setChybaUlozeni(!ulozNavrhy(dalsi));
        return dalsi;
      });
    }, 700);
    return () => clearTimeout(t);
  }, [navrh]);

  useEffect(() => {
    const f = () => setSirokyDisplej(window.innerWidth >= 980);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  // ── Scéna (jednou) ──
  useEffect(() => {
    const el = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    const lr = new CSS2DRenderer();
    Object.assign(lr.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
    el.appendChild(lr.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#dbe7f2");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(18, 13, 22);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 3.5, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8c6c, 1.4));
    const slunce = new THREE.DirectionalLight(0xffffff, 1.5);
    slunce.position.set(14, 26, 18);
    scene.add(slunce);
    const zem = new THREE.Mesh(new THREE.CircleGeometry(70, 64), new THREE.MeshStandardMaterial({ color: "#b7c99d" }));
    zem.rotation.x = -Math.PI / 2;
    zem.userData.typ = "zem";
    scene.add(zem);
    const mriz = new THREE.GridHelper(60, 60, 0x9db089, 0xa7b994);
    mriz.position.y = 0.005;
    scene.add(mriz);

    const skupDum = new THREE.Group(), skupFve = new THREE.Group(), skupHs = new THREE.Group(), skupPom = new THREE.Group();
    const skupNahled = new THREE.Group();
    scene.add(skupDum, skupFve, skupHs, skupPom, skupNahled);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); lr.setSize(w, h);
      camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Štítky schované za domem se zprůhlední (CSS štítky jinak prosvítají zdí).
    const paprsek = new THREE.Raycaster();
    const ztlum = () => {
      skupPom.children.forEach(o => {
        if (!o.isCSS2DObject) return;
        const smer = o.position.clone().sub(camera.position);
        const vzd = smer.length();
        paprsek.set(camera.position, smer.normalize());
        paprsek.far = vzd - 0.3;
        o.element.style.opacity = paprsek.intersectObjects(skupDum.children, false).length ? "0.25" : "1";
      });
    };
    let raf;
    const smycka = () => { raf = requestAnimationFrame(smycka); controls.update(); ztlum(); renderer.render(scene, camera); lr.render(scene, camera); };
    smycka();

    // ── myš / dotyk ──
    const raycaster = new THREE.Raycaster();
    const ndc = (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const vyber = (e) => {
      raycaster.setFromCamera(ndc(e), camera);
      for (const h of raycaster.intersectObjects([skupFve, skupHs, skupDum, zem], true)) {
        let o = h.object;
        while (o && !o.userData.typ) o = o.parent;
        if (!o || o.userData.typ === "ignor") continue;
        return { ...o.userData, bod: [h.point.x, h.point.y, h.point.z] };
      }
      return null;
    };
    let dolu = null;
    const onDown = (e) => {
      dolu = { x: e.clientX, y: e.clientY };
      sc.current.akce.dolu?.(vyber(e), e, raycaster);
    };
    let cekaNajezd = false;
    const onMove = (e) => {
      if (sc.current.tazeni) {
        raycaster.setFromCamera(ndc(e), camera);
        sc.current.akce.tah?.(raycaster);
        return;
      }
      if (e.buttons || cekaNajezd) return;
      cekaNajezd = true;
      requestAnimationFrame(() => { cekaNajezd = false; sc.current?.akce.najezd?.(vyber(e)); });
    };
    const onLeave = () => sc.current?.akce.najezd?.(null);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    const onUp = (e) => {
      const bylTah = !!sc.current.tazeni;
      sc.current.akce.konecTahu?.();
      if (dolu && Math.hypot(e.clientX - dolu.x, e.clientY - dolu.y) < 6 && !bylTah) sc.current.akce.klik?.(vyber(e));
      dolu = null;
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    sc.current = { renderer, scene, camera, controls, skupDum, skupFve, skupHs, skupPom, skupNahled, resize, akce: {}, tazeni: null };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onUp);
      controls.dispose();
      [skupDum, skupFve, skupHs, skupPom, skupNahled].forEach(vycisti);
      renderer.dispose();
      el.innerHTML = "";
      sc.current = null;
    };
  }, []);

  const textura = (data) => {
    if (!texCache.current.has(data)) {
      const t = new THREE.TextureLoader().load(data);
      t.colorSpace = THREE.SRGBColorSpace;
      texCache.current.set(data, t);
    }
    return texCache.current.get(data);
  };

  // Narovnaná fotka stěny (podle 4 rohů) — počítá se na pozadí a uloží do mezipaměti.
  const texturaVyrovnana = (foto, st) => {
    const tR = st.obrys[2][1], tL = st.obrys[st.obrys.length - 1][1];
    const klic = [foto.data.length, foto.data.slice(-32), JSON.stringify(foto.rohy), st.delka, tL, tR, st.maxT].join("|");
    if (!texCache.current.has(klic)) {
      const c = document.createElement("canvas"); c.width = c.height = 2;
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      texCache.current.set(klic, t);
      vyrovnejFotku(foto.data, foto.rohy, st.delka, tL, tR, st.maxT).then(cv => { t.image = cv; t.dispose(); t.needsUpdate = true; }).catch(() => {});
    }
    return texCache.current.get(klic);
  };

  // ── Překreslení modelu při každé změně ──
  useEffect(() => {
    const s = sc.current;
    if (!s) return;
    const n = navrh;
    [s.skupDum, s.skupFve, s.skupHs, s.skupPom, s.skupNahled].forEach(vycisti);

    // stěny s fotkami
    for (const st of steny(n)) {
      const foto = n.fotky?.[st.id];
      const vyr = foto?.data && foto.rohy?.length === 4 ? texturaVyrovnana(foto, st) : null;
      const o = vyr ? { l: 0, p: 0, n: 0, d: 0 } : foto?.orez || { l: 0, p: 0, n: 0, d: 0 };
      const mat = foto?.data
        ? new THREE.MeshStandardMaterial({ map: vyr || textura(foto.data), side: THREE.DoubleSide, roughness: 0.9 })
        : new THREE.MeshStandardMaterial({ color: "#ece6da", side: THREE.DoubleSide, roughness: 0.95 });
      const m = meshZObrysu(st.obrys,
        ([si, t]) => [st.a[0] + st.dir[0] * si, t, st.a[1] + st.dir[1] * si],
        ([si, t]) => [o.l + (si / st.delka) * (1 - o.l - o.p), o.d + (t / st.maxT) * (1 - o.n - o.d)], mat);
      m.userData = { typ: "stena", stena: st.id };
      s.skupDum.add(m);
      const obrys = st.obrys.map(([si, t]) => new THREE.Vector3(st.a[0] + st.dir[0] * si, t, st.a[1] + st.dir[1] * si));
      s.skupDum.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(obrys), new THREE.LineBasicMaterial({ color: "#64748b" })));
    }
    // střecha
    for (const f of plochy) {
      const mat = new THREE.MeshStandardMaterial({ color: n.barvaStrechy, side: THREE.DoubleSide, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const m = meshZObrysu(f.poly2d, ([u, v]) => bodPlochy(f, u, v), ([u, v]) => [u / 4, v / 4], mat);
      m.userData = { typ: "strecha", plocha: f.index };
      s.skupDum.add(m);
      s.skupDum.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(f.body.map(b => new THREE.Vector3(...b))), new THREE.LineBasicMaterial({ color: "#1f2937" })));
    }
    // přístřešek (sloupky + vazník) nebo přístavek (zděné stěny)
    for (const pr of pristavky(n)) {
      const P3 = (si, dist, y) => { const [x, z] = pr.bod(si, dist); return [x, y, z]; };
      if (pr.typ === "pristavek") {
        const matZed = new THREE.MeshStandardMaterial({ color: "#ece6da", side: THREE.DoubleSide, roughness: 0.95 });
        const steny3 = [
          // vnější stěna
          { obrys: [[pr.s0, 0], [pr.s1, 0], [pr.s1, pr.yOut], [pr.s0, pr.yOut]], na3d: ([si, y]) => P3(si, pr.D, y) },
          // boční stěny (lichoběžník od domu ven)
          ...[pr.s0, pr.s1].map(si => ({ obrys: [[0, 0], [pr.D, 0], [pr.D, pr.yOut], [0, pr.yIn]], na3d: ([dist, y]) => P3(si, dist, y) })),
        ];
        for (const st of steny3) {
          const m = meshZObrysu(st.obrys, st.na3d, () => [0, 0], matZed);
          m.userData.typ = "ignor";
          s.skupDum.add(m);
        }
      } else {
        const matDrevo = new THREE.MeshStandardMaterial({ color: "#b8834a", roughness: 0.8 });
        const pocet = Math.max(1, Math.ceil((pr.s1 - pr.s0) / 3));
        for (let i = 0; i <= pocet; i++) {
          const si = pr.s0 + ((pr.s1 - pr.s0) * i) / pocet;
          const sloup = new THREE.Mesh(new THREE.BoxGeometry(0.14, pr.vyska(pr.D) - 0.1, 0.14), matDrevo);
          sloup.position.set(...P3(si, pr.D, (pr.vyska(pr.D) - 0.1) / 2));
          sloup.userData.typ = "ignor";
          s.skupDum.add(sloup);
        }
        const tram = valec(P3(pr.s0 - 0.1, pr.D, pr.vyska(pr.D) - 0.15), P3(pr.s1 + 0.1, pr.D, pr.vyska(pr.D) - 0.15), 0.08, matDrevo);
        tram.userData.typ = "ignor";
        s.skupDum.add(tram);
      }
    }

    // kóty
    const L = n.delka / 2, W = n.sirka / 2;
    const klik = (...a) => (el) => kotaKlikRef.current?.(...a, el);
    const k1 = stitek3d(`${cislo(n.delka)} m`, {}, klik("dum", "delka", "Délka domu", n.delka)); k1.position.set(0, 0.1, W + 0.8); s.skupPom.add(k1);
    const k2 = stitek3d(`${cislo(n.sirka)} m`, {}, klik("dum", "sirka", "Šířka domu", n.sirka)); k2.position.set(L + 0.8, 0.1, 0); s.skupPom.add(k2);
    const k3 = stitek3d(`okap ${cislo(n.vyskaOkapu)} m`, {}, klik("dum", "vyskaOkapu", "Výška okapu", n.vyskaOkapu)); k3.position.set(L + 0.3, n.vyskaOkapu, W + 0.3); s.skupPom.add(k3);
    if (n.strecha !== "plocha") {
      const vrch = plochy.flatMap(f => f.body).reduce((a, b) => (b[1] > a[1] ? b : a));
      const k4 = stitek3d(`hřeben ${cislo(vyskaHrebene(n))} m`, {}, klik("hreben", null, "Výška hřebene", vyskaHrebene(n))); k4.position.set(vrch[0], vrch[1] + 0.5, vrch[2]); s.skupPom.add(k4);
    }
    // délky střechy (klepnutím jde zadat přesná délka)
    {
      const S = soustavaStrechy(n), ds = delkyStrechy(n), p = Math.max(0, Number(n.presah) || 0);
      const doSveta = (rx, y, rz) => [rx * S.c + rz * S.s, y, -rx * S.s + rz * S.c];
      const hr = vyskaHrebene(n);
      const styl = { background: "#7c2d12", color: "#fff", border: "none" };
      const ko = stitek3d(`střecha u okapu ${cislo(ds.okap)} m`, styl, klik("strecha", "okap", "Délka střechy u okapu (podél hřebene)", ds.okap));
      ko.position.set(...doSveta(0, n.vyskaOkapu - 0.15, S.B / 2 + p + 0.2)); s.skupPom.add(ko);
      const kk = stitek3d(`${n.strecha === "plocha" ? "střecha" : "krokev"} ${cislo(ds.krokev)} m`, styl, klik("strecha", "krokev", n.strecha === "plocha" ? "Druhý rozměr střechy" : "Délka krokve (od okapu k hřebeni)", ds.krokev));
      kk.position.set(...doSveta(S.A / 2 + p + 0.3, n.strecha === "plocha" ? n.vyskaOkapu : (n.vyskaOkapu + hr) / 2, n.strecha === "pultova" ? 0 : (S.B / 2 + p) / 2)); s.skupPom.add(kk);
    }
    // světové strany
    const az = (n.azimutPredni || 0) * Math.PI / 180;
    const R = Math.max(n.delka, n.sirka) / 2 + 4;
    for (const [txt, uhel] of [["S", 0], ["V", 90], ["J", 180], ["Z", 270]]) {
      const a = uhel * Math.PI / 180 - az;
      // směr s kompasovým azimutem `uhel`: x = −sin(φ), z = cos(φ), φ = uhel − azimutPredni
      const st = stitek3d(txt, { background: txt === "S" ? "#dc2626" : "#0E3B5E", color: "#fff", border: "none", fontSize: "12px" });
      st.position.set(-Math.sin(a) * R, 0.05, Math.cos(a) * R);
      s.skupPom.add(st);
    }

    // FVE
    const texV = texturaPanelu(false), texS = texturaPanelu(true);
    const okV = new THREE.MeshStandardMaterial({ map: texV, roughness: 0.35, metalness: 0.3 }), okS = new THREE.MeshStandardMaterial({ map: texS, roughness: 0.35, metalness: 0.3 });
    const vybV = new THREE.MeshStandardMaterial({ map: texV, emissive: "#f5821f", emissiveIntensity: 0.45 }), vybS = new THREE.MeshStandardMaterial({ map: texS, emissive: "#f5821f", emissiveIntensity: 0.45 });
    const matOk = (naSirku) => (naSirku ? okS : okV);
    const matVyber = (naSirku) => (naSirku ? vybS : vybV);
    const matChyba = new THREE.MeshStandardMaterial({ color: "#dc2626", transparent: true, opacity: 0.8 });
    const matBlizko = new THREE.MeshStandardMaterial({ color: "#f59e0b" });
    for (const pole of n.fve) {
      const f = plochy[pole.plocha];
      if (!f) continue;
      const naSirku = pole.orientace === "sirku";
      const a = (pole.naklon || 0) * Math.PI / 180;
      const Vn = v3.add(v3.mul(f.V, Math.cos(a)), v3.mul(f.N, Math.sin(a)));
      const Nn = v3.sub(v3.mul(f.N, Math.cos(a)), v3.mul(f.V, Math.sin(a)));
      const vybrano = vybrane?.typ === "pole" && vybrane.id === pole.id;
      for (const pan of panelyPole(n, pole)) {
        const vejde = panelSeVejde(n, f, pan);
        const bl = blizko.has(`${pole.id}:${pan.r}:${pan.s}`);
        const mat = !vejde ? matChyba : vybrano ? matVyber(naSirku) : bl ? matBlizko : matOk(naSirku);
        const m = new THREE.Mesh(new THREE.BoxGeometry(pan.pw, pan.ph, 0.04), mat);
        const dolniStred = bodPlochy(f, pan.u + pan.pw / 2, pan.v, 0.12);
        const stred = v3.add(v3.add(dolniStred, v3.mul(Vn, pan.ph / 2)), v3.mul(Nn, 0.02));
        m.matrixAutoUpdate = false;
        m.matrix.makeBasis(new THREE.Vector3(...f.U), new THREE.Vector3(...Vn), new THREE.Vector3(...Nn)).setPosition(...stred);
        m.userData = { typ: "panel", poleId: pole.id, plocha: pole.plocha };
        s.skupFve.add(m);
      }
      if (vybrano) {
        const { pw } = rozmerPanelu(n, pole);
        const sirka = pole.sloupce * pw + (pole.sloupce - 1) * n.mezeraFve;
        const st = stitek3d(`${pole.radky}×${pole.sloupce} = ${pole.radky * pole.sloupce} ks · ${cislo((pole.radky * pole.sloupce * n.panel.wp) / 1000)} kWp`, { background: "#f5821f", color: "#fff", border: "none" });
        st.position.set(...bodPlochy(f, pole.u + sirka / 2, pole.v, 0.5));
        s.skupPom.add(st);
      }
    }

    // překážky na střeše
    for (const o of n.prekazky || []) {
      const f = plochy[o.plocha];
      if (!f) continue;
      const vybr = vybrane?.typ === "prekazka" && vybrane.id === o.id;
      const stred = bodPlochy(f, o.u + o.sirka / 2, o.v + o.hloubka / 2);
      const U = new THREE.Vector3(...f.U);
      let m;
      if (o.typ === "okno") {
        m = new THREE.Mesh(new THREE.BoxGeometry(o.sirka, o.hloubka, 0.08), new THREE.MeshStandardMaterial({ color: "#2b3a4a", metalness: 0.6, roughness: 0.2, emissive: vybr ? "#f5821f" : "#000", emissiveIntensity: 0.4 }));
        m.matrixAutoUpdate = false;
        m.matrix.makeBasis(U, new THREE.Vector3(...f.V), new THREE.Vector3(...f.N)).setPosition(...bodPlochy(f, o.u + o.sirka / 2, o.v + o.hloubka / 2, 0.04));
      } else {
        const sinS = Math.sin((f.sklon * Math.PI) / 180), cosS = Math.cos((f.sklon * Math.PI) / 180);
        const dole = stred[1] - (o.hloubka / 2) * sinS - 0.05, nahore = stred[1] + (Number(o.vyska) || 0.5);
        const Y = new THREE.Vector3(0, 1, 0), Z = U.clone().cross(Y).normalize();
        m = new THREE.Mesh(new THREE.BoxGeometry(o.sirka, nahore - dole, o.hloubka * cosS),
          new THREE.MeshStandardMaterial({ color: o.typ === "komin" ? "#9c4a35" : "#8a8f96", roughness: 0.9, emissive: vybr ? "#f5821f" : "#000", emissiveIntensity: 0.4 }));
        m.matrixAutoUpdate = false;
        m.matrix.makeBasis(U, Y, Z).setPosition(stred[0], (dole + nahore) / 2, stred[2]);
      }
      m.userData = { typ: "prekazka", id: o.id };
      s.skupDum.add(m);
    }

    // kóty vybraného FVE pole / komínu / okna k okrajům plochy
    {
      const jePole = vybrane?.typ === "pole";
      const prvek = jePole ? n.fve.find(p => p.id === vybrane.id) : vybrane?.typ === "prekazka" ? (n.prekazky || []).find(o => o.id === vybrane.id) : null;
      const f = prvek && plochy[prvek.plocha];
      if (f) {
        const r = obdelnikPrvku(n, prvek, jePole);
        const o = odstupy(f, r);
        const nad = 0.3;
        const nazvyStran = { vlevo: "Odstup od levé hrany", vpravo: "Odstup od pravé hrany", okap: "Odstup od okapu", hreben: "Odstup od hřebene / horní hrany" };
        const kota3d = (a, b, hodnota, popis, strana) => {
          const A = bodPlochy(f, a[0], a[1], nad), B = bodPlochy(f, b[0], b[1], nad);
          const barva = hodnota < -0.005 ? "#dc2626" : "#f5821f";
          const mat = new THREE.LineBasicMaterial({ color: barva, depthTest: false });
          const smer = v3.norm(v3.sub(B, A)), kolmo = v3.cross(f.N, smer);
          const car = [A, B, v3.add(A, v3.mul(kolmo, 0.15)), v3.sub(A, v3.mul(kolmo, 0.15)), v3.add(B, v3.mul(kolmo, 0.15)), v3.sub(B, v3.mul(kolmo, 0.15))];
          const g = new THREE.BufferGeometry().setFromPoints(car.map(q => new THREE.Vector3(...q)));
          const l = new THREE.LineSegments(g, mat);
          l.renderOrder = 10;
          s.skupPom.add(l);
          const st = stitek3d(`${popis} ${cislo(hodnota)} m`, { background: barva, color: "#fff", border: "none", fontSize: "11px" },
            (el) => kotaKlikRef.current?.("odstup", { prvekId: prvek.id, jePole, strana }, nazvyStran[strana], hodnota, el));
          st.position.set(...v3.mul(v3.add(A, B), 0.5));
          s.skupPom.add(st);
        };
        kota3d([o.rh[0], o.vm], [r.u, o.vm], o.vlevo, "◀", "vlevo");
        kota3d([r.u + r.w, o.vm], [o.rh[1], o.vm], o.vpravo, "▶", "vpravo");
        kota3d([o.um, o.rv[0]], [o.um, r.v], o.okap, "▼ okap", "okap");
        kota3d([o.um, r.v + r.h], [o.um, o.rv[1]], o.hreben, "▲ hřeben", "hreben");
      }
    }

    // hromosvod
    const hs = n.hromosvod || {};
    const matDrat = new THREE.MeshStandardMaterial({ color: "#b9c2cb", metalness: 0.75, roughness: 0.3 });
    const matDratVyber = new THREE.MeshStandardMaterial({ color: "#f5821f", emissive: "#f5821f", emissiveIntensity: 0.3 });
    const matPodp = new THREE.MeshStandardMaterial({ color: "#2f3640", roughness: 0.6 });
    const matSvorka = new THREE.MeshStandardMaterial({ color: "#4b5563", metalness: 0.5, roughness: 0.4 });
    const zkusebniSvorka = (g, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), matSvorka);
      m.position.set(x, 1.6, z);
      g.add(m);
    };
    // číslování zkušebních svorek: nejdřív svody, pak ručně kreslené svody k zemi (stejně jako v PDF)
    const stitekZs = (cisloZs, x, z) => {
      const st = stitek3d(`ZS${cisloZs}`, { background: "#0E3B5E", color: "#fff", border: "2px solid #fff", fontSize: "12px", padding: "2px 7px" });
      st.position.set(x, 2.15, z);
      s.skupPom.add(st);
    };
    let cisloRucne = (hs.svody || []).length;
    for (const ved of hs.vedeni || []) {
      const g = new THREE.Group();
      g.userData = { typ: "vedeni", id: ved.id };
      const d = drahaVedeni(n, ved.body);
      kresliVodic(n, g, d, vybrane?.typ === "vedeni" && vybrane.id === ved.id ? matDratVyber : matDrat, matPodp);
      const k = d[d.length - 1];
      if (k[1] < 0.3 && d.length > 1 && d[d.length - 2][1] > 1.8) zkusebniSvorka(g, k[0], k[2]);
      const kon = ved.body[ved.body.length - 1];
      if (jePevny(kon) && kon[1] < 0.3) stitekZs(++cisloRucne, k[0], k[2]);
      s.skupHs.add(g);
    }
    for (const [iSv, sv] of (hs.svody || []).entries()) {
      const g = new THREE.Group();
      g.userData = { typ: "svod", id: sv.id };
      const t = trasaSvodu(n, sv);
      kresliVodic(n, g, t, vybrane?.typ === "svod" && vybrane.id === sv.id ? matDratVyber : matDrat, matPodp);
      zkusebniSvorka(g, t[0][0], t[0][2]);
      stitekZs(iSv + 1, t[0][0], t[0][2]);
      s.skupHs.add(g);
    }
    // spoje: svorka tam, kde vodič navazuje, červeně volný konec
    const matVolny = new THREE.MeshBasicMaterial({ color: "#dc2626" });
    const matZem = new THREE.MeshStandardMaterial({ color: "#7c4a1e" });
    for (const sp of spoje(n)) {
      const m = sp.propojeno
        ? new THREE.Mesh(sp.zem ? new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12) : new THREE.BoxGeometry(0.11, 0.11, 0.11), sp.zem ? matZem : matSvorka)
        : new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), matVolny);
      m.position.set(...sp.bod);
      m.userData.typ = "ignor";
      s.skupHs.add(m);
      if (!sp.propojeno) {
        const st = stitek3d("nepropojeno", { background: "#dc2626", color: "#fff", border: "none", fontSize: "10px" });
        st.position.set(sp.bod[0], sp.bod[1] + 0.45, sp.bod[2]);
        s.skupPom.add(st);
      }
    }
    for (const ty of hs.tyce || []) {
      const g = new THREE.Group();
      g.userData = { typ: "tyc", id: ty.id };
      const p = patyTyce(n, ty);
      const mat = vybrane?.typ === "tyc" && vybrane.id === ty.id ? matDratVyber : matDrat;
      g.add(valec(p, [p[0], p[1] + ty.vyska, p[2]], 0.03, mat));
      const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.08, 16), new THREE.MeshStandardMaterial({ color: "#6b7280" }));
      pata.position.set(p[0], p[1] + 0.04, p[2]);
      g.add(pata);
      if (hs.zony) {
        const uhel = (Number(hs.uhel) || 70) * Math.PI / 180;
        const h = ty.vyska;
        const kuzel = new THREE.Mesh(new THREE.ConeGeometry(h * Math.tan(uhel), h, 40, 1, true),
          new THREE.MeshBasicMaterial({ color: "#16a34a", transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
        kuzel.position.set(p[0], p[1] + h / 2, p[2]);
        kuzel.userData.typ = "ignor";
        g.add(kuzel);
      }
      s.skupHs.add(g);
    }
    if (hs.zemnic) {
      const o = 1;
      const body = [[-L - o, W + o], [L + o, W + o], [L + o, -W - o], [-L - o, -W - o], [-L - o, W + o]].map(([x, z]) => new THREE.Vector3(x, 0.03, z));
      const car = new THREE.Line(new THREE.BufferGeometry().setFromPoints(body), new THREE.LineDashedMaterial({ color: "#7c4a1e", dashSize: 0.4, gapSize: 0.25 }));
      car.computeLineDistances();
      s.skupPom.add(car);
    }
    // valivá koule: body střechy (zelená = chráněno, červená = koule se dotkne) a koule nad plochami
    if (koule) {
      kresliKouli(s.skupPom, koule);
      for (const k of koule.koule) {
        const st = stitek3d(k.rezerva < 0 ? `koule se dotkne (${k.nazev})` : `rezerva ${cislo(k.rezerva)} m`, { background: k.rezerva < 0 ? "#dc2626" : "#0369a1", color: "#fff", border: "none", fontSize: "10px" });
        st.position.set(k.bodStrechy[0], k.bodStrechy[1] + 0.6, k.bodStrechy[2]);
        s.skupPom.add(st);
      }
    }
    // rozkreslené vedení
    if (rozpracovane.length) {
      const d = drahaVedeni(n, rozpracovane);
      const mat = new THREE.MeshBasicMaterial({ color: "#eab308" });
      for (let i = 1; i < d.length; i++) s.skupPom.add(valec(d[i - 1], d[i], 0.045, mat));
      for (const b of rozpracovane) {
        const k = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), mat);
        k.position.set(...poziceBodu(n, b));
        s.skupPom.add(k);
      }
    }
    // měření
    for (const mr of n.mereni || []) {
      s.skupPom.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...mr.a), new THREE.Vector3(...mr.b)]), new THREE.LineBasicMaterial({ color: "#7c3aed", depthTest: false })));
      const st = stitek3d(`${cislo(v3.dist(mr.a, mr.b))} m`, { background: "#7c3aed", color: "#fff", border: "none" });
      st.position.set(...v3.mul(v3.add(mr.a, mr.b), 0.5));
      s.skupPom.add(st);
    }
    if (merBod) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), new THREE.MeshBasicMaterial({ color: "#7c3aed" }));
      k.position.set(...merBod);
      s.skupPom.add(k);
    }
  }, [navrh, plochy, vybrane, rozpracovane, merBod, blizko, koule]);

  // ── Akce v rezimech (čerstvé closure při každém renderu) ──
  // Bod vedení z klepnutí: na střeše se přichytí k rohům, hřebenu a jiným
  // vodičům; na stěně vznikne pevný bod na fasádě (svisle pod předchozím bodem),
  // na zemi konec svodu.
  const bodVedeni = (hit) => {
    if (!hit) return null;
    const posl = rozpracovane[rozpracovane.length - 1];
    const pp = posl && poziceBodu(navrh, posl);
    const [hx, hy, hz] = hit.bod;
    if (hit.typ === "zem") {
      // ze stěny vždy svisle dolů, ze střechy přes okraj po fasádě (viz svodKZemi)
      if (pp && (jePevny(posl) || Math.hypot(pp[0] - hx, pp[2] - hz) < 1.5)) {
        const w = nejblizsiStena(navrh, pp[0], pp[2]);
        if (jePevny(posl)) return { bod: [pp[0], 0, pp[2], 1], prichyceno: true };
        return { bod: [w.x + w.ven[0] * ODSTUP_FASADA, 0, w.z + w.ven[2] * ODSTUP_FASADA, 1], prichyceno: true, svod: true };
      }
      return { bod: [hx, 0, hz, 1], prichyceno: false };
    }
    const podStrechou = hy < vyskaStrechy(navrh, hx, hz) - 0.3;
    if (hit.typ === "stena" || (["vedeni", "svod"].includes(hit.typ) && podStrechou)) {
      const w = nejblizsiStena(navrh, hx, hz);
      let si = w.si, prichyceno = false;
      if (pp) {
        const wp = nejblizsiStena(navrh, pp[0], pp[2]);
        if (wp.st.id === w.st.id && Math.abs(wp.si - si) < 0.6) { si = wp.si; prichyceno = true; }
      }
      if (!prichyceno && si < 0.4) { si = 0; prichyceno = true; }
      else if (!prichyceno && si > w.st.delka - 0.4) { si = w.st.delka; prichyceno = true; }
      const x = w.st.a[0] + w.st.dir[0] * si, z = w.st.a[1] + w.st.dir[1] * si;
      const y = Math.max(0, Math.min(hy, vyskaStrechy(navrh, x, z) - 0.1));
      return { bod: [x + w.ven[0] * ODSTUP_FASADA, y, z + w.ven[2] * ODSTUP_FASADA, 1], prichyceno };
    }
    const kand = [];
    for (const f of plochy) f.body.forEach((b, i) => { kand.push(b); kand.push(v3.mul(v3.add(b, f.body[(i + 1) % f.body.length]), 0.5)); });
    for (const ved of navrh.hromosvod?.vedeni || []) kand.push(...ved.body.filter(b => !jePevny(b)));
    for (const sv of navrh.hromosvod?.svody || []) kand.push(trasaSvodu(navrh, sv)[2]);
    kand.push(...rozpracovane.filter(b => !jePevny(b)));
    let nej = null, d = 0.5;
    for (const k of kand) { const dd = Math.hypot(k[0] - hx, k[2] - hz); if (dd < d) { d = dd; nej = k; } }
    if (nej) return { bod: [nej[0], 0, nej[2]], prichyceno: true };
    // jinak k nejbližšímu místu na hraně střechy (hřeben, nároží, okraj) nebo na vodiči
    const useky = [];
    for (const f of plochy) f.body.forEach((b, i) => useky.push([b, f.body[(i + 1) % f.body.length]]));
    for (const ved of navrh.hromosvod?.vedeni || []) {
      const dr = drahaVedeni(navrh, ved.body.filter(b => !jePevny(b)));
      for (let i = 1; i < dr.length; i++) useky.push([dr[i - 1], dr[i]]);
    }
    let lepsi = null; d = 0.4;
    for (const [a, b] of useky) {
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const t = Math.max(0, Math.min(1, ((hx - a[0]) * dx + (hz - a[2]) * dz) / (dx * dx + dz * dz || 1)));
      const qx = a[0] + t * dx, qz = a[2] + t * dz, dd = Math.hypot(hx - qx, hz - qz);
      if (dd < d) { d = dd; lepsi = [qx, 0, qz]; }
    }
    return lepsi ? { bod: lepsi, prichyceno: true } : { bod: [hx, 0, hz], prichyceno: false };
  };
  // Posun svodu po obvodu domu; krátké vedení, které na svod navazuje
  // (spojka na hřeben), se posune s ním, aby zůstalo propojené.
  const presunSvod = (id, x, z, { doHistorie = true, presne = false } = {}) => {
    const w = nejblizsiStena(navrh, x, z);
    let si = w.si;
    if (!presne) {
      si = Math.round(si / 0.05) * 0.05;
      if (si < 0.3) si = 0; else if (si > w.st.delka - 0.3) si = w.st.delka;
    }
    si = Math.max(0, Math.min(w.st.delka, si));
    const nx = w.st.a[0] + w.st.dir[0] * si, nz = w.st.a[1] + w.st.dir[1] * si;
    zmen(n => {
      const h = n.hromosvod || {};
      const stary = (h.svody || []).find(q => q.id === id);
      if (!stary) return n;
      const a = trasaSvodu(n, stary)[2], b = trasaSvodu(n, { ...stary, x: nx, z: nz })[2];
      const vedeni = (h.vedeni || []).map(v => (v.body.length === 2
        ? { ...v, body: v.body.map(q => (!jePevny(q) && Math.hypot(q[0] - a[0], q[2] - a[2]) < 0.3 ? [b[0], 0, b[2]] : q)) }
        : v));
      return { ...n, hromosvod: { ...h, vedeni, svody: h.svody.map(q => (q.id === id ? { ...q, x: nx, z: nz } : q)) } };
    }, { doHistorie });
  };
  const polohaSvodu = (sv) => {
    const w = nejblizsiStena(navrh, sv.x, sv.z);
    const roh = w.si < 0.01 || w.si > w.st.delka - 0.01;
    return { ...w, text: roh ? `roh – ${w.st.nazev.toLowerCase()} stěna` : `${w.st.nazev} stěna, ${cislo(w.si)} m od levého rohu` };
  };
  const nastavSvod = (id, stenaId, si) => {
    const st = steny(navrh).find(x => x.id === stenaId);
    const k = Math.max(0, Math.min(st.delka, si));
    presunSvod(id, st.a[0] + st.dir[0] * k, st.a[1] + st.dir[1] * k, { presne: true });
  };

  const dokoncitVedeni = (body = rozpracovane) => {
    if (body.length >= 2) {
      const id = noveId("v");
      zmenHs(h => ({ vedeni: [...(h.vedeni || []), { id, body }] }));
      setVybrane({ typ: "vedeni", id });
    }
    setRozpracovane([]);
  };
  // Z posledního bodu svod přes okraj střechy po fasádě až k zemi.
  const svodKZemi = () => {
    const posl = rozpracovane[rozpracovane.length - 1];
    if (!posl) return;
    const pp = poziceBodu(navrh, posl);
    const w = nejblizsiStena(navrh, pp[0], pp[2]);
    const x = w.x + w.ven[0] * ODSTUP_FASADA, z = w.z + w.ven[2] * ODSTUP_FASADA;
    const nove = [];
    if (!(jePevny(posl) && Math.hypot(pp[0] - x, pp[2] - z) < 0.05)) nove.push([x, Math.max(0.5, Math.min(pp[1], vyskaStrechy(navrh, w.x, w.z)) - 0.1), z, 1]);
    nove.push([x, 0, z, 1]);
    dokoncitVedeni([...rozpracovane, ...nove]);
  };

  useEffect(() => {
    if (!sc.current) return;
    sc.current.akce = {
      dolu: (hit, e, raycaster) => {
        if (rezim === "svod" && hit?.typ === "svod") {
          sc.current.tazeni = { druh: "svody", id: hit.id, zapsano: false };
          sc.current.controls.enabled = false;
          setVybrane({ typ: "svod", id: hit.id });
          setZalozka("hromosvod");
          e.preventDefault();
          return;
        }
        const jePole = rezim === "fve" && hit?.typ === "panel";
        const jePrek = (rezim === "fve" || rezim === "prekazka") && hit?.typ === "prekazka";
        if (!jePole && !jePrek) return;
        const pole = jePole ? navrh.fve.find(p => p.id === hit.poleId) : (navrh.prekazky || []).find(o => o.id === hit.id);
        const f = plochy[pole?.plocha];
        if (!pole || !f) return;
        const rovina = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...f.N), new THREE.Vector3(...f.O));
        const bod = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(rovina, bod)) return;
        const d = v3.sub([bod.x, bod.y, bod.z], f.O);
        sc.current.tazeni = { druh: jePole ? "fve" : "prekazky", id: pole.id, f, rovina, u0: pole.u, v0: pole.v, su: v3.dot(d, f.U), sv: v3.dot(d, f.V), zapsano: false };
        sc.current.controls.enabled = false;
        setVybrane({ typ: jePole ? "pole" : "prekazka", id: pole.id });
        setZalozka("fve");
        e.preventDefault();
      },
      tah: (raycaster) => {
        const t = sc.current.tazeni;
        if (t.druh === "svody") {
          const b = new THREE.Vector3();
          if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.5), b)) return;
          presunSvod(t.id, b.x, b.z, { doHistorie: !t.zapsano });
          t.zapsano = true;
          return;
        }
        const bod = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(t.rovina, bod)) return;
        const d = v3.sub([bod.x, bod.y, bod.z], t.f.O);
        const kr = (x) => Math.round(x / 0.05) * 0.05;
        const u = kr(t.u0 + v3.dot(d, t.f.U) - t.su), v = kr(t.v0 + v3.dot(d, t.f.V) - t.sv);
        zmen(n => ({ ...n, [t.druh]: (n[t.druh] || []).map(p => p.id === t.id ? { ...p, u, v } : p) }), { doHistorie: !t.zapsano });
        t.zapsano = true;
      },
      najezd: (hit) => {
        const g = sc.current?.skupNahled;
        if (!g) return;
        vycisti(g);
        if (rezim !== "vedeni" || !hit) return;
        const r = bodVedeni(hit);
        if (!r) return;
        const poz = poziceBodu(navrh, r.bod);
        const znacka = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), new THREE.MeshBasicMaterial({ color: r.prichyceno ? "#16a34a" : "#eab308" }));
        znacka.position.set(...poz);
        g.add(znacka);
        const posl = rozpracovane[rozpracovane.length - 1];
        if (posl) {
          const d = drahaVedeni(navrh, [posl, r.bod]);
          const mat = new THREE.MeshBasicMaterial({ color: "#eab308", transparent: true, opacity: 0.7 });
          for (let i = 1; i < d.length; i++) g.add(valec(d[i - 1], d[i], 0.03, mat));
          const delka = d.slice(1).reduce((s, q, i) => s + v3.dist(q, d[i]), 0);
          const st = stitek3d(`${cislo(delka)} m`, { background: "#eab308", color: "#1a1a1a", border: "none" });
          st.position.set(poz[0], poz[1] + 0.4, poz[2]);
          g.add(st);
        }
      },
      konecTahu: () => {
        if (!sc.current?.tazeni) return;
        sc.current.tazeni = null;
        sc.current.controls.enabled = true;
      },
      klik: (hit) => {
        if (rezim === "pohled" || (rezim === "fve" && hit?.typ === "panel") || (["fve", "prekazka"].includes(rezim) && hit?.typ === "prekazka")) {
          if (!hit) return setVybrane(null);
          if (hit.typ === "panel") { setVybrane({ typ: "pole", id: hit.poleId }); setZalozka("fve"); }
          else if (hit.typ === "prekazka") { setVybrane({ typ: "prekazka", id: hit.id }); setZalozka("fve"); }
          else if (["vedeni", "svod", "tyc"].includes(hit.typ)) { setVybrane({ typ: hit.typ, id: hit.id }); setZalozka("hromosvod"); }
          else setVybrane(null);
          return;
        }
        if (!hit) return;
        if (rezim === "fve" && hit.typ === "strecha") {
          const f = plochy[hit.plocha];
          const d = v3.sub(hit.bod, f.O);
          const naklon = f.sklon < 5 ? Number(novePole.naklon) || 0 : 0;
          const pole = { id: noveId("f"), plocha: f.index, radky: Number(novePole.radky) || 1, sloupce: Number(novePole.sloupce) || 1, orientace: novePole.orientace, naklon, u: 0, v: 0 };
          const { pw } = rozmerPanelu(navrh, pole);
          const sirka = pole.sloupce * pw + (pole.sloupce - 1) * navrh.mezeraFve;
          const hloubka = panelyPole(navrh, pole).reduce((m, p) => Math.max(m, p.v + p.hloubka), 0);
          pole.u = Math.round((v3.dot(d, f.U) - sirka / 2) / 0.05) * 0.05;
          pole.v = Math.round((v3.dot(d, f.V) - hloubka / 2) / 0.05) * 0.05;
          zmen(n => ({ ...n, fve: [...n.fve, pole] }));
          setVybrane({ typ: "pole", id: pole.id });
          setZalozka("fve");
        } else if (rezim === "prekazka" && hit.typ === "strecha") {
          const f = plochy[hit.plocha];
          const d = v3.sub(hit.bod, f.O);
          const vz = rozmeryNove[novaPrekazka] || TYPY_PREKAZEK[novaPrekazka];
          const o = { id: noveId("o"), typ: novaPrekazka, plocha: f.index, sirka: vz.sirka, hloubka: vz.hloubka, vyska: vz.vyska,
            u: Math.round((v3.dot(d, f.U) - vz.sirka / 2) / 0.05) * 0.05, v: Math.round((v3.dot(d, f.V) - vz.hloubka / 2) / 0.05) * 0.05 };
          zmen(n => ({ ...n, prekazky: [...(n.prekazky || []), o] }));
          setVybrane({ typ: "prekazka", id: o.id });
          setZalozka("fve");
        } else if (rezim === "vedeni") {
          const r = bodVedeni(hit);
          if (!r) return;
          const posl = rozpracovane[rozpracovane.length - 1];
          if (posl && v3.dist(poziceBodu(navrh, posl), poziceBodu(navrh, r.bod)) < 0.05) return dokoncitVedeni();
          if (r.svod) return svodKZemi();
          if (jePevny(r.bod) && r.bod[1] === 0 && rozpracovane.length) return dokoncitVedeni([...rozpracovane, r.bod]);
          setRozpracovane(x => [...x, r.bod]);
        } else if (rezim === "svod" && hit.typ === "stena") {
          const st = steny(navrh).find(x => x.id === hit.stena);
          let si = (hit.bod[0] - st.a[0]) * st.dir[0] + (hit.bod[2] - st.a[1]) * st.dir[1];
          si = Math.max(0, Math.min(st.delka, si));
          if (si < 0.4) si = 0; else if (si > st.delka - 0.4) si = st.delka;
          const id = noveId("s");
          zmenHs(h => ({ svody: [...(h.svody || []), { id, x: st.a[0] + st.dir[0] * si, z: st.a[1] + st.dir[1] * si }] }));
          setVybrane({ typ: "svod", id });
        } else if (rezim === "tyc" && (hit.typ === "strecha" || hit.typ === "vedeni")) {
          const id = noveId("t");
          zmenHs(h => ({ tyce: [...(h.tyce || []), { id, x: hit.bod[0], z: hit.bod[2], vyska: Number(vyskaTyce) || 2 }] }));
          setVybrane({ typ: "tyc", id });
        } else if (rezim === "merit") {
          if (!merBod) setMerBod(hit.bod);
          else { const a = merBod; zmen(n => ({ ...n, mereni: [...(n.mereni || []), { id: noveId("m"), a, b: hit.bod }] })); setMerBod(null); }
        } else if (rezim === "mazat") {
          if (hit.typ === "panel") zmen(n => ({ ...n, fve: n.fve.filter(p => p.id !== hit.poleId) }));
          else if (hit.typ === "prekazka") zmen(n => ({ ...n, prekazky: (n.prekazky || []).filter(x => x.id !== hit.id) }));
          else if (hit.typ === "vedeni") zmenHs(h => ({ vedeni: h.vedeni.filter(x => x.id !== hit.id) }));
          else if (hit.typ === "svod") zmenHs(h => ({ svody: h.svody.filter(x => x.id !== hit.id) }));
          else if (hit.typ === "tyc") zmenHs(h => ({ tyce: h.tyce.filter(x => x.id !== hit.id) }));
          setVybrane(null);
        }
      },
    };
  });

  useEffect(() => {
    const f = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;
      if (e.key === "Enter" && rozpracovane.length) dokoncitVedeni();
      if (e.key === "Escape") { setRozpracovane([]); setMerBod(null); setVybrane(null); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); zpet(); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  const zmenRezim = (r) => { setRezim(r); setRozpracovane([]); setMerBod(null); if (sc.current) vycisti(sc.current.skupNahled); };

  const pohled = (kam) => {
    const s = sc.current; if (!s) return;
    const D = Math.max(navrh.delka, navrh.sirka) * 1.9 + 6;
    const h = vyskaHrebene(navrh) / 2;
    const poz = { predni: [0, h + 2, D], zadni: [0, h + 2, -D], leva: [-D, h + 2, 0], prava: [D, h + 2, 0], shora: [0, D * 1.2, 0.01], "3d": [D * 0.7, D * 0.55, D * 0.85] }[kam];
    s.camera.position.set(...poz);
    s.controls.target.set(0, h, 0);
    s.controls.update();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { pohled("3d"); }, [navrh.id]);

  // ── Montážní dokumentace: snímky pohledů v pevném rozlišení + PDF ──
  const montazniDokumentace = async () => {
    const s = sc.current;
    if (!s) return;
    setGeneruji(true);
    const pozice = s.camera.position.clone(), cil = s.controls.target.clone();
    try {
      s.renderer.setSize(1200, 800, false);
      s.camera.aspect = 1.5; s.camera.updateProjectionMatrix();
      const snimky = {}, snimkyKoule = {};
      const kouleObjekty = [];
      s.scene.traverse(o => { if (o.userData?.koule) kouleObjekty.push(o); });
      kouleObjekty.forEach(o => { o.visible = false; });
      for (const k of ["3d", "predni", "prava", "zadni", "leva", "shora"]) {
        pohled(k);
        s.renderer.render(s.scene, s.camera);
        snimky[k] = s.renderer.domElement.toDataURL("image/jpeg", 0.9);
      }
      kouleObjekty.forEach(o => { o.visible = true; });
      // pohledy s valivou koulí (výrazněji vykreslenou)
      const vyhodnoceni = valivaKoule(navrh);
      const docasna = new THREE.Group();
      kresliKouli(docasna, vyhodnoceni, { silne: true, jenBody: true });
      kouleObjekty.forEach(o => { o.visible = false; });
      s.scene.add(docasna);
      for (const k of ["3d"]) {
        pohled(k);
        s.renderer.render(s.scene, s.camera);
        snimkyKoule[k] = s.renderer.domElement.toDataURL("image/jpeg", 0.9);
      }
      s.scene.remove(docasna);
      vycisti(docasna);
      kouleObjekty.forEach(o => { o.visible = true; });
      s.camera.position.copy(pozice); s.controls.target.copy(cil); s.controls.update();
      s.resize();
      await vytvorMontazniDokumentaci({ navrh, snimky, snimkyKoule, koule: vyhodnoceni, radkySoupisu });
    } catch (e) {
      window.alert("Montážní dokumentaci se nepodařilo vytvořit: " + (e?.message || e));
    } finally {
      s.camera.position.copy(pozice); s.controls.target.copy(cil); s.controls.update();
      s.resize();
      setGeneruji(false);
    }
  };

  // ── Správa návrhů ──
  const novy = () => { historie.current = []; setNavrh(vychoziNavrh()); setVybrane(null); setZalozka("rozmery"); };
  // Otevře návrh: novější verze vyhrává (v zařízení, nebo v databázi).
  const otevrit = async (id) => {
    const mistni = navrhy.find(q => q.id === id);
    const vDb = cloudSeznam.find(q => q.id === id);
    historie.current = []; setVybrane(null);
    if (vDb && (!mistni || new Date(vDb.updated_at) > new Date(mistni.upraveno || 0))) {
      try {
        setStavDb("nacitam");
        const x = await nactiNavrh(id);
        posledniUlozeni.current = JSON.stringify({ ...x, upraveno: null });
        setNavrh({ ...vychoziNavrh(), ...x });
        setStavDb("ok");
        return;
      } catch { setStavDb("chyba"); }
    }
    if (mistni) setNavrh(mistni);
  };
  const smazatNavrh = async () => {
    const vDb = cloudSeznam.some(x => x.id === navrh.id);
    if (!window.confirm(vDb ? `Smazat návrh „${navrh.nazev}“ pro všechny (z databáze i z tohoto zařízení)?` : `Smazat návrh „${navrh.nazev}“ z tohoto zařízení?`)) return;
    if (vDb) {
      try { await smazNavrh(navrh.id); } catch { window.alert("Návrh se nepodařilo smazat z databáze."); return; }
      setCloudSeznam(prev => prev.filter(x => x.id !== navrh.id));
    }
    const zbytek = navrhy.filter(x => x.id !== navrh.id);
    ulozNavrhy(zbytek); setNavrhy(zbytek);
    historie.current = [];
    setNavrh(zbytek[0] || vychoziNavrh());
  };
  const stahnout = (nazev, obsah, typ) => {
    const a = document.createElement("a");
    a.href = typeof obsah === "string" && obsah.startsWith("data:") ? obsah : URL.createObjectURL(new Blob([obsah], { type: typ }));
    a.download = nazev; a.click();
  };
  const souborNazev = (navrh.nazev || "navrh").replace(/[^\p{L}\p{N}_-]+/gu, "_");
  const exportPng = () => stahnout(`${souborNazev}.png`, sc.current.renderer.domElement.toDataURL("image/png"));
  const exportJson = () => stahnout(`${souborNazev}.navrh3d.json`, JSON.stringify(navrh), "application/json");
  const importJson = async (file) => {
    try {
      const x = JSON.parse(await file.text());
      if (!x || typeof x !== "object" || !Array.isArray(x.fve)) throw new Error();
      historie.current = [];
      setNavrh({ ...vychoziNavrh(), ...x, id: noveId("n") });
    } catch { window.alert("Soubor není platný návrh."); }
  };

  const radkySoupisu = (() => {
    const r = [];
    const s = souhrn;
    if (s.panelu) {
      r.push([`Fotovoltaický panel ${navrh.panel.wp} Wp (${cislo(navrh.panel.sirka, 3)} × ${cislo(navrh.panel.vyska, 3)} m)`, s.panelu, "ks"]);
      r.push(["Instalovaný výkon", cislo(s.kwp), "kWp"]);
      r.push(["Plocha panelů", cislo(s.plochaPanelu, 1), "m²"]);
      for (const p of s.poPlochach) r.push([`  z toho ${p.nazev} (sklon ${Math.round(p.sklon)}°)`, `${p.pocet} ks / ${cislo(p.kwp)} kWp`, ""]);
    }
    if (s.jimaci) r.push(["Jímací vedení AlMgSi Ø8 (vč. 10 % rezervy)", Math.ceil(s.jimaci * 1.1), "m"]);
    if (s.pocetSvodu) r.push(["Svody AlMgSi Ø8 (vč. 10 % rezervy)", Math.ceil(s.svodyDelka * 1.1), "m"]);
    if (s.jimaci) r.push(["Podpěry vedení na střechu (á 1 m)", s.podperyStrecha, "ks"]);
    if (s.pocetSvodu) {
      r.push(["Podpěry vedení na fasádu (á 1 m)", s.podperyStena, "ks"]);
      r.push(["Zkušební svorky", s.svorkyZkusebni, "ks"]);
      r.push(["Ochranné úhelníky svodů", s.pocetSvodu, "ks"]);
    }
    if (s.tyci) r.push(["Jímací tyče", s.tyci, "ks"]);
    {
      const rv = { ...rz.vychoziRiziko(navrh), ...(navrh.riziko || {}), L: navrh.riziko?.L || navrh.delka, W: navrh.riziko?.W || navrh.sirka, H: navrh.riziko?.H || vyskaHrebene(navrh) };
      const spdPos = rz.posouzeniNavrhu(rv, (navrh.hromosvod?.vedeni || []).length ? (navrh.hromosvod?.trida || "III") : "").spd;
      if (spdPos) for (const p of rz.navrhSpd(rv, spdPos, { blizkoFve: s.blizko, maFve: s.panelu > 0 }).polozky) r.push([`${p.typ} – ${p.nazev} (${p.text})`, p.id === "fve-dc" ? "dle počtu MPPT" : 1, p.id === "fve-dc" ? "" : "ks"]);
    }
    if (s.zemnic) {
      r.push(["Zemnič FeZn 30×4 (obvodový, 1 m od domu)", Math.ceil(s.zemnic), "m"]);
      if (s.pocetSvodu) r.push(["Zemnící vodič FeZn Ø10 ke zkušební svorce", s.pocetSvodu * 2, "m"]);
    }
    return r;
  })();
  const exportCsv = () => stahnout(`${souborNazev}_soupis.csv`, "﻿" + [["Položka", "Množství", "Jednotka"], ...radkySoupisu].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n"), "text/csv");

  const vybranePole = vybrane?.typ === "pole" ? navrh.fve.find(p => p.id === vybrane.id) : null;
  // Zadání odstupů od okrajů plochy — posune prvek na přesné místo.
  const odstupyPrvku = (prvek, jePole) => {
    const f = plochy[prvek.plocha];
    if (!f) return null;
    const r = obdelnikPrvku(navrh, prvek, jePole);
    const o = odstupy(f, r);
    const nastav = (strana) => (hodnota) => {
      const nova = polohaPodleOdstupu(f, r, strana, Number(hodnota) || 0);
      const kam = jePole ? "fve" : "prekazky";
      zmen(n => ({ ...n, [kam]: (n[kam] || []).map(x => (x.id === prvek.id ? { ...x, ...nova } : x)) }));
    };
    const zaok = (x) => Math.round(x * 100) / 100;
    return (
      <div style={{ background: "#fff7ed", borderRadius: 8, padding: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Odstupy od okrajů plochy (m) – zadáním hodnoty se prvek posune</div>
        <div style={S.mrizka}>
          {cisloPole("◀ Od levé hrany", zaok(o.vlevo), nastav("vlevo"), 0.05, null)}
          {cisloPole("Od pravé hrany ▶", zaok(o.vpravo), nastav("vpravo"), 0.05, null)}
          {cisloPole("▼ Od okapu", zaok(o.okap), nastav("okap"), 0.05, null)}
          {cisloPole(f.sklon < 5 ? "▲ Od horní hrany" : "▲ Od hřebene / horní hrany", zaok(o.hreben), nastav("hreben"), 0.05, null)}
        </div>
        <div style={S.maly}>Měřeno v rovině střechy od okraje krytiny (včetně přesahu); vlevo/vpravo při pohledu na plochu zvenku. Rozměr prvku {cislo(r.w)} × {cislo(r.h)} m.</div>
      </div>
    );
  };
  const zmenPole = (id, zmena) => zmen(n => ({ ...n, fve: n.fve.map(p => p.id === id ? { ...p, ...zmena } : p) }));
  // Klepnutí na kótu v 3D: pod číslem se otevře malý editor (−/+, číslo), model se hýbe hned.
  // (obsluha se nastavuje po vykreslení, ať 3D kóty volají aktuální verzi)
  const [upravaKoty, setUpravaKoty] = useState(null); // { co, kde, popis, puvodni, text, x, y, zmeneno }
  useEffect(() => {
    kotaKlikRef.current = (co, kde, popis, hodnota, el) => {
      const kontejner = mountRef.current?.parentElement;
      const rk = kontejner?.getBoundingClientRect(), re = el?.getBoundingClientRect?.();
      const x = rk && re ? Math.max(4, Math.min(re.left - rk.left + re.width / 2 - 110, rk.width - 224)) : 20;
      const y = rk && re ? Math.min(re.bottom - rk.top + 6, rk.height - 120) : 20;
      const h = Math.round((Number(hodnota) || 0) * 100) / 100;
      setUpravaKoty({ co, kde, popis, puvodni: h, text: String(h).replace(".", ","), x, y, zmeneno: false });
    };
  });
  // nastaví délku podle druhu kóty
  const nastavKotu = (u, x, doHistorie) => {
    if (!Number.isFinite(x) || x < 0) return;
    if (u.co === "dum") { if (x > 0) zmen({ [u.kde]: x }, { doHistorie }); }
    else if (u.co === "strecha") { if (x > 0) zmen(n => ({ ...n, ...rozmerZDelkyStrechy(n, u.kde, x) }), { doHistorie }); }
    else if (u.co === "hreben") zmen(n => ({ ...n, sklon: sklonZHrebene(n, x) }), { doHistorie });
    else if (u.co === "odstup") {
      const kam = u.kde.jePole ? "fve" : "prekazky";
      zmen(n => {
        const prvek = (n[kam] || []).find(p => p.id === u.kde.prvekId);
        const fl = prvek && plochyStrechy(n)[prvek.plocha];
        if (!fl) return n;
        const nova = polohaPodleOdstupu(fl, obdelnikPrvku(n, prvek, u.kde.jePole), u.kde.strana, x);
        return { ...n, [kam]: n[kam].map(p => (p.id === prvek.id ? { ...p, ...nova } : p)) };
      }, { doHistorie });
    }
  };
  const zmenitKotu = (text) => {
    const u = upravaKoty;
    if (!u) return;
    const x = Number(String(text).replace(/\s/g, "").replace(",", "."));
    const platne = String(text).trim() !== "" && Number.isFinite(x);
    if (platne) nastavKotu(u, x, !u.zmeneno);
    setUpravaKoty({ ...u, text, zmeneno: u.zmeneno || platne });
  };
  const posunoutKotu = (krok) => {
    const x = Number(String(upravaKoty?.text ?? "").replace(",", "."));
    const nova = Math.max(0, Math.round(((Number.isFinite(x) ? x : upravaKoty.puvodni) + krok) * 100) / 100);
    zmenitKotu(String(nova).replace(".", ","));
  };
  const zrusitKotu = () => { if (upravaKoty?.zmeneno) nastavKotu(upravaKoty, upravaKoty.puvodni, false); setUpravaKoty(null); };

  const hs = navrh.hromosvod || {};
  const plochaNaPolozku = (p) => plochy[p.plocha];
  const rezimInfo = REZIMY.find(r => r.id === rezim);

  // ── UI ──
  const cisloPole = (popis, hodnota, onChange, krok = 0.1, min = 0) => (
    <label style={{ display: "block" }}>
      <span style={S.popisek}>{popis}</span>
      <CisloVstup krok={krok} min={min} style={S.pole} value={hodnota} onChange={onChange} />
    </label>
  );
  const ciselne = (k) => (val) => zmen({ [k]: val });
  const delkaVedeni = (v) => { const d = drahaVedeni(navrh, v.body); return d.slice(1).reduce((s, q, j) => s + v3.dist(q, d[j]), 0); };

  const zalozkaRozmery = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={S.mrizka}>
        <label><span style={S.popisek}>Název návrhu</span><input style={S.pole} value={navrh.nazev} onChange={e => zmen({ nazev: e.target.value }, { doHistorie: false })} /></label>
        <label><span style={S.popisek}>Zákazník / adresa</span><input style={S.pole} value={navrh.zakaznik} onChange={e => zmen({ zakaznik: e.target.value }, { doHistorie: false })} /></label>
      </div>
      <div>
        <label><span style={S.popisek}>Zakázka</span>
          <select style={S.pole} value={navrh.contractId || ""} onChange={e => zmen({ contractId: e.target.value ? Number(e.target.value) : null }, { doHistorie: false })}>
            <option value="">– nepřiřazeno –</option>
            {zakazky.map(z => <option key={z.id} value={z.id}>{z.code ? `${z.code} – ` : ""}{z.name}</option>)}
          </select>
        </label>
      </div>
      <div style={S.mrizka}>
        {cisloPole("Délka – přední stěna (m)", navrh.delka, v => zmen({ delka: Math.max(1, Number(v) || 1) }))}
        {cisloPole("Šířka – boční stěna (m)", navrh.sirka, v => zmen({ sirka: Math.max(1, Number(v) || 1) }))}
        {cisloPole(navrh.strecha === "plocha" ? "Výška atiky (m)" : "Výška okapu (m)", navrh.vyskaOkapu, v => zmen({ vyskaOkapu: Math.max(0.5, Number(v) || 0.5) }))}
        {cisloPole("Přesah střechy (m)", navrh.presah, ciselne("presah"), 0.05)}
      </div>
      <div>
        <span style={S.popisek}>Typ střechy</span>
        <div style={S.radek}>
          {TYPY_STRECHY.map(t => <button key={t.id} style={S.stitek(navrh.strecha === t.id)} onClick={() => zmen(n => {
            const nn = { ...n, strecha: t.id };
            const pocet = plochyStrechy(nn).length;
            return { ...nn, fve: n.fve.filter(p => p.plocha < pocet), prekazky: (n.prekazky || []).filter(p => p.plocha < pocet) };
          })}>{t.nazev}</button>)}
        </div>
      </div>
      {navrh.strecha !== "plocha" && (
        <div style={S.mrizka}>
          {cisloPole("Sklon střechy (°)", Math.round(navrh.sklon * 10) / 10, v => zmen({ sklon: Math.max(0, Math.min(75, Number(v) || 0)) }), 1)}
          {cisloPole("…nebo výška hřebene (m)", Math.round(vyskaHrebene(navrh) * 100) / 100, v => zmen(n => ({ ...n, sklon: sklonZHrebene(n, Number(v) || 0) })), 0.1)}
        </div>
      )}
      {(() => {
        const ds = delkyStrechy(navrh);
        return (
          <div>
            <div style={S.mrizka}>
              {cisloPole("Délka střechy u okapu (m)", Math.round(ds.okap * 100) / 100, v => { const x = Number(v); if (x > 0) zmen(n => ({ ...n, ...rozmerZDelkyStrechy(n, "okap", x) })); }, 0.05)}
              {cisloPole(navrh.strecha === "plocha" ? "Druhý rozměr střechy (m)" : "Délka krokve – okap → hřeben (m)", Math.round(ds.krokev * 100) / 100, v => { const x = Number(v); if (x > 0) zmen(n => ({ ...n, ...rozmerZDelkyStrechy(n, "krokev", x) })); }, 0.05)}
            </div>
            <div style={S.maly}>Délky střechy včetně přesahu {cislo(navrh.presah)} m — zadáním se dopočítá {ds.osaA === "delka" ? "délka" : "šířka"} / {ds.osaB === "delka" ? "délka" : "šířka"} domu, sklon a přesah zůstanou. Jdou zadat i klepnutím na hnědé kóty v modelu.</div>
          </div>
        );
      })()}
      {navrh.strecha === "polovalba" && (
        <div style={S.mrizka}>
          {cisloPole("Valbička – pokles od hřebene (m)", navrh.polovalba?.vyska ?? 1, v => zmen(n => ({ ...n, polovalba: { ...(n.polovalba || {}), vyska: v } })), 0.1)}
          {cisloPole("Valbička – hloubka podél hřebene (m)", navrh.polovalba?.hloubka ?? 1.5, v => zmen(n => ({ ...n, polovalba: { ...(n.polovalba || {}), hloubka: v } })), 0.1)}
        </div>
      )}
      {navrh.strecha !== "plocha" && (
        <div>
          <span style={S.popisek}>{navrh.strecha === "pultova" ? "Nižší okap je" : "Hřeben vede"}</span>
          <div style={S.radek}>
            {(navrh.strecha === "pultova"
              ? [[0, "vpředu"], [90, "vpravo"], [180, "vzadu"], [270, "vlevo"]]
              : [[0, "podél délky"], [90, "podél šířky"]]
            ).map(([r, t]) => <button key={r} style={S.stitek(((navrh.otoceni % 180 + 180) % 180 === r % 180 && (navrh.strecha !== "pultova" || navrh.otoceni === r)))} onClick={() => zmen({ otoceni: r })}>{t}</button>)}
          </div>
        </div>
      )}
      <div style={S.mrizka}>
        <label><span style={S.popisek}>Přední stěna je na</span>
          <select style={S.pole} value={navrh.azimutPredni} onChange={e => zmen({ azimutPredni: Number(e.target.value) })}>
            {SVETOVE_STRANY.map(([t, a]) => <option key={a} value={a}>{t} ({a}°)</option>)}
          </select>
        </label>
        <div>
          <span style={S.popisek}>Krytina</span>
          <div style={S.radek}>
            {BARVY_STRECHY.map(([t, c]) => <button key={c} title={t} onClick={() => zmen({ barvaStrechy: c })}
              style={{ width: 26, height: 26, borderRadius: 6, background: c, border: navrh.barvaStrechy === c ? "3px solid #f5821f" : "1px solid #cbd5e1", cursor: "pointer" }} />)}
          </div>
        </div>
      </div>
      <div style={{ border: `1px solid ${ui.barvy.okraj}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ ...S.radek, justifyContent: "space-between" }}>
          <b style={{ fontSize: 13 }}>Přístřešky / přístavky u domu</b>
          <button style={S.btn(ui.barvy.uspech)} onClick={() => zmen(n => {
            const sez = seznamPristavku(n);
            const stena = STRANY.find(x => !sez.some(q => q.stena === x.id))?.id || "leva";
            const delka = ["predni", "zadni"].includes(stena) ? n.delka : n.sirka;
            const novy = { id: noveId("p"), stena, typ: "pristresek", posun: 0, delka, hloubka: 3.5, vyskaUDomu: 3, vyskaVenku: 2.6, presah: 0.3 };
            const x = { ...n, pristavky: [...sez, novy] };
            delete x.pristavek;
            return x;
          })}><i className="ti ti-plus" /> Přidat</button>
        </div>
        {seznamPristavku(navrh).map((pr, i) => {
          const nastav = (k) => (v) => zmen(n => {
            const x = { ...n, pristavky: seznamPristavku(n).map(q => q.id === pr.id ? { ...q, [k]: v } : q) };
            delete x.pristavek;
            return x;
          });
          const smazat = () => zmen(n => {
            const x = { ...n, pristavky: seznamPristavku(n).filter(q => q.id !== pr.id) };
            delete x.pristavek;
            const pocetDomu = plochyStrechy({ ...n, pristavky: [] }).length;
            // FVE a překážky na smazaném přístřešku pryč, na dalších se posune index plochy
            const idx = pocetDomu + i;
            const posun = (arr) => (arr || []).filter(q => q.plocha !== idx).map(q => (q.plocha > idx ? { ...q, plocha: q.plocha - 1 } : q));
            return { ...x, fve: posun(n.fve), prekazky: posun(n.prekazky) };
          });
          return (
            <div key={pr.id} style={{ border: `1px solid ${ui.barvy.okrajJemny}`, borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ ...S.radek, justifyContent: "space-between" }}>
                <div style={S.radek}>
                  {[["pristresek", "Přístřešek (sloupky)"], ["pristavek", "Přístavek (zděný)"]].map(([k, t]) => <button key={k} style={S.stitek((pr.typ || "pristresek") === k)} onClick={() => nastav("typ")(k)}>{t}</button>)}
                </div>
                <button style={S.obrys} onClick={smazat}>✕</button>
              </div>
              <div>
                <span style={S.popisek}>U stěny</span>
                <div style={S.radek}>
                  {STRANY.map(st => <button key={st.id} style={S.stitek(pr.stena === st.id)} onClick={() => nastav("stena")(st.id)}>{st.nazev}</button>)}
                </div>
              </div>
              <div style={S.mrizka}>
                {cisloPole("Délka podél stěny (m)", pr.delka, nastav("delka"))}
                {cisloPole("Hloubka od stěny (m)", pr.hloubka, nastav("hloubka"))}
                {cisloPole("Odsazení od levého rohu (m, záporné = za roh)", pr.posun, nastav("posun"), 0.1, null)}
                {cisloPole("Přesah střechy (m)", pr.presah, nastav("presah"), 0.05)}
                {cisloPole("Výška u domu (m)", pr.vyskaUDomu, nastav("vyskaUDomu"))}
                {cisloPole("Výška vpředu (m)", pr.vyskaVenku, nastav("vyskaVenku"))}
              </div>
            </div>
          );
        })}
        <div style={S.maly}>Levý roh = levý kraj stěny při pohledu na ni zvenku. Přístřešek do „L“ kolem rohu: u jedné stěny dejte záporné odsazení (o hloubku druhého) nebo délku přes roh. Na střechu přístřešku jde kreslit FVE i hromosvod.</div>
      </div>
      <div style={S.maly}>Plochy střechy: {plochy.map(f => `${f.nazev} (${Math.round(f.sklon)}°)`).join(", ")}</div>
    </div>
  );

  const zalozkaFotky = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={S.maly}>Vyfoťte každou stěnu celou i se štítem. Fotku focenou šikmo (třeba z rohu domu) narovnáte označením 4 rohů stěny; fotku zepředu stačí oříznout na hrany domu.</div>
      {STRANY.map(st => {
        const f = navrh.fotky?.[st.id];
        const o = f?.orez || { l: 0, p: 0, n: 0, d: 0 };
        const nastavOrez = (k, val) => zmen(n => ({ ...n, fotky: { ...n.fotky, [st.id]: { ...n.fotky[st.id], orez: { ...o, [k]: val } } } }), { doHistorie: false });
        return (
          <div key={st.id} style={{ border: `1px solid ${ui.barvy.okraj}`, borderRadius: 10, padding: 10 }}>
            <div style={{ ...S.radek, justifyContent: "space-between" }}>
              <b style={{ fontSize: 13 }}>{st.nazev} stěna</b>
              <div style={S.radek}>
                <label style={S.btn(ui.barvy.primarni)}>
                  <i className="ti ti-camera" /> {f ? "Vyměnit" : "Nahrát fotku"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                    const file = e.target.files?.[0]; e.target.value = "";
                    if (!file) return;
                    const data = await nactiFotku(file);
                    zmen(n => ({ ...n, fotky: { ...n.fotky, [st.id]: { data, orez: { l: 0, p: 0, n: 0, d: 0 } } } }));
                  }} />
                </label>
                {f && <button style={S.obrys} onClick={() => zmen(n => { const fo = { ...n.fotky }; delete fo[st.id]; return { ...n, fotky: fo }; })}>Odebrat</button>}
              </div>
            </div>
            {f && (
              <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <div style={{ position: "relative", width: 150, flex: "0 0 auto" }}>
                  <img src={f.data} alt="" style={{ width: "100%", display: "block", borderRadius: 6 }} />
                  {f.rohy?.length === 4
                    ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                        <polygon points={f.rohy.map(([u, v]) => `${u * 100},${v * 100}`).join(" ")} fill="rgba(245,130,31,0.2)" stroke="#f5821f" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                      </svg>
                    : <div style={{ position: "absolute", left: `${o.l * 100}%`, right: `${o.p * 100}%`, top: `${o.n * 100}%`, bottom: `${o.d * 100}%`, border: "2px solid #f5821f", boxShadow: "0 0 0 999px rgba(0,0,0,0.45)", borderRadius: 2 }} />}
                </div>
                <div style={{ flex: "1 1 140px", display: "grid", gap: 6, alignContent: "start" }}>
                  {f.rohy?.length === 4 ? (
                    <>
                      <span style={{ ...S.maly, color: ui.barvy.uspech }}>✓ Narovnáno podle 4 rohů stěny</span>
                      <div style={S.radek}>
                        <button style={S.obrys} onClick={() => setEditRohy(st.id)}>Upravit rohy</button>
                        <button style={S.obrys} onClick={() => zmen(n => { const x = { ...n.fotky[st.id] }; delete x.rohy; return { ...n, fotky: { ...n.fotky, [st.id]: x } }; })}>Zrušit narovnání</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button style={S.btn(ui.barvy.primarni)} onClick={() => setEditRohy(st.id)}><i className="ti ti-perspective" /> Narovnat (označit 4 rohy)</button>
                      <span style={S.maly}>Fotka focená šikmo se narovná. Nebo jen ořízněte:</span>
                      {[["l", "Zleva"], ["p", "Zprava"], ["n", "Shora"], ["d", "Zdola"]].map(([k, t]) => (
                        <label key={k} style={{ ...S.maly, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 46 }}>{t}</span>
                          <input type="range" min="0" max="0.45" step="0.005" value={o[k]} style={{ flex: 1 }} onChange={e => nastavOrez(k, Number(e.target.value))} />
                        </label>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const zalozkaFve = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ ...S.radek, justifyContent: "space-between", background: "#eff6ff", borderRadius: 8, padding: "8px 10px" }}>
        <b>{souhrn.panelu} panelů · {cislo(souhrn.kwp)} kWp</b>
        <span style={S.maly}>{cislo(souhrn.plochaPanelu, 1)} m²</span>
      </div>
      {souhrn.blizko > 0 && <div style={{ ...S.maly, color: ui.barvy.varovani }}>⚠ {souhrn.blizko} panelů je blíž než {cislo(hs.odstup)} m od jímací soustavy (oranžově).</div>}
      {navrh.fve.some(p => panelyPole(navrh, p).some(pan => !plochaNaPolozku(p) || !panelSeVejde(navrh, plochaNaPolozku(p), pan))) &&
        <div style={{ ...S.maly, color: ui.barvy.chyba }}>⚠ Některé panely přesahují plochu nebo okraj {cislo(navrh.okrajFve)} m (červeně).</div>}
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Panel a odstupy</summary>
        <div style={{ ...S.mrizka, marginTop: 8 }}>
          {cisloPole("Šířka panelu (m)", navrh.panel.sirka, v => zmen(n => ({ ...n, panel: { ...n.panel, sirka: Number(v) || 1 } })), 0.001)}
          {cisloPole("Výška panelu (m)", navrh.panel.vyska, v => zmen(n => ({ ...n, panel: { ...n.panel, vyska: Number(v) || 1 } })), 0.001)}
          {cisloPole("Výkon panelu (Wp)", navrh.panel.wp, v => zmen(n => ({ ...n, panel: { ...n.panel, wp: Number(v) || 0 } })), 5)}
          {cisloPole("Mezera mezi panely (m)", navrh.mezeraFve, ciselne("mezeraFve"), 0.01)}
          {cisloPole("Okraj od hrany střechy (m)", navrh.okrajFve, ciselne("okrajFve"), 0.05)}
        </div>
      </details>
      <div style={{ border: `1px solid ${ui.barvy.okraj}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <b style={{ fontSize: 13 }}>Nové pole (klepnutím na střechu v režimu FVE pole)</b>
        <div style={S.mrizka}>
          {cisloPole("Řady", novePole.radky, v => setNovePole(p => ({ ...p, radky: v })), 1, 1)}
          {cisloPole("Panelů v řadě", novePole.sloupce, v => setNovePole(p => ({ ...p, sloupce: v })), 1, 1)}
        </div>
        <div style={S.radek}>
          <button style={S.stitek(novePole.orientace === "vysku")} onClick={() => setNovePole(p => ({ ...p, orientace: "vysku" }))}>Na výšku</button>
          <button style={S.stitek(novePole.orientace === "sirku")} onClick={() => setNovePole(p => ({ ...p, orientace: "sirku" }))}>Na šířku</button>
          {navrh.strecha === "plocha" && <span style={S.maly}>náklon konstrukce <input type="number" style={{ ...S.pole, width: 60 }} value={novePole.naklon} onChange={e => setNovePole(p => ({ ...p, naklon: Number(e.target.value) || 0 }))} />°</span>}
        </div>
        <div style={S.radek}>
          <button style={S.btn(rezim === "fve" ? ui.barvy.akcent : ui.barvy.primarni)} onClick={() => zmenRezim("fve")}><i className="ti ti-pointer" /> Kreslit pole</button>
        </div>
      </div>
      <div style={{ border: `1px solid ${ui.barvy.okraj}`, borderRadius: 10, padding: 10 }}>
        <b style={{ fontSize: 13 }}>Vyplnit plochu automaticky</b>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {plochy.map(f => (
            <div key={f.index} style={{ ...S.radek, justifyContent: "space-between" }}>
              <span style={{ fontSize: 13 }}>{f.nazev} <span style={S.maly}>({Math.round(f.sklon)}°{f.azimut != null ? `, ${Math.round(f.azimut)}°` : ""})</span></span>
              <div style={S.radek}>
                {["vysku", "sirku"].map(o => (
                  <button key={o} style={S.obrys} onClick={() => zmen(n => ({
                    ...n, fve: [...n.fve.filter(p => p.plocha !== f.index), ...vyplnPlochu(n, f, o, f.sklon < 5 ? Number(novePole.naklon) || 0 : 0)],
                  }))}>{o === "vysku" ? "na výšku" : "na šířku"}</button>
                ))}
                {navrh.fve.some(p => p.plocha === f.index) && <button style={S.obrys} title="Vyprázdnit plochu" onClick={() => zmen(n => ({ ...n, fve: n.fve.filter(p => p.plocha !== f.index) }))}>✕</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ border: `1px solid ${ui.barvy.okraj}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <b style={{ fontSize: 13 }}>Komíny, střešní okna a jiné překážky</b>
        <div style={S.radek}>
          {Object.entries(TYPY_PREKAZEK).map(([k, t]) => {
            const aktivni = rezim === "prekazka" && novaPrekazka === k;
            return (
              <button key={k} style={S.btn(aktivni ? ui.barvy.akcent : ui.barvy.primarni)} onClick={() => { setNovaPrekazka(k); if (!aktivni) zmenRezim("prekazka"); else zmenRezim("pohled"); }}>
                <i className={`ti ${IKONY_PREKAZEK[k]}`} /> {aktivni ? "Vkládám: " : "+ "}{t.nazev}
              </button>
            );
          })}
        </div>
        {(() => {
          const r = rozmeryNove[novaPrekazka];
          const nastavNove = (zm) => setRozmeryNove(x => ({ ...x, [novaPrekazka]: { ...x[novaPrekazka], ...zm } }));
          return (
            <div style={{ background: rezim === "prekazka" ? "#fff7ed" : ui.barvy.poleBg, border: `1px solid ${rezim === "prekazka" ? ui.barvy.akcent : ui.barvy.okraj}`, borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                Rozměr vkládaného prvku – {TYPY_PREKAZEK[novaPrekazka].nazev.toLowerCase()}
                {rezim === "prekazka" && <span style={{ color: ui.barvy.akcent }}> · klepněte na střechu</span>}
              </div>
              <div style={S.radek}>
                {PRESETY_PREKAZEK[novaPrekazka].map(([t, w, h]) => (
                  <button key={t} style={{ ...S.stitek(Math.abs(r.sirka - w) < 1e-6 && Math.abs(r.hloubka - h) < 1e-6), padding: "4px 8px" }} onClick={() => nastavNove({ sirka: w, hloubka: h })}>{t}</button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: novaPrekazka === "okno" ? "1fr 1fr" : "1fr 1fr 1fr", gap: 6 }}>
                {cisloPole("Šířka (m)", r.sirka, v => nastavNove({ sirka: Math.max(0.05, v) }), 0.05, 0.05)}
                {cisloPole("Délka po spádu (m)", r.hloubka, v => nastavNove({ hloubka: Math.max(0.05, v) }), 0.05, 0.05)}
                {novaPrekazka !== "okno" && cisloPole("Výška nad střechou (m)", r.vyska, v => nastavNove({ vyska: Math.max(0, v) }), 0.1)}
              </div>
            </div>
          );
        })()}
        <div style={S.maly}>Panely drží od překážek stejný odstup jako od okraje ({cislo(navrh.okrajFve)} m), „Vyplnit plochu“ je obejde. Automatický hromosvod ke komínu přidá jímací tyč.</div>
        {(navrh.prekazky || []).map(o => {
          const zm = (k) => (v) => zmen(n => ({ ...n, prekazky: n.prekazky.map(x => x.id === o.id ? { ...x, [k]: v } : x) }));
          const vybr = vybrane?.typ === "prekazka" && vybrane.id === o.id;
          return (
            <div key={o.id} onClick={() => setVybrane({ typ: "prekazka", id: o.id })} style={{ border: `1px solid ${vybr ? ui.barvy.akcent : ui.barvy.okrajJemny}`, background: vybr ? "#fff7ed" : "transparent", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
              <div style={{ ...S.radek, justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{TYPY_PREKAZEK[o.typ]?.nazev} – {plochy[o.plocha]?.nazev}</span>
                <button style={S.obrys} onClick={e => { e.stopPropagation(); zmen(n => ({ ...n, prekazky: n.prekazky.filter(x => x.id !== o.id) })); setVybrane(null); }}>✕</button>
              </div>
              <div onClick={e => e.stopPropagation()} style={{ display: "grid", gridTemplateColumns: o.typ === "okno" ? "1fr 1fr" : "1fr 1fr 1fr", gap: 6 }}>
                {cisloPole("Šířka (m)", o.sirka, v => zm("sirka")(Math.max(0.05, v)), 0.05, 0.05)}
                {cisloPole("Délka po spádu (m)", o.hloubka, v => zm("hloubka")(Math.max(0.05, v)), 0.05, 0.05)}
                {o.typ !== "okno" && cisloPole("Výška nad střechou (m)", o.vyska, zm("vyska"), 0.1)}
              </div>
              {vybr && (
                <div style={S.radek} onClick={e => e.stopPropagation()}>
                  <span style={S.maly}>Velikost:</span>
                  {(PRESETY_PREKAZEK[o.typ] || []).map(([t, w, h]) => (
                    <button key={t} style={{ ...S.stitek(Math.abs(o.sirka - w) < 1e-6 && Math.abs(o.hloubka - h) < 1e-6), padding: "4px 8px" }}
                      onClick={() => zmen(n => ({ ...n, prekazky: n.prekazky.map(x => (x.id === o.id ? { ...x, sirka: w, hloubka: h } : x)) }))}>{t}</button>
                  ))}
                </div>
              )}
              {vybr && <div onClick={e => e.stopPropagation()}>{odstupyPrvku(o, false)}</div>}
            </div>
          );
        })}
      </div>
      {vybranePole && (
        <div style={{ border: `2px solid ${ui.barvy.akcent}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ ...S.radek, justifyContent: "space-between" }}>
            <b style={{ fontSize: 13 }}>Vybrané pole – {plochaNaPolozku(vybranePole)?.nazev}</b>
            <button style={S.btn(ui.barvy.chyba)} onClick={() => { zmen(n => ({ ...n, fve: n.fve.filter(p => p.id !== vybranePole.id) })); setVybrane(null); }}>Smazat</button>
          </div>
          <div style={S.mrizka}>
            {cisloPole("Řady", vybranePole.radky, v => zmenPole(vybranePole.id, { radky: Math.max(1, Number(v) || 1) }), 1, 1)}
            {cisloPole("Panelů v řadě", vybranePole.sloupce, v => zmenPole(vybranePole.id, { sloupce: Math.max(1, Number(v) || 1) }), 1, 1)}
          </div>
          <div style={S.radek}>
            <button style={S.stitek(vybranePole.orientace === "vysku")} onClick={() => zmenPole(vybranePole.id, { orientace: "vysku" })}>Na výšku</button>
            <button style={S.stitek(vybranePole.orientace === "sirku")} onClick={() => zmenPole(vybranePole.id, { orientace: "sirku" })}>Na šířku</button>
            {plochaNaPolozku(vybranePole)?.sklon < 5 && <span style={S.maly}>náklon <input type="number" style={{ ...S.pole, width: 60 }} value={vybranePole.naklon || 0} onChange={e => zmenPole(vybranePole.id, { naklon: Number(e.target.value) || 0 })} />°</span>}
          </div>
          {odstupyPrvku(vybranePole, true)}
          <div style={S.radek}>
            <span style={S.maly}>Posun o 10 cm:</span>
            {[["◀", -0.1, 0], ["▶", 0.1, 0], ["▲ ke hřebeni", 0, 0.1], ["▼ k okapu", 0, -0.1]].map(([t, du, dv]) => (
              <button key={t} style={S.obrys} onClick={() => zmenPole(vybranePole.id, { u: vybranePole.u + du, v: vybranePole.v + dv })}>{t}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const vybrany = (typ, id) => vybrane?.typ === typ && vybrane.id === id;
  const polozkaSeznamu = (typ, id, text, extra) => (
    <div key={id} onClick={() => setVybrane({ typ, id })} style={{ ...S.radek, justifyContent: "space-between", padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: vybrany(typ, id) ? "#fff7ed" : "transparent", border: `1px solid ${vybrany(typ, id) ? ui.barvy.akcent : ui.barvy.okrajJemny}` }}>
      <span style={{ fontSize: 13 }}>{text}</span>
      <div style={S.radek} onClick={e => e.stopPropagation()}>
        {extra}
        <button style={S.obrys} onClick={() => { zmenHs(h => ({ [typ === "vedeni" ? "vedeni" : typ === "svod" ? "svody" : "tyce"]: h[typ === "vedeni" ? "vedeni" : typ === "svod" ? "svody" : "tyce"].filter(x => x.id !== id) })); setVybrane(null); }}>✕</button>
      </div>
    </div>
  );

  const zalozkaHromosvod = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={S.mrizka}>
        <label><span style={S.popisek}>Třída LPS</span>
          <select style={S.pole} value={hs.trida || "III"} onChange={e => zmenHs({ trida: e.target.value })}>
            {Object.entries(TRIDY_LPS).map(([k, v]) => <option key={k} value={k}>{k} – svody á {v.svody} m, oko {v.oko} m</option>)}
          </select>
        </label>
        {cisloPole("Dostatečná vzdálenost s (m)", hs.odstup ?? 0.5, v => zmenHs({ odstup: v }), 0.05)}
      </div>
      <button style={S.btn(ui.barvy.primarni, "normal")} onClick={() => {
        if (((hs.vedeni || []).length || (hs.svody || []).length) && !window.confirm("Nahradit stávající jímací vedení a svody automatickým návrhem?")) return;
        zmen(n => ({ ...n, hromosvod: navrhniHromosvod(n) }));
      }}><i className="ti ti-wand" /> Navrhnout hromosvod automaticky</button>
      <div style={S.maly}>Automaticky: vedení po hřebeni a štítových / nárožních hranách (u ploché a pultové střechy obvod + mřížová soustava), svody na rozích a dál po stěnách podle rozestupu třídy. Potom můžete kreslit a mazat ručně.</div>
      <div style={S.radek}>
        <button style={S.btn(rezim === "vedeni" ? ui.barvy.akcent : ui.barvy.primarni)} onClick={() => zmenRezim("vedeni")}><i className="ti ti-line" /> Kreslit vedení</button>
        <button style={S.btn(rezim === "svod" ? ui.barvy.akcent : ui.barvy.primarni)} onClick={() => zmenRezim("svod")}><i className="ti ti-arrow-down-bar" /> Přidat svod</button>
        <button style={S.btn(rezim === "tyc" ? ui.barvy.akcent : ui.barvy.primarni)} onClick={() => zmenRezim("tyc")}><i className="ti ti-antenna" /> Přidat tyč</button>
        <span style={S.maly}>výška tyče <input type="number" step="0.5" style={{ ...S.pole, width: 60 }} value={vyskaTyce} onChange={e => setVyskaTyce(e.target.value)} /> m</span>
      </div>
      {rozpracovane.length > 0 && (
        <div style={{ ...S.radek, background: "#fefce8", padding: 8, borderRadius: 8 }}>
          <span style={{ fontSize: 13 }}>Kreslím vedení: {rozpracovane.length} bodů</span>
          <button style={S.btn(ui.barvy.uspech)} onClick={() => dokoncitVedeni()}>Hotovo</button>
          <button style={S.btn(ui.barvy.primarni)} onClick={svodKZemi} title="Z posledního bodu dolů po fasádě k zemi">↓ Svod k zemi</button>
          <button style={S.obrys} onClick={() => setRozpracovane(r => r.slice(0, -1))}>Zpět bod</button>
          <button style={S.obrys} onClick={() => setRozpracovane([])}>Zrušit</button>
        </div>
      )}
      <div>
        <b style={{ fontSize: 13 }}>Jímací vedení ({cislo(souhrn.jimaci, 1)} m)</b>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {(hs.vedeni || []).map((v, i) => polozkaSeznamu("vedeni", v.id, `Vedení ${i + 1} – ${cislo(delkaVedeni(v), 1)} m`))}
        </div>
      </div>
      <div>
        <b style={{ fontSize: 13 }}>Svody ({souhrn.pocetSvodu} ks, {cislo(souhrn.svodyDelka, 1)} m)</b>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {(hs.svody || []).map((s, i) => polozkaSeznamu("svod", s.id, `ZS${i + 1} – ${polohaSvodu(s).text}`))}
          {vybrane?.typ === "svod" && (() => {
            const sv = (hs.svody || []).find(x => x.id === vybrane.id);
            if (!sv) return null;
            const w = polohaSvodu(sv);
            return (
              <div style={{ border: `2px solid ${ui.barvy.akcent}`, borderRadius: 10, padding: 10, marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
                <b style={{ fontSize: 13 }}>Umístění svodu {(hs.svody || []).indexOf(sv) + 1}</b>
                <div style={S.radek}>
                  {STRANY.map(st => <button key={st.id} style={S.stitek(w.st.id === st.id)} onClick={() => nastavSvod(sv.id, st.id, steny(navrh).find(x => x.id === st.id).delka / 2)}>{st.nazev}</button>)}
                </div>
                <div style={S.mrizka}>
                  {cisloPole(`Od levého rohu (m, stěna ${cislo(w.st.delka)} m)`, Math.round(w.si * 100) / 100, v => nastavSvod(sv.id, w.st.id, v), 0.05)}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, flexWrap: "wrap" }}>
                    <button style={S.obrys} onClick={() => nastavSvod(sv.id, w.st.id, 0)}>Levý roh</button>
                    <button style={S.obrys} onClick={() => nastavSvod(sv.id, w.st.id, w.st.delka / 2)}>Střed</button>
                    <button style={S.obrys} onClick={() => nastavSvod(sv.id, w.st.id, w.st.delka)}>Pravý roh</button>
                  </div>
                </div>
                <div style={S.radek}>
                  <span style={S.maly}>Posunout:</span>
                  {[["◀ 0,5 m", -0.5], ["◀ 0,1 m", -0.1], ["0,1 m ▶", 0.1], ["0,5 m ▶", 0.5]].map(([t, d]) => (
                    <button key={t} style={S.obrys} onClick={() => nastavSvod(sv.id, w.st.id, w.si + d)}>{t}</button>
                  ))}
                </div>
                <div style={S.maly}>Svod jde také přetáhnout myší po fasádě v režimu „Svod“. Vlevo/vpravo = při pohledu na stěnu zvenku. Spojka na hřeben se posune se svodem.</div>
              </div>
            );
          })()}
        </div>
      </div>
      <div>
        <div style={{ ...S.radek, justifyContent: "space-between" }}>
          <b style={{ fontSize: 13 }}>Jímací tyče ({souhrn.tyci} ks)</b>
          <label style={{ ...S.maly, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={!!hs.zony} onChange={e => zmenHs({ zony: e.target.checked })} /> ochranný prostor, úhel
            <input type="number" style={{ ...S.pole, width: 56 }} value={hs.uhel ?? 70} onChange={e => zmenHs({ uhel: Number(e.target.value) || 0 })} />°
          </label>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {(hs.tyce || []).map((t, i) => polozkaSeznamu("tyc", t.id, `Tyč ${i + 1}`,
            <span style={S.maly}><input type="number" step="0.5" style={{ ...S.pole, width: 60 }} value={t.vyska} onChange={e => zmenHs(h => ({ tyce: h.tyce.map(x => x.id === t.id ? { ...x, vyska: Number(e.target.value) || 0 } : x) }))} /> m</span>))}
        </div>
      </div>
      <div style={{ border: `1px solid ${ui.barvy.okraj}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={!!hs.koule} onChange={e => zmenHs({ koule: e.target.checked })} />
          Valivá koule (třída {hs.trida || "III"}: R = {POLOMER_KOULE[hs.trida || "III"]} m)
        </label>
        {hs.koule && !koule && <span style={S.maly}>Počítám…</span>}
        {hs.koule && koule && (
          <>
            <div style={{ fontSize: 13, color: koule.nechranenych ? ui.barvy.chyba : ui.barvy.uspech, fontWeight: 600 }}>
              {koule.nechranenych ? `⚠ Koule se dotkne střechy v ${koule.nechranenych} bodech (červeně), chráněno ${cislo(koule.procento, 0)} %` : "✓ Celá střecha je v ochranném prostoru"}
            </div>
            {koule.koule.map(k => (
              <div key={k.plocha} style={{ ...S.maly, display: "flex", justifyContent: "space-between" }}>
                <span>{k.nazev}</span>
                <span style={{ color: k.rezerva < 0 ? ui.barvy.chyba : ui.barvy.text }}>{k.rezerva < 0 ? "koule se dotkne krytiny" : `koule ${cislo(k.rezerva)} m nad krytinou`}</span>
              </div>
            ))}
            <div style={{ ...S.maly, fontStyle: "italic" }}>Body se kontrolují po 0,5 m na všech plochách střechy. Zjednodušení: stěny a přesahy do stran se nevyhodnocují.</div>
          </>
        )}
      </div>
      <label style={{ ...S.maly, display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={!!hs.zemnic} onChange={e => zmenHs({ zemnic: e.target.checked })} /> Obvodový zemnič 1 m od domu ({cislo(souhrn.zemnic, 1)} m)
      </label>
      {souhrn.blizko > 0 && <div style={{ ...S.maly, color: ui.barvy.varovani }}>⚠ {souhrn.blizko} panelů je blíž než s = {cislo(hs.odstup)} m od jímací soustavy.</div>}
      {souhrn.nepropojeno > 0
        ? <div style={{ ...S.maly, color: ui.barvy.chyba }}>⚠ {souhrn.nepropojeno} volných konců vodičů – v modelu červeně „nepropojeno“. Dotáhněte je na jiné vedení, svod nebo k zemi.</div>
        : ((hs.vedeni || []).length > 0 && <div style={{ ...S.maly, color: ui.barvy.uspech }}>✓ Všechny vodiče jsou propojené (svorky jsou v modelu tmavě).</div>)}
      <div style={{ ...S.maly, fontStyle: "italic" }}>Návrh je orientační – rozestupy, ochranný úhel a dostatečnou vzdálenost ověřte výpočtem dle ČSN EN 62305-3.</div>
    </div>
  );

  // ── Riziko podle ČSN EN 62305-2 ──
  const rizVst = { ...rz.vychoziRiziko(navrh), ...(navrh.riziko || {}) };
  if (rizVst.H == null || rizVst.H === "") rizVst.H = Math.round(vyskaHrebene(navrh) * 100) / 100;
  if (!navrh.riziko?.L) { rizVst.L = navrh.delka; rizVst.W = navrh.sirka; }
  const lpsVychozi = (hs.vedeni || []).length ? (hs.trida || "III") : "";
  // postup podle obr. 1 normy + posouzení řešení (LPS z výkresu hromosvodu + SPD dle postupu)
  const aktualni = rz.posouzeniNavrhu(rizVst, lpsVychozi);
  const pozadovano = aktualni.postup;
  const lplSpd = aktualni.spd || "III-IV";
  const spdNavrh = rz.navrhSpd(rizVst, lplSpd, { blizkoFve: souhrn.blizko, maFve: souhrn.panelu > 0 });
  const zmenRiz = (k) => (v) => zmen(n => ({ ...n, riziko: { ...(n.riziko || {}), [k]: v } }));
  const vyberPole = (popis, hodnota, moznosti, onChange) => (
    <label style={{ display: "block" }}>
      <span style={S.popisek}>{popis}</span>
      <select style={S.pole} value={String(hodnota)} onChange={e => onChange(moznosti.find(m => String(m.k ?? m.id) === e.target.value)?.k ?? e.target.value)}>
        {moznosti.map(m => <option key={String(m.k ?? m.id) + m.t} value={String(m.k ?? m.id)}>{m.t}</option>)}
      </select>
    </label>
  );
  const zmenVedeni = (id, zm) => zmen(n => {
    const r = { ...rz.vychoziRiziko(n), ...(n.riziko || {}) };
    return { ...n, riziko: { ...(n.riziko || {}), vedeni: r.vedeni.map(v => (v.id === id ? { ...v, ...zm } : v)) } };
  });
  const zalozkaRiziko = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ ...S.maly }}>Riziko R1 – ztráty na lidských životech podle ČSN EN 62305-2 ed. 2 (stavba jako jedna zóna). Přípustné riziko R<sub>T</sub> = 10⁻⁵/rok.</div>
      <div style={{ border: `1px solid ${ui.barvy.okraj}`, borderRadius: 10, padding: 10 }}>
        <b style={{ fontSize: 13 }}>Postup podle ČSN EN 62305-2, obr. 1</b>
        <ol style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          {pozadovano.kroky.map((k, i) => (
            <li key={i} style={{ fontSize: 12 }}>
              {k.krok}: <b style={{ color: k.vyhovuje ? ui.barvy.uspech : ui.barvy.chyba }}>R1 = {exp10(k.R1)} {k.vyhovuje ? "≤" : ">"} R<sub>T</sub></b>
            </li>
          ))}
        </ol>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          Ochrana požadovaná normou: <b>{pozadovano.lps ? `LPS třídy ${pozadovano.lps}` : (pozadovano.kroky.length > 1 ? "LPS není z hlediska rizika nutný" : "ochrana není nutná")}{pozadovano.spd ? `, SPD na vstupu vedení pro LPL ${pozadovano.spd}` : ""}</b>
        </div>
      </div>
      <div style={{ background: aktualni.vyhovuje ? "#f0fdf4" : "#fef2f2", border: `1px solid ${aktualni.vyhovuje ? "#bbf7d0" : "#fecaca"}`, borderRadius: 10, padding: 10 }}>
        <div style={{ fontSize: 13 }}>Navržené řešení: {aktualni.lps ? `LPS třídy ${aktualni.lps}${aktualni.lpsZVykresu ? " (z výkresu hromosvodu)" : ""}` : "bez LPS"}{aktualni.spd ? `, SPD pro LPL ${aktualni.spd}` : ", bez SPD"}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: aktualni.vyhovuje ? ui.barvy.uspech : ui.barvy.chyba }}>R1 = {exp10(aktualni.R1)} {aktualni.vyhovuje ? "≤" : ">"} R<sub>T</sub> = 10⁻⁵</div>
        <div style={{ fontSize: 13 }}>{aktualni.vyhovuje ? "✓ Vyhovuje" : `✗ Nevyhovuje – norma vyžaduje ${pozadovano.lps ? `LPS třídy ${pozadovano.lps}` : "silnější ochranu"}`}</div>
        {aktualni.lpsZVykresu && !pozadovano.lps && <div style={S.maly}>LPS je navržen nad rámec požadavku rizika (např. kvůli FVE na střeše); u LPS je ekvipotenciální pospojování se SPD na vstupu vedení povinné.</div>}
        {aktualni.lpsZVykresu && pozadovano.lps && ["IV", "III", "II", "I"].indexOf(aktualni.lps) < ["IV", "III", "II", "I"].indexOf(pozadovano.lps) && <div style={{ ...S.maly, color: ui.barvy.chyba }}>Hromosvod ve výkresu má nižší třídu, než vyžaduje norma – nastavte třídu LPS {pozadovano.lps} v záložce Hromosvod.</div>}
      </div>
      <details open>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Stavba a okolí</summary>
        <div style={{ ...S.mrizka, marginTop: 8 }}>
          {cisloPole("Hustota úderů NG (1/km²/rok)", rizVst.ng, zmenRiz("ng"), 0.1)}
          {vyberPole("Poloha stavby CD", rizVst.cd, rz.CD, zmenRiz("cd"))}
          {cisloPole("L – délka (m)", rizVst.L, zmenRiz("L"))}
          {cisloPole("W – šířka (m)", rizVst.W, zmenRiz("W"))}
          {cisloPole("H – výška (m, hřeben)", rizVst.H, zmenRiz("H"))}
          <div style={{ ...S.maly, alignSelf: "end" }}>A<sub>D</sub> = {cislo(aktualni.AD, 0)} m², N<sub>D</sub> = {exp10(aktualni.ND)}/rok</div>
        </div>
        <div style={{ ...S.maly, marginTop: 4 }}>NG pro místo stavby odečtěte z mapy hustoty úderů / izokeraunické mapy ČHMÚ (orientačně NG ≈ 0,1 × počet bouřkových dnů).</div>
      </details>
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Ztráty a vnitřek stavby</summary>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {vyberPole("Typ podlahy uvnitř (rt)", rizVst.rtPovrch, rz.RT_POVRCH, zmenRiz("rtPovrch"))}
          {vyberPole("Riziko požáru (rf)", rizVst.rf, rz.RF, zmenRiz("rf"))}
          {vyberPole("Protipožární opatření (rp)", rizVst.rp, rz.RP, zmenRiz("rp"))}
          {vyberPole("Zvláštní nebezpečí (hz)", rizVst.hz, rz.HZ, zmenRiz("hz"))}
          {vyberPole("Typ stavby – ztráta LF", rizVst.lf, rz.LF, zmenRiz("lf"))}
          <div>
            <span style={S.popisek}>Opatření proti dotykovému a krokovému napětí (PTA)</span>
            {rz.PTA.map(o => (
              <label key={o.id} style={{ ...S.maly, display: "flex", gap: 6 }}>
                <input type="checkbox" checked={(rizVst.ptaOpatreni || []).includes(o.id)} onChange={e => zmenRiz("ptaOpatreni")(e.target.checked ? [...(rizVst.ptaOpatreni || []), o.id] : (rizVst.ptaOpatreni || []).filter(x => x !== o.id))} /> {o.t}
              </label>
            ))}
          </div>
        </div>
      </details>
      {rizVst.vedeni.map(v => {
        const vys = aktualni.vedeni.find(x => x.id === v.id);
        return (
          <details key={v.id}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{v.nazev} – N<sub>L</sub> = {exp10(vys?.NL || 0)}/rok</summary>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <div style={S.mrizka}>
                {cisloPole("Délka sekce LL (m)", v.delka, x => zmenVedeni(v.id, { delka: x }), 10)}
                {vyberPole("Impulzní výdržné napětí Uw (kV)", v.uw, rz.UW.map(u => ({ k: u, t: `${String(u).replace(".", ",")} kV` })), x => zmenVedeni(v.id, { uw: x }))}
              </div>
              {vyberPole("Instalace CI", v.ci, rz.CI, x => zmenVedeni(v.id, { ci: x }))}
              {vyberPole("Typ CT", v.ct, rz.CT, x => zmenVedeni(v.id, { ct: x }))}
              {vyberPole("Prostředí CE", v.ce, rz.CE, x => zmenVedeni(v.id, { ce: x }))}
              {vyberPole("Stínění a pospojování (CLD)", v.stineni, rz.STINENI, x => zmenVedeni(v.id, { stineni: x }))}
              {vyberPole("Odpor stínění (PLD)", v.rs, rz.RS, x => zmenVedeni(v.id, { rs: x }))}
            </div>
          </details>
        );
      })}
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Součásti rizika (aktuální varianta)</summary>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 6 }}>
          <tbody>
            {[["RA – úraz při úderu do stavby", aktualni.RA], ["RB – hmotná škoda (požár) při úderu do stavby", aktualni.RB], ["RU – úraz při úderu do vedení", aktualni.RU], ["RV – hmotná škoda při úderu do vedení", aktualni.RV], ["R1 celkem", aktualni.R1]].map(([t, x]) => (
              <tr key={t}><td style={{ ...ui.td, padding: "5px 6px" }}>{t}</td><td style={{ ...ui.td, padding: "5px 6px", textAlign: "right", fontWeight: 700 }}>{exp10(x)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
      <div style={{ border: `2px solid ${ui.barvy.uspech}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ ...S.radek, justifyContent: "space-between" }}>
          <b style={{ fontSize: 13 }}>Přepěťové ochrany (SPD) – LPL {lplSpd}</b>
        </div>
        {spdNavrh.polozky.map(p => (
          <div key={p.id} style={{ borderTop: `1px solid ${ui.barvy.okrajJemny}`, paddingTop: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{p.nazev}: {p.typ}</div>
            <div style={{ fontSize: 12 }}>{p.text}</div>
            <div style={S.maly}>{p.misto}</div>
            {p.iimp != null && <div style={S.maly}>Úder do stavby (E.1, E.4, E.5): {cislo(p.s1)} kA · úder do vedení (tab. E.{p.silove ? 2 : 3}): {cislo(p.s3)} kA → rozhoduje vyšší</div>}
          </div>
        ))}
        <div style={S.mrizka}>
          {cisloPole("Další kovové sítě do budovy (voda, plyn…)", rizVst.dalsiSite ?? 0, zmenRiz("dalsiSite"), 1, 0)}
          {rizVst.vedeni.map(v => (
            <div key={v.id}>{cisloPole(`${v.nazev} – počet vodičů`, v.vodicu ?? (v.id === "tlc" ? 2 : 4), x => zmenVedeni(v.id, { vodicu: x }), 1, 1)}</div>
          ))}
        </div>
        <div style={{ ...S.maly, fontStyle: "italic" }}>Proudy podle ČSN EN 62305-1 ed. 2, příloha E: bleskový proud {spdNavrh.I} kA (LPL {lplSpd}), polovina do uzemnění, zbytek rovným dílem do {spdNavrh.n} vstupujících sítí (k<sub>e</sub> = {cislo(spdNavrh.ke, 3)}) a jejich vodičů. Up se volí s rezervou pod výdržným napětím zařízení U<sub>W</sub> (koordinace dle ČSN EN 62305-4).</div>
      </div>
      <button style={S.btn(ui.barvy.akcent, "normal")} disabled={generuji} onClick={async () => {
        setGeneruji(true);
        try { await vytvorListRizika({ navrh }); } catch (e) { window.alert("List výpočtu rizika se nepodařilo vytvořit: " + (e?.message || e)); } finally { setGeneruji(false); }
      }}><i className="ti ti-file-type-pdf" /> {generuji ? "Vytvářím PDF…" : "List výpočtu rizika (PDF)"}</button>
      <div style={{ ...S.maly, fontStyle: "italic" }}>Výpočet ověřen na případové studii E.2 normy (venkovský dům: R1 = 2,51·10⁻⁵ bez ochrany). Riziko R4 (ekonomické ztráty) se nepočítá.</div>
    </div>
  );

  const zalozkaSoupis = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {radkySoupisu.length === 0 ? <div style={S.maly}>Zatím není nic zakresleno.</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={ui.th}>Položka</th><th style={{ ...ui.th, textAlign: "right" }}>Množství</th><th style={ui.th}></th></tr></thead>
          <tbody>
            {radkySoupisu.map((r, i) => <tr key={i}><td style={{ ...ui.td, padding: "7px 8px" }}>{r[0]}</td><td style={{ ...ui.td, padding: "7px 8px", textAlign: "right", fontWeight: 700, color: ui.barvy.text }}>{r[1]}</td><td style={{ ...ui.td, padding: "7px 8px" }}>{r[2]}</td></tr>)}
          </tbody>
        </table>
      )}
      <div style={S.radek}>
        <button style={S.btn(ui.barvy.akcent, "normal")} disabled={generuji} onClick={montazniDokumentace}><i className="ti ti-file-type-pdf" /> {generuji ? "Vytvářím PDF…" : "Montážní dokumentace (PDF)"}</button>
        <button style={S.btn(ui.barvy.primarni)} onClick={exportCsv}><i className="ti ti-file-spreadsheet" /> Soupis do Excelu (CSV)</button>
        <button style={S.btn(ui.barvy.primarni)} onClick={exportPng}><i className="ti ti-photo" /> Obrázek pohledu (PNG)</button>
      </div>
      {(navrh.mereni || []).length > 0 && (
        <div>
          <b style={{ fontSize: 13 }}>Měření</b>
          {navrh.mereni.map((m, i) => (
            <div key={m.id} style={{ ...S.radek, justifyContent: "space-between", fontSize: 13 }}>
              <span>Míra {i + 1}: {cislo(v3.dist(m.a, m.b))} m</span>
              <button style={S.obrys} onClick={() => zmen(n => ({ ...n, mereni: n.mereni.filter(x => x.id !== m.id) }))}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...S.radek, justifyContent: "space-between" }}>
        <h1 style={{ ...ui.nadpis, fontSize: 22 }}>🏠 3D návrh domu – FVE a hromosvod</h1>
        <div style={S.radek}>
          <select style={{ ...S.pole, width: "auto", maxWidth: 220 }} value={navrh.id} onChange={e => otevrit(e.target.value)}>
            {(() => {
              const vse = [...cloudSeznam.map(x => ({ ...x, db: true })), ...navrhy.filter(x => !cloudSeznam.some(c => c.id === x.id))];
              if (!vse.some(x => x.id === navrh.id)) vse.unshift({ id: navrh.id, nazev: navrh.nazev });
              return vse.map(x => <option key={x.id} value={x.id}>{x.db ? "☁ " : ""}{x.nazev}{x.zakaznik ? ` – ${x.zakaznik}` : ""}</option>);
            })()}
          </select>
          <span style={{ ...S.maly, color: stavDb === "chyba" ? ui.barvy.chyba : ui.barvy.textSlaby }} title="Návrhy se ukládají do databáze a vidí je všichni, kdo pracují s 3D návrhy">
            {stavDb === "uklada" ? "☁ Ukládám…" : stavDb === "chyba" ? "⚠ Neuloženo v databázi (offline?) – zkusím znovu při další změně" : stavDb === "nacitam" ? "☁ Načítám…" : maObsah(navrh) ? "☁ Uloženo" : ""}
          </span>
          <button style={S.btn(ui.barvy.uspech)} onClick={novy}><i className="ti ti-plus" /> Nový</button>
          <button style={S.btn(ui.barvy.akcent)} disabled={generuji} onClick={montazniDokumentace} title="Montážní dokumentace v PDF"><i className="ti ti-file-type-pdf" /> {generuji ? "Vytvářím…" : "Dokumentace PDF"}</button>
          <button style={S.obrys} onClick={zpet} title="Zpět (Ctrl+Z)"><i className="ti ti-arrow-back-up" /> Zpět</button>
          <button style={S.obrys} onClick={exportJson} title="Uložit návrh do souboru"><i className="ti ti-download" /></button>
          <label style={S.obrys} title="Načíst návrh ze souboru"><i className="ti ti-upload" />
            <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importJson(f); }} />
          </label>
          <button style={S.obrys} onClick={smazatNavrh} title="Smazat návrh"><i className="ti ti-trash" /></button>
        </div>
      </div>
      {editRohy && navrh.fotky?.[editRohy] && (
        <RohyEditor foto={navrh.fotky[editRohy]} nazev={`${STRANY.find(x => x.id === editRohy)?.nazev} stěna`}
          onZavrit={() => setEditRohy(null)}
          onUlozit={(rohy) => { const id = editRohy; zmen(n => ({ ...n, fotky: { ...n.fotky, [id]: { ...n.fotky[id], rohy } } })); setEditRohy(null); }} />
      )}
      {chybaUlozeni && <div style={{ ...S.maly, color: ui.barvy.chyba }}>⚠ Návrh se nevešel do úložiště zařízení (fotky jsou velké). Smažte staré návrhy, nebo ho uložte do souboru tlačítkem ⬇.</div>}

      <div style={{ display: "flex", gap: 12, flexDirection: sirokyDisplej ? "row" : "column", alignItems: "stretch" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ ...S.radek }}>
            {REZIMY.map(r => (
              <button key={r.id} style={S.stitek(rezim === r.id)} onClick={() => zmenRezim(r.id)}><i className={`ti ${r.ikona}`} /> {r.nazev}</button>
            ))}
          </div>
          <div style={{ position: "relative", height: sirokyDisplej ? "calc(100dvh - 210px)" : "62dvh", minHeight: 360, borderRadius: 12, overflow: "hidden", border: `1px solid ${ui.barvy.okraj}` }}>
            <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
            {upravaKoty && (
              <div role="dialog" aria-label={upravaKoty.popis} onPointerDown={e => e.stopPropagation()}
                style={{ position: "absolute", left: upravaKoty.x, top: upravaKoty.y, width: 220, zIndex: 20, background: "#fffbeb", border: "2px solid #f59e0b", borderRadius: 10, padding: 8, boxShadow: "0 8px 24px rgba(0,0,0,.25)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e" }}>{upravaKoty.popis}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button type="button" aria-label="Zmenšit o 5 cm" onClick={() => posunoutKotu(-0.05)} style={{ ...S.obrys, padding: "4px 10px", fontSize: 16, fontWeight: 800 }}>−</button>
                  <input autoFocus inputMode="decimal" value={upravaKoty.text} aria-label={upravaKoty.popis}
                    onChange={e => zmenitKotu(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") setUpravaKoty(null);
                      else if (e.key === "Escape") zrusitKotu();
                      else if (e.key === "ArrowUp") { e.preventDefault(); posunoutKotu(e.shiftKey ? 0.01 : 0.05); }
                      else if (e.key === "ArrowDown") { e.preventDefault(); posunoutKotu(e.shiftKey ? -0.01 : -0.05); }
                    }}
                    style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 18, fontWeight: 800, color: "#9a3412", background: "#fff", border: "2px solid #fdba74", borderRadius: 8, padding: "4px 6px", fontFamily: "inherit" }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>m</span>
                  <button type="button" aria-label="Zvětšit o 5 cm" onClick={() => posunoutKotu(0.05)} style={{ ...S.obrys, padding: "4px 10px", fontSize: 16, fontWeight: 800 }}>+</button>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => setUpravaKoty(null)} style={{ ...S.btn(ui.barvy.uspech), flex: 1, padding: "5px 8px" }}>✓ Hotovo</button>
                  <button type="button" onClick={zrusitKotu} style={{ ...S.obrys, padding: "5px 8px" }}>Zrušit</button>
                </div>
                <div style={{ fontSize: 10, color: "#92400e" }}>Šipky ↑↓ po 5 cm (se Shiftem po 1 cm), Enter = hotovo, Esc = zrušit.</div>
              </div>
            )}
            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {[["3d", "3D"], ["predni", "Zepředu"], ["prava", "Zprava"], ["zadni", "Zezadu"], ["leva", "Zleva"], ["shora", "Shora"]].map(([k, t]) => (
                <button key={k} onClick={() => pohled(k)} style={{ ...S.stitek(false), padding: "4px 8px", fontSize: 11, background: "rgba(255,255,255,0.9)" }}>{t}</button>
              ))}
            </div>
            <div style={{ position: "absolute", left: 8, bottom: 8, right: 8, pointerEvents: "none" }}>
              <span style={{ background: "rgba(14,59,94,0.85)", color: "#fff", fontSize: 12, padding: "5px 10px", borderRadius: 8, display: "inline-block" }}>
                {rezimInfo.napoveda}{merBod ? " – teď druhý bod." : ""}
              </span>
            </div>
          </div>
        </div>
        <div style={{ ...S.karta, flex: sirokyDisplej ? "0 0 380px" : "1 1 auto", maxHeight: sirokyDisplej ? "calc(100dvh - 170px)" : "none", overflowY: "auto" }}>
          <div style={{ ...S.radek, marginBottom: 12 }}>
            {ZALOZKY.map(([k, t]) => <button key={k} style={S.stitek(zalozka === k)} onClick={() => setZalozka(k)}>{t}</button>)}
          </div>
          {zalozka === "rozmery" && zalozkaRozmery}
          {zalozka === "fotky" && zalozkaFotky}
          {zalozka === "fve" && zalozkaFve}
          {zalozka === "hromosvod" && zalozkaHromosvod}
          {zalozka === "riziko" && zalozkaRiziko}
          {zalozka === "soupis" && zalozkaSoupis}
        </div>
      </div>
    </div>
  );
}
