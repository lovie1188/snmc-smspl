// ============================================================
// schema.js — Canonical Sheet Schema (Single Source of Truth)
// PrintTrack PWA — SNMC
// ------------------------------------------------------------
// Every sheet tab, column order, header label, and data type
// is declared ONCE here. The app (app.js) and the Netlify
// function (netlify/functions/sheets.js) both depend on this
// contract. Changing a column here must be reflected in the
// live Google Sheet before deploy.
//
// NOTE: This file MUST stay in sync with .schema. The .schema
// file is the human-readable mirror of this module.
// ============================================================

const SHEET_SCHEMA = {
  // ── Main daily-entry tab (Google Form "Form responses 1") ──
  // 11 columns, A:K. Written by submitEntry(); read by loadHistory().
  daily: {
    tab: "Form responses 1",
    range: "A:L",
    // Ordered column contract (index 0 => column A).
    columns: [
      { key: "timestamp", header: "Timestamp",       type: "datetime" },
      { key: "email",     header: "Email address",   type: "string"   },
      { key: "date",      header: "Date",            type: "date"     },
      { key: "counter",   header: "counter Number",  type: "string"   },
      { key: "received",  header: "Paper Recieved",  type: "number"   },
      { key: "issued",    header: "Paper Issued",    type: "number"   },
      { key: "type",      header: "ISSUE / RECEIVE", type: "enum", enum: ["ISSUE", "RECEIVE", "None"] },
      { key: "balance",   header: "BALANCE",         type: "number"   },
      { key: "remark",    header: "REMARK",          type: "string"   },
      { key: "opening",   header: "Opening reading", type: "number"   },
      { key: "closing",   header: "Closing Reading", type: "number"   }
    ]
  },

  // ── Printer master / dropdown source ──
  printer: {
    tab: "printerdetails",
    range: "A:Z",
    // Header labels are read dynamically from row 1 of the sheet.
    // Known columns (case-insensitive keyed in code):
    counterKey: ["Counter No.", "Counter No", "Counter"],
    hospitalKey: ["Hospital"],
    nameKey: ["Counter_name", "Counter Name"]
  },

  // ── FCM device token registry ──
  fcmtokens: {
    tab: "fcmtokens",
    range: "A:D",
    columns: [
      { key: "email",       header: "Email",        type: "string" },
      { key: "displayName", header: "Display Name", type: "string" },
      { key: "token",       header: "Token",        type: "string" },
      { key: "timestamp",   header: "Timestamp",    type: "datetime" }
    ]
  },

  // ── Approved notification senders ──
  allowedSenders: {
    tab: "allowed_senders",
    range: "A:B",
    columns: [
      { key: "email",    header: "Email",    type: "string" },
      { key: "approvedAt", header: "Approved At", type: "datetime" }
    ]
  }
};

// ── Derived helpers (built once from SHEET_SCHEMA.daily) ──

// Ordered list of daily-entry header strings (A..K).
const DAILY_HEADERS = SHEET_SCHEMA.daily.columns.map(c => c.header);

// Ordered list of daily-entry header strings actually shown in History tables.
const DAILY_DISPLAY_HEADERS = [
  "Date", "counter Number", "Opening reading", "Closing Reading",
  "BALANCE", "Paper Issued", "Paper Recieved", "ISSUE / RECEIVE", "REMARK"
];

// Header string accepted for the ISSUE/RECEIVE column (trailing-space fallback
// preserved for backward compatibility with older sheet rows).
const ISSUE_RECEIVE_KEYS = ["ISSUE / RECEIVE", "ISSUE / RECEIVE "];

// Build an ordered row array (A..K) from a keyed value object.
// Missing keys fall back to "" so the column alignment is never shifted.
function buildDailyRow(values) {
  return SHEET_SCHEMA.daily.columns.map(col => {
    const v = values ? values[col.key] : undefined;
    return (v === undefined || v === null) ? "" : String(v);
  });
}

// Coerce/normalize a raw sheet row object into the canonical keyed object.
function normalizeDailyRow(rowObj) {
  const out = {};
  SHEET_SCHEMA.daily.columns.forEach(col => {
    out[col.key] = (rowObj && rowObj[col.header] !== undefined)
      ? rowObj[col.header]
      : "";
  });
  return out;
}
