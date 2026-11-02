// ============================================================
// vision-scanner.js — Guided Wizard, Camera Viewfinder & Interactive OCR Adjuster
// Softtech SNMC PrintTrack PWA
// Extracted from monolithic app.js (Domain Modularization)
// ============================================================

// ── SMART GUIDED WIZARD & SCANNER CONTROLLER ────────────
// ══════════════════════════════════════════════════════════

let currentWizardStep = 1;
let currentEntryMode = "manual"; // Default to Direct Form ("manual")
let wizardStream = null;
let currentCameraFacing = "environment"; // default to rear camera on mobile
let scannedDataPending = null;
let lastCapturedDataUrl = null;

/**
 * Toggles between Guided Wizard Mode and Direct Manual Form Mode
 */
function setEntryMode(mode) {
  currentEntryMode = mode;
  const btnWizard = document.getElementById("btn-mode-wizard");
  const btnManual = document.getElementById("btn-mode-manual");
  const stepperWrap = document.getElementById("wizard-stepper-wrap");

  if (mode === "manual") {
    if (btnWizard) btnWizard.classList.remove("active");
    if (btnManual) btnManual.classList.add("active");
    if (stepperWrap) stepperWrap.style.display = "none";
    stopWizardCamera();
    closeFullscreenCamera();

    // Show all panels at once for direct manual editing
    document.querySelectorAll(".wizard-step-panel").forEach(p => {
      p.style.display = "block";
      p.classList.add("manual-mode-view");
    });
    // Hide Step 1 & Step 2 in direct manual mode
    const p1 = document.getElementById("wizard-panel-1");
    const p2 = document.getElementById("wizard-panel-2");
    if (p1) p1.style.display = "none";
    if (p2) p2.style.display = "none";

    // Hide intro badges
    document.querySelectorAll(".step-intro-box").forEach(b => b.style.display = "none");
    
    // Manage nav bars in Direct Form mode:
    // — Hide all nav bars first (wizard step-nav buttons not needed in direct mode)
    // — Then explicitly show only the panel-4 submit nav bar
    document.querySelectorAll(".wizard-nav-bar").forEach(n => { n.style.display = "none"; });
    const submitNavBar = document.getElementById("wizard-panel-4-nav");
    if (submitNavBar) {
      submitNavBar.style.display = "flex";
      const prevBtn = submitNavBar.querySelector(".btn-wizard-prev");
      if (prevBtn) prevBtn.style.display = "none";
      const subBtn = document.getElementById("submit-btn");
      if (subBtn) { subBtn.style.display = "flex"; subBtn.style.flex = "1"; }
    }

  } else {
    if (btnWizard) btnWizard.classList.add("active");
    if (btnManual) btnManual.classList.remove("active");
    if (stepperWrap) stepperWrap.style.display = "flex";

    document.querySelectorAll(".step-intro-box").forEach(b => b.style.display = "block");
    document.querySelectorAll(".wizard-nav-bar").forEach(n => {
      n.style.display = "flex";
      const prevBtn = n.querySelector(".btn-wizard-prev");
      if (prevBtn) prevBtn.style.display = "";
    });

    goToWizardStep(currentWizardStep || 1);
  }
}

/**
 * Navigates to a specific Wizard step (1, 2, 3, 4)
 */
