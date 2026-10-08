import type { ReactNode } from "react";

export type ContainerProps = {
  children: ReactNode;
  className?: string;
};

/** 1200px container, 24px gutters (16px on mobile). */
export function Container({ children, className = "" }: ContainerProps) {
  return <div className={`container-tally ${className}`}>{children}</div>;
}

export type SectionHeadingProps = {
  /** Section numeral, printed as a lime stamp ("1 ·"). */
  index?: string | number;
  /** Mono eyebrow next to the numeral. */
  eyebrow?: string;
  /** Italic serif title. */
  title: ReactNode;
  /** Serif lead under the title. */
  lead?: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
};

/** Section heading: lime numeral stamp + italic serif title + serif lead. */
export function SectionHeading({ index, eyebrow, title, lead, className = "", as = "h2" }: SectionHeadingProps) {
  const H = as;
  return (
    <div className={`max-w-[760px] ${className}`}>
      {(index !== undefined || eyebrow) && (
        <div className="stamp mb-5 flex items-center gap-3 text-[12px] text-lime">
          {index !== undefined && <span>{String(index).padStart(2, "0")}</span>}
          {index !== undefined && eyebrow && <span className="h-px w-8 bg-ink-3" aria-hidden="true" />}
          {eyebrow && <span className="text-ink-2">{eyebrow}</span>}
        </div>
      )}
      <H
        className={`font-serif italic leading-[0.95] tracking-[-0.01em] text-ink ${
          as === "h1" ? "text-[52px] md:text-[80px] xl:text-[96px]" : "text-[40px] md:text-[56px] xl:text-[64px]"
        }`}
      >
        {title}
      </H>
      {lead && <p className="mt-5 font-serif text-[20px] leading-snug text-ink-2 md:text-[24px]">{lead}</p>}
    </div>
  );
}

export type SectionProps = {
  id?: string;
  children: ReactNode;
  className?: string;
  /** Hairline at the top of the section. Default true. */
  rule?: boolean;
};

/** Page section with vertical rhythm and an engraved top rule. */
export function Section({ id, children, className = "", rule = true }: SectionProps) {
  return (
    <section id={id} className={`relative scroll-mt-20 ${rule ? "border-t border-ink-3" : ""} ${className}`}>
      <Container className="py-20 md:py-28">{children}</Container>
    </section>
  );
}

/** Mono row with dotted leader: LABEL ........ VALUE (receipt line). */
export function ReceiptLine({
  label,
  value,
  tone = "lime",
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "lime" | "ink";
  className?: string;
}) {
  return (
    <div className={`stamp flex items-baseline gap-3 text-[13px] md:text-[15px] ${className}`}>
      <span className="text-ink">{label}</span>
      <span aria-hidden="true" className="min-w-6 flex-1 translate-y-[-3px] border-b border-dotted border-ink-3" />
      <span className={tone === "lime" ? "text-lime" : "text-ink"}>{value}</span>
    </div>
  );
}
