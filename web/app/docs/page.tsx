import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { DocSection, Example, Formula, SubHeading, Table, Toc } from "@/components/prose";
import {
  ARBITER_DEADLINE,
  ARBITER_TARGET,
  DISPUTE_BOND,
  DISPUTE_WINDOW,
  EXAMPLE_SERIES,
  GPU_TYPES,
  GRACE,
  LIQUIDATION_BONUS,
  LISTINGS_CLOSE_BEFORE,
  MINT_COLLATERAL,
  MINT_FEE,
  MISSED_START_PENALTY,
  PRICE_BAND,
  PROVIDER_CAP,
  REDEEM_FEE,
  RISK_PRICE_SPEED,
  SERIES_OPENS_BEFORE,
  START_WINDOW,
  TIMELOCK,
  TOPUP_LINE,
} from "@/lib/config";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Tally receipts work: the NCU, series, collateral, redemption, disputes, quarter-end settlement and risks.",
};

const TOC = [
  { id: "ncu", label: "The unit: 1 NCU" },
  { id: "series", label: "Quarterly series" },
  { id: "mint", label: "Minting and buying" },
  { id: "reference-price", label: "Reference price" },
  { id: "collateral", label: "Collateral and health" },
  { id: "liquidation", label: "Liquidation" },
  { id: "redemption", label: "Redemption" },
  { id: "disputes", label: "Disputes" },
  { id: "settlement", label: "Quarter end" },
  { id: "fees", label: "Fees" },
  { id: "example", label: "Worked example" },
  { id: "risks", label: "Risks" },
];

