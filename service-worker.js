const CACHE_NAME = 'thur-blox-v9';
const OFFLINE_URL = 'index.html';
const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'assets/brand/delima-blox-logo.webp',
  'assets/brand/delima-blox-logo.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'src/data/brainrots.json',
  'src/data/mutations.json',
  'src/data/brainrot-market-values.json',
  'src/data/brainrot-images.json',
  'src/data/grow-garden-2/seeds.json',
  'src/data/grow-garden-2/seed-images.json',
  'src/data/grow-garden-2/store-products.json',
  'src/data/grow-garden-2/store-coupons.example.json',
  'assets/blox-fruits/blox-fruits-category.webp',
  'assets/portal/grow-a-garden-2.webp',
  'assets/grow-garden-2/seeds/seed-placeholder.webp',
  'assets/grow-garden-2/seeds/mushroom.webp',
  'assets/grow-garden-2/seeds/green-bean.webp',
  'assets/grow-garden-2/seeds/banana.webp',
  'assets/grow-garden-2/seeds/tulip.webp',
  'assets/grow-garden-2/seeds/tomato.webp',
  'assets/grow-garden-2/seeds/apple.webp',
  'assets/grow-garden-2/seeds/bamboo.webp',
  'assets/grow-garden-2/seeds/corn.webp',
  'assets/grow-garden-2/seeds/cactus.webp',
  'assets/grow-garden-2/seeds/grape.webp',
  'assets/grow-garden-2/seeds/coconut.webp',
  'assets/grow-garden-2/seeds/mango.webp',
  'assets/brainrots/fallback/brainrot-placeholder.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  const url = new URL(event.request.url);
  const networkFirstPaths = ['/', '/index.html', '/styles.css', '/app.js'];
  const shouldUseNetworkFirst = networkFirstPaths.includes(url.pathname)
    || url.pathname.startsWith('/src/');

  if (shouldUseNetworkFirst) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      }).catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match(OFFLINE_URL)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      }).catch(() => caches.match(OFFLINE_URL));
    })
  );
});
