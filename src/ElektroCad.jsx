// ─── Elektro CAD: editor elektro schémat s výpočty a výstupy PDF/DXF/Word ───
// Výkres v mm na listu A4–A2 s razítkem firmy. Značky (znacky.js) se kladou
// na mřížku 2,5 mm, vodiče se kreslí pravoúhle a přichytávají se k pinům.
// Vodič s vyplněným kabelem je vývod → výpočty (vypocty.js): průřez/jištění,
// úbytek napětí, impedance smyčky, bilance. Výstupy (exporty.js): PDF výkresu
// s protokolem výpočtů, DXF pro AutoCAD a technická zpráva ve Wordu.
// Projekty se ukládají v zařízení (localStorage) a jdou exportovat do JSON.

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as ui from "./ui.js";
import { COMPANY } from "./invoicingUtils.js";
import { zakazkaVeVyberu } from "./zakazkyVyber.js";
import { nahratFotkuZakazky } from "./fotkyZakazky.js";
import {
  ZNACKY, SKUPINY, FORMATY, STYLY_VODICE, MRIZKA, snap, kresliPrvek, vsechnyPrimitivy, rozmerTextu, novyId, kresliRamecek, popisKabelu,
} from "./elektroCad/znacky.js";
import { svgObsah, exportPdf, exportDxf, exportWord, stahni, nazevSouboru } from "./elektroCad/exporty.js";
import { spocitejVyvody, bilance, ULOZENI, PRUREZY, cislo } from "./elektroCad/vypocty.js";
import { SABLONY, vychoziProjekt } from "./elektroCad/sablony.js";

const KLIC = "elektroCad.projekty";
const KLIC_POSLEDNI = "elektroCad.posledni";
const nactiVse = () => { try { return JSON.parse(localStorage.getItem(KLIC) || "{}"); } catch { return {}; } };
const ulozVse = (v) => { try { localStorage.setItem(KLIC, JSON.stringify(v)); } catch { /* plné úložiště */ } };

const B = ui.barvy;
const S = {
  btn: (c = B.primarni) => ({ ...ui.tlacitko(c, "male"), cursor: "pointer", whiteSpace: "nowrap" }),
  obrys: { ...ui.tlacitkoObrys("male"), cursor: "pointer", whiteSpace: "nowrap" },
  pole: { ...ui.pole, padding: "5px 7px", fontSize: 12 },
  popisek: { ...ui.popisek, fontSize: 10, marginBottom: 2 },
  karta: { ...ui.karta, padding: 12 },
  tab: (a) => ({ padding: "7px 14px", border: "none", borderBottom: `2px solid ${a ? B.primarni : "transparent"}`, background: "none", color: a ? B.primarni : B.textMekky, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }),
  nastroj: (a) => ({ padding: "6px 9px", borderRadius: 6, border: `1px solid ${a ? B.primarni : B.okraj}`, background: a ? B.primarni : "#fff", color: a ? "#fff" : B.text, fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }),
};

const POPISKY_V = {
  ozn: "Označení", poly: "Počet pólů", char: "Charakteristika", In: "In [A]", IdN: "IΔn [mA]", typRcd: "Typ chrániče", vyrobce: "Výrobce", typ: "Typ / obj. číslo",
  typSpd: "Typ SPD", P: "Příkon / výkon [kW]", beta: "Soudobost β", pocet: "Počet panelů", Wp: "Wp na panel", kWh: "Kapacita [kWh]", zkratka: "Zkratka v rámečku", faze: "Fáze", delka: "Délka [mm]", popis: "Popis (víc řádků)",
};
const VOLBY_V = {
  poly: [1, 2, 3, 4], char: ["B", "C", "D", "gG"], typRcd: ["AC", "A", "F", "B"], typSpd: ["T1", "T1+T2", "T2", "T3"], faze: [1, 3],
};
const CISELNE = new Set(["poly", "In", "IdN", "P", "beta", "pocet", "Wp", "kWh", "faze", "delka"]);
const JISTICI = ["jistic", "pojistka", "jisticChranic", "chranic"];

// ── geometrie pro výběr ──
const vzdalenostUsecky = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
function obalPrvku(p) {
  const { prim, bbox } = kresliPrvek(p);
  let [x0, y0, x1, y1] = bbox;
  for (const pr of prim) if (pr.k === "t") { const r = rozmerTextu(pr); x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]); }
  return { sym: bbox, vse: [x0, y0, x1, y1] };
}
const uvnitr = ([x, y], [x0, y0, x1, y1], o = 0) => x >= x0 - o && x <= x1 + o && y >= y0 - o && y <= y1 + o;
const stejnyBod = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;

// Pravoúhlá cesta z bodu a do b (nejdřív vodorovně, nebo svisle)
function cesta(a, b, svisleNejdriv = false) {
  if (Math.abs(a[0] - b[0]) < 0.01 || Math.abs(a[1] - b[1]) < 0.01) return [b];
  return svisleNejdriv ? [[a[0], b[1]], b] : [[b[0], a[1]], b];
}
const zjednodus = (b) => {
  const o = [];
  for (const p of b) {
    if (o.length && stejnyBod(o[o.length - 1], p)) continue;
    if (o.length >= 2) {
      const [a, c] = [o[o.length - 2], o[o.length - 1]];
      if ((Math.abs(a[0] - c[0]) < 0.01 && Math.abs(c[0] - p[0]) < 0.01) || (Math.abs(a[1] - c[1]) < 0.01 && Math.abs(c[1] - p[1]) < 0.01)) { o[o.length - 1] = p; continue; }
    }
    o.push(p);
  }
  return o;
};

// Posun prvku i s konci vodičů, které jsou na jeho pinech
function posunPrvek(projekt, id, dx, dy) {
  const p = projekt.prvky.find(x => x.id === id);
  if (!p) return projekt;
  const piny = kresliPrvek(p).piny;
  const vodice = projekt.vodice.map(w => {
    let b = w.b.map(x => [...x]), zmena = false;
    const n = b.length;
    const zacatek = piny.some(pin => stejnyBod(pin, b[0])), konec = piny.some(pin => stejnyBod(pin, b[n - 1]));
    if (zacatek && konec) return { ...w, b: b.map(([x, y]) => [x + dx, y + dy]) };
    for (const [i, j] of [[0, 1], [n - 1, n - 2]]) {
      if (!(i === 0 ? zacatek : konec)) continue;
      const svisly = Math.abs(b[i][0] - b[j][0]) < 0.01;
      b[i] = [b[i][0] + dx, b[i][1] + dy]; zmena = true;
      if (n > 2 && j !== 0 && j !== n - 1) { if (svisly) b[j] = [b[j][0] + dx, b[j][1]]; else b[j] = [b[j][0], b[j][1] + dy]; }
      else if (Math.abs(b[i][0] - b[j][0]) > 0.01 && Math.abs(b[i][1] - b[j][1]) > 0.01) {
        const roh = svisly ? [b[i][0], b[j][1]] : [b[j][0], b[i][1]];
        b = i === 0 ? [b[0], roh, ...b.slice(1)] : [...b.slice(0, -1), roh, b[b.length - 1]];
      }
    }
    return zmena ? { ...w, b: zjednodus(b) } : w;
  });
  return { ...projekt, vodice, prvky: projekt.prvky.map(x => x.id === id ? { ...x, x: x.x + dx, y: x.y + dy } : x) };
}

