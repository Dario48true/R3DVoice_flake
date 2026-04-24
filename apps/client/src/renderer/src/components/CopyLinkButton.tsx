import { useState, type ReactElement } from "react";

export function CopyLinkButton({
  roomId,
  serverUrl,
}: {
  roomId: string;
  serverUrl: string;
}): ReactElement {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    const url = `${serverUrl.replace(/\/$/, "")}/join/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked — silently ignore, UI stays on default
    }
  }

  return (
    <button
      className="btn secondary"
      style={{ padding: "4px 10px" }}
      onClick={() => void copy()}
      title="Copy room link to clipboard"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
