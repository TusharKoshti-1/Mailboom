// ─── Bounce Guard ─────────────────────────────────────────────────────────────
// Watches a campaign for runs of consecutive bounces and pauses it.
//
// "Consecutive" is judged in SEND ORDER, per key:
//   • domain key — the recipient's domain   (3 bounces in a row to @example.com)
//   • sender key — the sending account      (3 bounces in a row from sales@mydomain.com)
// A key's streak is broken by any email to that key that was NOT a bounce
// (accepted and not bounced yet, opened, ...). Failures that say nothing about
// the address (connection error, wrong SMTP password, temporary 4xx) are ignored
// — they neither extend nor break a streak.
//
// Bounces reach us two ways, and both feed this module:
//   1. instantly, when the mail server refuses the recipient during sending
//   2. later, as a bounce notice read from the sender mailbox (bounceScanner.js)

const nodemailer = require("nodemailer");
const { pool } = require("./db");
const { DEFAULT_SETTINGS, applyTemplate } = require("./mailUtils");

async function getUserSettings(userId) {
  const r = await pool.query("SELECT * FROM user_settings WHERE user_id=$1", [userId]);
  const row = r.rows[0] || {};
  const pick = (k) => (row[k] === null || row[k] === undefined || row[k] === "") ? DEFAULT_SETTINGS[k] : row[k];
  const s = {
    bounce_pause_enabled: row.bounce_pause_enabled === null || row.bounce_pause_enabled === undefined ? DEFAULT_SETTINGS.bounce_pause_enabled : row.bounce_pause_enabled,
    bounce_threshold: Math.min(50, Math.max(2, parseInt(row.bounce_threshold, 10) || DEFAULT_SETTINGS.bounce_threshold)),
    bounce_mode: ["domain", "sender", "both"].includes(row.bounce_mode) ? row.bounce_mode : DEFAULT_SETTINGS.bounce_mode,
    alert_enabled: row.alert_enabled === null || row.alert_enabled === undefined ? DEFAULT_SETTINGS.alert_enabled : row.alert_enabled,
    alert_to: row.alert_to || "",
    alert_subject: pick("alert_subject"),
    alert_body: pick("alert_body"),
  };
  return s;
}

// Looks at one key's sends (oldest → newest) and returns the first run of at
// least `threshold` consecutive bounces, or null.
async function findRun(campaign, keyType, keyValue, threshold) {
  const params = [campaign.id, keyValue];
  let cutoff = "";
  if (campaign.bounce_reset_at) { params.push(campaign.bounce_reset_at); cutoff = `AND sent_at > $3`; }
  const col = keyType === "domain" ? "lower(split_part(email,'@',2))" : "lower(from_addr)";
  const r = await pool.query(
    `SELECT id, email, from_addr, bounce_type, bounce_code, bounce_reason
       FROM campaign_recipients
      WHERE campaign_id=$1 AND ${col}=$2 AND sent_at IS NOT NULL
        AND (status='sent' OR bounce_type IS NOT NULL) ${cutoff}
      ORDER BY sent_at ASC, id ASC`,
    params
  );
  let run = [];
  for (const row of r.rows) {
    if (row.bounce_type) {
      run.push(row);
      if (run.length >= threshold) return run;
    } else {
      run = [];
    }
  }
  return null;
}

