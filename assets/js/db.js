// ============================================================
// db.js — IndexedDB Storage & Offline Background Sync Manager
// PrintTrack PWA — SNMC
// ============================================================

const DB_NAME = "PrintTrackDB";
const DB_VERSION = 1;
const STORE_PENDING = "pending_entries";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Save entry offline to IndexedDB ───────────────────────
async function saveOfflineEntry(entryPayload) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readwrite");
    const store = tx.objectStore(STORE_PENDING);
    const request = store.add({
      payload: entryPayload,
      timestamp: new Date().toISOString(),
      status: "pending"
    });

    request.onsuccess = () => {
      updateOfflineBadge();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

// ── Get all pending offline entries ───────────────────────
async function getPendingEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readonly");
    const store = tx.objectStore(STORE_PENDING);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// ── Delete entry from IndexedDB after sync ────────────────
async function deletePendingEntry(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, "readwrite");
    const store = tx.objectStore(STORE_PENDING);
    const request = store.delete(id);

    request.onsuccess = () => {
      updateOfflineBadge();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// ── Sync all offline pending entries to Google Sheets ─────
async function syncOfflineEntries() {
  if (!navigator.onLine) return;
  const entries = await getPendingEntries();
  if (!entries.length) return;

  showToast(`📡 Syncing ${entries.length} offline entry(s)...`, "info");

  for (const item of entries) {
    try {
      await appendDailyEntry(item.payload);
      await deletePendingEntry(item.id);
    } catch (err) {
      console.error("[Sync Failed for item]:", item.id, err.message);
    }
  }

  updateOfflineBadge();
  showToast("✅ Offline entries synced successfully!", "success");
  if (typeof loadHistory === "function") await loadHistory();
}

// ── Update offline badge indicator ─────────────────────────
async function updateOfflineBadge() {
  try {
    const entries = await getPendingEntries();
    const badgeEl = document.getElementById("offline-sync-badge");
    if (badgeEl) {
      if (entries.length > 0) {
        badgeEl.style.display = "inline-flex";
        badgeEl.textContent = `${entries.length} Unsynced`;
      } else {
        badgeEl.style.display = "none";
      }
    }
  } catch (e) {
    // Ignore DB error
  }
}

// ── Network status change listeners ───────────────────────
window.addEventListener("online", () => {
  showToast("🌐 Network restored. Syncing data...", "success");
  syncOfflineEntries();
});

window.addEventListener("offline", () => {
  showToast("📴 You are offline. Entries will be saved locally.", "warn");
});

document.addEventListener("DOMContentLoaded", () => {
  updateOfflineBadge();
});
