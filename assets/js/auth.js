// ============================================================
// auth.js — Mobile-First Email/Password & Firebase Google Sign-In
// PrintTrack PWA — Softtech Centralized Neon DB Auth
// ============================================================

// Initialize Firebase (compat SDK)
if (typeof firebase !== "undefined" && !firebase.apps.length) {
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
    localStorage.setItem(KEY_TOKEN, token);
  }
  if (user) {
    localStorage.setItem(KEY_USER, JSON.stringify(user));
  }
}

// ── Unified API Base URL Helper ─────────────────────────────
function getApiBaseUrl() {
  if (typeof APP_CONFIG !== "undefined" && typeof APP_CONFIG.apiBaseUrl === "string") {
    return APP_CONFIG.apiBaseUrl;
  }
  return "";
}

async function getAuthToken(forceRefresh = false) {
  // If stored session token exists (Neon DB JWT or saved token), prioritize it
  const storedToken = getAccessToken();
  if (storedToken) {
    return storedToken;
  }

  // Fallback: If user is actively authenticated via Firebase Google
  const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
  if (user) {
    try {
      const token = await user.getIdToken(forceRefresh);
      const existing = getStoredUser() || {};
      setSessionData(token, {
        ...existing,
        name: user.displayName || existing.name || "User",
        email: user.email || existing.email || "",
        photo: user.photoURL || existing.photo || "",
        uid: user.uid
      });
      return token;
    } catch (e) {
      console.warn("[Auth] Firebase token fetch failed:", e.message);
    }
  }

  return null;
}

// Detect iOS / Safari browser
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome"));
}

// ── 1. Email + Password Login via Centralized Neon DB ──
async function signInWithEmailPassword(usernameOrEmail, password) {
  const baseUrl = getApiBaseUrl();
  const apiUrl = baseUrl ? `${baseUrl}/.netlify/functions/auth?action=login` : `/.netlify/functions/auth?action=login`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: usernameOrEmail, password })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Login failed. Please check your credentials.");
  }

  // Persist session
  const userData = data.user || {};
  userData.authType = "neon";
  setSessionData(data.token, userData);
  return data;
}

// ── 2. SuperAdmin Check & Status of Google Auth on Login Page ──
async function fetchGoogleAuthStatus() {
  try {
    const baseUrl = getApiBaseUrl();
    const apiUrl = baseUrl ? `${baseUrl}/.netlify/functions/auth?action=getGoogleAuthStatus` : `/.netlify/functions/auth?action=getGoogleAuthStatus`;
    const res = await fetch(apiUrl);
    if (res.ok) {
      const data = await res.json();
      return !!data.googleAuthEnabled;
    }
  } catch (_) {}
  return false;
}

async function setGoogleAuthToggle(enabled) {
  const token = await getAuthToken();
  const baseUrl = getApiBaseUrl();
  const apiUrl = baseUrl ? `${baseUrl}/.netlify/functions/auth?action=toggleGoogleAuth` : `/.netlify/functions/auth?action=toggleGoogleAuth`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ enabled })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to update Google auth setting.");
  }
  return data;
}

// ── 3. Connect Google Account Inside Profile ──
async function linkGoogleAccountInProfile() {
  if (typeof firebase === "undefined" || !firebase.auth) {
    throw new Error("Firebase SDK not initialized.");
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await firebase.auth().signInWithPopup(provider);

  if (!result || !result.user) {
    throw new Error("Google sign-in cancelled or failed.");
  }

  const fbUser = result.user;
  const token = await getAuthToken();

  const baseUrl = getApiBaseUrl();
  const apiUrl = baseUrl ? `${baseUrl}/.netlify/functions/auth?action=linkGoogleAccount` : `/.netlify/functions/auth?action=linkGoogleAccount`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      firebaseUid: fbUser.uid,
      googleEmail: fbUser.email
    })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to link Google account to profile.");
  }

  // Update stored user
  const stored = getStoredUser() || {};
  stored.googleLinked = true;
  stored.firebase_uid = fbUser.uid;
  if (fbUser.photoURL && !stored.photo) stored.photo = fbUser.photoURL;
  setSessionData(token, stored);

  return data;
}

// ── 4. Password Reset via Google Verification (Instant & Secure) ──
async function resetPasswordWithGoogleVerified(email, newPassword) {
  if (typeof firebase === "undefined" || !firebase.auth) {
    throw new Error("Firebase SDK is not available.");
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await firebase.auth().signInWithPopup(provider);
  if (!result || !result.user) {
    throw new Error("Google verification cancelled.");
  }

  const fbUser = result.user;
  const token = await fbUser.getIdToken();

  const baseUrl = getApiBaseUrl();
  const apiUrl = baseUrl ? `${baseUrl}/.netlify/functions/auth?action=resetPasswordWithGoogle` : `/.netlify/functions/auth?action=resetPasswordWithGoogle`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      newPassword: newPassword.trim(),
      firebaseIdToken: token
    })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to reset password.");
  }
  return data;
}

