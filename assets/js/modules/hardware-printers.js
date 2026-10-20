// ============================================================
// hardware-printers.js — Printers Directory & Details Module
// Softtech SNMC PrintTrack PWA
// Extracted from monolithic app.js (Domain Modularization)
// ============================================================

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
