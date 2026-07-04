require("dotenv").config();
const express    = require("express");
const multer     = require("multer");
const cors       = require("cors");
const path       = require("path");
const fs         = require("fs");
const nodemailer = require("nodemailer");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const crypto     = require("crypto");
const XLSX       = require("xlsx");
const { pool, initDB } = require("./db");
const campaignRunner   = require("./campaignRunner");

// Where campaign attachments are persisted so the background worker can read
// them after the request that created the campaign is long gone.
const uploadsDir = path.join(__dirname, "campaign_uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Persistent storage for attachment-group files (reused across campaigns).
const attachDir = path.join(__dirname, "attachment_uploads");
if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });

const app    = express();
const PORT   = process.env.PORT || 3001;
const SECRET = process.env.JWT_SECRET || "mailblast_secret_change_in_production";

// Behind Render/any proxy so req.protocol + x-forwarded-* are trustworthy.
app.set("trust proxy", true);

// 1x1 transparent GIF returned by the open-tracking pixel.
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"
);

// Absolute, publicly reachable base URL for embedding the tracking pixel.
function publicBaseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${proto}://${req.get("host")}`;
}

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
    req.user = jwt.verify(header.split(" ")[1], SECRET);
    next();
  } catch {
    res.status(401).json({ ok: false, message: "Invalid or expired token — please login again." });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createTransporter({ host, port, username, password }) {
  const p = parseInt(port, 10) || 587;
  return nodemailer.createTransport({
    host: host, port: p, secure: p === 465,
    auth: { user: username, pass: password },
    tls:  { rejectUnauthorized: false },
  });
}

function randomDelay(minSec, maxSec) {
  return new Promise(resolve => setTimeout(resolve, (Math.random() * (maxSec - minSec) + minSec) * 1000));
}

function parseRecipients(raw) {
  return raw.split(/[\n,]+/).map(e => e.trim()).filter(e => e && e.includes("@"));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "4.0.0", timestamp: new Date().toISOString() });
});

// ─── TRACKING PIXEL (public, no auth) ─────────────────────────────────────────
// Loaded by the recipient's mail client when the email is opened. Records the
// open then always returns a 1x1 GIF, regardless of whether the id is known.
app.get("/api/track/open/:trackingId", async (req, res) => {
  try {
    const r = await pool.query("SELECT id FROM sent_emails WHERE tracking_id=$1", [req.params.trackingId]);
    if (r.rows.length > 0) {
      const sentId = r.rows[0].id;
      const ua = (req.headers["user-agent"] || "").slice(0, 500);
      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
      await pool.query("INSERT INTO email_opens (sent_email_id, user_agent, ip) VALUES ($1,$2,$3)", [sentId, ua, ip]);
      await pool.query(
        "UPDATE sent_emails SET open_count = open_count + 1, last_opened_at = NOW(), first_opened_at = COALESCE(first_opened_at, NOW()) WHERE id=$1",
        [sentId]
      );
    }
  } catch (err) {
    console.error("Tracking pixel error:", err.message);
  }
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.end(TRACKING_PIXEL);
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
    res.json({ ok: true, message: "Account created!", token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan } });
  } catch (err) {
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
    if (!match) return res.json({ ok: false, message: "Incorrect password." });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, SECRET, { expiresIn: "7d" });
    res.json({ ok: true, message: "Login successful!", token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan } });
  } catch (err) {
    res.json({ ok: false, message: "Login failed. Please try again." });
  }
});

// ─── AUTH: Me ─────────────────────────────────────────────────────────────────
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email, plan, created_at FROM users WHERE id = $1", [req.user.id]);
    if (result.rows.length === 0) return res.json({ ok: false, message: "User not found." });
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    res.json({ ok: false, message: "Failed to fetch user." });
  }
});

// ─── SMTP: Save ───────────────────────────────────────────────────────────────
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

// ─── SMTP: Load ───────────────────────────────────────────────────────────────
app.get("/api/smtp/load", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT host, port, username, password, from_name FROM smtp_settings WHERE user_id = $1", [req.user.id]);
    res.json({ ok: true, smtp: result.rows.length > 0 ? result.rows[0] : null });
  } catch (err) {
    res.json({ ok: false, message: "Failed to load SMTP settings." });
  }
});

