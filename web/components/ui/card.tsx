import type { ReactNode } from "react";
import { Guilloche } from "./guilloche";

export type CardProps = {
  children: ReactNode;
  /** Where the guilloche strip sits. Default "top". */
  strip?: "top" | "bottom" | "both" | "none";
  /** Strip height in px. Default 28. */
  stripHeight?: number;
  /** Mono label printed in the top-left corner of the plate. */
  label?: ReactNode;
  /** Mono serial printed in the top-right corner of the plate. */
  serial?: ReactNode;
  /** Highlight the outer border in lime (selected / featured). */
  accent?: boolean;
  className?: string;
  bodyClassName?: string;
};

/**
 * Receipt card: double 1px border with a guilloche strip, square corners.
 */
export function Card({
  children,
  strip = "top",
  stripHeight = 28,
  label,
  serial,
  accent = false,
  className = "",
  bodyClassName = "",
}: CardProps) {
  const showTop = strip === "top" || strip === "both";
  const showBottom = strip === "bottom" || strip === "both";
  return (
    <div className={`border bg-paper p-[3px] ${accent ? "border-lime" : "border-ink-3"} ${className}`}>
      <div className="relative flex h-full flex-col border border-ink-3">
        {(label || serial) && (
          <div className="flex items-center justify-between gap-4 border-b border-ink-3 px-4 py-2.5">
            <span className="stamp text-[11px] text-ink-2">{label}</span>
            <span className="stamp text-[11px] text-lime">{serial}</span>
          </div>
        )}
        {showTop && <Guilloche height={stripHeight} animate={false} className="border-b border-ink-3" />}
        <div className={`flex-1 p-5 md:p-6 ${bodyClassName}`}>{children}</div>
        {showBottom && <Guilloche height={stripHeight} animate={false} flip className="border-t border-ink-3" />}
      </div>
    </div>
  );
}
