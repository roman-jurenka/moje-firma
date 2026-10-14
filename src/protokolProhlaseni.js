// ─── Prohlášení předávajícího v předávacím protokolu FVE ─────────────────────
// Body prohlášení se před vygenerováním protokolu dají vybrat a upravit podle
// toho, co se u zakázky dělalo (u rozšíření FVE třeba jen baterie nebo
// wallbox). Výchozí výběr se odvodí z kalkulace nabídky.
//
// Zápis textu: [A|B] = volba (vybere se jedna, nevybraná = „A / B *“ ke
// škrtnutí), **text** = tučně. Volba je index (0, 1) nebo null.

export const BODY_PROHLASENI = [
  { id: "panely", nazev: "Panely a pokrývačské práce",
    text: "Předávající prohlašuje, že instalace solárních panelů a pokrývačské práce [**JSOU**|**NEJSOU**] kompletní a bez zjevných závad." },
  { id: "zalohovane", nazev: "Zálohované okruhy",
    text: "Zálohované okruhy, které byly známy v době instalace, jsou odzkoušeny a schopny provozu." },
  { id: "sit", nazev: "Připojení k datové síti",
    text: "Předávající prohlašuje, že solární elektrárna [**JE**|**NENÍ**] připojena k lokální datové síti zákazníka pomocí [**WiFi**|**UTP**]." },
  { id: "funkcni", nazev: "Instalace dokončena a funkční",
    text: "Předávající prohlašuje, že solární elektrárna [**JE**|**NENÍ**] řádně nainstalována, odzkoušena, dokončena a schopna provozu." },
  { id: "azrouter", nazev: "AZrouter",
    text: "V systému fotovoltaické elektrárny [**JE**|**NENÍ**] použita jednotka AZrouter. V případě použití AZrouter jednotky: [**JE** zapojena v měření FVE a chová se jako běžný spotřebič, může využívat energii z baterií|**NENÍ** zapojena v měření a nemůže využívat energii z baterií]." },
  { id: "wallbox", nazev: "Dobíjecí stanice",
    text: "V systému fotovoltaické elektrárny [**JE**|**NENÍ**] nainstalována dobíjecí stanice. V případě použití dobíjecí stanice: [**JE** zapojena v měření FVE a chová se jako běžný spotřebič, může využívat energii z baterií|**NENÍ** zapojena v měření a nemůže využívat energii z baterií]." },
];

export const BODY_PREJIMAJICI = [
  { id: "p-panely", nazev: "Rozložení panelů",
    text: "Přejímající prohlašuje, že umístnění a rozložení panelů na střeše proběhlo po domluvě s techniky a odpovídá jeho požadavkům." },
  { id: "p-zalohovane", nazev: "Zálohované okruhy",
    text: "Přejímající prohlašuje, že byl seznámen s funkcí zálohovaných okruhů, při normálním provozu i při výpadku dodávky el. energie, a to zejména s limitem přetížitelnosti jištění, a se zapojením jmenovaných spotřebičů souhlasí bez výhrad." },
  { id: "p-sit", nazev: "Datová síť",
    text: "Přejímající byl srozuměn s tím, že nepřipojení solární elektrárny k lokální datové síti zákazníka není oprávněným důvodem k reklamaci funkce solární elektrárny." },
  { id: "p-obsluha", nazev: "Seznámení s obsluhou",
    text: "Přejímající dále prohlašuje, že byl seznámen s funkcí solární elektrárny a proškolen na obsluhu díla zejména – zapnutí / vypnutí." },
  { id: "p-staveniste", nazev: "Vyklizené staveniště",
    text: "Přejímající prohlašuje, že staveniště bylo řádně vyklizeno, odpady a nečistoty byly odstraněny a předáno ve stavu nebránícímu zahájit a dokončit přejímací řízení." },
  { id: "p-distributor", nazev: "Vypnuto do výměny elektroměru",
    text: "Přejímající prohlašuje, že byl řádně seznámen s povinností mít solární elektrárnu vypnutou až do doby, než mu technik distributora elektrické energie (PRE, ČEZ, EON) vymění elektroměr a vystaví protokol o připojení k distribuční soustavě. Tento protokol se zavazuje přejímající bezodkladně zaslat na e-mailovou adresu: info@jurenkaelektro.cz." },
  { id: "p-servis", nazev: "Servisní linka",
    text: "Přejímající také prohlašuje, že byl poučen, že v případě poruchy systému je nutné kontaktovat servisní linku předávajícího na e-mailovou adresu info@jurenkaelektro.cz." },
];

const HVEZDA ="\u0001"; // hvězdička „nehodící se škrtněte“ (nesmí kolidovat s **)
const VOLBA = /\[([^\]|]*(?:\|[^\]|]*)+)\]/g;
export const volbyTextu = (text) => [...String(text || "").matchAll(VOLBA)].map((m) => m[1].split("|"));

