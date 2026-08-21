// ============================================================
// sheets.js — Google Sheets API Wrapper
// PrintTrack PWA — Accesses Google Sheets via Netlify API / OAuth
// ============================================================

const { id: SHEET_ID, dailyTab: DAILY_TAB, printerTab: PRINTER_TAB, dailyRange: DAILY_RANGE } = APP_CONFIG.sheets;

const FIREBASE_API_KEY = "AIzaSyC7gOHZrXz8cIdXBW3_GtkHrrAo5_CdX00";

// ── Core API request wrapper (Supports Local Server & Netlify Live) ──
async function sheetsRequest(action, options = {}) {
  // If running on Localhost/XAMPP, fetch directly from Google Sheets API using Firebase API Key
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  
  if (isLocal) {
    const range = action === "printerdetails" ? `'${PRINTER_TAB}'!A:Z` : `'${DAILY_TAB}'!${DAILY_RANGE}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${FIREBASE_API_KEY}`;
    
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      if (action === "printerdetails") {
        if (!data || !data.values || data.values.length < 2) return { headers: [], rows: [] };
        const rawHeaders = data.values[0].map(h => String(h).trim());
        const rows = data.values.slice(1).filter(r => r.some(c => String(c).trim() !== "")).map(r => {
          const obj = {};
          rawHeaders.forEach((h, i) => { obj[h] = String(r[i] || "").trim(); });
          return obj;
        });
        return { headers: rawHeaders, rows };
      } else {
        if (!data || !data.values || data.values.length === 0) return { headers: [], rows: [] };
        const rawHeaders = data.values[0].map(h => String(h).trim());
        const rows = data.values.slice(1).filter(r => r.some(c => String(c).trim() !== "")).map(r => {
          const obj = {};
          rawHeaders.forEach((h, i) => {
            obj[h] = String(r[i] !== undefined && r[i] !== null ? r[i] : "").trim();
          });
          return obj;
        });
        return { headers: rawHeaders, rows };
      }
    } catch (e) {
      console.error(`[Local Sheets Fetch Error]:`, e.message);
      throw e;
    }
  }

  // Live Netlify Environment: Call Netlify Function
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
