/**
 * SNMC PrintTrack - OCR Scanner Engine (assets/js/ocr.js)
 * High-speed client-side LCD & Marker extraction using Tesseract.js
 */

const OCR_ENGINE = {
  isInitialized: false,
  worker: null,
  initPromise: null,

  async init() {
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
              const statusEl = document.getElementById("ocr-status-text");
              if (statusEl) {
                if (m.status === "recognizing text") {
                  const pct = Math.round((m.progress || 0) * 100);
                  statusEl.textContent = `Reading display... ${pct}%`;
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

  /**
   * Preprocesses canvas for LCD dot-matrix / segment contrast
   */
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

  /**
   * Recognizes text from image/canvas/dataURL/Blob
   */
  async recognize(imageSource) {
    const ready = await this.init();
    if (!ready) {
      throw new Error("OCR engine could not be initialized");
    }

    let targetSource = imageSource;
    if (imageSource instanceof HTMLCanvasElement) {
      targetSource = this.preprocessCanvas(imageSource);
    }

    const { data: { text } } = await this.worker.recognize(targetSource);
    return this.parsePrinterData(text);
  },

  /**
   * Parses raw OCR text into structured values
   */
  parsePrinterData(rawText) {
    if (!rawText) return { closingReading: null, serialNo: null, counterMarker: null, rawText: "" };
    
    const text = rawText.toUpperCase().replace(/\r\n/g, "\n");
    let closingReading = null;
    let serialNo = null;
    let counterMarker = null;

    // 1. Check for LCD reading: "TOTAL COUNT : 017606" or "017606"
    const countPatterns = [
      /(?:TOTAL\s*COUNT|TOTAL\s*PAGE|T0TAL\s*COUNT|COUNT)\s*[:=]?\s*0*([0-9]{2,8})/i,
      /(?:TOTAL|COUNT)\s*[:=]?\s*([0-9]{3,8})/i,
      /\b0*([0-9]{4,7})\b/g
    ];

    for (const pat of countPatterns) {
      if (pat.global) {
        const matches = text.match(pat);
        if (matches && matches.length) {
          for (const m of matches) {
            const numVal = parseInt(m.trim(), 10);
            if (numVal > 0 && numVal < 10000000 && (!serialNo || !serialNo.includes(m.trim()))) {
              if (!closingReading) closingReading = numVal;
            }
          }
        }
      } else {
        const m = text.match(pat);
        if (m && m[1]) {
          const num = parseInt(m[1].trim(), 10);
          if (!isNaN(num) && num > 0) {
            closingReading = num;
            break;
          }
        }
      }
    }

    // 2. Check for Serial No: e.g. "AcN 3041234129", "ACN 3041234129", "AN 3041234129", "ACN3041234129"
    // Note: OCR recognized 'AN 3041234129' or 'ACN 3041234129'
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

    // 3. Check for Counter circle/marker number (e.g. circled "16", "(16)", "16", "NO. 16", "COUNTER 16")
    const markerPatterns = [
      /(?:COUNTER|NO|NO\.|C|#)[\s.:#-]*([0-9]{1,3})\b/i,
      /\(([0-9]{1,3})\)/,
      /(?:^|\n|\s)([0-9]{1,3})(?:\n|\s|$)/
    ];

    for (const pat of markerPatterns) {
      const m = text.match(pat);
      if (m && m[1]) {
        const parsed = parseInt(m[1].trim(), 10);
        // Ensure not part of the large reading or serial digits
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
