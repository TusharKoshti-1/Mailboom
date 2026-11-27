// ─── Campaign delivery status + downloadable report ───────────────────────────
// Works out, for every recipient, what we actually KNOW about delivery.
//
// No sender can ever prove a message landed in the Inbox (vs. Spam) — the
// recipient's server never tells us. What we can know is a ladder of evidence,
// and each recipient is placed on exactly one rung:
//
//   pending           not processed yet
//   failed            we could not send it (connection / login / temporary error)
//   rejected          the recipient's mail server refused it while we were sending
//   bounced           accepted at first, then a bounce notice came back later
//   opened            the recipient's mail client loaded the tracking pixel
//                     → strongest proof it arrived and was displayed
//   delivered         the receiving mail server CONFIRMED delivery (Amazon SES event)
//   complained        the recipient marked it as spam (SES event)
//   skipped           not sent: the address had unsubscribed
//   likely_delivered  accepted, our sending mailbox was checked afterwards and
//                     no bounce notice arrived
//   awaiting          accepted, but too soon after sending to say yet
//   unverified        accepted, but bounce checking is unavailable for this sender
//                     (no IMAP access) — we simply don't know

const XLSX = require("xlsx");
const { pool } = require("./db");
const { isMailboxDisabled, DISABLED_REASON } = require("./mailUtils");

const SETTLE_MINUTES = Math.max(1, parseInt(process.env.BOUNCE_SETTLE_MINUTES, 10) || 30);

const DELIVERY = {
  pending:          { label: "Not sent yet",                              group: "pending" },
  failed:           { label: "Not sent (error)",                          group: "failed" },
  rejected:         { label: "Rejected by recipient server (bounced)",    group: "bounced" },
  bounced:          { label: "Bounced (notice received later)",           group: "bounced" },
  skipped:          { label: "Skipped (unsubscribed)",                    group: "skipped" },
  complained:       { label: "Delivered, then marked as spam",            group: "complaint" },
  opened:           { label: "Delivered — opened by recipient",           group: "delivered" },
  delivered:        { label: "Delivered — confirmed by mail server",      group: "delivered" },
  likely_delivered: { label: "Likely delivered (no bounce received)",     group: "delivered" },
  awaiting:         { label: "Accepted — waiting for confirmation",       group: "unknown" },
  unverified:       { label: "Accepted — delivery not confirmed",         group: "unknown" },
};

// One row per recipient with its evidence and computed delivery state.
const RECIPIENT_SQL = `
  SELECT cr.id, cr.idx, cr.email, cr.status, cr.from_addr, cr.subject, cr.error, cr.sent_at, cr.smtp_response,
         cr.bounce_type, cr.bounce_source, cr.bounce_code, cr.bounce_reason, cr.bounce_detail, cr.bounced_at, cr.delivered_at, cr.complained_at,
         EXISTS (SELECT 1 FROM unsubscribes un WHERE un.user_id = cmp.user_id AND un.email = lower(cr.email)) AS unsubscribed,
         COALESCE(se.open_count, 0)::int AS open_count, se.first_opened_at, se.last_opened_at,
         ms.last_scan_at, ms.last_error AS monitor_error,
         CASE
           WHEN cr.status = 'pending' THEN 'pending'
           WHEN cr.status = 'skipped' THEN 'skipped'
           WHEN cr.bounce_type IS NOT NULL AND cr.bounce_source = 'smtp' THEN 'rejected'
           WHEN cr.bounce_type IS NOT NULL THEN 'bounced'
           WHEN cr.status = 'failed' THEN 'failed'
           WHEN cr.complained_at IS NOT NULL THEN 'complained'
           WHEN COALESCE(se.open_count, 0) > 0 THEN 'opened'
           WHEN cr.delivered_at IS NOT NULL THEN 'delivered'
           WHEN ms.last_scan_at IS NOT NULL AND ms.last_error IS NULL
                AND ms.last_scan_at >= cr.sent_at + make_interval(mins => $2) THEN 'likely_delivered'
           WHEN ms.last_scan_at IS NOT NULL AND ms.last_error IS NULL THEN 'awaiting'
           ELSE 'unverified'
         END AS delivery
    FROM campaign_recipients cr
    JOIN campaigns cmp ON cmp.id = cr.campaign_id
    LEFT JOIN sent_emails se ON se.tracking_id = cr.tracking_id
    LEFT JOIN LATERAL (
         SELECT last_scan_at, last_error FROM mailbox_scan_state
          WHERE username = lower(cr.from_addr) AND folder = 'INBOX'
          ORDER BY last_scan_at DESC NULLS LAST LIMIT 1
    ) ms ON TRUE
   WHERE cr.campaign_id = $1`;

