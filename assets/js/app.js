// ============================================================
// app.js — PrintTrack Main Application Logic (Dashboard Landing)
// ============================================================

let allDailyRows = [];

const EXPECTED_HEADERS = [
  "Timestamp",        // Col A
  "Email address",    // Col B
  "Date",             // Col C
  "counter Number",   // Col D
  "Paper Recieved",   // Col E
  "Paper Issued",     // Col F
  "ISSUE / RECEIVE",  // Col G
  "BALANCE",          // Col H
  "REMARK",           // Col I
  "Opening reading",  // Col J
  "Closing Reading"   // Col K
];

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

  // Extract base Counter ID (e.g., "Counter9" or "Counter8") to match Google Sheets rows accurately
  const cleanCounter = selectedCounter.split(" ")[0].trim();

  if (titleEl) titleEl.textContent = `History — ${selectedCounter}`;

  // 1. Filter history for selected counter flexibly
  const counterRows = allDailyRows.filter(r => {
    const rawVal = Object.values(r).join(" ");
    return rawVal.includes(cleanCounter) || rawVal.includes(selectedCounter);
  });

  // 2. Auto-set Opening Reading from latest entry of selected counter (Column K / Closing Reading)
  const openingEl = document.getElementById("opening-reading");
  if (openingEl) {
    let foundPrevClosing = "";
    if (counterRows.length > 0) {
      // Find latest entry with non-empty Closing Reading
      for (const entry of counterRows) {
        const val = entry["Closing Reading"] || entry["Closing"] || entry["closing"] || "";
        if (val !== "" && !isNaN(val)) {
          foundPrevClosing = String(val).trim();
          break;
        }
      }
    }
    openingEl.value = foundPrevClosing !== "" ? foundPrevClosing : "0";
    calcBalance();
  }

  // 3. Render Counter History Table below form
  if (!counterRows.length) {
    if (tbody) tbody.innerHTML = "";
    if (noHist) {
      noHist.style.display = "block";
      noHist.textContent = `No previous records found for Counter ${selectedCounter}.`;
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
      const type    = r["ISSUE / RECEIVE"] || "ISSUE";
      const remark  = r["REMARK"] || r["Remark"] || "";

      const typeClass = type === "RECEIVE" ? "badge-receive" : "badge-issue";

      return `<tr>
        <td>${date}</td>
        <td><strong>${counter}</strong></td>
        <td>${opening}</td>
        <td>${closing}</td>
        <td><strong>${balance}</strong></td>
        <td>${issued}</td>
        <td>${recieved}</td>
        <td><span class="badge ${typeClass}">${type}</span></td>
        <td>${remark}</td>
      </tr>`;
    }).join("");
  }
}

