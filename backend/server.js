require("dotenv").config();
const express    = require("express");
const multer     = require("multer");
const cors       = require("cors");
const path       = require("path");
const fs         = require("fs");
const nodemailer = require("nodemailer");
const bcrypt     = require("bcryptjs");
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
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromName, to, subject, body, isHtml, minDelay, maxDelay, senderGroupId, contentGroupId } = req.body;

  if (!to) return res.json({ ok: false, message: "Recipient (To) is required." });

  // Load content variations if using a content group
  let contentVariations = null;
  if (contentGroupId) {
    const cv = await pool.query(
      "SELECT cv.* FROM content_variations cv JOIN content_groups cg ON cg.id = cv.group_id WHERE cv.group_id=$1 AND cg.user_id=$2",
      [contentGroupId, req.user.id]
    );
    if (cv.rows.length === 0) return res.json({ ok: false, message: "Content group has no variations. Add subject/body variations first." });
    contentVariations = cv.rows;
  } else {
    if (!subject) return res.json({ ok: false, message: "Subject is required." });
    if (!body)    return res.json({ ok: false, message: "Message body is required." });
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

    // Pick random content variation OR use single subject/body
    let emailSubject, emailBody, emailIsHtml;
    if (contentVariations) {
      const variation = pickRandom(contentVariations);
      emailSubject = variation.subject;
      emailBody    = variation.body;
      emailIsHtml  = variation.is_html;
    } else {
      emailSubject = subject.trim();
      emailBody    = body;
      emailIsHtml  = useHtml;
    }

    const fromAddr = sender.username.trim();
    const fromFull = sender.from_name ? `"${sender.from_name}" <${fromAddr}>` : fromAddr;

    const mailOptions = {
      from: fromFull, to: recipient, subject: emailSubject,
      text: emailIsHtml ? emailBody.replace(/<[^>]+>/g, "") : emailBody,
      html: emailIsHtml ? emailBody : emailBody.replace(/\n/g, "<br>"),
    };
    if (attachments.length > 0) mailOptions.attachments = attachments;

    try {
      const transporter = createTransporter(sender);
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ [user:${req.user.id}] ${fromAddr} → ${recipient} | ${info.messageId}`);
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

// ─── CONTENT GROUPS: Create ───────────────────────────────────────────────────
app.post("/api/content-groups", authMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.json({ ok: false, message: "Group name is required." });
  try {
    const result = await pool.query(
      "INSERT INTO content_groups (user_id, name, description) VALUES ($1, $2, $3) RETURNING *",
      [req.user.id, name.trim(), description || ""]
    );
    res.json({ ok: true, group: result.rows[0], message: "Content group created." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CONTENT GROUPS: List ─────────────────────────────────────────────────────
app.get("/api/content-groups", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cg.*, COUNT(cv.id)::int AS variation_count
      FROM content_groups cg
      LEFT JOIN content_variations cv ON cv.group_id = cg.id
      WHERE cg.user_id = $1
      GROUP BY cg.id ORDER BY cg.created_at DESC
    `, [req.user.id]);
    res.json({ ok: true, groups: result.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CONTENT GROUPS: Get one with variations ──────────────────────────────────
app.get("/api/content-groups/:id", authMiddleware, async (req, res) => {
  try {
    const g = await pool.query("SELECT * FROM content_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (g.rows.length === 0) return res.json({ ok: false, message: "Content group not found." });
    const v = await pool.query("SELECT * FROM content_variations WHERE group_id=$1 ORDER BY sort_order ASC, created_at ASC", [req.params.id]);
    res.json({ ok: true, group: g.rows[0], variations: v.rows });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CONTENT GROUPS: Delete ───────────────────────────────────────────────────
app.delete("/api/content-groups/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM content_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ ok: true, message: "Content group deleted." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CONTENT VARIATIONS: Add ──────────────────────────────────────────────────
app.post("/api/content-groups/:id/variations", authMiddleware, async (req, res) => {
  const { subject, body, isHtml } = req.body;
  if (!subject || !body) return res.json({ ok: false, message: "Subject and body are required." });
  const g = await pool.query("SELECT id FROM content_groups WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (g.rows.length === 0) return res.json({ ok: false, message: "Content group not found." });
  try {
    const count  = await pool.query("SELECT COUNT(*) FROM content_variations WHERE group_id=$1", [req.params.id]);
    if (parseInt(count.rows[0].count) >= 20)
      return res.json({ ok: false, message: "Maximum 20 variations per group." });
    const result = await pool.query(
      "INSERT INTO content_variations (group_id, subject, body, is_html, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [req.params.id, subject.trim(), body, isHtml === true || isHtml === "true", parseInt(count.rows[0].count)]
    );
    res.json({ ok: true, variation: result.rows[0], message: "Variation added." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CONTENT VARIATIONS: Update ───────────────────────────────────────────────
app.put("/api/content-groups/:id/variations/:varId", authMiddleware, async (req, res) => {
  const { subject, body, isHtml } = req.body;
  if (!subject || !body) return res.json({ ok: false, message: "Subject and body are required." });
  try {
    await pool.query(
      "UPDATE content_variations SET subject=$1, body=$2, is_html=$3 WHERE id=$4 AND group_id=$5",
      [subject.trim(), body, isHtml === true || isHtml === "true", req.params.varId, req.params.id]
    );
    res.json({ ok: true, message: "Variation updated." });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ─── CONTENT VARIATIONS: Delete ───────────────────────────────────────────────
app.delete("/api/content-groups/:id/variations/:varId", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM content_variations WHERE id=$1 AND group_id=$2", [req.params.varId, req.params.id]);
    res.json({ ok: true, message: "Variation deleted." });
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
