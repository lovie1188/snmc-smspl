// ============================================================
// snmcBackend — Standalone Express REST API Service
// SNMC Daily Printer Reading & Hospital Stock Management
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createVerify } = require("crypto");
const { JWT } = require("google-auth-library");

const app = express();
const PORT = process.env.PORT || 5000;

// Config Constants
const SHEET_ID = process.env.SHEET_ID || "1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0";
const DAILY_TAB = "Form responses 1";
const PRINTER_TAB = "printerdetails";
const DAILY_RANGE = "A:L";
const ALLOWED_SENDERS_TAB = "allowed_senders";
const FCMTOKENS_TAB = "fcmtokens";
const STOCK_TAB = "stock";
const STOCK_RANGE = "A:M";
const USER_HOSPITALS_TAB = "user_hospitals";
const USER_HOSPITALS_RANGE = "A:C";

const SUPER_ADMINS = (process.env.SUPER_ADMIN_EMAILS || "softtech.lovejeet@gmail.com,softtech2009@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0070625213";
const FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let firebaseCertCache = { expiresAt: 0, certs: null };
let sheetsJwtClient = null;

// CORS setup
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://snmc-smspl.netlify.app,http://localhost:8080,http://localhost:3000,http://localhost")
  .split(",").map(o => o.trim());

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive for mobile LAN clients
  },
  credentials: true
}));

app.use(express.json());

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
  if (!res.ok) throw new Error(`Firebase cert fetch failed: HTTP ${res.status}`);
  const certs = await res.json();
  firebaseCertCache = { certs, expiresAt: Date.now() + 3600 * 1000 };
  return certs;
}

// ── Auth Middleware: Verify Firebase JWT ──
async function requireFirebaseAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const match = String(authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: "Missing Authorization bearer token." });

    const token = match[1];
    const parts = token.split(".");
    if (parts.length !== 3) return res.status(401).json({ error: "Invalid token format." });

    const header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8"));
    const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));

    if (header.alg !== "RS256" || !header.kid) return res.status(401).json({ error: "Unsupported token algorithm." });

    const certs = await getFirebaseCerts();
    const cert = certs[header.kid];
    if (!cert) return res.status(401).json({ error: "Unknown token signing key." });

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const isValidSignature = verifier.verify(cert, base64UrlDecode(parts[2]));
    const now = Math.floor(Date.now() / 1000);
    const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

    if (!isValidSignature || payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== expectedIssuer || !payload.sub || payload.exp <= now) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    req.user = { uid: payload.sub, email: (payload.email || "").toLowerCase(), name: payload.name || "" };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Authentication failed: " + err.message });
  }
}

// ── Google Sheets Service Account Client ──
function getSheetsJwtClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;

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
  if (!client) throw new Error("SERVER_CONFIG_ERROR: Google Service Account credentials missing in .env.");
  const token = await client.getAccessToken();
  return { Authorization: `Bearer ${token.token}` };
}

async function fetchSheetData(range) {
  const authHeaders = await getSheetsAuthHeaders();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: authHeaders });
  if (!res.ok) throw new Error(`Google Sheets fetch failed: HTTP ${res.status}`);
  return res.json();
}

async function getUserHospitalPermissions(email) {
  if (!email) return { hospitals: [], isSuperAdmin: false, isAll: false };
  const cleanEmail = email.toLowerCase().trim();
  if (SUPER_ADMINS.includes(cleanEmail)) return { hospitals: ["ALL"], isSuperAdmin: true, isAll: true };

  try {
    const data = await fetchSheetData(`'${USER_HOSPITALS_TAB}'!${USER_HOSPITALS_RANGE}`);
    if (data && data.values && data.values.length > 1) {
      for (const row of data.values.slice(1)) {
        if (String(row[0] || "").toLowerCase().trim() === cleanEmail) {
          const hospStr = String(row[1] || "").toUpperCase().trim();
          const role = String(row[2] || "").trim();
          const isSuper = role.toLowerCase() === "superadmin" || hospStr === "ALL";
          const hospitals = hospStr === "ALL" ? ["ALL"] : hospStr.split(",").map(h => h.trim()).filter(Boolean);
          return { hospitals, isSuperAdmin: isSuper, isAll: hospitals.includes("ALL") };
        }
      }
    }
  } catch (err) {
    console.warn("Could not read user_hospitals:", err.message);
  }
  return { hospitals: [], isSuperAdmin: false, isAll: false };
}

function isHospitalAllowed(hospitalName, allowedHospitals, isAll) {
  if (isAll) return true;
  if (!hospitalName) return false;
  const cleanHosp = String(hospitalName).trim().toUpperCase();
  return allowedHospitals.some(h => cleanHosp.includes(h.toUpperCase()));
}

// ── Health Check ──
app.get("/health", (req, res) => res.json({ status: "ok", service: "snmc-backend", timestamp: new Date().toISOString() }));

