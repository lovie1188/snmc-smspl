// ============================================================
// team-directory.js — Team Directory & Digital ID Card Module
// Softtech SNMC PrintTrack PWA
// Extracted from monolithic app.js (Domain Modularization)
// ============================================================

// ── EMPLOYEE / CONTACT DIRECTORY & DIGITAL ID CARD (ADMIN MODULE) ──
let allEmployeeItems = [];
let activeEmployeeHospitalFilter = "ALL";
let isEmployeesLoading = false;

async function loadEmployeesPage() {
  const countBadge = document.getElementById("employees-count-badge");
  const addBtn = document.getElementById("add-employee-top-btn");
  if (countBadge) countBadge.textContent = "Connecting to Google Sheet...";

  // RBAC: Check if current user can add staff (SuperAdmin, Director, or Admin with can_manage_employees)
  const user = window.currentUser || (typeof getStoredUser === "function" ? getStoredUser() : null) || {};
  const userIsSuper = typeof isSuperAdmin === "function" && isSuperAdmin(user.email || "");
  const userIsDirectorRole = typeof isDirector === "function" && isDirector(user.email || "");
  const userIsAdmin = !userIsSuper && !userIsDirectorRole && (String(user.role || "").toLowerCase() === "admin");
  const perms = window.activeAdminPermissions || {};
  const canManageStaff = userIsSuper || userIsDirectorRole || (userIsAdmin && perms.can_manage_employees);

  if (addBtn) {
    addBtn.style.display = canManageStaff ? "inline-flex" : "none";
  }

  // Sync active filter with activeSelectedHospital if available
  if (typeof activeSelectedHospital !== "undefined" && activeSelectedHospital) {
    activeEmployeeHospitalFilter = activeSelectedHospital;
    document.querySelectorAll("#employee-hospital-pills .pill-btn").forEach(b => {
      const txt = b.textContent.trim().toUpperCase();
      if (txt === activeSelectedHospital || (activeSelectedHospital === "ALL" && txt === "ALL") || (activeSelectedHospital === "UMMED" && (txt === "UMMED" || txt === "UMAID"))) {
        b.classList.add("active");
      } else {
        b.classList.remove("active");
      }
    });
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
  activeEmployeeHospitalFilter = hosp || "ALL";
  document.querySelectorAll("#employee-hospital-pills .pill-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) {
    btnEl.classList.add("active");
  } else {
    document.querySelectorAll("#employee-hospital-pills .pill-btn").forEach(b => {
      const txt = b.textContent.trim().toUpperCase();
      if (txt === activeEmployeeHospitalFilter || (activeEmployeeHospitalFilter === "ALL" && txt === "ALL")) {
        b.classList.add("active");
      }
    });
  }
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

  // Granular RBAC Permissions
  const user = window.currentUser || (typeof getStoredUser === "function" ? getStoredUser() : null) || {};
  const userIsSuper = typeof isSuperAdmin === "function" && isSuperAdmin(user.email || "");
  const userIsDirectorRole = typeof isDirector === "function" && isDirector(user.email || "");
  const userIsAdmin = !userIsSuper && !userIsDirectorRole && (String(user.role || "").toLowerCase() === "admin");
  const perms = window.activeAdminPermissions || {};
  const canManageStaff = userIsSuper || userIsDirectorRole || (userIsAdmin && perms.can_manage_employees);
  const canDeleteStaff = userIsSuper || userIsDirectorRole || (userIsAdmin && perms.can_delete_employees);

  if (addBtn) {
    addBtn.style.display = canManageStaff ? "inline-flex" : "none";
  }

  if (!container) return;

  const filtered = allEmployeeItems.filter(e => {
    const rawHosp = String(e.hospital || "").toUpperCase();

    // 1. Check user authorization visibility
    if (typeof isHospitalVisible === "function" && !isHospitalVisible(rawHosp)) {
      return false;
    }

    // 2. Directory hospital tab pill filtering
    if (activeEmployeeHospitalFilter && activeEmployeeHospitalFilter !== "ALL" && rawHosp !== "ALL") {
      const filterKey = activeEmployeeHospitalFilter.toUpperCase();
      const isUmaidMatch = (filterKey === "UMMED" || filterKey === "UMAID") && (rawHosp.includes("UMMED") || rawHosp.includes("UMAID"));
      if (!isUmaidMatch && !rawHosp.includes(filterKey)) {
        return false;
      }
    }

    // 3. Search input keyword matching
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
        ? `<div style="font-size:2rem; margin-bottom:8px;"><span class="spinner"></span></div><p>Loading members from Manpower Directory...</p>`
        : `<div style="font-size:2rem; margin-bottom:8px;">👥</div><p>No team members found in Manpower Directory.</p>`;
    }
    return;
  }

  if (noEmp) noEmp.style.display = "none";

  container.innerHTML = filtered.map(emp => {
    const rawName = emp.name || emp.email || "Employee";
    const initials = rawName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
    const isLoginBlocked = (emp.loginAllowed === "NO" || emp.loginAllowed === false);

    let cardThumbUrl = (emp.photoUrl && typeof emp.photoUrl === "string" ? emp.photoUrl.trim() : "").replace(/^["']|["']$/g, "");
    if (cardThumbUrl.includes("drive.google.com")) {
      const m = cardThumbUrl.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]{20,})/);
      if (m && m[1]) cardThumbUrl = `https://drive.google.com/thumbnail?id=${m[1]}&sz=w120`;
    }

    return `
      <div class="employee-card-item" data-id="${escapeHtml(emp.id)}">
        <div>
          <div class="emp-card-header">
            <div class="emp-avatar-circle" style="overflow:hidden; padding:0; display:flex; align-items:center; justify-content:center;">
              ${cardThumbUrl 
                ? `<img src="${escapeHtml(cardThumbUrl)}" alt="Photo" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.parentElement.innerText='${escapeHtml(initials)}';">` 
                : escapeHtml(initials)}
            </div>
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

  let rawPhoto = (emp.photoUrl && typeof emp.photoUrl === "string" && emp.photoUrl.trim() !== "") 
    ? emp.photoUrl.trim() 
    : (photoUrl && typeof photoUrl === "string" && photoUrl.trim() !== "" ? photoUrl.trim() : "");

  // Clean rawPhoto: remove any surrounding quotes, whitespace or escape characters
  rawPhoto = rawPhoto.replace(/^["']|["']$/g, "").trim();

  // If photo is a Google Drive view link, format it to high-reliability thumbnail direct URL
  let actualPhotoUrl = rawPhoto;
  if (rawPhoto.includes("drive.google.com")) {
    const fileIdMatch = rawPhoto.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]{20,})/);
    if (fileIdMatch && fileIdMatch[1]) {
      actualPhotoUrl = `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w800`;
    }
  }

  if (actualPhotoUrl) {
    if (photoImg) {
      photoImg.onerror = () => {
        photoImg.style.display = "none";
        if (avatarEl) avatarEl.style.display = "flex";
      };
      photoImg.onload = () => {
        photoImg.style.display = "block";
        if (avatarEl) avatarEl.style.display = "none";
      };
      photoImg.src = actualPhotoUrl;
    }
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

// ── Interactive ID Photo Adjuster & Crop Controller ───────────
let idPhotoAdjusterImage = null;
let idPhotoAdjusterState = {
  angle: 0,
  baseRotation: 0,
  zoom: 1.0,
  panX: 0,
  panY: 0
};
let isDraggingIdPhoto = false;
let idPhotoDragStartX = 0;
let idPhotoDragStartY = 0;
let idPhotoInitialPanX = 0;
let idPhotoInitialPanY = 0;

async function handlePhotoFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!activeIdCardEmployee) {
    showToast("Please select an employee card first.", "warn");
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      openIdPhotoAdjusterModal(img);
    };
    img.onerror = () => {
      showToast("Could not load selected photo.", "error");
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}

function openIdPhotoAdjusterModal(img) {
  idPhotoAdjusterImage = img;
  const modal = document.getElementById("id-photo-adjuster-modal");
  if (modal) modal.style.display = "flex";

  resetIdPhotoAdjuster();
  initIdPhotoAdjusterInteractions();
  renderIdPhotoAdjusterCanvas();
}

function closeIdPhotoAdjusterModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains("modal-close-btn")) return;
  const modal = document.getElementById("id-photo-adjuster-modal");
  if (modal) modal.style.display = "none";
}