function goToWizardStep(stepNum) {
  if (currentEntryMode === "manual") return;

  // Validation before proceeding
  if (stepNum > 2 && currentWizardStep < stepNum && stepNum === 4) {
    const counterVal = document.getElementById("counter-select")?.value;
    if (!counterVal) {
      showToast("Please select a Counter Number before continuing.", "warn");
      return;
    }
  }

  currentWizardStep = stepNum;

  // 1. Update Stepper Nodes & Connecting Lines
  for (let i = 1; i <= 4; i++) {
    const node = document.getElementById(`step-node-${i}`);
    const line = document.getElementById(`step-line-${i}`);
    if (node) {
      if (i === stepNum) {
        node.className = "wizard-step-node active";
      } else if (i < stepNum) {
        node.className = "wizard-step-node completed";
      } else {
        node.className = "wizard-step-node";
      }
    }
    if (line) {
      line.className = i < stepNum ? "step-line completed" : "step-line";
    }
  }

  // 2. Hide all panels, show only target panel
  for (let i = 1; i <= 4; i++) {
    const panel = document.getElementById(`wizard-panel-${i}`);
    if (panel) {
      panel.style.display = (i === stepNum) ? "block" : "none";
      panel.classList.remove("manual-mode-view");
    }
  }

  // 3. Step 1 View State (Camera does NOT auto-start)
  if (stepNum === 1) {
    const adjCard = document.getElementById("wizard-adjuster-container");
    const launchCard = document.getElementById("wizard-camera-launch-card");
    const postCaptureCard = document.getElementById("wizard-post-capture-card");

    if (adjCard) adjCard.style.display = "none";

    if (lastCapturedDataUrl) {
      if (launchCard) launchCard.style.display = "none";
      if (postCaptureCard) {
        postCaptureCard.style.display = "block";
        const previewImg = document.getElementById("post-capture-preview-img");
        if (previewImg) previewImg.src = lastCapturedDataUrl;
      }
    } else {
      if (launchCard) launchCard.style.display = "block";
      if (postCaptureCard) postCaptureCard.style.display = "none";
    }
  } else {
    stopWizardCamera();
    closeFullscreenCamera();
  }

  // 4. Smooth scroll to top of card on mobile
  const card = document.querySelector(".wizard-card");
  if (card && window.innerWidth < 768) {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/**
 * Skips camera scan directly to counter and manual form
 */
function skipWizardToManual() {
  goToWizardStep(3);
}

/**
 * Opens Fullscreen Camera Viewfinder and starts video stream
 */
async function openFullscreenCamera() {
  const modal = document.getElementById("wizard-camera-fullscreen");
  if (modal) modal.style.display = "flex";
  await startWizardCamera();
}

/**
 * Closes Fullscreen Camera Viewfinder and stops video stream
 */
function closeFullscreenCamera() {
  stopWizardCamera();
  const modal = document.getElementById("wizard-camera-fullscreen");
  if (modal) modal.style.display = "none";
}

/**
 * Starts camera stream in fullscreen viewfinder
 */
async function startWizardCamera() {
  stopWizardCamera();
  const video = document.getElementById("wizard-video");
  if (!video) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn("[Scanner] getUserMedia not supported in this browser.");
    showToast("Camera API not supported by this browser. Use 📁 Gallery option.", "warn");
    return;
  }

  try {
    const constraints = {
      video: {
        facingMode: { ideal: currentCameraFacing },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };
    wizardStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = wizardStream;
    await video.play();
    return;
  } catch (err) {
    console.warn("[Scanner] Ideal facing failed, trying basic camera:", err);
  }

  try {
    wizardStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = wizardStream;
    await video.play();
  } catch (fallbackErr) {
    console.warn("[Scanner] No active camera device found:", fallbackErr);
    showToast("Camera could not be started. Try choosing a photo from 📁 Gallery.", "warn");
  }
}

function stopWizardCamera() {
  if (wizardStream) {
    try {
      wizardStream.getTracks().forEach(t => t.stop());
    } catch (_) {}
    wizardStream = null;
  }
  const video = document.getElementById("wizard-video");
  if (video) video.srcObject = null;
}

async function toggleCameraFacing() {
  currentCameraFacing = (currentCameraFacing === "environment") ? "user" : "environment";
  await startWizardCamera();
}

/**
 * Displays Post-Capture Process Options card
 */
function showPostCaptureOptions(dataUrl) {
  const launchCard = document.getElementById("wizard-camera-launch-card");
  const postCaptureCard = document.getElementById("wizard-post-capture-card");
  const adjCard = document.getElementById("wizard-adjuster-container");
  const previewImg = document.getElementById("post-capture-preview-img");

  if (launchCard) launchCard.style.display = "none";
  if (adjCard) adjCard.style.display = "none";
  if (previewImg && dataUrl) previewImg.src = dataUrl;
  if (postCaptureCard) postCaptureCard.style.display = "block";

  if (postCaptureCard && window.innerWidth < 768) {
    postCaptureCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/**
 * Snaps photo from video stream, closes fullscreen camera, and shows options
 */
async function captureWizardPhoto() {
  const video = document.getElementById("wizard-video");
  const canvas = document.getElementById("wizard-canvas");
  if (!video || !video.videoWidth) {
    showToast("Camera is not ready. You can pick a photo from 📁 Gallery.", "warn");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  lastCapturedDataUrl = dataUrl;

  closeFullscreenCamera();

  const img = new Image();
  img.onload = () => {
    adjusterSourceImage = img;
    showPostCaptureOptions(dataUrl);
  };
  img.src = dataUrl;
}

/**
 * Handles Gallery Photo selection and shows post-capture options
 */
async function handleWizardFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  closeFullscreenCamera();

  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      lastCapturedDataUrl = dataUrl;

      const img = new Image();
      img.onload = () => {
        adjusterSourceImage = img;
        showPostCaptureOptions(dataUrl);
      };
      img.onerror = () => {
        showToast("Could not load selected photo.", "error");
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      showToast("Error reading file.", "error");
    };
    reader.readAsDataURL(file);
  } catch (err) {
    showToast("Error loading file: " + err.message, "error");
  } finally {
    event.target.value = "";
  }
}

/**
 * Runs OCR directly from post-capture options card
 */
async function triggerSmartScanFromPostCapture() {
  if (!adjusterSourceImage && !lastCapturedDataUrl) {
    showToast("No photo found to scan. Please take a photo first.", "warn");
    return;
  }

  const postBusy = document.getElementById("post-capture-busy");
  const optionsGrid = document.querySelector(".post-capture-options-grid");
  if (optionsGrid) optionsGrid.style.display = "none";
  if (postBusy) postBusy.style.display = "block";

  try {
    const sourceEl = adjusterSourceImage || document.getElementById("post-capture-preview-img");
    await processWizardImageOcr(sourceEl, lastCapturedDataUrl);
  } finally {
    if (optionsGrid) optionsGrid.style.display = "grid";
    if (postBusy) postBusy.style.display = "none";
  }
}

/**
 * Opens Interactive Adjuster from post-capture options card
 */
function openAdjusterFromPostCapture() {
  if (!adjusterSourceImage) {
    if (lastCapturedDataUrl) {
      const img = new Image();
      img.onload = () => openImageAdjuster(img);
      img.src = lastCapturedDataUrl;
      return;
    }
    showToast("No photo available to adjust.", "warn");
    return;
  }
  openImageAdjuster(adjusterSourceImage);
}

// ════════════════════════════════════════════════════════════
// ── INTERACTIVE IMAGE ADJUSTER & ANGLE CORRECTION CONTROLLER ──
// ════════════════════════════════════════════════════════════

let adjusterSourceImage = null;
let adjusterState = {
  angle: 0,           // Fine angle slider (-45 to +45)
  baseRotation: 0,    // 0, 90, 180, 270 (from 90° buttons)
  zoom: 1.0,          // 1.0 to 4.0
  panX: 0,            // Horizontal translation offset
  panY: 0,            // Vertical translation offset
  lcdFilter: false    // High contrast B&W LCD filter
};

let isDraggingAdjuster = false;
let dragStartX = 0;
let dragStartY = 0;
let initialPanX = 0;
let initialPanY = 0;

/**
 * Initializes and displays the Image Adjuster view with captured image
 */
function openImageAdjuster(img) {
  adjusterSourceImage = img;

  const launchCard = document.getElementById("wizard-camera-launch-card");
  const postCaptureCard = document.getElementById("wizard-post-capture-card");
  const skipWrap = document.getElementById("wizard-skip-wrap");
  const adjCard = document.getElementById("wizard-adjuster-container");

  if (launchCard) launchCard.style.display = "none";
  if (postCaptureCard) postCaptureCard.style.display = "none";
  if (skipWrap) skipWrap.style.display = "none";
  if (adjCard) adjCard.style.display = "block";

  // Reset adjustments to initial default
  resetAdjuster();

  // Attach touch/mouse pan listeners once
  initAdjusterInteractions();

  // Draw initial state
  renderAdjusterCanvas();

  // Scroll smoothly to adjuster on mobile
  if (adjCard && window.innerWidth < 768) {
    adjCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/**
 * Resets all transformations
 */
function resetAdjuster() {
  adjusterState = {
    angle: 0,
    baseRotation: 0,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    lcdFilter: false
  };

  const angleSlider = document.getElementById("adjuster-angle-slider");
  const zoomSlider = document.getElementById("adjuster-zoom-slider");
  const angleLbl = document.getElementById("angle-value-lbl");
  const zoomLbl = document.getElementById("zoom-value-lbl");
  const contrastBtn = document.getElementById("btn-toggle-contrast");

  if (angleSlider) angleSlider.value = 0;
  if (zoomSlider) zoomSlider.value = 1;
  if (angleLbl) angleLbl.textContent = "0°";
  if (zoomLbl) zoomLbl.textContent = "1.0x";
  if (contrastBtn) {
    contrastBtn.classList.remove("active");
    contrastBtn.textContent = "🌓 LCD Filter: OFF";
  }

  renderAdjusterCanvas();
}

/**
 * Cancels Adjuster and reopens Fullscreen Camera
 */
function cancelAdjusterAndRetake() {
  const adjCard = document.getElementById("wizard-adjuster-container");
  if (adjCard) adjCard.style.display = "none";
  openFullscreenCamera();
}

/**
 * Fine Angle Correction Slider Handler (-45° to +45°)
 */
function onAngleSliderChange(val) {
  adjusterState.angle = parseFloat(val) || 0;
  const angleSlider = document.getElementById("adjuster-angle-slider");
  if (angleSlider) angleSlider.value = adjusterState.angle;
  const angleLbl = document.getElementById("angle-value-lbl");
  if (angleLbl) angleLbl.textContent = (adjusterState.angle > 0 ? "+" : "") + adjusterState.angle.toFixed(1) + "°";
  renderAdjusterCanvas();
}

function nudgeAngle(delta) {
  let newAngle = Math.max(-45, Math.min(45, adjusterState.angle + delta));
  onAngleSliderChange(newAngle);
}

/**
 * Zoom Slider Handler (1x to 4x)
 */
function onZoomSliderChange(val) {
  adjusterState.zoom = Math.max(1.0, Math.min(4.0, parseFloat(val) || 1.0));
  const zoomSlider = document.getElementById("adjuster-zoom-slider");
  if (zoomSlider) zoomSlider.value = adjusterState.zoom;
  const zoomLbl = document.getElementById("zoom-value-lbl");
  if (zoomLbl) zoomLbl.textContent = adjusterState.zoom.toFixed(2) + "x";
  renderAdjusterCanvas();
}

function nudgeZoom(delta) {
  let newZoom = Math.max(1.0, Math.min(4.0, adjusterState.zoom + delta));
  onZoomSliderChange(newZoom);
}

/**
 * 90° Rotations (Left or Right)
 */
function rotate90(delta) {
  adjusterState.baseRotation = (adjusterState.baseRotation + delta) % 360;
  if (adjusterState.baseRotation < 0) adjusterState.baseRotation += 360;
  renderAdjusterCanvas();
}

/**
 * Toggles high-contrast digital display enhancement filter
 */
function toggleLcdContrastFilter() {
  adjusterState.lcdFilter = !adjusterState.lcdFilter;
  const contrastBtn = document.getElementById("btn-toggle-contrast");
  if (contrastBtn) {
    if (adjusterState.lcdFilter) {
      contrastBtn.classList.add("active");
      contrastBtn.textContent = "🌓 LCD Filter: ON";
    } else {
      contrastBtn.classList.remove("active");
      contrastBtn.textContent = "🌓 LCD Filter: OFF";
    }
  }
  renderAdjusterCanvas();
}

/**
 * Initializes Touch & Mouse drag listeners for panning inside viewport
 */
let adjusterInteractionsBound = false;
function initAdjusterInteractions() {
  if (adjusterInteractionsBound) return;
  const viewport = document.getElementById("adjuster-viewport");
  if (!viewport) return;

  const onStart = (clientX, clientY) => {
    isDraggingAdjuster = true;
    dragStartX = clientX;
    dragStartY = clientY;
    initialPanX = adjusterState.panX;
    initialPanY = adjusterState.panY;
  };

  const onMove = (clientX, clientY) => {
    if (!isDraggingAdjuster) return;
    const dx = clientX - dragStartX;
    const dy = clientY - dragStartY;
    adjusterState.panX = initialPanX + dx;
    adjusterState.panY = initialPanY + dy;
    renderAdjusterCanvas();
  };

  const onEnd = () => {
    isDraggingAdjuster = false;
  };

  // Mouse events
  viewport.addEventListener("mousedown", (e) => onStart(e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", onEnd);

  // Touch events
  viewport.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  viewport.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1) {
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  viewport.addEventListener("touchend", onEnd);
  adjusterInteractionsBound = true;
}

/**
 * Renders the adjusted, straightened & zoomed image onto the Adjuster Canvas
 */
function renderAdjusterCanvas() {
  const canvas = document.getElementById("adjuster-canvas");
  if (!canvas || !adjusterSourceImage) return;

  const viewport = document.getElementById("adjuster-viewport");
  const vw = viewport ? viewport.clientWidth : 400;
  const vh = viewport ? viewport.clientHeight : 300;

  // Set internal resolution matching viewport
  canvas.width = vw || 400;
  canvas.height = vh || 300;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  // Move to center of viewport
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.translate(cx + adjusterState.panX, cy + adjusterState.panY);

  // Apply base 90° rotation + fine angle slider
  const totalAngleDeg = adjusterState.baseRotation + adjusterState.angle;
  const totalAngleRad = (totalAngleDeg * Math.PI) / 180;
  ctx.rotate(totalAngleRad);

  // Apply zoom
  ctx.scale(adjusterState.zoom, adjusterState.zoom);

  // Calculate scaled image dimensions to fit viewport initially
  const imgW = adjusterSourceImage.naturalWidth || adjusterSourceImage.width;
  const imgH = adjusterSourceImage.naturalHeight || adjusterSourceImage.height;
  const fitScale = Math.min(canvas.width / imgW, canvas.height / imgH);
  const drawW = imgW * fitScale;
  const drawH = imgH * fitScale;

  // Draw image centered
  ctx.drawImage(adjusterSourceImage, -drawW / 2, -drawH / 2, drawW, drawH);

  ctx.restore();

  // Optional: Apply high contrast digital enhancement if enabled
  if (adjusterState.lcdFilter) {
    applyCanvasLcdFilter(ctx, canvas.width, canvas.height);
  }
}

/**
 * High contrast grayscale / binarization filter for fading LCD segments
 */
function applyCanvasLcdFilter(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  const contrastFactor = 1.6; // High contrast
  const intercept = 128 * (1 - contrastFactor);

  for (let i = 0; i < d.length; i += 4) {
    // Luminance
    let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Contrast stretch
    gray = contrastFactor * gray + intercept;
    // Clamp
    gray = gray < 0 ? 0 : (gray > 255 ? 255 : gray);

    d[i] = gray;
    d[i + 1] = gray;
    d[i + 2] = gray;
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Extracts the cropped area inside the guide frame and passes it to OCR
 */
async function applyAdjusterCropAndScan() {
  const viewport = document.getElementById("adjuster-viewport");
  const cropGuide = document.getElementById("adjuster-crop-guide");
  const canvas = document.getElementById("adjuster-canvas");

  if (!viewport || !cropGuide || !canvas || !adjusterSourceImage) return;

  // Get guide rectangle relative to viewport
  const vpRect = viewport.getBoundingClientRect();
  const guideRect = cropGuide.getBoundingClientRect();

  const guideLeft = guideRect.left - vpRect.left;
  const guideTop = guideRect.top - vpRect.top;
  const guideW = guideRect.width;
  const guideH = guideRect.height;

  // Create high-resolution crop export canvas (at least 1200px width for crystal clear OCR)
  const exportScale = Math.max(2, Math.min(4, 1600 / (guideW || 400)));
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = Math.round(guideW * exportScale);
  cropCanvas.height = Math.round(guideH * exportScale);
  const cropCtx = cropCanvas.getContext("2d");

  cropCtx.fillStyle = "#ffffff";
  cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

  cropCtx.save();
  // Scale coordinate system to high resolution
  cropCtx.scale(exportScale, exportScale);
  // Shift origin so that top-left of crop guide corresponds to (0, 0)
  cropCtx.translate(-guideLeft, -guideTop);

  // Now replay viewport rendering identical to renderAdjusterCanvas
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  cropCtx.translate(cx + adjusterState.panX, cy + adjusterState.panY);

  const totalAngleDeg = adjusterState.baseRotation + adjusterState.angle;
  const totalAngleRad = (totalAngleDeg * Math.PI) / 180;
  cropCtx.rotate(totalAngleRad);

  cropCtx.scale(adjusterState.zoom, adjusterState.zoom);

  const imgW = adjusterSourceImage.naturalWidth || adjusterSourceImage.width;
  const imgH = adjusterSourceImage.naturalHeight || adjusterSourceImage.height;
  const fitScale = Math.min(canvas.width / imgW, canvas.height / imgH);
  const drawW = imgW * fitScale;
  const drawH = imgH * fitScale;

  cropCtx.drawImage(adjusterSourceImage, -drawW / 2, -drawH / 2, drawW, drawH);
  cropCtx.restore();

  // If LCD filter was enabled, apply to high-res crop
  if (adjusterState.lcdFilter) {
    applyCanvasLcdFilter(cropCtx, cropCanvas.width, cropCanvas.height);
  }

  const croppedDataUrl = cropCanvas.toDataURL("image/jpeg", 0.96);
  lastCapturedDataUrl = croppedDataUrl;

  // Hide adjuster and transition to OCR processing
  const adjCard = document.getElementById("wizard-adjuster-container");
  if (adjCard) adjCard.style.display = "none";

  const postCaptureCard = document.getElementById("wizard-post-capture-card");
  if (postCaptureCard) {
    postCaptureCard.style.display = "block";
    const previewImg = document.getElementById("post-capture-preview-img");
    if (previewImg) previewImg.src = croppedDataUrl;
  }

  await processWizardImageOcr(cropCanvas, croppedDataUrl);
}

/**
 * Executes OCR on image, populates Step 2 Verification Card and transitions
 */
async function processWizardImageOcr(sourceElement, dataUrl) {
  const busy = document.getElementById("wizard-busy-overlay");
  const statusEl = document.getElementById("wizard-ocr-status");
  const postBusy = document.getElementById("post-capture-busy");
  const postStatus = document.getElementById("post-capture-status-text");

  if (busy) busy.style.display = "flex";
  if (postBusy) postBusy.style.display = "block";
  if (statusEl) statusEl.textContent = "Reading printer LCD & serial...";
  if (postStatus) postStatus.textContent = "Reading printer LCD & serial...";

  try {
    if (!window.OCR_ENGINE) {
      throw new Error("OCR Engine is loading or unavailable.");
    }
    const result = await window.OCR_ENGINE.recognize(sourceElement);
    console.log("[Wizard OCR] Result:", result);

    scannedDataPending = result;

    // Resolve Counter Item from serialNo or counterMarker
    const matchedPrinter = findMatchingPrinter(result.serialNo, result.counterMarker);
    if (matchedPrinter) {
      scannedDataPending.matchedPrinter = matchedPrinter;
    }

    // Set preview photo in Step 2
    const previewImg = document.getElementById("verify-preview-img");
    if (previewImg) previewImg.src = dataUrl;

    // Populate Verification Slide in Step 2
    const counterValEl = document.getElementById("verify-counter-val");
    const counterSubEl = document.getElementById("verify-counter-sub");
    const readingValEl = document.getElementById("verify-reading-val");
    const readingSubEl = document.getElementById("verify-reading-sub");

    if (counterValEl) {
      if (matchedPrinter) {
        counterValEl.innerHTML = `<span style="color:#10b981;">🟢 ${escapeHtml(matchedPrinter.fullCounter)}</span>`;
        if (counterSubEl) counterSubEl.textContent = `${matchedPrinter.counterName} • ${matchedPrinter.hospital || "ALL"}`;
      } else if (result.serialNo) {
        counterValEl.innerHTML = `<span style="color:#38bdf8;">S/N: ${escapeHtml(result.serialNo)}</span>`;
        if (counterSubEl) counterSubEl.textContent = "Serial recognized (Confirm printer in next step)";
      } else if (result.counterMarker) {
        counterValEl.innerHTML = `<span style="color:#38bdf8;">Marker: #${escapeHtml(result.counterMarker)}</span>`;
        if (counterSubEl) counterSubEl.textContent = "Counter sticker recognized";
      } else {
        counterValEl.innerHTML = `<span style="color:#f59e0b;">⚠️ Not Detected</span>`;
        if (counterSubEl) counterSubEl.textContent = "Will select manually in next step";
      }
    }

    if (readingValEl) {
      const isVision = result.method === "vision";
      if (result.closingReading !== null && result.closingReading !== undefined) {
        readingValEl.innerHTML = `<strong style="font-size:1.4rem; color:#0284c7;">${result.closingReading}</strong> <span style="font-size:0.82rem; color:var(--text-muted);">Pages</span>`;
        if (readingSubEl) readingSubEl.textContent = isVision ? "✨ Extracted via AI Vision" : "Extracted from LCD Total Count (JS OCR)";
      } else {
        readingValEl.innerHTML = `<span style="color:#f59e0b; font-size:1.1rem;">⚠️ Not Detected</span>`;
        if (readingSubEl) readingSubEl.textContent = "Enter closing reading manually in Step 4";
      }
    }

    if (busy) busy.style.display = "none";
    if (postBusy) postBusy.style.display = "none";
    if (navigator.vibrate) navigator.vibrate(100);

    // Transition smoothly to Step 2
    goToWizardStep(2);

  } catch (err) {
    console.error("[Wizard OCR] Error:", err);
    if (busy) busy.style.display = "none";
    if (postBusy) postBusy.style.display = "none";
    showToast("Scan analysis failed: " + err.message, "error");
    // Offer fallback directly to manual counter selection
    goToWizardStep(3);
  }
}

/**
 * Returns from Step 2 back to Adjuster view in Step 1 without losing photo
 */
function returnToAdjusterStep() {
  goToWizardStep(1);
  if (adjusterSourceImage) {
    const launchCard = document.getElementById("wizard-camera-launch-card");
    const postCaptureCard = document.getElementById("wizard-post-capture-card");
    const skipWrap = document.getElementById("wizard-skip-wrap");
    const adjCard = document.getElementById("wizard-adjuster-container");

    if (launchCard) launchCard.style.display = "none";
    if (postCaptureCard) postCaptureCard.style.display = "none";
    if (skipWrap) skipWrap.style.display = "none";
    if (adjCard) adjCard.style.display = "block";
    renderAdjusterCanvas();
  }
}

/**
 * Step 2: Confirms extracted printer & reading, auto-applies and advances to Step 3
 */
function confirmStep2AndProceed() {
  if (scannedDataPending) {
    let { closingReading, matchedPrinter, serialNo, counterMarker } = scannedDataPending;

    // Fallback match if not matched earlier
    if (!matchedPrinter) {
      matchedPrinter = findMatchingPrinter(serialNo, counterMarker);
      if (matchedPrinter) {
        scannedDataPending.matchedPrinter = matchedPrinter;
      }
    }

    // Pre-select counter in Step 3 if matched
    if (matchedPrinter) {
      const val = matchedPrinter.fullCounter || matchedPrinter.value || matchedPrinter.counterNo;
      const row1 = matchedPrinter.row1 || matchedPrinter.fullCounter || val;
      const row2 = matchedPrinter.row2 || [matchedPrinter.counterName, matchedPrinter.hospital ? `(${matchedPrinter.hospital})` : ""].filter(Boolean).join(" ");
      selectCounterOption(val, row1, row2);
    }

    // Pre-fill closing reading into Step 4
    if (closingReading !== null && closingReading !== undefined && closingReading !== "") {
      const closingInput = document.getElementById("closing-reading");
      if (closingInput) {
        closingInput.value = closingReading;
        calcBalance();
        validateReadings();
      }
    }
  }

  goToWizardStep(3);
}

/**
 * Step 3: Handles conditional Paper Rim Checkbox toggle
 */
function handleRimCheckboxChange(isChecked) {
  const container = document.getElementById("rim-inputs-collapsible");
  const typeSelect = document.getElementById("issue-receive-select");
  const issuedInput = document.getElementById("paper-issued");
  const receivedInput = document.getElementById("paper-recieved");

  if (container) {
    container.style.display = isChecked ? "block" : "none";
  }

  if (!isChecked) {
    // Reset to none / 0 so paper balance is not altered unintentionally
    if (typeSelect) typeSelect.value = "None";
    if (issuedInput) issuedInput.value = "0";
    if (receivedInput) receivedInput.value = "0";
    toggleIssueReceiveFields();
    calcBalance();
  } else {
    // Default to ISSUE when user actively checks box
    if (typeSelect) typeSelect.value = "ISSUE";
    toggleIssueReceiveFields();
  }
}

/**
 * Step 3: Validates counter selection and advances to Step 4 (Meter Readings)
 */
function proceedToStep4() {
  const counterVal = document.getElementById("counter-select")?.value;
  if (!counterVal) {
    showToast("⚠️ Please select a Counter Number before continuing.", "warn");
    openCounterPickerModal();
    return;
  }

  // Ensure Opening Reading is refreshed from latest entry
  handleCounterSelectChange();

  // Ensure scanned closing reading is preserved if present
  if (scannedDataPending && scannedDataPending.closingReading !== null && scannedDataPending.closingReading !== undefined) {
    const closingInput = document.getElementById("closing-reading");
    if (closingInput && (!closingInput.value || closingInput.value === "0")) {
      closingInput.value = scannedDataPending.closingReading;
    }
  }

  calcBalance();
  validateReadings();

  goToWizardStep(4);
}

/**
 * Searches allPrinterItems to match scanned serialNo or counterMarker
 */
function findMatchingPrinter(serialNo, counterMarker) {
  const pool = (allPrinterItems && allPrinterItems.length) ? allPrinterItems : (counterPickerData && counterPickerData.length ? counterPickerData : []);
  if (!pool.length) return null;

  // 1. Exact or partial serial match
  if (serialNo) {
    const cleanScanSerial = String(serialNo).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (cleanScanSerial) {
      const match = pool.find(p => {
        const s = p.serialNo || (p.value && p.value.split("-")[1]) || "";
        if (!s) return false;
        const cleanPrinterSerial = String(s).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        return cleanPrinterSerial === cleanScanSerial || 
               cleanPrinterSerial.includes(cleanScanSerial) || 
               cleanScanSerial.includes(cleanPrinterSerial);
      });
      if (match) return match;
    }
  }

  // 2. Counter marker number match (e.g. marker: "16", "#16", "Counter 16")
  if (counterMarker) {
    const markerDigits = String(counterMarker).replace(/[^0-9]/g, "");
    if (markerDigits) {
      const targetMarkerNum = parseInt(markerDigits, 10);
      const match = pool.find(p => {
        const cText = p.counterNo || p.value || p.fullCounter || "";
        const digits = cText.replace(/[^0-9]/g, "");
        if (digits) {
          const pNum = parseInt(digits, 10);
          return pNum === targetMarkerNum;
        }
        return false;
      });
      if (match) return match;
    }
  }

  return null;
}

// Ensure camera is stopped when navigating away from Entry tab
const prevShowTab = window.showTab;
window.showTab = function(tabName) {
  if (typeof prevShowTab === "function") prevShowTab(tabName);
  if (tabName !== "entry") {
    stopWizardCamera();
    closeFullscreenCamera();
  }
};