// ── Load printerdetails → dropdowns ──────────────────────
async function loadPrinterDropdowns() {
  try {
    printerData = await fetchPrinterDetails();
    if (!printerData.rows.length) {
      showToast("printerdetails sheet is empty or unreachable.", "warn");
      return;
    }

    const selectEl = document.getElementById("counter-select");
    if (!selectEl) return;

    selectEl.innerHTML = `<option value="">— Select Counter No. —</option>`;
    
    printerData.rows.forEach(r => {
      const counterNo   = r["Counter No."] || r["Counter No"] || r["Counter"] || Object.values(r)[0] || "";
      const hospital    = r["Hospital"] || "";
      const counterName = r["Counter_name"] || r["Counter Name"] || "";
      
      if (counterNo) {
        const label = `${counterNo} ${counterName ? '— ' + counterName : ''} ${hospital ? '[' + hospital + ']' : ''}`.trim();
        const opt = document.createElement("option");
        opt.value = counterNo;
        opt.textContent = label;
        selectEl.appendChild(opt);
      }
    });
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

    currentSerialNo = rows.length + 1;

    if (!rows.length) {
      if (noData) noData.style.display = "block";
      return;
    }
    if (noData) noData.style.display = "none";

    const displayHeaders = [
      "Date", "counter Number", "Opening reading", "Closing Reading",
      "BALANCE", "Paper Issued", "Paper Recieved", "ISSUE / RECEIVE", "REMARK"
    ];

    const thead = document.getElementById("history-head");
    if (thead) {
      thead.innerHTML = `<tr>${displayHeaders.map(h => `<th>${h}</th>`).join("")}</tr>`;
    }

    rows.forEach(row => {
      const tr = document.createElement("tr");
      
      const cellsHtml = displayHeaders.map(h => {
        let val = row[h] !== undefined ? row[h] : "";
        if (h.toLowerCase().includes("issue / receive") || h.toLowerCase() === "type") {
          const typeClass = val === "RECEIVE" ? "badge-receive" : "badge-issue";
          return `<td><span class="badge ${typeClass}">${val || "ISSUE"}</span></td>`;
        }
        return `<td>${val}</td>`;
      }).join("");

      tr.innerHTML = cellsHtml;
      tbody.appendChild(tr);
    });

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

// ── Submit Daily Entry (Columns A to K) ──────────────────
async function submitEntry(event) {
  event.preventDefault();
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

  // Automatic Backend Fields
  const now = new Date();
  const timestamp = now.toLocaleString("en-IN");
  const email = currentUser?.email || "";
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const currentDate = `${yyyy}-${mm}-${dd}`;

  // Column Mapping A to K:
  // A: Timestamp, B: Email, C: Date, D: counter Number, E: Paper Recieved,
  // F: Paper Issued, G: ISSUE / RECEIVE, H: BALANCE, I: REMARK, J: Opening reading, K: Closing Reading
  const row = [
    timestamp,
    email,
    currentDate,
    counter,
    paperRecieved,
    paperIssued,
    issueReceive,
    balance,
    remark,
    opening,
    closing
  ];

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Saving...`;

  try {
    await appendDailyEntry(row);
    showToast("✅ Entry saved to Google Sheets!", "success");
    document.getElementById("entry-form").reset();
    toggleIssueReceiveFields();
    await loadHistory();
  } catch (err) {
    showToast("❌ Failed: " + err.message, "error");
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
    currentUser = auth.user;
    populateHeader(currentUser);

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
    console.error("App boot error:", err);
  }
});


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

// ── Smart Conditional Logic for ISSUE / RECEIVE ───────────
function toggleIssueReceiveFields() {
  const typeVal       = document.getElementById("issue-receive-select")?.value || "ISSUE";
  const groupRecieved = document.getElementById("group-rim-recieved");
  const groupIssued   = document.getElementById("group-rim-issued");
  
  const recInput      = document.getElementById("received-by");
  const issueInput    = document.getElementById("issued-by");
  const userName      = currentUser?.name || currentUser?.email || "";

  if (typeVal === "ISSUE") {
    if (groupRecieved) groupRecieved.style.display = "none";
    if (groupIssued)   groupIssued.style.display   = "block";
    
    if (issueInput) {
      issueInput.value = userName;
      issueInput.readOnly = true;
      issueInput.placeholder = "Auto (Google Account)";
    }
    if (recInput) {
      recInput.value = "";
      recInput.readOnly = false;
      recInput.placeholder = "Enter Receiver Name";
    }

  } else if (typeVal === "RECEIVE") {
    if (groupRecieved) groupRecieved.style.display = "block";
    if (groupIssued)   groupIssued.style.display   = "none";

    if (recInput) {
      recInput.value = userName;
      recInput.readOnly = true;
      recInput.placeholder = "Auto (Google Account)";
    }
    if (issueInput) {
      issueInput.value = "";
      issueInput.readOnly = false;
      issueInput.placeholder = "Enter Issuer Name";
    }

  } else {
    if (groupRecieved) groupRecieved.style.display = "block";
    if (groupIssued)   groupIssued.style.display   = "block";
    
    if (recInput)   { recInput.value = userName; recInput.readOnly = false; }
    if (issueInput) { issueInput.value = ""; issueInput.readOnly = false; }
  }
  
  calcBalance();
}

// ── Load printerdetails → dropdowns ──────────────────────
async function loadPrinterDropdowns() {
  try {
    printerData = await fetchPrinterDetails();
    if (!printerData.rows.length) {
      showToast("printerdetails sheet is empty or unreachable.", "warn");
      return;
    }

    const selectEl = document.getElementById("counter-select");
    if (!selectEl) return;

    selectEl.innerHTML = `<option value="">— Select Counter No. —</option>`;
    
    printerData.rows.forEach(r => {
      const counterNo   = r["Counter No."] || r["Counter No"] || r["Counter"] || Object.values(r)[0] || "";
      const hospital    = r["Hospital"] || "";
      const counterName = r["Counter_name"] || r["Counter Name"] || "";
      
      if (counterNo) {
        const label = `${counterNo} ${counterName ? '— ' + counterName : ''} ${hospital ? '[' + hospital + ']' : ''}`.trim();
        const opt = document.createElement("option");
        opt.value = counterNo;
        opt.textContent = label;
        selectEl.appendChild(opt);
      }
    });
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

    if (loading) loading.style.display = "none";

    currentSerialNo = rows.length + 1;
    const snoEl = document.getElementById("serial-no");
    if (snoEl) snoEl.value = currentSerialNo;

    if (!rows.length) {
      if (noData) noData.style.display = "block";
      return;
    }
    if (noData) noData.style.display = "none";

    const displayHeaders = headers.length ? headers : EXPECTED_HEADERS;

    const thead = document.getElementById("history-head");
    if (thead) {
      thead.innerHTML = `<tr>${displayHeaders.map(h => `<th>${h}</th>`).join("")}</tr>`;
    }

    rows.forEach(row => {
      const tr = document.createElement("tr");
      
      const cellsHtml = displayHeaders.map(h => {
        let val = row[h] !== undefined ? row[h] : "";
        if (h.toLowerCase().includes("issue / receive") || h.toLowerCase() === "type") {
          const typeClass = val === "RECEIVE" ? "badge-receive" : "badge-issue";
          return `<td><span class="badge ${typeClass}">${val || "ISSUE"}</span></td>`;
        }
        return `<td>${val}</td>`;
      }).join("");

      tr.innerHTML = cellsHtml;
      tbody.appendChild(tr);
    });

  } catch (err) {
    if (loading) loading.style.display = "none";
    showToast("History load failed: " + err.message, "error");
  }
}

function setDefaultDate() {
  const dateEl = document.getElementById("entry-date");
  if (dateEl) {
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, "0");
    const dd    = String(today.getDate()).padStart(2, "0");
    dateEl.value = `${yyyy}-${mm}-${dd}`;
  }
}

function calcBalance() {
  const recieved = parseFloat(document.getElementById("rim-recieved")?.value || 0);
  const issued   = parseFloat(document.getElementById("rim-issued")?.value || 0);
  
  const balEl    = document.getElementById("rim-balance");
  if (balEl) {
    const diff = (recieved - issued);
    balEl.value = diff;
    balEl.style.color = diff < 0 ? "#ef4444" : "";
  }
}

async function submitEntry(event) {
  event.preventDefault();
  const btn = document.getElementById("submit-btn");

  const serialNo     = document.getElementById("serial-no")?.value || currentSerialNo;
  const date         = document.getElementById("entry-date")?.value?.trim();
  const counter      = document.getElementById("counter-select")?.value?.trim();
  const opening      = document.getElementById("opening-reading")?.value?.trim() || "";
  const closing      = document.getElementById("closing-reading")?.value?.trim() || "";
  const issueReceive = document.getElementById("issue-receive-select")?.value || "ISSUE";
  const recieved     = document.getElementById("rim-recieved")?.value?.trim() || "0";
  const issued       = document.getElementById("rim-issued")?.value?.trim() || "0";
  const balance      = document.getElementById("rim-balance")?.value?.trim() || "0";
  const remark       = document.getElementById("remark")?.value?.trim() || "";
  const receivedBy   = document.getElementById("received-by")?.value?.trim() || "";
  const issuedBy     = document.getElementById("issued-by")?.value?.trim() || "";

  if (!date || !counter) {
    showToast("Please select Date and Counter Number.", "warn");
    return;
  }

  const row = [
    serialNo,
    date,
    counter,
    opening,
    closing,
    issueReceive,
    recieved,
    issued,
    balance,
    remark,
    receivedBy,
    issuedBy
  ];

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Saving...`;

  try {
    await appendDailyEntry(row);
    showToast("✅ Entry saved to Google Sheets!", "success");
    document.getElementById("entry-form").reset();
    setDefaultDate();
    toggleIssueReceiveFields();
    await loadHistory();
    showTab("history");
  } catch (err) {
    showToast("❌ Failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Save Entry`;
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
