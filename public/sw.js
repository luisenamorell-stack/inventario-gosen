// Service Worker for Multi-Tenant SaaS PWA (MIAPPHN Official Branding)
const CACHE_NAME = 'miapphn-pwa-v12';
const STATIC_ASSETS = [
  '/manifest.json?v=miapphn3',
  '/favicon.png?v=miapphn3',
  '/apple-touch-icon.png?v=miapphn3',
  '/pwa-192x192.png?v=miapphn3',
  '/pwa-512x512.png?v=miapphn3',
  '/pwa-maskable-512x512.png?v=miapphn3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Initial cache addAll error:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (
    url.origin !== self.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  // Serve dynamic manifest if updated in current cache, otherwise fetch latest /manifest.json
  if (url.pathname === '/manifest.json') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match('/manifest.json').then((cachedManifest) => {
          if (cachedManifest) return cachedManifest;
          return fetch(event.request);
        })
      )
    );
    return;
  }

  // Always try network first so updates appear immediately on mobile
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
