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
    prinos: "aby byla bezpečná a měla platnou revizi",
    popis: "Revize elektrické instalace fotovoltaické elektrárny — kontrola, měření a vystavení revizní zprávy.",
  },
  {
    id: "diagnostika",
    label: "Diagnostika",
    prinos: "abychom našli příčinu problému a vše zase fungovalo, jak má",
    popis: "Kontrola funkce elektrárny, vyčtení chyb a provozních dat ze střídače, měření panelových řetězců a zjištění příčiny případné závady.",
  },
  {
    id: "cisteni",
    label: "Čištění FVE panelů",
    prinos: "aby panely znovu vyráběly naplno",
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

// Doprava jde přidat jako úkon (má svou cenu), ale do nadpisu a úvodu se nepíše.
export const UKON_DOPRAVA = { typ: "doprava", nazev: "Doprava", popis: "Doprava na místo a zpět." };

// Cena servisu = součet úkonů: cena za kus (Kč bez DPH) × počet ks
// (prázdný počet = 1). Úkon bez vyplněné ceny se počítá jako 0 a hlásí se.
export const cenaUkonu = (u) => (Number(u?.cena) || 0) * (String(u?.ks ?? "").trim() === "" ? 1 : Number(u.ks) || 0);
export const soucetUkonu = (ukony) => (ukony || []).reduce((s, u) => s + cenaUkonu(u), 0);
export const ukonBezCeny = (u) => (u?.nazev || "").trim() !== "" && String(u?.cena ?? "").trim() === "";

// Výchozí "co je / není v ceně" pro servis a rozšíření. Dřív se omylem
// přebíral seznam pro novou instalaci FVE (Dodávka FVE, Instalace FVE,
// připojení k DS…), což u servisu slibovalo věci, které se nedělají.
const VYCHOZI_SEZNAMY = {
  SRV: {
    zahrnuto: ["Provedení úkonů uvedených v nabídce", "Předání a vysvětlení výsledků"],
    nezahrnuto: ["Materiál a náhradní díly, které nejsou uvedeny v nabídce", "Odstranění závad zjištěných během servisu — naceníme zvlášť po dohodě"],
  },
  FVR: {
    zahrnuto: ["Dodávka komponent uvedených v nabídce", "Montáž a zapojení", "Nastavení a zprovoznění rozšířené elektrárny", "Předání a vysvětlení obsluhy"],
    nezahrnuto: ["Úpravy stávající instalace, které nejsou uvedeny v nabídce"],
  },
};
export function seznamyPodleTypu(jobType) {
  const s = VYCHOZI_SEZNAMY[jobType];
  if (!s) return {};
  const p = jobType.toLowerCase();
  return {
    zahrnutoItems: s.zahrnuto.map((text, i) => ({ id: `${p}z${i + 1}`, text, checked: true })),
    nezahrnutoItems: s.nezahrnuto.map((text, i) => ({ id: `${p}n${i + 1}`, text, checked: true })),
  };
}
// Má nabídka pořád zaškrtnuté položky z výchozího seznamu pro novou FVE?
export const maSeznamNoveFve = (cfg) => (cfg?.zahrnutoItems || []).some((it) => /^z\d+$/.test(it.id) && it.checked);

const fmtCislo = (n) => (Math.round((Number(n) || 0) * 10) / 10).toString().replace(".", ",");

// Tři důvody důvěry — v nabídce jako pruh pod cenou (úvod mluví o zákazníkovi).
export const DUVERA = [
  { nadpis: "Zkušenost", text: "Elektroinstalacím a fotovoltaice se věnujeme dlouhodobě — víme, na co si dát pozor." },
  { nadpis: "Individuální přístup", text: "Řešení i nabídku připravujeme na míru Vaší elektrárně a Vašim potřebám." },
  { nadpis: "Vlastní tým", text: "Vše provedou naši technici, bez subdodavatelů — víte, s kým jednáte." },
];

// Změna připojení u distributora u rozšíření — někdy je potřeba a je v ceně,
// někdy ne. Volí se u každé nabídky v kalkulaci a propíše se do "co je / není v ceně".
export const ZMENA_PRIPOJENI = {
  vcene: { label: "je v ceně", text: "Vyřízení změny připojení u distributora" },
  mimo: { label: "není v ceně", text: "Vyřízení změny připojení u distributora (pokud ji distributor vyžaduje)" },
};

// Úkony, u kterých se nic nedodává — u nabídky jen s nimi nemá smysl
// uvádět záruku na dodaný materiál (bod 10). Vlastní úkony (např. výměna
// dílu) se berou jako úkony s materiálem.
const BEZ_MATERIALU = ["revize", "diagnostika", "cisteni", "doprava"];
export const ukonyMajiMaterial = (ukony) =>
  (ukony || []).some((u) => (u.nazev || "").trim() && !BEZ_MATERIALU.includes(u.typ));

/**
 * @param {object} p
 * @param {"SRV"|"FVR"} p.jobType
 * @param {{nazev: string, popis: string, ks?: string|number}[]} [p.ukony]  servisní úkony (jen SRV)
 * @param {{label: string, hodnota: string, ks: string}[]} [p.radky]  komponenty s množstvím > 0
 *        (u SRV stávající soustava, u FVR to, co se přidává)
 * @param {number} [p.vykonKwp]  výkon panelů v řádcích (u FVR přidávaný)
 * @param {number} [p.bateriKwh] kapacita baterií v řádcích (u FVR přidávaná)
 */
export function textyNabidky({ jobType, ukony = [], radky = [], vykonKwp = 0, bateriKwh = 0 }) {
  if (jobType === "FVR") {
    const plus = [];
    if (vykonKwp > 0) plus.push(`+${fmtCislo(vykonKwp)} kWp`);
    if (bateriKwh > 0) plus.push(`+${fmtCislo(bateriKwh)} kWh baterie`);

    const specRadky = [];
    if (vykonKwp > 0) specRadky.push({ label: "Přidaný výkon FVE", hodnota: `+${fmtCislo(vykonKwp)} kWp`, ks: "" });
    specRadky.push(...radky);
    if (radky.length === 0) specRadky.push({ label: "Přidávané komponenty", hodnota: "[doplnit]", ks: "" });
    // cena rozšíření je v cenovém boxu pod úvodem, ne ve specifikaci

    return {
      nadpis: "CENOVÁ NABÍDKA",
      podnadpis: ["Rozšíření fotovoltaické elektrárny", ...plus].join(" · "),
      uvod: `na základě Vaší poptávky Vám posíláme nabídku na rozšíření Vaší fotovoltaické elektrárny${
        vykonKwp > 0 && bateriKwh > 0 ? " — víc vlastní vyrobené energie a víc místa na její uložení na večer a noc"
          : vykonKwp > 0 ? " — aby Vaše elektrárna vyrobila víc vlastní energie"
            : bateriKwh > 0 ? " — abyste víc vlastní vyrobené energie uložili a využili i večer a v noci"
              : ""}.`,
      maUkony: false,
      ukony: [],
      zpracovani: "Nabídku jsme připravili na míru podle Vaší poptávky a údajů o Vaší stávající elektrárně. Níže najdete, co se bude přidávat, a podmínky provedení.",
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
    .map((u) => ({ typ: u.typ, nazev: (u.nazev || "").trim(), popis: (u.popis || "").trim(), ks: String(u.ks ?? "").trim() }))
    .filter((u) => u.nazev || u.popis)
    .map((u) => ({ typ: u.typ, nazev: u.nazev || "Úkon", popis: u.popis || "[doplnit popis]", ks: u.ks }));
  const ukonyDoc = platne.length ? platne : [{ nazev: "Rozsah prací", popis: "[doplnit — co se bude provádět]", ks: "" }];
  const nazvy = platne.filter((u) => u.typ !== UKON_DOPRAVA.typ).map((u) => u.nazev);

  const podnadpis = [nazvy.length ? nazvy.join(" · ") : "Servis fotovoltaické elektrárny"];
  if (vykonKwp > 0) podnadpis.push(`výkon ${fmtCislo(vykonKwp)} kWp`);
  if (bateriKwh > 0) podnadpis.push(`baterie ${fmtCislo(bateriKwh)} kWh`);

  // Úvod začíná přínosem pro zákazníka (podle zvolených úkonů), ne firmou.
  const prinosy = DRUHY_SERVISU.filter((d) => platne.some((u) => u.typ === d.id)).map((d) => d.prinos);
  const prinosText = prinosy.length
    ? prinosy.length === 1 ? prinosy[0] : prinosy.slice(0, -1).join(", ") + " a " + prinosy[prinosy.length - 1]
    : "aby spolehlivě vyráběla a byla v bezpečném stavu";
  const uvodUkony = nazvy.length ? ` Konkrétně jde o: ${nazvy.map((n) => n.charAt(0).toLowerCase() + n.slice(1)).join(", ")}.` : "";

  const specRadky = [];
  if (vykonKwp > 0) specRadky.push({ label: "Instalovaný výkon FVE", hodnota: `${fmtCislo(vykonKwp)} kWp`, ks: "" });
  specRadky.push(...radky);
  if (specRadky.length === 0) specRadky.push({ label: "Parametry soustavy", hodnota: "[doplnit]", ks: "" });
  // cena servisu je v tabulce úkonů (součet úkonů), ne ve specifikaci soustavy

  return {
    nadpis: "SERVISNÍ NABÍDKA",
    podnadpis: podnadpis.join(" · "),
    uvod: `na základě Vaší poptávky Vám posíláme nabídku servisu Vaší fotovoltaické elektrárny — ${prinosText}.${uvodUkony}`,
    maUkony: true,
    ukony: ukonyDoc,
    zpracovani: "Nabídku jsme připravili na míru podle Vaší poptávky a údajů o Vaší elektrárně. Níže najdete přesný rozsah prací, cenu a podmínky provedení.",
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
