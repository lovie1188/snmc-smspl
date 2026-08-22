# SNMC Standalone Backend API (`snmcBackend`)

Dedicated REST API Server for the SNMC PrintTrack & Paper Stock Management System.

## Features
- **Pure Node.js / Express API**: Completely decoupled from frontend.
- **Firebase Token Auth**: Server-side JWT verification for every endpoint.
- **Google Sheets Service Account Auth**: Secure server-to-server connection using JWT (`google-auth-library`).
- **Hospital Role Isolation**: Dynamic permissions mapped from `user_hospitals` tab.

## Quick Start (Local)

1. Install dependencies:
   ```bash
   cd snmcBackend
   npm install
   ```

2. Configure environment:
   Copy `.env.example` to `.env` and set:
   ```env
   PORT=5000
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

3. Start server:
   ```bash
   npm start
   ```

## Deploying to Cloud (Render / Railway / Fly.io / GCP)

1. Create a new GitHub repo for `snmcBackend` or deploy this folder as the root directory on **Render.com** (Free Web Service).
2. Set Environment Variables in Render/Railway Dashboard:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `SUPER_ADMIN_EMAILS`
   - `FIREBASE_PROJECT_ID`
   - `ALLOWED_ORIGINS` (e.g. `https://snmc-smspl.netlify.app`)
3. Point your frontend `APP_CONFIG.apiBaseUrl` to your live backend domain (e.g. `https://snmc-api.onrender.com`).
