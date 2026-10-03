// ─── Podklady pro realizaci (předávací list obchodníka) ──────────────────────
// Ukládá se do zakazky_prubeh.podklady jako { [sekce]: { [pole]: text } }.
// Stejná definice slouží formuláři v Průběhu i náhledu v detailu akce
// v kalendáři. `pro` = komu sekce hlavně patří (podle „Na starosti“ v
// kalendáři se zaměstnanci zvýrazní jeho pokyny).
// moznosti = nabídka hodnot v poli (dá se napsat i jiná), z = doplnit
// z číselníku: "zamestnanci" nebo "cenik:<kategorie>" (ceník FVE kalkulačky).

const BACKUP = ["Celý dům — automatické přepnutí", "Celý dům — ruční přepínač", "Vybrané okruhy", "Bez back-upu"];

export const SEKCE_PODKLADU = [
  { id: "obecne", nazev: "Obecné", ikona: "📁", pole: [
    { id: "odkaz_slozka", label: "Odkaz na složku zakázky (SharePoint / OneDrive)", typ: "odkaz" },
    { id: "oz", label: "Obchodník (OZ)", z: "zamestnanci" },
  ] },
  { id: "technicka", nazev: "Technická specifikace", ikona: "⚙️", pole: [
    { id: "optimizery", label: "Odpojovače / optimizéry", moznosti: ["Bez optimizérů", "Tigo TS4-A-O (optimizér)", "Tigo TS4-A-2F (rychlé odpojení, 2 panely)", "Tigo TS4-A-F (rychlé odpojení)", "Huawei SUN2000-450W-P", "SolarEdge"] },
    { id: "sklon", label: "Sklon střechy (°)", moznosti: ["0–5 (rovná)", "10", "15", "20", "25", "30", "35", "40", "45", "50"] },
    { id: "vyska_domu", label: "Výška domu (m)", moznosti: ["do 4 (přízemní)", "6", "8", "10", "nad 10 — lešení / plošina"] },
    { id: "krytina", label: "Střešní krytina", moznosti: ["Taška — standard", "Taška — pálená", "Taška — bobrovka", "Betonová taška", "Plech — trapéz", "Plech — falc", "Plech — tašková tabule", "Vláknocement / eternit", "Asfaltový šindel", "Lepenka / fólie (rovná střecha)"] },
    { id: "konstrukce", label: "Konstrukce", z: "cenik:konstrukce", moznosti: ["Háky (taška)", "Háky (bobrovka)", "Trapéz — krátké profily", "Falc — svorky", "Rovná — zátěžová (balast)", "Rovná — kotvená"] },
    { id: "prurez_dc", label: "Průřez DC kabelu", moznosti: ["4 mm²", "6 mm²", "10 mm²"] },
    { id: "stringy", label: "Stringy (MPPT, počet panelů, orientace)", dlouhe: true },
    { id: "monitoring", label: "Připojení monitoringu", moznosti: ["WiFi", "LAN", "GSM / 4G", "WiFi + extender", "Smartrouter"] },
    { id: "backup", label: "Back-up", moznosti: BACKUP },
  ] },
  { id: "odberne", nazev: "Odběrné místo", ikona: "🔌", pole: [
    { id: "distribuce", label: "Distribuce", moznosti: ["ČEZ", "EG.D", "PRE"] },
    { id: "umisteni_elmr", label: "Umístění ELMR", moznosti: ["Na fasádě domu", "Na fasádě do dvora", "V pilíři na hranici pozemku", "Na sloupu", "V domě"] },
    { id: "jistic_novy", label: "Výměna hl. jističe na", moznosti: ["Bez výměny", "B25/3", "B32/3", "B40/3", "B50/3", "B63/3"] },
    { id: "uprava_elmr", label: "Úprava ELMR", z: "cenik:elmr" },
    { id: "rezervovany_vykon", label: "Rezervovaný výkon (kW)" },
  ] },
  { id: "planovac", nazev: "Pokyny pro plánovače", ikona: "🗓️", pro: ["cela"], pole: [
    { id: "zajistit", label: "Zajistit před instalací", dlouhe: true },
    { id: "overit", label: "Ověřit při navolání", dlouhe: true },
    { id: "poznamka", label: "Další informace (termíny, specifika zákazníka…)", dlouhe: true },
  ] },
  { id: "sklad", nazev: "Pokyny pro sklad", ikona: "📦", pro: ["cela"], pole: [
    { id: "material", label: "Extra materiál a co zajistit", dlouhe: true },
  ] },
  { id: "strechar", nazev: "Pokyny pro střechaře", ikona: "🏠", pro: ["strecha"], pole: [
    { id: "rozlozeni", label: "Rozložení panelů", dlouhe: true },
    { id: "dc_trasa", label: "DC trasa", dlouhe: true },
    { id: "poznamka", label: "Další pokyny", dlouhe: true },
  ] },
  { id: "elektrikar", nazev: "Pokyny pro elektrikáře", ikona: "⚡", pro: ["elektro", "uzemneni", "elektroinstalace", "revize", "servis"], pole: [
    { id: "stridac", label: "Umístění střídače (materiál zdi)", dlouhe: true },
    { id: "ac_trasa", label: "AC trasa", dlouhe: true },
    { id: "hdo", label: "HDO trasa", moznosti: ["Stejná jako AC", "Bezdrátové HDO", "Bez HDO"] },
    { id: "mereni", label: "Měření střídače (trasa, umístění)", moznosti: ["V HDR spojeném s ELMR", "V ELMR", "U střídače", "V podružném rozvaděči"] },
    { id: "regulace", label: "Regulace (trasa, umístění)", moznosti: ["Stejně jako měření", "U střídače", "V HDR", "U bojleru"] },
    { id: "backup", label: "Back-up (trasa, rozsah)", moznosti: BACKUP },
    { id: "poznamka", label: "Další pokyny", dlouhe: true },
  ] },
];

const vyplneno = (v) => String(v ?? "").trim() !== "";
export const hodnota = (podklady, sekce, pole) => (podklady?.[sekce]?.[pole] ?? "");

export function pocetVyplnenych(podklady) {
  let celkem = 0, hotovo = 0;
  SEKCE_PODKLADU.forEach((s) => s.pole.forEach((p) => { celkem++; if (vyplneno(hodnota(podklady, s.id, p.id))) hotovo++; }));
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

  dopln("obecne", "oz", zak?.vlastnik_obchod);
  if (fve) {
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
  if (u.jistic_a && !String(p.odberne?.jistic_novy ?? "").trim()) {
    // nic nepřepisovat — jen připomenout stávající hodnotu v poznámce elektrikáři
    dopln("elektrikar", "poznamka", `Stávající hlavní jistič: ${u.jistic_a} A${u.faze ? ` / ${u.faze}f` : ""}.`);
  }
  return { podklady: p, doplneno };
}
