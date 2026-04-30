import { type ReactElement } from "react";

type Props = { count: number; size?: "sm" | "md" };

/**
 * Small numeric badge. Renders nothing when count <= 0. Caps display at "9+".
 */
export function UnreadDot({ count, size = "sm" }: Props): ReactElement | null {
  if (count <= 0) return null;
  const display = count > 9 ? "9+" : String(count);
  const dim = size === "sm" ? 16 : 20;
  return (
    <span
      style={{
        display: "inline-grid",
        placeItems: "center",
        minWidth: dim,
        height: dim,
        padding: count > 9 ? "0 4px" : 0,
        background: "var(--accent)",
        color: "#fff",
        borderRadius: dim / 2,
        fontSize: size === "sm" ? 10 : 12,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {display}
    </span>
  );
}
