/* =========================================================
   Service Worker — Gestão Patrimonial R$ 32M v2.4
========================================================= */
const CACHE = 'gestao32m-v24';   // ← versão nova força atualização
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

  // ⚠️ 1. Requisições JSONP do BCB são <script src="api.bcb.gov.br/...?callback=...">
  //    → têm query string com "callback=" e NÃO devem ser cacheadas
  //    → sempre network, nunca cache (dados precisam ser frescos)
  if (url.hostname.includes('bcb.gov.br')) {
    e.respondWith(fetch(e.request));   // sem cache, sem fallback
    return;
  }

  // ⚠️ 2. CDNs externos (Tailwind, Chart.js, Flaticon) → cache-first simples
  //    Não precisa de lógica especial, cai no default abaixo.

  // ⚠️ 3. Estáticos locais (index.html, sw.js) → cache-first com fallback
  //    Mas só para GET same-origin (evita cachear POST/opaque responses)
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

  // ⚠️ 4. Todo o resto (CDNs externos, etc.) → network direto, sem SW interferir
  //    Não chamamos respondWith — o browser segue o fluxo normal.
});
