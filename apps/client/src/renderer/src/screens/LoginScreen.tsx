import { useState, type FormEvent, type ReactElement } from "react";
import { useAuthStore } from "../lib/auth-context.js";

type Mode = "login" | "register";

export function LoginScreen(): ReactElement {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const serverUrl = useAuthStore((s) => s.serverUrl);
  const setServerUrl = useAuthStore((s) => s.setServerUrl);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (mode === "login") {
      await login(email, password);
    } else {
      await register(email, password, displayName);
    }
  }

  const busy = status === "loading";

  return (
    <div className="centered">
      <form className="form" onSubmit={onSubmit}>
        <h2 style={{ margin: 0 }}>RedVoice</h2>

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <label>
          <div className="section-title">Server</div>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:3000"
            spellCheck={false}
          />
        </label>

        <label>
          <div className="section-title">Email</div>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {mode === "register" && (
          <label>
            <div className="section-title">Display name</div>
            <input
              type="text"
              required
              minLength={1}
              maxLength={50}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
        )}

        <label>
          <div className="section-title">Password</div>
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? 12 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "register" && (
            <div className="section-title" style={{ marginTop: 4, textTransform: "none" }}>
              At least 12 characters.
            </div>
          )}
        </label>

        {error && <div className="error">{error}</div>}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
