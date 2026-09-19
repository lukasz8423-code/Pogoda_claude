// Aura Pogoda — service worker
const CACHE="aura-v7";
const SHELL=["./","index.html","okno.html","manifest.webmanifest","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>c.addAll(SHELL))
      .then(()=>self.skipWaiting())
  );
});
self.addEventListener("activate",e=>{
  e.waitUntil(
    caches.keys()
      .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=="GET")return;
  if(u.origin!==location.origin&&!/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))return;

  const isAppShell=u.origin===location.origin&&(
    r.mode==="navigate"||
    u.pathname.endsWith("/index.html")||
    u.pathname.endsWith("/sw.js")
  );

  const networkRequest=isAppShell?fetch(r,{cache:"no-store"}):fetch(r);

  e.respondWith(
    networkRequest.then(res=>{
      if(res.ok){
        const c=res.clone();
        caches.open(CACHE).then(ca=>ca.put(r,c));
      }
      return res;
    }).catch(()=>caches.match(r).then(m=>m||caches.match("index.html")))
  );
});
