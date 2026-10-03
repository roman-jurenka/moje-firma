// ─── Podklady pro realizaci (předávací list obchodníka) ──────────────────────
// Ukládá se do zakazky_prubeh.podklady jako { [sekce]: { [pole]: text } }.
// Stejná definice slouží formuláři v Průběhu i náhledu v detailu akce
// v kalendáři. `pro` = komu sekce hlavně patří (podle „Na starosti“ v
// kalendáři se zaměstnanci zvýrazní jeho pokyny).

export const SEKCE_PODKLADU = [
  { id: "obecne", nazev: "Obecné", ikona: "📁", pole: [
    { id: "odkaz_slozka", label: "Odkaz na složku zakázky (SharePoint / OneDrive)", typ: "odkaz" },
    { id: "oz", label: "Obchodník (OZ)" },
  ] },
  { id: "technicka", nazev: "Technická specifikace", ikona: "⚙️", pole: [
    { id: "optimizery", label: "Odpojovače / optimizéry" },
    { id: "sklon", label: "Sklon střechy (°)" },
    { id: "vyska_domu", label: "Výška domu (m)" },
    { id: "krytina", label: "Střešní krytina" },
    { id: "konstrukce", label: "Konstrukce" },
    { id: "prurez_dc", label: "Průřez DC kabelu" },
    { id: "stringy", label: "Stringy (MPPT, počet panelů, orientace)", dlouhe: true },
    { id: "monitoring", label: "Připojení monitoringu" },
    { id: "backup", label: "Back-up" },
  ] },
  { id: "odberne", nazev: "Odběrné místo", ikona: "🔌", pole: [
    { id: "distribuce", label: "Distribuce" },
    { id: "umisteni_elmr", label: "Umístění ELMR" },
    { id: "jistic_novy", label: "Výměna hl. jističe na" },
    { id: "uprava_elmr", label: "Úprava ELMR" },
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
    { id: "hdo", label: "HDO trasa" },
    { id: "mereni", label: "Měření střídače (trasa, umístění)" },
    { id: "regulace", label: "Regulace (trasa, umístění)" },
    { id: "backup", label: "Back-up (trasa, rozsah)" },
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
