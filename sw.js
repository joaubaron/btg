/* =========================================================
   Service Worker — Gestão Patrimonial R$ 32M
   Cache v33: corrige fallback que servia index.html no lugar
              de chart.js / tailwind.css (quebrava o parser JS)
========================================================= */
const CACHE = 'gestao32m-v33';   // ← bump força atualização
const ASSETS = [
  './',
  './index.html',
  './tailwind.css',
  './chart.js'
];

/* =========================================================
   INSTALL — pré-cacheia o app
   Falha de um asset NÃO impede o cache dos demais.
========================================================= */
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.allSettled(
      ASSETS.map(url =>
        cache.add(url).catch(err => {
          console.warn('[SW] falha ao cachear', url, err);
          throw err; // propaga pro allSettled registrar como rejected
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

/* =========================================================
   ACTIVATE — assume controle e limpa caches antigos
========================================================= */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    );
  })());
});

/* =========================================================
   FETCH — estratégia híbrida por origem
========================================================= */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1) BCB: sempre rede, nunca cache (dados precisam ser frescos)
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

  // 2) Só intercepta GET same-origin (evita cachear POST / opaque)
  if (url.origin !== self.location.origin || e.request.method !== 'GET') {
    return; // deixa o navegador lidar normalmente
  }

  // 3) Estáticos locais: cache-first com fallback para rede
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;

    try {
      const response = await fetch(e.request);
      if (response && response.ok) {
        const clone = response.clone();
        // put em background — não bloqueia a resposta
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return response;
    } catch (err) {
      // ---- FALLBACK ----
      // Só HTML cai no index.html. JS/CSS/imagem retorna 503 —
      // senão o navegador tenta parsear HTML como JS e quebra tudo.
      const isNavigate =
        e.request.mode === 'navigate' ||
        (e.request.headers.get('accept') || '').includes('text/html');

      if (isNavigate) {
        const html = await caches.match('./index.html');
        if (html) return html;
      }

      return new Response('', {
        status: 503,
        statusText: 'Offline'
      });
    }
  })());
});

/* =========================================================
   MESSAGE — permite à página forçar ativação imediata
========================================================= */
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
