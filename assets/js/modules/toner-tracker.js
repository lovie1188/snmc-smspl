// ============================================================
// Toner Tracking Module — SNMC PrintTrack PWA
// Tracks Konica Minolta toner lifecycle:
//   HO/Warehouse (RECEIVED) → Hospital (DISPATCHED) → Printer (Install/Replace)
// Requires: config.js, sheets.js (frontend), auth.js
// ============================================================

/* ─── State ─────────────────────────────────────────────────────────────────── */
let _tonerStockRows   = [];  // Raw rows from toner_stock sheet
let _tonerLogRows     = [];  // Raw rows from toner_log sheet
let _tonerModels      = [];  // Approved Konica Minolta toner models
let _tonerSettings    = { threshold: 1000, warnThreshold: 2000 };
let _tonerLoaded      = false;

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function _te(id) { return document.getElementById(id); }

function _tonerFmt(n) {
  const num = parseInt(String(n || "0").replace(/,/g, ""), 10);
  return isNaN(num) ? "0" : num.toLocaleString("en-IN");
}

function _statusBadge(pagesRemaining, settings) {
  if (pagesRemaining === null || pagesRemaining === undefined) return '<span class="toner-badge toner-active">Active</span>';
  const rem = parseInt(pagesRemaining, 10);
  if (isNaN(rem)) return '<span class="toner-badge toner-active">Active</span>';
  if (rem <= settings.threshold)     return '<span class="toner-badge toner-critical">🔴 Critical</span>';
  if (rem <= settings.warnThreshold) return '<span class="toner-badge toner-warn">🟡 Near End</span>';
  return '<span class="toner-badge toner-ok">🟢 OK</span>';
}

/** Estimate pages remaining for an ACTIVE installation based on printer's latest meter reading */
function _estimatePagesRemaining(logRow, latestMeter) {
  const opening = parseInt(String(logRow["Opening Meter"] || "0").replace(/,/g, ""), 10);
  const current = parseInt(String(latestMeter || "0").replace(/,/g, ""), 10);
  if (isNaN(opening) || isNaN(current) || current < opening) return null;
  const used = current - opening;

  // Typical Konica Minolta mono yields ~10k, colour ~6k pages — rough default
  const modelStr = String(logRow["Toner Model"] || "").toUpperCase();
  let expectedYield = modelStr.includes("DR-") ? 60000 : (modelStr.includes("-K") || modelStr.includes("TN-118") || modelStr.includes("TN-217")) ? 10000 : 6000;
  const remaining = expectedYield - used;
  return remaining > 0 ? remaining : 0;
}

/* ─── API Calls ─────────────────────────────────────────────────────────────── */
async function _apiGet(action) {
  return sheetsRequest({ action }, "GET");
}
async function _apiPost(action, body) {
  return sheetsRequest({ action, ...body }, "POST");
}

/* ─── Load Data ─────────────────────────────────────────────────────────────── */
async function _loadTonerData() {
  const [modelsRes, stockRes, logRes, settingsRes] = await Promise.allSettled([
    _apiGet("tonerModels"),
    _apiGet("tonerStock"),
    _apiGet("tonerLog"),
    _apiGet("getTonerSettings")
  ]);

  if (modelsRes.status === "fulfilled" && modelsRes.value.models)
    _tonerModels = modelsRes.value.models;

  if (stockRes.status === "fulfilled" && stockRes.value.rows)
    _tonerStockRows = stockRes.value.rows;
  else
    console.warn("[TonerTracker] Could not load toner_stock:", stockRes.reason || stockRes.value?.error);

  if (logRes.status === "fulfilled" && logRes.value.rows)
    _tonerLogRows = logRes.value.rows;
  else
    console.warn("[TonerTracker] Could not load toner_log:", logRes.reason || logRes.value?.error);

  if (settingsRes.status === "fulfilled" && settingsRes.value.threshold !== undefined) {
    _tonerSettings.threshold     = settingsRes.value.threshold;
    _tonerSettings.warnThreshold = settingsRes.value.warnThreshold;
  }

  _tonerLoaded = true;
}

