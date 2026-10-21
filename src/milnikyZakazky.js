// ─── Úřední milníky a platební kalendář zakázky ──────────────────────────────
// Milníky = data úředních kroků (distributor, dotace, revize). Ukládají se do
// zakazky_prubeh.milniky jako { [id]: "RRRR-MM-DD" }. Vyplněný milník sám
// odškrtne navázaný úkol fáze (úkol má auto "m_<id>", viz autoMilniku).
// Platební kalendář = zakazky_prubeh.platebni_plan: [{ id, nazev, procent, kdy,
// datum, doplatek, invoice_id, invoice_cislo }] — platby navázané na milník
// zakázky; když milník nastane, platba je „k vystavení“.
import { fazeById } from "./prubehFaze.js";

const FVE = ["FVE", "FVR", "FVO"];
export const SKUPINY_MILNIKU = [
  { id: "distributor", nazev: "Distributor", typy: [...FVE, "ELK"] },
  { id: "dotace", nazev: "Dotace", typy: FVE },
  { id: "revize", nazev: "Revize", typy: null }, // null = všechny typy
];

// ceka = [milník, dní]: když je ten milník vyplněný a tenhle ne déle než
// „dní“, zakázka svítí (distributor / úřad dlouho neodpovídá).
// lhuta = datum je konec lhůty (ne splnění) — hlídá se, dokud nenastane hlida.
export const MILNIKY = [
  { id: "zadost_pripojeni", skupina: "distributor", nazev: "Žádost o připojení podaná" },
  { id: "sop_prijata", skupina: "distributor", nazev: "Smlouva o připojení (SoP) přijatá", ceka: ["zadost_pripojeni", 30] },
  { id: "sop_vyprsi", skupina: "distributor", nazev: "SoP platí do", lhuta: true, hlida: "pretoky", predem: 30 },
  { id: "elmr_objednan", skupina: "distributor", nazev: "Výměna elektroměru objednaná" },
  { id: "elmr_vymenen", skupina: "distributor", nazev: "Elektroměr vyměněný", ceka: ["elmr_objednan", 30] },
  { id: "pretoky", skupina: "distributor", nazev: "Přetoky povolené (PPP)" },
  { id: "dotace_podana", skupina: "dotace", nazev: "Žádost o dotaci podaná" },
  { id: "dotace_schvalena", skupina: "dotace", nazev: "Dotace schválená", ceka: ["dotace_podana", 60] },
  { id: "dotace_dolozena", skupina: "dotace", nazev: "Realizace doložená" },
  { id: "dotace_vyplacena", skupina: "dotace", nazev: "Dotace vyplacená", ceka: ["dotace_dolozena", 60] },
  { id: "revize", skupina: "revize", nazev: "Revize hotová" },
];
export const milnikById = Object.fromEntries(MILNIKY.map((m) => [m.id, m]));

const plati = (skupina, typ) => !skupina.typy || skupina.typy.includes(typ);
export const skupinyPro = (typ) => SKUPINY_MILNIKU.filter((s) => plati(s, typ))
  .map((s) => ({ ...s, milniky: MILNIKY.filter((m) => m.skupina === s.id) }));

const dnyMezi = (odIso, doIso) => Math.round((new Date(doIso + "T00:00:00") - new Date(odIso + "T00:00:00")) / 86400000);
const fmt = (iso) => { const [r, m, d] = String(iso).slice(0, 10).split("-").map(Number); return `${d}. ${m}. ${r}`; };

// Nový objekt milníků s nastaveným / smazaným datem.
export function nastavMilnik(milniky, id, datum) {
  const m = { ...(milniky || {}) };
  if (datum) m[id] = datum; else delete m[id];
  return m;
}

// Pro autoZ v Průběhu: { m_zadost_pripojeni: true, … } podle vyplněných milníků.
export function autoMilniku(z) {
  const m = z.milniky || {};
  return Object.fromEntries(MILNIKY.filter((x) => !x.lhuta).map((x) => [`m_${x.id}`, !!m[x.id]]));
}

