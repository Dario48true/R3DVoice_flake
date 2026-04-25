import type { CSSProperties, ReactElement, ReactNode } from "react";

export function WindowChrome({
  title,
  version = "v0.1.5",
  serverLabel = "localhost:3000",
  children,
}: {
  title: string;
  version?: string;
  serverLabel?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="rv-window">
      <div className="rv-titlebar">
        <div className="rv-titlebar-left">
          <div className="rv-traffic">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
          </div>
          <span className="rv-titlebar-title">{title}</span>
        </div>
        <div className="rv-titlebar-right">
          <span className="rv-titlebar-title" style={{ opacity: 0.6 }}>
            {version} · {serverLabel}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  right,
  children,
}: {
  label: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="rv-field">
      <div className="rv-field-label">
        <span className="rv-label">{label}</span>
        {right}
      </div>
      {children}
      {hint && <span className="rv-field-help">{hint}</span>}
    </div>
  );
}

export function Spinner(): ReactElement {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "rv-spin .7s linear infinite",
      }}
    />
  );
}

export function CrosshairCorner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }): ReactElement {
  const map: Record<"tl" | "tr" | "bl" | "br", CSSProperties> = {
    tl: { top: 24, left: 24 },
    tr: { top: 24, right: 24 },
    bl: { bottom: 24, left: 24 },
    br: { bottom: 24, right: 24 },
  };
  return (
    <div style={{ position: "absolute", width: 14, height: 14, color: "var(--rv-red-700)", opacity: 0.55, ...map[pos] }}>
      <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M0 1 H6 M1 0 V6" />
      </svg>
    </div>
  );
}