function resetIdPhotoAdjuster() {
  idPhotoAdjusterState = {
    angle: 0,
    baseRotation: 0,
    zoom: 1.0,
    panX: 0,
    panY: 0
  };

  const angleSlider = document.getElementById("id-photo-angle-slider");
  const zoomSlider = document.getElementById("id-photo-zoom-slider");
  const angleLbl = document.getElementById("id-photo-angle-lbl");
  const zoomLbl = document.getElementById("id-photo-zoom-lbl");

  if (angleSlider) angleSlider.value = 0;
  if (zoomSlider) zoomSlider.value = 1;
  if (angleLbl) angleLbl.textContent = "0°";
  if (zoomLbl) zoomLbl.textContent = "1.0x";

  renderIdPhotoAdjusterCanvas();
}

function onIdPhotoAngleSliderChange(val) {
  idPhotoAdjusterState.angle = parseFloat(val) || 0;
  const angleSlider = document.getElementById("id-photo-angle-slider");
  if (angleSlider) angleSlider.value = idPhotoAdjusterState.angle;
  const angleLbl = document.getElementById("id-photo-angle-lbl");
  if (angleLbl) angleLbl.textContent = (idPhotoAdjusterState.angle > 0 ? "+" : "") + idPhotoAdjusterState.angle.toFixed(1) + "°";
  renderIdPhotoAdjusterCanvas();
}

