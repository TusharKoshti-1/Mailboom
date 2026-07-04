// ─── Background Campaign Runner ───────────────────────────────────────────────
// Processes email campaigns inside the server process, independent of any HTTP
// request. A campaign keeps sending after the browser is closed and is resumed
// automatically when the server restarts. Pause / stop are honored promptly.

const nodemailer = require("nodemailer");
const crypto     = require("crypto");
const { pool }   = require("./db");

// campaignId -> { stop: bool, pause: bool } — control flags for the active loop.
const controls = new Map();
// Set of campaign ids that currently have a running loop (prevents duplicates).
const active = new Set();

function createTransporter({ host, port, username, password }) {
  const p = parseInt(port, 10) || 587;
  return nodemailer.createTransport({
    host, port: p, secure: p === 465,
    auth: { user: username, pass: password },
    tls:  { rejectUnauthorized: false },
  });
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Sleep that wakes early if the campaign is paused or stopped.
async function interruptibleDelay(seconds, campaignId) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const ctrl = controls.get(campaignId);
    if (!ctrl || ctrl.stop || ctrl.pause) return;
    await new Promise(r => setTimeout(r, Math.min(1000, end - Date.now())));
  }
}

// Begin (or resume) processing a campaign. Safe to call repeatedly.
function startCampaign(campaignId) {
  campaignId = Number(campaignId);
  if (active.has(campaignId)) return;
  active.add(campaignId);
  controls.set(campaignId, { stop: false, pause: false });
  runLoop(campaignId)
    .catch(err => console.error(`Campaign ${campaignId} crashed:`, err.message))
    .finally(() => { active.delete(campaignId); controls.delete(campaignId); });
}

function signalPause(campaignId) {
  const ctrl = controls.get(Number(campaignId));
  if (ctrl) ctrl.pause = true;
}

function signalStop(campaignId) {
  const ctrl = controls.get(Number(campaignId));
  if (ctrl) ctrl.stop = true;
}

