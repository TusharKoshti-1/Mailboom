// ─── SMTP Deep Check ─────────────────────────────────────────────────────────
// Opens a real SMTP connection to a domain's mail server and asks
// "RCPT TO:<address>" — the same handshake a real mail server does right
// before delivery — WITHOUT ever sending DATA/QUIT-with-a-message, so no
// mail is actually sent. This is how paid verification services (ZeroBounce,
// NeverBounce, etc.) get closer to "does this mailbox exist" than a plain
// MX-record check can.
//
// Important limits, by design of the protocol and of the internet itself:
// - Outbound port 25 is blocked by default on most cloud/VPS hosts (AWS,
//   GCP, DigitalOcean, Render, Railway, Heroku...) specifically to fight
//   spam. If that's the case here, every probe below will time out or
//   refuse to connect, and results will come back "unknown" — that's
//   expected, not a bug in this code.
// - Many providers (Gmail, Outlook, Yahoo) accept RCPT TO for any address
//   ("catch-all") and only decide whether the mailbox is real later,
//   silently. We detect this by probing one random, definitely-fake address
//   on the same domain first — if the server accepts THAT too, we can't
//   trust a "yes" for the real address either, and mark it "unknown".
// - Greylisting (temporary 4xx rejection) is common and doesn't mean the
//   address is bad — it's reported as "unknown", not "undeliverable".

const net = require("net");
const dns = require("dns").promises;

const CONNECT_TIMEOUT_MS  = 8000;
const RESPONSE_TIMEOUT_MS = 8000;
const HELO_DOMAIN = process.env.SMTP_PROBE_HELO || "verify.local";
const PROBE_FROM  = process.env.SMTP_PROBE_FROM  || `postmaster@${HELO_DOMAIN}`;

function readResponse(socket) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r\n/).filter(Boolean);
      const last  = lines[lines.length - 1];
      // A final SMTP response line has a space (not a dash) after the code,
      // e.g. "250 OK" vs "250-more coming".
      if (last && /^\d{3}[ ]/.test(last)) {
        cleanup();
        resolve({ code: parseInt(last.slice(0, 3), 10), text: buf.trim() });
      }
    };
    const onErr = (err) => { cleanup(); reject(err); };
    const onClose = () => { cleanup(); reject(new Error("Connection closed")); };
    function cleanup() {
      socket.removeListener("data", onData);
      socket.removeListener("error", onErr);
      socket.removeListener("close", onClose);
      clearTimeout(timer);
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error("SMTP response timeout")); }, RESPONSE_TIMEOUT_MS);
    socket.on("data", onData);
    socket.once("error", onErr);
    socket.once("close", onClose);
  });
}

function sendCmd(socket, cmd) {
  return new Promise((resolve, reject) => {
    socket.write(cmd + "\r\n", err => err ? reject(err) : resolve());
  });
}

async function connectAndGreet(host) {
  const socket = net.createConnection({ host, port: 25 });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => { socket.destroy(); reject(new Error("Connection timeout (port 25 may be blocked)")); }, CONNECT_TIMEOUT_MS);
    socket.once("connect", () => { clearTimeout(t); resolve(); });
    socket.once("error", err => { clearTimeout(t); reject(err); });
  });
  const greet = await readResponse(socket);
  if (greet.code !== 220) { socket.destroy(); throw new Error(`Unexpected greeting (${greet.code})`); }
  return socket;
}

async function rcptCheck(socket, address) {
  await sendCmd(socket, `MAIL FROM:<${PROBE_FROM}>`);
  const mailResp = await readResponse(socket);
  if (mailResp.code >= 400) return { code: mailResp.code, text: mailResp.text };
  await sendCmd(socket, `RCPT TO:<${address}>`);
  const rcptResp = await readResponse(socket);
  await sendCmd(socket, "RSET").catch(() => {});
  await readResponse(socket).catch(() => {});
  return { code: rcptResp.code, text: rcptResp.text };
}

function classify(code) {
  if (code >= 200 && code < 300) return "deliverable";
  if ([421, 450, 451, 452].includes(code)) return "unknown"; // temporary / greylisted — not proof of a bad address
  if (code >= 500 && code < 600) return "undeliverable";
  return "unknown";
}

// Probes every address on ONE domain over a single reused connection.
// Returns Map(email -> { status, reason }).
async function deepCheckDomain(domain, addresses) {
  const results = new Map();

  let mxHost;
  try {
    const mx = await dns.resolveMx(domain);
    mxHost = mx.sort((a, b) => a.priority - b.priority)[0]?.exchange;
  } catch { /* fall through to A-record attempt below */ }
  if (!mxHost) mxHost = domain;

  let socket;
  try {
    socket = await connectAndGreet(mxHost);
    await sendCmd(socket, `EHLO ${HELO_DOMAIN}`);
    await readResponse(socket);
  } catch (err) {
    addresses.forEach(a => results.set(a, { status: "unknown", reason: `Could not reach mail server: ${err.message}` }));
    try { socket?.destroy(); } catch {}
    return results;
  }

  // Catch-all detection: a random address that certainly doesn't exist.
  let catchAll = false;
  try {
    const probe = `nonexistent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${domain}`;
    const r = await rcptCheck(socket, probe);
    catchAll = classify(r.code) === "deliverable";
  } catch { /* if the probe itself fails, just proceed without catch-all info */ }

  for (const addr of addresses) {
    try {
      const r = await rcptCheck(socket, addr);
      const status = classify(r.code);
      if (status === "deliverable" && catchAll) {
        results.set(addr, { status: "unknown", reason: "Domain accepts all addresses (catch-all) — can't confirm this specific mailbox" });
      } else {
        results.set(addr, { status, reason: r.text.split("\n").pop() });
      }
    } catch (err) {
      results.set(addr, { status: "unknown", reason: `Probe failed: ${err.message}` });
    }
  }

  try { await sendCmd(socket, "QUIT"); } catch {}
  try { socket.destroy(); } catch {}
  return results;
}

module.exports = { deepCheckDomain };
