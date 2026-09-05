// ============================================================
// Netlify Serverless API Function — Auth & Centralized Neon PostgreSQL DB
// PrintTrack PWA — SNMC
// Database: Centralized Softtech Neon DB
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
  } catch (_) {}
}
loadEnvFallback();
const { Client: PgClient } = require("pg");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { createVerify } = require("crypto");
const { JWT } = require("google-auth-library");

const NEON_DB_URL = process.env.NEON_DATABASE_URL || "postgresql://neondb_owner:npg_0urCjOWDdp9f@ep-long-violet-az1arbtf-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const JWT_SECRET = process.env.JWT_SECRET || "SMSPL@PrintTrackJWTSecret2026";
const SUPER_ADMINS = (process.env.SUPER_ADMIN_EMAILS || "softtech.lovejeet@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0070625213";
const FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let firebaseCertCache = { expiresAt: 0, certs: null };
let sheetsJwtClient = null;

function getSheetsJwtClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  const privateKey = rawKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim();

  if (!clientEmail || !privateKey) return null;

  if (!sheetsJwtClient) {
    sheetsJwtClient = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
      ]
    });
  }
  return sheetsJwtClient;
}

async function getSheetsAuthHeaders() {
  const client = getSheetsJwtClient();
  if (!client) return null;
  const token = await client.getAccessToken();
  if (!token || !token.token) return null;
  return { Authorization: `Bearer ${token.token}` };
}

async function fetchManpowerSheet() {
  try {
    const authHeaders = await getSheetsAuthHeaders();
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!authHeaders && !apiKey) return null;
    const query = authHeaders ? "" : `?key=${apiKey}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${MANPOWER_SHEET_ID}/values/${encodeURIComponent(MANPOWER_RANGE)}${query}`;
    const res = await fetch(url, authHeaders ? { headers: authHeaders } : undefined);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function lookupManpowerRecord(identifier) {
  const cleanId = String(identifier || "").toLowerCase().trim();
  if (!cleanId) return null;

  const data = await fetchManpowerSheet();
  if (!data || !data.values || data.values.length < 2) return null;

  const headers = data.values[0].map(h => String(h || "").toLowerCase().trim());
  const empIdIdx = headers.findIndex(h => h.includes("employee id") || h === "emp id" || h === "emp_id");
  const nameIdx = headers.findIndex(h => h === "name" || h.includes("employee name"));
  const desigIdx = headers.findIndex(h => h === "designation" || h.includes("designation") || h === "role");
  const phoneIdx = headers.findIndex(h => h.includes("contact") || h.includes("mobile") || h.includes("phone"));
  const emailIdx = headers.findIndex(h => h.includes("email id") || h === "email");
  const offEmailIdx = headers.findIndex(h => h.includes("office email") || h.includes("official email"));
  const hospIdx = headers.findIndex(h => h.includes("reporting office") || h.includes("hospital") || h.includes("office"));
  const projIdx = headers.findIndex(h => h === "project");
  const statusIdx = headers.findIndex(h => h === "status");

  const rows = data.values.slice(1);
  for (const row of rows) {
    const empId = empIdIdx !== -1 ? String(row[empIdIdx] || "").trim() : "";
    const name = nameIdx !== -1 ? String(row[nameIdx] || "").trim() : "";
    const designation = desigIdx !== -1 ? String(row[desigIdx] || "Operator").trim() : "Operator";
    const rawPhone = phoneIdx !== -1 ? String(row[phoneIdx] || "").trim() : "";
    const cleanPhone = rawPhone.replace(/\D/g, "").slice(-10);
    const email = emailIdx !== -1 ? String(row[emailIdx] || "").toLowerCase().trim() : "";
    const offEmail = offEmailIdx !== -1 ? String(row[offEmailIdx] || "").toLowerCase().trim() : "";
    const hospital = hospIdx !== -1 ? String(row[hospIdx] || "MDM").toUpperCase().trim() : "MDM";
    const project = projIdx !== -1 ? String(row[projIdx] || "").toUpperCase().trim() : "";
    const status = statusIdx !== -1 ? String(row[statusIdx] || "").toUpperCase().trim() : "";

    const matches = (
      (email && email === cleanId) ||
      (offEmail && offEmail === cleanId) ||
      (empId && empId.toLowerCase() === cleanId) ||
      (cleanPhone && cleanPhone === cleanId)
    );

    if (matches) {
      const primaryEmail = offEmail || email || `${empId.toLowerCase()}@softtechseva.com`;
      const isSuper = SUPER_ADMINS.includes(primaryEmail) || designation.toLowerCase().includes("superadmin");
      const isDirector = primaryEmail === "softtech2009@gmail.com" || designation.toLowerCase().includes("director");
      const isProjectAllowed = isSuper || isDirector || !project || project === "SNMC";
      const isStatusActive = status === "ACTIVE" || status === "YES" || status === "1" || status === "TRUE" || !status;
      const isAllowed = isSuper || isDirector || (isProjectAllowed && isStatusActive);

      return {
        empId,
        name,
        designation,
        rawPhone,
        cleanPhone,
        email: primaryEmail,
        hospital,
        project,
        status,
        isAllowed,
        isSuperAdmin: isSuper,
        isDirector: isDirector
      };
    }
  }
  return null;
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

async function verifyFirebaseToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid token format.");

  const header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8"));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported token algorithm.");
  }

  const certs = await getFirebaseCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error("Unknown token signing key.");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const isValidSignature = verifier.verify(cert, base64UrlDecode(parts[2]));
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

  if (!isValidSignature || payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== expectedIssuer || payload.exp <= now) {
    throw new Error("Invalid or expired Firebase token.");
  }

  return {
    uid: payload.sub,
    email: (payload.email || "").toLowerCase().trim(),
    name: payload.name || ""
  };
}

