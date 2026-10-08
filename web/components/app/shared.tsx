"use client";

import Link from "next/link";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseEventLogs, type Log } from "viem";
import { formatUsd, seriesLabel, OUTCOME_LABEL, Status, type RefState } from "@tally/shared";
import { HUB, HUB_READY, tallyHubAbi } from "@/lib/tally/contracts";
import { getLogsChunked, type ProviderInfo, type Redemption, type SeriesView } from "@/lib/tally/hooks";
import { Empty } from "./kit";

export const refState = (s: SeriesView): RefState => ({
  totalPaid: s.totalPaid,
  totalSold: s.totalSold,
  refWad: s.refWad,
  sellerCount: s.sellerCount,
});

/** Receipt ticker, e.g. NCU-26Q4. */
export const ncuSymbol = (s: { year: number; quarter: number }) => `NCU-${String(s.year).slice(-2)}Q${s.quarter}`;

/** USDG with cents, or full precision when the amount has sub-cent units. */
export const money = (units: bigint) => (units % 10_000n === 0n ? formatUsd(units) : formatUsd(units, 6));

export const STATUS_LABEL: Record<number, string> = {
  [Status.None]: "—",
  [Status.Requested]: "REQUESTED",
  [Status.Started]: "STARTED",
  [Status.Disputed]: "DISPUTED",
  [Status.Closed]: "CLOSED",
};

export const providerName = (p?: ProviderInfo, fallback?: string) =>
  p?.meta.name || (p ? `${p.address.slice(0, 6)}…${p.address.slice(-4)}` : fallback ? `${fallback.slice(0, 6)}…${fallback.slice(-4)}` : "—");

/** Parse "20264" or "2026-Q4" into a series id. */
export function parseSeriesId(raw: string): bigint | undefined {
  const s = decodeURIComponent(raw).trim();
  if (/^\d+$/.test(s)) return BigInt(s);
  const m = /^(\d{4})-?Q([1-4])$/i.exec(s);
  return m ? BigInt(m[1] + m[2]) : undefined;
}

/** All hub logs, fetched once in chunks and shared by every page through the query cache. */
export function useHubLogs() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["hubLogs", HUB],
    enabled: HUB_READY && !!client,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Log[]> =>
      getLogsChunked(client!, (fromBlock, toBlock) => client!.getLogs({ address: HUB, fromBlock, toBlock })),
  });
}

export type ProviderStats = {
  issued: bigint;
  redemptions: number;
  missed: number;
  disputesLost: number;
  liquidations: number;
};

const emptyStats = (): ProviderStats => ({ issued: 0n, redemptions: 0, missed: 0, disputesLost: 0, liquidations: 0 });

/** Provider track record computed only from hub events. Keys are lowercase addresses. */
export function providerStats(logs: Log[]): Map<string, ProviderStats> {
  const out = new Map<string, ProviderStats>();
  const get = (a: string) => {
    const k = a.toLowerCase();
    let s = out.get(k);
    if (!s) out.set(k, (s = emptyStats()));
    return s;
  };
  const listingProv = new Map<bigint, string>();
  for (const l of parseEventLogs({ abi: tallyHubAbi, logs, eventName: "Listed" })) listingProv.set(l.args.listingId, l.args.provider);
  for (const l of parseEventLogs({ abi: tallyHubAbi, logs, eventName: "Bought" })) {
    const p = listingProv.get(l.args.listingId);
    if (p) get(p).issued += l.args.n;
  }
  const redProv = new Map<bigint, string>();
  for (const l of parseEventLogs({ abi: tallyHubAbi, logs, eventName: "RedemptionRequested" })) {
    redProv.set(l.args.id, l.args.provider);
    get(l.args.provider).redemptions += 1;
  }
  for (const l of parseEventLogs({ abi: tallyHubAbi, logs, eventName: "MissedStartPaid" })) {
    const p = redProv.get(l.args.id);
    if (p) get(p).missed += 1;
  }
  for (const l of parseEventLogs({ abi: tallyHubAbi, logs, eventName: "DisputeResolved" })) {
    const p = redProv.get(l.args.id);
    if (p && l.args.holderShareBps > 0n) get(p).disputesLost += 1;
  }
  for (const l of parseEventLogs({ abi: tallyHubAbi, logs, eventName: "StaleDisputeClosed" })) {
    const p = redProv.get(l.args.id);
    if (p) get(p).disputesLost += 1;
  }
  for (const l of parseEventLogs({ abi: tallyHubAbi, logs, eventName: "Liquidated" })) get(l.args.provider).liquidations += 1;
  return out;
}

export function StatsGrid({ stats, loading }: { stats?: ProviderStats; loading?: boolean }) {
  const s = stats ?? emptyStats();
  const cells: [string, string][] = [
    ["ISSUED", `${s.issued} NCU`],
    ["REDEMPTIONS", `${s.redemptions}`],
    ["MISSED STARTS", `${s.missed}`],
    ["DISPUTES LOST", `${s.disputesLost}`],
    ["LIQUIDATIONS", `${s.liquidations}`],
  ];
  return (
    <div className="grid grid-cols-2 gap-px border border-ink-3 bg-ink-3 sm:grid-cols-5">
      {cells.map(([l, v]) => (
        <div key={l} className="bg-paper px-3 py-2.5 last:col-span-2 sm:last:col-span-1">
          <div className="stamp text-[10px] text-ink-2">{l}</div>
          <div className={`stamp mt-1 text-[15px] ${loading ? "text-ink-3" : "text-ink"}`}>{loading ? "…" : v}</div>
        </div>
      ))}
    </div>
  );
}

export function RedemptionRows({
  items,
  who,
  names,
}: {
  items: Redemption[];
  who: "holder" | "provider";
  names?: (a: string) => string;
}) {
  if (items.length === 0) return <Empty>No redemptions yet</Empty>;
  return (
    <div className="divide-y divide-ink-3 border-y border-ink-3">
      {[...items]
        .sort((a, b) => Number(b.id - a.id))
        .map((r) => {
          const party = who === "provider" ? r.provider : r.holder;
          return (
            <Link
              key={r.id.toString()}
              href={`/redemptions/${r.id}`}
              className="grid grid-cols-2 gap-x-4 gap-y-1 py-3 hover:bg-ink-3/10 md:grid-cols-12 md:items-center"
            >
              <span className="stamp text-[13px] text-lime md:col-span-1">#{r.id.toString()}</span>
              <span className="stamp text-right text-[13px] text-ink md:col-span-2 md:text-left">{seriesLabel(r.series)}</span>
              <span className="stamp text-[13px] text-ink md:col-span-2">{r.n.toString()} NCU</span>
              <span className="truncate text-right text-[13px] text-ink-2 md:col-span-3 md:text-left">
                {who === "provider" ? "" : "Holder "}
                {names ? names(party) : `${party.slice(0, 6)}…${party.slice(-4)}`}
              </span>
              <span className="stamp text-[12px] text-ink-2 md:col-span-2">{STATUS_LABEL[r.status] ?? "—"}</span>
              <span className="stamp text-right text-[12px] text-ink-2 md:col-span-2">
                {r.status === Status.Closed ? OUTCOME_LABEL[r.outcome] : ""}
              </span>
            </Link>
          );
        })}
    </div>
  );
}
