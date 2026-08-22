// ============================================================
// Netlify Serverless API Function — Google Sheets Backend
// PrintTrack PWA — SNMC
// Sheet ID: 1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0
// ============================================================

const SHEET_ID = "1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0";
const DAILY_TAB = "Form responses 1";
const PRINTER_TAB = "printerdetails";
const DAILY_RANGE = "A:L";
const ALLOWED_SENDERS_TAB = "allowed_senders";
const FCMTOKENS_TAB = "fcmtokens";
const STOCK_TAB = "stock";
const STOCK_RANGE = "A:M";
const USER_HOSPITALS_TAB = "user_hospitals";
const USER_HOSPITALS_RANGE = "A:C";
// Server-authoritative SuperAdmin list (override per environment via SUPER_ADMIN_EMAILS).
const SUPER_ADMINS = (process.env.SUPER_ADMIN_EMAILS || "softtech.lovejeet@gmail.com,softtech2009@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0070625213";
const FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const { createVerify } = require("crypto");
const { JWT } = require("google-auth-library");

let firebaseCertCache = { expiresAt: 0, certs: null };
let sheetsJwtClient = null;
let fcmJwtClient = null;

function jsonResponse(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, "base64");
}

async function getFirebaseCerts() {
  if (firebaseCertCache.certs && firebaseCertCache.expiresAt > Date.now()) {
    return firebaseCertCache.certs;
  }

  const res = await fetch(FIREBASE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Firebase cert fetch failed: HTTP ${res.status}`);
  }

  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 60 * 60 * 1000;
  const certs = await res.json();
  firebaseCertCache = { certs, expiresAt: Date.now() + maxAgeMs };
  return certs;
}

async function verifyFirebaseIdToken(authHeader) {
  const match = String(authHeader || "").match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error("Missing Authorization bearer token.");
    err.statusCode = 401;
    throw err;
  }

  const token = match[1];
  const parts = token.split(".");
  if (parts.length !== 3) {
    const err = new Error("Invalid token format.");
    err.statusCode = 401;
    throw err;
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
  } catch {
    const err = new Error("Invalid token payload.");
    err.statusCode = 401;
    throw err;
  }

  if (header.alg !== "RS256" || !header.kid) {
    const err = new Error("Unsupported token algorithm.");
    err.statusCode = 401;
    throw err;
  }

  const certs = await getFirebaseCerts();
  const cert = certs[header.kid];
  if (!cert) {
    const err = new Error("Unknown token signing key.");
    err.statusCode = 401;
    throw err;
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const isValidSignature = verifier.verify(cert, base64UrlDecode(parts[2]));
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

  if (
    !isValidSignature ||
    payload.aud !== FIREBASE_PROJECT_ID ||
    payload.iss !== expectedIssuer ||
    !payload.sub ||
    payload.exp <= now
  ) {
    const err = new Error("Invalid or expired token.");
    err.statusCode = 401;
    throw err;
  }

  return {
    uid: payload.sub,
    email: payload.email || "",
    name: payload.name || ""
  };
}

function getSheetsJwtClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    return null;
  }

  if (!sheetsJwtClient) {
    sheetsJwtClient = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
  }

  return sheetsJwtClient;
}

async function getSheetsAuthHeaders() {
  const client = getSheetsJwtClient();
  if (!client) return null;
  const token = await client.getAccessToken();
  if (!token || !token.token) {
    throw new Error("SERVER_CONFIG_ERROR: Could not obtain Google Sheets service account token.");
  }
  return { Authorization: `Bearer ${token.token}` };
}

async function getFcmAuthHeaders() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    const err = new Error("SERVER_CONFIG_ERROR: Google service account credentials are required for push notifications.");
    err.statusCode = 500;
    throw err;
  }

  if (!fcmJwtClient) {
    fcmJwtClient = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"]
    });
  }

  const token = await fcmJwtClient.getAccessToken();
  if (!token || !token.token) {
    throw new Error("SERVER_CONFIG_ERROR: Could not obtain Firebase Messaging service account token.");
  }
  return { Authorization: `Bearer ${token.token}` };
}

// Fetch sheet data using server environment variable (GOOGLE_SHEETS_API_KEY only — no hardcoded fallback)
async function fetchSheetDataPublic(range) {
  const authHeaders = await getSheetsAuthHeaders();
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!authHeaders && !apiKey) {
    throw new Error("SERVER_CONFIG_ERROR: Configure Google Sheets service account credentials or GOOGLE_SHEETS_API_KEY.");
  }
  const query = authHeaders ? "" : `?key=${apiKey}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}${query}`;

  const res = await fetch(url, authHeaders ? { headers: authHeaders } : undefined);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Sheets API HTTP ${res.status}: ${errText || res.statusText}`);
  }
  return res.json();
}

