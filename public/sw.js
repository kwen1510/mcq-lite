const CACHE_NAME = 'quiz-app-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/console',
  '/index.html',
  '/console.html',
  '/manifest.json',
  '/sw.js',
  // plus your JS/CSS icons
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install => cache assets
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Fetch => respond from cache if present
self.addEventListener('fetch', (evt) => {
  evt.respondWith(
    caches.match(evt.request).then((cached) => {
      return cached || fetch(evt.request);
    })
  );
});
