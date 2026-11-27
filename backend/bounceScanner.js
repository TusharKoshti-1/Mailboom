// ─── Bounce Scanner ───────────────────────────────────────────────────────────
// When a mail server accepts a message and only LATER discovers the address is
// dead, it sends a bounce notice ("Delivery Status Notification", from
// MAILER-DAEMON / postmaster) back to the sender's mailbox. SMTP alone can't
// see that, so this module logs into each sending mailbox over IMAP, finds
// those notices, matches each one to the exact recipient (via the Message-ID we
// put on every email) and records the bounce. Every recorded bounce is then
// handed to bounceGuard, which pauses the campaign if the bounces are
// consecutive.
//
// It also records, per mailbox, when it last scanned successfully — the report
// uses that to say honestly whether "no bounce" really means "no bounce seen".

const { ImapFlow }     = require("imapflow");
const { simpleParser } = require("mailparser");
const { pool }         = require("./db");
const { classifyBounce, deriveImapHost } = require("./mailUtils");
const bounceGuard      = require("./bounceGuard");

const SCAN_INTERVAL_SEC = Math.max(30, parseInt(process.env.BOUNCE_SCAN_INTERVAL_SEC, 10) || 90);
const WATCH_HOURS       = Math.max(1, parseInt(process.env.BOUNCE_WATCH_HOURS, 10) || 72);
const MAILBOX_TIMEOUT   = 90 * 1000;
const MAX_SOURCE_BYTES  = 5 * 1024 * 1024;

const UUID_AT_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/gi;
const BOUNCE_SUBJECT_RE = /undeliver|delivery status|delivery (has )?failed|delivery failure|returned mail|failure notice|mail delivery|not delivered|could not be delivered|bounce|delivery problem|message not delivered/i;
const BOUNCE_FROM_RE    = /mailer-daemon|mailerdaemon|postmaster|mail delivery|mail-daemon/i;

