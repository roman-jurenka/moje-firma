// Texty Word nabídky pro servis (SRV) a rozšíření FVE (FVR) — obě používají
// šablonu public/templates/nabidka_servis_sablona.docx, liší se jen tím, co
// se do ní napíše. Samostatný soubor (ne komponenta), ať se dá použít
// odkudkoliv a ať je na jednom místě vidět, jak nabídka pro který typ zní.

// Druhy servisu, které se dají u SRV zaškrtnout (i víc najednou).
export const DRUHY_SERVISU = [
  { id: "revize", label: "Revize", fraze: "revizi" },
  { id: "diagnostika", label: "Diagnostika", fraze: "diagnostiku" },
  { id: "cisteni", label: "Čištění FVE panelů", fraze: "čištění FVE panelů" },
];

const fmtCislo = (n) => (Math.round((Number(n) || 0) * 10) / 10).toString().replace(".", ",");

// "a", "a b" → "a a b", "a b c" → "a, b a c"
const spojit = (casti) => (casti.length <= 1 ? casti[0] || "" : casti.slice(0, -1).join(", ") + " a " + casti[casti.length - 1]);

const FIRMA = "Jsme elektrikářská firma Jurenka Elektro — elektroinstalace i fotovoltaiku děláme sami, bez zprostředkování subdodavatelů.";

/**
 * @param {object} p
 * @param {"SRV"|"FVR"} p.jobType
 * @param {string[]} [p.druhServisu]  id z DRUHY_SERVISU (jen SRV)
 * @param {{label: string, hodnota: string}[]} [p.radky]  komponenty s množstvím > 0
 *        (u SRV stávající soustava, u FVR to, co se přidává)
 * @param {number} [p.vykonKwp]  výkon panelů v řádcích (u FVR přidávaný)
 * @param {number} [p.bateriKwh] kapacita baterií v řádcích (u FVR přidávaná)
 * @param {string} p.cenaText  hotová cena k zobrazení, např. "18 500 Kč"
 */
export function textyNabidky({ jobType, druhServisu = [], radky = [], vykonKwp = 0, bateriKwh = 0, cenaText }) {
  if (jobType === "FVR") {
    const plus = [];
    if (vykonKwp > 0) plus.push(`+${fmtCislo(vykonKwp)} kWp`);
    if (bateriKwh > 0) plus.push(`+${fmtCislo(bateriKwh)} kWh baterie`);

    const specRadky = [];
    if (vykonKwp > 0) specRadky.push({ label: "Přidaný výkon FVE", hodnota: `+${fmtCislo(vykonKwp)} kWp` });
    specRadky.push(...radky);
    if (radky.length === 0) specRadky.push({ label: "Přidávané komponenty", hodnota: "[doplnit]" });
    specRadky.push({ label: "Cena rozšíření", hodnota: cenaText });

    return {
      nadpis: "CENOVÁ NABÍDKA",
      podnadpis: ["Rozšíření fotovoltaické elektrárny", ...plus].join(" · "),
      uvod: `na základě Vaší poptávky Vám zasíláme nabídku na rozšíření Vaší stávající fotovoltaické elektrárny. ${FIRMA}`,
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

  // SRV — revize / diagnostika / čištění panelů; specifikace = stávající soustava
  const vybrane = DRUHY_SERVISU.filter((d) => druhServisu.includes(d.id));
  const podnadpis = [vybrane.length ? vybrane.map((d) => d.label).join(" · ") : "Servis a údržba fotovoltaické elektrárny"];
  if (vykonKwp > 0) podnadpis.push(`výkon ${fmtCislo(vykonKwp)} kWp`);
  if (bateriKwh > 0) podnadpis.push(`baterie ${fmtCislo(bateriKwh)} kWh`);
  const predmet = vybrane.length ? spojit(vybrane.map((d) => d.fraze)) : "servis a údržbu";

  const specRadky = [];
  if (vykonKwp > 0) specRadky.push({ label: "Instalovaný výkon FVE", hodnota: `${fmtCislo(vykonKwp)} kWp` });
  specRadky.push(...radky);
  if (specRadky.length === 0) specRadky.push({ label: "Parametry soustavy", hodnota: "[doplnit]" });
  specRadky.push({ label: "Cena servisu", hodnota: cenaText });

  return {
    nadpis: "SERVISNÍ NABÍDKA",
    podnadpis: podnadpis.join(" · "),
    uvod: `na základě Vaší poptávky Vám zasíláme nabídku na ${predmet} Vaší fotovoltaické elektrárny. ${FIRMA}`,
    zpracovani: "Nabídku jsme připravili podle Vašeho požadavku a údajů o Vaší fotovoltaické elektrárně. Najdete v ní popis Vaší elektrárny, cenu servisu a podmínky provedení. Pokud Vám nabídka vyhovuje, stačí ji potvrdit — domluvíme termín a servis provedeme. S případnými dotazy se na nás kdykoliv obraťte.",
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
