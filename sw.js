// Aura Service Worker v9 - 2026-09-26
const AURA_SYNC='/aura-sync.js?v=20260926-1';
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
      let html=await res.text();
      const tag=`<script src="${AURA_SYNC}"></script>`;
      if(!html.includes('/aura-sync.js')) html=html.replace('</body>',tag+'</body>');
      return new Response(html,{status:res.status,statusText:res.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }catch(e){
      return fetch(req);
    }
  })());
});
