import type { CSSProperties } from "react";
import { GUILLOCHE_HEIGHT, GUILLOCHE_TILE } from "@/lib/engraving";

export type GuillocheProps = {
  /** Band height in px. The 100px master pattern is scaled uniformly. Default 96. */
  height?: number;
  /** Slow phase drift: one full wave every 20s. Off under prefers-reduced-motion. */
  animate?: boolean;
  /** Drift in the opposite direction (for layering two bands). */
  reverse?: boolean;
  /** Mirror vertically (layering). */
  flip?: boolean;
  /** Extra opacity multiplier on top of the 35% ink baked into the pattern. */
  opacity?: number;
  /** Hairlines above and below the band. */
  rules?: boolean;
  className?: string;
};

/**
 * Guilloche band (brief 10.3): 18 phase-shifted sinusoids, --ink at 35% opacity.
 * Pattern is generated in lib/engraving.ts and served as a cached static SVG
 * from /engraving/guilloche.svg; this component tiles and drifts it.
 */
export function Guilloche({
  height = 96,
  animate = true,
  reverse = false,
  flip = false,
  opacity = 1,
  rules = false,
  className = "",
}: GuillocheProps) {
  const scale = height / GUILLOCHE_HEIGHT;
  const tile = Math.round(GUILLOCHE_TILE * scale);
  const style = {
    "--tile": `${tile}px`,
    width: `calc(100% + ${tile}px)`,
    backgroundImage: "url(/engraving/guilloche.svg)",
    backgroundRepeat: "repeat-x",
    backgroundSize: `${tile}px ${height}px`,
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative w-full overflow-hidden ${rules ? "border-y border-ink-3" : ""} ${className}`}
      style={{ height, opacity }}
    >
      <div style={flip ? { transform: "scaleY(-1)", height: "100%" } : { height: "100%" }}>
        <div
          className={`absolute inset-y-0 left-0 ${animate ? (reverse ? "guilloche-drift-reverse" : "guilloche-drift") : ""}`}
          style={style}
        />
      </div>
    </div>
  );
}
