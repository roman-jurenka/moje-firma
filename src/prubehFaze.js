// Průběh zakázky: Obchod → Back office (příprava) → Realizace → Back office
// (uzavření). Tady jsou jen data a čisté funkce — fáze, jejich úkoly, které
// úkoly tvoří bránu do další sekce a které fáze platí pro který typ zakázky.
// Komponenta je v Prubeh.jsx, uložený stav v tabulce zakazky_prubeh.

export const SEKCE = [
  { id: "ob", nazev: "Obchod", sloupec: "ob", barva: "#0369a1", svetla: "#e0f2fe", tmava: "#075985", role: "Obchodník" },
  { id: "bo", nazev: "Back office · příprava", sloupec: "bo", barva: "#b45309", svetla: "#fef3c7", tmava: "#92400e", role: "Kancelář" },
  { id: "re", nazev: "Realizace", sloupec: "re", barva: "#15803d", svetla: "#dcfce7", tmava: "#166534", role: "Technik" },
  { id: "uz", nazev: "Back office · uzavření", sloupec: "bo", barva: "#b45309", svetla: "#fef3c7", tmava: "#92400e", role: "Kancelář" },
];
export const sekceById = Object.fromEntries(SEKCE.map((s) => [s.id, s]));

// typy: "v" = vždy, "o" = jen někdy (appka se zeptá), "-" = přeskočí se.
// Nezadaný typ = "v". nazevTyp = jiný název fáze pro daný typ zakázky.
// dny = běžná doba fáze; po ní zakázka svítí „déle než obvykle“ a podle ní
// se předvyplní termín dalšího kroku. Admin je může upravit (Nastavení fází).
const ZAKLAD_FAZI = [
  { id: "poptavka", sekce: "ob", nazev: "Poptávka", nazevTyp: { REA: "Objednávka" }, ukoly: [
    { id: "kontakt", text: "Kontakt a adresa zapsané" },
    { id: "pozadavek", text: "Vyjasněno, co zákazník chce" },
  ] },
  // fotky: u úkolu je tlačítko Nahrát fotky (hodnota = kategorie fotky).
  // udaje: u úkolu je formulář technických údajů odběrného místa.
  // smlouva: u úkolu je tlačítko Vygenerovat smlouvu.
  { id: "obhlidka", sekce: "ob", nazev: "Obhlídka", nazevTyp: { SRV: "Diagnostika" }, typy: { REA: "-" }, ukoly: [
    { id: "provedena", text: "Obhlídka / diagnostika provedená" },
    { id: "podklady", text: "Fotky a zaměření uložené", fotky: "Obhlídka" },
    { id: "udaje", text: "Technické údaje (EAN, jistič, fáze)", udaje: true, auto: "udajeVyplnene" },
  ] },
  { id: "nabidka", sekce: "ob", nazev: "Nabídka", typy: { REA: "-" }, ukoly: [
    { id: "nacenena", text: "Nabídka naceněná", auto: "nabidkaPropojena" },
    { id: "odeslana", text: "Nabídka odeslaná zákazníkovi", auto: "nabidkaOdeslana" },
  ] },
  { id: "jednani", sekce: "ob", nazev: "Jednání", typy: { REA: "-" }, ukoly: [
    { id: "odpoved", text: "Zákazník se k nabídce vyjádřil", auto: "nabidkaRozhodnuta" },
  ] },
  { id: "smlouva", sekce: "ob", nazev: "Smlouva", nazevTyp: { SRV: "Objednávka" }, typy: { REA: "-" }, ukoly: [
    { id: "podpis", text: "Smlouva / objednávka podepsaná", brana: true, smlouva: true },
  ] },

  { id: "zaloha", sekce: "bo", nazev: "Záloha", typy: { SRV: "o", REA: "-" }, ukoly: [
    { id: "faktura", text: "Zálohová faktura vystavená" },
    { id: "zaplacena", text: "Záloha zaplacená", brana: true },
  ] },
  { id: "dokumentace", sekce: "bo", nazev: "Dokumentace", typy: { FVR: "o", SRV: "-", HRM: "o", ELK: "o", REA: "-" }, ukoly: [
    { id: "projekt", text: "Projekt / schéma zapojení hotové" },
  ] },
  { id: "distributor", sekce: "bo", nazev: "Distributor", typy: { FVR: "o", FVO: "o", SRV: "-", HRM: "-", ELK: "o", REA: "-" }, ukoly: [
    { id: "zadost", text: "Žádost u distributora podaná" },
    { id: "souhlas", text: "Souhlas distributora", brana: true },
  ] },
  { id: "dotace", sekce: "bo", nazev: "Dotace", typy: { FVE: "o", FVR: "o", FVO: "o", SRV: "-", HRM: "-", ELK: "-", REA: "-" }, ukoly: [
    { id: "zadost", text: "Žádost o dotaci podaná" },
  ] },
  { id: "material", sekce: "bo", nazev: "Materiál a termín", nazevTyp: { SRV: "Termín", REA: "Termín a materiál" }, ukoly: [
    { id: "objednan", text: "Materiál objednaný (nebo skladem)", brana: true, material: true },
    { id: "termin", text: "Termín potvrzený zákazníkem / objednatelem", brana: true },
    { id: "tym", text: "Tým naplánovaný" },
  ] },

  { id: "priprava", sekce: "re", nazev: "Příprava", ukoly: [
    { id: "vydan", text: "Materiál vydaný / naložený" },
    { id: "lide", text: "Lidé a doprava zajištění" },
  ] },
  // Montáž je jeden krok; u FVE a hromosvodu se dělí na části (cast), které
  // dělají různé party v libovolném pořadí: FVE střecha + elektro, hromosvod
  // střecha (jímací soustava) + uzemnění. jenTypy / krome = pro které typy
  // zakázky úkol platí (ostatní typy mají jednoduchou Montáž).
  { id: "montaz", sekce: "re", nazev: "Montáž", nazevTyp: { SRV: "Servis" }, ukoly: [
    { id: "hotovo", text: "Práce na místě dokončené", krome: ["FVE", "FVO", "FVR", "HRM"] },
    { id: "fotky", text: "Fotky z realizace uložené", fotky: "Po montáži", krome: ["FVE", "FVO", "FVR", "HRM"] },
    // FVE (i ohřev vody a rozšíření)
    { id: "strecha", cast: "strecha", text: "Konstrukce a panely na střeše namontované", jenTypy: ["FVE", "FVO", "FVR"] },
    { id: "strecha_fotky", cast: "strecha", text: "Fotky ze střechy uložené", fotky: "Střecha", jenTypy: ["FVE", "FVO", "FVR"] },
    { id: "elektro", cast: "elektro", text: "Elektroinstalace hotová (střídač, rozvaděče, kabeláž)", jenTypy: ["FVE", "FVO", "FVR"] },
    { id: "elektro_fotky", cast: "elektro", text: "Fotky elektra a hotového díla uložené", fotky: "Po montáži", jenTypy: ["FVE", "FVO", "FVR"] },
    // Hromosvod
    { id: "jimaci", cast: "strecha", text: "Jímací soustava a svody namontované", jenTypy: ["HRM"] },
    { id: "jimaci_fotky", cast: "strecha", text: "Fotky ze střechy uložené", fotky: "Střecha", jenTypy: ["HRM"] },
    { id: "zemnic", cast: "uzemneni", text: "Zemnič uložený a propojený se svody", jenTypy: ["HRM"] },
    { id: "mereni", cast: "uzemneni", text: "Zemní odpor změřený", jenTypy: ["HRM"] },
    { id: "uzemneni_fotky", cast: "uzemneni", text: "Fotky uzemnění a hotového díla uložené", fotky: "Uzemnění", jenTypy: ["HRM"] },
  ] },
  { id: "zprovozneni", sekce: "re", nazev: "Zprovoznění", typy: { SRV: "-", HRM: "-", REA: "o" }, ukoly: [
    { id: "test", text: "Zprovozněno a otestováno" },
  ] },
  { id: "revize", sekce: "re", nazev: "Revize", typy: { SRV: "o", REA: "o" }, ukoly: [
    { id: "zprava", text: "Revizní zpráva hotová", brana: true },
  ] },
  { id: "predani", sekce: "re", nazev: "Předání", ukoly: [
    { id: "protokol", text: "Předávací protokol podepsaný", brana: true },
    { id: "zaskoleni", text: "Zákazník seznámený s obsluhou" },
  ] },

  { id: "pripojeni", sekce: "uz", nazev: "Připojení", typy: { FVR: "o", SRV: "-", HRM: "-", ELK: "o", REA: "-" }, ukoly: [
    { id: "ppp", text: "Uvedeno do provozu u distributora" },
  ] },
  // Jen u realizace na objednávku (REA): objednatel dostane fotky, předávací
  // protokol a uzavírací e-mail (tlačítko Připravit uzavírací e-mail).
  { id: "odeslani", sekce: "uz", nazev: "Odeslání objednateli", vychozi: "-", typy: { REA: "v" }, ukoly: [
    { id: "fotky", text: "Fotky z realizace odeslané objednateli" },
    { id: "protokol", text: "Předávací protokol odeslaný objednateli" },
    { id: "email", text: "Uzavírací e-mail odeslaný", brana: true, email: true },
  ] },
  { id: "vyuctovani", sekce: "uz", nazev: "Vyúčtování", ukoly: [
    { id: "faktura", text: "Konečná faktura vystavená" },
    { id: "zaplaceno", text: "Doplatek zaplacený", brana: true },
  ] },
  { id: "archiv", sekce: "uz", nazev: "Archiv", ukoly: [
    { id: "dokumenty", text: "Dokumenty uložené" },
    { id: "servis", text: "Servisní / revizní termín naplánovaný" },
  ] },
];
const BEZNE_DNY = { poptavka: 2, obhlidka: 7, nabidka: 5, jednani: 14, smlouva: 7, zaloha: 7, dokumentace: 7, distributor: 30, dotace: 14, material: 14, priprava: 2, montaz: 5, zprovozneni: 2, revize: 7, predani: 3, odeslani: 2, pripojeni: 30, vyuctovani: 14, archiv: 7 };
ZAKLAD_FAZI.forEach((f) => { f.dny = BEZNE_DNY[f.id] || 7; });

