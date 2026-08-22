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
function fmtDateCzPlain(v) {
  if (!v) return "";
  const d = new Date(v.length === 10 ? v + "T00:00:00" : v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("cs-CZ");
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

const VAT_RATE_LABEL = { 0: "", 12: "snížená", 21: "základní" };

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
  JsBarcode(canvas, number || "0", { format: "CODE128", displayValue: false, height: 34, margin: 0 });
  return canvas.toDataURL("image/png");
}

// Sestaví HTML tělo faktury (bez obalu) — sdílené pro PDF export i pro
// živý náhled na obrazovce, aby obojí vypadalo naprosto stejně. Rozvržení
// kopíruje vzorovou fakturu z Money S3 (hlavička firmy + čárový kód vpravo,
// velké číslo dokladu, název dokladu + QR platba + odběratel, datum/symbol/
// účet vlevo, tabulka položek, rozpis DPH podle sazby vlevo dole, souhrn
// vpravo dole).
export function buildInvoiceHtmlBody(invoice, customer, qrDataUrl, vs, barcodeDataUrl) {
  const { lines, byRate, total } = computeInvoiceTotals(invoice.items);
  const discountPercent = Number(invoice.discount_percent) || 0;
  const toPay = getDiscountedTotal(total, discountPercent);
  const remaining = invoice.status === "Zaplacena" ? 0 : toPay;
  const custName = customer?.company || customer?.name || "";
  const custPerson = customer?.company && customer?.name ? customer.name : "";
  const custAddress = customer?.address || "";
  const title = invoice.is_deposit ? "Faktura - záloha" : "Faktura";

  const custBlock = `
    <div style="font-weight:700; font-size:13px; margin:3px 0 2px;">${custName}</div>
    ${custPerson ? `<div style="font-size:12px;">${custPerson}</div>` : ""}
    <div style="font-size:12px; white-space:pre-line;">${custAddress}</div>
  `;

  const sumZaklad = VAT_RATES.reduce((s, r) => s + byRate[r].zaklad, 0);
  const sumDph = VAT_RATES.reduce((s, r) => s + byRate[r].dph, 0);

  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
      <div>
        <div style="font-weight:700; font-size:13px;">${COMPANY.name}</div>
        <div style="font-size:11px; line-height:1.4;">${COMPANY.addressLine}<br/>${COMPANY.city}<br/>${COMPANY.country}</div>
      </div>
      <div style="font-size:10px;">
        <div>IČ : <strong>${COMPANY.ico}</strong></div>
        <div>DIČ : <strong>${COMPANY.dic}</strong></div>
      </div>
      <div style="font-size:9px; color:#333;">mobil:<br/>www:<br/>e-mail:</div>
      <div style="font-size:9px; color:#333;">tel.:<br/>fax:</div>
      ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" style="height:34px;" />` : ""}
    </div>

    <div style="display:flex; gap:24px;">
      <div style="flex:0 0 250px;">
        <div style="font-size:19px; font-weight:700; margin-bottom:10px;">${title}</div>
        <img src="${qrDataUrl}" width="130" height="130" />

        <div style="margin-top:10px; font-size:10px;"><strong>Platba:</strong></div>
        <div style="font-size:10px; margin-bottom:10px;"><strong>Doprava:</strong></div>

        <div style="display:flex; gap:14px;">
          <div style="flex:1;">
            <div style="font-size:10px; font-weight:700;">Datum</div>
            <div style="font-size:10px; margin-top:4px;">vystavení:</div>
            <div style="font-size:11px; font-weight:700;">${fmtDateCzPlain(invoice.issued)}</div>
            <div style="font-size:10px; margin-top:4px;">splatnosti:</div>
            <div style="font-size:11px; font-weight:700;">${fmtDateCzPlain(invoice.due)}</div>
          </div>
          <div style="flex:1;">
            <div style="font-size:10px; font-weight:700;">Symbol</div>
            <div style="font-size:10px; margin-top:4px;">konstantní:</div>
            <div style="font-size:11px;">&nbsp;</div>
            <div style="font-size:10px; margin-top:4px;">variabilní:</div>
            <div style="font-size:11px; font-weight:700; background:#e6e6e6; display:inline-block; padding:1px 6px; border-radius:2px;">${vs}</div>
            <div style="font-size:10px; margin-top:4px;">specifický:</div>
          </div>
        </div>

        <div style="font-size:10px; font-weight:700; margin-top:12px; margin-bottom:3px;">Bankovní účet</div>
        <div style="display:flex; border:1px solid #111;">
          <div style="flex:1; padding:5px 9px; font-weight:700; font-size:13px; border-right:1px solid #111;">${COMPANY.bankPrefix}-${COMPANY.bankAccount}</div>
          <div style="padding:5px 9px; font-weight:700; font-size:13px;">${COMPANY.bankCode}</div>
        </div>
      </div>

      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="font-size:11px; font-weight:700;">Objednávka:</div>
          <div style="font-size:20px; font-weight:700;">${invoice.number}</div>
        </div>
        <div style="background:#e6e6e6; display:inline-block; min-width:140px; padding:3px 8px; border-radius:2px; font-size:11px; margin-top:2px;">${invoice.order_ref || "&nbsp;"}</div>

        <div style="font-size:11px; font-weight:700; margin-top:14px;">Odběratel</div>
        <div style="background:#e6e6e6; display:inline-block; min-width:140px; padding:3px 8px; border-radius:2px; margin-top:2px;">&nbsp;</div>
        ${custBlock}

        <div style="display:flex; justify-content:space-between; font-size:10px; margin-top:16px;">
          <span>IČ : ${invoice.customer_ico || ""}</span>
          <span>DIČ : ${invoice.customer_dic || ""}</span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:10px;">
          <div style="font-size:11px; font-weight:700;">Konečný příjemce</div>
          <div style="font-size:9px; color:#333; text-align:right;">e-mail:<br/>tel.:</div>
        </div>
        ${custBlock}
      </div>
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:11px; margin:22px 0 10px;">
      <thead>
        <tr style="border-bottom:1px solid #111;">
          ${["Označení dodávky", "Katalog", "Počet m.j.", "Cena za m.j.", "Sazba", "Základ", "DPH", "Celkem"].map(h => `<th style="text-align:left; padding:4px 6px; font-weight:700;">${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${lines.map(l => `
          <tr style="border-bottom:1px dotted #999;">
            <td style="padding:5px 6px;">${l.desc || ""}</td>
            <td style="padding:5px 6px;"></td>
            <td style="padding:5px 6px;">${fmtKc2(l.qty)}</td>
            <td style="padding:5px 6px; text-align:right;">${fmtKc2(l.price)}</td>
            <td style="padding:5px 6px;">${l.vatRate} %</td>
            <td style="padding:5px 6px; text-align:right;">${fmtKc2(l.zaklad)}</td>
            <td style="padding:5px 6px; text-align:right;">${fmtKc2(l.dph)}</td>
            <td style="padding:5px 6px; text-align:right; font-weight:700;">${fmtKc2(l.celkem)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:18px;">
      <table style="border-collapse:collapse; font-size:11px;">
        <thead><tr>${["Sazba", "Základ", "DPH", "Celkem"].map(h => `<th style="text-align:right; padding:3px 10px; border-bottom:1px solid #111;">${h}</th>`).join("")}</tr></thead>
        <tbody>
          ${VAT_RATES.map(r => `<tr><td style="padding:3px 10px;">${VAT_RATE_LABEL[r] ? `${VAT_RATE_LABEL[r]} ` : ""}${r} %</td><td style="padding:3px 10px; text-align:right;">${fmtKc2(byRate[r].zaklad)}</td><td style="padding:3px 10px; text-align:right;">${fmtKc2(byRate[r].dph)}</td><td style="padding:3px 10px; text-align:right;">${fmtKc2(byRate[r].celkem)}</td></tr>`).join("")}
          <tr style="border-top:1px solid #111; font-weight:700;"><td style="padding:4px 10px;">CELKEM</td><td style="padding:4px 10px; text-align:right;">${fmtKc2(sumZaklad)}</td><td style="padding:4px 10px; text-align:right;">${fmtKc2(sumDph)}</td><td style="padding:4px 10px; text-align:right;">${fmtKc2(total)}</td></tr>
        </tbody>
      </table>
      <div style="text-align:right;">
        <div style="display:flex; justify-content:space-between; gap:24px; font-size:12px; margin-bottom:4px;"><span>Sleva v %:</span><strong>${fmtKc2(discountPercent)}</strong></div>
        <div style="display:flex; justify-content:space-between; align-items:baseline; gap:24px; margin-bottom:4px;">
          <span style="font-size:14px; font-weight:700;">Celkem k úhradě:</span>
          <span style="font-size:24px; font-weight:800;">${fmtKc2(toPay)} <span style="font-size:12px; background:#e2e8f0; padding:2px 6px; border-radius:3px;">Kč</span></span>
        </div>
        <div style="display:flex; justify-content:space-between; gap:24px; font-size:13px; font-weight:700;"><span>Zbývá uhradit:</span><span>${fmtKc2(remaining)}</span></div>
      </div>
    </div>
    <div style="font-size:10px; color:#666; font-style:italic; margin-top:6px;">Pozn.: částky obsahují zaokrouhlení.</div>

    <div style="margin-top:50px; display:flex; justify-content:flex-end;">
      <div style="text-align:center; font-size:11px; color:#444;">
        <div style="border-top:1px solid #999; padding-top:4px; width:180px;">Razítko a podpis</div>
      </div>
    </div>
  `;
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

  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  el.style.width = "794px";
  el.style.background = "#fff";
  el.style.fontFamily = "Arial, Helvetica, sans-serif";
  el.style.color = "#111";
  el.style.padding = "36px";
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