/* ─── KPIs ──────────────────────────────────────────────────────────────────── */
function _renderTonerKPIs() {
  let totalReceived = 0, totalDispatched = 0;
  _tonerStockRows.forEach(r => {
    const qty = parseInt(String(r["Qty"] || r["E"] || "0"), 10) || 0;
    const type = String(r["Entry Type"] || r["B"] || "").toUpperCase();
    if (type === "RECEIVED")   totalReceived   += qty;
    if (type === "DISPATCHED") totalDispatched += qty;
  });

  const activeInstalls = _tonerLogRows.filter(r =>
    String(r["Status"] || r["M"] || "").toLowerCase() === "active"
  ).length;

  const hoBalance = totalReceived - totalDispatched;

  const kpiEl = _te("toner-kpi-grid");
  if (!kpiEl) return;
  kpiEl.innerHTML = `
    <div class="toner-kpi">
      <div class="toner-kpi-icon">📦</div>
      <div class="toner-kpi-val">${_tonerFmt(totalReceived)}</div>
      <div class="toner-kpi-lbl">Total Received</div>
    </div>
    <div class="toner-kpi">
      <div class="toner-kpi-icon">🚚</div>
      <div class="toner-kpi-val">${_tonerFmt(totalDispatched)}</div>
      <div class="toner-kpi-lbl">Dispatched to Hospitals</div>
    </div>
    <div class="toner-kpi highlight">
      <div class="toner-kpi-icon">🗄️</div>
      <div class="toner-kpi-val">${_tonerFmt(hoBalance)}</div>
      <div class="toner-kpi-lbl">HO Balance</div>
    </div>
    <div class="toner-kpi">
      <div class="toner-kpi-icon">🖨️</div>
      <div class="toner-kpi-val">${_tonerFmt(activeInstalls)}</div>
      <div class="toner-kpi-lbl">Active Installs</div>
    </div>
  `;
}

