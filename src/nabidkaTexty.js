// Texty Word nabídky pro servis (SRV) a rozšíření FVE (FVR) — obě používají
// šablonu public/templates/nabidka_servis_sablona.docx, liší se jen tím, co
// se do ní napíše. Samostatný soubor (ne komponenta), ať se dá použít
// odkudkoliv a ať je na jednom místě vidět, jak nabídka pro který typ zní.

// Nejčastější servisní úkony — v kalkulačce se přidávají jedním kliknutím
// a popis se dá u každé nabídky upravit. Popis jde do nabídky, aby zákazník
// přesně věděl, co se bude dělat.
export const DRUHY_SERVISU = [
  {
    id: "revize",
    label: "Revize",
    popis: "Revize elektrické instalace fotovoltaické elektrárny — kontrola, měření a vystavení revizní zprávy.",
  },
  {
    id: "diagnostika",
    label: "Diagnostika",
    popis: "Kontrola funkce elektrárny, vyčtení chyb a provozních dat ze střídače, měření panelových řetězců a zjištění příčiny případné závady.",
  },
  {
    id: "cisteni",
    label: "Čištění FVE panelů",
    popis: "Šetrné čištění povrchu fotovoltaických panelů od prachu a usazených nečistot, vizuální kontrola panelů.",
  },
];

// Úkony uložené v nabídce: [{ id, typ, nazev, ks, popis }]. Starší nabídky mají
// jen seznam zaškrtnutých druhů (cfg.druhServisu) — ty se převedou.
export function ukonyZCfg(cfg) {
  if (Array.isArray(cfg?.ukony)) return cfg.ukony;
  return (cfg?.druhServisu || [])
    .map((id) => DRUHY_SERVISU.find((d) => d.id === id))
    .filter(Boolean)
    .map((d) => ({ id: d.id, typ: d.id, nazev: d.label, popis: d.popis }));
}

const fmtCislo = (n) => (Math.round((Number(n) || 0) * 10) / 10).toString().replace(".", ",");

const FIRMA = "Jsme elektrikářská firma Jurenka Elektro — elektroinstalace i fotovoltaiku děláme sami, bez zprostředkování subdodavatelů.";

/**
 * @param {object} p
 * @param {"SRV"|"FVR"} p.jobType
 * @param {{nazev: string, popis: string, ks?: string|number}[]} [p.ukony]  servisní úkony (jen SRV)
 * @param {{label: string, hodnota: string, ks: string}[]} [p.radky]  komponenty s množstvím > 0
 *        (u SRV stávající soustava, u FVR to, co se přidává)
 * @param {number} [p.vykonKwp]  výkon panelů v řádcích (u FVR přidávaný)
 * @param {number} [p.bateriKwh] kapacita baterií v řádcích (u FVR přidávaná)
 * @param {string} p.cenaText  hotová cena k zobrazení, např. "18 500 Kč"
 */
