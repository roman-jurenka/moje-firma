// ─── Export faktur pro účetní ve formátu ISDOC 6.0.2 ─────────────────────────
// ISDOC je český standard elektronické faktury — načte ho Pohoda, Money S3,
// ABRA, Helios i další. Každá faktura = jeden soubor .isdoc, víc faktur se
// stáhne jako ZIP. Sleva z faktury se rozpustí poměrně do cen položek, aby
// součty seděly s PDF faktury.
import { COMPANY, computeInvoiceTotals, getDiscountedTotal, cisloFaktury } from "./invoicingUtils.js";

const x = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const n2 = (v) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
const n4 = (v) => (Math.round((Number(v) || 0) * 10000) / 10000).toFixed(4);

// „Riegrova 394/17, 779 00 Olomouc“ → části adresy (co nejde rozpoznat, zůstane v ulici)
function rozdelAdresu(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const psc = t.match(/(\d{3})\s?(\d{2})\s+([^,]+)$/);
  const zbytek = psc ? t.slice(0, psc.index).replace(/,\s*$/, "").trim() : t;
  const cislo = zbytek.match(/^(.*?)[\s,]+(\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)?)$/);
  return {
    ulice: cislo ? cislo[1] : zbytek, cislo: cislo ? cislo[2] : "",
    mesto: psc ? psc[3].trim() : "", psc: psc ? `${psc[1]} ${psc[2]}` : "",
  };
}

function strana({ nazev, ico, dic, adresa, mesto, psc, ulice, cislo }) {
  const a = ulice || cislo || mesto ? { ulice, cislo, mesto, psc } : rozdelAdresu(adresa);
  return `<Party>
      <PartyIdentification><ID>${x(ico)}</ID></PartyIdentification>
      <PartyName><Name>${x(nazev)}</Name></PartyName>
      <PostalAddress>
        <StreetName>${x(a.ulice)}</StreetName>
        <BuildingNumber>${x(a.cislo)}</BuildingNumber>
        <CityName>${x(a.mesto)}</CityName>
        <PostalZone>${x(a.psc)}</PostalZone>
        <Country><IdentificationCode>CZ</IdentificationCode><Name>Česká republika</Name></Country>
      </PostalAddress>${dic ? `
      <PartyTaxScheme><CompanyID>${x(dic)}</CompanyID><TaxScheme>VAT</TaxScheme></PartyTaxScheme>` : ""}
    </Party>`;
}

