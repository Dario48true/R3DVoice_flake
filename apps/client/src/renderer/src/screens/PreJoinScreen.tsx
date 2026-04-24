import { useState, type ReactElement } from "react";

export interface PreJoinSelection {
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  publishScreen: boolean;
}

export interface PreJoinScreenProps {
  roomId: string;
  onJoin(selection: PreJoinSelection): void;
  onCancel(): void;
}

export function PreJoinScreen(props: PreJoinScreenProps): ReactElement {
  const [busy, setBusy] = useState(false);

  function handleJoin(): void {
    setBusy(true);
    props.onJoin({ micDeviceId: null, speakerDeviceId: null, publishScreen: false });
  }

  return (
    <div className="centered">
      <div className="form" style={{ maxWidth: 480 }}>
        <h2 style={{ margin: 0 }}>Pre-join check</h2>
        <div style={{ color: "var(--text-dim)" }}>Room: {props.roomId}</div>

        <div style={{ color: "var(--text-dim)" }}>
          Device pickers and screenshare source arrive in the next tasks.
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handleJoin} disabled={busy}>
            {busy ? "Joining…" : "Join now"}
          </button>
          <button className="btn secondary" onClick={props.onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
