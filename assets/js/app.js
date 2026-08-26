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

// ── Real-Time Form Validation Constraints ──────────────────
function validateReadings() {
  const openingInput = document.getElementById("opening-reading");
  const closingInput = document.getElementById("closing-reading");
  const errorMsgEl = document.getElementById("reading-validation-error");
  const submitBtn = document.getElementById("submit-btn");

  const opening = parseFloat(openingInput?.value || 0);
  const closing = parseFloat(closingInput?.value || 0);

  if (closingInput && closingInput.value !== "" && closing < opening) {
    closingInput.classList.add("input-error");
    if (errorMsgEl) errorMsgEl.style.display = "block";
    if (submitBtn) submitBtn.disabled = true;
    return false;
  } else {
    if (closingInput) closingInput.classList.remove("input-error");
    if (errorMsgEl) errorMsgEl.style.display = "none";
    if (submitBtn) submitBtn.disabled = false;
    return true;
  }
}

// ── Hospital-Wise Analytics Calculator ─────────────────────
function calculateHospitalMetrics() {
  let mdmTotal = 0;
  let mghTotal = 0;
  let umaidTotal = 0;

  // Build counter-to-hospital map from printerData if available
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

  allDailyRows.forEach(r => {
    const cVal = r["counter Number"] || r["Counter Number"] || r["Counter"] || "";
    const hospCol = (r["Hospital Name"] || r["Hospital Name "] || r["Hospital"] || "").toUpperCase();
    const issued = parseFloat(r["Paper Issued"] || r["Issued"] || 0) || 0;

    let hospital = hospCol || counterHospitalMap[cVal.trim()] || counterHospitalMap[cVal.split(" ")[0].trim()] || "";

    if (!hospital) {
      const rawStr = Object.values(r).join(" ").toUpperCase();
      if (rawStr.includes("MDM")) hospital = "MDM";
      else if (rawStr.includes("MGH")) hospital = "MGH";
      else if (rawStr.includes("UMAID") || rawStr.includes("GYN") || rawStr.includes("PEDIA")) hospital = "UMAID";
    }

    if (hospital.includes("MDM")) mdmTotal += issued;
    else if (hospital.includes("MGH")) mghTotal += issued;
    else if (hospital.includes("UMAID") || hospital.includes("GYN") || hospital.includes("PEDIA")) umaidTotal += issued;
  });

  const mdmEl = document.getElementById("mdm-issued-count");
  const mghEl = document.getElementById("mgh-issued-count");
  const umaidEl = document.getElementById("umaid-issued-count");

  if (mdmEl) mdmEl.textContent = mdmTotal.toLocaleString("en-IN");
  if (mghEl) mghEl.textContent = mghTotal.toLocaleString("en-IN");
  if (umaidEl) umaidEl.textContent = umaidTotal.toLocaleString("en-IN");
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

// ── Calculate BALANCE (Column J - Column K) ─────────────────
function calcBalance() {
  const opening = parseFloat(document.getElementById("opening-reading")?.value || 0);
  const closing = parseFloat(document.getElementById("closing-reading")?.value || 0);
  
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

  if (!selectedCounter) {
    if (titleEl) titleEl.textContent = "Counter History";
    if (tbody) tbody.innerHTML = "";
    if (noHist) {
      noHist.style.display = "block";
      noHist.textContent = "Please select a Counter Number above to view its history.";
    }
    return;
  }

  if (titleEl) titleEl.textContent = `History — ${selectedCounter}`;

  // 1. Filter history for selected counter using exact matcher
  const counterRows = allDailyRows.filter(r => {
    const c = r["counter Number"] || r["Counter Number"] || r["Counter"] || "";
    return isExactCounterMatch(c, selectedCounter);
  });

  // 2. Auto-set Opening Reading from LATEST entry of selected counter (Column K / Closing Reading)
  const openingEl = document.getElementById("opening-reading");
  if (openingEl) {
    let foundPrevClosing = "";
    if (counterRows.length > 0) {
      // counterRows are ordered latest first (from loadHistory reverse)
      for (const entry of counterRows) {
        const val = entry["Closing Reading"] || entry["Closing"] || entry["closing"] || "";
        if (val !== "" && !isNaN(val)) {
          foundPrevClosing = String(val).trim();
          break; // latest entry found
        }
      }
    }
    openingEl.value = foundPrevClosing !== "" ? foundPrevClosing : "0";
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

// ── Hospital Switcher Management ──────────────────────────
function initHospitalState() {
  const email = currentUser?.email || "";
  const mapped = getUserHospital(email);
  if (mapped === "ALL" || isSuperAdmin(email)) {
    userAllowedHospitals = ["ALL"];
  } else {
    userAllowedHospitals = mapped.split(",").map(h => h.trim().toUpperCase()).filter(Boolean);
  }
  activeSelectedHospital = userAllowedHospitals.length === 1 ? userAllowedHospitals[0] : "ALL";
  updateHeaderHospitalBadge();
}

function updateHeaderHospitalBadge() {
  const lbl = document.getElementById("current-hospital-label");
  if (lbl) {
    lbl.textContent = activeSelectedHospital === "ALL" ? "All Hospitals" : `${activeSelectedHospital} Hospital`;
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
  
  // Refresh UI views with new hospital filter
  calculateHospitalMetrics();
  loadPrinterDropdowns();
  filterHistoryTable();
  if (typeof filterPrintersList === "function") filterPrintersList();
  if (typeof filterStockList === "function") filterStockList();
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
  // Date is auto handled on backend submission (Column C)
}

// ── Submit Daily Entry (Supports Offline IndexedDB & Online Sync) ──
async function submitEntry(event) {
  event.preventDefault();

  // 1. Check Real-Time Validation Constraints
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

  // Automatic Backend Fields
  const now = new Date();
  const timestamp = now.toLocaleString("en-IN");
  const email = currentUser?.email || "";
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  // Date format: DD/MM/YYYY (Column C in Form responses 1)
  const currentDate = `${dd}/${mm}/${yyyy}`;

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
    populateHeader(currentUser);
    initHospitalState();

    // Init push notifications (subscribe + show SuperAdmin panel if applicable)
    if (typeof initNotifications === "function") {
      initNotifications().catch(e => console.warn("[Notifications] init error:", e.message));
    }

    await loadPrinterDropdowns();
    await loadHistory();
    setDefaultDate();
    toggleIssueReceiveFields();
    showLoader(false);
    
    // Always default to Landing Dashboard after login!
    showTab("dashboard");
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
  if (dashNameEl)  dashNameEl.textContent  = user.name || user.email || "User";

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
  const container = document.getElementById("employees-cards-grid");
  const countBadge = document.getElementById("employees-count-badge");
  if (countBadge) countBadge.textContent = "Connecting to Google Sheet...";

  try {
    isEmployeesLoading = true;
    const res = await sheetsRequest("getEmployees");
    if (res && res.employees) {
      allEmployeeItems = res.employees;
    } else {
      allEmployeeItems = [];
    }
  } catch (err) {
    console.warn("[Employees] Failed to fetch user_hospitals tab:", err.message);
    // Fallback: If sheet tab is empty or fresh, populate SuperAdmins
    if (!allEmployeeItems.length && currentUser) {
      allEmployeeItems = [
        { id: "EMP-101", name: currentUser.displayName || currentUser.email.split("@")[0], email: currentUser.email, phone: "+91 94140 XXXXX", hospital: "ALL", role: "SuperAdmin" }
      ];
    }
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
  const searchVal = document.getElementById("employee-search-input")?.value?.toLowerCase().trim() || "";

  if (!container) return;

  const filtered = allEmployeeItems.filter(e => {
    if (!isHospitalVisible(e.hospital)) return false;
    if (activeEmployeeHospitalFilter !== "ALL" && !e.hospital.includes(activeEmployeeHospitalFilter)) return false;
    const str = `${e.name} ${e.email} ${e.phone} ${e.hospital} ${e.role} ${e.id}`.toLowerCase();
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
    const initials = (emp.name || emp.email).split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
    return `
      <div class="employee-card-item">
        <div>
          <div class="emp-card-header">
            <div class="emp-avatar-circle">${escapeHtml(initials)}</div>
            <div class="emp-name-block">
              <div class="emp-full-name">${escapeHtml(emp.name)}</div>
              <div class="emp-role-tag">${escapeHtml(emp.role)} • <span class="badge" style="background:rgba(59,130,246,0.1); color:#1d4ed8;">${escapeHtml(emp.hospital)}</span></div>
            </div>
          </div>

          <div class="emp-details-grid">
            <div class="emp-detail-row"><span>📧 Email:</span> <strong style="color:var(--text);">${escapeHtml(emp.email)}</strong></div>
            <div class="emp-detail-row"><span>📞 Phone:</span> <strong style="color:var(--text);">${escapeHtml(emp.phone)}</strong></div>
            <div class="emp-detail-row"><span>🆔 Badge ID:</span> <code>${escapeHtml(emp.id)}</code></div>
          </div>
        </div>

        <div class="emp-card-footer">
          <button type="button" class="arrow-btn" style="width: auto; padding: 4px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; color: #1e40af; background: rgba(59, 130, 246, 0.1);" onclick="openIdCardModal('${escapeHtml(emp.name)}', '${escapeHtml(emp.email)}', '${escapeHtml(emp.phone)}', '${escapeHtml(emp.hospital)}', '${escapeHtml(emp.role)}', '${escapeHtml(emp.id)}')">
            🪪 View ID Card
          </button>
          <button type="button" class="printer-card-copy-btn" title="Copy Contact" onclick="copyContactDetails(event, '${escapeHtml(emp.name)}', '${escapeHtml(emp.phone)}', '${escapeHtml(emp.email)}', '${escapeHtml(emp.hospital)}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

// ── Open Digital ID Card Modal ──
function openIdCardModal(name, email, phone, hospital, role, id) {
  const modal = document.getElementById("id-card-modal");
  const nameEl = document.getElementById("idc-name");
  const emailEl = document.getElementById("idc-email");
  const phoneEl = document.getElementById("idc-phone");
  const hospEl = document.getElementById("idc-hospital");
  const roleEl = document.getElementById("idc-role");
  const idEl = document.getElementById("idc-id");
  const avatarEl = document.getElementById("idc-avatar");

  if (modal) modal.style.display = "flex";
  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = email;
  if (phoneEl) phoneEl.textContent = phone;
  if (hospEl) hospEl.textContent = `${hospital} HOSPITAL`;
  if (roleEl) roleEl.textContent = role.toUpperCase();
  if (idEl) idEl.textContent = id;
  if (avatarEl) avatarEl.textContent = (name || email).split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

function closeIdCardModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById("id-card-modal");
  if (modal) modal.style.display = "none";
}

function printIdCard() {
  window.print();
}

// ── Add Employee Modal & Live 2-Way Google Sheet Sync ──
function openAddEmployeeModal() {
  const modal = document.getElementById("add-employee-modal");
  if (modal) modal.style.display = "flex";
}

function closeAddEmployeeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById("add-employee-modal");
  if (modal) modal.style.display = "none";
}

async function handleSaveEmployee(e) {
  e.preventDefault();
  const name = document.getElementById("emp-name-input")?.value?.trim() || "";
  const email = document.getElementById("emp-email-input")?.value?.trim().toLowerCase() || "";
  const phone = document.getElementById("emp-phone-input")?.value?.trim() || "+91 94140 XXXXX";
  const hospital = document.getElementById("emp-hospital-input")?.value || "MDM";
  const role = document.getElementById("emp-role-input")?.value || "Operator";
  const saveBtn = document.getElementById("emp-save-btn");

  if (!name || !email) {
    showToast("Name and email are required.", "error");
    return;
  }

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="spinner"></span> Saving to Sheet...`;
    }

    // Live Server-Side Append to user_hospitals Google Sheet Tab
    const res = await sheetsRequest("addEmployee", {
      method: "POST",
      body: JSON.stringify({ email, hospital, role })
    });

    const newId = `EMP-${100 + (allEmployeeItems.length + 1)}`;
    allEmployeeItems.unshift({ id: newId, name, email, phone, hospital, role });

    showToast(`✅ Member ${name} (${email}) saved to Google Sheet (user_hospitals)!`, "success");
    closeAddEmployeeModal();
    document.getElementById("add-employee-form")?.reset();
    renderEmployeesList();
  } catch (err) {
    showToast(`Failed to save to Google Sheet: ${err.message}`, "error");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `💾 Save Member`;
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
  if (typeof XLSX === "undefined") {
    showToast("Excel export library loading...", "error");
    return;
  }
  const filtered = allEmployeeItems.filter(e => {
    if (!isHospitalVisible(e.hospital)) return false;
    if (activeEmployeeHospitalFilter !== "ALL" && !e.hospital.includes(activeEmployeeHospitalFilter)) return false;
    return true;
  });

  const exportData = filtered.map((e, idx) => ({
    "S.No": idx + 1,
    "Employee ID": e.id,
    "Full Name": e.name,
    "Designation": e.role,
    "Assigned Hospital": e.hospital,
    "Email Address": e.email,
    "Mobile Number": e.phone
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
  XLSX.writeFile(workbook, `SNMC_Employee_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast(`📊 Exported ${filtered.length} members to Excel!`, "success");
}