// Platná konfigurace = základ + úpravy admina (app_settings, klíč NASTAVENI_KEY):
// { faze: { [id]: { dny, typy: {FVE:"v"|"o"|"-"}, ukoly: [{id, text, brana, auto}] } } }.
// FAZE a fazeById se přestaví na místě, ať je všude stejná platná verze.
export const NASTAVENI_KEY = "prubeh_nastaveni";
export const FAZE = [];
export const fazeById = {};
export const zakladFaze = (id) => ZAKLAD_FAZI.find((f) => f.id === id);
export function pouzijNastaveni(nastaveni) {
  const upr = nastaveni?.faze || {};
  const nove = ZAKLAD_FAZI.map((f) => {
    const u = upr[f.id] || {};
    // Úkoly upravené adminem si ponechají tlačítka a formuláře ze základu (podle id).
    const ukoly = Array.isArray(u.ukoly) && u.ukoly.length
      ? u.ukoly.filter((x) => String(x.text || "").trim()).map((x) => {
        const z = f.ukoly.find((b) => b.id === x.id);
        return z ? { fotky: z.fotky, udaje: z.udaje, smlouva: z.smlouva, email: z.email, material: z.material, cast: z.cast, jenTypy: z.jenTypy, krome: z.krome, ...x } : x;
      })
      : f.ukoly;
    return {
      ...f,
      dny: Number(u.dny) > 0 ? Number(u.dny) : f.dny,
      typy: { ...(f.typy || {}), ...(u.typy || {}) },
      ukoly,
    };
  });
  FAZE.length = 0;
  FAZE.push(...nove);
  Object.keys(fazeById).forEach((k) => delete fazeById[k]);
  nove.forEach((f) => { fazeById[f.id] = f; });
}
pouzijNastaveni(null);
export const PRAVIDLA_TYPU = [["v", "vždy"], ["o", "někdy"], ["-", "ne"]];
export const PRVNI_FAZE = "poptavka";