const FILTERS = {
  all: "delivery <> 'skipped'", delivered: "delivery IN ('opened','delivered','likely_delivered')", opened: "delivery = 'opened'",
  skipped: "delivery = 'skipped'", complained: "delivery = 'complained'",
  bounced: "delivery IN ('bounced','rejected')", failed: "delivery = 'failed'",
  unknown: "delivery IN ('awaiting','unverified')", pending: "delivery = 'pending'",
};

async function getStats(campaignId) {
  const r = await pool.query(
    `SELECT delivery, COUNT(*)::int AS n FROM (${RECIPIENT_SQL}) t GROUP BY delivery`, [campaignId, SETTLE_MINUTES]);
  const by = {}; Object.keys(DELIVERY).forEach(k => (by[k] = 0));
  r.rows.forEach(row => (by[row.delivery] = row.n));
  const total = Object.values(by).reduce((a, b) => a + b, 0) - by.skipped; // skipped (unsubscribed) are not part of the send
  const attempted = total - by.pending;
  const bounced = by.bounced + by.rejected;
  const delivered = by.opened + by.delivered + by.likely_delivered + by.complained;
  return {
    by, total, attempted, delivered, bounced, failed: by.failed,
    unknown: by.awaiting + by.unverified, opened: by.opened, skipped: by.skipped, complained: by.complained,
    confirmed: by.opened + by.delivered + by.complained,
    bounce_rate: attempted > 0 ? Math.round((bounced / attempted) * 1000) / 10 : 0,
    open_rate: (attempted - by.failed - bounced) > 0 ? Math.round((by.opened / (attempted - by.failed - bounced)) * 1000) / 10 : 0,
  };
}

async function listRecipients(campaignId, filter, limit) {
  const where = FILTERS[filter] ? `WHERE ${FILTERS[filter]}` : "";
  const r = await pool.query(
    `SELECT * FROM (${RECIPIENT_SQL}) t ${where} ORDER BY (status='pending') ASC, sent_at DESC NULLS LAST, id DESC LIMIT ${Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000)}`,
    [campaignId, SETTLE_MINUTES]);
  return r.rows;
}

// Per-sender mailbox monitoring status, shown on the campaign page and in the report.
async function getMonitoring(campaign) {
  const r = await pool.query(
    `SELECT DISTINCT lower(from_addr) AS username FROM campaign_recipients WHERE campaign_id=$1 AND from_addr IS NOT NULL`, [campaign.id]);
  const out = [];
  for (const { username } of r.rows) {
    const s = await pool.query(
      "SELECT last_scan_at, last_error FROM mailbox_scan_state WHERE username=$1 AND folder='INBOX' ORDER BY last_scan_at DESC NULLS LAST LIMIT 1", [username]);
    const st = s.rows[0];
    // Amazon SES reports through events instead of a mailbox: once any event has arrived, that sender IS monitored.
    const ev = await pool.query(
      `SELECT COUNT(*)::int AS n, MAX(COALESCE(delivered_at, bounced_at, complained_at)) AS last_event FROM campaign_recipients
        WHERE campaign_id=$1 AND lower(from_addr)=$2 AND (delivered_at IS NOT NULL OR bounce_source='ses' OR complained_at IS NOT NULL)`,
      [campaign.id, username]);
    const sesEvents = !!(ev.rows[0] && ev.rows[0].n > 0);
    out.push({
      sender: username,
      ok: sesEvents || !!(st && st.last_scan_at && !st.last_error),
      via: sesEvents ? "Amazon SES events" : "mailbox check",
      last_scan_at: sesEvents ? ev.rows[0].last_event : (st ? st.last_scan_at : null),
      error: sesEvents ? null : (st ? st.last_error : null),
      never: !st && !sesEvents,
    });
  }
  return out;
}