export function textyNabidky({ jobType, ukony = [], radky = [], vykonKwp = 0, bateriKwh = 0, cenaText }) {
  if (jobType === "FVR") {
    const plus = [];
    if (vykonKwp > 0) plus.push(`+${fmtCislo(vykonKwp)} kWp`);
    if (bateriKwh > 0) plus.push(`+${fmtCislo(bateriKwh)} kWh baterie`);

    const specRadky = [];
    if (vykonKwp > 0) specRadky.push({ label: "Přidaný výkon FVE", hodnota: `+${fmtCislo(vykonKwp)} kWp`, ks: "" });
    specRadky.push(...radky);
    if (radky.length === 0) specRadky.push({ label: "Přidávané komponenty", hodnota: "[doplnit]", ks: "" });
    specRadky.push({ label: "Cena rozšíření", hodnota: cenaText, ks: "" });

    return {
      nadpis: "CENOVÁ NABÍDKA",
      podnadpis: ["Rozšíření fotovoltaické elektrárny", ...plus].join(" · "),
      uvod: `na základě Vaší poptávky Vám zasíláme nabídku na rozšíření Vaší stávající fotovoltaické elektrárny. ${FIRMA}`,
      maUkony: false,
      ukony: [],
      zpracovani: "Nabídku jsme připravili podle Vašeho požadavku a údajů o Vaší stávající elektrárně. Najdete v ní přehled toho, co se bude přidávat, cenu rozšíření a podmínky provedení. Pokud Vám nabídka vyhovuje, stačí ji potvrdit — domluvíme termín a rozšíření provedeme. S případnými dotazy se na nás kdykoliv obraťte.",
      nadpisSpecifikace: "Co se bude přidávat",
      specRadky,
      nadpisPostup: "Jak probíhá rozšíření s Jurenka Elektro",
      krok1: "Poptávka a domluva prohlídky",
      krok2: "Prohlídka stávající soustavy",
      krok3: "Nabídka rozšíření (tento dokument)",
      krok4: "Odsouhlasení nabídky",
      krok5: "Instalace, zprovoznění a předání",
    };
  }

  // SRV — úkony (co se bude dělat) + specifikace stávající soustavy
  const platne = ukony
    .map((u) => ({ nazev: (u.nazev || "").trim(), popis: (u.popis || "").trim(), ks: String(u.ks ?? "").trim() }))
    .filter((u) => u.nazev || u.popis)
    .map((u) => ({ nazev: u.nazev || "Úkon", popis: u.popis || "[doplnit popis]", ks: u.ks }));
  const ukonyDoc = platne.length ? platne : [{ nazev: "Rozsah prací", popis: "[doplnit — co se bude provádět]", ks: "" }];
  const nazvy = platne.map((u) => u.nazev);

  const podnadpis = [nazvy.length ? nazvy.join(" · ") : "Servis fotovoltaické elektrárny"];
  if (vykonKwp > 0) podnadpis.push(`výkon ${fmtCislo(vykonKwp)} kWp`);
  if (bateriKwh > 0) podnadpis.push(`baterie ${fmtCislo(bateriKwh)} kWh`);

  const uvodUkony = nazvy.length ? ` Konkrétně jde o: ${nazvy.map((n) => n.charAt(0).toLowerCase() + n.slice(1)).join(", ")}.` : "";

  const specRadky = [];
  if (vykonKwp > 0) specRadky.push({ label: "Instalovaný výkon FVE", hodnota: `${fmtCislo(vykonKwp)} kWp`, ks: "" });
  specRadky.push(...radky);
  if (specRadky.length === 0) specRadky.push({ label: "Parametry soustavy", hodnota: "[doplnit]", ks: "" });
  specRadky.push({ label: "Cena servisu", hodnota: cenaText, ks: "" });

  return {
    nadpis: "SERVISNÍ NABÍDKA",
    podnadpis: podnadpis.join(" · "),
    uvod: `na základě Vaší poptávky Vám zasíláme nabídku servisu Vaší fotovoltaické elektrárny.${uvodUkony} ${FIRMA}`,
    maUkony: true,
    ukony: ukonyDoc,
    zpracovani: "Nabídku jsme připravili podle Vašeho požadavku a údajů o Vaší fotovoltaické elektrárně. Najdete v ní přesný rozsah prací, popis Vaší elektrárny, cenu servisu a podmínky provedení. Pokud Vám nabídka vyhovuje, stačí ji potvrdit — domluvíme termín a servis provedeme. S případnými dotazy se na nás kdykoliv obraťte.",
    nadpisSpecifikace: "Specifikace servisované fotovoltaické elektrárny",
    specRadky,
    nadpisPostup: "Jak probíhá servis s Jurenka Elektro",
    krok1: "Nahlášení požadavku a domluva termínu",
    krok2: "Diagnostika nebo prohlídka na místě",
    krok3: "Nabídka na servis (tento dokument)",
    krok4: "Odsouhlasení nabídky",
    krok5: "Provedení servisu a předání",
  };
}