// ── GET /api/printers ──
app.get("/api/printers", requireFirebaseAuth, async (req, res) => {
  try {
    const perms = await getUserHospitalPermissions(req.user.email);
    const data = await fetchSheetData(`'${PRINTER_TAB}'!A:Z`);
    if (!data || !data.values || data.values.length < 2) return res.json({ headers: [], rows: [] });

    const rawHeaders = data.values[0].map(h => String(h).trim());
    const allRows = data.values.slice(1)
      .filter(row => row.some(c => String(c).trim() !== ""))
      .map(row => {
        const obj = {};
        rawHeaders.forEach((h, i) => { obj[h] = String(row[i] || "").trim(); });
        return obj;
      });

    const filteredRows = perms.isAll ? allRows : allRows.filter(r => isHospitalAllowed(r["Hospital"], perms.hospitals, false));
    return res.json({ headers: rawHeaders, rows: filteredRows, userHospital: perms.isAll ? "ALL" : perms.hospitals.join(", "), isSuperAdmin: perms.isSuperAdmin });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/dailyentries ──
app.get("/api/dailyentries", requireFirebaseAuth, async (req, res) => {
  try {
    const perms = await getUserHospitalPermissions(req.user.email);
    const [dailyData, printerSheetData] = await Promise.all([
      fetchSheetData(`'${DAILY_TAB}'!${DAILY_RANGE}`),
      fetchSheetData(`'${PRINTER_TAB}'!A:Z`)
    ]);

    if (!dailyData || !dailyData.values || dailyData.values.length === 0) return res.json({ headers: [], rows: [] });

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
      .filter(row => row.some(c => String(c).trim() !== ""))
      .map(row => {
        const obj = {};
        rawHeaders.forEach((h, i) => { obj[h] = String(row[i] !== undefined && row[i] !== null ? row[i] : "").trim(); });
        return obj;
      });

    const filteredRows = perms.isAll ? allRows : allRows.filter(r => {
      const hospCol = r["Hospital Name"] || r["Hospital Name "] || r["Hospital"] || "";
      const counterVal = (r["counter Number"] || r["Counter Number"] || r["Counter"] || "").trim().toUpperCase();
      const cleanCounter = counterVal.split(" ")[0].trim();
      const inferredHospital = hospCol || counterHospitalLookup[counterVal] || counterHospitalLookup[cleanCounter] || "";
      return isHospitalAllowed(inferredHospital, perms.hospitals, false);
    });

    return res.json({ headers: rawHeaders, rows: filteredRows, userHospital: perms.isAll ? "ALL" : perms.hospitals.join(", "), isSuperAdmin: perms.isSuperAdmin });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/dailyentries ──
app.post("/api/dailyentries", requireFirebaseAuth, async (req, res) => {
  try {
    const { row } = req.body;
    if (!Array.isArray(row) || row.length < 4) return res.status(400).json({ error: "Invalid daily entry payload." });

    const perms = await getUserHospitalPermissions(req.user.email);
    if (!perms.isAll) {
      const submittedCounter = String(row[3] || "").trim();
      const data = await fetchSheetData(`'${PRINTER_TAB}'!A:Z`);
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
          if (!isHospitalAllowed(printerHospital, perms.hospitals, false)) {
            return res.status(403).json({ error: `Unauthorized: You do not have permission to submit entries for ${printerHospital} Hospital.` });
          }
        }
      }
    }

    const authHeaders = await getSheetsAuthHeaders();
    const cleanRow = row.map(v => String(v ?? "").slice(0, 500));
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${DAILY_TAB}'!${DAILY_RANGE}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const appendRes = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [cleanRow] })
    });

    if (!appendRes.ok) throw new Error("Google Sheets append failed");
    const result = await appendRes.json();
    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stock ──
app.get("/api/stock", requireFirebaseAuth, async (req, res) => {
  try {
    const perms = await getUserHospitalPermissions(req.user.email);
    const data = await fetchSheetData(`'${STOCK_TAB}'!${STOCK_RANGE}`);
    if (!data || !data.values || data.values.length === 0) return res.json({ headers: [], rows: [] });

    const rawHeaders = data.values[0].map(h => String(h).trim());
    const allRows = data.values.slice(1)
      .filter(row => row.some(c => String(c).trim() !== ""))
      .map(row => {
        const obj = {};
        rawHeaders.forEach((h, i) => { obj[h] = String(row[i] !== undefined && row[i] !== null ? row[i] : "").trim(); });
        return obj;
      });

    const filteredRows = perms.isAll ? allRows : allRows.filter(r => isHospitalAllowed(r["HOSPITAL"], perms.hospitals, false));
    return res.json({ headers: rawHeaders, rows: filteredRows, userHospital: perms.isAll ? "ALL" : perms.hospitals.join(", "), isSuperAdmin: perms.isSuperAdmin });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`[snmcBackend] Standalone API Server running on port ${PORT}`);
});
