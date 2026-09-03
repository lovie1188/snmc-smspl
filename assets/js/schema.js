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
  // 12 columns, A:L. Written by submitEntry(); read by loadHistory().
  daily: {
    tab: "Form responses 1",
    range: "A:L",
    // Ordered column contract (index 0 => column A).
    columns: [
      { key: "timestamp", header: "Timestamp",       type: "datetime" }, // Col A
      { key: "email",     header: "Email address",   type: "string"   }, // Col B
      { key: "date",      header: "Date",            type: "date"     }, // Col C
      { key: "counter",   header: "counter Number",  type: "string"   }, // Col D
      { key: "received",  header: "Paper Recieved",  type: "number"   }, // Col E
      { key: "issued",    header: "Paper Issued",    type: "number"   }, // Col F
      { key: "type",      header: "ISSUE / RECEIVE ",type: "enum", enum: ["ISSUE", "RECEIVE", "None"] }, // Col G
      { key: "balance",   header: "BALANCE",         type: "number"   }, // Col H
      { key: "remark",    header: "REMARK",          type: "string"   }, // Col I
      { key: "opening",   header: "Opening reading", type: "number"   }, // Col J
      { key: "closing",   header: "Closing Reading", type: "number"   }, // Col K
      { key: "hospital",  header: "Hospital Name",   type: "string"   }  // Col L
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
  },

  // ── Stock / Paper Received tab (stock tab) ──
  stock: {
    tab: "stock",
    range: "A:M",
    columns: [
      { key: "date",        header: "Date",            type: "date"   }, // Col A
      { key: "invoiceNo",   header: "Invoice No.",     type: "string" }, // Col B
      { key: "description", header: "Description Of Goods", type: "string" },
      { key: "hsn",         header: "HSN/SAC",         type: "string" },
      { key: "rimQuantity", header: "Qualtity",        type: "number" }, // Col E (Rim Count)
      { key: "unit",        header: "UNIT",            type: "string" },
      { key: "rateTax",     header: "Rate Inc of TAX", type: "number" },
      { key: "rate",        header: "Rate",            type: "number" },
      { key: "per",         header: "per",             type: "string" },
      { key: "amount",      header: "Amount",          type: "number" },
      { key: "total",       header: "TOTAL",           type: "number" },
      { key: "hospital",    header: "HOSPITAL",        type: "string" }, // Col L
      { key: "paperCount",  header: "PAPER Quantity",   type: "number" }  // Col M (Sheets Count = Rims * 500)
    ]
  },

  // ── User-to-Hospital dynamic permission mapping tab ──
  userHospitals: {
    tab: "user_hospitals",
    range: "A:G",
    columns: [
      { key: "email",        header: "Email",         type: "string" }, // Col A
      { key: "hospitals",    header: "Hospitals",     type: "string" }, // Col B: Comma-separated (e.g. "MDM, MGH" or "ALL")
      { key: "role",         header: "Role",          type: "string" }, // Col C: "SuperAdmin", "Supervisor", "Operator", "Technician", "Staff"
      { key: "memberType",   header: "Member Type",   type: "string" }, // Col D: "Both", "Employee", "Contact"
      { key: "loginAllowed", header: "Login Allowed", type: "string" }, // Col E: "YES" / "NO"
      { key: "name",         header: "Full Name",     type: "string" }, // Col F: Employee Full Name
      { key: "phone",        header: "Phone",         type: "string" }  // Col G: Mobile Phone Number
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
