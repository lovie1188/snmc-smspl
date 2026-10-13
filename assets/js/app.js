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
  } else if (preset === "last_7") {
    const last7 = new Date(today);
    last7.setDate(last7.getDate() - 6);
    const last7Str = `${last7.getFullYear()}-${pad(last7.getMonth() + 1)}-${pad(last7.getDate())}`;
    summaryStartDate = last7Str;
    summaryEndDate = todayStr;
    if (startInput) startInput.value = last7Str;
    if (endInput) endInput.value = todayStr;
  } else if (preset === "this_month") {
    const firstDay = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
    summaryStartDate = firstDay;
    summaryEndDate = todayStr;
    if (startInput) startInput.value = firstDay;
    if (endInput) endInput.value = todayStr;
  } else if (preset === "last_month") {
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthLast = new Date(today.getFullYear(), today.getMonth(), 0);
    const pmStart = `${prevMonth.getFullYear()}-${pad(prevMonth.getMonth() + 1)}-01`;
    const pmEnd = `${prevMonthLast.getFullYear()}-${pad(prevMonthLast.getMonth() + 1)}-${pad(prevMonthLast.getDate())}`;
    summaryStartDate = pmStart;
    summaryEndDate = pmEnd;
    if (startInput) startInput.value = pmStart;
    if (endInput) endInput.value = pmEnd;
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

function animateCountUp(element, targetValue, duration = 400) {
  if (!element) return;
  const target = parseFloat(targetValue.toString().replace(/,/g, ''));
  if (isNaN(target) || target === 0) {
    element.textContent = targetValue;
    return;
  }
  const startTime = performance.now();
  const update = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = progress * (2 - progress);
    const current = Math.round(target * easeProgress);
    element.textContent = current.toLocaleString('en-IN');
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = targetValue;
    }
  };
  requestAnimationFrame(update);
}

