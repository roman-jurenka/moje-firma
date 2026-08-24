// ProudOS service worker — jen základní offline fallback pro appku samotnou
// (HTML/JS/CSS shell), NIKDY necachuje volání na Supabase ani jiná API, aby
// se v appce neobjevila stará data. Terénní pracovník tak appku aspoň otevře
// i bez signálu, i když samotná data se dotáhnou až po připojení.

const CACHE_NAME = "proudos-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Jen GET na vlastní origin (build assets, ikony, manifest) — API volání na
  // Supabase a jiné cizí originy necháváme projít normálně, bez cache.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cache.match(event.request).then((cached) => cached || cache.match("/")))
    )
  );
});
