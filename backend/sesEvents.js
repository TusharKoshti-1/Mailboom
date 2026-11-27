// ─── Amazon SES event receiver ────────────────────────────────────────────────
// SES can tell us exactly what happened to every message: Delivery (the
// recipient's server accepted it), Bounce, Complaint (marked as spam). It sends
// these through an SNS topic to an HTTPS URL on this server.
//
// URL:  https://<your-domain>/api/ses/events/<secret>
// The secret in the URL (derived from JWT_SECRET) is what authenticates SNS, and
// the only URL we ever fetch on SNS's behalf is a *.amazonaws.com subscribe link.
//
// Each outgoing SES email carries a tag  mb_tid=<tracking id>  (added by the
// runner), which comes back in every event and identifies the exact recipient.

const crypto = require("crypto");
const { pool } = require("./db");
const scanner = require("./bounceScanner");
const bounceGuard = require("./bounceGuard");
const unsub = require("./unsubscribe");

function webhookSecret() {
  const key = (process.env.JWT_SECRET || "mailblast_secret_change_in_production") + ":ses-events";
  return crypto.createHmac("sha256", key).update("webhook").digest("hex").slice(0, 32);
}

function secretOk(given) {
  const a = Buffer.from(String(given || "")), b = Buffer.from(webhookSecret());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function findRecipient(mail) {
  const tags = (mail && mail.tags) || {};
  const tid = [].concat(tags.mb_tid || [])[0];
  if (tid) {
    const r = await pool.query("SELECT id, campaign_id, email, from_addr FROM campaign_recipients WHERE tracking_id=$1", [tid]);
    if (r.rows[0]) return r.rows[0];
  }
  // Fallback: SES's own message id is in the "250 Ok <id>" reply we stored when sending.
  if (mail && mail.messageId) {
    const r = await pool.query(
      "SELECT id, campaign_id, email, from_addr FROM campaign_recipients WHERE smtp_response LIKE '%' || $1 || '%' ORDER BY id DESC LIMIT 1", [mail.messageId]);
    if (r.rows[0]) return r.rows[0];
  }
  return null;
}

const when = (t) => { const d = t ? new Date(t) : null; return d && !isNaN(d) ? d : new Date(); };

// Processes one SES event. Returns a short label (used by tests and logs).
async function handleEvent(ev) {
  const type = String(ev.eventType || ev.notificationType || "");
  const row = await findRecipient(ev.mail);
  if (!row) return `${type}:unmatched`;

  if (type === "Delivery") {
    await pool.query("UPDATE campaign_recipients SET delivered_at = COALESCE(delivered_at, $1) WHERE id=$2", [when(ev.delivery && ev.delivery.timestamp), row.id]);
    return "Delivery";
  }

  if (type === "Bounce") {
    const b = ev.bounce || {};
    const list = b.bouncedRecipients || [];
    const br = list.find(x => String(x.emailAddress || "").toLowerCase() === row.email.toLowerCase()) || list[0] || {};
    const entry = {
      action: "failed",
      status: br.status || (b.bounceType === "Transient" ? "4.0.0" : "5.0.0"),
      diagnostic: `${br.diagnosticCode || ""} ${b.bounceSubType || ""}`.trim(),
    };
    const done = await scanner.recordBounce(row.id, entry, "", when(b.timestamp), "ses");
    if (done) {
      try { await bounceGuard.evaluateAfterBounce(done.campaign_id, { email: done.email, from_addr: done.from_addr }); }
      catch (e) { console.error("bounce guard failed:", e.message); }
    }
    return "Bounce";
  }

  if (type === "Complaint") {
    await pool.query("UPDATE campaign_recipients SET complained_at = COALESCE(complained_at, $1) WHERE id=$2", [when(ev.complaint && ev.complaint.timestamp), row.id]);
    // Someone who marks you as spam must never be mailed again.
    const c = await pool.query("SELECT user_id FROM campaigns WHERE id=$1", [row.campaign_id]);
    if (c.rows[0]) {
      await unsub.addUnsubscribe(c.rows[0].user_id, row.email, {
        source: "complaint", campaignId: row.campaign_id,
        note: `Spam complaint${ev.complaint && ev.complaint.complaintFeedbackType ? ` (${ev.complaint.complaintFeedbackType})` : ""}`,
      });
    }
    return "Complaint";
  }
  return `${type}:ignored`;
}

// Express handler for POST /api/ses/events/:secret  (SNS sends JSON as text/plain)
async function handleHttp(req, res) {
  if (!secretOk(req.params.secret)) return res.status(403).send("forbidden");
  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const msgType = req.headers["x-amz-sns-message-type"] || body.Type;

    if (msgType === "SubscriptionConfirmation") {
      let u; try { u = new URL(body.SubscribeURL); } catch { return res.status(400).send("bad url"); }
      if (u.protocol !== "https:" || !/^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname)) return res.status(400).send("untrusted url");
      await fetch(u.toString());
      console.log("📨 SES/SNS subscription confirmed");
      return res.send("confirmed");
    }

    if (msgType === "Notification" || body.eventType || body.notificationType) {
      const ev = body.Message ? JSON.parse(body.Message) : body;
      const label = await handleEvent(ev);
      if (!/unmatched|ignored/.test(label)) console.log(`📨 SES event: ${label}`);
      return res.send("ok");
    }
    res.send("ignored");
  } catch (err) {
    console.error("SES event error:", err.message);
    res.status(500).send("error"); // SNS will retry
  }
}

module.exports = { webhookSecret, handleEvent, handleHttp };
