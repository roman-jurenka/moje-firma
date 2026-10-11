// ─── Nahrání fotky k zakázce ─────────────────────────────────────────────────
// Společné pro Průběh zakázek (obhlídka, montáž) a Servis (fotky závady).
// Fotka jde na firemní OneDrive do složky zakázky, bez připojení do Supabase
// Storage; záznam se uloží do contract_photos s vazbou na zakázku, průběh
// (fotky z obhlídky, kdy zakázka ještě není) nebo servisní ticket.
// Nahrát jde libovolný soubor (PDF, Word, sken…): obrázky se zmenší a jdou
// do Fotky, ostatní beze změny do Dokumenty.

import { supabase } from "./supabase.js";
import { isConnected, connectSharedAccount, uploadFileObject } from "./onedrive.js";
import { compressImage } from "./imageUtils.js";

const bezpecnyNazev = (s) => String(s || "").replace(/[/\\?%*:|"<>]/g, "_");
// Kam fotky / soubory patří (Zakázka → Fotky, Průběh)
export const KATEGORIE_FOTEK = ["Obhlídka", "Průběh montáže", "Střecha", "Uzemnění", "Po montáži", "Předávací protokol", "Dokumenty", "Ostatní"];

// Unikátní název souboru (iPhone posílá víc fotek jako „image.jpg“ — na
// OneDrive by se přepsaly): 2026-10-07_1432_01.jpg
export function unikatniNazev(file, poradi = 1) {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const ext = (String(file.name || "").match(/\.([a-z0-9]{1,5})$/i)?.[1] || (String(file.type).split("/")[1] || "bin")).toLowerCase().replace("jpeg", "jpg");
  const nazev = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}_${p2(poradi)}.${ext}`;
  return new File([file], nazev, { type: file.type || "application/octet-stream" });
}

// Připravit soubor k nahrání: obrázek zmenšit, přejmenovat na unikátní název.
// Dokumenty (PDF, Word…) si nechají původní název — při shodě ho OneDrive očísluje.
export async function pripravitSoubor(puvodni, poradi = 1) {
  if (!jeObrazekSoubor(puvodni)) return puvodni;
  return unikatniNazev(await compressImage(puvodni), poradi);
}

export const jeObrazekSoubor = (file) => !!file && (String(file.type || "").startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.name || ""));

// Vrátí uložený řádek contract_photos, při chybě vyhodí výjimku.
// pripraveno = soubor už prošel pripravitSoubor (offline fronta)
// podslozka = cesta uvnitř Dokumentů / Fotek při nahrání celé složky („Revize 2026/Fotky“)
export async function nahratFotkuZakazky(puvodni, { slozka, contractId = null, prubehId = null, ticketId = null, kategorie = null, nahral = null, popis = null, poradi = 1, pripraveno = false, podslozka = "" }) {
  const obrazek = jeObrazekSoubor(puvodni);
  const file = pripraveno ? puvodni : await pripravitSoubor(puvodni, poradi);
  let url, storagePath, itemId = null;
  if (isConnected() || await connectSharedAccount()) {
    // dokumenty a předávací protokol (i jako fotka/sken) do Dokumentů, ostatní obrázky do Fotek
    const doDokumentu = !obrazek || ["Dokumenty", "Předávací protokol"].includes(kategorie);
    const pod = String(podslozka || "").split("/").map((x) => bezpecnyNazev(x).trim()).filter(Boolean).join("/");
    const r = await uploadFileObject(`FirmaCRM/Zakázky/${bezpecnyNazev(slozka)}/${doDokumentu ? "Dokumenty" : "Fotky"}${pod ? "/" + pod : ""}`, file, { prejmenovat: true });
    url = r.webUrl; itemId = r.itemId; storagePath = "onedrive:" + (pod ? pod + "/" : "") + (r.name || file.name);
  } else {
    const ext = (file.name || (obrazek ? "foto.jpg" : "soubor.bin")).split(".").pop();
    const path = `${contractId || (prubehId ? `prubeh-${prubehId}` : "ostatni")}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("zakazky-fotky").upload(path, file);
    if (error) throw error;
    url = supabase.storage.from("zakazky-fotky").getPublicUrl(path).data.publicUrl;
    storagePath = path;
  }
  const { data, error } = await supabase.from("contract_photos").insert({
    contract_id: contractId, prubeh_id: prubehId, ticket_id: ticketId, date: new Date().toLocaleDateString("sv-SE"),
    url, storage_path: storagePath, item_id: itemId, category: kategorie, uploaded_by: nahral, description: popis || null,
  }).select().single();
  if (error) throw error;
  return data;
}

// Vybrané nebo přetažené soubory → [{ file, cesta }]; cesta = podsložka při nahrání
// celé složky (z webkitRelativePath). Systémové a dočasné soubory se vynechají.
export function polozkySouboru(seznam) {
  return [...(seznam || [])]
    .map((x) => (x instanceof File ? { file: x, cesta: (x.webkitRelativePath || "").split("/").slice(0, -1).join("/") } : x))
    .filter((x) => x?.file && !/^(\.ds_store|thumbs\.db|desktop\.ini)$/i.test(x.file.name) && !x.file.name.startsWith("~$"));
}

// Přetažené soubory i složky (drag & drop) → [{ file, cesta }]; složky se projdou rekurzivně.
// Položky se musí převzít hned při události (než doběhne první await).
export async function souboryZPretazeni(dt) {
  const polozky = [...(dt?.items || [])].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!polozky.length) return [...(dt?.files || [])];
  const out = [];
  const projit = async (entry, cesta) => {
    if (entry.isFile) {
      out.push({ file: await new Promise((ok, chyba) => entry.file(ok, chyba)), cesta });
    } else if (entry.isDirectory) {
      const ctenar = entry.createReader();
      const nova = cesta ? `${cesta}/${entry.name}` : entry.name;
      for (;;) {
        const davka = await new Promise((ok, chyba) => ctenar.readEntries(ok, chyba));
        if (!davka.length) break;
        for (const e of davka) await projit(e, nova);
      }
    }
  };
  for (const e of polozky) await projit(e, "");
  return out;
}

export const pocetFotekText = (n) => `${n} ${n === 1 ? "fotka" : n < 5 ? "fotky" : "fotek"}`;
export const pocetSouboruText = (n) => `${n} ${n === 1 ? "soubor" : n < 5 ? "soubory" : "souborů"}`;