function nudgeIdPhotoAngle(delta) {
  let newAngle = Math.max(-45, Math.min(45, idPhotoAdjusterState.angle + delta));
  onIdPhotoAngleSliderChange(newAngle);
}

function onIdPhotoZoomSliderChange(val) {
  idPhotoAdjusterState.zoom = Math.max(1.0, Math.min(4.0, parseFloat(val) || 1.0));
  const zoomSlider = document.getElementById("id-photo-zoom-slider");
  if (zoomSlider) zoomSlider.value = idPhotoAdjusterState.zoom;
  const zoomLbl = document.getElementById("id-photo-zoom-lbl");
  if (zoomLbl) zoomLbl.textContent = idPhotoAdjusterState.zoom.toFixed(2) + "x";
  renderIdPhotoAdjusterCanvas();
}

function nudgeIdPhotoZoom(delta) {
  let newZoom = Math.max(1.0, Math.min(4.0, idPhotoAdjusterState.zoom + delta));
  onIdPhotoZoomSliderChange(newZoom);
}

function rotateIdPhoto90(delta) {
  idPhotoAdjusterState.baseRotation = (idPhotoAdjusterState.baseRotation + delta) % 360;
  if (idPhotoAdjusterState.baseRotation < 0) idPhotoAdjusterState.baseRotation += 360;
  renderIdPhotoAdjusterCanvas();
}

