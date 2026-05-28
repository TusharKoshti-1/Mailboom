import { useState, useRef, useEffect } from "react";
import {
  Zap, Settings2, Mail, Paperclip, Send, Wifi, Eye, EyeOff,
  X, Upload, Loader2, CheckCircle, AlertCircle, Terminal, RefreshCw, Clock, Users,
} from "lucide-react";

const onFocus = e => e.target.style.borderColor = "var(--accent)";
const onBlur  = e => e.target.style.borderColor = "var(--border)";

const S = {
  label:        { display:"block", fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--text3)", marginBottom:6 },
  input:        { width:"100%", padding:"9px 12px", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:"var(--radius)", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:13, outline:"none", transition:"border-color 0.15s", boxSizing:"border-box" },
  select:       { width:"100%", padding:"9px 12px", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:"var(--radius)", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:13, outline:"none", transition:"border-color 0.15s", boxSizing:"border-box", cursor:"pointer" },
  textarea:     { width:"100%", padding:"10px 12px", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:"var(--radius)", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:13, outline:"none", resize:"vertical", lineHeight:1.65, transition:"border-color 0.15s", boxSizing:"border-box" },
  btnPrimary:   { display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"11px 24px", background:"var(--accent)", color:"var(--bg)", border:"none", borderRadius:"var(--radius)", cursor:"pointer", fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, transition:"all 0.15s", whiteSpace:"nowrap" },
  btnSecondary: { display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"9px 16px", background:"transparent", color:"var(--text2)", border:"1px solid var(--border2)", borderRadius:"var(--radius)", cursor:"pointer", fontFamily:"var(--font-display)", fontWeight:500, fontSize:13, transition:"all 0.15s" },
  chip:         { display:"inline-flex", alignItems:"center", gap:4, padding:"2px 8px", borderRadius:100, fontSize:11, fontWeight:500, fontFamily:"var(--font-mono)" },
  divider:      { height:1, background:"var(--border)", margin:"14px 0" },
};

const PRESETS = {
  hostinger: { label:"Hostinger",         host:"smtp.hostinger.com",     port:"587" },
  gmail:     { label:"Gmail",             host:"smtp.gmail.com",          port:"587" },
  outlook:   { label:"Outlook / Hotmail", host:"smtp-mail.outlook.com",   port:"587" },
  yahoo:     { label:"Yahoo Mail",        host:"smtp.mail.yahoo.com",     port:"587" },
  sendgrid:  { label:"SendGrid (SMTP)",   host:"smtp.sendgrid.net",       port:"587" },
  mailgun:   { label:"Mailgun",           host:"smtp.mailgun.org",        port:"587" },
  custom:    { label:"Custom SMTP",       host:"",                        port:"587" },
};

function Field({ label, children }) {
  return <div style={{ marginBottom:14 }}>{label && <label style={S.label}>{label}</label>}{children}</div>;
}

function TextInput({ label, type="text", value, onChange, placeholder, mono=true }) {
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <Field label={label}>
      <div style={{ position:"relative" }}>
        <input
          type={isPass && !show ? "password" : "text"}
          value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ ...S.input, fontFamily: mono ? "var(--font-mono)" : "var(--font-display)", paddingRight: isPass ? 36 : 12 }}
          onFocus={onFocus} onBlur={onBlur}
        />
        {isPass && (
          <button type="button" onClick={() => setShow(s => !s)}
            style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:2 }}>
            {show ? <EyeOff size={14}/> : <Eye size={14}/>}
          </button>
        )}
      </div>
    </Field>
  );
}

function LogLine({ log }) {
  const colors = { success:"var(--green)", error:"var(--red)", info:"var(--text2)", warn:"var(--amber)" };
  return (
    <div style={{ display:"flex", gap:10, padding:"3px 18px", lineHeight:1.5, color:colors[log.level]||"var(--text2)" }}>
      <span style={{ color:"var(--text3)", flexShrink:0, fontFamily:"var(--font-mono)", fontSize:11 }}>{log.time}</span>
      <span style={{ wordBreak:"break-all" }}>{log.msg}</span>
    </div>
  );
}

function FileChip({ file, onRemove }) {
  const icon = file.type.startsWith("image") ? "🖼" : file.type==="application/pdf" ? "📄" : "📎";
  const size = file.size > 1048576 ? `${(file.size/1048576).toFixed(1)}MB` : `${Math.round(file.size/1024)}KB`;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:"var(--radius)", marginBottom:6 }}>
      <span style={{ fontSize:15 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</div>
        <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>{size}</div>
      </div>
      <button onClick={() => onRemove(file)}
        style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:3 }}
        onMouseEnter={e => e.currentTarget.style.color="var(--red)"}
        onMouseLeave={e => e.currentTarget.style.color="var(--text3)"}>
        <X size={13}/>
      </button>
    </div>
  );
}