/* ─── Active Installations Table ────────────────────────────────────────────── */
function _renderActiveInstallations() {
  const tableEl = _te("toner-active-tbody");
  const emptyEl = _te("toner-active-empty");
  if (!tableEl) return;

  const active = _tonerLogRows.filter(r =>
    String(r["Status"] || r["M"] || "").toLowerCase() === "active"
  );

  if (active.length === 0) {
    tableEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  tableEl.innerHTML = active.map(r => {
    const pagesRem = _estimatePagesRemaining(r, null); // no live meter yet
    const badge    = _statusBadge(pagesRem, _tonerSettings);
    const escRowIdx = String(r._rowIndex || "");
    return `<tr>
      <td>${r["Install Date"] || r["A"] || "—"}</td>
      <td><strong>${r["Hospital"] || r["B"] || "—"}</strong></td>
      <td>${r["Counter No"] || r["C"] || "—"}</td>
      <td style="max-width:140px;font-size:0.75rem;">${r["Toner Model"] || r["F"] || "—"}</td>
      <td>${_tonerFmt(r["Opening Meter"] || r["H"])}</td>
      <td>${badge}</td>
      <td>
        <button class="arrow-btn" style="padding:4px 10px;font-size:0.72rem;font-weight:700;"
          onclick="openCloseTonerModal(${escRowIdx}, '${(r["Counter No"] || r["C"] || "").replace(/'/g,"\\'")}', '${(r["Toner Model"] || r["F"] || "").replace(/'/g,"\\'")}')">
          🔄 Replace
        </button>
      </td>
    </tr>`;
  }).join("");
}

/* ─── Toner Stock Ledger ─────────────────────────────────────────────────────── */
function _renderTonerStockLedger() {
  const tbodyEl = _te("toner-stock-tbody");
  const emptyEl = _te("toner-stock-empty");
  if (!tbodyEl) return;

  const sorted = [..._tonerStockRows].reverse(); // newest first
  if (sorted.length === 0) {
    tbodyEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  tbodyEl.innerHTML = sorted.map(r => {
    const type = String(r["Entry Type"] || r["B"] || "").toUpperCase();
    const badgeCls = type === "RECEIVED" ? "toner-badge-received" : "toner-badge-dispatched";
    const badgeTxt = type === "RECEIVED" ? "📥 RECEIVED" : "📤 DISPATCHED";
    return `<tr>
      <td>${r["Date"] || r["A"] || "—"}</td>
      <td><span class="toner-type-badge ${badgeCls}">${badgeTxt}</span></td>
      <td style="font-size:0.75rem;">${r["Toner Model"] || r["C"] || "—"}</td>
      <td>${r["Qty"] || r["E"] || "—"}</td>
      <td>${r["Hospital"] || r["F"] || "—"}</td>
      <td>${r["Supplier/Invoice"] || r["H"] || "—"}</td>
      <td>${r["Recorded By"] || r["I"] || "—"}</td>
    </tr>`;
  }).join("");
}

/* ─── Replacement History ────────────────────────────────────────────────────── */
function _renderTonerHistory() {
  const tbodyEl = _te("toner-history-tbody");
  const emptyEl = _te("toner-history-empty");
  if (!tbodyEl) return;

  const replaced = _tonerLogRows.filter(r =>
    ["replaced", "empty"].includes(String(r["Status"] || r["M"] || "").toLowerCase())
  ).reverse();

  if (replaced.length === 0) {
    tbodyEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  tbodyEl.innerHTML = replaced.map(r => {
    const yield_ = parseInt(String(r["Pages Yield"] || r["L"] || "0").replace(/,/g, ""), 10) || 0;
    const openM  = parseInt(String(r["Opening Meter"] || r["H"] || "0").replace(/,/g, ""), 10) || 0;
    const closeM = parseInt(String(r["Closing Meter"] || r["K"] || "0").replace(/,/g, ""), 10) || 0;
    const yieldFmt = yield_ > 0 ? _tonerFmt(yield_) + " pgs" : "—";
    return `<tr>
      <td>${r["Install Date"] || r["A"] || "—"} → ${r["Removal Date"] || r["J"] || "—"}</td>
      <td><strong>${r["Hospital"] || r["B"] || "—"}</strong></td>
      <td>${r["Counter No"] || r["C"] || "—"}</td>
      <td style="font-size:0.75rem;">${r["Toner Model"] || r["F"] || "—"}</td>
      <td>${_tonerFmt(openM)} → ${_tonerFmt(closeM)}</td>
      <td><strong>${yieldFmt}</strong></td>
      <td>${r["Removed By"] || r["N"] || "—"}</td>
    </tr>`;
  }).join("");
}

/* ─── Public: Load Page ─────────────────────────────────────────────────────── */
window.loadTonerPage = async function () {
  const loadingEl = _te("toner-loading");
  const contentEl = _te("toner-content");
  if (loadingEl) loadingEl.style.display = "flex";
  if (contentEl) contentEl.style.display = "none";

  try {
    await _loadTonerData();
    _renderTonerKPIs();
    _renderActiveInstallations();
    _renderTonerStockLedger();
    _renderTonerHistory();
    // Populate settings if SuperAdmin
    _renderTonerSettings();
  } catch (err) {
    console.error("[TonerTracker] loadTonerPage error:", err.message);
    if (typeof showToast === "function") showToast("❌ Toner data could not be loaded. Please try again.", "error");
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "";
  }
};

/* ─── Settings Panel ────────────────────────────────────────────────────────── */
function _renderTonerSettings() {
  const panel = _te("toner-settings-panel");
  if (!panel) return;
  // Only show to SuperAdmin
  const isSuperAdmin = typeof window.isSuperAdmin === "function"
    ? window.isSuperAdmin(window.currentUser?.email)
    : false;
  panel.style.display = isSuperAdmin ? "" : "none";

  const threshEl   = _te("toner-threshold-input");
  const warnThreshEl = _te("toner-warn-threshold-input");
  if (threshEl)     threshEl.value     = _tonerSettings.threshold;
  if (warnThreshEl) warnThreshEl.value = _tonerSettings.warnThreshold;
}

window.saveTonerSettings = async function () {
  const threshold     = parseInt(_te("toner-threshold-input")?.value || "1000", 10);
  const warnThreshold = parseInt(_te("toner-warn-threshold-input")?.value || "2000", 10);

  if (isNaN(threshold) || threshold < 0) { showToast("❌ Invalid 🔴 critical threshold.", "error"); return; }
  if (isNaN(warnThreshold) || warnThreshold <= threshold) {
    showToast("❌ 🟡 Warning threshold must be greater than 🔴 critical threshold.", "error"); return;
  }

  try {
    const res = await _apiPost("saveTonerSettings", { threshold, warnThreshold });
    if (!res.success) throw new Error(res.error || "Save failed.");
    _tonerSettings = { threshold, warnThreshold };
    showToast("✅ Toner alert thresholds saved.", "success");
  } catch (err) {
    console.error("[TonerTracker] saveTonerSettings:", err.message);
    showToast("❌ Could not save settings: " + err.message, "error");
  }
};

/* ─── Modal: Receive Toner ───────────────────────────────────────────────────── */
window.openReceiveTonerModal = function () {
  _populateTonerModelSelect("receive-toner-model");
  _te("receive-toner-modal").style.display = "flex";
};
window.closeReceiveTonerModal = function () {
  _te("receive-toner-modal").style.display = "none";
  _te("receive-toner-form").reset();
};

window.submitReceiveToner = async function () {
  const form       = _te("receive-toner-form");
  const tonerModel = _te("receive-toner-model")?.value;
  const qty        = _te("receive-toner-qty")?.value;
  const hospital   = _te("receive-toner-hospital")?.value;
  const unitCost   = _te("receive-toner-cost")?.value;
  const supplier   = _te("receive-toner-supplier")?.value;
  const notes      = _te("receive-toner-notes")?.value;
  const isOther    = tonerModel === "Other (specify in Notes)";
  const colorEl    = _te("receive-toner-color");
  const color      = colorEl?.value || "";

  if (!tonerModel || !qty || parseInt(qty, 10) <= 0) {
    showToast("❌ Toner model and quantity are required.", "error"); return;
  }

  const btn = _te("receive-toner-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const res = await _apiPost("appendTonerStock", {
      entryType: "RECEIVED", tonerModel, color, qty: parseInt(qty, 10),
      hospital: hospital || "HO/Warehouse", unitCost: unitCost || "", supplier: supplier || "", notes: notes || ""
    });
    if (!res.success) throw new Error(res.error || "Submit failed.");
    showToast("✅ Toner receipt recorded & synced to Stock Ledger.", "success");
    closeReceiveTonerModal();
    await loadTonerPage();
  } catch (err) {
    console.error("[TonerTracker] submitReceiveToner:", err.message);
    showToast("❌ " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "✅ Save Receipt"; }
  }
};

/* ─── Modal: Dispatch Toner ──────────────────────────────────────────────────── */
window.openDispatchTonerModal = function () {
  _populateTonerModelSelect("dispatch-toner-model");
  _te("dispatch-toner-modal").style.display = "flex";
};
window.closeDispatchTonerModal = function () {
  _te("dispatch-toner-modal").style.display = "none";
  _te("dispatch-toner-form").reset();
};

window.submitDispatchToner = async function () {
  const tonerModel = _te("dispatch-toner-model")?.value;
  const qty        = _te("dispatch-toner-qty")?.value;
  const hospital   = _te("dispatch-toner-hospital")?.value;
  const notes      = _te("dispatch-toner-notes")?.value;
  const colorEl    = _te("dispatch-toner-color");
  const color      = colorEl?.value || "";

  if (!tonerModel || !qty || parseInt(qty, 10) <= 0 || !hospital) {
    showToast("❌ Toner model, quantity and destination hospital are required.", "error"); return;
  }

  const btn = _te("dispatch-toner-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const res = await _apiPost("appendTonerStock", {
      entryType: "DISPATCHED", tonerModel, color, qty: parseInt(qty, 10),
      hospital, notes: notes || ""
    });
    if (!res.success) throw new Error(res.error || "Submit failed.");
    showToast("✅ Toner dispatch recorded.", "success");
    closeDispatchTonerModal();
    await loadTonerPage();
  } catch (err) {
    console.error("[TonerTracker] submitDispatchToner:", err.message);
    showToast("❌ " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "✅ Save Dispatch"; }
  }
};

