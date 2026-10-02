/* =========================================================
   Service Worker — Gestão Patrimonial
   (mantenha a linha CACHE_VERSION no formato abaixo: o deploy
   do GitHub Actions carimba esse valor)
========================================================= */
const CACHE_VERSION = '02.10.2026-1109';
const CACHE = 'gestao32m-' + CACHE_VERSION;
const CACHE_PREFIX = 'gestao32m-';

// Essenciais: se qualquer um falhar, a instalação falha e o SW antigo continua valendo.
const CORE = [
  './',
  './index.html',
  './tailwind.css',
  './chart.js'
];
// Opcionais: entram no cache se existirem, sem derrubar a instalação.
const OPTIONAL = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Atômico: tudo ou nada para o núcleo do app.
    await cache.addAll(CORE.map(url => new Request(url, { cache: 'reload' })));
    // Melhor esforço para o restante.
    await Promise.allSettled(
      OPTIONAL.map(url => cache.add(new Request(url, { cache: 'reload' })))
    );
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Remove só caches antigos DESTE app (não mexe em outros PWAs da mesma origem).
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // 1) BCB: sempre rede (o app guarda o próprio cache de dados)
  if (url.hostname.includes('bcb.gov.br')) {
    e.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // 2) Só GET da mesma origem
  if (url.origin !== self.location.origin || req.method !== 'GET') return;

  // 3) HTML / navegação → NETWORK-FIRST com timeout
  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    url.pathname.endsWith('.html');

  if (isHTML) {
    e.respondWith(networkFirst(req));
    return;
  }

  // 4) Estáticos → CACHE-FIRST
  e.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const networkPromise = fetch(req).then(async response => {
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, response.clone()).catch(() => {});
    }
    return response;
  });

  try {
    // Rede rápida: usa a resposta. Rede lenta: cai para o cache.
    return await Promise.race([
      networkPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS))
    ]);
  } catch (err) {
    const cached =
      (await caches.match(req, { ignoreSearch: true })) ||
      (await caches.match('./index.html'));
    if (cached) {
      networkPromise.catch(() => {}); // evita erro não tratado; o cache será atualizado se a rede responder
      return cached;
    }
    // Sem cache: se foi só lentidão, ainda vale esperar a rede.
    try {
      return await networkPromise;
    } catch {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const response = await fetch(req);
    if (response && response.ok) {
      cache.put(req, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}
