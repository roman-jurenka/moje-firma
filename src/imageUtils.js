// Komprese fotek před uploadem — v terénu se často fotí mobilem s vysokým
// rozlišením (4-8 Mpx, 3-6 MB/fotka), což zbytečně žere mobilní data i
// místo v OneDrive/Supabase Storage. Zmenšíme delší stranu na maxDim px a
// převedeme na JPEG s danou kvalitou; pro doklady/prohlídky v běžné
// velikosti to není znát, ale soubor je řádově menší.
export async function compressImage(file, { maxDim = 1600, quality = 0.75 } = {}) {
  if (!file || !file.type || !file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  // Malé fotky (pod ~400 KB) komprimovat nemá smysl, jen to stojí čas navíc.
  if (file.size < 400 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width <= maxDim && height <= maxDim) { bitmap.close?.(); return file; }
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // komprese nepomohla — radši původní soubor
    const name = (file.name || "foto.jpg").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // Komprese selhala (starší prohlížeč apod.) — radši nahrát originál než fotku ztratit.
    return file;
  }
}
