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

// ── Google Sign-In (with Popup fallback to Redirect for Android WebView/APK) ──
async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope(SHEETS_SCOPE);
  provider.setCustomParameters({ prompt: "select_account" });

  // Timeout guard: If popup hangs (common in WebView/PWA APK), fallback to redirect
  const popupPromise = firebase.auth().signInWithPopup(provider);
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("POPUP_TIMEOUT")), 15000)
  );

  let result;
  try {
    result = await Promise.race([popupPromise, timeoutPromise]);
  } catch (err) {
    if (err.message === "POPUP_TIMEOUT" || err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
      console.warn("Popup blocked/timed out in environment, switching to redirect...");
      await firebase.auth().signInWithRedirect(provider);
      return;
    }
    throw err;
  }

  const token = result.credential ? result.credential.accessToken : null;

  // Persist token & user info for this session
  if (token) sessionStorage.setItem(KEY_TOKEN, token);
  sessionStorage.setItem(KEY_USER, JSON.stringify({
    name:  result.user.displayName  || "User",
    email: result.user.email        || "",
    photo: result.user.photoURL     || "",
    uid:   result.user.uid
  }));

  return { token, user: getStoredUser() };
}

// Check redirect result on load (for mobile APK/WebView fallback)
firebase.auth().getRedirectResult().then((result) => {
  if (result && result.user && result.credential) {
    sessionStorage.setItem(KEY_TOKEN, result.credential.accessToken);
    sessionStorage.setItem(KEY_USER, JSON.stringify({
      name:  result.user.displayName  || "User",
      email: result.user.email        || "",
      photo: result.user.photoURL     || "",
      uid:   result.user.uid
    }));
    window.location.replace("app.html");
  }
}).catch((err) => {
  console.error("Redirect sign-in error:", err);
});

// ── Helpers ───────────────────────────────────────────────
function getStoredUser() {
  try { return JSON.parse(sessionStorage.getItem(KEY_USER)); }
  catch { return null; }
}

function getAccessToken() {
  return sessionStorage.getItem(KEY_TOKEN);
}

// ── Auth Guard (call on protected pages) ──────────────────
async function requireAuth() {
  const token = getAccessToken();
  const user  = getStoredUser();

  if (token && user) return { token, user };

  // No token/user in session — redirect to login without triggering automatic popup
  return new Promise((resolve, reject) => {
    firebase.auth().onAuthStateChanged((fbUser) => {
      if (!fbUser) {
        redirectToLogin("not_signed_in");
        reject("unauthenticated");
      } else {
        // Firebase user exists but OAuth access token missing from session
        redirectToLogin("token_expired");
        reject("token_expired");
      }
    });
  });
}

// ── Sign Out ──────────────────────────────────────────────
async function signOut() {
  sessionStorage.clear();
  try { await firebase.auth().signOut(); } catch (_) {}
  window.location.href = "index.html";
}

// ── Redirect helpers ──────────────────────────────────────
function redirectToLogin(reason = "") {
  window.location.href = "index.html" + (reason ? "?msg=" + reason : "");
}

function handleTokenExpiry() {
  sessionStorage.removeItem(KEY_TOKEN);
  redirectToLogin("token_expired");
}
