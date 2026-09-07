/**
 * SNMC PrintTrack - OCR & AI Vision Scanner Engine (assets/js/ocr.js)
 * Supports Method 2 (Cloud AI Vision via Gemini) & Method 1 (Client Tesseract.js)
 */

const OCR_ENGINE = {
  isInitialized: false,
  worker: null,
  initPromise: null,
  activeMethod: "vision", // Default to Method 2: AI Vision

  async getActiveMethod() {
    // Check cached or server-authoritative OCR setting
    try {
      if (window.__SNMC_OCR_METHOD__) {
        this.activeMethod = window.__SNMC_OCR_METHOD__;
        return this.activeMethod;
      }
      if (typeof sheetsRequest === "function") {
        const res = await sheetsRequest("getScannerSettings");
        if (res && res.ocrMethod) {
          this.activeMethod = res.ocrMethod;
          window.__SNMC_OCR_METHOD__ = res.ocrMethod;
          return this.activeMethod;
        }
      }
    } catch (_) {}
    return this.activeMethod;
  },

  setMethod(method) {
    this.activeMethod = (method === "tesseract") ? "tesseract" : "vision";
    window.__SNMC_OCR_METHOD__ = this.activeMethod;
  },

  /**
   * Main recognize dispatcher: routes to AI Vision (Method 2) or Tesseract (Method 1)
   */
  async recognize(imageSource) {
    const method = await this.getActiveMethod();
    console.log(`[OCR_ENGINE] Using Scanner Method: ${method.toUpperCase()}`);

    if (method === "vision") {
      return await this.recognizeWithVision(imageSource);
    } else {
      return await this.recognizeWithTesseract(imageSource);
    }
  },

  /**
   * Method 2: AI Vision via Backend Gemini Proxy
   */
  async recognizeWithVision(imageSource) {
    const statusEl = document.getElementById("ocr-status-text") || document.getElementById("wizard-ocr-status");
    if (statusEl) statusEl.textContent = "AI Vision: Analyzing display & labels...";

    let base64Data = "";
    if (imageSource instanceof HTMLCanvasElement) {
      base64Data = imageSource.toDataURL("image/jpeg", 0.90);
    } else if (typeof imageSource === "string" && imageSource.startsWith("data:")) {
      base64Data = imageSource;
    } else if (imageSource instanceof HTMLImageElement) {
      const c = document.createElement("canvas");
      c.width = imageSource.naturalWidth || imageSource.width;
      c.height = imageSource.naturalHeight || imageSource.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(imageSource, 0, 0);
      base64Data = c.toDataURL("image/jpeg", 0.90);
    } else {
      throw new Error("Unsupported image format for AI Vision.");
    }

    if (typeof sheetsRequest !== "function") {
      throw new Error("sheetsRequest client is not available.");
    }

    if (statusEl) statusEl.textContent = "AI Vision: Processing meter & serial...";

    const res = await sheetsRequest("visionScan", {
      method: "POST",
      body: JSON.stringify({
        image: base64Data,
        mimeType: "image/jpeg"
      })
    });

    if (!res || !res.success || !res.data) {
      throw new Error((res && res.error) || "AI Vision returned invalid response.");
    }

    const aiData = res.data;
    let closingReading = null;
    if (aiData.closingReading !== null && aiData.closingReading !== undefined) {
      const n = parseInt(aiData.closingReading, 10);
      if (!isNaN(n) && n >= 0) closingReading = n;
    }

    let serialNo = aiData.serialNo ? String(aiData.serialNo).trim() : null;
    let counterMarker = aiData.counterMarker ? String(aiData.counterMarker).trim().replace(/[^0-9]/g, "") : null;

    return {
      closingReading,
      serialNo,
      counterMarker,
      confidence: aiData.confidence || 0.9,
      notes: aiData.notes || "",
      method: "vision"
    };
  },

  /**
   * Method 1: Client-Side JS OCR (Tesseract.js)
   */
  async initTesseract() {
    if (this.isInitialized && this.worker) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (typeof Tesseract === "undefined") {
        console.warn("[OCR] Tesseract.js is not loaded yet.");
        return false;
      }
      try {
        const workerOptions = {
          workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
          corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js",
          logger: m => {
            if (m && m.status) {
              const statusEl = document.getElementById("ocr-status-text") || document.getElementById("wizard-ocr-status");
              if (statusEl) {
                if (m.status === "recognizing text") {
                  const pct = Math.round((m.progress || 0) * 100);
                  statusEl.textContent = `Tesseract reading display... ${pct}%`;
                } else if (m.status === "loading tesseract core") {
                  statusEl.textContent = "Loading OCR core...";
                } else if (m.status === "loading language traineddata") {
                  statusEl.textContent = "Loading trained data...";
                }
              }
            }
          }
        };

        this.worker = await Tesseract.createWorker("eng", 1, workerOptions);

        await this.worker.setParameters({
          tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:/-#() "
        });
        this.isInitialized = true;
        return true;
      } catch (err) {
        console.error("[OCR] Failed to initialize Tesseract worker:", err);
        this.worker = null;
        this.isInitialized = false;
        throw err;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  },

  preprocessCanvas(sourceCanvas) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    
    const processedCanvas = document.createElement("canvas");
    processedCanvas.width = w;
    processedCanvas.height = h;
    const ctx = processedCanvas.getContext("2d");
    ctx.drawImage(sourceCanvas, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Grayscale + high contrast stretch
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const contrast = 1.6;
      let adjusted = (gray - 128) * contrast + 128;
      if (adjusted > 255) adjusted = 255;
      if (adjusted < 0) adjusted = 0;

      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }
    ctx.putImageData(imgData, 0, 0);
    return processedCanvas;
  },

  async recognizeWithTesseract(imageSource) {
    const ready = await this.initTesseract();
    if (!ready) {
      throw new Error("Tesseract engine could not be initialized.");
    }

    let targetSource = imageSource;
    if (imageSource instanceof HTMLCanvasElement) {
      targetSource = this.preprocessCanvas(imageSource);
    }

    const { data: { text } } = await this.worker.recognize(targetSource);
    const parsed = this.parsePrinterData(text);
    parsed.method = "tesseract";
    return parsed;
  },

  parsePrinterData(rawText) {
    if (!rawText) return { closingReading: null, serialNo: null, counterMarker: null, rawText: "" };
    
    const text = rawText.toUpperCase().replace(/\r\n/g, "\n");
    let closingReading = null;
    let serialNo = null;
    let counterMarker = null;

    const labeledPatterns = [
      /(?:T[O0o]TA[L1I|]\s*C[O0o]UNT|T[O0o]TA[L1I|]\s*C[O0o]UN|T[O0o]TAL|C[O0o]UNT)\s*[:=.\s]?\s*0*([0-9OIl]{1,8})\b/i,
      /(?:T[O0o]TA[L1I|]\s*PA[G6]E|PA[G6]E\s*C[O0o]UNT)\s*[:=.\s]?\s*0*([0-9OIl]{1,8})\b/i,
      /(?:COUNT|TOTAL)\s*[:=.\s]?\s*0*([0-9OIl]{1,8})\b/i
    ];

    for (const pat of labeledPatterns) {
      const m = text.match(pat);
      if (m && m[1]) {
        const cleanDigits = m[1].trim().replace(/[O]/gi, "0").replace(/[Il|]/g, "1");
        const num = parseInt(cleanDigits, 10);
        if (!isNaN(num) && num >= 0) {
          closingReading = num;
          break;
        }
      }
    }

    if (closingReading === null) {
      const formattedMeter = text.match(/\b0+([0-9OIl]{1,6})\b/);
      if (formattedMeter && formattedMeter[1]) {
        const cleanDigits = formattedMeter[1].trim().replace(/[O]/gi, "0").replace(/[Il|]/g, "1");
        const num = parseInt(cleanDigits, 10);
        if (!isNaN(num) && num >= 0) {
          closingReading = num;
        }
      }
    }

    if (closingReading === null) {
      const genericMatches = text.match(/\b([0-9]{4,7})\b/g);
      if (genericMatches) {
        for (const gm of genericMatches) {
          const num = parseInt(gm.trim(), 10);
          if (!isNaN(num) && (!serialNo || !serialNo.includes(gm.trim()))) {
            closingReading = num;
            break;
          }
        }
      }
    }

    const serialPatterns = [
      /(?:A[C\s]?N|ACN|SCN|AG\s*N)[\s.:_-]*([0-9]{8,12})/i,
      /(?:A[C\s]?N|ACN)[\s.:_-]*(304[\s\/-]?[0-9]{6,8})/i,
      /\b(304[0-9]{7})\b/,
      /(?:ACN\s*304\s*[\/\-]?[0-9]{6,8}|ACN[0-9]{8,12})/i
    ];

    for (const sPat of serialPatterns) {
      const sm = text.match(sPat);
      if (sm) {
        const captured = sm[1] || sm[0];
        const digitsOnly = captured.replace(/[^0-9]/g, "");
        if (digitsOnly.length >= 7) {
          serialNo = "ACN" + digitsOnly;
          break;
        }
      }
    }

    const markerPatterns = [
      /(?:COUNTER|NO|NO\.|C|#)[\s.:#-]*([0-9]{1,3})\b/i,
      /\(([0-9]{1,3})\)/,
      /(?:^|\n|\s)([0-9]{1,3})(?:\n|\s|$)/
    ];

    for (const pat of markerPatterns) {
      const m = text.match(pat);
      if (m && m[1]) {
        const parsed = parseInt(m[1].trim(), 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 150) {
          if (!closingReading || parsed !== closingReading) {
            counterMarker = String(parsed);
            break;
          }
        }
      }
    }

    return {
      closingReading,
      serialNo,
      counterMarker,
      rawText: rawText.trim()
    };
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = OCR_ENGINE;
} else {
  window.OCR_ENGINE = OCR_ENGINE;
}