async function runLoop(campaignId) {
  const cRes = await pool.query("SELECT * FROM campaigns WHERE id=$1", [campaignId]);
  const c = cRes.rows[0];
  if (!c || c.status !== "running") return;

  // Preload the sender pool (single SMTP or a sender group).
  let senderAccounts = null;
  if (c.sender_group_id) {
    const r = await pool.query("SELECT * FROM sender_accounts WHERE group_id=$1", [c.sender_group_id]);
    if (r.rows.length === 0) return fail(campaignId, "Sender group has no accounts.");
    senderAccounts = r.rows;
  }

  // Preload subject / body pools when groups are used.
  let subjectItems = null, bodyItems = null;
  if (c.subject_group_id) {
    const r = await pool.query("SELECT * FROM subject_items WHERE group_id=$1", [c.subject_group_id]);
    if (r.rows.length === 0) return fail(campaignId, "Subject group has no subjects.");
    subjectItems = r.rows;
  }
  if (c.body_group_id) {
    const r = await pool.query("SELECT * FROM body_items WHERE group_id=$1", [c.body_group_id]);
    if (r.rows.length === 0) return fail(campaignId, "Body group has no bodies.");
    bodyItems = r.rows;
  }

  const attachments = Array.isArray(c.attachments) ? c.attachments : [];
  const mailAttachments = attachments.map(a => ({ filename: a.filename, path: a.path, contentType: a.contentType }));

  // Preload the attachment pool when a random attachment group is used.
  let attachmentItems = null;
  if (c.attachment_group_id) {
    const r = await pool.query("SELECT filename, path, content_type FROM attachment_items WHERE group_id=$1", [c.attachment_group_id]);
    if (r.rows.length > 0) attachmentItems = r.rows;
  }

  const transporters = new Map(); // username -> transporter (reused across sends)

  const getTransporter = (sender) => {
    const key = `${sender.host}|${sender.username}`;
    if (!transporters.has(key)) transporters.set(key, createTransporter(sender));
    return transporters.get(key);
  };

  while (true) {
    const ctrl = controls.get(campaignId);
    if (!ctrl || ctrl.stop || ctrl.pause) break;

    // Re-read live status + processed count (status may have changed externally).
    const live = await pool.query("SELECT status, sent_count, failed_count FROM campaigns WHERE id=$1", [campaignId]);
    if (live.rows.length === 0 || live.rows[0].status !== "running") break;
    const processed = live.rows[0].sent_count + live.rows[0].failed_count;

    // Grab the next pending recipient.
    const next = await pool.query(
      "SELECT * FROM campaign_recipients WHERE campaign_id=$1 AND status='pending' ORDER BY idx ASC, id ASC LIMIT 1",
      [campaignId]
    );
    if (next.rows.length === 0) {
      await pool.query("UPDATE campaigns SET status='completed', finished_at=NOW() WHERE id=$1 AND status='running'", [campaignId]);
      break;
    }
    const r = next.rows[0];

    // Rate-limit: wait between sends (not before the very first send).
    if (processed > 0) {
      await interruptibleDelay(randBetween(c.min_delay, c.max_delay), campaignId);
      const c2 = controls.get(campaignId);
      if (!c2 || c2.stop || c2.pause) break;
    }

    // Resolve sender, subject, body for this recipient.
    const sender = senderAccounts
      ? pickRandom(senderAccounts)
      : { host: c.smtp_host, port: c.smtp_port, username: c.smtp_user, password: c.smtp_pass, from_name: c.from_name };

    const emailSubject = subjectItems ? pickRandom(subjectItems).subject : (c.subject || "");
    let emailBody, emailIsHtml;
    if (bodyItems) { const b = pickRandom(bodyItems); emailBody = b.body; emailIsHtml = b.is_html; }
    else           { emailBody = c.body || ""; emailIsHtml = c.is_html; }

    const fromAddr = (sender.username || "").trim();
    const fromFull = sender.from_name ? `"${sender.from_name}" <${fromAddr}>` : fromAddr;

    const trackingId = crypto.randomUUID();
    const pixel = `<img src="${c.base_url}/api/track/open/${trackingId}" width="1" height="1" alt="" style="display:none;max-height:0;overflow:hidden" />`;
    const htmlBody = (emailIsHtml ? emailBody : emailBody.replace(/\n/g, "<br>")) + pixel;

    const mailOptions = {
      from: fromFull, to: r.email, subject: emailSubject,
      text: emailIsHtml ? emailBody.replace(/<[^>]+>/g, "") : emailBody,
      html: htmlBody,
    };
    // A random-attachment group (if set) overrides the fixed attachments — one
    // random file per recipient, mirroring random subject/body.
    if (attachmentItems) {
      const a = pickRandom(attachmentItems);
      mailOptions.attachments = [{ filename: a.filename, path: a.path, contentType: a.content_type }];
    } else if (mailAttachments.length > 0) {
      mailOptions.attachments = mailAttachments;
    }

    try {
      await getTransporter(sender).sendMail(mailOptions);
      await pool.query(
        "UPDATE campaign_recipients SET status='sent', from_addr=$1, subject=$2, sent_at=NOW() WHERE id=$3",
        [fromAddr, emailSubject, r.id]
      );
      await pool.query("UPDATE campaigns SET sent_count = sent_count + 1 WHERE id=$1", [campaignId]);
      try {
        await pool.query(
          "INSERT INTO sent_emails (user_id, tracking_id, recipient, subject, from_addr) VALUES ($1,$2,$3,$4,$5)",
          [c.user_id, trackingId, r.email, emailSubject, fromAddr]
        );
      } catch (e) { console.error("sent_emails insert failed:", e.message); }
      console.log(`✅ [campaign:${campaignId}] ${fromAddr} → ${r.email}`);
    } catch (err) {
      await pool.query(
        "UPDATE campaign_recipients SET status='failed', from_addr=$1, subject=$2, error=$3, sent_at=NOW() WHERE id=$4",
        [fromAddr, emailSubject, err.message, r.id]
      );
      await pool.query("UPDATE campaigns SET failed_count = failed_count + 1 WHERE id=$1", [campaignId]);
      console.error(`❌ [campaign:${campaignId}] ${fromAddr} → ${r.email}: ${err.message}`);
    }
  }

  transporters.forEach(t => { try { t.close(); } catch {} });
}

function randBetween(min, max) {
  const a = parseFloat(min); const b = parseFloat(max);
  const lo = isNaN(a) ? 10 : a; const hi = isNaN(b) ? 20 : b;
  return Math.random() * (Math.max(hi, lo) - lo) + lo;
}

async function fail(campaignId, message) {
  console.error(`Campaign ${campaignId} failed: ${message}`);
  await pool.query("UPDATE campaigns SET status='stopped', finished_at=NOW() WHERE id=$1", [campaignId]).catch(() => {});
}

// On server startup, resume every campaign left in the 'running' state.
async function resumeAll() {
  try {
    const r = await pool.query("SELECT id FROM campaigns WHERE status='running'");
    r.rows.forEach(row => startCampaign(row.id));
    if (r.rows.length > 0) console.log(`▶ Resumed ${r.rows.length} running campaign(s).`);
  } catch (err) {
    console.error("resumeAll failed:", err.message);
  }
}

module.exports = { startCampaign, signalPause, signalStop, resumeAll };
