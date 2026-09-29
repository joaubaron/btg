/* =========================================================
   Service Worker — Gestão Patrimonial
========================================================= */
const CACHE_VERSION = '29.09.2026-0953';
const CACHE = 'gestao32m-' + CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './tailwind.css',
  './chart.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.allSettled(
      ASSETS.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(err => {
          console.warn('[SW] falha ao cachear', url, err);
          throw err;
        })
      )
    );
    const failed = results
      .map((r, i) => r.status === 'rejected' ? ASSETS[i] : null)
      .filter(Boolean);
    if (failed.length) {
      console.warn('[SW] assets não cacheados no install:', failed);
    }
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    );
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1) BCB: sempre rede
  if (url.hostname.includes('bcb.gov.br')) {
    e.respondWith(
      fetch(e.request).catch(err => {
        console.warn('[SW] BCB offline:', err);
        return new Response(
          JSON.stringify({ error: 'offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 2) Só GET same-origin
  if (url.origin !== self.location.origin || e.request.method !== 'GET') {
    return;
  }

  // 3) HTML → NETWORK-FIRST (nunca serve HTML velho se online)
  const isHTML =
    e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') || '').includes('text/html') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/btg/') ||
    url.pathname === '/btg';

  if (isHTML) {
    e.respondWith((async () => {
      try {
        const response = await fetch(e.request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(e.request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 4) Estáticos → CACHE-FIRST
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;

    try {
      const response = await fetch(e.request);
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return response;
    } catch {
      const isNavigate =
        e.request.mode === 'navigate' ||
        (e.request.headers.get('accept') || '').includes('text/html');

      if (isNavigate) {
        const html = await caches.match('./index.html');
        if (html) return html;
      }

      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
