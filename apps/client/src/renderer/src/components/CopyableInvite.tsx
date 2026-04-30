import { useCallback, useState, type ReactElement } from "react";

type Props = { code: string; serverUrl: string; onClose(): void };

export function CopyableInvite({ code, serverUrl, onClose }: Props): ReactElement {
  const url = `${serverUrl.replace(/\/$/, "")}/invite/${code}`;
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  }, [url]);

  return (
    <div>
      <p style={{ color: "var(--text-mid)", marginBottom: "var(--s-3)" }}>
        Anyone with this link can redeem until it expires or you revoke it.
      </p>
      <div style={{ display: "flex", gap: "var(--s-2)" }}>
        <input className="rv-input" readOnly value={url} style={{ flex: 1, fontFamily: "var(--font-mono)" }} />
        <button className="rv-btn" data-variant="primary" onClick={() => void copy()}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <button className="rv-btn" onClick={onClose} style={{ marginTop: "var(--s-4)", width: "100%" }}>Done</button>
    </div>
  );
}
