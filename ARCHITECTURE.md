# PrintTrack — Implementation Architecture

Foundation for all remediation work on branch `fix/audit-remediation`.
Goal: eliminate schema drift, stop credential misuse, and move authorization
server-side while keeping the app a no-build vanilla-JS PWA.

## 1. Layers (current → target)

```
 Browser PWA (index.html / app.html)
   ├─ config.js      Firebase + app config (public web key ONLY)
   ├─ schema.js  ★   SINGLE SOURCE OF TRUTH for all sheet tabs/columns
   ├─ auth.js        Firebase login + token storage + auth guard
   ├─ sheets.js      Thin BFF client (always calls /.netlify/functions/sheets)
   ├─ db.js          IndexedDB offline queue
   ├─ notifications.js  FCM subscribe + broadcast (server-gated)
   └─ app.js         UI / forms / history / analytics (reads schema.js)
        │  Firebase ID token (Bearer)
        ▼
 Netlify Function (netlify/functions/sheets.js)
   ├─ verifyFirebaseIdToken()  RS256 + Google x509 certs
   ├─ service-account JWT       (held ONLY here, never in browser)
   └─ actions: printerdetails | dailyentries | appendDailyEntry | checkSender ★
        │  service-account JWT
        ▼
 Google Sheets (Form responses 1, printerdetails, fcmtokens, allowed_senders)
```

## 2. Key Principles

- **No secrets in the browser.** The Sheets service-account key and FCM server
  key NEVER ship to the client. The Firebase *web* apiKey is public by design
  but must NOT be reused as a Google Cloud / Sheets API key (previous bug).
- **One schema definition.** `assets/js/schema.js` (`SHEET_SCHEMA`) declares every
  tab, ordered column, header label, and type. `buildDailyRow()` and
  `DAILY_DISPLAY_HEADERS` derive from it. `.schema` is its human-readable mirror.
- **Server-enforced authorization.** Sender approval is decided by the function
  (`checkSender`) using the verified token email + `allowed_senders` sheet +
  `SUPER_ADMIN_EMAILS` env. The client may hide UI, but the broadcast must
  confirm the server decision.
- **BFF-only data access.** All Sheets reads/writes proxy through the function.
  Local dev uses `netlify dev`, not raw `googleapis.com` from the browser.

## 3. Files Added / Changed

| File | Change |
|------|--------|
| `assets/js/schema.js` | NEW — canonical sheet schema + helpers |
| `app.html` | Load `schema.js` after `config.js` |
| `assets/js/app.js` | Use `buildDailyRow` / `DAILY_DISPLAY_HEADERS`; drop dead `EXPECTED_HEADERS` + `currentSerialNo`; harden numeric validation |
| `assets/js/sheets.js` | Remove broken local Firebase-key fetch; always call BFF |
| `assets/js/notifications.js` | Remove duplicate `playAlertSound`/`escapeHtml`/`showToast`; server-gated sender check; drop broken `fetchAllowedSenders` |
| `netlify/functions/sheets.js` | CORS allowlist for XAMPP/local; new `checkSender` action; `SUPER_ADMINS`/`allowed_senders` helpers |
| `.schema` | Preserve legacy `dailyentry`; document live `Form responses 1` + architecture + roadmap |

## 4. Open Design Decisions (for later phases)

- Push delivery should move to **FCM v1** via Firebase Admin SDK on the server
  (the legacy `fcm.googleapis.com/fcm/send` + `key=` is deprecated/shut down).
- History should be paginated / server-aggregated as row counts grow.
- Offline queue should use the real Service Worker **Background Sync** event
  (currently replayed only on the `online` event while the tab is open).
- Introduce a minimal **test/lint/CI** gate and a centralized logger.
