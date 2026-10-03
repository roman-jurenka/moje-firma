// ─── Checklist materiálu zakázky (fáze Materiál a termín) ────────────────────
// Komponenty se načtou z propojené nabídky (FVE kalkulace, kusovník
// hromosvodu / elektroinstalace) a u každé se označí, jestli je na skladě,
// je potřeba ji objednat, nebo už je objednaná. Ukládá se do
// zakazky_prubeh.material jako [{ id, nazev, ks, jednotka, stav, skladem, poznamka }].

// vyreseno = materiál je zajištěný (skladem / objednaný); pozor = objednaný,
// ale je potřeba hlídat; problem = musí se ještě objednat nebo řešit.
export const STAVY_MATERIALU = [
  { id: "sklad", label: "Na skladě", ikona: "✓", barva: "#15803d", svetla: "#dcfce7", druh: "vyreseno" },
  { id: "objednat", label: "Objednat", ikona: "⚠", barva: "#b45309", svetla: "#fef3c7", druh: "problem" },
  { id: "objednano", label: "Objednáno", ikona: "🛒", barva: "#0369a1", svetla: "#e0f2fe", druh: "vyreseno" },
  { id: "ceka", label: "Čeká na vyjádření dodavatele", ikona: "⏳", barva: "#7c3aed", svetla: "#ede9fe", druh: "pozor" },
  { id: "na_ceste", label: "Na cestě", ikona: "🚚", barva: "#0e7490", svetla: "#cffafe", druh: "vyreseno" },
  { id: "zpozdeni", label: "Dodavatel má zpoždění", ikona: "⏰", barva: "#c2410c", svetla: "#ffedd5", druh: "pozor" },
  { id: "zniceno", label: "Zničeno / poškozeno", ikona: "✕", barva: "#b91c1c", svetla: "#fee2e2", druh: "problem" },
];
export const stavMaterialu = (id) => STAVY_MATERIALU.find((s) => s.id === id) || null;

// ── Rozpad materiálu (šablony) ──
// Komponenta z nabídky (typicky konstrukce „Šikmá střecha“) se v checklistu
// rozloží na díly: množství na 1 kus komponenty (u konstrukce = na 1 panel)
// × počet + pevné množství na celou instalaci. Šablony se definují v Průběhu
// (🧩 Rozpad materiálu) a ukládají do app_settings pod ROZPAD_KEY:
// { sablony: [{ id, komponenta, polozky: [{ id, nazev, naKus, pevne, jednotka }] }] }
export const ROZPAD_KEY = "material_rozpad";

// Jednotky materiálu — kusové (ks, sada, bal) se zaokrouhlují nahoru na celé, m a kg na setiny.
export const JEDNOTKY_MATERIALU = ["ks", "m", "kg", "sada", "bal"];

const zaokrouhlit = (x, jednotka) => (/^(ks|kus|sada|bal)/i.test(jednotka || "ks") ? Math.ceil(x - 1e-9) : Math.round(x * 100) / 100);

export function najdiSablonu(nazevKomponenty, sablony) {
  const n = String(nazevKomponenty || "").trim().toLowerCase();
  return (sablony || []).find((s) => String(s.komponenta || "").trim().toLowerCase() === n && (s.polozky || []).some((p) => String(p.nazev || "").trim())) || null;
}

// [{ nazev, ks, jednotka }] pro daný počet (u konstrukce počet panelů)
export function rozpadKomponenty(sablona, pocet) {
  return (sablona?.polozky || [])
    .filter((p) => String(p.nazev || "").trim())
    .map((p) => {
      const jednotka = p.jednotka || "ks";
      return { nazev: p.nazev.trim(), jednotka, ks: zaokrouhlit((Number(p.naKus) || 0) * (Number(pocet) || 0) + (Number(p.pevne) || 0), jednotka) };
    })
    .filter((p) => p.ks > 0);
}

// Vztahy kontaktní osoby k zákazníkovi — nabídka v poli (dá se napsat i jiný).
export const VZTAHY_KONTAKTU = ["manželka", "manžel", "partner/ka", "syn", "dcera", "rodiče", "soused", "stavbyvedoucí", "správce objektu", "nájemník", "kolega"];

const FVE_KOMPONENTY = [
  ["panel", "FV panely"], ["konstrukce", "Konstrukce"], ["stridac", "Střídač"], ["baterie", "Baterie"], ["bms", "BMS"],
  ["rozvadecDc", "Rozvaděč DC"], ["ostatniFixed", "Elektro materiál"], ["backup", "Back-up"], ["wallbox", "Wallbox"],
  ["regulace", "Regulace"], ["bojler", "Bojler"],
];

const novaId = () => Math.random().toString(36).slice(2, 10);

