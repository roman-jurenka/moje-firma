// ─── 3D návrhy v databázi (tabulka navrhy_3d) ───────────────────────────────
// Návrh se ukládá celý do jsonb; fotky stěn jdou do soukromého úložiště
// zakazky-fotky (navrhy3d/<id>/<stěna>-<otisk>.jpg) a v databázi je u nich
// jen cesta. Po načtení se fotky stáhnou zpět do dataURL, se kterým pracuje 3D
// scéna i narovnání perspektivy.

import { supabase } from "./supabase.js";

const BUCKET = "zakazky-fotky";

// Krátký otisk obsahu fotky — pozná se podle něj, že se fotka změnila.
function otisk(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 7) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}

const dataUrlNaBlob = async (data) => (await fetch(data)).blob();
const blobNaDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

export async function nactiSeznam() {
  const { data, error } = await supabase.from("navrhy_3d")
    .select("id, nazev, zakaznik, contract_id, updated_at, upravil")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function nactiNavrh(id) {
  const { data, error } = await supabase.from("navrhy_3d").select("data, contract_id, updated_at").eq("id", id).single();
  if (error) throw error;
  const n = { ...data.data, id, contractId: data.contract_id ?? data.data?.contractId ?? null };
  const fotky = { ...(n.fotky || {}) };
  await Promise.all(Object.entries(fotky).map(async ([st, f]) => {
    if (f?.data || !f?.cesta) return;
    const { data: blob, error: e } = await supabase.storage.from(BUCKET).download(f.cesta);
    if (!e && blob) fotky[st] = { ...f, data: await blobNaDataUrl(blob) };
  }));
  return { ...n, fotky, upraveno: data.updated_at };
}

// Uloží návrh; vrátí fotky doplněné o cestu v úložišti (aby se příště nenahrávaly znovu).
export async function ulozNavrh(navrh, uzivatel) {
  const fotky = {};
  for (const [st, f] of Object.entries(navrh.fotky || {})) {
    if (!f?.data) { fotky[st] = f; continue; }
    const h = otisk(f.data);
    if (f.cesta && f.otisk === h) { fotky[st] = f; continue; }
    const pripona = f.data.startsWith("data:image/png") ? "png" : f.data.startsWith("data:image/webp") ? "webp" : "jpg";
    const cesta = `navrhy3d/${navrh.id}/${st}-${h}.${pripona}`;
    const blob = await dataUrlNaBlob(f.data);
    const { error } = await supabase.storage.from(BUCKET).upload(cesta, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
    fotky[st] = { ...f, cesta, otisk: h };
  }
  const bezFotek = Object.fromEntries(Object.entries(fotky).map(([st, f]) => [st, f ? { cesta: f.cesta, otisk: f.otisk, orez: f.orez, rohy: f.rohy } : f]));
  const radek = {
    id: navrh.id,
    nazev: navrh.nazev || "",
    zakaznik: navrh.zakaznik || null,
    contract_id: navrh.contractId || null,
    data: { ...navrh, fotky: bezFotek },
    upravil: uzivatel || null,
  };
  const { error } = await supabase.from("navrhy_3d").upsert(navrh.vytvoril ? radek : { ...radek, vytvoril: uzivatel || null });
  if (error) throw error;
  return fotky;
}

export async function smazNavrh(id) {
  const { data: soubory } = await supabase.storage.from(BUCKET).list(`navrhy3d/${id}`);
  if (soubory?.length) await supabase.storage.from(BUCKET).remove(soubory.map(s => `navrhy3d/${id}/${s.name}`));
  const { error } = await supabase.from("navrhy_3d").delete().eq("id", id);
  if (error) throw error;
}

export async function nactiZakazky() {
  const { data } = await supabase.from("contracts").select("id, name, code, status").order("name");
  return data || [];
}