function updateDashboardWelcomeBar(hospitalName) {
  const bar = document.getElementById("dashboard-welcome-bar");
  if (!bar) return;
  
  const hour = new Date().getHours();
  let greeting = "Good Evening";
  if (hour < 12) greeting = "Good Morning";
  else if (hour < 17) greeting = "Good Afternoon";
  
  const name = currentUser?.name || "User";
  const d = new Date();
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  const weekday = d.toLocaleString('en-US', { weekday: 'long' });
  const dateStr = `${day} ${month} ${year} (${weekday})`;

  // Calculate time since last entry today
  let lastEntryText = "No entries today";
  const todayStr = new Date().toLocaleDateString("en-CA");
  if (Array.isArray(allDailyRows)) {
    const todayEntries = allDailyRows.filter(r => {
      const rd = parseRowDate(r["Date"] || r["Timestamp"] || r["hg"] || "");
      return rd && rd.toLocaleDateString("en-CA") === todayStr;
    });
    if (todayEntries.length > 0) {
      todayEntries.sort((a, b) => (parseRowDate(a["Date"]||a["Timestamp"]||a["hg"])||0) - (parseRowDate(b["Date"]||b["Timestamp"]||b["hg"])||0));
      const latest = parseRowDate(todayEntries[todayEntries.length - 1]["Date"] || todayEntries[todayEntries.length - 1]["Timestamp"] || todayEntries[todayEntries.length - 1]["hg"]);
      if (latest) {
        const diffMs = Math.max(0, new Date() - latest);
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHrs === 0) {
          const diffMins = Math.floor(diffMs / (1000 * 60));
          lastEntryText = `Last entry: ${diffMins}m ago`;
        } else {
          lastEntryText = `Last entry: ${diffHrs}h ago`;
        }
      }
    }
  }

  bar.innerHTML = `
    <div class="wb-greeting">${greeting}, <strong>${name}</strong></div>
    <div class="wb-context">
      <span class="wb-badge">${hospitalName}</span>
      <span class="wb-date">${dateStr}</span>
      <span class="wb-last-entry">${lastEntryText}</span>
    </div>
  `;
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
    activeHospitalName = "Umaid Hospital"; // Fixed: Title Case, canonical name
  }

  // Expose activeStats + context to module scope so shareSummaryWhatsApp() reads
  // directly from JS data (not from animated DOM nodes — fixes race condition)
  window._lastActiveStats        = activeStats;
  window._lastActiveHospitalName = activeHospitalName;
  window._lastUnissuedSheets     = Math.max(0, activeStats.delivered - activeStats.issued);
  window._lastIsDateFiltered     = isDateFiltered;

  // Populate 3-Core Lifecycle Hero Cards
  const delSheetsEl = document.getElementById("kpi-delivered-sheets");
  const delRimsEl   = document.getElementById("kpi-delivered-rims");
  const issSheetsEl = document.getElementById("kpi-issued-sheets");
  const issRimsEl   = document.getElementById("kpi-issued-rims");
  const prnCountEl  = document.getElementById("kpi-prints-count");
  const entriesEl   = document.getElementById("kpi-entries-count");

  if (delSheetsEl) animateCountUp(delSheetsEl, activeStats.delivered.toLocaleString("en-IN"), 400);
  if (delRimsEl)   animateCountUp(delRimsEl, activeStats.stockRims.toLocaleString("en-IN"), 400);
  if (issSheetsEl) animateCountUp(issSheetsEl, activeStats.issued.toLocaleString("en-IN"), 400);
  // Issued Rims: consistent 1-decimal format (matches delivered-rims display)
  if (issRimsEl)   issRimsEl.textContent = (activeStats.issued / 500).toFixed(1);
  if (prnCountEl)  animateCountUp(prnCountEl, activeStats.prints.toLocaleString("en-IN"), 400);
  if (entriesEl)   animateCountUp(entriesEl, activeStats.entries.toLocaleString("en-IN"), 400);

  // Populate Consumption Tracker Bar
  const stockBalanceEl = document.getElementById("kpi-stock-balance");
  const utilRateEl     = document.getElementById("kpi-utilization-rate");
  const scopeEl        = document.getElementById("kpi-active-scope");

  const unissuedSheets = Math.max(0, activeStats.delivered - activeStats.issued);

  // Utilization: prints vs delivered (per user guidance — prints > issued means
  // paper was delivered but not entered in system; delivered is the true baseline)
  // Show real %, uncapped — anomaly is data signal, not error to hide
  const rawUtilPct = activeStats.delivered > 0
    ? Math.round((activeStats.prints / activeStats.delivered) * 100)
    : 0;
  const utilDisplay = rawUtilPct > 100
    ? `${rawUtilPct}% ⚠️`   // Anomaly visible in dashboard
    : `${rawUtilPct}%`;

  window._lastRawUtilPct = rawUtilPct; // expose for WhatsApp share

  if (stockBalanceEl) stockBalanceEl.textContent = `${unissuedSheets.toLocaleString("en-IN")} Sheets`;
  if (utilRateEl) {
    utilRateEl.textContent = `${utilDisplay} (Prints / Delivered)`;
    utilRateEl.className = rawUtilPct > 100 ? "cs-val warn" : rawUtilPct >= 80 ? "cs-val good" : "cs-val warn";
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

  // 6. Update Welcome & Context Bar
  updateDashboardWelcomeBar(activeHospitalName);

  // Show/hide Team Directory widget based on super admin
  const teamWidget = document.getElementById("widget-team-directory");
  if (teamWidget) {
    const userIsSuper = typeof isSuperAdmin === "function" && isSuperAdmin(currentUser?.email || "");
    teamWidget.style.display = userIsSuper ? "flex" : "none";
  }
}