// Read approved sender emails from the allowed_senders tab (service-account auth).
async function readAllowedSendersFromSheet() {
  try {
    const data = await fetchSheetDataPublic(`'${ALLOWED_SENDERS_TAB}'!A:B`);
    if (!data || !data.values) return [];
    return data.values.slice(1)
      .map((r) => String(r[0] || "").trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function appendDailyEntry(row) {
  const authHeaders = await getSheetsAuthHeaders();
  if (!authHeaders) {
    throw new Error("SERVER_CONFIG_ERROR: Google Sheets service account credentials are required for writes.");
  }

  if (!Array.isArray(row) || row.length < 11 || row.length > 12) {
    const err = new Error("Invalid daily entry payload.");
    err.statusCode = 400;
    throw err;
  }

  const cleanRow = row.map((value) => String(value ?? "").slice(0, 500));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${DAILY_TAB}'!${DAILY_RANGE}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [cleanRow] })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Sheets append failed: HTTP ${res.status}: ${errText || res.statusText}`);
  }

  return res.json();
}

async function appendSheetRow(tab, range, row) {
  const authHeaders = await getSheetsAuthHeaders();
  if (!authHeaders) {
    throw new Error("SERVER_CONFIG_ERROR: Google Sheets service account credentials are required for writes.");
  }

  const cleanRow = row.map((value) => String(value ?? "").slice(0, 1000));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${tab}'!${range}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [cleanRow] })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Sheets append failed: HTTP ${res.status}: ${errText || res.statusText}`);
  }

  return res.json();
}

async function readFcmTokensFromSheet() {
  try {
    const data = await fetchSheetDataPublic(`'${FCMTOKENS_TAB}'!A:D`);
    if (!data || !data.values) return [];

    const latestByEmail = new Map();
    data.values.slice(1).forEach((row) => {
      const email = String(row[0] || "").trim().toLowerCase();
      const token = String(row[2] || "").trim();
      const timestamp = String(row[3] || "").trim();
      if (email && token) latestByEmail.set(email, { email, token, timestamp });
    });

    return [...latestByEmail.values()];
  } catch {
    return [];
  }
}

async function sendFcmMessage(token, payload) {
  const authHeaders = await getFcmAuthHeaders();
  const url = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;
  const notification = {
    title: payload.title,
    body: payload.message
  };
  if (payload.imageUrl) notification.image = payload.imageUrl;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        token,
        notification,
        data: {
          type: payload.type || "text",
          imageUrl: payload.imageUrl || "",
          soundDuration: payload.soundDuration || "medium",
          senderName: payload.senderName || ""
        },
        webpush: {
          notification: {
            icon: "/assets/icons/icon-192.png",
            badge: "/assets/icons/icon-192.png"
          }
        }
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`FCM send failed: HTTP ${res.status}: ${errText || res.statusText}`);
  }

  return res.json();
}

// ── Read User-to-Hospital Mappings from Google Sheet (user_hospitals tab) ──
async function getUserHospitalPermissions(email) {
  if (!email) return { hospitals: [], isSuperAdmin: false, isAll: false };
  const cleanEmail = email.toLowerCase().trim();

  // SuperAdmins always have full global access
  if (SUPER_ADMINS.includes(cleanEmail)) {
    return { hospitals: ["ALL"], isSuperAdmin: true, isAll: true };
  }

  try {
    const data = await fetchSheetDataPublic(`'${USER_HOSPITALS_TAB}'!${USER_HOSPITALS_RANGE}`);
    if (data && data.values && data.values.length > 1) {
      const rows = data.values.slice(1);
      for (const row of rows) {
        const rowEmail = String(row[0] || "").toLowerCase().trim();
        if (rowEmail === cleanEmail) {
          const hospStr = String(row[1] || "").toUpperCase().trim();
          const role = String(row[2] || "").trim();
          const isSuper = role.toLowerCase() === "superadmin" || hospStr === "ALL";
          const hospitals = hospStr === "ALL" ? ["ALL"] : hospStr.split(",").map(h => h.trim()).filter(Boolean);
          return { hospitals, isSuperAdmin: isSuper, isAll: hospitals.includes("ALL") };
        }
      }
    }
  } catch (err) {
    console.warn("Could not read user_hospitals tab:", err.message);
  }

  // Default fallback if not mapped in sheet (deny access to unassigned or restrict)
  return { hospitals: [], isSuperAdmin: false, isAll: false };
}