// Dedicated Manpower Sheet ID & Tab for cross-verification
const MANPOWER_SHEET_ID = "1FrHbNqlJF1BpFdlVLsUMYVIGC9z0N_JS3vjrYAhwazA";
const MANPOWER_TAB = "manpower";
const MANPOWER_RANGE = "A1:AD45";

// Allowed origins
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
  if (/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

function jsonResponse(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// Neon Database Query Helper
async function queryNeon(sql, params = []) {
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

// Verify token helper
function verifyAuthToken(authHeader) {
  const match = String(authHeader || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return jwt.verify(match[1], JWT_SECRET);
  } catch (_) {
    return null;
  }
}

exports.handler = async function (event, context) {
  const reqHeaders = (event && event.headers) || {};
  const origin = reqHeaders.origin || reqHeaders.Origin || "";
  const allowedOrigin = isOriginAllowed(origin);

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
    } catch (_) {}
  }
  if (!action) action = "login";

  try {
    // ── 1. Action: getGoogleAuthStatus (Public: check if Google login button should be visible) ──
    if (action === "getGoogleAuthStatus" && event.httpMethod === "GET") {
      try {
        const rows = await queryNeon(`SELECT setting_value FROM app_settings WHERE setting_key = 'snmc_google_login_enabled' LIMIT 1;`);
        const isEnabled = rows.length > 0 && (rows[0].setting_value === "1" || rows[0].setting_value === "true");
        return jsonResponse(200, headers, { success: true, googleAuthEnabled: isEnabled });
      } catch (_) {
        return jsonResponse(200, headers, { success: true, googleAuthEnabled: false });
      }
    }

    // ── 2. Action: toggleGoogleAuth (SuperAdmin only: Enable/Disable Google Sign-in on Login Screen) ──
    if (action === "toggleGoogleAuth" && event.httpMethod === "POST") {
      const authUser = verifyAuthToken(event.headers.authorization || event.headers.Authorization);
      const isSuper = authUser && (SUPER_ADMINS.includes(authUser.email.toLowerCase()) || authUser.role === "SuperAdmin" || authUser.role === "superadmin");
      
      if (!isSuper) {
        return jsonResponse(403, headers, { success: false, error: "Forbidden: SuperAdmin access required." });
      }

      const payload = JSON.parse(event.body || "{}");
      const enable = payload.enabled === true || payload.enabled === "1" || payload.enabled === "true";
      const valStr = enable ? "1" : "0";

      try {
        await queryNeon(`
          INSERT INTO app_settings (setting_key, setting_value, created_at, updated_at) 
          VALUES ('snmc_google_login_enabled', $1, NOW(), NOW())
          ON CONFLICT (setting_key) 
          DO UPDATE SET setting_value = $1, updated_at = NOW();
        `, [valStr]);
      } catch (e) {
        // If app_settings table doesn't have unique constraint on setting_key, fallback to update/insert
        const existing = await queryNeon(`SELECT id FROM app_settings WHERE setting_key = 'snmc_google_login_enabled' LIMIT 1;`);
        if (existing.length > 0) {
          await queryNeon(`UPDATE app_settings SET setting_value = $1 WHERE setting_key = 'snmc_google_login_enabled';`, [valStr]);
        } else {
          await queryNeon(`INSERT INTO app_settings (setting_key, setting_value) VALUES ('snmc_google_login_enabled', $1);`, [valStr]);
        }
      }

      return jsonResponse(200, headers, { success: true, googleAuthEnabled: enable, message: `Google Sign-in is now ${enable ? "ENABLED" : "DISABLED"} on login screen.` });
    }

    // ── 2B. Action: getAdminPermissions (Fetch Granular Admin Role Permissions) ──
    if (action === "getAdminPermissions" && event.httpMethod === "GET") {
      try {
        const rows = await queryNeon(`SELECT setting_value FROM app_settings WHERE setting_key = 'snmc_admin_permissions' LIMIT 1;`);
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
        if (rows.length > 0 && rows[0].setting_value) {
          try {
            perms = { ...perms, ...JSON.parse(rows[0].setting_value) };
          } catch (_) {}
        }
        return jsonResponse(200, headers, { success: true, permissions: perms });
      } catch (e) {
        return jsonResponse(200, headers, { 
          success: true, 
          permissions: {
            can_add_entry: true,
            can_edit_history: false,
            can_delete_history: false,
            can_add_stock: true,
            can_export_excel: true,
            can_manage_employees: false,
            can_delete_employees: false,
            can_send_broadcast: false
          }
        });
      }
    }

    // ── 2C. Action: saveAdminPermissions (SuperAdmin Only: Save Granular Admin Permissions) ──
    if (action === "saveAdminPermissions" && event.httpMethod === "POST") {
      const authUser = verifyAuthToken(event.headers.authorization || event.headers.Authorization);
      const isSuper = authUser && (SUPER_ADMINS.includes(authUser.email.toLowerCase()) || authUser.role === "SuperAdmin" || authUser.role === "superadmin");
      
      if (!isSuper) {
        return jsonResponse(403, headers, { success: false, error: "Forbidden: SuperAdmin access required to modify admin permissions." });
      }

      const payload = JSON.parse(event.body || "{}");
      const permissions = payload.permissions || {};
      const valStr = JSON.stringify(permissions);

      try {
        const existing = await queryNeon(`SELECT id FROM app_settings WHERE setting_key = 'snmc_admin_permissions' LIMIT 1;`);
        if (existing.length > 0) {
          await queryNeon(`UPDATE app_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = 'snmc_admin_permissions';`, [valStr]);
        } else {
          await queryNeon(`INSERT INTO app_settings (setting_key, setting_value, created_at, updated_at) VALUES ('snmc_admin_permissions', $1, NOW(), NOW());`, [valStr]);
        }
        return jsonResponse(200, headers, { success: true, permissions, message: "Admin role permissions saved successfully!" });
      } catch (err) {
        return jsonResponse(500, headers, { success: false, error: "Failed to save permissions: " + err.message });
      }
    }

    // ── 3. Action: login (Direct Email/Username + Password authentication via Neon DB) ──
    if (action === "login" && event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const usernameOrEmail = String(payload.username || payload.email || "").toLowerCase().trim();
      const password = String(payload.password || "").trim();

      if (!usernameOrEmail || !password) {
        return jsonResponse(400, headers, { success: false, error: "Please enter both Email/Username and Password." });
      }

      // Query user in Neon DB
      let userRows = await queryNeon(`
        SELECT u.id, u.username, u.email, u.name, u.first_name, u.last_name, u.password, u.is_active, 
               u.office_name, u.phone, u.mobile, u.avatar, u.firebase_uid,
               COALESCE(LOWER(r.name), LOWER(u.role), LOWER(u.active_role), 'operator') as role_name
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        WHERE LOWER(u.email) = $1 OR LOWER(u.username) = $1
        LIMIT 1;
      `, [usernameOrEmail]);

      let user = userRows[0];

      // ── Auto-Provisioning for New Users from Manpower Sheet Allowlist ──
      if (!user) {
        const mpUser = await lookupManpowerRecord(usernameOrEmail);
        if (!mpUser || !mpUser.isAllowed) {
          return jsonResponse(401, headers, { 
            success: false, 
            error: "Account not registered or access is inactive in Manpower Directory." 
          });
        }

        // For first-time login, default password is the registered mobile number (cleaned 10 digits)
        const defaultPassword = mpUser.cleanPhone;
        if (!defaultPassword || password !== defaultPassword) {
          return jsonResponse(401, headers, { 
            success: false, 
            error: "Invalid password. For first-time login, please use your 10-digit registered mobile number." 
          });
        }

        // Auto-provision into Neon DB
        const newHash = await bcrypt.hash(defaultPassword, 10);
        const userRole = mpUser.isSuperAdmin ? "superadmin" : (mpUser.designation.toLowerCase().includes("admin") ? "admin" : "operator");
        const inserted = await queryNeon(`
          INSERT INTO users (
            username, email, name, role, office_name, phone, mobile, is_active, password, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $6, 1, $7, NOW(), NOW())
          RETURNING id, username, email, name, role as role_name, office_name, phone, mobile, is_active, avatar, firebase_uid;
        `, [
          mpUser.empId || usernameOrEmail,
          mpUser.email,
          mpUser.name,
          userRole,
          mpUser.hospital || "MDM",
          mpUser.cleanPhone,
          newHash
        ]);

        user = inserted[0];
      }

      const isSuper = SUPER_ADMINS.includes(user.email.toLowerCase()) || user.role_name === "superadmin";
      const isDirector = user.email.toLowerCase() === "softtech2009@gmail.com" || user.role_name === "director" || (user.name && user.name.toLowerCase().includes("sangidan"));

      if (user.is_active !== 1 && !isSuper && !isDirector) {
        return jsonResponse(403, headers, { success: false, error: "Account is inactive. Please contact SuperAdmin." });
      }

      // Verify Password (supports PHP standard bcrypt $2y$ and $2a$ / $2b$ or registered mobile fallback)
      let isMatch = false;
      if (user.password) {
        const fixedHash = user.password.replace(/^\$2y\$/, "$2a$");
        try {
          isMatch = await bcrypt.compare(password, fixedHash);
        } catch (_) {
          isMatch = (password === user.password);
        }
      } else {
        // If password is not yet set in DB, check against registered mobile from Manpower sheet
        const mpUser = await lookupManpowerRecord(user.email);
        if (mpUser && mpUser.cleanPhone && password === mpUser.cleanPhone) {
          isMatch = true;
          const newHash = await bcrypt.hash(password, 10);
          await queryNeon(`UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2;`, [newHash, user.id]);
        }
      }

      if (!isMatch) {
        return jsonResponse(401, headers, { success: false, error: "Invalid password. Please check and try again." });
      }

      // Generate App JWT Token
      const userRole = isSuper ? "SuperAdmin" : (isDirector ? "Director" : (user.role_name === "admin" ? "Admin" : "Operator"));
      const userHospitals = (isSuper || isDirector) ? ["ALL"] : [user.office_name || "MDM"];
      const displayName = user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;

      const token = jwt.sign(
        {
          id: user.id,
          uid: user.firebase_uid || `neon_${user.id}`,
          email: user.email,
          name: displayName,
          role: userRole,
          hospitals: userHospitals,
          isSuperAdmin: isSuper,
          isDirector: isDirector
        },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      return jsonResponse(200, headers, {
        success: true,
        token,
        user: {
          id: user.id,
          uid: user.firebase_uid || `neon_${user.id}`,
          email: user.email,
          name: displayName,
          role: userRole,
          hospitals: userHospitals,
          office: (isSuper || isDirector) ? "ALL" : (user.office_name || "MDM"),
          phone: user.phone || user.mobile || "",
          photo: user.avatar || "",
          isSuperAdmin: isSuper,
          isDirector: isDirector,
          googleLinked: !!user.firebase_uid
        }
      });
    }

    // ── 4. Action: adminResetEmployeePassword (SuperAdmin User Management & Password Reset) ──
    if (action === "adminResetEmployeePassword" && event.httpMethod === "POST") {
      const authHeader = reqHeaders.authorization || reqHeaders.Authorization || "";
      const authUser = verifyAuthToken(authHeader);
      const isSuper = authUser && (SUPER_ADMINS.includes(authUser.email.toLowerCase()) || authUser.role === "SuperAdmin" || authUser.role === "superadmin");
      
      if (!isSuper) {
        return jsonResponse(403, headers, { success: false, error: "Forbidden: SuperAdmin access required." });
      }

      const payload = JSON.parse(event.body || "{}");
      const targetEmail = String(payload.email || "").toLowerCase().trim();
      const resetToMobile = payload.resetToMobile === true;
      let targetPassword = String(payload.newPassword || "").trim();

      if (!targetEmail) {
        return jsonResponse(400, headers, { success: false, error: "Target employee email is required." });
      }

      // Lookup in manpower sheet
      const mpUser = await lookupManpowerRecord(targetEmail);

      if (resetToMobile) {
        if (!mpUser || !mpUser.cleanPhone) {
          return jsonResponse(400, headers, { success: false, error: "Registered mobile number not found for this employee." });
        }
        targetPassword = mpUser.cleanPhone;
      }

      if (!targetPassword || targetPassword.length < 6) {
        return jsonResponse(400, headers, { success: false, error: "Password must be at least 6 characters long." });
      }

      const newHash = await bcrypt.hash(targetPassword, 10);

      // Check if user exists in Neon DB
      const existing = await queryNeon(`SELECT id, username, email FROM users WHERE LOWER(email) = $1 LIMIT 1;`, [targetEmail]);

      if (existing.length > 0) {
        await queryNeon(`UPDATE users SET password = $1, is_active = 1, updated_at = NOW() WHERE id = $2;`, [newHash, existing[0].id]);
      } else {
        // Create user in Neon DB from manpower info
        const empId = mpUser ? mpUser.empId : targetEmail.split("@")[0];
        const empName = mpUser ? mpUser.name : "Employee";
        const empRole = mpUser ? (mpUser.designation.toLowerCase().includes("admin") ? "admin" : "operator") : "operator";
        const empOffice = mpUser ? mpUser.hospital : "MDM";
        const empPhone = mpUser ? mpUser.cleanPhone : "";

        await queryNeon(`
          INSERT INTO users (username, email, name, role, office_name, phone, mobile, is_active, password, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $6, 1, $7, NOW(), NOW());
        `, [empId, targetEmail, empName, empRole, empOffice, empPhone, newHash]);
      }

      return jsonResponse(200, headers, {
        success: true,
        message: `Password successfully updated for ${targetEmail}!`,
        passwordAssigned: targetPassword
      });
    }

    // ── 5. Action: linkGoogleAccount (Link Google / Firebase account to logged-in user profile) ──
    if (action === "linkGoogleAccount" && event.httpMethod === "POST") {
      const authHeader = reqHeaders.authorization || reqHeaders.Authorization || "";
      const authUser = verifyAuthToken(authHeader);
      if (!authUser || !authUser.email) {
        return jsonResponse(401, headers, { success: false, error: "Unauthorized: Please log in first." });
      }

      const payload = JSON.parse(event.body || "{}");
      const firebaseUid = String(payload.firebaseUid || "").trim();
      const googleEmail = String(payload.googleEmail || "").toLowerCase().trim();

      if (!firebaseUid) {
        return jsonResponse(400, headers, { success: false, error: "Missing Firebase Google UID." });
      }

      await queryNeon(`
        UPDATE users 
        SET firebase_uid = $1, updated_at = NOW() 
        WHERE LOWER(email) = $2;
      `, [firebaseUid, authUser.email.toLowerCase()]);

      return jsonResponse(200, headers, {
        success: true,
        message: `Google Account (${googleEmail || authUser.email}) connected successfully!`,
        firebaseUid
      });
    }

    // ── 5. Action: resetPasswordWithGoogle (Secure Verified Password Reset via Google/Firebase) ──
    if (action === "resetPasswordWithGoogle" && event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const targetEmail = String(payload.email || "").toLowerCase().trim();
      const newPassword = String(payload.newPassword || "").trim();
      const firebaseIdToken = String(payload.firebaseIdToken || "").trim();

      if (!targetEmail || !newPassword || !firebaseIdToken) {
        return jsonResponse(400, headers, { success: false, error: "Missing required fields (email, newPassword, firebaseIdToken)." });
      }

      if (newPassword.length < 6) {
        return jsonResponse(400, headers, { success: false, error: "Password must be at least 6 characters long." });
      }

      // Verify Firebase ID Token
      let verifiedUser;
      try {
        verifiedUser = await verifyFirebaseToken(firebaseIdToken);
      } catch (tokenErr) {
        return jsonResponse(401, headers, { success: false, error: "Google verification failed: " + tokenErr.message });
      }

      // Token email must match target email
      if (verifiedUser.email !== targetEmail) {
        return jsonResponse(403, headers, { 
          success: false, 
          error: `Verified Google account (${verifiedUser.email}) does not match the target email (${targetEmail}).` 
        });
      }

      // Check user exists in Neon DB
      const userRows = await queryNeon(`SELECT id, username, email FROM users WHERE LOWER(email) = $1 LIMIT 1;`, [targetEmail]);
      if (!userRows.length) {
        return jsonResponse(404, headers, { success: false, error: "No Softtech account found with this email." });
      }

      // Hash password using bcrypt
      const newHash = await bcrypt.hash(newPassword, 10);

      // Update password and link firebase_uid
      await queryNeon(`
        UPDATE users 
        SET password = $1, firebase_uid = $2, updated_at = NOW() 
        WHERE LOWER(email) = $3;
      `, [newHash, verifiedUser.uid, targetEmail]);

      return jsonResponse(200, headers, {
        success: true,
        message: "Password has been successfully reset! You can now log in with your new password."
      });
    }

    return jsonResponse(400, headers, { success: false, error: `Unsupported auth action: ${action}` });

  } catch (err) {
    console.error("[Auth API] Error:", err.message);
    return jsonResponse(500, headers, { success: false, error: "Authentication server error: " + err.message });
  }
};
