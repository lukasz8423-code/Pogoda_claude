// Aura Pogoda — service worker
// v8: twarde odświeżenie powłoki aplikacji po zmianach, bez trzymania starego index.html.
const CACHE = "aura-v8";
const SHELL = ["./", "index.html", "okno.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== location.origin && !/fonts\\.(googleapis|gstatic)\\.com$/.test(url.hostname)) return;

  const isNavigation = request.mode === "navigate";
  const isHtml = url.origin === location.origin && (
    isNavigation ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/okno.html")
  );

  if (isHtml) {
    // HTML zawsze najpierw z sieci — nie uruchamiamy starego, potencjalnie uszkodzonego cache.
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match("index.html")))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && url.origin === location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
