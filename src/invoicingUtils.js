// ─── Fakturační pomocné funkce (bez JSX) ───────────────────────────────────
// Odděleno od Invoicing.jsx čistě kvůli react-refresh pravidlu (soubor s
// komponentou smí exportovat jen komponenty) — žádná funkční změna.

// Fakturační údaje firmy (hlavička faktury + QR platba). Číslo účtu je zadané
// jako prefix-číslo/kód banky, IBAN se z něj spočítá algoritmem (mod-97,
// ISO 13616), takže nikde neopisujeme ručně a nemůže se překlepnout.
export const COMPANY = {
  name: "Jurenka elektro s.r.o.",
  addressLine: "Riegrova 394/17",
  city: "779 00 Olomouc",
  country: "Česká republika",
  ico: "19147813",
  dic: "CZ19147813",
  bankPrefix: "123",
  bankAccount: "8729910267",
  bankCode: "0100",
};

const VAT_RATES = [0, 12, 21];

function toIBAN({ bankCode, bankPrefix, bankAccount }) {
  const bban = String(bankCode).padStart(4, "0") + String(bankPrefix || "0").padStart(6, "0") + String(bankAccount).padStart(10, "0");
  const numeric = bban + "123500"; // "CZ00" -> C=12, Z=35, kontrolní 00
  let remainder = 0;
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
  const check = String(98 - remainder).padStart(2, "0");
  return `CZ${check}${bban}`;
}
export const COMPANY_IBAN = toIBAN(COMPANY);
export const COMPANY_ACCOUNT_DISPLAY = `${COMPANY.bankPrefix}-${COMPANY.bankAccount}/${COMPANY.bankCode}`;

function buildSpd({ amount, vs, msg }) {
  const parts = ["SPD*1.0", `ACC:${COMPANY_IBAN}`, `AM:${Number(amount).toFixed(2)}`, "CC:CZK"];
  if (vs) parts.push(`X-VS:${vs}`);
  if (msg) parts.push(`MSG:${msg.slice(0, 60)}`);
  return parts.join("*");
}

export const fmtKc2 = (v) => Number(v || 0).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Vzor (Money S3) má datum vždy jako DD.MM.RRRR se nulami a bez mezer
// (např. "21.07.2026") — toLocaleDateString dává "21. 7. 2026", proto ručně.
function fmtDateCzPlain(v) {
  if (!v) return "";
  const d = new Date(v.length === 10 ? v + "T00:00:00" : v);
  if (isNaN(d.getTime())) return v;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// Spočítá základ/DPH/celkem za řádek i souhrn podle sazby — používá se jak
// ve formuláři (živý náhled), tak při generování PDF.
export function computeInvoiceTotals(items) {
  const lines = (items || []).map(it => {
    const zaklad = (Number(it.qty) || 0) * (Number(it.price) || 0);
    const rate = VAT_RATES.includes(Number(it.vatRate)) ? Number(it.vatRate) : 0;
    const dph = zaklad * rate / 100;
    return { ...it, vatRate: rate, zaklad, dph, celkem: zaklad + dph };
  });
  const byRate = {};
  VAT_RATES.forEach(r => { byRate[r] = { zaklad: 0, dph: 0, celkem: 0 }; });
  lines.forEach(l => { byRate[l.vatRate].zaklad += l.zaklad; byRate[l.vatRate].dph += l.dph; byRate[l.vatRate].celkem += l.celkem; });
  const total = lines.reduce((s, l) => s + l.celkem, 0);
  const totalTax = lines.reduce((s, l) => s + l.dph, 0);
  return { lines, byRate, total, totalTax };
}

// Dynamické importy velkých knihoven (jspdf/html2canvas/qrcode) selžou, když
// prohlížeč drží starou stránku z doby před posledním nasazením — Vite dá
// nové soubory nový hash a starý (v paměti prohlížeče zapsaný) už na serveru
// neexistuje. V tom případě prohlížeč prostě potřebuje čerstvě načíst stránku.
async function safeImport(loader) {
  try {
    return await loader();
  } catch {
    const reload = confirm("Aplikace byla mezitím aktualizována a je potřeba načíst stránku znovu, než půjde PDF vygenerovat. Načíst teď?");
    if (reload) window.location.reload();
    throw new Error("Stránka potřebuje obnovit (nová verze appky) — zkus to prosím znovu po načtení.");
  }
}

// Sleva se u faktury aplikuje jen na výsledné "Celkem k úhradě" — tabulka
// položek a rozpis podle sazeb DPH zůstávají beze slevy (stejně jako v
// referenčním vzoru z Money S3).
export function getDiscountedTotal(total, discountPercent) {
  return total * (1 - (Number(discountPercent) || 0) / 100);
}

// Vrátí QR data-url + variabilní symbol pro danou fakturu — používá se jak
// pro PDF, tak pro živý náhled na obrazovce. Částka v QR kódu je už po slevě.
export async function getInvoiceQr(invoice, amountToPay) {
  const QRCodeMod = await safeImport(() => import("qrcode"));
  const QRCode = QRCodeMod.default;
  const vs = invoice.variable_symbol || (invoice.number || "").replace(/\D/g, "");
  const qrDataUrl = await QRCode.toDataURL(buildSpd({ amount: amountToPay, vs, msg: `FAKTURA ${invoice.number}` }), { width: 220, margin: 1 });
  return { vs, qrDataUrl };
}

// Čárový kód s číslem dokladu (stejně jako v pravém horním rohu vzorové
// faktury) — vykreslí se na offscreen canvas a vrátí se jako data-url.
export async function getInvoiceBarcode(number) {
  const mod = await safeImport(() => import("jsbarcode"));
  const JsBarcode = mod.default;
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, number || "0", { format: "CODE128", displayValue: false, height: 34, width: 1, margin: 0 });
  return canvas.toDataURL("image/png");
}

