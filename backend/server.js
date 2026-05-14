const express = require("express");
const nodemailer = require("nodemailer");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── File Upload (memory) ────────────────────────────────────────────────────
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
});

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Serve React Frontend (production build) ─────────────────────────────────
const frontendPath = path.join(__dirname, "public");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// ─── API: Test SMTP Connection ────────────────────────────────────────────────
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

// ─── API: Send Campaign (SSE Streaming) ──────────────────────────────────────
app.post("/api/send", upload.array("attachments", 20), async (req, res) => {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx fix
  res.flushHeaders();

  const send = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
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

    // Validate required fields
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) {
      send({ type: "log", level: "error", msg: "❌ Missing required SMTP or sender configuration." });
      send({ type: "done", msg: "Campaign aborted.", sent: 0, failed: 0 });
      return res.end();
    }

    let recipients, subjects, bodies;
    try {
      recipients = JSON.parse(recipientsRaw || "[]");
      subjects   = JSON.parse(subjectsRaw   || "[]");
      bodies     = JSON.parse(bodiesRaw     || "[]");
    } catch {
      send({ type: "log", level: "error", msg: "❌ Invalid JSON in recipients, subjects, or bodies." });
      send({ type: "done", msg: "Campaign aborted.", sent: 0, failed: 0 });
      return res.end();
    }

    if (!recipients.length) {
      send({ type: "log", level: "error", msg: "❌ No recipients provided." });
      send({ type: "done", msg: "Campaign aborted.", sent: 0, failed: 0 });
      return res.end();
    }
    if (!subjects.length) {
      send({ type: "log", level: "error", msg: "❌ No subjects provided." });
      send({ type: "done", msg: "Campaign aborted.", sent: 0, failed: 0 });
      return res.end();
    }
    if (!bodies.length) {
      send({ type: "log", level: "error", msg: "❌ No message bodies provided." });
      send({ type: "done", msg: "Campaign aborted.", sent: 0, failed: 0 });
      return res.end();
    }

    const delay = Math.max(0, parseFloat(delaySeconds) || 0) * 1000;
    const useHtml = isHtml === "true" || isHtml === true;

    // Prepare attachments
    const attachments = (req.files || []).map((f) => ({
      filename: f.originalname,
      content: f.buffer,
      contentType: f.mimetype,
    }));

    send({ type: "log", level: "info", msg: `🔌 Connecting to SMTP: ${smtpHost}:${smtpPort}...` });

    const transporter = buildTransporter({ smtpHost, smtpPort, smtpUser, smtpPass, useTLS });
    await transporter.verify();

    send({ type: "log", level: "success", msg: "✅ SMTP connection verified." });
    send({
      type: "log", level: "info",
      msg: `📎 Attachments: ${attachments.length} file(s) | 📧 Recipients: ${recipients.length} | 🎲 Subjects: ${subjects.length} | 📝 Bodies: ${bodies.length}`,
    });
    send({ type: "log", level: "info", msg: `⏱ Delay between emails: ${delay / 1000}s` });
    send({ type: "log", level: "info", msg: `🚀 Starting campaign...` });

    let sent = 0, failed = 0;

    for (let i = 0; i < recipients.length; i++) {
      if (cancelled) {
        send({ type: "log", level: "warn", msg: "⚠️ Campaign cancelled by client disconnect." });
        break;
      }

      const to = recipients[i].trim();
      if (!to) continue;

      const subject = rand(subjects);
      const body    = rand(bodies);

      const mailOptions = {
        from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
        to,
        subject,
        attachments,
      };

      if (useHtml) {
        mailOptions.html = body;
        mailOptions.text = body.replace(/<[^>]+>/g, "");
      } else {
        mailOptions.text = body;
        mailOptions.html = body.replace(/\n/g, "<br>");
      }

      try {
        await transporter.sendMail(mailOptions);
        sent++;
        send({
          type: "log", level: "success",
          msg: `✉ [${i + 1}/${recipients.length}] Sent → ${to} | Subject: "${subject}"`,
          progress: i + 1,
          total: recipients.length,
        });
      } catch (err) {
        failed++;
        send({
          type: "log", level: "error",
          msg: `✗ [${i + 1}/${recipients.length}] Failed → ${to}: ${err.message}`,
          progress: i + 1,
          total: recipients.length,
        });
      }

      if (i < recipients.length - 1 && delay > 0) {
        send({ type: "log", level: "info", msg: `⏳ Waiting ${delay / 1000}s...` });
        await sleep(delay);
      }
    }

    transporter.close();

    send({
      type: "done",
      msg: `🎉 Campaign complete! ✅ Sent: ${sent} | ❌ Failed: ${failed}`,
      sent,
      failed,
    });
  } catch (err) {
    send({ type: "log", level: "error", msg: `💥 Fatal error: ${err.message}` });
    send({ type: "done", msg: "Campaign ended with errors.", sent: 0, failed: 0 });
  }

  res.end();
});

// ─── API: Health Check ────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "2.0.0", timestamp: new Date().toISOString() });
});

// ─── Fallback: Serve React App ────────────────────────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#0a0a0a;color:#fff;">
        <h1>⚡ MailBlast Pro Backend</h1>
        <p>API is running. Frontend build not found in /public.</p>
        <p>Health: <a href="/api/health" style="color:#4ade80">/api/health</a></p>
      </body></html>
    `);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⚡ MailBlast Pro backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
