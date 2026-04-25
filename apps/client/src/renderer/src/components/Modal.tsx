import { useEffect, type ReactElement, type ReactNode } from "react";
import { I } from "./Icons.js";

// Generic modal shell — port of designer screen-modals.jsx lines 4-44.
// Backdrop click and ESC both close. Inner card stops propagation so clicks
// inside don't bubble up to the backdrop.
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  width = "min(94vw, 720px)",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: string;
  children: ReactNode;
}): ReactElement | null {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "color-mix(in oklch, var(--rv-ink-0) 70%, transparent)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        animation: "rv-fade var(--d-mid) var(--ease-out) both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxHeight: "82vh",
          background: "var(--bg-elev)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-3)",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          overflow: "hidden",
          animation: "rv-modal-in var(--d-mid) var(--ease-out) both",
        }}
      >
        <header
          style={{
            padding: "var(--s-5) var(--s-6)",
            borderBottom: "1px solid var(--border-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "var(--t-lg)", fontWeight: 600, letterSpacing: "-0.01em" }}>
              {title}
            </div>
            {subtitle && (
              <div
                className="rv-mono"
                style={{
                  fontSize: "var(--t-2xs)",
                  color: "var(--text-faint)",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          <button
            className="rv-btn rv-btn-icon"
            data-variant="ghost"
            onClick={onClose}
            aria-label="Close"
          >
            <I.X size={16} />
          </button>
        </header>
        <div style={{ overflow: "auto", minHeight: 0 }} className="rv-scroll">
          {children}
        </div>
      </div>
    </div>
  );
}
