// ============================================================
// PrintTrack — App Configuration
// Firebase project: gen-lang-client-0070625213 (Solar/Certificate)
// ============================================================

const APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyC7gOHZrXz8cIdXBW3_GtkHrrAo5_CdX00",
    authDomain: "gen-lang-client-0070625213.firebaseapp.com",
    projectId: "gen-lang-client-0070625213",
    storageBucket: "gen-lang-client-0070625213.firebasestorage.app",
    messagingSenderId: "334639613582",
    appId: "1:334639613582:web:b01fccff8cf567d3ba6bdf",
    measurementId: "G-XP55N73723"
  },
  sheets: {
    id: "1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0",
    dailyTab: "Form responses 1",
    printerTab: "printerdetails",
    dailyRange: "A:L",
    tokensTab: "fcmtokens",       // FCM token storage tab
    allowedSendersTab: "allowed_senders" // Approved Notification Senders tab
  },
  adsense: {
    client: "ca-pub-6055348642277254", // Official AdSense Publisher ID
    slotBanner: "1234567890"            // Replace with your Ad Unit Slot ID
  },
  notifications: {
    superAdmins: [
      "softtech.lovejeet@gmail.com"
    ],
    directors: [
      "softtech2009@gmail.com"
    ]
  },
  // Dynamic Environment & Host Aware API Base URL Resolver
  get apiBaseUrl() {
    if (typeof window === "undefined") return "";
    
    // 1. Explicit window override (e.g. from server/env injection)
    if (typeof window.__API_BASE_URL__ === "string") {
      return window.__API_BASE_URL__;
    }

    const host = window.location.hostname || "";
    const port = window.location.port || "";
    const origin = window.location.origin || "";

    // 2. Netlify Production Web App
    if (origin.includes("netlify.app") || host.endsWith("netlify.app")) {
      return "";
    }

    // 3. Local Development (Running under Netlify CLI dev server port 8888 or 8080)
    if ((host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") && (port === "8080" || port === "8888")) {
      return "";
    }

    // 4. Default Production Cloud Backend (Used when testing on Apache/XAMPP or LAN)
    return "https://snmc-smspl.netlify.app";
  }
};

// Google OAuth Scope for Sheets access
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

let cachedAllowedSenders = [];

// User-to-Hospital Mappings (Customizable / Configurable)
// SuperAdmins & Directors always have 'ALL' access with interactive switcher.
const USER_HOSPITAL_MAP = {
  "softtech.lovejeet@gmail.com": "ALL",
  "softtech2009@gmail.com": "ALL",
  "softtech.solar@gmail.com": "ALL"
};

// Helper: Check if current user is technical SuperAdmin (Root Admin)
function isSuperAdmin(email) {
  return (APP_CONFIG.notifications.superAdmins || []).includes((email || '').toLowerCase());
}

// Helper: Check if current user is Director (Executive Oversight)
function isDirector(email) {
  const clean = (email || '').toLowerCase();
  return (APP_CONFIG.notifications.directors || []).includes(clean) || clean === "softtech2009@gmail.com";
}

// Helper: Check if user has ALL Hospital oversight access (SuperAdmin or Director)
function isExecutiveUser(email) {
  return isSuperAdmin(email) || isDirector(email);
}

// Helper: Get mapped hospital for a user (MDM, MGH, UMMED, or ALL)
function getUserHospital(email) {
  if (!email) return "ALL";
  const cleanEmail = email.toLowerCase().trim();
  if (isSuperAdmin(cleanEmail) || isDirector(cleanEmail)) return "ALL";
  
  // Check local mapping or return assigned
  return USER_HOSPITAL_MAP[cleanEmail] || "ALL";
}

// Helper: Check if user is SuperAdmin or explicitly Approved by SuperAdmin
function isAllowedSender(email) {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  if (isSuperAdmin(cleanEmail)) return true;
  return cachedAllowedSenders.map(e => e.toLowerCase().trim()).includes(cleanEmail);
}
