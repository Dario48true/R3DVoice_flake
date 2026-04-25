// Lobby — landing after login
const { useState: useStateL } = React;

function LobbyScreen({ user, onJoin, onCreate, onOpenSettings, onOpenChangelog, onLogout }) {
  const [roomName, setRoomName] = useStateL("");
  const [joinUrl, setJoinUrl] = useStateL("");
  const [picked, setPicked] = useStateL(null);

  const myRooms = [
    { id: "studio-floor",   name: "Studio Floor",   size: 4, peak: 12, last: "2h",  pinned: true,  color: 1 },
    { id: "raid-night",     name: "Raid Night",     size: 8, peak: 14, last: "yesterday", pinned: true,  color: 5 },
    { id: "office-hours",   name: "Office Hours",   size: 2, peak:  5, last: "3d",  pinned: false, color: 3 },
  ];
  const recent = [
    { id: "5a11e794", name: "kbd club",   when: "12 min ago", host: "Lin"  },
    { id: "9c0f4023", name: "untitled",   when: "1 hr ago",   host: "Joon" },
    { id: "a82bf177", name: "Scrim 03",   when: "yesterday",  host: "Mox"  },
  ];

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}>
      {/* Top bar */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "var(--s-3) var(--s-6)",
        borderBottom: "1px solid var(--border-soft)",
        background: "color-mix(in oklch, var(--rv-ink-0) 30%, transparent)",
        backdropFilter: "blur(8px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
          <I.Logo size={24}/>
          <span style={{ fontWeight: 700, letterSpacing: "-0.01em", fontSize: "var(--t-md)" }}>RedVoice</span>
          <span className="rv-badge" data-tone="live" style={{ marginLeft: "var(--s-3)" }}>
            <span className="pip"/> connected
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)",
                        padding: "0 var(--s-3)", height: "2rem",
                        border: "1px solid var(--border-soft)",
                        borderRadius: "var(--r-pill)",
                        background: "color-mix(in oklch, var(--bg-elev) 80%, transparent)" }}>
            <span className="rv-avatar" style={{ width: 22, height: 22, fontSize: 10 }}>R</span>
            <span style={{ fontSize: "var(--t-sm)" }}>{user}</span>
          </div>
          <button className="rv-btn" data-variant="ghost" onClick={onOpenChangelog}>
            <I.Star size={14}/> Changelog
          </button>
          <button className="rv-btn rv-btn-icon" data-variant="ghost" onClick={onOpenSettings} aria-label="Settings"><I.Settings size={16}/></button>
          <button className="rv-btn rv-btn-icon" data-variant="ghost" onClick={onLogout} aria-label="Log out"><I.Logout size={16}/></button>
        </div>
      </header>

      {/* Body */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(260px, 320px) 1fr",
        gap: "var(--s-7)",
        padding: "var(--s-7)",
        overflow: "auto",
      }} className="rv-scroll">

        {/* Sidebar */}
        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
          <div>
            <div className="rv-section-head">
              <span className="rv-label">Pinned · my rooms</span>
              <span className="rv-mono" style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}>{myRooms.filter(r=>r.pinned).length}/{myRooms.length}</span>
            </div>
            <div className="rv-list">
              {myRooms.map(r => (
                <div key={r.id} className="rv-list-item"
                     data-active={picked===r.id}
                     onClick={() => setPicked(r.id)}>
                  <span className="rv-avatar" data-tone={r.color} style={{ width: 28, height: 28, fontSize: 11 }}>
                    {r.name.split(" ").map(s=>s[0]).slice(0,2).join("")}
                  </span>
                  <div style={{ display:"flex", flexDirection:"column", gap: 1, minWidth: 0 }}>
                    <span style={{ display:"flex", alignItems:"center", gap: 6 }}>
                      <span style={{ fontWeight: 500, fontSize: "var(--t-sm)" }}>{r.name}</span>
                      {r.pinned && <I.Pin size={10}/>}
                    </span>
                    <span className="rv-mono" style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}>
                      peak {r.peak} · last {r.last}
                    </span>
                  </div>
                  <span className="rv-badge" style={{ height: "1.3rem", padding: "0 8px", fontSize: 10 }}>
                    {r.size}/{r.peak}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="rv-section-head">
              <span className="rv-label">Recent</span>
            </div>
            <div className="rv-list">
              {recent.map(r => (
                <div key={r.id} className="rv-list-item">
                  <I.Clock size={14} style={{ color:"var(--text-faint)" }}/>
                  <div style={{ display:"flex", flexDirection:"column", gap: 1 }}>
                    <span style={{ fontSize:"var(--t-sm)" }}>{r.name}</span>
                    <span className="rv-mono" style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}>
                      {r.id} · {r.when}
                    </span>
                  </div>
                  <I.Chevron size={14} style={{ color:"var(--text-faint)" }}/>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            marginTop: "auto",
            padding: "var(--s-4)",
            border: "1px dashed var(--border)",
            borderRadius: "var(--r-md)",
            color: "var(--text-dim)",
            fontSize: "var(--t-xs)",
            lineHeight: 1.55,
          }}>
            <div className="rv-mono" style={{ textTransform: "uppercase", letterSpacing: ".14em", fontSize: "var(--t-2xs)", marginBottom: 6, color: "var(--text)" }}>
              tip · keybind
            </div>
            Push-to-talk binds in <kbd style={kbd}>⌘</kbd> <kbd style={kbd}>,</kbd> →&nbsp;Keybinds.
          </div>
        </aside>

        {/* Main */}
        <main style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", maxWidth: "44rem" }}>
          {/* Hero — create */}
          <section className="rv-card" data-glow="true" style={{ padding: "var(--s-7)" }}>
            <div className="rv-corner-tag">NEW · 01</div>
            <div style={{ marginTop: "var(--s-2)" }}>
              <div className="rv-headline" style={{ fontSize: "var(--t-2xl)", marginBottom: "var(--s-2)" }}>
                Spin up a room.
              </div>
              <p style={{ color: "var(--text-mid)", margin: 0, marginBottom: "var(--s-5)" }}>
                Persistent. Shareable link. Anyone with the URL can join — kick or password-lock from inside.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--s-3)" }}>
                <input className="rv-input" placeholder="Room name — e.g. Studio Floor"
                       value={roomName} onChange={e=>setRoomName(e.target.value)} style={{ height: "2.75rem" }}/>
                <button className="rv-btn" data-variant="primary"
                        onClick={() => onCreate(roomName || "Untitled room")}
                        style={{ height: "2.75rem", padding: "0 var(--s-5)" }}>
                  <I.Plus size={16}/> Create
                </button>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", marginTop: "var(--s-4)" }}>
                {["Quick chat", "Stream night", "1:1", "Listening party"].map(s => (
                  <button key={s} className="rv-btn" data-variant="ghost"
                          style={{ height: "1.9rem", fontSize: "var(--t-xs)",
                                   border: "1px solid var(--border-soft)",
                                   color: "var(--text-mid)" }}
                          onClick={() => setRoomName(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Join */}
          <section className="rv-card" style={{ padding: "var(--s-6)" }}>
            <div className="rv-section-head" style={{ marginBottom: "var(--s-4)" }}>
              <I.Link size={14} style={{ color:"var(--text-mid)" }}/>
              <span className="rv-label">Join by link or id</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--s-3)" }}>
              <input className="rv-input" placeholder="voice.r3dwolfie.com/join/… or room id"
                     value={joinUrl} onChange={e=>setJoinUrl(e.target.value)}/>
              <button className="rv-btn" onClick={() => onJoin(joinUrl || "5a11e794-cbfe-4093-8ecd-3b6488335d87")}
                      data-variant={joinUrl ? "primary" : undefined}>
                Open room <I.Chevron size={14}/>
              </button>
            </div>
            <p style={{ marginTop: "var(--s-3)", color: "var(--text-faint)", fontSize: "var(--t-xs)" }}>
              <span className="rv-mono">redvoice://</span> deep-links also supported.
            </p>
          </section>

          {/* Status */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--s-3)" }}>
            <Stat label="Server" value="localhost:3000" tone="live"/>
            <Stat label="RTT" value="62 ms" mono/>
            <Stat label="Build" value="0.1.1 · keychain"/>
          </section>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, mono }) {
  return (
    <div style={{
      padding: "var(--s-3) var(--s-4)",
      background: "color-mix(in oklch, var(--bg-elev) 60%, transparent)",
      border: "1px solid var(--border-soft)",
      borderRadius: "var(--r-md)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
        {tone==="live" && <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--rv-live)", boxShadow:"0 0 8px var(--rv-live)" }}/>}
        <span className="rv-label" style={{ fontSize: "var(--t-2xs)" }}>{label}</span>
      </div>
      <span className={mono ? "rv-mono" : ""} style={{ fontSize: "var(--t-base)", color: "var(--text)" }}>{value}</span>
    </div>
  );
}

const kbd = {
  display: "inline-block", padding: "1px 6px",
  border: "1px solid var(--border-strong)",
  borderRadius: 4, background: "var(--bg-elev-2)",
  fontFamily: "var(--font-mono)", fontSize: 10,
  color: "var(--text)",
};

window.LobbyScreen = LobbyScreen;
window.kbdStyle = kbd;
