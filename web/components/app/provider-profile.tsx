"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import type { Address } from "viem";
import { liquidationQuote, maskToIds, formatUsd, formatPriceWad, seriesLabel, PHASE_LABEL, Phase } from "@tally/shared";
import { Button, Stamp } from "@/components/ui";
import { HealthBar } from "@/components/ui/health-bar";
import { Panel, Row, Field, inputCls, Empty, Loading, Notice, NotDeployed, ConnectGate, ConfirmSheet, AddressLink, crPercent, fmtDate } from "./kit";
import {
  useProviders,
  useAllSeries,
  useHealths,
  useGpuTypes,
  useListings,
  useRedemptions,
  useSeriesBalances,
  useTx,
  type Health,
  type SeriesView,
} from "@/lib/tally/hooks";
import { hub, HUB_READY } from "@/lib/tally/contracts";
import { ncuSymbol, money, providerName, providerStats, useHubLogs, StatsGrid, RedemptionRows } from "./shared";
import { siteHref } from "./providers-list";

export function ProviderProfile({ address }: { address: Address }) {
  const { byAddress, isLoading } = useProviders();
  const { series } = useAllSeries();
  const { types } = useGpuTypes();
  const { listings } = useListings();
  const { redemptions, isLoading: rLoading } = useRedemptions();
  const logs = useHubLogs();
  const pairs = useMemo(() => series.map((s) => ({ provider: address, series: s.id })), [series, address]);
  const healths = useHealths(pairs);
  const stats = useMemo(() => (logs.data ? providerStats(logs.data) : undefined), [logs.data]);

  if (!HUB_READY) return <NotDeployed />;
  if (isLoading) return <Loading />;
  const p = byAddress(address);
  if (!p || !p.applied) return <Notice tone="danger">No provider at this address.</Notice>;

  const me = address.toLowerCase();
  const gpus = maskToIds(p.gpuMask ?? 0n).map((id) => types.find((t) => t.id === id)?.name ?? `GPU ${id}`);
  const href = siteHref(p.meta.site);
  const mySeries = series.filter((s) => {
    const h = healths.get(address, s.id);
    return !!h && (h.collateral > 0n || h.escrow > 0n || h.outstanding > 0n || h.sold > 0n);
  });
  const myListings = listings.filter((l) => l.provider.toLowerCase() === me && l.remaining > 0n);
  const myRedemptions = redemptions.filter((r) => r.provider.toLowerCase() === me);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Panel
            title="PROFILE"
            aside={
              <Stamp boxed tone={p.suspended ? "danger" : p.approved ? "lime" : "muted"} size="xs">
                {p.suspended ? "SUSPENDED" : p.approved ? "APPROVED" : "PENDING APPROVAL"}
              </Stamp>
            }
          >
            <div className="font-serif text-[36px] italic leading-tight">{providerName(p)}</div>
            {href && (
              <a href={href} target="_blank" rel="noreferrer" className="break-all text-[14px] text-ink-2 underline decoration-ink-3 underline-offset-4 hover:text-lime">
                {p.meta.site}
              </a>
            )}
            <div className="mt-4 space-y-0.5">
              <Row label="ADDRESS" value={<AddressLink address={p.address} />} />
              <Row label="PAYOUT" value={<AddressLink address={p.payout} />} />
              {p.meta.region && <Row label="REGION" value={<span className="break-all">{p.meta.region}</span>} />}
              {p.meta.benchmark && <Row label="BENCHMARK" value={<span className="break-all">{p.meta.benchmark}</span>} />}
            </div>
          </Panel>
        </div>
        <div className="lg:col-span-5">
          <Panel title="CAPACITY">
            <div className="mb-4 flex flex-wrap gap-2">
              {gpus.length === 0 ? (
                <Stamp boxed tone="muted" size="xs">
                  NO GPU SET
                </Stamp>
              ) : (
                gpus.map((g) => (
                  <Stamp key={g} boxed tone="muted" size="xs">
                    {g}
                  </Stamp>
                ))
              )}
            </div>
            <Row label="MAX OPEN" value={`${p.maxOpenNcu ?? 0n} NCU`} />
            <Row label="IN USE NOW" value={`${p.openNcu ?? 0n} NCU`} tone="lime" />
          </Panel>
        </div>
      </div>

      <StatsGrid stats={stats?.get(me)} loading={logs.isLoading} />

      <div>
        <h2 className="mb-4 font-serif text-[32px] italic">Collateral by series</h2>
        {mySeries.length === 0 ? (
          <Empty>No collateral posted yet</Empty>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {mySeries.map((s) => (
              <SeriesHealth key={s.id.toString()} provider={address} s={s} h={healths.get(address, s.id)!} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4 font-serif text-[32px] italic">Listings</h2>
        {myListings.length === 0 ? (
          <Empty>No receipts listed</Empty>
        ) : (
          <div className="divide-y divide-ink-3 border-y border-ink-3">
            {myListings.map((l) => (
              <div key={l.id.toString()} className="stamp grid grid-cols-2 items-center gap-3 py-3 text-[13px] md:grid-cols-4">
                <span className="text-ink-2">#{l.id.toString()} · {seriesLabel(l.series)}</span>
                <span className="text-right md:text-left">{formatUsd(l.price)} / NCU</span>
                <span>{l.remaining.toString()} NCU LEFT</span>
                <span className="text-right">
                  <Button href={`/market?series=${l.series}`} size="sm" variant="ghost">
                    MARKET
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4 font-serif text-[32px] italic">Redemptions</h2>
        {rLoading ? <Loading /> : <RedemptionRows items={myRedemptions} who="holder" />}
      </div>
    </div>
  );
}

type Act = "flag" | "unflag" | "liquidate" | null;

function SeriesHealth({ provider, s, h }: { provider: Address; s: SeriesView; h: Health }) {
  const { address } = useAccount();
  const [act, setAct] = useState<Act>(null);
  const [kStr, setKStr] = useState("");
  const tx = useTx();
  const active = s.phase === Phase.Open || s.phase === Phase.Closing;
  const q = useReadContract({
    ...hub,
    functionName: "quoteLiquidation",
    args: [provider, s.id],
    query: { enabled: HUB_READY && active && h.flagged, refetchInterval: 12_000 },
  });
  const [liquidatable, kMax] = (q.data as readonly [boolean, bigint, bigint] | undefined) ?? [false, 0n, 0n];
  const one = useMemo(() => [s], [s]);
  const bals = useSeriesBalances(address, one);
  const bal = bals.get(s.id);
  const cap = kMax < bal ? kMax : bal;
  const k = /^\d+$/.test(kStr) ? BigInt(kStr) : 0n;
  const liq = liquidationQuote(h.free, h.outstanding, s.riskRefWad, k);
  const kOk = k > 0n && k <= cap;

  const canFlag = active && h.belowMaintenance && !h.flagged;
  const canUnflag = active && h.flagged && !h.belowMaintenance;
  const graceEnds = h.flagged ? h.flaggedAt + 86_400n : 0n;

  return (
    <Panel
      title={
        <Link href={`/series/${s.id}`} className="hover:text-lime">
          {seriesLabel(s.id)} · {PHASE_LABEL[s.phase]}
        </Link>
      }
      tone={h.flagged ? "danger" : "ink"}
      aside={h.flagged ? <Stamp tone="danger">FLAGGED</Stamp> : h.finalized ? <Stamp tone="muted">FINALIZED</Stamp> : undefined}
    >
      <HealthBar value={crPercent(h.crBps)} />
      <div className="mt-4 space-y-0.5">
        <Row label="COLLATERAL" value={formatUsd(h.collateral)} />
        <Row label="RESERVED" value={formatUsd(h.reserved)} />
        <Row label="FREE" value={formatUsd(h.free)} tone="lime" />
        <Row label="OUTSTANDING" value={`${h.outstanding} NCU`} />
        <Row label="LISTING ESCROW" value={formatUsd(h.escrow)} />
        <Row label="RISK PRICE" value={s.riskRefWad > 0n ? formatPriceWad(s.riskRefWad) : "—"} />
        {h.flagged && <Row label="FLAGGED AT" value={fmtDate(h.flaggedAt)} />}
        {h.flagged && <Row label="GRACE ENDS" value={fmtDate(graceEnds)} />}
      </div>

      {active && (canFlag || canUnflag || liquidatable) && (
        <div className="mt-5">
          <ConnectGate what="act on this position">
            <div className="flex flex-wrap gap-3">
              {canFlag && (
                <Button size="sm" variant="danger" onClick={() => setAct("flag")}>
                  FLAG
                </Button>
              )}
              {canUnflag && (
                <Button size="sm" variant="secondary" onClick={() => setAct("unflag")}>
                  UNFLAG
                </Button>
              )}
              {liquidatable && (
                <Button size="sm" variant="danger" onClick={() => setAct("liquidate")}>
                  LIQUIDATE
                </Button>
              )}
            </div>
          </ConnectGate>
        </div>
      )}

      {act === "liquidate" && (
        <div className="mt-5 space-y-4">
          <Field label="RECEIPTS TO BURN" hint={`Up to ${cap} NCU (limit ${kMax}, you hold ${bal}).`}>
            <input className={inputCls} inputMode="numeric" value={kStr} onChange={(e) => setKStr(e.target.value.replace(/\D/g, ""))} />
          </Field>
          {k > cap && <p className="text-[13px] text-danger">Above the limit.</p>}
          {bal === 0n && <p className="text-[13px] text-ink-2">You need {ncuSymbol(s)} receipts in this wallet to liquidate.</p>}
        </div>
      )}

      {act && (
        <div className="mt-5">
          <ConfirmSheet
            danger={act !== "unflag"}
            title={`${act.toUpperCase()} · CONFIRM`}
            lines={
              act === "liquidate"
                ? [
                    { label: "BURN", value: `${k} ${ncuSymbol(s)}`, tone: "lime" },
                    { label: "YOU RECEIVE", value: `${money(liq.paid)} USDG`, tone: "lime" },
                    { label: "FROM", value: "PROVIDER'S FREE COLLATERAL" },
                    { label: "INCLUDES", value: liq.full ? "PRO RATA SHARE OF FREE" : "5% BONUS AT RISK PRICE" },
                    { label: "USDG OUT", value: "$0.00" },
                    { label: "FEE", value: "NONE" },
                  ]
                : [
                    { label: "PROVIDER", value: providerName(undefined, provider) },
                    { label: "SERIES", value: seriesLabel(s.id) },
                    {
                      label: "EFFECT",
                      value: act === "flag" ? "NO NEW SALES · 24 H GRACE STARTS" : "SALES RESUME",
                    },
                    { label: "USDG OUT", value: "$0.00" },
                    { label: "FEE", value: "NONE" },
                  ]
            }
            note={
              act === "flag"
                ? "Collateral is below 115%. Anyone can flag. If it is still below 115% after 24 hours, liquidation opens."
                : act === "unflag"
                  ? "Collateral is back at 115% or more. Anyone can clear the flag."
                  : "Gas only. The contract checks the limit again at execution."
            }
            action={act === "liquidate" ? (kOk ? `LIQUIDATE ${k} NCU` : "ENTER AMOUNT") : act.toUpperCase()}
            onConfirm={async () => {
              const rc =
                act === "flag"
                  ? await tx.run({ ...hub, functionName: "flag", args: [provider, s.id] })
                  : act === "unflag"
                    ? await tx.run({ ...hub, functionName: "unflag", args: [provider, s.id] })
                    : kOk
                      ? await tx.run({ ...hub, functionName: "liquidate", args: [provider, s.id, k] })
                      : undefined;
              if (rc) {
                setAct(null);
                setKStr("");
              }
            }}
            onCancel={() => {
              tx.reset();
              setAct(null);
            }}
            state={tx.state}
          />
        </div>
      )}
      {!act && tx.state.status === "confirmed" && <p className="stamp mt-4 text-[12px] text-lime">CONFIRMED.</p>}
    </Panel>
  );
}