// ─── Absolutní rozvržení podle přesné specifikace (souřadnice v bodech/pt na
// stránce A4 595.27×841.89pt, "top" = baseline textu od horního okraje) —
// dostali jsme přesné souřadnice změřené z referenčního vzoru (Money S3),
// takže místo přibližného flexboxu pozicujeme každý prvek na milimetr přesně.
const PT = 4 / 3; // 1 bod (pt) při 96dpi = 4/3 px
const PAGE_W_PT = 595.27;
const PAGE_H_PT = 841.89;
const PAGE_W = PAGE_W_PT * PT;

function measureWidthPx(text, fontSizePx, bold) {
  if (typeof document !== "undefined") {
    try {
      measureWidthPx._c = measureWidthPx._c || document.createElement("canvas");
      const ctx = measureWidthPx._c.getContext("2d");
      ctx.font = `${bold ? "700" : "400"} ${fontSizePx}px Arial, Helvetica, sans-serif`;
      return ctx.measureText(String(text)).width;
    } catch { /* spadneme na odhad níže */ }
  }
  return String(text).length * fontSizePx * 0.56;
}

// Text s baseline na dané pozici (top v pt = baseline, ne horní hrana boxu).
function T(xPt, topPt, text, opts = {}) {
  const { size = 7.9, bold = false, italic = false, align = "left", color = "#000" } = opts;
  if (text === undefined || text === null || text === "") return "";
  const sizePx = size * PT;
  const topPx = topPt * PT - sizePx * 0.76;
  const pos = align === "right" ? `right:${(PAGE_W - xPt * PT).toFixed(2)}px;` : `left:${(xPt * PT).toFixed(2)}px;`;
  return `<div style="position:absolute; ${pos} top:${topPx.toFixed(2)}px; font-size:${sizePx.toFixed(2)}px; font-weight:${bold ? 700 : 400}; font-style:${italic ? "italic" : "normal"}; color:${color}; white-space:nowrap; line-height:1;">${text}</div>`;
}

