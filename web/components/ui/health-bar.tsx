import { MINT_COLLATERAL, TOPUP_LINE } from "@/lib/config";

export type HealthBarProps = {
  /** Collateral ratio in percent, e.g. 128.4. `null` = no outstanding receipts (healthy). */
  value: number | null;
  /** Left edge of the scale in percent. Default 90. */
  min?: number;
  /** Right edge of the scale in percent. Default 150. */
  max?: number;
  /** Compact variant for listing rows: no labels under the scale. */
  compact?: boolean;
  /** Optional caption on the left of the readout. */
  label?: string;
  className?: string;
};

const MARKS = [100, 115, 130] as const;
const DANGER_BELOW = 115;

function pct(v: number, min: number, max: number) {
  return Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
}

/**
 * Provider health: horizontal engraved scale with ticks at 100 / 115 / 130%.
 * Turns --danger below 115% (the top-up line).
 */
export function HealthBar({ value, min = 90, max = 150, compact = false, label, className = "" }: HealthBarProps) {
  const danger = value !== null && value < DANGER_BELOW;
  const color = danger ? "var(--danger)" : "var(--lime)";
  const pos = value === null ? 100 : pct(value, min, max);
  const readout = value === null ? "NO RECEIPTS OUT" : `${value.toFixed(value >= 1000 ? 0 : 2)}%`;
  const minorCount = Math.round(max - min);

  return (
    <div className={`w-full ${className}`}>
      {!compact && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="stamp text-[11px] text-ink-2">{label ?? "COLLATERAL RATIO"}</span>
          <span className="stamp text-[13px]" style={{ color }}>
            {readout}
            {danger && " · BELOW " + TOPUP_LINE}
          </span>
        </div>
      )}
      <div
        className={`relative w-full ${compact ? "h-4" : "h-7"}`}
        role="meter"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? max}
        aria-label={`Collateral ratio ${readout}`}
      >
        {/* minor engraved ticks, every 1% */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{
            backgroundImage: `repeating-linear-gradient(to right, var(--ink-3) 0 1px, transparent 1px calc(100% / ${minorCount}))`,
          }}
        />
        {/* baseline */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-ink-3" />
        {/* fill */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-[3px]"
          style={{ width: `${pos}%`, background: color }}
        />
        {/* major marks */}
        {MARKS.map((m) => (
          <div
            key={m}
            aria-hidden="true"
            className="absolute bottom-0 h-full w-px bg-ink"
            style={{ left: `${pct(m, min, max)}%`, opacity: m === DANGER_BELOW ? 1 : 0.7 }}
          />
        ))}
        {/* value marker */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 h-full w-[3px] -translate-x-1/2"
          style={{ left: `${pos}%`, background: color }}
        />
      </div>
      {!compact && (
        <div aria-hidden="true" className="relative mt-1.5 h-3">
          {MARKS.map((m) => (
            <span
              key={m}
              className={`stamp absolute -translate-x-1/2 text-[10px] ${m === DANGER_BELOW ? "text-ink" : "text-ink-2"}`}
              style={{ left: `${pct(m, min, max)}%` }}
            >
              {m}%
            </span>
          ))}
        </div>
      )}
      {!compact && (
        <p className="sr-only">
          Mint line {MINT_COLLATERAL}, top-up line {TOPUP_LINE}.
        </p>
      )}
    </div>
  );
}
