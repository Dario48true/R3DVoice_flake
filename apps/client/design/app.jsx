// RedVoice — app shell + state machine
const { useState: useStateA, useEffect: useEffectA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "screen": "lobby",
  "accentHue": 22,
  "density": "regular",
  "layout": "auto",
  "glow": "on",
  "grain": "on",
  "theme": "dark",
  "logo": "wolfie"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = useStateA(t.screen || "lobby");
  const [user, setUser] = useStateA("Red");
  const [roomId, setRoomId] = useStateA("5a11e794-cbfe-4093-8ecd-3b6488335d87");
  const [showSettings, setShowSettings] = useStateA(false);
  const [showChangelog, setShowChangelog] = useStateA(false);

  // sync screen tweak ⇄ state
  useEffectA(() => { if (t.screen !== screen) setTweak("screen", screen); }, [screen]);
  useEffectA(() => { if (t.screen !== screen) setScreen(t.screen); }, [t.screen]);

  // apply theme + density to root
  useEffectA(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
    document.documentElement.dataset.grain = t.grain;
    document.documentElement.dataset.glow = t.glow;
    document.documentElement.dataset.logo = t.logo;
    // Live accent hue swap
    const h = t.accentHue;
    document.documentElement.style.setProperty("--rv-red-400", `oklch(0.66 0.185 ${h})`);
    document.documentElement.style.setProperty("--rv-red-500", `oklch(0.58 0.190 ${h})`);
    document.documentElement.style.setProperty("--rv-red-600", `oklch(0.50 0.175 ${h})`);
    document.documentElement.style.setProperty("--rv-red-700", `oklch(0.42 0.140 ${h})`);
    document.documentElement.style.setProperty("--rv-red-900", `oklch(0.22 0.060 ${h})`);
    document.documentElement.style.setProperty("--rv-red-950", `oklch(0.16 0.040 ${h})`);
  }, [t.theme, t.density, t.grain, t.glow, t.accentHue, t.logo]);

  return (
    <WindowChrome title={`REDVOICE · ${screen.toUpperCase()}`}>
      <div key={screen} className="rv-fade-in" style={{ minHeight: 0 }}>
        {screen === "login" && (
          <LoginScreen onLogin={(name) => { setUser(name); setScreen("lobby"); }}/>
        )}
        {screen === "lobby" && (
          <LobbyScreen
            user={user}
            onJoin={(id) => { setRoomId(id); setScreen("prejoin"); }}
            onCreate={(name) => {
              setRoomId(("rv-" + name.toLowerCase().replace(/\s+/g,"-")) +
                         "-" + Math.random().toString(16).slice(2,8));
              setScreen("prejoin");
            }}
            onOpenSettings={() => setShowSettings(true)}
            onOpenChangelog={() => setShowChangelog(true)}
            onLogout={() => setScreen("login")}
          />
        )}
        {screen === "prejoin" && (
          <PreJoinScreen roomId={roomId}
                         onJoin={() => setScreen("inroom")}
                         onCancel={() => setScreen("lobby")}/>
        )}
        {screen === "inroom" && (
          <InRoomScreen roomId={roomId}
                        layout={t.layout}
                        glow={t.glow}
                        onLayoutChange={(v) => setTweak("layout", v)}
                        onLeave={() => setScreen("lobby")}
                        onOpenSettings={() => setShowSettings(true)}/>
        )}
      </div>

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)}/>
      <ChangelogModal open={showChangelog} onClose={() => setShowChangelog(false)}/>

      <TweaksPanel>
        <TweakSection label="Navigation"/>
        <TweakRadio label="Screen" value={t.screen}
                    options={["login", "lobby", "prejoin", "inroom"]}
                    onChange={(v) => { setTweak("screen", v); setScreen(v); }}/>
        <TweakButton label="Open settings" onClick={() => setShowSettings(true)}/>
        <TweakButton label="Open changelog" onClick={() => setShowChangelog(true)}/>

        <TweakSection label="Theme"/>
        <TweakRadio label="Mode" value={t.theme} options={["dark", "light"]}
                    onChange={(v) => setTweak("theme", v)}/>
        <TweakSlider label="Accent hue" value={t.accentHue} min={0} max={60} step={1} unit="°"
                     onChange={(v) => setTweak("accentHue", v)}/>
        <TweakRadio label="Density" value={t.density}
                    options={["compact", "regular", "comfy"]}
                    onChange={(v) => setTweak("density", v)}/>
        <TweakToggle label="Film grain" value={t.grain === "on"}
                     onChange={(v) => setTweak("grain", v ? "on" : "off")}/>

        <TweakSection label="Brand"/>
        <TweakSelect label="Logo" value={t.logo}
                     options={["monogram", "signal", "bracket", "wolfie", "wolfie_loaf", "wolfie_trotter", "wolfie_alpha"]}
                     onChange={(v) => setTweak("logo", v)}/>

        <TweakSection label="In-room"/>
        <TweakRadio label="Layout" value={t.layout}
                    options={["auto", "grid", "speaker"]}
                    onChange={(v) => setTweak("layout", v)}/>
        <TweakToggle label="Speaking glow" value={t.glow === "on"}
                     onChange={(v) => setTweak("glow", v ? "on" : "off")}/>
      </TweaksPanel>
    </WindowChrome>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