// Popisek + hodnota hned za sebou (přirozený inline tok nahrazuje ruční
// měření šířky labelu ze specifikace — dělá totéž, jen automaticky).
function TL(xPt, topPt, label, value, opts = {}) {
  const { size = 7.9, labelBold = true, valueBold = false, gapPt = 4 } = opts;
  const sizePx = size * PT;
  const topPx = topPt * PT - sizePx * 0.76;
  return `<div style="position:absolute; left:${(xPt * PT).toFixed(2)}px; top:${topPx.toFixed(2)}px; font-size:${sizePx.toFixed(2)}px; white-space:nowrap; line-height:1;"><span style="font-weight:${labelBold ? 700 : 400};">${label}</span><span style="font-weight:${valueBold ? 700 : 400}; margin-left:${(gapPt * PT).toFixed(1)}px;">${value || ""}</span></div>`;
}

function LINE(x0Pt, x1Pt, topPt, opts = {}) {
  const { dashed = false, color = "#111" } = opts;
  const style = dashed ? "border-top:1px dotted #999;" : `border-top:1px solid ${color};`;
  return `<div style="position:absolute; left:${(x0Pt * PT).toFixed(2)}px; top:${(topPt * PT).toFixed(2)}px; width:${((x1Pt - x0Pt) * PT).toFixed(2)}px; ${style}"></div>`;
}

function BOX(x0Pt, x1Pt, top0Pt, top1Pt, opts = {}) {
  const { fill, border } = opts;
  const parts = [
    "position:absolute",
    `left:${(x0Pt * PT).toFixed(2)}px`,
    `top:${(top0Pt * PT).toFixed(2)}px`,
    `width:${((x1Pt - x0Pt) * PT).toFixed(2)}px`,
    `height:${((top1Pt - top0Pt) * PT).toFixed(2)}px`,
  ];
  if (fill) parts.push(`background:${fill}`);
  if (border) parts.push("border:1px solid #111");
  return `<div style="${parts.join("; ")}"></div>`;
}

