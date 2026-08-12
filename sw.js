// ============================================================
// PrintTrack — Service Worker with FCM Push Support
// ============================================================

const CACHE_NAME = 'printtrack-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/manifest.json',
  '/assets/css/app.css',
  '/assets/js/config.js',
  '/assets/js/auth.js',
  '/assets/js/sheets.js',
  '/assets/js/app.js',
  '/assets/js/notifications.js'
];

// ── Install ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  // DO NOT call self.skipWaiting() here.
  // skipWaiting causes immediate SW activation + clients.claim() which
  // triggers page reload loops in PWABuilder APK WebView environments.
});

// ── Activate ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
  // DO NOT call self.clients.claim() here.
  // clients.claim() causes the SW to immediately control all open clients
  // which triggers reload loops in PWABuilder APK WebView environments.
});

// ── Fetch (Cache-First) ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('googleapis.com')) return;
  if (event.request.url.includes('fcm.googleapis.com')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
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
