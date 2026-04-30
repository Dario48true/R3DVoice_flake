import { useCallback, useEffect, useState, type ReactElement } from "react";
import { userHandleSchema } from "@redvoice/shared";
import { Modal } from "./Modal.js";
import { useAuthStore } from "../lib/auth-context.js";
import { ApiClient } from "../lib/api.js";

export function HandlePickGate(): ReactElement {
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.token);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<null | "checking" | "yes" | "no">(null);

  // Live availability check, debounced.
  useEffect(() => {
    if (!value) {
      setAvailable(null);
      return;
    }
    const parsed = userHandleSchema.safeParse(value);
    if (!parsed.success) {
      setAvailable(null);
      setError(parsed.error.issues[0]?.message ?? "invalid");
      return;
    }
    setError(null);
    setAvailable("checking");
    const t = setTimeout(async () => {
      const api = new ApiClient(serverUrl);
      api.setToken(token);
      try {
        await api.getUserByHandle(value);
        setAvailable("no");
      } catch {
        setAvailable("yes");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [value, serverUrl, token]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    const api = new ApiClient(serverUrl);
    api.setToken(token);
    try {
      await api.setMyHandle(value);
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }, [serverUrl, token, value, refreshUser]);

  return (
    <Modal open={true} onClose={() => { /* not dismissible */ }} title="Pick your handle" width="min(92vw, 480px)">
      <p style={{ color: "var(--text-mid)", marginBottom: "var(--s-4)" }}>
        Your handle is how friends find you on RedVoice. 3–24 characters, letters, digits, or underscores. Case is preserved for display but @Red and @red are the same person. You can't change it later.
      </p>
      <input
        autoFocus
        className="rv-input"
        placeholder="Alpha"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        onKeyDown={(e) => { if (e.key === "Enter" && available === "yes") void submit(); }}
      />
      <div style={{ minHeight: "1.6em", marginTop: "var(--s-2)", fontSize: "var(--t-sm)" }}>
        {error && <span style={{ color: "var(--accent)" }}>{error}</span>}
        {!error && available === "checking" && <span style={{ color: "var(--text-faint)" }}>checking…</span>}
        {!error && available === "yes" && <span style={{ color: "var(--rv-live)" }}>@{value} is available</span>}
        {!error && available === "no" && <span style={{ color: "var(--accent)" }}>@{value} is taken</span>}
      </div>
      <button
        className="rv-btn"
        data-variant="primary"
        disabled={busy || available !== "yes"}
        onClick={() => void submit()}
        style={{ marginTop: "var(--s-4)", width: "100%" }}
      >
        {busy ? "saving…" : "Set handle"}
      </button>
    </Modal>
  );
}
