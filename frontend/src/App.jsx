import { useState, useRef, useEffect } from "react";
import {
  Zap, Settings2, Mail, Paperclip, Send, Wifi, Eye, EyeOff,
  ChevronDown, ChevronUp, X, Upload, Loader2, CheckCircle,
  AlertCircle, Terminal, RefreshCw,
} from "lucide-react";

// ─── FOCUS HANDLERS ───────────────────────────────────────────────────────────
const onFocus = e => e.target.style.borderColor = "var(--accent)";
const onBlur  = e => e.target.style.borderColor = "var(--border)";

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const S = {
  label: {
    display: "block", fontSize: 11, fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase",
    color: "var(--text3)", marginBottom: 6,
  },
  input: {
    width: "100%", padding: "9px 12px", background: "var(--surface2)",
    border: "1px solid var(--border)", borderRadius: "var(--radius)",
    color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 13,
    outline: "none", transition: "border-color 0.15s", boxSizing: "border-box",
  },
  textarea: {
    width: "100%", padding: "10px 12px", background: "var(--surface2)",
    border: "1px solid var(--border)", borderRadius: "var(--radius)",
    color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 13,
    outline: "none", resize: "vertical", lineHeight: 1.65,
    transition: "border-color 0.15s", boxSizing: "border-box",
  },
  btnPrimary: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "11px 24px", background: "var(--accent)", color: "var(--bg)",
    border: "none", borderRadius: "var(--radius)", cursor: "pointer",
    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14,
    transition: "all 0.15s", whiteSpace: "nowrap",
  },
  btnSecondary: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "9px 16px", background: "transparent", color: "var(--text2)",
    border: "1px solid var(--border2)", borderRadius: "var(--radius)",
    cursor: "pointer", fontFamily: "var(--font-display)",
    fontWeight: 500, fontSize: 13, transition: "all 0.15s",
  },
  chip: {
    display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px",
    borderRadius: 100, fontSize: 11, fontWeight: 500, fontFamily: "var(--font-mono)",
  },
  divider: { height: 1, background: "var(--border)", margin: "14px 0" },
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      {label && <label style={S.label}>{label}</label>}
      {children}
    </div>
  );
}

function TextInput({ label, type = "text", value, onChange, placeholder, mono = true, style }) {
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <Field label={label}>
      <div style={{ position: "relative" }}>
        <input
          type={isPass && !show ? "password" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...S.input, fontFamily: mono ? "var(--font-mono)" : "var(--font-display)", paddingRight: isPass ? 36 : 12, ...style }}
          onFocus={onFocus} onBlur={onBlur}
        />
        {isPass && (
          <button type="button" onClick={() => setShow(s => !s)}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 2 }}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </Field>
  );
}

function Section({ title, icon: Icon, iconColor = "var(--accent)", children, defaultOpen = true, right }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", cursor: "pointer", userSelect: "none", borderBottom: open ? "1px solid var(--border)" : "none" }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
          {Icon && <Icon size={14} color={iconColor} />}
          {title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {right}
          {open ? <ChevronUp size={13} color="var(--text3)" /> : <ChevronDown size={13} color="var(--text3)" />}
        </div>
      </div>
      {open && <div style={{ padding: "16px 18px" }}>{children}</div>}
    </div>
  );
}

function LogLine({ log }) {
  const colors = { success: "var(--green)", error: "var(--red)", info: "var(--text2)", warn: "var(--amber)" };
  return (
    <div style={{ display: "flex", gap: 10, padding: "3px 18px", lineHeight: 1.5, color: colors[log.level] || "var(--text2)" }}>
      <span style={{ color: "var(--text3)", flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 11 }}>{log.time}</span>
      <span style={{ wordBreak: "break-all" }}>{log.msg}</span>
    </div>
  );
}