export const TYPY = [
  { id: "FVE", label: "FVE — Fotovoltaika" },
  { id: "FVR", label: "FVR — FVE rozšíření" },
  { id: "FVO", label: "FVO — FVE ohřev vody" },
  { id: "REA", label: "REA — Realizace na objednávku" },
  { id: "HRM", label: "HRM — Hromosvody" },
  { id: "ELK", label: "ELK — Elektroinstalace" },
  { id: "SRV", label: "SRV — Servis" },
];
// Starší zakázky mají typ volným textem ("FVE instalace") — převést na kód.
export const normalizujTyp = (t) => {
  const s = String(t || "").toUpperCase();
  return TYPY.find((x) => s.startsWith(x.id))?.id || (s.includes("FVE") ? "FVE" : "");
};

export const DUVODY_CEKANI = [
  { id: "zakaznik", label: "Čeká na zákazníka" },
  { id: "distributor", label: "Čeká na distributora" },
  { id: "material", label: "Čeká na materiál" },
  { id: "podklady", label: "Chybí podklady" },
  { id: "jine", label: "Jiné" },
];
export const nazevDuvodu = (id) => DUVODY_CEKANI.find((d) => d.id === id)?.label || "";

// Plánované člověko-dny (MD) z nabídky: u FVE/FVR z kalkulace (elektro +
// střecha + instalatér), jinak z interního nacenění (dny × lidi u řádků v MD
// + samostatné položky; řádky po bodech/hodinách do MD nepočítají).
export function planovaneMd(qd, typ) {
  if (!qd) return 0;
  if (typ === "FVE" || typ === "FVR" || typ === "FVO") {
    const f = qd.fve || {};
    return (Number(f.mdElektro) || 0) + (Number(f.mdStrecha) || 0) + (Number(f.mdInstalater) || 0);
  }
  const i = qd.interni || {};
  const zRadku = (i.radky || []).reduce((s, r) => (r.jednotka === "bod" || r.jednotka === "hod"
    ? s : s + (Number(r.pocetMd) || 0) * (Number(r.pocetLidi) || 1)), 0);
  return zRadku + (i.polozky || []).reduce((s, p) => s + (Number(p.md) || 0), 0);
}

