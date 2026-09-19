// Wira Admin service worker - offline-caching only.
//
// frontend-admin is internal staff tooling (dashboard, feature flags, users,
// orders, drivers, merchants, finance, etc.), used on desktop browsers by
// employees, not something a customer or mitra installs to their phone home
// screen. So unlike frontend-user and frontend-mitra, this app intentionally
// has no manifest.json / apple-touch-icon / "Add to Home Screen" wiring -
// full installability isn't the right fit here. It still gets this caching
// worker so staff on a spotty connection (common around Lombok) get some
// resilience against transient network drops on repeat visits.
//
// Cache name is namespaced with the app name so it can never collide with
// frontend-user's or frontend-mitra's cache, even if all three were ever
// served from a shared origin (today they're separate Vercel deployments).
const CACHE_NAME = 'wira-admin-cache-v1';
const urlsToCache = [
  '/',
  '/index.html'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch events (Network falling back to cache)
self.addEventListener('fetch', event => {
  // Hanya intercept request GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});