/* ─── Modal: Install Toner ───────────────────────────────────────────────────── */
window.openInstallTonerModal = function () {
  _populateTonerModelSelect("install-toner-model");
  _te("install-toner-modal").style.display = "flex";
};
window.closeInstallTonerModal = function () {
  _te("install-toner-modal").style.display = "none";
  _te("install-toner-form").reset();
};

window.submitInstallToner = async function () {
  const hospital     = _te("install-toner-hospital")?.value;
  const counterNo    = _te("install-toner-counter")?.value;
  const printerSerial= _te("install-toner-serial")?.value;
  const printerModel = _te("install-toner-printer-model")?.value;
  const tonerModel   = _te("install-toner-model")?.value;
  const colorEl      = _te("install-toner-color");
  const color        = colorEl?.value || "";
  const openingMeter = _te("install-toner-opening-meter")?.value;
  const notes        = _te("install-toner-notes")?.value;

  if (!hospital || !counterNo || !tonerModel || openingMeter === "" || openingMeter === undefined) {
    showToast("❌ Hospital, Counter No, Toner Model, and Opening Meter are required.", "error"); return;
  }
  const meterNum = parseInt(String(openingMeter).replace(/,/g, ""), 10);
  if (isNaN(meterNum) || meterNum < 0) {
    showToast("❌ Opening meter must be a non-negative number.", "error"); return;
  }

  const btn = _te("install-toner-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const res = await _apiPost("appendTonerInstall", {
      hospital, counterNo, printerSerial: printerSerial || "", printerModel: printerModel || "",
      tonerModel, color, openingMeter: meterNum, notes: notes || ""
    });
    if (!res.success) throw new Error(res.error || "Submit failed.");
    showToast("✅ Toner installation recorded.", "success");
    closeInstallTonerModal();
    await loadTonerPage();
  } catch (err) {
    console.error("[TonerTracker] submitInstallToner:", err.message);
    showToast("❌ " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "✅ Record Installation"; }
  }
};

