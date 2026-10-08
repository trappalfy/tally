export type CountdownProps = {
  /** Seconds remaining. Values <= 0 render 00:00. */
  seconds: number;
  /** Seconds below which the digits turn --danger. Default 300 (5 minutes). */
  dangerBelow?: number;
  size?: "md" | "lg" | "xl";
  /** Mono caption above the digits, e.g. "START BY". */
  label?: string;
  className?: string;
};

const sizes = {
  md: "text-[28px]",
  lg: "text-[44px] md:text-[56px]",
  xl: "text-[56px] md:text-[88px]",
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function formatCountdown(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * Big lime Departure Mono timer. Purely presentational: the caller ticks `seconds`.
 * Turns --danger in the last 5 minutes.
 */
export function Countdown({ seconds, dangerBelow = 300, size = "lg", label, className = "" }: CountdownProps) {
  const danger = seconds < dangerBelow;
  return (
    <div className={className}>
      {label && <div className="stamp mb-2 text-[11px] text-ink-2">{label}</div>}
      <div
        role="timer"
        aria-live="off"
        className={`stamp tabular-nums leading-none ${sizes[size]} ${danger ? "text-danger" : "text-lime"}`}
        style={{ letterSpacing: "0.02em" }}
      >
        {formatCountdown(seconds)}
      </div>
    </div>
  );
}
