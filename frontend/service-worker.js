/* ============================================================
   Flatmate Portal — Service Worker
   Handles caching for offline support and push notifications.
   ============================================================ */

const CACHE_NAME = 'flatmate-portal-v2';
const ASSETS = [
  '/Flatmate-Portal/',
  '/Flatmate-Portal/index.html',
  '/Flatmate-Portal/app.js',
  '/Flatmate-Portal/style.css',
  '/Flatmate-Portal/manifest.json',
];

// ── Install: pre-cache shell assets ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
  );
  self.skipWaiting();
});

// ── Activate: clear old caches ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// ── Fetch: cache-first for shell, network-first for API ──────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin API calls
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});

// ── Push: display system notification ────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Flatmate Portal';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: data.isEmergency ? [200, 100, 200, 100, 200] : [100],
    requireInteraction: !!data.isEmergency,
    data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: open / focus the app ─────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/') && 'focus' in client) return client.focus();
      }
      return clients.openWindow('/');
    }),
  );
});
