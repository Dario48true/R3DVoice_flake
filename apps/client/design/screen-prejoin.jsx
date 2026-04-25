// Pre-join — mic check + share-screen toggle
const { useState: useStateP, useEffect: useEffectP, useRef: useRefP } = React;

function PreJoinScreen({ roomId, onJoin, onCancel }) {
  const [mic, setMic] = useStateP("Default · Yeti X");
  const [spk, setSpk] = useStateP("Default · System output");
  const [share, setShare] = useStateP(false);
  const [res, setRes] = useStateP("1080p");
  const [fps, setFps] = useStateP(30);
  const [sysAudio, setSysAudio] = useStateP(true);
  const [vu, setVu] = useStateP(0);
  const ref = useRefP(0);

  // Faux VU meter — sine wave with noise
  useEffectP(() => {
    let raf;
    const tick = () => {
      ref.current += 0.06;
      const v = (Math.sin(ref.current) * 0.5 + 0.5) * 0.55
              + (Math.sin(ref.current * 4.3) * 0.5 + 0.5) * 0.25
              + Math.random() * 0.08;
      setVu(Math.min(1, Math.max(0.05, v)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", padding: "var(--s-7)" }}>
      <div className="rv-card rv-fade-in" data-glow="true"
           style={{ width: "min(100%, 38rem)", padding: "var(--s-8)" }}>
        <div className="rv-corner-tag">PRE-JOIN · MIC CHECK</div>
        <div style={{ marginTop: "var(--s-3)", marginBottom: "var(--s-6)" }}>
          <div className="rv-headline" style={{ fontSize: "var(--t-2xl)", marginBottom: "var(--s-2)" }}>
            One last sound check.
          </div>
          <div className="rv-mono" style={{ fontSize: "var(--t-xs)", color: "var(--text-dim)", letterSpacing: ".06em" }}>
            ROOM&nbsp;·&nbsp;<span style={{color:"var(--text-mid)"}}>{roomId}</span>
          </div>
        </div>

        {/* Mic + VU */}
        <Field label="Microphone" right={<span className="rv-mono" style={{ fontSize:"var(--t-2xs)", color:"var(--text-faint)"}}>INPUT · 48 kHz</span>}>
          <div style={{ position:"relative" }}>
            <select className="rv-select" value={mic} onChange={e=>setMic(e.target.value)} style={{ paddingLeft: "2.4rem" }}>
              <option>Default · Yeti X</option>
              <option>MacBook Pro Mic</option>
              <option>AirPods Pro</option>
            </select>
            <I.Mic size={14} style={{ position:"absolute", left: 12, top: "50%", transform:"translateY(-50%)", color:"var(--text-mid)"}}/>
          </div>
          <div style={{ marginTop: "var(--s-3)", display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
            <div className="rv-vu" style={{ flex: 1, height: 10 }}>
              <div className="rv-vu-fill" style={{ width: `${vu*100}%` }}/>
              <div className="rv-vu-ticks"/>
            </div>
            <span className="rv-mono" style={{ fontSize: "var(--t-2xs)", width: "3.6rem", textAlign:"right",
                                               color: vu > 0.85 ? "var(--accent-glow)" : "var(--text-dim)" }}>
              {Math.round(-60 + vu*60)} dB
            </span>
          </div>
          <div style={{ marginTop: "var(--s-2)", fontSize:"var(--t-xs)", color:"var(--text-dim)" }}>
            Speak normally — we'll keep noise suppression on by default.
          </div>
        </Field>

        <div style={{ height: "var(--s-5)" }}/>

        {/* Speaker */}
        <Field label="Speakers" right={<button className="rv-btn" data-variant="ghost"
                                              style={{ height: "1.6rem", padding: "0 var(--s-2)", fontSize: "var(--t-xs)" }}>
                                          <I.Wave size={12}/> Test
                                        </button>}>
          <div style={{ position:"relative" }}>
            <select className="rv-select" value={spk} onChange={e=>setSpk(e.target.value)} style={{ paddingLeft: "2.4rem" }}>
              <option>Default · System output</option>
              <option>HD650 (USB DAC)</option>
              <option>Studio Monitors</option>
            </select>
            <I.Headphones size={14} style={{ position:"absolute", left: 12, top: "50%", transform:"translateY(-50%)", color:"var(--text-mid)"}}/>
          </div>
        </Field>

        <hr className="rv-rule" style={{ margin: "var(--s-6) 0" }}/>

        {/* Screen-share */}
        <label className="rv-check">
          <input type="checkbox" checked={share} onChange={e=>setShare(e.target.checked)}/>
          <span className="rv-check-box"/>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
            <I.Screen size={16} style={{ color: share ? "var(--accent-glow)" : "var(--text-mid)" }}/>
            <span style={{ fontWeight: 500 }}>Share a screen</span>
            <span style={{ color: "var(--text-faint)", fontSize: "var(--t-xs)" }}>
              — you'll pick the window or monitor on join
            </span>
          </span>
        </label>

        <div style={{
          display: "grid",
          gridTemplateRows: share ? "1fr" : "0fr",
          transition: `grid-template-rows var(--d-slow) var(--ease-out)`,
        }}>
          <div style={{ overflow: "hidden" }}>
            <div style={{
              marginTop: share ? "var(--s-4)" : 0,
              padding: "var(--s-4) var(--s-5)",
              background: "color-mix(in oklch, var(--accent) 6%, var(--bg-elev-2))",
              border: "1px solid color-mix(in oklch, var(--accent) 30%, var(--border-soft))",
              borderRadius: "var(--r-md)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--s-4) var(--s-5)",
              alignItems: "center",
            }}>
              <Field label="Resolution">
                <Segmented options={["720p", "1080p", "1440p"]} value={res} onChange={setRes}/>
              </Field>
              <Field label="Frame rate">
                <Segmented options={[24, 30, 60]} value={fps} onChange={setFps} suffix=" fps"/>
              </Field>
              <label className="rv-check" style={{ gridColumn: "1 / -1" }}>
                <input type="checkbox" checked={sysAudio} onChange={e=>setSysAudio(e.target.checked)}/>
                <span className="rv-check-box"/>
                <span>Include system audio
                  <span style={{ color: "var(--text-faint)", fontSize: "var(--t-xs)", marginLeft: "var(--s-2)" }}>
                    (macOS asks for permission once)
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{
          marginTop: "var(--s-7)",
          display: "flex", gap: "var(--s-3)", justifyContent: "flex-end",
          alignItems: "center",
        }}>
          <span className="rv-mono" style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)", marginRight: "auto", letterSpacing: ".06em" }}>
            ↵ ENTER TO JOIN
          </span>
          <button className="rv-btn" onClick={onCancel}>Cancel</button>
          <button className="rv-btn" data-variant="primary" onClick={onJoin} style={{ minWidth: "9rem" }}>
            <I.Mic size={14}/> Join now
          </button>
        </div>
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange, suffix = "" }) {
  return (
    <div style={{
      display: "inline-flex",
      padding: 3,
      background: "var(--bg-elev-3)",
      border: "1px solid var(--border-soft)",
      borderRadius: "var(--r-md)",
      gap: 2,
    }}>
      {options.map(o => (
        <button key={o} type="button"
                onClick={() => onChange(o)}
                style={{
                  appearance: "none", border: 0,
                  padding: "6px 14px",
                  borderRadius: "calc(var(--r-md) - 3px)",
                  background: value===o
                    ? "linear-gradient(180deg, var(--accent-hover), var(--accent))"
                    : "transparent",
                  color: value===o ? "var(--on-accent)" : "var(--text-mid)",
                  fontSize: "var(--t-sm)", fontWeight: 500,
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  boxShadow: value===o ? "var(--shadow-1)" : "none",
                  transition: "all var(--d-base) var(--ease-out)",
                }}>
          {o}{suffix}
        </button>
      ))}
    </div>
  );
}

window.PreJoinScreen = PreJoinScreen;
window.Segmented = Segmented;
