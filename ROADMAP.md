# PrintTrack — Remediation Roadmap

Status tracking for fixes identified in the code audit, implemented on branch
`fix/audit-remediation`. See `ARCHITECTURE.md` for the foundation.

Legend: ✅ DONE · 🟡 PARTIAL · ⬜ TODO

## Phase 1 — Schema & Credential Integrity (this branch)

| ID | Issue (audit ref) | Fix | Status |
|----|-------------------|-----|--------|
| R1 | Schema drift: `.schema` documented a dead `dailyentry` tab; code targeted `Form responses 1` with magic arrays | Added `assets/js/schema.js` as single source of truth; `app.js` builds/renders via `buildDailyRow`/`DAILY_DISPLAY_HEADERS`; `.schema` documents real layout | ✅ |
| R2 | Firebase web apiKey reused as Google Sheets API key in `sheets.js` local fetch (invalid + can't read private sheet) | Removed the local direct-fetch path; all I/O now proxies the Netlify BFF | ✅ |
| R3 | CORS allowlist only had `localhost:8080`; XAMPP runs on :80 → local blocked | Added `http(s)://localhost[:80]`, `127.0.0.1[:80]`, `:8888` (netlify dev) to `ALLOWED_ORIGINS` | ✅ |
| R4 | Duplicate/dead code: `playAlertSound`×2, `escapeHtml`×2, `showToast`×2 in `notifications.js` | Removed the redundant copies; kept the richer `playAlertSound(duration)` and the quote-escaping `escapeHtml` from `app.js` | ✅ |
| R5 | Weak input validation (NaN/negative readings accepted) | `submitEntry` now coerces readings with a `num()` guard rejecting non-finite/negative values | ✅ |
| R6 | Notification sender approval enforced only client-side (`isAllowedSender`) | New server `checkSender` action; `initNotifications` + `sendPushNotification` use `canSendNotification()` (server decision, client fallback offline) | ✅ |
| R7 | `EXPECTED_HEADERS` (unused) and `currentSerialNo` (computed, never written) dead code | Removed both; column contract now lives in `schema.js` | ✅ |

## Phase 2 — Security Hardening (recommended next)

| ID | Issue | Proposed Fix | Status |
|----|-------|--------------|--------|
| R8 | Legacy FCM broadcast (`fcm.googleapis.com/fcm/send` + `key=`) is deprecated and would expose a server secret in the browser if enabled | Migrate to FCM v1 via Firebase Admin SDK in the Netlify function; add a `notify` action that verifies `checkSender` then delivers | ⬜ |
| R9 | `getFCMToken`/`saveTokenToSheet` use the user's OAuth token to write device tokens — acceptable, but token dedup is best-effort | Server-side dedup + TTL on `fcmtokens` tab | ⬜ |
| R10 | `.env` with real keys present in working tree | Keep gitignored; rotate if ever shared; consider a secrets manager for `GOOGLE_PRIVATE_KEY` | ⬜ |

## Phase 3 — Reliability & Scale (recommended next)

| ID | Issue | Proposed Fix | Status |
|----|-------|--------------|--------|
| R11 | History capped at 100 rows + full-sheet scan each load (O(n), no pagination) | Server-side pagination / `batchGet` + aggregation; cache dailyentries | ⬜ |
| R12 | Offline queue replays only on `online` event while tab open; SW `sync` handler is a stub | Implement real Background Sync (`sync-entries` tag) in `sw.js` + function ack | ⬜ |
| R13 | No unique Serial No.; `rows.length + 1` collisions under concurrency | Add server-assigned sequence or use Sheets row index as authoritative id | ⬜ |
| R14 | `calculateHospitalMetrics` fuzzy keyword guessing on miss | Require a reliable counter→hospital map in `printerdetails`; fail loud if missing | ⬜ |

## Phase 4 — Quality & Process (recommended next)

| ID | Issue | Proposed Fix | Status |
|----|-------|--------------|--------|
| R15 | No tests / lint / CI / lockfile | Add `package-lock.json`, ESLint, a smoke test for `verifyFirebaseIdToken` + `buildDailyRow`, and a GitHub Actions CI | ⬜ |
| R16 | No centralized logging (project rule) | Add a small client logger + structured server logs (redacted) | ⬜ |
| R17 | Large inline `<style>` blocks duplicated in both HTML files | Move to `assets/css/app.css`; keep only critical per-page overrides | ⬜ |
| R18 | `app.js` 540+ line monolith | Split into modules (form, history, analytics, export) loaded as ES modules | ⬜ |

## Verification Done

- `node --check` passes on `schema.js`, `sheets.js`, `app.js`, `notifications.js`,
  `auth.js`, `db.js`, and `netlify/functions/sheets.js`.
- Manual trace: `submitEntry` → `buildDailyRow` produces an 11-element A..K row
  matching the documented `Form responses 1` contract.
- `checkSender` path verified to compile; requires a deployed function + valid
  `allowed_senders` sheet + `SUPER_ADMIN_EMAILS` env to exercise live.
