// ─── Souběžná oddělení zakázky (obchod · kancelář · realizace) ───────────────
// Do podpisu smlouvy jde zakázka jednou řadou fází (obchod). Pak běží kancelář
// a realizace souběžně, každá ve své fázi, s vlastním termínem a člověkem:
// zakazky_prubeh.oddeleni = { bo: { faze, od, termin, kdo }, re: { … } }.
// faze může být i CEKA (kancelář má přípravu hotovou a čeká na dokončení
// realizace, pak pokračuje uzavřením) nebo HOTOVO. Sloupec faze dál drží
// „hlavní“ fázi (kvůli seznamům, stavu staré zakázky a dalším obrazovkám).
// Starší řádky bez uloženého „oddeleni“ se odvodí z faze.
import { FAZE, fazeById, fazePlati, oddFaze, CEKA, HOTOVO, nazevFaze } from "./prubehFaze.js";

export { CEKA, HOTOVO, oddFaze };
export const ODDELENI = [
  { id: "ob", nazev: "Obchod", barva: "#0369a1", svetla: "#e0f2fe", tmava: "#075985", vlastnik: "vlastnik_obchod" },
  { id: "bo", nazev: "Kancelář", barva: "#b45309", svetla: "#fef3c7", tmava: "#92400e", vlastnik: "vlastnik_bo" },
  { id: "re", nazev: "Realizace", barva: "#15803d", svetla: "#dcfce7", tmava: "#166534", vlastnik: "vlastnik_re" },
];
export const oddeleniById = Object.fromEntries(ODDELENI.map((o) => [o.id, o]));

const sekce = (id) => fazeById[id]?.sekce;
const poradi = (id) => FAZE.findIndex((f) => f.id === id);
export const fazeOddeleni = (z, odd) => FAZE.filter((f) => oddFaze(f) === odd && fazePlati(f, z));
export const prvniFazeOdd = (z, odd, jenUzavreni = false) => fazeOddeleni(z, odd).find((f) => !jenUzavreni || f.sekce === "uz") || null;
export const aktivni = (t) => !!t && t.faze !== CEKA && t.faze !== HOTOVO;

// Je zakázka za obchodem (oddělení běží souběžně)?
export const soubezne = (z) => !!z && !!sekce(z.faze) && sekce(z.faze) !== "ob";

// Stav všech tří oddělení. Neuložené se odvodí ze sloupce faze.
export function stavOddeleni(z) {
  if (!soubezne(z)) {
    return { ob: { faze: z.faze, od: z.faze_od, termin: z.dalsi_krok_termin, kdo: z.dalsi_krok_kdo }, bo: { faze: CEKA }, re: { faze: CEKA } };
  }
  const ulozene = z.oddeleni || {};
  let { bo, re } = ulozene;
  if (!bo || !re) {
    const s = sekce(z.faze);
    const odd = oddFaze(fazeById[z.faze]);
    const ted = { faze: z.faze, od: z.faze_od };
    if (s === "uz") { bo = bo || ted; re = re || { faze: HOTOVO }; }
    else if (odd === "bo") { bo = bo || ted; re = re || { faze: prvniFazeOdd(z, "re")?.id || HOTOVO, od: z.faze_od }; }
    else { bo = bo || { faze: CEKA, od: z.faze_od }; re = re || ted; }
  }
  return { ob: { faze: HOTOVO }, bo, re };
}

// Hlavní fáze pro sloupec faze: uzavření kanceláře > realizace > kancelář.
export function hlavniFaze(st) {
  if (aktivni(st.bo) && sekce(st.bo.faze) === "uz") return st.bo.faze;
  if (aktivni(st.re)) return st.re.faze;
  if (aktivni(st.bo)) return st.bo.faze;
  return null;
}
export const vychoziOdd = (z, st = stavOddeleni(z)) => (soubezne(z) ? (oddFaze(fazeById[hlavniFaze(st)]) || "bo") : "ob");

// Řádek „pohledem oddělení“: faze = fáze oddělení. Všechny akce Průběhu
// (Hotovo →, přeskočit, zpět, rozhodnutí, kontroly) pak pracují s ním.
export function pohledOdd(z, odd) {
  if (!soubezne(z)) return z;
  const st = stavOddeleni(z);
  const o = odd && aktivni(st[odd]) ? odd : vychoziOdd(z, st);
  if (!aktivni(st[o])) return { ...z, _st: st };
  return { ...z, faze: st[o].faze, faze_od: st[o].od || z.faze_od, _odd: o, _st: st };
}

// Stav jedné fáze v řadě kroků: "hotovo" | "ted" | "ceka" (null = nerozhodnuto).
export function stavFazeOdd(st, fx) {
  const odd = oddFaze(fx);
  const t = st[odd];
  if (!t || t.faze === HOTOVO) return "hotovo";
  if (t.faze === CEKA) {
    if (odd === "bo" && fx.sekce !== "uz" && st.ob?.faze === HOTOVO) return "hotovo"; // příprava hotová, čeká na realizaci
    return "ceka";
  }
  const a = poradi(t.faze), b = poradi(fx.id);
  return b < a ? "hotovo" : b === a ? "ted" : "ceka";
}

// Postup oddělení pro seznam: null = nezačalo, "hotovo", { ceka: text } nebo { poradi, celkem, nazev, barva }.
export function postupOdd(z, odd, st = stavOddeleni(z)) {
  if (z.stav === "uzavrena") return "hotovo";
  const t = st[odd];
  const o = oddeleniById[odd];
  if (!t) return null;
  if (t.faze === HOTOVO) return "hotovo";
  if (t.faze === CEKA) {
    if (odd === "bo" && soubezne(z)) return { ceka: "příprava hotová · čeká na realizaci" };
    return null;
  }
  const fz = fazeOddeleni(z, odd);
  const i = fz.findIndex((f) => f.id === t.faze);
  return { poradi: i + 1, celkem: fz.length, nazev: nazevFaze(fazeById[t.faze], z.typ), barva: o.barva, sekce: sekce(t.faze), termin: t.termin, kdo: t.kdo };
}

// Termín a člověk oddělení (u obchodu z dalšího kroku zakázky).
export const terminOdd = (z, odd, st = stavOddeleni(z)) => (aktivni(st[odd]) ? { termin: st[odd].termin || null, kdo: st[odd].kdo || z[oddeleniById[odd].vlastnik] || null } : { termin: null, kdo: null });
export const oddPoTerminu = (z, dnes, st = stavOddeleni(z)) => (z.stav === "otevrena"
  ? ["bo", "re"].filter((o) => soubezne(z) && aktivni(st[o]) && st[o].termin && st[o].termin < dnes) : []);

// Nový stav oddělení po posunu oddělení „odd“ do fáze cil (může být CEKA / HOTOVO).
// Když realizace skončí a kancelář čeká, kancelář pokračuje uzavřením.
export function posunOdd(z, st, odd, cil, { ted, termin, kdo }) {
  const nove = { bo: { ...st.bo }, re: { ...st.re } };
  const zaznam = (f) => ({ faze: f.id, od: ted, termin: f.id === CEKA || f.id === HOTOVO ? null : termin(f), kdo: kdo(f) });
  nove[odd] = zaznam(cil);
  if (odd === "re" && cil.id === HOTOVO && nove.bo.faze === CEKA) {
    const u = prvniFazeOdd(z, "bo", true);
    if (u) nove.bo = zaznam(u);
  }
  return nove;
}
