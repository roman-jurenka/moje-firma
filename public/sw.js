// ProudOS service worker
//
// Cíl: appka se otevře rychle a bez signálu aspoň naběhne, a umí přijímat push notifikace.
//  - "Shell" (index.html) — nejdřív síť (max. 4 s), při výpadku/pomalém signálu poslední uložená verze.
//  - /assets/* (soubory s hashem v názvu, nikdy se nemění) — cache-first, start je okamžitý.
//  - ikony, splash, manifest — cache + tiché obnovení na pozadí.
//  - ikonové písmo Tabler z jsdelivr — cache + tiché obnovení, ať ikony fungují i offline.
//  - Supabase a ostatní API — NIKDY necachujeme, ať se v appce neukážou stará data.
//    (Zápisy bez signálu řeší fronta v offlineQueue.js.)

const VERSION = "v6";
const SHELL_CACHE = `proudos-shell-${VERSION}`;
const ASSET_CACHE = `proudos-assets-${VERSION}`;
const CDN_CACHE = `proudos-cdn-${VERSION}`;
const SIGNAL_CACHE = "proudos-signal"; // předává appce „otevři rychlou obrazovku“ po klepnutí na notifikaci
const KEEP = [SHELL_CACHE, ASSET_CACHE, CDN_CACHE, SIGNAL_CACHE];

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
  // Druh notifikace o docházce – klepnutí ji jinak systém smaže, my ji proto po klepnutí tiše obnovíme.
  const titulek = data.title || "ProudOS";
  const zacatek = /^V práci od (\d{1,2}):(\d{2})/.exec(titulek);
  const kind = data.tag === "dochazka" ? (zacatek ? "bezi" : /^Nezapomněl/.test(titulek) ? "zapomenuto" : null) : null;
  const opts = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-96.png",
    tag: data.tag || undefined,
    data: {
      url: data.url || "/", kind, titulek, body: data.body || "", tag: data.tag || null,
      od: zacatek ? `${zacatek[1].padStart(2, "0")}:${zacatek[2]}` : null,
      trvale: !!data.trvale, actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
    },
  };
  // Notifikace o odpracovaném čase: stejný tag = přepíše se předchozí, aktualizace jsou tiché,
  // na Androidu/desktopu zůstává na očích a má tlačítka (iOS tlačítka v notifikaci nepodporuje).
  if (data.tag) opts.renotify = !data.silent;
  if (data.silent) opts.silent = true;
  if (data.trvale) opts.requireInteraction = true;
  if (Array.isArray(data.actions) && data.actions.length) opts.actions = data.actions.slice(0, 2);
  event.waitUntil(self.registration.showNotification(titulek, opts));
});

// Tiše obnoví notifikaci o probíhající práci s aktuálním časem (stejný tag = nahradí se, žádný zvuk).
async function obnovNotifikaci(d) {
  if (!d || !d.kind || !d.tag) return;
  let titulek = d.titulek, body = d.body;
  if (d.kind === "bezi" && d.od) {
    const [h, m] = d.od.split(":").map(Number);
    const ted = new Date();
    let min = ted.getHours() * 60 + ted.getMinutes() - (h * 60 + m);
    if (min < 0) min += 1440; // práce přes půlnoc
    const hod = Math.floor(min / 60);
    body = `Odpracováno ${hod ? `${hod} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`}. Klepni pro odchod nebo fotky.`;
  }
  const opts = {
    body, icon: "/icons/icon-192.png", badge: "/icons/icon-96.png", tag: d.tag,
    silent: true, renotify: false, requireInteraction: !!d.trvale,
    data: d,
  };
  if (d.actions && d.actions.length) opts.actions = d.actions;
  try { await self.registration.showNotification(titulek, opts); } catch { /* systém obnovení nepovolil */ }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const puvodni = event.notification.data || null;
  let url = (event.notification.data && event.notification.data.url) || "/";
  if (event.action === "odchod") url = "/?rychle=odchod";
  else if (event.action === "fotky") url = "/?rychle=fotky";
  let akce = null;
  try { akce = new URL(url, self.location.origin).searchParams.get("rychle"); } catch { /* bez akce */ }

  event.waitUntil((async () => {
    // Notifikace o docházce nemá po klepnutí zmizet – hned ji tiše zobrazíme znovu (návrat z rychlé obrazovky).
    await obnovNotifikaci(puvodni);
    // Spolehlivý signál pro appku: iOS u openWindow často zahodí ?rychle=… a zprávu do
    // uspané appky nemusí doručit, proto ho uložíme do cache, odkud si ho appka sama vyzvedne.
    if (akce) {
      try {
        const cache = await caches.open(SIGNAL_CACHE);
        await cache.put("/__rychle", new Response(JSON.stringify({ v: akce, t: Date.now() }), { headers: { "content-type": "application/json" } }));
      } catch { /* bez signálu se aspoň otevře appka */ }
    }
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if ("focus" in c) {
        c.postMessage({ type: "otevri", url });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});

// Diagnostika z modulu Hlášení: appka se zeptá, jaká verze service workeru běží.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "verze" && event.source) {
    event.source.postMessage({ type: "verze", verze: VERSION });
  }
});
