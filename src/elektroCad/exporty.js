// ─── Elektro CAD: výstupy PDF, DXF (AutoCAD) a Word ──────────────────────────
// Všechny výstupy kreslí stejné primitivy jako editor (znacky.js), takže
// výkres v PDF i v AutoCADu odpovídá obrazovce. DXF je ve verzi R12 (AC1009),
// kterou otevře každý AutoCAD i DraftSight/BricsCAD; české znaky jdou jako \U+XXXX.

import { FORMATY, VRSTVY, ZNACKY, vsechnyPrimitivy, radkyPopisku, popisKabelu } from "./znacky.js";
import { spocitejVyvody, bilance, cislo, ULOZENI } from "./vypocty.js";

const PISMO_EM = 1 / 0.72; // výška písma (em) vůči výšce velkých písmen
const CARKY = { carka: [3, 1.5], cerch: [6, 1.2, 0.6, 1.2] };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const n2 = (x) => Math.round(x * 1000) / 1000;

// ── SVG (obrazovka, náhled, obrázek do Wordu) ──
export function svgObsah(prim, { barva = "#111" } = {}) {
  const o = [];
  for (const p of prim) {
    const w = p.w || 0.25;
    const dash = CARKY[p.s] ? ` stroke-dasharray="${CARKY[p.s].join(" ")}"` : "";
    if (p.k === "l") o.push(`<line x1="${n2(p.p[0])}" y1="${n2(p.p[1])}" x2="${n2(p.p[2])}" y2="${n2(p.p[3])}" stroke="${barva}" stroke-width="${w}"${dash} stroke-linecap="round"/>`);
    else if (p.k === "pl") {
      const b = p.b.map(([x, y]) => `${n2(x)},${n2(y)}`).join(" ");
      o.push(`<${p.z ? "polygon" : "polyline"} points="${b}" fill="${p.f ? barva : "none"}" stroke="${barva}" stroke-width="${w}"${dash} stroke-linejoin="round"/>`);
    } else if (p.k === "c") o.push(`<circle cx="${n2(p.x)}" cy="${n2(p.y)}" r="${n2(p.r)}" fill="${p.f ? barva : "none"}" stroke="${barva}" stroke-width="${w}"/>`);
    else if (p.k === "t") {
      const anchor = p.a === "c" ? "middle" : p.a === "r" ? "end" : "start";
      const rot = p.rot ? ` transform="rotate(${-p.rot} ${n2(p.x)} ${n2(p.y)})"` : "";
      o.push(`<text x="${n2(p.x)}" y="${n2(p.y)}" font-size="${n2(p.h * PISMO_EM)}" text-anchor="${anchor}" fill="${barva}" font-family="Arial, Helvetica, sans-serif"${rot}>${esc(p.t)}</text>`);
    }
  }
  return o.join("");
}

export function svgVykresu(projekt, firma) {
  const f = FORMATY[projekt.format] || FORMATY.A4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f.w}mm" height="${f.h}mm" viewBox="0 0 ${f.w} ${f.h}"><rect width="${f.w}" height="${f.h}" fill="#fff"/>${svgObsah(vsechnyPrimitivy(projekt, firma))}</svg>`;
}

export async function pngVykresu(projekt, firma, pxNaMm = 6) {
  const f = FORMATY[projekt.format] || FORMATY.A4;
  const svg = svgVykresu(projekt, firma);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement("canvas");
  c.width = Math.round(f.w * pxNaMm); c.height = Math.round(f.h * pxNaMm);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  return { blob, w: c.width, h: c.height };
}

export function stahni(blob, nazev) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nazev;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const nazevSouboru = (projekt, pripona) => `${String(projekt.nazev || "schema").replace(/[^\p{L}\p{N}_-]+/gu, "_")}.${pripona}`;

// ── PDF ──
let fontB64 = null;
async function nactiFont() {
  if (fontB64) return fontB64;
  const buf = await fetch("/fonts/DejaVuSans.ttf").then(r => { if (!r.ok) throw new Error("Písmo DejaVuSans nenalezeno"); return r.arrayBuffer(); });
  let s = ""; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  fontB64 = btoa(s);
  return fontB64;
}

