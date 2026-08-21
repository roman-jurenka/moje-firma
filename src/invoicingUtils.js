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

// ─── Generování PDF ─────────────────────────────────────────────────────────
// Faktura se vykreslí jako skryté HTML (skutečné písmo prohlížeče = správná
// čeština s diakritikou), vyfotí přes html2canvas a zabalí do PDF přes jsPDF.
// Je to obrázkové PDF (ne textové/kopírovatelné) — v tomhle prostředí je to
// nejspolehlivější cesta ke stoprocentně správné diakritice bez ručního
// vkládání fontů do PDF knihovny.
export async function downloadInvoicePDF(invoice, customer) {
  const [{ jsPDF }, html2canvasMod, QRCodeMod] = await Promise.all([
    import("jspdf"), import("html2canvas"), import("qrcode"),
  ]);
  const html2canvas = html2canvasMod.default;
  const QRCode = QRCodeMod.default;

  const { lines, byRate, total } = computeInvoiceTotals(invoice.items);
  const vs = invoice.variable_symbol || (invoice.number || "").replace(/\D/g, "");
  const qrDataUrl = await QRCode.toDataURL(buildSpd({ amount: total, vs, msg: `FAKTURA ${invoice.number}` }), { width: 220, margin: 1 });

  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  el.style.width = "794px";
  el.style.background = "#fff";
  el.style.fontFamily = "'DM Sans', Arial, sans-serif";
  el.style.color = "#111";
  el.style.padding = "36px";
  el.style.boxSizing = "border-box";

  el.innerHTML = `
    <div style="display:flex; justify-content:space-between; border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px;">
      <div>
        <div style="font-weight:800; font-size:16px;">${COMPANY.name}</div>
        <div style="font-size:12px;">${COMPANY.addressLine}</div>
        <div style="font-size:12px;">${COMPANY.city}</div>
        <div style="font-size:12px;">${COMPANY.country}</div>
      </div>
      <div style="font-size:12px; text-align:right;">
        <div>IČ: <strong>${COMPANY.ico}</strong></div>
        <div>DIČ: <strong>${COMPANY.dic}</strong></div>
      </div>
    </div>

    <div style="display:flex; justify-content:space-between; margin-bottom:18px;">
      <div>
        <div style="font-size:22px; font-weight:800;">${invoice.is_deposit ? "Faktura – záloha" : "Faktura – daňový doklad"}</div>
        <div style="font-size:13px; color:#444; margin-top:2px;">Číslo: <strong>${invoice.number}</strong></div>
        ${invoice.order_ref ? `<div style="font-size:12px; color:#444;">Objednávka: ${invoice.order_ref}</div>` : ""}
      </div>
      <img src="${qrDataUrl}" width="110" height="110" style="border:1px solid #ddd;" />
    </div>

    <div style="display:flex; justify-content:space-between; gap:20px; margin-bottom:18px;">
      <div style="flex:1; border:1px solid #ddd; border-radius:6px; padding:10px 14px;">
        <div style="font-size:10px; color:#888; text-transform:uppercase; margin-bottom:4px;">Odběratel</div>
        <div style="font-weight:700; font-size:13px;">${customer?.company || customer?.name || ""}</div>
        ${customer?.company && customer?.name ? `<div style="font-size:12px;">${customer.name}</div>` : ""}
        <div style="font-size:12px; white-space:pre-line;">${customer?.address || ""}</div>
        ${invoice.customer_ico ? `<div style="font-size:12px;">IČ: ${invoice.customer_ico}</div>` : ""}
        ${invoice.customer_dic ? `<div style="font-size:12px;">DIČ: ${invoice.customer_dic}</div>` : ""}
      </div>
      <div style="flex:1; border:1px solid #ddd; border-radius:6px; padding:10px 14px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Datum vystavení:</span><strong>${fmtDateCzPlain(invoice.issued)}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Datum splatnosti:</span><strong>${fmtDateCzPlain(invoice.due)}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Variabilní symbol:</span><strong>${vs}</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>Bankovní účet:</span><strong>${COMPANY_ACCOUNT_DISPLAY}</strong></div>
      </div>
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px;">
      <thead>
        <tr style="background:#f1f5f9;">
          ${["Označení dodávky", "Počet", "M.j.", "Cena/m.j.", "Sazba", "Základ", "DPH", "Celkem"].map(h => `<th style="text-align:left; padding:6px 8px; border-bottom:1px solid #ccc;">${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${lines.map(l => `
          <tr>
            <td style="padding:6px 8px; border-bottom:1px solid #eee;">${l.desc || ""}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #eee;">${l.qty}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #eee;">${l.unit || "ks"}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right;">${fmtKc2(l.price)}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #eee;">${l.vatRate} %</td>
            <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right;">${fmtKc2(l.zaklad)}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right;">${fmtKc2(l.dph)}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right; font-weight:700;">${fmtKc2(l.celkem)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
      <table style="border-collapse:collapse; font-size:11px;">
        <thead><tr>${["Sazba", "Základ", "DPH", "Celkem"].map(h => `<th style="text-align:right; padding:3px 8px; border-bottom:1px solid #ccc;">${h}</th>`).join("")}</tr></thead>
        <tbody>
          ${VAT_RATES.map(r => `<tr><td style="padding:3px 8px;">${r} %</td><td style="padding:3px 8px; text-align:right;">${fmtKc2(byRate[r].zaklad)}</td><td style="padding:3px 8px; text-align:right;">${fmtKc2(byRate[r].dph)}</td><td style="padding:3px 8px; text-align:right;">${fmtKc2(byRate[r].celkem)}</td></tr>`).join("")}
        </tbody>
      </table>
      <div style="text-align:right;">
        <div style="font-size:12px; color:#444;">Celkem k úhradě</div>
        <div style="font-size:26px; font-weight:800;">${fmtKc2(total)} Kč</div>
      </div>
    </div>

    <div style="margin-top:60px; display:flex; justify-content:flex-end;">
      <div style="text-align:center; font-size:11px; color:#444;">
        <div style="border-top:1px solid #999; padding-top:4px; width:180px;">Razítko a podpis</div>
      </div>
    </div>
  `;

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
