// Texty nabídek pro zákazníka podle typu zakázky — nová FVE (FVE), servis
// (SRV), rozšíření FVE (FVR), hromosvody (HRM) a elektroinstalace (ELK).
// Všechny typy se zobrazují stejným náhledem (NabidkaNahled.jsx), liší se
// jen tím, co se do něj napíše. Samostatný soubor (ne komponenta), ať se dá
// použít odkudkoliv a ať je na jednom místě vidět, jak nabídka pro který typ zní.

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

// Výchozí "co je / není v ceně" podle typu. U nové FVE je seznam přímo
// v PRAZDNA_FVE (fvePresets.js, podle firemní šablony). Dřív se u servisu
// omylem přebíral seznam pro novou instalaci FVE (Dodávka FVE, Instalace
// FVE, připojení k DS…), což slibovalo věci, které se nedělají.
const VYCHOZI_SEZNAMY = {
  SRV: {
    zahrnuto: ["Provedení úkonů uvedených v nabídce", "Předání a vysvětlení výsledků"],
    nezahrnuto: ["Materiál a náhradní díly, které nejsou uvedeny v nabídce", "Odstranění závad zjištěných během servisu — naceníme zvlášť po dohodě"],
  },
  FVR: {
    zahrnuto: ["Dodávka komponent uvedených v nabídce", "Montáž a zapojení", "Nastavení a zprovoznění rozšířené elektrárny", "Předání a vysvětlení obsluhy"],
    nezahrnuto: ["Úpravy stávající instalace, které nejsou uvedeny v nabídce"],
  },
  HRM: {
    zahrnuto: ["Dodávka materiálu uvedeného v nabídce", "Montáž hromosvodu — jímací soustava, svody a uzemnění", "Doprava", "Výchozí revize hromosvodu a revizní zpráva"],
    nezahrnuto: ["Zemní a stavební práce, pokud nejsou uvedeny v nabídce", "Pronájem plošiny nebo lešení, pokud není uveden v nabídce"],
  },
  ELK: {
    zahrnuto: ["Dodávka materiálu uvedeného v nabídce", "Provedení elektroinstalačních prací", "Doprava", "Výchozí revize elektroinstalace a revizní zpráva"],
    nezahrnuto: ["Stavební a zednické práce (sekání, začišťování, malování), pokud nejsou uvedeny v nabídce", "Svítidla a spotřebiče, pokud nejsou uvedeny v nabídce"],
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
// U hromosvodů a elektroinstalací se místo elektrárny mluví o domě.
export const DUVERA = [
  { nadpis: "Zkušenost", text: "Elektroinstalacím a fotovoltaice se věnujeme dlouhodobě — víme, na co si dát pozor." },
  { nadpis: "Individuální přístup", text: "Řešení i nabídku připravujeme na míru Vaší elektrárně a Vašim potřebám." },
  { nadpis: "Vlastní tým", text: "Vše provedou naši technici, bez subdodavatelů — víte, s kým jednáte." },
];
const DUVERA_DUM = DUVERA.map((d) => (d.nadpis === "Individuální přístup"
  ? { ...d, text: "Řešení i nabídku připravujeme na míru Vašemu domu a Vašim potřebám." }
  : d));

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

// Odhad ročního výnosu FVE v MWh (stejně jako dřív ve Wordu): 1,0–1,1 MWh na kWp.
export const odhadVynosu = (vykonKwp) => (vykonKwp > 0 ? `${fmtCislo(vykonKwp * 1.0)}–${fmtCislo(vykonKwp * 1.1)}` : "");

/**
 * @param {object} p
 * @param {"FVE"|"SRV"|"FVR"|"HRM"|"ELK"} p.jobType
 * @param {{nazev: string, popis: string, ks?: string|number}[]} [p.ukony]  úkony (SRV) nebo položky nabídky (HRM, ELK)
 * @param {{label: string, hodnota: string, ks: string}[]} [p.radky]  komponenty / materiál do specifikace
 *        (u FVE celá sestava, u SRV stávající soustava, u FVR to, co se přidává, u HRM rozpis materiálu)
 * @param {number} [p.vykonKwp]  výkon panelů v řádcích (u FVR přidávaný)
 * @param {number} [p.bateriKwh] kapacita baterií v řádcích (u FVR přidávaná)
 * @param {boolean} [p.sDotaci]  (FVE) nabídka počítá s dotací Nová zelená úsporám
 * @param {string} [p.rocniVynos] (FVE) roční výnos v MWh, např. "6,0–6,6"
 * @param {boolean} [p.maBaterii] (FVE) sestava má baterii
 * @param {boolean} [p.prodlouzenaZarukaStridace] (FVE) je zaškrtnutá záruka 10 let na střídač
 * @param {string} [p.cisloOP]   (FVE) číslo obchodního případu
 */
export function textyNabidky({ jobType, ukony = [], radky = [], vykonKwp = 0, bateriKwh = 0, sDotaci = false, rocniVynos = "", maBaterii = false, prodlouzenaZarukaStridace = false, cisloOP = "" }) {
  if (jobType === "FVE") return textyFve({ radky, vykonKwp, bateriKwh, sDotaci, rocniVynos, maBaterii, prodlouzenaZarukaStridace, cisloOP });
  if (jobType === "HRM" || jobType === "ELK") return textyElektro({ jobType, ukony, radky });

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
      cenaNadpis: "Cena rozšíření",
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
    cenaNadpis: "Cena servisu",
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

// Nová fotovoltaická elektrárna — obsah podle dřívější Word šablony
// (nabidka_fve_sablona.docx): sestava, záruky výrobců, dotace NZÚ, platby
// po podpisu smlouvy / předávacího protokolu, 5 kroků k vlastní FVE.
function textyFve({ radky, vykonKwp, bateriKwh, sDotaci, rocniVynos, maBaterii, prodlouzenaZarukaStridace, cisloOP }) {
  const podnadpis = ["Fotovoltaická elektrárna pro Váš rodinný dům"];
  if (vykonKwp > 0) podnadpis.push(`${fmtCislo(vykonKwp)} kWp`);
  if (bateriKwh > 0) podnadpis.push(`baterie ${fmtCislo(bateriKwh)} kWh`);

  const prinos = bateriKwh > 0
    ? "abyste si vyráběli vlastní elektřinu, snížili účty za energie a vyrobenou energii využili i večer a v noci"
    : "abyste si vyráběli vlastní elektřinu a snížili účty za energie";
  const velikost = vykonKwp > 0
    ? ` o výkonu ${fmtCislo(vykonKwp)} kWp${bateriKwh > 0 ? ` s bateriovým úložištěm ${fmtCislo(bateriKwh)} kWh` : ""}`
    : "";

  const specRadky = [];
  if (vykonKwp > 0) specRadky.push({ label: "Výkon FVE", hodnota: `${fmtCislo(vykonKwp)} kWp`, ks: "" });
  specRadky.push(...radky);
  if (radky.length === 0) specRadky.push({ label: "Komponenty elektrárny", hodnota: "[doplnit]", ks: "" });
  if (rocniVynos) specRadky.push({ label: "Předpokládaný roční výnos", hodnota: `${rocniVynos} MWh`, ks: "" });

  return {
    nadpis: "CENOVÁ NABÍDKA",
    podnadpis: podnadpis.join(" · "),
    metaNavic: cisloOP ? `Obchodní případ: ${cisloOP}` : "",
    uvod: `na základě Vašeho zájmu Vám posíláme nabídku fotovoltaické elektrárny${velikost} — ${prinos}.${
      sDotaci ? " Sestava je navržená tak, aby splňovala podmínky dotačního programu Nová zelená úsporám." : ""}`,
    cenaNadpis: "Cena fotovoltaické elektrárny",
    maUkony: false,
    ukony: [],
    zpracovani: `Nabídku jsme připravili na míru podle Vaší poptávky, spotřeby a možností Vaší střechy. Postaráme se o vše od návrhu přes vyřízení připojení k distribuční síti${
      sDotaci ? " a dotace" : ""} až po instalaci, spuštění a předání elektrárny.`,
    nadpisSpecifikace: "Návrh řešení fotovoltaické elektrárny",
    specRadky,
    terminPred: "Instalaci provedeme do",
    terminOd: "od podpisu smlouvy a zaplacení zálohy",
    doplatekKdy: "po podpisu předávacího protokolu",
    zarukaMaterialLabel: "Ostatní komponenty (elektroinstalace apod.)",
    zarukyNavic: [
      { k: "zarukaPanelyVykon", label: "Výkon FV panelů", hodnota: "25 let (dle technického listu panelů)" },
      { k: "zarukaPanelyProdukt", label: "Produktová záruka na FV panely", hodnota: "12 let" },
      { k: "zarukaStridac", label: "Střídač", hodnota: prodlouzenaZarukaStridace ? "10 let (prodloužená záruka)" : "10 let" },
      ...(maBaterii ? [{ k: "zarukaBaterie", label: "Baterie", hodnota: "10 let" }] : []),
    ],
    nadpisPostup: "Získat vlastní FVE s Jurenka Elektro je snadné",
    krok1: "Nezávazná poptávka",
    krok2: "Prohlídka a návrh sestavy",
    krok3: "Nabídka na míru (tento dokument)",
    krok4: `Podpis smlouvy, vyřízení připojení${sDotaci ? " a dotace" : ""}`,
    krok5: `Instalace, spuštění a předání${sDotaci ? ", vyplacení dotace" : ""}`,
  };
}

// Hromosvody (HRM) a elektroinstalace (ELK) — položky nabídky jsou sekce
// z "Nabídky pro zákazníka" (název, popis, cena bez DPH), specifikace je
// u hromosvodu rozpis materiálu z kusovníků, u elektroinstalace rozsah prací.
function textyElektro({ jobType, ukony, radky }) {
  const hrm = jobType === "HRM";
  const platne = ukony
    .map((u) => ({ nazev: (u.nazev || "").trim(), popis: (u.popis || "").trim(), ks: String(u.ks ?? "").trim() }))
    .filter((u) => u.nazev || u.popis);
  return {
    nadpis: "CENOVÁ NABÍDKA",
    podnadpis: hrm ? "Hromosvod — ochrana Vašeho domu před bleskem" : "Elektroinstalace",
    uvod: hrm
      ? "na základě Vaší poptávky Vám posíláme nabídku hromosvodu — aby byl Váš dům i všichni v něm chránění před úderem blesku a stavba splňovala platné normy."
      : "na základě Vaší poptávky Vám posíláme nabídku elektroinstalačních prací — aby byla elektroinstalace ve Vašem domě bezpečná, spolehlivá a odpovídala platným normám.",
    cenaNadpis: hrm ? "Cena hromosvodu" : "Cena elektroinstalace",
    duvera: DUVERA_DUM,
    mistoLabel: "Místo realizace",
    maUkony: true,
    maMaterial: true,
    ukony: platne,
    ukonySloupec: "POLOŽKA",
    ukonyChybi: "položky nabídky (rozepiš cenu do sekcí)",
    ukonBezCenyText: "částka u některé sekce",
    zpracovani: hrm
      ? "Nabídku jsme připravili na míru podle Vaší poptávky a prohlídky objektu. Níže najdete, co provedeme, rozpis materiálu, cenu a podmínky."
      : "Nabídku jsme připravili na míru podle Vaší poptávky a prohlídky na místě. Níže najdete rozsah prací, cenu a podmínky provedení.",
    nadpisSpecifikace: hrm ? "Rozpis materiálu" : "Rozsah prací",
    specRadky: radky,
    specSloupecKs: "MNOŽSTVÍ",
    nadpisPostup: `Jak probíhá ${hrm ? "montáž hromosvodu" : "zakázka"} s Jurenka Elektro`,
    krok1: "Poptávka a domluva prohlídky",
    krok2: hrm ? "Prohlídka objektu" : "Prohlídka a zaměření",
    krok3: "Nabídka (tento dokument)",
    krok4: "Odsouhlasení nabídky",
    krok5: hrm ? "Montáž, revize a předání" : "Provedení, revize a předání",
  };
}