// Text s vyřešenými volbami (nevybraná volba → „A / B *“).
export function vyresit(text, volby = []) {
  let i = 0;
  return String(text || "").replace(VOLBA, (_, obsah) => {
    const moznosti = obsah.split("|");
    const v = volby[i++];
    return v == null || !moznosti[v] ? `${moznosti.join(" / ")} **${HVEZDA}**` : moznosti[v];
  });
}
// „**tučně**“ → [{ t, b }] pro šablonu Wordu
export function castiTextu(text) {
  const out = [];
  String(text || "").split("**").forEach((t, i) => { if (t) out.push({ t: t.split(HVEZDA).join("*"), b: i % 2 === 1 }); });
  return out;
}
export const bezZnacek = (text) => String(text || "").replace(/\*\*/g, "").split(HVEZDA).join("*");

const aktivni = (x) => !!x && Number(x.qty) > 0 && !!x.name && !/^bez\b/i.test(String(x.name).trim());

// Výchozí body podle typu zakázky a kalkulace nabídky (q.data.fve).
// Nová FVE: všechny body (chybějící AZrouter / wallbox jako NENÍ);
// rozšíření: jen body k tomu, co se dodává.
function coDodavame(fve) {
  const f = fve || {};
  return {
    panely: aktivni(f.panel) || Number(f.konstrukce?.qty) > 0,
    zalohovane: aktivni(f.backup),
    sit: aktivni(f.stridac) || aktivni(f.baterie),
    azrouter: aktivni(f.regulace) && /az/i.test(f.regulace.name),
    wallbox: aktivni(f.wallbox),
  };
}
export function vychoziProhlaseni(typ, fve) {
  const rozsireni = typ === "FVR";
  const ma = coDodavame(fve);
  const bezNabidky = !fve;
  return BODY_PROHLASENI.map((b) => {
    const n = volbyTextu(b.text).length;
    const volby = Array(n).fill(null);
    let zahrnout = true;
    if (b.id === "panely") { zahrnout = bezNabidky || ma.panely || !rozsireni; if (ma.panely) volby[0] = 0; }
    if (b.id === "zalohovane") zahrnout = bezNabidky || ma.zalohovane;
    if (b.id === "sit") zahrnout = bezNabidky || ma.sit || !rozsireni;
    if (b.id === "funkcni") volby[0] = 0;
    if (b.id === "azrouter" || b.id === "wallbox") {
      zahrnout = bezNabidky || ma[b.id] || !rozsireni;
      if (!bezNabidky) volby[0] = ma[b.id] ? 0 : 1;
    }
    return { id: b.id, nazev: b.nazev, text: b.text, volby, zahrnout };
  });
}

// Prohlášení přejímajícího: u rozšíření bez panelů / back-upu / střídače
// odpadnou body o rozložení panelů, zálohovaných okruzích a datové síti.
export function vychoziPrejimajici(typ, fve) {
  const rozsireni = typ === "FVR";
  const ma = coDodavame(fve);
  const bezNabidky = !fve;
  return BODY_PREJIMAJICI.map((b) => {
    let zahrnout = true;
    if (b.id === "p-panely") zahrnout = bezNabidky || ma.panely || !rozsireni;
    if (b.id === "p-zalohovane") zahrnout = bezNabidky || ma.zalohovane;
    if (b.id === "p-sit") zahrnout = bezNabidky || ma.sit || !rozsireni;
    return { id: b.id, nazev: b.nazev, text: b.text, volby: [], zahrnout };
  });
}

export function vychoziPredmet(typ) {
  if (typ === "FVR") return "Dodávka a montáž rozšíření solární elektrárny";
  if (typ === "FVO") return "Dodávka a montáž solární elektrárny na ohřev vody";
  return "Dodávka a montáž solární elektrárny";
}

// Závěrečné prohlášení za „Předávající a přejímající …“ (tučný začátek je v šabloně).
export function vychoziZaver(typ) {
  const co = typ === "FVR" ? "rozšíření solární elektrárny, a solární elektrárna"
    : typ === "FVO" ? "solární elektrárny na ohřev vody, a tato" : "solární elektrárny, a tato";
  return `výslovně prohlašují, že níže uvedeného dne a v místě, resp. na adrese instalace, došlo k dodávce a montáži ${co} je ve stavu, který je zaznamenán v tomto předávacím protokolu. Obsah protokolu odpovídá skutečnosti a údaje v něm zaznamenané jsou pravdivé.`;
}

// Nastavení protokolu → značky šablony: [{ casti: [{ t, b }] }]
// klic "body" = prohlášení předávajícího, "prejimajici" = přejímajícího
export function znackyProhlaseni(nastaveni, klic = "body") {
  return (nastaveni?.[klic] || []).filter((b) => b.zahrnout && String(b.text || "").trim())
    .map((b) => ({ casti: castiTextu(vyresit(b.text, b.volby)) }));
}
