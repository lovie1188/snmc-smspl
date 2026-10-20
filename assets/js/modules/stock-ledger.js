// ============================================================
// stock-ledger.js — Dedicated Stock & Consumables Ledger Module
// Softtech SNMC PrintTrack PWA
// Extracted from monolithic app.js (Domain Modularization)
// ============================================================

// ── DEDICATED STOCK (RECEIVED PAPER & CONSUMABLES) PAGE ──────
let activeStockHospitalFilter = "ALL";
let activeStockCategoryFilter = "ALL";

async function loadStockPage() {
  try {
    const data = await fetchStockEntries();
    allStockRows = data.rows || [];
    populateStockCategoryPills();
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

function filterStockByCategory(category, btnEl) {
  activeStockCategoryFilter = category;
  document.querySelectorAll("#stock-category-pills .pill-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  renderStockList();
}

function filterStockList() {
  renderStockList();
}

function syncStockUnitPer(val) {
  const perInput = document.getElementById("stock-new-per");
  if (perInput && !perInput.dataset.manualEdit) {
    perInput.value = val;
  }
}

// Dynamically extract unique categories from sheet rows and update category pills & form dropdown
function populateStockCategoryPills() {
  const standardCats = ["Paper", "Toner", "Accessories"];
  const dynamicCats = new Set(standardCats);

  if (Array.isArray(allStockRows)) {
    allStockRows.forEach(r => {
      const c = (r["Item Type"] || "").trim();
      if (c && c !== "N/A" && c !== "-") {
        dynamicCats.add(c);
      }
    });
  }

  // Populate category filter pills
  const pillsContainer = document.getElementById("stock-category-pills");
  if (pillsContainer) {
    let html = `<button type="button" class="pill-btn ${activeStockCategoryFilter === 'ALL' ? 'active' : ''}" onclick="filterStockByCategory('ALL', this)">All Items</button>`;
    dynamicCats.forEach(cat => {
      let icon = "📦";
      if (cat.toLowerCase().includes("paper")) icon = "📄";
      else if (cat.toLowerCase().includes("toner") || cat.toLowerCase().includes("cartridge")) icon = "🖨️";
      else if (cat.toLowerCase().includes("access") || cat.toLowerCase().includes("cable")) icon = "🔌";
      
      const isActive = activeStockCategoryFilter.toLowerCase() === cat.toLowerCase() ? "active" : "";
      html += `<button type="button" class="pill-btn ${isActive}" onclick="filterStockByCategory('${escapeHtml(cat)}', this)">${icon} ${escapeHtml(cat)}</button>`;
    });
    pillsContainer.innerHTML = html;
  }

  // Populate form category dropdown options
  const formSelect = document.getElementById("stock-new-itemtype");
  if (formSelect) {
    const currentVal = formSelect.value;
    let optHtml = `
      <option value="Paper">📄 Paper Rims</option>
      <option value="Toner">🖨️ Toner Cartridge</option>
      <option value="Accessories">🔌 Accessories / Other</option>
    `;
    dynamicCats.forEach(cat => {
      if (!standardCats.includes(cat)) {
        optHtml += `<option value="${escapeHtml(cat)}">📦 ${escapeHtml(cat)}</option>`;
      }
    });
    optHtml += `<option value="__NEW__">➕ Add New Category...</option>`;
    formSelect.innerHTML = optHtml;
    if (currentVal && formSelect.querySelector(`option[value="${currentVal}"]`)) {
      formSelect.value = currentVal;
    }
  }
}

function renderStockList() {
  const container = document.getElementById("stock-cards-container");
  const noStock = document.getElementById("no-stock");
  const totalRimsEl = document.getElementById("stock-total-rims");
  const totalSheetsEl = document.getElementById("stock-total-sheets");
  const searchVal = document.getElementById("stock-search-input")?.value?.toLowerCase().trim() || "";
  const dateVal = document.getElementById("stock-date-filter")?.value || "";

  // SuperAdmin Add Stock button toggle
  const addStockBtn = document.getElementById("btn-add-stock-entry");
  if (addStockBtn) {
    const userIsSuper = typeof isSuperAdmin === "function" && isSuperAdmin(currentUser?.email || "");
    addStockBtn.style.display = userIsSuper ? "inline-flex" : "none";
  }

  // Convert HTML date (YYYY-MM-DD) to Sheet Date format (DD-MM-YYYY)
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

    // Category filter check
    if (activeStockCategoryFilter !== "ALL") {
      const itemCat = (r["Item Type"] || "").toLowerCase().trim();
      const desc = (r["Description Of Goods"] || "").toLowerCase().trim();
      const targetCat = activeStockCategoryFilter.toLowerCase();
      
      let matchesCategory = false;
      if (itemCat) {
        matchesCategory = itemCat.includes(targetCat) || targetCat.includes(itemCat);
      } else {
        // Fallback for legacy rows
        if (targetCat.includes("paper") && (desc.includes("paper") || desc.includes("rim") || desc.includes("a4"))) matchesCategory = true;
        else if (targetCat.includes("toner") && desc.includes("toner")) matchesCategory = true;
        else if (targetCat.includes("access") && (desc.includes("cable") || desc.includes("drum") || desc.includes("access"))) matchesCategory = true;
      }
      if (!matchesCategory) return false;
    }

    const rowStr = Object.values(r).join(" ").toLowerCase();
    const matchesSearch = !searchVal || rowStr.includes(searchVal);
    const rowDate = String(r["Date"] || "").trim();
    const matchesDate = !dateVal || rowDate === targetDateFormatted || rowDate.includes(targetDateFormatted);
    return matchesSearch && matchesDate;
  });

  // Calculate overall totals and hospital-wise breakdown
  let totalRims = 0;
  let totalSheets = 0;
  const hospBreakdown = {
    MDM: { rims: 0, sheets: 0 },
    MGH: { rims: 0, sheets: 0 },
    UMMED: { rims: 0, sheets: 0 }
  };

  filtered.forEach(r => {
    const itemCat = (r["Item Type"] || "").toLowerCase().trim();
    const desc = (r["Description Of Goods"] || "").toLowerCase().trim();
    const isPaper = itemCat ? itemCat === "paper" : (desc.includes("paper") || desc.includes("rim") || desc.includes("a4"));
    const rims = parseFloat(r["Qualtity"] || r["Quantity"] || 0) || 0;
    const sheets = isPaper ? (parseFloat(r["PAPER Quantity"] || 0) || (rims * 500)) : 0;
    totalRims += rims;
    totalSheets += sheets;

    const h = (r["HOSPITAL"] || "").toUpperCase();
    if (h.includes("MDM")) {
      hospBreakdown.MDM.rims += rims;
      hospBreakdown.MDM.sheets += sheets;
    } else if (h.includes("MGH")) {
      hospBreakdown.MGH.rims += rims;
      hospBreakdown.MGH.sheets += sheets;
    } else if (h.includes("UMMED") || h.includes("UMAID")) {
      hospBreakdown.UMMED.rims += rims;
      hospBreakdown.UMMED.sheets += sheets;
    }
  });

  // Dynamically update KPI card labels based on active Category
  const kpiLbl1 = document.getElementById("stock-kpi-lbl-1");
  const kpiSub1 = document.getElementById("stock-kpi-sub-1");
  const kpiLbl2 = document.getElementById("stock-kpi-lbl-2");
  const kpiSub2 = document.getElementById("stock-kpi-sub-2");

  const catLower = activeStockCategoryFilter.toLowerCase();
  if (catLower === "paper") {
    if (kpiLbl1) kpiLbl1.textContent = "Total Rims Received";
    if (kpiSub1) kpiSub1.textContent = "Rim Packets (Col E)";
    if (kpiLbl2) kpiLbl2.textContent = "Total Paper Sheets";
    if (kpiSub2) kpiSub2.textContent = "500 Sheets / Rim (Col M)";
  } else if (catLower.includes("toner")) {
    if (kpiLbl1) kpiLbl1.textContent = "Total Toners Received";
    if (kpiSub1) kpiSub1.textContent = "Cartridge Units (Col E)";
    if (kpiLbl2) kpiLbl2.textContent = "Paper Sheets (N/A)";
    if (kpiSub2) kpiSub2.textContent = "Not applicable for Toner";
  } else if (catLower !== "all") {
    if (kpiLbl1) kpiLbl1.textContent = `Total ${activeStockCategoryFilter} Units`;
    if (kpiSub1) kpiSub1.textContent = "Quantity Received (Col E)";
    if (kpiLbl2) kpiLbl2.textContent = "Paper Sheets (N/A)";
    if (kpiSub2) kpiSub2.textContent = "Only applies to Paper";
  } else {
    if (kpiLbl1) kpiLbl1.textContent = "Total Quantity Received";
    if (kpiSub1) kpiSub1.textContent = "Rims & Units (Col E)";
    if (kpiLbl2) kpiLbl2.textContent = "Total Paper Sheets";
    if (kpiSub2) kpiSub2.textContent = "500 Sheets / Rim (Col M)";
  }

  // Update KPI Totals with count-up animation if available
  if (totalRimsEl) {
    if (typeof animateCountUp === "function") {
      animateCountUp(totalRimsEl, totalRims, 350);
    } else {
      totalRimsEl.textContent = totalRims.toLocaleString("en-IN");
    }
  }
  if (totalSheetsEl) {
    if (typeof animateCountUp === "function") {
      animateCountUp(totalSheetsEl, totalSheets, 350);
    } else {
      totalSheetsEl.textContent = totalSheets.toLocaleString("en-IN");
    }
  }

  // Update Hospital-Wise Breakdown Cards
  const mdmRimsEl = document.getElementById("shb-mdm-rims");
  const mdmSheetsEl = document.getElementById("shb-mdm-sheets");
  const mghRimsEl = document.getElementById("shb-mgh-rims");
  const mghSheetsEl = document.getElementById("shb-mgh-sheets");
  const ummedRimsEl = document.getElementById("shb-ummed-rims");
  const ummedSheetsEl = document.getElementById("shb-ummed-sheets");

  const qtyUnitLabel = catLower === "paper" ? "Rims" : (catLower.includes("toner") ? "Toners" : "Units");
  if (mdmRimsEl) mdmRimsEl.textContent = `${hospBreakdown.MDM.rims.toLocaleString("en-IN")} ${qtyUnitLabel}`;
  if (mdmSheetsEl) mdmSheetsEl.textContent = `${hospBreakdown.MDM.sheets.toLocaleString("en-IN")} Pgs`;
  if (mghRimsEl) mghRimsEl.textContent = `${hospBreakdown.MGH.rims.toLocaleString("en-IN")} ${qtyUnitLabel}`;
  if (mghSheetsEl) mghSheetsEl.textContent = `${hospBreakdown.MGH.sheets.toLocaleString("en-IN")} Pgs`;
  if (ummedRimsEl) ummedRimsEl.textContent = `${hospBreakdown.UMMED.rims.toLocaleString("en-IN")} ${qtyUnitLabel}`;
  if (ummedSheetsEl) ummedSheetsEl.textContent = `${hospBreakdown.UMMED.sheets.toLocaleString("en-IN")} Pgs`;

  if (!filtered.length) {
    container.innerHTML = "";
    if (noStock) noStock.style.display = "block";
    return;
  }

  if (noStock) noStock.style.display = "none";

  container.innerHTML = filtered.map((r, idx) => {
    const date = r["Date"] || "";
    const invoiceNo = r["Invoice No."] || "N/A";
    const desc = r["Description Of Goods"] || "Paper Supply";
    const qtyVal = r["Qualtity"] || r["Quantity"] || "0";
    const unitVal = r["UNIT"] || "PCS";
    const sheets = r["PAPER Quantity"] || String(parseFloat(qtyVal) * 500);
    const hosp = r["HOSPITAL"] || "";
    const rawTotal = parseFloat(r["TOTAL"] || r["Amount"] || 0) || 0;
    const formattedTotal = rawTotal > 0 ? `₹${rawTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—";
    const itemType = r["Item Type"] || (desc.toLowerCase().includes("toner") ? "Toner" : "Paper");
    const itemIcon = itemType.toLowerCase().includes("toner") ? "🖨️" : (itemType.toLowerCase().includes("access") ? "🔌" : "📄");

    return `
      <div class="history-card-item stock-entry-card" onclick="openStockDetailModalByIndex(${idx})" style="cursor:pointer;" title="Tap to view full invoice breakdown">
        <div class="history-card-header">
          <div>
            <div class="history-card-title">${itemIcon} ${escapeHtml(invoiceNo)}</div>
            <div class="history-card-date">📅 ${escapeHtml(date)} • ${escapeHtml(desc)}</div>
          </div>
          <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
            ${(r["Delivery Challen"] || r["Delivery Challan"] || "").trim() ? `
              <a href="${escapeHtml((r["Delivery Challen"] || r["Delivery Challan"]).trim())}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="badge" style="background:#fef3c7; color:#b45309; font-size:0.68rem; border:1px solid #fcd34d; text-decoration:none; cursor:pointer;" title="Delivery Challan (Tap to open Drive)">
                📋 Challan
              </a>
            ` : ''}
            ${(r["Invoice PDF Link"] || r["PDF Link"] || "").trim() ? `
              <a href="${escapeHtml((r["Invoice PDF Link"] || r["PDF Link"]).trim())}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="badge" style="background:#f0fdf4; color:#15803d; font-size:0.68rem; border:1px solid #86efac; text-decoration:none; cursor:pointer;" title="Purchase Invoice PDF (Tap to open Drive)">
                📄 PDF
              </a>
            ` : ''}
            <span class="badge" style="background:rgba(59,130,246,0.1); color:#1d4ed8; font-size:0.68rem; border:1px solid rgba(59,130,246,0.25);">
              ${escapeHtml(itemType)}
            </span>
            <span class="badge" style="background:rgba(16,185,129,0.1); color:#059669; font-size:0.68rem; border:1px solid rgba(16,185,129,0.25);">
              ${escapeHtml(hosp || "GENERAL")}
            </span>
          </div>
        </div>

        <div class="history-card-grid">
          <div class="history-card-stat">
            <span class="stat-label">Quantity / Unit</span>
            <span class="stat-val highlight">${escapeHtml(String(qtyVal))} ${escapeHtml(unitVal)}</span>
          </div>
          <div class="history-card-stat">
            <span class="stat-label">Paper Sheets</span>
            <span class="stat-val" style="color:#059669;">${itemType.toLowerCase() === 'paper' ? parseFloat(sheets || 0).toLocaleString("en-IN") + ' Pgs' : '—'}</span>
          </div>
          <div class="history-card-stat">
            <span class="stat-label">Invoice Amount</span>
            <span class="stat-val">${formattedTotal}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ── Stock Detail Modal (Full Invoice Information) ──────────
let activeFilteredStockRows = [];

function openStockDetailModalByIndex(idx) {
  const searchVal = document.getElementById("stock-search-input")?.value?.toLowerCase().trim() || "";
  const dateVal = document.getElementById("stock-date-filter")?.value || "";
  let targetDateFormatted = "";
  if (dateVal && dateVal.includes("-")) {
    const parts = dateVal.split("-");
    if (parts.length === 3) targetDateFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  activeFilteredStockRows = allStockRows.filter(r => {
    const hosp = (r["HOSPITAL"] || "").toUpperCase();
    if (!isHospitalVisible(hosp)) return false;
    if (activeStockHospitalFilter !== "ALL" && !hosp.includes(activeStockHospitalFilter)) return false;
    if (activeStockCategoryFilter !== "ALL") {
      const itemCat = (r["Item Type"] || "").toLowerCase().trim();
      const desc = (r["Description Of Goods"] || "").toLowerCase().trim();
      const targetCat = activeStockCategoryFilter.toLowerCase();
      let matchesCategory = false;
      if (itemCat) {
        matchesCategory = itemCat.includes(targetCat) || targetCat.includes(itemCat);
      } else {
        if (targetCat.includes("paper") && (desc.includes("paper") || desc.includes("rim") || desc.includes("a4"))) matchesCategory = true;
        else if (targetCat.includes("toner") && desc.includes("toner")) matchesCategory = true;
        else if (targetCat.includes("access") && (desc.includes("cable") || desc.includes("drum") || desc.includes("access"))) matchesCategory = true;
      }
      if (!matchesCategory) return false;
    }
    const rowStr = Object.values(r).join(" ").toLowerCase();
    const matchesSearch = !searchVal || rowStr.includes(searchVal);
    const rowDate = String(r["Date"] || "").trim();
    const matchesDate = !dateVal || rowDate === targetDateFormatted || rowDate.includes(targetDateFormatted);
    return matchesSearch && matchesDate;
  });

  const row = activeFilteredStockRows[idx];
  if (!row) return;

  const titleEl = document.getElementById("sdm-invoice-title");
  const dateSubEl = document.getElementById("sdm-date-sub");
  const bodyEl = document.getElementById("sdm-body");

  if (titleEl) titleEl.textContent = row["Invoice No."] || "Stock Receipt";
  if (dateSubEl) dateSubEl.textContent = `Date: ${row["Date"] || "N/A"} • Hospital: ${row["HOSPITAL"] || "General"}`;

  const rims = parseFloat(row["Qualtity"] || row["Quantity"] || 0) || 0;
  const itemType = row["Item Type"] || "Paper";
  const isPaper = itemType.toLowerCase() === "paper";
  const sheets = isPaper ? (parseFloat(row["PAPER Quantity"] || 0) || (rims * 500)) : 0;
  const rate = row["Rate"] ? `₹${parseFloat(row["Rate"]).toLocaleString("en-IN")}` : "—";
  const rateTax = row["Rate Inc of TAX"] ? `₹${parseFloat(row["Rate Inc of TAX"]).toLocaleString("en-IN")}` : "—";
  const amount = row["Amount"] ? `₹${parseFloat(row["Amount"]).toLocaleString("en-IN")}` : "—";
  const total = row["TOTAL"] ? `₹${parseFloat(row["TOTAL"]).toLocaleString("en-IN")}` : "—";
  const challanLink = (row["Delivery Challen"] || row["Delivery Challan"] || row["Challan"] || "").trim();
  const pdfLink = (row["Invoice PDF Link"] || row["PDF Link"] || row["Invoice PDF"] || "").trim();

  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="background:#f8fafc; border-radius:14px; padding:12px 14px; border:1px solid #e2e8f0;">
        <div style="font-size:0.88rem; font-weight:800; color:#0f172a; margin-bottom:4px;">${escapeHtml(row["Description Of Goods"] || "Stock Supply")}</div>
        <div style="color:#64748b; font-size:0.75rem;">HSN/SAC: <strong>${escapeHtml(row["HSN/SAC"] || "N/A")}</strong> • Category: <strong style="color:#1d4ed8;">${escapeHtml(itemType)}</strong></div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:10px 12px;">
          <div style="font-size:0.7rem; color:#1e40af; font-weight:700;">QUANTITY & UNIT</div>
          <div style="font-size:1.05rem; font-weight:800; color:#1d4ed8;">${rims.toLocaleString("en-IN")} ${row["UNIT"] || "PCS"}</div>
          <div style="font-size:0.68rem; color:#3b82f6;">Per: ${row["per"] || row["UNIT"] || "PCS"}</div>
        </div>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:10px 12px;">
          <div style="font-size:0.7rem; color:#166534; font-weight:700;">PAPER SHEETS (IF PAPER)</div>
          <div style="font-size:1.05rem; font-weight:800; color:#15803d;">${itemType.toLowerCase() === 'paper' ? sheets.toLocaleString("en-IN") + ' Pgs' : 'N/A'}</div>
        </div>
      </div>

      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:12px 14px;">
        <div style="font-weight:700; font-size:0.78rem; color:#334155; margin-bottom:8px; border-bottom:1px dashed #e2e8f0; padding-bottom:4px;">Billing & Tax Breakdown</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.76rem;">
          <div>Rate (Excl. Tax): <strong>${rate}</strong></div>
          <div>Rate (Inc. Tax): <strong>${rateTax}</strong></div>
          <div>Subtotal Amount: <strong>${amount}</strong></div>
          <div>Total (With Tax): <strong style="color:#0f172a; font-size:0.85rem;">${total}</strong></div>
        </div>
      </div>

      ${challanLink ? `
        <div style="background:#fffbeb; border:1px solid #fcd34d; border-radius:14px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="font-size:0.78rem; color:#92400e; font-weight:700;">📋 Delivery Challan:</div>
          <a href="${escapeHtml(challanLink)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:6px; background:#d97706; color:#ffffff; padding:6px 14px; border-radius:20px; font-size:0.75rem; font-weight:800; text-decoration:none; box-shadow:0 2px 6px rgba(217,119,6,0.25);">
            View Challan Drive ↗
          </a>
        </div>
      ` : ''}
      ${pdfLink ? `
        <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:14px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="font-size:0.78rem; color:#166534; font-weight:700;">📄 Purchase Invoice PDF:</div>
          <a href="${escapeHtml(pdfLink)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:6px; background:#15803d; color:#ffffff; padding:6px 14px; border-radius:20px; font-size:0.75rem; font-weight:800; text-decoration:none; box-shadow:0 2px 6px rgba(21,128,61,0.25);">
            View PDF Drive ↗
          </a>
        </div>
      ` : ''}
    `;
  }

  const modal = document.getElementById("stock-detail-modal");
  if (modal) modal.style.display = "flex";
}

function closeStockDetailModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains("modal-close")) return;
  const modal = document.getElementById("stock-detail-modal");
  if (modal) modal.style.display = "none";
}

// ── WhatsApp Stock Summary Share ───────────────────────────
function shareStockSummaryWhatsApp() {
  if (!Array.isArray(allStockRows) || allStockRows.length === 0) {
    showToast("No stock records to share.", "warn");
    return;
  }

  const hospScope = activeStockHospitalFilter === "ALL" ? "All Hospitals (MDM, MGH, UMMED)" : `${activeStockHospitalFilter} Hospital`;
  const catScope = activeStockCategoryFilter === "ALL" ? "All Items" : `${activeStockCategoryFilter}`;
  let totalRims = 0;
  let totalSheets = 0;
  const filtered = allStockRows.filter(r => {
    const hosp = (r["HOSPITAL"] || "").toUpperCase();
    if (!isHospitalVisible(hosp)) return false;
    if (activeStockHospitalFilter !== "ALL" && !hosp.includes(activeStockHospitalFilter)) return false;
    if (activeStockCategoryFilter !== "ALL") {
      const itemCat = (r["Item Type"] || "").toLowerCase().trim();
      const targetCat = activeStockCategoryFilter.toLowerCase();
      if (itemCat && !itemCat.includes(targetCat)) return false;
    }
    return true;
  });

  filtered.forEach(r => {
    const rims = parseFloat(r["Qualtity"] || r["Quantity"] || 0) || 0;
    const sheets = parseFloat(r["PAPER Quantity"] || 0) || (rims * 500);
    totalRims += rims;
    totalSheets += sheets;
  });

  const todayStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const text = 
`📦 *SNMC PrintTrack — Paper & Stock Receipt Ledger*
🏥 *Hospital Scope:* ${hospScope}
📂 *Category:* ${catScope}
📅 *As of:* ${todayStr}
──────────────────────
📋 *Total Invoices/Receipts:* ${filtered.length}
📦 *Total Quantity Logged:* ${totalRims.toLocaleString("en-IN")} Units
📄 *Total Paper Sheets:* ${totalSheets.toLocaleString("en-IN")} Sheets
──────────────────────
_Generated via Softtech Multi Service Pvt. Ltd. (SNMC PrintTrack)_`;

  const encoded = encodeURIComponent(text);
  window.open(`https://wa.me/?text=${encoded}`, "_blank");
}

// ── Add Stock Entry Modal & Handlers (SuperAdmin) ───────────
function openAddStockModal() {
  const user = currentUser || getStoredUser() || {};
  const isSuper = typeof isSuperAdmin === "function" && isSuperAdmin(user.email || "");
  if (!isSuper) {
    showToast("🚫 Only SuperAdmins can add stock entries.", "error");
    return;
  }

  const modal = document.getElementById("add-stock-modal");
  const form = document.getElementById("add-stock-form");
  if (form) form.reset();

  // Set default date to today (YYYY-MM-DD)
  const today = new Date();
  const pad = n => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const dateInput = document.getElementById("stock-new-date");
  if (dateInput) dateInput.value = todayStr;

  const customCatBox = document.getElementById("stock-custom-category-box");
  if (customCatBox) customCatBox.style.display = "none";

  handleStockItemTypeChange();
  if (modal) modal.style.display = "flex";
}

function closeAddStockModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains("modal-close")) return;
  const modal = document.getElementById("add-stock-modal");
  if (modal) modal.style.display = "none";
}

function handleStockItemTypeChange() {
  const select = document.getElementById("stock-new-itemtype");
  const type = select?.value || "Paper";
  const customCatBox = document.getElementById("stock-custom-category-box");
  const customCatInput = document.getElementById("stock-new-custom-category");
  const qtyLbl = document.getElementById("stock-new-qty-lbl");
  const unitInput = document.getElementById("stock-new-unit");
  const perInput = document.getElementById("stock-new-per");
  const sheetsBox = document.getElementById("stock-new-sheets-box");
  const descInput = document.getElementById("stock-new-desc");

  if (type === "__NEW__") {
    if (customCatBox) customCatBox.style.display = "block";
    if (customCatInput) {
      customCatInput.focus();
      customCatInput.required = true;
    }
    if (qtyLbl) qtyLbl.textContent = "Quantity *";
    if (sheetsBox) sheetsBox.style.display = "none";
    if (unitInput) unitInput.value = "PCS";
    if (perInput) perInput.value = "PCS";
  } else {
    if (customCatBox) customCatBox.style.display = "none";
    if (customCatInput) {
      customCatInput.required = false;
      customCatInput.value = "";
    }

    if (type === "Paper") {
      if (qtyLbl) qtyLbl.textContent = "Paper Rims Quantity *";
      if (sheetsBox) sheetsBox.style.display = "flex";
      if (unitInput) unitInput.value = "PCS";
      if (perInput) perInput.value = "PCS";
      if (descInput && !descInput.value) descInput.placeholder = "e.g. JK ECO RISE A4 70GSM";
    } else if (type === "Toner") {
      if (qtyLbl) qtyLbl.textContent = "Toner Cartridges Quantity *";
      if (sheetsBox) sheetsBox.style.display = "none";
      if (unitInput) unitInput.value = "PCS";
      if (perInput) perInput.value = "PCS";
      if (descInput && !descInput.value) descInput.placeholder = "e.g. HP LaserJet 88A Black Toner";
    } else {
      if (qtyLbl) qtyLbl.textContent = "Item Quantity *";
      if (sheetsBox) sheetsBox.style.display = "none";
      if (unitInput) unitInput.value = "PCS";
      if (perInput) perInput.value = "PCS";
      if (descInput && !descInput.value) descInput.placeholder = "e.g. Printer Cable / Drum Unit";
    }
  }
  calculateStockTotals();
}

function calculateStockTotals() {
  const select = document.getElementById("stock-new-itemtype");
  const type = select?.value || "Paper";
  const qty = parseFloat(document.getElementById("stock-new-qty")?.value || 0) || 0;
  const rate = parseFloat(document.getElementById("stock-new-rate")?.value || 0) || 0;
  const rateTax = parseFloat(document.getElementById("stock-new-ratetax")?.value || 0) || 0;

  // Sheets calc
  const calcSheetsEl = document.getElementById("stock-new-calc-sheets");
  if (calcSheetsEl) {
    const totalSheets = type === "Paper" ? qty * 500 : 0;
    calcSheetsEl.textContent = `${totalSheets.toLocaleString("en-IN")} Sheets`;
  }

  // Amount & Total
  const amountInput = document.getElementById("stock-new-amount");
  const totalInput = document.getElementById("stock-new-total");

  if (rate > 0 && qty > 0 && amountInput) {
    amountInput.value = (rate * qty).toFixed(2);
  }
  if (rateTax > 0 && qty > 0 && totalInput) {
    totalInput.value = (rateTax * qty).toFixed(2);
  } else if (rate > 0 && qty > 0 && (!rateTax || rateTax === 0) && totalInput && !totalInput.value) {
    totalInput.value = (rate * qty).toFixed(2);
  }
}

async function submitStockEntry(event) {
  event.preventDefault();
  const submitBtn = document.getElementById("btn-submit-stock-entry");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ Saving...";
  }

  try {
    let itemType = document.getElementById("stock-new-itemtype")?.value || "Paper";
    if (itemType === "__NEW__") {
      const customCat = (document.getElementById("stock-new-custom-category")?.value || "").trim();
      if (!customCat) {
        showToast("Please enter a category name.", "warn");
        return;
      }
      itemType = customCat;
    }

    const hospital = document.getElementById("stock-new-hospital")?.value || "MDM";
    const rawDate = document.getElementById("stock-new-date")?.value || "";
    let formattedDate = "";
    if (rawDate && rawDate.includes("-")) {
      const p = rawDate.split("-");
      if (p.length === 3) formattedDate = `${p[2]}-${p[1]}-${p[0]}`; // DD-MM-YYYY
    } else {
      formattedDate = rawDate;
    }

    const invoiceNo = (document.getElementById("stock-new-invoice")?.value || "").trim();
    const desc = (document.getElementById("stock-new-desc")?.value || "").trim();
    const hsn = (document.getElementById("stock-new-hsn")?.value || "").trim();
    const qty = parseFloat(document.getElementById("stock-new-qty")?.value || 0) || 0;
    const unit = (document.getElementById("stock-new-unit")?.value || "PCS").trim();
    const rateTax = (document.getElementById("stock-new-ratetax")?.value || "").trim();
    const rate = (document.getElementById("stock-new-rate")?.value || "").trim();
    const per = (document.getElementById("stock-new-per")?.value || unit).trim();
    const amount = (document.getElementById("stock-new-amount")?.value || "").trim();
    const total = (document.getElementById("stock-new-total")?.value || "").trim();
    const paperQty = itemType.toLowerCase() === "paper" ? String(qty * 500) : "";
    const challanLink = (document.getElementById("stock-new-challan-link")?.value || "").trim();
    const pdfLink = (document.getElementById("stock-new-pdf-link")?.value || "").trim();

    // Build row conforming to Columns A:P:
    // [Date, Invoice No., Description Of Goods, HSN/SAC, Qualtity, UNIT, Rate Inc of TAX, Rate, per, Amount, TOTAL, HOSPITAL, PAPER Quantity, Item Type, Delivery Challen, Invoice PDF Link]
    const row = [
      formattedDate,
      invoiceNo,
      desc,
      hsn,
      String(qty),
      unit,
      rateTax,
      rate,
      per,
      amount,
      total,
      hospital,
      paperQty,
      itemType,
      challanLink,
      pdfLink
    ];

    await appendStockEntry(row);
    showToast("✅ Stock entry recorded successfully!", "success");
    closeAddStockModal();

    // Reload stock entries and refresh display
    await loadStockPage();
  } catch (err) {
    showToast("Stock save failed: " + err.message, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "💾 Save Stock Entry";
    }
  }
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
    const filteredRows = allStockRows.filter(r => {
      const hosp = (r["HOSPITAL"] || "").toUpperCase();
      if (!isHospitalVisible(hosp)) return false;
      if (activeStockHospitalFilter !== "ALL" && !hosp.includes(activeStockHospitalFilter)) return false;
      if (activeStockCategoryFilter !== "ALL") {
        const itemCat = (r["Item Type"] || "").toLowerCase().trim();
        const desc = (r["Description Of Goods"] || "").toLowerCase().trim();
        const targetCat = activeStockCategoryFilter.toLowerCase();
        let matchesCategory = false;
        if (itemCat) {
          matchesCategory = itemCat.includes(targetCat) || targetCat.includes(itemCat);
        } else {
          if (targetCat.includes("paper") && (desc.includes("paper") || desc.includes("rim") || desc.includes("a4"))) matchesCategory = true;
          else if (targetCat.includes("toner") && desc.includes("toner")) matchesCategory = true;
          else if (targetCat.includes("access") && (desc.includes("cable") || desc.includes("drum") || desc.includes("access"))) matchesCategory = true;
        }
        if (!matchesCategory) return false;
      }
      return true;
    });

    const exportRows = filteredRows.length ? filteredRows : allStockRows;
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Received_Stock");
    const hospSuffix = activeStockHospitalFilter !== "ALL" ? `_${activeStockHospitalFilter}` : "";
    const catSuffix = activeStockCategoryFilter !== "ALL" ? `_${activeStockCategoryFilter}` : "";
    XLSX.writeFile(workbook, `PrintTrack_Stock${hospSuffix}${catSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`📊 Exported ${exportRows.length} stock records to Excel!`, "success");
  } catch (e) {
    showToast("Export failed: " + e.message, "error");
  }
}

