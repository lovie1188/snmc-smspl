// ============================================================
// Netlify Serverless API Function — Google Sheets Backend
// PrintTrack PWA — SNMC
// Sheet ID: 1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0
// ============================================================

const fs = require("fs");
const path = require("path");

function loadEnvFallback() {
  try {
    const envPath = path.resolve(__dirname, "../../.env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      content.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    }
  } catch (_) { }
}
loadEnvFallback();

const SHEET_ID = "1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0";
const DAILY_TAB = "Form responses 1";
const PRINTER_TAB = "printerdetails";
const DAILY_RANGE = "A:L";
const ALLOWED_SENDERS_TAB = "allowed_senders";
const FCMTOKENS_TAB = "fcmtokens";
const STOCK_TAB = "stock";
const STOCK_RANGE = "A:P";
const USER_HOSPITALS_TAB = "user_hospitals";
const USER_HOSPITALS_RANGE = "A:H";

// ── New Manpower Sheet Integration (Dedicated Employee & Team Master) ──
const MANPOWER_SHEET_ID = "1FrHbNqlJF1BpFdlVLsUMYVIGC9z0N_JS3vjrYAhwazA";
const MANPOWER_TAB = "manpower";
const MANPOWER_RANGE = "A1:AD";

const GOOGLE_DRIVE_PHOTO_FOLDER_ID = "129N1_3z_802vJ-9I5nH9jMmSBinpbzGY";
// Server-authoritative SuperAdmin list (override per environment via SUPER_ADMIN_EMAILS).
const SUPER_ADMINS = (process.env.SUPER_ADMIN_EMAILS || "softtech.lovejeet@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0070625213";
const FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const { createVerify } = require("crypto");
const { JWT } = require("google-auth-library");
const { Client: PgClient } = require("pg");

/**
 * Calls Gemini Vision API with base64 image data
 */
async function callGeminiVision(base64Image, mimeType = "image/jpeg") {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_SHEETS_API_KEY || "";
  if (!geminiKey) {
    throw new Error("No Gemini API key configured in server environment.");
  }

  // Strip prefix data URL if present
  let rawBase64 = base64Image;
  if (base64Image.includes(",")) {
    rawBase64 = base64Image.split(",")[1];
  }

  const promptText = `You are a medical hospital printer scanner system for SNMC PrintTrack.
Analyze this photo of a printer LCD display panel and stickers/labels.
Task:
1. Extract "closingReading": the printer's total meter/page reading count (often labeled "TOTAL COUNT", "TOTAL PAGE", "PAGE COUNT", or shown as a 4-8 digit number e.g. 017606, 000120, 15420). If not clearly visible or unreadable, return null. Return as an integer number.
2. Extract "serialNo": the printer serial number (commonly starting with "ACN", "304", or alphanumeric on HP/Canon label). If not found, return null.
3. Extract "counterMarker": any counter sticker or circle marker number (e.g., circled "16", "#16", "COUNTER 16"). Return as a string or null.
4. Provide "confidence": number between 0.0 and 1.0.

Return ONLY a valid, raw JSON object without markdown fences, with exactly these keys:
{
  "closingReading": <integer or null>,
  "serialNo": <string or null>,
  "counterMarker": <string or null>,
  "confidence": <number>,
  "notes": <short string note>
}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType || "image/jpeg",
              data: rawBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json"
    }
  };

  // Active model fallback chain verified for this API key:
  const models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash"];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.warn(`[Gemini Vision] Model ${model} returned HTTP ${resp.status}:`, errText);
        lastError = new Error(`Gemini ${model} HTTP ${resp.status}: ${errText}`);
        continue;
      }

      const resData = await resp.json();
      const rawCandidateText = resData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!rawCandidateText) {
        lastError = new Error("Empty response from Gemini Vision.");
        continue;
      }

      // Parse JSON
      let cleaned = rawCandidateText.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      }
      const parsed = JSON.parse(cleaned);
      return parsed;
    } catch (e) {
      console.warn(`[Gemini Vision] Model ${model} attempt failed:`, e.message);
      lastError = e;
    }
  }

  throw lastError || new Error("Gemini Vision processing failed across all models.");
}

/**
 * Calls Gemini API with a text-only prompt (no image)
 * Used for AI-generated insights, anomaly analysis, and smart summaries
 */
async function callGeminiText(promptText, temperature = 0.4) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_SHEETS_API_KEY || "";
  if (!geminiKey) {
    throw new Error("No Gemini API key configured in server environment.");
  }

  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: { temperature, maxOutputTokens: 300 }
  };

  const models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash"];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.warn(`[Gemini Text] Model ${model} returned HTTP ${resp.status}:`, errText);
        lastError = new Error(`Gemini ${model} HTTP ${resp.status}`);
        continue;
      }

      const resData = await resp.json();
      const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) { lastError = new Error("Empty response from Gemini Text."); continue; }
      return text.trim();
    } catch (e) {
      console.warn(`[Gemini Text] Model ${model} attempt failed:`, e.message);
      lastError = e;
    }
  }
  throw lastError || new Error("Gemini Text processing failed across all models.");
}

const NEON_DB_URL = process.env.NEON_DATABASE_URL;

// Neon Database Query Helper (Shared with auth.js)
async function queryNeon(sql, params = []) {
  if (!NEON_DB_URL) {
    throw new Error("SERVER_CONFIG_ERROR: NEON_DATABASE_URL environment variable is not configured.");
  }
  const pg = new PgClient({ connectionString: NEON_DB_URL });
  await pg.connect();
  try {
    const res = await pg.query(sql, params);
    await pg.end();
    return res.rows;
  } catch (err) {
    await pg.end();
    throw err;
  }
}

let firebaseCertCache = { expiresAt: 0, certs: null };
let sheetsJwtClient = null;
let fcmJwtClient = null;

let adminPermsCache = { data: null, expiresAt: 0 };
async function getAdminPermissionsCached() {
  const now = Date.now();
  if (adminPermsCache.data && adminPermsCache.expiresAt > now) {
    return adminPermsCache.data;
  }
  let perms = {
    can_add_entry: true,
    can_edit_history: false,
    can_delete_history: false,
    can_add_stock: true,
    can_export_excel: true,
    can_manage_employees: false,
    can_delete_employees: false,
    can_send_broadcast: false
  };
  try {
    const rows = await queryNeon("SELECT setting_value FROM app_settings WHERE setting_key = 'snmc_admin_permissions' LIMIT 1;");
    if (rows.length > 0 && rows[0].setting_value) {
      perms = { ...perms, ...JSON.parse(rows[0].setting_value) };
    }
  } catch (err) {
    console.warn("[Backend] Error fetching admin permissions from Neon DB:", err.message);
  }
  adminPermsCache = { data: perms, expiresAt: now + 30000 }; // 30s cache
  return perms;
}

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

const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("[Security] JWT_SECRET environment variable is not defined!");
}

async function verifyToken(authHeader) {
  const match = String(authHeader || "").match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error("Missing Authorization bearer token.");
    err.statusCode = 401;
    throw err;
  }

  const token = match[1];

  // 1. First check if it's a Neon DB issued JWT token
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.email) {
      return {
        uid: decoded.uid || decoded.id,
        email: decoded.email,
        name: decoded.name || "",
        role: decoded.role || "Operator",
        hospitals: decoded.hospitals || []
      };
    }
  } catch (_) { }

  // 2. If not local JWT, verify Firebase ID Token
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
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  const privateKey = rawKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim();

  if (!clientEmail || !privateKey) {
    return null;
  }

  if (!sheetsJwtClient) {
    sheetsJwtClient = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file"
      ]
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
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  const privateKey = rawKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim();

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
async function fetchSheetDataPublic(range, customSheetId = null) {
  const targetSheetId = customSheetId || SHEET_ID;
  const authHeaders = await getSheetsAuthHeaders();
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!authHeaders && !apiKey) {
    throw new Error("SERVER_CONFIG_ERROR: Configure Google Sheets service account credentials or GOOGLE_SHEETS_API_KEY.");
  }
  const query = authHeaders ? "" : `?key=${apiKey}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${encodeURIComponent(range)}${query}`;

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

async function appendSheetRow(tab, range, row, customSheetId = null) {
  const targetSheetId = customSheetId || SHEET_ID;
  const authHeaders = await getSheetsAuthHeaders();
  if (!authHeaders) {
    throw new Error("SERVER_CONFIG_ERROR: Google Sheets service account credentials are required for writes.");
  }

  const cleanRow = row.map((value) => String(value ?? "").slice(0, 1000));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${encodeURIComponent(`'${tab}'!${range}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

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

async function updateSheetRow(tab, range, row, customSheetId = null) {
  const targetSheetId = customSheetId || SHEET_ID;
  const authHeaders = await getSheetsAuthHeaders();
  if (!authHeaders) {
    throw new Error("SERVER_CONFIG_ERROR: Google Sheets service account credentials are required for writes.");
  }

  const cleanRow = row.map((value) => String(value ?? "").slice(0, 1000));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${encodeURIComponent(`'${tab}'!${range}`)}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [cleanRow] })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Sheets update failed: HTTP ${res.status}: ${errText || res.statusText}`);
  }

  return res.json();
}

/**
 * Uploads an image Buffer to Google Drive, sets public read permission, and returns the direct view link
 */
async function uploadBufferToGoogleDrive(buffer, filename, mimeType = "image/jpeg", folderId = GOOGLE_DRIVE_PHOTO_FOLDER_ID) {
  const authHeaders = await getSheetsAuthHeaders();
  if (!authHeaders) {
    throw new Error("SERVER_CONFIG_ERROR: Google service account credentials required for Drive upload.");
  }

  // 1. Multipart boundary payload to upload metadata + file data
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: filename,
    mimeType: mimeType,
    parents: folderId ? [folderId] : []
  };

  const metadataBuffer = Buffer.from(
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n`
  );

  const closeBuffer = Buffer.from(closeDelimiter);
  const multipartBody = Buffer.concat([metadataBuffer, buffer, closeBuffer]);

  const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink";
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(multipartBody.length)
    },
    body: multipartBody
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText}`);
  }

  const fileData = await uploadRes.json();
  const fileId = fileData.id;

  // 2. Set file permission to anyone with link (read-only)
  try {
    const permUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
    await fetch(permUrl, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone"
      })
    });
  } catch (pErr) {
    console.warn("[Drive Permission Warning]:", pErr.message);
  }

  // Direct embeddable / loadable image link
  const directLink = `https://drive.google.com/uc?id=${fileId}&export=view`;
  return { fileId, directLink };
}

