/* =========================================================
   Service Worker — Gestão Patrimonial
========================================================= */
const CACHE = 'gestao32m-v49';
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
   FETCH — estratégia híbrida por origem/tipo
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

  // 3) HTML (navegação ou .html) → STALE-WHILE-REVALIDATE
  //    Serve do cache imediatamente, atualiza em background.
  //    Resultado: usuário nunca fica preso na versão antiga.
  const isHTML =
    e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') || '').includes('text/html') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/btg/') ||
    url.pathname === '/btg';

  if (isHTML) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(e.request);

      // Dispara fetch em background — atualiza o cache pra próxima visita
      const fetchPromise = fetch(e.request).then(r => {
        if (r && r.ok) {
          cache.put(e.request, r.clone()).catch(() => {});
        }
        return r;
      }).catch(() => cached);

      // Retorna o cached na hora; se não tiver, espera o fetch
      return cached || fetchPromise;
    })());
    return;
  }

  // 4) Demais estáticos (chart.js, tailwind.css) → CACHE-FIRST
  //    Estes mudam raramente, então cache-first é adequado.
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
    } catch (err) {
      // Fallback para navegação: devolve index.html do cache
      const isNavigate =
        e.request.mode === 'navigate' ||
        (e.request.headers.get('accept') || '').includes('text/html');

      if (isNavigate) {
        const html = await caches.match('./index.html');
        if (html) return html;
      }

      // JS/CSS/imagem: 503 honesto (nunca HTML, que quebraria o parser)
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
