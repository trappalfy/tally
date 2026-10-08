"use client";

import { useCallback, useState } from "react";
import {
  useAccount,
  useConfig,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt, readContract } from "wagmi/actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi, parseAbiItem, type Address, type Hash, type PublicClient, BaseError, ContractFunctionRevertedError } from "viem";
import { hub, HUB, HUB_READY, USDG, FROM_BLOCK, tallySeriesAbi } from "./contracts";

export type SeriesView = {
  id: bigint;
  token: Address;
  year: number;
  quarter: number;
  phase: number;
  openAt: bigint;
  startAt: bigint;
  listingsCloseAt: bigint;
  endAt: bigint;
  totalPaid: bigint;
  totalSold: bigint;
  totalSupply: bigint;
  refWad: bigint;
  riskRefWad: bigint;
  sellerCount: bigint;
  providerCount: bigint;
  openRedemptions: bigint;
  finalizeCursor: bigint;
  pool: bigint;
  shortfall: bigint;
  finalRefWad: bigint;
  payoutPerReceipt: bigint;
};

export type Listing = { id: bigint; provider: Address; series: bigint; remaining: bigint; price: bigint; escrow: bigint };

export type Redemption = {
  id: bigint;
  holder: Address;
  provider: Address;
  series: bigint;
  n: bigint;
  gpuType: number;
  status: number;
  outcome: number;
  refWad: bigint;
  value: bigint;
  reserve: bigint;
  bond: bigint;
  duration: bigint;
  startBy: bigint;
  startedAt: bigint;
  jobEnd: bigint;
  disputeUntil: bigint;
  disputedAt: bigint;
  specHash: `0x${string}`;
  startProofHash: `0x${string}`;
};

export type ProviderInfo = {
  address: Address;
  applied: boolean;
  approved: boolean;
  suspended: boolean;
  payout: Address;
  gpuMask: bigint;
  maxOpenNcu: bigint;
  openNcu: bigint;
  pubKey: `0x${string}`;
  meta: ProviderMeta;
};

export type ProviderMeta = {
  name?: string;
  site?: string;
  benchmark?: string;
  region?: string;
  webhook?: string;
  gpus?: string;
};

export type Health = {
  escrow: bigint;
  collateral: bigint;
  reserved: bigint;
  free: bigint;
  outstanding: bigint;
  sold: bigint;
  paid: bigint;
  crBps: bigint;
  flaggedAt: bigint;
  flagged: boolean;
  belowMaintenance: boolean;
  liquidatable: boolean;
  finalized: boolean;
  withdrawable: bigint;
};

const REFRESH = 12_000;

export function useNow(intervalMs = 1000) {
  const { data } = useQuery({
    queryKey: ["now", intervalMs],
    queryFn: () => Math.floor(Date.now() / 1000),
    refetchInterval: intervalMs,
    initialData: () => Math.floor(Date.now() / 1000),
  });
  return data;
}

// ---------------- series ----------------

export function useAllSeries() {
  const ids = useReadContract({ ...hub, functionName: "allSeries", query: { enabled: HUB_READY, refetchInterval: REFRESH } });
  const list = (ids.data ?? []) as readonly bigint[];
  const infos = useReadContracts({
    contracts: list.map((id) => ({ ...hub, functionName: "seriesInfo", args: [id] }) as const),
    query: { enabled: list.length > 0, refetchInterval: REFRESH },
  });
  const series = (infos.data ?? [])
    .map((r) => (r.status === "success" ? (r.result as unknown as SeriesView) : null))
    .filter((s): s is SeriesView => !!s);
  return {
    series,
    isLoading: ids.isLoading || infos.isLoading,
    error: ids.error ?? infos.error,
    refetch: () => {
      ids.refetch();
      infos.refetch();
    },
  };
}

export function useSeries(id?: bigint) {
  const q = useReadContract({
    ...hub,
    functionName: "seriesInfo",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: HUB_READY && id !== undefined, refetchInterval: REFRESH },
  });
  return { ...q, data: q.data as unknown as SeriesView | undefined };
}

// ---------------- listings ----------------

export function useListings() {
  const count = useReadContract({ ...hub, functionName: "listingCount", query: { enabled: HUB_READY, refetchInterval: REFRESH } });
  const n = Number(count.data ?? 0n);
  const items = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({ ...hub, functionName: "listing", args: [BigInt(i)] }) as const),
    query: { enabled: n > 0, refetchInterval: REFRESH },
  });
  const listings: Listing[] = (items.data ?? [])
    .map((r, i) => (r.status === "success" ? ({ id: BigInt(i), ...(r.result as object) } as Listing) : null))
    .filter((l): l is Listing => !!l);
  return { listings, isLoading: count.isLoading || items.isLoading, refetch: () => (count.refetch(), items.refetch()) };
}

// ---------------- redemptions ----------------