const fmt = (d) => d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : "";
const domainOf = (e) => String(e || "").split("@").pop().toLowerCase();

function groupSummary(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    if (r.delivery === "pending" || r.delivery === "skipped") continue;
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, { key: k, attempted: 0, delivered: 0, opened: 0, bounced: 0, failed: 0, unknown: 0, reasons: {} });
    const g = m.get(k);
    g.attempted++;
    const grp = DELIVERY[r.delivery].group;
    if (grp === "delivered") g.delivered++;
    if (r.delivery === "opened") g.opened++;
    if (grp === "bounced") { g.bounced++; const rs = r.bounce_reason || "Unknown"; g.reasons[rs] = (g.reasons[rs] || 0) + 1; }
    if (grp === "failed") g.failed++;
    if (grp === "unknown") g.unknown++;
  }
  return [...m.values()].sort((a, b) => b.bounced - a.bounced || b.attempted - a.attempted);
}

async function buildReport(campaign) {
  const all = await pool.query(`SELECT * FROM (${RECIPIENT_SQL}) t ORDER BY idx ASC, id ASC`, [campaign.id, SETTLE_MINUTES]);
  const rows = all.rows;
  const stats = await getStats(campaign.id);
  const monitoring = await getMonitoring(campaign);

  // ── Summary ──
  const sum = [
    ["MailBlast — Campaign Delivery Report"], [],
    ["Campaign", campaign.name || `Campaign #${campaign.id}`],
    ["Status", campaign.status + (campaign.paused_by === "bounce" ? " (auto-paused by bounce rule)" : "")],
    ["Created", fmt(campaign.created_at)],
    ["Finished", fmt(campaign.finished_at)],
    ["Report generated", fmt(new Date())],
  ];
  if (campaign.pause_reason) sum.push(["Pause reason", campaign.pause_reason]);
  sum.push([], ["RESULT", "Count", "Share of attempted"]);
  const pct = (n) => stats.attempted > 0 ? `${Math.round((n / stats.attempted) * 1000) / 10}%` : "";
  sum.push(["Total recipients", stats.total, ""]);
  sum.push(["Attempted (processed)", stats.attempted, ""]);
  for (const key of ["opened", "delivered", "complained", "likely_delivered", "awaiting", "unverified", "rejected", "bounced", "failed"]) {
    if (stats.by[key] > 0 || !["delivered", "complained"].includes(key)) sum.push([DELIVERY[key].label, stats.by[key], pct(stats.by[key])]);
  }
  sum.push(["Not sent yet", stats.by.pending, ""]);
  if (stats.skipped > 0) sum.push(["Skipped — already unsubscribed (not part of the send)", stats.skipped, ""]);
  const disabledRows = rows.filter(r => ["bounced", "rejected", "failed"].includes(r.delivery) &&
    isMailboxDisabled({ reason: r.bounce_reason, code: r.bounce_code, detail: `${r.bounce_detail || ""} ${r.error || ""}` }));
  sum.push(["…of the bounces: mailbox disabled / discontinued", disabledRows.length, pct(disabledRows.length)]);
  sum.push([], ["Bounce rate", `${stats.bounce_rate}%`], ["Open rate (of delivered-or-unknown)", `${stats.open_rate}%`]);

  sum.push([], ["BOUNCE CHECK (is each sending mailbox being monitored?)", "Status", "Last checked"]);
  if (monitoring.length === 0) sum.push(["(no emails sent yet)", "", ""]);
  monitoring.forEach(m => sum.push([m.sender, m.ok ? "Monitored" : (m.error || "Not checked yet"), fmt(m.last_scan_at)]));

  sum.push([], ["HOW TO READ THIS REPORT"],
    ["Delivered — confirmed by mail server", "Amazon SES told us the recipient's server accepted the message (needs SES events enabled in Settings). Reliable, but still not proof of Inbox vs Spam."],
    ["Delivered — opened", "The recipient's mail app loaded our tracking pixel. This is the only hard proof the message reached an inbox and was displayed."],
    ["Likely delivered", "Their server accepted it, and after waiting we checked your sending mailbox and found no bounce notice. Strong sign it was delivered, but not proof — it could still have gone to Spam."],
    ["Accepted — waiting", "Their server accepted it; it is too soon after sending to expect a bounce notice yet. Download again later."],
    ["Accepted — bounce check unavailable", "Their server accepted it, but we cannot read this sender's mailbox (e.g. SendGrid/Mailgun/SES, or IMAP login failed), so a later bounce would not be seen."],
    ["Rejected / Bounced", "The address does not exist, is disabled, the mailbox is full, or the server blocked the message. See the Bounced & Failed sheet for the reason."],
    ["Note", "Images are often blocked by mail apps, so some real inboxes never register an 'open'. Absence of an open does not mean non-delivery."]);

  const wsSum = XLSX.utils.aoa_to_sheet(sum);
  wsSum["!cols"] = [{ wch: 46 }, { wch: 34 }, { wch: 22 }];

  // ── All recipients ──
  const head = ["#", "Email", "Domain", "Delivery status", "Sent from", "Subject", "Sent at", "Opened", "Times opened", "First opened", "Last opened",
    "Bounce type", "Bounce reason", "Bounce code", "Bounce detail (server message)", "Bounced at", "Error", "Unsubscribed"];
  const line = (r, i) => [i + 1, r.email, domainOf(r.email), DELIVERY[r.delivery].label, r.from_addr || "", r.subject || "", fmt(r.sent_at),
    r.open_count > 0 ? "Yes" : "No", r.open_count, fmt(r.first_opened_at), fmt(r.last_opened_at),
    r.bounce_type || "", r.bounce_reason || "", r.bounce_code || "", r.bounce_detail || "", fmt(r.bounced_at), r.bounce_type ? "" : (r.error || ""), r.unsubscribed ? "Yes" : ""];
  const widths = [{ wch: 5 }, { wch: 34 }, { wch: 22 }, { wch: 38 }, { wch: 28 }, { wch: 34 }, { wch: 19 }, { wch: 8 }, { wch: 8 }, { wch: 19 }, { wch: 19 },
    { wch: 10 }, { wch: 34 }, { wch: 10 }, { wch: 60 }, { wch: 19 }, { wch: 50 }, { wch: 13 }];
  const wsAll = XLSX.utils.aoa_to_sheet([head, ...rows.map(line)]); wsAll["!cols"] = widths;

  const bad = rows.filter(r => ["bounced", "rejected", "failed"].includes(r.delivery));
  const wsBad = XLSX.utils.aoa_to_sheet([head, ...bad.map(line)]); wsBad["!cols"] = widths;

  // ── Mailbox Disabled: the account exists but is switched off / abandoned ──
  // (detected from the bounce code and the receiving server's own wording, so it
  //  also works for campaigns sent before this sheet existed)
  const disHead = ["#", "Email", "Domain", "Sent from", "Bounce code", "Bounce reason", "Server message", "Bounced at"];
  const disLines = disabledRows.map((r, i) => [i + 1, r.email, domainOf(r.email), r.from_addr || "", r.bounce_code || "",
    r.bounce_reason || DISABLED_REASON, String(r.bounce_detail || r.error || "").slice(0, 300), fmt(r.bounced_at)]);
  const wsDis = XLSX.utils.aoa_to_sheet(disLines.length ? [disHead, ...disLines] : [disHead, ["", "No mailbox-disabled bounces in this campaign."]]);
  wsDis["!cols"] = [{ wch: 5 }, { wch: 34 }, { wch: 22 }, { wch: 30 }, { wch: 11 }, { wch: 34 }, { wch: 70 }, { wch: 19 }];

  // ── By domain / by sender ──
  const sumHead = (first) => [first, "Attempted", "Delivered (opened + likely)", "Opened", "Bounced", "Failed", "Unknown", "Bounce rate", "Bounce reasons"];
  const sumLine = (g) => [g.key, g.attempted, g.delivered, g.opened, g.bounced, g.failed, g.unknown,
    g.attempted ? `${Math.round((g.bounced / g.attempted) * 1000) / 10}%` : "",
    Object.entries(g.reasons).map(([k, v]) => `${k} ×${v}`).join("; ")];
  const wsDom = XLSX.utils.aoa_to_sheet([sumHead("Recipient domain"), ...groupSummary(rows, r => domainOf(r.email)).map(sumLine)]);
  wsDom["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 9 }, { wch: 8 }, { wch: 9 }, { wch: 11 }, { wch: 60 }];
  const wsSnd = XLSX.utils.aoa_to_sheet([sumHead("Sending account"), ...groupSummary(rows, r => (r.from_addr || "(unknown)").toLowerCase()).map(sumLine)]);
  wsSnd["!cols"] = wsDom["!cols"];

  // ── Emails by status: one column per outcome, emails listed underneath ──
  // "Sent Successfully" = accepted by the recipient's server and NOT bounced
  // (so opened emails appear there too, and again in the Opened column).
  const sentOk = rows.filter(r => ["opened", "delivered", "complained", "likely_delivered", "awaiting", "unverified"].includes(r.delivery));
  const cols = [
    { head: "Sent Successfully", list: sentOk.map(r => r.email) },
    { head: "Delivered (confirmed)", list: rows.filter(r => ["delivered", "opened", "complained"].includes(r.delivery)).map(r => r.email) },
    { head: "Opened",            list: rows.filter(r => r.delivery === "opened").map(r => r.email) },
    { head: "Bounced",           list: rows.filter(r => ["bounced", "rejected"].includes(r.delivery)).map(r => r.email) },
    { head: "Bounce Reason",     list: rows.filter(r => ["bounced", "rejected"].includes(r.delivery)).map(r => r.bounce_reason || "Unknown"), plain: true },
    { head: "Failed",            list: rows.filter(r => r.delivery === "failed").map(r => r.email) },
    { head: "Failure Reason",    list: rows.filter(r => r.delivery === "failed").map(r => String(r.error || "Unknown error").slice(0, 120)), plain: true },
  ];
  if (rows.some(r => r.unsubscribed)) cols.push({ head: "Unsubscribed", list: rows.filter(r => r.unsubscribed).map(r => r.email) });
  if (stats.by.complained > 0) cols.push({ head: "Spam Complaints", list: rows.filter(r => r.delivery === "complained").map(r => r.email) });
  if (stats.by.pending > 0) cols.push({ head: "Not Sent Yet", list: rows.filter(r => r.delivery === "pending").map(r => r.email) });
  const tall = Math.max(0, ...cols.map(c => c.list.length));
  const byStatusAoa = [cols.map(c => c.plain ? c.head : `${c.head} (${c.list.length})`)];
  for (let i = 0; i < tall; i++) byStatusAoa.push(cols.map(c => c.list[i] || ""));
  const wsBy = XLSX.utils.aoa_to_sheet(byStatusAoa);
  wsBy["!cols"] = cols.map(c => ({ wch: c.plain ? 32 : 36 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsBy, "Emails by Status");
  XLSX.utils.book_append_sheet(wb, wsSum, "Summary");
  XLSX.utils.book_append_sheet(wb, wsAll, "All Recipients");
  XLSX.utils.book_append_sheet(wb, wsBad, "Bounced & Failed");
  XLSX.utils.book_append_sheet(wb, wsDis, "Mailbox Disabled");
  XLSX.utils.book_append_sheet(wb, wsDom, "By Domain");
  XLSX.utils.book_append_sheet(wb, wsSnd, "By Sender");

  const safe = (campaign.name || `campaign-${campaign.id}`).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 50);
  return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), filename: `report-${safe}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}

module.exports = { DELIVERY, FILTERS, getStats, listRecipients, getMonitoring, buildReport, SETTLE_MINUTES };
