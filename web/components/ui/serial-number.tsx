import type { CSSProperties } from "react";
import { SERIAL } from "@/lib/config";

export type SerialNumberProps = {
  /** Serial text, e.g. "TL 04 0000001 A". */
  value?: string;
  /** "Type" the serial once on load (CSS only, disabled under prefers-reduced-motion). */
  typing?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  tone?: "lime" | "muted";
  className?: string;
};

const sizes = {
  xs: "text-[10px]",
  sm: "text-[12px]",
  md: "text-[14px] md:text-[16px]",
  lg: "text-[18px] md:text-[22px]",
};

/** Banknote serial number in lime Departure Mono. */
export function SerialNumber({ value = SERIAL, typing = false, size = "sm", tone = "lime", className = "" }: SerialNumberProps) {
  const color = tone === "lime" ? "text-lime" : "text-ink-3";
  if (!typing) {
    return <span className={`stamp whitespace-nowrap leading-none ${sizes[size]} ${color} ${className}`}>{value}</span>;
  }
  const style = { "--chars": `${value.length}ch`, "--steps": value.length } as CSSProperties;
  return (
    <span className={`stamp leading-none ${sizes[size]} ${color} ${className}`} style={{ letterSpacing: 0 }}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="serial-typing" style={style}>
        {value}
      </span>
    </span>
  );
}