export const nazevFaze = (f, typ) => (f?.nazevTyp?.[typ]) || f?.nazev || "";
// vychozi = pravidlo pro typy, které fáze nevyjmenovává (např. fáze jen pro REA).
export const pravidlo = (f, typ) => (f.typy && f.typy[typ]) || f.vychozi || "v";

// Platí fáze pro tuhle zakázku? "-" nikdy; "o" jen když ji zakázka potřebuje
// nebo o ní ještě nerozhodla (pak se na ni appka zeptá); přeskočené ne.
export function fazePlati(f, z) {
  const p = pravidlo(f, z.typ);
  if (p === "-") return false;
  if ((z.preskocene || []).includes(f.id)) return false;
  return true;
}
// Volitelná fáze, o které se ještě nerozhodlo → zeptat se.
export const fazeKRozhodnuti = (f, z) => pravidlo(f, z.typ) === "o"
  && !(z.preskocene || []).includes(f.id) && !(z.potrebne || []).includes(f.id);

export const platneFaze = (z) => FAZE.filter((f) => fazePlati(f, z));
export const fazeSekce = (z, sekceId) => platneFaze(z).filter((f) => f.sekce === sekceId);

export function dalsiFaze(z) {
  const i = FAZE.findIndex((f) => f.id === z.faze);
  return FAZE.slice(i + 1).find((f) => fazePlati(f, z)) || null;
}
export function predchoziFaze(z) {
  const i = FAZE.findIndex((f) => f.id === z.faze);
  return FAZE.slice(0, Math.max(0, i)).reverse().find((f) => fazePlati(f, z)) || null;
}

// Úkoly fáze, které platí pro daný typ zakázky (jenTypy / krome).
export const ukolyPro = (faze, typ) => (faze?.ukoly || []).filter((u) => (!u.jenTypy || u.jenTypy.includes(typ)) && !(u.krome || []).includes(typ));