// Položky z nabídky (bez stavu — ten se vybírá v checklistu). Komponenta,
// pro kterou existuje šablona rozpadu, se vypíše po dílech.
export function polozkyZNabidky(quote, sablony = []) {
  const d = quote?.data || {};
  const radky = [];
  let extra = {}; // doplňující údaje k právě přidávaným řádkům (odkud jsou z rozpadu)
  const pridat = (nazev, ks, jednotka = "ks") => {
    const n = String(nazev || "").trim();
    const k = Number(ks) || 0;
    if (!n || k <= 0 || /^bez\b/i.test(n)) return;
    const stejna = radky.find((r) => r.nazev.toLowerCase() === n.toLowerCase() && r.jednotka === jednotka);
    if (stejna) stejna.ks = Math.round((stejna.ks + k) * 100) / 100;
    else radky.push({ id: novaId(), nazev: n, ks: Math.round(k * 100) / 100, jednotka, stav: "", skladem: "", poznamka: "", ...extra });
  };
  if (d.fve) {
    FVE_KOMPONENTY.forEach(([k, popis]) => {
      const x = d.fve[k];
      if (!x?.name) return;
      const sablona = najdiSablonu(x.name, sablony);
      if (sablona && (Number(x.qty) || 0) > 0) {
        // rozpad: u konstrukce je qty počet panelů
        extra = { zRozpadu: `${popis} — ${x.name} (${x.qty} ${k === "konstrukce" ? "panelů" : "ks"})` };
        rozpadKomponenty(sablona, x.qty).forEach((r) => pridat(r.nazev, r.ks, r.jednotka));
        extra = {};
        return;
      }
      pridat(k === "konstrukce" ? `${popis} — ${x.name}` : x.name, x.qty);
    });
    (d.fve.customRows || []).filter((r) => r.sekce === "material").forEach((r) => pridat(r.name, r.qty));
  }
  (d.interni?.radky || []).flatMap((r) => r.kusovnik || []).forEach((it) => pridat(it.nazev, it.mnozstvi, it.jednotka || "ks"));
  return radky;
}

// ── Stav skladu (modul Sklad, tabulka products) ──
// Název z nabídky se se skladem páruje bez ohledu na velikost písmen,
// diakritiku a interpunkci; shoda i podle kódu (SKU) nebo když jeden název
// obsahuje druhý (např. „Kabel CYKY 5x6“ × „kabel cyky 5x6 mm2“).
const normalizovat = (s) => String(s || "").toLowerCase().replace(/×/g, "x").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
// bez mezer — „455 Wp“ = „455Wp“, „5 x 6“ = „5x6“
const kompakt = (s) => normalizovat(s).replace(/ /g, "");

export function najdiVeSkladu(nazev, produkty) {
  const n = kompakt(nazev);
  if (!n || !produkty?.length) return null;
  const s = produkty.map((p) => ({ p, n: kompakt(p.name), sku: kompakt(p.sku) }));
  return (s.find((x) => x.n === n)
    || s.find((x) => x.sku && x.sku.length >= 3 && n.includes(x.sku))
    || s.find((x) => x.n.length >= 5 && n.length >= 5 && (x.n.includes(n) || n.includes(x.n))))?.p || null;
}

// { druh: "dost" | "malo" | "neni" | "nevede", stock, unit }
export function stavSkladu(polozka, produkty) {
  const p = najdiVeSkladu(polozka.nazev, produkty);
  if (!p) return { druh: "nevede", stock: null, unit: null };
  const stock = Number(p.stock) || 0;
  const potreba = Number(polozka.ks) || 0;
  return { druh: stock <= 0 ? "neni" : stock >= potreba ? "dost" : "malo", stock, unit: p.unit || "ks" };
}

// Předvyplní stav u položek, které ho ještě nemají, podle skladu:
// dost → Na skladě, málo → Objednat (skladem kolik je), nic → Objednat.
export function predvyplnitZeSkladu(polozky, produkty) {
  return polozky.map((x) => {
    if (x.stav) return x;
    const s = stavSkladu(x, produkty);
    if (s.druh === "dost") return { ...x, stav: "sklad", skladem: String(x.ks) };
    if (s.druh === "malo") return { ...x, stav: "objednat", skladem: String(s.stock) };
    if (s.druh === "neni") return { ...x, stav: "objednat", skladem: "0" };
    return x;
  });
}

export const prazdnaPolozka = () => ({ id: novaId(), nazev: "", ks: 1, jednotka: "ks", stav: "", skladem: "", poznamka: "" });

export function souhrnMaterialu(polozky) {
  const p = (polozky || []).filter((x) => String(x.nazev || "").trim());
  const pocty = Object.fromEntries(STAVY_MATERIALU.map((s) => [s.id, p.filter((x) => x.stav === s.id).length]));
  const podleDruhu = (d) => p.filter((x) => stavMaterialu(x.stav)?.druh === d).length;
  return {
    celkem: p.length,
    pocty,
    sklad: pocty.sklad,
    objednano: pocty.objednano,
    objednat: pocty.objednat,
    vyreseno: podleDruhu("vyreseno"),
    pozor: podleDruhu("pozor"),
    problem: podleDruhu("problem"),
    nevyplneno: p.filter((x) => !stavMaterialu(x.stav)).length,
  };
}
