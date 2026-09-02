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
    let vapidKey = APP_CONFIG.notifications?.vapidKey;

    // If not in client config, fetch securely from backend config endpoint
    if (!vapidKey) {
      try {
        const confRes = await sheetsRequest("config");
        if (confRes && confRes.vapidKey) {
          vapidKey = confRes.vapidKey;
        }
      } catch (_) {}
    }

    if (!vapidKey || vapidKey === 'REPLACE_WITH_VAPID_PUBLIC_KEY') {
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

// ── Save FCM Token (Client registration) ──
async function saveTokenToSheet(token) {
  // Push notifications in this deployment are ephemeral (broadcast in-app / Web Push)
  // Sheets writes are restricted to server-side backend.
}

// ── Read All Tokens from Sheet ──
async function getAllTokensFromSheet() {
  return [];
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

// ── Allowed Senders Management ──
async function addAllowedSender(email) {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return;

  try {
    showToast(`Approving ${cleanEmail}...`, "info");
    const data = await sheetsRequest("approveSender", {
      method: "POST",
      body: JSON.stringify({ email: cleanEmail })
    });
    
    if (data && data.ok) {
      if (!cachedAllowedSenders.includes(cleanEmail)) {
        cachedAllowedSenders.push(cleanEmail);
      }
      showToast(`✅ ${cleanEmail} approved and saved to allowed_senders!`, "success");
      const inputEl = document.getElementById("approve-email-input");
      if (inputEl) inputEl.value = "";
    } else {
      showToast("Approval failed.", "error");
    }
  } catch (err) {
    showToast(`Failed to approve sender: ${err.message}`, "error");
  }
}

// ── Send Multi-Format Push Notification (Text / Voice / Image — Server-Side Broadcast) ──
async function sendPushNotification(type, title, message, imageUrl = "", soundDuration = "medium") {
  const user = firebase.auth().currentUser;
  const userEmail = user?.email || "";

  if (!canSendNotification()) {
    showToast('⛔ Permission Denied: You are not authorized to send push notifications.', 'error');
    return;
  }

  showToast('📤 Broadcasting push notification to all devices...', 'info');

  // Trigger Local Voice / Sound playback for sender test preview
  if (type === "voice") {
    speakText(`${title}. ${message}`);
  } else {
    playAlertSound(soundDuration);
  }

  try {
    // Send via backend serverless function (which securely accesses Service Account / FCM Admin)
    const result = await sheetsRequest("broadcastNotification", {
      method: "POST",
      body: JSON.stringify({
        type,
        title,
        message,
        imageUrl,
        soundDuration,
        senderName: user?.displayName || userEmail
      })
    });

    if (result && result.ok) {
      showInAppNotification(type, title, message, imageUrl, soundDuration);
      showToast('⚡ Notification broadcasted successfully!', 'success');
    } else {
      showInAppNotification(type, title, message, imageUrl, soundDuration);
      showToast('⚡ In-app broadcast triggered.', 'info');
    }
  } catch (err) {
    showInAppNotification(type, title, message, imageUrl, soundDuration);
    showToast('⚡ In-app alert broadcasted.', 'info');
  }
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
  const user = firebase.auth().currentUser || currentUser;
  if (!user) return senderPermission;
  try {
    const res = await sheetsRequest("checkSender");
    senderPermission = {
      checked: true,
      allowed: !!(res.allowed || res.isAllowedSender || res.isSuperAdmin),
      isSuperAdmin: !!res.isSuperAdmin,
      isAllowedSender: !!(res.allowed || res.isAllowedSender),
      email: res.email || user.email || ""
    };
  } catch (e) {
    senderPermission.checked = false; // offline: rely on client gate below
  }
  return senderPermission;
}

function canSendNotification() {
  const user = firebase.auth().currentUser || currentUser;
  const email = (user && user.email ? user.email : "").toLowerCase().trim();
  if (isSuperAdmin(email)) return true;
  if (senderPermission.checked) return !!(senderPermission.allowed || senderPermission.isAllowedSender);
  return isAllowedSender(email);
}

// ── Init: Subscribe user on app load & check sender permissions ──
async function initNotifications() {
  const user = firebase.auth().currentUser;
  if (!user) return;
  const userEmail = (user.email || '').toLowerCase().trim();
  const clientIsSuper = isSuperAdmin(userEmail);

  // Immediate optimistic UI reveal for SuperAdmins
  const notifDropdownItem = document.getElementById('nav-notif-dropdown');
  if (notifDropdownItem && clientIsSuper) {
    notifDropdownItem.style.display = 'flex';
  }
  const superadminBadge = document.getElementById('superadmin-badge');
  if (superadminBadge && clientIsSuper) {
    superadminBadge.style.display = 'inline-flex';
  }

  if (Notification.permission === 'granted') {
    updateNotifBellState('granted');
    await getFCMToken();
  }

  // Server-authoritative sender approval
  await fetchSenderPermission();

  const isAllowed = canSendNotification() || clientIsSuper;
  const isAdmin = senderPermission.checked ? (senderPermission.isSuperAdmin || clientIsSuper) : clientIsSuper;

  // Show dropdown menu item and Push Broadcast tab if user is SuperAdmin or Approved Sender
  if (notifDropdownItem) {
    notifDropdownItem.style.display = isAllowed ? 'flex' : 'none';
  }

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