export function useRedemptions() {
  const count = useReadContract({ ...hub, functionName: "redemptionCount", query: { enabled: HUB_READY, refetchInterval: REFRESH } });
  const n = Number(count.data ?? 0n);
  const items = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({ ...hub, functionName: "redemption", args: [BigInt(i)] }) as const),
    query: { enabled: n > 0, refetchInterval: REFRESH },
  });
  const redemptions: Redemption[] = (items.data ?? [])
    .map((r, i) => (r.status === "success" ? ({ id: BigInt(i), ...(r.result as object) } as Redemption) : null))
    .filter((x): x is Redemption => !!x);
  return { redemptions, isLoading: count.isLoading || items.isLoading, refetch: () => (count.refetch(), items.refetch()) };
}

export function useRedemption(id?: bigint) {
  const q = useReadContract({
    ...hub,
    functionName: "redemption",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: HUB_READY && id !== undefined, refetchInterval: 5_000 },
  });
  return { ...q, data: q.data ? ({ id: id!, ...(q.data as object) } as Redemption) : undefined };
}

// ---------------- providers ----------------

export function parseMeta(s: string): ProviderMeta {
  try {
    const m = JSON.parse(s);
    return typeof m === "object" && m ? m : {};
  } catch {
    return { name: s.slice(0, 64) };
  }
}

/** Chunked getLogs — public RPCs cap the block range. */
export async function getLogsChunked<T>(
  client: PublicClient,
  fetcher: (from: bigint, to: bigint) => Promise<T[]>,
  from: bigint = FROM_BLOCK,
): Promise<T[]> {
  const latest = await client.getBlockNumber();
  let step = 500_000n;
  const out: T[] = [];
  let start = from;
  while (start <= latest) {
    const end = start + step - 1n > latest ? latest : start + step - 1n;
    try {
      out.push(...(await fetcher(start, end)));
      start = end + 1n;
    } catch (e) {
      if (step <= 1_000n) throw e;
      step /= 4n;
    }
  }
  return out;
}

const providerAppliedEvent = parseAbiItem("event ProviderApplied(address indexed provider, address payout, string meta)");

export function useProviderMeta() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["providerMeta", HUB],
    enabled: HUB_READY && !!client,
    refetchInterval: 60_000,
    queryFn: async () => {
      const logs = await getLogsChunked(client!, (fromBlock, toBlock) =>
        client!.getLogs({ address: HUB, event: providerAppliedEvent, fromBlock, toBlock }),
      );
      const map = new Map<string, ProviderMeta>();
      for (const l of logs) map.set(l.args.provider!.toLowerCase(), parseMeta(l.args.meta ?? ""));
      return map;
    },
  });
}

export function useProviders() {
  const list = useReadContract({ ...hub, functionName: "providers", query: { enabled: HUB_READY, refetchInterval: REFRESH } });
  const addrs = (list.data ?? []) as readonly Address[];
  const infos = useReadContracts({
    contracts: addrs.map((a) => ({ ...hub, functionName: "getProvider", args: [a] }) as const),
    query: { enabled: addrs.length > 0, refetchInterval: REFRESH },
  });
  const meta = useProviderMeta();
  const providers: ProviderInfo[] = addrs.map((a, i) => {
    const r = infos.data?.[i];
    const p = (r?.status === "success" ? r.result : {}) as Omit<ProviderInfo, "address" | "meta">;
    return { address: a, ...p, meta: meta.data?.get(a.toLowerCase()) ?? {} } as ProviderInfo;
  });
  return {
    providers,
    byAddress: (a?: string) => providers.find((p) => p.address.toLowerCase() === a?.toLowerCase()),
    isLoading: list.isLoading || infos.isLoading,
    refetch: () => (list.refetch(), infos.refetch(), meta.refetch()),
  };
}

export function useHealths(pairs: { provider: Address; series: bigint }[]) {
  const q = useReadContracts({
    contracts: pairs.map((p) => ({ ...hub, functionName: "providerHealth", args: [p.provider, p.series] }) as const),
    query: { enabled: HUB_READY && pairs.length > 0, refetchInterval: REFRESH },
  });
  const map = new Map<string, Health>();
  pairs.forEach((p, i) => {
    const r = q.data?.[i];
    if (r?.status === "success") map.set(`${p.provider.toLowerCase()}:${p.series}`, r.result as unknown as Health);
  });
  return { get: (provider: string, series: bigint) => map.get(`${provider.toLowerCase()}:${series}`), refetch: q.refetch, isLoading: q.isLoading };
}

export function useGpuTypes() {
  const ids = useReadContract({ ...hub, functionName: "gpuTypeIds", query: { enabled: HUB_READY } });
  const list = (ids.data ?? []) as readonly number[];
  const infos = useReadContracts({
    contracts: list.map((id) => ({ ...hub, functionName: "getGpuType", args: [id] }) as const),
    query: { enabled: list.length > 0 },
  });
  const types = list.map((id, i) => {
    const r = infos.data?.[i];
    const g = (r?.status === "success" ? r.result : { name: "", ncuPerHourBps: 0 }) as { name: string; ncuPerHourBps: number };
    return { id, name: g.name, ncuPerHourBps: BigInt(g.ncuPerHourBps) };
  });
  return { types, isLoading: ids.isLoading || infos.isLoading };
}

