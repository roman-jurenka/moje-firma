// ─── Jednotný vzhled ProudOS ─────────────────────────────────────────────────
// Jediné místo, kde se určují barvy, písmo a základní prvky (tlačítko, karta,
// pole, štítek, nadpis). Moduly mají dál své objekty stylů S, ale jejich
// základní prvky berou odsud — změna vzhledu se tak dělá na jednom místě.
// Stejné hodnoty jsou jako CSS proměnné v src/index.css.

export const barvy = {
  primarni: "#0369a1",        // hlavní tlačítka, odkazy, aktivní prvky
  primarniTmava: "#0E3B5E",   // boční menu, horní lišta
  akcent: "#F5821F",          // oranžová z loga — zvýraznění, ne velké plochy
  text: "#1A1A1A",
  textMekky: "#475569",
  textSlaby: "#64748b",
  pozadi: "#f0f4f8",
  plocha: "#ffffff",
  poleBg: "#f8fafc",
  okraj: "#e2e8f0",
  okrajJemny: "#f1f5f9",
  uspech: "#16a34a",
  varovani: "#d97706",
  chyba: "#dc2626",
  fialova: "#7c3aed",
  neutralni: "#64748b",
};

export const pismo = "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Starší obrazovky mají barvy tlačítek a štítků zapsané napevno a ze staré
// palety (světle zelená/červená/žlutá), na kterých je bílý text špatně čitelný.
// Tady se převádějí na jednotné, dobře čitelné odstíny — bez nutnosti měnit
// stovky míst v kódu.
const PREVOD = {
  "#f5c518": barvy.primarni,      // dřívější žlutá hlavní tlačítka
  "#34d399": barvy.uspech,
  "#10b981": barvy.uspech,
  "#22c55e": barvy.uspech,
  "#f87171": barvy.chyba,
  "#ef4444": barvy.chyba,
  "#f59e0b": barvy.varovani,
  "#a78bfa": barvy.fialova,
  "#6366f1": barvy.fialova,
};
export const sjednot = (c) => PREVOD[String(c).toLowerCase()] || c;

// Tmavý nebo světlý text podle jasu pozadí.
export const textNa = (bg) => {
  const hex = String(bg).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#fff";
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? barvy.text : "#fff";
};

const VELIKOST = {
  normal: { padding: "9px 16px", fontSize: 13 },
  male: { padding: "6px 12px", fontSize: 12 },
  velke: { padding: "12px 18px", fontSize: 15 },
};

// Plné tlačítko. Barva = význam: primarni (výchozí), uspech, chyba, varovani…
export const tlacitko = (c = barvy.primarni, velikost = "normal") => {
  const bg = sjednot(c);
  return { background: bg, color: textNa(bg), border: "none", borderRadius: 8, ...VELIKOST[velikost], fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
};

// Obrysové (vedlejší) tlačítko.
export const tlacitkoObrys = (velikost = "normal") => {
  const v = VELIKOST[velikost];
  const [py, px] = v.padding.split(" ").map(parseFloat);
  return { background: "transparent", color: barvy.primarni, border: `1px solid ${barvy.primarni}`, borderRadius: 8, padding: `${py - 1}px ${px}px`, fontSize: v.fontSize, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
};

export const karta = { background: barvy.plocha, borderRadius: 12, padding: 22, border: `1px solid ${barvy.okraj}`, boxShadow: "0 1px 4px #0000000a" };

export const pole = { background: barvy.poleBg, border: `1px solid ${barvy.okraj}`, borderRadius: 8, padding: "9px 12px", color: barvy.text, fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

export const popisek = { fontSize: 11, color: barvy.textMekky, marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" };

export const nadpis = { fontSize: 24, fontWeight: 700, color: barvy.text, margin: 0 };

// Barevný štítek (stav, typ…). Text o něco tmavší než podklad, ať je čitelný.
export const stitek = (c) => {
  const b = sjednot(c);
  return { background: b + "1a", color: b, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, display: "inline-block" };
};

export const okno = { position: "fixed", inset: 0, background: "#0007", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 };
export const oknoObsah = { background: barvy.plocha, borderRadius: 16, padding: 28, width: 460, maxWidth: "92vw", boxSizing: "border-box", border: `1px solid ${barvy.okraj}`, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px #0000001a" };

export const th = { textAlign: "left", padding: "9px 12px", fontSize: 11, color: barvy.textMekky, borderBottom: `1px solid ${barvy.okraj}`, textTransform: "uppercase", letterSpacing: "0.06em" };
export const td = { padding: "11px 12px", fontSize: 13, borderBottom: `1px solid ${barvy.okrajJemny}`, color: barvy.textMekky };
