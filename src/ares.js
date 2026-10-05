// ─── ARES — registr ekonomických subjektů (MF ČR) ───────────────────────────
// Veřejné REST API bez přihlášení, volá se přímo z prohlížeče (povoluje CORS).
// Z IČO načte obchodní jméno, DIČ a sídlo; firmy jde hledat i podle názvu.
import { supabase } from "./supabase.js";

const API = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
export const ARES_PLATNOST_DNI = 30; // po kolika dnech se údaje firmy ověří znovu

export const cisteIco = (v) => String(v || "").replace(/\D/g, "");
export const jeIco = (v) => /^\d{8}$/.test(cisteIco(v));

const zFirmy = (s) => ({
  ico: s.ico,
  nazev: s.obchodniJmeno || "",
  dic: s.dic || "",
  sidlo: s.sidlo?.textovaAdresa || [s.adresaDorucovaci?.radekAdresy1, s.adresaDorucovaci?.radekAdresy2, s.adresaDorucovaci?.radekAdresy3].filter(Boolean).join(", "),
  zanikla: !!s.datumZaniku,
});

// Firma podle IČO → { ico, nazev, dic, sidlo, zanikla }; null = IČO v ARES není.
export async function nactiZAres(ico) {
  const c = cisteIco(ico);
  if (!/^\d{8}$/.test(c)) throw new Error("IČO musí mít 8 číslic");
  const res = await fetch(`${API}/${c}`, { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ARES neodpovídá (${res.status}) — zkus to za chvíli`);
  return zFirmy(await res.json());
}

// Hledání podle názvu → [{ ico, nazev, dic, sidlo, zanikla }] (max. 8)
export async function hledatVAres(nazev) {
  const q = String(nazev || "").trim();
  if (q.length < 3) return [];
  const res = await fetch(`${API}/vyhledat`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ obchodniJmeno: q, pocet: 8, start: 0 }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.ekonomickeSubjekty || []).map(zFirmy);
}

// Zákazníci s IČO, které se dlouho neověřovaly (nebo nikdy) — načíst z ARES
// a uložit změny (název firmy, DIČ, sídlo). Vrací aktualizované řádky.
export async function aktualizovatZakaznikyZAres(zakaznici, { max = 15 } = {}) {
  const hranice = Date.now() - ARES_PLATNOST_DNI * 86400000;
  const kOvereni = (zakaznici || [])
    .filter((c) => jeIco(c.ico) && !c.archived && (!c.ares_at || new Date(c.ares_at).getTime() < hranice))
    .slice(0, max);
  const zmenene = [];
  for (const c of kOvereni) {
    try {
      const f = await nactiZAres(c.ico);
      const patch = { ares_at: new Date().toISOString() };
      if (f) {
        if (f.nazev && f.nazev !== c.company) patch.company = f.nazev;
        if (f.dic !== (c.dic || "")) patch.dic = f.dic || null;
        if (f.sidlo && f.sidlo !== c.sidlo) patch.sidlo = f.sidlo;
      }
      const { data, error } = await supabase.from("customers").update(patch).eq("id", c.id).select().single();
      if (!error && data) zmenene.push(data);
    } catch { /* ARES nedostupný — zkusí se příště */ }
  }
  return zmenene;
}
