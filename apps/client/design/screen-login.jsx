// RedVoice — screen components
// All screens are pure-React, props-driven; navigation lives in app.jsx.

const { useState, useEffect, useRef, useMemo } = React;

// ─────────────────────────────────────────────────────────────
//  Window chrome — Electron-style titlebar
// ─────────────────────────────────────────────────────────────
function WindowChrome({ title, children }) {
  return (
    <div className="rv-window">
      <div className="rv-titlebar">
        <div className="rv-titlebar-left">
          <div className="rv-traffic">
            <span className="dot red"/>
            <span className="dot yellow"/>
            <span className="dot green"/>
          </div>
          <span className="rv-titlebar-title">{title}</span>
        </div>
        <div className="rv-titlebar-right">
          <span className="rv-titlebar-title" style={{opacity:.6}}>v0.1.1 · localhost:3000</span>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Login
// ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [server, setServer] = useState("https://voice.r3dwolfie.com");
  const [email, setEmail] = useState("red@r3dwolfie.com");
  const [name, setName] = useState("Red");
  const [pw, setPw] = useState("••••••••");
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e?.preventDefault();
    setBusy(true);
    setTimeout(() => { setBusy(false); onLogin(name); }, 600);
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1.05fr 1fr",
      height: "100%",
    }}>
      {/* Left — brand panel */}
      <aside style={{
        position: "relative",
        background: `
          radial-gradient(80% 60% at 20% 10%,
            color-mix(in oklch, var(--rv-red-700) 35%, transparent), transparent 60%),
          radial-gradient(70% 60% at 90% 90%,
            color-mix(in oklch, var(--rv-red-900) 60%, transparent), transparent 60%),
          var(--rv-ink-0)`,
        padding: "var(--s-9)",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        borderRight: "1px solid var(--border-soft)",
        overflow: "hidden",
      }}>
        {/* corner crosshair */}
        <CrosshairCorner pos="tl"/>
        <CrosshairCorner pos="tr"/>
        <CrosshairCorner pos="bl"/>
        <CrosshairCorner pos="br"/>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", position: "relative" }}>
          <I.Logo size={28}/>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--t-xs)",
                        letterSpacing: ".18em", textTransform: "uppercase", color: "var(--text-mid)"}}>
            REDVOICE / SIGNAL
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div className="rv-headline" style={{
            fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)",
            color: "var(--text)",
            marginBottom: "var(--s-4)",
          }}>
            Talk loud.<br/>
            <span style={{
              background: "linear-gradient(100deg, var(--accent-glow), var(--accent-hover) 60%, var(--rv-red-700))",
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}>Share screens.</span><br/>
            Own your server.
          </div>
          <p style={{ color: "var(--text-mid)", maxWidth: "32ch", fontSize: "var(--t-md)", lineHeight: 1.55 }}>
            Open-source voice + screenshare for friends, raid nights, and the
            people you actually want to hear.
          </p>
          <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-7)" }}>
            <span className="rv-badge" data-tone="live"><span className="pip"/> 4 servers up</span>
            <span className="rv-badge"><span className="rv-mono">62 ms</span></span>
            <span className="rv-badge">e2e srtp</span>
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", justifyContent: "space-between",
                      fontFamily: "var(--font-mono)", fontSize: "var(--t-2xs)",
                      letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-faint)"}}>
          <span>build · 2026.04.25</span>
          <span>↳ self-hostable · MIT</span>
        </div>
      </aside>

      {/* Right — form */}
      <main style={{
        display: "grid",
        placeItems: "center",
        padding: "var(--s-7)",
        background: "var(--bg)",
        position: "relative",
      }}>
        <form onSubmit={submit}
              className="rv-fade-in"
              style={{ width: "min(100%, 26rem)", display: "flex", flexDirection: "column",
                       gap: "var(--s-5)" }}>
          <div className="rv-tabs" role="tablist">
            <button type="button" className="rv-tab" data-active={tab==="login"} onClick={() => setTab("login")}>Sign in</button>
            <button type="button" className="rv-tab" data-active={tab==="register"} onClick={() => setTab("register")}>Create account</button>
            <span style={{ flex:1 }}/>
            <span className="rv-label" style={{alignSelf:"center"}}>SECURE&nbsp;·&nbsp;ARGON2ID</span>
          </div>

          <Field label="Server" hint="Self-hosted instance">
            <div style={{ position: "relative" }}>
              <input className="rv-input" value={server} onChange={e=>setServer(e.target.value)}
                     style={{ paddingRight: "5.5rem" }}/>
              <span className="rv-badge" data-tone="live"
                    style={{ position:"absolute", right: 8, top: "50%", transform: "translateY(-50%)", height: "1.4rem" }}>
                <span className="pip"/> reachable
              </span>
            </div>
          </Field>

          {tab === "register" && (
            <Field label="Display name">
              <input className="rv-input" value={name} onChange={e=>setName(e.target.value)} placeholder="How you'll appear"/>
            </Field>
          )}

          <Field label="Email">
            <input className="rv-input" type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
          </Field>

          <Field label="Password" right={tab==="login" ? <a href="#" style={{color:"var(--text-dim)", fontSize:"var(--t-xs)"}}>Forgot?</a> : null}>
            <input className="rv-input" type="password" value={pw} onChange={e=>setPw(e.target.value)}/>
          </Field>

          <button className="rv-btn" data-variant="primary" type="submit" disabled={busy}
                  style={{ height: "2.6rem", marginTop: "var(--s-2)" }}>
            {busy ? <><Spinner/> Connecting…</> : <>{tab==="login" ? "Sign in" : "Create account"} <I.Chevron size={16}/></>}
          </button>

          <div style={{
            display:"flex", alignItems:"center", gap:"var(--s-3)",
            color:"var(--text-faint)", fontSize:"var(--t-xs)",
            fontFamily:"var(--font-mono)", letterSpacing:".06em"
          }}>
            <span style={{flex:1, height:1, background:"var(--border-soft)"}}/>
            session restored from os keychain
            <span style={{flex:1, height:1, background:"var(--border-soft)"}}/>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({ label, hint, right, children }) {
  return (
    <div className="rv-field">
      <div className="rv-field-label">
        <span className="rv-label">{label}</span>
        {right}
      </div>
      {children}
      {hint && <span className="rv-field-help">{hint}</span>}
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14,
      border: "2px solid currentColor", borderTopColor: "transparent",
      borderRadius: "50%", animation: "rv-spin .7s linear infinite"
    }}/>
  );
}

function CrosshairCorner({ pos }) {
  const map = { tl: { top: 24, left: 24 }, tr: { top: 24, right: 24 },
                bl: { bottom: 24, left: 24 }, br: { bottom: 24, right: 24 }};
  return (
    <div style={{ position: "absolute", width: 14, height: 14, color: "var(--rv-red-700)", opacity: .55, ...map[pos] }}>
      <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M0 1 H6 M1 0 V6"/>
        <path d="M14 1 H8 M13 0 V6" transform={pos.includes("r")?"":""} style={{display: pos.includes("r") ? "" : "none"}}/>
      </svg>
    </div>
  );
}

window.LoginScreen = LoginScreen;
window.WindowChrome = WindowChrome;
window.Field = Field;
window.Spinner = Spinner;