function kresliDoPdf(doc, prim) {
  for (const p of prim) {
    doc.setLineWidth(p.w || 0.25);
    if (CARKY[p.s]) doc.setLineDashPattern(CARKY[p.s], 0); else doc.setLineDashPattern([], 0);
    if (p.k === "l") doc.line(p.p[0], p.p[1], p.p[2], p.p[3]);
    else if (p.k === "pl") {
      const [x0, y0] = p.b[0];
      const segs = p.b.slice(1).map(([x, y], i) => [x - p.b[i][0], y - p.b[i][1]]);
      doc.lines(segs, x0, y0, [1, 1], p.f ? "FD" : "S", !!p.z);
    } else if (p.k === "c") doc.circle(p.x, p.y, p.r, p.f ? "FD" : "S");
    else if (p.k === "t") {
      doc.setLineDashPattern([], 0);
      doc.setFontSize((p.h * PISMO_EM) / 0.3528);
      const w = doc.getTextWidth(p.t);
      const posun = p.a === "c" ? w / 2 : p.a === "r" ? w : 0;
      if (p.rot === 90) doc.text(p.t, p.x, p.y + posun, { angle: 90 });
      else doc.text(p.t, p.x - posun, p.y);
    }
  }
  doc.setLineDashPattern([], 0);
}

export async function exportPdf(projekt, firma, { sVypocty = true } = {}) {
  const { jsPDF } = await import("jspdf");
  const f = FORMATY[projekt.format] || FORMATY.A4;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [f.w, f.h], compress: true });
  doc.addFileToVFS("DejaVuSans.ttf", await nactiFont());
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.setFont("DejaVu", "normal");
  doc.setDrawColor(0); doc.setFillColor(0); doc.setTextColor(0);
  doc.setProperties({ title: projekt.razitko?.nazevVykresu || projekt.nazev || "Schéma", creator: "ProudOS – Elektro CAD", author: firma?.name || "" });
  kresliDoPdf(doc, vsechnyPrimitivy(projekt, firma));
  if (sVypocty) protokolDoPdf(doc, projekt, firma);
  doc.save(nazevSouboru(projekt, "pdf"));
}