function FileChip({ file, onRemove }) {
  const icon = file.type.startsWith("image") ? "🖼" : file.type === "application/pdf" ? "📄" : file.type.startsWith("video") ? "🎥" : "📎";
  const size = file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)}MB` : `${Math.round(file.size / 1024)}KB`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 6 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
        <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--font-mono)" }}>{size}</div>
      </div>
      <button onClick={() => onRemove(file)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 3 }}
        onMouseEnter={e => e.currentTarget.style.color = "var(--red)"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--text3)"}>
        <X size={13} />
      </button>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // SMTP
  const [smtp, setSmtp] = useState({ host: "smtp.gmail.com", port: "465", user: "", pass: "" });
  const setS = k => v => setSmtp(s => ({ ...s, [k]: v }));

  // Sender
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");

  // Compose
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isHtml, setIsHtml] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef();

  // State
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const logEndRef = useRef();

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const addLog = (level, msg) =>
    setLogs(p => [...p, { level, msg, time: new Date().toLocaleTimeString("en-US", { hour12: false }) }]);

  // ── Test connection ──────────────────────────────────────────────────────────
  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtpHost: smtp.host, smtpPort: smtp.port, smtpUser: smtp.user, smtpPass: smtp.pass }),
      });
      const data = await res.json();
      setTestResult(data);
      addLog(data.ok ? "success" : "error", data.ok ? `✅ ${data.message}` : `❌ ${data.message}`);
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
      addLog("error", `❌ ${err.message}`);
    }
    setTesting(false);
  };

  // ── Send email ───────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!smtp.user || !smtp.pass) return addLog("error", "❌ Fill in your SMTP credentials first.");
    if (!fromEmail) return addLog("error", "❌ Enter a From email address.");
    if (!to)        return addLog("error", "❌ Enter a recipient (To) address.");
    if (!subject)   return addLog("error", "❌ Enter a subject line.");
    if (!body)      return addLog("error", "❌ Write a message body.");

    setSending(true); setSendResult(null);
    addLog("info", `📤 Sending to ${to}...`);

    const fd = new FormData();
    fd.append("smtpHost", smtp.host);
    fd.append("smtpPort", smtp.port);
    fd.append("smtpUser", smtp.user);
    fd.append("smtpPass", smtp.pass);
    fd.append("fromName", fromName);
    fd.append("fromEmail", fromEmail);
    fd.append("to", to);
    fd.append("subject", subject);
    fd.append("body", body);
    fd.append("isHtml", isHtml);
    attachments.forEach(f => fd.append("attachments", f));

    try {
      const res = await fetch("/api/send", { method: "POST", body: fd });
      const data = await res.json();
      setSendResult(data);
      if (data.ok) {
        addLog("success", `✅ ${data.message}`);
        // Clear compose on success
        setTo(""); setSubject(""); setBody(""); setAttachments([]);
      } else {
        addLog("error", `❌ ${data.message}`);
      }
    } catch (err) {
      addLog("error", `❌ Network error: ${err.message}`);
    }
    setSending(false);
  };

  // ── Attachments ──────────────────────────────────────────────────────────────
  const addFiles = files => {
    const ex = new Set(attachments.map(f => f.name + f.size));
    setAttachments(p => [...p, ...Array.from(files).filter(f => !ex.has(f.name + f.size))]);
  };

  const PRESETS = [
    { label: "Gmail",   host: "smtp.gmail.com",          port: "465" },
    { label: "Outlook", host: "smtp-mail.outlook.com",   port: "587" },
    { label: "Yahoo",   host: "smtp.mail.yahoo.com",     port: "465" },
    { label: "Custom",  host: "",                         port: "465" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-display)" }}>

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: "1px solid var(--border)", background: "rgba(8,11,15,0.97)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 20, letterSpacing: "-0.5px" }}>
          <div style={{ width: 32, height: 32, background: "var(--accent)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--bg)" }}>
            <Zap size={17} />
          </div>
          MailSend
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "2px 7px", background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 100, border: "1px solid rgba(0,229,255,0.3)", letterSpacing: "0.05em", marginLeft: 4 }}>
            v1
          </span>
        </div>

        {/* Status dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text3)", fontFamily: "var(--font-mono)" }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: testResult?.ok ? "var(--green)" : testResult?.ok === false ? "var(--red)" : "var(--text3)",
            boxShadow: testResult?.ok ? "0 0 8px var(--green)" : "none",
            transition: "all 0.3s",
          }} />
          {testResult?.ok ? "CONNECTED" : testResult?.ok === false ? "FAILED" : "NOT TESTED"}
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* ── Sidebar ── */}
        <div style={{ width: 300, borderRight: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>

          {/* SMTP Config */}
          <Section title="SMTP Configuration" icon={Settings2}>

            {/* Provider presets */}
            <Field label="Provider">
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {PRESETS.map(p => (
                  <button key={p.label}
                    onClick={() => setSmtp(s => ({ ...s, host: p.host, port: p.port }))}
                    style={{
                      padding: "5px 10px", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 500,
                      borderRadius: "var(--radius)", cursor: "pointer", transition: "all 0.15s",
                      background: smtp.host === p.host ? "var(--accent)" : "var(--surface3)",
                      color: smtp.host === p.host ? "var(--bg)" : "var(--text2)",
                      border: smtp.host === p.host ? "1px solid var(--accent)" : "1px solid var(--border)",
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>

            <TextInput label="SMTP Host" value={smtp.host} onChange={setS("host")} placeholder="smtp.gmail.com" />

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: "0 0 90px" }}>
                <TextInput label="Port" value={smtp.port} onChange={setS("port")} placeholder="465" />
              </div>
              <div style={{ flex: 1 }}>
                <TextInput label="Username" value={smtp.user} onChange={setS("user")} placeholder="you@gmail.com" />
              </div>
            </div>

            <TextInput label="Password / App Password" type="password" value={smtp.pass} onChange={setS("pass")} placeholder="••••••••••••••••" />

            <div style={S.divider} />
            <label style={S.label}>Sender Identity</label>
            <TextInput placeholder="Display Name (optional)" value={fromName} onChange={setFromName} mono={false} />
            <TextInput placeholder="from@yourdomain.com" value={fromEmail} onChange={setFromEmail} />

            {/* Test button */}
            <button onClick={handleTest} disabled={testing}
              style={{
                ...S.btnSecondary, width: "100%", marginTop: 4,
                borderColor: testResult?.ok ? "var(--green)" : testResult?.ok === false ? "var(--red)" : "var(--border2)",
                color: testResult?.ok ? "var(--green)" : testResult?.ok === false ? "var(--red)" : "var(--text2)",
              }}
              onMouseEnter={e => !testing && (e.currentTarget.style.borderColor = "var(--accent)")}
              onMouseLeave={e => !testing && (e.currentTarget.style.borderColor = testResult?.ok ? "var(--green)" : testResult?.ok === false ? "var(--red)" : "var(--border2)")}>
              {testing
                ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Testing...</>
                : <><Wifi size={13} /> Test Connection</>}
            </button>

            {testResult && (
              <div style={{ marginTop: 9, padding: "8px 11px", borderRadius: "var(--radius)", fontSize: 12, fontFamily: "var(--font-mono)", lineHeight: 1.5, background: testResult.ok ? "var(--green-dim)" : "var(--red-dim)", color: testResult.ok ? "var(--green)" : "var(--red)" }}>
                {testResult.message}
              </div>
            )}

            {/* Gmail help */}
            <div style={{ marginTop: 12, padding: "9px 11px", background: "rgba(255,183,3,0.08)", border: "1px solid rgba(255,183,3,0.2)", borderRadius: "var(--radius)", fontSize: 11, color: "var(--amber)", lineHeight: 1.6 }}>
              <strong>Gmail users:</strong> Use an <strong>App Password</strong>, not your regular password.<br />
              Google Account → Security → 2-Step Verification → App Passwords
            </div>
          </Section>

          {/* Attachments */}
          <Section title="Attachments" icon={Paperclip} iconColor="var(--green)"
            right={attachments.length > 0 && (
              <span style={{ ...S.chip, background: "var(--green-dim)", color: "var(--green)" }}>{attachments.length}</span>
            )}>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              style={{ border: "2px dashed var(--border2)", borderRadius: "var(--radius)", padding: "18px", textAlign: "center", cursor: "pointer", color: "var(--text3)", transition: "all 0.15s", marginBottom: attachments.length ? 10 : 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text3)"; }}>
              <Upload size={18} style={{ display: "block", margin: "0 auto 6px" }} />
              <div style={{ fontSize: 12 }}>Drop files or click to browse</div>
              <div style={{ fontSize: 10, marginTop: 3, color: "var(--text3)" }}>PDF, images, docs — max 25MB each</div>
            </div>
            <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
            {attachments.map(f => <FileChip key={f.name + f.size} file={f} onRemove={r => setAttachments(p => p.filter(x => x !== r))} />)}
          </Section>
        </div>

        {/* ── Compose + Log ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

          {/* Compose area */}
          <div style={{ padding: "22px 28px", borderBottom: "1px solid var(--border)", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <Mail size={16} color="var(--accent)" />
              <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>Compose Email</span>
            </div>

            <TextInput label="To" value={to} onChange={setTo} placeholder="recipient@example.com" />
            <TextInput label="Subject" value={subject} onChange={setSubject} placeholder="Enter subject..." mono={false} />

            <Field label="Message Body">
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={isHtml ? "<p>Hello,</p>\n<p>Your message here...</p>" : "Hello,\n\nYour message here...\n\nBest regards"}
                style={{ ...S.textarea, minHeight: 220 }}
                onFocus={onFocus} onBlur={onBlur}
              />
            </Field>

            {/* HTML toggle + format hint */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: -6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                <input type="checkbox" checked={isHtml} onChange={e => setIsHtml(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                <span style={{ fontSize: 12, color: "var(--text2)" }}>Send as HTML</span>
              </label>
              {isHtml && <span style={{ ...S.chip, background: "var(--accent-dim)", color: "var(--accent)" }}>HTML mode</span>}
            </div>
          </div>

          {/* Send bar */}
          <div style={{ padding: "13px 28px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center", background: "var(--surface)", flexShrink: 0 }}>
            <button
              onClick={handleSend}
              disabled={sending}
              style={{
                ...S.btnPrimary,
                opacity: sending ? 0.6 : 1,
                boxShadow: !sending ? "0 0 18px rgba(0,229,255,0.2)" : "none",
                minWidth: 140,
              }}>
              {sending
                ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Sending...</>
                : <><Send size={15} /> Send Email</>}
            </button>

            {sendResult && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: sendResult.ok ? "var(--green)" : "var(--red)" }}>
                {sendResult.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                {sendResult.ok ? "Sent!" : "Failed"}
              </div>
            )}

            <div style={{ flex: 1 }} />

            <button onClick={() => setLogs([])} style={S.btnSecondary}>
              <RefreshCw size={12} /> Clear Log
            </button>
          </div>

          {/* Log console */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Terminal size={13} color="var(--accent)" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>Activity Log</span>
              </div>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text3)" }}>{logs.length} entries</span>
            </div>
            <div style={{ flex: 1, overflow: "auto", fontFamily: "var(--font-mono)", fontSize: 12, paddingTop: 4, paddingBottom: 4, minHeight: 0 }}>
              {logs.length === 0 && (
                <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--text3)", fontSize: 12 }}>
                  Test your connection, then send an email — activity shows here.
                </div>
              )}
              {logs.map((log, i) => <LogLine key={i} log={log} />)}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
