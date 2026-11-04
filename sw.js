// Bump this version whenever a precached file changes.
const CACHE_PREFIX = `float-offline-${self.registration.scope}-`;
const CACHE_NAME = `${CACHE_PREFIX}v11`;
const ASSETS = [
  './', './index.html', './scss/style.css', './js/app.js', './js/tilt.js', './js/offline.js',
  './assets/vendor/matter.min.js', './assets/fonts/fonts.css',
  './assets/fonts/inter.woff2', './assets/fonts/symbols.woff2',
  './assets/icons/pink-yellow-180.png', './assets/icons/pink-yellow-192.png',
  './assets/icons/pink-yellow-512.png', './assets/icons/favicon-pink-yellow-32.png',
  './assets/icons/favicon-pink-yellow.ico', './favicon.ico', './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Restrict cleanup to this app's scope on shared hosts such as GitHub Pages.
    const scopeCaches = await caches.keys();
    await Promise.all(scopeCaches.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Serve one consistent release, including during an offline reload.
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    if (event.request.mode === 'navigate') return cache.match('./index.html');
    return fetch(event.request);
  })());
});