// ─── SMTP: Test ───────────────────────────────────────────────────────────────
app.post("/api/test-connection", authMiddleware, async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass } = req.body;
  if (!smtpHost || !smtpUser || !smtpPass)
    return res.json({ ok: false, message: "SMTP host, username and password are required." });
  try {
    const transporter = createTransporter({ host: smtpHost, port: smtpPort, username: smtpUser, password: smtpPass });
    await transporter.verify();
    res.json({ ok: true, message: `Connected to ${smtpHost}:${smtpPort || 587} — ready to send!` });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── RECIPIENT GROUPS: Create ─────────────────────────────────────────────────
app.post("/api/groups", authMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.json({ ok: false, message: "Group name is required." });
  try {
    const result = await pool.query(
      "INSERT INTO email_groups (user_id, name, description) VALUES ($1, $2, $3) RETURNING *",
      [req.user.id, name.trim(), description || ""]
    );
    res.json({ ok: true, group: result.rows[0], message: "Group created." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── RECIPIENT GROUPS: List ───────────────────────────────────────────────────
app.get("/api/groups", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.*, COUNT(m.id)::int AS member_count
      FROM email_groups g
      LEFT JOIN email_group_members m ON m.group_id = g.id
      WHERE g.user_id = $1
      GROUP BY g.id ORDER BY g.created_at DESC
    `, [req.user.id]);
    res.json({ ok: true, groups: result.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── RECIPIENT GROUPS: Get one ────────────────────────────────────────────────
app.get("/api/groups/:id", authMiddleware, async (req, res) => {
  try {
    const g = await pool.query("SELECT * FROM email_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (g.rows.length === 0) return res.json({ ok: false, message: "Group not found." });
    const m = await pool.query("SELECT * FROM email_group_members WHERE group_id=$1 ORDER BY added_at ASC", [req.params.id]);
    res.json({ ok: true, group: g.rows[0], members: m.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── RECIPIENT GROUPS: Delete ─────────────────────────────────────────────────
app.delete("/api/groups/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM email_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ ok: true, message: "Group deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── RECIPIENT GROUPS: Add members ───────────────────────────────────────────
app.post("/api/groups/:id/members", authMiddleware, async (req, res) => {
  const { emails } = req.body;
  if (!emails || emails.length === 0) return res.json({ ok: false, message: "No emails provided." });
  const g = await pool.query("SELECT id FROM email_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (g.rows.length === 0) return res.json({ ok: false, message: "Group not found." });
  try {
    const existing    = await pool.query("SELECT email FROM email_group_members WHERE group_id=$1", [req.params.id]);
    const existingSet = new Set(existing.rows.map(r => r.email.toLowerCase()));
    let added = 0;
    for (const item of emails) {
      const email = (typeof item === "string" ? item : item.email).trim().toLowerCase();
      const name  = typeof item === "object" ? (item.name || "") : "";
      if (!email.includes("@") || existingSet.has(email)) continue;
      await pool.query("INSERT INTO email_group_members (group_id, email, name) VALUES ($1,$2,$3)", [req.params.id, email, name]);
      existingSet.add(email); added++;
    }
    res.json({ ok: true, message: `${added} emails added.`, added });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── RECIPIENT GROUPS: Remove member ─────────────────────────────────────────
app.delete("/api/groups/:id/members/:memberId", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM email_group_members WHERE id=$1 AND group_id=$2", [req.params.memberId, req.params.id]);
    res.json({ ok: true, message: "Member removed." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── RECIPIENT GROUPS: Import from Excel/CSV ──────────────────────────────────
// Accepts .xlsx / .xls / .csv. Scans every cell and extracts valid email
// addresses from anywhere in the sheet, then adds the new ones to the group.
app.post("/api/groups/:id/import", authMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file) return res.json({ ok: false, message: "No file uploaded." });
  const g = await pool.query("SELECT id FROM email_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (g.rows.length === 0) return res.json({ ok: false, message: "Group not found." });
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const found = new Set();
    wb.SheetNames.forEach(name => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: "" });
      rows.forEach(row => row.forEach(cell => {
        const matches = String(cell).match(emailRe);
        if (matches) matches.forEach(m => found.add(m.trim().toLowerCase()));
      }));
    });
    if (found.size === 0) return res.json({ ok: false, message: "No email addresses found in the file." });

    const existing    = await pool.query("SELECT email FROM email_group_members WHERE group_id=$1", [req.params.id]);
    const existingSet = new Set(existing.rows.map(r => r.email.toLowerCase()));
    let added = 0;
    for (const email of found) {
      if (existingSet.has(email)) continue;
      await pool.query("INSERT INTO email_group_members (group_id, email) VALUES ($1,$2)", [req.params.id, email]);
      existingSet.add(email); added++;
    }
    res.json({ ok: true, added, found: found.size, message: `${added} new email(s) added (${found.size} found in file).` });
  } catch (err) {
    res.json({ ok: false, message: `Could not read the file: ${err.message}` });
  }
});

// ─── RECIPIENT GROUPS: Export to Excel ────────────────────────────────────────
// Streams the group's members back as a downloadable .xlsx file.
app.get("/api/groups/:id/export", authMiddleware, async (req, res) => {
  try {
    const g = await pool.query("SELECT name FROM email_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (g.rows.length === 0) return res.status(404).json({ ok: false, message: "Group not found." });
    const m = await pool.query("SELECT email, name FROM email_group_members WHERE group_id=$1 ORDER BY added_at ASC", [req.params.id]);

    const aoa = [["Email", "Name"], ...m.rows.map(r => [r.email, r.name || ""])];
    const ws  = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 38 }, { wch: 24 }];
    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recipients");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const safeName = (g.rows[0].name || "recipients").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60);
    res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.set("Content-Disposition", `attachment; filename="${safeName}.xlsx"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ─── SENDER GROUPS: Create ────────────────────────────────────────────────────
app.post("/api/sender-groups", authMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.json({ ok: false, message: "Group name is required." });
  try {
    const result = await pool.query(
      "INSERT INTO sender_groups (user_id, name, description) VALUES ($1, $2, $3) RETURNING *",
      [req.user.id, name.trim(), description || ""]
    );
    res.json({ ok: true, group: result.rows[0], message: "Sender group created." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SENDER GROUPS: List ──────────────────────────────────────────────────────
app.get("/api/sender-groups", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sg.*, COUNT(sa.id)::int AS account_count
      FROM sender_groups sg
      LEFT JOIN sender_accounts sa ON sa.group_id = sg.id
      WHERE sg.user_id = $1
      GROUP BY sg.id ORDER BY sg.created_at DESC
    `, [req.user.id]);
    res.json({ ok: true, groups: result.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SENDER GROUPS: Get one with accounts ─────────────────────────────────────
app.get("/api/sender-groups/:id", authMiddleware, async (req, res) => {
  try {
    const g = await pool.query("SELECT * FROM sender_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (g.rows.length === 0) return res.json({ ok: false, message: "Sender group not found." });
    const a = await pool.query("SELECT id, host, port, username, from_name, added_at FROM sender_accounts WHERE group_id=$1 ORDER BY added_at ASC", [req.params.id]);
    res.json({ ok: true, group: g.rows[0], accounts: a.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SENDER GROUPS: Delete ────────────────────────────────────────────────────
app.delete("/api/sender-groups/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM sender_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ ok: true, message: "Sender group deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SENDER GROUPS: Add account ───────────────────────────────────────────────
app.post("/api/sender-groups/:id/accounts", authMiddleware, async (req, res) => {
  const { host, port, username, password, fromName } = req.body;
  if (!host || !username || !password)
    return res.json({ ok: false, message: "Host, username and password are required." });
  const g = await pool.query("SELECT id FROM sender_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (g.rows.length === 0) return res.json({ ok: false, message: "Sender group not found." });
  try {
    // Test the SMTP before saving
    const transporter = createTransporter({ host, port: port || 587, username, password });
    await transporter.verify();
    await pool.query(
      "INSERT INTO sender_accounts (group_id, host, port, username, password, from_name) VALUES ($1,$2,$3,$4,$5,$6)",
      [req.params.id, host, port || 587, username, password, fromName || ""]
    );
    res.json({ ok: true, message: `${username} added and verified.` });
  } catch (err) {
    res.json({ ok: false, message: `SMTP verification failed: ${err.message}` });
  }
});

// ─── SENDER GROUPS: Remove account ───────────────────────────────────────────
app.delete("/api/sender-groups/:id/accounts/:accountId", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM sender_accounts WHERE id=$1 AND group_id=$2", [req.params.accountId, req.params.id]);
    res.json({ ok: true, message: "Account removed." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SENDER GROUPS: Test one account ─────────────────────────────────────────
app.post("/api/sender-groups/:id/accounts/:accountId/test", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT sa.* FROM sender_accounts sa JOIN sender_groups sg ON sg.id = sa.group_id WHERE sa.id=$1 AND sg.user_id=$2",
      [req.params.accountId, req.user.id]
    );
    if (result.rows.length === 0) return res.json({ ok: false, message: "Account not found." });
    const a = result.rows[0];
    const transporter = createTransporter({ host: a.host, port: a.port, username: a.username, password: a.password });
    await transporter.verify();
    res.json({ ok: true, message: `${a.username} connected successfully.` });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CAMPAIGNS: Create & start (runs in the background) ───────────────────────
app.post("/api/campaigns", authMiddleware, upload.array("attachments", 10), async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, to, subject, body, isHtml, minDelay, maxDelay, senderGroupId, subjectGroupId, bodyGroupId, attachmentGroupId, name } = req.body;

  if (!to) return res.json({ ok: false, message: "Recipient (To) is required." });

  // Subject — group or single
  if (subjectGroupId) {
    const si = await pool.query("SELECT 1 FROM subject_items si JOIN subject_groups sg ON sg.id=si.group_id WHERE si.group_id=$1 AND sg.user_id=$2 LIMIT 1", [subjectGroupId, req.user.id]);
    if (si.rows.length === 0) return res.json({ ok: false, message: "Subject group has no subjects. Add subjects first." });
  } else if (!subject) {
    return res.json({ ok: false, message: "Subject is required." });
  }

  // Body — group or single
  if (bodyGroupId) {
    const bi = await pool.query("SELECT 1 FROM body_items bi JOIN body_groups bg ON bg.id=bi.group_id WHERE bi.group_id=$1 AND bg.user_id=$2 LIMIT 1", [bodyGroupId, req.user.id]);
    if (bi.rows.length === 0) return res.json({ ok: false, message: "Body group has no bodies. Add bodies first." });
  } else if (!body) {
    return res.json({ ok: false, message: "Message body is required." });
  }

  // Sender — group or single SMTP
  if (senderGroupId) {
    const g = await pool.query("SELECT 1 FROM sender_accounts sa JOIN sender_groups sg ON sg.id=sa.group_id WHERE sa.group_id=$1 AND sg.user_id=$2 LIMIT 1", [senderGroupId, req.user.id]);
    if (g.rows.length === 0) return res.json({ ok: false, message: "Sender group has no accounts. Add SMTP accounts first." });
  } else if (!smtpHost || !smtpUser || !smtpPass) {
    return res.json({ ok: false, message: "SMTP credentials are required, or select a Sender Group." });
  }

  // Random attachment group (optional)
  if (attachmentGroupId) {
    const ag = await pool.query("SELECT 1 FROM attachment_items ai JOIN attachment_groups ag ON ag.id=ai.group_id WHERE ai.group_id=$1 AND ag.user_id=$2 LIMIT 1", [attachmentGroupId, req.user.id]);
    if (ag.rows.length === 0) return res.json({ ok: false, message: "Attachment group has no files. Add attachments first." });
  }

  const recipients = parseRecipients(to);
  if (recipients.length === 0) return res.json({ ok: false, message: "No valid email addresses found." });

  const useHtml      = isHtml === "true" || isHtml === true;
  const minS         = parseFloat(minDelay) || 10;
  const maxS         = parseFloat(maxDelay) || 20;
  const baseUrl      = publicBaseUrl(req);
  const campaignName = ((name && name.trim()) || (subject && subject.trim()) || "Campaign").slice(0, 160);

  try {
    const ins = await pool.query(
      `INSERT INTO campaigns
         (user_id, name, status, total, subject, body, is_html, subject_group_id, body_group_id, sender_group_id,
          smtp_host, smtp_port, smtp_user, smtp_pass, from_name, min_delay, max_delay, base_url, attachment_group_id)
       VALUES ($1,$2,'running',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [req.user.id, campaignName, recipients.length,
       subjectGroupId ? null : subject, bodyGroupId ? null : body, useHtml,
       subjectGroupId || null, bodyGroupId || null, senderGroupId || null,
       senderGroupId ? null : smtpHost, senderGroupId ? null : (parseInt(smtpPort, 10) || 587),
       senderGroupId ? null : smtpUser, senderGroupId ? null : smtpPass, senderGroupId ? null : (fromName || ""),
       minS, maxS, baseUrl, attachmentGroupId || null]
    );
    const campaignId = ins.rows[0].id;

    // Persist attachments to disk so the background worker can read them later.
    if (req.files && req.files.length > 0) {
      const dir = path.join(uploadsDir, String(campaignId));
      fs.mkdirSync(dir, { recursive: true });
      const meta = req.files.map((f, i) => {
        const dest = path.join(dir, `${i}_${f.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
        fs.writeFileSync(dest, f.buffer);
        return { filename: f.originalname, path: dest, contentType: f.mimetype };
      });
      await pool.query("UPDATE campaigns SET attachments=$1 WHERE id=$2", [JSON.stringify(meta), campaignId]);
    }

    // Insert all recipients as 'pending' (chunked for large lists).
    const chunk = 500;
    for (let i = 0; i < recipients.length; i += chunk) {
      const slice  = recipients.slice(i, i + chunk);
      const values = [];
      const params = [];
      slice.forEach((email, j) => {
        const b = j * 3;
        params.push(campaignId, email, i + j);
        values.push(`($${b + 1},$${b + 2},$${b + 3})`);
      });
      await pool.query(`INSERT INTO campaign_recipients (campaign_id, email, idx) VALUES ${values.join(",")}`, params);
    }

    campaignRunner.startCampaign(campaignId);
    res.json({ ok: true, campaignId, total: recipients.length, message: `Campaign started — sending ${recipients.length} email(s) in the background.` });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CAMPAIGNS: List ──────────────────────────────────────────────────────────
app.get("/api/campaigns", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, status, total, sent_count, failed_count, created_at, finished_at
       FROM campaigns WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`,
      [req.user.id]
    );
    res.json({ ok: true, campaigns: r.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CAMPAIGNS: Detail + recent results ───────────────────────────────────────
app.get("/api/campaigns/:id", authMiddleware, async (req, res) => {
  try {
    const c = await pool.query(
      `SELECT id, name, status, total, sent_count, failed_count, is_html, min_delay, max_delay, created_at, finished_at
       FROM campaigns WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (c.rows.length === 0) return res.json({ ok: false, message: "Campaign not found." });
    const recent = await pool.query(
      `SELECT email, status, from_addr, subject, error, sent_at FROM campaign_recipients
       WHERE campaign_id=$1 AND status <> 'pending' ORDER BY sent_at DESC NULLS LAST, id DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ ok: true, campaign: c.rows[0], recent: recent.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CAMPAIGNS: Pause ─────────────────────────────────────────────────────────
app.post("/api/campaigns/:id/pause", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query("UPDATE campaigns SET status='paused' WHERE id=$1 AND user_id=$2 AND status='running' RETURNING id", [req.params.id, req.user.id]);
    if (r.rows.length === 0) return res.json({ ok: false, message: "Campaign is not running." });
    campaignRunner.signalPause(req.params.id);
    res.json({ ok: true, message: "Campaign paused." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CAMPAIGNS: Resume ────────────────────────────────────────────────────────
app.post("/api/campaigns/:id/resume", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query("UPDATE campaigns SET status='running' WHERE id=$1 AND user_id=$2 AND status='paused' RETURNING id", [req.params.id, req.user.id]);
    if (r.rows.length === 0) return res.json({ ok: false, message: "Campaign is not paused." });
    campaignRunner.startCampaign(req.params.id);
    res.json({ ok: true, message: "Campaign resumed." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CAMPAIGNS: Stop ──────────────────────────────────────────────────────────
app.post("/api/campaigns/:id/stop", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query("UPDATE campaigns SET status='stopped', finished_at=NOW() WHERE id=$1 AND user_id=$2 AND status IN ('running','paused') RETURNING id", [req.params.id, req.user.id]);
    if (r.rows.length === 0) return res.json({ ok: false, message: "Campaign is not active." });
    campaignRunner.signalStop(req.params.id);
    res.json({ ok: true, message: "Campaign stopped." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CAMPAIGNS: Delete ────────────────────────────────────────────────────────
app.delete("/api/campaigns/:id", authMiddleware, async (req, res) => {
  try {
    const owned = await pool.query("SELECT id FROM campaigns WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (owned.rows.length === 0) return res.json({ ok: false, message: "Campaign not found." });
    campaignRunner.signalStop(req.params.id);
    await pool.query("UPDATE campaigns SET status='stopped' WHERE id=$1", [req.params.id]); // ensure the loop exits
    await pool.query("DELETE FROM campaigns WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    try { fs.rmSync(path.join(uploadsDir, String(req.params.id)), { recursive: true, force: true }); } catch {}
    res.json({ ok: true, message: "Campaign deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SUBJECT GROUPS: Create ───────────────────────────────────────────────────
app.post("/api/subject-groups", authMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.json({ ok: false, message: "Group name is required." });
  try {
    const result = await pool.query(
      "INSERT INTO subject_groups (user_id, name, description) VALUES ($1, $2, $3) RETURNING *",
      [req.user.id, name.trim(), description || ""]
    );
    res.json({ ok: true, group: result.rows[0], message: "Subject group created." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SUBJECT GROUPS: List ─────────────────────────────────────────────────────
app.get("/api/subject-groups", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sg.*, COUNT(si.id)::int AS item_count
      FROM subject_groups sg
      LEFT JOIN subject_items si ON si.group_id = sg.id
      WHERE sg.user_id = $1
      GROUP BY sg.id ORDER BY sg.created_at DESC
    `, [req.user.id]);
    res.json({ ok: true, groups: result.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SUBJECT GROUPS: Get one with items ───────────────────────────────────────
app.get("/api/subject-groups/:id", authMiddleware, async (req, res) => {
  try {
    const g = await pool.query("SELECT * FROM subject_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (g.rows.length === 0) return res.json({ ok: false, message: "Subject group not found." });
    const items = await pool.query("SELECT * FROM subject_items WHERE group_id=$1 ORDER BY sort_order ASC, created_at ASC", [req.params.id]);
    res.json({ ok: true, group: g.rows[0], items: items.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SUBJECT GROUPS: Delete ───────────────────────────────────────────────────
app.delete("/api/subject-groups/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM subject_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ ok: true, message: "Subject group deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SUBJECT ITEMS: Add ───────────────────────────────────────────────────────
app.post("/api/subject-groups/:id/items", authMiddleware, async (req, res) => {
  const { subject } = req.body;
  if (!subject || !subject.trim()) return res.json({ ok: false, message: "Subject is required." });
  const g = await pool.query("SELECT id FROM subject_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (g.rows.length === 0) return res.json({ ok: false, message: "Subject group not found." });
  try {
    const count = await pool.query("SELECT COUNT(*) FROM subject_items WHERE group_id=$1", [req.params.id]);
    if (parseInt(count.rows[0].count) >= 20)
      return res.json({ ok: false, message: "Maximum 20 subjects per group." });
    const result = await pool.query(
      "INSERT INTO subject_items (group_id, subject, sort_order) VALUES ($1,$2,$3) RETURNING *",
      [req.params.id, subject.trim(), parseInt(count.rows[0].count)]
    );
    res.json({ ok: true, item: result.rows[0], message: "Subject added." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SUBJECT ITEMS: Update ────────────────────────────────────────────────────
app.put("/api/subject-groups/:id/items/:itemId", authMiddleware, async (req, res) => {
  const { subject } = req.body;
  if (!subject || !subject.trim()) return res.json({ ok: false, message: "Subject is required." });
  try {
    await pool.query(
      "UPDATE subject_items SET subject=$1 WHERE id=$2 AND group_id=$3",
      [subject.trim(), req.params.itemId, req.params.id]
    );
    res.json({ ok: true, message: "Subject updated." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SUBJECT ITEMS: Delete ────────────────────────────────────────────────────
app.delete("/api/subject-groups/:id/items/:itemId", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM subject_items WHERE id=$1 AND group_id=$2", [req.params.itemId, req.params.id]);
    res.json({ ok: true, message: "Subject deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── BODY GROUPS: Create ──────────────────────────────────────────────────────
app.post("/api/body-groups", authMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.json({ ok: false, message: "Group name is required." });
  try {
    const result = await pool.query(
      "INSERT INTO body_groups (user_id, name, description) VALUES ($1, $2, $3) RETURNING *",
      [req.user.id, name.trim(), description || ""]
    );
    res.json({ ok: true, group: result.rows[0], message: "Body group created." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── BODY GROUPS: List ────────────────────────────────────────────────────────
app.get("/api/body-groups", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT bg.*, COUNT(bi.id)::int AS item_count
      FROM body_groups bg
      LEFT JOIN body_items bi ON bi.group_id = bg.id
      WHERE bg.user_id = $1
      GROUP BY bg.id ORDER BY bg.created_at DESC
    `, [req.user.id]);
    res.json({ ok: true, groups: result.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── BODY GROUPS: Get one with items ──────────────────────────────────────────
app.get("/api/body-groups/:id", authMiddleware, async (req, res) => {
  try {
    const g = await pool.query("SELECT * FROM body_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (g.rows.length === 0) return res.json({ ok: false, message: "Body group not found." });
    const items = await pool.query("SELECT * FROM body_items WHERE group_id=$1 ORDER BY sort_order ASC, created_at ASC", [req.params.id]);
    res.json({ ok: true, group: g.rows[0], items: items.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── BODY GROUPS: Delete ──────────────────────────────────────────────────────
app.delete("/api/body-groups/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM body_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ ok: true, message: "Body group deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── BODY ITEMS: Add ──────────────────────────────────────────────────────────
app.post("/api/body-groups/:id/items", authMiddleware, async (req, res) => {
  const { body, isHtml } = req.body;
  if (!body || !body.trim()) return res.json({ ok: false, message: "Body is required." });
  const g = await pool.query("SELECT id FROM body_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (g.rows.length === 0) return res.json({ ok: false, message: "Body group not found." });
  try {
    const count = await pool.query("SELECT COUNT(*) FROM body_items WHERE group_id=$1", [req.params.id]);
    if (parseInt(count.rows[0].count) >= 20)
      return res.json({ ok: false, message: "Maximum 20 bodies per group." });
    const result = await pool.query(
      "INSERT INTO body_items (group_id, body, is_html, sort_order) VALUES ($1,$2,$3,$4) RETURNING *",
      [req.params.id, body, isHtml === true || isHtml === "true", parseInt(count.rows[0].count)]
    );
    res.json({ ok: true, item: result.rows[0], message: "Body added." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── BODY ITEMS: Update ───────────────────────────────────────────────────────
app.put("/api/body-groups/:id/items/:itemId", authMiddleware, async (req, res) => {
  const { body, isHtml } = req.body;
  if (!body || !body.trim()) return res.json({ ok: false, message: "Body is required." });
  try {
    await pool.query(
      "UPDATE body_items SET body=$1, is_html=$2 WHERE id=$3 AND group_id=$4",
      [body, isHtml === true || isHtml === "true", req.params.itemId, req.params.id]
    );
    res.json({ ok: true, message: "Body updated." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── BODY ITEMS: Delete ───────────────────────────────────────────────────────
app.delete("/api/body-groups/:id/items/:itemId", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM body_items WHERE id=$1 AND group_id=$2", [req.params.itemId, req.params.id]);
    res.json({ ok: true, message: "Body deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── ATTACHMENT GROUPS: Create ────────────────────────────────────────────────
app.post("/api/attachment-groups", authMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.json({ ok: false, message: "Group name is required." });
  try {
    const result = await pool.query(
      "INSERT INTO attachment_groups (user_id, name, description) VALUES ($1, $2, $3) RETURNING *",
      [req.user.id, name.trim(), description || ""]
    );
    res.json({ ok: true, group: result.rows[0], message: "Attachment group created." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── ATTACHMENT GROUPS: List ──────────────────────────────────────────────────
app.get("/api/attachment-groups", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ag.*, COUNT(ai.id)::int AS item_count
      FROM attachment_groups ag
      LEFT JOIN attachment_items ai ON ai.group_id = ag.id
      WHERE ag.user_id = $1
      GROUP BY ag.id ORDER BY ag.created_at DESC
    `, [req.user.id]);
    res.json({ ok: true, groups: result.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── ATTACHMENT GROUPS: Get one with files ────────────────────────────────────
app.get("/api/attachment-groups/:id", authMiddleware, async (req, res) => {
  try {
    const g = await pool.query("SELECT * FROM attachment_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (g.rows.length === 0) return res.json({ ok: false, message: "Attachment group not found." });
    const items = await pool.query("SELECT id, filename, content_type, size, created_at FROM attachment_items WHERE group_id=$1 ORDER BY sort_order ASC, created_at ASC", [req.params.id]);
    res.json({ ok: true, group: g.rows[0], items: items.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── ATTACHMENT GROUPS: Delete ────────────────────────────────────────────────
app.delete("/api/attachment-groups/:id", authMiddleware, async (req, res) => {
  try {
    const g = await pool.query("SELECT id FROM attachment_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (g.rows.length === 0) return res.json({ ok: false, message: "Attachment group not found." });
    await pool.query("DELETE FROM attachment_groups WHERE id=$1", [req.params.id]);
    try { fs.rmSync(path.join(attachDir, String(req.params.id)), { recursive: true, force: true }); } catch {}
    res.json({ ok: true, message: "Attachment group deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── ATTACHMENT ITEMS: Add file (max 10 per group) ────────────────────────────
app.post("/api/attachment-groups/:id/items", authMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file) return res.json({ ok: false, message: "No file uploaded." });
  const g = await pool.query("SELECT id FROM attachment_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (g.rows.length === 0) return res.json({ ok: false, message: "Attachment group not found." });
  try {
    const count = await pool.query("SELECT COUNT(*) FROM attachment_items WHERE group_id=$1", [req.params.id]);
    const n = parseInt(count.rows[0].count);
    if (n >= 10) return res.json({ ok: false, message: "Maximum 10 attachments per group." });

    const dir = path.join(attachDir, String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
    fs.writeFileSync(dest, req.file.buffer);

    const result = await pool.query(
      "INSERT INTO attachment_items (group_id, filename, path, content_type, size, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, filename, content_type, size, created_at",
      [req.params.id, req.file.originalname, dest, req.file.mimetype, req.file.size, n]
    );
    res.json({ ok: true, item: result.rows[0], message: "Attachment added." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── ATTACHMENT ITEMS: Delete ─────────────────────────────────────────────────
app.delete("/api/attachment-groups/:id/items/:itemId", authMiddleware, async (req, res) => {
  try {
    const owned = await pool.query(
      "SELECT ai.path FROM attachment_items ai JOIN attachment_groups ag ON ag.id=ai.group_id WHERE ai.id=$1 AND ai.group_id=$2 AND ag.user_id=$3",
      [req.params.itemId, req.params.id, req.user.id]
    );
    if (owned.rows.length === 0) return res.json({ ok: false, message: "Attachment not found." });
    await pool.query("DELETE FROM attachment_items WHERE id=$1 AND group_id=$2", [req.params.itemId, req.params.id]);
    try { fs.rmSync(owned.rows[0].path, { force: true }); } catch {}
    res.json({ ok: true, message: "Attachment deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── TRACKING: List sent emails + summary ─────────────────────────────────────
app.get("/api/tracking", authMiddleware, async (req, res) => {
  try {
    const list = await pool.query(
      `SELECT id, tracking_id, recipient, subject, from_addr, open_count, first_opened_at, last_opened_at, sent_at
       FROM sent_emails WHERE user_id=$1 ORDER BY sent_at DESC LIMIT 500`,
      [req.user.id]
    );
    const summary = await pool.query(
      `SELECT COUNT(*)::int                                   AS total_sent,
              COUNT(*) FILTER (WHERE open_count > 0)::int      AS total_opened,
              COALESCE(SUM(open_count), 0)::int               AS total_opens
       FROM sent_emails WHERE user_id=$1`,
      [req.user.id]
    );
    res.json({ ok: true, emails: list.rows, summary: summary.rows[0] });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// Maps a "seen" filter to an extra SQL condition on open_count.
function trackingFilterClause(filter) {
  switch (filter) {
    case "none":  return "AND open_count = 0";
    case "one":   return "AND open_count = 1";
    case "multi": return "AND open_count > 1";
    default:      return ""; // all
  }
}

// ─── TRACKING: Export to Excel (respects the seen filter) ─────────────────────
app.get("/api/tracking/export", authMiddleware, async (req, res) => {
  try {
    const clause = trackingFilterClause(req.query.filter);
    const r = await pool.query(
      `SELECT recipient, subject, from_addr, open_count, first_opened_at, last_opened_at, sent_at
       FROM sent_emails WHERE user_id=$1 ${clause} ORDER BY sent_at DESC`,
      [req.user.id]
    );
    const fmt = (d) => d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : "";
    const aoa = [
      ["Recipient", "Subject", "From", "Times Seen", "First Seen", "Last Seen", "Sent At"],
      ...r.rows.map(e => [e.recipient, e.subject || "", e.from_addr || "", e.open_count, fmt(e.first_opened_at), fmt(e.last_opened_at), fmt(e.sent_at)]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 34 }, { wch: 34 }, { wch: 26 }, { wch: 11 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tracking");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const tag = ({ none: "not-seen", one: "seen-1", multi: "seen-2plus" }[req.query.filter]) || "all";
    res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.set("Content-Disposition", `attachment; filename="tracking-${tag}.xlsx"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ─── TRACKING: One email with all its opens ───────────────────────────────────
app.get("/api/tracking/:id", authMiddleware, async (req, res) => {
  try {
    const e = await pool.query("SELECT * FROM sent_emails WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (e.rows.length === 0) return res.json({ ok: false, message: "Email not found." });
    const opens = await pool.query(
      "SELECT id, opened_at, user_agent, ip FROM email_opens WHERE sent_email_id=$1 ORDER BY opened_at DESC",
      [req.params.id]
    );
    res.json({ ok: true, email: e.rows[0], opens: opens.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── TRACKING: Delete a tracked email ─────────────────────────────────────────
app.delete("/api/tracking/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM sent_emails WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ ok: true, message: "Tracking record deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── SPA Fallback — MUST BE LAST ─────────────────────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(frontendPath, "index.html");
  fs.existsSync(index) ? res.sendFile(index) : res.json({ status: "API running" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`✉  MailBlast running → http://localhost:${PORT}`));
  // Resume any campaigns that were mid-send when the server last stopped.
  campaignRunner.resumeAll();
}).catch(err => {
  console.error("❌ Database connection failed:", err.message);
  process.exit(1);
});
