// ─── Dokumenty zakázky: návrh smlouvy o dílo, předávací protokol, dodatek ─────
// Vyplní se z dat zakázky (firma, zákazník, místo, technické údaje, cena
// z nabídky) a stáhnou jako Word (.doc) — dají se před podpisem upravit.
// Text je obecný vzor; místa „…………“ se doplňují ručně. Znění smluv je
// vhodné nechat zkontrolovat, případně ho tady upravit na firemní verzi.

import { COMPANY, COMPANY_ACCOUNT_DISPLAY } from "./invoicingUtils.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const kc = (n) => `${Math.round(Number(n) || 0).toLocaleString("cs-CZ")} Kč`;
const MEZERA = "………………………";
const hod = (v) => (v ? esc(v) : MEZERA);

function obal(titulek, telo) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(titulek)}</title>
<style>
  @page { size: 21cm 29.7cm; margin: 2cm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.15; }
  p { margin: 0 0 5pt; }
  h1 { font-size: 16pt; text-align: center; margin: 0 0 4pt; }
  .pod { text-align: center; font-size: 10pt; color: #444; margin-bottom: 14pt; }
  .navrh { border: 1px solid #d97706; background: #fffbeb; color: #92400e; padding: 6pt; font-size: 9pt; margin-bottom: 12pt; }
  h2 { font-size: 12pt; margin: 12pt 0 3pt; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; font-size: 10.5pt; }
  th { background: #f1f5f9; text-align: left; }
  .bez td { border: none; padding: 2pt 0; }
  .podpisy td { border: none; padding-top: 40pt; width: 50%; }
  .cara { border-top: 1px solid #000; padding-top: 3pt; text-align: center; }
</style></head><body>${telo}</body></html>`;
}

function strany(d) {
  const z = d.zakaznik || {};
  return `<table class="bez">
<tr><td style="width:50%"><b>Zhotovitel:</b><br>${esc(COMPANY.name)}<br>${esc(COMPANY.addressLine)}, ${esc(COMPANY.city)}<br>
IČO: ${esc(COMPANY.ico)}, DIČ: ${esc(COMPANY.dic)}<br>Bankovní účet: ${esc(COMPANY_ACCOUNT_DISPLAY)}<br>
Zastoupený: ${hod(d.zastupce)}</td>
<td><b>Objednatel:</b><br>${hod(z.name)}${z.company ? `<br>${esc(z.company)}` : ""}<br>Adresa: ${hod(z.address)}<br>
Datum narození / IČO: ${MEZERA}<br>Telefon: ${hod(z.phone)}<br>E-mail: ${hod(z.email)}</td></tr></table>`;
}

function technicke(d) {
  const u = d.udaje || {};
  return `<table><tr><th style="width:40%">EAN odběrného místa</th><td>${hod(u.ean)}</td></tr>
<tr><th>Hlavní jistič</th><td>${u.jistic_a ? `${esc(u.jistic_a)} A` : MEZERA}</td></tr>
<tr><th>Počet fází</th><td>${u.faze ? `${esc(u.faze)}f` : MEZERA}</td></tr></table>`;
}

function podpisy(d) {
  return `<p>V ${MEZERA} dne ${hod(d.datum)}</p>
<table class="podpisy"><tr><td><div class="cara">za zhotovitele<br>${esc(COMPANY.name)}</div></td>
<td><div class="cara">objednatel<br>${hod(d.zakaznik?.name)}</div></td></tr></table>`;
}

// Hlavní komponenty z nabídky (d.specifikace, řádky oddělené \n).
function komponenty(d) {
  if (!d.specifikace) return "";
  return `<p><b>Hlavní komponenty systému:</b><br>${esc(d.specifikace).replace(/\n/g, "<br>")}</p>`;
}

const NAVRH = `<div class="navrh"><b>NÁVRH</b> — před podpisem zkontrolujte a doplňte vyznačená místa (……). Tento řádek před tiskem smažte.</div>`;

// ── Smlouva o dílo (návrh) ──
export function htmlSmlouvy(d) {
  const cena = d.cena || {};
  const dph = Number(cena.dphPct ?? 21);
  const bez = Math.round(Number(cena.bezDph) || 0);
  const sDph = Math.round(bez * (1 + dph / 100));
  const telo = `${NAVRH}
<h1>SMLOUVA O DÍLO</h1>
<div class="pod">č. ${hod(d.cisloZakazky)} · uzavřená podle § 2586 a násl. zákona č. 89/2012 Sb., občanský zákoník</div>

<h2>Čl. I — Smluvní strany</h2>
${strany(d)}

<h2>Čl. II — Předmět díla</h2>
<p>1. Zhotovitel se zavazuje provést pro objednatele dílo: <b>${hod(d.predmet)}</b> (dále jen „dílo“) na adrese <b>${hod(d.misto)}</b>.</p>
<p>2. Rozsah díla je dán cenovou nabídkou zhotovitele ${d.nabidka?.cislo ? `č. <b>${esc(d.nabidka.cislo)}</b>` : MEZERA}, která je přílohou č. 1 a nedílnou součástí této smlouvy.</p>
${komponenty(d)}
<p>3. Technické údaje odběrného místa:</p>
${technicke(d)}
<p>4. Součástí díla nejsou práce a dodávky, které nejsou uvedené v nabídce; ty lze sjednat písemným dodatkem k této smlouvě.</p>

<h2>Čl. III — Doba plnění</h2>
<p>1. Zhotovitel zahájí provádění díla nejpozději dne ${MEZERA} a dílo dokončí nejpozději dne ${MEZERA}.</p>
<p>2. Termín se přiměřeně prodlužuje o dobu, po kterou zhotovitel nemohl dílo provádět z důvodů na straně objednatele, nepříznivého počasí, dodavatelů materiálu nebo provozovatele distribuční soustavy.</p>

<h2>Čl. IV — Cena díla</h2>
<table><tr><th style="width:40%">Cena bez DPH</th><td>${bez ? kc(bez) : MEZERA}</td></tr>
<tr><th>DPH ${dph} %</th><td>${bez ? kc(sDph - bez) : MEZERA}</td></tr>
<tr><th>Cena celkem včetně DPH</th><td><b>${bez ? kc(sDph) : MEZERA}</b></td></tr></table>
<p>Cena je sjednána dohodou jako cena pevná pro rozsah díla podle čl. II. Změnu ceny lze sjednat pouze písemným dodatkem.</p>

<h2>Čl. V — Platební podmínky</h2>
<p>1. Objednatel uhradí zálohu ve výši ${MEZERA} % ceny díla na základě zálohové faktury před zahájením prací.</p>
<p>2. Zbývající část ceny uhradí objednatel po předání díla na základě faktury se splatností 14 dnů na účet zhotovitele č. ${esc(COMPANY_ACCOUNT_DISPLAY)}.</p>

<h2>Čl. VI — Předání a převzetí díla</h2>
<p>Dílo bude předáno a převzato předávacím protokolem podepsaným oběma stranami. Drobné vady, které nebrání užívání díla, nejsou důvodem k odmítnutí převzetí; zhotovitel je odstraní v dohodnutém termínu.</p>

<h2>Čl. VII — Záruka</h2>
<p>Zhotovitel poskytuje na provedené práce záruku ${MEZERA} měsíců od předání díla. Na dodaný materiál a zařízení platí záruka podle podmínek výrobce.</p>

<h2>Čl. VIII — Ostatní ujednání</h2>
<p>1. Objednatel zajistí zhotoviteli přístup na místo plnění a potřebnou elektrickou energii.</p>
<p>2. Tuto smlouvu lze měnit pouze písemnými dodatky podepsanými oběma stranami.</p>
<p>3. Objednatel souhlasí se zpracováním svých osobních údajů v rozsahu nutném pro plnění této smlouvy.</p>
<p>4. Smlouva je vyhotovena ve dvou stejnopisech, každá strana obdrží jeden. Nabývá platnosti a účinnosti dnem podpisu oběma stranami.</p>
<p>Příloha č. 1: cenová nabídka ${d.nabidka?.cislo ? esc(d.nabidka.cislo) : ""}</p>
${podpisy(d)}`;
  return obal(`Smlouva o dílo ${d.cisloZakazky || ""}`, telo);
}

// ── Předávací protokol ──
export function htmlProtokolu(d) {
  const radky = Array.from({ length: 4 }, () => "<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>").join("");
  const telo = `<h1>PŘEDÁVACÍ PROTOKOL</h1>
<div class="pod">k zakázce ${hod(d.cisloZakazky)} · ${hod(d.nazev)}</div>
${strany(d)}

<h2>Předmět předání</h2>
<p>Dílo <b>${hod(d.predmet)}</b> na adrese <b>${hod(d.misto)}</b>, provedené podle smlouvy o dílo č. ${hod(d.cisloZakazky)}${d.nabidka?.cislo ? ` a nabídky č. ${esc(d.nabidka.cislo)}` : ""}.</p>
${komponenty(d)}
${technicke(d)}

<h2>Instalovaná zařízení</h2>
<table><tr><th>Zařízení / typ</th><th>Výrobní číslo</th><th>Poznámka</th></tr>${radky}</table>

<h2>Předaná dokumentace a seznámení s obsluhou</h2>
<p>☐ Objednatel byl seznámen s obsluhou a bezpečným provozem zařízení.<br>
☐ Návody k obsluze a záruční listy výrobců<br>
☐ Revizní zpráva č. ${MEZERA}<br>
☐ Další: ${MEZERA}</p>

<h2>Zjištěné vady a nedodělky</h2>
<p>${MEZERA}${MEZERA}${MEZERA}<br>${MEZERA}${MEZERA}${MEZERA}</p>
<p>Termín odstranění: ${MEZERA}</p>

<h2>Závěr</h2>
<p>Objednatel dílo přebírá ☐ bez výhrad &nbsp;&nbsp; ☐ s výhradami uvedenými výše.<br>
Dnem podpisu tohoto protokolu začíná běžet záruční doba.</p>
${podpisy(d)}`;
  return obal(`Předávací protokol ${d.cisloZakazky || ""}`, telo);
}

// ── Dodatek ke smlouvě o dílo ──
export function htmlDodatku(d, dod) {
  const puvodni = Math.round(Number(dod.cena_puvodni) || 0);
  const nova = dod.cena_nova !== "" && dod.cena_nova != null ? Math.round(Number(dod.cena_nova)) : null;
  const telo = `${NAVRH}
<h1>DODATEK č. ${esc(dod.cislo)}</h1>
<div class="pod">ke smlouvě o dílo č. ${hod(d.cisloZakazky)} (${hod(d.nazev)})</div>
<h2>Smluvní strany</h2>
${strany(d)}

<h2>Čl. I — Předmět dodatku</h2>
<p>Smluvní strany se dohodly na této změně díla:</p>
<p style="border:1px solid #999; padding:6pt; min-height:60pt">${dod.popis ? esc(dod.popis).replace(/\n/g, "<br>") : MEZERA}</p>
${komponenty(d)}

<h2>Čl. II — Cena díla</h2>
${nova != null && nova !== puvodni ? `<table>
<tr><th style="width:40%">Původní cena bez DPH</th><td>${puvodni ? kc(puvodni) : MEZERA}</td></tr>
<tr><th>Nová cena bez DPH</th><td><b>${kc(nova)}</b></td></tr>
<tr><th>Změna</th><td>${nova - puvodni > 0 ? "+" : ""}${kc(nova - puvodni)}</td></tr></table>
<p>K ceně bude připočtena DPH v zákonné výši.</p>` : "<p>Cena díla se tímto dodatkem nemění.</p>"}

<h2>Čl. III — Doba plnění</h2>
<p>${dod.termin ? `Nový termín dokončení díla: <b>${esc(new Date(dod.termin + "T00:00:00").toLocaleDateString("cs-CZ"))}</b>.` : "Doba plnění se tímto dodatkem nemění."}</p>

<h2>Čl. IV — Závěrečná ustanovení</h2>
<p>Ostatní ujednání smlouvy o dílo zůstávají beze změny. Dodatek je nedílnou součástí smlouvy, je vyhotoven ve dvou stejnopisech a nabývá platnosti dnem podpisu oběma stranami.</p>
${podpisy(d)}`;
  return obal(`Dodatek ${dod.cislo} ${d.cisloZakazky || ""}`, telo);
}

// Specifikace díla z nabídky: u FVE/FVR komponenty z kalkulace („12 ks: Fotovoltaické
// panely …“), jinak sekce nabídky. Řádky oddělené \n (šablona je zalomí).
export function specifikaceZNabidky(data, predmet) {
  const fve = data?.fve;
  const ks = (x) => Number(x?.qty) || 0;
  if (fve) {
    const radky = [];
    const pridat = (x, text) => { if (ks(x) > 0 && x.name) radky.push(`${ks(x)} ks: ${text}`); };
    pridat(fve.panel, `Fotovoltaické panely ${fve.panel?.name}`);
    if (ks(fve.konstrukce) > 0) radky.push(`${ks(fve.konstrukce)} ks: Konstrukce pro uchycení panelů`);
    pridat(fve.stridac, `Střídač ${fve.stridac?.name}`);
    pridat(fve.baterie, `Bateriové úložiště ${fve.baterie?.name}${ks(fve.bms) > 0 ? " + BMS" : ""}`);
    pridat(fve.backup, `Back-up: ${fve.backup?.name}`);
    pridat(fve.wallbox, `Dobíjecí stanice ${fve.wallbox?.name}`);
    pridat(fve.regulace, `Regulace ${fve.regulace?.name}`);
    pridat(fve.bojler, fve.bojler?.name);
    (fve.customRows || []).filter((r) => r.sekce === "material" && r.name && ks(r) > 0).forEach((r) => radky.push(`${ks(r)} ks: ${r.name}`));
    radky.push("1 ks: elektroinstalační práce a materiál");
    return radky.join("\n");
  }
  const sekce = (data?.zakaznik?.sekce || []).map((s) => s.nazev).filter(Boolean);
  return sekce.length ? sekce.join("\n") : (predmet || "");
}

// Stáhne HTML jako dokument Wordu (.doc) — Word ho otevře a dá se upravit.
// Vrací { blob, soubor } — volající ho pak uloží i na OneDrive.
export function stahnoutWord(nazev, html, stahnout = true) {
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const soubor = `${nazev.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim()}.doc`;
  if (!stahnout) return { blob, soubor };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = soubor;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { blob, soubor };
}