// Protokol výpočtů na stránkách A4 na výšku
function protokolDoPdf(doc, projekt, firma) {
  const vyv = spocitejVyvody(projekt), bil = bilance(projekt);
  if (!vyv.length && !bil.radky.length) return;
  const W = 210, H = 297, m = 15;
  let y = 0;
  const nova = () => {
    doc.addPage([W, H], "portrait"); y = m + 4;
    doc.setFontSize(8); doc.setTextColor(90);
    doc.text(`${firma?.name || ""} · ${projekt.razitko?.investor || ""} · ${projekt.razitko?.cisloZak || ""}`, m, 10);
    doc.setTextColor(0);
  };
  const nadpis = (t) => { if (y > H - 40) nova(); doc.setFontSize(12); doc.text(t, m, y + 4); y += 9; };
  const tabulka = (hlava, radky, sirky) => {
    const vyska = 5.2;
    const radek = (bunky, tucne) => {
      if (y > H - m - vyska) nova();
      let x = m;
      doc.setFontSize(7.4);
      if (tucne) { doc.setFillColor(232, 236, 241); doc.rect(m, y, sirky.reduce((a, b) => a + b, 0), vyska, "F"); }
      bunky.forEach((b, i) => {
        const t = String(b ?? "");
        const max = sirky[i] - 1.6;
        let s = t; while (s.length > 1 && doc.getTextWidth(s) > max) s = s.slice(0, -1);
        doc.setTextColor(t === "NEVYHOVUJE" ? 180 : 0, t === "VYHOVUJE" ? 120 : 0, 0);
        doc.text(s, x + 0.8, y + 3.7);
        x += sirky[i];
      });
      doc.setTextColor(0);
      doc.setDrawColor(200); doc.setLineWidth(0.15); doc.line(m, y + vyska, x, y + vyska); doc.setDrawColor(0);
      y += vyska;
    };
    radek(hlava, true);
    radky.forEach(r => radek(r));
    y += 5;
  };
  nova();
  doc.setFontSize(15); doc.text("Protokol výpočtů elektroinstalace", m, y + 2); y += 8;
  doc.setFontSize(9);
  const r = projekt.razitko || {}, nap = projekt.napajeni || {};
  [[`Akce: ${r.nazevVykresu || projekt.nazev || ""}`], [`Investor: ${[r.investor, r.adresa].filter(Boolean).join(", ")}`], [`Napájení: ${nap.popis || "TN-C-S 3/PEN ~50 Hz 230/400 V"}, Zs v napájecím bodě ${cislo(nap.Zs || 0.4, 3)} Ω`], [`Dovolený úbytek napětí: ${cislo(nap.maxDu || 3, 1)} % (AC), DC vývody 1 %`]].forEach(([t]) => { doc.text(t, m, y); y += 4.6; });
  y += 3;
  if (vyv.length) {
    nadpis("1. Dimenzování vedení a koordinace s jištěním");
    tabulka(["Vývod", "Kabel", "Uložení", "L [m]", "Ib [A]", "In [A]", "Iz [A]", "Ib≤In≤Iz"],
      vyv.map(v => [v.nazev, popisKabelu(v.kabel), v.kabel.ulozeni, cislo(v.L, 1), cislo(v.Ib, 1), v.In ? cislo(v.In, 0) : "–", cislo(v.Iz, 1), v.koordinace == null ? "–" : v.koordinace ? "VYHOVUJE" : "NEVYHOVUJE"]),
      [38, 30, 16, 14, 16, 16, 16, 34]);
    nadpis("2. Úbytek napětí");
    tabulka(["Vývod", "Soustava", "ΔU [V]", "ΔU [%]", "ΔU celk. [%]", "Limit [%]", "Výsledek"],
      vyv.map(v => [v.nazev, v.soustava === "3f" ? "3f 400 V" : v.soustava === "DC" ? `DC ${v.kabel.Udc || ""} V` : "1f 230 V", cislo(v.dU, 2), cislo(v.dUp, 2), cislo(v.dUcelk, 2), cislo(v.maxDu, 1), v.uOk ? "VYHOVUJE" : "NEVYHOVUJE"]),
      [44, 24, 18, 18, 24, 18, 34]);
    const ac = vyv.filter(v => v.soustava !== "DC");
    if (ac.length) {
      nadpis("3. Impedance smyčky a samočinné odpojení (TN, ČSN 33 2000-4-41)");
      tabulka(["Vývod", "Přístroj", "Zs [Ω]", "Ik1 [A]", "Ia [A]", "t [s]", "Výsledek"],
        ac.map(v => [v.nazev, v.pristroj ? `${v.pristroj.v?.ozn || ""} ${v.pristroj.v?.char || ""}${v.In || ""}` : "–", cislo(v.Zs, 3), cislo(v.Ik1, 0), cislo(v.Ia, 0), cislo(v.casLimit, 1), v.odpojeni == null ? "–" : v.odpojeni ? "VYHOVUJE" : "NEVYHOVUJE"]),
        [44, 28, 18, 20, 20, 14, 36]);
    }
  }
  if (bil.radky.length) {
    nadpis("4. Bilance příkonu");
    tabulka(["Spotřebič", "Pi [kW]", "β", "Pp [kW]"], bil.radky.map(b => [b.nazev, cislo(b.Pi, 2), cislo(b.beta, 2), cislo(b.Pi * b.beta, 2)]), [90, 30, 25, 35]);
    doc.setFontSize(9);
    [`Instalovaný příkon Pi = ${cislo(bil.Pi, 2)} kW, soudobost objektu β = ${cislo(bil.betaC, 2)}, soudobý příkon Pp = ${cislo(bil.Pp, 2)} kW`,
      `Výpočtový proud: 3f ${cislo(bil.Ip3, 1)} A (doporučený hlavní jistič ${bil.jistic3 ? "B" + bil.jistic3 + "/3" : "–"}), 1f ${cislo(bil.Ip1, 1)} A`].forEach(t => { doc.text(t, m, y); y += 4.6; });
  }
}

