export type RosetteProps = {
  /** Numeral in the centre (Instrument Serif). Default "1". */
  value?: string | number;
  /** Caption under the numeral (Departure Mono). Default "NCU". */
  unit?: string;
  /** Diameter in px. Default 120. */
  size?: number;
  className?: string;
};

/**
 * Denomination rosette (brief 10.3): 10 closed curves
 * r = R − 14 + 10·sin(9t + 0.63k) + 4·sin(27t − k), numeral in serif + "NCU".
 * Curves come from /engraving/rosette.svg (generated in lib/engraving.ts).
 */
export function Rosette({ value = "1", unit = "NCU", size = 120, className = "" }: RosetteProps) {
  return (
    <div
      role="img"
      aria-label={`${value} ${unit}`}
      className={`relative inline-flex shrink-0 select-none flex-col items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: "url(/engraving/rosette.svg)",
        backgroundSize: "100% 100%",
      }}
    >
      <span
        aria-hidden="true"
        className="font-serif leading-none text-ink"
        style={{ fontSize: Math.round(size * 0.3), marginTop: -Math.round(size * 0.04) }}
      >
        {value}
      </span>
      <span
        aria-hidden="true"
        className="stamp text-ink-2"
        style={{ fontSize: Math.max(8, Math.round(size * 0.075)), marginTop: Math.round(size * 0.02) }}
      >
        {unit}
      </span>
    </div>
  );
}
