// ============================================================
// PrintTrack — Local Development Backend Runner (Port 8080)
// Emulates /.netlify/functions/sheets and /.netlify/functions/auth
// using local Node.js without needing Netlify cloud credits!
// ============================================================

const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;

// Load .env variables
const envPath = path.resolve(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

// Import handlers
const sheetsHandler = require("./netlify/functions/sheets.js").handler;
let authHandler = null;
try {
  authHandler = require("./netlify/functions/auth.js").handler;
} catch (_) {}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Add permissive CORS for local development
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle serverless functions: /.netlify/functions/sheets or /api/sheets
  if (pathname.includes("sheets")) {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      const event = {
        httpMethod: req.method,
        headers: req.headers,
        queryStringParameters: parsedUrl.query,
        rawQuery: parsedUrl.search ? parsedUrl.search.slice(1) : "",
        body: body || null
      };

      try {
        const result = await sheetsHandler(event, {});
        const status = result.statusCode || 200;
        const headers = result.headers || { "Content-Type": "application/json" };
        res.writeHead(status, headers);
        res.end(result.body);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Handle auth function: /.netlify/functions/auth or /api/auth
  if (pathname.includes("auth") && authHandler) {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      const event = {
        httpMethod: req.method,
        headers: req.headers,
        queryStringParameters: parsedUrl.query,
        rawQuery: parsedUrl.search ? parsedUrl.search.slice(1) : "",
        body: body || null
      };

      try {
        const result = await authHandler(event, {});
        const status = result.statusCode || 200;
        const headers = result.headers || { "Content-Type": "application/json" };
        res.writeHead(status, headers);
        res.end(result.body);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Fallback 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
});

server.listen(PORT, () => {
  console.log(`[Local Dev Backend] Running locally on http://localhost:${PORT}`);
  console.log(`[Local Dev Backend] Serving /.netlify/functions/sheets & auth with full Gemini Vision & Sheets API!`);
});
