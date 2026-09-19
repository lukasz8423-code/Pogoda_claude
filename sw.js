// Aura Pogoda — service worker (osobny plik, bo rejestracja z blob: jest w przeglądarkach zablokowana)
const CACHE="aura-v6";
const SHELL=["./","index.html","okno.html","manifest.webmanifest","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=="GET")return;
  // Dane pogodowe zawsze z sieci (offline obsługuje cache w localStorage aplikacji)
  if(u.origin!==location.origin&&!/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))return;
  // Sieć najpierw, cache jako zapas — dzięki temu po aktualizacji pliku od razu widać nową wersję
  e.respondWith(fetch(r).then(res=>{
    if(res.ok){const c=res.clone();caches.open(CACHE).then(ca=>ca.put(r,c));}
    return res;
  }).catch(()=>caches.match(r).then(m=>m||caches.match("index.html"))));
});
