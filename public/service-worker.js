/* BeautyChem AI Service Worker
 * - қолданба қабығы (shell) алдын ала кэшталады
 * - /assets/* (хэштелген файлдар): cache-first
 * - навигация: network-first, офлайн болса кэштелген қабық немесе offline.html
 * - /api/ingredients, /api/history, /api/molecule, /api/health: network-first, офлайн болса кэштен
 * - POST және AI сұраулары ешқашан кэштелмейді
 */
const VERSION = 'v1';
const SHELL = `bc-shell-${VERSION}`;
const RUNTIME = `bc-runtime-${VERSION}`;
const API = `bc-api-${VERSION}`;
const SHELL_URLS = ['/', '/offline.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon-32.png'];
const CACHEABLE_API = /^\/api\/(ingredients|history|molecule|health|products)/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, RUNTIME, API].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(fallbackKey || request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(fallbackKey || request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API
  if (url.pathname.startsWith('/api/')) {
    if (CACHEABLE_API.test(url.pathname)) {
      event.respondWith(
        networkFirst(req, API).catch(
          () => new Response(JSON.stringify({ error: { code: 'offline', message: 'Интернет жоқ, бұл деректер кэште табылмады.' } }), { status: 503, headers: { 'Content-Type': 'application/json' } }),
        ),
      );
    }
    return;
  }

  // Навигация (SPA)
  if (req.mode === 'navigate') {
    event.respondWith(
      networkFirst(req, SHELL, '/').catch(async () => (await caches.match('/')) || (await caches.match('/offline.html'))),
    );
    return;
  }

  // Хэштелген asset-тер
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Қалғаны (иконкалар, манифест): stale-while-revalidate
  event.respondWith(
    caches.open(RUNTIME).then(async (cache) => {
      const hit = await cache.match(req);
      const fetching = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || fetching;
    }),
  );
});
