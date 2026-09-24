/* =========================================================
   Service Worker — Gestão Patrimonial R$ 32M v2.6
========================================================= */
const CACHE = 'gestao32m-v27';   // ← bump força atualização
const ASSETS = ['./', './index.html'];

// Instalação: pré-cacheia o app
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
});

// Ativação: assume controle e limpa caches antigos
self.addEventListener('activate', e => {
  e.waitUntil(
    self.clients.claim().then(() => {
      return caches.keys().then(keys =>
        Promise.all(
          keys.filter(k => k !== CACHE).map(k => caches.delete(k))
        )
      );
    })
  );
});

// Fetch: estratégia híbrida
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. Requisições do BCB: sempre network, nunca cache (dados precisam ser frescos)
  if (url.hostname.includes('bcb.gov.br')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // 2. Estáticos locais (index.html, sw.js) → cache-first com fallback
  //    Só para GET same-origin (evita cachear POST/opaque responses)
  if (url.origin === self.location.origin && e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          if (r && r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return r;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // 3. Todo o resto (CDNs externos: Tailwind, Chart.js, Flaticon)
  //    → network direto, sem SW interferir.
});

// Permite que a página force a ativação imediata do novo SW
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