const uuid = (seed) => {
  // stabilní UUID z čísla faktury (stejná faktura = stejné UUID při opakovaném exportu)
  let h = 2166136261;
  const out = [];
  for (let i = 0; i < 32; i++) { h ^= (seed.charCodeAt(i % seed.length) + i); h = Math.imul(h, 16777619) >>> 0; out.push((h >>> 28).toString(16)); }
  const s = out.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`.toUpperCase();
};

export function invoiceToIsdoc(inv, customer) {
  const sleva = Number(inv.discount_percent) || 0;
  const k = sleva > 0 ? (1 - sleva / 100) : 1;
  const polozky = (inv.items || []).map((it) => ({ ...it, price: (Number(it.price) || 0) * k }));
  const { lines, byRate, total, totalTax } = computeInvoiceTotals(polozky);
  const zaklad = total - totalTax;
  const cislo = cisloFaktury(inv);
  const zaloha = !!inv.is_deposit;
  const radky = lines.map((l, i) => `
    <InvoiceLine>
      <ID>${i + 1}</ID>
      <InvoicedQuantity unitCode="${x(l.unit || "ks")}">${n4(l.qty)}</InvoicedQuantity>
      <LineExtensionAmount>${n2(l.zaklad)}</LineExtensionAmount>
      <LineExtensionAmountTaxInclusive>${n2(l.celkem)}</LineExtensionAmountTaxInclusive>
      <LineExtensionTaxAmount>${n2(l.dph)}</LineExtensionTaxAmount>
      <UnitPrice>${n4(l.price)}</UnitPrice>
      <UnitPriceTaxInclusive>${n4((Number(l.price) || 0) * (1 + l.vatRate / 100))}</UnitPriceTaxInclusive>
      <ClassifiedTaxCategory><Percent>${l.vatRate}</Percent><VATCalculationMethod>0</VATCalculationMethod></ClassifiedTaxCategory>
      <Item><Description>${x(l.desc)}</Description></Item>
    </InvoiceLine>`).join("");
  const sazby = Object.entries(byRate).filter(([, v]) => Math.abs(v.zaklad) > 0.001 || Math.abs(v.dph) > 0.001).map(([rate, v]) => `
    <TaxSubTotal>
      <TaxableAmount>${n2(v.zaklad)}</TaxableAmount>
      <TaxAmount>${n2(v.dph)}</TaxAmount>
      <TaxInclusiveAmount>${n2(v.celkem)}</TaxInclusiveAmount>
      <AlreadyClaimedTaxableAmount>0.00</AlreadyClaimedTaxableAmount>
      <AlreadyClaimedTaxAmount>0.00</AlreadyClaimedTaxAmount>
      <AlreadyClaimedTaxInclusiveAmount>0.00</AlreadyClaimedTaxInclusiveAmount>
      <DifferenceTaxableAmount>${n2(v.zaklad)}</DifferenceTaxableAmount>
      <DifferenceTaxAmount>${n2(v.dph)}</DifferenceTaxAmount>
      <DifferenceTaxInclusiveAmount>${n2(v.celkem)}</DifferenceTaxInclusiveAmount>
      <TaxCategory><Percent>${rate}</Percent></TaxCategory>
    </TaxSubTotal>`).join("");
  const kUhrade = getDiscountedTotal(computeInvoiceTotals(inv.items || []).total, sleva);
  const odberatel = strana({
    nazev: customer?.company || customer?.name || "",
    ico: inv.customer_ico || customer?.ico || "", dic: inv.customer_dic || customer?.dic || "",
    adresa: customer?.sidlo || customer?.address || "",
  });
  const dodavatel = strana({ nazev: COMPANY.name, ico: COMPANY.ico, dic: COMPANY.dic, adresa: `${COMPANY.addressLine}, ${COMPANY.city}` });
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2">
  <DocumentType>${zaloha ? 4 : 1}</DocumentType>
  <ID>${x(cislo)}</ID>
  <UUID>${uuid(String(cislo) + "|" + (inv.id || ""))}</UUID>
  <IssuingSystem>ProudOS</IssuingSystem>
  <IssueDate>${x(inv.issued)}</IssueDate>
  <TaxPointDate>${x(inv.issued)}</TaxPointDate>
  <VATApplicable>true</VATApplicable>
  <ElectronicPossibilityAgreementReference></ElectronicPossibilityAgreementReference>
  <Note>${x(inv.order_ref ? `Objednávka / zakázka: ${inv.order_ref}` : "")}</Note>
  <LocalCurrencyCode>CZK</LocalCurrencyCode>
  <CurrRate>1</CurrRate>
  <RefCurrRate>1</RefCurrRate>
  <AccountingSupplierParty>
    ${dodavatel}
  </AccountingSupplierParty>
  <AccountingCustomerParty>
    ${odberatel}
  </AccountingCustomerParty>
  <InvoiceLines>${radky}
  </InvoiceLines>
  <TaxTotal>${sazby}
    <TaxAmount>${n2(totalTax)}</TaxAmount>
  </TaxTotal>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount>${n2(zaklad)}</TaxExclusiveAmount>
    <TaxInclusiveAmount>${n2(total)}</TaxInclusiveAmount>
    <AlreadyClaimedTaxExclusiveAmount>0.00</AlreadyClaimedTaxExclusiveAmount>
    <AlreadyClaimedTaxInclusiveAmount>0.00</AlreadyClaimedTaxInclusiveAmount>
    <DifferenceTaxExclusiveAmount>${n2(zaklad)}</DifferenceTaxExclusiveAmount>
    <DifferenceTaxInclusiveAmount>${n2(total)}</DifferenceTaxInclusiveAmount>
    <PayableRoundingAmount>${n2(kUhrade - total)}</PayableRoundingAmount>
    <PaidDepositsAmount>0.00</PaidDepositsAmount>
    <PayableAmount>${n2(kUhrade)}</PayableAmount>
  </LegalMonetaryTotal>
  <PaymentMeans>
    <Payment>
      <PaidAmount>${n2(kUhrade)}</PaidAmount>
      <PaymentMeansCode>42</PaymentMeansCode>
      <Details>
        <PaymentDueDate>${x(inv.due)}</PaymentDueDate>
        <ID>${x(`${COMPANY.bankPrefix ? COMPANY.bankPrefix + "-" : ""}${COMPANY.bankAccount}`)}</ID>
        <BankCode>${x(COMPANY.bankCode)}</BankCode>
        <Name></Name>
        <IBAN></IBAN>
        <BIC></BIC>
        <VariableSymbol>${x(inv.variable_symbol || String(cislo).replace(/\D/g, ""))}</VariableSymbol>
        <ConstantSymbol>${x(inv.constant_symbol || "")}</ConstantSymbol>
        <SpecificSymbol>${x(inv.specific_symbol || "")}</SpecificSymbol>
      </Details>
    </Payment>
  </PaymentMeans>
</Invoice>
`;
}

// Stáhne jednu fakturu jako .isdoc, víc faktur jako ZIP.
export async function exportIsdoc(invoices, customers) {
  const soubory = invoices.map((inv) => ({
    nazev: `faktura-${String(cisloFaktury(inv)).replace(/[^\w.-]/g, "_")}.isdoc`,
    obsah: invoiceToIsdoc(inv, customers.find((c) => c.id === (inv.customerId ?? inv.customer_id))),
  }));
  let blob, nazev;
  if (soubory.length === 1) {
    blob = new Blob([soubory[0].obsah], { type: "application/xml;charset=utf-8" });
    nazev = soubory[0].nazev;
  } else {
    const { default: PizZip } = await import("pizzip");
    const zip = new PizZip();
    soubory.forEach((s) => zip.file(s.nazev, s.obsah));
    blob = zip.generate({ type: "blob", mimeType: "application/zip", compression: "DEFLATE" });
    nazev = `faktury-isdoc-${new Date().toISOString().slice(0, 10)}.zip`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nazev; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return soubory.length;
}