// Upozornění k jednomu milníku: { uroven: "chyba" | "pozor", text } nebo null.
export function stavMilniku(z, milnik, dnes) {
  const m = z.milniky || {};
  if (milnik.lhuta) {
    if (!m[milnik.id] || (milnik.hlida && m[milnik.hlida])) return null;
    const zbyva = dnyMezi(dnes, m[milnik.id]);
    if (zbyva < 0) return { uroven: "chyba", text: `${milnik.nazev} ${fmt(m[milnik.id])} — lhůta vypršela` };
    if (zbyva <= (milnik.predem || 30)) return { uroven: zbyva <= 7 ? "chyba" : "pozor", text: `${milnik.nazev} ${fmt(m[milnik.id])} — zbývá ${zbyva} dní` };
    return null;
  }
  if (m[milnik.id] || !milnik.ceka) return null;
  const [od, limit] = milnik.ceka;
  if (!m[od]) return null;
  const dni = dnyMezi(m[od], dnes);
  return dni > limit ? { uroven: "pozor", text: `${milnik.nazev}: čeká se ${dni} dní (od ${fmt(m[od])})` } : null;
}

export function upozorneniMilniku(z, dnes) {
  if (z.stav !== "otevrena") return [];
  return skupinyPro(z.typ).flatMap((s) => s.milniky).map((x) => stavMilniku(z, x, dnes)).filter(Boolean);
}

// ── Platební kalendář ──
const PORADI_SEKCI = ["ob", "bo", "re", "uz"];
const sekceIndex = (z) => PORADI_SEKCI.indexOf(fazeById[z.faze]?.sekce);
const hotovo = (z, klic) => !!(z.hotove_ukoly || {})[klic];

// Kdy je platba splatná k vystavení (milník zakázky).
export const KDY_PLATBY = [
  { id: "podpis", nazev: "po podpisu smlouvy", splneno: (z) => hotovo(z, "smlouva.podpis") || sekceIndex(z) >= 1 },
  { id: "sop", nazev: "po přijetí SoP", splneno: (z) => !!z.milniky?.sop_prijata },
  { id: "zahajeni", nazev: "při zahájení montáže", splneno: (z) => sekceIndex(z) >= 2 },
  { id: "predani", nazev: "po předání díla", splneno: (z) => hotovo(z, "predani.protokol") || sekceIndex(z) >= 3 },
  { id: "pretoky", nazev: "po povolení přetoků", splneno: (z) => !!z.milniky?.pretoky },
  { id: "dotace", nazev: "po vyplacení dotace", splneno: (z) => !!z.milniky?.dotace_vyplacena },
  { id: "datum", nazev: "k datu", splneno: (z, p, dnes) => !!p.datum && p.datum <= dnes },
];
export const kdyById = Object.fromEntries(KDY_PLATBY.map((k) => [k.id, k]));
export const popisKdy = (p) => (p.kdy === "datum" && p.datum ? `k ${fmt(p.datum)}` : kdyById[p.kdy]?.nazev || "");

const noveId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const SABLONY_PLATEB = [
  { id: "50-50", nazev: "50 % záloha / doplatek po předání", radky: [["Záloha", 50, "podpis"], ["Doplatek", null, "predani"]] },
  { id: "30-60-10", nazev: "30 % / 60 % / doplatek", radky: [["Záloha po podpisu", 30, "podpis"], ["Záloha při zahájení montáže", 60, "zahajeni"], ["Doplatek", null, "predani"]] },
  { id: "bez", nazev: "Bez zálohy — celé po předání", radky: [["Faktura", null, "predani"]] },
];
export const planZeSablony = (sablona) => sablona.radky.map(([nazev, procent, kdy]) => ({
  id: noveId(), nazev, procent, kdy, doplatek: procent == null,
}));
export const novaPlatba = () => ({ id: noveId(), nazev: "Záloha", procent: 30, kdy: "podpis", doplatek: false });

// Procento doplatku = zbytek do 100 % po ostatních platbách.
export const procentoDoplatku = (plan) => Math.max(0, 100 - (plan || []).filter((p) => !p.doplatek).reduce((s, p) => s + (Number(p.procent) || 0), 0));
export const procentoPlatby = (p, plan) => (p.doplatek ? procentoDoplatku(plan) : Number(p.procent) || 0);
export const platbaSplatna = (z, p, dnes) => !!kdyById[p.kdy]?.splneno(z, p, dnes);

// Platby, které už nastaly, ale faktura k nim ještě není.
export const platbyKVystaveni = (z, dnes) => (z.stav === "otevrena" ? (z.platebni_plan || []) : [])
  .filter((p) => !p.invoice_id && platbaSplatna(z, p, dnes));

// Štítky do seznamu zakázek: lhůty milníků + platby k vystavení.
export function stitkyZakazky(z, dnes) {
  return [
    ...upozorneniMilniku(z, dnes),
    ...platbyKVystaveni(z, dnes).map((p) => ({ uroven: "faktura", text: `🧾 k fakturaci: ${p.nazev}` })),
  ];
}