// Sestaví HTML tělo faktury (bez obalu) — sdílené pro PDF export i pro
// živý náhled na obrazovce, aby obojí vypadalo naprosto stejně. Souřadnice
// odpovídají přesné specifikaci vzoru z Money S3 (viz konverzace) — každý
// prvek je umístěný absolutně na milimetr přesně, ne přes flexbox odhad.
export function buildInvoiceHtmlBody(invoice, customer, qrDataUrl, vs, barcodeDataUrl) {
  const { lines, byRate, total } = computeInvoiceTotals(invoice.items);
  const discountPercent = Number(invoice.discount_percent) || 0;
  const toPay = getDiscountedTotal(total, discountPercent);
  const remaining = invoice.status === "Zaplacena" ? 0 : toPay;
  const custName = customer?.company || customer?.name || "";
  const custPerson = customer?.company && customer?.name ? customer.name : "";
  const addrParts = (customer?.address || "").split("\n").map(s => s.trim()).filter(Boolean);
  const custStreet = addrParts[0] || "";
  const custCity = addrParts.slice(1).join(", ");
  const title = invoice.is_deposit ? "Faktura - záloha" : "Faktura";
  const els = [];
  const add = (html) => { if (html) els.push(html); };

  // ── 7.1 Hlavička dodavatele ──
  add(T(42.5, 25.9, COMPANY.name, { bold: true, size: 10 }));
  add(T(42.5, 37.6, COMPANY.addressLine, { size: 7.9 }));
  add(T(42.5, 47.5, COMPANY.city, { size: 7.9 }));
  add(T(42.5, 57.4, COMPANY.country, { size: 7.9 }));
  add(T(221.9, 37.7, `IČ: ${COMPANY.ico}`, { bold: true, size: 7.9 }));
  add(T(216.1, 47.5, `DIČ: ${COMPANY.dic}`, { bold: true, size: 7.9 }));
  add(T(292.7, 35.0, "mobil:", { size: 6, color: "#333" }));
  add(T(377.9, 35.0, "tel.:", { size: 6, color: "#333" }));
  add(T(294.0, 42.1, "www:", { size: 6, color: "#333" }));
  add(T(377.9, 42.1, "fax:", { size: 6, color: "#333" }));
  add(T(290.8, 49.2, "e-mail:", { size: 6, color: "#333" }));
  if (barcodeDataUrl) add(`<img src="${barcodeDataUrl}" style="position:absolute; right:${(PAGE_W - 539.8 * PT).toFixed(2)}px; top:${(18 * PT).toFixed(2)}px; height:${(30 * PT).toFixed(2)}px;" />`);

  // ── 7.2 Název dokumentu a číslo faktury ──
  add(T(42.5, 79.2, title, { bold: true, size: 14 }));
  add(BOX(440.6, 539.8, 60.8, 82.0, { border: true }));
  add(T(534.8, 79.2, invoice.number, { bold: true, size: 13.8, align: "right" }));
  add(T(303.2, 92.1, "Objednávka:", { bold: true, size: 7.9 }));
  add(BOX(440.6, 539.8, 82.1, 93.4, { fill: "#e6e6e6" }));
  if (invoice.order_ref) add(T(444, 91.5, invoice.order_ref, { size: 7.5 }));
  add(T(303.2, 104.3, "Odběratel", { bold: true, size: 7.9 }));
  add(LINE(303.2, 539.8, 106.5, {}));

  // ── 7.3 Blok odběratele ──
  add(T(306.0, 124.4, custName, { bold: true, size: 9 }));
  if (custPerson) add(T(306.0, 141, custPerson, { bold: true, size: 7.9 }));
  add(T(303.2, 157.4, custStreet, { bold: true, size: 7.9 }));
  add(T(303.2, 168.7, custCity, { bold: true, size: 7.9 }));
  add(TL(303.2, 194.7, "IČ:", invoice.customer_ico, { gapPt: 4 }));
  add(TL(393.0, 194.7, "DIČ:", invoice.customer_dic, { gapPt: 4 }));
  add(LINE(303.2, 539.8, 202, {}));
  add(T(303.2, 212.6, "Konečný příjemce", { bold: true, size: 7.9 }));
  add(T(385.3, 209.1, "e-mail:", { size: 6, color: "#333" }));
  add(T(395.8, 219.0, "tel.:", { size: 6, color: "#333" }));
  add(T(305.4, 228.9, custName, { size: 7.9 }));
  if (custPerson) add(T(305.4, 242, custPerson, { size: 7.9 }));
  add(T(303.2, 248.7, custStreet, { size: 7.9 }));
  add(T(303.2, 258.7, custCity, { size: 7.9 }));

  // ── 7.4 QR platba ──
  add(`<img src="${qrDataUrl}" style="position:absolute; left:${(193.84 * PT).toFixed(2)}px; top:${(86.08 * PT).toFixed(2)}px; width:${(92.44 * PT).toFixed(2)}px; height:${(92.44 * PT).toFixed(2)}px;" />`);
  {
    const capSizePx = 6 * PT;
    const capTopPx = 187.7 * PT - capSizePx * 0.76;
    const capCenterPx = ((189.84 + 290.28) / 2) * PT;
    add(`<div style="position:absolute; left:${capCenterPx.toFixed(2)}px; top:${capTopPx.toFixed(2)}px; font-size:${capSizePx.toFixed(2)}px; color:#000; text-align:center; width:100px; margin-left:-50px;">QR Platba+F</div>`);
  }

  // ── 7.5 Platba / Doprava / Datum / Symbol ──
  add(T(43.8, 170.8, "Platba:", { bold: true, size: 7.9 }));
  add(T(43.8, 180.6, "Doprava:", { bold: true, size: 7.9 }));
  add(T(43.8, 197.7, "Datum", { bold: true, size: 7.9 }));
  add(T(161.5, 197.7, "Symbol", { bold: true, size: 7.9 }));
  add(LINE(43.8, 158, 199.5, {}));
  add(LINE(161.5, 260.4, 199.5, {}));
  add(TL(49.1, 209.8, "vystavení:", fmtDateCzPlain(invoice.issued), { labelBold: false, valueBold: false, gapPt: 5 }));
  add(T(163.8, 209.8, "konstantní:", { size: 7.9 }));
  add(TL(48.0, 221.1, "splatnosti:", fmtDateCzPlain(invoice.due), { labelBold: true, valueBold: true, gapPt: 5 }));
  add(T(167.9, 221.1, "variabilní:", { bold: true, size: 7.9 }));
  add(BOX(206.9, 290.3, 211.1, 222.4, { fill: "#e6e6e6" }));
  add(T(208.2, 221.1, vs, { bold: true, size: 7.9 }));
  add(T(165.8, 232.5, "specifický:", { size: 7.9 }));

  // ── 7.6 Bankovní účet ──
  add(BOX(43.8, 127.3, 240.8, 252.1, { fill: "#e6e6e6" }));
  add(T(45.2, 250.9, "Bankovní účet", { bold: true, size: 7.9 }));
  add(BOX(43.8, 201.0, 252.2, 267.7, { border: true }));
  add(BOX(206.9, 290.3, 252.2, 267.7, { border: true }));
  add(T(82.4, 266.0, `${COMPANY.bankPrefix}-${COMPANY.bankAccount}`, { bold: true, size: 11 }));
  add(T(236.9, 266.0, COMPANY.bankCode, { bold: true, size: 11 }));

  // ── 7.7 Tabulka položek ──
  const cols = [
    ["Označení dodávky", 42.5, "left"], ["Katalog", 178.4, "left"], ["Počet m. j.", 276.2, "right"],
    ["Cena za m. j.", 347.2, "right"], ["Sazba", 381.1, "right"], ["Základ", 435.0, "right"],
    ["DPH", 486.0, "right"], ["Celkem", 539.9, "right"],
  ];
  cols.forEach(([label, x, align]) => add(T(x, 302.8, label, { bold: true, size: 7.9, align })));
  add(LINE(42.5, 539.9, 306.8, {}));
  const rowStart = 317.5, rowH = 15.8;
  lines.forEach((l, i) => {
    const rowTop = rowStart + i * rowH;
    const sizePx = 7.9 * PT;
    const maxDescPx = (178.4 - 42.5) * PT - 4;
    const descWidth = measureWidthPx(l.desc || "", sizePx, false);
    const scaleX = descWidth > maxDescPx ? Math.max(0.5, maxDescPx / descWidth) : 1;
    const descStyle = scaleX < 1 ? `display:inline-block; transform:scaleX(${scaleX.toFixed(3)}); transform-origin:left top; white-space:nowrap;` : "white-space:nowrap;";
    add(`<div style="position:absolute; left:${(42.5 * PT).toFixed(2)}px; top:${(rowTop * PT - sizePx * 0.76).toFixed(2)}px; font-size:${sizePx.toFixed(2)}px; ${descStyle}">${l.desc || ""}</div>`);
    add(T(276.2, rowTop, fmtKc2(l.qty), { size: 7.9, align: "right" }));
    add(T(347.2, rowTop, fmtKc2(l.price), { size: 7.9, align: "right" }));
    add(T(381.1, rowTop, `${l.vatRate} %`, { size: 7.9, align: "right" }));
    add(T(435.0, rowTop, fmtKc2(l.zaklad), { size: 7.9, align: "right" }));
    add(T(486.0, rowTop, fmtKc2(l.dph), { size: 7.9, align: "right" }));
    add(T(539.9, rowTop, fmtKc2(l.celkem), { size: 7.9, bold: true, align: "right" }));
    add(LINE(42.5, 539.9, rowTop + 5.8, { dashed: true }));
  });

  // ── 7.8 Rekapitulace DPH podle sazeb (dynamická pozice dle počtu položek) ──
  const rowY = rowStart + lines.length * rowH;
  const recTop = rowY + 20;
  const sumZaklad = VAT_RATES.reduce((s, r) => s + byRate[r].zaklad, 0);
  const sumDph = VAT_RATES.reduce((s, r) => s + byRate[r].dph, 0);
  add(T(81.6, recTop + 7.9, "Sazba", { bold: true, size: 7.9 }));
  add(T(165.7, recTop + 7.9, "Základ", { bold: true, size: 7.9, align: "right" }));
  add(T(226.7, recTop + 7.9, "DPH", { bold: true, size: 7.9, align: "right" }));
  add(T(287.7, recTop + 7.9, "Celkem", { bold: true, size: 7.9, align: "right" }));
  add(T(46.2, recTop + 21.6, "Zaokrouhlení", { italic: true, size: 6.6 }));
  add(T(86.5, recTop + 21.6, "12 %", { size: 7.9 }));
  add(T(165.8, recTop + 21.6, "0,00", { size: 7.9, align: "right" }));
  add(T(226.7, recTop + 21.6, "0,00", { size: 7.9, align: "right" }));
  add(T(287.7, recTop + 21.6, "0,00", { size: 7.9, align: "right" }));
  add(T(86.5, recTop + 30.0, "21 %", { size: 7.9 }));
  add(T(165.8, recTop + 30.0, "0,00", { size: 7.9, align: "right" }));
  add(T(226.7, recTop + 30.0, "0,00", { size: 7.9, align: "right" }));
  add(T(287.7, recTop + 30.0, "0,00", { size: 7.9, align: "right" }));
  add(LINE(42.5, 287.7, recTop + 33.2, {}));
  const r0Top = recTop + 44.4;
  add(T(88.1, r0Top, "0 %", { size: 7.9 }));
  add(T(165.7, r0Top, fmtKc2(byRate[0].zaklad), { size: 7.9, align: "right" }));
  add(T(287.7, r0Top, fmtKc2(byRate[0].celkem), { size: 7.9, align: "right" }));
  const r12Top = r0Top + 19.8;
  add(T(51.5, r12Top, "snížená", { size: 7.9 }));
  add(T(84.1, r12Top, "12 %", { size: 7.9 }));
  add(T(165.8, r12Top, fmtKc2(byRate[12].zaklad), { size: 7.9, align: "right" }));
  add(T(226.7, r12Top, fmtKc2(byRate[12].dph), { size: 7.9, align: "right" }));
  add(T(287.7, r12Top, fmtKc2(byRate[12].celkem), { size: 7.9, align: "right" }));
  const r21Top = r12Top + 10.0;
  add(T(49.9, r21Top, "základní", { size: 7.9 }));
  add(T(84.1, r21Top, "21 %", { size: 7.9 }));
  add(T(165.8, r21Top, fmtKc2(byRate[21].zaklad), { size: 7.9, align: "right" }));
  add(T(226.7, r21Top, fmtKc2(byRate[21].dph), { size: 7.9, align: "right" }));
  add(T(287.7, r21Top, fmtKc2(byRate[21].celkem), { size: 7.9, align: "right" }));
  add(LINE(42.5, 287.7, r21Top + 3.9, { dashed: true }));
  const celkemTop = r21Top + 12.7;
  add(T(75.4, celkemTop, "CELKEM", { bold: true, size: 7.9 }));
  add(T(165.7, celkemTop, fmtKc2(sumZaklad), { bold: true, size: 7.9, align: "right" }));
  add(T(226.7, celkemTop, fmtKc2(sumDph), { bold: true, size: 7.9, align: "right" }));
  add(T(287.7, celkemTop, fmtKc2(total), { bold: true, size: 7.9, align: "right" }));

  // ── 7.9 Souhrn k úhradě — kotveno na recTop stejně jako rekapitulace, aby
  // se nepřekrývalo s tabulkou položek při větším počtu řádků (offsety
  // odpovídají rozestupům z referenčního vzoru se 2 položkami). ──
  const slevaTop = recTop + 27.1, celkemUhrTop = recTop + 44.0, zbyvaTop = recTop + 61.0, poznTop = recTop + 76.0;
  add(T(356.0, slevaTop, "Sleva v %:", { bold: true, size: 10.7 }));
  add(T(506.1, slevaTop, fmtKc2(discountPercent), { bold: true, size: 10.7, align: "right" }));
  add(T(319.4, celkemUhrTop, "Celkem k úhradě:", { bold: true, size: 10.7 }));
  add(T(506.3, celkemUhrTop, fmtKc2(toPay), { bold: true, size: 10.7, align: "right" }));
  add(BOX(514.4, 544.1, celkemUhrTop - 14.5, celkemUhrTop + 2.5, { fill: "#e6e6e6" }));
  add(T(522.5, celkemUhrTop, "Kč", { bold: true, size: 10.7 }));
  add(T(334.9, zbyvaTop, "Zbývá uhradit:", { bold: true, size: 10.7 }));
  add(T(506.3, zbyvaTop, fmtKc2(remaining), { bold: true, size: 10.7, align: "right" }));
  add(T(327.5, poznTop, "Pozn.: částky obsahují zaokrouhlení.", { italic: true, size: 7.9 }));

  // ── 7.10 Patička ──
  const footerTop = Math.max(558.9, poznTop + 40);
  add(LINE(400, 539.8, footerTop - 12, {}));
  add(T(446.3, footerTop, "Razítko a podpis", { size: 8 }));

  const containerHeightPt = Math.max(PAGE_H_PT, footerTop + 30);
  return `<div style="position:relative; width:${PAGE_W.toFixed(2)}px; height:${(containerHeightPt * PT).toFixed(2)}px; font-family:Arial, Helvetica, sans-serif; color:#111;">${els.join("")}</div>`;
}

