"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { refAmount, formatUsd, formatPriceWad, seriesLabel, PHASE_LABEL, Phase, BPS } from "@tally/shared";
import { Button, Card, Stamp } from "@/components/ui";
import { Row, Field, inputCls, Empty, Loading, ConnectGate, ConfirmSheet } from "./kit";
import { useAllSeries, useSeriesBalances, useRedemptions, useProviders, useTx, type SeriesView } from "@/lib/tally/hooks";
import { hub, HUB_READY } from "@/lib/tally/contracts";
import { refState, ncuSymbol, money, providerName, RedemptionRows } from "./shared";

export function Portfolio() {
  return (
    <ConnectGate what="see your receipts">
      <Holdings />
    </ConnectGate>
  );
}

function Holdings() {
  const { address } = useAccount();
  const { series, isLoading } = useAllSeries();
  const balances = useSeriesBalances(address, series);
  const { redemptions, isLoading: rLoading } = useRedemptions();
  const { byAddress } = useProviders();
  const owed = useReadContract({
    ...hub,
    functionName: "owed",
    args: address ? [address] : undefined,
    query: { enabled: HUB_READY && !!address, refetchInterval: 12_000 },
  });

  if (isLoading || balances.isLoading) return <Loading />;
  const held = series.filter((s) => balances.get(s.id) > 0n);
  const mine = redemptions.filter((r) => r.holder.toLowerCase() === address?.toLowerCase());
  const owedAmt = (owed.data as bigint | undefined) ?? 0n;

  return (
    <div className="space-y-10">
      {owedAmt > 0n && <ClaimOwed amount={owedAmt} />}

      {held.length === 0 ? (
        <div className="space-y-4">
          <Empty>No receipts yet</Empty>
          <div className="text-center">
            <Button href="/market" size="sm">
              GO TO MARKET
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {held.map((s) => (
            <Banknote key={s.id.toString()} s={s} bal={balances.get(s.id)} />
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-4 font-serif text-[32px] italic">Your redemptions</h2>
        {rLoading ? <Loading /> : <RedemptionRows items={mine} who="provider" names={(a) => providerName(byAddress(a), a)} />}
      </div>
    </div>
  );
}

function Banknote({ s, bal }: { s: SeriesView; bal: bigint }) {
  const [settling, setSettling] = useState(false);
  const value = refAmount(refState(s), bal, BPS);
  const active = s.phase === Phase.Open || s.phase === Phase.Closing;
  const final = s.phase === Phase.Finalized;

  return (
    <Card label={<Link href={`/series/${s.id}`} className="hover:text-lime">SERIES {seriesLabel(s.id)} · {PHASE_LABEL[s.phase]}</Link>} serial={ncuSymbol(s)} strip="both" accent={final}>
      <Stamp size="lg">{ncuSymbol(s)}</Stamp>
      <div className="mt-4 flex items-baseline gap-3">
        <span className="font-mono text-[64px] leading-none text-ink md:text-[80px]">{bal.toString()}</span>
        <span className="stamp text-[14px] text-ink-2">NCU</span>
      </div>
      <div className="mt-5 space-y-0.5">
        {final ? (
          <>
            <Row label="PAYS PER RECEIPT" value={formatUsd(s.payoutPerReceipt)} />
            <Row label="SETTLES FOR" value={money(bal * s.payoutPerReceipt)} tone="lime" />
          </>
        ) : (
          <>
            <Row label="REF PRICE" value={s.totalSold > 0n ? formatPriceWad(s.refWad) : "—"} />
            <Row label="VALUE AT REF" value={formatUsd(value)} tone="lime" />
          </>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        {active && (
          <Button href={`/redeem?series=${s.id}`} size="md">
            REDEEM
          </Button>
        )}
        {final && !settling && (
          <Button size="md" onClick={() => setSettling(true)}>
            SETTLE
          </Button>
        )}
        {s.phase === Phase.Ended && (
          <p className="text-[13px] text-ink-2">Quarter ended. Settlement opens after finalization.</p>
        )}
      </div>
      {settling && (
        <div className="mt-5">
          <SettleBox s={s} bal={bal} onCancel={() => setSettling(false)} />
        </div>
      )}
    </Card>
  );
}

function SettleBox({ s, bal, onCancel }: { s: SeriesView; bal: bigint; onCancel: () => void }) {
  const [nStr, setNStr] = useState(bal.toString());
  const tx = useTx();
  const n = /^\d+$/.test(nStr) ? BigInt(nStr) : 0n;
  const ok = n > 0n && n <= bal;
  return (
    <div className="space-y-4">
      <Field label="RECEIPTS TO SETTLE" hint={`Up to ${bal} NCU.`}>
        <input className={inputCls} inputMode="numeric" value={nStr} onChange={(e) => setNStr(e.target.value.replace(/\D/g, ""))} />
      </Field>
      {n > bal && <p className="text-[13px] text-danger">You hold {bal.toString()}.</p>}
      <ConfirmSheet
        title="SETTLE · CONFIRM"
        lines={[
          { label: "SERIES", value: seriesLabel(s.id) },
          { label: "BURN", value: `${n} ${ncuSymbol(s)}`, tone: "lime" },
          { label: "PER RECEIPT", value: formatUsd(s.payoutPerReceipt) },
          { label: "YOU RECEIVE", value: `${money(n * s.payoutPerReceipt)} USDG`, tone: "lime" },
          { label: "USDG OUT", value: "$0.00" },
          { label: "FEE", value: "NONE" },
        ]}
        note="Settlement has no deadline and no fee. Order does not matter: every receipt pays the same."
        action={ok ? `SETTLE ${n} NCU` : "ENTER AMOUNT"}
        onConfirm={() => ok && tx.run({ ...hub, functionName: "settle", args: [s.id, n] })}
        onCancel={onCancel}
        state={tx.state}
      />
    </div>
  );
}

function ClaimOwed({ amount }: { amount: bigint }) {
  const tx = useTx();
  return (
    <ConfirmSheet
      title="OWED TO YOU"
      lines={[
        { label: "YOU RECEIVE", value: `${money(amount)} USDG`, tone: "lime" },
        { label: "USDG OUT", value: "$0.00" },
        { label: "FEE", value: "NONE" },
      ]}
      note="A payout could not be pushed to your wallet earlier. It is held for you on the contract."
      action="CLAIM OWED"
      onConfirm={() => tx.run({ ...hub, functionName: "claimOwed" })}
      state={tx.state}
    />
  );
}

