// ============================================================
// auth.js — Firebase Google Sign-In with Sheets OAuth Scope
// PrintTrack PWA
// ============================================================

// Initialize Firebase (compat SDK)
if (!firebase.apps.length) {
  firebase.initializeApp(APP_CONFIG.firebase);
}

// ── Storage Keys ──────────────────────────────────────────
const KEY_TOKEN = "pt_gtoken";
const KEY_USER  = "pt_user";

// ── Storage Helpers (localStorage for PWA & WebView persistence) ──
function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(KEY_USER)); }
  catch { return null; }
}

function getAccessToken() {
  return sessionStorage.getItem(KEY_TOKEN) || localStorage.getItem(KEY_TOKEN);
}

function setSessionData(token, user) {
  if (token) {
    sessionStorage.setItem(KEY_TOKEN, token);
    localStorage.removeItem(KEY_TOKEN);
  }
  if (user)  localStorage.setItem(KEY_USER, JSON.stringify(user));
}

async function getAuthToken(forceRefresh = false) {
  const user = firebase.auth().currentUser;
  if (!user) return null;
  const token = await user.getIdToken(forceRefresh);
  setSessionData(token, {
    name: user.displayName || "User",
    email: user.email || "",
    photo: user.photoURL || "",
    uid: user.uid
  });
  return token;
}

// Detect iOS / Safari browser
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome"));
}

// ── Google Sign-In (Smart fallback: Native Redirect on iOS/Safari, Popup on Desktop) ──
// Authentication only — Sheets I/O is handled server-side via Netlify Function + Service Account
async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  // iOS Safari blocks cross-domain popup windows aggressively — use redirect directly on iOS
  if (isIOS()) {
    console.log("[Auth] iOS/Safari detected. Executing signInWithRedirect directly...");
    await firebase.auth().signInWithRedirect(provider);
    return;
  }

  // Timeout guard: If popup hangs on Android WebView or Desktop, fallback to redirect
  const popupPromise = firebase.auth().signInWithPopup(provider);
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("POPUP_TIMEOUT")), 12000)
  );

  let result;
  try {
    result = await Promise.race([popupPromise, timeoutPromise]);
  } catch (err) {
    if (
      err.message === "POPUP_TIMEOUT" || 
      err.code === "auth/popup-blocked" || 
      err.code === "auth/popup-closed-by-user" ||
      err.code === "auth/operation-not-supported-in-this-environment"
    ) {
      console.warn("[Auth] Popup issue detected (" + err.code + "), switching to redirect...");
      await firebase.auth().signInWithRedirect(provider);
      return;
    }
    throw err;
  }

  const token = result && result.user ? await result.user.getIdToken() : "";

  // Persist token & user info in localStorage
  setSessionData(token, {
    name:  result.user.displayName  || "User",
    email: result.user.email        || "",
    photo: result.user.photoURL     || "",
    uid:   result.user.uid
  });

  return { token, user: getStoredUser() };
}

// Check redirect result on load (for mobile APK/WebView fallback)
firebase.auth().getRedirectResult().then(async (result) => {
  if (result && result.user) {
    const token = await result.user.getIdToken();
    setSessionData(token, {
      name:  result.user.displayName  || "User",
      email: result.user.email        || "",
      photo: result.user.photoURL     || "",
      uid:   result.user.uid
    });
    window.location.replace("app.html");
  }
}).catch((err) => {
  console.error("Redirect sign-in error:", err);
});

// ── Auth Guard (call on protected pages) ──────────────────
async function requireAuth() {
  return new Promise((resolve) => {
    const unsubscribe = firebase.auth().onAuthStateChanged(async (fbUser) => {
      unsubscribe(); // Prevent duplicate triggers
      if (fbUser) {
        const storedUser = {
          name: fbUser.displayName || "User",
          email: fbUser.email || "",
          photo: fbUser.photoURL || "",
          uid: fbUser.uid
        };
        const storedToken = await fbUser.getIdToken();

        // Save back to storage so subsequent requests have token
        setSessionData(storedToken, storedUser);
        resolve({ token: storedToken, user: storedUser });
      } else {
        // Explicit redirect to login page when no authenticated session exists
        redirectToLogin("not_signed_in");
        resolve(null);
      }
    }, (authError) => {
      console.error("[Auth Guard] Authentication state check failed:", authError);
      redirectToLogin("auth_error");
      resolve(null);
    });
  });
}

// ── Sign Out ──────────────────────────────────────────────
async function signOut() {
  localStorage.removeItem(KEY_TOKEN);
  localStorage.removeItem(KEY_USER);
  sessionStorage.removeItem(KEY_TOKEN);
  sessionStorage.clear();
  try { await firebase.auth().signOut(); } catch (_) {}
  window.location.href = "index.html";
}

// ── Redirect helpers ──────────────────────────────────────
function redirectToLogin(reason = "") {
  window.location.href = "index.html" + (reason ? "?msg=" + reason : "");
}

function handleTokenExpiry() {
  localStorage.removeItem(KEY_TOKEN);
  sessionStorage.removeItem(KEY_TOKEN);
  redirectToLogin("token_expired");
}
