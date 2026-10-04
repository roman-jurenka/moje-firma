// ─── Dokumenty zakázky na OneDrivu ───────────────────────────────────────────
// Nabídky (odeslané kopie), smlouvy, dodatky a předávací protokoly se ukládají
// do FirmaCRM/Zakázky/<zakázka>/Dokumenty — vedle podsložky Fotky, kterou
// plní nahrávání fotek (fotkyZakazky.js). Název složky zakázky je stejný jako
// u fotek: název zakázky (contract), jinak název z Průběhu.

import { isConnected, connectSharedAccount, uploadFile, odkazNaSlozku, vytvoritSlozku } from "./onedrive.js";

export const bezpecnyNazev = (s) => String(s || "").replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim();
export const slozkaDokumentu = (nazevZakazky) => `FirmaCRM/Zakázky/${bezpecnyNazev(nazevZakazky)}/Dokumenty`;

async function pripojit() {
  if (isConnected()) return true;
  try { return !!(await connectSharedAccount()); } catch { return false; }
}

// Uloží soubor do složky Dokumenty zakázky. Vrací { webUrl, itemId },
// null když OneDrive není k dispozici; při chybě nahrávání vyhodí výjimku.
export async function ulozitDoDokumentu(nazevZakazky, nazevSouboru, obsah, contentType = "application/octet-stream") {
  if (!(await pripojit())) return null;
  const data = obsah instanceof Blob ? await obsah.arrayBuffer() : new TextEncoder().encode(String(obsah));
  return uploadFile(slozkaDokumentu(nazevZakazky), bezpecnyNazev(nazevSouboru), data, contentType);
}

// Založí složku Dokumenty zakázky (každá zakázka ji má vždy). Vrací true/false.
export async function zalozitSlozkuDokumenty(nazevZakazky) {
  if (!(await pripojit())) return false;
  try { await vytvoritSlozku(slozkaDokumentu(nazevZakazky)); return true; } catch (e) { console.warn("Složku Dokumenty se nepodařilo založit:", e); return false; }
}

// Odkaz na složku Dokumenty — když ještě neexistuje, založí ji
// (null, když OneDrive není připojený).
export async function odkazNaDokumenty(nazevZakazky) {
  if (!(await zalozitSlozkuDokumenty(nazevZakazky))) return null;
  return odkazNaSlozku(slozkaDokumentu(nazevZakazky));
}