function renderIdPhotoAdjusterCanvas() {
  const canvas = document.getElementById("id-photo-adjuster-canvas");
  const viewport = document.getElementById("id-photo-adjuster-viewport");
  if (!canvas || !viewport || !idPhotoAdjusterImage) return;

  const rect = viewport.getBoundingClientRect();
  canvas.width = rect.width || 320;
  canvas.height = rect.height || 426;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.translate(cx + idPhotoAdjusterState.panX, cy + idPhotoAdjusterState.panY);

  const totalAngleDeg = idPhotoAdjusterState.baseRotation + idPhotoAdjusterState.angle;
  ctx.rotate((totalAngleDeg * Math.PI) / 180);
  ctx.scale(idPhotoAdjusterState.zoom, idPhotoAdjusterState.zoom);

  const imgW = idPhotoAdjusterImage.naturalWidth || idPhotoAdjusterImage.width;
  const imgH = idPhotoAdjusterImage.naturalHeight || idPhotoAdjusterImage.height;
  const fitScale = Math.min(canvas.width / imgW, canvas.height / imgH);
  const drawW = imgW * fitScale;
  const drawH = imgH * fitScale;

  ctx.drawImage(idPhotoAdjusterImage, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function initIdPhotoAdjusterInteractions() {
  const viewport = document.getElementById("id-photo-adjuster-viewport");
  if (!viewport || viewport._hasListeners) return;
  viewport._hasListeners = true;

  viewport.addEventListener("mousedown", (e) => {
    isDraggingIdPhoto = true;
    idPhotoDragStartX = e.clientX;
    idPhotoDragStartY = e.clientY;
    idPhotoInitialPanX = idPhotoAdjusterState.panX;
    idPhotoInitialPanY = idPhotoAdjusterState.panY;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDraggingIdPhoto) return;
    idPhotoAdjusterState.panX = idPhotoInitialPanX + (e.clientX - idPhotoDragStartX);
    idPhotoAdjusterState.panY = idPhotoInitialPanY + (e.clientY - idPhotoDragStartY);
    renderIdPhotoAdjusterCanvas();
  });

  window.addEventListener("mouseup", () => {
    isDraggingIdPhoto = false;
  });

  viewport.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      isDraggingIdPhoto = true;
      idPhotoDragStartX = e.touches[0].clientX;
      idPhotoDragStartY = e.touches[0].clientY;
      idPhotoInitialPanX = idPhotoAdjusterState.panX;
      idPhotoInitialPanY = idPhotoAdjusterState.panY;
    }
  }, { passive: true });

  viewport.addEventListener("touchmove", (e) => {
    if (!isDraggingIdPhoto || e.touches.length !== 1) return;
    idPhotoAdjusterState.panX = idPhotoInitialPanX + (e.touches[0].clientX - idPhotoDragStartX);
    idPhotoAdjusterState.panY = idPhotoInitialPanY + (e.touches[0].clientY - idPhotoDragStartY);
    renderIdPhotoAdjusterCanvas();
  }, { passive: true });

  viewport.addEventListener("touchend", () => {
    isDraggingIdPhoto = false;
  });
}

