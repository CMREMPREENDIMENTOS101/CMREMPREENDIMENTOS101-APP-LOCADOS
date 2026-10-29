// Service worker do app de celular "Locados CMR".
// Escopo '/locados' — de propósito, para NÃO tocar na Plataforma (que tem o
// próprio /sw.js) e ganhar dela só nesta página.
const CACHE = 'locados-v1';
const ARQUIVOS = [
  '/locados.html',
  '/locados.webmanifest',
  '/locados-icon-192.png',
  '/locados-icon-512.png',
  '/locados-icon-180.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('locados-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Só GET do próprio site; /api/* sempre da rede (a lista de obras já tem cache
// próprio no localStorage do app).
self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Rede primeiro para ter sempre a versão nova quando há internet; cache é o
  // plano B na obra sem sinal.
  ev.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('/locados.html')))
  );
});
