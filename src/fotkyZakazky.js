// ─── Nahrání fotky k zakázce ─────────────────────────────────────────────────
// Společné pro Průběh zakázek (obhlídka, montáž) a Servis (fotky závady).
// Fotka jde na firemní OneDrive do složky zakázky, bez připojení do Supabase
// Storage; záznam se uloží do contract_photos s vazbou na zakázku, průběh
// (fotky z obhlídky, kdy zakázka ještě není) nebo servisní ticket.

import { supabase } from "./supabase.js";
import { isConnected, connectSharedAccount, uploadFileObject } from "./onedrive.js";
import { compressImage } from "./imageUtils.js";

const bezpecnyNazev = (s) => String(s || "").replace(/[/\\?%*:|"<>]/g, "_");

// Vrátí uložený řádek contract_photos, při chybě vyhodí výjimku.
export async function nahratFotkuZakazky(puvodni, { slozka, contractId = null, prubehId = null, ticketId = null, kategorie = null, nahral = null }) {
  const file = await compressImage(puvodni);
  let url, storagePath, itemId = null;
  if (isConnected() || await connectSharedAccount()) {
    const r = await uploadFileObject(`FirmaCRM/Zakázky/${bezpecnyNazev(slozka)}/Fotky`, file);
    url = r.webUrl; itemId = r.itemId; storagePath = "onedrive:" + file.name;
  } else {
    const ext = (file.name || "foto.jpg").split(".").pop();
    const path = `${contractId || (prubehId ? `prubeh-${prubehId}` : "ostatni")}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("zakazky-fotky").upload(path, file);
    if (error) throw error;
    url = supabase.storage.from("zakazky-fotky").getPublicUrl(path).data.publicUrl;
    storagePath = path;
  }
  const { data, error } = await supabase.from("contract_photos").insert({
    contract_id: contractId, prubeh_id: prubehId, ticket_id: ticketId, date: new Date().toLocaleDateString("sv-SE"),
    url, storage_path: storagePath, item_id: itemId, category: kategorie, uploaded_by: nahral,
  }).select().single();
  if (error) throw error;
  return data;
}

export const pocetFotekText = (n) => `${n} ${n === 1 ? "fotka" : n < 5 ? "fotky" : "fotek"}`;
