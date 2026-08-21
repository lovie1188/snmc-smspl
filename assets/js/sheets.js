// ============================================================
// sheets.js — Google Sheets API Wrapper
// PrintTrack PWA — Accesses Google Sheets via Netlify API / OAuth
// ============================================================

const { id: SHEET_ID, dailyTab: DAILY_TAB, printerTab: PRINTER_TAB, dailyRange: DAILY_RANGE } = APP_CONFIG.sheets;

// ── Core fetch wrapper (Serverless Function Fallback to Direct OAuth) ──
async function sheetsRequest(endpoint, options = {}) {
  // 1. Try fetching via Netlify Backend Serverless API first
  try {
    const action = endpoint.includes(PRINTER_TAB)
      ? "printerdetails"
      : endpoint.includes(DAILY_TAB)
      ? "dailyentries"
      : null;

    if (action && options.method !== "POST") {
      const serverlessRes = await fetch(`/api/sheets?action=${action}`);
      if (serverlessRes.ok) {
        const json = await serverlessRes.json();
        if (json && json.rows && json.rows.length > 0) {
          return { _isServerless: true, ...json };
        }
      }
    }
  } catch (e) {
    console.warn("[Sheets Wrapper] Serverless API fallback to OAuth:", e.message);
  }

  // 2. Fallback to Direct Google Sheets API via OAuth token
  const token = getAccessToken();
  if (!token || token === "authenticated_session") {
    console.warn("[Sheets API] Valid OAuth Access Token required for direct Google Sheets access.");
    return null;
  }

  try {
    const res = await fetch(`${SHEETS_API_BASE}/${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    if (res.status === 401 || res.status === 403) {
      console.warn(`[Sheets API] Auth Error HTTP ${res.status}. Permission or Token expired.`);
      return null;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (e) {
    console.warn("[Sheets API] Request failed:", e.message);
    return null;
  }
}

// ── Fetch printerdetails for dropdowns ────────────────────
async function fetchPrinterDetails() {
  const data = await sheetsRequest(`${SHEET_ID}/values/'${PRINTER_TAB}'!A:Z`);
  if (!data) return { headers: [], rows: [] };
  if (data._isServerless) return { headers: data.headers || [], rows: data.rows || [] };

  if (!data.values || data.values.length < 2) return { headers: [], rows: [] };

  const headers = data.values[0].map(h => String(h).trim());
  const rows = data.values.slice(1)
    .filter(row => row.some(cell => String(cell).trim() !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = String(row[i] || "").trim(); });
      return obj;
    });
  return { headers, rows };
}

// ── Fetch dailyentry (for history) ───────────────────────
async function fetchDailyEntries() {
  const data = await sheetsRequest(`${SHEET_ID}/values/'${DAILY_TAB}'!${DAILY_RANGE}`);
  if (!data) return { headers: [], rows: [] };
  if (data._isServerless) return { headers: data.headers || [], rows: (data.rows || []).reverse().slice(0, 100) };

  if (!data.values || data.values.length === 0) return { headers: [], rows: [] };

  const rawValues = data.values;
  const expectedHeaders = [
    "Serial No.", 
    "Date", 
    "counter Number", 
    "Opening reading", 
    "Closing Reading", 
    "ISSUE / RECEIVE", 
    "Rim recieved", 
    "Issued", 
    "balance", 
    "Remark", 
    "ReceivedBy", 
    "Issued BY"
  ];

  let headers = [];
  let dataStartIndex = 0;

  if (rawValues.length > 0 && isNaN(rawValues[0][0]) && String(rawValues[0][0]).toLowerCase().includes("serial")) {
    headers = rawValues[0].map(h => String(h).trim());
    dataStartIndex = 1;
  } else {
    headers = expectedHeaders;
    dataStartIndex = 0;
  }

  const rows = rawValues.slice(dataStartIndex)
    .filter(row => row.some(cell => String(cell).trim() !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (row[i] !== undefined && row[i] !== null) ? String(row[i]).trim() : "";
      });
      return obj;
    });

  return { headers, rows: [...rows].reverse().slice(0, 100) };
}

// ── Append a new daily entry row ─────────────────────────
async function appendDailyEntry(rowArray) {
  const data = await sheetsRequest(
    `${SHEET_ID}/values/'${DAILY_TAB}'!${DAILY_RANGE}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [rowArray] })
    }
  );
  return data;
}

// ── Utility: rows → unique column values ─────────────────
function uniqueColValues(rows, colName) {
  return [...new Set(rows.map(r => r[colName]).filter(Boolean))].sort();
}
