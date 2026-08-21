// ============================================================
// PrintTrack — Push Notification Manager
// Uses Firebase Cloud Messaging (FCM) for Web Push
// SuperAdmins: softtech.lovejeet@gmail.com, softtech2009@gmail.com
// ============================================================

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

// ── Alert Sound Generator (Web Audio API — Short, Medium, Long Beeps) ──
function playAlertSound(duration = "medium") {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let beepCount = 3;
    let beepDuration = 0.16;

    if (duration === "short") {
      beepCount = 1;
      beepDuration = 0.1;
    } else if (duration === "long") {
      beepCount = 6;
      beepDuration = 0.25;
    }

    for (let i = 0; i < beepCount; i++) {
      const t = i * (beepDuration + 0.08);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime + t);
      osc.frequency.setValueAtTime(1200, ctx.currentTime + t + 0.06);
      gain.gain.setValueAtTime(0.6, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + beepDuration);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + beepDuration);
    }
  } catch (e) {
    console.warn('[Notifications] Audio playback failed:', e.message);
  }
}

// ── Text to Speech (Voice Notification Helper) ──
function speakText(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // stop previous speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

// ── Allowed Senders Management (Read & Save Allowed Users) ──
// NOTE: Reading the approved-sender list is now server-side via the
// /checkSender Netlify action (see fetchSenderPermission). The previous
// direct apiKey fetch is removed because Firebase web keys are not Cloud API
// keys and cannot read a PRIVATE sheet.

async function addAllowedSender(email) {
  const user = firebase.auth().currentUser;
  if (!user || !isSuperAdmin(user.email)) {
    showToast("⛔ Only SuperAdmins can approve new notification senders.", "error");
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return;

  const accessToken = getAccessToken();
  const sheetId = APP_CONFIG.sheets.id;
  const tab = APP_CONFIG.sheets.allowedSendersTab || 'allowed_senders';

  try {
    await fetch(`${SHEETS_API_BASE}/${sheetId}/values/'${tab}'!A:B:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [[cleanEmail, new Date().toISOString()]]
      })
    });
    cachedAllowedSenders.push(cleanEmail);
    showToast(`✅ ${cleanEmail} approved to send notifications!`, "success");
    renderAllowedSendersList();
  } catch (e) {
    showToast("Failed to add sender: " + e.message, "error");
  }
}

// ── Send Multi-Format Push Notification (Text / Voice / Image — NOT Saved) ──
async function sendPushNotification(type, title, message, imageUrl = "", soundDuration = "medium") {
  const user = firebase.auth().currentUser;
  const userEmail = user?.email || "";

  if (!canSendNotification()) {
    showToast('⛔ Permission Denied: You are not authorized to send push notifications.', 'error');
    return;
  }

  showToast('📤 Broadcasting push notification to all devices...', 'info');

  // Trigger Local Voice / Sound playback for sender test
  if (type === "voice") {
    speakText(`${title}. ${message}`);
  } else {
    playAlertSound(soundDuration);
  }

  const serverKey = APP_CONFIG.notifications.fcmServerKey;
  if (!serverKey || serverKey === 'REPLACE_WITH_FCM_SERVER_KEY') {
    // Demo Mode — Show local push broadcast
    showInAppNotification(type, title, message, imageUrl, soundDuration);
    showToast('⚡ Notification broadcasted to all active devices!', 'success');
    return;
  }

  const tokens = await getAllTokensFromSheet();
  if (!tokens || tokens.length === 0) {
    showToast('📭 No registered device subscribers found.', 'warn');
    return;
  }

  let sent = 0, failed = 0;

  for (const token of tokens) {
    try {
      const payload = {
        to: token,
        notification: {
          title: title,
          body: message,
          image: imageUrl || undefined,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          sound: 'default',
          vibrate: soundDuration === "long" ? [300, 100, 300, 100, 300] : [200, 100, 200]
        },
        data: {
          type: type,
          imageUrl: imageUrl,
          soundDuration: soundDuration
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

  showToast(`✅ Notification sent to ${sent} device(s). (Not saved to database as requested)`, 'success');
}

// ── Show In-App Toast Notification (local) ──
function showInAppNotification(type, title, body, imageUrl = "", soundDuration = "medium") {
  if (type === "voice") {
    speakText(`${title}. ${body}`);
  } else {
    playAlertSound(soundDuration);
  }

  // Also show native notification if granted
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body,
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/icon-192.png',
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
  const imageHtml = (imageUrl && type === "image")
    ? `<img src="${escapeHtml(imageUrl)}" alt="notification image" style="max-width:100%; border-radius:6px; margin-top:6px;">`
    : '';
  banner.innerHTML = `
    <div class="notif-banner-icon">🔔</div>
    <div class="notif-banner-content">
      <div class="notif-banner-title">${escapeHtml(title)}</div>
      <div class="notif-banner-body">${escapeHtml(body)}</div>
      ${imageHtml}
    </div>
    <button class="notif-banner-close" onclick="this.parentElement.remove()">✕</button>
  `;
  document.body.appendChild(banner);
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 8000);
}

// NOTE: showToast is defined once in app.js and is global; do not redefine here.

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

// ── UI Form Field Toggles ──
function toggleNotifTypeFields() {
  const typeVal = document.getElementById("notif-type-select")?.value || "text";
  const imgGroup = document.getElementById("group-notif-image");
  if (imgGroup) {
    imgGroup.style.display = typeVal === "image" ? "block" : "none";
  }
}

async function handleSendNotificationSubmit(e) {
  if (e) e.preventDefault();
  const type = document.getElementById("notif-type-select")?.value || "text";
  const title = document.getElementById("notif-title-input")?.value?.trim();
  const body = document.getElementById("notif-body-input")?.value?.trim();
  const imageUrl = document.getElementById("notif-image-input")?.value?.trim() || "";
  const duration = document.getElementById("notif-beep-duration")?.value || "medium";

  if (!title || !body) {
    showToast("Please fill title and message body.", "warn");
    return;
  }

  const btn = document.getElementById("notif-send-btn");
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Broadcasting...`; }

  try {
    await sendPushNotification(type, title, body, imageUrl, duration);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `📤 Broadcast Push`; }
  }
}

function handleTestNotification() {
  const type = document.getElementById("notif-type-select")?.value || "text";
  const title = document.getElementById("notif-title-input")?.value?.trim() || "Test Broadcast Alert";
  const body = document.getElementById("notif-body-input")?.value?.trim() || "This is a test notification sound & voice alert.";
  const duration = document.getElementById("notif-beep-duration")?.value || "medium";

  if (type === "voice") {
    speakText(`${title}. ${body}`);
    showToast("🗣️ Playing Voice (Text-to-Speech)...", "info");
  } else {
    playAlertSound(duration);
    showToast(`🔊 Playing ${duration} beep sound test...`, "info");
  }
}

async function handleApproveSenderClick() {
  const emailInput = document.getElementById("approve-email-input");
  const email = emailInput?.value?.trim();
  if (!email) {
    showToast("Please enter a valid user email.", "warn");
    return;
  }
  await addAllowedSender(email);
  if (emailInput) emailInput.value = "";
}

// ── Server-authoritative sender permission (from /checkSender) ──
// The browser may still hide UI optimistically, but the broadcast path must
// confirm this server decision. Falls back to the client-only gate only when
// the server check is unreachable (offline).
let senderPermission = { checked: false, allowed: false, isSuperAdmin: false, email: "" };

async function fetchSenderPermission() {
  const user = firebase.auth().currentUser;
  if (!user) return senderPermission;
  try {
    const res = await sheetsRequest("checkSender");
    senderPermission = {
      checked: true,
      allowed: !!res.allowed,
      isSuperAdmin: !!res.isSuperAdmin,
      email: res.email || user.email || ""
    };
  } catch (e) {
    senderPermission.checked = false; // offline: rely on client gate below
  }
  return senderPermission;
}

function canSendNotification() {
  if (senderPermission.checked) return senderPermission.allowed;
  const email = (firebase.auth().currentUser && firebase.auth().currentUser.email) || "";
  return isAllowedSender(email);
}

// ── Init: Subscribe user on app load & check sender permissions ──
async function initNotifications() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  if (Notification.permission === 'granted') {
    updateNotifBellState('granted');
    await getFCMToken();
  }

  // Server-authoritative sender approval (replaces broken client-only fetch).
  await fetchSenderPermission();

  const userEmail = user.email || '';
  const isAllowed = canSendNotification();
  const isAdmin = senderPermission.checked ? senderPermission.isSuperAdmin : isSuperAdmin(userEmail);

  // Show dropdown menu item and Push Broadcast tab only if user is SuperAdmin or Approved Sender
  const notifDropdownItem = document.getElementById('nav-notif-dropdown');
  if (notifDropdownItem) {
    notifDropdownItem.style.display = isAllowed ? 'flex' : 'none';
  }

  const superadminBadge = document.getElementById('superadmin-badge');
  if (superadminBadge) {
    superadminBadge.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  const approvalCard = document.getElementById('superadmin-sender-approval-card');
  if (approvalCard) {
    approvalCard.style.display = isAdmin ? 'block' : 'none';
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

// NOTE: escapeHtml is defined once in app.js (escapes & < > " ') and is global.
