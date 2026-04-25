// In-room — participants, tiles, control bar
const { useState: useStateR, useEffect: useEffectR, useRef: useRefR } = React;

const PEOPLE = [
  { id: "you",   name: "Red",       you: true,  speaking: false, muted: false, sharing: false, color: 1, latency: 12 },
  { id: "lin",   name: "Lin Park",  speaking: true,  muted: false, sharing: true, color: 2, latency: 38 },
  { id: "joon",  name: "Joon",      speaking: false, muted: false, sharing: false, color: 3, latency: 54 },
  { id: "mox",   name: "Mox",       speaking: true,  muted: false, sharing: false, color: 4, latency: 71 },
  { id: "kade",  name: "Kade",      speaking: false, muted: true,  sharing: false, color: 5, latency: 22 },
  { id: "vee",   name: "Vee",       speaking: false, muted: false, sharing: false, color: 2, latency: 90 },
];

function InRoomScreen({ roomId, onLeave, onOpenSettings, layout, onLayoutChange, glow }) {
  const [muted, setMuted] = useStateR(false);
  const [sharing, setSharing] = useStateR(false);
  const [copied, setCopied] = useStateR(false);
  const [elapsed, setElapsed] = useStateR(0);
  const [vol, setVol] = useStateR({}); // per-person volume override
  const [ctxMenu, setCtxMenu] = useStateR(null);

  useEffectR(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const copy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sharer = PEOPLE.find(p => p.sharing);
  const fmtTime = (s) => {
    const h = Math.floor(s/3600), m = Math.floor(s%3600/60), sec = s%60;
    return `${h>0?String(h).padStart(2,"0")+":":""}${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  // Layout decision
  const useSpeaker = layout === "speaker" || (layout === "auto" && !!sharer);

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100%" }}
         onClick={() => setCtxMenu(null)}>

      {/* Top bar */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "var(--s-3) var(--s-5)",
        borderBottom: "1px solid var(--border-soft)",
        background: "color-mix(in oklch, var(--rv-ink-0) 30%, transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
          <I.Logo size={20}/>
          <span className="rv-label">IN ROOM</span>
          <span className="rv-mono" style={{ color:"var(--text-mid)", fontSize:"var(--t-xs)" }}>
            {roomId.slice(0, 8)}…
          </span>
          <span className="rv-badge" data-tone="live"><span className="pip"/> LIVE · {fmtTime(elapsed)}</span>
          {sharer && (
            <span className="rv-badge" data-tone="red">
              <I.Screen size={11}/> {sharer.name} sharing
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <NetMeter latency={42}/>
          <span className="rv-mono" style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}>
            {PEOPLE.length} participants
          </span>
          <button className="rv-btn" onClick={copy}>
            {copied ? <><I.Check size={14}/> Copied</> : <><I.Link size={14}/> Copy link</>}
          </button>
          <button className="rv-btn rv-btn-icon" data-variant="ghost" onClick={onOpenSettings}><I.Settings size={16}/></button>
        </div>
      </header>

      {/* Body */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 260px) 1fr",
                    minHeight: 0, position: "relative" }}>
        {/* Sidebar */}
        <aside style={{
          borderRight: "1px solid var(--border-soft)",
          padding: "var(--s-5)",
          overflow: "auto",
          background: "color-mix(in oklch, var(--rv-ink-0) 25%, transparent)",
        }} className="rv-scroll">
          <div className="rv-section-head">
            <span className="rv-label">Participants</span>
            <span className="rv-mono" style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}>
              {PEOPLE.length}
            </span>
          </div>
          <div className="rv-list">
            {PEOPLE.map(p => (
              <div key={p.id} className="rv-list-item"
                   data-active={p.sharing}
                   onContextMenu={(e) => {
                     e.preventDefault();
                     setCtxMenu({ id: p.id, x: e.clientX, y: e.clientY });
                   }}>
                <div style={{ position: "relative" }}>
                  <span className="rv-avatar" data-tone={p.color} style={{ width: 28, height: 28, fontSize: 11 }}>
                    {p.name[0]}
                  </span>
                  {p.speaking && glow !== "off" && <span className="rv-speaking-ring" style={{ inset: -2 }}/>}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize:"var(--t-sm)", display:"flex", alignItems:"center", gap: 6 }}>
                    {p.name}{p.you && <span style={{ color:"var(--text-faint)" }}>(you)</span>}
                    {p.sharing && <I.Screen size={10} style={{ color:"var(--accent-glow)" }}/>}
                  </span>
                  <span className="rv-mono" style={{ fontSize: 10, color: "var(--text-faint)" }}>
                    {p.muted ? "muted" : p.speaking ? "speaking" : "idle"} · {p.latency}ms
                  </span>
                </div>
                {p.muted ? <I.MicOff size={12} style={{ color: "var(--text-faint)" }}/>
                         : <MiniVu active={p.speaking}/>}
              </div>
            ))}
          </div>

          <div className="rv-section-head" style={{ marginTop: "var(--s-6)" }}>
            <span className="rv-label">Room</span>
          </div>
          <KV label="ID" value={<span className="rv-mono" style={{fontSize:10}}>{roomId.slice(0,16)}…</span>}/>
          <KV label="Codec" value="OPUS · 48 kHz"/>
          <KV label="Region" value="auto · sfo3"/>
          <KV label="Recording" value={<span style={{ color:"var(--text-faint)" }}>off</span>}/>
        </aside>

        {/* Tiles */}
        <main style={{
          padding: "var(--s-5)",
          overflow: "auto",
          minHeight: 0,
          containerType: "inline-size",
        }} className="rv-scroll">
          {useSpeaker ? (
            <SpeakerLayout people={PEOPLE} sharer={sharer} sharing={sharing} glow={glow}/>
          ) : (
            <GridLayout people={PEOPLE} you={muted} youSharing={sharing} glow={glow}/>
          )}
        </main>

        {/* Layout switcher (floating) */}
        <div style={{
          position: "absolute", top: "var(--s-5)", right: "var(--s-5)",
          display: "flex", padding: 3, background: "color-mix(in oklch, var(--bg-elev) 80%, transparent)",
          border: "1px solid var(--border-soft)", borderRadius: "var(--r-md)",
          backdropFilter: "blur(8px)",
          zIndex: 5,
        }}>
          {[
            ["auto",    "Auto"],
            ["grid",    "Grid"],
            ["speaker", "Speaker"],
          ].map(([k, v]) => (
            <button key={k}
                    onClick={() => onLayoutChange(k)}
                    style={{
                      appearance: "none", border: 0, cursor: "pointer",
                      padding: "5px 11px",
                      borderRadius: 5,
                      background: layout===k ? "color-mix(in oklch, var(--accent) 18%, var(--bg-elev-2))" : "transparent",
                      color: layout===k ? "var(--text)" : "var(--text-dim)",
                      fontSize: "var(--t-xs)", fontFamily:"var(--font-mono)",
                      letterSpacing: ".06em",
                    }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Control bar */}
      <footer style={{
        padding: "var(--s-4) var(--s-5)",
        borderTop: "1px solid var(--border-soft)",
        background: "color-mix(in oklch, var(--rv-ink-0) 50%, transparent)",
        backdropFilter: "blur(8px)",
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:"var(--s-3)" }}>
          <span className="rv-avatar" data-tone="1" data-size="lg">R</span>
          <div style={{ display:"flex", flexDirection:"column", gap: 2 }}>
            <span style={{ fontWeight: 500 }}>Red <span style={{color:"var(--text-faint)"}}>(you)</span></span>
            <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
              <div className="rv-vu" style={{ width: 110, height: 5 }}>
                <div className="rv-vu-fill" style={{ width: muted ? "0%" : "55%" }}/>
              </div>
              <span className="rv-mono" style={{ fontSize: 10, color: muted ? "var(--accent-glow)" : "var(--text-faint)" }}>
                {muted ? "MUTED" : "−18 dB"}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display:"flex", gap: "var(--s-3)" }}>
          <ControlButton icon={muted ? <I.MicOff size={20}/> : <I.Mic size={20}/>}
                         label={muted ? "Unmute" : "Mute"}
                         active={!muted}
                         danger={muted}
                         onClick={() => setMuted(m => !m)}/>
          <ControlButton icon={sharing ? <I.ScreenOff size={20}/> : <I.Screen size={20}/>}
                         label={sharing ? "Stop share" : "Share screen"}
                         active={sharing}
                         emphasis={sharing}
                         onClick={() => setSharing(s => !s)}/>
          <ControlButton icon={<I.Headphones size={20}/>} label="Deafen"/>
          <div style={{ width: 1, background: "var(--border-soft)", margin: "0 var(--s-2)" }}/>
          <ControlButton icon={<I.Leave size={20}/>} label="Leave" leave onClick={onLeave}/>
        </div>

        <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", gap: "var(--s-3)", color:"var(--text-faint)" }}>
          <kbd style={window.kbdStyle}>SPACE</kbd>
          <span className="rv-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>push to talk</span>
        </div>
      </footer>

      {/* Hidden audio mount */}
      <div id="rv-audio-mount" style={{ display: "none" }}/>

      {/* Right-click menu */}
      {ctxMenu && (
        <div onClick={e => e.stopPropagation()}
             style={{
               position: "fixed", top: ctxMenu.y, left: ctxMenu.x,
               width: 220,
               background: "var(--bg-elev-2)",
               border: "1px solid var(--border-strong)",
               borderRadius: "var(--r-md)",
               padding: "var(--s-3)",
               boxShadow: "var(--shadow-3)",
               zIndex: 100,
             }}>
          <div className="rv-label" style={{ fontSize: 10, marginBottom: 8 }}>VOLUME</div>
          <input type="range" min={0} max={200} defaultValue={vol[ctxMenu.id] ?? 100}
                 onChange={e => setVol(v => ({...v, [ctxMenu.id]: Number(e.target.value)}))}
                 style={{ width: "100%", accentColor: "var(--accent)" }}/>
          <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"var(--font-mono)",
                        fontSize: 10, color:"var(--text-faint)" }}>
            <span>0</span><span>{vol[ctxMenu.id] ?? 100}%</span><span>200</span>
          </div>
          <hr className="rv-rule"/>
          <CtxItem>Pin tile</CtxItem>
          <CtxItem>Whisper</CtxItem>
          <CtxItem danger>Mute for me</CtxItem>
        </div>
      )}
    </div>
  );
}

function CtxItem({ children, danger }) {
  return (
    <button style={{
      display: "block", width: "100%", textAlign: "left",
      padding: "6px 8px", borderRadius: 6, border: 0,
      background: "transparent", cursor: "pointer",
      color: danger ? "var(--accent-glow)" : "var(--text)",
      fontSize: "var(--t-sm)",
    }} onMouseEnter={e => e.currentTarget.style.background = "color-mix(in oklch, var(--accent) 14%, transparent)"}
       onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {children}
    </button>
  );
}

function KV({ label, value }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding: "4px 0",
                  fontSize: "var(--t-xs)" }}>
      <span style={{ color:"var(--text-faint)", fontFamily:"var(--font-mono)",
                     textTransform:"uppercase", letterSpacing:".1em", fontSize: 10 }}>{label}</span>
      <span style={{ color:"var(--text-mid)" }}>{value}</span>
    </div>
  );
}

function MiniVu({ active }) {
  // 4 bars of varying height, animated when active
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap: 2, height: 14 }}>
      {[0.4, 0.7, 1, 0.55].map((h, i) => (
        <span key={i} style={{
          width: 2, height: `${h*100}%`,
          background: active ? "var(--rv-live)" : "var(--rv-ink-400)",
          borderRadius: 1,
          animation: active ? `rv-vu-bar 0.${6+i}s ease-in-out infinite alternate` : "none",
          animationDelay: `${i*0.05}s`,
          boxShadow: active ? "0 0 4px var(--rv-live)" : "none",
        }}/>
      ))}
    </div>
  );
}

function NetMeter({ latency }) {
  const bars = latency < 50 ? 4 : latency < 100 ? 3 : 2;
  const tone = latency < 50 ? "var(--rv-live)" : latency < 100 ? "var(--rv-amber)" : "var(--accent)";
  return (
    <span style={{ display:"flex", alignItems:"flex-end", gap:2, height:14, padding:"0 6px" }}>
      {[6, 9, 12, 15].map((h, i) => (
        <span key={i} style={{
          width: 3, height: h,
          background: i < bars ? tone : "var(--rv-ink-400)",
          borderRadius: 1,
          opacity: i < bars ? 1 : .4,
        }}/>
      ))}
    </span>
  );
}

// ── Tile ──────────────────────────────────────────────────────
function Tile({ person, big, you, glow, sharing }) {
  return (
    <div style={{
      position: "relative",
      aspectRatio: big ? "16/9" : "16/10",
      borderRadius: "var(--r-lg)",
      background: sharing
        ? "linear-gradient(180deg, oklch(0.18 0.04 22), oklch(0.10 0.02 22))"
        : "linear-gradient(180deg, var(--bg-elev), var(--bg-elev-2))",
      border: person.speaking && glow !== "off"
        ? "1px solid color-mix(in oklch, var(--rv-live) 60%, var(--border))"
        : "1px solid var(--border-soft)",
      boxShadow: person.speaking && glow !== "off"
        ? "0 0 0 2px color-mix(in oklch, var(--rv-live) 35%, transparent), 0 0 24px -8px var(--rv-live)"
        : sharing
          ? "0 0 0 2px color-mix(in oklch, var(--accent) 30%, transparent), 0 0 30px -10px var(--accent)"
          : "var(--shadow-2)",
      overflow: "hidden",
      transition: "box-shadow var(--d-mid) var(--ease-out), border-color var(--d-mid) var(--ease-out)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} className={sharing ? "rv-scanlines" : ""}>
      {sharing ? (
        <ScreenShareMock owner={person.name}/>
      ) : (
        <span className="rv-avatar" data-tone={person.color} data-size={big ? "xl" : "lg"}>
          {person.name[0]}
        </span>
      )}

      {/* speaking ring */}
      {person.speaking && glow !== "off" && !sharing && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
                      borderRadius: "inherit",
                      background: `radial-gradient(60% 50% at 50% 60%, color-mix(in oklch, var(--rv-live) 18%, transparent), transparent 70%)`}}/>
      )}

      {/* Bottom name strip */}
      <div style={{
        position: "absolute", left: 10, bottom: 10, right: 10,
        display: "flex", alignItems: "center", gap: 8,
        padding: "4px 8px",
        background: "color-mix(in oklch, var(--rv-ink-0) 65%, transparent)",
        backdropFilter: "blur(8px)",
        borderRadius: var_pill(),
        border: "1px solid var(--border-soft)",
        fontSize: "var(--t-xs)",
        width: "fit-content",
      }}>
        {person.muted ? <I.MicOff size={10} style={{ color: "var(--accent-glow)" }}/>
                      : <MiniVu active={person.speaking}/>}
        <span style={{ fontWeight: 500 }}>{person.name}</span>
        {you && <span style={{ color: "var(--text-faint)" }}>· you</span>}
        <span className="rv-mono" style={{ color: "var(--text-faint)", fontSize: 9 }}>
          {person.latency}ms
        </span>
      </div>

      {/* TL crosshair tag for sharer */}
      {sharing && (
        <div className="rv-corner-tag" style={{
          background: "color-mix(in oklch, var(--accent) 25%, transparent)",
          color: "var(--text)",
        }}>
          ◉ SHARING · 1080p · 30fps
        </div>
      )}
    </div>
  );
}

function var_pill() { return "999px"; }

function GridLayout({ people, you, youSharing, glow }) {
  // dynamic columns based on count
  const cols = people.length <= 2 ? 2 : people.length <= 4 ? 2 : people.length <= 9 ? 3 : 4;
  return (
    <div style={{
      display: "grid",
      gap: "var(--s-3)",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
    }}>
      {people.map(p => (
        <Tile key={p.id} person={p} you={p.you} glow={glow}/>
      ))}
    </div>
  );
}

function SpeakerLayout({ people, sharer, sharing, glow }) {
  const focus = sharer || people.find(p => p.speaking) || people[0];
  const rest = people.filter(p => p.id !== focus.id);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr",
      gridTemplateRows: "1fr auto",
      gap: "var(--s-3)",
      height: "100%",
      minHeight: 420,
    }}>
      <Tile person={focus} big sharing={!!sharer} glow={glow}/>
      <div style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(140px, 180px)",
        gap: "var(--s-3)",
        overflowX: "auto",
        paddingBottom: 4,
      }} className="rv-scroll">
        {rest.map(p => (
          <div key={p.id} style={{ width: 180 }}>
            <Tile person={p} you={p.you} glow={glow}/>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenShareMock({ owner }) {
  // Faux IDE/code window — gives the share something to feel real
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "linear-gradient(180deg, oklch(0.13 0.012 250), oklch(0.10 0.010 250))",
      display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8,
                    padding: "8px 12px", background: "oklch(0.16 0.012 250)",
                    borderBottom: "1px solid oklch(0.22 0.012 250)",
                    fontSize: 11, color: "oklch(0.65 0.01 250)",
                    fontFamily: "var(--font-mono)" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "oklch(0.62 0.20 22)"}}/>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "oklch(0.80 0.16 80)"}}/>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "oklch(0.70 0.16 145)"}}/>
        <span style={{ marginLeft: 12 }}>peer.ts — RedVoice</span>
        <span style={{ marginLeft: "auto", fontSize: 10 }}>{owner}'s screen</span>
      </div>
      <div style={{ padding: "12px 16px", fontFamily:"var(--font-mono)", fontSize: 11,
                    color: "oklch(0.72 0.02 250)", lineHeight: 1.7, overflow: "hidden" }}>
        {[
          ["import", " { RTCPeer } ", "from", " './peer'"],
          ["const", " sock ", "=", " new ", "WebSocket(", `"${"wss://voice.r3dwolfie.com"}"`, ")"],
          [""],
          ["sock", ".on(", `"offer"`, ", async (", "msg", ") => {"],
          ["  const", " peer ", "=", " new ", "RTCPeer({ iceServers })"],
          ["  await", " peer.setRemote(", "msg.sdp", ")"],
          ["  peer", ".onTrack ", "=", " (t) => mountAudio(t)"],
          ["  return", " peer.createAnswer()"],
          ["})"],
          [""],
          ["// ", "TODO: dynamic SVC layer switch on bandwidth drop"],
        ].map((line, i) => (
          <div key={i} style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "oklch(0.40 0.01 250)", width: 20, textAlign: "right" }}>{i+1}</span>
            <span>
              {line.map((tok, j) => {
                const c = ["import","const","await","return","new"].includes(tok) ? "oklch(0.66 0.18 22)"
                        : tok.startsWith('"') ? "oklch(0.74 0.13 145)"
                        : tok.startsWith("//") ? "oklch(0.45 0.01 250)"
                        : tok.match(/^[a-z]+$/i) ? "oklch(0.85 0.02 250)"
                        : "oklch(0.70 0.02 250)";
                return <span key={j} style={{ color: c }}>{tok}</span>;
              })}
            </span>
          </div>
        ))}
        <div style={{ marginTop: 12, color: "oklch(0.55 0.10 145)" }}>
          <span style={{ color: "oklch(0.66 0.18 22)" }}>▸</span> peer connected — 3 tracks ▌
        </div>
      </div>
    </div>
  );
}

