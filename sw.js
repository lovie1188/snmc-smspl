// ============================================================
// PrintTrack — Service Worker with FCM Push Support
// ============================================================

const CACHE_NAME = 'printtrack-v21';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './assets/css/app.css',
  './assets/js/config.js',
  './assets/js/schema.js',
  './assets/js/auth.js',
  './assets/js/sheets.js',
  './assets/js/db.js',
  './assets/js/ocr.js',
  './assets/js/app.js',
  './assets/js/notifications.js',
  './assets/js/admob.js'
];

// ── Install ──
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use Promise.allSettled so a single missing asset does not fail the entire SW install
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url).then((res) => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => {})
        )
      );
    })
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

// ── Fetch Strategy (Robust Offline & Query-Param Aware) ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);

  // Skip external Google / Firebase endpoints
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) return;

  // Never cache API calls — pass straight to network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) {
    return;
  }

  // HTML Navigation Requests (Network-First with clean cache fallback)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // Fallback to cache without query string if exact URL not cached
          return (await caches.match(event.request)) || 
                 (await caches.match(url.pathname)) || 
                 (await caches.match('./index.html')) || 
                 (await caches.match('./app.html'));
        })
    );
    return;
  }

  // Static Assets (JS, CSS, Images, Manifest) — Stale-While-Revalidate / Cache-First with Safe Fallback
  event.respondWith(
    caches.match(event.request).then(async (cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      } catch (err) {
        // Safe fallback without throwing uncaught promise rejection
        const fallback = await caches.match(url.pathname);
        if (fallback) return fallback;
        throw err;
      }
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
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
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
