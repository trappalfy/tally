export type GaugeProps = {
  /** Needle position in percent. Default 130 (at mint). */
  value?: number;
  /** Plate under the dial, e.g. "TOP-UP $1.58". */
  plate?: string;
  className?: string;
};

const MIN = 100;
const MAX = 150;
const START = 225; // degrees, 100% at lower-left
const SWEEP = 270; // clockwise through the top to lower-right
const CX = 200;
const CY = 196;

function f(n: number) {
  return Math.round(n * 100) / 100;
}

/** Angle (radians, SVG coords) for a percentage on the dial. */
function angle(v: number) {
  const deg = START - ((v - MIN) / (MAX - MIN)) * SWEEP;
  return (deg * Math.PI) / 180;
}

function polar(v: number, r: number) {
  const a = angle(v);
  return [f(CX + r * Math.cos(a)), f(CY - r * Math.sin(a))] as const;
}

/**
 * Engraved collateral gauge for "Backed, not promised" (inline SVG, server-rendered).
 * Lime band = top-up zone (100–115%), lime dot = mint line (130%).
 */
export function Gauge({ value = 130, plate = "TOP-UP $1.58", className = "" }: GaugeProps) {
  const ticks: { v: number; major: boolean }[] = [];
  for (let v = MIN; v <= MAX; v++) ticks.push({ v, major: v % 5 === 0 });

  // guilloche ring: offset circles around the bezel
  const ring = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    return { cx: f(CX + 168 * Math.cos(a)), cy: f(CY + 168 * Math.sin(a)) };
  });

  // engraved dial face: concentric hairlines
  const face = Array.from({ length: 34 }, (_, i) => 6 + i * 4);

  const [nx, ny] = polar(value, 118);
  const [tx, ty] = polar(value, -22);
  const [dotX, dotY] = polar(130, 142);
  const labels = [100, 115, 130, 140, 150];

  return (
    <svg
      viewBox="0 0 400 440"
      role="img"
      aria-label={`Collateral gauge. Mint at 130%, top-up below 115%. ${plate}`}
      className={`h-auto w-full ${className}`}
    >
      {/* engraved frame with horizontal hatching */}
      <defs>
        <pattern id="gauge-hatch" width="4" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0.5" x2="4" y2="0.5" stroke="var(--ink)" strokeOpacity="0.28" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect x="6" y="6" width="388" height="388" fill="url(#gauge-hatch)" stroke="var(--ink)" strokeOpacity="0.7" />
      <rect x="14" y="14" width="372" height="372" fill="none" stroke="var(--ink)" strokeOpacity="0.4" strokeWidth="0.6" />

      {/* bezel */}
      <circle cx={CX} cy={CY} r="186" fill="var(--paper)" stroke="var(--ink)" strokeOpacity="0.8" strokeWidth="1.2" />
      <g fill="none" stroke="var(--ink)" strokeOpacity="0.32" strokeWidth="0.5">
        {ring.map((c, i) => (
          <circle key={i} cx={c.cx} cy={c.cy} r="16" />
        ))}
      </g>
      <circle cx={CX} cy={CY} r="150" fill="var(--paper)" stroke="var(--ink)" strokeOpacity="0.9" strokeWidth="1.5" />
      <circle cx={CX} cy={CY} r="145" fill="none" stroke="var(--ink)" strokeOpacity="0.4" strokeWidth="0.6" />

      {/* face hairlines */}
      <g fill="none" stroke="var(--ink)" strokeOpacity="0.14" strokeWidth="0.6">
        {face.map((r) => (
          <circle key={r} cx={CX} cy={CY} r={r} />
        ))}
      </g>

      {/* ticks */}
      <g strokeLinecap="square">
        {ticks.map(({ v, major }) => {
          const inZone = v <= 115;
          const [x1, y1] = polar(v, 138);
          const [x2, y2] = polar(v, major ? 118 : inZone ? 122 : 128);
          return (
            <line
              key={v}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={inZone ? "var(--lime)" : "var(--ink)"}
              strokeOpacity={inZone ? 1 : major ? 0.9 : 0.55}
              strokeWidth={inZone ? 3.2 : major ? 1.6 : 0.8}
            />
          );
        })}
      </g>

      {/* labels */}
      <g fontFamily="var(--font-departure), monospace" fontSize="13" textAnchor="middle" dominantBaseline="middle">
        {labels.map((v) => {
          const [x, y] = polar(v, 98);
          return (
            <text key={v} x={x} y={y} fill={v === 115 || v === 130 ? "var(--lime)" : "var(--ink)"}>
              {v}%
            </text>
          );
        })}
      </g>

      {/* mint dot */}
      <rect x={dotX - 5} y={dotY - 5} width="10" height="10" fill="var(--lime)" />

      {/* needle */}
      <line x1={tx} y1={ty} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth="3" strokeLinecap="square" />
      <circle cx={CX} cy={CY} r="11" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx={CX} cy={CY} r="4" fill="var(--ink)" />

      {/* plate */}
      <rect x="92" y="366" width="216" height="56" fill="var(--paper)" stroke="var(--ink)" strokeOpacity="0.9" />
      <rect x="97" y="371" width="206" height="46" fill="none" stroke="var(--ink)" strokeOpacity="0.4" strokeWidth="0.6" />
      <text
        x="200"
        y="395"
        fill="var(--lime)"
        fontFamily="var(--font-departure), monospace"
        fontSize="20"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {plate}
      </text>
    </svg>
  );
}
