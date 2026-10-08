/**
 * Tally monogram: two parallel slanted lime strokes.
 * PLACEHOLDER until the owner provides the official logo file (brand/logo/).
 * Source: brand/logo/tally-monogram.svg (also app/icon.svg).
 */
export function Monogram({ size = 28, framed = true, className = "" }: { size?: number; framed?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {framed && <rect width="64" height="64" fill="#050505" />}
      <g fill="#C8FC00">
        <polygon points="16,52 24,52 36,12 28,12" />
        <polygon points="28,52 36,52 48,12 40,12" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Monogram size={30} className="border border-ink-3" />
      <span className="stamp text-[17px] tracking-[0.18em] text-ink">TALLY</span>
    </span>
  );
}
