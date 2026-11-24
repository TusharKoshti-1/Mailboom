// ─── Shared mail helpers ──────────────────────────────────────────────────────
// Pure functions (no DB access) used by the runner, the bounce scanner and the
// report builder, so they stay easy to test.

const MAX_GROUP_ITEMS = 50; // max subjects / bodies per group

// ── Personalisation tokens ────────────────────────────────────────────────────
// {{email}} and {{domain}} are replaced in subject and body.
function renderTokens(text, recipientEmail) {
  if (!text) return "";
  const email  = String(recipientEmail || "");
  const domain = email.includes("@") ? email.split("@").pop() : "";
  return String(text)
    .replace(/\{\{\s*email\s*\}\}/gi, email)
    .replace(/\{\{\s*domain\s*\}\}/gi, domain);
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Turns the message parts into one e-mail. Each part is
// { text, isHtml }; empty parts are skipped. Returns { html, text }.
function assembleMessage(parts) {
  const used = parts.filter(p => p && p.text && String(p.text).trim());
  const html = used.map(p => {
    const inner = p.isHtml ? p.text : String(p.text).replace(/\r?\n/g, "<br>");
    return `<div style="margin:0 0 16px 0">${inner}</div>`;
  }).join("");
  const text = used.map(p => (p.isHtml ? htmlToText(p.text) : String(p.text).trim())).join("\n\n");
  return { html, text };
}

// ── SMTP error classification ─────────────────────────────────────────────────
// Decides whether a sendMail() failure means "this recipient/message was
// refused" (a bounce) or "something else went wrong" (connection, auth, a
// temporary 4xx). Only real refusals count toward the bounce-pause rule —
// a network blip says nothing about the recipient's address.
function extractEnhancedCode(text) {
  const m = String(text || "").match(/\b([245]\.\d{1,3}\.\d{1,3})\b/);
  return m ? m[1] : null;
}

const BLOCK_RE = /spam|blocked|blacklist|block list|blocklist|reputation|policy|denied|rbl|spamhaus|dnsbl|not authori[sz]ed|relay|rejected due to|sender.*(refused|rejected)|5\.7\./i;

// Turns an enhanced status code + free text into { type, reason }.
function classifyBounce({ code, text, permanent = true }) {
  const t = String(text || "");
  const c = code || extractEnhancedCode(t) || "";
  let type = permanent ? "hard" : "soft";
  let reason;

  if (/^5\.1\.(1|0|10)$/.test(c) || /user unknown|no such user|does not exist|unknown user|mailbox not found|invalid (recipient|mailbox)|recipient (address )?rejected|address rejected|no mailbox/i.test(t)) {
    type = "hard"; reason = "Mailbox does not exist";
  } else if (/^5\.1\.2$/.test(c) || /domain (not found|does not exist)|host or domain name not found|no such domain|unrouteable|NXDOMAIN/i.test(t)) {
    type = "hard"; reason = "Domain does not exist";
  } else if (/^5\.4\.(1|4)$/.test(c)) {
    type = "hard"; reason = "Recipient domain cannot be reached";
  } else if (/^5\.2\.2$/.test(c) || /mailbox (is )?full|over quota|quota exceeded|insufficient storage/i.test(t)) {
    type = "soft"; reason = "Mailbox full";
  } else if (/^5\.2\.1$/.test(c) || /disabled|deactivated|suspended|account.*(inactive|closed)/i.test(t)) {
    type = "hard"; reason = "Mailbox disabled or discontinued";
  } else if (/^5\.7\./.test(c) || BLOCK_RE.test(t)) {
    type = "blocked"; reason = "Rejected as spam / blocked by recipient server";
  } else if (!permanent) {
    type = "soft"; reason = "Temporary delivery failure";
  } else {
    reason = "Delivery rejected by recipient server";
  }
  return { type, reason, code: c || null };
}

// Returns null when the error is NOT a recipient-level refusal.
function classifySendError(err) {
  if (!err) return null;
  const rc  = Number(err.responseCode) || 0;
  const cmd = String(err.command || "");
  const msg = [err.response, err.message].filter(Boolean).join(" | ");

  const refusedAtRcpt = err.code === "EENVELOPE" || (rc >= 500 && rc < 600 && /RCPT/i.test(cmd));
  const refusedAtData = rc >= 500 && rc < 600 && /^DATA$|^SEND$/i.test(cmd);
  if (!refusedAtRcpt && !refusedAtData) return null;

  const b = classifyBounce({ text: msg, permanent: true });
  return { ...b, response: String(err.response || err.message || "").slice(0, 400) };
}

// ── IMAP host guess for reading bounce notices ────────────────────────────────
// Returns null for API-style relays (SendGrid, Mailgun, SES...) which have no
// mailbox to read — those report bounces through webhooks instead.
function deriveImapHost(smtpHost, override) {
  if (override && String(override).trim()) return String(override).trim();
  const h = String(smtpHost || "").trim().toLowerCase();
  if (!h) return null;
  if (/sendgrid|mailgun|amazonaws|sparkpost|mandrill|postmark|sendinblue|brevo/.test(h)) return null;
  if (/outlook|office365|hotmail|live\.com/.test(h)) return "outlook.office365.com";
  if (h === "smtp.gmail.com") return "imap.gmail.com";
  if (/yahoo/.test(h)) return "imap.mail.yahoo.com";
  if (/^smtp-mail\./.test(h)) return h.replace(/^smtp-mail\./, "imap-mail.");
  if (/^(smtp|smtpout|smtp-relay)\./.test(h)) return h.replace(/^(smtp|smtpout|smtp-relay)\./, "imap.");
  return h; // e.g. cPanel: mail.example.com serves both SMTP and IMAP
}

// ── Settings defaults ─────────────────────────────────────────────────────────
const DEFAULT_ALERT_SUBJECT = "⚠ Campaign \"{{campaign_name}}\" paused — {{bounce_count}} bounces in a row";
const DEFAULT_ALERT_BODY =
`Hi {{user_name}},

Your campaign "{{campaign_name}}" was paused automatically because {{bounce_count}} emails in a row bounced for the same {{trigger_type}}: {{trigger_value}}.

Latest bounce reason: {{last_reason}}

Bounced addresses:
{{bounced_emails}}

Progress so far: {{sent_count}} sent out of {{total}}.
Paused at: {{time}}

Check your sending account / recipient list, then open the campaign and press Resume when you are ready:
{{campaign_url}}

— MailBlast`;

const DEFAULT_SETTINGS = {
  bounce_pause_enabled: true,
  bounce_threshold: 3,
  bounce_mode: "both", // 'domain' | 'sender' | 'both'
  alert_enabled: true,
  alert_to: "",
  alert_subject: DEFAULT_ALERT_SUBJECT,
  alert_body: DEFAULT_ALERT_BODY,
};

function applyTemplate(tpl, vars) {
  return String(tpl || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k.toLowerCase()) ? String(vars[k.toLowerCase()]) : m);
}

module.exports = {
  MAX_GROUP_ITEMS, renderTokens, htmlToText, assembleMessage,
  extractEnhancedCode, classifyBounce, classifySendError, deriveImapHost,
  DEFAULT_SETTINGS, DEFAULT_ALERT_SUBJECT, DEFAULT_ALERT_BODY, applyTemplate,
};
