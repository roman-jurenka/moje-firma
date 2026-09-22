import { supabase } from "./supabase.js";

// Sdílené pomůcky pro web push (Hlášení pro admina + profil zaměstnance).

export const VAPID_PUBLIC = "BK6bPI9m_AcJ-7plYhzN9-Md2Kl29UZdCSG3NziUu7e2xwWjXglBp2pxGo823MqEiTYTStetazJu6sqY9HLTeoI";

export function urlB64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export const jeIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const jeNainstalovana = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

export function nazevZarizeni() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Zařízení";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "prohlížeč";
  return `${os} · ${br}${jeNainstalovana() ? " (appka)" : ""}`;
}

// nepodporuje | nainstalovat | zamitnuto | vypnuto | zapnuto
export async function zjistiPushStav() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return jeIOS() && !jeNainstalovana() ? "nainstalovat" : "nepodporuje";
  }
  if (Notification.permission === "denied") return "zamitnuto";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub && Notification.permission === "granted" ? "zapnuto" : "vypnuto";
  } catch {
    return "vypnuto";
  }
}

// Volat přímo z kliknutí (iOS jinak odmítne žádost o oprávnění).
// Vrací { ok: true } nebo { ok: false, stav?, text }.
export async function zapniPush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, stav: perm === "denied" ? "zamitnuto" : "vypnuto", text: "Oznámení nebyla povolena. Povol je v Nastavení telefonu → Oznámení → ProudOS." };
    }
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error("Service worker není aktivní. Push funguje jen v nainstalované/produkční verzi aplikace.")), 8000)),
    ]);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC) });
    const j = sub.toJSON();
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user?.id) throw new Error("Nejsi přihlášený.");
    const { error } = await supabase.from("push_odbery").upsert(
      { profile_id: u.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, zarizeni: nazevZarizeni() },
      { onConflict: "endpoint" }
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, text: "Zapnutí se nepovedlo: " + (e?.message || e) };
  }
}

export async function vypniPush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await supabase.from("push_odbery").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, text: "Vypnutí se nepovedlo: " + (e?.message || e) };
  }
}
