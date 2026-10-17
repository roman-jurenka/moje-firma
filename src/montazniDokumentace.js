// ─── Montážní dokumentace FVE a hromosvodu (PDF) ─────────────────────────────
// Stránky se poskládají jako HTML (výkresy kreslené do canvasu), vyfotí přes
// html2canvas a zabalí do PDF přes jsPDF — stejně jako faktury, kvůli
// spolehlivé češtině s diakritikou.

import { COMPANY } from "./invoicingUtils.js";
import {
  plochyStrechy, panelyPole, rozmerPanelu, rozsahU, steny, drahaVedeni, trasaSvodu, patyTyce,
  pristavky, bodPlochy, jePevny, vyskaHrebene, bodyJimaci, STRANY, TYPY_STRECHY, TYPY_PREKAZEK, TRIDY_LPS, POLOMER_KOULE, soupis, v3, zemnicTrasy, typZemnice,
} from "./navrh3dGeometrie.js";
import * as rz from "./rizikoBlesk.js";

const cislo = (x, d = 2) => Number(x || 0).toLocaleString("cs-CZ", { minimumFractionDigits: d, maximumFractionDigits: d });
const HORNI = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const exp10 = (x) => {
  if (!x) return "0";
  const e = Math.floor(Math.log10(Math.abs(x)));
  return `${(x / 10 ** e).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })}·10${String(e).split("").map(c => HORNI[c]).join("")}`;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const PISMO = "'DM Sans', Arial, sans-serif";

// ── Montážní systém: lišty, háky, svorky pro jedno pole panelů ──
const ROZTEC_HAKU = 1.2, DELKA_LISTY = 4.2, PRESAH_LISTY = 0.1;
export function montazPole(n, pole) {
  const { pw, ph } = rozmerPanelu(n, pole);
  const panely = panelyPole(n, pole);
  const sirka = pole.sloupce * pw + (pole.sloupce - 1) * n.mezeraFve;
  const posl = panely[panely.length - 1];
  const hloubka = posl.v + posl.hloubka - pole.v;
  const listy = [];
  if (pole.orientace !== "sirku") {
    // panely na výšku: dvě vodorovné lišty v každé řadě (¼ a ¾ výšky panelu)
    for (let r = 0; r < pole.radky; r++) {
      const p0 = panely.find(p => p.r === r);
      for (const f of [0.25, 0.75]) listy.push({ a: [pole.u - PRESAH_LISTY, p0.v + p0.hloubka * f], b: [pole.u + sirka + PRESAH_LISTY, p0.v + p0.hloubka * f] });
    }
  } else {
    // panely na šířku: dvě lišty po spádu v každém sloupci
    for (let s = 0; s < pole.sloupce; s++) {
      const u0 = pole.u + s * (pw + n.mezeraFve);
      for (const f of [0.25, 0.75]) listy.push({ a: [u0 + pw * f, pole.v - PRESAH_LISTY], b: [u0 + pw * f, pole.v + hloubka + PRESAH_LISTY] });
    }
  }
  const haky = [];
  let delkaList = 0, kusuList = 0;
  for (const l of listy) {
    const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
    delkaList += len;
    kusuList += Math.ceil(len / DELKA_LISTY);
    const k = Math.ceil((len - 0.4) / ROZTEC_HAKU);
    for (let i = 0; i <= k; i++) {
      const t = (0.2 + ((len - 0.4) * i) / Math.max(k, 1)) / len;
      haky.push([l.a[0] + (l.b[0] - l.a[0]) * t, l.a[1] + (l.b[1] - l.a[1]) * t]);
    }
  }
  const [rady, vRade] = pole.orientace !== "sirku" ? [pole.radky, pole.sloupce] : [pole.sloupce, pole.radky];
  return {
    pw, ph, sirka, hloubka, panely, listy, haky, delkaList, kusuList,
    spojek: kusuList - listy.length,
    stredovych: rady * (vRade - 1) * 2,
    koncovych: rady * 4,
  };
}

// ── kreslení ──
function platno(w, h) {
  const c = document.createElement("canvas");
  c.width = w * 2; c.height = h * 2;
  const g = c.getContext("2d");
  g.scale(2, 2);
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  g.lineJoin = "round"; g.lineCap = "round";
  return { c, g, w, h };
}
function kota(g, a, b, text, odsazeni = 14) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l * odsazeni, ny = dx / l * odsazeni;
  const A = [a[0] + nx, a[1] + ny], B = [b[0] + nx, b[1] + ny];
  g.save();
  g.strokeStyle = "#475569"; g.fillStyle = "#1e293b"; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(A[0] + nx * 0.3, A[1] + ny * 0.3); g.moveTo(b[0], b[1]); g.lineTo(B[0] + nx * 0.3, B[1] + ny * 0.3); g.stroke();
  g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
  for (const [P, s] of [[A, 1], [B, -1]]) { g.beginPath(); g.moveTo(P[0] - 4 * s * dx / l + 3 * dy / l, P[1] - 4 * s * dy / l - 3 * dx / l); g.lineTo(P[0] + 4 * s * dx / l - 3 * dy / l, P[1] + 4 * s * dy / l + 3 * dx / l); g.stroke(); }
  g.translate((A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
  let uh = Math.atan2(dy, dx);
  if (uh > Math.PI / 2 || uh < -Math.PI / 2) uh += Math.PI;
  g.rotate(uh);
  g.font = `600 10px ${PISMO}`; g.textAlign = "center"; g.textBaseline = "bottom";
  const tw = g.measureText(text).width;
  g.fillStyle = "#fff"; g.fillRect(-tw / 2 - 2, -12, tw + 4, 11);
  g.fillStyle = "#1e293b"; g.fillText(text, 0, -2);
  g.restore();
}

// Výkres jedné plochy střechy s panely, lištami a háky (pohled kolmo na plochu).
function vykresPlochy(n, f) {
  const { c, g, w, h } = platno(714, 470);
  const us = f.poly2d.map(q => q[0]), vs = f.poly2d.map(q => q[1]);
  const umin = Math.min(...us), umax = Math.max(...us), vmin = Math.min(...vs), vmax = Math.max(...vs);
  const k = Math.min((w - 110) / (umax - umin), (h - 90) / (vmax - vmin));
  const ox = 60 + (w - 110 - (umax - umin) * k) / 2, oy = 30;
  const X = (u) => ox + (u - umin) * k, Y = (v) => oy + (vmax - v) * k;
  g.fillStyle = "#f6e7e1"; g.strokeStyle = "#7c2d12"; g.lineWidth = 1.5;
  g.beginPath(); f.poly2d.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v)))); g.closePath(); g.fill(); g.stroke();
  // okraj, který se má dodržet
  g.setLineDash([4, 4]); g.strokeStyle = "#d97706"; g.lineWidth = 0.8;
  g.beginPath();
  for (let v = vmin + n.okrajFve; v <= vmax - n.okrajFve + 1e-6; v += 0.05) {
    const r = rozsahU(f.poly2d, v);
    if (r) { g.moveTo(X(r[0] + n.okrajFve), Y(v)); g.lineTo(X(r[0] + n.okrajFve) + 0.5, Y(v)); g.moveTo(X(r[1] - n.okrajFve), Y(v)); g.lineTo(X(r[1] - n.okrajFve) + 0.5, Y(v)); }
  }
  g.stroke(); g.setLineDash([]);
  // překážky
  for (const o of (n.prekazky || []).filter(o => o.plocha === f.index)) {
    g.fillStyle = o.typ === "komin" ? "#9c4a35" : o.typ === "okno" ? "#64748b" : "#94a3b8";
    g.fillRect(X(o.u), Y(o.v + o.hloubka), o.sirka * k, o.hloubka * k);
    g.fillStyle = "#1e293b"; g.font = `600 9px ${PISMO}`; g.textAlign = "left";
    g.fillText(TYPY_PREKAZEK[o.typ]?.nazev || "", X(o.u + o.sirka) + 3, Y(o.v + o.hloubka / 2) + 3);
  }
  // panely
  let cislo0 = 1;
  const pole = n.fve.filter(p => p.plocha === f.index);
  for (const p of pole) {
    const m = montazPole(n, p);
    for (const pan of m.panely) {
      g.fillStyle = "#1f3256"; g.strokeStyle = "#cbd5e1"; g.lineWidth = 0.8;
      g.fillRect(X(pan.u), Y(pan.v + pan.hloubka), pan.pw * k, pan.hloubka * k);
      g.strokeRect(X(pan.u), Y(pan.v + pan.hloubka), pan.pw * k, pan.hloubka * k);
      g.fillStyle = "#fff"; g.font = `700 ${Math.max(7, Math.min(11, pan.pw * k / 3))}px ${PISMO}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(cislo0++), X(pan.u + pan.pw / 2), Y(pan.v + pan.hloubka / 2));
    }
    g.strokeStyle = "#f59e0b"; g.lineWidth = 2;
    for (const l of m.listy) { g.beginPath(); g.moveTo(X(l.a[0]), Y(l.a[1])); g.lineTo(X(l.b[0]), Y(l.b[1])); g.stroke(); }
    g.fillStyle = "#111827";
    for (const [u, v] of m.haky) g.fillRect(X(u) - 2.5, Y(v) - 2.5, 5, 5);
    // kóty polohy pole: od levé hrany plochy a od okapu
    const r = rozsahU(f.poly2d, p.v) || [umin, umax];
    kota(g, [X(r[0]), Y(p.v) + 0], [X(p.u), Y(p.v)], `${cislo(p.u - r[0])} m`, 10);
    kota(g, [X(p.u), Y(vmin)], [X(p.u), Y(p.v)], `${cislo(p.v - vmin)} m`, -10);
    kota(g, [X(p.u), Y(p.v + m.hloubka)], [X(p.u + m.sirka), Y(p.v + m.hloubka)], `${cislo(m.sirka)} m`, -12);
  }
  g.textBaseline = "alphabetic";
  // celkové kóty plochy
  kota(g, [X(umin), Y(vmin)], [X(umax), Y(vmin)], `okap ${cislo(umax - umin)} m`, 26);
  kota(g, [X(umin), Y(vmax)], [X(umin), Y(vmin)], `spád ${cislo(vmax - vmin)} m`, 30);
  return c.toDataURL("image/png");
}

// Půdorys hromosvodu (pohled shora): x doprava, z dolů — přední stěna je dole.
function pudorys(n, { body = null } = {}) {
  const { c, g, w, h } = platno(714, 560);
  const plochy = plochyStrechy(n);
  const vse = plochy.flatMap(f => f.body).map(b => [b[0], b[2]]);
  const L = n.delka / 2 + 2, W = n.sirka / 2 + 2;
  vse.push([-L, -W], [L, W]);
  const xs = vse.map(q => q[0]), zs = vse.map(q => q[1]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), zmin = Math.min(...zs), zmax = Math.max(...zs);
  const k = Math.min((w - 120) / (xmax - xmin), (h - 110) / (zmax - zmin));
  const ox = (w - (xmax - xmin) * k) / 2, oz = 40;
  const X = (x) => ox + (x - xmin) * k, Z = (z) => oz + (z - zmin) * k;
  // střecha
  for (const f of plochy) {
    g.fillStyle = f.pristavekId ? "#f1ebe4" : "#f6e7e1"; g.strokeStyle = "#a8a29e"; g.lineWidth = 1;
    g.beginPath(); f.body.forEach((b, i) => (i ? g.lineTo(X(b[0]), Z(b[2])) : g.moveTo(X(b[0]), Z(b[2])))); g.closePath(); g.fill(); g.stroke();
  }
  // obvod stěn
  g.strokeStyle = "#334155"; g.lineWidth = 2.5;
  g.strokeRect(X(-n.delka / 2), Z(-n.sirka / 2), n.delka * k, n.sirka * k);
  // panely (jen obrys)
  g.fillStyle = "rgba(31,50,86,0.35)";
  for (const p of n.fve) {
    const f = plochy[p.plocha];
    if (!f) continue;
    for (const pan of panelyPole(n, p)) {
      const rohy = [[pan.u, pan.v], [pan.u + pan.pw, pan.v], [pan.u + pan.pw, pan.v + pan.hloubka], [pan.u, pan.v + pan.hloubka]].map(([u, v]) => bodPlochy(f, u, v));
      g.beginPath(); rohy.forEach((b, i) => (i ? g.lineTo(X(b[0]), Z(b[2])) : g.moveTo(X(b[0]), Z(b[2])))); g.closePath(); g.fill();
    }
  }
  for (const o of n.prekazky || []) {
    const f = plochy[o.plocha];
    if (!f) continue;
    const s = bodPlochy(f, o.u + o.sirka / 2, o.v + o.hloubka / 2);
    g.fillStyle = "#9c4a35"; g.fillRect(X(s[0]) - o.sirka * k / 2, Z(s[2]) - o.hloubka * k / 2, o.sirka * k, o.hloubka * k);
  }
  const hs = n.hromosvod || {};
  if (body) {
    for (const b of body) { g.fillStyle = b.chranen ? "#16a34a" : "#dc2626"; g.beginPath(); g.arc(X(b.p[0]), Z(b.p[2]), 1.8, 0, Math.PI * 2); g.fill(); }
  } else {
    // zemnič
    {
      const zt = zemnicTrasy(n);
      g.setLineDash([7, 5]); g.strokeStyle = "#7c4a1e"; g.lineWidth = 1.5;
      for (const c of zt.cary) { g.beginPath(); c.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); }
      g.setLineDash([]); g.fillStyle = "#7c4a1e";
      for (const [x, z] of zt.tyce) { g.beginPath(); g.arc(X(x), Z(z), 3, 0, Math.PI * 2); g.fill(); }
    }
    // vedení
    g.strokeStyle = "#dc2626"; g.lineWidth = 2;
    for (const v of hs.vedeni || []) {
      const d = drahaVedeni(n, v.body);
      g.beginPath(); d.forEach((b, i) => (i ? g.lineTo(X(b[0]), Z(b[2])) : g.moveTo(X(b[0]), Z(b[2])))); g.stroke();
    }
    // tyče
    for (const t of hs.tyce || []) {
      const p = patyTyce(n, t);
      g.fillStyle = "#dc2626"; g.beginPath(); g.moveTo(X(p[0]), Z(p[2]) - 7); g.lineTo(X(p[0]) - 6, Z(p[2]) + 5); g.lineTo(X(p[0]) + 6, Z(p[2]) + 5); g.closePath(); g.fill();
    }
    // svody s čísly
    const svody = seznamSvodu(n);
    g.font = `700 10px ${PISMO}`; g.textAlign = "center"; g.textBaseline = "middle";
    for (const s of svody) {
      g.fillStyle = "#fff"; g.strokeStyle = "#dc2626"; g.lineWidth = 2;
      g.beginPath(); g.arc(X(s.x), Z(s.z), 12, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = "#dc2626"; g.fillText(`ZS${s.cislo}`, X(s.x), Z(s.z) + 0.5);
    }
    g.textBaseline = "alphabetic";
  }
  // kóty domu
  kota(g, [X(-n.delka / 2), Z(n.sirka / 2)], [X(n.delka / 2), Z(n.sirka / 2)], `${cislo(n.delka)} m`, -34);
  kota(g, [X(n.delka / 2), Z(n.sirka / 2)], [X(n.delka / 2), Z(-n.sirka / 2)], `${cislo(n.sirka)} m`, -34);
  // popis stran
  g.fillStyle = "#475569"; g.font = `600 11px ${PISMO}`; g.textAlign = "center";
  g.fillText("PŘEDNÍ STĚNA", X(0), Z(n.sirka / 2) + 54);
  // sever
  const af = ((n.azimutPredni || 0) * Math.PI) / 180;
  const sx = Math.sin(af), sz = Math.cos(af);
  const cx = w - 40, cz = 45;
  g.strokeStyle = "#0f172a"; g.fillStyle = "#0f172a"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx - sx * 20, cz - sz * 20); g.lineTo(cx + sx * 20, cz + sz * 20); g.stroke();
  g.beginPath(); g.moveTo(cx + sx * 24, cz + sz * 24); g.lineTo(cx + sx * 12 - sz * 6, cz + sz * 12 + sx * 6); g.lineTo(cx + sx * 12 + sz * 6, cz + sz * 12 - sx * 6); g.closePath(); g.fill();
  g.font = `800 12px ${PISMO}`; g.fillText("S", cx + sx * 34, cz + sz * 34 + 4);
  // měřítko 5 m
  g.strokeStyle = "#0f172a"; g.lineWidth = 2; g.beginPath(); g.moveTo(20, h - 20); g.lineTo(20 + 5 * k, h - 20); g.stroke();
  g.font = `600 10px ${PISMO}`; g.textAlign = "left"; g.fillText("5 m", 24 + 5 * k, h - 16);
  return c.toDataURL("image/png");
}

// Řez valivou koulí ve 2D: pohled zepředu (osa "x") nebo zboku (osa "z").
// Jímací soustava se promítne do roviny pohledu, koule poloměru R se valí po
// zemi a po vodičích; dolní obálka koule je hranice ochranného prostoru.
function rezKoule(n, osa, R) {
  const h = (b) => (osa === "x" ? b[0] : b[2]);            // zboku (zleva): přední stěna vpravo
  const lps = bodyJimaci(n).map(b => [h(b), b[1]]);
  // obrys stavby (nejvyšší bod střechy v každém místě) včetně komínů
  const plochy = plochyStrechy(n);
  const krok = 0.1;
  const vse = plochy.flatMap(f => f.body);
  const hmin = Math.min(...vse.map(h)), hmax = Math.max(...vse.map(h));
  const hloubky = vse.map(b => (osa === "x" ? b[2] : b[0]));
  const dmin = Math.min(...hloubky), dmax = Math.max(...hloubky);
  const uvnitr = (poly, x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = [poly[i][0], poly[i][2]], [xj, zj] = [poly[j][0], poly[j][2]];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const vrsek = (x, z) => {
    let y = 0;
    for (const f of plochy) if (uvnitr(f.body, x, z)) {
      // výška roviny plochy nad bodem (x, z)
      const d = v3.sub([x, 0, z], f.O);
      const t = -(d[0] * f.N[0] + d[2] * f.N[2]) / (f.N[1] || 1e-9);
      y = Math.max(y, f.O[1] + t);
    }
    return y;
  };
  const kominy = (n.prekazky || []).filter(o => o.typ !== "okno").map(o => {
    const f = plochy[o.plocha];
    if (!f) return null;
    const s = bodPlochy(f, o.u + o.sirka / 2, o.v + o.hloubka / 2);
    return { h: h(s), sirka: o.sirka / 2 + 0.05, y: s[1] + (Number(o.vyska) || 0.5) };
  }).filter(Boolean);
  const okraj = 8;
  const xs = [];
  for (let x = hmin - okraj; x <= hmax + okraj + 1e-9; x += krok) xs.push(x);
  const obrys = xs.map(x => {
    if (x < hmin - 0.01 || x > hmax + 0.01) return 0;
    let y = 0;
    for (let d = dmin; d <= dmax + 1e-9; d += 0.25) y = Math.max(y, osa === "x" ? vrsek(x, d) : vrsek(d, -x));
    for (const k of kominy) if (Math.abs(x - k.h) <= k.sirka) y = Math.max(y, k.y);
    return y;
  });
  // výška středu koule nad místem c a dolní obálka
  const cs = [];
  for (let c = hmin - okraj - R; c <= hmax + okraj + R + 1e-9; c += 0.2) cs.push(c);
  const stred = cs.map(c => {
    let y = R;
    for (const [px, py] of lps) { const dx = c - px; if (Math.abs(dx) < R) y = Math.max(y, py + Math.sqrt(R * R - dx * dx)); }
    return y;
  });
  const hranice = xs.map(x => {
    let b = Infinity;
    for (let i = 0; i < cs.length; i++) { const dx = x - cs[i]; if (Math.abs(dx) <= R) b = Math.min(b, stred[i] - Math.sqrt(R * R - dx * dx)); }
    return Math.max(0, b);
  });
  const nechranene = xs.map((x, i) => obrys[i] > hranice[i] + 0.03);

  // kreslení
  const ymax = Math.max(...obrys, ...lps.map(p => p[1])) + 3;
  const { c, g, w, h: vys } = platno(714, 250);
  const k = Math.min((w - 40) / (xs[xs.length - 1] - xs[0]), (vys - 40) / ymax);
  const X = (x) => 20 + (x - xs[0]) * k, Y = (y) => vys - 22 - y * k;
  g.save(); g.beginPath(); g.rect(0, 0, w, vys - 22); g.clip();
  // prostor, kam se koule dostane (nad hranicí)
  g.fillStyle = "rgba(3,105,161,0.08)";
  g.beginPath(); g.moveTo(X(xs[0]), 0); xs.forEach((x, i) => g.lineTo(X(x), Y(hranice[i]))); g.lineTo(X(xs[xs.length - 1]), 0); g.closePath(); g.fill();
  // kružnice koule: na zemi u krajních vodičů a opřená o nejvyšší bod
  const poloha = (c0) => { let y = R; for (const [px, py] of lps) { const dx = c0 - px; if (Math.abs(dx) < R) y = Math.max(y, py + Math.sqrt(R * R - dx * dx)); } return y; };
  const vlevo = Math.min(...lps.map(([px, py]) => px - Math.sqrt(Math.max(0, R * R - (R - py) ** 2))));
  const vpravo = Math.max(...lps.map(([px, py]) => px + Math.sqrt(Math.max(0, R * R - (R - py) ** 2))));
  const nejvyssi = lps.reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0]);
  g.strokeStyle = "rgba(3,105,161,0.7)"; g.lineWidth = 1.5;
  for (const c0 of [vlevo, nejvyssi[0], vpravo]) { g.beginPath(); g.arc(X(c0), Y(poloha(c0)), R * k, 0, Math.PI * 2); g.stroke(); }
  g.restore();
  // terén
  g.strokeStyle = "#65a30d"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke();
  // obrys stavby
  g.fillStyle = "#cbd5e1"; g.strokeStyle = "#64748b"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(X(xs[0]), Y(0)); xs.forEach((x, i) => g.lineTo(X(x), Y(obrys[i]))); g.lineTo(X(xs[xs.length - 1]), Y(0)); g.closePath(); g.fill(); g.stroke();
  // nechráněné části
  g.strokeStyle = "#dc2626"; g.lineWidth = 3;
  xs.forEach((x, i) => { if (nechranene[i] && obrys[i] > 0) { g.beginPath(); g.moveTo(X(x - krok / 2), Y(obrys[i])); g.lineTo(X(x + krok / 2), Y(obrys[i])); g.stroke(); } });
  // hranice ochranného prostoru
  g.setLineDash([6, 4]); g.strokeStyle = "#0369a1"; g.lineWidth = 1.6;
  g.beginPath(); xs.forEach((x, i) => (i ? g.lineTo(X(x), Y(hranice[i])) : g.moveTo(X(x), Y(hranice[i])))); g.stroke(); g.setLineDash([]);
  // jímací soustava
  g.fillStyle = "#dc2626";
  for (const [px, py] of lps) g.fillRect(X(px) - 1, Y(py) - 1, 2, 2);
  // popisy
  g.fillStyle = "#0f172a"; g.font = `700 11px ${PISMO}`; g.textAlign = "left";
  g.fillText(`R = ${R} m`, 26, 16);
  g.font = `600 10px ${PISMO}`;
  g.fillText(osa === "x" ? "← levá strana      pohled zepředu      pravá strana →" : "← zadní strana      pohled zleva      přední strana →", 26, vys - 6);
  kota(g, [X(hmin), Y(0)], [X(hmax), Y(0)], `${cislo(hmax - hmin)} m`, -12);
  return { obr: c.toDataURL("image/png"), nechraneno: nechranene.some((v, i) => v && obrys[i] > 0) };
}

// Svody: samostatné svody i ručně kreslená vedení končící u země.
function seznamSvodu(n) {
  const hs = n.hromosvod || {};
  const out = [];
  const popis = (x, z) => {
    let nej = null;
    for (const st of steny(n)) {
      const si = Math.max(0, Math.min(st.delka, (x - st.a[0]) * st.dir[0] + (z - st.a[1]) * st.dir[1]));
      const d = Math.hypot(x - (st.a[0] + st.dir[0] * si), z - (st.a[1] + st.dir[1] * si));
      if (!nej || d < nej.d) nej = { st, si, d };
    }
    if (nej.d > 0.5) return "u přístřešku / mimo dům";
    const roh = nej.si < 0.01 || nej.si > nej.st.delka - 0.01;
    return roh ? `roh – ${nej.st.nazev.toLowerCase()} stěna` : `${nej.st.nazev} stěna, ${cislo(nej.si)} m od levého rohu`;
  };
  for (const sv of hs.svody || []) {
    const t = trasaSvodu(n, sv);
    out.push({ x: sv.x, z: sv.z, popis: popis(sv.x, sv.z), delka: t.slice(1).reduce((s, q, i) => s + v3.dist(q, t[i]), 0) });
  }
  for (const v of hs.vedeni || []) {
    const k = v.body[v.body.length - 1];
    if (!jePevny(k) || k[1] > 0.3) continue;
    let delka = 0;
    for (let i = v.body.length - 1; i > 0 && jePevny(v.body[i - 1]); i--) delka += v3.dist(v.body[i], v.body[i - 1]);
    out.push({ x: k[0], z: k[2], popis: popis(k[0], k[2]), delka });
  }
  return out.map((s, i) => ({ ...s, cislo: i + 1 }));
}

// ── stránky ──
const STYL = `
  * { box-sizing: border-box; }
  .str { width: 794px; height: 1123px; padding: 38px 40px 34px; font-family: ${PISMO}; color: #0f172a; background: #fff; position: relative; font-size: 12px; }
  .hl { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0E3B5E; padding-bottom: 6px; margin-bottom: 14px; }
  .hl b { font-size: 13px; color: #0E3B5E; } .hl span { font-size: 10px; color: #475569; }
  h1 { font-size: 24px; margin: 0 0 6px; color: #0E3B5E; } h2 { font-size: 16px; margin: 0 0 10px; color: #0E3B5E; } h3 { font-size: 13px; margin: 12px 0 6px; }
  table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; font-size: 11px; vertical-align: top; }
  th { background: #f1f5f9; } td.r, th.r { text-align: right; }
  .pata { position: absolute; left: 40px; right: 40px; bottom: 16px; display: flex; justify-content: space-between; font-size: 9px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px; }
  .ok { color: #15803d; font-weight: 700; } .ne { color: #b91c1c; font-weight: 700; }
  .mriz { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } img { display: block; max-width: 100%; }
  .leg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 10px; color: #334155; margin-top: 6px; } .leg i { display: inline-block; width: 14px; height: 8px; margin-right: 4px; vertical-align: middle; }
`;

// Vstupy a výsledek výpočtu rizika pro návrh (stejně jako v záložce Riziko).
function vstupyRizika(n) {
  const hs = n.hromosvod || {};
  const rizVst = { ...rz.vychoziRiziko(n), ...(n.riziko || {}) };
  if (rizVst.H == null || rizVst.H === "") rizVst.H = Math.round(vyskaHrebene(n) * 100) / 100;
  if (!n.riziko?.L) { rizVst.L = n.delka; rizVst.W = n.sirka; }
  const pos = rz.posouzeniNavrhu(rizVst, (hs.vedeni || []).length ? (hs.trida || "III") : "");
  rizVst.spd = pos.spd;
  return { rizVst, lpsRiz: pos.lps, riz: pos, postup: pos.postup };
}

// HTML stránky → html2canvas → PDF; vrací Blob (stahnout: false = jen vrátí)
export async function ulozPdf(strany, soubor, { stahnout = true } = {}) {
  const [{ jsPDF }, h2c] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const html2canvas = h2c.default;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const kontejner = document.createElement("div");
  Object.assign(kontejner.style, { position: "fixed", left: "-10000px", top: "0", width: "794px", background: "#fff" });
  document.body.appendChild(kontejner);
  try {
    for (let i = 0; i < strany.length; i++) {
      kontejner.innerHTML = `<style>${STYL}</style>` + strany[i].replace("{S}", i + 1).replace("{N}", strany.length);
      await Promise.all([...kontejner.querySelectorAll("img")].map(img => (img.complete ? null : new Promise(r => { img.onload = img.onerror = r; }))));
      const canvas = await html2canvas(kontejner.querySelector(".str"), { scale: 2, backgroundColor: "#ffffff" });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, 210, 297);
    }
  } finally {
    document.body.removeChild(kontejner);
  }
  if (stahnout) pdf.save(soubor);
  return pdf.output("blob");
}
const nazevSouboru = (n) => (n.nazev || "navrh").replace(/[^\p{L}\p{N}_-]+/gu, "_");

export async function vytvorMontazniDokumentaci({ navrh: n, snimky, snimkyKoule = {}, koule, radkySoupisu }) {
  const datum = new Date().toLocaleDateString("cs-CZ");
  const plochy = plochyStrechy(n);
  const sh = soupis(n);
  const hs = n.hromosvod || {};
  const trida = hs.trida || "III";
  const typStrechy = TYPY_STRECHY.find(t => t.id === n.strecha)?.nazev || n.strecha;
  const { rizVst, lpsRiz, riz, postup } = vstupyRizika(n);
  const svody = seznamSvodu(n);
  const strany = [];
  const hlava = (nazev) => `<div class="hl"><div><b>${esc(COMPANY.name)}</b><br><span>${esc(COMPANY.addressLine)}, ${esc(COMPANY.city)} · IČO ${esc(COMPANY.ico)}</span></div><div style="text-align:right"><b>${esc(nazev)}</b><br><span>${esc(n.nazev)} · ${esc(n.zakaznik)}</span></div></div>`;
  const pata = () => `<div class="pata"><span>Montážní dokumentace FVE a ochrany před bleskem · ${esc(n.nazev)}</span><span>${datum} · strana {S}/{N}</span></div>`;
  const stranka = (nazev, obsah) => strany.push(`<div class="str">${hlava(nazev)}${obsah}${pata()}</div>`);

  // 1 — titulní list
  stranka("Titulní list", `
    <h1>Montážní dokumentace</h1>
    <div style="font-size:15px;margin-bottom:12px">Fotovoltaická elektrárna a ochrana před bleskem</div>
    <table style="margin-bottom:12px"><tbody>
      <tr><th style="width:32%">Objekt / zákazník</th><td>${esc(n.zakaznik || n.nazev)}</td></tr>
      <tr><th>Stavba</th><td>${cislo(n.delka)} × ${cislo(n.sirka)} m, okap ${cislo(n.vyskaOkapu)} m, hřeben ${cislo(vyskaHrebene(n))} m, střecha ${esc(typStrechy)} ${n.strecha !== "plocha" ? `${cislo(n.sklon, 0)}°` : ""}</td></tr>
      <tr><th>FVE</th><td>${sh.panelu} ks panelů ${n.panel.wp} Wp = <b>${cislo(sh.kwp)} kWp</b>; ${sh.poPlochach.map(p => `${esc(p.nazev)} ${p.pocet} ks`).join(", ") || "—"}</td></tr>
      <tr><th>Ochrana před bleskem</th><td>LPS třídy ${trida}, jímací vedení ${cislo(sh.jimaci, 1)} m, ${sh.pocetSvodu} svodů, ${sh.tyci} jímacích tyčí${{ obvod: ", obvodový zemnič", u: ", zemnič do U", samostatne: `, ${sh.zemnicTyci} samostatných zemničů (tyče)` }[typZemnice(hs)] || ""}</td></tr>
      <tr><th>Riziko R1 (ČSN EN 62305-2)</th><td class="${riz.vyhovuje ? "ok" : "ne"}">${exp10(riz.R1)} ${riz.vyhovuje ? "≤" : ">"} R<sub>T</sub> = 10⁻⁵ — ${riz.vyhovuje ? "vyhovuje" : "nevyhovuje"}</td></tr>
      ${koule ? `<tr><th>Valivá koule R = ${koule.R} m</th><td class="${koule.nechranenych ? "ne" : "ok"}">${koule.nechranenych ? `nechráněno ${koule.nechranenych} kontrolních bodů` : "celá střecha v ochranném prostoru"}</td></tr>` : ""}
      <tr><th>Zpracoval / datum</th><td>${esc(COMPANY.name)} · ${datum}</td></tr>
    </tbody></table>
    ${snimky["3d"] ? `<img src="${snimky["3d"]}" style="width:100%;border:1px solid #e2e8f0;border-radius:6px">` : ""}
  `);

  // 2 — pohledy
  stranka("Pohledy", `<h2>Pohledy na stavbu</h2><div class="mriz">
    ${[["predni", "Zepředu"], ["prava", "Zprava"], ["zadni", "Zezadu"], ["leva", "Zleva"]].map(([k, t]) => `<div><div style="font-weight:700;margin-bottom:4px">${t}</div><img src="${snimky[k]}" style="border:1px solid #e2e8f0;border-radius:6px"></div>`).join("")}
  </div><h3>Pohled shora</h3><img src="${snimky.shora}" style="width:70%;margin:0 auto;border:1px solid #e2e8f0;border-radius:6px">`);

  // 3 — výkresy ploch s FVE
  const celkemMontaz = { delkaList: 0, kusuList: 0, spojek: 0, haky: 0, stredovych: 0, koncovych: 0 };
  let cisloPanelu = 1;
  for (const f of plochy) {
    const pole = n.fve.filter(p => p.plocha === f.index);
    if (!pole.length) continue;
    const radky = pole.map((p, i) => {
      const m = montazPole(n, p);
      celkemMontaz.delkaList += m.delkaList; celkemMontaz.kusuList += m.kusuList; celkemMontaz.spojek += m.spojek;
      celkemMontaz.haky += m.haky.length; celkemMontaz.stredovych += m.stredovych; celkemMontaz.koncovych += m.koncovych;
      const r = rozsahU(f.poly2d, p.v) || [0, 0];
      const vmin = Math.min(...f.poly2d.map(q => q[1]));
      const od = cisloPanelu; cisloPanelu += p.radky * p.sloupce;
      return `<tr><td>${i + 1}</td><td>${od}–${cisloPanelu - 1}</td><td>${p.radky} × ${p.sloupce} (${p.orientace === "sirku" ? "na šířku" : "na výšku"}${p.naklon ? `, náklon ${p.naklon}°` : ""})</td>
        <td class="r">${cislo(p.u - r[0])} / ${cislo(p.v - vmin)}</td><td class="r">${cislo(m.sirka)} × ${cislo(m.hloubka)}</td><td class="r">${m.listy.length} × ${cislo(m.delkaList / m.listy.length)}</td><td class="r">${m.haky.length}</td></tr>`;
    }).join("");
    const pocet = pole.reduce((s, p) => s + p.radky * p.sloupce, 0);
    stranka(`Výkres FVE – ${f.nazev}`, `
      <h2>${esc(f.nazev)} – rozmístění panelů</h2>
      <div style="margin-bottom:6px">Sklon ${cislo(f.sklon, 0)}°${f.azimut != null ? `, orientace ${cislo(f.azimut, 0)}° (${f.smer})` : ""} · ${pocet} panelů · ${cislo((pocet * n.panel.wp) / 1000)} kWp · panel ${cislo(n.panel.sirka, 3)} × ${cislo(n.panel.vyska, 3)} m, mezera ${cislo(n.mezeraFve)} m, okraj ${cislo(n.okrajFve)} m</div>
      <img src="${vykresPlochy(n, f)}" style="width:100%;border:1px solid #e2e8f0">
      <div class="leg"><span><i style="background:#1f3256"></i>panel (číslo)</span><span><i style="background:#f59e0b;height:3px"></i>montážní lišta</span><span><i style="background:#111827;width:6px;height:6px"></i>střešní hák</span><span><i style="border-top:1px dashed #d97706;height:0"></i>min. okraj</span><span>Pohled kolmo na plochu, okap dole.</span></div>
      <h3>Pole panelů</h3>
      <table><thead><tr><th>Pole</th><th>Panely č.</th><th>Uspořádání</th><th class="r">Od levé hrany / od okapu (m)</th><th class="r">Rozměr pole (m)</th><th class="r">Lišty (ks × m)</th><th class="r">Háky</th></tr></thead><tbody>${radky}</tbody></table>
      <div style="font-size:10px;color:#475569;margin-top:6px">Kóty polohy jsou měřené v rovině střechy od levé hrany plochy a od okapové hrany (včetně přesahu). Háky orientačně á ${cislo(ROZTEC_HAKU, 1)} m – přesně je osaďte na krokve.</div>
    `);
  }

  // 4 — hromosvod
  stranka("Výkres hromosvodu", `
    <h2>Ochrana před bleskem – půdorys (LPS třídy ${trida})</h2>
    <img src="${pudorys(n)}" style="width:100%;border:1px solid #e2e8f0">
    <div class="leg"><span><i style="background:#dc2626;height:3px"></i>jímací vedení</span><span>⭘ ZS1… svod se zkušební svorkou</span><span>▲ jímací tyč</span><span><i style="border-top:2px dashed #7c4a1e;height:0"></i>obvodový zemnič</span><span><i style="background:rgba(31,50,86,0.35)"></i>FVE</span></div>
    <h3>Svody</h3>
    <table><thead><tr><th>Zkušební svorka</th><th>Umístění (vlevo = při pohledu na stěnu zvenku)</th><th class="r">Délka (m)</th><th>Zkušební svorka</th></tr></thead><tbody>
      ${svody.map(s => `<tr><td>ZS${s.cislo}</td><td>${esc(s.popis)}</td><td class="r">${cislo(s.delka, 1)}</td><td>ve výšce cca 1,6 m nad terénem</td></tr>`).join("") || `<tr><td colspan="4">Bez svodů</td></tr>`}
    </tbody></table>
    <h3>Parametry</h3>
    <table><tbody>
      <tr><th style="width:40%">Třída LPS</th><td>${trida} – rozestup svodů max. ${TRIDY_LPS[trida].svody} m, oko mřížové soustavy ${TRIDY_LPS[trida].oko} × ${TRIDY_LPS[trida].oko} m, valivá koule R = ${POLOMER_KOULE[trida]} m</td></tr>
      <tr><th>Jímací vedení / svody</th><td>${cislo(sh.jimaci, 1)} m / ${cislo(sh.svodyDelka, 1)} m (bez rezervy), vodič AlMgSi Ø8 na podpěrách á 1 m, 15 cm nad krytinou</td></tr>
      <tr><th>Dostatečná vzdálenost s</th><td>${cislo(hs.odstup ?? 0.5)} m${sh.blizko ? ` – <span class="ne">${sh.blizko} panelů je blíže, nutno řešit (oddálení / výpočet s dle ČSN EN 62305-3)</span>` : " – dodržena"}</td></tr>
      <tr><th>Propojení</th><td class="${sh.nepropojeno ? "ne" : "ok"}">${sh.nepropojeno ? `${sh.nepropojeno} nepropojených konců` : "všechny vodiče propojeny"}</td></tr>
      ${pristavky(n).length ? `<tr><th>Přístřešky</th><td>${pristavky(n).map(p => `${esc(p.typ === "pristavek" ? "přístavek" : "přístřešek")} ${cislo(p.s1 - p.s0, 1)} × ${cislo(p.D, 1)} m u stěny ${esc((STRANY.find(x => x.id === p.st.id)?.nazev || "").toLowerCase())}`).join("; ")}</td></tr>` : ""}
    </tbody></table>
  `);

  // 5 — valivá koule
  if (koule) {
    stranka("Valivá koule", `
      <h2>Ověření metodou valivé koule (R = ${koule.R} m)</h2>
      <div class="${koule.nechranenych ? "ne" : "ok"}" style="margin-bottom:8px">${koule.nechranenych ? `Koule se dotkne střechy v ${koule.nechranenych} kontrolních bodech (červeně) – chráněno ${cislo(koule.procento, 0)} % plochy.` : "Všechny kontrolní body střechy leží v ochranném prostoru."}</div>
      <img src="${pudorys(n, { body: koule.body })}" style="width:100%;border:1px solid #e2e8f0">
      <div class="leg"><span><i style="background:#16a34a"></i>chráněno</span><span><i style="background:#dc2626"></i>koule se dotkne krytiny</span><span>Kontrolní body po 0,5 m na všech plochách střechy.</span></div>
      <h3>Průhyb koule nad plochami</h3>
      <table><thead><tr><th>Plocha</th><th class="r">Vzdálenost koule od krytiny (střed plochy)</th></tr></thead><tbody>
        ${koule.koule.map(k => `<tr><td>${esc(k.nazev)}</td><td class="r ${k.rezerva < 0 ? "ne" : ""}">${k.rezerva < 0 ? "dotkne se" : `${cislo(k.rezerva)} m`}</td></tr>`).join("")}
      </tbody></table>
    `);
  }

  if (koule) {
    const zepredu = rezKoule(n, "x", koule.R), zboku = rezKoule(n, "z", koule.R);
    const vysl = (r) => (r.nechraneno ? `<span class="ne">obrys stavby přesahuje hranici ochranného prostoru (červeně)</span>` : `<span class="ok">celý obrys stavby je v ochranném prostoru</span>`);
    stranka("Valivá koule – pohledy", `
      <h2>Valivá koule R = ${koule.R} m – pohledy</h2>
      <div style="margin-bottom:6px">Koule o poloměru R se valí po zemi a po jímací soustavě (vedení, tyče, svody). Prostor pod hranicí, kam se koule nedostane, je chráněný.</div>
      <h3 style="margin-top:6px">Pohled zepředu (řez kolmo na přední stěnu) – ${vysl(zepredu)}</h3>
      <img src="${zepredu.obr}" style="width:100%;border:1px solid #e2e8f0">
      <h3>Pohled zleva – ${vysl(zboku)}</h3>
      <img src="${zboku.obr}" style="width:100%;border:1px solid #e2e8f0">
      <div class="leg"><span><i style="background:#94a3b8"></i>obrys stavby</span><span><i style="background:#dc2626;height:4px;width:6px;border-radius:3px"></i>jímací soustava</span><span><i style="border-top:2px solid #0369a1;height:0"></i>valivá koule</span><span><i style="border-top:2px dashed #0369a1;height:0"></i>hranice ochranného prostoru</span><span><i style="background:#dc2626"></i>nechráněná část</span></div>
      ${snimkyKoule["3d"] ? `<h3>Kontrolní body na střeše</h3><img src="${snimkyKoule["3d"]}" style="width:62%;border:1px solid #e2e8f0;border-radius:6px"><div class="leg"><span><i style="background:#16a34a"></i>chráněno</span><span><i style="background:#dc2626"></i>koule se dotkne krytiny</span></div>` : ""}
    `);
  }

  // 6 — riziko
  stranka("Výpočet rizika", `
    <h2>Řízení rizika – ČSN EN 62305-2 ed. 2, riziko R1 (ztráty na lidských životech)</h2>
    <table><tbody>
      <tr><th style="width:45%">Hustota úderů do země N<sub>G</sub></th><td>${cislo(rizVst.ng, 1)} /km²/rok</td></tr>
      <tr><th>Rozměry L × W × H</th><td>${cislo(rizVst.L)} × ${cislo(rizVst.W)} × ${cislo(rizVst.H)} m</td></tr>
      <tr><th>Sběrná plocha A<sub>D</sub> (A.2) / činitel polohy C<sub>D</sub></th><td>${cislo(riz.AD, 0)} m² / ${rizVst.cd}</td></tr>
      <tr><th>Počet úderů do stavby N<sub>D</sub> (A.4)</th><td>${exp10(riz.ND)} /rok</td></tr>
      ${riz.vedeni.map(v => `<tr><th>${esc(v.nazev)}: L<sub>L</sub>, C<sub>I</sub>, C<sub>E</sub>, C<sub>T</sub>, U<sub>W</sub></th><td>${cislo(v.delka, 0)} m, ${v.ci}, ${v.ce}, ${v.ct}, ${String(v.uw).replace(".", ",")} kV → N<sub>L</sub> = ${exp10(v.NL)}/rok, P<sub>LD</sub> = ${v.PLD}</td></tr>`).join("")}
      <tr><th>Ztráty L<sub>A</sub> = L<sub>U</sub> / L<sub>B</sub> = L<sub>V</sub> (C.1–C.3)</th><td>${exp10(riz.LA)} / ${exp10(riz.LB)} (r<sub>t</sub> = ${exp10(rizVst.rtPovrch)}, r<sub>p</sub> = ${rizVst.rp}, r<sub>f</sub> = ${exp10(rizVst.rf)}, h<sub>z</sub> = ${rizVst.hz}, L<sub>F</sub> = ${exp10(rizVst.lf)})</td></tr>
      <tr><th>Navržená ochrana</th><td>LPS ${lpsRiz || "žádný"} (P<sub>B</sub> = ${riz.PB}), SPD ${rizVst.spd ? `LPL ${rizVst.spd}` : "žádné"} (P<sub>EB</sub> = ${riz.PEB})</td></tr>
    </tbody></table>
    <h3>Součásti rizika</h3>
    <table><thead><tr><th>Součást</th><th class="r">Hodnota</th></tr></thead><tbody>
      <tr><td>R<sub>A</sub> – úraz živých bytostí, úder do stavby</td><td class="r">${exp10(riz.RA)}</td></tr>
      <tr><td>R<sub>B</sub> – hmotná škoda, úder do stavby</td><td class="r">${exp10(riz.RB)}</td></tr>
      <tr><td>R<sub>U</sub> – úraz živých bytostí, úder do vedení</td><td class="r">${exp10(riz.RU)}</td></tr>
      <tr><td>R<sub>V</sub> – hmotná škoda, úder do vedení</td><td class="r">${exp10(riz.RV)}</td></tr>
      <tr><th>R1 = R<sub>A</sub> + R<sub>B</sub> + R<sub>U</sub> + R<sub>V</sub></th><th class="r ${riz.vyhovuje ? "ok" : "ne"}">${exp10(riz.R1)}</th></tr>
    </tbody></table>
    <h3>Postup podle obr. 1 normy</h3>
    <table><thead><tr><th>Krok</th><th class="r">R1</th><th>R1 ≤ R<sub>T</sub></th></tr></thead><tbody>
      ${postup.kroky.map(k => `<tr><td>${esc(k.krok)}</td><td class="r">${exp10(k.R1)}</td><td class="${k.vyhovuje ? "ok" : "ne"}">${k.vyhovuje ? "ano" : "ne"}</td></tr>`).join("")}
    </tbody></table>
    ${(() => {
      const popisOchrany = `${lpsRiz ? `LPS třídy ${lpsRiz}` : "bez LPS"}, ${rizVst.spd ? `SPD na vstupu vedení (LPL ${rizVst.spd})` : "bez SPD na vstupu vedení"}`;
      const soucasti = [["R<sub>A</sub>", riz.RA], ["R<sub>B</sub>", riz.RB], ["R<sub>U</sub>", riz.RU], ["R<sub>V</sub>", riz.RV]];
      const [hlavni, hodn] = soucasti.reduce((a, b) => (b[1] > a[1] ? b : a));
      return `<div style="margin-top:10px;font-size:13px" class="${riz.vyhovuje ? "ok" : "ne"}">Závěr: posuzovaná ochrana (${popisOchrany}): R1 = ${exp10(riz.R1)} ${riz.vyhovuje ? "≤" : ">"} R<sub>T</sub> = 10⁻⁵ – ${riz.vyhovuje ? "vyhovuje" : "nevyhovuje"}.</div>
        ${riz.vyhovuje ? "" : `<div style="font-size:12px;margin-top:4px">Rozhodující součást je ${hlavni} (${cislo((100 * hodn) / (riz.R1 || 1), 0)} % rizika)${hlavni.startsWith("R<sub>V") || hlavni.startsWith("R<sub>U") ? " – údery do připojených vedení; snižuje ji SPD na vstupu vedení, samotný LPS ne" : ""}. Ochrana požadovaná normou (obr. 1): <b>${postup.lps ? `LPS třídy ${postup.lps}` : "bez LPS"}${postup.spd ? `, SPD na vstupu vedení pro LPL ${postup.spd}` : ""}</b>.</div>`}`;
    })()}
    <div style="font-size:10px;color:#475569;margin-top:6px">Stavba posouzena jako jedna zóna; součásti R<sub>C</sub>, R<sub>M</sub>, R<sub>W</sub>, R<sub>Z</sub> se pro R1 uvažují jen u staveb s rizikem výbuchu a nemocnic. Riziko R4 (ekonomické ztráty) není součástí výpočtu.</div>
  `);

  // 7 — soupis materiálu
  const montazRadky = sh.panelu ? [
    ["Montážní lišty (celková délka)", `${cislo(celkemMontaz.delkaList, 1)} m`],
    [`Montážní lišty ${cislo(DELKA_LISTY, 1)} m`, `${celkemMontaz.kusuList} ks`],
    ["Spojky lišt", `${celkemMontaz.spojek} ks`],
    ["Střešní háky", `${celkemMontaz.haky} ks`],
    ["Středové svorky", `${celkemMontaz.stredovych} ks`],
    ["Koncové svorky", `${celkemMontaz.koncovych} ks`],
  ] : [];
  stranka("Soupis materiálu", `
    <h2>Soupis materiálu</h2>
    <table><thead><tr><th>Položka</th><th class="r">Množství</th><th>Jedn.</th></tr></thead><tbody>
      ${radkySoupisu.map(r => `<tr><td>${esc(r[0])}</td><td class="r">${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}
    </tbody></table>
    ${montazRadky.length ? `<h3>Montážní systém FVE (orientačně)</h3><table><tbody>${montazRadky.map(([a, b]) => `<tr><td>${a}</td><td class="r" style="width:30%">${b}</td></tr>`).join("")}</tbody></table>` : ""}
    <h3>Poznámky k montáži</h3>
    <ul style="margin:0;padding-left:18px;line-height:1.5">
      <li>Před montáží ověřit rozměry střechy, polohu krokví, komínů a střešních prostupů na místě.</li>
      <li>Háky kotvit do krokví, krytinu pod hákem upravit podle pokynů výrobce krytiny.</li>
      <li>Kovové konstrukce FVE v ochranném prostoru LPS umístit s dodržením dostatečné vzdálenosti s; kde ji nelze dodržet, řešit podle ČSN EN 62305-3.</li>
      <li>Vodiče jímací soustavy vést na podpěrách, svody ukončit zkušební svorkou a připojit k uzemňovací soustavě.</li>
      <li>Na vstupu vedení do stavby osadit SPD podle výsledku výpočtu rizika (ČSN EN 62305-4).</li>
      <li>Po dokončení provést výchozí revizi elektrické instalace FVE a hromosvodu.</li>
    </ul>
    <table style="margin-top:22px"><tbody>
      <tr><th style="width:33%">Zpracoval</th><th style="width:33%">Montáž provedl</th><th>Převzal (investor)</th></tr>
      <tr><td style="height:60px">${esc(COMPANY.name)}<br>${datum}</td><td></td><td></td></tr>
    </tbody></table>
  `);

  await ulozPdf(strany, `Montazni_dokumentace_${nazevSouboru(n)}.pdf`);
}

// ─── List výpočtu rizika (ČSN EN 62305-2 ed. 2) ──────────────────────────────
const najdi = (seznam, k) => seznam.find(x => x.k === k)?.t || "";
export async function vytvorListRizika({ navrh: n }) {
  const datum = new Date().toLocaleDateString("cs-CZ");
  const { rizVst: v, lpsRiz, riz, postup } = vstupyRizika(n);
  const strany = [];
  const hlava = (nazev) => `<div class="hl"><div><b>${esc(COMPANY.name)}</b><br><span>${esc(COMPANY.addressLine)}, ${esc(COMPANY.city)} · IČO ${esc(COMPANY.ico)}</span></div><div style="text-align:right"><b>${esc(nazev)}</b><br><span>${esc(n.nazev)} · ${esc(n.zakaznik)}</span></div></div>`;
  const pata = () => `<div class="pata"><span>List výpočtu rizika – ČSN EN 62305-2 ed. 2 · ${esc(n.nazev)}</span><span>${datum} · strana {S}/{N}</span></div>`;
  const stranka = (nazev, obsah) => strany.push(`<div class="str">${hlava(nazev)}${obsah}${pata()}</div>`);
  const ptaTxt = rz.PTA.filter(x => (v.ptaOpatreni || []).includes(x.id)).map(x => x.t).join(", ") || "žádné opatření";
  const ptuTxt = rz.PTU.filter(x => (v.ptuOpatreni || []).includes(x.id)).map(x => x.t).join(", ") || "bez ochranných opatření";
  const PTAk = rz.PTA.filter(x => (v.ptaOpatreni || []).includes(x.id)).reduce((p, x) => p * x.k, 1);
  const PTUk = rz.PTU.filter(x => (v.ptuOpatreni || []).includes(x.id)).reduce((p, x) => p * x.k, 1);
  const k = (Number(v.nzNt) || 1) * (Number(v.tz) || 8760) / 8760;
  const H3 = 3 * Number(v.H);
  const radek = (nazev, ozn, hodn, zdroj) => `<tr><td>${nazev}</td><td>${ozn}</td><td class="r">${hodn}</td><td>${zdroj}</td></tr>`;

  // 1 — vstupní údaje
  stranka("List výpočtu rizika", `
    <h1>List výpočtu rizika</h1>
    <div style="font-size:14px;margin-bottom:10px">Ochrana před bleskem – řízení rizika podle ČSN EN 62305-2 ed. 2 · riziko R1 (ztráty na lidských životech)</div>
    <table style="margin-bottom:10px"><tbody>
      <tr><th style="width:30%">Objekt</th><td>${esc(n.zakaznik || n.nazev)}</td></tr>
      <tr><th>Zpracovatel / datum</th><td>${esc(COMPANY.name)} · ${datum}</td></tr>
      <tr><th>Uvažovaná stavba</th><td>Stavba jako jedna zóna Z<sub>S</sub>, ${cislo(v.L)} × ${cislo(v.W)} m, výška ${cislo(v.H)} m (hřeben)</td></tr>
    </tbody></table>
    <h3>Stavba a okolí</h3>
    <table><thead><tr><th>Parametr</th><th>Označení</th><th class="r">Hodnota</th><th>Zdroj</th></tr></thead><tbody>
      ${radek("Hustota úderů blesku do země", "N<sub>G</sub>", `${cislo(v.ng, 1)} /km²/rok`, "mapa ČHMÚ / A.1")}
      ${radek("Rozměry stavby", "L, W, H", `${cislo(v.L)}; ${cislo(v.W)}; ${cislo(v.H)} m`, "zaměření")}
      ${radek(`Poloha stavby – ${esc(najdi(rz.CD, Number(v.cd)))}`, "C<sub>D</sub>", v.cd, "tab. A.1")}
      ${radek(`Ochrana před bleskem – ${lpsRiz ? `LPS třídy ${lpsRiz}` : "bez LPS"}`, "P<sub>B</sub>", riz.PB, "tab. B.2")}
      ${radek(`Opatření proti dotyk./krok. napětí – ${esc(ptaTxt)}`, "P<sub>TA</sub>", PTAk, "tab. B.1")}
      ${radek(`SPD na vstupu vedení – ${v.spd ? `LPL ${v.spd}` : "bez SPD"}`, "P<sub>EB</sub>", riz.PEB, "tab. B.7")}
      ${radek(`Opatření proti dotyk. napětí (vedení) – ${esc(ptuTxt)}`, "P<sub>TU</sub>", PTUk, "tab. B.6")}
    </tbody></table>
    <h3>Ztráty v zóně (L1)</h3>
    <table><thead><tr><th>Parametr</th><th>Označení</th><th class="r">Hodnota</th><th>Zdroj</th></tr></thead><tbody>
      ${radek(`Povrch podlahy – ${esc(najdi(rz.RT_POVRCH, Number(v.rtPovrch)))}`, "r<sub>t</sub>", exp10(v.rtPovrch), "tab. C.3")}
      ${radek(`Protipožární opatření – ${esc(najdi(rz.RP, Number(v.rp)))}`, "r<sub>p</sub>", v.rp, "tab. C.4")}
      ${radek(`Riziko požáru – ${esc(najdi(rz.RF, Number(v.rf)))}`, "r<sub>f</sub>", exp10(v.rf), "tab. C.5")}
      ${radek(`Zvláštní nebezpečí – ${esc(najdi(rz.HZ, Number(v.hz)))}`, "h<sub>z</sub>", v.hz, "tab. C.6")}
      ${radek("Úraz elektrickým proudem (D1)", "L<sub>T</sub>", "10⁻²", "tab. C.2")}
      ${radek(`Hmotná škoda (D2) – ${esc(najdi(rz.LF, Number(v.lf)))}`, "L<sub>F</sub>", exp10(v.lf), "tab. C.2")}
      ${radek("Osoby v zóně a doba přítomnosti", "n<sub>z</sub>/n<sub>t</sub> · t<sub>z</sub>/8 760", cislo(k, 2), "C.3")}
    </tbody></table>
    <h3>Připojená vedení</h3>
    <table><thead><tr><th>Vedení</th><th class="r">L<sub>L</sub> (m)</th><th class="r">C<sub>I</sub></th><th class="r">C<sub>T</sub></th><th class="r">C<sub>E</sub></th><th>Stínění (C<sub>LD</sub>)</th><th class="r">U<sub>W</sub></th><th class="r">P<sub>LD</sub></th></tr></thead><tbody>
      ${riz.vedeni.map(x => `<tr><td>${esc(x.nazev)}</td><td class="r">${cislo(x.delka, 0)}</td><td class="r">${x.ci}</td><td class="r">${x.ct}</td><td class="r">${x.ce}</td><td>${esc((rz.STINENI.find(s => s.id === x.stineni) || rz.STINENI[0]).t)} (${(rz.STINENI.find(s => s.id === x.stineni) || rz.STINENI[0]).cld})</td><td class="r">${String(x.uw).replace(".", ",")} kV</td><td class="r">${x.PLD}</td></tr>`).join("")}
    </tbody></table>
    <div style="font-size:10px;color:#475569;margin-top:4px">C<sub>I</sub> tab. A.2, C<sub>T</sub> tab. A.3, C<sub>E</sub> tab. A.4, C<sub>LD</sub> tab. B.4, P<sub>LD</sub> tab. B.8.</div>
  `);

  // 2 — výpočet
  const f = (x) => exp10(x);
  stranka("Výpočet", `
    <h2>Výpočet součástí rizika</h2>
    <h3>Počet nebezpečných událostí (příloha A)</h3>
    <table><tbody>
      <tr><td style="width:62%">A<sub>D</sub> = L·W + 2·(3H)·(L + W) + π·(3H)² = ${cislo(v.L)}·${cislo(v.W)} + 2·${cislo(H3)}·(${cislo(v.L)} + ${cislo(v.W)}) + π·${cislo(H3)}²</td><td class="r">${cislo(riz.AD, 0)} m²</td><td>(A.2)</td></tr>
      <tr><td>N<sub>D</sub> = N<sub>G</sub>·A<sub>D</sub>·C<sub>D</sub>·10⁻⁶ = ${cislo(v.ng, 1)}·${cislo(riz.AD, 0)}·${v.cd}·10⁻⁶</td><td class="r">${f(riz.ND)} /rok</td><td>(A.4)</td></tr>
      ${riz.vedeni.map(x => `
        <tr><td>${esc(x.nazev)}: A<sub>L</sub> = 40·L<sub>L</sub> = 40·${cislo(x.delka, 0)}</td><td class="r">${cislo(x.AL, 0)} m²</td><td>(A.9)</td></tr>
        <tr><td>${esc(x.nazev)}: N<sub>L</sub> = N<sub>G</sub>·A<sub>L</sub>·C<sub>I</sub>·C<sub>E</sub>·C<sub>T</sub>·10⁻⁶ = ${cislo(v.ng, 1)}·${cislo(x.AL, 0)}·${x.ci}·${x.ce}·${x.ct}·10⁻⁶</td><td class="r">${f(x.NL)} /rok</td><td>(A.8)</td></tr>
        ${x.NDJ ? `<tr><td>${esc(x.nazev)}: N<sub>DJ</sub> (sousední stavba)</td><td class="r">${f(x.NDJ)} /rok</td><td>(A.5)</td></tr>` : ""}`).join("")}
    </tbody></table>
    <h3>Pravděpodobnosti škody (příloha B)</h3>
    <table><tbody>
      <tr><td style="width:62%">P<sub>A</sub> = P<sub>TA</sub>·P<sub>B</sub> = ${PTAk}·${riz.PB}</td><td class="r">${riz.PA}</td><td>(B.1)</td></tr>
      <tr><td>P<sub>B</sub> (LPS ${lpsRiz || "žádný"})</td><td class="r">${riz.PB}</td><td>tab. B.2</td></tr>
      ${riz.vedeni.map(x => `
        <tr><td>${esc(x.nazev)}: P<sub>U</sub> = P<sub>TU</sub>·P<sub>EB</sub>·P<sub>LD</sub>·C<sub>LD</sub> = ${PTUk}·${riz.PEB}·${x.PLD}·${(rz.STINENI.find(s => s.id === x.stineni) || rz.STINENI[0]).cld}</td><td class="r">${x.PU}</td><td>(B.8)</td></tr>
        <tr><td>${esc(x.nazev)}: P<sub>V</sub> = P<sub>EB</sub>·P<sub>LD</sub>·C<sub>LD</sub></td><td class="r">${x.PV}</td><td>(B.9)</td></tr>`).join("")}
    </tbody></table>
    <h3>Ztráty (příloha C)</h3>
    <table><tbody>
      <tr><td style="width:62%">L<sub>A</sub> = L<sub>U</sub> = r<sub>t</sub>·L<sub>T</sub>·n<sub>z</sub>/n<sub>t</sub>·t<sub>z</sub>/8 760 = ${exp10(v.rtPovrch)}·10⁻²·${cislo(k, 2)}</td><td class="r">${f(riz.LA)}</td><td>(C.1), (C.2)</td></tr>
      <tr><td>L<sub>B</sub> = L<sub>V</sub> = r<sub>p</sub>·r<sub>f</sub>·h<sub>z</sub>·L<sub>F</sub>·n<sub>z</sub>/n<sub>t</sub>·t<sub>z</sub>/8 760 = ${v.rp}·${exp10(v.rf)}·${v.hz}·${exp10(v.lf)}·${cislo(k, 2)}</td><td class="r">${f(riz.LB)}</td><td>(C.3)</td></tr>
    </tbody></table>
    <h3>Součásti rizika (rovnice 6, 7, 10, 11)</h3>
    <table><thead><tr><th>Součást</th><th>Výpočet</th><th class="r">Hodnota</th><th class="r">Podíl</th></tr></thead><tbody>
      <tr><td>R<sub>A</sub></td><td>N<sub>D</sub>·P<sub>A</sub>·L<sub>A</sub></td><td class="r">${f(riz.RA)}</td><td class="r">${cislo(100 * riz.RA / (riz.R1 || 1), 1)} %</td></tr>
      <tr><td>R<sub>B</sub></td><td>N<sub>D</sub>·P<sub>B</sub>·L<sub>B</sub></td><td class="r">${f(riz.RB)}</td><td class="r">${cislo(100 * riz.RB / (riz.R1 || 1), 1)} %</td></tr>
      <tr><td>R<sub>U</sub></td><td>Σ (N<sub>L</sub> + N<sub>DJ</sub>)·P<sub>U</sub>·L<sub>U</sub></td><td class="r">${f(riz.RU)}</td><td class="r">${cislo(100 * riz.RU / (riz.R1 || 1), 1)} %</td></tr>
      <tr><td>R<sub>V</sub></td><td>Σ (N<sub>L</sub> + N<sub>DJ</sub>)·P<sub>V</sub>·L<sub>V</sub></td><td class="r">${f(riz.RV)}</td><td class="r">${cislo(100 * riz.RV / (riz.R1 || 1), 1)} %</td></tr>
      <tr><th>R1</th><th>R<sub>A</sub> + R<sub>B</sub> + R<sub>U</sub> + R<sub>V</sub></th><th class="r ${riz.vyhovuje ? "ok" : "ne"}">${f(riz.R1)}</th><th class="r">100 %</th></tr>
    </tbody></table>
  `);

  // 3 — postup normy a závěr
  stranka("Vyhodnocení", `
    <h2>Vyhodnocení a výběr ochranných opatření</h2>
    <table style="margin-bottom:10px"><tbody>
      <tr><th style="width:45%">Přípustné riziko R<sub>T</sub> (tab. 4, L1)</th><td>10⁻⁵ /rok</td></tr>
      <tr><th>Riziko s navrženou ochranou R1</th><td class="${riz.vyhovuje ? "ok" : "ne"}">${f(riz.R1)} ${riz.vyhovuje ? "≤" : ">"} R<sub>T</sub></td></tr>
    </tbody></table>
    <h3>Postup výběru ochranných opatření (obr. 1 normy)</h3>
    <table><thead><tr><th>Krok</th><th class="r">R<sub>A</sub> + R<sub>B</sub></th><th class="r">R<sub>U</sub> + R<sub>V</sub></th><th class="r">R1</th><th>R1 ≤ R<sub>T</sub></th></tr></thead><tbody>
      ${postup.kroky.map(x => `<tr><td>${esc(x.krok)}</td><td class="r">${f(x.RA + x.RB)}</td><td class="r">${f(x.RU + x.RV)}</td><td class="r"><b>${f(x.R1)}</b></td><td class="${x.vyhovuje ? "ok" : "ne"}">${x.vyhovuje ? "ano" : "ne"}</td></tr>`).join("")}
    </tbody></table>
    <table style="margin-top:8px"><tbody>
      <tr><th style="width:45%">Ochrana požadovaná normou</th><td>${postup.lps ? `LPS třídy ${postup.lps}` : (postup.kroky.length > 1 ? "LPS není z hlediska rizika nutný" : "ochrana není nutná")}${postup.spd ? `, SPD na vstupu vedení pro LPL ${postup.spd}` : ""}</td></tr>
      <tr><th>Navržené řešení</th><td>${lpsRiz ? `LPS třídy ${lpsRiz}` : "bez LPS"}${riz.spd ? `, SPD pro LPL ${riz.spd}` : ""}</td></tr>
    </tbody></table>
    <h3>Závěr</h3>
    <div style="font-size:13px;line-height:1.5">
      Pro uvažovanou stavbu vychází riziko ztrát na lidských životech s navrženou ochranou
      (${lpsRiz ? `LPS třídy ${lpsRiz}` : "bez LPS"}, ${v.spd ? `SPD na vstupu vedení pro LPL ${v.spd}` : "bez SPD na vstupu vedení"})
      <b class="${riz.vyhovuje ? "ok" : "ne"}">R1 = ${f(riz.R1)}</b>, což je ${riz.vyhovuje ? "méně nebo rovno" : "více než"} přípustné riziko R<sub>T</sub> = 10⁻⁵.
      ${riz.vyhovuje ? "Navržená ochranná opatření vyhovují." : `Navržená ochrana nevyhovuje – podle postupu normy je nutná ochrana: <b>${postup.lps ? `LPS třídy ${postup.lps}` : "bez LPS"}${postup.spd ? `, SPD pro LPL ${postup.spd}` : ""}</b>.`}
    </div>
    <div style="font-size:10px;color:#475569;margin-top:10px">Výpočet podle ČSN EN 62305-2 ed. 2, kap. 6 a přílohy A–C; stavba posouzena jako jedna zóna. Součásti R<sub>C</sub>, R<sub>M</sub>, R<sub>W</sub>, R<sub>Z</sub> se pro R1 uvažují pouze u staveb s rizikem výbuchu, nemocnic a staveb, kde porucha vnitřních systémů ohrožuje lidské životy. Ekonomické riziko R4 není součástí výpočtu.</div>
    ${(() => {
      const lpl = v.spd || ({ I: "I", II: "II", III: "III-IV", IV: "III-IV" }[lpsRiz]) || "III-IV";
      const sh = soupis(n);
      const sp = rz.navrhSpd(v, lpl, { blizkoFve: sh.blizko, maFve: sh.panelu > 0 });
      return `<h3>Přepěťové ochrany (SPD) – LPL ${lpl}${v.spd ? "" : " (zatím nejsou v posuzovaném návrhu)"}</h3>
        <table><thead><tr><th>Vedení / část</th><th>Typ SPD</th><th>Parametry</th><th>Umístění</th></tr></thead><tbody>
          ${sp.polozky.map(p => `<tr><td>${esc(p.nazev)}</td><td>${esc(p.typ)}</td><td>${esc(p.text)}</td><td>${esc(p.misto)}</td></tr>`).join("")}
        </tbody></table>
        <div style="font-size:10px;color:#475569;margin-top:4px">Dimenzování podle ČSN EN 62305-1 ed. 2, příloha E: bleskový proud ${sp.I} kA, k<sub>e</sub> = 0,5/n = ${cislo(sp.ke, 3)} pro n = ${sp.n} vstupujících sítí (E.4), dělení mezi vodiče (E.5), porovnáno s úderem do vedení (tab. E.2, E.3).</div>`;
    })()}
    <table style="margin-top:20px"><tbody>
      <tr><th style="width:50%">Zpracoval</th><th>Podpis</th></tr>
      <tr><td style="height:60px">${esc(COMPANY.name)}<br>${datum}</td><td></td></tr>
    </tbody></table>
  `);

  await ulozPdf(strany, `Vypocet_rizika_${nazevSouboru(n)}.pdf`);
}