// ── DXF R12 ──
const dxfText = (s) => String(s ?? "").replace(/[^\x20-\x7e]/g, c => "\\U+" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"));
const LT = { plna: "CONTINUOUS", carka: "DASHED", cerch: "DASHDOT" };

export function dxfVykresu(projekt, firma) {
  const f = FORMATY[projekt.format] || FORMATY.A4;
  const prim = vsechnyPrimitivy(projekt, firma);
  const Y = (y) => n2(f.h - y);
  const o = [];
  const g = (kod, hod) => o.push(String(kod), String(hod));
  // HEADER
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$DWGCODEPAGE"); g(3, "ANSI_1250");
  g(9, "$INSBASE"); g(10, 0); g(20, 0); g(30, 0);
  g(9, "$EXTMIN"); g(10, 0); g(20, 0); g(30, 0);
  g(9, "$EXTMAX"); g(10, f.w); g(20, f.h); g(30, 0);
  g(9, "$LIMMIN"); g(10, 0); g(20, 0);
  g(9, "$LIMMAX"); g(10, f.w); g(20, f.h);
  g(9, "$LTSCALE"); g(40, 1);
  g(9, "$MEASUREMENT"); g(70, 1);
  g(0, "ENDSEC");
  // TABLES
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 3);
  const ltyp = (jm, popis, vzor) => {
    g(0, "LTYPE"); g(2, jm); g(70, 0); g(3, popis); g(72, 65); g(73, vzor.length); g(40, n2(vzor.reduce((a, b) => a + Math.abs(b), 0)));
    vzor.forEach(v => g(49, v));
  };
  ltyp("CONTINUOUS", "Solid line", []);
  ltyp("DASHED", "__ __ __", [3, -1.5]);
  ltyp("DASHDOT", "__ . __ .", [6, -1.2, 0.01, -1.2]);
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LAYER"); g(70, Object.keys(VRSTVY).length + 1);
  g(0, "LAYER"); g(2, "0"); g(70, 0); g(62, 7); g(6, "CONTINUOUS");
  for (const [jm, v] of Object.entries(VRSTVY)) { g(0, "LAYER"); g(2, jm); g(70, 0); g(62, v.barva); g(6, "CONTINUOUS"); }
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "STYLE"); g(70, 1);
  g(0, "STYLE"); g(2, "STANDARD"); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, "arial.ttf"); g(4, "");
  g(0, "ENDTAB");
  g(0, "ENDSEC");
  // BLOCKS (prázdné)
  g(0, "SECTION"); g(2, "BLOCKS"); g(0, "ENDSEC");
  // ENTITIES
  g(0, "SECTION"); g(2, "ENTITIES");
  for (const p of prim) {
    const vr = p.vr || "0", lt = LT[p.s] || "CONTINUOUS";
    if (p.k === "l") { g(0, "LINE"); g(8, vr); if (lt !== "CONTINUOUS") g(6, lt); g(10, n2(p.p[0])); g(20, Y(p.p[1])); g(30, 0); g(11, n2(p.p[2])); g(21, Y(p.p[3])); g(31, 0); }
    else if (p.k === "pl") {
      if (p.f && p.b.length === 3) {
        g(0, "SOLID"); g(8, vr);
        const b = [p.b[0], p.b[1], p.b[2], p.b[2]];
        b.forEach(([x, y], i) => { g(10 + i, n2(x)); g(20 + i, Y(y)); g(30 + i, 0); });
      } else {
        g(0, "POLYLINE"); g(8, vr); if (lt !== "CONTINUOUS") g(6, lt); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, p.z ? 1 : 0);
        for (const [x, y] of p.b) { g(0, "VERTEX"); g(8, vr); g(10, n2(x)); g(20, Y(y)); g(30, 0); }
        g(0, "SEQEND"); g(8, vr);
      }
    } else if (p.k === "c") {
      if (p.f) { // plný bod = donut
        g(0, "POLYLINE"); g(8, vr); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1); g(40, n2(p.r)); g(41, n2(p.r));
        g(0, "VERTEX"); g(8, vr); g(10, n2(p.x - p.r / 2)); g(20, Y(p.y)); g(30, 0); g(42, 1);
        g(0, "VERTEX"); g(8, vr); g(10, n2(p.x + p.r / 2)); g(20, Y(p.y)); g(30, 0); g(42, 1);
        g(0, "SEQEND"); g(8, vr);
      } else { g(0, "CIRCLE"); g(8, vr); g(10, n2(p.x)); g(20, Y(p.y)); g(30, 0); g(40, n2(p.r)); }
    } else if (p.k === "t" && p.t) {
      g(0, "TEXT"); g(8, vr); g(10, n2(p.x)); g(20, Y(p.y)); g(30, 0); g(40, n2(p.h)); g(1, dxfText(p.t)); g(7, "STANDARD");
      if (p.rot) g(50, p.rot);
      const hj = p.a === "c" ? 1 : p.a === "r" ? 2 : 0;
      if (hj) { g(72, hj); g(11, n2(p.x)); g(21, Y(p.y)); g(31, 0); }
    }
  }
  g(0, "ENDSEC"); g(0, "EOF");
  return o.join("\r\n") + "\r\n";
}

