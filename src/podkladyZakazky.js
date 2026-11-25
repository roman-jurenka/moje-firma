// ─── Podklady pro realizaci (předávací list obchodníka) ──────────────────────
// Ukládá se do zakazky_prubeh.podklady jako { [sekce]: { [pole]: text } }.
// Stejná definice slouží formuláři v Průběhu i náhledu v detailu akce
// v kalendáři. `pro` = komu sekce hlavně patří (podle „Na starosti“ v
// kalendáři se zaměstnanci zvýrazní jeho pokyny).
// moznosti = nabídka hodnot v poli (dá se napsat i jiná), z = doplnit
// z číselníku: "zamestnanci" nebo "cenik:<kategorie>" (ceník FVE kalkulačky).
// typy = pro které typy zakázek (FVE, HRM, ELK…) se sekce / pole nabízí;
// bez typy = pro všechny. Zakázka bez typu vidí všechno.

import { konecnaCenaNabidky } from "./slevaNabidky.js";

const FV = ["FVE", "FVR", "FVO"];

const BACKUP = ["Celý dům — automatické přepnutí", "Celý dům — ruční přepínač", "Vybrané okruhy", "Bez back-upu"];

export const SEKCE_PODKLADU = [
  { id: "obecne", nazev: "Obecné", ikona: "📁", pole: [
    { id: "odkaz_slozka", label: "Odkaz na složku zakázky (SharePoint / OneDrive)", typ: "odkaz" },
    { id: "onedrive_cesta", label: "OneDrive – cesta", zbytecne: "stačí odkaz na složku" },
    { id: "oz", label: "Obchodník (OZ)", z: "zamestnanci" },
  ] },
  { id: "technicka", nazev: "Technická specifikace FVE", ikona: "⚙️", typy: FV, pole: [
    // panely
    { id: "typ_panelu", label: "Typ panelů", zbytecne: "je v nabídce (Nacenění)", z: "cenik:panel" },
    { id: "zaruka_panely", label: "Záruka na panely", vyber: true, moznosti: ["12 let", "15 let", "20 let", "25 let", "30 let"] },
    { id: "pocet_panelu", label: "Počet panelů (ks)", zbytecne: "je v nabídce" },
    { id: "optimizery", label: "Typ odpojovače / optim.", moznosti: ["Bez optimizérů", "Tigo TS4-A-O (optimizér)", "Tigo TS4-A-2F (rychlé odpojení, 2 panely)", "Tigo TS4-A-F (rychlé odpojení)", "Huawei SUN2000-450W-P", "SolarEdge"] },
    { id: "pocet_optimizeru", label: "Počet odpojovačů / optim." },
    { id: "vykon_kwp", label: "Výkon FVE (kWp)", zbytecne: "spočítá se z nabídky" },
    // střídač
    { id: "typ_stridace", label: "Typ střídače", zbytecne: "je v nabídce", z: "cenik:stridac" },
    { id: "zaruka_stridac", label: "Záruka na střídač", vyber: true, moznosti: ["5 let", "10 let", "12 let", "15 let", "20 let"] },
    { id: "pocet_stridacu", label: "Počet střídačů", zbytecne: "je v nabídce" },
    { id: "pocet_fazi", label: "Počet fází", vyber: true, moznosti: ["1", "3"] },
    // baterie, regulace
    { id: "typ_baterie", label: "Typ baterií", zbytecne: "je v nabídce", z: "cenik:baterie" },
    { id: "pocet_baterii", label: "Počet baterií (ks)", zbytecne: "je v nabídce" },
    { id: "kapacita", label: "Celková kapacita (kWh)", zbytecne: "spočítá se z nabídky" },
    { id: "typ_regulace", label: "Typ regulace", zbytecne: "je v nabídce", z: "cenik:regulace" },
    { id: "pocet_slave", label: "Počet Slave" },
    { id: "chytra_zasuvka", label: "Typ chytré zásuvky" },
    { id: "pocet_zasuvek", label: "Počet chytrých zásuvek" },
    { id: "wallbox", label: "Typ dobíjecí stanice", zbytecne: "je v nabídce", z: "cenik:wallbox" },
    { id: "tepelne_cerpadlo", label: "Typ tepelného čerpadla" },
    { id: "typ_bojleru", label: "Typ bojleru", zbytecne: "je v nabídce", z: "cenik:bojler" },
    { id: "patrona", label: "Patrona do bojlerů" },
    { id: "pocet_bojleru", label: "Počet bojlerů (ks)" },
    // střecha
    { id: "krytina", label: "Střešní krytina", moznosti: ["Taška — standard", "Taška — pálená", "Taška — bobrovka", "Betonová taška", "Plech — trapéz", "Plech — falc", "Plech — tašková tabule", "Vláknocement / eternit", "Asfaltový šindel", "Lepenka / fólie (rovná střecha)"] },
    { id: "sklon", label: "Střecha – sklon (°)", moznosti: ["0–5 (rovná)", "10", "15", "20", "25", "30", "35", "40", "45", "50"] },
    { id: "krokve_rozestup", label: "Rozestupy krokví (cm)" },
    { id: "krokve_sirka", label: "Šířka krokve (cm)" },
    { id: "krokve_vyska", label: "Výška krokve (cm)" },
    { id: "prurez_dc", label: "Průřez DC kabelu", vyber: true, moznosti: ["4 mm²", "6 mm²", "10 mm²"] },
    { id: "konstrukce", label: "Typ konstrukce", z: "cenik:konstrukce", moznosti: ["Háky (taška)", "Háky (bobrovka)", "Trapéz — krátké profily", "Falc — svorky", "Rovná — zátěžová (balast)", "Rovná — kotvená"] },
    { id: "vyska_domu", label: "Výška domu (m)", moznosti: ["do 4 (přízemní)", "6", "8", "10", "nad 10 — lešení / plošina"] },
    // připojení
    { id: "hdo_bezdrat", label: "Bezdrátové HDO", zbytecne: "už je v Pokynech pro elektrikáře (HDO trasa)", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "monitoring", label: "Připojení monitoringu", vyber: true, moznosti: ["WiFi", "LAN", "GSM / 4G", "WiFi + extender", "Smartrouter"] },
    { id: "backup", label: "Back-up", moznosti: BACKUP },
    { id: "md_elektro", label: "MD Elektro", zbytecne: "MD jsou v kalkulaci nabídky" },
    { id: "md_strecha", label: "MD Střecha", zbytecne: "MD jsou v kalkulaci nabídky" },
    { id: "md_instalater", label: "MD Instalatér", zbytecne: "MD jsou v kalkulaci nabídky" },
    { id: "specifikace_dila", label: "Specifikace díla", dlouhe: true },
    { id: "ohrev", label: "Ohřev vody (bojler — objem, umístění, napojení)", typy: ["FVO"], dlouhe: true },
    { id: "stringy", label: "Stringy (směr, počet a typ panelů, konstrukce)", dlouhe: true },
  ] },
  { id: "hromosvod", nazev: "Hromosvod", ikona: "🌩️", typy: ["HRM"], pole: [
    { id: "druh", label: "Druh", moznosti: ["Nový hromosvod", "Rekonstrukce stávajícího", "Doplnění k FVE (oddálené jímače)", "Oprava po revizi"] },
    { id: "provedeni", label: "Provedení", moznosti: ["Neizolovaný", "Izolovaný (oddálený)", "Izolovaný vodič HVI"] },
    { id: "material", label: "Materiál vodičů", moznosti: ["FeZn Ø8", "AlMgSi Ø8", "Cu Ø8", "Nerez Ø10"] },
    { id: "krytina", label: "Střešní krytina / podklad", moznosti: ["Taška", "Plech", "Rovná střecha", "Eternit", "Šindel"] },
    { id: "svody", label: "Počet svodů" },
    { id: "zemnic", label: "Uzemnění", moznosti: ["Stávající — vyhovuje", "Páskový zemnič FeZn 30×4", "Zemnicí tyče", "Základový zemnič"] },
    { id: "rozmery", label: "Rozměry objektu (délka × šířka × výška)" },
    { id: "spd", label: "Přepěťová ochrana (SPD)", moznosti: ["Bez SPD", "T1+T2 v HDR", "T2 v podružném rozvaděči", "T1+T2+T3"] },
  ] },
  { id: "elektroinstalace", nazev: "Elektroinstalace", ikona: "🔧", typy: ["ELK"], pole: [
    { id: "objekt", label: "Objekt", moznosti: ["Rodinný dům", "Byt", "Novostavba", "Komerční prostor", "Výroba / hala", "Zemědělský objekt"] },
    { id: "rozsah", label: "Rozsah", moznosti: ["Nová elektroinstalace", "Kompletní rekonstrukce", "Částečná rekonstrukce", "Rozšíření okruhů", "Výměna rozvaděče"] },
    { id: "rozvadec", label: "Rozvaděč", moznosti: ["Nový rozvaděč", "Stávající — doplnit", "Výměna za nový"] },
    { id: "okruhy", label: "Počet okruhů / vývodů" },
    { id: "drazky", label: "Drážky a průrazy", moznosti: ["Sekání drážek", "Do lišt / chrániček na povrch", "Pod omítku (novostavba)", "Kombinace"] },
    { id: "revize", label: "Revize", moznosti: ["Výchozí revize", "Bez revize (zajistí jiný)"] },
    { id: "rozpis", label: "Rozpis prací (místnosti, zásuvky, světla, spotřebiče)", dlouhe: true },
  ] },
  { id: "adresa", nazev: "Instalační adresa", ikona: "📍", pole: [
    { id: "nazev", label: "Název", zbytecne: "je název zakázky" },
    { id: "ulice", label: "Ulice" },
    { id: "cp", label: "ČP" },
    { id: "mesto", label: "Město" },
    { id: "psc", label: "PSČ" },
    { id: "kraj", label: "Kraj", vyber: true, moznosti: ["Hlavní město Praha", "Středočeský kraj", "Jihočeský kraj", "Plzeňský kraj", "Karlovarský kraj", "Ústecký kraj", "Liberecký kraj", "Královéhradecký kraj", "Pardubický kraj", "Kraj Vysočina", "Jihomoravský kraj", "Olomoucký kraj", "Zlínský kraj", "Moravskoslezský kraj"] },
    { id: "cislo_obce", label: "Číslo obce" },
    { id: "cislo_ku", label: "Číslo KÚ" },
    { id: "nazev_ku", label: "Název KÚ" },
    { id: "cislo_lv", label: "Číslo LV" },
    { id: "parcela", label: "Číslo parcely" },
    { id: "adresa", label: "Adresa", zbytecne: "skládá se z ulice, ČP, města a PSČ (adresa místa je u zakázky)" },
    { id: "mapy", label: "Mapy.cz", typ: "odkaz" },
  ] },
  { id: "servis", nazev: "Servisní zásah", ikona: "🛠️", typy: ["SRV"], pole: [
    { id: "zarizeni", label: "Zařízení (výrobce, typ, výkon)" },
    { id: "zavada", label: "Co nefunguje / hlášená závada", dlouhe: true },
    { id: "chyba", label: "Kód chyby / hlášení z aplikace" },
    { id: "pristup", label: "Přístup k zařízení (střecha, technická místnost, klíče…)", moznosti: ["Zákazník doma", "Klíče u souseda", "Volný přístup", "Nutné lešení / plošina"] },
    { id: "dily", label: "Náhradní díly s sebou", dlouhe: true },
    { id: "zaruka", label: "Záruka", moznosti: ["V záruce", "Po záruce — placený servis", "Reklamace u výrobce"] },
  ] },
  { id: "realizace", nazev: "Rozsah realizace", ikona: "🏗️", typy: ["REA"], pole: [
    { id: "strecha", label: "Střecha — co se dělá", dlouhe: true },
    { id: "elektro", label: "Elektro — co se dělá", dlouhe: true },
    { id: "doprava", label: "Doprava (kdo, kam, čím)", dlouhe: true },
    { id: "material", label: "Materiál (kdo dodává, co zajistit)", dlouhe: true },
  ] },
  { id: "odberne", nazev: "Údaje odběrného místa", ikona: "🔌", typy: [...FV, "ELK", "REA", "HRM"], pole: [
    { id: "distribuce", label: "Distribuce", vyber: true, moznosti: ["ČEZ", "EG.D", "PRE"] },
    { id: "sop", label: "SoP číslo" },
    { id: "ean", label: "Kód EAN" },
    // u EG.D určuje postup připojení v Průběhu (fáze Distributor a Připojení)
    { id: "pretoky", label: "Způsob připojení FVE", moznosti: ["S přetoky (dodávka do sítě)", "Bez přetoků (zjednodušené – mikrozdroj do 10,8 kW)"], typy: [...FV, "REA"] },
    { id: "umisteni_elmr", label: "Umístění ELMR", moznosti: ["Na fasádě domu", "Na fasádě do dvora", "V pilíři na hranici pozemku", "Na sloupu", "V domě"] },
    { id: "jistic_stavajici", typy: [...FV, "ELK", "REA"], label: "Hodnota hl. jističe – stávající", moznosti: ["B16/3", "B20/3", "B25/3", "B32/3", "B40/3", "B50/3", "B63/3", "B25/1", "B32/1"] },
    { id: "jistic_novy", typy: [...FV, "ELK", "REA"], label: "Hodnota hl. jističe – nový", moznosti: ["Bez výměny", "B25/3", "B32/3", "B40/3", "B50/3", "B63/3"] },
    { id: "uprava_elmr", label: "Úprava ELMR", z: "cenik:elmr", typy: [...FV, "ELK", "REA"] },
    { id: "typ_rozvadece_elmr", label: "Typ rozvaděče ELMR", typy: [...FV, "ELK", "REA"] },
    { id: "rezervovany_vykon", label: "Rezervovaný výkon (kW)", typy: [...FV, "ELK", "REA"] },
    { id: "cislo_trafo", label: "Číslo trafo st.", typy: [...FV, "REA"] },
  ] },
  { id: "fakturace", nazev: "Fakturace a back office", ikona: "💰", pole: [
    { id: "stavebni_povoleni", label: "Stavební povolení (vyřízení)", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "pujcka_esox", label: "Půjčka ESOX", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "prodejni_cena", label: "Prodejní cena (s DPH)", zbytecne: "cena je v nabídce" },
    { id: "konecna_cena", label: "Konečná cena", zbytecne: "konečná cena je v nabídce (sleva)" },
    { id: "dph", label: "Sazba DPH", zbytecne: "DPH je v nabídce", vyber: true, moznosti: ["0 %", "12 %", "21 %"] },
    { id: "prodejni_bez", label: "Prodejní cena bez DPH", zbytecne: "cena je v nabídce" },
    { id: "naklady", label: "Náklady", zbytecne: "náklad je v interním nacenění" },
    { id: "marze", label: "Marže %", zbytecne: "marže je v nabídce" },
    { id: "provize_pct", label: "Provize OZ (%)" },
    { id: "provize_kc", label: "Provize OZ (Kč)" },
    { id: "popis_bo", label: "Popis pro BO", dlouhe: true },
  ] },
  { id: "dotace", nazev: "Dotace", ikona: "🏛️", typy: FV, pole: [
    { id: "renovacni_pas", label: "Zpracování renovačního pasu", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "vyrizeni", label: "Vyřízení dotace", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "pujcka", label: "Půjčka na dotaci", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "vyse", label: "Výše dotace" },
    { id: "bazen", label: "Bazén", zbytecne: "ověřit – asi jen pro žádost o dotaci", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "klimatizace", label: "Klimatizace", zbytecne: "ověřit – asi jen pro žádost o dotaci", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "dobijeni_ev", label: "Dobíjení elektromobilu", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "akumulace_voda", label: "Akumulace do vody", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "akumulace_baterie", label: "Akumulace do baterií", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "vytapeni", label: "Hlavní způsob vytápění", vyber: true, moznosti: ["Zemní plyn", "Elektřina — přímotop", "Elektřina — akumulační kamna", "Tepelné čerpadlo", "Kotel na tuhá paliva", "Krb / kamna", "Dálkové teplo", "Jiné"] },
    { id: "priprava_tv", label: "Hlavní způsob přípravy TV", vyber: true, moznosti: ["Elektrický bojler", "Plynový kotel / ohřívač", "Tepelné čerpadlo", "Kotel na tuhá paliva", "Solární ohřev", "Jiné"] },
    { id: "typ_domu", label: "Typ rodinného domu", vyber: true, moznosti: ["Samostatně stojící", "Dvojdům", "Řadový — krajní", "Řadový — vnitřní"] },
    { id: "plocha", label: "Celková vytápěná plocha (m²)" },
    { id: "clenu", label: "Počet členů domácnosti" },
    { id: "spotreba", label: "Roční spotřeba elektřiny (kWh)" },
    { id: "priprava_pokrmu", label: "Příprava pokrmů", zbytecne: "ověřit – asi jen pro žádost o dotaci", vyber: true, moznosti: ["Elektřina", "Plyn", "Kombinace elektřina + plyn", "Jiné"] },
    { id: "objem_bojleru", label: "Objem bojleru (l)" },
    { id: "pocet_strech", label: "Počet různě orientovaných střech pro instalaci", vyber: true, moznosti: ["1", "2", "3", "4 a více"] },
    { id: "cislo_uctu", label: "Číslo účtu pro dotaci" },
  ] },
  { id: "marketing", nazev: "Marketing a reference", ikona: "📣", pole: [
    { id: "puvod_leadu", label: "Původ leadu", zbytecne: "duplicitní s Kampaní" },
    { id: "duvod_ztraty", label: "Důvod ztráty", zbytecne: "zapisuje se tlačítkem Prohráno…" },
    { id: "duvod_odlozeni", label: "Důvod odložení" },
    { id: "souhlas_fotky", label: "Souhlas se zveřejněním fotek", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "id_leadu", label: "ID leadu", zbytecne: "Meta lead ID se ukládá automaticky" },
    { id: "zavolat_reference", label: "Zavolat o referenci", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "prosba_reference", label: "Prosba o referenci", typ: "datum" },
    { id: "reference_poskytne", label: "Referenci poskytne", vyber: true, moznosti: ["Ne", "Ano"] },
    { id: "reference_zverejnena", label: "Reference zveřejněna", typ: "datum" },
    { id: "zpetna_vazba", label: "Zpětná vazba zákazníka", dlouhe: true },
  ] },
  { id: "planovac", nazev: "Pokyny pro plánovače", ikona: "🗓️", pro: ["cela"], pole: [
    { id: "zajistit", label: "Zajistit před instalací", dlouhe: true },
    { id: "overit", label: "Ověřit při navolání", dlouhe: true },
    { id: "poznamka", label: "Další informace (termíny, specifika zákazníka…)", dlouhe: true },
  ] },
  { id: "sklad", nazev: "Pokyny pro sklad", ikona: "📦", pro: ["cela"], pole: [
    { id: "material", label: "Extra materiál a co zajistit", dlouhe: true },
  ] },
  { id: "strechar", nazev: "Pokyny pro střechaře", ikona: "🏠", pro: ["strecha"], typy: [...FV, "REA", "HRM"], pole: [
    { id: "rozlozeni", label: "Rozložení panelů", dlouhe: true, typy: [...FV, "REA"] },
    { id: "dc_trasa", label: "DC trasa", dlouhe: true, typy: [...FV, "REA"] },
    { id: "jimace", label: "Jímače a vedení po střeše", dlouhe: true, typy: ["HRM"] },
    { id: "poznamka", label: "Další pokyny", dlouhe: true },
  ] },
  { id: "instalater", nazev: "Pokyny pro instalatéra", ikona: "🚿", pro: ["instalater"], typy: FV, pole: [
    { id: "zapojeni_bojleru", label: "Způsob zapojení nového bojleru (předehřev, výměna, popis prací)", dlouhe: true },
    { id: "zed", label: "Materiál a tloušťka zdi (v případě závěsného bojleru)", dlouhe: true },
  ] },
  { id: "zmeny", nazev: "Změny komponent", ikona: "🔁", typy: FV, pole: [
    { id: "puvodni", label: "Seznam původních komponent", dlouhe: true },
  ] },
  { id: "elektrikar", nazev: "Pokyny pro elektrikáře / montéry", ikona: "⚡", pro: ["elektro", "uzemneni", "elektroinstalace", "revize", "servis"], pole: [
    { id: "stridac", label: "Umístění střídače (materiál zdi)", dlouhe: true, typy: [...FV, "REA"] },
    { id: "ac_trasa", label: "AC trasa", dlouhe: true, typy: [...FV, "REA"] },
    { id: "hdo", label: "HDO trasa", moznosti: ["Stejná jako AC", "Bezdrátové HDO", "Bez HDO"], typy: [...FV, "REA"] },
    { id: "mereni", label: "Měření střídače (trasa, umístění)", moznosti: ["V HDR spojeném s ELMR", "V ELMR", "U střídače", "V podružném rozvaděči"], typy: [...FV, "REA"] },
    { id: "regulace", label: "Regulace (trasa, umístění)", moznosti: ["Stejně jako měření", "U střídače", "V HDR", "U bojleru"], typy: [...FV, "REA"] },
    { id: "backup", label: "Back-up (trasa, rozsah)", moznosti: BACKUP, typy: [...FV, "REA"] },
    { id: "svody", label: "Svody a zemnič (trasa, měřicí svorky)", dlouhe: true, typy: ["HRM"] },
    { id: "trasy", label: "Kabelové trasy a umístění rozvaděče", dlouhe: true, typy: ["ELK"] },
    { id: "poznamka", label: "Další pokyny", dlouhe: true },
  ] },
];

