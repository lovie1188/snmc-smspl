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
// Server-authoritative SuperAdmin list (override per environment via SUPER_ADMIN_EMAILS).
const SUPER_ADMINS = (process.env.SUPER_ADMIN_EMAILS || "softtech.lovejeet@gmail.com,softtech2009@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0070625213";
const FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const { createVerify } = require("crypto");
const { JWT } = require("google-auth-library");

let firebaseCertCache = { expiresAt: 0, certs: null };
let sheetsJwtClient = null;

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

// Allowed origins — Netlify prod + local dev (XAMPP on :80, netlify dev on :8888)
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

exports.handler = async function (event, context) {
  const origin = event.headers.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  // CORS Headers — restricted to known origins only
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
    await verifyFirebaseIdToken(event.headers.authorization || event.headers.Authorization);

    // ── 1. Fetch Printer Details for Dropdowns ──
    if (action === "printerdetails" && event.httpMethod === "GET") {
      const data = await fetchSheetDataPublic(`'${PRINTER_TAB}'!A:Z`);
      if (!data || !data.values || data.values.length < 2) {
        return { statusCode: 200, headers, body: JSON.stringify({ headers: [], rows: [] }) };
      }

      const rawHeaders = data.values[0].map(h => String(h).trim());
      const rows = data.values.slice(1)
        .filter(row => row.some(cell => String(cell).trim() !== ""))
        .map(row => {
          const obj = {};
          rawHeaders.forEach((h, i) => { obj[h] = String(row[i] || "").trim(); });
          return obj;
        });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ headers: rawHeaders, rows })
      };
    }

    // ── 2. Fetch Daily Entries for History ──
    if (action === "dailyentries" && event.httpMethod === "GET") {
      const data = await fetchSheetDataPublic(`'${DAILY_TAB}'!${DAILY_RANGE}`);
      if (!data || !data.values || data.values.length === 0) {
        return { statusCode: 200, headers, body: JSON.stringify({ headers: [], rows: [] }) };
      }

      const rawHeaders = data.values[0].map(h => String(h).trim());
      const rows = data.values.slice(1)
        .filter(row => row.some(cell => String(cell).trim() !== ""))
        .map(row => {
          const obj = {};
          rawHeaders.forEach((h, i) => {
            obj[h] = String(row[i] !== undefined && row[i] !== null ? row[i] : "").trim();
          });
          return obj;
        });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ headers: rawHeaders, rows })
      };
    }

    // ── 3. Append Daily Entry ──
    if (action === "appendDailyEntry" && event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const data = await appendDailyEntry(payload.row);
      return jsonResponse(200, headers, { ok: true, data });
    }

    // ── 4. Server-authoritative notification sender check ──
    // Replaces the previous client-only isAllowedSender() gate. The browser
    // may still optimistically hide UI, but the broadcast path must confirm
    // this server decision before sending.
    if (action === "checkSender" && event.httpMethod === "GET") {
      const email = (claims.email || "").toLowerCase();
      const isSuperAdmin = SUPER_ADMINS.includes(email);
      const allowedSenders = await readAllowedSendersFromSheet();
      const allowed = isSuperAdmin || allowedSenders.includes(email);
      return jsonResponse(200, headers, {
        email: claims.email,
        isSuperAdmin,
        allowed
      });
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: `Unsupported action: ${action}` })
    };

  } catch (err) {
    console.error("[Backend API] Error:", err.message);
    const statusCode = err.statusCode || 500;
    const message = statusCode === 500 ? "Internal Server Error" : err.message;
    return jsonResponse(statusCode, headers, { error: message });
  }
};