// ── 5. Send Standard Firebase Password Reset Link ──
async function sendFirebasePasswordReset(email) {
  if (typeof firebase === "undefined" || !firebase.auth) {
    throw new Error("Firebase SDK is not available.");
  }
  await firebase.auth().sendPasswordResetEmail(email.trim().toLowerCase());
  return { success: true, message: "Password reset link sent to your email." };
}

// ── 4. Google Sign-In on Login Screen (if enabled by SuperAdmin) ──
async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  if (isIOS()) {
    await firebase.auth().signInWithRedirect(provider);
    return;
  }

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
      await firebase.auth().signInWithRedirect(provider);
      return;
    }
    throw err;
  }

  const token = result && result.user ? await result.user.getIdToken() : "";

  setSessionData(token, {
    name:  result.user.displayName  || "User",
    email: result.user.email        || "",
    photo: result.user.photoURL     || "",
    uid:   result.user.uid
  });

  return { token, user: getStoredUser() };
}

// ── 5. Shared Authorization Gatekeeper (Queries backend /checkAuth) ──
async function verifyUserAuthorization(userEmail, idToken) {
  const cleanEmail = (userEmail || "").toLowerCase().trim();
  if (isSuperAdmin(cleanEmail)) {
    return { authorized: true, role: "SuperAdmin" };
  }

  try {
    const baseUrl = (typeof APP_CONFIG !== "undefined" && APP_CONFIG.apiBaseUrl) ? APP_CONFIG.apiBaseUrl : "";
    let checkUrl = baseUrl ? `${baseUrl}/.netlify/functions/sheets?action=checkAuth` : `/.netlify/functions/sheets?action=checkAuth`;
    let res = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${idToken}` }
    }).catch(() => null);

    if (!res || !res.ok) {
      const fallbackUrl = "https://snmc-smspl.netlify.app/.netlify/functions/sheets?action=checkAuth";
      res = await fetch(fallbackUrl, {
        headers: { Authorization: `Bearer ${idToken}` }
      }).catch(() => null);
    }

    if (res && res.ok) {
      const data = await res.json();
      return {
        authorized: data.authorized === true,
        memberType: data.memberType || "",
        role: data.role || "Operator",
        hospitals: data.hospitals || [],
        isSuperAdmin: data.isSuperAdmin === true,
        reason: data.authorized === true ? "" : "Login Access is NOT Active in Manpower Directory"
      };
    }
  } catch (err) {
    console.warn("[Auth Gatekeeper] CheckAuth request failed:", err.message);
  }

  return { authorized: false, reason: "Server verification unreachable" };
}

// ── 6. Auth Guard (call on protected pages e.g. app.html) ──
async function requireAuth() {
  const storedUser = getStoredUser();
  const token = getAccessToken();

  if (!storedUser || !token) {
    redirectToLogin("not_signed_in");
    return null;
  }

  const userEmail = (storedUser.email || "").toLowerCase().trim();
  const isSuper = isSuperAdmin(userEmail);

  if (isSuper) {
    storedUser.role = "SuperAdmin";
    storedUser.isSuperAdmin = true;
    storedUser.hospitals = ["ALL"];
    setSessionData(token, storedUser);
    return { token, user: storedUser };
  }

  // Verify access live with serverless backend
  try {
    const check = await verifyUserAuthorization(userEmail, token);
    if (check.authorized !== true) {
      await signOut();
      const reasonParam = encodeURIComponent(check.reason || "Unauthorized");
      window.location.replace(`index.html?msg=unauthorized&email=${encodeURIComponent(userEmail)}&reason=${reasonParam}`);
      return null;
    }

    storedUser.role = check.role || storedUser.role || "Operator";
    storedUser.hospitals = check.hospitals || storedUser.hospitals || ["ALL"];
    storedUser.memberType = check.memberType || storedUser.memberType || "Operator";
    storedUser.isSuperAdmin = check.isSuperAdmin || false;

    setSessionData(token, storedUser);
    return { token, user: storedUser };
  } catch (e) {
    // If offline, allow existing stored session
    return { token, user: storedUser };
  }
}

// ── 7. Sign Out ──
async function signOut() {
  localStorage.removeItem(KEY_TOKEN);
  localStorage.removeItem(KEY_USER);
  sessionStorage.removeItem(KEY_TOKEN);
  sessionStorage.clear();
  try {
    if (typeof firebase !== "undefined" && firebase.auth) {
      await firebase.auth().signOut();
    }
  } catch (_) {}
  window.location.href = "index.html";
}

// ── 8. Redirect helpers ──
function redirectToLogin(reason = "") {
  window.location.href = "index.html" + (reason ? "?msg=" + reason : "");
}

function handleTokenExpiry() {
  localStorage.removeItem(KEY_TOKEN);
  sessionStorage.removeItem(KEY_TOKEN);
  redirectToLogin("token_expired");
}

