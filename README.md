# 🏥 PrintTrack — SNMC & Softtech Multi Service Pvt. Ltd.
> **Enterprise Multi-Hospital Printer Meter & Paper Supply Lifecycle ERP**
> Serving Dr. S.N. Medical College (SNMC) Hospitals: **MDM Hospital**, **MGH Hospital**, and **UMMED Hospital**, Jodhpur.

---

## 🏗️ Architecture Overview

- **Frontend**: High-Performance Mobile-First Progressive Web App (PWA) with Offline IndexedDB queue and standalone Capacitor Native Shell.
- **Backend API**: 100% Free Forever Netlify Serverless Functions (/.netlify/functions/sheets) with 0ms Cold-Start & Direct Google Sheets Database API v4 Integration.
- **Persistent Database**: Google Sheets (Spreadsheet ID: 1Zbx8wOV3FTTxEH0k4i_F2v7SA2_pSp3R6VACroY19H0).
- **File Storage**: Google Drive API v3 (Employee Photos Folder ID: 129N1_3z_802vJ-9I5nH9jMmSBinpbzGY).
- **Authentication**: Firebase Authentication (Google OAuth 2.0) with Server-Side Hospital & Role-Based Access Control (RBAC).

---

## 🗄️ Google Sheet Database Tabs Schema

| Tab Name | Range | Purpose |
|---|---|---|
| **Form responses 1** | A:L | Daily meter reading logs, paper issued/received, closing readings, balance, and submitter email. |
| **printerdetails** | A:Z | Active printer inventory, department, hospital, model, and machine serial number. |
| **stock** | A:M | Paper stock receipts (vendor delivery, rim count, sheet count, invoice reference). |
| **user_hospitals** | A:H | Team directory, hospital assignment mapping, RBAC role, member type, login access toggle, and Google Drive photo URL. |
| **llowed_senders** | A:B | Whitelist of SuperAdmin emails authorized to broadcast push notifications. |
| **cmtokens** | A:D | Registered Web Push / FCM device subscription tokens. |

---

## 📌 Live Project Roadmap & Pending Tasks (Todo List)

### ✅ Completed Milestones
- [x] **Dual-Auth Google Sign-In & Gatekeeper**: Whitelisted login verification against user_hospitals with automatic role hydration.
- [x] **Top-Bar Dynamic Hospital Auto-Filter**: Automatically detects and locks the top bar badge/filter to the user's assigned hospital.
- [x] **Daily Entry Visual Confirmation Card**: Prominent card displaying Hospital badge, Department location, Last Closing Reading, and large centered **Machine S/N**.
- [x] **Employee & Team Directory Management**: Full CRUD operations with 8-column schema (A:H) and login access toggle (YES/NO).
- [x] **Softtech Digital ID Card Offcanvas Drawer**: Slide-over drawer with high-res official logo from Google Drive (1IXF9jnspNfuODT15GbsOiiv3Qx6GMX7y), employee details, and Paota Regn. office address.
- [x] **Employee Photo Upload to Google Drive**: Automatic image compression (JPEG 800x800) and direct upload into Google Drive folder (129N1_3z_802vJ-9I5nH9jMmSBinpbzGY).
- [x] **ISO / CR80 Physical Card Print Stylesheet**: Dedicated @media print layout calibrated for standard physical ID card proportions.
- [x] **Universal 0ms Serverless Netlify Backend**: Cross-origin, secure, secret-free serverless proxy with automatic action routing.

---

### ⏳ Pending Tasks / Next Up in Queue

#### 1. 📱 Standalone Android APK Build & Keystore Signing
- [ ] Finalize Capacitor native bridge configuration (capacitor.config.json).
- [ ] Run Android Studio build for release APK / AAB.
- [ ] Verify native push notifications and deep linking on Android devices.

#### 2. 🖨️ Printer Diagnostics & Maintenance Log Module
- [ ] Add printer breakdown / toner cartridge replacement logging tab in Google Sheets.
- [ ] Create UI for technicians to flag printer offline status and maintenance requests.
- [ ] Real-time breakdown status indicator in Daily Entry picker.

#### 3. 🔄 Background Offline Sync Queue Auto-Retry
- [ ] Enhance Service Worker background sync for poor network hospital basement zones.
- [ ] Auto-drain IndexedDB queue as soon as network connectivity is restored.

---

## 🚀 Local Development

`ash
# Target Root
d:\xampp\htdocs\SNMC

# Serve locally via XAMPP Apache
http://localhost/snmc/app.html
`

---

## 🔒 Security & Git Policy
- **No client-side secrets**: All private service keys and VAPID keys reside strictly in .env / Netlify environment variables.
- **Strict Git Approval Rule**: No git commit or git push is ever executed without explicit written user approval.
