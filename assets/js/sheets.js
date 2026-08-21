// ============================================================
// sheets.js — Google Sheets API Wrapper
// PrintTrack PWA — Accesses Google Sheets via Netlify API / OAuth
// ============================================================

const { id: SHEET_ID, dailyTab: DAILY_TAB, printerTab: PRINTER_TAB, dailyRange: DAILY_RANGE } = APP_CONFIG.sheets;

// ── Core API request wrapper ─────────────────────────────
async function sheetsRequest(action, options = {}) {
  try {
    const res = await fetch(`/.netlify/functions/sheets?action=${action}`, options);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
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
  const rows = (data?.rows || []).reverse().slice(0, 100);
  return { headers, rows };
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