// Called whenever a recipient of `campaignId` has just been recorded as bounced.
// `row` is { email, from_addr }. Pauses the campaign when the rule is met.
// Returns the trigger object when it paused the campaign, otherwise null.
async function evaluateAfterBounce(campaignId, row) {
  const cRes = await pool.query("SELECT * FROM campaigns WHERE id=$1", [campaignId]);
  const campaign = cRes.rows[0];
  if (!campaign || campaign.status !== "running") return null; // nothing to pause

  const settings = await getUserSettings(campaign.user_id);
  if (!settings.bounce_pause_enabled) return null;

  const checks = [];
  if (settings.bounce_mode !== "sender" && row.email)     checks.push(["domain", String(row.email).split("@").pop().toLowerCase()]);
  if (settings.bounce_mode !== "domain" && row.from_addr) checks.push(["sender", String(row.from_addr).toLowerCase()]);

  for (const [type, value] of checks) {
    const run = await findRun(campaign, type, value, settings.bounce_threshold);
    if (run) {
      const last = run[run.length - 1];
      return pauseForBounce(campaign, settings, {
        type, value, count: run.length,
        emails: run.map(x => x.email),
        lastReason: last.bounce_reason || "Delivery rejected",
        lastCode: last.bounce_code || "",
      });
    }
  }
  return null;
}

async function pauseForBounce(campaign, settings, trigger) {
  const label = trigger.type === "domain" ? `recipient domain ${trigger.value}` : `sending account ${trigger.value}`;
  const reason = `Auto-paused: ${trigger.count} bounces in a row for ${label}. Last reason: ${trigger.lastReason}`;

  // Only one caller can flip running → paused, so only one alert is sent.
  const upd = await pool.query(
    "UPDATE campaigns SET status='paused', paused_by='bounce', pause_reason=$2 WHERE id=$1 AND status='running' RETURNING id",
    [campaign.id, reason]
  );
  if (upd.rows.length === 0) return null;

  try { require("./campaignRunner").signalPause(campaign.id); } catch {}
  console.warn(`⏸ [campaign:${campaign.id}] ${reason}`);

  if (settings.alert_enabled) {
    try {
      await sendAlert(campaign, settings, trigger);
      await pool.query("UPDATE campaigns SET bounce_alert_sent_at=NOW(), bounce_alert_error=NULL WHERE id=$1", [campaign.id]);
    } catch (err) {
      console.error(`Bounce alert for campaign ${campaign.id} failed:`, err.message);
      await pool.query("UPDATE campaigns SET bounce_alert_error=$2 WHERE id=$1", [campaign.id, String(err.message).slice(0, 300)]).catch(() => {});
    }
  }
  return trigger;
}

