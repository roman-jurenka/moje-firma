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
  { id: "poptavka", sekce: "ob", nazev: "Poptávka", ukoly: [
    { id: "kontakt", text: "Kontakt a adresa zapsané" },
    { id: "pozadavek", text: "Vyjasněno, co zákazník chce" },
  ] },
  { id: "obhlidka", sekce: "ob", nazev: "Obhlídka", nazevTyp: { SRV: "Diagnostika" }, ukoly: [
    { id: "provedena", text: "Obhlídka / diagnostika provedená" },
    { id: "podklady", text: "Fotky a zaměření uložené" },
  ] },
  { id: "nabidka", sekce: "ob", nazev: "Nabídka", ukoly: [
    { id: "nacenena", text: "Nabídka naceněná", auto: "nabidkaPropojena" },
    { id: "odeslana", text: "Nabídka odeslaná zákazníkovi", auto: "nabidkaOdeslana" },
  ] },
  { id: "jednani", sekce: "ob", nazev: "Jednání", ukoly: [
    { id: "odpoved", text: "Zákazník se k nabídce vyjádřil", auto: "nabidkaRozhodnuta" },
  ] },
  { id: "smlouva", sekce: "ob", nazev: "Smlouva", nazevTyp: { SRV: "Objednávka" }, ukoly: [
    { id: "podpis", text: "Smlouva / objednávka podepsaná", brana: true },
  ] },

  { id: "zaloha", sekce: "bo", nazev: "Záloha", typy: { SRV: "o" }, ukoly: [
    { id: "faktura", text: "Zálohová faktura vystavená" },
    { id: "zaplacena", text: "Záloha zaplacená", brana: true },
  ] },
  { id: "dokumentace", sekce: "bo", nazev: "Dokumentace", typy: { FVR: "o", SRV: "-", HRM: "o", ELK: "o" }, ukoly: [
    { id: "projekt", text: "Projekt / schéma zapojení hotové" },
  ] },
  { id: "distributor", sekce: "bo", nazev: "Distributor", typy: { FVR: "o", SRV: "-", HRM: "-", ELK: "o" }, ukoly: [
    { id: "zadost", text: "Žádost u distributora podaná" },
    { id: "souhlas", text: "Souhlas distributora", brana: true },
  ] },
  { id: "dotace", sekce: "bo", nazev: "Dotace", typy: { FVE: "o", FVR: "o", SRV: "-", HRM: "-", ELK: "-" }, ukoly: [
    { id: "zadost", text: "Žádost o dotaci podaná" },
  ] },
  { id: "material", sekce: "bo", nazev: "Materiál a termín", nazevTyp: { SRV: "Termín" }, ukoly: [
    { id: "objednan", text: "Materiál objednaný (nebo skladem)", brana: true },
    { id: "termin", text: "Termín potvrzený zákazníkem", brana: true },
    { id: "tym", text: "Tým naplánovaný" },
  ] },

  { id: "priprava", sekce: "re", nazev: "Příprava", ukoly: [
    { id: "vydan", text: "Materiál vydaný / naložený" },
    { id: "lide", text: "Lidé a doprava zajištění" },
  ] },
  { id: "montaz", sekce: "re", nazev: "Montáž", nazevTyp: { SRV: "Servis" }, ukoly: [
    { id: "hotovo", text: "Práce na místě dokončené" },
    { id: "fotky", text: "Fotky z realizace uložené" },
  ] },
  { id: "zprovozneni", sekce: "re", nazev: "Zprovoznění", typy: { SRV: "-", HRM: "-" }, ukoly: [
    { id: "test", text: "Zprovozněno a otestováno" },
  ] },
  { id: "revize", sekce: "re", nazev: "Revize", typy: { SRV: "o" }, ukoly: [
    { id: "zprava", text: "Revizní zpráva hotová", brana: true },
  ] },
  { id: "predani", sekce: "re", nazev: "Předání", ukoly: [
    { id: "protokol", text: "Předávací protokol podepsaný", brana: true },
    { id: "zaskoleni", text: "Zákazník seznámený s obsluhou" },
  ] },

  { id: "pripojeni", sekce: "uz", nazev: "Připojení", typy: { FVR: "o", SRV: "-", HRM: "-", ELK: "o" }, ukoly: [
    { id: "ppp", text: "Uvedeno do provozu u distributora" },
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
const BEZNE_DNY = { poptavka: 2, obhlidka: 7, nabidka: 5, jednani: 14, smlouva: 7, zaloha: 7, dokumentace: 7, distributor: 30, dotace: 14, material: 14, priprava: 2, montaz: 5, zprovozneni: 2, revize: 7, predani: 3, pripojeni: 30, vyuctovani: 14, archiv: 7 };
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
    return {
      ...f,
      dny: Number(u.dny) > 0 ? Number(u.dny) : f.dny,
      typy: { ...(f.typy || {}), ...(u.typy || {}) },
      ukoly: Array.isArray(u.ukoly) && u.ukoly.length ? u.ukoly.filter((x) => String(x.text || "").trim()) : f.ukoly,
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
  if (typ === "FVE" || typ === "FVR") {
    const f = qd.fve || {};
    return (Number(f.mdElektro) || 0) + (Number(f.mdStrecha) || 0) + (Number(f.mdInstalater) || 0);
  }
  const i = qd.interni || {};
  const zRadku = (i.radky || []).reduce((s, r) => (r.jednotka === "bod" || r.jednotka === "hod"
    ? s : s + (Number(r.pocetMd) || 0) * (Number(r.pocetLidi) || 1)), 0);
  return zRadku + (i.polozky || []).reduce((s, p) => s + (Number(p.md) || 0), 0);
}

export const nazevFaze = (f, typ) => (f?.nazevTyp?.[typ]) || f?.nazev || "";
export const pravidlo = (f, typ) => (f.typy && f.typy[typ]) || "v";

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

// Úkol je hotový ručně (hotove_ukoly) nebo automaticky z propojené nabídky.
export function ukolHotovy(z, faze, ukol, auto = {}) {
  if (ukol.auto && auto[ukol.auto]) return true;
  return !!(z.hotove_ukoly || {})[`${faze.id}.${ukol.id}`];
}
export const fazeHotova = (z, faze, auto) => faze.ukoly.every((u) => ukolHotovy(z, faze, u, auto));
// Termín podle běžné doby fáze (od vstupu do fáze).
export function terminFaze(faze, odIso) {
  const d = odIso ? new Date(odIso) : new Date();
  d.setDate(d.getDate() + (Number(faze?.dny) || 7));
  return d.toLocaleDateString("sv-SE");
}
export const prvniNehotovy = (z, faze, auto) => faze.ukoly.find((u) => !ukolHotovy(z, faze, u, auto)) || null;

// Brána = úkoly označené "brana" ve fázích sekce, kde zakázka právě je.
export function branaSekce(z, auto) {
  const sekce = fazeById[z.faze]?.sekce;
  return fazeSekce(z, sekce).flatMap((f) => f.ukoly.filter((u) => u.brana)
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
