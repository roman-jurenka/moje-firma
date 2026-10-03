// ─── Checklist materiálu zakázky (fáze Materiál a termín) ────────────────────
// Komponenty se načtou z propojené nabídky (FVE kalkulace, kusovník
// hromosvodu / elektroinstalace) a u každé se označí, jestli je na skladě,
// je potřeba ji objednat, nebo už je objednaná. Ukládá se do
// zakazky_prubeh.material jako [{ id, nazev, ks, jednotka, stav, skladem, poznamka }].

export const STAVY_MATERIALU = [
  { id: "sklad", label: "Na skladě", barva: "#15803d", svetla: "#dcfce7" },
  { id: "objednano", label: "Objednáno", barva: "#0369a1", svetla: "#e0f2fe" },
  { id: "objednat", label: "Objednat", barva: "#b45309", svetla: "#fef3c7" },
];

// Vztahy kontaktní osoby k zákazníkovi — nabídka v poli (dá se napsat i jiný).
export const VZTAHY_KONTAKTU = ["manželka", "manžel", "partner/ka", "syn", "dcera", "rodiče", "soused", "stavbyvedoucí", "správce objektu", "nájemník", "kolega"];

const FVE_KOMPONENTY = [
  ["panel", "FV panely"], ["konstrukce", "Konstrukce"], ["stridac", "Střídač"], ["baterie", "Baterie"], ["bms", "BMS"],
  ["rozvadecDc", "Rozvaděč DC"], ["ostatniFixed", "Elektro materiál"], ["backup", "Back-up"], ["wallbox", "Wallbox"],
  ["regulace", "Regulace"], ["bojler", "Bojler"],
];

const novaId = () => Math.random().toString(36).slice(2, 10);

// Položky z nabídky (bez stavu — ten se vybírá v checklistu).
export function polozkyZNabidky(quote) {
  const d = quote?.data || {};
  const radky = [];
  const pridat = (nazev, ks, jednotka = "ks") => {
    const n = String(nazev || "").trim();
    const k = Number(ks) || 0;
    if (!n || k <= 0 || /^bez\b/i.test(n)) return;
    const stejna = radky.find((r) => r.nazev.toLowerCase() === n.toLowerCase() && r.jednotka === jednotka);
    if (stejna) stejna.ks = Math.round((stejna.ks + k) * 100) / 100;
    else radky.push({ id: novaId(), nazev: n, ks: Math.round(k * 100) / 100, jednotka, stav: "", skladem: "", poznamka: "" });
  };
  if (d.fve) {
    FVE_KOMPONENTY.forEach(([k, popis]) => {
      const x = d.fve[k];
      if (!x?.name) return;
      pridat(k === "konstrukce" ? `${popis} — ${x.name}` : x.name, x.qty);
    });
    (d.fve.customRows || []).filter((r) => r.sekce === "material").forEach((r) => pridat(r.name, r.qty));
  }
  (d.interni?.radky || []).flatMap((r) => r.kusovnik || []).forEach((it) => pridat(it.nazev, it.mnozstvi, it.jednotka || "ks"));
  return radky;
}

export const prazdnaPolozka = () => ({ id: novaId(), nazev: "", ks: 1, jednotka: "ks", stav: "", skladem: "", poznamka: "" });

export function souhrnMaterialu(polozky) {
  const p = (polozky || []).filter((x) => String(x.nazev || "").trim());
  return {
    celkem: p.length,
    sklad: p.filter((x) => x.stav === "sklad").length,
    objednano: p.filter((x) => x.stav === "objednano").length,
    objednat: p.filter((x) => x.stav === "objednat").length,
    nevyplneno: p.filter((x) => !x.stav).length,
  };
}
