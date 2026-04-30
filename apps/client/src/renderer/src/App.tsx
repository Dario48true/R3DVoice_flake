import { useEffect, useState, type ReactElement } from "react";
import { AuthProvider, useAuthStore, useNeedsHandle } from "./lib/auth-context.js";
import { disconnectTransport, ensureTransport, setCurrentUserForNotifications } from "./lib/chat-transport.js";
import { LoginScreen } from "./screens/LoginScreen.js";
import { LobbyScreen } from "./screens/LobbyScreen.js";
import { HandlePickGate } from "./components/HandlePickGate.js";
import { prefsActions } from "./lib/prefs-singleton.js";
import { WindowChrome, Spinner } from "./components/Primitives.js";
import { LeftIconColumn, type TopPage } from "./components/LeftIconColumn.js";
import { DmsScreen } from "./screens/DmsScreen.js";
import { SettingsModal } from "./components/SettingsModal.js";

function Router(): ReactElement {
  const status = useAuthStore((s) => s.status);
  const needsHandle = useNeedsHandle();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  useEffect(() => {
    setCurrentUserForNotifications(user ?? null);
  }, [user]);

  // App-wide WS lifecycle. The transport must exist for the entire logged-in
  // session — otherwise WS-targeted events (mentions, friend requests,
  // invite redemptions, presence updates) silently drop whenever the user
  // isn't viewing a chat panel. Connect on auth, disconnect on logout.
  useEffect(() => {
    if (token && serverUrl) {
      ensureTransport(serverUrl, token);
      return () => {
        // Don't disconnect on every re-render — only on actual logout
        // (token cleared). The next branch handles that.
      };
    }
    disconnectTransport();
    return undefined;
  }, [token, serverUrl]);

  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get("invite");
    } catch {
      return null;
    }
  });
  const [topPage, setTopPage] = useState<TopPage>("lobby");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Listen for invite deep links from the main process.
  useEffect(() => {
    const off = window.redvoice.onInviteCode((code: string) => setPendingInviteCode(code));
    return off;
  }, []);

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
    if (needsHandle) {
      return <HandlePickGate />;
    }
    return (
      <div style={{ display: "flex", height: "100%" }}>
        <LeftIconColumn
          active={topPage}
          onNavigate={setTopPage}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {topPage === "lobby" ? (
            <LobbyScreen
              pendingInviteCode={pendingInviteCode}
              onInviteCodeConsumed={() => {
                setPendingInviteCode(null);
                try {
                  const u = new URL(window.location.href);
                  u.searchParams.delete("invite");
                  window.history.replaceState({}, "", u.toString());
                } catch {
                  // ignore
                }
              }}
              onInviteCode={(code) => setPendingInviteCode(code)}
            />
          ) : (
            <DmsScreen />
          )}
        </div>
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </div>
    );
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
