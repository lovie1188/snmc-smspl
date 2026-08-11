// ============================================================
// app.js — PrintTrack Main Application Logic (Dashboard Landing)
// ============================================================

let printerData = { headers: [], rows: [] };
let currentUser = null;
let currentSerialNo = 1;

const EXPECTED_HEADERS = [
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

// ── Boot ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  try {
    showLoader(true);
    const auth = await requireAuth();
    currentUser = auth.user;
    populateHeader(currentUser);
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