export default function ElektroCad({ contracts = [], customers = [], currentUser }) {
  const uzivatel = currentUser?.name || "";
  const [vse, setVse] = useState(nactiVse);
  const [projekt, setProjektRaw] = useState(() => {
    const v = nactiVse(), id = localStorage.getItem(KLIC_POSLEDNI);
    return (id && v[id]) || SABLONY[1].vytvor(uzivatel);
  });
  const historie = useRef({ zpet: [], vpred: [] });
  const [zalozka, setZalozka] = useState("vykres");
  const [panel, setPanel] = useState("vlastnosti");
  const [rezim, setRezim] = useState({ k: "vyber" });
  const [vyber, setVyber] = useState(null); // {druh, id}
  const [kurzor, setKurzor] = useState(null);
  const [rozpracovany, setRozpracovany] = useState(null); // body vodiče
  const [pohledRaw, setPohledRaw] = useState(null); // {x,y,w,klic} v mm
  const [zprava, setZprava] = useState(null);
  const [pracuje, setPracuje] = useState(false);
  const [novySablona, setNovySablona] = useState(null);
  const svgRef = useRef(null), obalRef = useRef(null), tah = useRef(null), mezera = useRef(false);
  const firma = COMPANY;
  const F = FORMATY[projekt.format] || FORMATY.A4;

  // ── změny s historií ──
  const zmen = useCallback((fn, bezHistorie = false) => {
    setProjektRaw(prev => {
      const dalsi = typeof fn === "function" ? fn(prev) : fn;
      if (!bezHistorie && dalsi !== prev) { historie.current.zpet.push(prev); if (historie.current.zpet.length > 100) historie.current.zpet.shift(); historie.current.vpred = []; }
      return dalsi;
    });
  }, []);
  const zpet = () => setProjektRaw(prev => { const h = historie.current; if (!h.zpet.length) return prev; h.vpred.push(prev); return h.zpet.pop(); });
  const vpred = () => setProjektRaw(prev => { const h = historie.current; if (!h.vpred.length) return prev; h.zpet.push(prev); return h.vpred.pop(); });

  // automatické uložení do zařízení
  useEffect(() => {
    const t = setTimeout(() => {
      setVse(prev => { const v = { ...prev, [projekt.id]: { ...projekt, upraveno: new Date().toISOString() } }; ulozVse(v); return v; });
      localStorage.setItem(KLIC_POSLEDNI, projekt.id);
    }, 500);
    return () => clearTimeout(t);
  }, [projekt]);

  // pohled (výřez v mm); po změně schématu nebo formátu se ukáže celý list
  const klicPohledu = `${projekt.id}|${projekt.format}`;
  const vychoziPohled = { x: -5, y: -5, w: F.w + 10 };
  const pohled = pohledRaw?.klic === klicPohledu ? pohledRaw : vychoziPohled;
  const setPohled = (v) => setPohledRaw(prev => {
    const zaklad = prev?.klic === klicPohledu ? prev : vychoziPohled;
    return { ...(typeof v === "function" ? v(zaklad) : v), klic: klicPohledu };
  });
  const celyList = () => setPohled(vychoziPohled);
  // poměr stran plátna (pro viewBox)
  const [pomer, setPomer] = useState(0.6);
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const ro = new ResizeObserver(() => { if (el.clientWidth) setPomer(el.clientHeight / el.clientWidth); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [zalozka]);

  const prim = useMemo(() => vsechnyPrimitivy(projekt, firma), [projekt, firma]);
  const svgStatic = useMemo(() => svgObsah(prim), [prim]);
  const vyvody = useMemo(() => spocitejVyvody(projekt), [projekt]);
  const bil = useMemo(() => bilance(projekt), [projekt]);
  const vsechnyPiny = useMemo(() => projekt.prvky.flatMap(p => kresliPrvek(p).piny), [projekt.prvky]);

  const vybranyPrvek = vyber?.druh === "prvek" ? projekt.prvky.find(p => p.id === vyber.id) : null;
  const vybranyVodic = vyber?.druh === "vodic" ? projekt.vodice.find(p => p.id === vyber.id) : null;
  const vybranyRamecek = vyber?.druh === "ramecek" ? projekt.ramecky.find(p => p.id === vyber.id) : null;
  const vybranyText = vyber?.druh === "text" ? projekt.texty.find(p => p.id === vyber.id) : null;

  // ── souřadnice ──
  const naMm = (e) => {
    const svg = svgRef.current; if (!svg) return [0, 0];
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [r.x, r.y];
  };
  const prichyt = (m, kPinum = true) => {
    if (kPinum) {
      let nej = null, d = 2.6;
      for (const pin of vsechnyPiny) { const v = Math.hypot(pin[0] - m[0], pin[1] - m[1]); if (v < d) { d = v; nej = pin; } }
      if (nej) return { b: [...nej], pin: true };
    }
    return { b: [snap(m[0]), snap(m[1])], pin: false };
  };

  const najdi = (m) => {
    for (let i = projekt.texty.length - 1; i >= 0; i--) { const t = projekt.texty[i]; if (uvnitr(m, rozmerTextu({ ...t, h: +t.h || 2.5, a: t.a || "l" }), 0.8)) return { druh: "text", id: t.id }; }
    for (let i = projekt.prvky.length - 1; i >= 0; i--) { const p = projekt.prvky[i]; if (uvnitr(m, obalPrvku(p).sym, 1.2)) return { druh: "prvek", id: p.id }; }
    let nej = null, d = 1.3;
    for (const w of projekt.vodice) for (let i = 1; i < w.b.length; i++) { const v = vzdalenostUsecky(m, w.b[i - 1], w.b[i]); if (v < d) { d = v; nej = { druh: "vodic", id: w.id }; } }
    if (nej) return nej;
    for (let i = projekt.prvky.length - 1; i >= 0; i--) { const p = projekt.prvky[i]; if (uvnitr(m, obalPrvku(p).vse, 0.5)) return { druh: "prvek", id: p.id }; }
    for (const r of projekt.ramecky) {
      const okraj = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h], [r.x, r.y]];
      for (let i = 1; i < 5; i++) if (vzdalenostUsecky(m, okraj[i - 1], okraj[i]) < 1.3) return { druh: "ramecek", id: r.id };
      if (r.nazev && kresliRamecek(r).some(t => t.k === "t" && uvnitr(m, rozmerTextu(t), 0.5))) return { druh: "ramecek", id: r.id };
    }
    return null;
  };

  // ── ukazatel ──
  const dolu = (e) => {
    if (e.button === 2) return;
    const m = naMm(e);
    obalRef.current?.focus({ preventScroll: true });
    if (e.button === 1 || mezera.current) { tah.current = { k: "pan", sx: e.clientX, sy: e.clientY, p: pohled }; e.currentTarget.setPointerCapture(e.pointerId); return; }
    if (rezim.k === "vlozit") {
      const z = ZNACKY[rezim.typ];
      const id = novyId();
      const [x, y] = [snap(m[0]), snap(m[1])];
      const cislo = projekt.prvky.filter(p => p.typ === rezim.typ).length + 1;
      const v = { ...z.vychozi, ozn: z.vychozi.ozn ? z.vychozi.ozn + cislo : "" };
      zmen(p => ({ ...p, prvky: [...p.prvky, { id, typ: rezim.typ, x, y, rot: 0, v }] }));
      setVyber({ druh: "prvek", id });
      if (!e.shiftKey) setRezim({ k: "vyber" });
      return;
    }
    if (rezim.k === "vodic") {
      const { b, pin } = prichyt(m);
      if (!rozpracovany) { setRozpracovany([b]); return; }
      const posl = rozpracovany[rozpracovany.length - 1];
      if (stejnyBod(posl, b)) { dokonciVodic(rozpracovany); return; }
      const nove = [...rozpracovany, ...cesta(posl, b, e.altKey)];
      const naVodici = projekt.vodice.some(w => w.b.some((_, i) => i && vzdalenostUsecky(b, w.b[i - 1], w.b[i]) < 0.05));
      if ((pin || naVodici) && rozpracovany.length >= 1) dokonciVodic(nove); else setRozpracovany(nove);
      return;
    }
    if (rezim.k === "ramecek") { const b = [snap(m[0]), snap(m[1])]; tah.current = { k: "novyRamecek", a: b }; setRozpracovany([b, b]); e.currentTarget.setPointerCapture(e.pointerId); return; }
    if (rezim.k === "text") {
      const id = novyId();
      zmen(p => ({ ...p, texty: [...p.texty, { id, x: snap(m[0]), y: snap(m[1]), h: 2.5, t: "Text", a: "l" }] }));
      setVyber({ druh: "text", id }); setPanel("vlastnosti"); setRezim({ k: "vyber" });
      return;
    }
    // výběr / přesun
    if (vybranyVodic) {
      const i = vybranyVodic.b.findIndex(b => Math.hypot(b[0] - m[0], b[1] - m[1]) < 1.2);
      if (i >= 0) { historie.current.zpet.push(projekt); historie.current.vpred = []; tah.current = { k: "bod", id: vybranyVodic.id, i, start: m, orig: vybranyVodic.b }; e.currentTarget.setPointerCapture(e.pointerId); return; }
    }
    const hit = najdi(m);
    setVyber(hit);
    if (hit) { setPanel("vlastnosti"); historie.current.zpet.push(projekt); historie.current.vpred = []; tah.current = { k: "posun", hit, start: m, posl: [0, 0] }; }
    else tah.current = { k: "pan", sx: e.clientX, sy: e.clientY, p: pohled };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const pohyb = (e) => {
    const m = naMm(e);
    setKurzor(m);
    const t = tah.current;
    if (!t) return;
    if (t.k === "pan") {
      const svg = svgRef.current; const k = t.p.w / svg.clientWidth;
      setPohled({ ...t.p, x: t.p.x - (e.clientX - t.sx) * k, y: t.p.y - (e.clientY - t.sy) * k });
      return;
    }
    if (t.k === "novyRamecek") { setRozpracovany([t.a, [snap(m[0]), snap(m[1])]]); return; }
    if (t.k === "bod") {
      const b = t.orig.map(x => [...x]); b[t.i] = [snap(m[0]), snap(m[1])];
      zmen(p => ({ ...p, vodice: p.vodice.map(w => w.id === t.id ? { ...w, b } : w) }), true);
      return;
    }
    if (t.k === "posun") {
      const dx = snap(m[0] - t.start[0]), dy = snap(m[1] - t.start[1]);
      const ddx = dx - t.posl[0], ddy = dy - t.posl[1];
      if (!ddx && !ddy) return;
      t.posl = [dx, dy]; t.pohnuto = true;
      const { druh, id } = t.hit;
      zmen(p => {
        if (druh === "prvek") return posunPrvek(p, id, ddx, ddy);
        if (druh === "vodic") return { ...p, vodice: p.vodice.map(w => w.id === id ? { ...w, b: w.b.map(([x, y]) => [x + ddx, y + ddy]) } : w) };
        if (druh === "ramecek") return { ...p, ramecky: p.ramecky.map(r => r.id === id ? { ...r, x: r.x + ddx, y: r.y + ddy } : r) };
        if (druh === "text") return { ...p, texty: p.texty.map(r => r.id === id ? { ...r, x: r.x + ddx, y: r.y + ddy } : r) };
        return p;
      }, true);
    }
  };

  const nahoru = () => {
    const t = tah.current; tah.current = null;
    if (!t) return;
    if (t.k === "posun" && !t.pohnuto) historie.current.zpet.pop();
    if (t.k === "bod") setProjektRaw(p => ({ ...p, vodice: p.vodice.map(w => w.id === t.id ? { ...w, b: zjednodus(w.b) } : w) }));
    if (t.k === "novyRamecek" && rozpracovany) {
      const [[ax, ay], [bx, by]] = rozpracovany;
      setRozpracovany(null);
      if (Math.abs(ax - bx) < 5 || Math.abs(ay - by) < 5) return;
      const id = novyId();
      zmen(p => ({ ...p, ramecky: [...p.ramecky, { id, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(ax - bx), h: Math.abs(ay - by), nazev: "Rozvaděč", popis: "" }] }));
      setVyber({ druh: "ramecek", id }); setRezim({ k: "vyber" });
    }
  };

  const dokonciVodic = (body) => {
    const b = zjednodus(body);
    setRozpracovany(null);
    if (b.length < 2) return;
    const id = novyId();
    zmen(p => ({ ...p, vodice: [...p.vodice, { id, b, styl: rezim.styl || "faze" }] }));
    setVyber({ druh: "vodic", id });
  };

  const kolecko = (e) => {
    if (!pohled) return;
    const m = naMm(e);
    const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const w = Math.max(20, Math.min(F.w * 3, pohled.w * k));
    const f = w / pohled.w;
    setPohled({ x: m[0] - (m[0] - pohled.x) * f, y: m[1] - (m[1] - pohled.y) * f, w });
  };
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const h = (e) => e.preventDefault();
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [zalozka]);

  // ── úpravy vybraného ──
  const smazVybrane = () => {
    if (!vyber) return;
    const { druh, id } = vyber;
    const kl = { prvek: "prvky", vodic: "vodice", ramecek: "ramecky", text: "texty" }[druh];
    zmen(p => ({ ...p, [kl]: p[kl].filter(x => x.id !== id) }));
    setVyber(null);
  };
  const otoc = () => {
    if (!vybranyPrvek && !vybranyText) return;
    if (vybranyText) return zmen(p => ({ ...p, texty: p.texty.map(t => t.id === vybranyText.id ? { ...t, rot: t.rot ? 0 : 90 } : t) }));
    zmen(p => ({ ...p, prvky: p.prvky.map(x => x.id === vybranyPrvek.id ? { ...x, rot: ((x.rot || 0) + 90) % 360 } : x) }));
  };
  const duplikuj = () => {
    if (!vyber) return;
    const id = novyId();
    const kl = { prvek: "prvky", vodic: "vodice", ramecek: "ramecky", text: "texty" }[vyber.druh];
    zmen(p => {
      const o = p[kl].find(x => x.id === vyber.id); if (!o) return p;
      const kopie = JSON.parse(JSON.stringify(o)); kopie.id = id;
      if (kl === "vodice") kopie.b = kopie.b.map(([x, y]) => [x + 10, y + 10]); else { kopie.x += 10; kopie.y += 10; }
      return { ...p, [kl]: [...p[kl], kopie] };
    });
    setVyber({ druh: vyber.druh, id });
  };
  const posunVybrane = (dx, dy) => {
    if (!vyber) return;
    const { druh, id } = vyber;
    zmen(p => druh === "prvek" ? posunPrvek(p, id, dx, dy)
      : druh === "vodic" ? { ...p, vodice: p.vodice.map(w => w.id === id ? { ...w, b: w.b.map(([x, y]) => [x + dx, y + dy]) } : w) }
        : druh === "ramecek" ? { ...p, ramecky: p.ramecky.map(r => r.id === id ? { ...r, x: r.x + dx, y: r.y + dy } : r) }
          : { ...p, texty: p.texty.map(r => r.id === id ? { ...r, x: r.x + dx, y: r.y + dy } : r) });
  };

  const klavesa = (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === " ") { mezera.current = true; e.preventDefault(); return; }
    if (ctrl && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? vpred() : zpet(); return; }
    if (ctrl && e.key.toLowerCase() === "y") { e.preventDefault(); vpred(); return; }
    if (ctrl && e.key.toLowerCase() === "d") { e.preventDefault(); duplikuj(); return; }
    if (e.key === "Escape") { if (rozpracovany && rezim.k === "vodic") dokonciVodic(rozpracovany); setRozpracovany(null); setRezim({ k: "vyber" }); return; }
    if (e.key === "Enter" && rozpracovany) { dokonciVodic(rozpracovany); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); smazVybrane(); return; }
    if (e.key.toLowerCase() === "r" && !ctrl) { otoc(); return; }
    if (e.key.toLowerCase() === "w" && !ctrl) { setRezim({ k: "vodic", styl: "faze" }); return; }
    if (e.key.toLowerCase() === "f" && !ctrl) { celyList(); return; }
    const sipky = { ArrowLeft: [-MRIZKA, 0], ArrowRight: [MRIZKA, 0], ArrowUp: [0, -MRIZKA], ArrowDown: [0, MRIZKA] };
    if (sipky[e.key] && vyber) { e.preventDefault(); posunVybrane(...sipky[e.key]); }
  };
  const pustKlavesu = (e) => { if (e.key === " ") mezera.current = false; };

  const zmenPrvek = (id, zm) => zmen(p => ({ ...p, prvky: p.prvky.map(x => x.id === id ? { ...x, v: { ...x.v, ...zm } } : x) }));
  const zmenVodic = (id, zm) => zmen(p => ({ ...p, vodice: p.vodice.map(x => x.id === id ? { ...x, ...zm } : x) }));
  const zmenKabel = (id, zm) => zmen(p => ({ ...p, vodice: p.vodice.map(x => x.id === id ? { ...x, kabel: { ...x.kabel, ...zm } } : x) }));
  const zmenRamecek = (id, zm) => zmen(p => ({ ...p, ramecky: p.ramecky.map(x => x.id === id ? { ...x, ...zm } : x) }));
  const zmenText = (id, zm) => zmen(p => ({ ...p, texty: p.texty.map(x => x.id === id ? { ...x, ...zm } : x) }));
  const zmenRazitko = (zm) => zmen(p => ({ ...p, razitko: { ...p.razitko, ...zm } }));
  const zmenNapajeni = (zm) => zmen(p => ({ ...p, napajeni: { ...p.napajeni, ...zm } }));
  const zmenZpravu = (zm) => zmen(p => ({ ...p, zprava: { ...p.zprava, ...zm } }));

  // ── projekty ──
  const otevri = (id) => { if (!vse[id]) return; historie.current = { zpet: [], vpred: [] }; setProjektRaw(vse[id]); setVyber(null); };
  const novy = (sablonaId) => {
    const s = SABLONY.find(x => x.id === sablonaId) || SABLONY[0];
    historie.current = { zpet: [], vpred: [] };
    setProjektRaw({ ...s.vytvor(uzivatel), id: novyId() }); setVyber(null); setNovySablona(null);
  };
  const smazProjekt = () => {
    setVse(prev => { const v = { ...prev }; delete v[projekt.id]; ulozVse(v); return v; });
    const zbyle = Object.values(vse).filter(p => p.id !== projekt.id);
    historie.current = { zpet: [], vpred: [] };
    setProjektRaw(zbyle[0] || vychoziProjekt(uzivatel)); setVyber(null);
    setZprava({ text: "Schéma smazáno ze zařízení." });
  };
  const exportJson = () => stahni(new Blob([JSON.stringify(projekt, null, 1)], { type: "application/json" }), nazevSouboru(projekt, "elcad.json"));
  const importJson = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    f.text().then(t => {
      const p = JSON.parse(t);
      if (!Array.isArray(p.prvky)) throw new Error("Soubor není schéma z Elektro CAD");
      historie.current = { zpet: [], vpred: [] };
      setProjektRaw({ ...vychoziProjekt(uzivatel), ...p, id: vse[p.id] ? novyId() : p.id || novyId() });
      setZprava({ text: `Načteno: ${p.nazev || f.name}` });
    }).catch(err => setZprava({ text: "Import selhal: " + err.message, chyba: true }));
    e.target.value = "";
  };

  const zakazky = contracts.filter(c => zakazkaVeVyberu(c, projekt.contractId));
  const vyberZakazku = (id) => {
    const c = contracts.find(x => String(x.id) === String(id));
    if (!c) return zmen(p => ({ ...p, contractId: null }));
    const cust = customers.find(x => String(x.id) === String(c.customer_id));
    zmen(p => ({ ...p, contractId: String(c.id), razitko: { ...p.razitko, investor: cust?.name || p.razitko.investor, adresa: c.address || cust?.address || p.razitko.adresa, cisloZak: c.code || p.razitko.cisloZak } }));
  };

  const spust = async (fn, ok) => {
    setPracuje(true); setZprava(null);
    try { await fn(); if (ok) setZprava({ text: ok }); } catch (err) { console.error(err); setZprava({ text: "Chyba: " + (err.message || err), chyba: true }); }
    setPracuje(false);
  };
  const pdfDoZakazky = () => spust(async () => {
    const c = contracts.find(x => String(x.id) === String(projekt.contractId));
    if (!c) throw new Error("Nejdřív vyberte zakázku.");
    const blob = await exportPdf(projekt, firma, { sVypocty: true, vratit: true });
    const file = new File([blob], nazevSouboru(projekt, "pdf"), { type: "application/pdf" });
    await nahratFotkuZakazky(file, { slozka: c.name || String(c.id), contractId: c.id, kategorie: "Dokumenty", nahral: uzivatel || null, popis: projekt.razitko?.nazevVykresu || "Elektro schéma", pripraveno: true });
  }, "PDF uloženo do Dokumentů zakázky.");

  const chybVyvodu = vyvody.filter(v => !v.ok).length;
  const vb = `${pohled.x} ${pohled.y} ${pohled.w} ${pohled.w * pomer}`;
  const nahledVodice = rozpracovany && rezim.k === "vodic" && kurzor ? [...rozpracovany, ...cesta(rozpracovany[rozpracovany.length - 1], prichyt(kurzor).b)] : null;
  const ghost = rezim.k === "vlozit" && kurzor ? kresliPrvek({ id: "g", typ: rezim.typ, x: snap(kurzor[0]), y: snap(kurzor[1]), rot: 0, v: { ...ZNACKY[rezim.typ].vychozi } }).prim : null;

  // ── vykreslení ──
  return (
    <div ref={obalRef} tabIndex={0} onKeyDown={klavesa} onKeyUp={pustKlavesu} style={{ outline: "none", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ ...ui.nadpis, fontSize: 20 }}>Elektro CAD</h1>
        <select style={{ ...S.pole, width: 260 }} value={projekt.id} onChange={e => otevri(e.target.value)}>
          {!vse[projekt.id] && <option value={projekt.id}>{projekt.nazev}</option>}
          {Object.values(vse).sort((a, b) => String(b.upraveno).localeCompare(String(a.upraveno))).map(p => <option key={p.id} value={p.id}>{p.nazev || "(bez názvu)"}</option>)}
        </select>
        <button style={S.obrys} onClick={() => setNovySablona("fveTuv")}><i className="ti ti-file-plus" /> Nové</button>
        <label style={S.obrys}><i className="ti ti-upload" /> Otevřít soubor<input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={importJson} /></label>
        <button style={S.obrys} onClick={exportJson} title="Uložit schéma jako soubor .elcad.json"><i className="ti ti-device-floppy" /> Uložit soubor</button>
        <div style={{ flex: 1 }} />
        <button style={S.btn()} disabled={pracuje} onClick={() => spust(() => exportPdf(projekt, firma, { sVypocty: true }))}><i className="ti ti-file-type-pdf" /> PDF</button>
        <button style={S.btn()} disabled={pracuje} onClick={() => spust(() => exportDxf(projekt, firma))} title="DXF otevře AutoCAD; v AutoCADu uložte jako DWG"><i className="ti ti-vector" /> DXF / AutoCAD</button>
        <button style={S.btn()} disabled={pracuje} onClick={() => spust(() => exportWord(projekt, firma))}><i className="ti ti-file-type-doc" /> Word – technická zpráva</button>
        {projekt.contractId && <button style={S.obrys} disabled={pracuje} onClick={pdfDoZakazky}><i className="ti ti-folder-up" /> PDF do zakázky</button>}
      </div>

      {novySablona && (
        <div style={{ ...S.karta, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", background: "#F0F6FB" }}>
          <div><span style={S.popisek}>Nové schéma ze šablony</span>
            <select style={{ ...S.pole, width: 320 }} value={novySablona} onChange={e => setNovySablona(e.target.value)}>
              {SABLONY.map(s => <option key={s.id} value={s.id}>{s.nazev}</option>)}
            </select></div>
          <button style={S.btn()} onClick={() => novy(novySablona)}>Vytvořit</button>
          <button style={S.obrys} onClick={() => setNovySablona(null)}>Zrušit</button>
        </div>
      )}
      {zprava && <div style={{ padding: "8px 12px", borderRadius: 6, fontSize: 13, background: zprava.chyba ? "#FEE4E2" : "#E7F5EC", color: zprava.chyba ? B.chyba : B.uspech, display: "flex", justifyContent: "space-between" }}><span>{zprava.text}</span><button onClick={() => setZprava(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "inherit" }}>✕</button></div>}

      <div style={{ display: "flex", borderBottom: `1px solid ${B.okraj}`, gap: 4, flexWrap: "wrap" }}>
        <button style={S.tab(zalozka === "vykres")} onClick={() => setZalozka("vykres")}>Výkres</button>
        <button style={S.tab(zalozka === "vypocty")} onClick={() => setZalozka("vypocty")}>Výpočty {vyvody.length > 0 && <span style={{ ...ui.stitek(chybVyvodu ? B.chyba : B.uspech), marginLeft: 4 }}>{chybVyvodu ? `${chybVyvodu} nevyhovuje` : "vše vyhovuje"}</span>}</button>
        <button style={S.tab(zalozka === "zprava")} onClick={() => setZalozka("zprava")}>Technická zpráva</button>
        <button style={S.tab(zalozka === "projekt")} onClick={() => setZalozka("projekt")}>Projekt a razítko</button>
      </div>

      {zalozka === "vykres" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 180px) minmax(0, 1fr) minmax(240px, 290px)", gap: 10, alignItems: "start" }} className="elcad-mrizka">
          {/* paleta */}
          <div style={{ ...S.karta, padding: 8, maxHeight: "calc(100vh - 230px)", overflowY: "auto" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              <button style={S.nastroj(rezim.k === "vyber")} onClick={() => { setRezim({ k: "vyber" }); setRozpracovany(null); }} title="Výběr a posun (Esc)"><i className="ti ti-pointer" /></button>
              <button style={S.nastroj(rezim.k === "vodic" && rezim.styl === "faze")} onClick={() => setRezim({ k: "vodic", styl: "faze" })} title="Vodič (W)"><i className="ti ti-line" /> Vodič</button>
              <button style={S.nastroj(rezim.k === "vodic" && rezim.styl === "pe")} onClick={() => setRezim({ k: "vodic", styl: "pe" })} title="PE vodič">PE</button>
              <button style={S.nastroj(rezim.k === "vodic" && rezim.styl === "n")} onClick={() => setRezim({ k: "vodic", styl: "n" })} title="N vodič">N</button>
              <button style={S.nastroj(rezim.k === "vodic" && rezim.styl === "pripojnice")} onClick={() => setRezim({ k: "vodic", styl: "pripojnice" })} title="Přípojnice">▬</button>
              <button style={S.nastroj(rezim.k === "ramecek")} onClick={() => setRezim({ k: "ramecek" })} title="Rozvaděč – čárkovaný rámeček"><i className="ti ti-border-outer" /></button>
              <button style={S.nastroj(rezim.k === "text")} onClick={() => setRezim({ k: "text" })} title="Text"><i className="ti ti-typography" /></button>
            </div>
            {SKUPINY.map(sk => (
              <div key={sk}>
                <div style={{ ...S.popisek, marginTop: 6 }}>{sk}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {Object.entries(ZNACKY).filter(([, z]) => z.skupina === sk).map(([typ, z]) => <IkonaZnacky key={typ} typ={typ} z={z} aktivni={rezim.k === "vlozit" && rezim.typ === typ} onClick={() => { setRezim({ k: "vlozit", typ }); setRozpracovany(null); }} />)}
                </div>
              </div>
            ))}
          </div>

          {/* plátno */}
          <div style={{ ...S.karta, padding: 0, overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", left: 8, top: 8, display: "flex", gap: 4, zIndex: 2 }}>
              <button style={S.nastroj(false)} onClick={zpet} title="Zpět (Ctrl+Z)"><i className="ti ti-arrow-back-up" /></button>
              <button style={S.nastroj(false)} onClick={vpred} title="Znovu (Ctrl+Y)"><i className="ti ti-arrow-forward-up" /></button>
              <button style={S.nastroj(false)} onClick={celyList} title="Celý list (F)"><i className="ti ti-maximize" /></button>
              <button style={S.nastroj(false)} onClick={() => setPohled(p => ({ ...p, w: p.w / 1.3, x: p.x + p.w * 0.115, y: p.y + p.w * 0.08 }))}><i className="ti ti-zoom-in" /></button>
              <button style={S.nastroj(false)} onClick={() => setPohled(p => ({ ...p, w: p.w * 1.3, x: p.x - p.w * 0.15, y: p.y - p.w * 0.1 }))}><i className="ti ti-zoom-out" /></button>
            </div>
            <div style={{ position: "absolute", right: 8, bottom: 6, fontSize: 11, color: B.textSlaby, zIndex: 2, background: "#fffc", padding: "2px 6px", borderRadius: 4 }}>
              {kurzor ? `x ${cislo(snap(kurzor[0]), 1)} · y ${cislo(snap(kurzor[1]), 1)} mm` : ""} · {rezim.k === "vodic" ? "klik = bod, klik na pin = konec, Alt = nejdřív svisle, Enter/Esc = hotovo" : rezim.k === "vlozit" ? "klik = vložit (Shift = vložit víc)" : "táhnout = posun, R = otočit, Del = smazat, kolečko = zoom"}
            </div>
            <svg ref={svgRef} viewBox={vb} style={{ width: "100%", height: "calc(100vh - 230px)", minHeight: 420, display: "block", background: "#E9ECEF", touchAction: "none", cursor: rezim.k === "vyber" ? "default" : "crosshair" }}
              onPointerDown={dolu} onPointerMove={pohyb} onPointerUp={nahoru} onPointerLeave={() => setKurzor(null)} onWheel={kolecko}
              onDoubleClick={() => { if (rozpracovany && rezim.k === "vodic") dokonciVodic(rozpracovany); }}
              onContextMenu={e => { e.preventDefault(); if (rozpracovany && rezim.k === "vodic") dokonciVodic(rozpracovany); else setRezim({ k: "vyber" }); }}>
              <defs>
                <pattern id="elcad-mrizka" width={MRIZKA * 2} height={MRIZKA * 2} patternUnits="userSpaceOnUse"><circle cx={0} cy={0} r={0.12} fill="#c5ccd4" /></pattern>
              </defs>
              <rect x={0} y={0} width={F.w} height={F.h} fill="#fff" stroke="#b9c0c8" strokeWidth={0.3} />
              <rect x={0} y={0} width={F.w} height={F.h} fill="url(#elcad-mrizka)" />
              <g dangerouslySetInnerHTML={{ __html: svgStatic }} />
              {/* výběr */}
              {vybranyPrvek && (() => { const o = obalPrvku(vybranyPrvek).vse; return <rect x={o[0] - 1} y={o[1] - 1} width={o[2] - o[0] + 2} height={o[3] - o[1] + 2} fill="#0E3B5E10" stroke="#2563eb" strokeWidth={0.3} strokeDasharray="1 0.6" />; })()}
              {vybranyVodic && <g>
                <polyline points={vybranyVodic.b.map(b => b.join(",")).join(" ")} fill="none" stroke="#2563eb" strokeWidth={1.1} strokeOpacity={0.35} />
                {vybranyVodic.b.map((b, i) => <rect key={i} x={b[0] - 0.8} y={b[1] - 0.8} width={1.6} height={1.6} fill="#fff" stroke="#2563eb" strokeWidth={0.25} />)}
              </g>}
              {vybranyRamecek && <rect x={vybranyRamecek.x} y={vybranyRamecek.y} width={vybranyRamecek.w} height={vybranyRamecek.h} fill="#2563eb0a" stroke="#2563eb" strokeWidth={0.6} strokeOpacity={0.5} />}
              {vybranyText && (() => { const r = rozmerTextu({ ...vybranyText, h: +vybranyText.h || 2.5, a: vybranyText.a || "l" }); return <rect x={r[0] - 0.6} y={r[1] - 0.6} width={r[2] - r[0] + 1.2} height={r[3] - r[1] + 1.2} fill="none" stroke="#2563eb" strokeWidth={0.3} strokeDasharray="1 0.6" />; })()}
              {/* piny při kreslení vodiče */}
              {rezim.k === "vodic" && vsechnyPiny.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={0.6} fill="#2563eb" fillOpacity={0.6} />)}
              {nahledVodice && <polyline points={nahledVodice.map(b => b.join(",")).join(" ")} fill="none" stroke="#2563eb" strokeWidth={0.35} strokeDasharray={rezim.styl === "pe" ? "3 1 0.6 1" : undefined} />}
              {rezim.k === "vodic" && kurzor && (() => { const { b, pin } = prichyt(kurzor); return <circle cx={b[0]} cy={b[1]} r={pin ? 1.2 : 0.6} fill="none" stroke={pin ? "#16a34a" : "#2563eb"} strokeWidth={0.3} />; })()}
              {rozpracovany && rezim.k === "ramecek" && <rect x={Math.min(rozpracovany[0][0], rozpracovany[1][0])} y={Math.min(rozpracovany[0][1], rozpracovany[1][1])} width={Math.abs(rozpracovany[0][0] - rozpracovany[1][0])} height={Math.abs(rozpracovany[0][1] - rozpracovany[1][1])} fill="none" stroke="#2563eb" strokeWidth={0.35} strokeDasharray="3 1.5" />}
              {ghost && <g opacity={0.5} dangerouslySetInnerHTML={{ __html: svgObsah(ghost, { barva: "#2563eb" }) }} />}
            </svg>
          </div>

          {/* panel */}
          <div style={{ ...S.karta, maxHeight: "calc(100vh - 230px)", overflowY: "auto" }}>
            <div style={{ display: "flex", gap: 2, marginBottom: 10, borderBottom: `1px solid ${B.okraj}` }}>
              <button style={S.tab(panel === "vlastnosti")} onClick={() => setPanel("vlastnosti")}>Vlastnosti</button>
              <button style={S.tab(panel === "napajeni")} onClick={() => setPanel("napajeni")}>Napájení</button>
            </div>
            {panel === "napajeni" && <PanelNapajeni nap={projekt.napajeni} zmen={zmenNapajeni} format={projekt.format} setFormat={(f) => zmen(p => ({ ...p, format: f }))} />}
            {panel === "vlastnosti" && (
              <>
                {!vyber && <div style={{ fontSize: 12, color: B.textMekky, lineHeight: 1.6 }}>
                  Vyberte značku vlevo a klepněte do výkresu. Vodiče kreslete nástrojem <b>Vodič</b> (W): klepnutí přidá bod, klepnutí na pin přístroje vodič ukončí.<br /><br />
                  Kabel s délkou a zátěží zadaný u vodiče se počítá v záložce <b>Výpočty</b>.<br /><br />
                  <b>Klávesy:</b> R otočit · Del smazat · Ctrl+D kopie · šipky posun · Ctrl+Z zpět · F celý list · mezerník + tah = posun pohledu
                </div>}
                {vybranyPrvek && <PanelPrvku p={vybranyPrvek} zmenV={(zm) => zmenPrvek(vybranyPrvek.id, zm)} otoc={otoc} duplikuj={duplikuj} smaz={smazVybrane} vyvody={vyvody} />}
                {vybranyVodic && <PanelVodice w={vybranyVodic} projekt={projekt} zmen={(zm) => zmenVodic(vybranyVodic.id, zm)} zmenKabel={(zm) => zmenKabel(vybranyVodic.id, zm)} smaz={smazVybrane} vysledek={vyvody.find(v => v.id === vybranyVodic.id)} />}
                {vybranyRamecek && <PanelRamecku r={vybranyRamecek} zmen={(zm) => zmenRamecek(vybranyRamecek.id, zm)} smaz={smazVybrane} duplikuj={duplikuj} />}
                {vybranyText && <PanelTextu t={vybranyText} zmen={(zm) => zmenText(vybranyText.id, zm)} smaz={smazVybrane} otoc={otoc} duplikuj={duplikuj} />}
              </>
            )}
          </div>
        </div>
      )}

      {zalozka === "vypocty" && <Vypocty projekt={projekt} vyvody={vyvody} bil={bil} zmenKabel={zmenKabel} zmenNapajeni={zmenNapajeni} zmen={zmen} ukaz={(id) => { setVyber({ druh: "vodic", id }); setPanel("vlastnosti"); setZalozka("vykres"); }} />}

      {zalozka === "zprava" && (
        <div style={{ ...S.karta, padding: 16, display: "grid", gap: 12, maxWidth: 900 }}>
          <div style={{ fontSize: 12, color: B.textMekky }}>Texty technické zprávy pro výstup do Wordu. Prázdná pole dostanou výchozí text; seznam přístrojů, kabelů, výpočty, bilance a výkres jako příloha se doplní ze schématu.</div>
          {[["predmet", "Předmět dokumentace", 4], ["popis", "Technické řešení (popis zapojení, trasy, umístění)", 6], ["ochrana", "Ochrana před úrazem elektrickým proudem", 3], ["vlivy", "Vnější vlivy", 2], ["zaver", "Závěr", 3]].map(([k, n, r]) => (
            <div key={k}><span style={S.popisek}>{n}</span><textarea rows={r} style={{ ...S.pole, fontSize: 13, resize: "vertical" }} value={projekt.zprava?.[k] || ""} onChange={e => zmenZpravu({ [k]: e.target.value })} /></div>
          ))}
          <div><button style={S.btn()} disabled={pracuje} onClick={() => spust(() => exportWord(projekt, firma))}><i className="ti ti-file-type-doc" /> Stáhnout technickou zprávu (Word)</button></div>
        </div>
      )}

      {zalozka === "projekt" && (
        <div style={{ ...S.karta, padding: 16, display: "grid", gap: 12, maxWidth: 900 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            <Pole n="Název schématu (v seznamu)"><input style={S.pole} value={projekt.nazev} onChange={e => zmen(p => ({ ...p, nazev: e.target.value }))} /></Pole>
            <Pole n="Zakázka">
              <select style={S.pole} value={projekt.contractId || ""} onChange={e => vyberZakazku(e.target.value)}>
                <option value="">— bez zakázky —</option>
                {zakazky.map(c => <option key={c.id} value={c.id}>{[c.code, c.name].filter(Boolean).join(" · ")}</option>)}
              </select>
            </Pole>
            <Pole n="Formát listu"><select style={S.pole} value={projekt.format} onChange={e => zmen(p => ({ ...p, format: e.target.value }))}>{Object.entries(FORMATY).map(([k, f]) => <option key={k} value={k}>{f.nazev}</option>)}</select></Pole>
          </div>
          <div style={{ ...S.popisek, marginTop: 6 }}>Razítko</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {[["investor", "Investor"], ["adresa", "Adresa / místo stavby"], ["cisloZak", "Číslo zakázky"], ["stupen", "Stupeň dokumentace"], ["datum", "Datum"], ["meritko", "Měřítko"],
              ["projektant", "Projektant"], ["vypracoval", "Vypracoval"], ["kontroloval", "Kontroloval"], ["zkratka", "Zkratka v rohu (např. R.J.)"],
              ["druhVykresu", "Druh výkresu"], ["podnazev", "Podnázev"], ["nazevVykresu", "Název výkresu"], ["kod", "Kód / označení"], ["priloha", "Č. přílohy"], ["cast", "Část"], ["kopie", "Č. kopie"], ["formatu", "Formátů (prázdné = auto)"]].map(([k, n]) => (
              <Pole key={k} n={n}><input style={S.pole} value={projekt.razitko?.[k] || ""} onChange={e => zmenRazitko({ [k]: e.target.value })} /></Pole>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <SmazatProjekt onSmaz={smazProjekt} />
          </div>
        </div>
      )}
      <datalist id="elcad-kabely">{["CYKY-J", "CYKY-O", "CYKFY-J", "AYKY-J", "1-CXKH-R-J", "H1Z2Z2-K", "CY", "CYA", "H07V-K", "CYSY", "JYTY"].map(t => <option key={t} value={t} />)}</datalist>
      <style>{`@media (max-width: 1000px){ .elcad-mrizka{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function Pole({ n, children }) { return <label style={{ display: "block" }}><span style={S.popisek}>{n}</span>{children}</label>; }

function SmazatProjekt({ onSmaz }) {
  const [jiste, setJiste] = useState(false);
  if (!jiste) return <button style={{ ...S.obrys, color: B.chyba }} onClick={() => setJiste(true)}><i className="ti ti-trash" /> Smazat schéma</button>;
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>Opravdu smazat ze zařízení? <button style={S.btn(B.chyba)} onClick={() => { setJiste(false); onSmaz(); }}>Smazat</button><button style={S.obrys} onClick={() => setJiste(false)}>Ne</button></span>;
}

function IkonaZnacky({ typ, z, aktivni, onClick }) {
  const svg = useMemo(() => {
    const { prim, bbox } = kresliPrvek({ id: "i", typ, x: 0, y: 0, rot: 0, v: { ...z.vychozi, skrytPopis: true } });
    const w = bbox[2] - bbox[0] + 4, h = bbox[3] - bbox[1] + 4, m = Math.max(w, h);
    const cx = (bbox[0] + bbox[2]) / 2, cy = (bbox[1] + bbox[3]) / 2;
    return { obsah: svgObsah(prim.map(p => ({ ...p, w: Math.max(p.w || 0.25, m / 45) }))), vb: `${cx - m / 2} ${cy - m / 2} ${m} ${m}` };
  }, [typ, z]);
  return (
    <button onClick={onClick} title={z.nazev} style={{ border: `1px solid ${aktivni ? B.primarni : B.okraj}`, background: aktivni ? "#E6EEF5" : "#fff", borderRadius: 6, padding: 3, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, fontFamily: "inherit" }}>
      <svg viewBox={svg.vb} width={34} height={34} dangerouslySetInnerHTML={{ __html: svg.obsah }} />
      <span style={{ fontSize: 9, color: B.textMekky, lineHeight: 1.1, textAlign: "center" }}>{z.nazev}</span>
    </button>
  );
}

function Akce({ otoc, duplikuj, smaz }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "10px 0 2px" }}>
      {otoc && <button style={S.obrys} onClick={otoc}><i className="ti ti-rotate-clockwise" /> Otočit</button>}
      {duplikuj && <button style={S.obrys} onClick={duplikuj}><i className="ti ti-copy" /> Kopie</button>}
      <button style={{ ...S.obrys, color: B.chyba }} onClick={smaz}><i className="ti ti-trash" /> Smazat</button>
    </div>
  );
}

function PanelPrvku({ p, zmenV, otoc, duplikuj, smaz, vyvody }) {
  const z = ZNACKY[p.typ], v = { ...z.vychozi, ...(p.v || {}) };
  const klice = Object.keys(z.vychozi).filter(k => k !== "popis");
  const chraneno = vyvody.filter(x => x.pristroj?.id === p.id);
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: B.primarniTmava }}>{z.nazev}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {klice.map(k => (
          <Pole key={k} n={POPISKY_V[k] || k}>
            {VOLBY_V[k]
              ? <select style={S.pole} value={v[k] ?? ""} onChange={e => zmenV({ [k]: CISELNE.has(k) ? +e.target.value : e.target.value })}>{VOLBY_V[k].map(o => <option key={o} value={o}>{o}</option>)}</select>
              : <input style={S.pole} type={CISELNE.has(k) ? "number" : "text"} step="any" value={v[k] ?? ""} onChange={e => zmenV({ [k]: CISELNE.has(k) ? (e.target.value === "" ? "" : +e.target.value) : e.target.value })} />}
          </Pole>
        ))}
        {["svitidlo", "topne", "motor", "zasuvka", "spotrebic"].includes(p.typ) && !klice.includes("beta") && (
          <Pole n={POPISKY_V.beta}><input style={S.pole} type="number" step="0.05" value={v.beta ?? ""} placeholder="1" onChange={e => zmenV({ beta: e.target.value === "" ? "" : +e.target.value })} /></Pole>
        )}
      </div>
      <div style={{ marginTop: 8 }}><Pole n={POPISKY_V.popis}><textarea rows={3} style={{ ...S.pole, resize: "vertical" }} value={v.popis || ""} onChange={e => zmenV({ popis: e.target.value })} /></Pole></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
        <label><input type="checkbox" checked={!!v.popisVlevo} onChange={e => zmenV({ popisVlevo: e.target.checked })} /> popisek vlevo</label>
        <label><input type="checkbox" checked={!!v.skrytPopis} onChange={e => zmenV({ skrytPopis: e.target.checked })} /> skrýt popisek</label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
        <Pole n="Posun popisku x [mm]"><input style={S.pole} type="number" step={MRIZKA} value={v.lx ?? 0} onChange={e => zmenV({ lx: +e.target.value })} /></Pole>
        <Pole n="Posun popisku y [mm]"><input style={S.pole} type="number" step={MRIZKA} value={v.ly ?? 0} onChange={e => zmenV({ ly: +e.target.value })} /></Pole>
      </div>
      {chraneno.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: B.textMekky }}>Jistí vývody: {chraneno.map(x => x.nazev).join(", ")}</div>}
      <Akce otoc={otoc} duplikuj={duplikuj} smaz={smaz} />
    </div>
  );
}

const VYCHOZI_KABEL = { typ: "CYKY-J", zil: 3, prurez: 2.5, material: "Cu", delka: 10, ulozeni: "C", teplota: 30, soubeh: 1, soustava: "1f", P: 2, cos: 1 };

function PoleKabelu({ k, zmenKabel, projekt, vlastniId, kompakt = false }) {
  const pristroje = projekt.prvky.filter(p => JISTICI.includes(p.typ));
  const vyvody = projekt.vodice.filter(w => w.kabel && w.id !== vlastniId);
  const num = (f) => (e) => zmenKabel({ [f]: e.target.value === "" ? "" : +e.target.value });
  const pole = [
    ["nazev", "Název vývodu", <input style={S.pole} value={k.nazev || ""} onChange={e => zmenKabel({ nazev: e.target.value })} />],
    ["typ", "Typ kabelu", <input style={S.pole} list="elcad-kabely" value={k.typ || ""} onChange={e => zmenKabel({ typ: e.target.value })} />],
    ["zil", "Žil", <input style={S.pole} type="number" value={k.zil ?? ""} onChange={num("zil")} />],
    ["prurez", "Průřez [mm²]", <select style={S.pole} value={k.prurez} onChange={num("prurez")}>{PRUREZY.map(s => <option key={s} value={s}>{String(s).replace(".", ",")}</option>)}</select>],
    ["prurezPe", "Průřez PE", <select style={S.pole} value={k.prurezPe || ""} onChange={num("prurezPe")}><option value="">= fáze</option>{PRUREZY.map(s => <option key={s} value={s}>{String(s).replace(".", ",")}</option>)}</select>],
    ["material", "Materiál", <select style={S.pole} value={k.material || "Cu"} onChange={e => zmenKabel({ material: e.target.value })}><option>Cu</option><option>Al</option></select>],
    ["delka", "Délka [m]", <input style={S.pole} type="number" step="any" value={k.delka ?? ""} onChange={num("delka")} />],
    ["ulozeni", "Uložení", <select style={S.pole} value={k.ulozeni || "C"} onChange={e => zmenKabel({ ulozeni: e.target.value })}>{Object.entries(ULOZENI).map(([u, n]) => <option key={u} value={u} title={n}>{kompakt ? u : n}</option>)}</select>],
    ["teplota", "Teplota okolí [°C]", <input style={S.pole} type="number" value={k.teplota ?? ""} onChange={num("teplota")} />],
    ["soubeh", "Souběh obvodů", <input style={S.pole} type="number" min={1} value={k.soubeh ?? 1} onChange={num("soubeh")} />],
    ["soustava", "Soustava", <select style={S.pole} value={k.soustava || "1f"} onChange={e => zmenKabel({ soustava: e.target.value })}><option value="1f">1f 230 V</option><option value="3f">3f 400 V</option><option value="DC">DC</option></select>],
    k.soustava === "DC" ? ["u2", "U DC [V]", <input style={S.pole} type="number" value={k.Udc ?? ""} onChange={num("Udc")} />]
      : ["u2", "cos φ", <input style={S.pole} type="number" step="0.01" value={k.cos ?? ""} onChange={num("cos")} />],
    ["P", "Zátěž P [kW]", <input style={S.pole} type="number" step="any" value={k.P ?? ""} onChange={num("P")} />],
    ["I", "nebo proud Ib [A]", <input style={S.pole} type="number" step="any" value={k.I ?? ""} placeholder="z P" onChange={num("I")} />],
    ["jisticId", "Jištěno přístrojem", <select style={S.pole} value={k.jisticId || ""} onChange={e => zmenKabel({ jisticId: e.target.value || null })}><option value="">—</option>{pristroje.map(p => <option key={p.id} value={p.id}>{p.v?.ozn || ZNACKY[p.typ].nazev} {p.v?.char || ""}{p.v?.In || ""}</option>)}</select>],
    ["predchoziId", "Napájeno z vývodu", <select style={S.pole} value={k.predchoziId || ""} onChange={e => zmenKabel({ predchoziId: e.target.value || null })}><option value="">napájecí bod</option>{vyvody.map(w => <option key={w.id} value={w.id}>{w.kabel.nazev || popisKabelu(w.kabel)}</option>)}</select>],
  ];
  return (
    <>
      {kompakt ? pole.map(([k2, , el]) => <td key={k2} style={{ padding: 2 }}>{el}</td>)
        : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{pole.map(([k2, n, el]) => <div key={k2} style={k2 === "nazev" || k2 === "ulozeni" || k2 === "jisticId" || k2 === "predchoziId" ? { gridColumn: "1 / -1" } : undefined}><Pole n={n}>{el}</Pole></div>)}</div>}
    </>
  );
}

function PanelVodice({ w, projekt, zmen, zmenKabel, smaz, vysledek }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: B.primarniTmava }}>Vodič</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Pole n="Druh čáry"><select style={S.pole} value={w.styl || "faze"} onChange={e => zmen({ styl: e.target.value })}>{Object.entries(STYLY_VODICE).map(([k, s]) => <option key={k} value={k}>{s.nazev}</option>)}</select></Pole>
        <Pole n="Popis u čáry"><input style={S.pole} value={w.popis || ""} placeholder={w.kabel ? popisKabelu(w.kabel) : ""} onChange={e => zmen({ popis: e.target.value })} /></Pole>
        <Pole n="Posun popisu x"><input style={S.pole} type="number" step={MRIZKA} value={w.lx ?? 0} onChange={e => zmen({ lx: +e.target.value })} /></Pole>
        <Pole n="Posun popisu y"><input style={S.pole} type="number" step={MRIZKA} value={w.ly ?? 0} onChange={e => zmen({ ly: +e.target.value })} /></Pole>
      </div>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, margin: "12px 0 8px", fontWeight: 600 }}>
        <input type="checkbox" checked={!!w.kabel} onChange={e => zmen({ kabel: e.target.checked ? { ...VYCHOZI_KABEL } : undefined })} /> Kabel / vývod do výpočtů
      </label>
      {w.kabel && <>
        <PoleKabelu k={w.kabel} zmenKabel={zmenKabel} projekt={projekt} vlastniId={w.id} />
        <label style={{ display: "block", fontSize: 12, marginTop: 6 }}><input type="checkbox" checked={w.kabel.zobrazit !== false} onChange={e => zmenKabel({ zobrazit: e.target.checked })} /> zobrazit typ kabelu u čáry</label>
        {vysledek && <VysledekKarta v={vysledek} />}
      </>}
      <Akce smaz={smaz} />
    </div>
  );
}

function VysledekKarta({ v }) {
  const r = (n, h, ok) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}><span style={{ color: B.textMekky }}>{n}</span><b style={{ color: ok == null ? B.text : ok ? B.uspech : B.chyba }}>{h}</b></div>;
  return (
    <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: v.ok ? "#E7F5EC" : "#FEE4E2" }}>
      {r("Ib / In / Iz", `${cislo(v.Ib, 1)} / ${v.In ? cislo(v.In, 0) : "–"} / ${cislo(v.Iz, 1)} A`, v.koordinace)}
      {r("Úbytek (úsek / celkem)", `${cislo(v.dUp, 2)} / ${cislo(v.dUcelk, 2)} %`, v.uOk)}
      {v.Zs != null && r("Zs / Ik1 / Ia", `${cislo(v.Zs, 3)} Ω / ${cislo(v.Ik1, 0)} / ${cislo(v.Ia, 0)} A`, v.odpojeni)}
    </div>
  );
}

function PanelRamecku({ r, zmen, smaz, duplikuj }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: B.primarniTmava }}>Rozvaděč / rámeček</div>
      <Pole n="Název"><input style={S.pole} value={r.nazev || ""} onChange={e => zmen({ nazev: e.target.value })} /></Pole>
      <div style={{ marginTop: 8 }}><Pole n="Popis vpravo (řádky)"><textarea rows={5} style={{ ...S.pole, resize: "vertical" }} value={r.popis || ""} onChange={e => zmen({ popis: e.target.value })} /></Pole></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        {["x", "y", "w", "h"].map(k => <Pole key={k} n={{ x: "X [mm]", y: "Y [mm]", w: "Šířka", h: "Výška" }[k]}><input style={S.pole} type="number" step={MRIZKA} value={r[k]} onChange={e => zmen({ [k]: +e.target.value })} /></Pole>)}
        <Pole n="Čára"><select style={S.pole} value={r.styl || "carka"} onChange={e => zmen({ styl: e.target.value })}><option value="carka">čárkovaná</option><option value="plna">plná</option></select></Pole>
        <Pole n="Název"><select style={S.pole} value={r.nazevA || "c"} onChange={e => zmen({ nazevA: e.target.value })}><option value="l">vlevo</option><option value="c">na střed</option><option value="r">vpravo</option></select></Pole>
      </div>
      <Akce duplikuj={duplikuj} smaz={smaz} />
    </div>
  );
}

function PanelTextu({ t, zmen, smaz, otoc, duplikuj }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: B.primarniTmava }}>Text</div>
      <Pole n="Text"><input style={S.pole} value={t.t} autoFocus onChange={e => zmen({ t: e.target.value })} /></Pole>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <Pole n="Výška písma [mm]"><select style={S.pole} value={t.h} onChange={e => zmen({ h: +e.target.value })}>{[1.8, 2, 2.5, 3.2, 3.5, 4.5, 5, 7].map(h => <option key={h} value={h}>{String(h).replace(".", ",")}</option>)}</select></Pole>
        <Pole n="Zarovnání"><select style={S.pole} value={t.a || "l"} onChange={e => zmen({ a: e.target.value })}><option value="l">vlevo</option><option value="c">na střed</option><option value="r">vpravo</option></select></Pole>
      </div>
      <Akce otoc={otoc} duplikuj={duplikuj} smaz={smaz} />
    </div>
  );
}

function PanelNapajeni({ nap, zmen, format, setFormat }) {
  const n = (k) => (e) => zmen({ [k]: e.target.value === "" ? "" : +e.target.value });
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Pole n="Formát listu"><select style={S.pole} value={format} onChange={e => setFormat(e.target.value)}>{Object.entries(FORMATY).map(([k, f]) => <option key={k} value={k}>{f.nazev}</option>)}</select></Pole>
      <Pole n="Napěťová soustava (text)"><input style={S.pole} value={nap.popis || ""} onChange={e => zmen({ popis: e.target.value })} /></Pole>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Pole n="U0 [V]"><input style={S.pole} type="number" value={nap.U0 ?? ""} onChange={n("U0")} /></Pole>
        <Pole n="Us [V]"><input style={S.pole} type="number" value={nap.Us ?? ""} onChange={n("Us")} /></Pole>
        <Pole n="Zs napájecího bodu [Ω]"><input style={S.pole} type="number" step="0.01" value={nap.Zs ?? ""} onChange={n("Zs")} /></Pole>
        <Pole n="Max. úbytek AC [%]"><input style={S.pole} type="number" step="0.5" value={nap.maxDu ?? ""} onChange={n("maxDu")} /></Pole>
        <Pole n="Max. úbytek DC [%]"><input style={S.pole} type="number" step="0.5" value={nap.maxDuDc ?? ""} placeholder="1" onChange={n("maxDuDc")} /></Pole>
        <Pole n="Soudobost objektu β"><input style={S.pole} type="number" step="0.05" value={nap.soudobost ?? ""} onChange={n("soudobost")} /></Pole>
        <Pole n="cos φ objektu"><input style={S.pole} type="number" step="0.01" value={nap.cos ?? ""} onChange={n("cos")} /></Pole>
      </div>
      <div style={{ fontSize: 11, color: B.textSlaby, lineHeight: 1.5 }}>Zs v napájecím bodě zjistíte měřením nebo od distributora (běžně 0,2–0,6 Ω u RD). Úbytek se kontroluje od napájecího bodu přes řetěz „napájeno z vývodu“.</div>
    </div>
  );
}

function Vypocty({ projekt, vyvody, bil, zmenKabel, zmenNapajeni, zmen, ukaz }) {
  const th = { ...ui.th, padding: "6px 6px", fontSize: 10, whiteSpace: "nowrap" };
  const td = { ...ui.td, padding: "5px 6px", fontSize: 12 };
  const stav = (ok) => ok == null ? <span style={{ color: B.textSlaby }}>–</span> : <b style={{ color: ok ? B.uspech : B.chyba }}>{ok ? "✓" : "✗"}</b>;
  const vodice = projekt.vodice.filter(w => w.kabel);
  const rucne = projekt.bilanceRucne || [];
  const zmenRucne = (i, zm) => zmen(p => ({ ...p, bilanceRucne: (p.bilanceRucne || []).map((r, j) => j === i ? { ...r, ...zm } : r) }));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...S.karta, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: B.primarniTmava }}>Výsledky vývodů</div>
        {!vyvody.length && <div style={{ fontSize: 13, color: B.textMekky }}>Ve schématu zatím není žádný vodič s kabelem. Vyberte vodič a zaškrtněte „Kabel / vývod do výpočtů“.</div>}
        {vyvody.length > 0 && <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr>{["Vývod", "Kabel", "L [m]", "Ib [A]", "Jištění", "Iz [A]", "Ib≤In≤Iz", "ΔU úsek", "ΔU celk.", "", "Zs [Ω]", "Ik1 [A]", "Ia [A]", "Odpojení", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody>{vyvody.map(v => (
            <tr key={v.id} style={{ background: v.ok ? undefined : "#FEF3F2" }}>
              <td style={{ ...td, fontWeight: 600, color: B.text }}>{v.nazev}</td>
              <td style={td}>{popisKabelu(v.kabel)} <span style={{ color: B.textSlaby }}>{v.kabel.ulozeni}</span></td>
              <td style={td}>{cislo(v.L, 1)}</td>
              <td style={td}>{cislo(v.Ib, 1)}</td>
              <td style={td}>{v.pristroj ? `${v.pristroj.v?.ozn || ""} ${v.pristroj.v?.char || ""}${v.In}` : "–"}</td>
              <td style={td} title={v.iz ? `Iz0 ${cislo(v.iz.iz0, 1)} A × kt ${cislo(v.iz.kt, 2)} × ks ${cislo(v.iz.ks, 2)}` : ""}>{cislo(v.Iz, 1)}</td>
              <td style={td}>{stav(v.koordinace)}</td>
              <td style={td}>{cislo(v.dUp, 2)} %</td>
              <td style={td}>{cislo(v.dUcelk, 2)} %</td>
              <td style={td}>{stav(v.uOk)}</td>
              <td style={td}>{v.Zs != null ? cislo(v.Zs, 3) : "–"}</td>
              <td style={td}>{v.Ik1 != null ? cislo(v.Ik1, 0) : "–"}</td>
              <td style={td}>{v.Ia ? cislo(v.Ia, 0) : "–"}</td>
              <td style={td}>{stav(v.odpojeni)}{v.casLimit ? <span style={{ color: B.textSlaby }}> {String(v.casLimit).replace(".", ",")} s</span> : null}</td>
              <td style={td}><button style={{ ...S.obrys, padding: "2px 6px" }} onClick={() => ukaz(v.id)} title="Ukázat ve výkresu"><i className="ti ti-focus-2" /></button></td>
            </tr>
          ))}</tbody>
        </table></div>}
        <div style={{ fontSize: 11, color: B.textSlaby, marginTop: 8, lineHeight: 1.5 }}>
          Iz podle ČSN 33 2000-5-52 (PVC 70 °C, přepočet teplotou a souběhem), koordinace Ib ≤ In ≤ Iz (ČSN 33 2000-4-43), úbytek s ρCu = 0,0225 Ω·mm²/m a x = 0,08 Ω/km, smyčka Zs = Zs,před + R(L+PE), Ik1 = 0,95·U0/Zs, Ia jističe B 5·In / C 10·In / D 20·In, pojistky gG z charakteristiky (0,4 s koncové obvody ≤ 32 A, jinak 5 s). Orientační výpočet; výsledky ověřte měřením při revizi.
        </div>
      </div>

      {vodice.length > 0 && <div style={{ ...S.karta, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: B.primarniTmava }}>Zadání kabelů</div>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", minWidth: 1500 }}>
          <thead><tr>{["Název", "Typ", "Žil", "mm²", "PE", "Mat.", "L [m]", "Uložení", "°C", "Souběh", "Soustava", "cos φ / U DC", "P [kW]", "Ib [A]", "Jištění", "Napájeno z"].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody>{vodice.map(w => <tr key={w.id}><RadekKabelu w={w} projekt={projekt} zmenKabel={(zm) => zmenKabel(w.id, zm)} /></tr>)}</tbody>
        </table></div>
      </div>}

      <div style={{ ...S.karta, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: B.primarniTmava }}>Bilance příkonu</div>
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 760 }}>
          <thead><tr>{["Spotřebič", "Pi [kW]", "β", "Pp [kW]", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {bil.radky.filter(r => !r.rucne).map(r => <tr key={r.id}><td style={td}>{r.nazev}</td><td style={td}>{cislo(r.Pi, 2)}</td><td style={td}>{cislo(r.beta, 2)}</td><td style={td}>{cislo(r.Pi * r.beta, 2)}</td><td style={td}><span style={{ color: B.textSlaby, fontSize: 11 }}>ze schématu</span></td></tr>)}
            {rucne.map((r, i) => (
              <tr key={i}>
                <td style={td}><input style={S.pole} value={r.nazev || ""} onChange={e => zmenRucne(i, { nazev: e.target.value })} /></td>
                <td style={td}><input style={{ ...S.pole, width: 80 }} type="number" step="any" value={r.Pi ?? ""} onChange={e => zmenRucne(i, { Pi: e.target.value })} /></td>
                <td style={td}><input style={{ ...S.pole, width: 70 }} type="number" step="0.05" value={r.beta ?? ""} placeholder="1" onChange={e => zmenRucne(i, { beta: e.target.value })} /></td>
                <td style={td}>{cislo((+r.Pi || 0) * (r.beta === "" || r.beta == null ? 1 : +r.beta), 2)}</td>
                <td style={td}><button style={{ ...S.obrys, padding: "2px 6px", color: B.chyba }} onClick={() => zmen(p => ({ ...p, bilanceRucne: p.bilanceRucne.filter((_, j) => j !== i) }))}><i className="ti ti-x" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button style={{ ...S.obrys, marginTop: 8 }} onClick={() => zmen(p => ({ ...p, bilanceRucne: [...(p.bilanceRucne || []), { nazev: "", Pi: "", beta: "" }] }))}><i className="ti ti-plus" /> Přidat spotřebič ručně</button>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 13, alignItems: "flex-end" }}>
          <div>Pi = <b>{cislo(bil.Pi, 2)} kW</b></div>
          <label>β objektu <input style={{ ...S.pole, width: 70, display: "inline-block" }} type="number" step="0.05" value={projekt.napajeni?.soudobost ?? ""} onChange={e => zmenNapajeni({ soudobost: e.target.value === "" ? "" : +e.target.value })} /></label>
          <div>Pp = <b>{cislo(bil.Pp, 2)} kW</b></div>
          <div>Ip (3f) = <b>{cislo(bil.Ip3, 1)} A</b> → hlavní jistič <b>{bil.jistic3 ? `B${bil.jistic3}/3` : "–"}</b></div>
          <div>Ip (1f) = <b>{cislo(bil.Ip1, 1)} A</b> → <b>{bil.jistic1 ? `B${bil.jistic1}/1` : "–"}</b></div>
        </div>
      </div>
    </div>
  );
}

function RadekKabelu({ w, projekt, zmenKabel }) {
  return <PoleKabelu k={w.kabel} zmenKabel={zmenKabel} projekt={projekt} vlastniId={w.id} kompakt />;
}
