// ============================================================
// PrintTrack — Push Notification Manager
// Uses Firebase Cloud Messaging (FCM) for Web Push
// SuperAdmins: softtech.lovejeet@gmail.com, softtech2009@gmail.com
// ============================================================

// ── Alert Sound Generator (Web Audio API — no file needed) ──
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const times = [0, 0.18, 0.36];
    times.forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime + t);
      osc.frequency.setValueAtTime(1200, ctx.currentTime + t + 0.06);
      gain.gain.setValueAtTime(0.6, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.16);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.16);
    });
  } catch (e) {
    console.warn('[Notifications] Audio playback failed:', e.message);
  }
}

// ── Request Notification Permission & Get FCM Token ──
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('⚠️ Notifications not supported in this browser.', 'warn');
    return null;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    showToast('🔕 Notification permission denied.', 'warn');
    updateNotifBellState('denied');
    return null;
  }

  updateNotifBellState('granted');
  return await getFCMToken();
}

// ── Get FCM Token via Service Worker ──
async function getFCMToken() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const vapidKey = APP_CONFIG.notifications.vapidKey;

    if (!vapidKey || vapidKey === 'REPLACE_WITH_VAPID_PUBLIC_KEY') {
      console.warn('[Notifications] VAPID key not configured. Using basic push subscription.');
      return await getBasicPushToken(reg);
    }

    // Convert VAPID key
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });
    const token = btoa(JSON.stringify(subscription));
    await saveTokenToSheet(token);
    return token;

  } catch (err) {
    console.warn('[Notifications] FCM token error:', err.message);
    return await getFallbackToken();
  }
}

// ── Fallback: Store browser fingerprint token ──
async function getFallbackToken() {
  const user = firebase.auth().currentUser;
  if (!user) return null;
  const token = 'fb-' + user.uid + '-' + Date.now();
  await saveTokenToSheet(token);
  return token;
}

// ── Basic Push Subscription (without VAPID) ──
async function getBasicPushToken(reg) {
  try {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const token = btoa(JSON.stringify(sub));
      await saveTokenToSheet(token);
      return token;
    }
  } catch (e) {}
  return await getFallbackToken();
}

// ── Save FCM Token to Google Sheet (fcmtokens tab) ──
async function saveTokenToSheet(token) {
  const user = firebase.auth().currentUser;
  if (!user) return;

  const accessToken = getAccessToken();
  if (!accessToken) return;

  const sheetId = APP_CONFIG.sheets.id;
  const tab = APP_CONFIG.sheets.tokensTab || 'fcmtokens';
  const timestamp = new Date().toISOString();
  const email = user.email || '';
  const displayName = user.displayName || '';

  const url = `${SHEETS_API_BASE}/${sheetId}/values/'${tab}'!A:D:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [[email, displayName, token, timestamp]]
      })
    });
    console.log('[Notifications] Token saved to sheet for:', email);
  } catch (err) {
    console.warn('[Notifications] Could not save token:', err.message);
  }
}

// ── Read All Tokens from Sheet ──
async function getAllTokensFromSheet() {
  const accessToken = getAccessToken();
  if (!accessToken) return [];

  const sheetId = APP_CONFIG.sheets.id;
  const tab = APP_CONFIG.sheets.tokensTab || 'fcmtokens';

  try {
    const res = await fetch(
      `${SHEETS_API_BASE}/${sheetId}/values/'${tab}'!A:D`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    const rows = (data.values || []).slice(1); // skip header
    // Deduplicate by email — keep latest token per user
    const tokenMap = {};
    rows.forEach(r => {
      if (r[0] && r[2]) tokenMap[r[0]] = r[2];
    });
    return Object.values(tokenMap);
  } catch (err) {
    console.warn('[Notifications] Could not read tokens:', err.message);
    return [];
  }
}

// ── SuperAdmin: Send Push Notification via FCM Legacy API ──
async function sendPushNotification(title, body) {
  const user = firebase.auth().currentUser;
  if (!user || !isSuperAdmin(user.email)) {
    showToast('⛔ Only SuperAdmins can send notifications.', 'error');
    return;
  }

  const serverKey = APP_CONFIG.notifications.fcmServerKey;
  if (!serverKey || serverKey === 'REPLACE_WITH_FCM_SERVER_KEY') {
    // Demo mode — show in-app notification only to test sound
    showInAppNotification(title, body, true);
    showToast('⚠️ FCM Server Key not set. Showing demo notification.', 'warn');
    return;
  }

  showToast('📤 Sending notifications...', 'info');

  const tokens = await getAllTokensFromSheet();
  if (!tokens || tokens.length === 0) {
    showToast('📭 No subscribers found.', 'warn');
    return;
  }

  let sent = 0, failed = 0;

  for (const token of tokens) {
    try {
      const payload = {
        to: token,
        notification: {
          title: title,
          body: body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          sound: 'default',
          vibrate: [200, 100, 200],
          tag: 'printtrack-alert'
        },
        data: {
          url: 'https://snmc-smspl.netlify.app/app.html',
          timestamp: Date.now().toString()
        }
      };

      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${serverKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (result.success > 0) sent++;
      else failed++;
    } catch (e) {
      failed++;
    }
  }

  showToast(`✅ Notification sent to ${sent} device(s). ${failed > 0 ? `${failed} failed.` : ''}`, 'success');
  logNotificationToSheet(title, body, sent, failed);
}

// ── Log sent notifications to sheet (optional) ──
async function logNotificationToSheet(title, body, sent, failed) {
  const accessToken = getAccessToken();
  if (!accessToken) return;

  const sheetId = APP_CONFIG.sheets.id;
  const timestamp = new Date().toLocaleString('en-IN');
  const user = firebase.auth().currentUser;

  try {
    await fetch(
      `${SHEETS_API_BASE}/${sheetId}/values/'notifications'!A:F:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [[timestamp, user?.email || '', title, body, sent, failed]]
        })
      }
    );
  } catch (e) {}
}

