/**
 * Blunderless PWA Service Worker (`web/sw.js`).
 *
 * Strategy:
 * - Static shell assets (CSS, JS, manifest, icons): stale-while-revalidate for instant mobile loads.
 * - HTML navigation (`/`): network-first with cached fallback so updates arrive immediately.
 * - API & Auth routes (`/api/*`, `/auth/*`): always network-only (never cache private user data).
 */

const CACHE_NAME = 'blunderless-shell-v34';
const SHELL_ASSETS = [
  '/',
  '/static/manifest.webmanifest',
  '/static/assets/logo.png',
  '/static/styles.css?v=34',
  '/static/pieces.js?v=11',
  '/static/app.js?v=34',
  '/static/coach.js?v=34',
  '/static/platform.js?v=34',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname === '/health') {
    return;
  }

  // Navigation requests: network-first so fresh HTML & asset versions load immediately
  if (req.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets: stale-while-revalidate
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const netPromise = fetch(req)
          .then((resp) => {
            if (resp && resp.ok) {
              const copy = resp.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return resp;
          })
          .catch(() => cached);
        return cached || netPromise;
      })
    );
  }
});
