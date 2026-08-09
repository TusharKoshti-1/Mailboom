import { useState, useRef, useEffect } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation, useParams } from "react-router-dom";
import {
  Zap, Settings2, Mail, Paperclip, Send, Wifi, Eye, EyeOff,
  X, Upload, Loader2, AlertCircle, Terminal, RefreshCw,
  Clock, Users, LogOut, User, Save, Plus, Trash2, ChevronRight,
  ArrowLeft, FolderOpen, UserPlus, AtSign, CheckCircle, FileText, Edit2, Type,
  Activity, BarChart3, MailOpen, Download,
  ShieldCheck, MailCheck, MailX, MailQuestion, Copy, ListChecks,
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
  card:         { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"24px" },
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

// ─── Shared ───────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return <div style={{ marginBottom:14 }}>{label && <label style={S.label}>{label}</label>}{children}</div>;
}

function TextInput({ label, type="text", value, onChange, placeholder, mono=true, autoComplete }) {
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <Field label={label}>
      <div style={{ position:"relative" }}>
        <input type={isPass && !show ? "password" : "text"} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete}
          style={{ ...S.input, fontFamily: mono ? "var(--font-mono)" : "var(--font-display)", paddingRight: isPass ? 36 : 12 }}
          onFocus={onFocus} onBlur={onBlur}/>
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
        <div style={{ fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</div>
        <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>{size}</div>
      </div>
      <button onClick={() => onRemove(file)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:3 }}
        onMouseEnter={e => e.currentTarget.style.color="var(--red)"}
        onMouseLeave={e => e.currentTarget.style.color="var(--text3)"}><X size={13}/></button>
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ position:"fixed", top:80, right:24, zIndex:999, padding:"10px 18px", borderRadius:"var(--radius)", fontSize:13, fontWeight:600,
      background: msg.type==="success" ? "var(--green-dim)" : "var(--red-dim)",
      color:      msg.type==="success" ? "var(--green)"     : "var(--red)",
      border:`1px solid ${msg.type==="success" ? "rgba(0,255,135,0.3)" : "rgba(255,77,109,0.3)"}` }}>
      {msg.text}
    </div>
  );
}

function parseEmails(raw) {
  return raw.split(/[\n,]+/).map(e => e.trim()).filter(e => e.includes("@"));
}

// Small Single / Group pill toggle used in Compose for subject & body
function ModeToggle({ value, onChange }) {
  const pill = (active, accent) => ({
    padding:"3px 12px", borderRadius:100, border:"1px solid", cursor:"pointer", fontSize:11, fontWeight:600, transition:"all 0.15s",
    background: active ? (accent ? "rgba(139,92,246,0.12)" : "var(--accent-dim)") : "transparent",
    borderColor: active ? (accent ? "#8b5cf6" : "var(--accent)") : "var(--border2)",
    color: active ? (accent ? "#8b5cf6" : "var(--accent)") : "var(--text3)",
  });
  return (
    <div style={{ display:"flex", gap:5 }}>
      <button type="button" onClick={() => onChange(false)} style={pill(!value, false)}>Single</button>
      <button type="button" onClick={() => onChange(true)}  style={pill(value, true)}>Group</button>
    </div>
  );
}