function ControlButton({ icon, label, active, danger, leave, emphasis, onClick }) {
  const bg = leave
    ? "linear-gradient(180deg, var(--accent-hover), var(--accent))"
    : emphasis
      ? "color-mix(in oklch, var(--accent) 20%, var(--bg-elev-2))"
      : danger
        ? "color-mix(in oklch, var(--accent) 14%, var(--bg-elev-2))"
        : "var(--bg-elev-2)";
  const br = leave
    ? "color-mix(in oklch, var(--accent) 70%, black)"
    : emphasis
      ? "color-mix(in oklch, var(--accent) 50%, var(--border))"
      : danger
        ? "color-mix(in oklch, var(--accent) 30%, var(--border))"
        : "var(--border)";
  const co = leave ? "var(--on-accent)" : danger ? "var(--accent-glow)" : "var(--text)";
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      padding: "10px 18px",
      background: bg, border: `1px solid ${br}`,
      borderRadius: "var(--r-lg)",
      color: co,
      cursor: "pointer",
      transition: "all var(--d-base) var(--ease-out)",
      minWidth: 84,
      boxShadow: leave
        ? "var(--shadow-1), 0 8px 24px -8px color-mix(in oklch, var(--accent) 60%, transparent)"
        : "var(--shadow-1)",
    }} onMouseEnter={e => {
      if (!leave) e.currentTarget.style.background = "var(--bg-elev-3)";
    }} onMouseLeave={e => {
      if (!leave) e.currentTarget.style.background = bg;
    }}>
      {icon}
      <span style={{ fontSize: "var(--t-xs)", fontWeight: 500, letterSpacing: ".01em" }}>{label}</span>
    </button>
  );
}

window.InRoomScreen = InRoomScreen;