/* ─── Modal: Replace / Close Toner ──────────────────────────────────────────── */
window.openCloseTonerModal = function (rowIndex, counterNo, tonerModel) {
  _te("close-toner-modal").style.display = "flex";
  _te("close-toner-row-index").value     = rowIndex;
  _te("close-toner-counter-display").textContent = `Counter: ${counterNo} | ${tonerModel}`;
  _te("close-toner-closing-meter").value = "";
  _te("close-toner-notes").value         = "";
};
window.closeCloseTonerModal = function () {
  _te("close-toner-modal").style.display = "none";
};

window.submitCloseToner = async function () {
  const rowIndex     = _te("close-toner-row-index")?.value;
  const closingMeter = _te("close-toner-closing-meter")?.value;
  const notes        = _te("close-toner-notes")?.value;

  if (!rowIndex || closingMeter === "" || closingMeter === undefined) {
    showToast("❌ Closing meter reading is required.", "error"); return;
  }
  const meterNum = parseInt(String(closingMeter).replace(/,/g, ""), 10);
  if (isNaN(meterNum) || meterNum < 0) {
    showToast("❌ Closing meter must be a non-negative number.", "error"); return;
  }

  const btn = _te("close-toner-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const res = await _apiPost("closeTonerEntry", {
      rowIndex: parseInt(rowIndex, 10), closingMeter: meterNum, notes: notes || ""
    });
    if (!res.success) throw new Error(res.error || "Submit failed.");
    showToast(`✅ Toner replaced. Pages yield: ${_tonerFmt(res.pagesYield)} pages.`, "success");
    closeCloseTonerModal();
    await loadTonerPage();
  } catch (err) {
    console.error("[TonerTracker] submitCloseToner:", err.message);
    showToast("❌ " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "✅ Confirm Replacement"; }
  }
};

/* ─── Helper: Populate Toner Model Dropdown ──────────────────────────────────── */
function _populateTonerModelSelect(selectId) {
  const sel = _te(selectId);
  if (!sel) return;
  const models = _tonerModels.length ? _tonerModels : [
    "TN-324K (BizHub C258/C308/C368) — Black",
    "TN-118 (BizHub 226/266/306) — Black",
    "Other (specify in Notes)"
  ];
  sel.innerHTML = `<option value="">-- Select Toner Model --</option>` +
    models.map(m => `<option value="${m.replace(/"/g, '&quot;')}">${m}</option>`).join("");
}

console.log("[TonerTracker] Module loaded (v51).");
