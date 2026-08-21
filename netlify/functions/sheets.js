// ============================================================
// Netlify Serverless API Function — Google Sheets Backend
// PrintTrack PWA — SNMC
// Sheet ID: 1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0
// ============================================================

const SHEET_ID = "1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0";
const DAILY_TAB = "dailyentry";
const PRINTER_TAB = "printerdetails";
const DAILY_RANGE = "A:L";

const FIREBASE_API_KEY = "AIzaSyC7gOHZrXz8cIdXBW3_GtkHrrAo5_CdX00";

// Fetch sheet data using Firebase Google API Key
async function fetchSheetDataPublic(range) {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY || FIREBASE_API_KEY;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Sheets API HTTP ${res.status}: ${errText || res.statusText}`);
  }
  return res.json();
}

exports.handler = async function (event, context) {
  // CORS Headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
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

      const expectedHeaders = [
        "Timestamp", "Email address", "Date", "counter Number",
        "Paper Recieved", "Paper Issued", "ISSUE / RECEIVE", "BALANCE",
        "REMARK", "Opening reading", "Closing Reading"
      ];

      const rawHeaders = data.values[0].map(h => String(h).trim());
      const rows = data.values.slice(1)
        .filter(row => row.some(cell => String(cell).trim() !== ""))
        .map(row => {
          const obj = {};
          expectedHeaders.forEach((h, i) => {
            const rawIdx = rawHeaders.indexOf(h);
            obj[h] = rawIdx !== -1 ? String(row[rawIdx] || "").trim() : (row[i] ? String(row[i]).trim() : "");
          });
          return obj;
        });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ headers: expectedHeaders, rows })
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