// Parse emails from textarea — split by newline or comma
function parseEmails(raw) {
  return raw.split(/[\n,]+/).map(e => e.trim()).filter(e => e.includes("@"));
}

export default function App() {
  const [preset,   setPreset]   = useState("hostinger");
  const [smtpHost, setSmtpHost] = useState(PRESETS.hostinger.host);
  const [smtpPort, setSmtpPort] = useState(PRESETS.hostinger.port);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [fromName, setFromName] = useState("");

  const [to,      setTo]      = useState("");
  const [subject, setSubject] = useState("");
  const [body,    setBody]    = useState("");
  const [isHtml,  setIsHtml]  = useState(false);

  // Delay settings
  const [minDelay, setMinDelay] = useState("30");
  const [maxDelay, setMaxDelay] = useState("60");

  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef();

  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [sending,    setSending]    = useState(false);
  const [progress,   setProgress]   = useState(null); // { current, total, results[] }
  const [logs,       setLogs]       = useState([]);
  const logEndRef = useRef();

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [logs]);

  const addLog = (level, msg) =>
    setLogs(p => [...p, { level, msg, time: new Date().toLocaleTimeString("en-US", { hour12:false }) }]);

  const handlePreset = (key) => {
    setPreset(key);
    setSmtpHost(PRESETS[key].host);
    setSmtpPort(PRESETS[key].port);
    setTestResult(null);
  };

  const smtpPayload = () => ({ smtpHost, smtpPort, smtpUser, smtpPass });

  const handleTest = async () => {
    if (!smtpHost || !smtpUser || !smtpPass)
      return addLog("error", "❌ Fill in SMTP host, username and password first.");
    setTesting(true); setTestResult(null);
    try {
      const res  = await fetch("/api/test-connection", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(smtpPayload()),
      });
      const data = await res.json();
      setTestResult(data);
      addLog(data.ok ? "success" : "error", data.ok ? `✅ ${data.message}` : `❌ ${data.message}`);
    } catch (err) {
      setTestResult({ ok:false, message:err.message });
      addLog("error", `❌ ${err.message}`);
    }
    setTesting(false);
  };

  const recipientList = parseEmails(to);
  const isBulk = recipientList.length > 1;

  const handleSend = async () => {
    if (!smtpHost || !smtpUser || !smtpPass) return addLog("error", "❌ Fill in SMTP credentials.");
    if (!to)      return addLog("error", "❌ Enter at least one recipient.");
    if (!subject) return addLog("error", "❌ Enter a subject line.");
    if (!body)    return addLog("error", "❌ Write a message body.");
    if (recipientList.length === 0) return addLog("error", "❌ No valid email addresses found.");

    const min = parseFloat(minDelay) || 30;
    const max = parseFloat(maxDelay) || 60;
    if (min > max) return addLog("error", "❌ Min delay cannot be greater than max delay.");

    setSending(true);
    setProgress({ current:0, total: recipientList.length, results:[] });

    if (isBulk) {
      addLog("info", `📋 Starting bulk send to ${recipientList.length} recipients (delay: ${min}–${max}s random)...`);
    } else {
      addLog("info", `📤 Sending to ${recipientList[0]}...`);
    }

    const fd = new FormData();
    Object.entries(smtpPayload()).forEach(([k, v]) => fd.append(k, v));
    fd.append("fromName", fromName);
    fd.append("to",       to);
    fd.append("subject",  subject);
    fd.append("body",     body);
    fd.append("isHtml",   isHtml);
    fd.append("minDelay", min);
    fd.append("maxDelay", max);
    attachments.forEach(f => fd.append("attachments", f));

    try {
      const res  = await fetch("/api/send", { method:"POST", body:fd });
      const data = await res.json();

      if (data.results) {
        // Bulk result — log each one
        data.results.forEach((r, i) => {
          setProgress(p => ({ ...p, current: i+1, results: [...(p?.results||[]), r] }));
          if (r.ok) {
            addLog("success", `✅ (${i+1}/${data.total}) ${r.email} — sent`);
          } else {
            addLog("error",   `❌ (${i+1}/${data.total}) ${r.email} — ${r.message}`);
          }
        });
        addLog(
          data.failed === 0 ? "success" : "warn",
          `📊 Done — ${data.success} sent, ${data.failed} failed out of ${data.total}`
        );
        if (data.success > 0) { setTo(""); setSubject(""); setBody(""); setAttachments([]); }
      } else {
        // Single fallback
        if (data.ok) {
          addLog("success", `✅ ${data.message}`);
          setTo(""); setSubject(""); setBody(""); setAttachments([]);
        } else {
          addLog("error", `❌ ${data.message}`);
        }
      }
    } catch (err) {
      addLog("error", `❌ Network error: ${err.message}`);
    }

    setSending(false);
    setProgress(null);
  };

  const addFiles = files => {
    const ex = new Set(attachments.map(f => f.name + f.size));
    setAttachments(p => [...p, ...Array.from(files).filter(f => !ex.has(f.name + f.size))]);
  };

  // Estimated time for bulk
  const estimatedMin = Math.round(recipientList.length > 1 ? (recipientList.length - 1) * parseFloat(minDelay||30) : 0);
  const estimatedMax = Math.round(recipientList.length > 1 ? (recipientList.length - 1) * parseFloat(maxDelay||60) : 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"var(--bg)", fontFamily:"var(--font-display)" }}>

      {/* Header */}
      <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 28px", borderBottom:"1px solid var(--border)", background:"rgba(8,11,15,0.97)", backdropFilter:"blur(12px)", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, fontWeight:800, fontSize:20, letterSpacing:"-0.5px" }}>
          <div style={{ width:32, height:32, background:"var(--accent)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--bg)" }}>
            <Zap size={17}/>
          </div>
          MailSend
          <span style={{ fontSize:10, fontFamily:"var(--font-mono)", padding:"2px 7px", background:"var(--accent-dim)", color:"var(--accent)", borderRadius:100, border:"1px solid rgba(0,229,255,0.3)", letterSpacing:"0.05em", marginLeft:4 }}>v3</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>
          <div style={{ width:7, height:7, borderRadius:"50%",
            background: testResult?.ok ? "var(--green)" : testResult?.ok===false ? "var(--red)" : "var(--text3)",
            boxShadow:  testResult?.ok ? "0 0 8px var(--green)" : "none", transition:"all 0.3s" }}/>
          {testResult?.ok ? "CONNECTED" : testResult?.ok===false ? "FAILED" : "NOT TESTED"}
        </div>
      </header>

      <div style={{ flex:1, display:"flex", minHeight:0 }}>

        {/* Sidebar */}
        <div style={{ width:310, borderRight:"1px solid var(--border)", background:"var(--surface)", display:"flex", flexDirection:"column", overflowY:"auto", flexShrink:0 }}>

          {/* SMTP */}
          <div style={{ padding:"16px 18px", borderBottom:"1px solid var(--border)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
              <Settings2 size={14} color="var(--accent)"/>
              <span style={{ fontWeight:600, fontSize:13 }}>SMTP Setup</span>
            </div>

            <Field label="Email Provider">
              <select value={preset} onChange={e => handlePreset(e.target.value)} style={S.select} onFocus={onFocus} onBlur={onBlur}>
                {Object.entries(PRESETS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
              </select>
            </Field>

            {preset === "hostinger" && (
              <div style={{ background:"rgba(0,229,255,0.06)", border:"1px solid rgba(0,229,255,0.15)", borderRadius:"var(--radius)", padding:"10px 12px", marginBottom:14, fontSize:12, lineHeight:1.8, color:"var(--text2)" }}>
                <div style={{ fontWeight:700, color:"var(--accent)", marginBottom:4, fontSize:11, letterSpacing:"0.06em", textTransform:"uppercase" }}>Hostinger Setup</div>
                <div>① Username = your full domain email</div>
                <div>② Password = Hostinger email password</div>
              </div>
            )}
            {preset === "gmail" && (
              <div style={{ background:"rgba(0,229,255,0.06)", border:"1px solid rgba(0,229,255,0.15)", borderRadius:"var(--radius)", padding:"10px 12px", marginBottom:14, fontSize:12, lineHeight:1.8, color:"var(--text2)" }}>
                <div style={{ fontWeight:700, color:"var(--accent)", marginBottom:4, fontSize:11, letterSpacing:"0.06em", textTransform:"uppercase" }}>Gmail Setup</div>
                <div>① Enable 2-Step Verification</div>
                <div>② Google Account → App Passwords</div>
                <div>③ Use that app password here</div>
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 76px", gap:8, marginBottom:14 }}>
              <div>
                <label style={S.label}>SMTP Host</label>
                <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.hostinger.com" style={S.input} onFocus={onFocus} onBlur={onBlur}/>
              </div>
              <div>
                <label style={S.label}>Port</label>
                <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" style={S.input} onFocus={onFocus} onBlur={onBlur}/>
              </div>
            </div>

            <TextInput label="Username" value={smtpUser} onChange={setSmtpUser} placeholder="you@yourdomain.com"/>
            <TextInput label="Password" type="password" value={smtpPass} onChange={setSmtpPass} placeholder="Your email password"/>

            <div style={S.divider}/>
            <label style={S.label}>Display Name (optional)</label>
            <div style={{ fontSize:11, color:"var(--text3)", marginBottom:8 }}>Emails sent from your username above.</div>
            <TextInput placeholder="e.g. Tushar — Prishi Enterprise" value={fromName} onChange={setFromName} mono={false}/>

            <button onClick={handleTest} disabled={testing}
              style={{ ...S.btnSecondary, width:"100%", marginTop:4,
                borderColor: testResult?.ok ? "var(--green)" : testResult?.ok===false ? "var(--red)" : "var(--border2)",
                color:       testResult?.ok ? "var(--green)" : testResult?.ok===false ? "var(--red)" : "var(--text2)",
              }}>
              {testing ? <><Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> Testing...</> : <><Wifi size={13}/> Test Connection</>}
            </button>

            {testResult && (
              <div style={{ marginTop:9, padding:"8px 11px", borderRadius:"var(--radius)", fontSize:12, fontFamily:"var(--font-mono)", lineHeight:1.5,
                background: testResult.ok ? "var(--green-dim)" : "var(--red-dim)",
                color:      testResult.ok ? "var(--green)"     : "var(--red)" }}>
                {testResult.message}
              </div>
            )}
          </div>

          {/* Delay Settings */}
          <div style={{ padding:"16px 18px", borderBottom:"1px solid var(--border)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <Clock size={14} color="var(--amber)"/>
              <span style={{ fontWeight:600, fontSize:13 }}>Send Delay (Bulk)</span>
            </div>
            <div style={{ fontSize:11, color:"var(--text3)", marginBottom:12, lineHeight:1.6 }}>
              Random delay between each email. Avoids spam filters and looks human.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <div>
                <label style={S.label}>Min (seconds)</label>
                <input value={minDelay} onChange={e => setMinDelay(e.target.value)} placeholder="30"
                  style={S.input} type="number" min="1" onFocus={onFocus} onBlur={onBlur}/>
              </div>
              <div>
                <label style={S.label}>Max (seconds)</label>
                <input value={maxDelay} onChange={e => setMaxDelay(e.target.value)} placeholder="60"
                  style={S.input} type="number" min="1" onFocus={onFocus} onBlur={onBlur}/>
              </div>
            </div>
            {recipientList.length > 1 && (
              <div style={{ marginTop:10, padding:"8px 10px", background:"var(--amber-dim)", border:"1px solid rgba(255,183,3,0.2)", borderRadius:"var(--radius)", fontSize:11, color:"var(--amber)", fontFamily:"var(--font-mono)", lineHeight:1.7 }}>
                ⏱ {recipientList.length} recipients<br/>
                Est. time: {estimatedMin}s – {estimatedMax}s
              </div>
            )}
          </div>

          {/* Attachments */}
          <div style={{ padding:"16px 18px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Paperclip size={14} color="var(--green)"/>
                <span style={{ fontWeight:600, fontSize:13 }}>Attachments</span>
              </div>
              {attachments.length > 0 && <span style={{ ...S.chip, background:"var(--green-dim)", color:"var(--green)" }}>{attachments.length}</span>}
            </div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              style={{ border:"2px dashed var(--border2)", borderRadius:"var(--radius)", padding:"16px", textAlign:"center", cursor:"pointer", color:"var(--text3)", transition:"all 0.15s", marginBottom: attachments.length ? 10 : 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor="var(--accent)"; e.currentTarget.style.color="var(--accent)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border2)"; e.currentTarget.style.color="var(--text3)"; }}>
              <Upload size={17} style={{ display:"block", margin:"0 auto 5px" }}/>
              <div style={{ fontSize:12 }}>Drop files or click to browse</div>
              <div style={{ fontSize:10, marginTop:3 }}>PDF, images, docs — max 25MB</div>
            </div>
            <input ref={fileRef} type="file" multiple style={{ display:"none" }} onChange={e => { addFiles(e.target.files); e.target.value=""; }}/>
            {attachments.map(f => <FileChip key={f.name+f.size} file={f} onRemove={r => setAttachments(p => p.filter(x => x !== r))}/>)}
          </div>
        </div>

        {/* Compose + Log */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>

          {/* Compose */}
          <div style={{ padding:"22px 28px", borderBottom:"1px solid var(--border)", overflowY:"auto" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
              <Mail size={16} color="var(--accent)"/>
              <span style={{ fontWeight:700, fontSize:16, letterSpacing:"-0.3px" }}>Compose Email</span>
            </div>

            {/* Recipients */}
            <Field label={
              <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                To
                {recipientList.length > 0 && (
                  <span style={{ ...S.chip, background: isBulk ? "var(--amber-dim)" : "var(--accent-dim)", color: isBulk ? "var(--amber)" : "var(--accent)", fontWeight:600 }}>
                    {isBulk ? <><Users size={10}/> {recipientList.length} recipients</> : "1 recipient"}
                  </span>
                )}
              </span>
            }>
              <textarea
                value={to} onChange={e => setTo(e.target.value)}
                placeholder={"one@example.com\ntwo@example.com\nthree@example.com\n\nor comma-separated: a@x.com, b@x.com"}
                style={{ ...S.textarea, minHeight:90, fontFamily:"var(--font-mono)" }}
                onFocus={onFocus} onBlur={onBlur}
              />
              <div style={{ fontSize:11, color:"var(--text3)", marginTop:4 }}>One email per line, or comma-separated.</div>
            </Field>

            <TextInput label="Subject" value={subject} onChange={setSubject} placeholder="Enter subject..." mono={false}/>

            <Field label="Message Body">
              <textarea
                value={body} onChange={e => setBody(e.target.value)}
                placeholder={isHtml ? "<p>Hello,</p>\n<p>Your message here...</p>" : "Hello,\n\nYour message here...\n\nBest regards"}
                style={{ ...S.textarea, minHeight:200 }}
                onFocus={onFocus} onBlur={onBlur}
              />
            </Field>

            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginTop:-6 }}>
              <input type="checkbox" checked={isHtml} onChange={e => setIsHtml(e.target.checked)} style={{ accentColor:"var(--accent)" }}/>
              <span style={{ fontSize:12, color:"var(--text2)" }}>Send as HTML</span>
              {isHtml && <span style={{ ...S.chip, background:"var(--accent-dim)", color:"var(--accent)" }}>HTML mode</span>}
            </label>
          </div>

          {/* Progress bar (bulk only) */}
          {sending && progress && progress.total > 1 && (
            <div style={{ padding:"10px 28px", background:"var(--surface)", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)", marginBottom:6 }}>
                <span>Sending {progress.current} of {progress.total}</span>
                <span>{Math.round((progress.current / progress.total) * 100)}%</span>
              </div>
              <div style={{ height:4, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", background:"var(--accent)", borderRadius:2, width:`${(progress.current / progress.total) * 100}%`, transition:"width 0.4s ease" }}/>
              </div>
            </div>
          )}

          {/* Send bar */}
          <div style={{ padding:"13px 28px", borderBottom:"1px solid var(--border)", display:"flex", gap:10, alignItems:"center", background:"var(--surface)", flexShrink:0 }}>
            <button onClick={handleSend} disabled={sending}
              style={{ ...S.btnPrimary, opacity:sending?0.6:1, boxShadow:!sending?"0 0 18px rgba(0,229,255,0.2)":"none", minWidth:160 }}>
              {sending
                ? <><Loader2 size={15} style={{ animation:"spin 1s linear infinite" }}/> {isBulk ? `Sending...` : "Sending..."}</>
                : <><Send size={15}/> {isBulk ? `Send to ${recipientList.length} Recipients` : "Send Email"}</>}
            </button>

            <div style={{ flex:1 }}/>
            <button onClick={() => setLogs([])} style={S.btnSecondary}>
              <RefreshCw size={12}/> Clear Log
            </button>
          </div>

          {/* Activity Log */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 18px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <Terminal size={13} color="var(--accent)"/>
                <span style={{ fontSize:12, fontWeight:600, color:"var(--text2)" }}>Activity Log</span>
              </div>
              <span style={{ fontSize:10, fontFamily:"var(--font-mono)", color:"var(--text3)" }}>{logs.length} entries</span>
            </div>
            <div style={{ flex:1, overflow:"auto", fontFamily:"var(--font-mono)", fontSize:12, paddingTop:4, paddingBottom:4, minHeight:0 }}>
              {logs.length === 0 && (
                <div style={{ padding:"28px 18px", textAlign:"center", color:"var(--text3)", fontSize:12 }}>
                  Test your connection, then send — activity shows here.
                </div>
              )}
              {logs.map((log, i) => <LogLine key={i} log={log}/>)}
              <div ref={logEndRef}/>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
