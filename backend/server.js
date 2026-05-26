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
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const frontendPath = path.join(__dirname, "public");
app.use(express.static(frontendPath));

// ─── Build transporter ────────────────────────────────────────────────────────
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

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "2.0.0", timestamp: new Date().toISOString() });
});

// ─── Test SMTP Connection ─────────────────────────────────────────────────────
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

// ─── Send Email ───────────────────────────────────────────────────────────────
app.post("/api/send", upload.array("attachments", 10), async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, fromEmail, to, subject, body, isHtml } = req.body;

  if (!smtpHost || !smtpUser || !smtpPass)
    return res.json({ ok: false, message: "SMTP credentials are required." });
  if (!fromEmail) return res.json({ ok: false, message: "From email is required." });
  if (!to)        return res.json({ ok: false, message: "Recipient (To) is required." });
  if (!subject)   return res.json({ ok: false, message: "Subject is required." });
  if (!body)      return res.json({ ok: false, message: "Message body is required." });

  const useHtml = isHtml === "true" || isHtml === true;

  const mailOptions = {
    from:    fromName ? `"${fromName}" <${fromEmail.trim()}>` : fromEmail.trim(),
    to:      to.trim(),
    subject: subject.trim(),
    [useHtml ? "html" : "text"]: body,
    [useHtml ? "text" : "html"]: useHtml
      ? body.replace(/<[^>]+>/g, "")
      : body.replace(/\n/g, "<br>"),
  };

  if (req.files && req.files.length > 0) {
    mailOptions.attachments = req.files.map(f => ({
      filename:    f.originalname,
      content:     f.buffer,
      contentType: f.mimetype,
    }));
  }

  try {
    const transporter = createTransporter({ smtpHost, smtpPort, smtpUser, smtpPass });
    await transporter.sendMail(mailOptions);
    res.json({ ok: true, message: `Email sent successfully to ${to}!` });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(frontendPath, "index.html");
  fs.existsSync(index)
    ? res.sendFile(index)
    : res.json({ status: "API running", note: "Frontend not built yet. Run: npm run build --prefix frontend" });
});

app.listen(PORT, "0.0.0.0", () => console.log(`✉  MailSend running → http://localhost:${PORT}`));