// ── Check if a hospital matches user's allowed hospital set server-side ──
function isHospitalAllowedServer(hospitalName, allowedHospitals, isAll) {
  if (isAll) return true;
  if (!hospitalName) return false;
  const cleanHosp = String(hospitalName).trim().toUpperCase();
  return allowedHospitals.some(h => cleanHosp.includes(h.toUpperCase()));
}

// Allowed origins — Netlify prod + local dev (XAMPP on :80, netlify dev on :8888, LAN IPs)
const ALLOWED_ORIGINS = [
  "https://snmc-smspl.netlify.app",
  "http://localhost",
  "http://localhost:80",
  "http://localhost:8080",
  "http://localhost:8888",
  "https://localhost",
  "http://127.0.0.1",
  "http://127.0.0.1:80",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:8888",
  "https://127.0.0.1"
];

function isOriginAllowed(origin) {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Allow LAN IP formats (e.g., http://192.168.1.101:8080 or http://10.* or http://172.*)
  if (/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

exports.handler = async function (event, context) {
  const origin = event.headers.origin || "";
  const allowedOrigin = isOriginAllowed(origin);

  // CORS Headers — restricted to known origins & LAN only
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const action = (event.queryStringParameters && event.queryStringParameters.action) || "printerdetails";

  try {
    const claims = await verifyFirebaseIdToken(event.headers.authorization || event.headers.Authorization);
    const userEmail = (claims.email || "").toLowerCase();

    // ── Enforce Server-Side User Hospital Permissions ──
    const userPerms = await getUserHospitalPermissions(userEmail);
    const { hospitals: allowedHospitals, isAll: hasAllAccess, isSuperAdmin: userIsSuperAdmin } = userPerms;

    // ── 1. Fetch Printer Details (Server-Side Filtered by User Hospital) ──
    if (action === "printerdetails" && event.httpMethod === "GET") {
      const data = await fetchSheetDataPublic(`'${PRINTER_TAB}'!A:Z`);
      if (!data || !data.values || data.values.length < 2) {
        return { statusCode: 200, headers, body: JSON.stringify({ headers: [], rows: [] }) };
      }

      const rawHeaders = data.values[0].map(h => String(h).trim());
      const allRows = data.values.slice(1)
        .filter(row => row.some(cell => String(cell).trim() !== ""))
        .map(row => {
          const obj = {};
          rawHeaders.forEach((h, i) => { obj[h] = String(row[i] || "").trim(); });
          return obj;
        });

      // Server-Side Hospital Authorization Filtering
      const filteredRows = hasAllAccess 
        ? allRows 
        : allRows.filter(r => isHospitalAllowedServer(r["Hospital"], allowedHospitals, false));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          headers: rawHeaders, 
          rows: filteredRows,
          userHospital: hasAllAccess ? "ALL" : allowedHospitals.join(", "),
          isSuperAdmin: userIsSuperAdmin
        })
      };
    }

    // ── 2. Fetch Daily Entries for History (Server-Side Filtered by User Hospital) ──
    if (action === "dailyentries" && event.httpMethod === "GET") {
      const [dailyData, printerSheetData] = await Promise.all([
        fetchSheetDataPublic(`'${DAILY_TAB}'!${DAILY_RANGE}`),
        fetchSheetDataPublic(`'${PRINTER_TAB}'!A:Z`)
      ]);

      if (!dailyData || !dailyData.values || dailyData.values.length === 0) {
        return { statusCode: 200, headers, body: JSON.stringify({ headers: [], rows: [] }) };
      }

      // Build counter-to-hospital lookup from printer details
      const counterHospitalLookup = {};
      if (printerSheetData && printerSheetData.values && printerSheetData.values.length > 1) {
        const pHeaders = printerSheetData.values[0].map(h => String(h).trim());
        const cNoIdx = pHeaders.findIndex(h => h.toLowerCase().includes("counter no"));
        const hospIdx = pHeaders.findIndex(h => h.toLowerCase().includes("hospital"));
        const cFullIdx = pHeaders.findIndex(h => h.toLowerCase() === "counter");

        printerSheetData.values.slice(1).forEach(pRow => {
          const hosp = String(pRow[hospIdx] || "").trim().toUpperCase();
          if (cNoIdx !== -1 && pRow[cNoIdx]) counterHospitalLookup[String(pRow[cNoIdx]).trim().toUpperCase()] = hosp;
          if (cFullIdx !== -1 && pRow[cFullIdx]) counterHospitalLookup[String(pRow[cFullIdx]).trim().toUpperCase()] = hosp;
        });
      }

      const rawHeaders = dailyData.values[0].map(h => String(h).trim());
      const allRows = dailyData.values.slice(1)
        .filter(row => row.some(cell => String(cell).trim() !== ""))
        .map(row => {
          const obj = {};
          rawHeaders.forEach((h, i) => {
            obj[h] = String(row[i] !== undefined && row[i] !== null ? row[i] : "").trim();
          });
          return obj;
        });

      // Server-Side Hospital Authorization Filtering
      const filteredRows = hasAllAccess 
        ? allRows 
        : allRows.filter(r => {
            const hospCol = r["Hospital Name"] || r["Hospital Name "] || r["Hospital"] || "";
            const counterVal = (r["counter Number"] || r["Counter Number"] || r["Counter"] || "").trim().toUpperCase();
            const cleanCounter = counterVal.split(" ")[0].trim();
            const inferredHospital = hospCol || counterHospitalLookup[counterVal] || counterHospitalLookup[cleanCounter] || "";
            return isHospitalAllowedServer(inferredHospital, allowedHospitals, false);
          });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          headers: rawHeaders, 
          rows: filteredRows,
          userHospital: hasAllAccess ? "ALL" : allowedHospitals.join(", "),
          isSuperAdmin: userIsSuperAdmin
        })
      };
    }

    // ── 3. Append Daily Entry (Server-Side Verified Authorization) ──
    if (action === "appendDailyEntry" && event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const row = payload.row || [];

      // Validate user is authorized for the hospital being submitted
      if (!hasAllAccess && row.length > 3) {
        const submittedCounter = String(row[3] || "").trim();
        // Check if counter matches allowed hospital
        const data = await fetchSheetDataPublic(`'${PRINTER_TAB}'!A:Z`);
        if (data && data.values) {
          const pHeaders = data.values[0].map(h => String(h).trim());
          const hospIdx = pHeaders.findIndex(h => h.toLowerCase().includes("hospital"));
          const cNoIdx = pHeaders.findIndex(h => h.toLowerCase().includes("counter no"));
          const cFullIdx = pHeaders.findIndex(h => h.toLowerCase() === "counter");

          const matchingPrinter = data.values.slice(1).find(pRow => {
            const cNo = String(pRow[cNoIdx] || "").trim();
            const cFull = String(pRow[cFullIdx] || "").trim();
            return submittedCounter.startsWith(cNo) || submittedCounter === cFull;
          });

          if (matchingPrinter && hospIdx !== -1) {
            const printerHospital = String(matchingPrinter[hospIdx] || "").trim();
            if (!isHospitalAllowedServer(printerHospital, allowedHospitals, false)) {
              return jsonResponse(403, headers, { error: `Unauthorized: You do not have permission to submit entries for ${printerHospital} Hospital.` });
            }
          }
        }
      }

      const data = await appendDailyEntry(row);
      return jsonResponse(200, headers, { ok: true, data });
    }

    // ── 4. Fetch Stock / Paper Received (Server-Side Filtered by User Hospital) ──
    if (action === "stock" && event.httpMethod === "GET") {
      const data = await fetchSheetDataPublic(`'${STOCK_TAB}'!${STOCK_RANGE}`);
      if (!data || !data.values || data.values.length === 0) {
        return { statusCode: 200, headers, body: JSON.stringify({ headers: [], rows: [] }) };
      }

      const rawHeaders = data.values[0].map(h => String(h).trim());
      const allRows = data.values.slice(1)
        .filter(row => row.some(cell => String(cell).trim() !== ""))
        .map(row => {
          const obj = {};
          rawHeaders.forEach((h, i) => {
            obj[h] = String(row[i] !== undefined && row[i] !== null ? row[i] : "").trim();
          });
          return obj;
        });

      // Server-Side Hospital Authorization Filtering
      const filteredRows = hasAllAccess
        ? allRows
        : allRows.filter(r => isHospitalAllowedServer(r["HOSPITAL"], allowedHospitals, false));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          headers: rawHeaders, 
          rows: filteredRows,
          userHospital: hasAllAccess ? "ALL" : allowedHospitals.join(", "),
          isSuperAdmin: userIsSuperAdmin
        })
      };
    }

    // ── 5. Server-authoritative notification sender check ──
    if (action === "checkSender" && event.httpMethod === "GET") {
      const email = userEmail;
      const isSuper = userIsSuperAdmin;
      const allowedSenders = await readAllowedSendersFromSheet();
      const isAllowed = isSuper || allowedSenders.includes(email);
      return jsonResponse(200, headers, {
        allowed: isAllowed,
        isAllowedSender: isAllowed,
        isSuperAdmin: isSuper,
        email
      });
    }

    // ── 6. Register FCM/Web Push token server-side ──
    if (action === "registerFcmToken" && event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const token = String(payload.token || "").trim();
      if (!token) {
        const err = new Error("Missing notification token.");
        err.statusCode = 400;
        throw err;
      }
      await appendSheetRow(FCMTOKENS_TAB, "A:D", [
        userEmail,
        claims.name || "",
        token,
        new Date().toISOString()
      ]);
      return jsonResponse(200, headers, { ok: true });
    }

    // ── 7. SuperAdmin approves notification sender ──
    if (action === "approveSender" && event.httpMethod === "POST") {
      if (!userIsSuperAdmin) {
        const err = new Error("Only SuperAdmins can approve notification senders.");
        err.statusCode = 403;
        throw err;
      }

      const payload = JSON.parse(event.body || "{}");
      const email = String(payload.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const err = new Error("Invalid email address.");
        err.statusCode = 400;
        throw err;
      }

      const allowedSenders = await readAllowedSendersFromSheet();
      if (!allowedSenders.includes(email)) {
        await appendSheetRow(ALLOWED_SENDERS_TAB, "A:B", [email, new Date().toISOString()]);
      }
      return jsonResponse(200, headers, { ok: true, email });
    }

    // ── 8. Server-side push broadcast ──
    if (action === "broadcastNotification" && event.httpMethod === "POST") {
      const allowedSenders = await readAllowedSendersFromSheet();
      const canBroadcast = userIsSuperAdmin || allowedSenders.includes(userEmail);
      if (!canBroadcast) {
        const err = new Error("You are not authorized to broadcast notifications.");
        err.statusCode = 403;
        throw err;
      }

      const payload = JSON.parse(event.body || "{}");
      const title = String(payload.title || "").trim().slice(0, 80);
      const message = String(payload.message || "").trim().slice(0, 250);
      if (!title || !message) {
        const err = new Error("Notification title and message are required.");
        err.statusCode = 400;
        throw err;
      }

      const tokens = await readFcmTokensFromSheet();
      let sent = 0;
      let failed = 0;

      for (const item of tokens) {
        try {
          await sendFcmMessage(item.token, {
            type: String(payload.type || "text"),
            title,
            message,
            imageUrl: String(payload.imageUrl || "").trim(),
            soundDuration: String(payload.soundDuration || "medium"),
            senderName: String(payload.senderName || userEmail)
          });
          sent++;
        } catch (err) {
          console.warn("[FCM] Send failed:", err.message);
          failed++;
        }
      }

      return jsonResponse(200, headers, { ok: true, sent, failed, total: tokens.length });
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: `Unsupported action: ${action}` })
    };

  } catch (err) {
    console.error("[Backend API] Error:", err.message);
    const statusCode = err.statusCode || 500;
    // Sanitize error message to prevent leaking internal stack/credentials
    const userSafeMsg = statusCode === 401 ? "Unauthorized: Please log in again."
      : statusCode === 403 ? (err.message || "Forbidden: Access denied.")
      : statusCode === 400 ? (err.message || "Bad Request.")
      : "An internal server error occurred. Please try again later.";
    return jsonResponse(statusCode, headers, { error: userSafeMsg });
  }
};
