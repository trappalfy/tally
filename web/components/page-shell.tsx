import type { ReactNode } from "react";
import { Container } from "./ui/section";
import { Guilloche } from "./ui/guilloche";
import { Rosette } from "./ui/rosette";
import { SerialNumber } from "./ui/serial-number";

export type PageShellProps = {
  /** Mono eyebrow, e.g. "MARKET" or "REDEMPTION #42". */
  eyebrow: string;
  /** Italic serif page title. */
  title: ReactNode;
  /** Serif lead. */
  lead?: ReactNode;
  /** Serial printed top-right of the plate. */
  serial?: string;
  /** Optional element on the right of the heading (e.g. a stat or a button). */
  aside?: ReactNode;
  children?: ReactNode;
};

/** Shared on-brand chrome for app pages: engraved heading plate + content area. */
export function PageShell({ eyebrow, title, lead, serial, aside, children }: PageShellProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="relative overflow-hidden border-b border-ink-3">
        <Container className="relative py-12 md:py-16">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="stamp mb-5 flex flex-wrap items-center gap-3 text-[12px]">
                <span className="text-lime">{eyebrow}</span>
                {serial && (
                  <>
                    <span aria-hidden="true" className="h-px w-8 bg-ink-3" />
                    <SerialNumber value={serial} size="sm" tone="muted" />
                  </>
                )}
              </div>
              <h1 className="font-serif text-[44px] italic leading-[0.95] text-ink md:text-[64px]">{title}</h1>
              {lead && <p className="mt-4 max-w-[640px] font-serif text-[19px] leading-snug text-ink-2 md:text-[22px]">{lead}</p>}
            </div>
            {aside ?? (
              <div className="hidden opacity-80 md:block">
                <Rosette size={96} />
              </div>
            )}
          </div>
        </Container>
        <Guilloche height={36} opacity={0.8} rules />
      </div>
      <Container className="flex-1 py-12 md:py-16">{children}</Container>
    </div>
  );
}

/** Placeholder body for routes that are not wired yet. */
export function ComingOnline({ note }: { note?: ReactNode }) {
  return (
    <div className="border border-ink-3 p-[3px]">
      <div className="flex flex-col items-start gap-4 border border-ink-3 px-6 py-10 md:px-10 md:py-14">
        <span className="stamp text-[13px] text-lime">COMING ONLINE</span>
        <p className="max-w-[560px] text-[15px] leading-relaxed text-ink-2">
          {note ?? "This counter opens with the contracts on Robinhood Chain testnet."}
        </p>
      </div>
    </div>
  );
}
