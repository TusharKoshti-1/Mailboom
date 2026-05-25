const express = require("express");
const nodemailer = require("nodemailer");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
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

// ─── Test Connection ──────────────────────────────────────────────────────────
app.post("/api/test-connection", async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass } = req.body;
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass)
    return res.json({ ok: false, message: "All SMTP fields are required." });
  try {
    const t = makeTransporter(smtpHost, smtpPort, smtpUser, smtpPass);
    await t.verify();
    t.close();
    res.json({ ok: true, message: `Connected to ${smtpHost}:${smtpPort} — ready to send!` });
  } catch (err) {
    res.json({ ok: false, message: friendlyError(err.message) });
  }
});

// ─── Send Single Email ────────────────────────────────────────────────────────
app.post("/api/send", upload.array("attachments", 10), async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, fromEmail, to, subject, body, isHtml } = req.body;

  if (!smtpHost || !smtpUser || !smtpPass || !fromEmail || !to || !subject || !body)
    return res.json({ ok: false, message: "All fields are required." });

  try {
    const t = makeTransporter(smtpHost, smtpPort, smtpUser, smtpPass);

    const attachments = (req.files || []).map(f => ({
      filename: f.originalname, content: f.buffer, contentType: f.mimetype,
    }));

    const mailOpts = {
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to: to.trim(),
      subject: subject.trim(),
      attachments,
    };

    if (isHtml === "true") {
      mailOpts.html = body;
      mailOpts.text = body.replace(/<[^>]+>/g, "");
    } else {
      mailOpts.text = body;
    }

    const info = await t.sendMail(mailOpts);
    t.close();
    res.json({ ok: true, message: `Email sent successfully! ID: ${info.messageId}` });
  } catch (err) {
    res.json({ ok: false, message: friendlyError(err.message) });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeTransporter(host, port, user, pass) {
  const p = parseInt(port);
  return nodemailer.createTransport({
    host,
    port: p,
    secure: p === 465,
    requireTLS: p !== 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });
}

function friendlyError(msg) {
  if (msg.includes("Invalid login") || msg.includes("Username and Password") || msg.includes("535"))
    return "Invalid credentials. For Gmail, use an App Password — not your regular Gmail password.";
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout"))
    return "Connection timed out. Render blocks port 587 — use port 465 or switch to SendGrid/Mailgun.";
  if (msg.includes("ECONNREFUSED"))
    return "Connection refused. Check your SMTP host and port.";
  return msg;
}

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(frontendPath, "index.html");
  fs.existsSync(index) ? res.sendFile(index) : res.json({ status: "API running", note: "Frontend not built" });
});

app.listen(PORT, "0.0.0.0", () => console.log(`✉ MailSend running on 0.0.0.0:${PORT}`));
