// ============================================================
// PrintTrack — Service Worker with FCM Push Support
// ============================================================

const CACHE_NAME = 'printtrack-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/manifest.json',
  '/assets/css/app.css',
  '/assets/js/config.js',
  '/assets/js/auth.js',
  '/assets/js/sheets.js',
  '/assets/js/db.js',
  '/assets/js/app.js',
  '/assets/js/notifications.js'
];

// ── Install ──
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// ── Activate ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
});

// ── Fetch (Network-First for HTML/JS to ensure instant updates) ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('googleapis.com')) return;
  if (event.request.url.includes('fcm.googleapis.com')) return;

  // Network-First for HTML and JS files
  if (event.request.url.endsWith('.html') || event.request.url.endsWith('.js') || event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-First for static assets (images, fonts, css)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});

// ── Push Notification Handler ──
self.addEventListener('push', (event) => {
  let data = { title: 'PrintTrack Alert', body: 'You have a new notification.' };

  try {
    if (event.data) {
      const text = event.data.text();
      try {
        data = JSON.parse(text);
      } catch {
        data.body = text;
      }
    }
  } catch (e) {}

  const notifTitle = data.title || 'PrintTrack';
  const notifOptions = {
    body: data.body || 'New alert from PrintTrack.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'printtrack-alert',
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: false,
    data: {
      url: data.url || '/app.html',
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: '📂 Open App' },
      { action: 'dismiss', title: '✕ Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(notifTitle, notifOptions)
  );
});

// ── Notification Click Handler ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/app.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes('app.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if not already open
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Background Sync (optional — for offline queued entries) ──
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-entries') {
    // Background sync for offline entries (future feature)
    console.log('[SW] Background sync triggered');
  }
});
