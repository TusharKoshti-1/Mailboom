const express    = require("express");
const multer     = require("multer");
const cors       = require("cors");
const path       = require("path");
const fs         = require("fs");
const nodemailer = require("nodemailer");
const bcrypt     = require("bcryptjs");
require("dotenv").config();
const jwt        = require("jsonwebtoken");
const { pool, initDB } = require("./db");

const app    = express();
const PORT   = process.env.PORT || 3001;
const SECRET = process.env.JWT_SECRET || "mailblast_secret_change_in_production";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const frontendPath = path.join(__dirname, "public");
app.use(express.static(frontendPath));

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ ok: false, message: "Unauthorized — please login." });
  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ ok: false, message: "Invalid or expired token — please login again." });
  }
}

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
  return raw.split(/[\n,]+/).map(e => e.trim()).filter(e => e && e.includes("@"));
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "3.0.0", timestamp: new Date().toISOString() });
});

// ─── AUTH: Register ───────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.json({ ok: false, message: "Name, email and password are required." });
  if (password.length < 6)
    return res.json({ ok: false, message: "Password must be at least 6 characters." });

  try {
    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (exists.rows.length > 0)
      return res.json({ ok: false, message: "Email already registered. Please login." });

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, plan",
      [name, email.toLowerCase(), hashed]
    );
    const user  = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, SECRET, { expiresIn: "7d" });
    res.json({ ok: true, message: "Account created successfully!", token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan } });
  } catch (err) {
    console.error("Register error:", err.message);
    res.json({ ok: false, message: "Registration failed. Please try again." });
  }
});

// ─── AUTH: Login ──────────────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.json({ ok: false, message: "Email and password are required." });

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (result.rows.length === 0)
      return res.json({ ok: false, message: "No account found with this email." });

    const user  = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.json({ ok: false, message: "Incorrect password." });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, SECRET, { expiresIn: "7d" });
    res.json({ ok: true, message: "Login successful!", token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan } });
  } catch (err) {
    console.error("Login error:", err.message);
    res.json({ ok: false, message: "Login failed. Please try again." });
  }
});

// ─── AUTH: Get current user ───────────────────────────────────────────────────
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email, plan, created_at FROM users WHERE id = $1", [req.user.id]);
    if (result.rows.length === 0)
      return res.json({ ok: false, message: "User not found." });
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    res.json({ ok: false, message: "Failed to fetch user." });
  }
});

// ─── SMTP Settings: Save ─────────────────────────────────────────────────────
app.post("/api/smtp/save", authMiddleware, async (req, res) => {
  const { host, port, username, password, fromName } = req.body;
  if (!host || !username || !password)
    return res.json({ ok: false, message: "Host, username and password are required." });

  try {
    const exists = await pool.query("SELECT id FROM smtp_settings WHERE user_id = $1", [req.user.id]);
    if (exists.rows.length > 0) {
      await pool.query(
        "UPDATE smtp_settings SET host=$1, port=$2, username=$3, password=$4, from_name=$5, updated_at=NOW() WHERE user_id=$6",
        [host, port || 587, username, password, fromName || "", req.user.id]
      );
    } else {
      await pool.query(
        "INSERT INTO smtp_settings (user_id, host, port, username, password, from_name) VALUES ($1,$2,$3,$4,$5,$6)",
        [req.user.id, host, port || 587, username, password, fromName || ""]
      );
    }
    res.json({ ok: true, message: "SMTP settings saved." });
  } catch (err) {
    res.json({ ok: false, message: "Failed to save SMTP settings." });
  }
});

// ─── SMTP Settings: Load ─────────────────────────────────────────────────────
app.get("/api/smtp/load", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT host, port, username, password, from_name FROM smtp_settings WHERE user_id = $1", [req.user.id]);
    if (result.rows.length === 0)
      return res.json({ ok: true, smtp: null });
    res.json({ ok: true, smtp: result.rows[0] });
  } catch (err) {
    res.json({ ok: false, message: "Failed to load SMTP settings." });
  }
});

// ─── Test SMTP Connection ─────────────────────────────────────────────────────
app.post("/api/test-connection", authMiddleware, async (req, res) => {
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
app.post("/api/send", authMiddleware, upload.array("attachments", 10), async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, to, subject, body, isHtml, minDelay, maxDelay } = req.body;

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
    if (i > 0) await randomDelay(minS, maxS);

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
      console.log(`✅ [user:${req.user.id}] Sent to ${recipient} | ${info.messageId}`);
      results.push({ email: recipient, ok: true, message: "Sent successfully" });
    } catch (err) {
      console.error(`❌ [user:${req.user.id}] Failed to ${recipient}: ${err.message}`);
      results.push({ email: recipient, ok: false, message: err.message });
    }
  }

  const successCount = results.filter(r => r.ok).length;
  const failCount    = results.filter(r => !r.ok).length;

  res.json({
    ok: failCount === 0,
    total: recipients.length,
    success: successCount,
    failed: failCount,
    results,
    message: `${successCount} of ${recipients.length} emails sent successfully.`,
  });
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(frontendPath, "index.html");
  fs.existsSync(index)
    ? res.sendFile(index)
    : res.json({ status: "API running" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`✉  MailBlast running → http://localhost:${PORT}`));
}).catch(err => {
  console.error("❌ Database connection failed:", err.message);
  process.exit(1);
});
