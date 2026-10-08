import type { ReactNode } from "react";

export type StampTone = "lime" | "ink" | "muted" | "danger";

const tones: Record<StampTone, string> = {
  lime: "text-lime border-lime",
  ink: "text-ink border-ink",
  muted: "text-ink-2 border-ink-3",
  danger: "text-danger border-danger",
};

export type StampProps = {
  children: ReactNode;
  tone?: StampTone;
  /** Draw a 1px plate around the stamp. */
  boxed?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  as?: "span" | "p" | "div";
};

const sizes = {
  xs: "text-[10px]",
  sm: "text-[12px]",
  md: "text-[14px]",
  lg: "text-[18px] md:text-[22px]",
};

/** Departure Mono uppercase label. Lime by default. Never for long text. */
export function Stamp({ children, tone = "lime", boxed = false, size = "sm", className = "", as = "span" }: StampProps) {
  const Tag = as;
  return (
    <Tag
      className={`stamp leading-none ${sizes[size]} ${tones[tone]} ${
        boxed ? "inline-block border px-2 py-1.5" : "border-0"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
