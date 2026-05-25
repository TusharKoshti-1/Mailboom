const express = require("express");
const multer  = require("multer");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const https   = require("https");

const app  = express();
const PORT = process.env.PORT || 3001;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const frontendPath = path.join(__dirname, "public");
app.use(express.static(frontendPath));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "1.0.0", timestamp: new Date().toISOString() });
});

// ─── Test API Key ─────────────────────────────────────────────────────────────
app.post("/api/test-connection", async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.json({ ok: false, message: "API key is required." });

  try {
    await sgRequest("GET", "/v3/user/profile", null, apiKey);
    res.json({ ok: true, message: "SendGrid API key verified — ready to send!" });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── Send Email ───────────────────────────────────────────────────────────────
app.post("/api/send", upload.array("attachments", 10), async (req, res) => {
  const { apiKey, fromName, fromEmail, to, subject, body, isHtml } = req.body;

  if (!apiKey)     return res.json({ ok: false, message: "SendGrid API key is required." });
  if (!fromEmail)  return res.json({ ok: false, message: "From email is required." });
  if (!to)         return res.json({ ok: false, message: "Recipient (To) is required." });
  if (!subject)    return res.json({ ok: false, message: "Subject is required." });
  if (!body)       return res.json({ ok: false, message: "Message body is required." });

  const useHtml = isHtml === "true" || isHtml === true;

  const payload = {
    personalizations: [{ to: [{ email: to.trim() }] }],
    from: { email: fromEmail.trim(), name: fromName || fromEmail },
    subject: subject.trim(),
    content: useHtml
      ? [{ type: "text/html", value: body }, { type: "text/plain", value: body.replace(/<[^>]+>/g, "") }]
      : [{ type: "text/plain", value: body }, { type: "text/html", value: body.replace(/\n/g, "<br>") }],
  };

  // Attachments
  if (req.files && req.files.length > 0) {
    payload.attachments = req.files.map(f => ({
      content:     f.buffer.toString("base64"),
      filename:    f.originalname,
      type:        f.mimetype,
      disposition: "attachment",
    }));
  }

  try {
    await sgRequest("POST", "/v3/mail/send", payload, apiKey);
    res.json({ ok: true, message: `Email sent successfully to ${to}!` });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SendGrid HTTPS helper ────────────────────────────────────────────────────
function sgRequest(method, endpoint, body, apiKey) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "api.sendgrid.com",
      path:     endpoint,
      method,
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = https.request(options, (r) => {
      let data = "";
      r.on("data", c => data += c);
      r.on("end", () => {
        if (r.statusCode >= 200 && r.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          let msg = `SendGrid error ${r.statusCode}`;
          try {
            const parsed = JSON.parse(data);
            msg = parsed.errors?.[0]?.message || msg;
            // Make common errors human-friendly
            if (r.statusCode === 401) msg = "Invalid API key. Check your SendGrid API key.";
            if (r.statusCode === 403) msg = "Forbidden — your sender email may not be verified in SendGrid.";
          } catch {}
          reject(new Error(msg));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Request timed out.")); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(frontendPath, "index.html");
  fs.existsSync(index)
    ? res.sendFile(index)
    : res.json({ status: "API running", note: "Frontend not built" });
});

app.listen(PORT, "0.0.0.0", () => console.log(`✉ MailSend running on 0.0.0.0:${PORT}`));
