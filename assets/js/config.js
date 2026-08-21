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
    dailyTab: "dailyentry",
    printerTab: "printerdetails",
    dailyRange: "A:K",
    tokensTab: "fcmtokens"  // FCM token storage tab
  },
  adsense: {
    client: "ca-pub-6055348642277254", // Official AdSense Publisher ID
    slotBanner: "1234567890"            // Replace with your Ad Unit Slot ID
  },
  notifications: {
    // FCM Server Key — Get from Firebase Console → Project Settings → Cloud Messaging → Server Key
    // IMPORTANT: Replace this with your actual FCM Server Key from Firebase Console
    fcmServerKey: "REPLACE_WITH_FCM_SERVER_KEY",
    // VAPID Public Key — Get from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
    vapidKey: "REPLACE_WITH_VAPID_PUBLIC_KEY",
    // SuperAdmin emails — only these can send push notifications
    superAdmins: [
      "softtech.lovejeet@gmail.com",
      "softtech2009@gmail.com"
    ]
  }
};

// Google OAuth Scope for Sheets access
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// Helper: Check if current user is SuperAdmin
function isSuperAdmin(email) {
  return APP_CONFIG.notifications.superAdmins.includes((email || '').toLowerCase());
}