export function exportDxf(projekt, firma) {
  stahni(new Blob([dxfVykresu(projekt, firma)], { type: "application/dxf" }), nazevSouboru(projekt, "dxf"));
}

// ── Word (technická zpráva) ──
const x = (s) => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const run = (t, { b, sz, barva } = {}) => `<w:r><w:rPr>${b ? "<w:b/>" : ""}${barva ? `<w:color w:val="${barva}"/>` : ""}${sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : ""}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
const odst = (t, o = {}) => `<w:p>${o.styl ? `<w:pPr><w:pStyle w:val="${o.styl}"/>${o.zarov ? `<w:jc w:val="${o.zarov}"/>` : ""}</w:pPr>` : o.zarov ? `<w:pPr><w:jc w:val="${o.zarov}"/></w:pPr>` : ""}${String(t ?? "").split("\n").map((r, i) => (i ? "<w:r><w:br/></w:r>" : "") + run(r, o)).join("")}</w:p>`;
const nadp = (t, uroven = 1) => odst(t, { styl: `Nadpis${uroven}` });
function wTabulka(hlava, radky, sirky) {
  const cell = (t, w, hl) => {
    const s = String(t ?? "");
    const barva = s === "NEVYHOVUJE" ? "B42318" : s === "VYHOVUJE" ? "1E7A3C" : null;
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${hl ? '<w:shd w:val="clear" w:color="auto" w:fill="E8ECF1"/>' : ""}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>${run(s, { b: hl, sz: 17, barva })}</w:p></w:tc>`;
  };
  const grid = sirky.map(w => `<w:gridCol w:w="${w}"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblStyle w:val="Mrizka"/><w:tblW w:w="${sirky.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="A0A7B0"/>`).join("")}</w:tblBorders><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${hlava.map((h, i) => cell(h, sirky[i], true)).join("")}</w:tr>`
    + radky.map(r => `<w:tr>${r.map((c, i) => cell(c, sirky[i])).join("")}</w:tr>`).join("") + `</w:tbl>` + odst("");
}

const DRUH = (p) => ZNACKY[p.typ]?.nazev || p.typ;

export async function exportWord(projekt, firma) {
  const { default: PizZip } = await import("pizzip");
  const r = projekt.razitko || {}, nap = projekt.napajeni || {}, z = projekt.zprava || {};
  const vyv = spocitejVyvody(projekt), bil = bilance(projekt);
  const prvky = (projekt.prvky || []).filter(p => !["svorka", "uzemneni"].includes(p.typ));
  const telo = [];
  telo.push(odst(firma?.name || "", { b: true, sz: 20, zarov: "right" }));
  telo.push(odst([firma?.addressLine, firma?.city].filter(Boolean).join(", ") + (firma?.ico ? ` · IČO ${firma.ico}` : ""), { sz: 18, zarov: "right" }));
  telo.push(odst(""));
  telo.push(odst("TECHNICKÁ ZPRÁVA", { styl: "Titul" }));
  telo.push(odst(r.nazevVykresu || projekt.nazev || "", { b: true, sz: 28, zarov: "center" }));
  telo.push(odst(r.podnazev || "", { sz: 22, zarov: "center" }));
  telo.push(odst(""));
  telo.push(nadp("1. Identifikační údaje"));
  telo.push(wTabulka(["Údaj", "Hodnota"], [
    ["Akce", r.nazevVykresu || projekt.nazev], ["Investor", r.investor], ["Místo stavby", r.adresa], ["Číslo zakázky", r.cisloZak],
    ["Stupeň dokumentace", r.stupen], ["Projektant", r.projektant], ["Vypracoval", r.vypracoval], ["Zpracovatel", [firma?.name, firma?.addressLine, firma?.city].filter(Boolean).join(", ")], ["Datum", r.datum],
  ], [2800, 6200]));
  telo.push(nadp("2. Předmět dokumentace"));
  telo.push(odst(z.predmet || "Dokumentace řeší elektroinstalaci podle přiloženého schématu."));
  telo.push(nadp("3. Základní technické údaje"));
  telo.push(odst(`Napěťová soustava: ${nap.popis || "3/PEN ~50 Hz 230/400 V, TN-C-S"}`));
  telo.push(odst(z.ochrana || "Ochrana před úrazem elektrickým proudem dle ČSN 33 2000-4-41 ed. 3: základní ochrana izolací a kryty, ochrana při poruše automatickým odpojením od zdroje, doplňková ochrana proudovými chrániči s IΔn ≤ 30 mA."));
  telo.push(odst(z.vlivy || "Vnější vlivy dle ČSN 33 2000-5-51 ed. 3: prostory normální, pokud není ve výkresové části uvedeno jinak."));
  if (z.popis) { telo.push(nadp("4. Technické řešení")); telo.push(odst(z.popis)); }
  let c = z.popis ? 5 : 4;
  if (prvky.length) {
    telo.push(nadp(`${c++}. Seznam přístrojů a zařízení`));
    telo.push(wTabulka(["Ozn.", "Druh", "Výrobce / typ", "Parametry"],
      prvky.map(p => { const rad = radkyPopisku(p); const vt = [p.v?.vyrobce, p.v?.typ].filter(Boolean).join(" "); return [p.v?.ozn || "", DRUH(p), vt, rad.filter(t => t !== vt).join("; ")]; }),
      [1000, 2400, 2600, 3000]));
  }
  if (vyv.length) {
    telo.push(nadp(`${c++}. Kabely a vedení`));
    telo.push(wTabulka(["Vývod", "Kabel", "Uložení", "Délka [m]", "Jištění"],
      vyv.map(v => [v.nazev, popisKabelu(v.kabel), ULOZENI[v.kabel.ulozeni] || v.kabel.ulozeni, cislo(v.L, 1), v.pristroj ? `${v.pristroj.v?.ozn || ""} ${v.pristroj.v?.char || ""}${v.In || ""}` : "–"]),
      [2000, 1700, 3000, 1000, 1300]));
    telo.push(nadp(`${c++}. Výpočty`));
    telo.push(nadp("Dimenzování vedení a koordinace s jištěním (ČSN 33 2000-5-52, ČSN 33 2000-4-43)", 2));
    telo.push(wTabulka(["Vývod", "Ib [A]", "In [A]", "Iz [A]", "kt·ks", "Výsledek"],
      vyv.map(v => [v.nazev, cislo(v.Ib, 1), v.In ? cislo(v.In, 0) : "–", cislo(v.Iz, 1), v.iz ? cislo(v.iz.kt * v.iz.ks, 2) : "–", v.koordinace == null ? "–" : v.koordinace ? "VYHOVUJE" : "NEVYHOVUJE"]),
      [2600, 1100, 1100, 1100, 1100, 2000]));
    telo.push(nadp("Úbytek napětí", 2));
    telo.push(wTabulka(["Vývod", "ΔU [V]", "ΔU [%]", "ΔU celk. [%]", "Limit [%]", "Výsledek"],
      vyv.map(v => [v.nazev, cislo(v.dU, 2), cislo(v.dUp, 2), cislo(v.dUcelk, 2), cislo(v.maxDu, 1), v.uOk ? "VYHOVUJE" : "NEVYHOVUJE"]),
      [2600, 1100, 1100, 1300, 1000, 1900]));
    const ac = vyv.filter(v => v.soustava !== "DC");
    if (ac.length) {
      telo.push(nadp("Impedance poruchové smyčky a samočinné odpojení (ČSN 33 2000-4-41)", 2));
      telo.push(odst(`Impedance v napájecím bodě Zs = ${cislo(nap.Zs || 0.4, 3)} Ω. Podmínka Zs · Ia ≤ U0 (Ik1 ≥ Ia), U0 = ${nap.U0 || 230} V, cmin = 0,95.`, { sz: 18 }));
      telo.push(wTabulka(["Vývod", "Zs [Ω]", "Ik1 [A]", "Ia [A]", "t [s]", "Výsledek"],
        ac.map(v => [v.nazev, cislo(v.Zs, 3), cislo(v.Ik1, 0), cislo(v.Ia, 0), cislo(v.casLimit, 1), v.odpojeni == null ? "–" : v.odpojeni ? "VYHOVUJE" : "NEVYHOVUJE"]),
        [2600, 1100, 1200, 1100, 900, 2100]));
    }
  }
  if (bil.radky.length) {
    telo.push(nadp(`${c++}. Bilance příkonu`));
    telo.push(wTabulka(["Spotřebič", "Pi [kW]", "β", "Pp [kW]"], bil.radky.map(b => [b.nazev, cislo(b.Pi, 2), cislo(b.beta, 2), cislo(b.Pi * b.beta, 2)]), [4800, 1400, 1200, 1600]));
    telo.push(odst(`Instalovaný příkon Pi = ${cislo(bil.Pi, 2)} kW, soudobost β = ${cislo(bil.betaC, 2)}, soudobý příkon Pp = ${cislo(bil.Pp, 2)} kW.`));
    telo.push(odst(`Výpočtový proud Ip = ${cislo(bil.Ip3, 1)} A (3f, cos φ = ${cislo(bil.cos, 2)}), doporučený hlavní jistič před elektroměrem ${bil.jistic3 ? "B" + bil.jistic3 + "/3" : "–"}.`));
  }
  telo.push(nadp(`${c++}. Závěr`));
  telo.push(odst(z.zaver || "Elektroinstalace bude provedena podle této dokumentace, platných norem ČSN a pokynů výrobců použitých zařízení. Před uvedením do provozu bude provedena výchozí revize podle ČSN 33 2000-6 ed. 2."));
  telo.push(odst(""));
  telo.push(odst(`Vypracoval: ${r.vypracoval || r.projektant || ""}`));
  telo.push(odst(`Datum: ${r.datum || new Date().toLocaleDateString("cs-CZ")}`));

  // výkres jako obrázek na listu na šířku
  const png = await pngVykresu(projekt, firma, 7);
  const f = FORMATY[projekt.format] || FORMATY.A4;
  const maxW = 257, maxH = 170; // mm na A4 na šířku
  const k = Math.min(maxW / f.w, maxH / f.h);
  const emu = (mm) => Math.round(mm * 36000);
  const cx = emu(f.w * k), cy = emu(f.h * k);
  const portrait = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  telo.push(`<w:p><w:pPr>${portrait}</w:pPr></w:p>`);
  telo.push(odst("Příloha: " + (r.nazevVykresu || "Schéma"), { b: true }));
  telo.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Vykres"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="vykres.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdVykres"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
  const landscape = `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="425" w:footer="425" w:gutter="0"/></w:sectPr>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${telo.join("")}${landscape}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="cs-CZ"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Titul"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="600" w:after="200"/></w:pPr><w:rPr><w:b/><w:color w:val="0E3B5E"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Nadpis1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="0E3B5E"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Nadpis2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="Mrizka"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="A0A7B0"/><w:left w:val="single" w:sz="4" w:space="0" w:color="A0A7B0"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="A0A7B0"/><w:right w:val="single" w:sz="4" w:space="0" w:color="A0A7B0"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="A0A7B0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="A0A7B0"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdVykres" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/vykres.png"/></Relationships>`);
  zip.file("word/document.xml", document);
  zip.file("word/styles.xml", styles);
  zip.file("word/media/vykres.png", await png.blob.arrayBuffer());
  const blob = zip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  stahni(blob, nazevSouboru(projekt, "docx").replace(/\.docx$/, "_technicka_zprava.docx"));
}
