// ============================================================
// sheets.js — Google Sheets API Wrapper
// PrintTrack PWA — Direct API calls using Firebase OAuth token
// ============================================================

const { id: SHEET_ID, dailyTab: DAILY_TAB, printerTab: PRINTER_TAB, dailyRange: DAILY_RANGE } = APP_CONFIG.sheets;

// ── Core fetch wrapper with auth ──────────────────────────
async function sheetsRequest(endpoint, options = {}) {
  const token = getAccessToken();
  if (!token) { handleTokenExpiry(); return null; }

  const res = await fetch(`${SHEETS_API_BASE}/${endpoint}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (res.status === 401 || res.status === 403) {
    handleTokenExpiry();
    return null;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Fetch printerdetails for dropdowns ────────────────────
async function fetchPrinterDetails() {
  const data = await sheetsRequest(`${SHEET_ID}/values/${PRINTER_TAB}!A:Z`);
  if (!data || !data.values || data.values.length < 2) return { headers: [], rows: [] };

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
  if (!data || !data.values || data.values.length === 0) {
    return { headers: [], rows: [] };
  }

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

  // Check if first row contains actual headers
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

  // Latest entries first (up to 100 entries)
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