// ── One-Click Executive Share: WhatsApp Summary ────────────
async function shareSummaryWhatsApp() {
  // Read directly from JS data (not animated DOM — avoids race condition)
  const st = window._lastActiveStats;
  if (!st || (st.delivered === 0 && st.issued === 0 && st.prints === 0)) {
    showToast("⚠️ Dashboard data not loaded yet. Please wait a moment and try again.", "warn");
    return;
  }

  const scope         = window._lastActiveHospitalName || "All Hospitals (SNMC)";
  const isFiltered    = window._lastIsDateFiltered || false;
  const unissued      = window._lastUnissuedSheets ?? Math.max(0, st.delivered - st.issued);
  const rawUtilPct    = window._lastRawUtilPct ?? (st.delivered > 0 ? Math.round((st.prints / st.delivered) * 100) : 0);

  // ── Date / Period display (IST-safe) ─────────────────────
  const istOptions = { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" };
  const timeOptions = { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true };
  const now         = new Date();
  const dateStr     = now.toLocaleDateString("en-IN", istOptions);
  const timeStr     = now.toLocaleTimeString("en-IN", timeOptions);
  const timeIST     = timeStr.replace("am", "AM").replace("pm", "PM");

  // Dynamic title + period label
  let summaryTitle, periodLabel;
  if (!isFiltered) {
    summaryTitle = "All-Time Executive Summary";
    periodLabel  = `All-Time (as of ${dateStr})`;
  } else if (summaryStartDate === summaryEndDate) {
    summaryTitle = "Executive Daily Summary";
    periodLabel  = dateStr;
  } else {
    const fmt = (d) => {
      const [y, m, day] = d.split("-");
      return new Date(y, m - 1, day).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    };
    summaryTitle = "Executive Period Summary";
    periodLabel  = summaryStartDate && summaryEndDate
      ? `${fmt(summaryStartDate)} – ${fmt(summaryEndDate)}`
      : dateStr;
  }

  // ── Formatted numbers ────────────────────────────────────
  const fmtN  = (n) => Math.round(n).toLocaleString("en-IN");
  const fmtR  = (n) => {
    const r = n / 500;
    return r % 1 === 0 ? r.toFixed(0) : r.toFixed(1);
  };

  const deliveredStr  = fmtN(st.delivered);
  const delRimsStr    = st.stockRims > 0 ? st.stockRims.toLocaleString("en-IN") : fmtR(st.delivered);
  const issuedStr     = fmtN(st.issued);
  const issRimsStr    = fmtR(st.issued);
  const printsStr     = fmtN(st.prints);
  const printsRimsStr = fmtR(st.prints);  // Prints in Rim-equivalent (500 pages = 1 rim)
  const entriesStr    = fmtN(st.entries);
  const balanceStr    = fmtN(unissued);
  const balRimsStr    = fmtR(unissued);

  // ── Stock health indicator ───────────────────────────────
  let stockHealth;
  if (unissued < 5000)       stockHealth = "🔴 Critical — Re-order Now!";
  else if (unissued < 25000) stockHealth = "🟡 Low — Monitor Closely";
  else                        stockHealth = "🟢 Adequate";

  // ── Utilization line (base) ───────────────────────────────
  const utilLabel = isFiltered ? "📈 *Paper Utilization:*" : "📊 *Print Coverage:*";
  const utilSuffix = isFiltered ? "(Prints / Delivered)" : "(Meter vs Delivered)";
  const utilBase = `${utilLabel} ${rawUtilPct}%${rawUtilPct > 100 ? " ⚠️" : ""} ${utilSuffix}`;

  // ── AI Insight (Gemini-powered anomaly analysis) ──────────
  showToast("🤖 AI insight तैयार हो रहा है...", "info");
  let aiInsightLine = "";
  try {
    const insightRes = await sheetsRequest("aiInsight", {
      method: "POST",
      body: JSON.stringify({
        stats: {
          delivered: st.delivered,
          issued:    st.issued,
          prints:    st.prints,
          entries:   st.entries,
          stockRims: st.stockRims
        },
        hospital:   scope,
        period:     periodLabel,
        isFiltered: isFiltered
      })
    });

    if (insightRes?.insight) {
      let txt = insightRes.insight.trim().replace(/^_|_$/g, "").replace(/_/g, "");
      if (txt.length > 300) txt = txt.slice(0, 297) + "...";
      aiInsightLine = `\n🤖 ${txt}`;
    }
  } catch (aiErr) {
    // Non-fatal: AI unavailable — use rule-based PAAS fallback
    console.warn("[WhatsApp Share] AI insight unavailable:", aiErr?.message);
    const physGap = st.delivered - st.prints;
    if (physGap > 0) {
      const rims = (physGap / 500).toFixed(1);
      aiInsightLine = `\n⚠️ ${physGap.toLocaleString("en-IN")} sheets (≈${rims} Rims) deliver हुईं, print नहीं — physical stock verify करें।`;
    } else if (physGap < 0) {
      aiInsightLine = `\n⚠️ Prints > Delivered — delivery entries verify करें।`;
    }
  }


  // ── Signatory ────────────────────────────────────────────
  const signedBy = currentUser?.name ? `${currentUser.name}` : "Admin Office";

  // ── Compose final message ─────────────────────────────────
  const text = `📊 *SNMC PrintTrack — ${summaryTitle}*
🏥 *Hospital:* ${scope}
📅 *Period:* ${periodLabel} • ${timeIST} IST
──────────────────────
📦 *1. Stock Received:* ${deliveredStr} Sheets (${delRimsStr} Rims)
📤 *2. Paper Issued:* ${issuedStr} Sheets (${issRimsStr} Rims)
🖨️ *3. Prints Recorded:* ${printsStr} Pages (${printsRimsStr} Rims • ${entriesStr} Logs)
──────────────────────
🏬 *Available Store Stock:* ${balanceStr} Sheets (${balRimsStr} Rims)
   ${stockHealth}
${utilBase}${aiInsightLine}
──────────────────────
📌 _Reported by: ${signedBy} • SNMC PrintTrack_`;

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
              <span class="stat-label">Net Prints (Bal)</span>
              <span class="stat-val balance" style="color:#059669; font-weight:800;">${escapeHtml(balance)}</span>
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

// ── Calculate BALANCE & NET PRINTS DIFFERENCE (Column H) ─────
function calcBalance() {
  const openingInput = document.getElementById("opening-reading");
  const closingInput = document.getElementById("closing-reading");

  const openingVal = openingInput?.value?.trim() || "";
  const closingVal = closingInput?.value?.trim() || "";

  const opening = parseFloat(openingVal || 0);
  const closing = parseFloat(closingVal || 0);
  
  // Net Prints Calculation: (Closing - Opening) => directly saved in Column H: BALANCE
  let netPrints = 0;
  if (closingVal !== "" && !isNaN(closing) && !isNaN(opening)) {
    netPrints = Math.max(0, closing - opening);
  }

  const netPrintsEl = document.getElementById("net-prints-calc");
  if (netPrintsEl) {
    netPrintsEl.value = netPrints;
  }

  // Column H: BALANCE in Google Sheets now receives Net Prints (Closing - Opening)
  const balEl = document.getElementById("paper-balance");
  if (balEl) {
    balEl.value = netPrints;
    balEl.style.color = "#10b981"; // Fresh green for successful net prints
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
    if (balEl) balEl.textContent = `${foundPrevBalance} Pages`;

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
  const user = currentUser || getStoredUser() || {};
  const userEmail = (user.email || "").toLowerCase().trim();
  const isSuper = isSuperAdmin(userEmail) || user.isSuperAdmin === true;

  const dateGroup = document.getElementById("entry-date-group");
  const dateInput = document.getElementById("entry-date-input");
  const badgeEl = document.getElementById("entry-date-role-badge");

  if (dateGroup) dateGroup.style.display = "block";

  // Always set default to Current Date (Today)
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  if (dateInput && !dateInput.value) {
    dateInput.value = todayStr;
  }

  // Editable ONLY by SuperAdmin
  if (isSuper) {
    if (dateInput) {
      dateInput.readOnly = false;
      dateInput.style.background = "#ffffff";
      dateInput.style.cursor = "pointer";
    }
    if (badgeEl) {
      badgeEl.innerHTML = "⚡ SUPERADMIN EDITABLE";
      badgeEl.style.background = "rgba(124, 58, 237, 0.1)";
      badgeEl.style.color = "#7c3aed";
    }
  } else {
    if (dateInput) {
      dateInput.value = todayStr; // Non-superadmins always locked to today
      dateInput.readOnly = true;
      dateInput.style.background = "#f1f5f9";
      dateInput.style.cursor = "not-allowed";
    }
    if (badgeEl) {
      badgeEl.innerHTML = "🔒 TODAY (LOCKED)";
      badgeEl.style.background = "#f1f5f9";
      badgeEl.style.color = "var(--text-muted)";
    }
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
    setDefaultDate();
    toggleIssueReceiveFields();
    
    // Reset guided wizard state if in wizard mode
    const chkRim = document.getElementById("chk-toggle-rim");
    if (chkRim) {
      chkRim.checked = false;
      handleRimCheckboxChange(false);
    }
    const pickerLabel = document.getElementById("counter-picker-label");
    if (pickerLabel) pickerLabel.innerHTML = `<span style="color: var(--text-muted);">— Select Counter No. —</span>`;
    const confirmCard = document.getElementById("selected-printer-confirm-card");
    if (confirmCard) confirmCard.style.display = "none";
    
    // Clear scanned and adjusted image state
    scannedDataPending = null;
    adjusterSourceImage = null;
    if (typeof resetAdjuster === "function") resetAdjuster();

    if (typeof goToWizardStep === "function" && currentEntryMode === "wizard") {
      goToWizardStep(1);
    }
    
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

// ── HARDWARE PRINTERS & STOCK LEDGER MODULES ──
// NOTE: Maintained in assets/js/modules/hardware-printers.js and assets/js/modules/stock-ledger.js

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

// NOTE: Employee directory, ID cards, photo adjuster and admin modals are maintained in assets/js/modules/team-directory.js

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

  // 2B. Fetch live Scanner OCR Engine Setting from Server/Neon DB
  await loadAdminOcrMethodSetting();

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

async function loadAdminOcrMethodSetting() {
  const radioVision = document.getElementById("radio-method-vision");
  const radioTess = document.getElementById("radio-method-tesseract");
  const statusLbl = document.getElementById("admin-ocr-status-lbl");
  const lblVision = document.getElementById("lbl-method-vision");
  const lblTess = document.getElementById("lbl-method-tesseract");

  try {
    const res = await sheetsRequest("getScannerSettings");
    const method = (res && res.ocrMethod === "tesseract") ? "tesseract" : "vision";
    if (radioVision) radioVision.checked = (method === "vision");
    if (radioTess) radioTess.checked = (method === "tesseract");

    if (lblVision && lblTess) {
      lblVision.style.borderColor = (method === "vision") ? "#0284c7" : "#cbd5e1";
      lblTess.style.borderColor = (method === "tesseract") ? "#0284c7" : "#cbd5e1";
    }

    if (statusLbl) {
      statusLbl.innerHTML = `Current Active Method: <strong style="color:${method === 'vision' ? '#0284c7' : '#475569'};">${method === 'vision' ? 'AI Vision (Method 2 ⚡)' : 'JS OCR (Method 1 - Tesseract)'}</strong>`;
    }

    if (window.OCR_ENGINE && typeof window.OCR_ENGINE.setMethod === "function") {
      window.OCR_ENGINE.setMethod(method);
    }
  } catch (err) {
    console.warn("Could not load OCR setting:", err.message);
  }
}

async function handleOcrMethodChange(method) {
  const chosen = (method === "tesseract") ? "tesseract" : "vision";
  const statusLbl = document.getElementById("admin-ocr-status-lbl");
  const lblVision = document.getElementById("lbl-method-vision");
  const lblTess = document.getElementById("lbl-method-tesseract");

  try {
    showToast(`Updating Scanner Engine to ${chosen.toUpperCase()}...`, "info");
    const res = await sheetsRequest("saveScannerSettings", {
      method: "POST",
      body: JSON.stringify({ ocrMethod: chosen })
    });

    if (lblVision && lblTess) {
      lblVision.style.borderColor = (chosen === "vision") ? "#0284c7" : "#cbd5e1";
      lblTess.style.borderColor = (chosen === "tesseract") ? "#0284c7" : "#cbd5e1";
    }

    if (statusLbl) {
      statusLbl.innerHTML = `Current Active Method: <strong style="color:${chosen === 'vision' ? '#0284c7' : '#475569'};">${chosen === 'vision' ? 'AI Vision (Method 2 ⚡)' : 'JS OCR (Method 1 - Tesseract)'}</strong>`;
    }

    if (window.OCR_ENGINE && typeof window.OCR_ENGINE.setMethod === "function") {
      window.OCR_ENGINE.setMethod(chosen);
    }

    showToast(`Scanner Engine successfully updated to ${chosen.toUpperCase()}!`, "success");
  } catch (err) {
    showToast("Failed to update scanner setting: " + err.message, "error");
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


// ── SMART GUIDED WIZARD & SCANNER CONTROLLER ────────────
// NOTE: Maintained in assets/js/modules/vision-scanner.js