export default function DocsPage() {
  return (
    <PageShell
      eyebrow="DOCS"
      title="How Tally works"
      lead="A Tally receipt is good for one hour of GPU compute. This page explains every number behind it, in plain English."
    >
      <div className="grid gap-12 lg:grid-cols-12">
        <aside className="lg:col-span-3">
          <div className="lg:sticky lg:top-24">
            <Toc items={TOC} />
          </div>
        </aside>

        <article className="max-w-[760px] lg:col-span-9">
          <DocSection id="ncu" index="01" title="The unit: 1 NCU">
            <p>
              <strong>1 receipt = 1 NCU = one hour on the reference A100 80GB</strong>, measured by a fixed benchmark,
              not a spec sheet. Other cards count by their benchmark result: a faster card burns more NCU per hour, so
              one receipt lasts fewer minutes on it.
            </p>
            <Table
              head={["Card", "NCU per hour", "1 NCU lasts"]}
              rows={GPU_TYPES.map((g) => [g.name, `${g.ncuPerHour}`, `≈ ${g.minutesPerNcu} min`])}
            />
            <Formula caption="On-chain the rate is stored as ncuPerHourBps (NCU per hour × 10,000).">
              {`hours = receipts ÷ NCU per hour of the card
      = N × 10,000 ÷ ncuPerHourBps`}
            </Formula>
            <Example title="EXAMPLE">
              <p>120 NCU on an H100 runs for about 52 hours. On an RTX 4090, about 133 hours.</p>
            </Example>
            <p>
              The rate of an existing card type never changes, so what you bought stays what you bought. New card types
              are added by the owner through a {TIMELOCK} timelock.
            </p>
          </DocSection>

          <DocSection id="series" index="02" title="Quarterly series">
            <p>
              Every receipt belongs to a quarterly series, like Series {EXAMPLE_SERIES}. Each series is its own ERC-20
              token, shared by all providers. One token is one receipt; there are no fractions. Sending a receipt is a
              plain ERC-20 transfer with no fee and no hooks.
            </p>
            <Table
              head={["Phase", "When", "What works"]}
              rows={[
                ["Open", `${SERIES_OPENS_BEFORE} before the quarter → ${LISTINGS_CLOSE_BEFORE} before its end`, "List, buy, redeem"],
                ["Closing", `last ${LISTINGS_CLOSE_BEFORE} of the quarter`, "Redeem; no new sales"],
                ["Ended", "after quarter end", "Open redemptions close out"],
                ["Finalized", "after finalization", "Settle in USDG"],
              ]}
            />
          </DocSection>

          <DocSection id="mint" index="03" title="Minting and buying">
            <p>
              A provider lists <strong>N</strong> receipts at price <strong>P</strong> in USDG and locks a listing
              escrow of {MINT_COLLATERAL} of their value. Receipts are minted only when someone buys them, so every
              receipt in circulation has a known on-chain sale price.
            </p>
            <Formula>
              {`listing escrow       = 1.30 × N × P
collateral on a sale = 1.30 × n × max(P, ref)
provider receives    = n × P − ${MINT_FEE} mint fee`}
            </Formula>
            <p>
              If the series reference price is above the listing price, the difference in collateral is taken from the
              provider&apos;s free collateral; if there is not enough, the purchase reverts. Once a series has a risk
              price, listing prices must stay within ±{PRICE_BAND} of it.
            </p>
          </DocSection>

          <DocSection id="reference-price" index="04" title="Reference price">
            <p>
              The reference price (<strong>ref</strong>) is the average price the series&apos; receipts were sold at,
              weighted by volume. Only primary sales move it. Secondary trading does not. After listings close, it is
              fixed for the rest of the quarter.
            </p>
            <Formula caption={`With three or more providers selling, one provider weighs at most ${PROVIDER_CAP}.`}>
              {`ref = total USDG paid in primary sales ÷ receipts sold

w_p = min(sold_p ÷ total sold, ${PROVIDER_CAP})
ref = Σ (w_p × average price_p) ÷ Σ w_p`}
            </Formula>
            <p>
              <strong>Risk price.</strong> Collateral checks, flags, liquidations and the listing band use a smoothed
              risk price. It follows the reference price but moves at most {RISK_PRICE_SPEED} per day, so one large
              purchase cannot push other providers into liquidation overnight.
            </p>
            <p>
              The reference price itself sets the redemption fee, the redemption reserve, the missed-start payout and
              the quarter-end settlement.
            </p>
          </DocSection>

          <DocSection id="collateral" index="05" title="Collateral and health">
            <p>
              Each provider&apos;s collateral is held separately, per series. Part of it is reserved for open
              redemptions; the rest is free. Health is measured against the free part only.
            </p>
            <Formula>
              {`free = collateral − reserved
CR   = free ÷ (outstanding receipts × risk price)`}
            </Formula>
            <Table
              head={["Line", "Value", "What happens"]}
              rows={[
                ["Mint", MINT_COLLATERAL, `Every receipt sold is backed by ${MINT_COLLATERAL} of its value in USDG`],
                ["Maintenance", TOPUP_LINE, "Below it, anyone can flag the provider. Flagged providers cannot list or sell"],
                ["Grace", GRACE, `If CR is still below ${TOPUP_LINE} after the grace period, liquidation opens`],
                ["Withdraw", `above ${MINT_COLLATERAL}`, `Only collateral above ${MINT_COLLATERAL} can be withdrawn`],
              ]}
            />
            <p>
              Why {TOPUP_LINE}: it is the receipt&apos;s value plus the {MISSED_START_PENALTY} missed-start penalty. At
              the top-up line, collateral still covers the worst case on every receipt.
            </p>
            <Example title="EXAMPLE · TOP-UP">
              <p>A provider holds $1,820 of collateral against 1,000 receipts sold at $1.40.</p>
              <p>
                Top-up line by price: 1,820 ÷ 1.15 ÷ 1,000 = <strong>$1.58</strong> (about 13% above $1.40).
              </p>
              <p>
                At a risk price of $1.60: CR = 1,820 ÷ 1,600 = <strong>113.75%</strong>, below {TOPUP_LINE}.
              </p>
              <p>
                Back to {MINT_COLLATERAL}: 1.30 × 1,600 − 1,820 = <strong>$260</strong> to top up.
              </p>
            </Example>
          </DocSection>

          <DocSection id="liquidation" index="06" title="Liquidation">
            <p>
              Liquidation opens when three things are true: the provider is flagged, the {GRACE} grace period has
              passed, and CR is still below {TOPUP_LINE}. There is no liquidation once a series has ended.
            </p>
            <p>
              A liquidator burns <strong>K</strong> receipts of the series from their own wallet and receives their
              value at the risk price plus a {LIQUIDATION_BONUS} bonus, from the provider&apos;s free collateral. K is
              capped so the provider is brought back to {MINT_COLLATERAL}, not emptied.
            </p>
            <Formula>
              {`liquidator receives = K × risk price × (1 + ${LIQUIDATION_BONUS})
K_max = ceil((1.30 × O × r − free) ÷ ((1.30 − 1 − bonus) × r))`}
            </Formula>
            <p>
              If free collateral is at or below 1.05 × outstanding × risk price, every outstanding receipt can be
              liquidated. If there is not enough left to pay the full amount, the liquidator receives a pro-rata share
              and decides whether it is worth it.
            </p>
          </DocSection>

          <DocSection id="redemption" index="07" title="Redemption">
            <p>
              To redeem, you pick a series, a number of receipts, a card and a provider. Your job spec is encrypted to
              the provider in your browser; only its hash goes on-chain.
            </p>
            <Formula>
              {`receipts burned  = N
redemption fee   = ${REDEEM_FEE} × N × ref            (paid by the holder)
reserve          = N × ref × 1.15             (locked from provider collateral)
start by         = now + ${START_WINDOW}
job length       = N ÷ NCU per hour of the card`}
            </Formula>
            <SubHeading>Start confirmed</SubHeading>
            <p>
              The provider starts the job and confirms it on-chain before the deadline. The job then runs for its full
              length, and a dispute window stays open until {DISPUTE_WINDOW} after it is due to end. If nobody disputes,
              anyone can release the reserve back to the provider&apos;s free collateral afterwards.
            </p>
            <SubHeading>Start missed</SubHeading>
            <p>
              If the provider does not confirm within {START_WINDOW}, anyone can trigger the payout. The holder gets the
              whole reserve: the receipts&apos; value plus {MISSED_START_PENALTY}. No arbiter and no approvals are
              involved. The redemption fee is not refunded; the {MISSED_START_PENALTY} penalty is the compensation.
            </p>
            <Example title="EXAMPLE · 600 RECEIPTS ON H100, REF $1.60">
              <p>
                Redemption fee: <strong>$9.60</strong>.
              </p>
              <p>
                Job length: about <strong>261 hours</strong>.
              </p>
              <p>
                If the start is missed, the holder receives $960 of value and $144 of penalty:{" "}
                <strong>$1,104</strong> in total.
              </p>
            </Example>
          </DocSection>

          <DocSection id="disputes" index="08" title="Disputes">
            <p>
              A dispute covers two cases: the provider confirmed the start but the job never ran, or the job was
              stopped early. The holder can open one at any time from the start confirmation until {DISPUTE_WINDOW}{" "}
              after the job is due to end, with a bond of {DISPUTE_BOND} of the receipts&apos; value so that baseless
              disputes cost something. Evidence is uploaded in the app; it is not written on-chain.
            </p>
            <p>
              <strong>Disputes are resolved by the Tally team multisig in v1.</strong>
            </p>
            <p>
              The arbiter has {ARBITER_DEADLINE} to decide (the team aims for {ARBITER_TARGET}). The holder receives
              their share of the reserve and the rest goes back to the provider. If the holder receives anything, the
              bond is refunded; if not, the bond goes to the provider. If the arbiter does not decide within{" "}
              {ARBITER_DEADLINE}, anyone can close the dispute and the holder receives the full reserve and the bond.
            </p>
            <p>
              The arbiter can only decide open disputes. It cannot move collateral, change parameters or create a
              dispute.
            </p>
          </DocSection>

          <DocSection id="settlement" index="09" title="Quarter end">
            <p>
              Receipts that are never redeemed settle in USDG after the quarter ends. Finalization starts once the
              series has ended and no redemptions are open. Every open redemption can be closed by anyone, so nobody
              can block finalization.
            </p>
            <Formula>
              {`to settlement pool  = min(outstanding × ref, free)    per provider
payout per receipt  = min(final ref, pool ÷ total supply)   rounded down`}
            </Formula>
            <p>
              Settling burns your receipts and pays the payout per receipt in USDG. There is no fee and no deadline, and
              the order in which holders settle does not change the amount.
            </p>
            <Example title="EXAMPLE · SETTLEMENT">
              <p>
                100 receipts at a final reference price of $1.55: <strong>$155</strong> to you.
              </p>
            </Example>
          </DocSection>

          <DocSection id="fees" index="10" title="Fees">
            <Table
              head={["Action", "Fee", "Who pays"]}
              rows={[
                ["Mint (primary sale)", MINT_FEE, "Provider, from sale proceeds"],
                ["Redeem", REDEEM_FEE, "Holder, on N × ref"],
                ["Hold", "Free", "—"],
                ["Send or sell", "Free", "Plain ERC-20"],
                ["Settle at quarter end", "Free", "—"],
              ]}
            />
            <p>Fee rates are constants in the contracts and cannot change after deployment. Fees go straight to the treasury.</p>
          </DocSection>

          <DocSection id="example" index="11" title={`Worked example: Series ${EXAMPLE_SERIES}`}>
            <p>Two providers, A and B. The card is an H100.</p>
            <ol className="space-y-4">
              <li>
                <strong>1. A sells.</strong> 1,000 receipts at $1.40: $1,400 of sales, a $14 mint fee, $1,820 of
                collateral ({MINT_COLLATERAL}). ref = $1.40.
              </li>
              <li>
                <strong>2. B sells higher.</strong> Later, B sells 2,500 receipts at $1.68. ref = (1,400 + 4,200) ÷
                3,500 = $1.60. B&apos;s collateral is {MINT_COLLATERAL} of $1.68. The risk price catches up with ref over a few days,
                at most {RISK_PRICE_SPEED} a day.
              </li>
              <li>
                <strong>3. A tops up.</strong> When the risk price reaches $1.60, A&apos;s ratio is 1,820 ÷ 1,600 =
                113.75%. A is flagged, tops up $260 and is back at {MINT_COLLATERAL}.
              </li>
              <li>
                <strong>4. A holder redeems with A.</strong> 600 receipts on H100: a $9.60 fee, about 261 hours of
                compute, a $1,104 reserve. A confirms the start. Nobody disputes, so {DISPUTE_WINDOW} after the job ends
                the reserve goes back to A&apos;s free collateral.
              </li>
              <li>
                <strong>5. Quarter end.</strong> A has 400 receipts outstanding, so 400 × $1.60 = $640 moves to the
                settlement pool. Holders of those receipts get $1.60 each, as long as the series has no shortfall.
              </li>
            </ol>
          </DocSection>

          <DocSection id="risks" index="12" title="Risks">
            <SubHeading>Self-purchase can move the reference price</SubHeading>
            <p>
              A provider can buy its own receipts to push the reference price. It costs the provider the {MINT_FEE} mint
              fee, and the purchase money comes back to the provider. Three limiters cap the effect: listing prices must
              sit within ±{PRICE_BAND} of the risk price, the risk price moves at most {RISK_PRICE_SPEED} a day, and with
              three or more providers one provider weighs at most {PROVIDER_CAP} in the reference price. Within those
              limits the risk remains: a provider willing to pay fees can still shift the price used for redemption
              fees, missed-start payouts and settlement.
            </p>
            <SubHeading>Bad debt is shared equally</SubHeading>
            <p>
              If a provider&apos;s free collateral runs out while its receipts are still outstanding, other
              providers&apos; collateral does not cover the gap. The contract does not hide it: at finalization the
              settlement per receipt is reduced equally for every holder of that series.
            </p>
            <SubHeading>Disputes depend on people</SubHeading>
            <p>
              Disputes are resolved by the Tally team multisig in v1. The missed-start payout needs no one&apos;s
              approval, but whether a started job really ran is decided by the arbiter.
            </p>
            <SubHeading>No external audit</SubHeading>
            <p>
              The contracts are open source and verified. They have not been externally audited. Bugs in smart
              contracts can lose funds.
            </p>
            <SubHeading>USDG can be frozen or paused</SubHeading>
            <p>
              Collateral, payments and settlement are in USDG. Its issuer can freeze addresses and pause transfers. A
              frozen provider address, or a paused token, can delay or block payouts, withdrawals and settlement.
            </p>
            <SubHeading>Prices move</SubHeading>
            <p>
              The market price of a receipt can fall, for example when GPU prices fall. An hour stays an hour, but
              Tally makes no promise about the future price of a receipt. Read the full{" "}
              <Link href="/risks" className="text-lime underline underline-offset-4">
                risks
              </Link>{" "}
              page before you buy.
            </p>
          </DocSection>
        </article>
      </div>
    </PageShell>
  );
}
