/* =========================================================
   Service Worker — Gestão Patrimonial R$ 32M v2.3
========================================================= */
const CACHE = 'gestao32m-v23';
const ASSETS = ['./', './index.html'];

// Instalação: pré-cacheia o app
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
});

// Ativação: assume controle imediatamente
self.addEventListener('activate', e => {
  e.waitUntil(
    self.clients.claim().then(() => {
      // Remove caches antigos
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

  // API do BCB: network-first (dados sempre frescos)
  if (url.hostname.includes('bcb.gov.br') || url.hostname.includes('allorigins') || url.hostname.includes('corsproxy')) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Estáticos: cache-first (rápido, offline-friendly)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (e.request.method === 'GET' && r.ok) {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return r;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
