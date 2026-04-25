import { useEffect, type ReactElement } from "react";
import { AuthProvider, useAuthStore } from "./lib/auth-context.js";
import { LoginScreen } from "./screens/LoginScreen.js";
import { LobbyScreen } from "./screens/LobbyScreen.js";
import { prefsActions } from "./lib/prefs-singleton.js";
import { WindowChrome, Spinner } from "./components/Primitives.js";

function Router(): ReactElement {
  const status = useAuthStore((s) => s.status);

  if (status === "loading") {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", gap: "var(--s-3)" }}>
        <Spinner />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--t-xs)",
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: "var(--text-mid)",
          }}
        >
          Loading…
        </span>
      </div>
    );
  }
  if (status === "authenticated") {
    return <LobbyScreen />;
  }
  return <LoginScreen />;
}

function Chrome(): ReactElement {
  const status = useAuthStore((s) => s.status);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const chromeTitle =
    status === "authenticated"
      ? "REDVOICE · LOBBY"
      : status === "loading"
        ? "REDVOICE · LOADING"
        : status === "totp-required"
          ? "REDVOICE · 2FA"
          : "REDVOICE · LOGIN";
  let serverLabel: string | undefined;
  try {
    serverLabel = new URL(serverUrl).host;
  } catch {
    serverLabel = serverUrl || undefined;
  }

  return (
    <WindowChrome title={chromeTitle} serverLabel={serverLabel}>
      <div key={status} className="rv-fade-in" style={{ minHeight: 0, height: "100%" }}>
        <Router />
      </div>
    </WindowChrome>
  );
}

export function App(): ReactElement {
  useEffect(() => {
    const k = prefsActions().pttKeybind;
    if (k) void window.redvoice.setPttKeybind(k);
  }, []);

  return (
    <AuthProvider>
      <Chrome />
    </AuthProvider>
  );
}
