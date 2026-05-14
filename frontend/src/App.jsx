import { useState, useRef, useCallback, useEffect } from "react";
import {
  Send, Settings2, ChevronDown, ChevronUp, Plus, Trash2,
  Paperclip, X, CheckCircle, AlertCircle, Info, Wifi, WifiOff,
  Zap, Mail, Users, FileText, Clock, BarChart2, RefreshCw,
  Upload, Eye, EyeOff, Terminal, ArrowRight, Loader2
} from "lucide-react";

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  app: {
    display: "flex", flexDirection: "column", minHeight: "100vh",
    background: "var(--bg)",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "18px 32px", borderBottom: "1px solid var(--border)",
    background: "rgba(8,11,15,0.95)", backdropFilter: "blur(12px)",
    position: "sticky", top: 0, zIndex: 100,
  },
  logo: {
    display: "flex", alignItems: "center", gap: 10,
    fontFamily: "var(--font-display)", fontWeight: 800,
    fontSize: 20, letterSpacing: "-0.5px", color: "var(--text)",
  },
  logoIcon: {
    width: 34, height: 34, background: "var(--accent)",
    borderRadius: 8, display: "flex", alignItems: "center",
    justifyContent: "center", color: "var(--bg)",
  },
  badge: {
    fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500,
    padding: "2px 7px", background: "var(--accent-dim)",
    color: "var(--accent)", borderRadius: 100, border: "1px solid rgba(0,229,255,0.3)",
    letterSpacing: "0.05em", marginLeft: 6,
  },
  main: { flex: 1, display: "flex", gap: 0 },
  sidebar: {
    width: 320, borderRight: "1px solid var(--border)",
    background: "var(--surface)", display: "flex", flexDirection: "column",
    overflow: "auto", flexShrink: 0,
  },
  content: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  panel: {
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)", overflow: "hidden",
    marginBottom: 1,
  },
  panelHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 18px", borderBottom: "1px solid var(--border)",
    cursor: "pointer", userSelect: "none",
    "&:hover": { background: "var(--surface2)" },
  },
  panelTitle: {
    display: "flex", alignItems: "center", gap: 8,
    fontWeight: 600, fontSize: 13, color: "var(--text)",
  },
  panelBody: { padding: "16px 18px" },
  label: {
    display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
    textTransform: "uppercase", color: "var(--text3)", marginBottom: 6,
  },
  input: {
    width: "100%", padding: "9px 12px",
    background: "var(--surface2)", border: "1px solid var(--border)",
    borderRadius: "var(--radius)", color: "var(--text)",
    fontFamily: "var(--font-mono)", fontSize: 13,
    outline: "none", transition: "border-color 0.15s",
  },
  textarea: {
    width: "100%", padding: "9px 12px",
    background: "var(--surface2)", border: "1px solid var(--border)",
    borderRadius: "var(--radius)", color: "var(--text)",
    fontFamily: "var(--font-mono)", fontSize: 12,
    outline: "none", resize: "vertical", minHeight: 80,
    transition: "border-color 0.15s", lineHeight: 1.6,
  },
  row: { display: "flex", gap: 10, marginBottom: 12 },
  col: { flex: 1, marginBottom: 12 },
  btnPrimary: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "11px 22px", background: "var(--accent)", color: "var(--bg)",
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
  btnDanger: {
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "6px", background: "transparent", color: "var(--text3)",
    border: "none", borderRadius: "var(--radius)", cursor: "pointer",
    transition: "all 0.15s",
  },
  btnSmall: {
    display: "flex", alignItems: "center", gap: 5,
    padding: "5px 10px", background: "var(--surface3)",
    border: "1px solid var(--border)", borderRadius: "var(--radius)",
    color: "var(--text2)", cursor: "pointer", fontSize: 12,
    fontFamily: "var(--font-display)", fontWeight: 500,
    transition: "all 0.15s",
  },
  statsBar: {
    display: "flex", gap: 1, padding: "12px 24px",
    background: "var(--surface)", borderBottom: "1px solid var(--border)",
  },
  statItem: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
    padding: "8px 0",
  },
  statVal: { fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 },
  statLbl: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text3)", marginTop: 2 },
  logContainer: {
    flex: 1, display: "flex", flexDirection: "column",
    background: "var(--surface)", borderTop: "1px solid var(--border)",
    minHeight: 0,
  },
  logHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 20px", borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  logBody: {
    flex: 1, overflow: "auto", padding: "8px 0",
    fontFamily: "var(--font-mono)", fontSize: 12,
    minHeight: 0,
  },
  logLine: {
    display: "flex", alignItems: "flex-start", gap: 8,
    padding: "3px 20px", lineHeight: 1.5,
  },
  progressBar: {
    height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden",
    margin: "0 24px", flexShrink: 0,
  },
  progressFill: {
    height: "100%", background: "var(--accent)",
    borderRadius: 2, transition: "width 0.3s ease",
  },
  chip: {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 8px", borderRadius: 100,
    fontSize: 11, fontWeight: 500, fontFamily: "var(--font-mono)",
  },
  divider: { height: 1, background: "var(--border)", margin: "12px 0" },
  flexBetween: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  flex: { display: "flex", alignItems: "center", gap: 8 },
  sideSection: { padding: "16px 18px", borderBottom: "1px solid var(--border)" },
  sideSectionTitle: {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
    textTransform: "uppercase", color: "var(--text3)", marginBottom: 12,
  },
  checkboxRow: {
    display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
    marginBottom: 8,
  },
  listItem: {
    display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6,
    padding: "8px 10px", background: "var(--surface2)",
    border: "1px solid var(--border)", borderRadius: "var(--radius)",
  },
  attachmentItem: {
    display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
    background: "var(--surface2)", border: "1px solid var(--border)",
    borderRadius: "var(--radius)", marginBottom: 6,
  },
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function Input({ label, type = "text", placeholder, value, onChange, mono = true, ...props }) {
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={S.label}>{label}</label>}
      <div style={{ position: "relative" }}>
        <input
          type={isPass && !show ? "password" : "text"}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            ...S.input,
            fontFamily: mono ? "var(--font-mono)" : "var(--font-display)",
            paddingRight: isPass ? 36 : 12,
          }}
          onFocus={e => e.target.style.borderColor = "var(--accent)"}
          onBlur={e => e.target.style.borderColor = "var(--border)"}
          {...props}
        />
        {isPass && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 2 }}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={S.label}>{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          ...S.input,
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238ba3bf' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
          paddingRight: 30, cursor: "pointer",
        }}
        onFocus={e => e.target.style.borderColor = "var(--accent)"}
        onBlur={e => e.target.style.borderColor = "var(--border)"}
      >
        {options.map(o => <option key={o.value} value={o.value} style={{ background: "#0f1419" }}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Collapsible({ title, icon: Icon, iconColor, children, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ ...S.panelHeader, background: open ? "transparent" : "transparent" }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <span style={S.panelTitle}>
          {Icon && <Icon size={14} color={iconColor || "var(--accent)"} />}
          {title}
          {badge != null && (
            <span style={{ ...S.chip, background: "var(--accent-dim)", color: "var(--accent)", fontSize: 10 }}>
              {badge}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={14} color="var(--text3)" /> : <ChevronDown size={14} color="var(--text3)" />}
      </div>
      {open && <div style={{ padding: "14px 18px" }}>{children}</div>}
    </div>
  );
}

function LogLine({ log }) {
  const colors = {
    success: "var(--green)", error: "var(--red)",
    info: "var(--text2)", warn: "var(--amber)",
  };
  const color = colors[log.level] || "var(--text2)";
  return (
    <div style={{ ...S.logLine, color }}>
      <span style={{ color: "var(--text3)", flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 11 }}>
        {log.time}
      </span>
      <span style={{ color, wordBreak: "break-all" }}>{log.msg}</span>
    </div>
  );
}

function FileChip({ file, onRemove }) {
  const icons = {
    "image": "🖼", "application/pdf": "📄",
    "text": "📝", "video": "🎥", "audio": "🎵",
  };
  const icon = Object.entries(icons).find(([k]) => file.type.startsWith(k))?.[1] || "📎";
  const size = file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)}MB` : `${Math.round(file.size / 1024)}KB`;
  return (
    <div style={S.attachmentItem}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
        <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--font-mono)" }}>{size} · {file.type || "unknown"}</div>
      </div>
      <button onClick={() => onRemove(file)} style={S.btnDanger} onMouseEnter={e => e.currentTarget.style.color = "var(--red)"} onMouseLeave={e => e.currentTarget.style.color = "var(--text3)"}>
        <X size={13} />
      </button>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // SMTP Settings
  const [smtp, setSmtp] = useState({
    host: "", port: "587", user: "", pass: "", tls: true,
    fromName: "", fromEmail: "",
  });
  const setSmtpField = (k) => (v) => setSmtp(s => ({ ...s, [k]: v }));

  // Recipients
  const [recipientsText, setRecipientsText] = useState("");

  // Content
  const [subjects, setSubjects] = useState([""]);
  const [bodies, setBodies] = useState([""]);
  const [isHtml, setIsHtml] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef();

  // Campaign settings
  const [delay, setDelay] = useState("2");

  // State
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [stats, setStats] = useState({ sent: 0, failed: 0, total: 0 });
  const [done, setDone] = useState(false);

  const logEndRef = useRef();
  const abortRef = useRef();

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((log) => {
    setLogs(prev => [...prev, { ...log, time: new Date().toLocaleTimeString("en-US", { hour12: false }) }]);
  }, []);

  // Parse recipients
  const getRecipients = () => {
    return recipientsText
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(s => s.includes("@"));
  };

  // Test connection
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpHost: smtp.host, smtpPort: smtp.port,
          smtpUser: smtp.user, smtpPass: smtp.pass, useTLS: smtp.tls,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    }
    setTesting(false);
  };

  // Send campaign
  const handleSend = async () => {
    const recipients = getRecipients();
    if (!recipients.length) return alert("No valid recipients found.");
    const validSubjects = subjects.filter(s => s.trim());
    const validBodies = bodies.filter(b => b.trim());
    if (!validSubjects.length) return alert("Add at least one subject line.");
    if (!validBodies.length) return alert("Add at least one email body.");

    setSending(true);
    setDone(false);
    setLogs([]);
    setProgress({ current: 0, total: recipients.length });
    setStats({ sent: 0, failed: 0, total: recipients.length });

    const fd = new FormData();
    fd.append("smtpHost", smtp.host);
    fd.append("smtpPort", smtp.port);
    fd.append("smtpUser", smtp.user);
    fd.append("smtpPass", smtp.pass);
    fd.append("useTLS", smtp.tls);
    fd.append("fromName", smtp.fromName);
    fd.append("fromEmail", smtp.fromEmail);
    fd.append("recipients", JSON.stringify(recipients));
    fd.append("subjects", JSON.stringify(validSubjects));
    fd.append("bodies", JSON.stringify(validBodies));
    fd.append("delaySeconds", delay);
    fd.append("isHtml", isHtml);
    attachments.forEach(f => fd.append("attachments", f));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/send", {
        method: "POST", body: fd, signal: controller.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, "");
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "log") {
              addLog(msg);
              if (msg.progress) setProgress({ current: msg.progress, total: msg.total });
            } else if (msg.type === "done") {
              setStats({ sent: msg.sent, failed: msg.failed, total: recipients.length });
              setDone(true);
              addLog({ level: msg.failed ? "warn" : "success", msg: msg.msg });
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") addLog({ level: "error", msg: `Connection error: ${err.message}` });
    }

    setSending(false);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setSending(false);
    addLog({ level: "warn", msg: "⚠️ Campaign stopped by user." });
  };

  const handleFileAdd = (e) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...files.filter(f => !existing.has(f.name + f.size))];
    });
    e.target.value = "";
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    setAttachments(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...files.filter(f => !existing.has(f.name + f.size))];
    });
  };

  const pct = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  const recipientCount = getRecipients().length;

  // SMTP provider presets
  const presets = [
    { label: "Gmail", host: "smtp.gmail.com", port: "587" },
    { label: "Outlook", host: "smtp-mail.outlook.com", port: "587" },
    { label: "SendGrid", host: "smtp.sendgrid.net", port: "587" },
    { label: "Mailgun", host: "smtp.mailgun.org", port: "587" },
    { label: "Amazon SES", host: "email-smtp.us-east-1.amazonaws.com", port: "587" },
    { label: "Yahoo", host: "smtp.mail.yahoo.com", port: "587" },
  ];

  return (
    <div style={S.app}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.logo}>
          <div style={S.logoIcon}><Zap size={18} /></div>
          MailBlast
          <span style={S.badge}>PRO</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text3)", fontFamily: "var(--font-mono)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: done && !sending ? "var(--green)" : sending ? "var(--accent)" : "var(--text3)", boxShadow: sending ? "0 0 8px var(--accent)" : "none", transition: "all 0.3s" }} />
            {sending ? "SENDING" : done ? "COMPLETE" : "READY"}
          </div>
          {sending && (
            <button
              onClick={handleStop}
              style={{ ...S.btnSecondary, color: "var(--red)", borderColor: "var(--red-dim)" }}
            >
              Stop Campaign
            </button>
          )}
        </div>
      </header>

      {/* Stats bar */}
      <div style={S.statsBar}>
        {[
          { icon: Users, label: "Recipients", val: recipientCount, color: "var(--accent)" },
          { icon: FileText, label: "Subjects", val: subjects.filter(s => s.trim()).length, color: "var(--amber)" },
          { icon: Mail, label: "Bodies", val: bodies.filter(b => b.trim()).length, color: "#a78bfa" },
          { icon: Paperclip, label: "Attachments", val: attachments.length, color: "var(--green)" },
          { icon: CheckCircle, label: "Sent", val: stats.sent, color: "var(--green)" },
          { icon: AlertCircle, label: "Failed", val: stats.failed, color: "var(--red)" },
        ].map(({ icon: Icon, label, val, color }) => (
          <div key={label} style={S.statItem}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color }}>
              <Icon size={12} />
              <span style={{ ...S.statVal, fontSize: 18, color }}>{val}</span>
            </div>
            <div style={S.statLbl}>{label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {(sending || done) && (
        <div style={{ padding: "0 0 0 0", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 24px 4px" }}>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text2)" }}>
              {progress.current}/{progress.total} emails
            </span>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
              {pct}%
            </span>
          </div>
          <div style={{ ...S.progressBar, margin: "0 0 0 0", borderRadius: 0 }}>
            <div style={{ ...S.progressFill, width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={S.main}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          {/* SMTP Config */}
          <Collapsible title="SMTP Configuration" icon={Settings2}>
            {/* Presets */}
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Quick Presets</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {presets.map(p => (
                  <button
                    key={p.label}
                    onClick={() => setSmtp(s => ({ ...s, host: p.host, port: p.port }))}
                    style={S.btnSmall}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text2)"; }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <Input label="SMTP Host" placeholder="smtp.example.com" value={smtp.host} onChange={setSmtpField("host")} />
            <div style={S.row}>
              <div style={{ flex: "0 0 90px" }}>
                <Input label="Port" placeholder="587" value={smtp.port} onChange={setSmtpField("port")} />
              </div>
              <div style={{ flex: 1, paddingTop: 23 }}>
                <label style={{ ...S.checkboxRow, marginBottom: 0 }}>
                  <input
                    type="checkbox" checked={smtp.tls}
                    onChange={e => setSmtpField("tls")(e.target.checked)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text2)" }}>Use TLS</span>
                </label>
              </div>
            </div>
            <Input label="Username / Email" placeholder="user@example.com" value={smtp.user} onChange={setSmtpField("user")} />
            <Input label="Password / API Key" type="password" placeholder="••••••••••••" value={smtp.pass} onChange={setSmtpField("pass")} />

            <div style={S.divider} />
            <label style={S.label}>Sender Identity</label>
            <Input placeholder="Display Name" value={smtp.fromName} onChange={setSmtpField("fromName")} mono={false} />
            <Input placeholder="from@yourdomain.com" value={smtp.fromEmail} onChange={setSmtpField("fromEmail")} />

            {/* Test button */}
            <button
              onClick={handleTest}
              disabled={testing}
              style={{
                ...S.btnSecondary, width: "100%", marginTop: 4,
                borderColor: testResult?.ok ? "var(--green)" : testResult?.ok === false ? "var(--red)" : "var(--border2)",
                color: testResult?.ok ? "var(--green)" : testResult?.ok === false ? "var(--red)" : "var(--text2)",
              }}
              onMouseEnter={e => !testing && (e.currentTarget.style.borderColor = "var(--accent)")}
              onMouseLeave={e => !testing && (e.currentTarget.style.borderColor = testResult?.ok ? "var(--green)" : testResult?.ok === false ? "var(--red)" : "var(--border2)")}
            >
              {testing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Wifi size={14} />}
              {testing ? "Testing..." : "Test Connection"}
            </button>
            {testResult && (
              <div style={{
                marginTop: 8, padding: "8px 10px", borderRadius: "var(--radius)", fontSize: 12,
                background: testResult.ok ? "var(--green-dim)" : "var(--red-dim)",
                color: testResult.ok ? "var(--green)" : "var(--red)",
                fontFamily: "var(--font-mono)",
              }}>
                {testResult.message}
              </div>
            )}
          </Collapsible>

          {/* Campaign Settings */}
          <Collapsible title="Campaign Settings" icon={Clock} defaultOpen={true}>
            <Input
              label="Delay Between Emails (seconds)"
              type="number" min="0" step="0.5"
              value={delay} onChange={setDelay}
            />
            <div style={{ ...S.checkboxRow, marginTop: 4 }}>
              <input
                type="checkbox" checked={isHtml}
                onChange={e => setIsHtml(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: 12, color: "var(--text2)" }}>
                Send as HTML (interpret HTML tags in bodies)
              </span>
            </div>
            <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--amber-dim)", borderRadius: "var(--radius)", fontSize: 11, color: "var(--amber)", fontFamily: "var(--font-mono)" }}>
              ⚡ Higher delay = lower spam score. 2–5s recommended.
            </div>
          </Collapsible>

          {/* Attachments */}
          <Collapsible title="Attachments" icon={Paperclip} badge={attachments.length} defaultOpen={false}>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed var(--border2)", borderRadius: "var(--radius)",
                padding: "20px", textAlign: "center", cursor: "pointer",
                color: "var(--text3)", marginBottom: 10, transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text3)"; }}
            >
              <Upload size={20} style={{ margin: "0 auto 6px", display: "block" }} />
              <div style={{ fontSize: 12 }}>Drop files or click to browse</div>
              <div style={{ fontSize: 10, marginTop: 4, color: "var(--text3)" }}>PDF, Images, Docs — max 25MB each</div>
            </div>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileAdd} />
            {attachments.map(f => (
              <FileChip key={f.name + f.size} file={f} onRemove={() => setAttachments(prev => prev.filter(x => x !== f))} />
            ))}
          </Collapsible>
        </div>

        {/* Main content area */}
        <div style={S.content}>
          {/* Content editor */}
          <div style={{ padding: 20, borderBottom: "1px solid var(--border)", overflowY: "auto", maxHeight: "50vh" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Recipients */}
              <div>
                <div style={{ ...S.flexBetween, marginBottom: 8 }}>
                  <label style={{ ...S.label, marginBottom: 0 }}>
                    Recipients
                    <span style={{ ...S.chip, background: "var(--accent-dim)", color: "var(--accent)", marginLeft: 6 }}>
                      {recipientCount}
                    </span>
                  </label>
                  <span style={{ fontSize: 10, color: "var(--text3)" }}>one per line, or comma/semicolon separated</span>
                </div>
                <textarea
                  placeholder={"alice@example.com\nbob@example.com\ncharlie@domain.com"}
                  value={recipientsText}
                  onChange={e => setRecipientsText(e.target.value)}
                  style={{ ...S.textarea, minHeight: 130, fontFamily: "var(--font-mono)", fontSize: 12 }}
                  onFocus={e => e.target.style.borderColor = "var(--accent)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>

              {/* Subject Lines */}
              <div>
                <div style={{ ...S.flexBetween, marginBottom: 8 }}>
                  <label style={{ ...S.label, marginBottom: 0 }}>
                    Subject Lines
                    <span style={{ ...S.chip, background: "var(--amber-dim)", color: "var(--amber)", marginLeft: 6 }}>
                      random
                    </span>
                  </label>
                  <button
                    onClick={() => setSubjects(prev => [...prev, ""])}
                    style={S.btnSmall}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text2)"; }}
                  >
                    <Plus size={11} /> Add Subject
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {subjects.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        placeholder={`Subject ${i + 1}`}
                        value={s}
                        onChange={e => setSubjects(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                        style={S.input}
                        onFocus={e => e.target.style.borderColor = "var(--accent)"}
                        onBlur={e => e.target.style.borderColor = "var(--border)"}
                      />
                      {subjects.length > 1 && (
                        <button
                          onClick={() => setSubjects(prev => prev.filter((_, j) => j !== i))}
                          style={S.btnDanger}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--red)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--text3)"}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Message Bodies */}
            <div style={{ marginTop: 20 }}>
              <div style={{ ...S.flexBetween, marginBottom: 10 }}>
                <label style={{ ...S.label, marginBottom: 0 }}>
                  Message Bodies
                  <span style={{ ...S.chip, background: "rgba(167,139,250,0.15)", color: "#a78bfa", marginLeft: 6 }}>
                    random pick
                  </span>
                  {isHtml && <span style={{ ...S.chip, background: "var(--accent-dim)", color: "var(--accent)", marginLeft: 6 }}>HTML</span>}
                </label>
                <button
                  onClick={() => setBodies(prev => [...prev, ""])}
                  style={S.btnSmall}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text2)"; }}
                >
                  <Plus size={11} /> Add Body
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
                {bodies.map((b, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <div style={{ ...S.flexBetween, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--font-mono)" }}>
                        variant {i + 1}
                      </span>
                      {bodies.length > 1 && (
                        <button
                          onClick={() => setBodies(prev => prev.filter((_, j) => j !== i))}
                          style={{ ...S.btnDanger, padding: "2px 4px" }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--red)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--text3)"}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <textarea
                      placeholder={isHtml ? `<p>Hello,</p>\n<p>Your message here...</p>` : `Hello,\n\nYour message here...\n\nBest regards`}
                      value={b}
                      onChange={e => setBodies(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                      style={{ ...S.textarea, minHeight: 120, fontSize: 12 }}
                      onFocus={e => e.target.style.borderColor = "var(--accent)"}
                      onBlur={e => e.target.style.borderColor = "var(--border)"}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Send button */}
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center", background: "var(--surface)", flexShrink: 0 }}>
            {!sending ? (
              <button
                onClick={handleSend}
                style={{
                  ...S.btnPrimary,
                  opacity: !recipientCount || !smtp.host ? 0.5 : 1,
                  boxShadow: recipientCount && smtp.host ? "0 0 20px rgba(0,229,255,0.2)" : "none",
                }}
                disabled={!recipientCount || !smtp.host}
              >
                <Send size={15} />
                Launch Campaign
                {recipientCount > 0 && (
                  <span style={{ background: "rgba(0,0,0,0.25)", borderRadius: 4, padding: "1px 6px", fontSize: 12 }}>
                    {recipientCount}
                  </span>
                )}
              </button>
            ) : (
              <button onClick={handleStop} style={{ ...S.btnPrimary, background: "var(--red)" }}>
                <X size={15} /> Stop Campaign
              </button>
            )}
            <div style={{ flex: 1 }} />
            {done && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ ...S.chip, background: "var(--green-dim)", color: "var(--green)" }}>
                  <CheckCircle size={10} /> {stats.sent} sent
                </span>
                {stats.failed > 0 && (
                  <span style={{ ...S.chip, background: "var(--red-dim)", color: "var(--red)" }}>
                    <AlertCircle size={10} /> {stats.failed} failed
                  </span>
                )}
              </div>
            )}
            <button
              onClick={() => { setLogs([]); setDone(false); setProgress({ current: 0, total: 0 }); setStats({ sent: 0, failed: 0, total: 0 }); }}
              style={S.btnSecondary}
            >
              <RefreshCw size={12} /> Clear Log
            </button>
          </div>

          {/* Log console */}
          <div style={S.logContainer}>
            <div style={S.logHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Terminal size={13} color="var(--accent)" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>Campaign Log</span>
              </div>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text3)" }}>
                {logs.length} entries
              </span>
            </div>
            <div style={S.logBody}>
              {logs.length === 0 && (
                <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  Waiting for campaign to start...
                </div>
              )}
              {logs.map((log, i) => <LogLine key={i} log={log} />)}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
