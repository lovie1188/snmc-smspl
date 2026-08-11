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

// ── Google Sign-In ────────────────────────────────────────
async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope(SHEETS_SCOPE);
  // Force account picker each time so user can pick correct account
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await firebase.auth().signInWithPopup(provider);
  const token  = result.credential.accessToken;

  // Persist token & user info for this session
  sessionStorage.setItem(KEY_TOKEN, token);
  sessionStorage.setItem(KEY_USER, JSON.stringify({
    name:  result.user.displayName  || "User",
    email: result.user.email        || "",
    photo: result.user.photoURL     || "",
    uid:   result.user.uid
  }));

  return { token, user: getStoredUser() };
}

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

  // No session — check Firebase state
  return new Promise((resolve, reject) => {
    firebase.auth().onAuthStateChanged(async (fbUser) => {
      if (!fbUser) {
        redirectToLogin("not_signed_in");
        reject("unauthenticated");
        return;
      }
      // Firebase user exists but OAuth token expired → silent re-auth
      try {
        const result = await signInWithGoogle();
        resolve(result);
      } catch (err) {
        redirectToLogin("token_expired");
        reject(err);
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