// ---------------- balances ----------------

export function useSeriesBalances(account?: Address, series: SeriesView[] = []) {
  const q = useReadContracts({
    contracts: series.map((s) => ({ address: s.token, abi: tallySeriesAbi, functionName: "balanceOf", args: [account!] }) as const),
    query: { enabled: !!account && series.length > 0, refetchInterval: REFRESH },
  });
  const map = new Map<bigint, bigint>();
  series.forEach((s, i) => {
    const r = q.data?.[i];
    map.set(s.id, r?.status === "success" ? (r.result as bigint) : 0n);
  });
  return { get: (id: bigint) => map.get(id) ?? 0n, refetch: q.refetch, isLoading: q.isLoading };
}

export function useUsdgBalance(account?: Address) {
  return useReadContract({
    address: USDG,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account, refetchInterval: REFRESH },
  });
}

export function useIsOwnerOrArbiter() {
  const { address } = useAccount();
  const owner = useReadContract({ ...hub, functionName: "owner", query: { enabled: HUB_READY } });
  const arbiter = useReadContract({ ...hub, functionName: "arbiter", query: { enabled: HUB_READY } });
  const eq = (a?: string) => !!address && !!a && a.toLowerCase() === address.toLowerCase();
  return { isOwner: eq(owner.data as string), isArbiter: eq(arbiter.data as string), arbiter: arbiter.data as Address | undefined };
}

// ---------------- transactions ----------------

export type TxState =
  | { status: "idle" }
  | { status: "approving"; hash?: Hash }
  | { status: "signing" }
  | { status: "pending"; hash: Hash }
  | { status: "confirmed"; hash: Hash }
  | { status: "reverted"; hash: Hash; message: string }
  | { status: "error"; message: string };

export function errorMessage(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name) return REVERT_COPY[name] ?? name;
    }
    if (/User rejected|denied/i.test(e.message)) return "Signature rejected in wallet.";
    return e.shortMessage || e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

const REVERT_COPY: Record<string, string> = {
  WrongPhase: "Not allowed in the current series phase.",
  Paused: "Sales are paused.",
  NotApproved: "Provider is not approved.",
  ProviderSuspendedErr: "Provider is suspended.",
  ProviderFlagged: "Provider is below 115% and flagged.",
  NotConfigured: "Set GPU types and an encryption key first.",
  CapacityRule: "Capacity rule: keep at least one GPU type and enough open capacity.",
  OutOfBand: "Price is outside ±20% of the risk price.",
  InsufficientListing: "Not enough receipts left in this listing.",
  InsufficientCollateral: "Provider's free collateral does not cover this.",
  InsufficientOutstanding: "Provider has fewer receipts outstanding than requested.",
  CapacityFull: "Provider's capacity is full right now.",
  UnsupportedGpu: "Provider does not run this GPU type.",
  TooEarly: "Too early.",
  TooLate: "Too late.",
  BadStatus: "Wrong redemption status.",
  NotAuthorized: "This wallet cannot do that.",
  NotFlaggable: "Collateral is not below 115%.",
  NotLiquidatable: "Not liquidatable yet.",
  TooMuch: "Amount is above the limit.",
  RedemptionsOpen: "Open redemptions must close first.",
  NotFinalizedYet: "Finalize all providers first.",
};

type Call = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

/**
 * Run a contract call, approving USDG first when needed. Approval is for the exact amount, never unlimited.
 */
export function useTx(onDone?: () => void) {
  const config = useConfig();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const run = useCallback(
    async (call: Call, usdgAmount?: bigint) => {
      try {
        if (usdgAmount && usdgAmount > 0n && address) {
          const allowance = await readContract(config, {
            address: USDG,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, HUB],
          });
          if (allowance < usdgAmount) {
            setState({ status: "approving" });
            const ah = await writeContractAsync({ address: USDG, abi: erc20Abi, functionName: "approve", args: [HUB, usdgAmount] });
            setState({ status: "approving", hash: ah });
            await waitForTransactionReceipt(config, { hash: ah });
          }
        }
        setState({ status: "signing" });
        const hash = await writeContractAsync(call);
        setState({ status: "pending", hash });
        const rc = await waitForTransactionReceipt(config, { hash });
        if (rc.status === "success") {
          setState({ status: "confirmed", hash });
          await qc.invalidateQueries();
          onDone?.();
          return rc;
        }
        setState({ status: "reverted", hash, message: "Transaction reverted." });
      } catch (e) {
        setState({ status: "error", message: errorMessage(e) });
      }
      return undefined;
    },
    [address, config, writeContractAsync, qc, onDone],
  );

  return { state, run, reset: () => setState({ status: "idle" }) };
}
