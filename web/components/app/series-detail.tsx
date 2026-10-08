"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseEventLogs, type Address } from "viem";
import { formatUsd, formatPriceWad, PHASE_LABEL, Phase } from "@tally/shared";
import { Button, Stamp } from "@/components/ui";
import { HealthBar } from "@/components/ui/health-bar";
import { Panel, Row, Empty, Loading, Notice, NotDeployed, ConnectGate, ConfirmSheet, crPercent, fmtDate } from "./kit";
import { useSeries, useProviders, useHealths, useNow, useTx, type SeriesView } from "@/lib/tally/hooks";
import { hub, HUB_READY, tallyHubAbi } from "@/lib/tally/contracts";
import { ncuSymbol, providerName, useHubLogs } from "./shared";

export function SeriesDetail({ id }: { id: bigint }) {
  const { data: s, isLoading, error } = useSeries(id);
  if (!HUB_READY) return <NotDeployed />;
  if (isLoading) return <Loading />;
  if (error || !s) return <Notice tone="danger">Unknown series.</Notice>;
  return <Detail s={s} />;
}

function Detail({ s }: { s: SeriesView }) {
  const now = useNow(10_000);
  const ended = now >= Number(s.endAt);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Stamp size="lg">{ncuSymbol(s)}</Stamp>
        <Stamp boxed tone={s.phase === Phase.Open ? "lime" : "muted"}>
          {PHASE_LABEL[s.phase]}
        </Stamp>
        {s.phase === Phase.Open && (
          <Button href={`/market?series=${s.id}`} size="sm">
            BUY RECEIPTS
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Panel title="SERIES">
            <Row label="SALES OPEN" value={fmtDate(s.openAt)} />
            <Row label="QUARTER STARTS" value={fmtDate(s.startAt)} />
            <Row label="LISTINGS CLOSE" value={fmtDate(s.listingsCloseAt)} />
            <Row label="QUARTER ENDS" value={fmtDate(s.endAt)} />
            <div className="my-3 border-t border-ink-3" />
            <Row label="ISSUED" value={`${s.totalSold} NCU`} />
            <Row label="IN CIRCULATION" value={`${s.totalSupply} NCU`} />
            <Row label="PRIMARY SALES" value={formatUsd(s.totalPaid)} />
            <Row label="REF PRICE" value={s.totalSold > 0n ? formatPriceWad(s.refWad) : "—"} tone="lime" />
            <Row label="RISK PRICE" value={s.riskRefWad > 0n ? formatPriceWad(s.riskRefWad) : "—"} />
            <Row label="SELLERS" value={s.sellerCount.toString()} />
            <Row label="OPEN REDEMPTIONS" value={s.openRedemptions.toString()} />
          </Panel>
        </div>
        <div className="lg:col-span-7">
          <Panel title="REF PRICE HISTORY">
            <RefChart s={s} />
          </Panel>
        </div>
      </div>

      {(ended || s.phase === Phase.Ended || s.phase === Phase.Finalized) && <Finalization s={s} />}

      <Panel title="PROVIDERS IN THIS SERIES">
        <SeriesProviders s={s} />
      </Panel>
    </div>
  );
}

function RefChart({ s }: { s: SeriesView }) {
  const client = usePublicClient();
  const logs = useHubLogs();
  const now = useNow(60_000);
  const events = useMemo(
    () =>
      logs.data
        ? parseEventLogs({ abi: tallyHubAbi, logs: logs.data, eventName: "RefUpdated" }).filter((l) => l.args.series === s.id).slice(-120)
        : [],
    [logs.data, s.id],
  );
  const blocks = useMemo(() => [...new Set(events.map((e) => e.blockNumber))], [events]);
  const times = useQuery({
    queryKey: ["blockTimes", blocks.map(String).join(",")],
    enabled: !!client && blocks.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const m = new Map<bigint, number>();
      await Promise.all(blocks.map(async (b) => m.set(b, Number((await client!.getBlock({ blockNumber: b })).timestamp))));
      return m;
    },
  });

  if (logs.isLoading || (blocks.length > 0 && times.isLoading)) return <Loading />;
  if (logs.error) return <Notice tone="danger">Could not read history.</Notice>;
  if (events.length === 0 || !times.data) return <Empty>No sales yet</Empty>;

  const pts = events.map((e) => ({ t: times.data.get(e.blockNumber) ?? 0, ref: e.args.refWad, risk: e.args.riskRefWad }));
  const t0 = pts[0].t;
  const tEnd = Math.max(Math.min(now, Number(s.endAt)), pts[pts.length - 1].t + 1);
  const vals = pts.flatMap((p) => [p.ref, p.risk]);
  let lo = vals.reduce((a, b) => (b < a ? b : a));
  let hi = vals.reduce((a, b) => (b > a ? b : a));
  if (hi === lo) {
    hi = hi + hi / 10n + 1n;
    lo = lo - lo / 10n;
  }
  const W = 600;
  const H = 200;
  const x = (t: number) => ((t - t0) / Math.max(1, tEnd - t0)) * W;
  const y = (v: bigint) => H - 8 - (Number(((v - lo) * 10_000n) / (hi - lo)) / 10_000) * (H - 16);
  const step = (key: "ref" | "risk") =>
    pts
      .map((p, i) => {
        const nx = i + 1 < pts.length ? x(pts[i + 1].t) : W;
        return `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)} H${nx.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="stamp flex h-[200px] shrink-0 flex-col justify-between py-1 text-[10px] text-ink-2">
          <span>{formatPriceWad(hi)}</span>
          <span>{formatPriceWad(lo)}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[200px] w-full min-w-0 bg-paper" role="img" aria-label="Reference price history">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={step("risk")} fill="none" stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <path d={step("ref")} fill="none" stroke="var(--lime)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="stamp mt-2 flex flex-wrap justify-between gap-2 pl-12 text-[10px] text-ink-2">
        <span>{fmtDate(t0)}</span>
        <span>{fmtDate(tEnd)}</span>
      </div>
      <div className="stamp mt-3 flex flex-wrap gap-4 text-[11px]">
        <span className="text-lime">— REF {formatPriceWad(pts[pts.length - 1].ref)}</span>
        <span className="text-ink-2">- - RISK PRICE {formatPriceWad(pts[pts.length - 1].risk)}</span>
        <span className="text-ink-3">{pts.length} SALES</span>
      </div>
    </div>
  );
}

function SeriesProviders({ s }: { s: SeriesView }) {
  const list = useReadContract({ ...hub, functionName: "seriesProviders", args: [s.id], query: { enabled: HUB_READY, refetchInterval: 12_000 } });
  const addrs = (list.data ?? []) as readonly Address[];
  const pairs = addrs.map((a) => ({ provider: a, series: s.id }));
  const healths = useHealths(pairs);
  const { byAddress } = useProviders();
  if (list.isLoading) return <Loading />;
  if (addrs.length === 0) return <Empty>No providers in this series yet</Empty>;
  return (
    <div className="divide-y divide-ink-3 border-y border-ink-3">
      {addrs.map((a) => {
        const h = healths.get(a, s.id);
        const cr = crPercent(h?.crBps);
        return (
          <div key={a} className="grid grid-cols-2 items-center gap-x-4 gap-y-2 py-3 md:grid-cols-12">
            <Link href={`/providers/${a}`} className="col-span-2 truncate font-serif text-[20px] hover:text-lime md:col-span-4">
              {providerName(byAddress(a), a)}
            </Link>
            <div className="md:col-span-2">
              <div className="stamp text-[10px] text-ink-2">OUTSTANDING</div>
              <div className="stamp text-[15px]">{(h?.outstanding ?? 0n).toString()} NCU</div>
            </div>
            <div className="text-right md:col-span-2 md:text-left">
              <div className="stamp text-[10px] text-ink-2">SOLD</div>
              <div className="stamp text-[15px]">{(h?.sold ?? 0n).toString()} NCU</div>
            </div>
            <div className="col-span-2 md:col-span-4">
              <HealthBar value={cr} compact />
              <div className={`stamp mt-1 text-[10px] ${h?.flagged ? "text-danger" : "text-ink-2"}`}>
                {cr === null ? "NO RECEIPTS OUT" : `CR ${cr.toFixed(2)}%`}
                {h?.flagged && " · FLAGGED"}
                {h?.finalized && " · FINALIZED"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Finalization({ s }: { s: SeriesView }) {
  const [action, setAction] = useState<"providers" | "complete" | null>(null);
  const tx = useTx();
  const ended = s.phase === Phase.Ended;
  const clear = s.openRedemptions === 0n;
  const canProviders = ended && clear && s.finalizeCursor < s.providerCount;
  const canComplete = ended && clear && s.finalizeCursor === s.providerCount;

  return (
    <Panel title="QUARTER END" tone={s.phase === Phase.Finalized ? "lime" : "ink"} aside={<Stamp tone="muted">{PHASE_LABEL[s.phase]}</Stamp>}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <Row label="PROVIDERS DONE" value={`${s.finalizeCursor} / ${s.providerCount}`} />
          <Row label="OPEN REDEMPTIONS" value={s.openRedemptions.toString()} />
          <Row label="SETTLEMENT POOL" value={formatUsd(s.pool)} />
          <Row label="SHORTFALL" value={formatUsd(s.shortfall)} />
          <Row label="FINAL REF" value={s.phase === Phase.Finalized ? formatPriceWad(s.finalRefWad) : "—"} />
          <Row label="PAYS PER RECEIPT" value={s.phase === Phase.Finalized ? formatUsd(s.payoutPerReceipt) : "—"} tone="lime" />
        </div>
        <div className="space-y-3">
          {s.phase === Phase.Finalized ? (
            <p className="text-[14px] text-ink-2">
              Finalized. Holders settle at {formatUsd(s.payoutPerReceipt)} per receipt from the portfolio. No fee, no deadline.
            </p>
          ) : !ended ? (
            <p className="text-[14px] text-ink-2">Finalization opens when the quarter has ended.</p>
          ) : (
            <>
              <p className="text-[14px] text-ink-2">
                {clear
                  ? "Anyone can run finalization. It moves each provider's share into the settlement pool, then fixes the payout per receipt."
                  : `${s.openRedemptions} redemptions are still open. Each one can be closed by anyone from its page.`}
              </p>
              <ConnectGate what="run finalization">
                <div className="flex flex-wrap gap-3">
                  <Button size="sm" disabled={!canProviders} onClick={() => setAction("providers")}>
                    FINALIZE PROVIDERS
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!canComplete} onClick={() => setAction("complete")}>
                    COMPLETE FINALIZATION
                  </Button>
                </div>
              </ConnectGate>
            </>
          )}
        </div>
      </div>
      {action && (
        <div className="mt-6">
          <ConfirmSheet
            title={action === "providers" ? "FINALIZE PROVIDERS · CONFIRM" : "COMPLETE FINALIZATION · CONFIRM"}
            lines={
              action === "providers"
                ? [
                    { label: "PROVIDERS IN THIS BATCH", value: `UP TO 50 OF ${s.providerCount - s.finalizeCursor} LEFT` },
                    { label: "MOVES", value: "OUTSTANDING × REF INTO THE POOL" },
                    { label: "USDG OUT", value: "$0.00" },
                    { label: "RECEIPTS", value: "NONE" },
                    { label: "FEE", value: "NONE" },
                  ]
                : [
                    { label: "FIXES FINAL REF", value: s.totalSold > 0n ? formatPriceWad(s.refWad) : "—" },
                    { label: "POOL", value: formatUsd(s.pool) },
                    { label: "RECEIPTS IN CIRCULATION", value: `${s.totalSupply} NCU` },
                    { label: "USDG OUT", value: "$0.00" },
                    { label: "FEE", value: "NONE" },
                  ]
            }
            note="Gas only. Anyone can call this."
            action={action === "providers" ? "FINALIZE PROVIDERS" : "COMPLETE FINALIZATION"}
            onConfirm={async () => {
              const rc =
                action === "providers"
                  ? await tx.run({ ...hub, functionName: "finalizeProviders", args: [s.id, 50n] })
                  : await tx.run({ ...hub, functionName: "completeFinalization", args: [s.id] });
              if (rc) setAction(null);
            }}
            onCancel={() => {
              tx.reset();
              setAction(null);
            }}
            state={tx.state}
          />
        </div>
      )}
      {!action && tx.state.status === "confirmed" && <p className="stamp mt-4 text-[12px] text-lime">CONFIRMED.</p>}
    </Panel>
  );
}

