// ProudOS service worker
//
// Cíl: appka se otevře rychle a bez signálu aspoň naběhne, a umí přijímat push notifikace.
//  - "Shell" (index.html) — nejdřív síť (max. 4 s), při výpadku/pomalém signálu poslední uložená verze.
//  - /assets/* (soubory s hashem v názvu, nikdy se nemění) — cache-first, start je okamžitý.
//  - ikony, splash, manifest — cache + tiché obnovení na pozadí.
//  - ikonové písmo Tabler z jsdelivr — cache + tiché obnovení, ať ikony fungují i offline.
//  - Supabase a ostatní API — NIKDY necachujeme, ať se v appce neukážou stará data.
//    (Zápisy bez signálu řeší fronta v offlineQueue.js.)

const VERSION = "v2";
const SHELL_CACHE = `proudos-shell-${VERSION}`;
const ASSET_CACHE = `proudos-assets-${VERSION}`;
const CDN_CACHE = `proudos-cdn-${VERSION}`;
const KEEP = [SHELL_CACHE, ASSET_CACHE, CDN_CACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"]))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function shell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetchWithTimeout(request, 4000);
    if (res.ok) cache.put("/", res.clone());
    return res;
  } catch {
    return (await cache.match("/")) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => { if (res.ok || res.type === "opaque") cache.put(request, res.clone()); return res; })
    .catch(() => null);
  return hit || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return; // serverové funkce vždy ze sítě
    if (req.mode === "navigate") return event.respondWith(shell(req));
    if (url.pathname.startsWith("/assets/")) return event.respondWith(cacheFirst(req, ASSET_CACHE));
    return event.respondWith(staleWhileRevalidate(req, ASSET_CACHE));
  }

  if (url.hostname === "cdn.jsdelivr.net") return event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
  // vše ostatní (Supabase, OneDrive, Pushover…) necháme projít bez cache
});

// ─── Push notifikace (Web Push) ────────────────────────────────────────────
// iOS vyžaduje, aby každý push ukázal notifikaci; posílá ho Edge Function hlaseni-odeslat.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ProudOS", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "ProudOS", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-96.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
