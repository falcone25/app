const CACHE='peacefeed-v04-training-20260819';
const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./cards.json','./media.json'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)))});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  const isContent=url.pathname.endsWith('/cards.json')||url.pathname.endsWith('/media.json')||url.pathname.endsWith('/review.json');
  if(isContent){
    const canonical=new Request(url.origin+url.pathname);
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(canonical,copy));return response}).catch(()=>caches.match(canonical)));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return response}).catch(()=>caches.match(event.request)));
});
