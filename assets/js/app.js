// ============================================================
// app.js — PrintTrack Main Application Logic
// ============================================================

let allDailyRows = [];
let printerData = { headers: [], rows: [] };
let currentUser = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Robust Date Parser for Google Sheets JSON & Custom Date Formats ──
function parseRowDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Google Sheets JSON Date(YYYY,M,D,...)
  const dMatch = s.match(/Date\((\d+),(\d+),(\d+)/i);
  if (dMatch) {
    return new Date(parseInt(dMatch[1], 10), parseInt(dMatch[2], 10), parseInt(dMatch[3], 10));
  }
  // DD/MM/YYYY or DD-MM-YYYY
  if (s.includes("/") || s.includes("-")) {
    const sep = s.includes("/") ? "/" : "-";
    const p = s.split(sep);
    if (p.length === 3) {
      if (p[0].length === 4) {
        // YYYY-MM-DD
        return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
      } else if (p[2].length === 4) {
        // DD-MM-YYYY
        return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
      }
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ── Real-Time Form Validation Constraints ──────────────────
function validateReadings() {
  const openingInput = document.getElementById("opening-reading");
  const closingInput = document.getElementById("closing-reading");
  const errorMsgEl = document.getElementById("reading-validation-error");
  const submitBtn = document.getElementById("submit-btn");

  const openingVal = openingInput?.value?.trim() || "";
  const closingVal = closingInput?.value?.trim() || "";

  const opening = parseFloat(openingVal || 0);
  const closing = parseFloat(closingVal || 0);

  // If closing reading is entered and is strictly less than opening reading
  if (closingVal !== "" && closing < opening) {
    if (closingInput) closingInput.classList.add("input-error");
    if (errorMsgEl) {
      errorMsgEl.textContent = `⚠️ Closing Reading (${closing}) cannot be less than Opening Reading (${opening})!`;
      errorMsgEl.style.display = "block";
    }
    if (submitBtn) submitBtn.disabled = true;
    return false;
  } else {
    if (closingInput) closingInput.classList.remove("input-error");
    if (errorMsgEl) errorMsgEl.style.display = "none";
    if (submitBtn) submitBtn.disabled = false;
    return true;
  }
}

// ── Hospital-Wise Analytics Calculator with Custom Date Range Filter ──
let summaryStartDate = "";
let summaryEndDate = "";

function setSummaryDatePreset(preset, btn) {
  const container = document.querySelector(".summary-quick-pills");
  if (container && btn) {
    container.querySelectorAll(".summary-quick-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }

  const startInput = document.getElementById("summary-start-date");
  const endInput = document.getElementById("summary-end-date");
  const today = new Date();
  const pad = n => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  if (preset === "today") {
    summaryStartDate = todayStr;
    summaryEndDate = todayStr;
    if (startInput) startInput.value = todayStr;
    if (endInput) endInput.value = todayStr;
  } else if (preset === "this_month") {
    const firstDay = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
    summaryStartDate = firstDay;
    summaryEndDate = todayStr;
    if (startInput) startInput.value = firstDay;
    if (endInput) endInput.value = todayStr;
  } else {
    // All time
    summaryStartDate = "";
    summaryEndDate = "";
    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";
  }

  calculateHospitalMetrics();
}

function filterSummaryByDateRange() {
  const startInput = document.getElementById("summary-start-date");
  const endInput = document.getElementById("summary-end-date");
  summaryStartDate = startInput ? startInput.value : "";
  summaryEndDate = endInput ? endInput.value : "";

  // Reset active pill when custom date picked
  const container = document.querySelector(".summary-quick-pills");
  if (container) {
    container.querySelectorAll(".summary-quick-pill").forEach(b => b.classList.remove("active"));
  }

  calculateHospitalMetrics();
}

function calculateHospitalMetrics() {
  const stats = {
    TOTAL: { delivered: 0, stockRims: 0, issued: 0, prints: 0, entries: 0 },
    MDM:   { delivered: 0, stockRims: 0, issued: 0, prints: 0, entries: 0 },
    MGH:   { delivered: 0, stockRims: 0, issued: 0, prints: 0, entries: 0 },
    UMAID: { delivered: 0, stockRims: 0, issued: 0, prints: 0, entries: 0 }
  };

  // 1. Calculate Stock Delivered / Received from allStockRows
  if (Array.isArray(allStockRows) && allStockRows.length) {
    allStockRows.forEach(s => {
      // Date Range Filter for Stock
      if (summaryStartDate || summaryEndDate) {
        const dateVal = s["Date"] || "";
        const parsedDate = parseRowDate(dateVal);
        if (parsedDate) {
          const pad = n => String(n).padStart(2, "0");
          const rowDateStr = `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}`;
          if (summaryStartDate && rowDateStr < summaryStartDate) return;
          if (summaryEndDate && rowDateStr > summaryEndDate) return;
        }
      }

      const rims = parseFloat(s["Qualtity"] || s["Quantity"] || 0) || 0;
      const sheets = parseFloat(s["PAPER Quantity"] || 0) || (rims * 500);
      const hosp = String(s["HOSPITAL"] || s["Hospital"] || "").toUpperCase().trim();

      stats.TOTAL.delivered += sheets;
      stats.TOTAL.stockRims += rims;

      if (hosp.includes("MDM")) {
        stats.MDM.delivered += sheets;
        stats.MDM.stockRims += rims;
      } else if (hosp.includes("MGH")) {
        stats.MGH.delivered += sheets;
        stats.MGH.stockRims += rims;
      } else if (hosp.includes("UMAID") || hosp.includes("UMMED") || hosp.includes("GYN") || hosp.includes("PEDIA")) {
        stats.UMAID.delivered += sheets;
        stats.UMAID.stockRims += rims;
      }
    });
  }

  // 2. Build counter-to-hospital map from printerData if available
  const counterHospitalMap = {};
  if (printerData && printerData.rows) {
    printerData.rows.forEach(p => {
      const cNo = p["Counter No."] || p["Counter No"] || p["Counter"] || Object.values(p)[0] || "";
      const hosp = p["Hospital"] || "";
      if (cNo) {
        counterHospitalMap[cNo.trim()] = hosp.trim().toUpperCase();
        const cleanC = cNo.split(" ")[0].trim();
        counterHospitalMap[cleanC] = hosp.trim().toUpperCase();
      }
    });
  }

  // 3. Group Daily Rows by Counter to calculate Prints Made & Paper Issued
  const counterGroups = {};
  const isDateFiltered = !!(summaryStartDate || summaryEndDate);

  allDailyRows.forEach(r => {
    // Date Range Filter Check
    if (isDateFiltered) {
      const dateVal = r["Date"] || r["Timestamp"] || "";
      const parsedDate = parseRowDate(dateVal);
      if (parsedDate) {
        const pad = n => String(n).padStart(2, "0");
        const rowDateStr = `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}`;
        if (summaryStartDate && rowDateStr < summaryStartDate) return;
        if (summaryEndDate && rowDateStr > summaryEndDate) return;
      }
    }

    const cVal = (r["counter Number"] || r["Counter Number"] || r["Counter"] || "").trim();
    if (!cVal) return;

    if (!counterGroups[cVal]) {
      counterGroups[cVal] = [];
    }
    counterGroups[cVal].push(r);
  });

  // Calculate stats for each counter
  Object.keys(counterGroups).forEach(cVal => {
    const rows = counterGroups[cVal];
    
    // Sort chronological: oldest first, latest last
    rows.sort((a, b) => {
      const da = parseRowDate(a["Date"] || a["hg"]) || 0;
      const db = parseRowDate(b["Date"] || b["hg"]) || 0;
      return da - db;
    });

    const latestRow = rows[rows.length - 1];
    const firstRow  = rows[0];

    // Determine hospital for this counter
    const hospCol = (latestRow["Hospital Name"] || latestRow["Hospital Name "] || latestRow["Hospital"] || "").toUpperCase();
    let hospital = hospCol || counterHospitalMap[cVal] || counterHospitalMap[cVal.split(" ")[0].trim()] || "";

    if (!hospital) {
      const rawStr = Object.values(latestRow).join(" ").toUpperCase();
      if (rawStr.includes("MDM")) hospital = "MDM";
      else if (rawStr.includes("MGH")) hospital = "MGH";
      else if (rawStr.includes("UMAID") || rawStr.includes("UMMED") || rawStr.includes("GYN") || rawStr.includes("PEDIA")) hospital = "UMAID";
    }

    // Prints Made Calculation:
    // When Lifetime (no date filter): Latest Closing Reading represents the total lifetime prints on that counter.
    // When Date Filtered: Latest Closing in period minus Initial Opening in period.
    let counterPrints = 0;
    const latestClosing = parseFloat(latestRow["Closing Reading"] || latestRow["Closing reading"] || latestRow["Closing"] || 0) || 0;
    
    if (isDateFiltered) {
      const firstOpening = parseFloat(firstRow["Opening reading"] || firstRow["Opening Reading"] || firstRow["Opening"] || 0) || 0;
      counterPrints = Math.max(0, latestClosing - firstOpening);
    } else {
      counterPrints = latestClosing;
    }

    // Sum paper issued & entry count across the period for this counter
    let counterIssued = 0;
    rows.forEach(r => {
      counterIssued += parseFloat(r["Paper Issued"] || r["Issued"] || 0) || 0;
    });

    const entriesCount = rows.length;

    // Accumulate Global
    stats.TOTAL.issued += counterIssued;
    stats.TOTAL.prints += counterPrints;
    stats.TOTAL.entries += entriesCount;

    // Accumulate Hospital-specific
    if (hospital.includes("MDM")) {
      stats.MDM.issued += counterIssued;
      stats.MDM.prints += counterPrints;
      stats.MDM.entries += entriesCount;
    } else if (hospital.includes("MGH")) {
      stats.MGH.issued += counterIssued;
      stats.MGH.prints += counterPrints;
      stats.MGH.entries += entriesCount;
    } else if (hospital.includes("UMAID") || hospital.includes("UMMED") || hospital.includes("GYN") || hospital.includes("PEDIA")) {
      stats.UMAID.issued += counterIssued;
      stats.UMAID.prints += counterPrints;
      stats.UMAID.entries += entriesCount;
    }
  });

  // 4. Select stats matching activeSelectedHospital view
  let activeStats = stats.TOTAL;
  let activeHospitalName = "All Hospitals (SNMC)";

  if (activeSelectedHospital === "MDM") {
    activeStats = stats.MDM;
    activeHospitalName = "MDM Hospital";
  } else if (activeSelectedHospital === "MGH") {
    activeStats = stats.MGH;
    activeHospitalName = "MGH Hospital";
  } else if (activeSelectedHospital === "UMMED" || activeSelectedHospital === "UMAID") {
    activeStats = stats.UMAID;
    activeHospitalName = "UMAID Hospital";
  }

  // Populate 3-Core Lifecycle Hero Cards
  const delSheetsEl = document.getElementById("kpi-delivered-sheets");
  const delRimsEl   = document.getElementById("kpi-delivered-rims");
  const issSheetsEl = document.getElementById("kpi-issued-sheets");
  const issRimsEl   = document.getElementById("kpi-issued-rims");
  const prnCountEl  = document.getElementById("kpi-prints-count");
  const entriesEl   = document.getElementById("kpi-entries-count");

  if (delSheetsEl) delSheetsEl.textContent = activeStats.delivered.toLocaleString("en-IN");
  if (delRimsEl)   delRimsEl.textContent   = activeStats.stockRims.toLocaleString("en-IN");
  if (issSheetsEl) issSheetsEl.textContent = activeStats.issued.toLocaleString("en-IN");
  if (issRimsEl)   issRimsEl.textContent   = (activeStats.issued / 500).toFixed(1);
  if (prnCountEl)  prnCountEl.textContent  = activeStats.prints.toLocaleString("en-IN");
  if (entriesEl)   entriesEl.textContent   = activeStats.entries.toLocaleString("en-IN");

  // Populate Consumption Tracker Bar
  const stockBalanceEl = document.getElementById("kpi-stock-balance");
  const utilRateEl     = document.getElementById("kpi-utilization-rate");
  const scopeEl        = document.getElementById("kpi-active-scope");

  const unissuedSheets = Math.max(0, activeStats.delivered - activeStats.issued);
  const utilizationPct = activeStats.issued > 0 
    ? Math.min(100, Math.round((activeStats.prints / activeStats.issued) * 100))
    : 0;

  if (stockBalanceEl) stockBalanceEl.textContent = `${unissuedSheets.toLocaleString("en-IN")} Sheets`;
  if (utilRateEl) {
    utilRateEl.textContent = `${utilizationPct}% (Prints / Issue)`;
    utilRateEl.className = utilizationPct >= 80 ? "cs-val good" : "cs-val warn";
  }
  if (scopeEl) scopeEl.textContent = activeHospitalName;

  // ⚠️ 5. Low Stock Re-order Alert Handler (< 10 Rims / 5000 Sheets)
  const lowStockBanner = document.getElementById("low-stock-alert-banner");
  const lowStockText   = document.getElementById("low-stock-alert-text");
  const remainingRims  = (unissuedSheets / 500).toFixed(1);

  if (lowStockBanner) {
    if (unissuedSheets < 5000) {
      lowStockBanner.style.display = "flex";
      if (lowStockText) {
        lowStockText.innerHTML = `<strong>${activeHospitalName}</strong> available unissued paper stock is critically low (<strong>${remainingRims} Rims / ${unissuedSheets.toLocaleString("en-IN")} Sheets</strong> remaining). Please place a re-order!`;
      }
    } else {
      lowStockBanner.style.display = "none";
    }
  }
}

// ── One-Click Executive Share: WhatsApp Summary ────────────
function shareSummaryWhatsApp() {
  const scope = document.getElementById("kpi-active-scope")?.textContent || "All Hospitals";
  const delivered = document.getElementById("kpi-delivered-sheets")?.textContent || "0";
  const delRims = document.getElementById("kpi-delivered-rims")?.textContent || "0";
  const issued = document.getElementById("kpi-issued-sheets")?.textContent || "0";
  const issRims = document.getElementById("kpi-issued-rims")?.textContent || "0";
  const prints = document.getElementById("kpi-prints-count")?.textContent || "0";
  const entries = document.getElementById("kpi-entries-count")?.textContent || "0";
  const balance = document.getElementById("kpi-stock-balance")?.textContent || "0 Sheets";
  const util = document.getElementById("kpi-utilization-rate")?.textContent || "0%";

  const todayStr = new Date().toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' });
  const dateRangeStr = (summaryStartDate && summaryEndDate) 
    ? `${summaryStartDate} to ${summaryEndDate}` 
    : (summaryStartDate ? `From ${summaryStartDate}` : todayStr);

  const text = `📊 *SNMC PrintTrack — Executive Daily Summary*
🏥 *Hospital:* ${scope}
📅 *Period:* ${dateRangeStr}
----------------------------------
📦 *1. Paper Delivered (Stock In):* ${delivered} Sheets (${delRims} Rims)
📝 *2. Paper Issued (Counter Out):* ${issued} Sheets (${issRims} Rims)
🖨️ *3. Prints Made (Meter Output):* ${prints} Pages (${entries} Entries)
----------------------------------
⚖️ *Unissued Stock Balance:* ${balance}
📈 *Counter Utilization:* ${util}
----------------------------------
_Generated via SNMC PrintTrack Cloud Suite_`;

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(waUrl, "_blank");
  showToast("📱 WhatsApp Summary opened!", "success");
}

// ── One-Click Executive Share: Printable PDF / Summary View ─
function exportExecutivePDF() {
  const scope = document.getElementById("kpi-active-scope")?.textContent || "All Hospitals";
  const delivered = document.getElementById("kpi-delivered-sheets")?.textContent || "0";
  const delRims = document.getElementById("kpi-delivered-rims")?.textContent || "0";
  const issued = document.getElementById("kpi-issued-sheets")?.textContent || "0";
  const issRims = document.getElementById("kpi-issued-rims")?.textContent || "0";
  const prints = document.getElementById("kpi-prints-count")?.textContent || "0";
  const entries = document.getElementById("kpi-entries-count")?.textContent || "0";
  const balance = document.getElementById("kpi-stock-balance")?.textContent || "0 Sheets";
  const util = document.getElementById("kpi-utilization-rate")?.textContent || "0%";

  const todayStr = new Date().toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' });
  const dateRangeStr = (summaryStartDate && summaryEndDate) 
    ? `${summaryStartDate} to ${summaryEndDate}` 
    : (summaryStartDate ? `From ${summaryStartDate}` : todayStr);

  const printHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Executive Summary - ${scope}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 24px; color: #1e293b; line-height: 1.5; }
        .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; }
        .header h1 { margin: 0; color: #0f172a; font-size: 1.4rem; }
        .header p { margin: 4px 0 0; color: #64748b; font-size: 0.9rem; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 20px; }
        .card { background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 14px; text-align: center; }
        .card .title { font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
        .card .val { font-size: 1.6rem; font-weight: 900; color: #0f172a; margin: 4px 0; }
        .card .sub { font-size: 0.75rem; color: #475569; font-weight: 600; }
        .summary-box { background: #e0f2fe; border: 1.5px solid #bae6fd; border-radius: 12px; padding: 14px; margin-top: 14px; display: flex; justify-content: space-around; }
        .summary-box div { text-align: center; }
        .summary-box .label { font-size: 0.75rem; font-weight: 700; color: #0369a1; text-transform: uppercase; }
        .summary-box .val { font-size: 1.2rem; font-weight: 900; color: #0c4a6e; }
        .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 0.8rem; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 10px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Dr. S.N. Medical College & Associated Hospitals, Jodhpur</h1>
        <p><strong>PrintTrack — Executive Daily Paper &amp; Consumption Summary</strong></p>
        <p><strong>Hospital Scope:</strong> ${scope} &nbsp;|&nbsp; <strong>Period:</strong> ${dateRangeStr}</p>
      </div>

      <div class="grid">
        <div class="card" style="border-top: 4px solid #7c3aed;">
          <div class="title">📦 1. Paper Delivered</div>
          <div class="val" style="color: #6d28d9;">${delivered}</div>
          <div class="sub">${delRims} Stock Rims</div>
        </div>

        <div class="card" style="border-top: 4px solid #1d4ed8;">
          <div class="title">📝 2. Paper Issued</div>
          <div class="val" style="color: #1e40af;">${issued}</div>
          <div class="sub">${issRims} Counter Rims</div>
        </div>

        <div class="card" style="border-top: 4px solid #059669;">
          <div class="title">🖨️ 3. Prints Made</div>
          <div class="val" style="color: #047857;">${prints}</div>
          <div class="sub">${entries} Entries Logged</div>
        </div>
      </div>

      <div class="summary-box">
        <div>
          <div class="label">Unissued Stock Balance</div>
          <div class="val">${balance}</div>
        </div>
        <div>
          <div class="label">Counter Utilization Rate</div>
          <div class="val">${util}</div>
        </div>
        <div>
          <div class="label">Report Generated On</div>
          <div class="val">${todayStr}</div>
        </div>
      </div>

      <div class="footer">
        <span>SNMC PrintTrack Cloud Reporting System</span>
        <span>Authorized Signatory: ____________________</span>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  const printWin = window.open("", "_blank");
  if (printWin) {
    printWin.document.open();
    printWin.document.write(printHtml);
    printWin.document.close();
    showToast("📄 Executive PDF printable summary generated!", "success");
  } else {
    showToast("⚠️ Pop-up blocked. Please allow pop-ups for PDF export.", "warn");
  }
}

let historyViewMode = window.innerWidth <= 768 ? "cards" : "table";

function setHistoryViewMode(mode) {
  historyViewMode = mode;
  const btnCards = document.getElementById("btn-view-cards");
  const btnTable = document.getElementById("btn-view-table");
  const cardsContainer = document.getElementById("history-cards-container");
  const tableWrapper = document.getElementById("history-table-wrapper");

  if (mode === "cards") {
    if (btnCards) btnCards.classList.add("active");
    if (btnTable) btnTable.classList.remove("active");
    if (cardsContainer) cardsContainer.style.display = "flex";
    if (tableWrapper) tableWrapper.style.display = "none";
  } else {
    if (btnCards) btnCards.classList.remove("active");
    if (btnTable) btnTable.classList.add("active");
    if (cardsContainer) cardsContainer.style.display = "none";
    if (tableWrapper) tableWrapper.style.display = "block";
  }
}

// Helper: Get color-coded badge class for ISSUE (Red), RECEIVE (Green), NONE (BW/Slate)
function getBadgeClass(type) {
  const clean = String(type || "").trim().toUpperCase();
  if (clean === "RECEIVE") return "badge-receive";
  if (clean === "NONE") return "badge-none";
  return "badge-issue"; // Default Red
}

// ── Render History List (Cards + Table) ────────────────────
function renderHistoryRows(rowsToRender) {
  const tbody = document.getElementById("history-body");
  const cardsContainer = document.getElementById("history-cards-container");
  const noData = document.getElementById("no-history");
  const countBadge = document.getElementById("history-count-badge");

  if (countBadge) {
    countBadge.textContent = `${rowsToRender.length} entr${rowsToRender.length === 1 ? 'y' : 'ies'}`;
  }

  if (!rowsToRender.length) {
    if (tbody) tbody.innerHTML = "";
    if (cardsContainer) cardsContainer.innerHTML = "";
    if (noData) noData.style.display = "block";
    return;
  }

  if (noData) noData.style.display = "none";

  // 1. Render Mobile Cards View
  if (cardsContainer) {
    cardsContainer.innerHTML = rowsToRender.map(r => {
      const date    = r["Date"] || "";
      const counter = r["counter Number"] || r["Counter Number"] || r["Counter"] || "Unknown Counter";
      const opening = r["Opening reading"] || "0";
      const closing = r["Closing Reading"] || "0";
      const balance = r["BALANCE"] || r["balance"] || "0";
      const issued  = r["Paper Issued"] || r["Issued"] || "0";
      const received= r["Paper Recieved"] || r["Rim recieved"] || "0";
      const type    = r["ISSUE / RECEIVE "] || r["ISSUE / RECEIVE"] || "ISSUE";
      const remark  = r["REMARK"] || r["Remark"] || "";
      const email   = r["Email address"] || r["Email"] || "";

      const typeClass = getBadgeClass(type);

      return `
        <div class="history-card-item">
          <div class="history-card-header">
            <div>
              <div class="history-card-title">${escapeHtml(counter)}</div>
              <div class="history-card-date">📅 ${escapeHtml(date)} ${email ? '• ' + escapeHtml(email.split('@')[0]) : ''}</div>
            </div>
            <span class="badge ${typeClass}">${escapeHtml(type)}</span>
          </div>

          <div class="history-card-grid">
            <div class="history-card-stat">
              <span class="stat-label">Opening</span>
              <span class="stat-val">${escapeHtml(opening)}</span>
            </div>
            <div class="history-card-stat">
              <span class="stat-label">Closing</span>
              <span class="stat-val">${escapeHtml(closing)}</span>
            </div>
            <div class="history-card-stat">
              <span class="stat-label">Balance</span>
              <span class="stat-val balance">${escapeHtml(balance)}</span>
            </div>
            <div class="history-card-stat">
              <span class="stat-label">Issued</span>
              <span class="stat-val highlight">${escapeHtml(issued)}</span>
            </div>
            <div class="history-card-stat">
              <span class="stat-label">Received</span>
              <span class="stat-val">${escapeHtml(received)}</span>
            </div>
            <div class="history-card-stat">
              <span class="stat-label">Net Pages</span>
              <span class="stat-val">${escapeHtml(String(Math.max(0, parseFloat(closing) - parseFloat(opening))))}</span>
            </div>
          </div>

          ${remark ? `
            <div class="history-card-footer">
              <span class="history-card-remark">💬 ${escapeHtml(remark)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }).join("");
  }

  // 2. Render Desktop Table View
  if (tbody) {
    const displayHeaders = DAILY_DISPLAY_HEADERS;
    tbody.innerHTML = rowsToRender.map(row => {
      const cellsHtml = displayHeaders.map(h => {
        let val = row[h] !== undefined ? row[h] : "";
        if (h.toLowerCase().includes("issue / receive") || h.toLowerCase() === "type") {
          const typeClass = getBadgeClass(val);
          return `<td><span class="badge ${typeClass}">${escapeHtml(val || "ISSUE")}</span></td>`;
        }
        return `<td>${escapeHtml(String(val))}</td>`;
      }).join("");
      return `<tr>${cellsHtml}</tr>`;
    }).join("");
  }
}

// ── Search & Filter History Table ──────────────────────────
function filterHistoryTable() {
  const searchVal = document.getElementById("history-search-input")?.value?.toLowerCase().trim() || "";
  const dateVal = document.getElementById("history-date-filter")?.value || "";

  // Convert HTML date input YYYY-MM-DD to DD/MM/YYYY for comparison
  let targetDateFormatted = "";
  if (dateVal && dateVal.includes("-")) {
    const parts = dateVal.split("-");
    if (parts.length === 3) {
      targetDateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  const filteredRows = allDailyRows.filter(r => {
    // Hospital Filter
    const hospCol = (r["Hospital Name"] || r["Hospital Name "] || r["Hospital"] || "").toUpperCase();
    const cVal = r["counter Number"] || r["Counter Number"] || r["Counter"] || "";
    let rowHosp = hospCol;
    if (!rowHosp) {
      const rawStr = Object.values(r).join(" ").toUpperCase();
      if (rawStr.includes("MDM")) rowHosp = "MDM";
      else if (rawStr.includes("MGH")) rowHosp = "MGH";
      else if (rawStr.includes("UMAID") || rawStr.includes("UMMED")) rowHosp = "UMMED";
    }

    if (!isHospitalVisible(rowHosp)) return false;

    const rowStr = Object.values(r).join(" ").toLowerCase();
    const matchesSearch = !searchVal || rowStr.includes(searchVal);
    const rowDate = String(r["Date"] || "").trim();
    const matchesDate = !dateVal || rowDate.includes(dateVal) || (targetDateFormatted && rowDate.includes(targetDateFormatted));
    return matchesSearch && matchesDate;
  });

  renderHistoryRows(filteredRows);
}

// ── Export History to Excel (.xlsx) ───────────────────────
function exportHistoryToExcel() {
  const user = currentUser || getStoredUser() || {};
  const isSuper = typeof isSuperAdmin === "function" && isSuperAdmin(user.email || "");
  const isDirect = typeof isDirector === "function" && isDirector(user.email || "");
  const userIsAdmin = !isSuper && !isDirect && (String(user.role || "").toLowerCase() === "admin");
  if (userIsAdmin && activeAdminPermissions && !activeAdminPermissions.can_export_excel) {
    showToast("🚫 Permission Denied: Admin role is not permitted to export Excel data.", "error");
    return;
  }

  if (!allDailyRows.length) {
    showToast("No history data to export.", "warn");
    return;
  }
  try {
    const worksheet = XLSX.utils.json_to_sheet(allDailyRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PrintTrack_Daily_Entries");
    XLSX.writeFile(workbook, `PrintTrack_Daily_Entries_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("📊 Exported to Excel successfully!", "success");
  } catch (err) {
    showToast("Export failed: " + err.message, "error");
  }
}

// ── Export History to PDF / Printable View ──────────────────
function exportHistoryToPDF() {
  if (!allDailyRows.length) {
    showToast("No history data to print.", "warn");
    return;
  }
  window.print();
}

// ── Smart Conditional Logic for ISSUE / RECEIVE / None ──
function toggleIssueReceiveFields() {
  const typeVal       = document.getElementById("issue-receive-select")?.value || "ISSUE";
  const groupRecieved = document.getElementById("group-paper-recieved");
  const groupIssued   = document.getElementById("group-paper-issued");

  if (typeVal === "ISSUE") {
    if (groupRecieved) groupRecieved.style.display = "none";
    if (groupIssued)   groupIssued.style.display   = "block";
    document.getElementById("paper-recieved").value = "0";
  } else if (typeVal === "RECEIVE") {
    if (groupRecieved) groupRecieved.style.display = "block";
    if (groupIssued)   groupIssued.style.display   = "none";
    document.getElementById("paper-issued").value = "0";
  } else {
    // None
    if (groupRecieved) groupRecieved.style.display = "none";
    if (groupIssued)   groupIssued.style.display   = "none";
    document.getElementById("paper-recieved").value = "0";
    document.getElementById("paper-issued").value = "0";
  }
  
  calcBalance();
}

// ── Calculate BALANCE & NET PRINTS DIFFERENCE ─────────────────
function calcBalance() {
  const openingInput = document.getElementById("opening-reading");
  const closingInput = document.getElementById("closing-reading");

  const openingVal = openingInput?.value?.trim() || "";
  const closingVal = closingInput?.value?.trim() || "";

  const opening = parseFloat(openingVal || 0);
  const closing = parseFloat(closingVal || 0);
  
  // 1. Net Prints Calculation: (Closing - Opening)
  const netPrintsEl = document.getElementById("net-prints-calc");
  if (netPrintsEl) {
    if (closingVal !== "" && !isNaN(closing) && !isNaN(opening)) {
      const net = closing - opening;
      netPrintsEl.value = net >= 0 ? net : 0;
    } else {
      netPrintsEl.value = 0;
    }
  }

  // 2. Paper Balance (Opening - Closing as per Google Sheets Column H formula)
  const balEl = document.getElementById("paper-balance");
  if (balEl) {
    const diff = opening - closing;
    balEl.value = isNaN(diff) ? 0 : diff;
    balEl.style.color = diff < 0 ? "#ef4444" : "#0f172a";
  }
}

// ── Helper: Exact Counter Matching ────────────────────────
// Solves substring bug where "Counter1" falsely matched "Counter10", "Counter11", etc.
function isExactCounterMatch(entryVal, targetCounterNo, targetSerialNo) {
  if (!entryVal) return false;
  const entryStr = String(entryVal).trim();

  // If target serial is present and in entry string, it's an exact match
  if (targetSerialNo && entryStr.includes(targetSerialNo)) {
    return true;
  }

  // Exact Counter number regex match (e.g. Counter 1 vs Counter 10)
  const entryM = entryStr.match(/Counter\s*(\d+)/i);
  const targetM = String(targetCounterNo).match(/Counter\s*(\d+)/i);

  if (entryM && targetM) {
    return parseInt(entryM[1], 10) === parseInt(targetM[1], 10);
  }

  // Exact full string or trimmed base match
  const cleanEntry = entryStr.split(" ")[0].trim().toLowerCase();
  const cleanTarget = String(targetCounterNo).split(" ")[0].trim().toLowerCase();
  return cleanEntry === cleanTarget || entryStr.toLowerCase() === String(targetCounterNo).toLowerCase();
}

// ── Handle Counter Selection (Auto Opening Reading + Render History) ──
function handleCounterSelectChange() {
  const selectEl = document.getElementById("counter-select");
  const selectedCounter = selectEl?.value?.trim();
  const titleEl = document.getElementById("counter-history-title");
  const tbody = document.getElementById("counter-history-body");
  const noHist = document.getElementById("no-counter-history");
  const confirmCard = document.getElementById("selected-printer-confirm-card");

  if (!selectedCounter) {
    if (confirmCard) confirmCard.style.display = "none";
    if (titleEl) titleEl.textContent = "Counter History";
    if (tbody) tbody.innerHTML = "";
    if (noHist) {
      noHist.style.display = "block";
      noHist.textContent = "Please select a Counter Number above to view its history.";
    }
    return;
  }

  // 1. Find Printer details from allPrinterItems
  const printerObj = (allPrinterItems || []).find(p => p.fullCounter === selectedCounter || p.counterNo === selectedCounter) || {};
  const hospName = (printerObj.hospital || "ALL").toUpperCase();
  const counterName = printerObj.counterName || "General Counter";
  const serialNo = printerObj.serialNo || "—";

  // 2. Filter history for selected counter using exact matcher
  const counterRows = allDailyRows.filter(r => {
    const c = r["counter Number"] || r["Counter Number"] || r["Counter"] || "";
    return isExactCounterMatch(c, selectedCounter);
  });

  // 3. Auto-set Opening Reading and Balance from LATEST entry of selected counter
  let foundPrevClosing = "0";
  let foundPrevBalance = "0";
  if (counterRows.length > 0) {
    for (const entry of counterRows) {
      const val = entry["Closing Reading"] || entry["Closing"] || entry["closing"] || "";
      if (val !== "" && !isNaN(val)) {
        foundPrevClosing = String(val).trim();
        foundPrevBalance = String(entry["BALANCE"] || entry["balance"] || "0").trim();
        break;
      }
    }
  }

  // 4. Populate and display the Prominent Confirmation Card
  if (confirmCard) {
    const hospBadge = document.getElementById("spc-hosp");
    const title = document.getElementById("spc-counter-title");
    const sub = document.getElementById("spc-counter-sub");
    const sEl = document.getElementById("spc-serial");
    const lastEl = document.getElementById("spc-last-reading");
    const balEl = document.getElementById("spc-balance");

    if (hospBadge) {
      hospBadge.textContent = `${hospName} HOSPITAL`;
      hospBadge.className = `spc-hosp-badge ${hospName.toLowerCase()}`;
    }
    if (title) title.textContent = selectedCounter;
    if (sub) sub.textContent = counterName;
    if (sEl) sEl.textContent = serialNo;
    if (lastEl) lastEl.textContent = `${foundPrevClosing} Pages`;
    if (balEl) balEl.textContent = `${foundPrevBalance} Sheets`;

    confirmCard.style.display = "block";
  }

  if (titleEl) titleEl.textContent = `History — ${selectedCounter}`;

  const openingEl = document.getElementById("opening-reading");
  if (openingEl) {
    openingEl.value = foundPrevClosing;
    calcBalance();
    validateReadings();
  }

  // 3. Render Counter History Table below form
  if (!counterRows.length) {
    if (tbody) tbody.innerHTML = "";
    if (noHist) {
      noHist.style.display = "block";
      noHist.textContent = `No previous records found for ${selectedCounter}.`;
    }
    return;
  }

  if (noHist) noHist.style.display = "none";
  if (tbody) {
    tbody.innerHTML = counterRows.map(r => {
      const date    = r["Date"] || "";
      const counter = r["counter Number"] || r["Counter Number"] || selectedCounter;
      const opening = r["Opening reading"] || "";
      const closing = r["Closing Reading"] || "";
      const balance = r["BALANCE"] || r["balance"] || "";
      const issued  = r["Paper Issued"] || r["Issued"] || "0";
      const recieved= r["Paper Recieved"] || r["Rim recieved"] || "0";
      const type    = r["ISSUE / RECEIVE "] || r["ISSUE / RECEIVE"] || "ISSUE";
      const remark  = r["REMARK"] || r["Remark"] || "";

      const typeClass = getBadgeClass(type);

      return `<tr>
        <td>${escapeHtml(date)}</td>
        <td><strong>${escapeHtml(counter)}</strong></td>
        <td>${escapeHtml(opening)}</td>
        <td>${escapeHtml(closing)}</td>
        <td><strong>${escapeHtml(balance)}</strong></td>
        <td>${escapeHtml(issued)}</td>
        <td>${escapeHtml(recieved)}</td>
        <td><span class="badge ${typeClass}">${escapeHtml(type)}</span></td>
        <td>${escapeHtml(remark)}</td>
      </tr>`;
    }).join("");
  }
}

// ── User Hospital Access State ────────────────────────────
let userAllowedHospitals = ["ALL"]; // ["MDM"], ["MDM", "MGH"], or ["ALL"]
let activeSelectedHospital = "ALL"; // Current filter view for SuperAdmin/Supervisor
let allStockRows = [];
let allPrinterItems = [];

// Helper: Check if a hospital is allowed for the active user view
function isHospitalVisible(hospitalName) {
  if (!hospitalName) return true;
  const cleanHosp = hospitalName.trim().toUpperCase();
  if (activeSelectedHospital !== "ALL") {
    return cleanHosp.includes(activeSelectedHospital);
  }
  if (userAllowedHospitals.includes("ALL")) return true;
  return userAllowedHospitals.some(h => cleanHosp.includes(h.toUpperCase()));
}

// ── Hospital Switcher Management (Auto-Filter Default by User Hospital Mapping) ──
function initHospitalState() {
  const email = (currentUser?.email || "").toLowerCase().trim();
  const isSuper = isSuperAdmin(email);

  // 1. Resolve user allowed hospitals from authenticated profile
  if (isSuper) {
    userAllowedHospitals = ["ALL"];
  } else if (Array.isArray(currentUser?.hospitals) && currentUser.hospitals.length > 0) {
    userAllowedHospitals = currentUser.hospitals.map(h => String(h).trim().toUpperCase()).filter(Boolean);
  } else {
    const mapped = getUserHospital(email);
    userAllowedHospitals = mapped.split(",").map(h => h.trim().toUpperCase()).filter(Boolean);
  }

  // 2. Set default active selected hospital based on user mapping
  if (userAllowedHospitals.length === 1 && userAllowedHospitals[0] !== "ALL") {
    activeSelectedHospital = userAllowedHospitals[0]; // Auto-lock to operator's assigned hospital (e.g. "MDM")
  } else if (userAllowedHospitals.includes("ALL") || isSuper) {
    activeSelectedHospital = "ALL"; // SuperAdmins or Multi-hospital supervisors default to ALL with switcher
  } else if (userAllowedHospitals.length > 0) {
    activeSelectedHospital = userAllowedHospitals[0];
  } else {
    activeSelectedHospital = "ALL";
  }

  // 3. Sync all sub-modules (Printers, Stock, Employees) to user's default mapped hospital
  activePrinterHospitalFilter = activeSelectedHospital;
  activeStockHospitalFilter = activeSelectedHospital;
  activeEmployeeHospitalFilter = activeSelectedHospital;

  updateHeaderHospitalBadge();
}

function updateHeaderHospitalBadge() {
  const lbl = document.getElementById("current-hospital-label");
  if (lbl) {
    lbl.textContent = activeSelectedHospital === "ALL" ? "All" : activeSelectedHospital;
  }
}

function openHospitalSwitcherModal() {
  if (userAllowedHospitals.length === 1 && userAllowedHospitals[0] !== "ALL" && !isSuperAdmin(currentUser?.email)) {
    showToast(`Assigned to ${userAllowedHospitals[0]} Hospital`, "info");
    return;
  }
  const hospitals = ["ALL", "MDM", "MGH", "UMMED"];
  const current = activeSelectedHospital;
  const nextIdx = (hospitals.indexOf(current) + 1) % hospitals.length;
  activeSelectedHospital = hospitals[nextIdx];
  updateHeaderHospitalBadge();
  showToast(`🏥 Switched view: ${activeSelectedHospital === "ALL" ? "All Hospitals" : activeSelectedHospital}`, "success");
  
  // Sync page-specific active filter variables
  activePrinterHospitalFilter = activeSelectedHospital;
  activeStockHospitalFilter = activeSelectedHospital;
  activeEmployeeHospitalFilter = activeSelectedHospital;

  // Sync all visual pill buttons across pages
  const syncPills = (containerId) => {
    const container = document.getElementById(containerId);
    if (container) {
      container.querySelectorAll(".pill-btn").forEach(btn => {
        const txt = btn.textContent.trim().toUpperCase();
        if (txt === activeSelectedHospital || (activeSelectedHospital === "ALL" && txt === "ALL") || (activeSelectedHospital === "UMMED" && (txt === "UMMED" || txt === "UMAID"))) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });
    }
  };

  syncPills("printer-hospital-pills");
  syncPills("stock-hospital-pills");
  syncPills("employee-hospital-pills");

  // Refresh UI views with new hospital filter
  calculateHospitalMetrics();
  loadPrinterDropdowns();
  filterHistoryTable();
  if (typeof renderPrintersList === "function") renderPrintersList();
  if (typeof renderStockList === "function") renderStockList();
  if (typeof renderEmployeesList === "function") renderEmployeesList();
}

// ── 2-Row Mobile-Optimized Counter Picker ─────────────────
let counterPickerData = [];

function openCounterPickerModal() {
  const modal = document.getElementById("counter-picker-modal");
  const searchInput = document.getElementById("counter-picker-search");
  if (modal) modal.style.display = "flex";
  if (searchInput) { searchInput.value = ""; searchInput.focus(); }
  renderCounterPickerOptions(counterPickerData);
}

function closeCounterPickerModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains("modal-close-btn")) return;
  const modal = document.getElementById("counter-picker-modal");
  if (modal) modal.style.display = "none";
}

function renderCounterPickerOptions(options) {
  const listEl = document.getElementById("counter-picker-list");
  const selectedVal = document.getElementById("counter-select")?.value || "";
  if (!listEl) return;

  if (!options.length) {
    listEl.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);">No counters found for this hospital.</div>`;
    return;
  }

  listEl.innerHTML = options.map(opt => {
    const isSelected = opt.value === selectedVal ? "selected" : "";
    return `
      <div class="picker-option-card ${isSelected}" onclick="selectCounterOption('${escapeHtml(opt.value)}', '${escapeHtml(opt.row1)}', '${escapeHtml(opt.row2)}')">
        <div class="opt-row1">${escapeHtml(opt.row1)}</div>
        <div class="opt-row2">${escapeHtml(opt.row2)}</div>
      </div>
    `;
  }).join("");
}

function filterCounterPickerOptions() {
  const q = document.getElementById("counter-picker-search")?.value?.toLowerCase().trim() || "";
  const filtered = counterPickerData.filter(o => o.row1.toLowerCase().includes(q) || o.row2.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  renderCounterPickerOptions(filtered);
}

function selectCounterOption(value, row1, row2) {
  const hiddenInput = document.getElementById("counter-select");
  const labelEl = document.getElementById("counter-picker-label");
  if (hiddenInput) {
    hiddenInput.value = value;
  }
  if (labelEl) {
    labelEl.innerHTML = `
      <div class="picker-selected-item">
        <div class="p-row1">${escapeHtml(row1)}</div>
        <div class="p-row2">${escapeHtml(row2)}</div>
      </div>
    `;
  }
  const modal = document.getElementById("counter-picker-modal");
  if (modal) modal.style.display = "none";
  handleCounterSelectChange();
}

// ── Load printerdetails → filtered by hospital & 2-row picker ──
async function loadPrinterDropdowns() {
  try {
    const data = await fetchPrinterDetails();
    printerData = data;
    
    // Server-authoritative hospital assignment sync
    if (data.userHospital && data.userHospital !== "ALL") {
      userAllowedHospitals = data.userHospital.split(",").map(h => h.trim().toUpperCase()).filter(Boolean);
      if (activeSelectedHospital === "ALL" && userAllowedHospitals.length === 1) {
        activeSelectedHospital = userAllowedHospitals[0];
      }
      updateHeaderHospitalBadge();
    }

    if (!printerData.rows || !printerData.rows.length) {
      if (userAllowedHospitals.length > 0 && !userAllowedHospitals.includes("ALL")) {
        // User is mapped, but no printers exist or mapped hospital has none
      } else {
        showToast("No authorized printers found for your account.", "warn");
      }
      return;
    }

    counterPickerData = [];
    allPrinterItems = [];
    
    printerData.rows.forEach(r => {
      const counterNo   = r["Counter No."] || r["Counter No"] || r["Counter"] || Object.values(r)[0] || "";
      const hospital    = (r["Hospital"] || "").trim().toUpperCase();
      const counterName = r["Counter Name"] || r["Counter_name"] || "";
      const serialNo    = r["serial_no"] || r["Serial No"] || r["Serial_No"] || "";
      const fullCounter = r["Counter"] || (serialNo ? `${counterNo} - ${serialNo}` : counterNo);

      if (counterNo) {
        allPrinterItems.push({ counterNo, hospital, counterName, serialNo, fullCounter });

        // Filter by user's mapped hospital
        if (isHospitalVisible(hospital)) {
          const row1 = fullCounter;
          const row2 = [counterName, hospital ? `(${hospital})` : ""].filter(Boolean).join(" ");

          counterPickerData.push({
            value: fullCounter,
            row1: row1,
            row2: row2,
            hospital: hospital
          });
        }
      }
    });

    // If current selected value is not in filtered list, reset
    const curVal = document.getElementById("counter-select")?.value;
    if (curVal && !counterPickerData.some(p => p.value === curVal)) {
      selectCounterOption("", "", "");
      const labelEl = document.getElementById("counter-picker-label");
      if (labelEl) labelEl.innerHTML = `<span style="color: var(--text-muted);">— Select Counter No. —</span>`;
    }
  } catch (err) {
    showToast("Dropdown load failed: " + err.message, "error");
  }
}

// ── Load History & Calculate Next Serial No ──────────────
async function loadHistory() {
  const tbody    = document.getElementById("history-body");
  const noData   = document.getElementById("no-history");
  const loading  = document.getElementById("history-loading");

  if (loading) loading.style.display = "flex";
  if (tbody)   tbody.innerHTML = "";

  try {
    const { headers, rows } = await fetchDailyEntries();
    allDailyRows = rows || [];

    if (loading) loading.style.display = "none";

    // Calculate Hospital Metrics on Dashboard
    calculateHospitalMetrics();

    if (!rows.length) {
      if (noData) noData.style.display = "block";
      return;
    }
    if (noData) noData.style.display = "none";

    const displayHeaders = DAILY_DISPLAY_HEADERS;

    const thead = document.getElementById("history-head");
    if (thead) {
      thead.innerHTML = `<tr>${displayHeaders.map(h => `<th>${h}</th>`).join("")}</tr>`;
    }

    // Render both Card and Table views
    renderHistoryRows(allDailyRows);
    setHistoryViewMode(historyViewMode);

    // Refresh counter selection if counter selected
    handleCounterSelectChange();

  } catch (err) {
    if (loading) loading.style.display = "none";
    showToast("History load failed: " + err.message, "error");
  }
}

function setDefaultDate() {
  const userEmail = (currentUser?.email || "").toLowerCase().trim();
  const dateGroup = document.getElementById("entry-date-group");
  const dateInput = document.getElementById("entry-date-input");

  if (isSuperAdmin(userEmail)) {
    if (dateGroup) dateGroup.style.display = "block";
    if (dateInput && !dateInput.value) {
      const now = new Date();
      const pad = n => String(n).padStart(2, "0");
      dateInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
  } else {
    if (dateGroup) dateGroup.style.display = "none";
  }
}

// ── Submit Daily Entry (Supports Offline IndexedDB & Online Sync) ──
async function submitEntry(event) {
  event.preventDefault();

  // 1. Check Real-Time Validation Constraints
  const user = currentUser || getStoredUser() || {};
  const isSuper = isSuperAdmin(user.email || "") || user.isSuperAdmin === true;
  const isDirect = (typeof isDirector === "function" && isDirector(user.email || "")) || user.isDirector === true || String(user.role || "").toLowerCase() === "director";
  const userIsAdmin = !isSuper && !isDirect && (String(user.role || "").toLowerCase() === "admin");

  if (userIsAdmin && activeAdminPermissions && !activeAdminPermissions.can_add_entry) {
    showToast("🚫 Permission Denied: Admin role is not permitted to submit daily entries.", "error");
    return;
  }

  if (!validateReadings()) {
    showToast("⚠️ Closing Reading cannot be less than Opening Reading!", "warn");
    return;
  }

  const btn = document.getElementById("submit-btn");

  const counter      = document.getElementById("counter-select")?.value?.trim();
  const issueReceive = document.getElementById("issue-receive-select")?.value || "ISSUE";
  const paperRecieved= document.getElementById("paper-recieved")?.value?.trim() || "0";
  const paperIssued  = document.getElementById("paper-issued")?.value?.trim() || "0";
  const opening      = document.getElementById("opening-reading")?.value?.trim() || "0";
  const closing      = document.getElementById("closing-reading")?.value?.trim() || "0";
  const balance      = document.getElementById("paper-balance")?.value?.trim() || "0";
  const remark       = document.getElementById("remark")?.value?.trim() || "";

  if (!counter) {
    showToast("Please select Counter Number.", "warn");
    return;
  }
  if (!closing) {
    showToast("Please enter Closing Reading.", "warn");
    return;
  }

  // ── Hardened numeric input validation ──
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };
  const openingNum  = num(opening);
  const closingNum  = num(closing);
  const receivedNum = num(paperRecieved);
  const issuedNum   = num(paperIssued);

  if ([openingNum, closingNum, receivedNum, issuedNum].some((n) => Number.isNaN(n))) {
    showToast("⚠️ Readings must be valid, non-negative numbers.", "warn");
    return;
  }

  // Date Calculation: SuperAdmin Custom Date OR Real-Time Today Date
  const now = new Date();
  const timestamp = now.toLocaleString("en-IN");
  const email = currentUser?.email || "";
  
  let currentDate = "";
  const customDateVal = document.getElementById("entry-date-input")?.value;
  const userEmail = (currentUser?.email || "").toLowerCase().trim();

  if (isSuperAdmin(userEmail) && customDateVal && customDateVal.includes("-")) {
    const parts = customDateVal.split("-");
    if (parts.length === 3) {
      // Convert YYYY-MM-DD to DD/MM/YYYY
      currentDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  if (!currentDate) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    // Date format: DD/MM/YYYY (Column C in Form responses 1)
    currentDate = `${dd}/${mm}/${yyyy}`;
  }

  // Column Mapping A to K (single source of truth: SHEET_SCHEMA.daily)
  const row = buildDailyRow({
    timestamp,
    email,
    date: currentDate,
    counter,
    received: paperRecieved,
    issued: paperIssued,
    type: issueReceive,
    balance,
    remark,
    opening,
    closing
  });

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Saving...`;

  try {
    if (!navigator.onLine && typeof saveOfflineEntry === "function") {
      // Offline Save Mode via IndexedDB
      await saveOfflineEntry(row);
      showToast("📴 Saved offline! Will sync automatically when connected.", "warn");
    } else {
      // Online Push Mode
      await appendDailyEntry(row);
      showToast("✅ Entry saved to Google Sheets!", "success");
    }

    document.getElementById("entry-form").reset();
    toggleIssueReceiveFields();
    await loadHistory();

  } catch (err) {
    // If online push fails, fallback to IndexedDB
    if (typeof saveOfflineEntry === "function") {
      await saveOfflineEntry(row);
      showToast("📴 Network error. Entry saved locally in IndexedDB.", "warn");
    } else {
      showToast("❌ Failed: " + err.message, "error");
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Save Entry`;
  }
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  try {
    showLoader(true);
    const auth = await requireAuth();
    if (!auth) {
      // Not authenticated: requireAuth() has already triggered the navigation to index.html
      return;
    }
    currentUser = auth.user;
    // Preload live granular admin permissions from Neon DB
    if (typeof loadAdminPermissionsMatrix === "function") {
      await loadAdminPermissionsMatrix();
    }
    populateHeader(currentUser);
    initHospitalState();

    // Init push notifications (subscribe + show SuperAdmin panel if applicable)
    if (typeof initNotifications === "function") {
      initNotifications().catch(e => console.warn("[Notifications] init error:", e.message));
    }

    await loadPrinterDropdowns();
    try {
      const stockData = await fetchStockEntries();
      allStockRows = (stockData && stockData.rows) ? stockData.rows : [];
    } catch (e) {
      console.warn("Stock preload:", e.message);
    }
    await loadHistory();
    setDefaultDate();
    toggleIssueReceiveFields();
    showLoader(false);

    // Respect URL hash routing (e.g. #employees, #printers, #stock, #history, #entry)
    const initialHash = window.location.hash.replace("#", "").trim();
    if (initialHash && document.getElementById("tab-" + initialHash)) {
      showTab(initialHash);
      if (initialHash === "employees" && typeof loadEmployeesPage === "function") loadEmployeesPage();
      if (initialHash === "printers" && typeof loadPrintersPage === "function") loadPrintersPage();
      if (initialHash === "stock" && typeof loadStockPage === "function") loadStockPage();
      if (initialHash === "history" && typeof loadHistory === "function") loadHistory();
    } else {
      // Default to Landing Dashboard
      showTab("dashboard");
    }
  } catch (err) {
    console.error("[App Boot] Fatal error during app startup:", err);
    showToast("Application initialization failed. Please refresh.", "error");
    showLoader(false);
  }
});

// ── DEDICATED PRINTERS DIRECTORY PAGE ──────────────────────
let activePrinterHospitalFilter = "ALL";

async function loadPrintersPage() {
  if (!allPrinterItems || !allPrinterItems.length) {
    await loadPrinterDropdowns();
  }
  renderPrintersList();
}

function filterPrintersByHospital(hospital, btnEl) {
  activePrinterHospitalFilter = hospital;
  document.querySelectorAll("#printer-hospital-pills .pill-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  renderPrintersList();
}

function filterPrintersList() {
  renderPrintersList();
}

let printersViewMode = "cards"; // "cards" or "table"

function setPrintersViewMode(mode) {
  printersViewMode = mode;
  const btnCards = document.getElementById("btn-printers-cards");
  const btnTable = document.getElementById("btn-printers-table");
  const cardsGrid = document.getElementById("printers-cards-grid");
  const tableWrapper = document.getElementById("printers-table-wrapper");

  if (btnCards && btnTable) {
    btnCards.classList.toggle("active", mode === "cards");
    btnTable.classList.toggle("active", mode === "table");
  }

  if (cardsGrid && tableWrapper) {
    cardsGrid.style.display = mode === "cards" ? "grid" : "none";
    tableWrapper.style.display = mode === "table" ? "block" : "none";
  }

  renderPrintersList();
}

function renderPrintersList() {
  const container = document.getElementById("printers-cards-grid");
  const tableWrapper = document.getElementById("printers-table-wrapper");
  const tableBody = document.getElementById("printers-table-body");
  const noPrinters = document.getElementById("no-printers");
  const countBadge = document.getElementById("printers-count-badge");
  const searchVal = document.getElementById("printer-search-input")?.value?.toLowerCase().trim() || "";

  if (!container) return;

  const filtered = allPrinterItems.filter(p => {
    // 1. Hospital view access restriction
    if (!isHospitalVisible(p.hospital)) return false;
    // 2. Tab hospital pill filter
    if (activePrinterHospitalFilter !== "ALL" && !p.hospital.includes(activePrinterHospitalFilter)) return false;
    // 3. Search query filter
    const str = `${p.counterNo} ${p.serialNo} ${p.counterName} ${p.hospital}`.toLowerCase();
    return !searchVal || str.includes(searchVal);
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} Printer${filtered.length === 1 ? '' : 's'}`;
  }

  if (!filtered.length) {
    container.innerHTML = "";
    if (tableBody) tableBody.innerHTML = "";
    if (noPrinters) noPrinters.style.display = "block";
    return;
  }

  if (noPrinters) noPrinters.style.display = "none";

  // Pre-calculate latest activity for all filtered items
  const enrichedList = filtered.map(p => {
    const history = allDailyRows.filter(r => {
      const c = r["counter Number"] || r["Counter Number"] || r["Counter"] || "";
      return isExactCounterMatch(c, p.counterNo, p.serialNo);
    });
    const latest = history.length > 0 ? history[0] : null;
    const latestClosing = latest ? (latest["Closing Reading"] || "0") : "N/A";
    const latestDate = latest ? (latest["Date"] || "") : "No entries";
    return { ...p, latestClosing, latestDate, historyCount: history.length };
  });

  // Render Cards View
  container.innerHTML = enrichedList.map(p => `
    <div class="printer-card-item" onclick="openPrinterDetailModal('${escapeHtml(p.counterNo)}', '${escapeHtml(p.serialNo)}', '${escapeHtml(p.counterName)}', '${escapeHtml(p.hospital)}')">
      <div>
        <div class="printer-card-header">
          <span class="printer-card-counter">${escapeHtml(p.counterNo)}</span>
          <div class="printer-card-actions">
            <span class="badge" style="background:rgba(59,130,246,0.1); color:#1d4ed8;">${escapeHtml(p.hospital)}</span>
            <button type="button" class="printer-card-copy-btn" title="Copy Printer Details" onclick="copyPrinterDetails(event, '${escapeHtml(p.counterNo)}', '${escapeHtml(p.serialNo)}', '${escapeHtml(p.counterName)}', '${escapeHtml(p.hospital)}', '${escapeHtml(String(p.latestClosing))}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button type="button" class="printer-card-arrow-btn" title="Open Printer Details &amp; History" onclick="openPrinterDetailModal('${escapeHtml(p.counterNo)}', '${escapeHtml(p.serialNo)}', '${escapeHtml(p.counterName)}', '${escapeHtml(p.hospital)}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </button>
          </div>
        </div>
        <div class="printer-card-serial">${escapeHtml(p.serialNo || "No Serial")}</div>
        <div class="printer-card-name">${escapeHtml(p.counterName || "General Counter")}</div>
      </div>

      <div class="printer-card-footer">
        <span>Reading: <strong>${escapeHtml(String(p.latestClosing))}</strong></span>
        <span>${escapeHtml(p.latestDate)}</span>
      </div>
    </div>
  `).join("");

  // Render Table View
  if (tableBody) {
    tableBody.innerHTML = enrichedList.map((p, idx) => `
      <tr style="cursor:pointer;" onclick="openPrinterDetailModal('${escapeHtml(p.counterNo)}', '${escapeHtml(p.serialNo)}', '${escapeHtml(p.counterName)}', '${escapeHtml(p.hospital)}')">
        <td style="color:var(--text-muted); font-weight:700;">${idx + 1}</td>
        <td><strong style="color:var(--text);">${escapeHtml(p.counterNo)}</strong></td>
        <td><span class="badge" style="background:rgba(59,130,246,0.1); color:#1d4ed8;">${escapeHtml(p.hospital)}</span></td>
        <td><code style="font-family:monospace; color:var(--primary-dark); font-weight:700;">${escapeHtml(p.serialNo || "N/A")}</code></td>
        <td style="color:var(--text-muted);">${escapeHtml(p.counterName || "General Counter")}</td>
        <td><strong>${escapeHtml(String(p.latestClosing))}</strong></td>
        <td style="color:var(--text-muted);">${escapeHtml(p.latestDate)}</td>
        <td style="text-align:center;" onclick="event.stopPropagation();">
          <div style="display:inline-flex; gap:4px;">
            <button type="button" class="printer-card-copy-btn" title="Copy Details" onclick="copyPrinterDetails(event, '${escapeHtml(p.counterNo)}', '${escapeHtml(p.serialNo)}', '${escapeHtml(p.counterName)}', '${escapeHtml(p.hospital)}', '${escapeHtml(String(p.latestClosing))}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button type="button" class="printer-card-arrow-btn" title="View Details" onclick="openPrinterDetailModal('${escapeHtml(p.counterNo)}', '${escapeHtml(p.serialNo)}', '${escapeHtml(p.counterName)}', '${escapeHtml(p.hospital)}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }
}

// ── Advance Data Table Actions for Printers ────────────────
async function copyPrintersTableData() {
  const searchVal = document.getElementById("printer-search-input")?.value?.toLowerCase().trim() || "";
  const filtered = allPrinterItems.filter(p => {
    if (!isHospitalVisible(p.hospital)) return false;
    if (activePrinterHospitalFilter !== "ALL" && !p.hospital.includes(activePrinterHospitalFilter)) return false;
    const str = `${p.counterNo} ${p.serialNo} ${p.counterName} ${p.hospital}`.toLowerCase();
    return !searchVal || str.includes(searchVal);
  });

  if (!filtered.length) {
    showToast("No printer data to copy.", "error");
    return;
  }

  let text = `SNMC Printers Directory (${activePrinterHospitalFilter}) — ${filtered.length} Printers\n`;
  text += `Counter\tHospital\tSerial No\tLocation / Counter Name\n`;
  text += `--------------------------------------------------------\n`;
  filtered.forEach(p => {
    text += `${p.counterNo}\t${p.hospital}\t${p.serialNo || 'N/A'}\t${p.counterName || 'General'}\n`;
  });

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    showToast(`📋 Copied ${filtered.length} printer records to clipboard!`, "success");
  } catch (err) {
    showToast("Copy failed: " + err.message, "error");
  }
}

async function sharePrintersData() {
  const searchVal = document.getElementById("printer-search-input")?.value?.toLowerCase().trim() || "";
  const filtered = allPrinterItems.filter(p => {
    if (!isHospitalVisible(p.hospital)) return false;
    if (activePrinterHospitalFilter !== "ALL" && !p.hospital.includes(activePrinterHospitalFilter)) return false;
    const str = `${p.counterNo} ${p.serialNo} ${p.counterName} ${p.hospital}`.toLowerCase();
    return !searchVal || str.includes(searchVal);
  });

  const summary = `🖨️ SNMC Printers Directory Summary\nHospital Filter: ${activePrinterHospitalFilter}\nTotal Printers: ${filtered.length}\nDate: ${new Date().toLocaleDateString('en-IN')}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: "SNMC Printers Directory",
        text: summary,
        url: window.location.href
      });
      showToast("Printers summary shared successfully!", "success");
    } catch (err) {
      if (err.name !== "AbortError") copyPrintersTableData();
    }
  } else {
    copyPrintersTableData();
  }
}

function exportPrintersToExcel() {
  const user = currentUser || getStoredUser() || {};
  const isSuper = typeof isSuperAdmin === "function" && isSuperAdmin(user.email || "");
  const isDirect = typeof isDirector === "function" && isDirector(user.email || "");
  const userIsAdmin = !isSuper && !isDirect && (String(user.role || "").toLowerCase() === "admin");
  if (userIsAdmin && activeAdminPermissions && !activeAdminPermissions.can_export_excel) {
    showToast("🚫 Permission Denied: Admin role is not permitted to export Excel data.", "error");
    return;
  }

  if (typeof XLSX === "undefined") {
    showToast("Excel export library loading... please retry", "error");
    return;
  }
  const searchVal = document.getElementById("printer-search-input")?.value?.toLowerCase().trim() || "";
  const filtered = allPrinterItems.filter(p => {
    if (!isHospitalVisible(p.hospital)) return false;
    if (activePrinterHospitalFilter !== "ALL" && !p.hospital.includes(activePrinterHospitalFilter)) return false;
    const str = `${p.counterNo} ${p.serialNo} ${p.counterName} ${p.hospital}`.toLowerCase();
    return !searchVal || str.includes(searchVal);
  });

  if (!filtered.length) {
    showToast("No data available to export.", "error");
    return;
  }

  const exportData = filtered.map((p, i) => ({
    "S.No": i + 1,
    "Counter No": p.counterNo,
    "Hospital": p.hospital,
    "Serial Number": p.serialNo || "N/A",
    "Counter Location": p.counterName || "General Counter"
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Printers");
  const fileName = `SNMC_Printers_${activePrinterHospitalFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  showToast(`📊 Exported ${filtered.length} printers to Excel!`, "success");
}

// ── Copy Printer Details Function ──────────────────────────
async function copyPrinterDetails(event, counterNo, serialNo, counterName, hospital, latestReading) {
  if (event) event.stopPropagation();

  const detailsText = [
    `🏥 Hospital: ${hospital}`,
    `📍 Counter: ${counterNo} (${counterName || 'General'})`,
    `🔢 Serial No: ${serialNo || 'N/A'}`,
    `📊 Latest Reading: ${latestReading || 'N/A'}`
  ].join("\n");

  const btn = event ? event.currentTarget : null;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(detailsText);
    } else {
      // Fallback for older browsers or non-HTTPS
      const textarea = document.createElement("textarea");
      textarea.value = detailsText;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    showToast(`📋 Copied: ${counterNo} details copied to clipboard!`, "success");

    if (btn) {
      btn.classList.add("copied");
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      }, 1800);
    }
  } catch (err) {
    showToast("Failed to copy printer details: " + err.message, "error");
  }
}

function openPrinterDetailModal(counterNo, serialNo, counterName, hospital) {
  const modal = document.getElementById("printer-detail-modal");
  const titleEl = document.getElementById("pmodal-counter-title");
  const subEl = document.getElementById("pmodal-serial-sub");
  const statsEl = document.getElementById("pmodal-stats");
  const listEl = document.getElementById("pmodal-history-list");

  if (modal) modal.style.display = "flex";
  if (titleEl) titleEl.textContent = `${counterNo} — ${counterName || 'Counter'}`;
  if (subEl) subEl.textContent = `Serial: ${serialNo || 'N/A'} • Hospital: ${hospital}`;

  // Calculate statistics from allDailyRows using exact matching
  const history = allDailyRows.filter(r => {
    const c = r["counter Number"] || r["Counter Number"] || r["Counter"] || "";
    return isExactCounterMatch(c, counterNo, serialNo);
  });

  let totalIssued = 0;
  let totalReceived = 0;
  let latestReading = "0";

  history.forEach(r => {
    totalIssued += parseFloat(r["Paper Issued"] || 0) || 0;
    totalReceived += parseFloat(r["Paper Recieved"] || 0) || 0;
  });

  if (history.length > 0) {
    latestReading = history[0]["Closing Reading"] || "0";
  }

  if (statsEl) {
    statsEl.innerHTML = `
      <div class="pstat-box">
        <div class="lbl">Latest Reading</div>
        <div class="val" style="color:var(--primary);">${escapeHtml(String(latestReading))}</div>
      </div>
      <div class="pstat-box">
        <div class="lbl">Total Issued</div>
        <div class="val" style="color:#059669;">${totalIssued.toLocaleString("en-IN")}</div>
      </div>
      <div class="pstat-box">
        <div class="lbl">Total Entries</div>
        <div class="val">${history.length}</div>
      </div>
    `;
  }

  if (listEl) {
    if (!history.length) {
      listEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">No historical records for this printer.</div>`;
    } else {
      listEl.innerHTML = history.map(r => {
        const typeStr = r["ISSUE / RECEIVE "] || r["ISSUE / RECEIVE"] || "ISSUE";
        const typeClass = getBadgeClass(typeStr);
        return `
          <div class="picker-option-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="font-size:0.82rem;">📅 ${escapeHtml(r["Date"] || "")}</strong>
              <span class="badge ${typeClass}">
                ${escapeHtml(typeStr)}
              </span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:4px; font-size:0.75rem; margin-top:4px;">
              <span>Open: <strong>${escapeHtml(r["Opening reading"] || "0")}</strong></span>
              <span>Close: <strong>${escapeHtml(r["Closing Reading"] || "0")}</strong></span>
              <span>Issued: <strong>${escapeHtml(r["Paper Issued"] || "0")}</strong></span>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

function togglePrinterModalExpand() {
  const card = document.getElementById("printer-detail-modal-card");
  const expandIcon = document.getElementById("expand-icon");
  const collapseIcon = document.getElementById("collapse-icon");
  const expandBtn = document.getElementById("modal-expand-btn");

  if (!card) return;
  const isExpanded = card.classList.toggle("expanded");

  if (expandIcon) expandIcon.style.display = isExpanded ? "none" : "block";
  if (collapseIcon) collapseIcon.style.display = isExpanded ? "block" : "none";
  if (expandBtn) expandBtn.title = isExpanded ? "Collapse View" : "Expand View";
}

function closePrinterDetailModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains("modal-close-btn")) return;
  const modal = document.getElementById("printer-detail-modal");
  const card = document.getElementById("printer-detail-modal-card");
  const expandIcon = document.getElementById("expand-icon");
  const collapseIcon = document.getElementById("collapse-icon");

  if (modal) modal.style.display = "none";
  if (card) card.classList.remove("expanded");
  if (expandIcon) expandIcon.style.display = "block";
  if (collapseIcon) collapseIcon.style.display = "none";
}

// ── DEDICATED STOCK (RECEIVED PAPER) PAGE ──────────────────
let activeStockHospitalFilter = "ALL";

async function loadStockPage() {
  try {
    const data = await fetchStockEntries();
    allStockRows = data.rows || [];
    renderStockList();
  } catch (err) {
    showToast("Stock load failed: " + err.message, "error");
  }
}

function filterStockByHospital(hospital, btnEl) {
  activeStockHospitalFilter = hospital;
  document.querySelectorAll("#stock-hospital-pills .pill-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  renderStockList();
}

function filterStockList() {
  renderStockList();
}

function renderStockList() {
  const container = document.getElementById("stock-cards-container");
  const noStock = document.getElementById("no-stock");
  const totalRimsEl = document.getElementById("stock-total-rims");
  const totalSheetsEl = document.getElementById("stock-total-sheets");
  const searchVal = document.getElementById("stock-search-input")?.value?.toLowerCase().trim() || "";
  const dateVal = document.getElementById("stock-date-filter")?.value || "";

  let targetDateFormatted = "";
  if (dateVal && dateVal.includes("-")) {
    const parts = dateVal.split("-");
    if (parts.length === 3) targetDateFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  if (!container) return;

  const filtered = allStockRows.filter(r => {
    const hosp = (r["HOSPITAL"] || "").toUpperCase();
    if (!isHospitalVisible(hosp)) return false;
    if (activeStockHospitalFilter !== "ALL" && !hosp.includes(activeStockHospitalFilter)) return false;

    const rowStr = Object.values(r).join(" ").toLowerCase();
    const matchesSearch = !searchVal || rowStr.includes(searchVal);
    const rowDate = String(r["Date"] || "");
    const matchesDate = !dateVal || rowDate.includes(dateVal) || (targetDateFormatted && rowDate.includes(targetDateFormatted));
    return matchesSearch && matchesDate;
  });

  // Calculate totals
  let totalRims = 0;
  let totalSheets = 0;
  filtered.forEach(r => {
    const rims = parseFloat(r["Qualtity"] || r["Quantity"] || 0) || 0;
    const sheets = parseFloat(r["PAPER Quantity"] || 0) || (rims * 500);
    totalRims += rims;
    totalSheets += sheets;
  });

  if (totalRimsEl) totalRimsEl.textContent = totalRims.toLocaleString("en-IN");
  if (totalSheetsEl) totalSheetsEl.textContent = totalSheets.toLocaleString("en-IN");

  if (!filtered.length) {
    container.innerHTML = "";
    if (noStock) noStock.style.display = "block";
    return;
  }

  if (noStock) noStock.style.display = "none";

  container.innerHTML = filtered.map(r => {
    const date = r["Date"] || "";
    const invoiceNo = r["Invoice No."] || "N/A";
    const desc = r["Description Of Goods"] || "Paper Supply";
    const rims = r["Qualtity"] || "0";
    const sheets = r["PAPER Quantity"] || String(parseFloat(rims) * 500);
    const hosp = r["HOSPITAL"] || "";
    const total = r["TOTAL"] || r["Amount"] || "";

    return `
      <div class="history-card-item">
        <div class="history-card-header">
          <div>
            <div class="history-card-title">${escapeHtml(invoiceNo)}</div>
            <div class="history-card-date">📅 ${escapeHtml(date)} • ${escapeHtml(desc)}</div>
          </div>
          <span class="badge" style="background:rgba(16,185,129,0.1); color:#059669; border:1px solid rgba(16,185,129,0.25);">
            ${escapeHtml(hosp || "GENERAL")}
          </span>
        </div>

        <div class="history-card-grid">
          <div class="history-card-stat">
            <span class="stat-label">Rim Quantity (Col E)</span>
            <span class="stat-val highlight">${escapeHtml(String(rims))} Rims</span>
          </div>
          <div class="history-card-stat">
            <span class="stat-label">Paper Sheets (Col M)</span>
            <span class="stat-val" style="color:#059669;">${parseFloat(sheets).toLocaleString("en-IN")} Pgs</span>
          </div>
          <div class="history-card-stat">
            <span class="stat-label">Invoice Amount</span>
            <span class="stat-val">₹${escapeHtml(String(total))}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function exportStockToExcel() {
  const user = currentUser || getStoredUser() || {};
  const isSuper = typeof isSuperAdmin === "function" && isSuperAdmin(user.email || "");
  const isDirect = typeof isDirector === "function" && isDirector(user.email || "");
  const userIsAdmin = !isSuper && !isDirect && (String(user.role || "").toLowerCase() === "admin");
  if (userIsAdmin && activeAdminPermissions && !activeAdminPermissions.can_export_excel) {
    showToast("🚫 Permission Denied: Admin role is not permitted to export Excel data.", "error");
    return;
  }

  if (!allStockRows.length) {
    showToast("No stock data to export.", "warn");
    return;
  }
  try {
    const worksheet = XLSX.utils.json_to_sheet(allStockRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Received_Paper_Stock");
    XLSX.writeFile(workbook, `PrintTrack_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("📊 Stock Exported to Excel!", "success");
  } catch (e) {
    showToast("Export failed: " + e.message, "error");
  }
}


// ── Header & User Dropdown Info ───────────────────────────
function populateHeader(user) {
  const photoEl     = document.getElementById("user-photo");
  const initEl      = document.getElementById("user-initials");
  const dropPhotoEl = document.getElementById("drop-user-photo");
  const dropInitEl  = document.getElementById("drop-user-initials");
  const dropNameEl  = document.getElementById("drop-user-name");
  const dropEmailEl = document.getElementById("drop-user-email");
  const dashNameEl  = document.getElementById("dash-greeting-name");

  const initial = (user.name || user.email || "U").charAt(0).toUpperCase();

  if (dropNameEl)  dropNameEl.textContent  = user.name || "User";
  if (dropEmailEl) dropEmailEl.textContent = user.email || "";
  const isSuper = isSuperAdmin(user.email || "") || user.isSuperAdmin === true;
  const isDirect = (typeof isDirector === "function" && isDirector(user.email || "")) || user.isDirector === true || String(user.role || "").toLowerCase() === "director";
  const userRole = (user.role || (isSuper ? "SuperAdmin" : (isDirect ? "Director" : "Operator"))).toUpperCase();

  const badgeEl = document.getElementById("superadmin-badge");
  if (badgeEl) {
    badgeEl.style.display = "inline-flex";
    if (isSuper) {
      badgeEl.textContent = "⚡ SUPERADMIN";
      badgeEl.style.background = "linear-gradient(135deg, #7c3aed, #ec4899)";
    } else if (isDirect) {
      badgeEl.textContent = "👑 DIRECTOR";
      badgeEl.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
    } else {
      badgeEl.textContent = `👤 ${userRole}`;
      badgeEl.style.background = "#0284c7";
    }
  }

  // Guard Broadcast Push & Admin Center Nav buttons
  const pushNavBtn = document.getElementById("nav-notif-dropdown");
  const adminNavBtn = document.getElementById("nav-admin-center-dropdown");
  const userIsAdmin = !isSuper && !isDirect && (String(user.role || "").toLowerCase() === "admin");
  const canBroadcast = isSuper || (userIsAdmin && activeAdminPermissions.can_send_broadcast);
  if (pushNavBtn) pushNavBtn.style.display = canBroadcast ? "flex" : "none";
  if (adminNavBtn) adminNavBtn.style.display = isSuper ? "flex" : "none";

  // Guard Excel Export Buttons across UI
  applyExcelExportPermissions();

  if (user.photo) {
    if (photoEl) { photoEl.src = user.photo; photoEl.style.display = "block"; }
    if (initEl)  { initEl.style.display = "none"; }
    if (dropPhotoEl) { dropPhotoEl.src = user.photo; dropPhotoEl.style.display = "block"; }
    if (dropInitEl)  { dropInitEl.style.display = "none"; }
  } else {
    if (initEl)     initEl.textContent     = initial;
    if (dropInitEl) dropInitEl.textContent = initial;
  }
}





function showTab(tab) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  const panel = document.getElementById("tab-" + tab);
  const navBtn = document.getElementById("nav-" + tab);
  if (panel)  panel.classList.add("active");
  if (navBtn) navBtn.classList.add("active");
}

function showToast(message, type = "info") {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showLoader(visible) {
  const el = document.getElementById("app-loader");
  if (el) el.style.display = visible ? "flex" : "none";
}

// ── EMPLOYEE / CONTACT DIRECTORY & DIGITAL ID CARD (ADMIN MODULE) ──
let allEmployeeItems = [];
let activeEmployeeHospitalFilter = "ALL";
let isEmployeesLoading = false;

async function loadEmployeesPage() {
  const countBadge = document.getElementById("employees-count-badge");
  const addBtn = document.getElementById("add-employee-top-btn");
  if (countBadge) countBadge.textContent = "Connecting to Google Sheet...";

  // SuperAdmin role visibility toggle for add button
  const userIsSuper = typeof isSuperAdmin === "function" && isSuperAdmin(currentUser?.email || "");
  if (addBtn) {
    addBtn.style.display = userIsSuper ? "inline-flex" : "none";
  }

  try {
    isEmployeesLoading = true;
    const res = await sheetsRequest("getEmployees");
    if (res && res.employees) {
      allEmployeeItems = res.employees;
    } else {
      allEmployeeItems = [];
    }
  } catch (err) {
    allEmployeeItems = [];
    showToast("⚠️ Could not load team list: " + err.message, "error");
  } finally {
    isEmployeesLoading = false;
    renderEmployeesList();
  }
}

function filterEmployeesByHospital(hosp, btnEl) {
  activeEmployeeHospitalFilter = hosp;
  document.querySelectorAll("#employee-hospital-pills .pill-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  renderEmployeesList();
}

function filterEmployeesList() {
  renderEmployeesList();
}

function renderEmployeesList() {
  const container = document.getElementById("employees-cards-grid");
  const noEmp = document.getElementById("no-employees");
  const countBadge = document.getElementById("employees-count-badge");
  const addBtn = document.getElementById("add-employee-top-btn");
  const searchVal = document.getElementById("employee-search-input")?.value?.toLowerCase().trim() || "";
  const userIsSuper = typeof isSuperAdmin === "function" && isSuperAdmin(currentUser?.email || "");
  const userIsAdmin = (currentUser && String(currentUser.role || "").toLowerCase() === "admin");
  const canManageStaff = userIsSuper || (userIsAdmin && activeAdminPermissions.can_manage_employees);
  const canDeleteStaff = userIsSuper || (userIsAdmin && activeAdminPermissions.can_delete_employees);

  if (addBtn) {
    addBtn.style.display = canManageStaff ? "inline-flex" : "none";
  }

  if (!container) return;

  const filtered = allEmployeeItems.filter(e => {
    const hosp = String(e.hospital || "").toUpperCase();
    if (typeof isHospitalVisible === "function" && !isHospitalVisible(hosp)) return false;
    if (activeEmployeeHospitalFilter !== "ALL" && hosp !== "ALL" && !hosp.includes(activeEmployeeHospitalFilter)) return false;
    const str = `${e.name || ''} ${e.email || ''} ${e.phone || ''} ${e.hospital || ''} ${e.role || ''} ${e.id || ''} ${e.memberType || ''}`.toLowerCase();
    return !searchVal || str.includes(searchVal);
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} Member${filtered.length === 1 ? '' : 's'}`;
  }

  if (!filtered.length) {
    container.innerHTML = "";
    if (noEmp) {
      noEmp.style.display = "block";
      noEmp.innerHTML = isEmployeesLoading 
        ? `<div style="font-size:2rem; margin-bottom:8px;"><span class="spinner"></span></div><p>Loading members from Google Sheet (user_hospitals)...</p>`
        : `<div style="font-size:2rem; margin-bottom:8px;">👥</div><p>No team members found in user_hospitals tab.</p>`;
    }
    return;
  }

  if (noEmp) noEmp.style.display = "none";

  container.innerHTML = filtered.map(emp => {
    const rawName = emp.name || emp.email || "Employee";
    const initials = rawName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
    const isLoginBlocked = (emp.loginAllowed === "NO" || emp.loginAllowed === false);

    return `
      <div class="employee-card-item" data-id="${escapeHtml(emp.id)}">
        <div>
          <div class="emp-card-header">
            <div class="emp-avatar-circle">${escapeHtml(initials)}</div>
            <div class="emp-name-block">
              <div class="emp-full-name" title="${escapeHtml(emp.name)}">${escapeHtml(emp.name)}</div>
              <div class="emp-role-tag">${escapeHtml(emp.role)} • <span class="badge" style="background:rgba(59,130,246,0.1); color:#1d4ed8;">${escapeHtml(emp.hospital)}</span></div>
            </div>
          </div>

          <div class="emp-details-grid">
            <div class="emp-detail-row"><span>📧 Email:</span> <strong style="color:var(--text); word-break:break-all;">${escapeHtml(emp.email)}</strong></div>
            <div class="emp-detail-row"><span>📞 Phone:</span> <strong style="color:var(--text);">${escapeHtml(emp.phone || '+91 94140 XXXXX')}</strong></div>
            <div class="emp-detail-row"><span>🆔 Access:</span> <span><span class="badge" style="background:#f1f5f9; color:#475569;">${escapeHtml(emp.memberType || 'Staff')}</span> <span class="badge" style="${isLoginBlocked ? 'background:rgba(239,68,68,0.1); color:#dc2626;' : 'background:rgba(16,185,129,0.1); color:#059669; font-weight:700;'}">${escapeHtml(emp.accessReason || (isLoginBlocked ? '🔴 Access Disabled' : '🟢 Login Active'))}</span></span></div>
          </div>
        </div>

        <div class="emp-card-footer">
          <div class="emp-btn-group-left">
            <button type="button" class="arrow-btn" style="width: auto; padding: 4px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; color: #1e40af; background: rgba(59, 130, 246, 0.1);" onclick="openEmployeeIdCardById('${escapeHtml(emp.id)}')">
              🪪 View ID Card
            </button>
            <button type="button" class="printer-card-copy-btn" title="Copy Contact" onclick="copyContactDetails(event, '${escapeHtml(emp.name)}', '${escapeHtml(emp.phone)}', '${escapeHtml(emp.email)}', '${escapeHtml(emp.hospital)}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>

          <div class="emp-btn-group-right">
            ${userIsSuper ? `
            <button type="button" class="arrow-btn" style="width: auto; padding: 4px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; color: #15803d; background: rgba(22, 163, 74, 0.1);" title="Reset Password" onclick="openAdminResetPwdModal('${escapeHtml(emp.name)}', '${escapeHtml(emp.email)}', '${escapeHtml(emp.phone)}')">
              🔑
            </button>
            ` : ''}

            ${canManageStaff ? `
            <button type="button" class="arrow-btn" style="width: auto; padding: 4px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; color: #0284c7; background: rgba(2, 132, 199, 0.1);" title="Edit Member" onclick="openEditEmployeeModalById('${escapeHtml(emp.id)}')">
              ✏️
            </button>
            ` : ''}

            ${canDeleteStaff ? `
            <button type="button" class="arrow-btn" style="width: auto; padding: 4px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; color: #dc2626; background: rgba(239, 68, 68, 0.1);" title="Delete Member" onclick="handleDeleteEmployee('${escapeHtml(emp.id)}', '${escapeHtml(emp.email)}', ${emp.rowIndex || 0})">
              🗑️
            </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ── Open Digital ID Card Offcanvas Drawer ──
let activeIdCardEmployee = null;

function openEmployeeIdCardById(empId) {
  const emp = allEmployeeItems.find(e => e.id === empId);
  if (!emp) return;
  activeIdCardEmployee = emp;
  openIdCardOffcanvas(emp);
}

function openIdCardOffcanvas(empOrName, email, phone, hospital, role, id, memberType, loginAllowed, photoUrl) {
  const offcanvas = document.getElementById("id-card-offcanvas");
  const nameEl = document.getElementById("idc-name");
  const phoneEl = document.getElementById("idc-phone");
  const hospEl = document.getElementById("idc-hospital");
  const roleEl = document.getElementById("idc-role");
  const idEl = document.getElementById("idc-id");
  const avatarEl = document.getElementById("idc-avatar");
  const photoImg = document.getElementById("idc-photo-img");

  let emp = {};
  if (empOrName && typeof empOrName === "object") {
    emp = empOrName;
  } else {
    emp = { name: empOrName, email, phone, hospital, role, id, memberType, loginAllowed, photoUrl };
  }

  // Derive dynamic real display name (fallback to email prefix if name is empty)
  const realName = (emp.name && emp.name.trim()) 
    ? emp.name.trim() 
    : (emp.email ? emp.email.split("@")[0].replace(/[._]/g, " ") : "EMPLOYEE");

  const realRole = (emp.role && emp.role.trim()) ? emp.role.trim() : "OPERATOR";
  const realPhone = (emp.phone && emp.phone.trim()) ? emp.phone.trim() : "—";

  // Derive Office value: if mapped to SNMC or hospital, format as "Reporting Office Hospital"
  let rawHosp = (emp.hospital && emp.hospital.trim()) ? emp.hospital.trim().toUpperCase() : "MDM";
  let realOffice = rawHosp;
  if (rawHosp === "MDM" || rawHosp === "MGH" || rawHosp === "UMMED" || rawHosp === "UMAID" || rawHosp === "SNMC") {
    if (!rawHosp.includes("HOSPITAL")) {
      realOffice = `${rawHosp} Hospital`;
    }
  } else if (!realOffice.toLowerCase().includes("hospital") && !realOffice.toLowerCase().includes("office") && realOffice !== "ALL") {
    realOffice = `${realOffice} Hospital`;
  }

  // Generate dynamic clean Employee ID (e.g. SMSPL20240101)
  let numericPart = String(emp.id || "").replace(/[^0-9]/g, "");
  if (!numericPart || numericPart === "0") {
    numericPart = "101";
  }
  const empId = `SMSPL2024${numericPart.padStart(4, "0")}`;

  if (offcanvas) offcanvas.style.display = "flex";
  if (nameEl) nameEl.textContent = realName.toUpperCase();
  if (phoneEl) phoneEl.textContent = realPhone;
  if (hospEl) hospEl.textContent = realOffice;
  if (roleEl) roleEl.textContent = realRole.toUpperCase();
  if (idEl) idEl.textContent = empId;

  const initials = realName.split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "EM";
  if (avatarEl) avatarEl.textContent = initials;

  if (photoUrl && photoUrl.trim() !== "") {
    if (photoImg) {
      photoImg.src = photoUrl.trim();
      photoImg.style.display = "block";
    }
    if (avatarEl) avatarEl.style.display = "none";
  } else {
    if (photoImg) photoImg.style.display = "none";
    if (avatarEl) avatarEl.style.display = "flex";
  }
}

function closeIdCardOffcanvas(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains("modal-close-btn")) return;
  const offcanvas = document.getElementById("id-card-offcanvas");
  if (offcanvas) offcanvas.style.display = "none";
}

// ── Photo Upload to Google Drive via Client Compression ──────
function triggerPhotoUpload() {
  const fileInp = document.getElementById("id-card-photo-file");
  if (fileInp) {
    fileInp.value = "";
    fileInp.click();
  }
}

async function handlePhotoFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!activeIdCardEmployee) {
    showToast("Please select an employee card first.", "warn");
    return;
  }

  showToast("📷 Optimizing and uploading photo to Google Drive...", "info");

  try {
    // 1. Client-Side Image Compression using Canvas (max 800x800)
    const base64Data = await compressImageToJpeg(file, 800, 0.85);

    // 2. Call uploadEmployeePhoto endpoint
    const res = await sheetsRequest("uploadEmployeePhoto", {
      method: "POST",
      body: JSON.stringify({
        email: activeIdCardEmployee.email,
        base64Data: base64Data,
        mimeType: "image/jpeg"
      })
    });

    if (res && res.photoUrl) {
      activeIdCardEmployee.photoUrl = res.photoUrl;

      // Update in allEmployeeItems
      const idx = allEmployeeItems.findIndex(emp => emp.email.toLowerCase() === activeIdCardEmployee.email.toLowerCase());
      if (idx !== -1) {
        allEmployeeItems[idx].photoUrl = res.photoUrl;
      }

      // Update Live UI
      const photoImg = document.getElementById("idc-photo-img");
      const avatarEl = document.getElementById("idc-avatar");
      if (photoImg) {
        photoImg.src = res.photoUrl;
        photoImg.style.display = "block";
      }
      if (avatarEl) avatarEl.style.display = "none";

      showToast("✅ Profile photo uploaded to Google Drive & ID card updated!", "success");
    }
  } catch (err) {
    showToast("Photo upload failed: " + err.message, "error");
  }
}

function compressImageToJpeg(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function printIdCard() {
  window.print();
}

// ── Add/Edit Employee Modal & Live 2-Way Google Sheet Sync ──
function openAddEmployeeModal() {
  const modal = document.getElementById("add-employee-modal");
  const form = document.getElementById("add-employee-form");
  const titleEl = document.getElementById("add-emp-modal-title");
  const subEl = document.getElementById("add-emp-modal-sub");
  const modeInput = document.getElementById("emp-mode-input");
  const rowIdxInput = document.getElementById("emp-rowindex-input");
  const origEmailInput = document.getElementById("emp-orig-email-input");
  const saveBtn = document.getElementById("emp-save-btn");

  if (form) form.reset();
  if (modeInput) modeInput.value = "add";
  if (rowIdxInput) rowIdxInput.value = "";
  if (origEmailInput) origEmailInput.value = "";
  if (titleEl) titleEl.textContent = "Add Team Member";
  if (subEl) subEl.textContent = "Save to user_hospitals directory";
  if (saveBtn) saveBtn.innerHTML = "💾 Save Member";

  if (modal) modal.style.display = "flex";
}

function openEditEmployeeModalById(empId) {
  const emp = allEmployeeItems.find(e => e.id === empId);
  if (!emp) return;

  const modal = document.getElementById("add-employee-modal");
  const titleEl = document.getElementById("add-emp-modal-title");
  const subEl = document.getElementById("add-emp-modal-sub");
  const modeInput = document.getElementById("emp-mode-input");
  const rowIdxInput = document.getElementById("emp-rowindex-input");
  const origEmailInput = document.getElementById("emp-orig-email-input");
  const saveBtn = document.getElementById("emp-save-btn");

  if (modeInput) modeInput.value = "edit";
  if (rowIdxInput) rowIdxInput.value = emp.rowIndex || "";
  if (origEmailInput) origEmailInput.value = emp.email || "";
  if (titleEl) titleEl.textContent = `Edit Member: ${emp.name}`;
  if (subEl) subEl.textContent = `Updating record in user_hospitals`;
  if (saveBtn) saveBtn.innerHTML = "💾 Update Member";

  const nameInp = document.getElementById("emp-name-input");
  const emailInp = document.getElementById("emp-email-input");
  const phoneInp = document.getElementById("emp-phone-input");
  const hospInp = document.getElementById("emp-hospital-input");
  const roleInp = document.getElementById("emp-role-input");
  const catInp = document.getElementById("emp-category-input");
  const loginInp = document.getElementById("emp-login-input");

  if (nameInp) nameInp.value = emp.name || "";
  if (emailInp) emailInp.value = emp.email || "";
  if (phoneInp) phoneInp.value = emp.phone || "";
  if (hospInp) hospInp.value = emp.hospital || "MDM";
  if (roleInp) roleInp.value = emp.role || "Operator";
  if (catInp) catInp.value = emp.memberType || "Both";
  if (loginInp) loginInp.value = (emp.loginAllowed === "NO" || emp.loginAllowed === false) ? "NO" : "YES";

  if (modal) modal.style.display = "flex";
}

function closeAddEmployeeModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains("modal-close-btn") && e.target.tagName !== "BUTTON") return;
  const modal = document.getElementById("add-employee-modal");
  if (modal) modal.style.display = "none";
}

function toggleLoginAccessDefault() {
  const cat = document.getElementById("emp-category-input")?.value;
  const loginSelect = document.getElementById("emp-login-input");
  if (!loginSelect) return;
  if (cat === "Contact" || cat === "Employee") {
    loginSelect.value = "NO";
  } else {
    loginSelect.value = "YES";
  }
}

async function handleSaveEmployee(e) {
  e.preventDefault();
  const mode = document.getElementById("emp-mode-input")?.value || "add";
  const rowIndex = parseInt(document.getElementById("emp-rowindex-input")?.value || "0", 10);
  const originalEmail = document.getElementById("emp-orig-email-input")?.value || "";

  const name = document.getElementById("emp-name-input")?.value?.trim() || "";
  const email = document.getElementById("emp-email-input")?.value?.trim().toLowerCase() || "";
  const phone = document.getElementById("emp-phone-input")?.value?.trim() || "+91 94140 XXXXX";
  const hospital = document.getElementById("emp-hospital-input")?.value || "MDM";
  const role = document.getElementById("emp-role-input")?.value || "Operator";
  const memberType = document.getElementById("emp-category-input")?.value || "Both";
  const loginAllowed = document.getElementById("emp-login-input")?.value || "YES";
  const saveBtn = document.getElementById("emp-save-btn");

  if (!name || !email) {
    showToast("Name and email are required.", "error");
    return;
  }

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="spinner"></span> Syncing with Sheet...`;
    }

    if (mode === "edit") {
      // Live Server-Side Update in user_hospitals Google Sheet Tab
      await sheetsRequest("updateEmployee", {
        method: "POST",
        body: JSON.stringify({ originalEmail, email, hospital, role, memberType, loginAllowed, name, phone, rowIndex })
      });

      const idx = allEmployeeItems.findIndex(item => item.email.toLowerCase() === originalEmail.toLowerCase() || (rowIndex && item.rowIndex === rowIndex));
      if (idx !== -1) {
        allEmployeeItems[idx] = { ...allEmployeeItems[idx], name, email, phone, hospital, role, memberType, loginAllowed };
      }

      showToast(`✅ ${name} updated successfully in user_hospitals!`, "success");
    } else {
      // Live Server-Side Append to user_hospitals Google Sheet Tab
      const res = await sheetsRequest("addEmployee", {
        method: "POST",
        body: JSON.stringify({ email, hospital, role, memberType, loginAllowed, name, phone })
      });

      const newId = `SNMC-EMP-${100 + (allEmployeeItems.length + 1)}`;
      allEmployeeItems.unshift({ id: newId, name, email, phone, hospital, role, memberType, loginAllowed });
      showToast(`✅ ${name} (${email}) added as ${memberType} [Login: ${loginAllowed}]!`, "success");
    }

    closeAddEmployeeModal();
    document.getElementById("add-employee-form")?.reset();
    renderEmployeesList();
  } catch (err) {
    showToast(`Failed to sync with Google Sheet: ${err.message}`, "error");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = mode === "edit" ? `💾 Update Member` : `💾 Save Member`;
    }
  }
}

async function handleDeleteEmployee(empId, email, rowIndex) {
  if (!confirm(`Are you sure you want to remove ${email} from the user_hospitals directory?`)) {
    return;
  }

  try {
    showToast(`Deleting ${email}...`, "info");
    await sheetsRequest("deleteEmployee", {
      method: "POST",
      body: JSON.stringify({ email, rowIndex })
    });

    allEmployeeItems = allEmployeeItems.filter(e => e.id !== empId && e.email.toLowerCase() !== email.toLowerCase());
    showToast(`🗑️ ${email} removed from user_hospitals.`, "success");
    renderEmployeesList();
  } catch (err) {
    showToast(`Failed to delete employee: ${err.message}`, "error");
  }
}

// ── SuperAdmin Password Management Handlers ──
function openAdminResetPwdModal(name, email, phone) {
  const modal = document.getElementById("admin-reset-pwd-modal");
  const nameEl = document.getElementById("admin-reset-emp-name");
  const emailEl = document.getElementById("admin-reset-emp-email");
  const phoneEl = document.getElementById("admin-reset-emp-phone");
  const targetEmailInp = document.getElementById("admin-reset-target-email");
  const targetPhoneInp = document.getElementById("admin-reset-target-phone");
  const quickBtn = document.getElementById("btn-quick-mobile-pwd");
  const customPwdInp = document.getElementById("admin-new-custom-pwd");

  const cleanPhone = String(phone || "").replace(/\D/g, "").slice(-10);

  if (nameEl) nameEl.textContent = name || email || "Employee";
  if (emailEl) emailEl.textContent = email;
  if (phoneEl) phoneEl.textContent = cleanPhone || (phone || "Not set");
  if (targetEmailInp) targetEmailInp.value = email;
  if (targetPhoneInp) targetPhoneInp.value = cleanPhone;
  if (customPwdInp) customPwdInp.value = "";

  if (quickBtn) {
    if (cleanPhone && cleanPhone.length === 10) {
      quickBtn.disabled = false;
      quickBtn.innerHTML = `⚡ Set Default to Registered Mobile (${cleanPhone})`;
      quickBtn.style.opacity = "1";
    } else {
      quickBtn.disabled = true;
      quickBtn.innerHTML = `⚠️ No 10-Digit Mobile Registered`;
      quickBtn.style.opacity = "0.6";
    }
  }

  if (modal) modal.style.display = "flex";
}

function closeAdminResetPwdModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains("modal-close")) return;
  const modal = document.getElementById("admin-reset-pwd-modal");
  if (modal) modal.style.display = "none";
}

async function handleQuickResetToMobile() {
  const email = document.getElementById("admin-reset-target-email")?.value;
  const phone = document.getElementById("admin-reset-target-phone")?.value;
  const btn = document.getElementById("btn-quick-mobile-pwd");

  if (!email) {
    showToast("Employee email is missing.", "error");
    return;
  }
  if (!phone || phone.length !== 10) {
    showToast("A valid 10-digit mobile number is required to set default password.", "error");
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Updating Neon DB...`;
    }

    const token = typeof getAuthToken === "function" ? await getAuthToken() : (localStorage.getItem("smspl_auth_token") || "");
    const base = (typeof getApiBaseUrl === "function") ? getApiBaseUrl() : "";
    const res = await fetch(`${base}/.netlify/functions/auth?action=adminResetEmployeePassword`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        email: email,
        resetToMobile: true,
        phone: phone
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to reset password");
    }

    showToast(`✅ Password for ${email} reset to registered mobile (${phone})!`, "success");
    closeAdminResetPwdModal();
  } catch (err) {
    showToast(`Failed: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `⚡ Set Default to Registered Mobile (${phone})`;
    }
  }
}

async function handleAdminCustomPasswordSubmit(e) {
  if (e) e.preventDefault();
  const email = document.getElementById("admin-reset-target-email")?.value;
  const newPassword = document.getElementById("admin-new-custom-pwd")?.value;
  const saveBtn = document.getElementById("admin-save-custom-pwd-btn");

  if (!email || !newPassword) {
    showToast("Email and new password are required.", "error");
    return;
  }

  if (newPassword.length < 6) {
    showToast("Password must be at least 6 characters.", "warn");
    return;
  }

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="spinner"></span> Saving...`;
    }

    const token = typeof getAuthToken === "function" ? await getAuthToken() : (localStorage.getItem("smspl_auth_token") || "");
    const base = (typeof getApiBaseUrl === "function") ? getApiBaseUrl() : "";
    const res = await fetch(`${base}/.netlify/functions/auth?action=adminResetEmployeePassword`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        email: email,
        newPassword: newPassword
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to set custom password");
    }

    showToast(`✅ Custom password for ${email} updated in Neon DB!`, "success");
    closeAdminResetPwdModal();
  } catch (err) {
    showToast(`Failed: ${err.message}`, "error");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `💾 Save Password`;
    }
  }
}

function copyContactDetails(event, name, phone, email, hospital) {
  if (event) event.stopPropagation();
  const text = `👤 ${name}\n🏥 Hospital: ${hospital}\n📞 Phone: ${phone}\n📧 Email: ${email}`;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
  }
  showToast(`📋 Copied contact: ${name}`, "success");
}

function exportEmployeesToExcel() {
  const user = currentUser || getStoredUser() || {};
  const isSuper = typeof isSuperAdmin === "function" && isSuperAdmin(user.email || "");
  const isDirect = typeof isDirector === "function" && isDirector(user.email || "");
  const userIsAdmin = !isSuper && !isDirect && (String(user.role || "").toLowerCase() === "admin");
  if (userIsAdmin && activeAdminPermissions && !activeAdminPermissions.can_export_excel) {
    showToast("🚫 Permission Denied: Admin role is not permitted to export Excel data.", "error");
    return;
  }

  if (typeof XLSX === "undefined") {
    showToast("Excel export library loading...", "error");
    return;
  }
  const filtered = allEmployeeItems.filter(e => {
    const hosp = String(e.hospital || "").toUpperCase();
    if (typeof isHospitalVisible === "function" && !isHospitalVisible(hosp)) return false;
    if (activeEmployeeHospitalFilter !== "ALL" && hosp !== "ALL" && !hosp.includes(activeEmployeeHospitalFilter)) return false;
    return true;
  });

  const exportData = filtered.map((e, idx) => ({
    "S.No": idx + 1,
    "Employee ID": e.id,
    "Full Name": e.name,
    "Category": e.memberType || "Both",
    "Login Allowed": e.loginAllowed || "YES",
    "Designation": e.role,
    "Assigned Hospital": e.hospital,
    "Email Address": e.email,
    "Mobile Number": e.phone || "+91 94140 XXXXX"
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
  XLSX.writeFile(workbook, `SNMC_Employee_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast(`📊 Exported ${filtered.length} members to Excel!`, "success");
}

// ── MY PROFILE & SETTINGS MODAL HANDLERS ──
async function openProfileModal() {
  const modal = document.getElementById("profile-modal");
  if (!modal) return;

  const user = currentUser || getStoredUser() || {};
  const isSuper = typeof isSuperAdmin === "function" && isSuperAdmin(user.email || "");

  const nameEl = document.getElementById("prof-modal-name");
  const emailEl = document.getElementById("prof-modal-email");
  const roleEl = document.getElementById("prof-modal-role");
  const officeEl = document.getElementById("prof-modal-office");
  const phoneEl = document.getElementById("prof-modal-phone");
  const initEl = document.getElementById("prof-modal-initials");
  const photoEl = document.getElementById("prof-modal-photo");
  const gBtn = document.getElementById("btn-connect-google");
  const gLabel = document.getElementById("connect-google-label");
  const superBox = document.getElementById("superadmin-settings-box");
  const superToggle = document.getElementById("toggle-google-login-chk");
  const slider = document.getElementById("toggle-slider");

  if (nameEl) nameEl.textContent = user.name || "User";
  if (emailEl) emailEl.textContent = user.email || "-";
  if (roleEl) roleEl.textContent = user.role || (isSuper ? "SuperAdmin" : "Operator");
  if (officeEl) officeEl.textContent = user.office || (Array.isArray(user.hospitals) ? user.hospitals.join(", ") : "MDM");
  if (phoneEl) phoneEl.textContent = user.phone || "-";

  const initial = (user.name || user.email || "U").charAt(0).toUpperCase();
  if (user.photo) {
    if (photoEl) { photoEl.src = user.photo; photoEl.style.display = "block"; }
    if (initEl) { initEl.style.display = "none"; }
  } else {
    if (photoEl) { photoEl.style.display = "none"; }
    if (initEl) { initEl.textContent = initial; initEl.style.display = "inline-flex"; }
  }

  // Google Connection Status
  if (user.googleLinked || user.uid) {
    if (gLabel) gLabel.textContent = "✅ Google Account Connected";
    if (gBtn) {
      gBtn.style.background = "#dcfce7";
      gBtn.style.borderColor = "#86efac";
      gBtn.style.color = "#166534";
    }
  } else {
    if (gLabel) gLabel.textContent = "Connect Google Account";
    if (gBtn) {
      gBtn.style.background = "#ffffff";
      gBtn.style.borderColor = "#cbd5e1";
      gBtn.style.color = "#1e293b";
    }
  }

  // SuperAdmin Settings Box
  if (isSuper) {
    if (superBox) superBox.style.display = "block";
    try {
      const isEnabled = typeof fetchGoogleAuthStatus === "function" ? await fetchGoogleAuthStatus() : false;
      if (superToggle) superToggle.checked = isEnabled;
      if (slider) slider.style.backgroundColor = isEnabled ? "#7c3aed" : "#cbd5e1";
    } catch (_) {}
  } else {
    if (superBox) superBox.style.display = "none";
  }

  modal.style.display = "flex";
}

function closeProfileModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById("profile-modal");
  if (modal) modal.style.display = "none";
}

async function handleLinkGoogleAccount() {
  try {
    showToast("Connecting Google Account via Firebase...", "info");
    const res = await linkGoogleAccountInProfile();
    showToast("🎉 Google Account connected successfully!", "success");
    openProfileModal(); // Refresh modal
  } catch (err) {
    showToast("Failed to connect Google account: " + err.message, "error");
  }
}

async function handleToggleGoogleLogin(enabled) {
  const slider = document.getElementById("toggle-slider");
  try {
    showToast(`${enabled ? 'Enabling' : 'Disabling'} Google login on welcome screen...`, "info");
    await setGoogleAuthToggle(enabled);
    if (slider) slider.style.backgroundColor = enabled ? "#7c3aed" : "#cbd5e1";
    showToast(`Google Sign-In is now ${enabled ? 'ENABLED' : 'DISABLED'} on login screen.`, "success");
  } catch (err) {
    showToast("Failed to update setting: " + err.message, "error");
    const toggle = document.getElementById("toggle-google-login-chk");
    if (toggle) toggle.checked = !enabled;
  }
}

// ── SUPERADMIN DEDICATED CONTROL CENTER MODULE ──
async function loadAdminCenterPage() {
  const user = currentUser || getStoredUser() || {};
  const isSuper = typeof isSuperAdmin === "function" && isSuperAdmin(user.email || "");
  if (!isSuper) {
    showToast("Forbidden: SuperAdmin access required.", "error");
    showTab("dashboard");
    return;
  }

  // 1. Fetch live Google Sign-In Status from Neon DB
  const toggleChk = document.getElementById("admin-toggle-google-chk");
  const slider = document.getElementById("admin-toggle-slider");
  const statusLbl = document.getElementById("admin-google-status-lbl");

  try {
    const isEnabled = typeof fetchGoogleAuthStatus === "function" ? await fetchGoogleAuthStatus() : false;
    if (toggleChk) toggleChk.checked = isEnabled;
    if (slider) slider.style.backgroundColor = isEnabled ? "#7c3aed" : "#cbd5e1";
    if (statusLbl) statusLbl.innerHTML = isEnabled 
      ? `<strong style="color:#7c3aed;">🟢 Active:</strong> Users can sign in via Google &amp; Password`
      : `<strong style="color:#64748b;">🔒 Disabled:</strong> Email &amp; Password only (Neon DB)`;
  } catch (_) {}

  // 2. Fetch live Admin Granular Permissions from Neon DB
  await loadAdminPermissionsMatrix();

  // 3. Fetch all employees to render allowlist audit
  const tbody = document.getElementById("admin-audit-table-body");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px;"><span class="spinner"></span> Auditing manpower sheet...</td></tr>`;
  }

  try {
    const res = await sheetsRequest("getEmployees");
    const emps = (res && res.employees) ? res.employees : [];
    renderAdminAuditTable(emps);
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#dc2626; padding:16px;">Failed to load audit: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

let activeAdminPermissions = {
  can_add_entry: true,
  can_edit_history: false,
  can_delete_history: false,
  can_add_stock: true,
  can_export_excel: true,
  can_manage_employees: false,
  can_delete_employees: false,
  can_send_broadcast: false
};

function applyExcelExportPermissions() {
  const user = currentUser || getStoredUser() || {};
  const isSuper = typeof isSuperAdmin === "function" && isSuperAdmin(user.email || "");
  const isDirect = typeof isDirector === "function" && isDirector(user.email || "");
  const userIsAdmin = !isSuper && !isDirect && (String(user.role || "").toLowerCase() === "admin");
  const allowExcel = isSuper || isDirect || !userIsAdmin || (activeAdminPermissions && activeAdminPermissions.can_export_excel);

  // Selector for all Excel export buttons across the application
  const excelBtns = document.querySelectorAll(
    'button[onclick*="exportHistoryToExcel"], button[onclick*="exportPrintersToExcel"], button[onclick*="exportStockToExcel"], button[onclick*="exportEmployeesToExcel"]'
  );
  excelBtns.forEach(btn => {
    btn.style.display = allowExcel ? "inline-flex" : "none";
  });
}

async function loadAdminPermissionsMatrix() {
  try {
    const base = (typeof getApiBaseUrl === "function") ? getApiBaseUrl() : "";
    const res = await fetch(`${base}/.netlify/functions/auth?action=getAdminPermissions`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.permissions) {
        activeAdminPermissions = { ...activeAdminPermissions, ...data.permissions };
      }
    }
  } catch (e) {
    console.warn("Could not fetch admin permissions:", e.message);
  }

  // Populate checkboxes if on admin tab
  const keys = [
    "can_add_entry", "can_edit_history", "can_delete_history", 
    "can_add_stock", "can_export_excel", "can_manage_employees", 
    "can_delete_employees", "can_send_broadcast"
  ];
  keys.forEach(k => {
    const el = document.getElementById(`perm-${k.replace(/_/g, '-')}`);
    if (el) el.checked = !!activeAdminPermissions[k];
  });

  applyExcelExportPermissions();
}

async function handleSaveAdminPermissions() {
  const btn = document.getElementById("btn-save-admin-perms");
  const keys = [
    "can_add_entry", "can_edit_history", "can_delete_history", 
    "can_add_stock", "can_export_excel", "can_manage_employees", 
    "can_delete_employees", "can_send_broadcast"
  ];
  const perms = {};
  keys.forEach(k => {
    const el = document.getElementById(`perm-${k.replace(/_/g, '-')}`);
    perms[k] = el ? el.checked : false;
  });

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Saving...`;
    }

    const token = typeof getAuthToken === "function" ? await getAuthToken() : (localStorage.getItem("smspl_auth_token") || "");
    const base = (typeof getApiBaseUrl === "function") ? getApiBaseUrl() : "";
    const res = await fetch(`${base}/.netlify/functions/auth?action=saveAdminPermissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ permissions: perms })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to save permissions.");
    }

    activeAdminPermissions = perms;
    applyExcelExportPermissions();
    showToast("✅ Admin Role Permissions saved to Neon DB!", "success");
  } catch (err) {
    showToast(`Failed: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `💾 Save Permissions`;
    }
  }
}

function renderAdminAuditTable(emps) {
  const tbody = document.getElementById("admin-audit-table-body");
  if (!tbody) return;

  if (!emps || !emps.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--text-muted);">No records found in manpower sheet.</td></tr>`;
    return;
  }

  tbody.innerHTML = emps.map(e => {
    const isAllowed = e.loginAllowed === "YES";
    const badgeColor = isAllowed ? "background:#dcfce7; color:#15803d;" : "background:#fee2e2; color:#b91c1c;";
    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 8px 10px;">
          <div style="font-weight:700; color:#0f172a;">${escapeHtml(e.name)}</div>
          <div style="font-size:0.7rem; color:#64748b;">${escapeHtml(e.email)}</div>
        </td>
        <td style="padding: 8px 10px;"><span class="badge" style="background:#eff6ff; color:#1e40af;">${escapeHtml(e.hospital)}</span></td>
        <td style="padding: 8px 10px;">${escapeHtml(e.project || '—')}</td>
        <td style="padding: 8px 10px;">${escapeHtml(e.status || '—')}</td>
        <td style="padding: 8px 10px;">
          <span class="badge" style="${badgeColor} font-weight:700;">${escapeHtml(e.accessReason || (isAllowed ? '🟢 Allowed' : '🔴 Blocked'))}</span>
        </td>
        <td style="padding: 8px 10px; text-align: right;">
          <button type="button" class="arrow-btn" style="width:auto; padding:3px 8px; border-radius:10px; font-size:0.7rem; font-weight:700; color:#15803d; background:rgba(22,163,74,0.1);" onclick="openAdminResetPwdModal('${escapeHtml(e.name)}', '${escapeHtml(e.email)}', '${escapeHtml(e.phone)}')">
            🔑 Reset
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

async function handleAdminCenterToggleGoogle(enabled) {
  const slider = document.getElementById("admin-toggle-slider");
  const statusLbl = document.getElementById("admin-google-status-lbl");
  try {
    showToast(`${enabled ? 'Enabling' : 'Disabling'} Google login on welcome screen...`, "info");
    await setGoogleAuthToggle(enabled);
    if (slider) slider.style.backgroundColor = enabled ? "#7c3aed" : "#cbd5e1";
    if (statusLbl) {
      statusLbl.innerHTML = enabled 
        ? `<strong style="color:#7c3aed;">🟢 Active:</strong> Users can sign in via Google &amp; Password`
        : `<strong style="color:#64748b;">🔒 Disabled:</strong> Email &amp; Password only (Neon DB)`;
    }
    showToast(`Google Sign-In is now ${enabled ? 'ENABLED' : 'DISABLED'} on login screen.`, "success");
  } catch (err) {
    showToast("Failed to update setting: " + err.message, "error");
    const toggle = document.getElementById("admin-toggle-google-chk");
    if (toggle) toggle.checked = !enabled;
  }
}


// ══════════════════════════════════════════════════════════
// ── SMART SCANNER (CAMERA & OCR AUTO-FILL) ──────────────
// ══════════════════════════════════════════════════════════

let scannerStream = null;
let currentCameraFacing = "environment"; // default to rear camera on mobile
let scannedDataPending = null;

async function openScannerModal() {
  const modal = document.getElementById("scanner-modal");
  const resultBar = document.getElementById("scanner-result-bar");
  const busy = document.getElementById("scanner-busy-overlay");
  
  if (resultBar) resultBar.style.display = "none";
  if (busy) busy.style.display = "none";
  scannedDataPending = null;

  if (modal) modal.style.display = "flex";

  await startCameraStream();
}

function closeScannerModal() {
  stopCameraStream();
  const modal = document.getElementById("scanner-modal");
  if (modal) modal.style.display = "none";
  scannedDataPending = null;
}

async function startCameraStream() {
  stopCameraStream();
  const video = document.getElementById("scanner-video");
  if (!video) return;

  try {
    const constraints = {
      video: {
        facingMode: { ideal: currentCameraFacing },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    scannerStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = scannerStream;
    await video.play();
  } catch (err) {
    console.warn("[Scanner] Camera stream direct start failed:", err);
    // Try fallback without constraints
    try {
      scannerStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = scannerStream;
      await video.play();
    } catch (fallbackErr) {
      console.warn("[Scanner] No camera access:", fallbackErr);
      showToast("Camera access unavailable. Please use the 📁 Gallery button to upload a photo.", "info");
    }
  }
}

function stopCameraStream() {
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  const video = document.getElementById("scanner-video");
  if (video) video.srcObject = null;
}

async function toggleCameraFacing() {
  currentCameraFacing = (currentCameraFacing === "environment") ? "user" : "environment";
  await startCameraStream();
}

async function handleScannerFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const busy = document.getElementById("scanner-busy-overlay");
  const statusEl = document.getElementById("ocr-status-text");
  if (busy) busy.style.display = "flex";
  if (statusEl) statusEl.textContent = "Loading selected image...";

  try {
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(img.src);
      await processImageForOcr(img);
    };
    img.onerror = () => {
      if (busy) busy.style.display = "none";
      showToast("Could not load image file.", "error");
    };
    img.src = URL.createObjectURL(file);
  } catch (err) {
    if (busy) busy.style.display = "none";
    showToast("Error reading file: " + err.message, "error");
  } finally {
    event.target.value = "";
  }
}

async function captureAndProcessScan() {
  const video = document.getElementById("scanner-video");
  const canvas = document.getElementById("scanner-canvas");
  if (!video || !video.videoWidth) {
    showToast("Camera is not ready. You can also pick a photo via 📁 Gallery.", "warn");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  await processImageForOcr(canvas);
}

async function processImageForOcr(sourceElement) {
  const busy = document.getElementById("scanner-busy-overlay");
  const statusEl = document.getElementById("ocr-status-text");
  const resultBar = document.getElementById("scanner-result-bar");
  const counterPill = document.getElementById("sresult-counter-pill");
  const readingPill = document.getElementById("sresult-reading-pill");

  if (busy) busy.style.display = "flex";
  if (statusEl) statusEl.textContent = "Scanning printer display...";
  if (resultBar) resultBar.style.display = "none";

  try {
    if (!window.OCR_ENGINE) {
      throw new Error("OCR Engine is not initialized.");
    }
    const result = await window.OCR_ENGINE.recognize(sourceElement);
    console.log("[OCR] Scan result:", result);

    if (!result.closingReading && !result.serialNo && !result.counterMarker) {
      if (busy) busy.style.display = "none";
      showToast("Could not clearly detect reading or serial. Please align closer and retry.", "warn");
      return;
    }

    scannedDataPending = result;

    // Resolve Counter Item from serialNo or counterMarker
    const matchedPrinter = findMatchingPrinter(result.serialNo, result.counterMarker);
    if (matchedPrinter) {
      scannedDataPending.matchedPrinter = matchedPrinter;
    }

    if (counterPill) {
      counterPill.textContent = matchedPrinter 
        ? `Printer: ${matchedPrinter.fullCounter}` 
        : (result.serialNo ? `S/N: ${result.serialNo}` : (result.counterMarker ? `Marker: #${result.counterMarker}` : `Counter: Unknown`));
    }
    if (readingPill) {
      readingPill.textContent = result.closingReading ? `Reading: ${result.closingReading}` : "Reading: Not Detected";
    }

    if (busy) busy.style.display = "none";
    if (resultBar) resultBar.style.display = "flex";

    // Vibrate phone if supported
    if (navigator.vibrate) navigator.vibrate(100);

  } catch (err) {
    console.error("[OCR] Processing error:", err);
    if (busy) busy.style.display = "none";
    showToast("Scan analysis failed: " + err.message, "error");
  }
}

/**
 * Searches allPrinterItems to match scanned serialNo or counterMarker
 */
function findMatchingPrinter(serialNo, counterMarker) {
  if (!allPrinterItems || !allPrinterItems.length) return null;

  // 1. Try exact or partial serial match
  if (serialNo) {
    const cleanScanSerial = serialNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const match = allPrinterItems.find(p => {
      if (!p.serialNo) return false;
      const cleanPrinterSerial = p.serialNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      return cleanPrinterSerial === cleanScanSerial || cleanPrinterSerial.includes(cleanScanSerial) || cleanScanSerial.includes(cleanPrinterSerial);
    });
    if (match) return match;
  }

  // 2. Try counter marker match (e.g. "32")
  if (counterMarker) {
    const targetMarkerNum = parseInt(counterMarker, 10);
    const match = allPrinterItems.find(p => {
      const pNum = parseInt((p.counterNo || "").replace(/[^0-9]/g, ""), 10);
      return pNum === targetMarkerNum;
    });
    if (match) return match;
  }

  return null;
}

/**
 * Applies scanned values directly to entry form
 */
function applyScanResultToForm() {
  if (!scannedDataPending) {
    closeScannerModal();
    return;
  }

  const { closingReading, matchedPrinter } = scannedDataPending;

  // 1. If printer found, select it
  if (matchedPrinter) {
    const row1 = matchedPrinter.fullCounter;
    const row2 = [matchedPrinter.counterName, matchedPrinter.hospital ? `(${matchedPrinter.hospital})` : ""].filter(Boolean).join(" ");
    selectCounterOption(matchedPrinter.fullCounter, row1, row2);
  }

  // 2. Set closing reading if present
  if (closingReading !== null && closingReading !== undefined) {
    const closingInput = document.getElementById("closing-reading");
    if (closingInput) {
      closingInput.value = closingReading;
      calcBalance();
      const isValid = validateReadings();
      if (!isValid) {
        const opening = parseFloat(document.getElementById("opening-reading")?.value || 0);
        showToast(`⚠️ Warning: Scanned closing reading (${closingReading}) is less than opening reading (${opening})! Please check display.`, "error");
      }
    }
  }

  closeScannerModal();

  // 3. User feedback
  const counterText = matchedPrinter ? matchedPrinter.fullCounter : "Printer";
  const readingText = (closingReading !== null && closingReading !== undefined) ? `Closing: ${closingReading}` : "";
  showToast(`✅ Auto-filled from scan: ${counterText} | ${readingText}`, "success");
}

