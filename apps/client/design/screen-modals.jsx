// Settings & Changelog modals
const { useState: useStateM } = React;

function Modal({ open, onClose, title, subtitle, children, width = "min(94vw, 720px)" }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "color-mix(in oklch, var(--rv-ink-0) 70%, transparent)",
      backdropFilter: "blur(6px)",
      display: "grid", placeItems: "center",
      animation: "rv-fade var(--d-mid) var(--ease-out) both",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width, maxHeight: "82vh",
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--shadow-3)",
        display: "grid", gridTemplateRows: "auto 1fr",
        overflow: "hidden",
        animation: "rv-modal-in var(--d-mid) var(--ease-out) both",
      }}>
        <header style={{
          padding: "var(--s-5) var(--s-6)",
          borderBottom: "1px solid var(--border-soft)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: "var(--t-lg)", fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</div>
            {subtitle && <div className="rv-mono" style={{ fontSize:"var(--t-2xs)", color:"var(--text-faint)",
                                                           letterSpacing:".1em", textTransform:"uppercase", marginTop: 4 }}>
              {subtitle}
            </div>}
          </div>
          <button className="rv-btn rv-btn-icon" data-variant="ghost" onClick={onClose}><I.X size={16}/></button>
        </header>
        <div style={{ overflow: "auto", minHeight: 0 }} className="rv-scroll">
          {children}
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ open, onClose }) {
  const [tab, setTab] = useStateM("devices");
  return (
    <Modal open={open} onClose={onClose} title="Settings" subtitle="DEVICES · KEYBINDS · COMPATIBILITY · ABOUT">
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", minHeight: 480 }}>
        {/* Side nav */}
        <nav style={{
          borderRight: "1px solid var(--border-soft)",
          padding: "var(--s-4) var(--s-3)",
          display: "flex", flexDirection: "column", gap: 2,
        }}>
          {[
            ["devices", "Devices", <I.Mic size={14}/>],
            ["keybinds", "Keybinds", <I.Settings size={14}/>],
            ["compat", "Compatibility", <I.Grid size={14}/>],
            ["about", "About", <I.Star size={14}/>],
          ].map(([k, l, icon]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              display: "flex", alignItems: "center", gap: "var(--s-3)",
              padding: "8px 10px", border: 0, cursor: "pointer", textAlign: "left",
              borderRadius: "var(--r-sm)",
              background: tab===k ? "color-mix(in oklch, var(--accent) 14%, var(--bg-elev-2))" : "transparent",
              color: tab===k ? "var(--text)" : "var(--text-mid)",
              fontSize: "var(--t-sm)", fontWeight: 500,
              borderLeft: tab===k ? "2px solid var(--accent)" : "2px solid transparent",
              paddingLeft: 10,
            }}>
              {icon} {l}
            </button>
          ))}
        </nav>

        {/* Body */}
        <div style={{ padding: "var(--s-6) var(--s-7)" }}>
          {tab === "devices" && <DevicesTab/>}
          {tab === "keybinds" && <KeybindsTab/>}
          {tab === "compat" && <CompatTab/>}
          {tab === "about" && <AboutTab/>}
        </div>
      </div>
    </Modal>
  );
}

function DevicesTab() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"var(--s-5)", maxWidth: 460 }}>
      <div className="rv-section-head"><span className="rv-label">Audio In/Out</span></div>
      <Field label="Microphone">
        <select className="rv-select"><option>Default · Yeti X</option><option>MacBook Pro Mic</option></select>
      </Field>
      <Field label="Speakers">
        <select className="rv-select"><option>Default · System output</option></select>
      </Field>
      <div style={{
        padding: "var(--s-3) var(--s-4)",
        background: "color-mix(in oklch, var(--rv-live) 10%, var(--bg-elev-2))",
        border: "1px solid color-mix(in oklch, var(--rv-live) 35%, var(--border))",
        borderRadius: "var(--r-md)",
        display: "flex", gap: "var(--s-3)", alignItems: "center",
        fontSize: "var(--t-sm)",
      }}>
        <span style={{ width:8, height:8, borderRadius:"50%", background:"var(--rv-live)", boxShadow:"0 0 8px var(--rv-live)"}}/>
        Changes apply live — no need to rejoin.
      </div>

      <div className="rv-section-head"><span className="rv-label">Processing</span></div>
      <Toggle label="Noise suppression" hint="RNNoise · removes keyboard, fans, room echo" defaultChecked/>
      <Toggle label="Auto-gain control" hint="Normalize speaking level" defaultChecked/>
      <Toggle label="Echo cancellation" hint="Required if you use speakers" defaultChecked/>
    </div>
  );
}

