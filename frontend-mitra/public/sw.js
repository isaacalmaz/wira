// Wira Mitra service worker - caches app shell for offline resilience.
// Cache name is namespaced with the app name so it can never collide with
// frontend-user's or frontend-admin's cache, even if all three were ever
// served from a shared origin (today they're separate Vercel deployments).
const CACHE_NAME = 'wira-mitra-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
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
