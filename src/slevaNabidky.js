// ─── Dodatečná sleva nabídky a konečná cena ────────────────────────────────
// Sleva se zadává nad hotovou cenou nabídky (kalkulace / náklad + marže) a
// ukládá v data.zakaznik.sleva = { zpusob: "kc" | "pct", hodnota, popisek, duvod }.
//   kc  … částka bez DPH
//   pct … procento z ceny bez DPH
// Základ (cilovaCena, cenaSDph) zůstává beze změny, aby šla sleva kdykoliv
// upravit nebo zrušit. Konečná cena po slevě se při uložení zapíše do
// data.zakaznik.cenaKonecna = { bez, s } — z ní berou cenu Průběh, dokumenty
// a faktury (konecnaCenaNabidky).

// Vrátí rozpis slevy, nebo null, když sleva není.
export function vypocetSlevy(zakladBez, zakladS, dphPct, sleva) {
  const h = Number(sleva?.hodnota) || 0;
  const bez = Math.round(Number(zakladBez) || 0);
  if (!sleva || h <= 0 || bez <= 0) return null;
  const s = Math.round(Number(zakladS) || bez * (1 + (Number(dphPct) || 0) / 100));
  const slevaBez = sleva.zpusob === "pct" ? Math.round((bez * Math.min(h, 100)) / 100) : Math.min(Math.round(h), bez);
  // s DPH ve stejném poměru jako bez DPH (u FVE je cena s DPH zaokrouhlená na tisíce)
  const slevaS = Math.round((s * slevaBez) / bez);
  return {
    zakladBez: bez, zakladS: s,
    bez: slevaBez, s: slevaS,
    poBez: bez - slevaBez, poS: s - slevaS,
    pct: Math.round((slevaBez / bez) * 1000) / 10,
    popisek: String(sleva.popisek || "").trim() || "Sleva",
    duvod: String(sleva.duvod || "").trim(),
  };
}

// Popis slevy pro historii a hlášky, např. „10 % (25 000 Kč bez DPH)“.
export function textSlevy(sleva, vypocet) {
  if (!vypocet) return "bez slevy";
  const kc = `${vypocet.bez.toLocaleString("cs-CZ")} Kč bez DPH`;
  return sleva?.zpusob === "pct" ? `${String(sleva.hodnota).replace(".", ",")} % (${kc})` : kc;
}

// Konečná cena nabídky (po slevě) pro zbytek appky. Starší nabídky bez
// cenaKonecna: cena z kalkulace se slevou (když nějaká je), jinak cilovaCena.
export function konecnaCenaNabidky(qdata) {
  const z = qdata?.zakaznik || {};
  const dph = Number(z.dph ?? 21);
  if (z.cenaKonecna && Number(z.cenaKonecna.bez) > 0) {
    return { bez: Math.round(Number(z.cenaKonecna.bez)), s: Math.round(Number(z.cenaKonecna.s)) || null, dph };
  }
  const bez = Math.round(Number(z.cilovaCena) || 0);
  const s = Number(z.cenaSDph) || null;
  const sl = vypocetSlevy(bez, s, dph, z.sleva);
  return sl ? { bez: sl.poBez, s: sl.poS, dph } : { bez, s, dph };
}