function Toggle({ label, hint, defaultChecked }) {
  const [on, setOn] = useStateM(!!defaultChecked);
  return (
    <label style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      gap: "var(--s-4)", cursor:"pointer",
      padding: "10px 0", borderBottom: "1px solid var(--border-soft)",
    }}>
      <div>
        <div style={{ fontSize:"var(--t-sm)", fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize:"var(--t-xs)", color:"var(--text-faint)", marginTop: 2 }}>{hint}</div>}
      </div>
      <span style={{
        width: 36, height: 20, borderRadius: 999,
        background: on ? "var(--accent)" : "var(--bg-elev-3)",
        border: "1px solid " + (on ? "color-mix(in oklch, var(--accent) 70%, black)" : "var(--border-strong)"),
        position: "relative", transition: "all var(--d-base) var(--ease-out)",
        boxShadow: on ? "0 0 0 3px color-mix(in oklch, var(--accent) 25%, transparent)" : "none",
      }} onClick={() => setOn(o => !o)}>
        <span style={{
          position: "absolute", top: 1, left: on ? 17 : 1,
          width: 16, height: 16, borderRadius:"50%",
          background: "var(--text)", transition: "left var(--d-base) var(--ease-out)",
        }}/>
        <input type="checkbox" checked={on} onChange={() => {}} style={{display:"none"}}/>
      </span>
    </label>
  );
}

function KeybindsTab() {
  const binds = [
    ["Push to talk", "Space"],
    ["Toggle mute", "⌘ + ⇧ + M"],
    ["Toggle deafen", "⌘ + ⇧ + D"],
    ["Toggle screen-share", "⌘ + ⇧ + E"],
    ["Open settings", "⌘ + ,"],
    ["Leave room", "⌘ + W"],
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"var(--s-3)", maxWidth: 460 }}>
      <div className="rv-section-head"><span className="rv-label">Global keybinds</span></div>
      {binds.map(([l, k]) => (
        <div key={l} style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          padding: "10px 0", borderBottom: "1px solid var(--border-soft)",
        }}>
          <span style={{ fontSize: "var(--t-sm)" }}>{l}</span>
          <span style={{ display:"flex", gap: 4 }}>
            {k.split(" + ").map((kk, i) => <kbd key={i} style={window.kbdStyle}>{kk}</kbd>)}
          </span>
        </div>
      ))}
    </div>
  );
}

function CompatTab() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"var(--s-4)", maxWidth: 480 }}>
      <div className="rv-section-head"><span className="rv-label">Hardware acceleration</span></div>
      <Toggle label="GPU video decode (VP9 / AV1)" defaultChecked/>
      <Toggle label="Use system Picture-in-Picture"/>
      <div className="rv-section-head" style={{ marginTop:"var(--s-3)" }}><span className="rv-label">Permissions</span></div>
      <PermRow label="Microphone" status="granted"/>
      <PermRow label="Camera" status="not requested"/>
      <PermRow label="Screen recording" status="granted"/>
      <PermRow label="Notifications" status="granted"/>
    </div>
  );
}

function PermRow({ label, status }) {
  const tone = status === "granted" ? "live" : status === "denied" ? "red" : null;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: "1px solid var(--border-soft)",
    }}>
      <span style={{ fontSize:"var(--t-sm)" }}>{label}</span>
      <span className="rv-badge" data-tone={tone}>
        {tone === "live" && <span className="pip"/>}
        {status}
      </span>
    </div>
  );
}

function AboutTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)", maxWidth: 460 }}>
      <div style={{ display:"flex", gap:"var(--s-4)", alignItems:"center" }}>
        <I.Logo size={48}/>
        <div>
          <div style={{ fontSize: "var(--t-xl)", fontWeight: 700, letterSpacing: "-0.01em" }}>RedVoice</div>
          <div className="rv-mono" style={{ fontSize:"var(--t-xs)", color:"var(--text-dim)" }}>
            v0.1.1 · electron 30 · chromium 124
          </div>
        </div>
      </div>
      <p style={{ color: "var(--text-mid)", lineHeight: 1.6, margin: 0 }}>
        Open-source voice + screenshare. Self-host the server, own your data,
        keep your raid in your basement. MIT licensed, no telemetry by default.
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"var(--s-2)" }}>
        <button className="rv-btn">View on GitHub</button>
        <button className="rv-btn">Report an issue</button>
        <button className="rv-btn">Diagnostics…</button>
        <button className="rv-btn">Reset to defaults</button>
      </div>
    </div>
  );
}