async function submitAdjustedIdPhoto() {
  const viewport = document.getElementById("id-photo-adjuster-viewport");
  const guide = viewport ? viewport.querySelector(".adjuster-crop-guide") : null;
  const canvas = document.getElementById("id-photo-adjuster-canvas");
  const submitBtn = document.getElementById("id-photo-upload-submit-btn");

  if (!viewport || !guide || !canvas || !idPhotoAdjusterImage || !activeIdCardEmployee) return;

  const vpRect = viewport.getBoundingClientRect();
  const guideRect = guide.getBoundingClientRect();

  const guideLeft = guideRect.left - vpRect.left;
  const guideTop = guideRect.top - vpRect.top;
  const guideW = guideRect.width;
  const guideH = guideRect.height;

  // High-res export canvas (passport size ~600x800)
  const exportScale = Math.max(2, Math.min(3, 800 / (guideH || 400)));
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = Math.round(guideW * exportScale);
  cropCanvas.height = Math.round(guideH * exportScale);
  const cropCtx = cropCanvas.getContext("2d");

  cropCtx.fillStyle = "#ffffff";
  cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

  cropCtx.save();
  cropCtx.scale(exportScale, exportScale);
  cropCtx.translate(-guideLeft, -guideTop);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  cropCtx.translate(cx + idPhotoAdjusterState.panX, cy + idPhotoAdjusterState.panY);

  const totalAngleDeg = idPhotoAdjusterState.baseRotation + idPhotoAdjusterState.angle;
  cropCtx.rotate((totalAngleDeg * Math.PI) / 180);
  cropCtx.scale(idPhotoAdjusterState.zoom, idPhotoAdjusterState.zoom);

  const imgW = idPhotoAdjusterImage.naturalWidth || idPhotoAdjusterImage.width;
  const imgH = idPhotoAdjusterImage.naturalHeight || idPhotoAdjusterImage.height;
  const fitScale = Math.min(canvas.width / imgW, canvas.height / imgH);
  const drawW = imgW * fitScale;
  const drawH = imgH * fitScale;

  cropCtx.drawImage(idPhotoAdjusterImage, -drawW / 2, -drawH / 2, drawW, drawH);
  cropCtx.restore();

  const base64Data = cropCanvas.toDataURL("image/jpeg", 0.90);

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ Uploading to Google Drive...";
  }

  try {
    showToast("☁️ Uploading cropped passport photo to Google Drive...", "info");

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

      // Update in allEmployeeItems directory
      const idx = allEmployeeItems.findIndex(emp => emp.email.toLowerCase() === activeIdCardEmployee.email.toLowerCase());
      if (idx !== -1) {
        allEmployeeItems[idx].photoUrl = res.photoUrl;
      }

      // Update Live ID Card View
      const photoImg = document.getElementById("idc-photo-img");
      const avatarEl = document.getElementById("idc-avatar");
      if (photoImg) {
        photoImg.src = res.photoUrl;
        photoImg.style.display = "block";
      }
      if (avatarEl) avatarEl.style.display = "none";

      renderEmployeesList();
      showToast("✅ Profile photo uploaded to Google Drive & ID card updated!", "success");
      closeIdPhotoAdjusterModal();
    }
  } catch (err) {
    showToast("Photo upload failed: " + err.message, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "☁️ Save & Upload Photo";
    }
  }
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
  const idInput = document.getElementById("emp-id-input");
  const rowIdxInput = document.getElementById("emp-rowindex-input");
  const origEmailInput = document.getElementById("emp-orig-email-input");
  const saveBtn = document.getElementById("emp-save-btn");

  if (form) form.reset();
  if (modeInput) modeInput.value = "add";
  if (idInput) idInput.value = "";
  if (rowIdxInput) rowIdxInput.value = "";
  if (origEmailInput) origEmailInput.value = "";
  if (titleEl) titleEl.textContent = "Add Team Member";
  if (subEl) subEl.textContent = "Save to Manpower Directory";
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
  const idInput = document.getElementById("emp-id-input");
  const rowIdxInput = document.getElementById("emp-rowindex-input");
  const origEmailInput = document.getElementById("emp-orig-email-input");
  const saveBtn = document.getElementById("emp-save-btn");

  if (modeInput) modeInput.value = "edit";
  if (idInput) idInput.value = emp.id || "";
  if (rowIdxInput) rowIdxInput.value = emp.rowIndex || "";
  if (origEmailInput) origEmailInput.value = emp.email || "";
  if (titleEl) titleEl.textContent = `Edit Member: ${emp.name}`;
  if (subEl) subEl.textContent = `Updating record in Manpower Directory`;
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
  const id = (document.getElementById("emp-id-input")?.value || "").trim();
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
      // Live Server-Side Update in Manpower Google Sheet Tab
      const status = loginAllowed === "NO" ? "INACTIVE" : "ACTIVE";
      await sheetsRequest("updateEmployee", {
        method: "POST",
        body: JSON.stringify({ id, originalEmail, email, hospital, role, memberType, loginAllowed, name, phone, project: "SNMC", status, rowIndex })
      });

      const idx = allEmployeeItems.findIndex(item => (id && item.id === id) || (rowIndex && item.rowIndex === rowIndex) || (originalEmail && item.email.toLowerCase() === originalEmail.toLowerCase()));
      if (idx !== -1) {
        allEmployeeItems[idx] = { ...allEmployeeItems[idx], name, email, phone, hospital, role, memberType, loginAllowed, status, project: "SNMC" };
      }

      showToast(`✅ ${name} updated successfully in Manpower directory!`, "success");
    } else {
      // Live Server-Side Append to Manpower Google Sheet Tab
      const status = loginAllowed === "NO" ? "INACTIVE" : "ACTIVE";
      const res = await sheetsRequest("addEmployee", {
        method: "POST",
        body: JSON.stringify({ email, hospital, role, memberType, loginAllowed, name, phone, project: "SNMC", status })
      });

      const newId = res?.id || `SMSPL2026${String(allEmployeeItems.length + 1).padStart(4, "0")}`;
      const newRowIdx = res?.rowIndex || (allEmployeeItems.length + 2);
      allEmployeeItems.unshift({ id: newId, rowIndex: newRowIdx, name, email, phone, hospital, role, memberType, loginAllowed, status, project: "SNMC" });
      showToast(`✅ ${name} (${email}) added to Manpower directory [Status: ${status}]!`, "success");
    }

    closeAddEmployeeModal();
    document.getElementById("add-employee-form")?.reset();
    await loadEmployeesPage();
  } catch (err) {
    showToast(`Failed to sync with Google Sheet: ${err.message}`, "error");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = mode === "edit" ? `💾 Update Member` : `💾 Save Member`;
    }
  }
}

