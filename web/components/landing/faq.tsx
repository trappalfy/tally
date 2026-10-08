import { Section, SectionHeading } from "@/components/ui/section";
import { DISPUTE_WINDOW, MISSED_START_PENALTY, START_WINDOW } from "@/lib/config";

export const FAQ_ITEMS = [
  {
    q: "What is an NCU?",
    a: "One hour on the reference A100 80GB. Other cards count by benchmark: an H100 burns 2.3 NCU an hour, an RTX 4090 burns 0.9.",
  },
  {
    q: "Who are the providers?",
    a: "GPU operators approved by Tally after a benchmark run. Each one backs its receipts with its own USDG collateral.",
  },
  {
    q: "What if my job doesn't start?",
    a: `If the provider doesn't confirm the start within ${START_WINDOW}, anyone can trigger the payout: the receipt's value plus ${MISSED_START_PENALTY}, from the provider's collateral.`,
  },
  {
    q: "What if the provider says it started, but it didn't, or stopped my job early?",
    a: `Open a dispute while the job is due to run, or up to ${DISPUTE_WINDOW} after. In v1, disputes are resolved by the Tally team multisig.`,
  },
  {
    q: "What if I never redeem?",
    a: "At quarter end your receipts settle in USDG at the series reference price. No fee.",
  },
  {
    q: "What if GPU prices fall?",
    a: "The receipt's market price can fall too. Your hour stays an hour, and the collateral stays in USDG.",
  },
  {
    q: "Where does it run?",
    a: "Robinhood Chain. Collateral and payments are in USDG.",
  },
] as const;

export function Faq() {
  return (
    <Section id="faq">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionHeading index={7} title="FAQ" />
        </div>
        <div className="lg:col-span-8">
          <ul className="border-t border-ink-3">
            {FAQ_ITEMS.map((item, i) => (
              <li key={item.q} className="border-b border-ink-3">
                <details className="group">
                  <summary className="flex cursor-pointer items-start gap-4 py-6 md:gap-6">
                    <span className="stamp w-8 shrink-0 pt-2 text-[12px] text-lime">0{i + 1}</span>
                    <span className="flex-1 font-serif text-[22px] italic leading-snug text-ink group-hover:text-lime md:text-[26px]">
                      {item.q}
                    </span>
                    <span
                      aria-hidden="true"
                      className="faq-sign stamp shrink-0 pt-1 text-[22px] leading-none text-ink-2 transition-transform"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-[640px] pb-7 pl-12 pr-8 text-[15px] leading-relaxed text-ink-2 md:pl-14">{item.a}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