// ── DSN parsing ───────────────────────────────────────────────────────────────
function parseDeliveryStatus(text) {
  const out = [];
  const blocks = String(text || "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
  for (const block of blocks) {
    const fields = {};
    for (const line of block.replace(/\n[ \t]+/g, " ").split("\n")) {
      const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
      if (m) fields[m[1].toLowerCase()] = m[2].trim();
    }
    const rcptRaw = fields["final-recipient"] || fields["original-recipient"];
    if (!rcptRaw) continue;
    const recipient = rcptRaw.split(";").pop().replace(/[<>]/g, "").trim().toLowerCase();
    out.push({
      recipient,
      action: (fields["action"] || "").toLowerCase(),
      status: (fields["status"] || "").trim(),
      diagnostic: (fields["diagnostic-code"] || "").replace(/^[a-z]+;\s*/i, "").trim(),
    });
  }
  return out;
}

async function parseBounceMessage(source) {
  const parsed = await simpleParser(source);
  let statusText = "", originalText = "";
  for (const att of parsed.attachments || []) {
    const ct = String(att.contentType || "").toLowerCase();
    const body = att.content ? att.content.toString("utf8") : "";
    if (ct === "message/delivery-status") statusText += "\n\n" + body;
    else if (ct === "message/rfc822" || ct === "text/rfc822-headers") originalText += "\n" + body;
  }
  const bodyText = parsed.text || "";
  const haystack = [statusText, originalText, bodyText, String(parsed.inReplyTo || ""), [].concat(parsed.references || []).join(" ")].join("\n");

  const trackingIds = new Set();
  let m; UUID_AT_RE.lastIndex = 0;
  while ((m = UUID_AT_RE.exec(haystack)) !== null) trackingIds.add(m[1].toLowerCase());

  return {
    subject: parsed.subject || "",
    date: parsed.date && !isNaN(parsed.date) ? parsed.date : null,
    // mailparser may expose the delivery-status part as an attachment OR fold it into the text body; read both.
    entries: parseDeliveryStatus(statusText + "\n\n" + bodyText),
    trackingIds: [...trackingIds],
    bodyText,
  };
}

// ── Candidate filter (avoid downloading every normal email in the inbox) ──────
function looksLikeBounce(envelope, bodyStructure) {
  if (bodyStructure && /multipart\/report/i.test(bodyStructure.type || "")) return true;
  const from = (envelope && envelope.from || []).map(a => `${a.name || ""} ${a.address || ""}`).join(" ");
  if (BOUNCE_FROM_RE.test(from)) return true;
  return BOUNCE_SUBJECT_RE.test((envelope && envelope.subject) || "") && /daemon|postmaster|no-?reply|delivery/i.test(from);
}

// ── Recording a bounce ────────────────────────────────────────────────────────
async function recordBounce(rowId, entry, bodyText, when, source = "dsn") {
  const failed = entry ? (entry.action ? entry.action === "failed" : /^[45]/.test(entry.status)) : true;
  if (!failed) return null;
  const status = entry && entry.status;
  const permanent = status ? status.startsWith("5") : true;
  const text = entry && entry.diagnostic ? entry.diagnostic : String(bodyText || "").slice(0, 400);
  const c = classifyBounce({ code: status || null, text, permanent });
  const r = await pool.query(
    `UPDATE campaign_recipients
        SET bounce_type=$1, bounce_source=$7, bounce_code=$2, bounce_reason=$3, bounce_detail=$4, bounced_at=$5
      WHERE id=$6 AND bounce_type IS NULL
      RETURNING id, campaign_id, email, from_addr`,
    [c.type, c.code, c.reason, String(text).replace(/\s+/g, " ").slice(0, 400), when || new Date(), rowId, source]
  );
  return r.rows[0] || null;
}

// Matches one parsed bounce notice to recipient rows and records it.
async function applyBounce(parsedMsg, mb) {
  const campaignIds = [...mb.campaignIds];
  const touched = [];
  const failedEntries = parsedMsg.entries.filter(e => e.action ? e.action === "failed" : /^[45]/.test(e.status));
  const onlyDelayed = parsedMsg.entries.length > 0 && failedEntries.length === 0;
  if (onlyDelayed) return touched; // "still trying" notices are not bounces

  // 1) Exact match on the Message-ID we generated.
  if (parsedMsg.trackingIds.length > 0) {
    const rows = await pool.query(
      "SELECT id, email FROM campaign_recipients WHERE tracking_id = ANY($1) AND campaign_id = ANY($2) AND status='sent'",
      [parsedMsg.trackingIds, campaignIds]
    );
    for (const row of rows.rows) {
      const entry = failedEntries.find(e => e.recipient === row.email.toLowerCase()) || failedEntries[0] || null;
      const done = await recordBounce(row.id, entry, parsedMsg.bodyText, parsedMsg.date);
      if (done) touched.push(done);
    }
    if (rows.rows.length > 0) return touched;
  }

  // 2) Fallback: match by the failed recipient address named in the notice
  //    (some servers strip the original message). Newest unbounced send from
  //    this mailbox to that address.
  const addrs = new Set(failedEntries.map(e => e.recipient));
  if (addrs.size === 0 && !parsedMsg.entries.length && !/delay|warning|still trying|will (continue|retry)/i.test(parsedMsg.subject)) {
    // Non-standard notice with no machine-readable part: look for known recipients in the text.
    const found = String(parsedMsg.bodyText).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    found.forEach(a => addrs.add(a.toLowerCase()));
  }
  for (const addr of addrs) {
    const r = await pool.query(
      `SELECT id FROM campaign_recipients
        WHERE campaign_id = ANY($1) AND lower(email)=$2 AND lower(from_addr)=$3
          AND status='sent' AND bounce_type IS NULL
        ORDER BY sent_at DESC NULLS LAST LIMIT 1`,
      [campaignIds, addr, (mb.fromAddr || mb.username).toLowerCase()]
    );
    if (r.rows[0]) {
      const entry = failedEntries.find(e => e.recipient === addr) || null;
      const done = await recordBounce(r.rows[0].id, entry, parsedMsg.bodyText, parsedMsg.date);
      if (done) touched.push(done);
    }
  }
  return touched;
}

// ── Scan state ────────────────────────────────────────────────────────────────
async function getState(mb, folder) {
  const r = await pool.query("SELECT * FROM mailbox_scan_state WHERE username=$1 AND host=$2 AND folder=$3",
    [(mb.fromAddr || mb.username).toLowerCase(), mb.host.toLowerCase(), folder]);
  return r.rows[0] || null;
}
async function saveState(mb, folder, { uidValidity, lastUid, error, scanned }) {
  await pool.query(
    `INSERT INTO mailbox_scan_state (username, host, folder, uid_validity, last_uid, last_scan_at, last_error)
     VALUES ($1,$2,$3,$4,$5, $6, $7)
     ON CONFLICT (username, host, folder) DO UPDATE SET
       uid_validity = COALESCE(EXCLUDED.uid_validity, mailbox_scan_state.uid_validity),
       last_uid     = COALESCE(EXCLUDED.last_uid,     mailbox_scan_state.last_uid),
       last_scan_at = CASE WHEN $6::timestamp IS NULL THEN mailbox_scan_state.last_scan_at ELSE $6::timestamp END,
       last_error   = EXCLUDED.last_error`,
    [(mb.fromAddr || mb.username).toLowerCase(), mb.host.toLowerCase(), folder,
     uidValidity === undefined ? null : String(uidValidity),
     lastUid === undefined ? null : lastUid,
     scanned ? new Date() : null,
     error || null]
  );
}

// ── Which mailboxes need scanning ─────────────────────────────────────────────
async function collectMailboxes(onlyCampaignId) {
  let sql, params;
  if (onlyCampaignId) {
    sql = "SELECT * FROM campaigns WHERE id=$1"; params = [onlyCampaignId];
  } else {
    sql = `SELECT * FROM campaigns
            WHERE status IN ('running','paused')
               OR (finished_at IS NOT NULL AND finished_at > NOW() - make_interval(hours => $1))`;
    params = [WATCH_HOURS];
  }
  const camps = await pool.query(sql, params);

  const map = new Map();
  const add = (campaign, acc) => {
    const fromAddr = String(acc.from_email || acc.username || "").trim();
    const key = `${String(acc.host).toLowerCase()}|${String(acc.username).toLowerCase()}|${fromAddr.toLowerCase()}`;
    if (!map.has(key)) map.set(key, { host: acc.host, username: acc.username, fromAddr, password: acc.password, imapHost: acc.imap_host || campaign.imap_host || null, campaignIds: new Set(), since: campaign.created_at });
    const mb = map.get(key);
    mb.campaignIds.add(campaign.id);
    if (new Date(campaign.created_at) < new Date(mb.since)) mb.since = campaign.created_at;
  };
  for (const c of camps.rows) {
    if (c.sender_group_id) {
      const a = await pool.query("SELECT host, username, password, imap_host, from_email FROM sender_accounts WHERE group_id=$1", [c.sender_group_id]);
      a.rows.forEach(acc => add(c, acc));
    } else if (c.smtp_host && c.smtp_user) {
      add(c, { host: c.smtp_host, username: c.smtp_user, password: c.smtp_pass, imap_host: c.imap_host, from_email: c.from_email });
    }
  }
  return [...map.values()];
}

// ── Scanning one mailbox ──────────────────────────────────────────────────────
async function scanMailbox(mb, result) {
  const imapHost = deriveImapHost(mb.host, mb.imapHost);
  if (!imapHost) {
    await saveState(mb, "INBOX", { error: "Bounce check unavailable: Amazon SES and similar relays have no mailbox to read, so a bounce that arrives after sending cannot be seen. Rejections at send time are still reported." });
    return;
  }

  const client = new ImapFlow({
    host: imapHost, port: 993, secure: true,
    auth: { user: mb.username, pass: mb.password },
    logger: false, tls: { rejectUnauthorized: false },
    connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 60000,
  });
  client.on("error", () => {}); // surfaced through the awaited calls below

  const touched = [];
  try {
    await client.connect();

    const folders = ["INBOX"];
    try {
      const list = await client.list();
      const junk = list.find(m => m.specialUse === "\\Junk");
      if (junk && junk.path !== "INBOX") folders.push(junk.path);
    } catch {}

    const since = new Date(new Date(mb.since).getTime() - 24 * 3600 * 1000);

    for (const folder of folders) {
      const lock = await client.getMailboxLock(folder);
      try {
        const uidValidity = String(client.mailbox.uidValidity);
        const state = await getState(mb, folder);
        let lastUid = state && state.uid_validity === uidValidity ? Number(state.last_uid) || 0 : 0;

        const found = (await client.search({ since }, { uid: true })) || [];
        const fresh = found.filter(u => u > lastUid).sort((a, b) => a - b);

        for (let i = 0; i < fresh.length; i += 100) {
          const chunk = fresh.slice(i, i + 100);
          const candidates = [];
          for await (const msg of client.fetch(chunk.join(","), { uid: true, envelope: true, bodyStructure: true, size: true }, { uid: true })) {
            if (looksLikeBounce(msg.envelope, msg.bodyStructure) && (!msg.size || msg.size <= MAX_SOURCE_BYTES)) candidates.push(msg.uid);
          }
          for (const uid of candidates) {
            // One unreadable notice must never block the rest of the mailbox: log it and move on.
            try {
              const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
              if (!full || !full.source) continue;
              result.examined++;
              const parsedMsg = await parseBounceMessage(full.source);
              const rows = await applyBounce(parsedMsg, mb);
              touched.push(...rows);
            } catch (msgErr) {
              console.error(`📭 skipped one notice (uid ${uid}) in ${mb.username}: ${msgErr.message}`);
            }
          }
          lastUid = chunk[chunk.length - 1];
          await saveState(mb, folder, { uidValidity, lastUid, error: null, scanned: false });
        }
        await saveState(mb, folder, { uidValidity, lastUid, error: null, scanned: true });
      } finally { lock.release(); }
    }
  } catch (err) {
    const msg = /auth|login|credentials|invalid/i.test(err.message || "") || err.authenticationFailed
      ? `IMAP login failed for ${mb.username} (${imapHost}) — enable IMAP / check the password. ${err.responseText || err.message || ""}`
      : `IMAP error (${imapHost}): ${err.responseText || err.message}`;
    await saveState(mb, "INBOX", { error: msg.slice(0, 400) });
    result.errors.push(`${mb.username}: ${msg}`);
    console.error(`📭 bounce scan failed for ${mb.username}:`, msg);
  } finally {
    try { await client.logout(); } catch { try { client.close(); } catch {} }
  }

  // Feed every NEW bounce to the guard (one check per distinct campaign/domain/sender).
  const seen = new Set();
  for (const t of touched) {
    result.bounces++;
    const k = `${t.campaign_id}|${String(t.email).split("@").pop().toLowerCase()}|${String(t.from_addr).toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    try { await bounceGuard.evaluateAfterBounce(t.campaign_id, { email: t.email, from_addr: t.from_addr }); }
    catch (e) { console.error("bounce guard failed:", e.message); }
  }
}

// ── Orchestration (serialised: only one scan at a time) ───────────────────────
let chain = Promise.resolve();

function scan(onlyCampaignId) {
  const job = chain.then(async () => {
    const result = { mailboxes: 0, examined: 0, bounces: 0, errors: [] };
    const boxes = await collectMailboxes(onlyCampaignId);
    for (const mb of boxes) {
      result.mailboxes++;
      await Promise.race([
        scanMailbox(mb, result),
        new Promise(resolve => setTimeout(() => { result.errors.push(`${mb.username}: scan timed out`); resolve(); }, MAILBOX_TIMEOUT)),
      ]);
    }
    return result;
  });
  chain = job.catch(() => {});
  return job;
}

function start() {
  setTimeout(() => scan().catch(e => console.error("bounce scan error:", e.message)), 20 * 1000);
  setInterval(() => scan().catch(e => console.error("bounce scan error:", e.message)), SCAN_INTERVAL_SEC * 1000);
  console.log(`📭 Bounce scanner on — every ${SCAN_INTERVAL_SEC}s, watching campaigns for ${WATCH_HOURS}h after they finish.`);
}

module.exports = { start, scan, recordBounce, parseBounceMessage, parseDeliveryStatus, looksLikeBounce, applyBounce, WATCH_HOURS };