// ── In-App Confirmation Dialog Helper (Rule 05 Compliant) ──
let confirmModalResolver = null;

function showAppConfirmDialog({ title = "Confirm Action", message = "Are you sure?", confirmText = "Confirm", icon = "⚠️", danger = true }) {
  const modal = document.getElementById("app-confirm-modal");
  const titleEl = document.getElementById("app-confirm-title");
  const msgEl = document.getElementById("app-confirm-msg");
  const iconEl = document.getElementById("app-confirm-icon");
  const okBtn = document.getElementById("app-confirm-ok-btn");

  if (!modal) return Promise.resolve(window.confirm ? window.confirm(message) : true);

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (iconEl) iconEl.textContent = icon;
  if (okBtn) {
    okBtn.textContent = confirmText;
    okBtn.style.background = danger ? "#ef4444" : "var(--primary, #0284c7)";
  }

  modal.style.display = "flex";

  return new Promise((resolve) => {
    confirmModalResolver = resolve;
  });
}

function closeAppConfirmModal(result = false) {
  const modal = document.getElementById("app-confirm-modal");
  if (modal) modal.style.display = "none";
  if (typeof confirmModalResolver === "function") {
    confirmModalResolver(result);
    confirmModalResolver = null;
  }
}

async function handleDeleteEmployee(empId, email, rowIndex) {
  const confirmed = await showAppConfirmDialog({
    title: "Remove Team Member",
    message: `Are you sure you want to remove ${email} from the Manpower directory?`,
    confirmText: "🗑️ Remove",
    icon: "🗑️",
    danger: true
  });

  if (!confirmed) return;

  try {
    showToast(`Deleting ${email}...`, "info");
    await sheetsRequest("deleteEmployee", {
      method: "POST",
      body: JSON.stringify({ email, rowIndex })
    });

    allEmployeeItems = allEmployeeItems.filter(e => e.id !== empId && e.email.toLowerCase() !== email.toLowerCase());
    showToast(`🗑️ ${email} removed from Manpower directory.`, "success");
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

    const token = typeof getAuthToken === "function" ? await getAuthToken() : (localStorage.getItem("pt_gtoken") || sessionStorage.getItem("pt_gtoken") || "");
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

    const token = typeof getAuthToken === "function" ? await getAuthToken() : (localStorage.getItem("pt_gtoken") || sessionStorage.getItem("pt_gtoken") || "");
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
    const rawHosp = String(e.hospital || "").toUpperCase();
    if (typeof isHospitalVisible === "function" && !isHospitalVisible(rawHosp)) return false;
    if (activeEmployeeHospitalFilter && activeEmployeeHospitalFilter !== "ALL" && rawHosp !== "ALL") {
      const filterKey = activeEmployeeHospitalFilter.toUpperCase();
      const isUmaidMatch = (filterKey === "UMMED" || filterKey === "UMAID") && (rawHosp.includes("UMMED") || rawHosp.includes("UMAID"));
      if (!isUmaidMatch && !rawHosp.includes(filterKey)) {
        return false;
      }
    }
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