// ── Changelog modal ──────────────────────────────────────────
function ChangelogModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Changelog & roadmap" subtitle="REDVOICE · WHAT'S SHIPPED · WHAT'S NEXT" width="min(94vw, 760px)">
      <div style={{ padding: "var(--s-6) var(--s-7)", display: "flex", flexDirection: "column", gap: "var(--s-7)" }}>
        {/* Released */}
        <section>
          <div className="rv-section-head">
            <span className="rv-badge" data-tone="live"><span className="pip"/> released</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
            <ReleaseEntry version="0.1.1" date="Apr 25, 2026" notes={[
              "Fix: VU meter freezes when switching mics mid-call",
              "Fix: macOS screen-recording permission dialog now retries cleanly",
              "Tweak: warmer titlebar gradient, tighter type scale",
            ]}/>
            <ReleaseEntry version="0.1.0" tagline="first public release" date="Apr 25, 2026" notes={[
              "Email/password registration with argon2id hashing",
              "Persistent rooms with shareable links",
              "Session survives app restart (JWT in OS keychain)",
              "Push-to-talk + global hotkeys",
              "Screen-share with system audio (macOS / Windows)",
              "Per-participant volume + right-click mute",
            ]}/>
          </div>
        </section>

        {/* Coming soon */}
        <section>
          <div className="rv-section-head">
            <span className="rv-badge" data-tone="amber"><span className="pip"/> coming soon · plan 5</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "var(--s-2)",
          }}>
            {[
              "Installers — Win / Linux / mac",
              "Auto-update channel",
              "Deep links · redvoice://join/…",
              "In-room text chat",
              "Picture-in-picture floating tile",
              "Network quality per tile",
              "Distinctive dark UI polish",
              "Opt-in crash reporting",
              "macOS recording onboarding",
              "Mobile companion (iOS / Android)",
            ].map(t => (
              <div key={t} style={{
                display:"flex", alignItems:"center", gap: 10,
                padding: "10px 12px",
                border: "1px dashed var(--border)",
                borderRadius: "var(--r-md)",
                color: "var(--text-mid)",
                fontSize: "var(--t-sm)",
              }}>
                <span className="rv-mono" style={{
                  fontSize: 9, padding: "2px 5px", borderRadius: 3,
                  background: "color-mix(in oklch, var(--rv-amber) 15%, var(--bg-elev-2))",
                  color: "var(--rv-amber)",
                  border: "1px solid color-mix(in oklch, var(--rv-amber) 40%, var(--border))",
                  letterSpacing: ".1em",
                }}>SOON</span>
                {t}
              </div>
            ))}
          </div>
        </section>

        {/* Long horizon */}
        <section>
          <div className="rv-section-head">
            <span className="rv-badge"><span className="pip" style={{background:"var(--text-faint)", boxShadow:"none"}}/> long horizon</span>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "var(--text-dim)",
                       fontSize: "var(--t-sm)", lineHeight: 1.9, columns: 2, columnGap: "var(--s-7)" }}>
            <li>· Federation between self-hosted servers</li>
            <li>· End-to-end encrypted DMs</li>
            <li>· Soundboard with hotkeys</li>
            <li>· Spatial audio for &gt;6 people</li>
            <li>· Plugin API (renderer-side)</li>
            <li>· Theming system</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}

function ReleaseEntry({ version, tagline, date, notes }) {
  return (
    <div style={{
      padding: "var(--s-5)",
      background: "color-mix(in oklch, var(--bg-elev-2) 70%, transparent)",
      border: "1px solid var(--border-soft)",
      borderRadius: "var(--r-md)",
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s-3)", flexWrap: "wrap" }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontWeight: 700,
          fontSize: "var(--t-md)",
          background: "linear-gradient(100deg, var(--accent-glow), var(--accent))",
          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
        }}>v{version}</span>
        {tagline && <span style={{ fontSize: "var(--t-sm)", color: "var(--text)", fontWeight: 500 }}>— {tagline}</span>}
        <span className="rv-mono" style={{ marginLeft: "auto", fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}>
          {date}
        </span>
      </div>
      <ul style={{ margin: "var(--s-3) 0 0", padding: 0, listStyle: "none",
                   display: "flex", flexDirection: "column", gap: 6 }}>
        {notes.map((n, i) => (
          <li key={i} style={{ display:"flex", gap: 10, fontSize: "var(--t-sm)", color: "var(--text-mid)" }}>
            <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", flex: "none" }}>↳</span>
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}

window.SettingsModal = SettingsModal;
window.ChangelogModal = ChangelogModal;