// ── Alert e-mail ──────────────────────────────────────────────────────────────
function transportFor(smtp) {
  const port = parseInt(smtp.port, 10) || 587;
  return nodemailer.createTransport({
    host: smtp.host, port, secure: port === 465,
    auth: { user: smtp.username, pass: smtp.password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
}

// Which SMTP account sends the alert. Prefer ALERT_SMTP_* env vars, otherwise
// use one of the campaign's own accounts (a different one from the account
// that is bouncing, when the campaign has several).
async function resolveAlertSmtp(campaign, avoidUsername) {
  if (process.env.ALERT_SMTP_HOST && process.env.ALERT_SMTP_USER && process.env.ALERT_SMTP_PASS) {
    return { host: process.env.ALERT_SMTP_HOST, port: process.env.ALERT_SMTP_PORT || 587,
             username: process.env.ALERT_SMTP_USER, password: process.env.ALERT_SMTP_PASS,
             from_name: process.env.ALERT_FROM_NAME || "MailBlast Alerts" };
  }
  if (campaign.sender_group_id) {
    const r = await pool.query("SELECT * FROM sender_accounts WHERE group_id=$1 ORDER BY id ASC", [campaign.sender_group_id]);
    const others = r.rows.filter(a => !avoidUsername || a.username.toLowerCase() !== String(avoidUsername).toLowerCase());
    return (others[0] || r.rows[0]) || null;
  }
  if (campaign.smtp_host) {
    return { host: campaign.smtp_host, port: campaign.smtp_port, username: campaign.smtp_user, password: campaign.smtp_pass, from_name: campaign.from_name };
  }
  return null;
}

function buildVars({ user, campaign, trigger, settings }) {
  const base = String(campaign.base_url || "").replace(/\/+$/, "");
  return {
    user_name: user.name || "",
    campaign_name: campaign.name || `Campaign #${campaign.id}`,
    campaign_id: campaign.id,
    trigger_type: trigger.type === "domain" ? "recipient domain" : "sending account",
    trigger_value: trigger.value,
    bounce_count: trigger.count,
    threshold: settings.bounce_threshold,
    last_reason: trigger.lastReason + (trigger.lastCode ? ` (${trigger.lastCode})` : ""),
    bounced_emails: trigger.emails.map(e => `  • ${e}`).join("\n"),
    sent_count: campaign.sent_count,
    total: campaign.total,
    time: new Date().toUTCString(),
    campaign_url: base ? `${base}/campaigns/${campaign.id}` : `/campaigns/${campaign.id}`,
  };
}

async function sendAlert(campaign, settings, trigger) {
  const u = await pool.query("SELECT name, email FROM users WHERE id=$1", [campaign.user_id]);
  const user = u.rows[0];
  if (!user) throw new Error("User not found");
  const to = (settings.alert_to || "").trim() || user.email;

  const smtp = await resolveAlertSmtp(campaign, trigger.type === "sender" ? trigger.value : null);
  if (!smtp) throw new Error("No SMTP account available to send the alert");

  const vars = buildVars({ user, campaign, trigger, settings });
  const from = smtp.from_name ? `"${smtp.from_name}" <${smtp.username}>` : smtp.username;
  const t = transportFor(smtp);
  try {
    await t.sendMail({
      from, to,
      subject: applyTemplate(settings.alert_subject, vars),
      text: applyTemplate(settings.alert_body, vars),
    });
  } finally { try { t.close(); } catch {} }
  console.log(`📧 [campaign:${campaign.id}] bounce alert sent to ${to}`);
}

// Used by Settings → "Send test alert". Uses sample data, the user's saved
// SMTP (or their first sender-group account), and the *unsaved* template the
// person is currently editing.
async function sendTestAlert(userId, baseUrl, overrideSettings) {
  const u = await pool.query("SELECT name, email FROM users WHERE id=$1", [userId]);
  const user = u.rows[0];
  if (!user) throw new Error("User not found");
  const settings = { ...(await getUserSettings(userId)), ...(overrideSettings || {}) };
  const to = (settings.alert_to || "").trim() || user.email;

  let smtp = null;
  const s = await pool.query("SELECT host, port, username, password, from_name FROM smtp_settings WHERE user_id=$1", [userId]);
  if (s.rows[0]) smtp = s.rows[0];
  if (!smtp) {
    const a = await pool.query(
      `SELECT sa.* FROM sender_accounts sa JOIN sender_groups sg ON sg.id=sa.group_id WHERE sg.user_id=$1 ORDER BY sa.id ASC LIMIT 1`, [userId]);
    smtp = a.rows[0] || null;
  }
  if (!smtp && process.env.ALERT_SMTP_HOST) smtp = await resolveAlertSmtp({}, null);
  if (!smtp) throw new Error("Save an SMTP account (Compose page) or add a Sender Group account first — the alert needs something to send from.");

  const fake = { id: 0, name: "Sample campaign", base_url: baseUrl, sent_count: 42, total: 200 };
  const trigger = { type: "domain", value: "example.com", count: settings.bounce_threshold,
    emails: Array.from({ length: settings.bounce_threshold }, (_, i) => `person${i + 1}@example.com`),
    lastReason: "Mailbox does not exist", lastCode: "5.1.1" };
  const vars = buildVars({ user, campaign: fake, trigger, settings });
  const from = smtp.from_name ? `"${smtp.from_name}" <${smtp.username}>` : smtp.username;
  const t = transportFor(smtp);
  try {
    await t.sendMail({
      from, to,
      subject: "[TEST] " + applyTemplate(settings.alert_subject, vars),
      text: applyTemplate(settings.alert_body, vars),
    });
  } finally { try { t.close(); } catch {} }
  return to;
}

module.exports = { getUserSettings, evaluateAfterBounce, findRun, sendTestAlert };
