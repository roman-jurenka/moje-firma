// ─── Soubory ze Supabase Storage (soukromá úložiště) ─────────────────────────
// Úložiště fotek a dokumentů jsou soukromá — soubor jde otevřít jen po
// přihlášení. V databázi zůstává uložená "veřejná" adresa (getPublicUrl) jen
// jako identifikátor souboru; k zobrazení se z ní vyrobí dočasný podepsaný
// odkaz. Adresy odjinud (OneDrive, data: URL…) se vrací beze změny.

import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { getDirectDownloadUrl } from "./onedrive.js";

const PUBLIC_MARK = "/storage/v1/object/public/";
const PLATNOST_S = 3600;              // podepsaný odkaz platí hodinu
const PREPOCITAT_PO_MS = 50 * 60000;  // po 50 minutách se vyrobí nový
const cache = new Map();              // uložená adresa → { url, at } nebo rozpracovaný Promise

// "https://…/storage/v1/object/public/zakazky-fotky/12/abc.jpg" → { bucket, path }
function parseStorageUrl(url) {
  if (typeof url !== "string") return null;
  const i = url.indexOf(PUBLIC_MARK);
  if (i < 0) return null;
  const rest = url.slice(i + PUBLIC_MARK.length).split("?")[0];
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) };
}

async function signedUrl(url) {
  const ref = parseStorageUrl(url);
  if (!ref) return url;
  const hit = cache.get(url);
  if (hit instanceof Promise) return hit;
  if (hit && Date.now() - hit.at < PREPOCITAT_PO_MS) return hit.url;
  const p = supabase.storage.from(ref.bucket).createSignedUrl(ref.path, PLATNOST_S).then(({ data, error }) => {
    if (error || !data?.signedUrl) { cache.delete(url); return url; }
    cache.set(url, { url: data.signedUrl, at: Date.now() });
    return data.signedUrl;
  });
  cache.set(url, p);
  return p;
}

const cachedUrl = (url) => {
  const hit = cache.get(url);
  return hit && !(hit instanceof Promise) ? hit.url : null;
};

// Adresa souboru použitelná v <img src> / <a href>. Dokud se podepsaný odkaz
// nevyrobí, vrací null (u adres mimo Supabase Storage rovnou původní adresu).
function useSignedUrl(url) {
  const [signed, setSigned] = useState(() => (parseStorageUrl(url) ? cachedUrl(url) : url));
  useEffect(() => {
    let zrusen = false;
    if (!parseStorageUrl(url)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSigned(url);
      return;
    }
    signedUrl(url).then(u => { if (!zrusen) setSigned(u); });
    return () => { zrusen = true; };
  }, [url]);
  return signed;
}

export function StorageImg({ src, style, ...rest }) {
  const url = useSignedUrl(src);
  if (!url) return <span style={{ ...style, display: "inline-block", background: "#f1f5f9" }} />;
  return <img src={url} style={style} {...rest} />;
}

export function StorageLink({ href, children, ...rest }) {
  const url = useSignedUrl(href);
  return <a href={url || undefined} {...rest}>{children}</a>;
}

// Náhled fotky zakázky — z OneDrive natáhne čerstvý přímý odkaz přes itemId,
// jinak (starší fotky, fotky nahrané bez OneDrive) použije uloženou adresu.
export function OneDriveThumb({ itemId, fallbackUrl, alt, style }) {
  const fallback = useSignedUrl(fallbackUrl);
  const [od, setOd] = useState({ itemId: null, url: null, selhal: false });
  useEffect(() => {
    let zrusen = false;
    if (itemId) getDirectDownloadUrl(itemId).then(url => { if (!zrusen && url) setOd({ itemId, url, selhal: false }); });
    return () => { zrusen = true; };
  }, [itemId]);
  const odUrl = od.itemId === itemId && !od.selhal ? od.url : null;
  const src = odUrl || fallback;
  if (!src) return <span style={{ ...style, display: "block", background: "#f1f5f9" }} />;
  return <img src={src} alt={alt} style={style} onError={() => { if (src === odUrl) setOd({ ...od, selhal: true }); }} />;
}
