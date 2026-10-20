// ============================================================
// PrintTrack â€” Service Worker with FCM Push Support
// ============================================================

const CACHE_NAME = 'printtrack-v51';
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
  './assets/js/modules/team-directory.js',
  './assets/js/modules/stock-ledger.js',
  './assets/js/modules/hardware-printers.js',
  './assets/js/modules/vision-scanner.js',
  './assets/js/modules/toner-tracker.js',
  './assets/js/app.js',
  './assets/js/notifications.js',
  './assets/js/admob.js'
];

// â”€â”€ Install â”€â”€
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

// â”€â”€ Activate â”€â”€
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
});

// â”€â”€ Fetch Strategy (Robust Offline & Query-Param Aware) â”€â”€
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);

  // Skip external Google / Firebase / CDN endpoints
  if (url.hostname.includes('googleapis.com') || 
      url.hostname.includes('google.com') ||
      url.hostname.includes('jsdelivr.net') ||
      url.hostname.includes('unpkg.com') ||
      url.hostname.includes('github.com') ||
      url.hostname.includes('githubusercontent.com')) return;

  // Never cache API calls â€” pass straight to network
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

  // Static Assets (JS, CSS, Images, Manifest) â€” Stale-While-Revalidate / Cache-First with Safe Fallback
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

// â”€â”€ Push Notification Handler â”€â”€
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
      { action: 'open', title: 'ðŸ“‚ Open App' },
      { action: 'dismiss', title: 'âœ• Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(notifTitle, notifOptions)
  );
});

// â”€â”€ Notification Click Handler â”€â”€
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

// â”€â”€ Background Sync (optional â€” for offline queued entries) â”€â”€
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-entries') {
    // Background sync for offline entries (future feature)
    console.log('[SW] Background sync triggered');
  }
});
