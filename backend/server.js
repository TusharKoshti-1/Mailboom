const express    = require("express");
const multer     = require("multer");
const cors       = require("cors");
const path       = require("path");
const fs         = require("fs");
const nodemailer = require("nodemailer");

const app  = express();
const PORT = process.env.PORT || 3001;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Increase timeout for long bulk sends with attachments
app.use((req, res, next) => {
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  next();
});

const frontendPath = path.join(__dirname, "public");
app.use(express.static(frontendPath));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createTransporter({ smtpHost, smtpPort, smtpUser, smtpPass }) {
  const port = parseInt(smtpPort, 10) || 587;
  return nodemailer.createTransport({
    host:   smtpHost,
    port:   port,
    secure: port === 465,
    auth:   { user: smtpUser, pass: smtpPass },
    tls:    { rejectUnauthorized: false },
  });
}

function randomDelay(minSec, maxSec) {
  const ms = (Math.random() * (maxSec - minSec) + minSec) * 1000;
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRecipients(raw) {
  return raw
    .split(/[\n,]+/)
    .map(e => e.trim())
    .filter(e => e && e.includes("@"));
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "3.0.0", timestamp: new Date().toISOString() });
});

// ─── Test Connection ──────────────────────────────────────────────────────────
app.post("/api/test-connection", async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass } = req.body;
  if (!smtpHost || !smtpUser || !smtpPass)
    return res.json({ ok: false, message: "SMTP host, username and password are required." });
  try {
    const transporter = createTransporter({ smtpHost, smtpPort, smtpUser, smtpPass });
    await transporter.verify();
    res.json({ ok: true, message: `Connected to ${smtpHost}:${smtpPort || 587} — ready to send!` });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── Send (single or bulk with random delay) ──────────────────────────────────
app.post("/api/send", upload.array("attachments", 10), async (req, res) => {
  const {
    smtpHost, smtpPort, smtpUser, smtpPass,
    fromName, to, subject, body, isHtml,
    minDelay, maxDelay,
  } = req.body;

  if (!smtpHost || !smtpUser || !smtpPass)
    return res.json({ ok: false, message: "SMTP credentials are required." });
  if (!to)      return res.json({ ok: false, message: "Recipient (To) is required." });
  if (!subject) return res.json({ ok: false, message: "Subject is required." });
  if (!body)    return res.json({ ok: false, message: "Message body is required." });

  const recipients = parseRecipients(to);
  if (recipients.length === 0)
    return res.json({ ok: false, message: "No valid email addresses found." });

  const useHtml  = isHtml === "true" || isHtml === true;
  const fromAddr = smtpUser.trim();
  const fromFull = fromName ? `"${fromName}" <${fromAddr}>` : fromAddr;
  const minS     = parseFloat(minDelay) || 30;
  const maxS     = parseFloat(maxDelay) || 60;

  const attachments = req.files && req.files.length > 0
    ? req.files.map(f => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype }))
    : [];

  const transporter = createTransporter({ smtpHost, smtpPort, smtpUser, smtpPass });

  const results = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];

    // Random delay between emails (not before the first one)
    if (i > 0) {
      const waitSec = Math.random() * (maxS - minS) + minS;
      console.log(`⏳ Waiting ${waitSec.toFixed(1)}s before sending to ${recipient}...`);
      await randomDelay(minS, maxS);
    }

    const mailOptions = {
      from:    fromFull,
      to:      recipient,
      subject: subject.trim(),
      text:    useHtml ? body.replace(/<[^>]+>/g, "") : body,
      html:    useHtml ? body : body.replace(/\n/g, "<br>"),
    };
    if (attachments.length > 0) mailOptions.attachments = attachments;

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Sent to ${recipient} | ID: ${info.messageId}`);
      results.push({ email: recipient, ok: true, message: "Sent successfully" });
    } catch (err) {
      console.error(`❌ Failed to ${recipient}: ${err.message}`);
      results.push({ email: recipient, ok: false, message: err.message });
    }
  }

  const successCount = results.filter(r => r.ok).length;
  const failCount    = results.filter(r => !r.ok).length;

  res.json({
    ok:      failCount === 0,
    total:   recipients.length,
    success: successCount,
    failed:  failCount,
    results,
    message: `${successCount} of ${recipients.length} emails sent successfully.`,
  });
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(frontendPath, "index.html");
  fs.existsSync(index)
    ? res.sendFile(index)
    : res.json({ status: "API running", note: "Run: npm run build in frontend folder" });
});

app.listen(PORT, "0.0.0.0", () => console.log(`✉  MailSend v3 running → http://localhost:${PORT}`));
