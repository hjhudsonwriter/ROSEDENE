// Minimal service worker: makes the app installable and keeps the app shell available offline.
// The cache name includes the registration scope so two copies of the app hosted on the same
// website (e.g. github.io/house-one/ and github.io/house-two/) never clear each other's cache.
const CACHE = `shell-v2:${self.registration.scope}`;
const SHELL = ['./', 'index.html', 'theme.css', 'styles.css', 'app.js', 'site-config.js', 'firebase-config.js', 'icons/logo.jpg', 'icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  const mine = (k) => k.startsWith('shell-') && k.endsWith(`:${self.registration.scope}`);
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => (mine(k) && k !== CACHE) || k === 'rosedene-shell-v1').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // network first so updates show up straight away; fall back to cache when offline
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
