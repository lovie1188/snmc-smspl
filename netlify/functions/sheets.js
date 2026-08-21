// ============================================================
// Netlify Serverless API Function — Google Sheets Backend
// PrintTrack PWA — SNMC
// Sheet ID: 1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0
// ============================================================

const SHEET_ID = "1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0";
const DAILY_TAB = "Form responses 1";
const PRINTER_TAB = "printerdetails";
const DAILY_RANGE = "A:L";

// Fetch sheet data using server environment variable (GOOGLE_SHEETS_API_KEY only — no hardcoded fallback)
async function fetchSheetDataPublic(range) {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) {
    throw new Error("SERVER_CONFIG_ERROR: GOOGLE_SHEETS_API_KEY environment variable is not configured in Netlify Dashboard.");
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Sheets API HTTP ${res.status}: ${errText || res.statusText}`);
  }
  return res.json();
}

// Allowed origins — local dev + Netlify production
const ALLOWED_ORIGINS = [
  "https://snmc-smspl.netlify.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
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

  const action = event.queryStringParameters.action || "printerdetails";

  try {
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

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: `Unsupported action: ${action}` })
    };

  } catch (err) {
    console.error("[Backend API] Error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Internal Server Error" })
    };
  }
};
