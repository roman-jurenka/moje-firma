// ─── Výchozí přirážka na materiál ───────────────────────────────────────────
// Prodejní cena materiálu (cena pro zákazníka v nákladech zakázky), když
// produkt ve skladu nemá vlastní prodejní cenu: nákupní cena + přirážka v %.
// Nastavení je jedno pro celou firmu (app_settings), mění se ve Frontě faktur.
import { supabase } from "./supabase.js";

export const PRIRAZKA_KEY = "material_prirazka";
export const VYCHOZI_PRIRAZKA = 30;

export async function nactiPrirazku() {
  try {
    const { data } = await supabase.from("app_settings").select("value").eq("key", PRIRAZKA_KEY).maybeSingle();
    const pct = Number(data?.value?.pct);
    return Number.isFinite(pct) && pct >= 0 ? pct : VYCHOZI_PRIRAZKA;
  } catch {
    return VYCHOZI_PRIRAZKA;
  }
}

export async function ulozitPrirazku(pct) {
  return supabase.from("app_settings").upsert({ key: PRIRAZKA_KEY, value: { pct: Number(pct) }, updated_at: new Date().toISOString() });
}

export const sPrirazkou = (nakup, pct) => Math.round((Number(nakup) || 0) * (1 + (Number(pct) || 0) / 100) * 100) / 100;

// Přirážka položky (products.prirazka_pct), když ji má nastavenou; jinak null.
export const prirazkaPolozky = (produkt) => (produkt?.prirazka_pct != null && produkt.prirazka_pct !== "" && Number.isFinite(Number(produkt.prirazka_pct)) ? Number(produkt.prirazka_pct) : null);

// Prodejní cena: přirážka položky → vlastní prodejní cena položky → nákup + výchozí přirážka.
export const prodejniCena = (produkt, nakup, pct) => {
  const vlastni = prirazkaPolozky(produkt);
  if (vlastni != null) return sPrirazkou(nakup, vlastni);
  return Number(produkt?.price_sell) > 0 ? Number(produkt.price_sell) : sPrirazkou(nakup, pct);
};
