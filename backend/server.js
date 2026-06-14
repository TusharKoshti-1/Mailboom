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
const { pool, initDB } = require("./db");

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

// ─── Send Email ───────────────────────────────────────────────────────────────
app.post("/api/send", authMiddleware, upload.array("attachments", 10), async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, to, subject, body, isHtml, minDelay, maxDelay, senderGroupId, subjectGroupId, bodyGroupId } = req.body;

  if (!to) return res.json({ ok: false, message: "Recipient (To) is required." });

  // Load subject pool if using a subject group, otherwise require a single subject
  let subjectItems = null;
  if (subjectGroupId) {
    const si = await pool.query(
      "SELECT si.* FROM subject_items si JOIN subject_groups sg ON sg.id = si.group_id WHERE si.group_id=$1 AND sg.user_id=$2",
      [subjectGroupId, req.user.id]
    );
    if (si.rows.length === 0) return res.json({ ok: false, message: "Subject group has no subjects. Add subjects first." });
    subjectItems = si.rows;
  } else if (!subject) {
    return res.json({ ok: false, message: "Subject is required." });
  }

  // Load body pool if using a body group, otherwise require a single body
  let bodyItems = null;
  if (bodyGroupId) {
    const bi = await pool.query(
      "SELECT bi.* FROM body_items bi JOIN body_groups bg ON bg.id = bi.group_id WHERE bi.group_id=$1 AND bg.user_id=$2",
      [bodyGroupId, req.user.id]
    );
    if (bi.rows.length === 0) return res.json({ ok: false, message: "Body group has no bodies. Add bodies first." });
    bodyItems = bi.rows;
  } else if (!body) {
    return res.json({ ok: false, message: "Message body is required." });
  }

  const recipients = parseRecipients(to);
  if (recipients.length === 0) return res.json({ ok: false, message: "No valid email addresses found." });

  // Load sender accounts if using a sender group
  let senderAccounts = null;
  if (senderGroupId) {
    const g = await pool.query(
      "SELECT sa.* FROM sender_accounts sa JOIN sender_groups sg ON sg.id = sa.group_id WHERE sa.group_id=$1 AND sg.user_id=$2",
      [senderGroupId, req.user.id]
    );
    if (g.rows.length === 0) return res.json({ ok: false, message: "Sender group has no accounts. Add SMTP accounts first." });
    senderAccounts = g.rows;
  } else {
    if (!smtpHost || !smtpUser || !smtpPass)
      return res.json({ ok: false, message: "SMTP credentials are required." });
  }

  const useHtml = isHtml === "true" || isHtml === true;
  const minS    = parseFloat(minDelay) || 10;
  const maxS    = parseFloat(maxDelay) || 20;
  const attachments = req.files && req.files.length > 0
    ? req.files.map(f => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype }))
    : [];

  const results = [];
  const baseUrl = publicBaseUrl(req);

  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) await randomDelay(minS, maxS);
    const recipient = recipients[i];

    // Pick random sender account from group OR use single SMTP
    let sender;
    if (senderAccounts) {
      sender = pickRandom(senderAccounts);
    } else {
      sender = { host: smtpHost, port: smtpPort, username: smtpUser, password: smtpPass, from_name: fromName };
    }

    // Pick subject and body independently — random from each group, or the single value
    let emailSubject, emailBody, emailIsHtml;
    if (subjectItems) {
      emailSubject = pickRandom(subjectItems).subject;
    } else {
      emailSubject = subject.trim();
    }
    if (bodyItems) {
      const pickedBody = pickRandom(bodyItems);
      emailBody   = pickedBody.body;
      emailIsHtml = pickedBody.is_html;
    } else {
      emailBody   = body;
      emailIsHtml = useHtml;
    }

    const fromAddr = sender.username.trim();
    const fromFull = sender.from_name ? `"${sender.from_name}" <${fromAddr}>` : fromAddr;

    // Unique tracking id + invisible pixel appended to the HTML body so opens
    // can be detected. Plain-text emails get an HTML part carrying the pixel.
    const trackingId = crypto.randomUUID();
    const pixel = `<img src="${baseUrl}/api/track/open/${trackingId}" width="1" height="1" alt="" style="display:none;max-height:0;overflow:hidden" />`;
    const htmlBody = (emailIsHtml ? emailBody : emailBody.replace(/\n/g, "<br>")) + pixel;

    const mailOptions = {
      from: fromFull, to: recipient, subject: emailSubject,
      text: emailIsHtml ? emailBody.replace(/<[^>]+>/g, "") : emailBody,
      html: htmlBody,
    };
    if (attachments.length > 0) mailOptions.attachments = attachments;

    try {
      const transporter = createTransporter(sender);
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ [user:${req.user.id}] ${fromAddr} → ${recipient} | ${info.messageId}`);
      // Record the sent email so its opens can be tracked.
      try {
        await pool.query(
          "INSERT INTO sent_emails (user_id, tracking_id, recipient, subject, from_addr) VALUES ($1,$2,$3,$4,$5)",
          [req.user.id, trackingId, recipient, emailSubject, fromAddr]
        );
      } catch (e) { console.error("Failed to record sent email:", e.message); }
      results.push({ email: recipient, ok: true, from: fromAddr, subject: emailSubject, message: "Sent successfully" });
    } catch (err) {
      console.error(`❌ [user:${req.user.id}] ${fromAddr} → ${recipient}: ${err.message}`);
      results.push({ email: recipient, ok: false, from: fromAddr, subject: emailSubject, message: err.message });
    }
  }

  const successCount = results.filter(r => r.ok).length;
  res.json({
    ok: results.filter(r => !r.ok).length === 0,
    total: recipients.length, success: successCount,
    failed: recipients.length - successCount,
    results, message: `${successCount} of ${recipients.length} emails sent successfully.`,
  });
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
}).catch(err => {
  console.error("❌ Database connection failed:", err.message);
  process.exit(1);
});
