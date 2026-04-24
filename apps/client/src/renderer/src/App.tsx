import { useEffect, type ReactElement } from "react";
import { AuthProvider, useAuthStore } from "./lib/auth-context.js";
import { LoginScreen } from "./screens/LoginScreen.js";
import { LobbyScreen } from "./screens/LobbyScreen.js";
import { prefsActions } from "./lib/prefs-singleton.js";

function Router(): ReactElement {
  const status = useAuthStore((s) => s.status);

  if (status === "loading") {
    return (
      <div className="centered">
        <div style={{ color: "var(--text-dim)" }}>Loading…</div>
      </div>
    );
  }
  if (status === "authenticated") {
    return <LobbyScreen />;
  }
  return <LoginScreen />;
}

export function App(): ReactElement {
  useEffect(() => {
    const k = prefsActions().pttKeybind;
    if (k) void window.redvoice.setPttKeybind(k);
  }, []);

  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
