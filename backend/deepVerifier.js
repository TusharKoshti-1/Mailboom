// ─── Background Deep-Check Runner ──────────────────────────────────────────
// Drives the SMTP-level probe (smtpProbe.js) across every 'valid' row in a
// verification batch, same background-process pattern as campaignRunner.js
// and emailVerifier.js so a large batch keeps going after the browser closes.

const { pool } = require("./db");
const { deepCheckDomain } = require("./smtpProbe");

const controls = new Map(); // batchId -> { stop, pause }
const active   = new Set();

function signalPause(batchId) { const c = controls.get(Number(batchId)); if (c) c.pause = true; }
function signalStop(batchId)  { const c = controls.get(Number(batchId)); if (c) c.stop  = true; }

function startDeepCheck(batchId) {
  batchId = Number(batchId);
  if (active.has(batchId)) return;
  active.add(batchId);
  controls.set(batchId, { stop: false, pause: false });
  runLoop(batchId)
    .catch(err => console.error(`Deep-check batch ${batchId} crashed:`, err.message))
    .finally(() => { active.delete(batchId); controls.delete(batchId); });
}

const DOMAIN_CONCURRENCY   = 3;  // simultaneous SMTP connections — kept low to be a polite sender
const ROWS_PER_ROUND       = 90; // pulled per round, then grouped by domain and split across workers

async function runLoop(batchId) {
  const bRes = await pool.query("SELECT * FROM verify_batches WHERE id=$1", [batchId]);
  const b = bRes.rows[0];
  if (!b || b.deep_status !== "running") return;

  while (true) {
    const ctrl = controls.get(batchId);
    if (!ctrl || ctrl.stop || ctrl.pause) break;

    const live = await pool.query("SELECT deep_status FROM verify_batches WHERE id=$1", [batchId]);
    if (live.rows.length === 0 || live.rows[0].deep_status !== "running") break;

    const rows = await pool.query(
      "SELECT id, email FROM verify_results WHERE batch_id=$1 AND status='valid' AND smtp_status='unchecked' ORDER BY idx ASC, id ASC LIMIT $2",
      [batchId, ROWS_PER_ROUND]
    );
    if (rows.rows.length === 0) {
      await pool.query(
        "UPDATE verify_batches SET deep_status='completed' WHERE id=$1 AND deep_status='running'",
        [batchId]
      );
      break;
    }

    const byDomain = new Map();
    rows.rows.forEach(r => {
      const domain = r.email.split("@")[1].toLowerCase();
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain).push(r);
    });
    const domainEntries = [...byDomain.entries()];

    let cursor = 0;
    async function worker() {
      while (cursor < domainEntries.length) {
        const ctrl2 = controls.get(batchId);
        if (!ctrl2 || ctrl2.stop || ctrl2.pause) return;

        const [domain, domainRows] = domainEntries[cursor++];
        let resultMap;
        try {
          resultMap = await deepCheckDomain(domain, domainRows.map(r => r.email));
        } catch (err) {
          resultMap = new Map(domainRows.map(r => [r.email, { status: "unknown", reason: `Deep check error: ${err.message}` }]));
        }

        let dDel = 0, dUndel = 0, dUnk = 0;
        for (const row of domainRows) {
          const res = resultMap.get(row.email) || { status: "unknown", reason: "No response" };
          await pool.query(
            "UPDATE verify_results SET smtp_status=$1, smtp_reason=$2 WHERE id=$3",
            [res.status, (res.reason || "").slice(0, 200), row.id]
          );
          if (res.status === "deliverable") dDel++;
          else if (res.status === "undeliverable") dUndel++;
          else dUnk++;
        }
        await pool.query(
          `UPDATE verify_batches
           SET deep_checked=deep_checked+$1, deep_deliverable=deep_deliverable+$2,
               deep_undeliverable=deep_undeliverable+$3, deep_unknown=deep_unknown+$4
           WHERE id=$5`,
          [domainRows.length, dDel, dUndel, dUnk, batchId]
        );
      }
    }

    await Promise.all(Array.from({ length: DOMAIN_CONCURRENCY }, worker));
  }
}

// On server startup, resume every batch left mid deep-check.
async function resumeAll() {
  try {
    const r = await pool.query("SELECT id FROM verify_batches WHERE deep_status='running'");
    r.rows.forEach(row => startDeepCheck(row.id));
    if (r.rows.length > 0) console.log(`▶ Resumed ${r.rows.length} deep-check batch(es).`);
  } catch (err) {
    console.error("deepVerifier resumeAll failed:", err.message);
  }
}

module.exports = { startDeepCheck, signalPause, signalStop, resumeAll };
