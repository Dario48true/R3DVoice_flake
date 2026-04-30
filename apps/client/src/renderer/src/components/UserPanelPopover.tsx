import { type ReactElement } from "react";
import { I } from "./Icons.js";
import { DndToggle } from "./DndToggle.js";

type Props = {
  open: boolean;
  onClose(): void;
  displayName: string;
  handle: string | null;
  onOpenSettings(): void;
  onLogout(): void;
};

export function UserPanelPopover({ open, onClose, displayName, handle, onOpenSettings, onLogout }: Props): ReactElement | null {
  if (!open) return null;
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 60, background: "transparent" }}
      />
      <div
        style={{
          position: "absolute",
          left: "100%",
          bottom: 0,
          marginLeft: 8,
          minWidth: 240,
          background: "var(--bg-elev-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-2)",
          zIndex: 61,
          padding: "var(--s-3)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-2)",
        }}
      >
        <div style={{ padding: "var(--s-2) var(--s-3)" }}>
          <div style={{ fontWeight: 600 }}>{displayName}</div>
          {handle && <div style={{ color: "var(--text-faint)", fontSize: "var(--t-sm)" }}>@{handle}</div>}
        </div>
        <hr className="rv-rule" />
        <DndToggle />
        <hr className="rv-rule" />
        <button
          type="button"
          className="rv-btn"
          data-variant="ghost"
          onClick={() => { onOpenSettings(); onClose(); }}
          style={{ justifyContent: "flex-start", width: "100%" }}
        >
          <I.Settings size={14} /> Settings
        </button>
        <button
          type="button"
          className="rv-btn"
          data-variant="ghost"
          onClick={() => { onLogout(); onClose(); }}
          style={{ justifyContent: "flex-start", width: "100%" }}
        >
          <I.Logout size={14} /> Log out
        </button>
      </div>
    </>
  );
}