// ── Show In-App Toast Notification (local) ──
function showInAppNotification(title, body, withSound = true) {
  if (withSound) playAlertSound();

  // Also show native notification if granted
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'printtrack-alert',
        renotify: true,
        vibrate: [200, 100, 200],
        requireInteraction: false
      });
    } catch (e) {}
  }

  // Show styled in-app banner
  const banner = document.createElement('div');
  banner.className = 'notif-banner';
  banner.innerHTML = `
    <div class="notif-banner-icon">🔔</div>
    <div class="notif-banner-content">
      <div class="notif-banner-title">${escapeHtml(title)}</div>
      <div class="notif-banner-body">${escapeHtml(body)}</div>
    </div>
    <button class="notif-banner-close" onclick="this.parentElement.remove()">✕</button>
  `;
  document.body.appendChild(banner);
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 6000);
}

// ── Show simple toast (uses app's existing toast or creates one) ──
function showToast(msg, type = 'info') {
  // Use app's existing showNotification if available
  if (typeof showNotification === 'function') {
    showNotification(msg, type);
    return;
  }
  // Fallback inline toast
  const t = document.createElement('div');
  t.className = `toast-msg toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Update Bell Icon State in Header ──
function updateNotifBellState(state) {
  const bell = document.getElementById('notif-bell-btn');
  if (!bell) return;
  if (state === 'granted') {
    bell.classList.add('notif-active');
    bell.title = 'Notifications enabled';
  } else if (state === 'denied') {
    bell.classList.add('notif-denied');
    bell.title = 'Notifications blocked';
  }
}

// ── Init: Subscribe user on app load if permission already granted ──
async function initNotifications() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  if (Notification.permission === 'granted') {
    updateNotifBellState('granted');
    // Silently refresh token
    await getFCMToken();
  }

  // Show SuperAdmin notification panel if applicable
  if (isSuperAdmin(user.email)) {
    const panel = document.getElementById('superadmin-notif-panel');
    if (panel) panel.style.display = 'block';
    const headerAdminBadge = document.getElementById('superadmin-badge');
    if (headerAdminBadge) headerAdminBadge.style.display = 'inline-flex';
  }
}

// ── Utility: VAPID key converter ──
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ── Utility: Get stored OAuth access token ──
function getAccessToken() {
  try {
    return sessionStorage.getItem('gapi_access_token') ||
           localStorage.getItem('gapi_access_token') || null;
  } catch (e) { return null; }
}

// ── Utility: Escape HTML for safe injection ──
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
