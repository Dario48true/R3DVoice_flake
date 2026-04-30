import { useState, useEffect, type FormEvent, type ReactElement } from "react";
import { useAuthStore } from "../lib/auth-context.js";
import { usePrefs, prefsActions } from "../lib/prefs-singleton.js";
import { Field, Spinner, CrosshairCorner } from "../components/Primitives.js";
import { I } from "../components/Icons.js";
import { PublicServersModal } from "../components/PublicServersModal.js";
import { parseKeyBackup, saveKeyPair, loadKeyPair } from "../lib/key-storage.js";

type Mode = "login" | "register";

export function LoginScreen(): ReactElement {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const prefsServerUrl = usePrefs((s) => s.serverUrl);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const setServerUrl = useAuthStore((s) => s.setServerUrl);

  // Hydrate in-memory auth-store from persisted prefs on mount.
  useEffect(() => {
    setServerUrl(prefsServerUrl);
  }, [prefsServerUrl, setServerUrl]);

  // Debounced server health probe — validates the response body so ISP
  // NXDOMAIN redirects or captive portals don't show up as "reachable".
  const [probe, setProbe] = useState<"idle" | "checking" | "ok" | "down">("idle");
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (!serverUrl) {
      setProbe("idle");
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(serverUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad scheme");
    } catch {
      setProbe("down");
      return;
    }
    const ctrl = new AbortController();
    setProbe("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${parsed.origin}/health`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return setProbe("down");
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return setProbe("down");
        const body = (await res.json()) as { status?: string };
        setProbe(body.status === "ok" ? "ok" : "down");
      } catch {
        if (!ctrl.signal.aborted) setProbe("down");
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [serverUrl]);

  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const loginTotp = useAuthStore((s) => s.loginTotp);
  const cancelTotp = useAuthStore((s) => s.cancelTotp);
  const [totpCode, setTotpCode] = useState("");
  const [keyImportMessage, setKeyImportMessage] = useState<string | null>(null);

  const onImportKey = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const kp = parseKeyBackup(text);
      if (!kp) {
        setKeyImportMessage("Couldn't parse — make sure it's the redvoice-key-*.json file you downloaded at registration.");
        return;
      }
      saveKeyPair(kp);
      setKeyImportMessage("Key restored. Sign in to decrypt your DM history.");
    };
    reader.onerror = () => setKeyImportMessage("Failed to read file.");
    reader.readAsText(file);
    e.target.value = "";
  };

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (status === "totp-required") {
      await loginTotp(totpCode);
      setTotpCode("");
      return;
    }
    if (mode === "login") {
      await login(email, password);
    } else {
      await register(email, password, displayName);
    }
  }

  const busy = status === "loading";
  const totpStep = status === "totp-required";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", height: "100%" }}>
      <aside
        style={{
          position: "relative",
          background: `
          radial-gradient(80% 60% at 20% 10%,
            color-mix(in oklch, var(--rv-red-700) 35%, transparent), transparent 60%),
          radial-gradient(70% 60% at 90% 90%,
            color-mix(in oklch, var(--rv-red-900) 60%, transparent), transparent 60%),
          var(--rv-ink-0)`,
          padding: "var(--s-9)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          borderRight: "1px solid var(--border-soft)",
          overflow: "hidden",
        }}
      >
        <CrosshairCorner pos="tl" />
        <CrosshairCorner pos="tr" />
        <CrosshairCorner pos="bl" />
        <CrosshairCorner pos="br" />

        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", position: "relative" }}>
          <I.Logo size={28} />
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--t-xs)",
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: "var(--text-mid)",
            }}
          >
            REDVOICE / SIGNAL
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div
            className="rv-headline"
            style={{
              fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)",
              color: "var(--text)",
              marginBottom: "var(--s-4)",
            }}
          >
            Talk loud.
            <br />
            <span
              style={{
                background:
                  "linear-gradient(100deg, var(--accent-glow), var(--accent-hover) 60%, var(--rv-red-700))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Share screens.
            </span>
            <br />
            Own your server.
          </div>
          <p style={{ color: "var(--text-mid)", maxWidth: "32ch", fontSize: "var(--t-md)", lineHeight: 1.55 }}>
            Open-source voice + screenshare for friends, raid nights, and the people you actually want to hear.
          </p>
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--t-2xs)",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--text-faint)",
          }}
        >
          <span>build · 2026.04.25</span>
          <span>↳ self-hostable · MIT</span>
        </div>
      </aside>

      <main
        style={{
          display: "grid",
          placeItems: "center",
          padding: "var(--s-7)",
          background: "var(--bg)",
          position: "relative",
        }}
      >
        <form
          onSubmit={onSubmit}
          className="rv-fade-in"
          style={{
            width: "min(100%, 26rem)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-5)",
          }}
        >
          <div className="rv-tabs" role="tablist">
            <button
              type="button"
              className="rv-tab"
              data-active={mode === "login"}
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className="rv-tab"
              data-active={mode === "register"}
              onClick={() => setMode("register")}
            >
              Create account
            </button>
            <span style={{ flex: 1 }} />
            <span className="rv-label" style={{ alignSelf: "center" }}>
              SECURE&nbsp;·&nbsp;ARGON2ID
            </span>
          </div>

          <Field
            label="Server"
            hint="Self-hosted instance"
            right={
              <button
                type="button"
                className="rv-btn"
                data-variant="ghost"
                onClick={() => setPickerOpen(true)}
                style={{ height: "1.6rem", padding: "0 var(--s-3)", fontSize: "var(--t-xs)" }}
              >
                Browse public servers
              </button>
            }
          >
            <div style={{ position: "relative" }}>
              <input
                className="rv-input"
                value={serverUrl}
                onChange={(e) => {
                  // Wayland + Chromium input quirk: some layouts emit "\" for "/" —
                  // backslashes have no valid use in http(s) URLs, so normalize.
                  const normalized = e.target.value.replace(/\\/g, "/");
                  setServerUrl(normalized);
                  prefsActions().setServerUrl(normalized);
                }}
                placeholder="https://voice.R3dWolfie.com"
                spellCheck={false}
                style={{ paddingRight: "5.5rem" }}
              />
              <span
                className="rv-badge"
                data-tone={probe === "ok" ? "live" : probe === "down" ? "red" : "amber"}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: "1.4rem",
                }}
              >
                <span className="pip" />{" "}
                {probe === "checking" ? "checking…" : probe === "ok" ? "reachable" : probe === "down" ? "unreachable" : "—"}
              </span>
            </div>
          </Field>

          {!totpStep && mode === "register" && (
            <Field label="Display name">
              <input
                className="rv-input"
                type="text"
                required
                minLength={1}
                maxLength={50}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you'll appear"
              />
            </Field>
          )}

          {!totpStep && (
            <Field label="Email">
              <input
                className="rv-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          )}

          {!totpStep && (
            <Field label="Password">
              <input
                className="rv-input"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "register" ? 12 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "register" && <div className="rv-field-help">At least 12 characters.</div>}
            </Field>
          )}

          {totpStep && (
            <Field label="Two-factor code" hint="6 digits from your authenticator app">
              <input
                className="rv-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="123456"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.4em", textAlign: "center" }}
              />
            </Field>
          )}

          {error && (
            <div
              style={{
                color: "var(--accent-glow)",
                fontSize: "var(--t-sm)",
                padding: "var(--s-2) var(--s-3)",
                border: "1px solid color-mix(in oklch, var(--accent) 40%, transparent)",
                borderRadius: "var(--r-sm)",
                background: "color-mix(in oklch, var(--accent) 8%, var(--bg-elev-2))",
              }}
            >
              {error}
            </div>
          )}

          <button
            className="rv-btn"
            data-variant="primary"
            type="submit"
            disabled={busy || (totpStep && totpCode.length !== 6)}
            style={{ height: "2.6rem", marginTop: "var(--s-2)" }}
          >
            {busy ? (
              <>
                <Spinner /> {totpStep ? "Verifying…" : "Connecting…"}
              </>
            ) : totpStep ? (
              <>
                Verify <I.Chevron size={16} />
              </>
            ) : (
              <>
                {mode === "login" ? "Sign in" : "Create account"} <I.Chevron size={16} />
              </>
            )}
          </button>

          {totpStep && (
            <button
              type="button"
              className="rv-btn"
              data-variant="ghost"
              onClick={() => {
                setTotpCode("");
                cancelTotp();
              }}
            >
              Back to sign in
            </button>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s-3)",
              color: "var(--text-faint)",
              fontSize: "var(--t-xs)",
              fontFamily: "var(--font-mono)",
              letterSpacing: ".06em",
            }}
          >
            <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
            session restored from os keychain
            <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
          </div>

          {/* E2EE key import — shows on new devices where the user already has
              an account from elsewhere and needs to restore their backup. */}
          {!totpStep && mode === "login" && !loadKeyPair() && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--s-2)",
                fontSize: "var(--t-xs)",
                color: "var(--text-dim)",
                cursor: "pointer",
              }}
            >
              <input type="file" accept="application/json,.json" onChange={onImportKey} style={{ display: "none" }} />
              <span style={{ textDecoration: "underline" }}>Restore E2EE key backup…</span>
            </label>
          )}
          {keyImportMessage && (
            <div
              style={{
                fontSize: "var(--t-xs)",
                color: "var(--text-mid)",
                padding: "var(--s-2) var(--s-3)",
                border: "1px solid var(--border-soft)",
                borderRadius: "var(--r-sm)",
                background: "var(--bg-elev-2)",
              }}
            >
              {keyImportMessage}
            </div>
          )}
        </form>
      </main>
      <PublicServersModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(url) => {
          setServerUrl(url);
          prefsActions().setServerUrl(url);
        }}
      />
    </div>
  );
}
