// ─── Background Email Verifier ─────────────────────────────────────────────
// Processes an uploaded batch of email addresses inside the server process,
// independent of any HTTP request — mirrors campaignRunner.js so a large
// batch keeps verifying after the browser is closed.
//
// What "verified" means here: this checks address SYNTAX and whether the
// domain actually has a mail server willing to accept mail (an MX/A record
// lookup), plus a couple of cheap heuristics (disposable domains, role
// addresses like info@/admin@). It does NOT open an SMTP connection and ask
// the receiving server "does this exact mailbox exist" (a RCPT TO probe) —
// that step is slow, frequently blocked by hosts/ISPs, and many mail
// servers (Gmail, Outlook, etc.) refuse to answer it honestly on purpose.
// So results are best read as "safe to send to" vs "will definitely bounce",
// not a 100% guarantee every valid-looking mailbox is currently active.

const dns = require("dns").promises;
const { pool } = require("./db");

const controls = new Map(); // batchId -> { stop, pause }
const active   = new Set();

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const ROLE_LOCALPARTS = new Set([
  "admin","administrator","info","support","sales","contact","help",
  "webmaster","postmaster","noreply","no-reply","donotreply","marketing",
  "office","billing","hr","jobs","careers","abuse","root","hostmaster",
  "enquiries","inquiries","press","media","newsletter","team","service",
]);

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","guerrillamail.com","10minutemail.com","tempmail.com",
  "temp-mail.org","throwawaymail.com","yopmail.com","trashmail.com",
  "fakeinbox.com","getnada.com","sharklasers.com","dispostable.com",
  "maildrop.cc","mintemail.com","moakt.com","mailnesia.com","mailcatch.com",
  "spamgourmet.com","33mail.com","emailondeck.com","tempinbox.com",
  "mohmal.com","fakemailgenerator.com","inboxbear.com","luxusmail.org",
  "guerrillamailblock.com","mailnull.com","spam4.me","tempr.email",
]);

// Cache MX/A lookups per domain for the lifetime of the process — most lists
// have wildly repeated domains (gmail.com, yahoo.com...) so this avoids
// thousands of redundant DNS round trips.
const domainCache = new Map(); // domain -> { ok: bool, t: number }
const CACHE_TTL_MS = 15 * 60 * 1000;

async function domainAcceptsMail(domain) {
  const cached = domainCache.get(domain);
  if (cached && Date.now() - cached.t < CACHE_TTL_MS) return cached.ok;
  let ok = false;
  try {
    const mx = await dns.resolveMx(domain);
    ok = Array.isArray(mx) && mx.length > 0;
  } catch {
    // No MX — some domains still accept mail via an A/AAAA record fallback
    // per RFC 5321, so give them a chance before calling the domain dead.
    try {
      await dns.resolve4(domain);
      ok = true;
    } catch {
      try { await dns.resolve6(domain); ok = true; } catch { ok = false; }
    }
  }
  domainCache.set(domain, { ok, t: Date.now() });
  return ok;
}

async function verifyOne(rawEmail) {
  const email = String(rawEmail).trim();
  if (!EMAIL_RE.test(email)) {
    return { status: "invalid", reason: "Invalid email format" };
  }
  const [localPartRaw, domainRaw] = email.split("@");
  const domain = domainRaw.toLowerCase();
  const localPart = localPartRaw.toLowerCase();

  const mailable = await domainAcceptsMail(domain);
  if (!mailable) {
    return { status: "invalid", reason: "Domain has no mail server (no MX/A record found)" };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { status: "risky", reason: "Disposable / temporary email domain" };
  }
  if (ROLE_LOCALPARTS.has(localPart)) {
    return { status: "risky", reason: "Role-based address (e.g. info@, admin@) — often not a real inbox" };
  }
  return { status: "valid", reason: "Valid format, domain accepts mail" };
}

function signalPause(batchId) {
  const ctrl = controls.get(Number(batchId));
  if (ctrl) ctrl.pause = true;
}

function signalStop(batchId) {
  const ctrl = controls.get(Number(batchId));
  if (ctrl) ctrl.stop = true;
}

function startVerification(batchId) {
  batchId = Number(batchId);
  if (active.has(batchId)) return;
  active.add(batchId);
  controls.set(batchId, { stop: false, pause: false });
  runLoop(batchId)
    .catch(err => console.error(`Verify batch ${batchId} crashed:`, err.message))
    .finally(() => { active.delete(batchId); controls.delete(batchId); });
}

const CHUNK = 25; // concurrent DNS lookups per round — DNS-bound, not send-bound, so no delay is needed

async function runLoop(batchId) {
  const bRes = await pool.query("SELECT * FROM verify_batches WHERE id=$1", [batchId]);
  const b = bRes.rows[0];
  if (!b || b.status !== "running") return;

  while (true) {
    const ctrl = controls.get(batchId);
    if (!ctrl || ctrl.stop || ctrl.pause) break;

    const live = await pool.query("SELECT status FROM verify_batches WHERE id=$1", [batchId]);
    if (live.rows.length === 0 || live.rows[0].status !== "running") break;

    const pending = await pool.query(
      "SELECT id, email FROM verify_results WHERE batch_id=$1 AND status='pending' ORDER BY idx ASC, id ASC LIMIT $2",
      [batchId, CHUNK]
    );
    if (pending.rows.length === 0) {
      await pool.query(
        "UPDATE verify_batches SET status='completed', finished_at=NOW() WHERE id=$1 AND status='running'",
        [batchId]
      );
      break;
    }

    const results = await Promise.all(
      pending.rows.map(async row => {
        try {
          const r = await verifyOne(row.email);
          return { id: row.id, ...r };
        } catch (err) {
          return { id: row.id, status: "invalid", reason: `Verification error: ${err.message}` };
        }
      })
    );

    let dValid = 0, dInvalid = 0, dRisky = 0;
    for (const r of results) {
      await pool.query(
        "UPDATE verify_results SET status=$1, reason=$2, checked_at=NOW() WHERE id=$3",
        [r.status, r.reason, r.id]
      );
      if (r.status === "valid") dValid++;
      else if (r.status === "invalid") dInvalid++;
      else if (r.status === "risky") dRisky++;
    }

    await pool.query(
      `UPDATE verify_batches
       SET checked=checked+$1, valid_count=valid_count+$2, invalid_count=invalid_count+$3, risky_count=risky_count+$4
       WHERE id=$5`,
      [results.length, dValid, dInvalid, dRisky, batchId]
    );
  }
}

// On server startup, resume every batch left in the 'running' state.
async function resumeAll() {
  try {
    const r = await pool.query("SELECT id FROM verify_batches WHERE status='running'");
    r.rows.forEach(row => startVerification(row.id));
    if (r.rows.length > 0) console.log(`▶ Resumed ${r.rows.length} email-verification batch(es).`);
  } catch (err) {
    console.error("verifier resumeAll failed:", err.message);
  }
}

module.exports = { startVerification, signalPause, signalStop, resumeAll };
