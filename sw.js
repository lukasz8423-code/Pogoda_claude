// Aura Service Worker v10 - 2026-09-27
const AURA_SYNC=new URL('aura-sync.js?v=20260927-9',self.registration.scope).href;
self.addEventListener('install',(event)=>{event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',(event)=>{
  event.waitUntil(
    caches.keys().then((keys)=>Promise.all(keys.map((k)=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',(event)=>{
  const req=event.request;
  if(req.mode!=='navigate') return;
  event.respondWith((async()=>{
    try{
      const res=await fetch(req,{cache:'no-store'});
      if(!res.ok) return res;
      const type=res.headers.get('content-type')||'';
      if(!type.includes('text/html')) return res;
      // index.html ładuje aura-sync.js jawnie. Nie wstrzykujemy go drugi raz,
      // bo podwójny MutationObserver + setInterval potrafił obciążyć telefon
      // podczas zwykłego przeładowania strony.
      return res;
    }catch(e){
      return fetch(req);
    }
  })());
});