const vyplneno = (v) => String(v ?? "").trim() !== "";
export const hodnota = (podklady, sekce, pole) => (podklady?.[sekce]?.[pole] ?? "");

// sekce s poli pro daný typ zakázky (bez typu = vše)
const proTyp = (x, typ) => !typ || !x.typy || x.typy.includes(typ);
export const sekceProTyp = (typ) => SEKCE_PODKLADU.filter((s) => proTyp(s, typ))
  .map((s) => ({ ...s, pole: s.pole.filter((p) => proTyp(p, typ)) })).filter((s) => s.pole.length);

export function pocetVyplnenych(podklady, typ = null) {
  let celkem = 0, hotovo = 0;
  sekceProTyp(typ).forEach((s) => s.pole.forEach((p) => { celkem++; if (vyplneno(hodnota(podklady, s.id, p.id))) hotovo++; }));
  return { celkem, hotovo };
}

// Sekce s aspoň jedním vyplněným polem (pro náhled).
export const vyplneneSekce = (podklady) => SEKCE_PODKLADU.filter((s) => s.pole.some((p) => vyplneno(hodnota(podklady, s.id, p.id))));

// Komu sekce patří — zaměstnanci s daným „Na starosti“ se zvýrazní.
export const sekceProNaStarosti = (sekce, naStarostiId) => !!naStarostiId && (sekce.pro || []).includes(naStarostiId);

