import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { DocSection } from "@/components/prose";
import {
  ARBITER_DEADLINE,
  DISPUTE_WINDOW,
  MINT_COLLATERAL,
  MISSED_START_PENALTY,
  PRICE_BAND,
  PROVIDER_CAP,
  RISK_PRICE_SPEED,
  START_WINDOW,
  TOPUP_LINE,
} from "@/lib/config";

export const metadata: Metadata = {
  title: "Risks",
  description: "What can go wrong with Tally receipts, in plain English.",
};

export default function RisksPage() {
  return (
    <PageShell
      eyebrow="RISKS"
      title="Read this before you buy."
      lead="Receipts are a claim on compute time, not a deposit or an investment. Here is what can go wrong."
    >
      <article className="max-w-[760px]">
        <DocSection id="what" index="01" title="What a receipt is">
          <p>
            A Tally receipt is a token that can be burned for one hour of compute on the reference A100 80GB (or the
            benchmark equivalent on another card), delivered by an approved provider. Unredeemed receipts settle in USDG
            at quarter end at the series reference price, from the providers&apos; collateral.
          </p>
          <p>
            It is not a deposit or an investment, and not a bank product. Nothing pays you for holding it. Nobody,
            including Tally, promises what a receipt will be worth later.
          </p>
        </DocSection>

        <DocSection id="contracts" index="02" title="Smart contract risk">
          <p>
            The contracts are open source and verified. They have not been externally audited. They have no upgrade
            path, so a bug cannot be patched in place. A bug can lock or lose funds, including collateral and settlement
            pools.
          </p>
        </DocSection>

        <DocSection id="providers" index="03" title="Provider risk">
          <p>
            Providers are GPU operators approved by Tally. They can fail to start a job, stop it early, go offline or
            run out of collateral. The contracts limit the damage: receipts are backed by {MINT_COLLATERAL} at mint, a
            provider below {TOPUP_LINE} must top up or be liquidated, and a start missed by more than {START_WINDOW}{" "}
            pays the holder the receipt&apos;s value plus {MISSED_START_PENALTY} without anyone&apos;s approval.
          </p>
          <p>
            Collateral is per provider. If one provider&apos;s collateral runs out, other providers do not cover the
            gap, and the quarter-end settlement per receipt is reduced equally for every holder of that series.
          </p>
        </DocSection>

        <DocSection id="disputes" index="04" title="Dispute risk">
          <p>
            Disputes are resolved by the Tally team multisig in v1. If a provider says a job started but it did not, or
            stopped it early, the holder can open a dispute until {DISPUTE_WINDOW} after the job was due to end. The
            outcome depends on the arbiter&apos;s judgement of the evidence. If the arbiter does not decide within{" "}
            {ARBITER_DEADLINE}, the holder receives the full reserve.
          </p>
        </DocSection>

        <DocSection id="price" index="05" title="Price risk">
          <p>
            The market price of a receipt can go down as well as up, for example when GPU prices fall. Your hour stays
            an hour, and the collateral stays in USDG, but the price you could sell a receipt for may be lower than what
            you paid.
          </p>
          <p>
            Providers can buy their own receipts to move the reference price. Limiters (±{PRICE_BAND} listing band, a
            risk price that moves at most {RISK_PRICE_SPEED} a day, a {PROVIDER_CAP} cap per provider) reduce this but do
            not remove it.
          </p>
        </DocSection>

        <DocSection id="usdg" index="06" title="USDG and network risk">
          <p>
            Payments, collateral and settlement are in USDG on Robinhood Chain. The USDG issuer can freeze addresses and
            pause transfers, which can delay or block payouts. Network outages or congestion can delay transactions,
            including time-sensitive ones such as starting a job or claiming a missed-start payout.
          </p>
        </DocSection>

        <DocSection id="you" index="07" title="Your responsibility">
          <p>
            You hold your own keys. Tally cannot recover lost keys or reverse transactions. Check the network, the
            amounts and the fees on every confirmation screen before you sign. See the{" "}
            <Link href="/docs" className="text-lime underline underline-offset-4">
              docs
            </Link>{" "}
            for every formula and the{" "}
            <Link href="/terms" className="text-lime underline underline-offset-4">
              terms
            </Link>{" "}
            for the rules of use.
          </p>
        </DocSection>
      </article>
    </PageShell>
  );
}
