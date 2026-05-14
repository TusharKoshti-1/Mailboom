const express = require("express");
const nodemailer = require("nodemailer");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
// Render injects PORT automatically — never hardcode it
const PORT = process.env.PORT || 3001;

// ─── File Upload (memory) ─────────────────────────────────────────────────────
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Static Frontend ──────────────────────────────────────────────────────────
const frontendPath = path.join(__dirname, "public");
app.use(express.static(frontendPath));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildTransporter({ smtpHost, smtpPort, smtpUser, smtpPass, useTLS }) {
  const port = parseInt(smtpPort);
  return nodemailer.createTransport({
    host: smtpHost,
    port,
    secure: port === 465,
    requireTLS: useTLS && port !== 465,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "2.1.0", timestamp: new Date().toISOString() });
});

// ─── Test SMTP ────────────────────────────────────────────────────────────────
app.post("/api/test-connection", async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, useTLS } = req.body;
  try {
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return res.status(400).json({ ok: false, message: "All SMTP fields are required." });
    }
    const transporter = buildTransporter({ smtpHost, smtpPort, smtpUser, smtpPass, useTLS });
    await transporter.verify();
    transporter.close();
    res.json({ ok: true, message: `Connected to ${smtpHost}:${smtpPort} successfully!` });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

// ─── Send Campaign (SSE) ──────────────────────────────────────────────────────
app.post("/api/send", upload.array("attachments", 20), async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (res.flush) res.flush();
    }
  };

  let cancelled = false;
  req.on("close", () => { cancelled = true; });

  try {
    const {
      smtpHost, smtpPort, smtpUser, smtpPass, useTLS,
      fromName, fromEmail,
      recipients: recipientsRaw,
      subjects: subjectsRaw,
      bodies: bodiesRaw,
      delaySeconds,
      isHtml,
    } = req.body;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) {
      send({ type: "log", level: "error", msg: "❌ Missing required SMTP or sender fields." });
      send({ type: "done", msg: "Aborted.", sent: 0, failed: 0 });
      return res.end();
    }

    let recipients, subjects, bodies;
    try {
      recipients = JSON.parse(recipientsRaw || "[]");
      subjects   = JSON.parse(subjectsRaw   || "[]");
      bodies     = JSON.parse(bodiesRaw     || "[]");
    } catch {
      send({ type: "log", level: "error", msg: "❌ Invalid data format." });
      send({ type: "done", msg: "Aborted.", sent: 0, failed: 0 });
      return res.end();
    }

    if (!recipients.length) { send({ type: "log", level: "error", msg: "❌ No recipients." }); send({ type: "done", msg: "Aborted.", sent: 0, failed: 0 }); return res.end(); }
    if (!subjects.length)   { send({ type: "log", level: "error", msg: "❌ No subjects." });   send({ type: "done", msg: "Aborted.", sent: 0, failed: 0 }); return res.end(); }
    if (!bodies.length)     { send({ type: "log", level: "error", msg: "❌ No bodies." });     send({ type: "done", msg: "Aborted.", sent: 0, failed: 0 }); return res.end(); }

    const delay  = Math.max(0, parseFloat(delaySeconds) || 0) * 1000;
    const useHtml = isHtml === "true" || isHtml === true;
    const attachments = (req.files || []).map((f) => ({
      filename: f.originalname, content: f.buffer, contentType: f.mimetype,
    }));

    send({ type: "log", level: "info", msg: `🔌 Connecting to ${smtpHost}:${smtpPort}...` });
    const transporter = buildTransporter({ smtpHost, smtpPort, smtpUser, smtpPass, useTLS });
    await transporter.verify();
    send({ type: "log", level: "success", msg: "✅ SMTP verified." });
    send({ type: "log", level: "info", msg: `📧 ${recipients.length} recipients | 🎲 ${subjects.length} subjects | 📝 ${bodies.length} bodies | 📎 ${attachments.length} attachments` });
    if (delay > 0) send({ type: "log", level: "info", msg: `⏱ ${delay / 1000}s delay between emails` });
    send({ type: "log", level: "info", msg: "🚀 Launching campaign..." });

    let sent = 0, failed = 0;

    for (let i = 0; i < recipients.length; i++) {
      if (cancelled) { send({ type: "log", level: "warn", msg: "⚠️ Stopped by user." }); break; }

      const to      = recipients[i].trim();
      if (!to) continue;
      const subject = rand(subjects);
      const body    = rand(bodies);

      const mailOpts = {
        from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
        to, subject, attachments,
      };
      if (useHtml) {
        mailOpts.html = body;
        mailOpts.text = body.replace(/<[^>]+>/g, "");
      } else {
        mailOpts.text = body;
        mailOpts.html = body.replace(/\n/g, "<br>");
      }

      try {
        await transporter.sendMail(mailOpts);
        sent++;
        send({ type: "log", level: "success", msg: `✉ [${i+1}/${recipients.length}] → ${to} | "${subject}"`, progress: i+1, total: recipients.length });
      } catch (err) {
        failed++;
        send({ type: "log", level: "error", msg: `✗ [${i+1}/${recipients.length}] → ${to}: ${err.message}`, progress: i+1, total: recipients.length });
      }

      if (i < recipients.length - 1 && delay > 0) await sleep(delay);
    }

    transporter.close();
    send({ type: "done", msg: `🎉 Done! ✅ Sent: ${sent} | ❌ Failed: ${failed}`, sent, failed });
  } catch (err) {
    send({ type: "log", level: "error", msg: `💥 Fatal: ${err.message}` });
    send({ type: "done", msg: "Ended with errors.", sent: 0, failed: 0 });
  }
  res.end();
});

// ─── SPA Fallback (MUST be after all /api routes) ─────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(frontendPath, "index.html");
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.json({ status: "MailBlast Pro API", version: "2.1.0", note: "Frontend not built" });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`⚡ MailBlast Pro running on 0.0.0.0:${PORT}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || "development"}`);
});