async function clearSheetRow(tab, range, customSheetId = null) {
  const targetSheetId = customSheetId || SHEET_ID;
  const authHeaders = await getSheetsAuthHeaders();
  if (!authHeaders) {
    throw new Error("SERVER_CONFIG_ERROR: Google Sheets service account credentials are required for writes.");
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${encodeURIComponent(`'${tab}'!${range}`)}:clear`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Sheets clear failed: HTTP ${res.status}: ${errText || res.statusText}`);
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

// ── Read User-to-Hospital Mappings from Dedicated Manpower Google Sheet (manpower!A1:AD) ──
async function getUserHospitalPermissions(email) {
  if (!email) return { hospitals: [], isSuperAdmin: false, isAll: false };
  const cleanEmail = email.toLowerCase().trim();

  // SuperAdmins always have full global access
  if (SUPER_ADMINS.includes(cleanEmail)) {
    return { hospitals: ["ALL"], isSuperAdmin: true, isAll: true, isLoginAllowed: true, memberType: "SuperAdmin", role: "SuperAdmin" };
  }

  try {
    const data = await fetchSheetDataPublic(`'${MANPOWER_TAB}'!${MANPOWER_RANGE}`, MANPOWER_SHEET_ID);
    if (data && data.values && data.values.length > 1) {
      const headers = data.values[0].map(h => String(h || "").toLowerCase().trim());

      const emailIdx = headers.findIndex(h => h === "office email" || h.includes("office email"));
      const fallbackEmailIdx = headers.findIndex(h => h === "email id" || h.includes("email id") || h === "email");
      const nameIdx = headers.findIndex(h => h === "name" || h.includes("name"));
      const desigIdx = headers.findIndex(h => h === "designation" || h.includes("designation"));
      const hospIdx = headers.findIndex(h => h === "reporting office" || h.includes("reporting office") || h.includes("hospital"));
      const projIdx = headers.findIndex(h => h === "project");
      const statusIdx = headers.findIndex(h => h === "status");

      const rows = data.values.slice(1);
      for (const row of rows) {
        const primaryEmail = (emailIdx !== -1 ? String(row[emailIdx] || "") : "").toLowerCase().trim();
        const fallbackEmail = (fallbackEmailIdx !== -1 ? String(row[fallbackEmailIdx] || "") : "").toLowerCase().trim();

        if (primaryEmail === cleanEmail || fallbackEmail === cleanEmail) {
          const project = projIdx !== -1 ? String(row[projIdx] || "").trim().toUpperCase() : "";
          const status = statusIdx !== -1 ? String(row[statusIdx] || "").trim().toUpperCase() : "";
          const hospStr = hospIdx !== -1 ? String(row[hospIdx] || "").toUpperCase().trim() : "ALL";
          const role = desigIdx !== -1 ? String(row[desigIdx] || "Operator").trim() : "Operator";
          const name = nameIdx !== -1 ? String(row[nameIdx] || "").trim() : "";

          // Access criteria: Active status AND (SNMC project or Director/SuperAdmin)
          const isSuper = SUPER_ADMINS.includes(cleanEmail) || role.toLowerCase().includes("superadmin");
          const isDirector = cleanEmail === "softtech2009@gmail.com" || role.toLowerCase().includes("director");
          const isProjectAllowed = isSuper || isDirector || !project || project === "SNMC";
          const isStatusActive = status === "ACTIVE" || status === "YES" || status === "1" || status === "TRUE" || !status; // default allow if active/unspecified

          const isLoginAllowed = isSuper || isDirector || (isProjectAllowed && isStatusActive);
          const hospitals = (hospStr === "ALL" || isSuper || isDirector) ? ["ALL"] : hospStr.split(",").map(h => h.trim()).filter(Boolean);

          return {
            hospitals: hospitals.length ? hospitals : ["ALL"],
            isSuperAdmin: isSuper,
            isDirector: isDirector,
            isAll: hospitals.includes("ALL") || isSuper || isDirector,
            isLoginAllowed,
            memberType: role,
            role,
            name,
            project,
            status
          };
        }
      }
    }
  } catch (err) {
    console.warn("Could not read manpower sheet permissions:", err.message);
  }

  // Fallback check in legacy user_hospitals tab if not present in manpower
  try {
    const data = await fetchSheetDataPublic(`'${USER_HOSPITALS_TAB}'!A:E`);
    if (data && data.values && data.values.length > 1) {
      const rows = data.values.slice(1);
      for (const row of rows) {
        const rowEmail = String(row[0] || "").toLowerCase().trim();
        if (rowEmail === cleanEmail) {
          const hospStr = String(row[1] || "").toUpperCase().trim();
          const role = String(row[2] || "").trim();
          const memberType = String(row[3] || "Both").trim();
          const loginFlag = String(row[4] || "YES").trim().toUpperCase();
          const isLoginAllowed = loginFlag === "YES" || loginFlag === "TRUE" || loginFlag === "1";
          const isSuper = role.toLowerCase() === "superadmin" || hospStr === "ALL";
          const hospitals = hospStr === "ALL" ? ["ALL"] : hospStr.split(",").map(h => h.trim()).filter(Boolean);
          return { hospitals, isSuperAdmin: isSuper, isAll: hospitals.includes("ALL"), isLoginAllowed, memberType, role };
        }
      }
    }
  } catch (_) { }

  // Default fallback if not mapped
  return { hospitals: [], isSuperAdmin: false, isAll: false, isLoginAllowed: false, memberType: "Unregistered" };
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
  const origin = (event && event.headers && event.headers.origin) ? event.headers.origin : "";
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

  let action = (event.queryStringParameters && event.queryStringParameters.action) || "";
  if (!action && event.rawQuery) {
    const qMatch = event.rawQuery.match(/action=([^&]+)/);
    if (qMatch) action = decodeURIComponent(qMatch[1]);
  }
  if (!action && event.body) {
    try {
      const parsedBody = JSON.parse(event.body);
      if (parsedBody && parsedBody.action) action = parsedBody.action;
    } catch (_) { }
  }
  if (!action) action = "printerdetails";

  try {
    const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || "";
    const claims = await verifyToken(authHeader);
    const userEmail = (claims.email || "").toLowerCase();

    // ── Enforce Server-Side User Hospital Permissions ──
    const userPerms = await getUserHospitalPermissions(userEmail);
    const { hospitals: allowedHospitals, isAll: hasAllAccess, isSuperAdmin: userIsSuperAdmin } = userPerms;
    const userIsDirector = userPerms.isDirector || claims.isDirector || String(claims.role || "").toLowerCase() === "director";
    const userIsAdmin = !userIsSuperAdmin && !userIsDirector && (String(userPerms.role || "").toLowerCase() === "admin" || String(claims.role || "").toLowerCase() === "admin");
    const adminPermissions = userIsAdmin ? await getAdminPermissionsCached() : null;

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
      if (userIsAdmin && adminPermissions && !adminPermissions.can_add_entry) {
        return jsonResponse(403, headers, { error: "Forbidden: Admin role has not been granted permission to submit new daily entries." });
      }

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

    // ── 4b. Append Stock Entry (SuperAdmin Only) ──
    if (action === "appendStockEntry" && event.httpMethod === "POST") {
      if (!userIsSuperAdmin) {
        const err = new Error("Forbidden: Only SuperAdmins can record new stock receipts.");
        err.statusCode = 403;
        throw err;
      }

      const payload = JSON.parse(event.body || "{}");
      const row = payload.row;
      if (!Array.isArray(row) || row.length < 13) {
        const err = new Error("Invalid stock payload: row array of 13 to 16 columns is required.");
        err.statusCode = 400;
        throw err;
      }

      const appendResult = await appendSheetRow(STOCK_TAB, STOCK_RANGE, row);
      return jsonResponse(200, headers, {
        success: true,
        message: "Stock entry saved successfully to Google Sheets.",
        result: appendResult
      });
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

    // ── 7b. Secure Client Config Endpoint (VAPID key from env) ──
    if (action === "config") {
      const vapidKey = process.env.VITE_FIREBASE_VAPID_KEY || process.env.FIREBASE_VAPID_KEY || "";
      return jsonResponse(200, headers, { vapidKey });
    }

    // ── 8. Server-side push broadcast ──
    if (action === "broadcastNotification" && event.httpMethod === "POST") {
      const allowedSenders = await readAllowedSendersFromSheet();
      const adminCanBroadcast = userIsAdmin && adminPermissions && adminPermissions.can_send_broadcast;
      const canBroadcast = userIsSuperAdmin || adminCanBroadcast || allowedSenders.includes(userEmail);
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

    // ── 9. Live Pre-Login Authorization & User Validation ──
    if (action === "checkAuth" && event.httpMethod === "GET") {
      const isAllowed = userPerms.isSuperAdmin || (userPerms.isLoginAllowed === true);
      return jsonResponse(200, headers, {
        authorized: isAllowed,
        email: userEmail,
        isSuperAdmin: userPerms.isSuperAdmin,
        hospitals: userPerms.hospitals,
        memberType: userPerms.memberType || "App User",
        role: userPerms.role || "Operator"
      });
    }

    // ── 10. Live Fetch Employees from Dedicated Manpower Google Sheet (A1:AD) ──
    if (action === "getEmployees" && event.httpMethod === "GET") {
      const data = await fetchSheetDataPublic(`'${MANPOWER_TAB}'!${MANPOWER_RANGE}`, MANPOWER_SHEET_ID);
      if (!data || !data.values || data.values.length === 0) {
        return jsonResponse(200, headers, { employees: [] });
      }

      const headersRow = data.values[0].map(h => String(h || "").toLowerCase().trim());
      const empIdIdx = headersRow.findIndex(h => h === "employee id" || h.includes("employee id"));
      const nameIdx = headersRow.findIndex(h => h === "name" || h.includes("name"));
      const desigIdx = headersRow.findIndex(h => h === "designation" || h.includes("designation"));
      const contactIdx = headersRow.findIndex(h => h === "contact no." || h.includes("contact"));
      const emailIdx = headersRow.findIndex(h => h === "office email" || h.includes("office email"));
      const fallbackEmailIdx = headersRow.findIndex(h => h === "email id" || h.includes("email id") || h === "email");
      const hospIdx = headersRow.findIndex(h => h === "reporting office" || h.includes("reporting office") || h.includes("hospital"));
      const photoIdx = headersRow.findIndex(h => h === "photo");
      const projIdx = headersRow.findIndex(h => h === "project");
      const statusIdx = headersRow.findIndex(h => h === "status");
      const bloodIdx = headersRow.findIndex(h => h.includes("blood"));

      const rows = data.values.slice(1);
      const employees = rows
        .map((r, i) => {
          const name = nameIdx !== -1 ? String(r[nameIdx] || "").trim() : "";
          const primaryEmail = emailIdx !== -1 ? String(r[emailIdx] || "").trim() : "";
          const fallbackEmail = fallbackEmailIdx !== -1 ? String(r[fallbackEmailIdx] || "").trim() : "";
          const email = primaryEmail || fallbackEmail;
          if (!name && !email) return null;

          const rawEmpId = empIdIdx !== -1 ? String(r[empIdIdx] || "").trim() : "";
          const id = rawEmpId || `SMSPL${String(100 + (i + 1)).padStart(4, "0")}`;
          const designation = desigIdx !== -1 ? String(r[desigIdx] || "Operator").trim() : "Operator";
          const phone = contactIdx !== -1 ? String(r[contactIdx] || "").trim() : "+91 94140 XXXXX";
          const hospital = hospIdx !== -1 ? String(r[hospIdx] || "ALL").trim().toUpperCase() : "ALL";
          const photoUrl = photoIdx !== -1 ? String(r[photoIdx] || "").trim() : "";
          const project = projIdx !== -1 ? String(r[projIdx] || "").trim() : "";
          const status = statusIdx !== -1 ? String(r[statusIdx] || "").trim() : "";
          const bloodGroup = bloodIdx !== -1 ? String(r[bloodIdx] || "").trim() : "";
          const rowIndex = i + 2;

          const projectUpper = project.toUpperCase();
          const statusUpper = status.toUpperCase();
          const roleLower = designation.toLowerCase();
          const isSuper = SUPER_ADMINS.includes(email.toLowerCase()) || roleLower.includes("director") || roleLower.includes("superadmin");

          // Standardized access criteria:
          // 1. SuperAdmin / Director always allowed.
          // 2. Otherwise, PROJECT must be 'SNMC' and STATUS must be 'ACTIVE' (or YES / 1 / TRUE).
          const isProjSNMC = (projectUpper === "SNMC" || (!projectUpper && (hospital === "MDM" || hospital === "MGH" || hospital === "UMMED" || hospital === "UMAID" || hospital === "SNMC")));
          const isStatusActive = (statusUpper === "ACTIVE" || statusUpper === "YES" || statusUpper === "1" || statusUpper === "TRUE");

          let isLoginAllowed = false;
          let accessReason = "🔴 Access Disabled";

          if (isSuper) {
            isLoginAllowed = true;
            accessReason = "⚡ SuperAdmin";
          } else if (isProjSNMC && isStatusActive) {
            isLoginAllowed = true;
            accessReason = "🟢 Login Active (SNMC)";
          } else if (!isProjSNMC) {
            accessReason = "🔴 Non-SNMC Project";
          } else {
            accessReason = "🔴 Inactive Status";
          }

          return {
            id,
            rowIndex,
            name: name || (email ? email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Employee"),
            email: email || "no-email@softtechseva.com",
            phone: phone || "+91 94140 XXXXX",
            photoUrl,
            hospital: hospital || "MDM",
            role: designation || "Operator",
            memberType: designation || "Staff",
            loginAllowed: isLoginAllowed ? "YES" : "NO",
            accessReason,
            project,
            status,
            bloodGroup
          };
        })
        .filter(Boolean);

      const filtered = hasAllAccess
        ? employees
        : employees.filter(e => isHospitalAllowedServer(e.hospital, allowedHospitals, false) || e.hospital === "ALL");

      return jsonResponse(200, headers, { employees: filtered, isSuperAdmin: userIsSuperAdmin });
    }

    // ── 11. Add New Employee / Team Member to Manpower Google Sheet ──
    if (action === "addEmployee" && event.httpMethod === "POST") {
      const canManageStaff = userIsSuperAdmin || (userIsAdmin && adminPermissions && adminPermissions.can_manage_employees);
      if (!canManageStaff) {
        const err = new Error("Forbidden: SuperAdmin or authorized Admin access required to add team members.");
        err.statusCode = 403;
        throw err;
      }

      const payload = JSON.parse(event.body || "{}");
      const email = String(payload.email || "").toLowerCase().trim();
      const name = String(payload.name || "").trim();
      const hospital = String(payload.hospital || "MDM").toUpperCase().trim();
      const role = String(payload.role || "Operator").trim();
      const phone = String(payload.phone || "").trim();
      const photoUrl = String(payload.photoUrl || "").trim();
      const project = String(payload.project || "SNMC").trim();
      const loginAllowed = String(payload.loginAllowed || "YES").toUpperCase().trim();
      const status = payload.status
        ? String(payload.status).trim()
        : (loginAllowed === "NO" ? "INACTIVE" : "ACTIVE");

      if (!name && !email) {
        const err = new Error("Name or Email address is required.");
        err.statusCode = 400;
        throw err;
      }

      // Fetch current sheet data to determine next row index and generate ID
      const sheetData = await fetchSheetDataPublic(`'${MANPOWER_TAB}'!${MANPOWER_RANGE}`, MANPOWER_SHEET_ID);
      const existingRows = (sheetData && sheetData.values) ? sheetData.values : [];
      const targetRowIndex = existingRows.length + 1; // 1-based row number
      const nextSNo = existingRows.length > 1 ? String(existingRows.length) : "1";

      // Calculate next sequential 3-digit serial from existing employee IDs (Column B)
      let maxSerial = 0;
      for (let i = 1; i < existingRows.length; i++) {
        const rowId = String(existingRows[i]?.[1] || "").trim();
        // Match 3 or 4 trailing digits at end of SMSPL...
        const m = rowId.match(/(\d{3,4})$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxSerial) maxSerial = num;
        }
      }
      const nextSerial = maxSerial + 1;
      const serialStr = String(nextSerial).padStart(3, "0");

      // Format: SMSPL + YYYYMMDD (from payload.joiningDate or today) + 3-digit serial
      let joiningDatePart = "";
      if (payload.joiningDate && /^\d{4}-?\d{2}-?\d{2}$/.test(payload.joiningDate)) {
        joiningDatePart = payload.joiningDate.replace(/-/g, "");
      } else {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        joiningDatePart = `${yyyy}${mm}${dd}`;
      }
      const empId = payload.id || `SMSPL${joiningDatePart}${serialStr}`;

      // Build row for manpower (30 columns A to AD)
      const newRow = new Array(30).fill("");
      newRow[0] = nextSNo;          // A: S. No.
      newRow[1] = empId;            // B: Employee ID
      newRow[2] = payload.joiningDate || ""; // C: DOA
      newRow[3] = name;             // D: Name
      newRow[4] = role;             // E: Designation
      newRow[5] = phone;            // F: Contact No.
      newRow[8] = email;            // I: Email ID
      newRow[9] = email;            // J: Office Email
      newRow[12] = hospital;        // M: Reporting Office
      newRow[26] = photoUrl;        // AA: PHOTO
      newRow[27] = project;         // AB: PROJECT
      newRow[29] = status;          // AD: STATUS

      await updateSheetRow(MANPOWER_TAB, `A${targetRowIndex}:AD${targetRowIndex}`, newRow, MANPOWER_SHEET_ID);

      // Sync to Neon DB users table
      try {
        const cleanPhone = phone ? phone.replace(/\D/g, "").slice(-10) : "";
        const roleLower = role.toLowerCase().includes("superadmin") ? "superadmin" : (role.toLowerCase().includes("admin") ? "admin" : "operator");
        const isUserActive = (status === "ACTIVE" || status === "Active") ? 1 : 0;
        const existingNeon = await queryNeon("SELECT id FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $2 LIMIT 1;", [email.toLowerCase(), empId.toLowerCase()]);
        if (existingNeon.length > 0) {
          await queryNeon(
            `UPDATE users SET username = $1, name = $2, role = $3, office_name = $4, phone = $5, mobile = $5, is_active = $6, updated_at = NOW() WHERE id = $7;`,
            [empId, name, roleLower, hospital, cleanPhone, isUserActive, existingNeon[0].id]
          );
        } else {
          // Default password is clean 10-digit phone or username
          const defaultPwd = cleanPhone || empId;
          const bcrypt = require("bcryptjs");
          const pwdHash = await bcrypt.hash(defaultPwd, 10);
          await queryNeon(
            `INSERT INTO users (username, email, name, role, office_name, phone, mobile, is_active, password, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, NOW(), NOW());`,
            [empId, email, name, roleLower, hospital, cleanPhone, isUserActive, pwdHash]
          );
        }
      } catch (dbErr) {
        console.warn("[addEmployee] Neon DB user sync warning:", dbErr.message);
      }

      return jsonResponse(200, headers, { ok: true, id: empId, sNo: nextSNo, name, email, hospital, role, phone, photoUrl, project, status, rowIndex: targetRowIndex });
    }

    // ── 12. Update Existing Employee / Team Member in Manpower Google Sheet ──
    if (action === "updateEmployee" && event.httpMethod === "POST") {
      const canManageStaff = userIsSuperAdmin || (userIsAdmin && adminPermissions && adminPermissions.can_manage_employees);
      if (!canManageStaff) {
        const err = new Error("Forbidden: SuperAdmin or authorized Admin access required to update team members.");
        err.statusCode = 403;
        throw err;
      }

      const payload = JSON.parse(event.body || "{}");
      const empId = String(payload.id || "").trim();
      const originalEmail = String(payload.originalEmail || payload.email || "").toLowerCase().trim();
      const email = String(payload.email || "").toLowerCase().trim();
      const name = String(payload.name || "").trim();
      const hospital = String(payload.hospital || "MDM").toUpperCase().trim();
      const role = String(payload.role || "Operator").trim();
      const phone = String(payload.phone || "").trim();
      const photoUrl = String(payload.photoUrl || "").trim();
      const project = String(payload.project || "SNMC").trim();
      const status = String(payload.status || "Active").trim();
      let targetRowIndex = parseInt(payload.rowIndex, 10);

      const sheetData = await fetchSheetDataPublic(`'${MANPOWER_TAB}'!${MANPOWER_RANGE}`, MANPOWER_SHEET_ID);
      if (!sheetData || !sheetData.values || sheetData.values.length < 2) {
        const err = new Error("Manpower sheet data could not be fetched.");
        err.statusCode = 404;
        throw err;
      }

      // Priority 1: Match by Employee ID (Column B, index 1)
      let matchedIdx = -1;
      if (empId) {
        matchedIdx = sheetData.values.findIndex((r, i) => i > 0 && String(r[1] || "").trim() === empId);
      }

      // Priority 2: Verify targetRowIndex if provided
      if (matchedIdx === -1 && targetRowIndex >= 2 && targetRowIndex <= sheetData.values.length) {
        const checkRow = sheetData.values[targetRowIndex - 1];
        const rowId = String(checkRow?.[1] || "").trim();
        const rowName = String(checkRow?.[3] || "").trim().toLowerCase();
        if ((empId && rowId === empId) || (name && rowName === name.toLowerCase())) {
          matchedIdx = targetRowIndex - 1;
        }
      }

      // Priority 3: Fallback match by original email or exact full name (avoiding empty emails)
      if (matchedIdx === -1) {
        matchedIdx = sheetData.values.findIndex((r, i) => {
          if (i === 0) return false;
          const rEmail = String(r[9] || r[8] || "").toLowerCase().trim();
          const rName = String(r[3] || "").toLowerCase().trim();
          const validEmailMatch = originalEmail && rEmail && !rEmail.includes("no-email") && rEmail === originalEmail;
          const validNameMatch = name && rName && rName === name.toLowerCase();
          return validEmailMatch || validNameMatch;
        });
      }

      if (matchedIdx !== -1) {
        targetRowIndex = matchedIdx + 1;
      }

      if (!targetRowIndex || targetRowIndex < 2) {
        const err = new Error(`Employee record "${empId || originalEmail || name}" not found in manpower sheet.`);
        err.statusCode = 404;
        throw err;
      }

      const existingRow = sheetData.values[targetRowIndex - 1] || [];
      const updatedRow = new Array(Math.max(30, existingRow.length)).fill("");
      for (let c = 0; c < existingRow.length; c++) {
        updatedRow[c] = existingRow[c] || "";
      }

      if (empId) updatedRow[1] = empId;
      if (name) updatedRow[3] = name;
      if (role) updatedRow[4] = role;
      if (phone) updatedRow[5] = phone;
      if (email && !email.includes("no-email")) {
        updatedRow[8] = email;
        updatedRow[9] = email;
      }
      if (hospital) updatedRow[12] = hospital;
      if (photoUrl) updatedRow[26] = photoUrl;
      if (project) updatedRow[27] = project;
      if (status) updatedRow[29] = status;

      await updateSheetRow(MANPOWER_TAB, `A${targetRowIndex}:AD${targetRowIndex}`, updatedRow, MANPOWER_SHEET_ID);

      // Sync updated employee data to Neon DB users table
      try {
        const cleanPhone = phone ? phone.replace(/\D/g, "").slice(-10) : "";
        const roleLower = role.toLowerCase().includes("superadmin") ? "superadmin" : (role.toLowerCase().includes("admin") ? "admin" : "operator");
        const isUserActive = (status.toUpperCase() === "ACTIVE" || status.toUpperCase() === "YES" || status.toUpperCase() === "1") ? 1 : 0;
        await queryNeon(
          `UPDATE users 
           SET name = COALESCE($1, name),
               email = CASE WHEN $2 != '' AND $2 NOT LIKE '%no-email%' THEN $2 ELSE email END,
               phone = $3,
               mobile = $3,
               office_name = $4,
               role = $5,
               is_active = $6,
               updated_at = NOW()
           WHERE (username = $7 AND $7 != '') OR (LOWER(email) = $8 AND $8 != '' AND $8 NOT LIKE '%no-email%');`,
          [name, email, cleanPhone, hospital, roleLower, isUserActive, empId, originalEmail || email]
        );
      } catch (dbErr) {
        console.warn("[updateEmployee] Neon DB user sync warning:", dbErr.message);
      }

      return jsonResponse(200, headers, { ok: true, id: empId, name, email, hospital, role, phone, photoUrl, rowIndex: targetRowIndex });
    }

    // ── 13. Delete / Clear Employee from Manpower Google Sheet ──
    if (action === "deleteEmployee" && event.httpMethod === "POST") {
      const canDeleteStaff = userIsSuperAdmin || (userIsAdmin && adminPermissions && adminPermissions.can_delete_employees);
      if (!canDeleteStaff) {
        const err = new Error("Forbidden: SuperAdmin or authorized Admin access required to delete team members.");
        err.statusCode = 403;
        throw err;
      }

      const payload = JSON.parse(event.body || "{}");
      const email = String(payload.email || "").toLowerCase().trim();
      let targetRowIndex = parseInt(payload.rowIndex, 10);

      if (!targetRowIndex || isNaN(targetRowIndex) || targetRowIndex < 2) {
        const sheetData = await fetchSheetDataPublic(`'${MANPOWER_TAB}'!${MANPOWER_RANGE}`, MANPOWER_SHEET_ID);
        if (sheetData && sheetData.values) {
          const idx = sheetData.values.findIndex((r, i) => i > 0 && (String(r[9] || r[8] || "").toLowerCase().trim() === email));
          if (idx !== -1) {
            targetRowIndex = idx + 1;
          }
        }
      }

      if (!targetRowIndex || targetRowIndex < 2) {
        const err = new Error(`Employee record "${email}" not found in manpower sheet.`);
        err.statusCode = 404;
        throw err;
      }

      await clearSheetRow(MANPOWER_TAB, `A${targetRowIndex}:AD${targetRowIndex}`, MANPOWER_SHEET_ID);
      return jsonResponse(200, headers, { ok: true, deletedEmail: email, rowIndex: targetRowIndex });
    }

    // ── 14. Direct Fast Storage for Employee Photo (Saved to Google Drive, Manpower Sheet & Neon DB) ──
    if (action === "uploadEmployeePhoto" && event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const targetEmail = String(payload.email || userEmail).toLowerCase().trim();
      const base64Data = String(payload.base64Data || "").trim();
      const mimeType = String(payload.mimeType || "image/jpeg").trim();

      // Ensure user is modifying their own photo or is SuperAdmin
      if (targetEmail !== userEmail && !userIsSuperAdmin) {
        const err = new Error("Forbidden: You can only upload your own profile photo.");
        err.statusCode = 403;
        throw err;
      }

      if (!base64Data) {
        const err = new Error("No image data provided.");
        err.statusCode = 400;
        throw err;
      }

      // Convert Base64 dataURL to raw binary buffer
      const pureBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
      const imageBuffer = Buffer.from(pureBase64, "base64");

      let finalPhotoUrl = "";

      // 1. Attempt upload to dedicated Google Drive Folder
      try {
        const safeEmailPrefix = targetEmail.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "_");
        const filename = `photo_${safeEmailPrefix}_${Date.now()}.jpg`;
        const driveResult = await uploadBufferToGoogleDrive(imageBuffer, filename, mimeType, GOOGLE_DRIVE_PHOTO_FOLDER_ID);
        if (driveResult && driveResult.directLink) {
          finalPhotoUrl = driveResult.directLink;
        }
      } catch (driveErr) {
        console.warn("[Drive Upload Fallback Warning]:", driveErr.message);
      }

      // Fallback: If Google Drive API had an issue, use clean base64 data URL
      if (!finalPhotoUrl) {
        finalPhotoUrl = base64Data.startsWith("data:")
          ? base64Data
          : `data:${mimeType};base64,${base64Data}`;
      }

      // 2. Update Column AA (index 26) in Manpower Sheet
      try {
        const sheetData = await fetchSheetDataPublic(`'${MANPOWER_TAB}'!${MANPOWER_RANGE}`, MANPOWER_SHEET_ID);
        if (sheetData && sheetData.values) {
          const rowIndex = sheetData.values.findIndex((r, i) => {
            if (i === 0) return false;
            const rEmail = String(r[9] || r[8] || "").toLowerCase().trim();
            return rEmail === targetEmail;
          });

          if (rowIndex !== -1) {
            const targetRow = rowIndex + 1;
            const existingRow = sheetData.values[rowIndex] || [];
            const updatedRow = new Array(Math.max(30, existingRow.length)).fill("");
            for (let c = 0; c < existingRow.length; c++) {
              updatedRow[c] = existingRow[c] || "";
            }
            updatedRow[26] = finalPhotoUrl; // AA: PHOTO

            await updateSheetRow(MANPOWER_TAB, `A${targetRow}:AD${targetRow}`, updatedRow, MANPOWER_SHEET_ID);
          }
        }
      } catch (sheetErr) {
        console.error("[Manpower Sheet Photo Update Error]:", sheetErr.message);
      }

      // 3. Also persist in Neon DB avatar column if user exists
      try {
        await queryNeon(`UPDATE users SET avatar = $1, updated_at = NOW() WHERE LOWER(email) = $2;`, [finalPhotoUrl, targetEmail]);
      } catch (_) { }

      return jsonResponse(200, headers, { ok: true, photoUrl: finalPhotoUrl, email: targetEmail });
    }

    // ── 15. Action: getScannerSettings (SuperAdmin & App Scanner Config) ──
    if (action === "getScannerSettings" && event.httpMethod === "GET") {
      let ocrMethod = (process.env.OCR_METHOD || "vision").toLowerCase().trim();
      try {
        const rows = await queryNeon(`SELECT setting_value FROM app_settings WHERE setting_key = 'snmc_ocr_method' LIMIT 1;`);
        if (rows.length > 0 && rows[0].setting_value) {
          ocrMethod = String(rows[0].setting_value).toLowerCase().trim();
        }
      } catch (_) { }
      return jsonResponse(200, headers, { success: true, ocrMethod, hasGeminiKey: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_SHEETS_API_KEY) });
    }

    // ── 16. Action: saveScannerSettings (SuperAdmin Only) ──
    if (action === "saveScannerSettings" && event.httpMethod === "POST") {
      if (!userIsSuperAdmin) {
        return jsonResponse(403, headers, { success: false, error: "Forbidden: SuperAdmin access required." });
      }
      const payload = JSON.parse(event.body || "{}");
      const chosenMethod = (payload.ocrMethod === "tesseract") ? "tesseract" : "vision";
      try {
        const existing = await queryNeon(`SELECT id FROM app_settings WHERE setting_key = 'snmc_ocr_method' LIMIT 1;`);
        if (existing.length > 0) {
          await queryNeon(`UPDATE app_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = 'snmc_ocr_method';`, [chosenMethod]);
        } else {
          await queryNeon(`INSERT INTO app_settings (setting_key, setting_value, created_at, updated_at) VALUES ('snmc_ocr_method', $1, NOW(), NOW());`, [chosenMethod]);
        }
        return jsonResponse(200, headers, { success: true, ocrMethod: chosenMethod, message: `Scanner OCR Method updated to "${chosenMethod.toUpperCase()}".` });
      } catch (e) {
        return jsonResponse(500, headers, { success: false, error: "Failed to persist setting: " + e.message });
      }
    }

    // ── 17. Action: visionScan (Gemini AI Vision Extraction Proxy) ──
    if (action === "visionScan" && event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const base64Image = payload.image || payload.base64Data || "";
      const mimeType = payload.mimeType || "image/jpeg";

      if (!base64Image) {
        return jsonResponse(400, headers, { success: false, error: "No image payload provided for AI Vision." });
      }

      try {
        const aiResult = await callGeminiVision(base64Image, mimeType);
        return jsonResponse(200, headers, {
          success: true,
          method: "vision",
          data: aiResult
        });
      } catch (vErr) {
        console.error("[Vision Scan Error]:", vErr.message);
        return jsonResponse(502, headers, {
          success: false,
          error: "AI Vision analysis failed: " + vErr.message
        });
      }
    }

    // ── 18. Action: aiInsight (Gemini-powered WhatsApp Anomaly Analysis) ──
    if (action === "aiInsight" && event.httpMethod === "POST") {
      const body      = JSON.parse(event.body || "{}");
      const stats     = body.stats    || {};
      const hospital  = body.hospital || "Hospital";
      const period    = body.period   || "Today";
      const isFiltered = !!body.isFiltered;

      const { delivered = 0, issued = 0, prints = 0, entries = 0 } = stats;
      // ── PAAS Physical Accountability Audit ─────────────────────────────
      // Business: We (SNMC) deliver paper → hospital store → counters → printed.
      // Printer meter is the ONLY tamper-proof record of actual consumption.
      //
      // THE ONLY RELIABLE EQUATION:
      //   physicalGap = delivered − prints
      //   = sheets that arrived at hospital but NEVER went through any printer
      //   MUST be physically in store right now, OR they were stolen/misused
      //
      // DO NOT USE issued/unissued — issue entries are admittedly incomplete,
      // so "Unissued Balance = delivered − issued" gives a FALSE picture.
      //
      // issueGap = prints − issued (shows how many prints happened without a
      //   formal issue log entry — proves register is incomplete, not theft by itself)

      const physicalGap  = delivered - prints;                          // sheets not printed (should be in store)
      const issueGap     = Math.max(0, prints - issued);                // prints without issue entry (register gap)
      const physGapRims  = (Math.abs(physicalGap) / 500).toFixed(1);   // in Rims
      const issueGapRims = (issueGap / 500).toFixed(1);

      const prompt = `You are a strict accountability auditor for SNMC PrintTrack, a PAAS (Printer-as-a-Service) operation at Dr. S.N. Medical College, Jodhpur, Rajasthan.

PAAS flow: SNMC delivers paper → Hospital store receives → Store issues to counters → Printers consume.
The PRINTER METER READING is the only tamper-proof record of actual paper consumption.

Your job: Write a SHORT (max 2 lines, WhatsApp-ready) audit finding in Hindi+English.
IMPORTANT: Do NOT use "Unissued Balance" or "Issue Rate" in your reasoning — issue entries are admittedly incomplete and will give a misleading picture.

=== THE ONLY RELIABLE AUDIT EQUATION ===
Physical Gap = Paper Delivered − Prints Recorded
= Paper that was physically delivered to hospital but NEVER passed through any printer.
These sheets MUST be physically present in the store right now.
If they are not found in physical stock verification → THEFT / MISUSE / LOSS suspected.
The Store Keeper AND the Rim Distributor are jointly accountable for this gap.

=== DATA FOR ${hospital} — Period: ${period} ===
Paper Delivered (Stock In)        : ${delivered.toLocaleString("en-IN")} sheets   [Ground truth — vendor supplied]
Prints Recorded (Printer Meters)  : ${prints.toLocaleString("en-IN")} pages       [Tamper-proof machine count]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHYSICAL GAP (Delivered − Printed): ${physicalGap.toLocaleString("en-IN")} sheets (≈${physGapRims} Rims)
${physicalGap > 0
  ? `These ${physicalGap.toLocaleString("en-IN")} sheets were delivered but never printed. They MUST be in store physically.`
  : physicalGap < 0
    ? `Prints EXCEED delivered — meter includes pre-system history or delivery entries are missing.`
    : `All delivered paper is accounted for in printer meters. ✓`}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Issue Register Gap                : ${issueGap.toLocaleString("en-IN")} sheets (≈${issueGapRims} Rims) printed without formal issue entry
Data mode                         : ${isFiltered ? "Date-filtered (specific period)" : "All-time cumulative (since tracking started)"}

=== WHAT TO WRITE ===
${physicalGap > 0
  ? `FINDING: ${physicalGap.toLocaleString("en-IN")} sheets (≈${physGapRims} Rims) physically delivered हुईं लेकिन किसी भी printer से print नहीं हुईं। ये sheets store में होनी चाहिए — तुरंत physical stock count करें। अगर store में नहीं मिलतीं → Store Keeper और Rim Distributor की जवाबदेही बनती है।`
  : physicalGap < 0
    ? `FINDING: Recorded prints (${prints.toLocaleString("en-IN")}) exceed delivered paper (${delivered.toLocaleString("en-IN")}) — meter में पुरानी reading शामिल हो सकती है या कुछ delivery entries missing हैं। Verify करें।`
    : `FINDING: Physical accountability balanced — all delivered sheets are accounted for in printer meters.`}

Also mention if issue register has significant gaps (issueGap = ${issueGap.toLocaleString("en-IN")} sheets without formal issue entry).

=== FORMAT ===
Max 2 lines plain text. No bullets. No asterisks. No markdown. No underscores.
Include specific numbers (sheets and Rims). Be direct — like a CAG audit finding.
End with: — SNMC PrintTrack AI`;

      try {
        const insight = await callGeminiText(prompt, 0.15);
        return jsonResponse(200, headers, { success: true, insight });
      } catch (aiErr) {
        console.error("[aiInsight] Gemini call failed:", aiErr.message);
        // Rule-based fallback — correct PAAS equation
        let fallback;
        if (delivered === 0) {
          fallback = `⚠️ कोई delivery record नहीं — Stock In entries दर्ज करें। — SNMC PrintTrack`;
        } else if (physicalGap > 0) {
          fallback = `⚠️ Audit: ${physicalGap.toLocaleString("en-IN")} sheets (≈${physGapRims} Rims) deliver हुईं लेकिन किसी printer से print नहीं हुईं — तुरंत physical stock count करें। Store में नहीं मिलीं तो Store Keeper व Rim Distributor जवाबदेह होंगे। — SNMC PrintTrack`;
        } else if (physicalGap < 0) {
          const overRims = (Math.abs(physicalGap) / 500).toFixed(1);
          fallback = `⚠️ Prints (${prints.toLocaleString("en-IN")}) > Delivered (${delivered.toLocaleString("en-IN")}) — ${Math.abs(physicalGap).toLocaleString("en-IN")} sheets (${overRims} Rims) का हिसाब नहीं। Delivery entries verify करें। — SNMC PrintTrack`;
        } else {
          fallback = `✅ Physical accountability balanced — सभी delivered sheets printer meters में accounted हैं। — SNMC PrintTrack`;
        }
        return jsonResponse(200, headers, { success: true, insight: fallback, fallback: true });
      }
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