// Nabídka hodnot pro pole: pevné možnosti + položky z číselníku.
// ciselniky = { zamestnanci: [jména], cenik: { [kategorie]: [názvy] } }
export function moznostiPole(pole, ciselniky = {}) {
  const z = pole.z === "zamestnanci" ? (ciselniky.zamestnanci || [])
    : pole.z?.startsWith("cenik:") ? (ciselniky.cenik?.[pole.z.slice(6)] || []).filter((x) => !/^bez\b/i.test(x))
      : [];
  return [...new Set([...z, ...(pole.moznosti || [])])];
}

// ── Předvyplnění z nabídky ──
// Doplní jen prázdná pole (nic už zapsaného nepřepíše). Vrací
// { podklady, doplneno } — doplneno = kolik polí se vzalo z nabídky / zakázky.
const realne = (x) => x?.name && !/^bez\b/i.test(x.name) && (x.qty == null || Number(x.qty) > 0);

export function predvyplnitZNabidky(podklady, quote, zak) {
  const p = JSON.parse(JSON.stringify(podklady || {}));
  let doplneno = 0;
  const dopln = (sekce, pole, v) => {
    const text = String(v ?? "").trim();
    if (!text) return;
    p[sekce] = p[sekce] || {};
    if (String(p[sekce][pole] ?? "").trim()) return;
    p[sekce][pole] = text;
    doplneno++;
  };
  const d = quote?.data || {};
  const fve = d.fve || null;

  // Instalační adresa ze zakázky („Ulice 12/3, Město, 123 45“)
  dopln("adresa", "nazev", zak?.nazev);
  const ZDR = { facebook: "Facebook", instagram: "Instagram", web: "Formulář webu", doporuceni: "Doporučení", jine: "Jiné" };
  if (zak?.zdroj) dopln("marketing", "puvod_leadu", [ZDR[zak.zdroj] || zak.zdroj, zak.kampan].filter(Boolean).join(" – "));
  const adr = String(zak?.misto_adresa || "").trim();
  if (adr) {
    dopln("adresa", "adresa", adr);
    const casti = adr.split(",").map((x) => x.trim()).filter(Boolean);
    const m = casti[0]?.match(/^(.*?)\s+(\d+[\w/]*)$/);
    if (m) { dopln("adresa", "ulice", m[1]); dopln("adresa", "cp", m[2]); }
    const psc = adr.match(/\b(\d{3}\s?\d{2})\b/)?.[1];
    if (psc) dopln("adresa", "psc", psc);
    const mesto = casti.slice(1).map((x) => x.replace(/\b\d{3}\s?\d{2}\b/, "").trim()).find(Boolean);
    if (mesto) dopln("adresa", "mesto", mesto);
  }

  // Fakturace z nabídky
  if (quote) {
    const z = d.zakaznik || {};
    const c = konecnaCenaNabidky(d);
    const kc = (v) => `${Math.round(v).toLocaleString("cs-CZ")} Kč`;
    if (c.bez > 0) {
      dopln("fakturace", "prodejni_bez", kc(c.bez));
      dopln("fakturace", "prodejni_cena", kc(c.s || c.bez * (1 + (c.dph || 21) / 100)));
    }
    if (c.dph != null && ["0", "12", "21"].includes(String(c.dph))) dopln("fakturace", "dph", `${c.dph} %`);
    if (z.marzePct !== undefined && z.marzePct !== "" && z.marzePct !== null) dopln("fakturace", "marze", String(z.marzePct).replace(".", ","));
  }

  dopln("obecne", "oz", zak?.vlastnik_obchod);
  if (fve) {
    const n = (x) => Number(x?.qty) || 0;
    if (realne(fve.panel)) {
      dopln("technicka", "typ_panelu", fve.panel.name);
      dopln("technicka", "pocet_panelu", n(fve.panel));
      const wp = Number(String(fve.panel.name).match(/(\d{3})\s*w/i)?.[1]) || 0;
      if (wp && n(fve.panel)) dopln("technicka", "vykon_kwp", String(Math.round(n(fve.panel) * wp) / 1000).replace(".", ","));
    }
    if (realne(fve.stridac)) {
      dopln("technicka", "typ_stridace", fve.stridac.name);
      dopln("technicka", "pocet_stridacu", n(fve.stridac) || 1);
      const f = /X3|3f|3-f|3 f|třífáz|three|\bT\d|-3P|3P\b/i.test(fve.stridac.name) ? "3" : /X1|1f|1-f|jednofáz|single|-1P|1P\b/i.test(fve.stridac.name) ? "1" : "";
      dopln("technicka", "pocet_fazi", f);
    }
    if (realne(fve.baterie)) {
      dopln("technicka", "typ_baterie", fve.baterie.name);
      dopln("technicka", "pocet_baterii", n(fve.baterie));
      const kwh = Number(String(fve.baterie.name).match(/(\d+(?:[.,]\d+)?)\s*kWh/i)?.[1]?.replace(",", ".")) || 0;
      if (kwh && n(fve.baterie)) dopln("technicka", "kapacita", String(Math.round(kwh * n(fve.baterie) * 100) / 100).replace(".", ","));
    }
    if (realne(fve.regulace)) dopln("technicka", "typ_regulace", fve.regulace.name);
    if (realne(fve.wallbox)) dopln("technicka", "wallbox", fve.wallbox.name);
    if (realne(fve.bojler)) { dopln("technicka", "typ_bojleru", fve.bojler.name); dopln("technicka", "pocet_bojleru", n(fve.bojler) || 1); }
    [["md_elektro", fve.mdElektro], ["md_strecha", fve.mdStrecha], ["md_instalater", fve.mdInstalater]]
      .forEach(([k, v]) => { if (Number(v) > 0) dopln("technicka", k, String(v).replace(".", ",")); });
    if (realne(fve.konstrukce)) dopln("technicka", "konstrukce", fve.konstrukce.name);
    if (realne(fve.backup)) { dopln("technicka", "backup", fve.backup.name); dopln("elektrikar", "backup", fve.backup.name); }
    // Úprava ELMR z kalkulace → i distribuce (ČEZ / EG.D / PRE)
    if (fve.elmr && !/^bez\b/i.test(fve.elmr)) {
      dopln("odberne", "uprava_elmr", fve.elmr);
      const dist = ["ČEZ", "EG.D", "PRE"].find((x) => String(fve.elmr).toUpperCase().includes(x));
      dopln("odberne", "distribuce", dist);
    }
    // Plán práce z kalkulace pro plánovače
    const md = [["střecha", fve.mdStrecha], ["elektro", fve.mdElektro], ["instalatér", fve.mdInstalater]]
      .filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${String(v).replace(".", ",")} MD`);
    const celkem = [fve.mdStrecha, fve.mdElektro, fve.mdInstalater].reduce((s, v) => s + (Number(v) || 0), 0);
    if (md.length) dopln("planovac", "poznamka", `Plán práce z nabídky: ${md.join(", ")} (celkem ${String(celkem).replace(".", ",")} MD).`);
    // Vlastní položky materiálu / ostatního z kalkulace pro sklad
    const extra = (fve.customRows || []).filter((r) => (r.sekce || "ostatni") !== "sluzby" && r.name && Number(r.qty) > 0)
      .map((r) => `${r.qty} ks: ${r.name}`);
    if (extra.length) dopln("sklad", "material", `Navíc z nabídky:\n${extra.join("\n")}`);
  }
  // Interní poznámka nabídky (zákazník ji nevidí) pro plánovače
  if (d.notes && String(d.notes).trim()) {
    const pozn = String(d.notes).trim();
    if (String(p.planovac?.poznamka ?? "").trim()) {
      if (!p.planovac.poznamka.includes(pozn)) { p.planovac.poznamka += `\n${pozn}`; doplneno++; }
    } else dopln("planovac", "poznamka", pozn);
  }
  // Stávající jistič z technických údajů zakázky
  const u = zak?.udaje || {};
  if (u.ean) dopln("odberne", "ean", u.ean);
  if (u.jistic_a) dopln("odberne", "jistic_stavajici", `B${u.jistic_a}/${u.faze || 3}`);
  if (u.jistic_a && !String(p.odberne?.jistic_novy ?? "").trim()) {
    // nic nepřepisovat — jen připomenout stávající hodnotu v poznámce elektrikáři
    dopln("elektrikar", "poznamka", `Stávající hlavní jistič: ${u.jistic_a} A${u.faze ? ` / ${u.faze}f` : ""}.`);
  }
  return { podklady: p, doplneno };
}
