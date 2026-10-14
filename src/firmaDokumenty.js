// ─── Údaje firmy do Word dokumentů (nabídky, smlouvy, dodatky, protokoly) ────
// Před každým vyplněním šablony se načtou nejnovější Údaje firmy z databáze
// (Fakturace → Údaje firmy) a porovnají s ARES. Do šablony jdou značky
// {firmaNazev}, {firmaUlice}, {firmaMesto}, {firmaIco}, {firmaDic},
// {firmaTelefon}, {firmaEmail}, {firmaWeb}, {firmaUcet} — v zápatí i v textu
// (smluvní strany ve smlouvě, dodatku a protokolu). Rozdíl proti ARES
// dokument nezastaví, jen se ukáže upozornění.

import { supabase } from "./supabase.js";
import { COMPANY, COMPANY_ACCOUNT_DISPLAY, FIRMA_KEY, nastavFirmu } from "./invoicingUtils.js";
import { nactiZAres } from "./ares.js";

const bez = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "").trim();
const HODINA = 60 * 60 * 1000;
let aresCache = null; // { at, ico, data }

export const znackyFirmy = () => ({
  firmaNazev: COMPANY.name, firmaUlice: COMPANY.addressLine, firmaMesto: COMPANY.city,
  firmaIco: COMPANY.ico, firmaDic: COMPANY.dic, firmaTelefon: COMPANY.mobil || COMPANY.tel,
  firmaEmail: COMPANY.email, firmaWeb: COMPANY.www, firmaUcet: COMPANY_ACCOUNT_DISPLAY,
});

// → { znacky, rozdily: ["ulice: v aplikaci „X“, v ARES „Y“", …] }
export async function aktualniFirma() {
  try {
    const { data } = await supabase.from("app_settings").select("value").eq("key", FIRMA_KEY).maybeSingle();
    if (data?.value) nastavFirmu(data.value);
  } catch { /* offline — zůstanou naposledy načtené údaje */ }
  const rozdily = [];
  try {
    if (!aresCache || aresCache.ico !== COMPANY.ico || Date.now() - aresCache.at > HODINA) {
      aresCache = { at: Date.now(), ico: COMPANY.ico, data: await nactiZAres(COMPANY.ico) };
    }
    const a = aresCache.data;
    if (a) {
      const srovnat = { "název": [COMPANY.name, a.nazev], "ulice": [COMPANY.addressLine, a.ulice], "PSČ a obec": [COMPANY.city, [a.psc, a.obec].filter(Boolean).join(" ")], "DIČ": [COMPANY.dic, a.dic] };
      for (const [k, [app, ar]] of Object.entries(srovnat)) if (ar && bez(app) !== bez(ar)) rozdily.push(`${k}: v aplikaci „${app}“, v ARES „${ar}“`);
      if (a.zanikla) rozdily.push("firma je podle ARES zaniklá");
    }
  } catch { aresCache = null; /* ARES nedostupný — kontrola se zkusí příště */ }
  return { znacky: znackyFirmy(), rozdily };
}

// Odkazy (mailto: v celém dokumentu, http://www… v zápatí) nejsou text —
// po vyplnění šablony se v jejím zipu přepíšou na aktuální e-mail a web.
export function aktualizujOdkazy(zip) {
  const { firmaEmail, firmaWeb } = znackyFirmy();
  for (const n of Object.keys(zip.files).filter((n) => /^word\/_rels\/(footer\d*|document)\.xml\.rels$/.test(n))) {
    let x = zip.file(n).asText();
    if (firmaEmail) x = x.replace(/Target="mailto:[^"]*"/g, `Target="mailto:${firmaEmail}"`);
    if (firmaWeb && n.includes("footer")) x = x.replace(/Target="https?:\/\/[^"]*"/g, `Target="${/^https?:/i.test(firmaWeb) ? firmaWeb : "http://" + firmaWeb}"`);
    zip.file(n, x);
  }
}

export const upozorneniFirmy = (rozdily) => (rozdily?.length
  ? `Údaje firmy se liší od ARES:\n• ${rozdily.join("\n• ")}\n\nDokument je vytvořený s údaji z aplikace. Opravte je v Fakturace → Údaje firmy.`
  : null);