// Části montáže (úkoly s „cast“) — dělají je různé party v libovolném pořadí.
export const CASTI_MONTAZE = {
  strecha: { nazev: "Střecha", ikona: "🏠", nazevTyp: { HRM: "Střecha — jímací soustava" } },
  elektro: { nazev: "Elektro", ikona: "⚡" },
  uzemneni: { nazev: "Uzemnění", ikona: "⏚" },
};
export const nazevCasti = (id, typ) => CASTI_MONTAZE[id]?.nazevTyp?.[typ] || CASTI_MONTAZE[id]?.nazev || id;

// Úkol je hotový ručně (hotove_ukoly) nebo automaticky z propojené nabídky.
export function ukolHotovy(z, faze, ukol, auto = {}) {
  if (ukol.auto && auto[ukol.auto]) return true;
  return !!(z.hotove_ukoly || {})[`${faze.id}.${ukol.id}`];
}
export const fazeHotova = (z, faze, auto) => ukolyPro(faze, z.typ).every((u) => ukolHotovy(z, faze, u, auto));
// Termín podle běžné doby fáze (od vstupu do fáze).
export function terminFaze(faze, odIso) {
  const d = odIso ? new Date(odIso) : new Date();
  d.setDate(d.getDate() + (Number(faze?.dny) || 7));
  return d.toLocaleDateString("sv-SE");
}
export const prvniNehotovy = (z, faze, auto) => ukolyPro(faze, z.typ).find((u) => !ukolHotovy(z, faze, u, auto)) || null;

// Brána = úkoly označené "brana" ve fázích sekce, kde zakázka právě je.
export function branaSekce(z, auto) {
  const sekce = fazeById[z.faze]?.sekce;
  return fazeSekce(z, sekce).flatMap((f) => ukolyPro(f, z.typ).filter((u) => u.brana)
    .map((u) => ({ text: u.text, hotovo: ukolHotovy(z, f, u, auto) })));
}
export const NAZEV_BRANY = { ob: "Brána do back office", bo: "Brána do realizace", re: "Brána k uzavření", uz: "Uzavření zakázky" };

// Postup v jedné sekci pro přehled: null = sekce ještě nezačala,
// "hotovo" = sekce za námi, jinak { poradi, celkem, nazev }.
export function postupSekce(z, sekceIds) {
  const aktualni = fazeById[z.faze];
  const poradiSekci = ["ob", "bo", "re", "uz"];
  const ia = poradiSekci.indexOf(aktualni?.sekce);
  const vSekci = sekceIds.includes(aktualni?.sekce);
  if (z.stav === "uzavrena") return "hotovo";
  if (vSekci) {
    const fz = fazeSekce(z, aktualni.sekce);
    const idx = fz.findIndex((f) => f.id === z.faze);
    return { poradi: idx + 1, celkem: fz.length, nazev: nazevFaze(aktualni, z.typ), sekce: aktualni.sekce };
  }
  const posledni = Math.max(...sekceIds.map((s) => poradiSekci.indexOf(s)));
  const prvni = Math.min(...sekceIds.map((s) => poradiSekci.indexOf(s)));
  if (ia > posledni) return "hotovo";
  if (ia < prvni) return null;
  // mezi (Back office · příprava hotová, zakázka v realizaci)
  return "hotovo";
}

// Stav starých zakázek (contracts.status) a obchodních případů → fáze.
export const FAZE_ZE_STAVU_ZAKAZKY = { "Nová": "zaloha", "Aktivní": "montaz", "Probíhá": "montaz", "Dokončena": "vyuctovani", "Fakturována": "archiv" };
export const FAZE_ZE_STAGE = { "Nový": "poptavka", "Jednání": "obhlidka", "Nabídka": "nabidka", "Vyhráno": "smlouva" };
// Fáze → stav staré zakázky, ať ostatní obrazovky (reporty, seznam zakázek) sedí.
export const STAV_ZAKAZKY_ZE_SEKCE = { bo: "Nová", re: "Probíhá", uz: "Dokončena" };
export const STAGE_Z_FAZE = { poptavka: "Nový", obhlidka: "Jednání", nabidka: "Nabídka", jednani: "Nabídka", smlouva: "Nabídka" };