// Připraví data pro živý náhled faktury na obrazovce (stejný vzhled jako PDF).
export async function buildInvoicePreview(invoice, customer) {
  const { total } = computeInvoiceTotals(invoice.items);
  const toPay = getDiscountedTotal(total, invoice.discount_percent);
  const [{ vs, qrDataUrl }, barcodeDataUrl] = await Promise.all([
    getInvoiceQr(invoice, toPay), getInvoiceBarcode(invoice.number),
  ]);
  return buildInvoiceHtmlBody(invoice, customer, qrDataUrl, vs, barcodeDataUrl);
}

// ─── Generování PDF ─────────────────────────────────────────────────────────
// Faktura se vykreslí jako skryté HTML (skutečné písmo prohlížeče = správná
// čeština s diakritikou), vyfotí přes html2canvas a zabalí do PDF přes jsPDF.
// Je to obrázkové PDF (ne textové/kopírovatelné) — v tomhle prostředí je to
// nejspolehlivější cesta ke stoprocentně správné diakritice bez ručního
// vkládání fontů do PDF knihovny.
export async function downloadInvoicePDF(invoice, customer) {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    safeImport(() => import("jspdf")), safeImport(() => import("html2canvas")),
  ]);
  const html2canvas = html2canvasMod.default;

  const { total } = computeInvoiceTotals(invoice.items);
  const toPay = getDiscountedTotal(total, invoice.discount_percent);
  const [{ vs, qrDataUrl }, barcodeDataUrl] = await Promise.all([
    getInvoiceQr(invoice, toPay), getInvoiceBarcode(invoice.number),
  ]);

  // Šablona teď pozicuje vše absolutně na body (pt) přesně podle vzoru, včetně
  // vlastních okrajů — žádné dodatečné padding už není potřeba (a rozhodilo by
  // to souřadnice o 36px).
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  el.style.width = `${(595.27 * 4 / 3).toFixed(2)}px`;
  el.style.background = "#fff";
  el.style.boxSizing = "border-box";
  el.innerHTML = buildInvoiceHtmlBody(invoice, customer, qrDataUrl, vs, barcodeDataUrl);

  document.body.appendChild(el);
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = 210;
    const imgHeight = (canvas.height / canvas.width) * pageWidth;
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pageWidth, imgHeight);
    doc.save(`Faktura-${invoice.number}.pdf`);
  } finally {
    document.body.removeChild(el);
  }
}