// ─── AUTH PAGE ────────────────────────────────────────────────────────────────
function AuthPage({ onLogin }) {
  const [page, setPage]     = useState("login");
  const [name, setName]     = useState("");
  const [email, setEmail]   = useState("");
  const [password, setPass] = useState("");
  const [loading, setLoad]  = useState(false);
  const [error, setError]   = useState("");

  const handleSubmit = async () => {
    setError(""); setLoad(true);
    const url  = page==="login" ? "/api/auth/login" : "/api/auth/register";
    const body = page==="login" ? { email, password } : { name, email, password };
    try {
      const res  = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user",  JSON.stringify(data.user));
        onLogin(data.user, data.token);
      } else setError(data.message);
    } catch { setError("Network error. Please try again."); }
    setLoad(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:48, height:48, background:"var(--accent)", borderRadius:12, display:"inline-flex", alignItems:"center", justifyContent:"center", color:"var(--bg)", marginBottom:12 }}><Zap size={24}/></div>
          <div style={{ fontWeight:800, fontSize:24, letterSpacing:"-0.5px" }}>MailBlast</div>
          <div style={{ color:"var(--text3)", fontSize:13, marginTop:4 }}>{page==="login" ? "Sign in to your account" : "Create a new account"}</div>
        </div>
        <div style={S.card}>
          {page==="register" && <TextInput label="Full Name" value={name} onChange={setName} placeholder="Your Name" mono={false} autoComplete="name"/>}
          <TextInput label="Email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email"/>
          <TextInput label="Password" type="password" value={password} onChange={setPass}
            placeholder={page==="login" ? "Your password" : "Min 6 characters"} autoComplete={page==="login" ? "current-password" : "new-password"}/>
          {error && (
            <div style={{ padding:"9px 12px", background:"var(--red-dim)", border:"1px solid rgba(255,77,109,0.3)", borderRadius:"var(--radius)", color:"var(--red)", fontSize:13, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
              <AlertCircle size={14}/> {error}
            </div>
          )}
          <button onClick={handleSubmit} disabled={loading}
            style={{ ...S.btnPrimary, width:"100%", opacity:loading?0.7:1, boxShadow:"0 0 20px rgba(0,229,255,0.15)" }}>
            {loading ? <><Loader2 size={15} style={{ animation:"spin 1s linear infinite" }}/> {page==="login" ? "Signing in..." : "Creating account..."}</> : page==="login" ? "Sign In" : "Create Account"}
          </button>
          <div style={S.divider}/>
          <div style={{ textAlign:"center", fontSize:13, color:"var(--text3)" }}>
            {page==="login" ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => { setPage(page==="login" ? "register" : "login"); setError(""); }}
              style={{ background:"none", border:"none", color:"var(--accent)", cursor:"pointer", fontWeight:600, fontSize:13 }}>
              {page==="login" ? "Register" : "Sign In"}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── SENDER GROUPS PAGE ───────────────────────────────────────────────────────
function SenderGroupsPage({ authHeader }) {
  const [groups,      setGroups]      = useState([]);
  const [view,        setView]        = useState("list"); // list | create | detail
  const [activeGroup, setActiveGroup] = useState(null);
  const [accounts,    setAccounts]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState(null);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Add account form
  const [preset,   setPreset]   = useState("hostinger");
  const [accHost,  setAccHost]  = useState(PRESETS.hostinger.host);
  const [accPort,  setAccPort]  = useState(PRESETS.hostinger.port);
  const [accUser,  setAccUser]  = useState("");
  const [accPass,  setAccPass]  = useState("");
  const [accName,  setAccName]  = useState("");
  const [adding,   setAdding]   = useState(false);
  const [testingId, setTestingId] = useState(null);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/sender-groups", { headers: authHeader });
      const data = await res.json();
      if (data.ok) setGroups(data.groups);
    } catch {}
    setLoading(false);
  };

  const loadGroup = async (g) => {
    try {
      const res  = await fetch(`/api/sender-groups/${g.id}`, { headers: authHeader });
      const data = await res.json();
      if (data.ok) { setActiveGroup(data.group); setAccounts(data.accounts); setView("detail"); }
    } catch {}
  };

  useEffect(() => { loadGroups(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return showMsg("error", "Group name is required.");
    try {
      const res  = await fetch("/api/sender-groups", { method:"POST", headers:{ ...authHeader, "Content-Type":"application/json" }, body:JSON.stringify({ name:newName, description:newDesc }) });
      const data = await res.json();
      if (data.ok) { showMsg("success", "Sender group created!"); setNewName(""); setNewDesc(""); setView("list"); loadGroups(); }
      else showMsg("error", data.message);
    } catch { showMsg("error", "Failed to create group."); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this sender group and all its accounts?")) return;
    try {
      await fetch(`/api/sender-groups/${id}`, { method:"DELETE", headers: authHeader });
      showMsg("success", "Group deleted."); loadGroups();
    } catch {}
  };

  const handlePreset = (key) => { setPreset(key); setAccHost(PRESETS[key].host); setAccPort(PRESETS[key].port); };

  const handleAddAccount = async () => {
    if (!accHost || !accUser || !accPass) return showMsg("error", "Host, username and password are required.");
    setAdding(true);
    try {
      const res  = await fetch(`/api/sender-groups/${activeGroup.id}/accounts`, {
        method:"POST", headers:{ ...authHeader, "Content-Type":"application/json" },
        body: JSON.stringify({ host:accHost, port:accPort, username:accUser, password:accPass, fromName:accName }),
      });
      const data = await res.json();
      if (data.ok) {
        showMsg("success", data.message);
        setAccUser(""); setAccPass(""); setAccName("");
        loadGroup(activeGroup);
      } else showMsg("error", data.message);
    } catch { showMsg("error", "Failed to add account."); }
    setAdding(false);
  };

  const handleRemoveAccount = async (accountId) => {
    try {
      await fetch(`/api/sender-groups/${activeGroup.id}/accounts/${accountId}`, { method:"DELETE", headers: authHeader });
      setAccounts(p => p.filter(a => a.id !== accountId));
      showMsg("success", "Account removed.");
    } catch {}
  };

  const handleTestAccount = async (accountId) => {
    setTestingId(accountId);
    try {
      const res  = await fetch(`/api/sender-groups/${activeGroup.id}/accounts/${accountId}/test`, { method:"POST", headers: authHeader });
      const data = await res.json();
      showMsg(data.ok ? "success" : "error", data.message);
    } catch { showMsg("error", "Test failed."); }
    setTestingId(null);
  };

  return (
    <div style={{ flex:1, padding:"28px 32px", overflowY:"auto" }}>
      <Toast msg={msg}/>

      {/* List */}
      {view === "list" && (
        <>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px" }}>Sender Groups</div>
              <div style={{ color:"var(--text3)", fontSize:13, marginTop:3 }}>Group multiple SMTP accounts together. Each email is sent from a random account in the group.</div>
            </div>
            <button onClick={() => setView("create")} style={{ ...S.btnPrimary }}><Plus size={15}/> New Sender Group</button>
          </div>

          {loading && <div style={{ color:"var(--text3)", fontSize:13 }}>Loading...</div>}
          {!loading && groups.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text3)" }}>
              <AtSign size={40} style={{ opacity:0.3, display:"block", margin:"0 auto 12px" }}/>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>No sender groups yet</div>
              <div style={{ fontSize:13 }}>Create a group and add your SMTP accounts to rotate through them.</div>
            </div>
          )}

          <div style={{ display:"grid", gap:12 }}>
            {groups.map(g => (
              <div key={g.id} style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 20px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", transition:"border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor="var(--border2)"}
                onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}>
                <div style={{ width:40, height:40, background:"rgba(0,255,135,0.1)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <AtSign size={18} color="var(--green)"/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{g.name}</div>
                  {g.description && <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>{g.description}</div>}
                  <div style={{ fontSize:11, color:"var(--text3)", marginTop:4, fontFamily:"var(--font-mono)" }}>
                    {g.account_count} SMTP account{g.account_count !== 1 ? "s" : ""} · Created {new Date(g.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => loadGroup(g)} style={{ ...S.btnSecondary, fontSize:12, padding:"7px 14px" }}>
                    <ChevronRight size={14}/> Manage
                  </button>
                  <button onClick={() => handleDelete(g.id)} style={{ ...S.btnSecondary, fontSize:12, padding:"7px 10px" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="var(--red)"; e.currentTarget.style.color="var(--red)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border2)"; e.currentTarget.style.color="var(--text2)"; }}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create */}
      {view === "create" && (
        <>
          <button onClick={() => setView("list")} style={{ ...S.btnSecondary, marginBottom:24, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
          <div style={{ maxWidth:520 }}>
            <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px", marginBottom:6 }}>Create Sender Group</div>
            <div style={{ color:"var(--text3)", fontSize:13, marginBottom:24 }}>Name your group then add SMTP accounts to it.</div>
            <div style={S.card}>
              <TextInput label="Group Name" value={newName} onChange={setNewName} placeholder="e.g. Main Sending Pool" mono={false}/>
              <Field label="Description (optional)">
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="e.g. 5 Hostinger domain emails"
                  style={{ ...S.input, fontFamily:"var(--font-display)" }} onFocus={onFocus} onBlur={onBlur}/>
              </Field>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={handleCreate} style={{ ...S.btnPrimary, flex:1 }}><Plus size={14}/> Create Group</button>
                <button onClick={() => setView("list")} style={{ ...S.btnSecondary }}>Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Detail */}
      {view === "detail" && activeGroup && (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
            <button onClick={() => { setView("list"); loadGroups(); }} style={{ ...S.btnSecondary, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px" }}>{activeGroup.name}</div>
              {activeGroup.description && <div style={{ color:"var(--text3)", fontSize:13 }}>{activeGroup.description}</div>}
            </div>
            <span style={{ ...S.chip, background:"rgba(0,255,135,0.1)", color:"var(--green)", fontSize:13, padding:"4px 12px" }}>
              {accounts.length} account{accounts.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, alignItems:"start" }}>

            {/* Add account form */}
            <div style={S.card}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                <Plus size={15} color="var(--accent)"/>
                <span style={{ fontWeight:700, fontSize:15 }}>Add SMTP Account</span>
              </div>
              <div style={{ fontSize:11, color:"var(--text3)", marginBottom:14, lineHeight:1.6 }}>
                The account will be tested before saving. Only working accounts are added.
              </div>

              <Field label="Provider Preset">
                <select value={preset} onChange={e => handlePreset(e.target.value)} style={S.select} onFocus={onFocus} onBlur={onBlur}>
                  {Object.entries(PRESETS).map(([k,p]) => <option key={k} value={k}>{p.label}</option>)}
                </select>
              </Field>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 80px", gap:8, marginBottom:14 }}>
                <div>
                  <label style={S.label}>SMTP Host</label>
                  <input value={accHost} onChange={e => setAccHost(e.target.value)} placeholder="smtp.hostinger.com" style={S.input} onFocus={onFocus} onBlur={onBlur}/>
                </div>
                <div>
                  <label style={S.label}>Port</label>
                  <input value={accPort} onChange={e => setAccPort(e.target.value)} placeholder="587" style={S.input} onFocus={onFocus} onBlur={onBlur}/>
                </div>
              </div>

              <TextInput label="Email (Username)" value={accUser} onChange={setAccUser} placeholder="info@yourdomain.com"/>
              <TextInput label="Password" type="password" value={accPass} onChange={setAccPass} placeholder="Email password"/>
              <TextInput label="Display Name (optional)" value={accName} onChange={setAccName} placeholder="Company Name" mono={false}/>

              <button onClick={handleAddAccount} disabled={adding} style={{ ...S.btnPrimary, width:"100%", marginTop:4 }}>
                {adding ? <><Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/> Testing & Adding...</> : <><Plus size={14}/> Add Account</>}
              </button>
            </div>

            {/* Accounts list */}
            <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
              <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontWeight:700, fontSize:15 }}>SMTP Accounts</span>
                <span style={{ ...S.chip, background:"var(--surface2)", color:"var(--text2)" }}>{accounts.length}</span>
              </div>
              <div style={{ maxHeight:500, overflowY:"auto" }}>
                {accounts.length === 0 && (
                  <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--text3)", fontSize:13 }}>
                    No accounts yet. Add your SMTP accounts on the left.
                  </div>
                )}
                {accounts.map(a => (
                  <div key={a.id} style={{ padding:"12px 20px", borderBottom:"1px solid var(--border)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(0,255,135,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <AtSign size={14} color="var(--green)"/>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.username}</div>
                        <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>{a.host}:{a.port}{a.from_name ? ` · ${a.from_name}` : ""}</div>
                      </div>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => handleTestAccount(a.id)} disabled={testingId === a.id}
                          style={{ ...S.btnSecondary, fontSize:11, padding:"5px 10px" }}>
                          {testingId === a.id ? <Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/> : <Wifi size={11}/>}
                        </button>
                        <button onClick={() => handleRemoveAccount(a.id)}
                          style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:4 }}
                          onMouseEnter={e => e.currentTarget.style.color="var(--red)"}
                          onMouseLeave={e => e.currentTarget.style.color="var(--text3)"}>
                          <X size={13}/>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {accounts.length > 0 && (
                <div style={{ padding:"12px 20px", background:"rgba(0,255,135,0.04)", borderTop:"1px solid var(--border)" }}>
                  <div style={{ fontSize:11, color:"var(--green)", fontFamily:"var(--font-mono)" }}>
                    ✓ Emails sent randomly across all {accounts.length} accounts
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── RECIPIENT GROUPS PAGE ────────────────────────────────────────────────────
function RecipientGroupsPage({ authHeader }) {
  const navigate = useNavigate();
  const [groups,      setGroups]      = useState([]);
  const [view,        setView]        = useState("list");
  const [activeGroup, setActiveGroup] = useState(null);
  const [members,     setMembers]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState(null);
  const [newName,     setNewName]     = useState("");
  const [newDesc,     setNewDesc]     = useState("");
  const [addEmails,   setAddEmails]   = useState("");
  const [adding,      setAdding]      = useState(false);
  const [importing,   setImporting]   = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const importRef = useRef();

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const handleImportFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res  = await fetch(`/api/groups/${activeGroup.id}/import`, { method:"POST", headers: authHeader, body: fd });
      const data = await res.json();
      if (data.ok) { showMsg("success", data.message); loadGroup(activeGroup); }
      else showMsg("error", data.message);
    } catch { showMsg("error", "Failed to import file."); }
    setImporting(false);
  };

  // Download the group's members as an .xlsx file. We fetch with the auth header
  // (a plain link can't send it), then trigger a browser download from the blob.
  const handleExport = async () => {
    if (!activeGroup) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/groups/${activeGroup.id}/export`, { headers: authHeader });
      if (!res.ok) { showMsg("error", "Export failed."); setExporting(false); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `${(activeGroup.name || "recipients").replace(/[^a-zA-Z0-9._-]+/g, "_")}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { showMsg("error", "Export failed."); }
    setExporting(false);
  };

  // Send a group's members to the Compose page via router state. When invoked
  // from the list (no members loaded yet) we fetch them first.
  const useInCompose = async (g, preloaded) => {
    let mem = preloaded;
    if (!mem) {
      try {
        const res  = await fetch(`/api/groups/${g.id}`, { headers: authHeader });
        const data = await res.json();
        mem = data.ok ? data.members : [];
      } catch { mem = []; }
    }
    if (!mem || mem.length === 0) return showMsg("error", "This group has no members.");
    navigate("/compose", { state: { prefilledTo: mem.map(m => m.email).join("\n") } });
  };

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/groups", { headers: authHeader });
      const data = await res.json();
      if (data.ok) setGroups(data.groups);
    } catch {}
    setLoading(false);
  };

  const loadGroup = async (g) => {
    try {
      const res  = await fetch(`/api/groups/${g.id}`, { headers: authHeader });
      const data = await res.json();
      if (data.ok) { setActiveGroup(data.group); setMembers(data.members); setView("detail"); }
    } catch {}
  };

  useEffect(() => { loadGroups(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return showMsg("error", "Group name is required.");
    try {
      const res  = await fetch("/api/groups", { method:"POST", headers:{ ...authHeader, "Content-Type":"application/json" }, body:JSON.stringify({ name:newName, description:newDesc }) });
      const data = await res.json();
      if (data.ok) { showMsg("success", "Group created!"); setNewName(""); setNewDesc(""); setView("list"); loadGroups(); }
      else showMsg("error", data.message);
    } catch { showMsg("error", "Failed to create group."); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this group and all its members?")) return;
    try {
      await fetch(`/api/groups/${id}`, { method:"DELETE", headers: authHeader });
      showMsg("success", "Group deleted."); loadGroups();
    } catch {}
  };

  const handleAddEmails = async () => {
    const emails = parseEmails(addEmails);
    if (emails.length === 0) return showMsg("error", "No valid emails found.");
    setAdding(true);
    try {
      const res  = await fetch(`/api/groups/${activeGroup.id}/members`, {
        method:"POST", headers:{ ...authHeader, "Content-Type":"application/json" },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json();
      if (data.ok) { showMsg("success", data.message); setAddEmails(""); loadGroup(activeGroup); }
      else showMsg("error", data.message);
    } catch { showMsg("error", "Failed to add emails."); }
    setAdding(false);
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await fetch(`/api/groups/${activeGroup.id}/members/${memberId}`, { method:"DELETE", headers: authHeader });
      setMembers(p => p.filter(m => m.id !== memberId));
    } catch {}
  };

  return (
    <div style={{ flex:1, padding:"28px 32px", overflowY:"auto" }}>
      <Toast msg={msg}/>

      {view === "list" && (
        <>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px" }}>Recipient Groups</div>
              <div style={{ color:"var(--text3)", fontSize:13, marginTop:3 }}>Groups of recipient emails for your campaigns.</div>
            </div>
            <button onClick={() => setView("create")} style={{ ...S.btnPrimary }}><Plus size={15}/> New Group</button>
          </div>
          {loading && <div style={{ color:"var(--text3)", fontSize:13 }}>Loading...</div>}
          {!loading && groups.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text3)" }}>
              <FolderOpen size={40} style={{ opacity:0.3, display:"block", margin:"0 auto 12px" }}/>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>No recipient groups yet</div>
              <div style={{ fontSize:13 }}>Create your first group to organize recipient emails.</div>
            </div>
          )}
          <div style={{ display:"grid", gap:12 }}>
            {groups.map(g => (
              <div key={g.id} style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 20px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", transition:"border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor="var(--border2)"}
                onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}>
                <div style={{ width:40, height:40, background:"var(--accent-dim)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Users size={18} color="var(--accent)"/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{g.name}</div>
                  {g.description && <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>{g.description}</div>}
                  <div style={{ fontSize:11, color:"var(--text3)", marginTop:4, fontFamily:"var(--font-mono)" }}>
                    {g.member_count} member{g.member_count !== 1 ? "s" : ""} · {new Date(g.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => useInCompose(g)}
                    style={{ ...S.btnSecondary, fontSize:12, padding:"7px 14px", borderColor:"var(--accent)", color:"var(--accent)" }}>
                    <Send size={12}/> Send
                  </button>
                  <button onClick={() => loadGroup(g)} style={{ ...S.btnSecondary, fontSize:12, padding:"7px 14px" }}>
                    <ChevronRight size={14}/> Open
                  </button>
                  <button onClick={() => handleDelete(g.id)} style={{ ...S.btnSecondary, fontSize:12, padding:"7px 10px" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="var(--red)"; e.currentTarget.style.color="var(--red)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border2)"; e.currentTarget.style.color="var(--text2)"; }}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "create" && (
        <>
          <button onClick={() => setView("list")} style={{ ...S.btnSecondary, marginBottom:24, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
          <div style={{ maxWidth:520 }}>
            <div style={{ fontWeight:800, fontSize:22, marginBottom:24 }}>Create Recipient Group</div>
            <div style={S.card}>
              <TextInput label="Group Name" value={newName} onChange={setNewName} placeholder="e.g. Newsletter List" mono={false}/>
              <Field label="Description (optional)">
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What is this group for?" style={{ ...S.input, fontFamily:"var(--font-display)" }} onFocus={onFocus} onBlur={onBlur}/>
              </Field>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={handleCreate} style={{ ...S.btnPrimary, flex:1 }}><Plus size={14}/> Create</button>
                <button onClick={() => setView("list")} style={S.btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}

      {view === "detail" && activeGroup && (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
            <button onClick={() => { setView("list"); loadGroups(); }} style={{ ...S.btnSecondary, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:22 }}>{activeGroup.name}</div>
              {activeGroup.description && <div style={{ color:"var(--text3)", fontSize:13 }}>{activeGroup.description}</div>}
            </div>
            <span style={{ ...S.chip, background:"var(--accent-dim)", color:"var(--accent)", fontSize:13, padding:"4px 12px" }}>{members.length} members</span>
            <button onClick={handleExport} disabled={exporting || members.length===0} style={{ ...S.btnSecondary, padding:"9px 16px", fontSize:13, opacity:(exporting||members.length===0)?0.5:1 }}>
              {exporting ? <><Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> Exporting...</> : <><Download size={13}/> Export Excel</>}
            </button>
            <button onClick={() => useInCompose(activeGroup, members)} style={{ ...S.btnPrimary, padding:"9px 18px", fontSize:13 }}>
              <Send size={13}/> Send to Group
            </button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, alignItems:"start" }}>
            <div style={S.card}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}><UserPlus size={15} color="var(--accent)"/><span style={{ fontWeight:700, fontSize:15 }}>Add Emails</span></div>
              <Field label="Email Addresses">
                <textarea value={addEmails} onChange={e => setAddEmails(e.target.value)}
                  placeholder={"one@example.com\ntwo@example.com\n\nor comma-separated"}
                  style={{ ...S.textarea, minHeight:140 }} onFocus={onFocus} onBlur={onBlur}/>
              </Field>
              <div style={{ fontSize:11, color:"var(--text3)", marginBottom:12 }}>Duplicates are skipped automatically.</div>
              <button onClick={handleAddEmails} disabled={adding} style={{ ...S.btnPrimary, width:"100%" }}>
                {adding ? <><Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/> Adding...</> : <><UserPlus size={14}/> Add to Group</>}
              </button>

              <div style={S.divider}/>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <Upload size={15} color="var(--green)"/><span style={{ fontWeight:700, fontSize:14 }}>Import from Excel / CSV</span>
              </div>
              <div style={{ fontSize:11, color:"var(--text3)", marginBottom:10, lineHeight:1.6 }}>
                Upload an <strong>.xlsx</strong>, <strong>.xls</strong> or <strong>.csv</strong> file. Every email address found in any column is added (duplicates skipped).
              </div>
              <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }}
                onChange={e => { handleImportFile(e.target.files[0]); e.target.value=""; }}/>
              <button onClick={() => importRef.current?.click()} disabled={importing}
                style={{ ...S.btnSecondary, width:"100%", borderColor:"var(--green)", color:"var(--green)" }}>
                {importing ? <><Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/> Importing...</> : <><Upload size={14}/> Upload Excel File</>}
              </button>
            </div>
            <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
              <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontWeight:700, fontSize:15 }}>Members</span>
                <span style={{ ...S.chip, background:"var(--surface2)", color:"var(--text2)" }}>{members.length}</span>
              </div>
              <div style={{ maxHeight:400, overflowY:"auto" }}>
                {members.length === 0 && <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--text3)", fontSize:13 }}>No members yet.</div>}
                {members.map(m => (
                  <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 20px", borderBottom:"1px solid var(--border)" }}>
                    <div style={{ width:30, height:30, borderRadius:"50%", background:"var(--surface2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:12, fontWeight:700, color:"var(--accent)" }}>
                      {m.email[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.email}</div>
                    </div>
                    <button onClick={() => handleRemoveMember(m.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:4 }}
                      onMouseEnter={e => e.currentTarget.style.color="var(--red)"}
                      onMouseLeave={e => e.currentTarget.style.color="var(--text3)"}><X size={13}/></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── COMPOSE PAGE ─────────────────────────────────────────────────────────────
function ComposePage({ authHeader }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [preset,   setPreset]   = useState("hostinger");
  const [smtpHost, setSmtpHost] = useState(PRESETS.hostinger.host);
  const [smtpPort, setSmtpPort] = useState(PRESETS.hostinger.port);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [fromName, setFromName] = useState("");
  const [smtpSaved, setSmtpSaved] = useState(false);

  // Sender groups
  const [senderGroups,   setSenderGroups]   = useState([]);
  const [senderGroupId,  setSenderGroupId]  = useState("");
  const [useSenderGroup, setUseSenderGroup] = useState(false);

  // Subject groups
  const [subjectGroups,   setSubjectGroups]   = useState([]);
  const [subjectGroupId,  setSubjectGroupId]  = useState("");
  const [useSubjectGroup, setUseSubjectGroup] = useState(false);

  // Body groups
  const [bodyGroups,   setBodyGroups]   = useState([]);
  const [bodyGroupId,  setBodyGroupId]  = useState("");
  const [useBodyGroup, setUseBodyGroup] = useState(false);

  // Attachment groups (random attachment)
  const [attachmentGroups,   setAttachmentGroups]   = useState([]);
  const [attachmentGroupId,  setAttachmentGroupId]  = useState("");
  const [useAttachmentGroup, setUseAttachmentGroup] = useState(false);

  const [to,       setTo]       = useState("");
  const [subject,  setSubject]  = useState("");
  const [body,     setBody]     = useState("");
  const [isHtml,   setIsHtml]   = useState(false);
  const [minDelay, setMinDelay] = useState("30");
  const [maxDelay, setMaxDelay] = useState("60");
  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef();

  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [sending,    setSending]    = useState(false);
  const [progress,   setProgress]   = useState(null);
  const [logs,       setLogs]       = useState([]);
  const logEndRef = useRef();

  useEffect(() => {
    // Load saved SMTP
    fetch("/api/smtp/load", { headers: authHeader })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.smtp) {
          const s = data.smtp;
          setSmtpHost(s.host || PRESETS.hostinger.host);
          setSmtpPort(String(s.port || 587));
          setSmtpUser(s.username || "");
          setSmtpPass(s.password || "");
          setFromName(s.from_name || "");
          setSmtpSaved(true);
          const match = Object.entries(PRESETS).find(([, p]) => p.host === s.host);
          setPreset(match ? match[0] : "custom");
        }
      }).catch(() => {});

    // Load sender groups
    fetch("/api/sender-groups", { headers: authHeader })
      .then(r => r.json())
      .then(data => { if (data.ok) setSenderGroups(data.groups); })
      .catch(() => {});

    // Load subject groups
    fetch("/api/subject-groups", { headers: authHeader })
      .then(r => r.json())
      .then(data => { if (data.ok) setSubjectGroups(data.groups); })
      .catch(() => {});

    // Load body groups
    fetch("/api/body-groups", { headers: authHeader })
      .then(r => r.json())
      .then(data => { if (data.ok) setBodyGroups(data.groups); })
      .catch(() => {});

    // Load attachment groups
    fetch("/api/attachment-groups", { headers: authHeader })
      .then(r => r.json())
      .then(data => { if (data.ok) setAttachmentGroups(data.groups); })
      .catch(() => {});
  }, []);

  useEffect(() => { if (location.state?.prefilledTo) setTo(location.state.prefilledTo); }, [location.state]);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [logs]);

  const addLog = (level, msg) =>
    setLogs(p => [...p, { level, msg, time: new Date().toLocaleTimeString("en-US", { hour12:false }) }]);

  const handlePreset = (key) => { setPreset(key); setSmtpHost(PRESETS[key].host); setSmtpPort(PRESETS[key].port); setTestResult(null); };

  const handleSaveSmtp = async () => {
    if (!smtpHost || !smtpUser || !smtpPass) return addLog("error", "❌ Fill in SMTP details first.");
    setSaving(true);
    try {
      const res  = await fetch("/api/smtp/save", { method:"POST", headers:{ ...authHeader, "Content-Type":"application/json" }, body:JSON.stringify({ host:smtpHost, port:smtpPort, username:smtpUser, password:smtpPass, fromName }) });
      const data = await res.json();
      if (data.ok) { setSmtpSaved(true); addLog("success", "✅ SMTP settings saved."); }
      else addLog("error", `❌ ${data.message}`);
    } catch { addLog("error", "❌ Failed to save."); }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!smtpHost || !smtpUser || !smtpPass) return addLog("error", "❌ Fill in SMTP details first.");
    setTesting(true); setTestResult(null);
    try {
      const res  = await fetch("/api/test-connection", { method:"POST", headers:{ ...authHeader, "Content-Type":"application/json" }, body:JSON.stringify({ smtpHost, smtpPort, smtpUser, smtpPass }) });
      const data = await res.json();
      setTestResult(data);
      addLog(data.ok ? "success" : "error", data.ok ? `✅ ${data.message}` : `❌ ${data.message}`);
    } catch (err) { setTestResult({ ok:false, message:err.message }); addLog("error", `❌ ${err.message}`); }
    setTesting(false);
  };

  const recipientList = parseEmails(to);
  const isBulk = recipientList.length > 1;

  const handleSend = async () => {
    if (!useSenderGroup && (!smtpHost || !smtpUser || !smtpPass)) return addLog("error", "❌ Fill in SMTP credentials or select a Sender Group.");
    if (useSenderGroup && !senderGroupId) return addLog("error", "❌ Select a Sender Group.");
    if (!to)      return addLog("error", "❌ Enter at least one recipient.");
    if (useSubjectGroup && !subjectGroupId) return addLog("error", "❌ Select a Subject Group.");
    if (!useSubjectGroup && !subject)       return addLog("error", "❌ Enter a subject or select a Subject Group.");
    if (useBodyGroup && !bodyGroupId)       return addLog("error", "❌ Select a Body Group.");
    if (!useBodyGroup && !body)             return addLog("error", "❌ Write a message body or select a Body Group.");
    if (useAttachmentGroup && !attachmentGroupId) return addLog("error", "❌ Select an Attachment Group.");
    if (recipientList.length === 0) return addLog("error", "❌ No valid emails found.");

    const min = parseFloat(minDelay)||30;
    const max = parseFloat(maxDelay)||60;
    if (min > max) return addLog("error", "❌ Min delay > max delay.");

    setSending(true);

    const selectedGroup = senderGroups.find(g => String(g.id) === String(senderGroupId));
    addLog("info", `🚀 Starting background campaign — ${recipientList.length} recipient(s)${useSenderGroup ? ` via "${selectedGroup?.name}"` : ""}...`);

    const fd = new FormData();
    if (!useSenderGroup) {
      fd.append("smtpHost", smtpHost); fd.append("smtpPort", smtpPort);
      fd.append("smtpUser", smtpUser); fd.append("smtpPass", smtpPass);
      fd.append("fromName", fromName);
    } else {
      fd.append("senderGroupId", senderGroupId);
    }
    fd.append("to", to);
    if (useSubjectGroup && subjectGroupId) {
      fd.append("subjectGroupId", subjectGroupId);
    } else {
      fd.append("subject", subject);
    }
    if (useBodyGroup && bodyGroupId) {
      fd.append("bodyGroupId", bodyGroupId);
    } else {
      fd.append("body",   body);
      fd.append("isHtml", isHtml ? "true" : "false");
    }
    fd.append("name", subject || "Campaign");
    fd.append("minDelay", min);    fd.append("maxDelay", max);
    if (useAttachmentGroup && attachmentGroupId) {
      fd.append("attachmentGroupId", attachmentGroupId);
    } else {
      attachments.forEach(f => fd.append("attachments", f, f.name));
    }

    try {
      const res  = await fetch("/api/campaigns", { method:"POST", headers: authHeader, body:fd });
      const data = await res.json();
      if (data.ok) {
        addLog("success", `✅ ${data.message}`);
        // The campaign now runs on the server. Jump to its live page; you can
        // close the browser and it keeps sending until paused or stopped.
        navigate(`/campaigns/${data.campaignId}`);
      } else {
        addLog("error", `❌ ${data.message}`);
      }
    } catch (err) { addLog("error", `❌ Network error: ${err.message}`); }
    setSending(false);
  };

  const addFiles = files => {
    const newFiles = Array.from(files);
    setAttachments(p => { const ex = new Set(p.map(f => f.name+f.size)); return [...p, ...newFiles.filter(f => !ex.has(f.name+f.size))]; });
  };

  const estMin = Math.round(recipientList.length>1?(recipientList.length-1)*parseFloat(minDelay||30):0);
  const estMax = Math.round(recipientList.length>1?(recipientList.length-1)*parseFloat(maxDelay||60):0);

  return (
    <div style={{ flex:1, display:"flex", minHeight:0 }}>

      {/* Sidebar */}
      <div style={{ width:310, borderRight:"1px solid var(--border)", background:"var(--surface)", display:"flex", flexDirection:"column", overflowY:"auto", flexShrink:0 }}>

        {/* Sender Mode Toggle */}
        <div style={{ padding:"16px 18px", borderBottom:"1px solid var(--border)" }}>
          <label style={S.label}>Sender Mode</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            <button onClick={() => setUseSenderGroup(false)}
              style={{ padding:"8px", borderRadius:"var(--radius)", border:"1px solid", cursor:"pointer", fontSize:12, fontWeight:600, transition:"all 0.15s",
                background: !useSenderGroup ? "var(--accent-dim)" : "transparent",
                borderColor: !useSenderGroup ? "var(--accent)" : "var(--border2)",
                color: !useSenderGroup ? "var(--accent)" : "var(--text3)" }}>
              Single SMTP
            </button>
            <button onClick={() => setUseSenderGroup(true)}
              style={{ padding:"8px", borderRadius:"var(--radius)", border:"1px solid", cursor:"pointer", fontSize:12, fontWeight:600, transition:"all 0.15s",
                background: useSenderGroup ? "rgba(0,255,135,0.1)" : "transparent",
                borderColor: useSenderGroup ? "var(--green)" : "var(--border2)",
                color: useSenderGroup ? "var(--green)" : "var(--text3)" }}>
              Sender Group
            </button>
          </div>
        </div>

        {/* Single SMTP */}
        {!useSenderGroup && (
          <div style={{ padding:"16px 18px", borderBottom:"1px solid var(--border)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Settings2 size={14} color="var(--accent)"/>
                <span style={{ fontWeight:600, fontSize:13 }}>SMTP Setup</span>
              </div>
              {smtpSaved && <span style={{ ...S.chip, background:"var(--green-dim)", color:"var(--green)" }}>✓ Saved</span>}
            </div>
            <Field label="Provider">
              <select value={preset} onChange={e => handlePreset(e.target.value)} style={S.select} onFocus={onFocus} onBlur={onBlur}>
                {Object.entries(PRESETS).map(([k,p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
            </Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 76px", gap:8, marginBottom:14 }}>
              <div><label style={S.label}>Host</label><input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.hostinger.com" style={S.input} onFocus={onFocus} onBlur={onBlur}/></div>
              <div><label style={S.label}>Port</label><input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" style={S.input} onFocus={onFocus} onBlur={onBlur}/></div>
            </div>
            <TextInput label="Username" value={smtpUser} onChange={setSmtpUser} placeholder="you@domain.com"/>
            <TextInput label="Password" type="password" value={smtpPass} onChange={setSmtpPass} placeholder="Password"/>
            <div style={S.divider}/>
            <label style={S.label}>Display Name (optional)</label>
            <TextInput placeholder="Your Name" value={fromName} onChange={setFromName} mono={false}/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:4 }}>
              <button onClick={handleTest} disabled={testing}
                style={{ ...S.btnSecondary, borderColor:testResult?.ok?"var(--green)":testResult?.ok===false?"var(--red)":"var(--border2)", color:testResult?.ok?"var(--green)":testResult?.ok===false?"var(--red)":"var(--text2)" }}>
                {testing?<><Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> Testing...</>:<><Wifi size={13}/> Test</>}
              </button>
              <button onClick={handleSaveSmtp} disabled={saving} style={S.btnSecondary}>
                {saving?<><Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> Saving...</>:<><Save size={13}/> Save</>}
              </button>
            </div>
            {testResult && (
              <div style={{ marginTop:9, padding:"8px 11px", borderRadius:"var(--radius)", fontSize:12, fontFamily:"var(--font-mono)", lineHeight:1.5, background:testResult.ok?"var(--green-dim)":"var(--red-dim)", color:testResult.ok?"var(--green)":"var(--red)" }}>
                {testResult.message}
              </div>
            )}
          </div>
        )}

        {/* Sender Group picker */}
        {useSenderGroup && (
          <div style={{ padding:"16px 18px", borderBottom:"1px solid var(--border)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
              <AtSign size={14} color="var(--green)"/>
              <span style={{ fontWeight:600, fontSize:13 }}>Select Sender Group</span>
            </div>
            {senderGroups.length === 0 ? (
              <div style={{ padding:"14px", background:"var(--surface2)", borderRadius:"var(--radius)", fontSize:12, color:"var(--text3)", lineHeight:1.6 }}>
                No sender groups yet.<br/>Go to <strong style={{ color:"var(--accent)" }}>Sender Groups</strong> page to create one and add your SMTP accounts.
              </div>
            ) : (
              <>
                <Field label="Sender Group">
                  <select value={senderGroupId} onChange={e => setSenderGroupId(e.target.value)} style={S.select} onFocus={onFocus} onBlur={onBlur}>
                    <option value="">— Select a group —</option>
                    {senderGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.account_count} accounts)</option>
                    ))}
                  </select>
                </Field>
                {senderGroupId && (
                  <div style={{ padding:"10px 12px", background:"rgba(0,255,135,0.06)", border:"1px solid rgba(0,255,135,0.2)", borderRadius:"var(--radius)", fontSize:12, color:"var(--green)", lineHeight:1.7 }}>
                    ✓ Each email will be sent from a randomly picked account in this group
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Delay */}
        <div style={{ padding:"16px 18px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <Clock size={14} color="var(--amber)"/>
            <span style={{ fontWeight:600, fontSize:13 }}>Send Delay</span>
          </div>
          <div style={{ fontSize:11, color:"var(--text3)", marginBottom:12 }}>Random delay between emails — avoids spam.</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div><label style={S.label}>Min (sec)</label><input value={minDelay} onChange={e => setMinDelay(e.target.value)} placeholder="30" style={S.input} type="number" min="1" onFocus={onFocus} onBlur={onBlur}/></div>
            <div><label style={S.label}>Max (sec)</label><input value={maxDelay} onChange={e => setMaxDelay(e.target.value)} placeholder="60" style={S.input} type="number" min="1" onFocus={onFocus} onBlur={onBlur}/></div>
          </div>
          {recipientList.length > 1 && (
            <div style={{ marginTop:10, padding:"8px 10px", background:"var(--amber-dim)", border:"1px solid rgba(255,183,3,0.2)", borderRadius:"var(--radius)", fontSize:11, color:"var(--amber)", fontFamily:"var(--font-mono)", lineHeight:1.7 }}>
              ⏱ {recipientList.length} recipients · Est. {estMin}s – {estMax}s
            </div>
          )}
        </div>

        {/* Attachments */}
        <div style={{ padding:"16px 18px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}><Paperclip size={14} color="var(--green)"/><span style={{ fontWeight:600, fontSize:13 }}>Attachments</span></div>
            <ModeToggle value={useAttachmentGroup} onChange={setUseAttachmentGroup}/>
          </div>

          {!useAttachmentGroup ? (
            <>
              <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                style={{ border:"2px dashed var(--border2)", borderRadius:"var(--radius)", padding:"16px", textAlign:"center", cursor:"pointer", color:"var(--text3)", transition:"all 0.15s", marginBottom:attachments.length?10:0 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="var(--accent)"; e.currentTarget.style.color="var(--accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border2)"; e.currentTarget.style.color="var(--text3)"; }}>
                <Upload size={17} style={{ display:"block", margin:"0 auto 5px" }}/>
                <div style={{ fontSize:12 }}>Drop or click to browse</div>
                <div style={{ fontSize:10, marginTop:3 }}>Max 25MB · same files sent to all</div>
              </div>
              <input ref={fileRef} type="file" multiple style={{ display:"none" }} onChange={e => { addFiles(e.target.files); e.target.value=""; }}/>
              {attachments.map(f => <FileChip key={f.name+f.size} file={f} onRemove={r => setAttachments(p => p.filter(x => x!==r))}/>)}
            </>
          ) : attachmentGroups.length === 0 ? (
            <div style={{ padding:"14px", background:"var(--surface2)", borderRadius:"var(--radius)", fontSize:12, color:"var(--text3)", lineHeight:1.6 }}>
              No attachment groups yet.<br/>Go to <strong style={{ color:"#f97316" }}>Attachment Groups</strong> page to create one and upload files.
            </div>
          ) : (
            <>
              <select value={attachmentGroupId} onChange={e => setAttachmentGroupId(e.target.value)} style={S.select} onFocus={onFocus} onBlur={onBlur}>
                <option value="">— Select an attachment group —</option>
                {attachmentGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.item_count} files)</option>)}
              </select>
              {attachmentGroupId && (
                <div style={{ marginTop:8, padding:"8px 12px", background:"rgba(249,115,22,0.08)", border:"1px solid rgba(249,115,22,0.25)", borderRadius:"var(--radius)", fontSize:12, color:"#f97316", lineHeight:1.6 }}>
                  ✓ Each recipient gets one random file from this group
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Compose + Log */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
        <div style={{ padding:"22px 28px", borderBottom:"1px solid var(--border)", overflowY:"auto" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
            <Mail size={16} color="var(--accent)"/>
            <span style={{ fontWeight:700, fontSize:16, letterSpacing:"-0.3px" }}>Compose Email</span>
          </div>

          <Field label={<span style={{ display:"flex", alignItems:"center", gap:6 }}>To{recipientList.length>0&&(<span style={{ ...S.chip, background:isBulk?"var(--amber-dim)":"var(--accent-dim)", color:isBulk?"var(--amber)":"var(--accent)", fontWeight:600 }}>{isBulk?<><Users size={10}/> {recipientList.length} recipients</>:"1 recipient"}</span>)}</span>}>
            <textarea value={to} onChange={e => setTo(e.target.value)}
              placeholder={"one@example.com\ntwo@example.com\n\nor use a Recipient Group from the Groups page"}
              style={{ ...S.textarea, minHeight:80 }} onFocus={onFocus} onBlur={onBlur}/>
            <div style={{ fontSize:11, color:"var(--text3)", marginTop:4 }}>One per line or comma-separated.</div>
          </Field>

          {/* ── Subject ── */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <label style={{ ...S.label, marginBottom:0 }}>Subject</label>
              <ModeToggle value={useSubjectGroup} onChange={setUseSubjectGroup}/>
            </div>
            {!useSubjectGroup ? (
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter subject..."
                style={{ ...S.input, fontFamily:"var(--font-display)" }} onFocus={onFocus} onBlur={onBlur}/>
            ) : subjectGroups.length === 0 ? (
              <div style={{ padding:"14px", background:"var(--surface2)", borderRadius:"var(--radius)", fontSize:12, color:"var(--text3)", lineHeight:1.6 }}>
                No subject groups yet.<br/>Go to <strong style={{ color:"#8b5cf6" }}>Subject Groups</strong> page to create one.
              </div>
            ) : (
              <>
                <select value={subjectGroupId} onChange={e => setSubjectGroupId(e.target.value)} style={S.select} onFocus={onFocus} onBlur={onBlur}>
                  <option value="">— Select a subject group —</option>
                  {subjectGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.item_count} subjects)</option>)}
                </select>
                {subjectGroupId && (
                  <div style={{ marginTop:8, padding:"8px 12px", background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.2)", borderRadius:"var(--radius)", fontSize:12, color:"#8b5cf6", lineHeight:1.6 }}>
                    ✓ Each recipient gets a randomly picked subject from this group
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Message Body ── */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <label style={{ ...S.label, marginBottom:0 }}>Message Body</label>
              <ModeToggle value={useBodyGroup} onChange={setUseBodyGroup}/>
            </div>
            {!useBodyGroup ? (
              <>
                <textarea value={body} onChange={e => setBody(e.target.value)}
                  placeholder={isHtml?"<p>Hello,</p>\n<p>Your message here...</p>":"Hello,\n\nYour message here...\n\nBest regards"}
                  style={{ ...S.textarea, minHeight:200 }} onFocus={onFocus} onBlur={onBlur}/>
                <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginTop:8 }}>
                  <input type="checkbox" checked={isHtml} onChange={e => setIsHtml(e.target.checked)} style={{ accentColor:"var(--accent)" }}/>
                  <span style={{ fontSize:12, color:"var(--text2)" }}>Send as HTML</span>
                  {isHtml && <span style={{ ...S.chip, background:"var(--accent-dim)", color:"var(--accent)" }}>HTML mode</span>}
                </label>
              </>
            ) : bodyGroups.length === 0 ? (
              <div style={{ padding:"14px", background:"var(--surface2)", borderRadius:"var(--radius)", fontSize:12, color:"var(--text3)", lineHeight:1.6 }}>
                No body groups yet.<br/>Go to <strong style={{ color:"#8b5cf6" }}>Body Groups</strong> page to create one.
              </div>
            ) : (
              <>
                <select value={bodyGroupId} onChange={e => setBodyGroupId(e.target.value)} style={S.select} onFocus={onFocus} onBlur={onBlur}>
                  <option value="">— Select a body group —</option>
                  {bodyGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.item_count} bodies)</option>)}
                </select>
                {bodyGroupId && (
                  <div style={{ marginTop:8, padding:"8px 12px", background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.2)", borderRadius:"var(--radius)", fontSize:12, color:"#8b5cf6", lineHeight:1.6 }}>
                    ✓ Each recipient gets a randomly picked body (with its own HTML setting) from this group
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {sending && progress && progress.total > 1 && (
          <div style={{ padding:"10px 28px", background:"var(--surface)", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)", marginBottom:6 }}>
              <span>Sending {progress.current} of {progress.total}</span>
              <span>{Math.round((progress.current/progress.total)*100)}%</span>
            </div>
            <div style={{ height:4, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", background:"var(--accent)", borderRadius:2, width:`${(progress.current/progress.total)*100}%`, transition:"width 0.4s ease" }}/>
            </div>
          </div>
        )}

        <div style={{ padding:"13px 28px", borderBottom:"1px solid var(--border)", display:"flex", gap:10, alignItems:"center", background:"var(--surface)", flexShrink:0 }}>
          <button onClick={handleSend} disabled={sending}
            style={{ ...S.btnPrimary, opacity:sending?0.6:1, boxShadow:!sending?"0 0 18px rgba(0,229,255,0.2)":"none", minWidth:160 }}>
            {sending?<><Loader2 size={15} style={{ animation:"spin 1s linear infinite" }}/> Starting...</>:<><Send size={15}/> {recipientList.length>0?`Start Campaign · ${recipientList.length}`:"Start Campaign"}</>}
          </button>
          <div style={{ flex:1 }}/>
          <button onClick={() => setLogs([])} style={S.btnSecondary}><RefreshCw size={12}/> Clear Log</button>
        </div>

        <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 18px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}><Terminal size={13} color="var(--accent)"/><span style={{ fontSize:12, fontWeight:600, color:"var(--text2)" }}>Activity Log</span></div>
            <span style={{ fontSize:10, fontFamily:"var(--font-mono)", color:"var(--text3)" }}>{logs.length} entries</span>
          </div>
          <div style={{ flex:1, overflow:"auto", fontFamily:"var(--font-mono)", fontSize:12, paddingTop:4, paddingBottom:4, minHeight:0 }}>
            {logs.length===0&&<div style={{ padding:"28px 18px", textAlign:"center", color:"var(--text3)", fontSize:12 }}>Test connection, then send — activity shows here.</div>}
            {logs.map((log,i) => <LogLine key={i} log={log}/>)}
            <div ref={logEndRef}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ITEM GROUPS PAGE (generic — used for both Subject Groups & Body Groups) ──
// cfg = { apiBase, title, subtitle, createTitle, createDesc, noun, nounPlural,
//         field, multiline, hasHtml, color, colorDim, colorFaint, icon }
function ItemGroupsPage({ authHeader, cfg }) {
  const [groups,      setGroups]      = useState([]);
  const [view,        setView]        = useState("list"); // list | create | detail
  const [activeGroup, setActiveGroup] = useState(null);
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState(null);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Add/edit item form
  const [itemText,  setItemText]  = useState("");
  const [itemHtml,  setItemHtml]  = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving,    setSaving]    = useState(false);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res  = await fetch(cfg.apiBase, { headers: authHeader });
      const data = await res.json();
      if (data.ok) setGroups(data.groups);
    } catch {}
    setLoading(false);
  };

  const loadGroup = async (g) => {
    try {
      const res  = await fetch(`${cfg.apiBase}/${g.id}`, { headers: authHeader });
      const data = await res.json();
      if (data.ok) { setActiveGroup(data.group); setItems(data.items); setView("detail"); }
    } catch {}
  };

  useEffect(() => { loadGroups(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return showMsg("error", "Group name is required.");
    try {
      const res  = await fetch(cfg.apiBase, { method:"POST", headers:{ ...authHeader, "Content-Type":"application/json" }, body:JSON.stringify({ name:newName, description:newDesc }) });
      const data = await res.json();
      if (data.ok) { showMsg("success", `${cfg.title.slice(0,-1)} created!`); setNewName(""); setNewDesc(""); setView("list"); loadGroups(); }
      else showMsg("error", data.message);
    } catch { showMsg("error", "Failed to create group."); }
  };

  const handleDelete = async (id) => {
    if (!confirm(`Delete this group and all its ${cfg.nounPlural}?`)) return;
    try {
      await fetch(`${cfg.apiBase}/${id}`, { method:"DELETE", headers: authHeader });
      showMsg("success", "Group deleted."); loadGroups();
    } catch {}
  };

  const resetForm = () => { setItemText(""); setItemHtml(false); setEditingId(null); };

  const buildPayload = () => ({ [cfg.field]: itemText, ...(cfg.hasHtml ? { isHtml: itemHtml } : {}) });

  const handleSaveItem = async () => {
    if (!itemText.trim()) return showMsg("error", `${cfg.noun[0].toUpperCase()+cfg.noun.slice(1)} is required.`);
    setSaving(true);
    try {
      if (editingId) {
        const res  = await fetch(`${cfg.apiBase}/${activeGroup.id}/items/${editingId}`, {
          method:"PUT", headers:{ ...authHeader, "Content-Type":"application/json" }, body: JSON.stringify(buildPayload()),
        });
        const data = await res.json();
        if (data.ok) { showMsg("success", `${cfg.noun[0].toUpperCase()+cfg.noun.slice(1)} updated.`); resetForm(); loadGroup(activeGroup); }
        else showMsg("error", data.message);
      } else {
        if (items.length >= 20) return showMsg("error", "Maximum 20 allowed.");
        const res  = await fetch(`${cfg.apiBase}/${activeGroup.id}/items`, {
          method:"POST", headers:{ ...authHeader, "Content-Type":"application/json" }, body: JSON.stringify(buildPayload()),
        });
        const data = await res.json();
        if (data.ok) { showMsg("success", `${cfg.noun[0].toUpperCase()+cfg.noun.slice(1)} added!`); resetForm(); loadGroup(activeGroup); }
        else showMsg("error", data.message);
      }
    } catch { showMsg("error", "Failed to save."); }
    setSaving(false);
  };

  const handleEdit = (it) => {
    setEditingId(it.id);
    setItemText(it[cfg.field]);
    if (cfg.hasHtml) setItemHtml(it.is_html);
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await fetch(`${cfg.apiBase}/${activeGroup.id}/items/${itemId}`, { method:"DELETE", headers: authHeader });
      setItems(p => p.filter(it => it.id !== itemId));
      showMsg("success", "Deleted.");
    } catch {}
  };

  return (
    <div style={{ flex:1, padding:"28px 32px", overflowY:"auto" }}>
      <Toast msg={msg}/>

      {/* List */}
      {view === "list" && (
        <>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px" }}>{cfg.title}</div>
              <div style={{ color:"var(--text3)", fontSize:13, marginTop:3 }}>{cfg.subtitle}</div>
            </div>
            <button onClick={() => setView("create")} style={{ ...S.btnPrimary }}><Plus size={15}/> New {cfg.title.slice(0,-1)}</button>
          </div>

          {loading && <div style={{ color:"var(--text3)", fontSize:13 }}>Loading...</div>}
          {!loading && groups.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text3)" }}>
              {cfg.icon(40, 0.3)}
              <div style={{ fontSize:15, fontWeight:600, marginBottom:6, marginTop:12 }}>No {cfg.title.toLowerCase()} yet</div>
              <div style={{ fontSize:13 }}>Create a group and add multiple {cfg.nounPlural} to rotate through.</div>
            </div>
          )}

          <div style={{ display:"grid", gap:12 }}>
            {groups.map(g => (
              <div key={g.id} style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 20px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", transition:"border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor="var(--border2)"}
                onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}>
                <div style={{ width:40, height:40, background:cfg.colorDim, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {cfg.icon(18)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{g.name}</div>
                  {g.description && <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>{g.description}</div>}
                  <div style={{ fontSize:11, color:"var(--text3)", marginTop:4, fontFamily:"var(--font-mono)" }}>
                    {g.item_count}/20 {cfg.nounPlural} · {new Date(g.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => loadGroup(g)} style={{ ...S.btnSecondary, fontSize:12, padding:"7px 14px" }}>
                    <ChevronRight size={14}/> Manage
                  </button>
                  <button onClick={() => handleDelete(g.id)} style={{ ...S.btnSecondary, fontSize:12, padding:"7px 10px" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="var(--red)"; e.currentTarget.style.color="var(--red)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border2)"; e.currentTarget.style.color="var(--text2)"; }}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create */}
      {view === "create" && (
        <>
          <button onClick={() => setView("list")} style={{ ...S.btnSecondary, marginBottom:24, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
          <div style={{ maxWidth:520 }}>
            <div style={{ fontWeight:800, fontSize:22, marginBottom:6 }}>Create {cfg.title.slice(0,-1)}</div>
            <div style={{ color:"var(--text3)", fontSize:13, marginBottom:24 }}>Name your group then add up to 20 {cfg.nounPlural}.</div>
            <div style={S.card}>
              <TextInput label="Group Name" value={newName} onChange={setNewName} placeholder={cfg.namePlaceholder} mono={false}/>
              <Field label="Description (optional)">
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What is this group for?"
                  style={{ ...S.input, fontFamily:"var(--font-display)" }} onFocus={onFocus} onBlur={onBlur}/>
              </Field>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={handleCreate} style={{ ...S.btnPrimary, flex:1 }}><Plus size={14}/> Create Group</button>
                <button onClick={() => setView("list")} style={S.btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Detail */}
      {view === "detail" && activeGroup && (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
            <button onClick={() => { setView("list"); resetForm(); loadGroups(); }} style={{ ...S.btnSecondary, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:22 }}>{activeGroup.name}</div>
              {activeGroup.description && <div style={{ color:"var(--text3)", fontSize:13 }}>{activeGroup.description}</div>}
            </div>
            <span style={{ ...S.chip, background:cfg.colorDim, color:cfg.color, fontSize:13, padding:"4px 12px" }}>
              {items.length}/20 {cfg.nounPlural}
            </span>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, alignItems:"start" }}>

            {/* Add/Edit form */}
            <div style={S.card}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                {editingId ? <Edit2 size={15} color={cfg.color}/> : <Plus size={15} color={cfg.color}/>}
                <span style={{ fontWeight:700, fontSize:15 }}>{editingId ? `Edit ${cfg.noun}` : `Add ${cfg.noun}`}</span>
                {editingId && (
                  <button onClick={resetForm} style={{ ...S.btnSecondary, padding:"3px 10px", fontSize:11, marginLeft:"auto" }}>
                    <X size={11}/> Cancel Edit
                  </button>
                )}
              </div>

              {cfg.multiline ? (
                <>
                  <Field label="Body Text">
                    <textarea value={itemText} onChange={e => setItemText(e.target.value)}
                      placeholder={itemHtml ? "<p>Hello,</p>\n<p>Your message here...</p>" : "Hello,\n\nYour message here...\n\nBest regards"}
                      style={{ ...S.textarea, minHeight:200 }} onFocus={onFocus} onBlur={onBlur}/>
                  </Field>
                  <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:14 }}>
                    <input type="checkbox" checked={itemHtml} onChange={e => setItemHtml(e.target.checked)} style={{ accentColor:cfg.color }}/>
                    <span style={{ fontSize:12, color:"var(--text2)" }}>HTML body</span>
                    {itemHtml && <span style={{ ...S.chip, background:cfg.colorDim, color:cfg.color }}>HTML</span>}
                  </label>
                </>
              ) : (
                <Field label="Subject Line">
                  <input value={itemText} onChange={e => setItemText(e.target.value)} placeholder="Enter a subject line..."
                    style={{ ...S.input, fontFamily:"var(--font-display)" }} onFocus={onFocus} onBlur={onBlur}/>
                </Field>
              )}

              <button onClick={handleSaveItem} disabled={saving || (!editingId && items.length >= 20)}
                style={{ ...S.btnPrimary, width:"100%", background:cfg.color, boxShadow:`0 0 18px ${cfg.colorDim}`, opacity:(saving || (!editingId && items.length >= 20)) ? 0.5 : 1 }}>
                {saving ? <><Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/> Saving...</>
                  : editingId ? <><CheckCircle size={14}/> Update</> : <><Plus size={14}/> Add {cfg.noun}</>}
              </button>

              {!editingId && items.length >= 20 && (
                <div style={{ marginTop:8, fontSize:11, color:"var(--amber)", textAlign:"center" }}>Maximum 20 {cfg.nounPlural} reached.</div>
              )}
            </div>

            {/* Items list */}
            <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
              <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontWeight:700, fontSize:15, textTransform:"capitalize" }}>{cfg.nounPlural}</span>
                <span style={{ ...S.chip, background:"var(--surface2)", color:"var(--text2)" }}>{items.length}/20</span>
              </div>

              {items.length === 0 && (
                <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--text3)", fontSize:13 }}>
                  No {cfg.nounPlural} yet. Add your first one on the left.
                </div>
              )}

              <div style={{ maxHeight:520, overflowY:"auto" }}>
                {items.map((it, i) => (
                  <div key={it.id} style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", background: editingId===it.id ? cfg.colorFaint : "transparent", transition:"background 0.15s" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                      <div style={{ width:24, height:24, borderRadius:6, background:cfg.colorDim, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:11, fontWeight:700, color:cfg.color, fontFamily:"var(--font-mono)" }}>
                        {i+1}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        {cfg.multiline ? (
                          <>
                            <div style={{ fontSize:12, color:"var(--text2)", lineHeight:1.5, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical" }}>
                              {it.is_html ? it.body.replace(/<[^>]+>/g, " ").trim() : it.body}
                            </div>
                            {it.is_html && <span style={{ ...S.chip, background:cfg.colorFaint, color:cfg.color, marginTop:4, fontSize:10 }}>HTML</span>}
                          </>
                        ) : (
                          <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {it.subject}
                          </div>
                        )}
                      </div>
                      <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                        <button onClick={() => handleEdit(it)}
                          style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:4 }}
                          onMouseEnter={e => e.currentTarget.style.color=cfg.color}
                          onMouseLeave={e => e.currentTarget.style.color="var(--text3)"}>
                          <Edit2 size={13}/>
                        </button>
                        <button onClick={() => handleDeleteItem(it.id)}
                          style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:4 }}
                          onMouseEnter={e => e.currentTarget.style.color="var(--red)"}
                          onMouseLeave={e => e.currentTarget.style.color="var(--text3)"}>
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {items.length > 0 && (
                <div style={{ padding:"12px 20px", background:cfg.colorFaint, borderTop:"1px solid var(--border)" }}>
                  <div style={{ fontSize:11, color:cfg.color, fontFamily:"var(--font-mono)" }}>
                    ✓ Each recipient gets a randomly picked {cfg.noun}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const SUBJECT_CFG = {
  apiBase:"/api/subject-groups", title:"Subject Groups", noun:"subject", nounPlural:"subjects",
  field:"subject", multiline:false, hasHtml:false,
  color:"#8b5cf6", colorDim:"rgba(139,92,246,0.15)", colorFaint:"rgba(139,92,246,0.06)",
  namePlaceholder:"e.g. Summer Subject Lines",
  subtitle:"Add up to 20 subject lines per group. Each recipient gets a randomly picked subject.",
  icon:(size, opacity) => <Type size={size} color="#8b5cf6" style={opacity ? { opacity, display:"block", margin:"0 auto" } : undefined}/>,
};

const BODY_CFG = {
  apiBase:"/api/body-groups", title:"Body Groups", noun:"body", nounPlural:"bodies",
  field:"body", multiline:true, hasHtml:true,
  color:"#0ea5e9", colorDim:"rgba(14,165,233,0.15)", colorFaint:"rgba(14,165,233,0.06)",
  namePlaceholder:"e.g. Summer Email Bodies",
  subtitle:"Add up to 20 message bodies per group. Each recipient gets a randomly picked body.",
  icon:(size, opacity) => <FileText size={size} color="#0ea5e9" style={opacity ? { opacity, display:"block", margin:"0 auto" } : undefined}/>,
};

function SubjectGroupsPage({ authHeader }) { return <ItemGroupsPage authHeader={authHeader} cfg={SUBJECT_CFG}/>; }
function BodyGroupsPage({ authHeader })    { return <ItemGroupsPage authHeader={authHeader} cfg={BODY_CFG}/>; }

// ─── ATTACHMENT GROUPS PAGE ───────────────────────────────────────────────────
const AC = "#f97316"; // orange accent for attachments
const fmtSize = (b) => b > 1048576 ? `${(b/1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b/1024))} KB`;

function AttachmentGroupsPage({ authHeader }) {
  const [groups,      setGroups]      = useState([]);
  const [view,        setView]        = useState("list");
  const [activeGroup, setActiveGroup] = useState(null);
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState(null);
  const [newName,     setNewName]     = useState("");
  const [newDesc,     setNewDesc]     = useState("");
  const [uploading,   setUploading]   = useState(false);
  const fileRef = useRef();

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/attachment-groups", { headers: authHeader });
      const data = await res.json();
      if (data.ok) setGroups(data.groups);
    } catch {}
    setLoading(false);
  };

  const loadGroup = async (g) => {
    try {
      const res  = await fetch(`/api/attachment-groups/${g.id}`, { headers: authHeader });
      const data = await res.json();
      if (data.ok) { setActiveGroup(data.group); setItems(data.items); setView("detail"); }
    } catch {}
  };

  useEffect(() => { loadGroups(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return showMsg("error", "Group name is required.");
    try {
      const res  = await fetch("/api/attachment-groups", { method:"POST", headers:{ ...authHeader, "Content-Type":"application/json" }, body:JSON.stringify({ name:newName, description:newDesc }) });
      const data = await res.json();
      if (data.ok) { showMsg("success", "Attachment group created!"); setNewName(""); setNewDesc(""); setView("list"); loadGroups(); }
      else showMsg("error", data.message);
    } catch { showMsg("error", "Failed to create group."); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this attachment group and all its files?")) return;
    try {
      await fetch(`/api/attachment-groups/${id}`, { method:"DELETE", headers: authHeader });
      showMsg("success", "Group deleted."); loadGroups();
    } catch {}
  };

  const handleUpload = async (files) => {
    const list = Array.from(files || []);
    if (list.length === 0) return;
    const room = 10 - items.length;
    if (room <= 0) return showMsg("error", "Maximum 10 attachments per group.");
    const toUpload = list.slice(0, room);
    setUploading(true);
    let added = 0, lastErr = "";
    for (const f of toUpload) {
      try {
        const fd = new FormData();
        fd.append("file", f, f.name);
        const res  = await fetch(`/api/attachment-groups/${activeGroup.id}/items`, { method:"POST", headers: authHeader, body: fd });
        const data = await res.json();
        if (data.ok) added++; else lastErr = data.message;
      } catch { lastErr = "Upload failed."; }
    }
    if (added)   showMsg("success", `${added} file(s) added.`);
    else if (lastErr) showMsg("error", lastErr);
    if (list.length > room) showMsg("error", `Only ${room} more allowed — extra files skipped.`);
    await loadGroup(activeGroup);
    setUploading(false);
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await fetch(`/api/attachment-groups/${activeGroup.id}/items/${itemId}`, { method:"DELETE", headers: authHeader });
      setItems(p => p.filter(it => it.id !== itemId));
      showMsg("success", "Attachment deleted.");
    } catch {}
  };

  return (
    <div style={{ flex:1, padding:"28px 32px", overflowY:"auto" }}>
      <Toast msg={msg}/>

      {/* List */}
      {view === "list" && (
        <>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px" }}>Attachment Groups</div>
              <div style={{ color:"var(--text3)", fontSize:13, marginTop:3 }}>Add up to 10 files per group. Each recipient gets a randomly picked attachment.</div>
            </div>
            <button onClick={() => setView("create")} style={{ ...S.btnPrimary }}><Plus size={15}/> New Attachment Group</button>
          </div>

          {loading && <div style={{ color:"var(--text3)", fontSize:13 }}>Loading...</div>}
          {!loading && groups.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text3)" }}>
              <Paperclip size={40} style={{ opacity:0.3, display:"block", margin:"0 auto 12px" }}/>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>No attachment groups yet</div>
              <div style={{ fontSize:13 }}>Create a group and upload files to rotate through.</div>
            </div>
          )}

          <div style={{ display:"grid", gap:12 }}>
            {groups.map(g => (
              <div key={g.id} style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 20px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", transition:"border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor="var(--border2)"}
                onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}>
                <div style={{ width:40, height:40, background:`${AC}22`, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Paperclip size={18} color={AC}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{g.name}</div>
                  {g.description && <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>{g.description}</div>}
                  <div style={{ fontSize:11, color:"var(--text3)", marginTop:4, fontFamily:"var(--font-mono)" }}>
                    {g.item_count}/10 files · {new Date(g.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => loadGroup(g)} style={{ ...S.btnSecondary, fontSize:12, padding:"7px 14px" }}><ChevronRight size={14}/> Manage</button>
                  <button onClick={() => handleDelete(g.id)} style={{ ...S.btnSecondary, fontSize:12, padding:"7px 10px" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="var(--red)"; e.currentTarget.style.color="var(--red)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border2)"; e.currentTarget.style.color="var(--text2)"; }}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create */}
      {view === "create" && (
        <>
          <button onClick={() => setView("list")} style={{ ...S.btnSecondary, marginBottom:24, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
          <div style={{ maxWidth:520 }}>
            <div style={{ fontWeight:800, fontSize:22, marginBottom:6 }}>Create Attachment Group</div>
            <div style={{ color:"var(--text3)", fontSize:13, marginBottom:24 }}>Name your group then upload up to 10 files.</div>
            <div style={S.card}>
              <TextInput label="Group Name" value={newName} onChange={setNewName} placeholder="e.g. Brochures" mono={false}/>
              <Field label="Description (optional)">
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What are these files for?"
                  style={{ ...S.input, fontFamily:"var(--font-display)" }} onFocus={onFocus} onBlur={onBlur}/>
              </Field>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={handleCreate} style={{ ...S.btnPrimary, flex:1 }}><Plus size={14}/> Create Group</button>
                <button onClick={() => setView("list")} style={S.btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Detail */}
      {view === "detail" && activeGroup && (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
            <button onClick={() => { setView("list"); loadGroups(); }} style={{ ...S.btnSecondary, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:22 }}>{activeGroup.name}</div>
              {activeGroup.description && <div style={{ color:"var(--text3)", fontSize:13 }}>{activeGroup.description}</div>}
            </div>
            <span style={{ ...S.chip, background:`${AC}22`, color:AC, fontSize:13, padding:"4px 12px" }}>{items.length}/10 files</span>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, alignItems:"start" }}>
            {/* Upload */}
            <div style={S.card}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                <Upload size={15} color={AC}/><span style={{ fontWeight:700, fontSize:15 }}>Upload Files</span>
              </div>
              <input ref={fileRef} type="file" multiple style={{ display:"none" }} onChange={e => { handleUpload(e.target.files); e.target.value=""; }}/>
              <div onClick={() => !uploading && items.length<10 && fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (!uploading && items.length<10) handleUpload(e.dataTransfer.files); }}
                style={{ border:`2px dashed ${items.length>=10?"var(--border)":"var(--border2)"}`, borderRadius:"var(--radius)", padding:"28px 16px", textAlign:"center", cursor: items.length>=10?"not-allowed":"pointer", color:"var(--text3)", transition:"all 0.15s" }}
                onMouseEnter={e => { if (items.length<10 && !uploading) { e.currentTarget.style.borderColor=AC; e.currentTarget.style.color=AC; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=items.length>=10?"var(--border)":"var(--border2)"; e.currentTarget.style.color="var(--text3)"; }}>
                {uploading ? <><Loader2 size={20} style={{ animation:"spin 1s linear infinite", display:"block", margin:"0 auto 6px" }}/> Uploading...</>
                  : items.length>=10 ? <div style={{ fontSize:13 }}>Group is full (10/10). Delete a file to add more.</div>
                  : <><Upload size={20} style={{ display:"block", margin:"0 auto 6px" }}/><div style={{ fontSize:13 }}>Drop files or click to browse</div><div style={{ fontSize:11, marginTop:3 }}>Up to 10 files · Max 25MB each</div></>}
              </div>
              <div style={{ fontSize:11, color:"var(--text3)", marginTop:12, lineHeight:1.6 }}>
                Each email in a campaign will include <strong style={{ color:AC }}>one random file</strong> from this group.
              </div>
            </div>

            {/* Files list */}
            <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
              <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontWeight:700, fontSize:15 }}>Files</span>
                <span style={{ ...S.chip, background:"var(--surface2)", color:"var(--text2)" }}>{items.length}/10</span>
              </div>
              {items.length === 0 && <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--text3)", fontSize:13 }}>No files yet. Upload on the left.</div>}
              <div style={{ maxHeight:520, overflowY:"auto" }}>
                {items.map((it, i) => (
                  <div key={it.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 20px", borderBottom:"1px solid var(--border)" }}>
                    <div style={{ width:26, height:26, borderRadius:6, background:`${AC}22`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:11, fontWeight:700, color:AC, fontFamily:"var(--font-mono)" }}>{i+1}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.filename}</div>
                      <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>{fmtSize(it.size)}{it.content_type ? ` · ${it.content_type}` : ""}</div>
                    </div>
                    <button onClick={() => handleDeleteItem(it.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:4 }}
                      onMouseEnter={e => e.currentTarget.style.color="var(--red)"}
                      onMouseLeave={e => e.currentTarget.style.color="var(--text3)"}><Trash2 size={13}/></button>
                  </div>
                ))}
              </div>
              {items.length > 0 && (
                <div style={{ padding:"12px 20px", background:`${AC}0f`, borderTop:"1px solid var(--border)" }}>
                  <div style={{ fontSize:11, color:AC, fontFamily:"var(--font-mono)" }}>✓ Each recipient gets a randomly picked file</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


// ─── TRACKING PAGE (list + summary) ───────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleString() : "—";

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ ...S.card, padding:"18px 20px", display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ width:44, height:44, borderRadius:12, background:`${color}22`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontWeight:800, fontSize:26, letterSpacing:"-0.5px", lineHeight:1, fontFamily:"var(--font-mono)" }}>{value}</div>
        <div style={{ fontSize:12, color:"var(--text3)", marginTop:4 }}>{label}</div>
      </div>
    </div>
  );
}

function TrackingPage({ authHeader }) {
  const navigate = useNavigate();
  const [emails,    setEmails]    = useState([]);
  const [summary,   setSummary]   = useState({ total_sent:0, total_opened:0, total_opens:0 });
  const [loading,   setLoading]   = useState(false);
  const [msg,       setMsg]       = useState(null);
  const [filter,    setFilter]    = useState("all");  // all | none | one | multi
  const [exporting, setExporting] = useState(false);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/tracking", { headers: authHeader });
      const data = await res.json();
      if (data.ok) { setEmails(data.emails); setSummary(data.summary); }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Delete this tracking record? Its open history will be lost.")) return;
    try {
      await fetch(`/api/tracking/${id}`, { method:"DELETE", headers: authHeader });
      showMsg("success", "Record deleted."); load();
    } catch {}
  };

  // Download the currently-filtered tracking list as an .xlsx (auth-aware blob).
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/tracking/export?filter=${filter}`, { headers: authHeader });
      if (!res.ok) { showMsg("error", "Export failed."); setExporting(false); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `tracking-${filter}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { showMsg("error", "Export failed."); }
    setExporting(false);
  };

  const openRate = summary.total_sent > 0 ? Math.round((summary.total_opened / summary.total_sent) * 100) : 0;

  // Seen filters
  const matchesFilter = (e) =>
    filter === "none"  ? e.open_count === 0 :
    filter === "one"   ? e.open_count === 1 :
    filter === "multi" ? e.open_count >  1 : true;
  const counts = {
    all:   emails.length,
    none:  emails.filter(e => e.open_count === 0).length,
    one:   emails.filter(e => e.open_count === 1).length,
    multi: emails.filter(e => e.open_count >  1).length,
  };
  const shown = emails.filter(matchesFilter);
  const FILTERS = [
    { key:"all",   label:"All" },
    { key:"none",  label:"Not Seen" },
    { key:"one",   label:"Seen Once" },
    { key:"multi", label:"Seen 2+" },
  ];

  return (
    <div style={{ flex:1, padding:"28px 32px", overflowY:"auto" }}>
      <Toast msg={msg}/>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px" }}>Email Tracking</div>
          <div style={{ color:"var(--text3)", fontSize:13, marginTop:3 }}>See whether and when each sent email was opened, and how many times.</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={handleExport} disabled={exporting || shown.length===0} style={{ ...S.btnSecondary, borderColor:"var(--green)", color:"var(--green)", opacity:(exporting||shown.length===0)?0.5:1 }}>
            {exporting ? <><Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> Exporting...</> : <><Download size={13}/> Export Excel</>}
          </button>
          <button onClick={load} style={{ ...S.btnSecondary }}><RefreshCw size={13}/> Refresh</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14, marginBottom:24 }}>
        <StatCard icon={<Send size={20} color="var(--accent)"/>}     label="Emails Sent"        value={summary.total_sent}   color="#00e5ff"/>
        <StatCard icon={<MailOpen size={20} color="var(--green)"/>}  label="Opened (unique)"    value={summary.total_opened} color="#00ff87"/>
        <StatCard icon={<Eye size={20} color="#8b5cf6"/>}            label="Total Opens"        value={summary.total_opens}  color="#8b5cf6"/>
        <StatCard icon={<BarChart3 size={20} color="var(--amber)"/>} label="Open Rate"          value={`${openRate}%`}        color="#ffb703"/>
      </div>

      {/* Seen filters */}
      {emails.length > 0 && (
        <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
          {FILTERS.map(f => {
            const isActive = filter === f.key;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 14px", borderRadius:100, border:"1px solid", cursor:"pointer", fontSize:12, fontWeight:600, transition:"all 0.15s",
                  background: isActive ? "var(--accent-dim)" : "transparent",
                  borderColor: isActive ? "var(--accent)" : "var(--border2)",
                  color: isActive ? "var(--accent)" : "var(--text3)" }}>
                {f.label}
                <span style={{ fontFamily:"var(--font-mono)", fontSize:11, padding:"1px 7px", borderRadius:100, background: isActive ? "var(--accent)" : "var(--surface2)", color: isActive ? "var(--bg)" : "var(--text3)" }}>{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading && <div style={{ color:"var(--text3)", fontSize:13 }}>Loading...</div>}
      {!loading && emails.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text3)" }}>
          <Activity size={40} style={{ opacity:0.3, display:"block", margin:"0 auto 12px" }}/>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>No tracked emails yet</div>
          <div style={{ fontSize:13 }}>Send an email from Compose — opens will appear here.</div>
        </div>
      )}
      {!loading && emails.length > 0 && shown.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 0", color:"var(--text3)", fontSize:13 }}>No emails match this filter.</div>
      )}

      {shown.length > 0 && (
        <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 2fr 90px 1.4fr 36px", gap:12, padding:"12px 20px", borderBottom:"1px solid var(--border)", fontSize:11, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", color:"var(--text3)" }}>
            <div>Recipient</div><div>Subject</div><div style={{ textAlign:"center" }}>Opens</div><div>Last Seen</div><div/>
          </div>
          {shown.map(em => (
            <div key={em.id} onClick={() => navigate(`/tracking/${em.id}`)}
              style={{ display:"grid", gridTemplateColumns:"2fr 2fr 90px 1.4fr 36px", gap:12, padding:"13px 20px", borderBottom:"1px solid var(--border)", alignItems:"center", cursor:"pointer", transition:"background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background="var(--surface2)"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>
              <div style={{ fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{em.recipient}</div>
              <div style={{ fontSize:13, color:"var(--text2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{em.subject || <span style={{ color:"var(--text3)" }}>—</span>}</div>
              <div style={{ textAlign:"center" }}>
                <span style={{ ...S.chip, justifyContent:"center", background: em.open_count>0 ? "var(--green-dim)" : "var(--surface2)", color: em.open_count>0 ? "var(--green)" : "var(--text3)" }}>
                  {em.open_count>0 ? <><Eye size={11}/> {em.open_count}</> : "—"}
                </span>
              </div>
              <div style={{ fontSize:12, color:"var(--text3)", fontFamily:"var(--font-mono)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fmtDate(em.last_opened_at)}</div>
              <button onClick={(e) => handleDelete(e, em.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:4 }}
                onMouseEnter={e => e.currentTarget.style.color="var(--red)"}
                onMouseLeave={e => e.currentTarget.style.color="var(--text3)"}><Trash2 size={13}/></button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop:14, fontSize:11, color:"var(--text3)", lineHeight:1.6 }}>
        ℹ️ Open tracking uses an invisible pixel. Some mail clients block or pre-load images, so counts are a strong signal but not 100% exact.
      </div>
    </div>
  );
}

// ─── TRACKING DETAIL PAGE (one email — every open with its time) ───────────────
function TrackingDetailPage({ authHeader }) {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [email,   setEmail]   = useState(null);
  const [opens,   setOpens]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res  = await fetch(`/api/tracking/${id}`, { headers: authHeader });
      const data = await res.json();
      if (data.ok) { setEmail(data.email); setOpens(data.opens); }
      else setError(data.message || "Not found.");
    } catch { setError("Failed to load."); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  return (
    <div style={{ flex:1, padding:"28px 32px", overflowY:"auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <button onClick={() => navigate("/tracking")} style={{ ...S.btnSecondary, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
        <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px" }}>Open History</div>
        <div style={{ flex:1 }}/>
        <button onClick={load} style={{ ...S.btnSecondary }}><RefreshCw size={13}/> Refresh</button>
      </div>

      {loading && <div style={{ color:"var(--text3)", fontSize:13 }}>Loading...</div>}
      {error && !loading && <div style={{ color:"var(--red)", fontSize:13 }}>{error}</div>}

      {email && !loading && (
        <>
          <div style={{ ...S.card, marginBottom:20 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px 24px" }}>
              <Meta label="Recipient"  value={email.recipient}/>
              <Meta label="From"       value={email.from_addr || "—"}/>
              <Meta label="Subject"    value={email.subject || "—"}/>
              <Meta label="Sent At"    value={fmtDate(email.sent_at)}/>
              <Meta label="First Seen" value={fmtDate(email.first_opened_at)}/>
              <Meta label="Last Seen"  value={fmtDate(email.last_opened_at)}/>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14, marginBottom:24 }}>
            <StatCard icon={<Eye size={20} color="#8b5cf6"/>}           label="Total Times Seen" value={email.open_count} color="#8b5cf6"/>
            <StatCard icon={<MailOpen size={20} color="var(--green)"/>} label="Status"           value={email.open_count>0 ? "Opened" : "Unseen"} color="#00ff87"/>
            <StatCard icon={<Clock size={20} color="var(--accent)"/>}   label="Logged Events"    value={opens.length} color="#00e5ff"/>
          </div>

          <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontWeight:700, fontSize:15 }}>All Seen Times</span>
              <span style={{ ...S.chip, background:"var(--surface2)", color:"var(--text2)" }}>{opens.length}</span>
            </div>
            {opens.length === 0 && (
              <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--text3)", fontSize:13 }}>
                Not opened yet. When the recipient opens this email, each view will be timestamped here.
              </div>
            )}
            <div style={{ maxHeight:460, overflowY:"auto" }}>
              {opens.map((o, i) => (
                <div key={o.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 20px", borderBottom:"1px solid var(--border)" }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:"rgba(139,92,246,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:11, fontWeight:700, color:"#8b5cf6", fontFamily:"var(--font-mono)" }}>
                    {opens.length - i}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontFamily:"var(--font-mono)" }}>{fmtDate(o.opened_at)}</div>
                    {o.user_agent && <div style={{ fontSize:11, color:"var(--text3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.user_agent}</div>}
                  </div>
                  {o.ip && <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)", flexShrink:0 }}>{o.ip}</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div style={S.label}>{label}</div>
      <div style={{ fontSize:13, color:"var(--text)", wordBreak:"break-word" }}>{value}</div>
    </div>
  );
}

// ─── CAMPAIGNS ────────────────────────────────────────────────────────────────
const CAMP_STATUS = {
  running:   { color:"var(--accent)", dim:"var(--accent-dim)", label:"Running" },
  paused:    { color:"var(--amber)",  dim:"var(--amber-dim)",  label:"Paused" },
  completed: { color:"var(--green)",  dim:"var(--green-dim)",  label:"Completed" },
  stopped:   { color:"var(--red)",    dim:"var(--red-dim)",    label:"Stopped" },
};

function StatusBadge({ status }) {
  const s = CAMP_STATUS[status] || { color:"var(--text3)", dim:"var(--surface2)", label:status };
  return <span style={{ ...S.chip, background:s.dim, color:s.color, fontWeight:700 }}>
    {status==="running" && <Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/>}{s.label}
  </span>;
}

function ProgressBar({ sent, failed, total, color }) {
  const pct  = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
  const sPct = total > 0 ? (sent / total) * 100 : 0;
  const fPct = total > 0 ? (failed / total) * 100 : 0;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)", marginBottom:5 }}>
        <span>{sent + failed} / {total} processed</span><span>{pct}%</span>
      </div>
      <div style={{ height:6, background:"var(--border)", borderRadius:3, overflow:"hidden", display:"flex" }}>
        <div style={{ height:"100%", background:color||"var(--green)", width:`${sPct}%`, transition:"width 0.4s ease" }}/>
        <div style={{ height:"100%", background:"var(--red)", width:`${fPct}%`, transition:"width 0.4s ease" }}/>
      </div>
    </div>
  );
}

function CampaignsPage({ authHeader }) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [msg,       setMsg]       = useState(null);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const load = async () => {
    try {
      const res  = await fetch("/api/campaigns", { headers: authHeader });
      const data = await res.json();
      if (data.ok) setCampaigns(data.campaigns);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);

  const action = async (id, verb) => {
    try {
      const method = verb === "delete" ? "DELETE" : "POST";
      const url = verb === "delete" ? `/api/campaigns/${id}` : `/api/campaigns/${id}/${verb}`;
      const res  = await fetch(url, { method, headers: authHeader });
      const data = await res.json();
      showMsg(data.ok ? "success" : "error", data.message);
      load();
    } catch { showMsg("error", "Action failed."); }
  };

  const del = (e, id) => { e.stopPropagation(); if (confirm("Delete this campaign? It will stop sending and its history is removed.")) action(id, "delete"); };

  return (
    <div style={{ flex:1, padding:"28px 32px", overflowY:"auto" }}>
      <Toast msg={msg}/>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px" }}>Campaigns</div>
          <div style={{ color:"var(--text3)", fontSize:13, marginTop:3 }}>Campaigns run on the server. You can close this site — sending continues until you pause or stop it.</div>
        </div>
        <button onClick={() => navigate("/compose")} style={{ ...S.btnPrimary }}><Plus size={15}/> New Campaign</button>
      </div>

      {loading && <div style={{ color:"var(--text3)", fontSize:13 }}>Loading...</div>}
      {!loading && campaigns.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text3)" }}>
          <Send size={40} style={{ opacity:0.3, display:"block", margin:"0 auto 12px" }}/>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>No campaigns yet</div>
          <div style={{ fontSize:13 }}>Start one from the Compose page.</div>
        </div>
      )}

      <div style={{ display:"grid", gap:12 }}>
        {campaigns.map(c => {
          const s = CAMP_STATUS[c.status] || {};
          const active = c.status === "running" || c.status === "paused";
          return (
            <div key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)}
              style={{ padding:"16px 20px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", cursor:"pointer", transition:"border-color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor="var(--border2)"}
              onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                <div style={{ fontWeight:700, fontSize:15, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name || `Campaign #${c.id}`}</div>
                <StatusBadge status={c.status}/>
                <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <ProgressBar sent={c.sent_count} failed={c.failed_count} total={c.total} color={s.color}/>
              <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:10 }}>
                <span style={{ fontSize:12, color:"var(--green)", fontFamily:"var(--font-mono)" }}>✓ {c.sent_count} sent</span>
                <span style={{ fontSize:12, color:"var(--red)", fontFamily:"var(--font-mono)" }}>✗ {c.failed_count} failed</span>
                <span style={{ fontSize:12, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>{c.total} total</span>
                <div style={{ flex:1 }}/>
                {c.status === "running" && <button onClick={e => { e.stopPropagation(); action(c.id, "pause"); }} style={{ ...S.btnSecondary, fontSize:12, padding:"6px 12px" }}>⏸ Pause</button>}
                {c.status === "paused"  && <button onClick={e => { e.stopPropagation(); action(c.id, "resume"); }} style={{ ...S.btnSecondary, fontSize:12, padding:"6px 12px", borderColor:"var(--accent)", color:"var(--accent)" }}>▶ Resume</button>}
                {active && <button onClick={e => { e.stopPropagation(); action(c.id, "stop"); }} style={{ ...S.btnSecondary, fontSize:12, padding:"6px 12px", borderColor:"var(--red)", color:"var(--red)" }}>⏹ Stop</button>}
                {!active && <button onClick={e => del(e, c.id)} style={{ ...S.btnSecondary, fontSize:12, padding:"6px 10px" }}><Trash2 size={13}/></button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CampaignDetailPage({ authHeader }) {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [recent,   setRecent]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [msg,      setMsg]      = useState(null);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const load = async () => {
    try {
      const res  = await fetch(`/api/campaigns/${id}`, { headers: authHeader });
      const data = await res.json();
      if (data.ok) { setCampaign(data.campaign); setRecent(data.recent); }
      else setError(data.message || "Not found.");
    } catch { setError("Failed to load."); }
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 2000); return () => clearInterval(t); }, [id]);

  const action = async (verb) => {
    try {
      const res  = await fetch(`/api/campaigns/${id}/${verb}`, { method:"POST", headers: authHeader });
      const data = await res.json();
      showMsg(data.ok ? "success" : "error", data.message);
      load();
    } catch { showMsg("error", "Action failed."); }
  };

  const s = campaign ? (CAMP_STATUS[campaign.status] || {}) : {};
  const active = campaign && (campaign.status === "running" || campaign.status === "paused");

  return (
    <div style={{ flex:1, padding:"28px 32px", overflowY:"auto" }}>
      <Toast msg={msg}/>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <button onClick={() => navigate("/campaigns")} style={{ ...S.btnSecondary, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
        <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {campaign ? (campaign.name || `Campaign #${campaign.id}`) : "Campaign"}
        </div>
        {campaign && <StatusBadge status={campaign.status}/>}
      </div>

      {loading && !campaign && <div style={{ color:"var(--text3)", fontSize:13 }}>Loading...</div>}
      {error && !campaign && <div style={{ color:"var(--red)", fontSize:13 }}>{error}</div>}

      {campaign && (
        <>
          <div style={{ ...S.card, marginBottom:20 }}>
            <ProgressBar sent={campaign.sent_count} failed={campaign.failed_count} total={campaign.total} color={s.color}/>
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              {campaign.status === "running" && <button onClick={() => action("pause")}  style={{ ...S.btnSecondary }}>⏸ Pause</button>}
              {campaign.status === "paused"  && <button onClick={() => action("resume")} style={{ ...S.btnPrimary }}>▶ Resume</button>}
              {active && <button onClick={() => action("stop")} style={{ ...S.btnSecondary, borderColor:"var(--red)", color:"var(--red)" }}>⏹ Stop</button>}
              <div style={{ flex:1 }}/>
              {active && <span style={{ fontSize:12, color:"var(--text3)", alignSelf:"center" }}>Auto-refreshing every 2s — safe to close the browser.</span>}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14, marginBottom:24 }}>
            <StatCard icon={<Send size={20} color="var(--accent)"/>}    label="Total"  value={campaign.total}        color="#00e5ff"/>
            <StatCard icon={<CheckCircle size={20} color="var(--green)"/>} label="Sent" value={campaign.sent_count}  color="#00ff87"/>
            <StatCard icon={<AlertCircle size={20} color="var(--red)"/>}  label="Failed" value={campaign.failed_count} color="#ff4d6d"/>
            <StatCard icon={<Clock size={20} color="var(--amber)"/>}     label="Remaining" value={Math.max(0, campaign.total - campaign.sent_count - campaign.failed_count)} color="#ffb703"/>
          </div>

          <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontWeight:700, fontSize:15 }}>Recent Activity</span>
              <span style={{ ...S.chip, background:"var(--surface2)", color:"var(--text2)" }}>last {recent.length}</span>
            </div>
            {recent.length === 0 && <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--text3)", fontSize:13 }}>No emails processed yet.</div>}
            <div style={{ maxHeight:460, overflowY:"auto", fontFamily:"var(--font-mono)", fontSize:12 }}>
              {recent.map((r, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 20px", borderBottom:"1px solid var(--border)", color: r.status==="sent" ? "var(--green)" : "var(--red)" }}>
                  <span style={{ flexShrink:0 }}>{r.status==="sent" ? "✅" : "❌"}</span>
                  <span style={{ flex:1, minWidth:0, color:"var(--text2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.email}</span>
                  {r.from_addr && <span style={{ color:"var(--text3)", flexShrink:0 }}>← {r.from_addr}</span>}
                  <span style={{ color:"var(--text3)", flexShrink:0 }}>{r.sent_at ? new Date(r.sent_at).toLocaleTimeString() : ""}</span>
                  {r.status!=="sent" && r.error && <span style={{ color:"var(--red)", flexShrink:0, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={r.error}>{r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── EMAIL VERIFIER ─────────────────────────────────────────────────────────────
const VERIFY_CATS = {
  valid:     { label:"Verified",     color:"var(--green)", dim:"var(--green-dim)", icon:<MailCheck size={14}/> },
  risky:     { label:"Risky",        color:"var(--amber)", dim:"var(--amber-dim)", icon:<MailQuestion size={14}/> },
  invalid:   { label:"Not Verified", color:"var(--red)",   dim:"var(--red-dim)",   icon:<MailX size={14}/> },
  duplicate: { label:"Duplicate",    color:"var(--text3)", dim:"var(--surface2)",  icon:<Copy size={14}/> },
};

function VerifyProgressBar({ batch }) {
  const total = batch.total || 0;
  const pct = total > 0 ? Math.round((batch.checked / total) * 100) : 0;
  const seg = (n) => total > 0 ? (n / total) * 100 : 0;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)", marginBottom:5 }}>
        <span>{batch.checked} / {total} checked</span><span>{pct}%</span>
      </div>
      <div style={{ height:6, background:"var(--border)", borderRadius:3, overflow:"hidden", display:"flex" }}>
        <div style={{ height:"100%", background:"var(--green)", width:`${seg(batch.valid_count)}%`, transition:"width 0.4s ease" }}/>
        <div style={{ height:"100%", background:"var(--amber)", width:`${seg(batch.risky_count)}%`, transition:"width 0.4s ease" }}/>
        <div style={{ height:"100%", background:"var(--red)",   width:`${seg(batch.invalid_count)}%`, transition:"width 0.4s ease" }}/>
        <div style={{ height:"100%", background:"var(--text3)", width:`${seg(batch.duplicate_count)}%`, transition:"width 0.4s ease" }}/>
      </div>
    </div>
  );
}

function EmailVerifierPage({ authHeader }) {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef();

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const load = async () => {
    try {
      const res  = await fetch("/api/verify/batches", { headers: authHeader });
      const data = await res.json();
      if (data.ok) setBatches(data.batches);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res  = await fetch("/api/verify/upload", { method:"POST", headers: authHeader, body: fd });
      const data = await res.json();
      if (data.ok) { showMsg("success", data.message); navigate(`/email-verifier/${data.batch.id}`); }
      else showMsg("error", data.message);
    } catch { showMsg("error", "Upload failed."); }
    setUploading(false);
  };

  const del = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Delete this batch and all its results?")) return;
    try {
      await fetch(`/api/verify/batches/${id}`, { method:"DELETE", headers: authHeader });
      showMsg("success", "Batch deleted."); load();
    } catch {}
  };

  return (
    <div style={{ flex:1, padding:"28px 32px", overflowY:"auto" }}>
      <Toast msg={msg}/>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px" }}>Email Verifier</div>
          <div style={{ color:"var(--text3)", fontSize:13, marginTop:3 }}>Upload a spreadsheet — every email is checked for valid format and a working mail domain before you send.</div>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }}
          onChange={e => { handleUpload(e.target.files[0]); e.target.value=""; }}/>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...S.btnPrimary, opacity:uploading?0.6:1 }}>
          {uploading ? <><Loader2 size={15} style={{ animation:"spin 1s linear infinite" }}/> Uploading...</> : <><Upload size={15}/> Upload List to Verify</>}
        </button>
      </div>

      <div style={{ ...S.card, marginBottom:20, display:"flex", gap:20, fontSize:12, color:"var(--text3)", lineHeight:1.6 }}>
        <ShieldCheck size={28} color="var(--accent)" style={{ flexShrink:0 }}/>
        <div>
          Each address is checked for correct syntax and a live mail server (MX/DNS lookup) on its domain, plus flags for disposable and role-based
          addresses (info@, admin@, etc). This catches typos, dead domains, and junk addresses before you send — it isn't a guarantee that a specific
          inbox is currently active, since most mail providers don't allow that to be checked remotely.
        </div>
      </div>

      {loading && <div style={{ color:"var(--text3)", fontSize:13 }}>Loading...</div>}
      {!loading && batches.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text3)" }}>
          <ShieldCheck size={40} style={{ opacity:0.3, display:"block", margin:"0 auto 12px" }}/>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>No verification batches yet</div>
          <div style={{ fontSize:13 }}>Upload an Excel or CSV file of email addresses to get started.</div>
        </div>
      )}

      <div style={{ display:"grid", gap:12 }}>
        {batches.map(b => {
          const s = CAMP_STATUS[b.status] || {};
          return (
            <div key={b.id} onClick={() => navigate(`/email-verifier/${b.id}`)}
              style={{ padding:"16px 20px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", cursor:"pointer", transition:"border-color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor="var(--border2)"}
              onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                <div style={{ fontWeight:700, fontSize:15, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.name || `Batch #${b.id}`}</div>
                <StatusBadge status={b.status}/>
                <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>{new Date(b.created_at).toLocaleString()}</span>
                <button onClick={e => del(e, b.id)} style={{ ...S.btnSecondary, fontSize:12, padding:"6px 10px" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor="var(--red)"; e.currentTarget.style.color="var(--red)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border2)"; e.currentTarget.style.color="var(--text2)"; }}>
                  <Trash2 size={13}/>
                </button>
              </div>
              <VerifyProgressBar batch={b}/>
              <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:10, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, color:"var(--green)", fontFamily:"var(--font-mono)" }}>✓ {b.valid_count} verified</span>
                <span style={{ fontSize:12, color:"var(--amber)", fontFamily:"var(--font-mono)" }}>? {b.risky_count} risky</span>
                <span style={{ fontSize:12, color:"var(--red)", fontFamily:"var(--font-mono)" }}>✗ {b.invalid_count} not verified</span>
                <span style={{ fontSize:12, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>⧉ {b.duplicate_count} duplicate</span>
                <span style={{ fontSize:12, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>{b.total} total</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmailVerifierDetailPage({ authHeader }) {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [batch,   setBatch]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [msg,     setMsg]     = useState(null);
  const [cat,     setCat]     = useState("all");
  const [results, setResults] = useState([]);
  const [offset,  setOffset]  = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [resLoading, setResLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sendingToCompose, setSendingToCompose] = useState(false);
  const PAGE = 100;

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const loadBatch = async () => {
    try {
      const res  = await fetch(`/api/verify/batches/${id}`, { headers: authHeader });
      const data = await res.json();
      if (data.ok) setBatch(data.batch); else setError(data.message || "Not found.");
    } catch { setError("Failed to load."); }
    setLoading(false);
  };

  const loadResults = async (newCat, newOffset) => {
    setResLoading(true);
    try {
      const qs = new URLSearchParams({ status:newCat, limit:PAGE, offset:newOffset });
      const res  = await fetch(`/api/verify/batches/${id}/results?${qs}`, { headers: authHeader });
      const data = await res.json();
      if (data.ok) {
        setResults(prev => newOffset === 0 ? data.results : [...prev, ...data.results]);
        setHasMore(data.results.length === PAGE);
      }
    } catch {}
    setResLoading(false);
  };

  useEffect(() => { loadBatch(); const t = setInterval(loadBatch, 2500); return () => clearInterval(t); }, [id]);
  useEffect(() => { setOffset(0); loadResults(cat, 0); }, [cat, id]);

  const action = async (verb) => {
    try {
      const res  = await fetch(`/api/verify/batches/${id}/${verb}`, { method:"POST", headers: authHeader });
      const data = await res.json();
      showMsg(data.ok ? "success" : "error", data.message);
      loadBatch();
    } catch { showMsg("error", "Action failed."); }
  };

  const loadMore = () => { const next = offset + PAGE; setOffset(next); loadResults(cat, next); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/verify/batches/${id}/export?status=${cat}`, { headers: authHeader });
      if (!res.ok) { showMsg("error", "Export failed."); setExporting(false); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `${(batch?.name || "verified-emails").replace(/[^a-zA-Z0-9._-]+/g, "_")}_${cat}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { showMsg("error", "Export failed."); }
    setExporting(false);
  };

  // Pulls every "valid" address (paging past the 500-per-request server cap)
  // and hands them to Compose, so only addresses that are safe to send to go through.
  const sendVerifiedToCompose = async () => {
    setSendingToCompose(true);
    try {
      let all = [], off = 0;
      while (true) {
        const qs = new URLSearchParams({ status:"valid", limit:500, offset:off });
        const res  = await fetch(`/api/verify/batches/${id}/results?${qs}`, { headers: authHeader });
        const data = await res.json();
        if (!data.ok || data.results.length === 0) break;
        all = all.concat(data.results.map(r => r.email));
        if (data.results.length < 500) break;
        off += 500;
      }
      if (all.length === 0) { showMsg("error", "No verified emails to send to yet."); setSendingToCompose(false); return; }
      navigate("/compose", { state: { prefilledTo: all.join("\n") } });
    } catch { showMsg("error", "Failed to load verified emails."); }
    setSendingToCompose(false);
  };

  const s = batch ? (CAMP_STATUS[batch.status] || {}) : {};
  const active = batch && (batch.status === "running" || batch.status === "paused");

  return (
    <div style={{ flex:1, padding:"28px 32px", overflowY:"auto" }}>
      <Toast msg={msg}/>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <button onClick={() => navigate("/email-verifier")} style={{ ...S.btnSecondary, width:"fit-content" }}><ArrowLeft size={13}/> Back</button>
        <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {batch ? (batch.name || `Batch #${batch.id}`) : "Verification Batch"}
        </div>
        {batch && <StatusBadge status={batch.status}/>}
      </div>

      {loading && !batch && <div style={{ color:"var(--text3)", fontSize:13 }}>Loading...</div>}
      {error && !batch && <div style={{ color:"var(--red)", fontSize:13 }}>{error}</div>}

      {batch && (
        <>
          <div style={{ ...S.card, marginBottom:20 }}>
            <VerifyProgressBar batch={batch}/>
            <div style={{ display:"flex", gap:10, marginTop:16, flexWrap:"wrap" }}>
              {batch.status === "running" && <button onClick={() => action("pause")}  style={{ ...S.btnSecondary }}>⏸ Pause</button>}
              {batch.status === "paused"  && <button onClick={() => action("resume")} style={{ ...S.btnPrimary }}>▶ Resume</button>}
              {active && <button onClick={() => action("stop")} style={{ ...S.btnSecondary, borderColor:"var(--red)", color:"var(--red)" }}>⏹ Stop</button>}
              <div style={{ flex:1 }}/>
              <button onClick={sendVerifiedToCompose} disabled={sendingToCompose || batch.valid_count===0}
                style={{ ...S.btnPrimary, opacity:(sendingToCompose||batch.valid_count===0)?0.5:1 }}>
                {sendingToCompose ? <><Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/> Loading...</> : <><Send size={14}/> Send Verified to Compose</>}
              </button>
              {active && <span style={{ fontSize:12, color:"var(--text3)", alignSelf:"center" }}>Auto-refreshing — safe to close the browser.</span>}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:14, marginBottom:24 }}>
            <StatCard icon={<ListChecks size={20} color="var(--accent)"/>}  label="Total"        value={batch.total}          color="#00e5ff"/>
            <StatCard icon={<MailCheck size={20} color="var(--green)"/>}    label="Verified"     value={batch.valid_count}    color="#00ff87"/>
            <StatCard icon={<MailQuestion size={20} color="var(--amber)"/>} label="Risky"         value={batch.risky_count}    color="#ffb703"/>
            <StatCard icon={<MailX size={20} color="var(--red)"/>}          label="Not Verified"  value={batch.invalid_count}  color="#ff4d6d"/>
            <StatCard icon={<Copy size={20} color="var(--text3)"/>}         label="Duplicate"     value={batch.duplicate_count} color="#8a94a6"/>
          </div>

          <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              {[["all","All"], ["valid","Verified"], ["risky","Risky"], ["invalid","Not Verified"], ["duplicate","Duplicate"]].map(([key,label]) => (
                <button key={key} onClick={() => setCat(key)}
                  style={{ ...S.btnSecondary, padding:"6px 14px", fontSize:12,
                    background: cat===key ? (VERIFY_CATS[key]?.dim || "var(--accent-dim)") : "transparent",
                    color: cat===key ? (VERIFY_CATS[key]?.color || "var(--accent)") : "var(--text3)",
                    borderColor: cat===key ? (VERIFY_CATS[key]?.color || "var(--accent)") : "var(--border2)" }}>
                  {label}
                </button>
              ))}
              <div style={{ flex:1 }}/>
              <button onClick={handleExport} disabled={exporting || results.length===0} style={{ ...S.btnSecondary, fontSize:12, padding:"7px 14px", opacity:(exporting||results.length===0)?0.5:1 }}>
                {exporting ? <><Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> Exporting...</> : <><Download size={13}/> Export {cat==="all"?"All":VERIFY_CATS[cat]?.label}</>}
              </button>
            </div>
            {results.length === 0 && !resLoading && <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--text3)", fontSize:13 }}>No results in this category yet.</div>}
            <div style={{ maxHeight:460, overflowY:"auto", fontFamily:"var(--font-mono)", fontSize:12 }}>
              {results.map(r => {
                const c = VERIFY_CATS[r.status];
                return (
                  <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 20px", borderBottom:"1px solid var(--border)" }}>
                    {c && <span style={{ ...S.chip, background:c.dim, color:c.color, fontWeight:700, flexShrink:0 }}>{c.icon}{c.label}</span>}
                    {!c && <span style={{ ...S.chip, background:"var(--surface2)", color:"var(--text3)", flexShrink:0 }}>Pending</span>}
                    <span style={{ flex:1, minWidth:0, color:"var(--text2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.email}</span>
                    {r.reason && <span style={{ color:"var(--text3)", flexShrink:0, maxWidth:280, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={r.reason}>{r.reason}</span>}
                  </div>
                );
              })}
            </div>
            {hasMore && (
              <div style={{ padding:"12px 20px", borderTop:"1px solid var(--border)", textAlign:"center" }}>
                <button onClick={loadMore} disabled={resLoading} style={{ ...S.btnSecondary, fontSize:12, padding:"7px 16px" }}>
                  {resLoading ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function MainApp({ user, token, onLogout }) {
  const authHeader = { "Authorization": `Bearer ${token}` };

  const NAV = [
    { to:"/compose",          label:"Compose",           icon:<Mail size={13}/> },
    { to:"/campaigns",        label:"Campaigns",         icon:<Send size={13}/> },
    { to:"/subject-groups",   label:"Subject Groups",    icon:<Type size={13}/> },
    { to:"/body-groups",      label:"Body Groups",       icon:<FileText size={13}/> },
    { to:"/attachment-groups",label:"Attachment Groups", icon:<Paperclip size={13}/> },
    { to:"/sender-groups",    label:"Sender Groups",     icon:<AtSign size={13}/> },
    { to:"/recipient-groups", label:"Recipient Groups",  icon:<Users size={13}/> },
    { to:"/email-verifier",   label:"Email Verifier",    icon:<ShieldCheck size={13}/> },
    { to:"/tracking",         label:"Tracking",          icon:<Activity size={13}/> },
  ];

  const navStyle = ({ isActive }) => ({
    display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:"var(--radius)", border:"none", cursor:"pointer",
    textDecoration:"none", fontFamily:"var(--font-display)", fontWeight:600, fontSize:13, transition:"all 0.15s",
    background: isActive ? "var(--accent-dim)" : "transparent",
    color: isActive ? "var(--accent)" : "var(--text3)",
  });

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"var(--bg)", fontFamily:"var(--font-display)" }}>
      <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 28px", borderBottom:"1px solid var(--border)", background:"rgba(8,11,15,0.97)", backdropFilter:"blur(12px)", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, fontWeight:800, fontSize:20, letterSpacing:"-0.5px" }}>
          <div style={{ width:32, height:32, background:"var(--accent)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--bg)" }}><Zap size={17}/></div>
          MailBlast
          <span style={{ fontSize:10, fontFamily:"var(--font-mono)", padding:"2px 7px", background:"var(--accent-dim)", color:"var(--accent)", borderRadius:100, border:"1px solid rgba(0,229,255,0.3)", marginLeft:4 }}>v4</span>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} style={navStyle}>{n.icon}{n.label}</NavLink>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 12px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius)", fontSize:13 }}>
            <User size={13} color="var(--accent)"/>
            <span style={{ color:"var(--text2)" }}>{user.name}</span>
          </div>
          <button onClick={onLogout} style={{ ...S.btnSecondary, padding:"6px 12px", fontSize:12 }}
            onMouseEnter={e => e.currentTarget.style.borderColor="var(--red)"}
            onMouseLeave={e => e.currentTarget.style.borderColor="var(--border2)"}>
            <LogOut size={13}/> Logout
          </button>
        </div>
      </header>

      <Routes>
        <Route path="/"                 element={<Navigate to="/compose" replace/>}/>
        <Route path="/compose"          element={<ComposePage authHeader={authHeader}/>}/>
        <Route path="/campaigns"        element={<CampaignsPage authHeader={authHeader}/>}/>
        <Route path="/campaigns/:id"    element={<CampaignDetailPage authHeader={authHeader}/>}/>
        <Route path="/subject-groups"   element={<SubjectGroupsPage authHeader={authHeader}/>}/>
        <Route path="/body-groups"      element={<BodyGroupsPage authHeader={authHeader}/>}/>
        <Route path="/attachment-groups" element={<AttachmentGroupsPage authHeader={authHeader}/>}/>
        <Route path="/sender-groups"    element={<SenderGroupsPage authHeader={authHeader}/>}/>
        <Route path="/recipient-groups" element={<RecipientGroupsPage authHeader={authHeader}/>}/>
        <Route path="/email-verifier"   element={<EmailVerifierPage authHeader={authHeader}/>}/>
        <Route path="/email-verifier/:id" element={<EmailVerifierDetailPage authHeader={authHeader}/>}/>
        <Route path="/tracking"         element={<TrackingPage authHeader={authHeader}/>}/>
        <Route path="/tracking/:id"     element={<TrackingDetailPage authHeader={authHeader}/>}/>
        <Route path="*"                 element={<Navigate to="/compose" replace/>}/>
      </Routes>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,  setUser]  = useState(() => { try { return JSON.parse(localStorage.getItem("user")); } catch { return null; } });
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const handleLogin  = (u, t) => { setUser(u); setToken(t); };
  const handleLogout = () => { localStorage.removeItem("token"); localStorage.removeItem("user"); setUser(null); setToken(""); };
  if (!user || !token) return <AuthPage onLogin={handleLogin}/>;
  return <MainApp user={user} token={token} onLogout={handleLogout}/>;
}
