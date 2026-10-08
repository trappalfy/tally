import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Gauge } from "@/components/ui/gauge";
import { Guilloche } from "@/components/ui/guilloche";
import { Rosette } from "@/components/ui/rosette";
import { ReceiptLine, Section, SectionHeading } from "@/components/ui/section";
import { Stamp } from "@/components/ui/stamp";
import {
  EXAMPLE_SERIES,
  GPU_TYPES,
  MINT_COLLATERAL,
  MINT_FEE,
  MISSED_START_PENALTY,
  REDEEM_FEE,
  SERIAL_PREFIX,
  START_WINDOW,
  START_WINDOW_SHORT,
  TOPUP_LINE,
} from "@/lib/config";
import { MinuteDial } from "./minute-dial";

/* ---------------- 1 · One receipt. One hour. ---------------- */

export function OneReceipt() {
  return (
    <Section>
      <SectionHeading
        index={1}
        title="One receipt. One hour."
        lead="1 NCU is one hour on a reference A100 80GB, measured by a fixed benchmark, not a spec sheet."
      />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {GPU_TYPES.map((g, i) => (
          <Card key={g.name} label={`GPU · 0${i + 1}`} serial={g.note} accent={i === 0}>
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-serif text-[30px] italic leading-none text-ink">{g.name}</h3>
            </div>
            <div className="mt-6 flex items-center gap-5">
              <MinuteDial minutes={g.minutesPerNcu} size={112} />
              <div>
                <div className="stamp text-[44px] leading-none text-lime md:text-[40px] xl:text-[48px]">
                  {g.minutesPerNcu}
                  <span className="ml-2 text-[16px]">MIN</span>
                </div>
                <div className="stamp mt-3 text-[13px] text-ink-2">PER RECEIPT</div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-ink-3 pt-4">
              <span className="stamp text-[12px] text-ink-2">BURNS</span>
              <span className="stamp text-[15px] text-ink">{g.ncuPerHour} NCU/H</span>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-10 font-serif text-[20px] italic text-ink-2 md:text-[24px]">
        Same receipt, same price. The card decides how long it lasts.
      </p>
    </Section>
  );
}

/* ---------------- 2 · How it works ---------------- */

const STEPS = [
  {
    title: "A provider mints.",
    body: `A GPU provider locks ${MINT_COLLATERAL} of the receipts' value in USDG, then sells them.`,
  },
  { title: "You buy.", body: "Pay in USDG. The receipt is a token in your wallet." },
  { title: "Hold, send or sell.", body: "Free to hold. Free to send. Trade it like any token." },
  {
    title: "Redeem or settle.",
    body: `Burn it for an hour of compute, started within ${START_WINDOW}. Or keep it to quarter end and take USDG at the reference price.`,
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how" className="overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-10 opacity-[0.08]">
        <Rosette size={420} value="" unit="" />
      </div>
      <SectionHeading index={2} title="How it works" />
      <ol className="mt-14 grid border-t border-ink-3 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="relative border-b border-ink-3 py-8 md:px-6 md:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0 xl:first:pl-0"
          >
            <div className="flex items-center gap-3">
              <span className="stamp border border-lime px-2 py-1 text-[12px] text-lime">0{i + 1}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-ink-3" />
            </div>
            <h3 className="mt-6 font-serif text-[28px] italic leading-tight text-ink">{s.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ---------------- 3 · Backed, not promised. ---------------- */

const BACKING_LINES = [
  {
    stamp: `${MINT_COLLATERAL} AT MINT`,
    body: `Every receipt is backed by ${MINT_COLLATERAL} of its value in USDG.`,
  },
  {
    stamp: `TOP UP BELOW ${TOPUP_LINE}`,
    body: `Fall below ${TOPUP_LINE} and the provider tops up, or gets liquidated.`,
  },
  {
    stamp: `${START_WINDOW_SHORT} OR +${MISSED_START_PENALTY}`,
    body: `Miss the 30-minute start and the holder is paid the receipt's value plus ${MISSED_START_PENALTY}, from collateral, automatically.`,
  },
] as const;

export function Backed() {
  return (
    <Section>
      <div className="grid items-center gap-14 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <SectionHeading index={3} title="Backed, not promised." />
          <ul className="mt-12 border-t border-ink-3">
            {BACKING_LINES.map((g) => (
              <li key={g.stamp} className="grid gap-3 border-b border-ink-3 py-6 md:grid-cols-[220px_1fr] md:gap-6">
                <Stamp size="md" className="self-start pt-1">
                  {g.stamp}
                </Stamp>
                <p className="text-[15px] leading-relaxed text-ink">{g.body}</p>
              </li>
            ))}
          </ul>
          <p className="stamp mt-6 text-[12px] leading-relaxed text-ink-2">
            Receipt at $1.40 → $1.82 in collateral. Top-up line: $1.58.
          </p>
        </div>
        <div className="mx-auto w-full max-w-[460px] lg:col-span-5 lg:col-start-8">
          <Gauge value={136} plate="TOP-UP $1.58" />
        </div>
      </div>
    </Section>
  );
}

/* ---------------- 4 · Quarterly series. ---------------- */

export function QuarterlySeries() {
  return (
    <Section>
      <div className="grid gap-14 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6">
          <SectionHeading
            index={4}
            title="Quarterly series."
            lead={`Every receipt belongs to a series, like ${EXAMPLE_SERIES}. Never redeemed it? At quarter end it settles in USDG from the providers' collateral, at the series reference price: the average price its receipts were sold at.`}
          />
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          <Card label={`SERIES ${EXAMPLE_SERIES}`} serial={`${SERIAL_PREFIX} 0000100 Q`} strip="both">
            <div className="flex items-center gap-5">
              <Rosette value="100" unit="RECEIPTS" size={104} />
              <div className="min-w-0">
                <div className="stamp text-[11px] text-ink-2">SETTLED AT QUARTER END</div>
                <div className="mt-2 font-serif text-[22px] italic leading-tight text-ink">
                  at the series reference price
                </div>
              </div>
            </div>
            <div className="mt-6 border-t border-dashed border-ink-3 pt-5">
              <p className="stamp whitespace-nowrap text-[17px] leading-tight text-lime xs:text-[19px] md:text-[22px] lg:text-[18px] xl:text-[22px]">100 RECEIPTS × $1.55 = $155</p>
              <p className="stamp mt-2 text-[11px] text-ink-2">PAID IN USDG · NO FEE</p>
            </div>
          </Card>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- 5 · Two fees. That's all. ---------------- */

const FEES = [
  { label: "MINT", value: `${MINT_FEE} · PROVIDER` },
  { label: "REDEEM", value: `${REDEEM_FEE} · HOLDER` },
  { label: "HOLD", value: "FREE" },
  { label: "SEND", value: "FREE" },
  { label: "SETTLE", value: "FREE" },
] as const;

export function Fees() {
  return (
    <Section>
      <div className="grid gap-14 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <SectionHeading index={5} title="Two fees. That's all." />
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <Card label="FEE SCHEDULE" serial={`${SERIAL_PREFIX} 0000002 F`} strip="bottom">
            <div className="space-y-5">
              {FEES.map((f) => (
                <ReceiptLine key={f.label} label={f.label} value={f.value} tone={f.value === "FREE" ? "ink" : "lime"} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- 6 · For providers. ---------------- */

export function ForProviders() {
  return (
    <Section>
      <div className="grid gap-14 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6">
          <SectionHeading
            index={6}
            title="For providers."
            lead="Idle GPUs earn nothing. Sell next month's hours this month."
          />
          <p className="mt-6 max-w-[520px] text-[15px] leading-relaxed text-ink-2">
            8 idle A100s × 24 h × 30 days = 5,760 NCU. At $1.40: $8,064 of receipts. Collateral: $10,483 USDG.
          </p>
          <div className="mt-10">
            <Button href="/provider" size="lg">
              APPLY AS A PROVIDER
            </Button>
          </div>
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          <Card label="PROVIDER WORKSHEET" serial="A100 80GB" strip="top">
            <div className="space-y-5">
              <ReceiptLine label="8 × 24 H × 30 DAYS" value="5,760 NCU" />
              <ReceiptLine label={`AT $1.40`} value="$8,064" tone="ink" />
              <ReceiptLine label={`COLLATERAL ${MINT_COLLATERAL}`} value="$10,483" />
            </div>
          </Card>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- divider band ---------------- */

export function BandDivider() {
  return (
    <div aria-hidden="true" className="relative border-y border-ink-3">
      <Guilloche height={56} reverse opacity={0.8} />
    </div>
  );
}
