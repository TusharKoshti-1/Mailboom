// ─── Unsubscribe support ──────────────────────────────────────────────────────
// Signed links (so nobody can unsubscribe an address they weren't mailed at),
// plus helpers for the per-user suppression list.

const crypto = require("crypto");
const { pool } = require("./db");

const SECRET = (process.env.JWT_SECRET || "mailblast_secret_change_in_production") + ":unsubscribe";

const sig = (payload) => crypto.createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 24);

function makeToken(userId, campaignId, email) {
  const p = Buffer.from(`${userId}|${campaignId || 0}|${email}`).toString("base64url");
  return `${p}.${sig(p)}`;
}

// Returns { userId, campaignId, email } or null when the token is forged/damaged.
function readToken(token) {
  const [p, s] = String(token || "").split(".");
  if (!p || !s) return null;
  const expected = sig(p);
  if (s.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
  const parts = Buffer.from(p, "base64url").toString("utf8").split("|");
  const userId = parseInt(parts[0], 10), campaignId = parseInt(parts[1], 10) || null;
  const email = parts.slice(2).join("|").trim().toLowerCase();
  if (!userId || !email.includes("@")) return null;
  return { userId, campaignId, email };
}

function unsubscribeUrl(baseUrl, userId, campaignId, email) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/unsubscribe/${makeToken(userId, campaignId, email)}`;
}

async function isUnsubscribed(userId, email) {
  const r = await pool.query("SELECT 1 FROM unsubscribes WHERE user_id=$1 AND email=$2", [userId, String(email).trim().toLowerCase()]);
  return r.rows.length > 0;
}

// Idempotent. Returns true when a NEW row was added.
async function addUnsubscribe(userId, email, { source = "manual", campaignId = null, note = null } = {}) {
  const r = await pool.query(
    `INSERT INTO unsubscribes (user_id, email, source, campaign_id, note) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, email) DO NOTHING RETURNING id`,
    [userId, String(email).trim().toLowerCase(), source, campaignId, note]
  );
  return r.rows.length > 0;
}

// Footer appended to every email when the campaign has unsubscribe turned on.
function footer(url) {
  return {
    html: `<div style="margin:28px 0 0 0;padding-top:12px;border-top:1px solid #e5e5e5;font-size:12px;line-height:1.5;color:#8a8a8a;font-family:Arial,Helvetica,sans-serif">If you no longer wish to receive these emails, you can <a href="${url}" style="color:#8a8a8a;text-decoration:underline">unsubscribe here</a>.</div>`,
    text: `\n\n--\nIf you no longer wish to receive these emails, unsubscribe here: ${url}`,
  };
}

module.exports = { makeToken, readToken, unsubscribeUrl, isUnsubscribed, addUnsubscribe, footer };
