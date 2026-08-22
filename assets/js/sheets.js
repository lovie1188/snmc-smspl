// ============================================================
// sheets.js — Google Sheets API Wrapper
// PrintTrack PWA — Accesses Google Sheets via Netlify API / OAuth
// ============================================================

const { id: SHEET_ID, dailyTab: DAILY_TAB, printerTab: PRINTER_TAB, dailyRange: DAILY_RANGE } = APP_CONFIG.sheets;

// ── Core API request wrapper ──
// ALL Sheets I/O is proxied through the authenticated Netlify function.
// The browser never calls the Sheets API directly and never holds a Sheets
// credential. The previous local path reused APP_CONFIG.firebase.apiKey as a
// Sheets API key, which is invalid (Firebase web keys are not Cloud API keys)
// and cannot read a PRIVATE sheet — it has been removed.
//
// Local development: run `netlify dev` so /.netlify/functions/* resolves on
// http://localhost:8888 (or set the Netlify dev port). Do NOT point the app
// at raw googleapis.com from the browser.
async function sheetsRequest(action, options = {}) {
  const method = String(options.method || "GET").toUpperCase();

  // Netlify BFF: Call the serverless function (verifies Firebase ID token server-side)
  try {
    const token = typeof getAuthToken === "function" ? await getAuthToken() : getAccessToken();
    if (!token) {
      handleTokenExpiry();
      throw new Error("Missing authentication token.");
    }

    const headers = {
      ...(options.headers || {}),
      "Authorization": `Bearer ${token}`
    };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`/.netlify/functions/sheets?action=${encodeURIComponent(action)}`, {
      ...options,
      headers
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 401) handleTokenExpiry();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    return await res.json();
  } catch (e) {
    console.error(`[API Error] Action ${action} failed:`, e.message);
    throw e;
  }
}

// ── Fetch printerdetails for dropdowns ────────────────────
async function fetchPrinterDetails() {
  const data = await sheetsRequest("printerdetails");
  return { headers: data?.headers || [], rows: data?.rows || [] };
}

// ── Fetch dailyentry (for history) ───────────────────────
async function fetchDailyEntries() {
  const data = await sheetsRequest("dailyentries");
  const headers = data?.headers || [];
  const rows = (data?.rows || []).reverse();
  return { headers, rows };
}

// ── Append a new daily entry row ─────────────────────────
async function appendDailyEntry(rowArray) {
  const data = await sheetsRequest(
    "appendDailyEntry",
    {
      method: "POST",
      body: JSON.stringify({ row: rowArray })
    }
  );
  return data;
}

// ── Fetch stock entries (Paper Received to Hospital) ───────
async function fetchStockEntries() {
  const data = await sheetsRequest("stock");
  return { headers: data?.headers || [], rows: data?.rows || [] };
}

// ── Utility: rows → unique column values ─────────────────
function uniqueColValues(rows, colName) {
  return [...new Set(rows.map(r => r[colName]).filter(Boolean))].sort();
}
