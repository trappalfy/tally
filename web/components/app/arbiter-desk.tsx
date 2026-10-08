"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { isAddress, type Address } from "viem";
import {
  formatUsd,
  formatDuration,
  formatBps,
  mulDiv,
  resolvePayout,
  seriesLabel,
  maskToIds,
  PHASE_LABEL,
  Status,
  BPS,
  ARBITER_DEADLINE,
} from "@tally/shared";
import { Button, Stamp, Countdown } from "@/components/ui";
import { Panel, Row, Field, inputCls, Empty, Loading, Notice, ConnectGate, AddressLink, fmtDate, busy } from "./kit";
import { useConfirmTx } from "./confirm-tx";
import {
  useRedemptions,
  useProviders,
  useGpuTypes,
  useAllSeries,
  useIsOwnerOrArbiter,
  useNow,
  type Redemption,
  type ProviderInfo,
} from "@/lib/tally/hooks";
import { hub } from "@/lib/tally/contracts";
import { handoff } from "@/lib/tally/handoff";
import { useHandoffSession } from "@/lib/tally/session";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ZERO = "0x0000000000000000000000000000000000000000";

export function ArbiterDesk() {
  return (
    <ConnectGate what="open the arbiter desk">
      <Desk />
    </ConnectGate>
  );
}

function Desk() {
  const { isArbiter, isOwner } = useIsOwnerOrArbiter();
  return (
    <div className="space-y-10">
      {isArbiter ? <Disputes /> : <Notice>Arbiter desk. Only the arbiter multisig can resolve disputes.</Notice>}
      {isOwner && <OwnerDesk />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

function Disputes() {
  const { redemptions, isLoading } = useRedemptions();
  const open = redemptions.filter((r) => r.status === Status.Disputed).sort((a, b) => Number(a.disputedAt - b.disputedAt));
  return (
    <Panel title="OPEN DISPUTES" aside={<Stamp tone={open.length ? "danger" : "muted"} size="xs">{open.length} OPEN</Stamp>}>
      {isLoading ? (
        <Loading />
      ) : open.length === 0 ? (
        <Empty>NO OPEN DISPUTES</Empty>
      ) : (
        <div className="space-y-6">
          {open.map((r) => (
            <DisputeRow key={String(r.id)} r={r} />
          ))}
        </div>
      )}
    </Panel>
  );
}

type EvidenceItem = Awaited<ReturnType<typeof handoff.getEvidence>>[number];

function DisputeRow({ r }: { r: Redemption }) {
  const now = useNow(1000);
  const { byAddress } = useProviders();
  const { types } = useGpuTypes();
  const session = useHandoffSession();
  const ctx = useConfirmTx();
  const [bps, setBps] = useState(10_000);
  const [ev, setEv] = useState<EvidenceItem[] | null>(null);
  const [evErr, setEvErr] = useState<string | null>(null);
  const [evWork, setEvWork] = useState(false);

  useEffect(() => {
    if (window.location.hash === `#r${r.id}`) document.getElementById(`r${r.id}`)?.scrollIntoView();
  }, [r.id]);

  const deadline = Number(r.disputedAt + ARBITER_DEADLINE);
  const left = deadline - now;
  const B = BigInt(bps);
  const fromReserve = mulDiv(r.reserve, B, BPS);
  const toHolder = resolvePayout(r.reserve, r.bond, B);
  const toProvider = r.reserve - fromReserve + (B === 0n ? r.bond : 0n);
  const prov = byAddress(r.provider);
  const gpu = types.find((t) => t.id === r.gpuType)?.name ?? `GPU ${r.gpuType}`;

  async function loadEvidence() {
    setEvErr(null);
    setEvWork(true);
    try {
      await session.ensureSignedIn();
      setEv(await handoff.getEvidence(r.id));
    } catch (e) {
      setEvErr(errText(e));
    }
    setEvWork(false);
  }

  function resolve() {
    ctx.ask({
      title: `RESOLVE #${r.id}`,
      lines: [
        { label: "HOLDER SHARE", value: formatBps(B) },
        { label: "TO HOLDER, FROM RESERVE", value: formatUsd(fromReserve) },
        { label: "DISPUTE BOND", value: B > 0n ? `${formatUsd(r.bond)} back to holder` : `${formatUsd(r.bond)} to provider` },
        { label: "HOLDER RECEIVES", value: formatUsd(toHolder), tone: "lime" },
        { label: "PROVIDER FREE COLLATERAL GETS", value: formatUsd(toProvider) },
      ],
      note: "Final. The redemption closes and the reserve is split as shown.",
      action: "RESOLVE",
      danger: true,
      call: { ...hub, functionName: "resolve", args: [r.id, B] },
    });
  }

  return (
    <div id={`r${r.id}`} className="scroll-mt-24 border border-danger p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <a href={`/redemptions/${r.id}`} className="stamp text-[14px] text-ink underline decoration-ink-3 underline-offset-4 hover:text-lime">
            REDEMPTION #{String(r.id)}
          </a>
          <div className="text-[13px] text-ink-2">
            {seriesLabel(r.series)} · {String(r.n)} NCU · {gpu} · {formatDuration(r.duration)}
          </div>
        </div>
        {left > 0 ? (
          <Countdown seconds={left} dangerBelow={86_400} size="md" label="DEADLINE" />
        ) : (
          <Stamp tone="danger">DEADLINE PASSED · STALE</Stamp>
        )}
      </div>

      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <Row label="HOLDER" value={<AddressLink address={r.holder} />} />
          <Row label="PROVIDER" value={<AddressLink address={r.provider} label={prov?.meta.name || undefined} />} />
          <Row label="VALUE AT REF" value={formatUsd(r.value)} />
          <Row label="RESERVE, 115%" value={formatUsd(r.reserve)} />
          <Row label="DISPUTE BOND" value={formatUsd(r.bond)} />
        </div>
        <div>
          <Row label="STARTED" value={r.startedAt > 0n ? fmtDate(r.startedAt) : "—"} />
          <Row label="JOB END" value={r.jobEnd > 0n ? fmtDate(r.jobEnd) : "—"} />
          <Row label="DISPUTED" value={fmtDate(r.disputedAt)} />
          <Row label="RESOLVE BY" value={fmtDate(deadline)} />
        </div>
      </div>

      <div className="mt-5">
        {ev === null ? (
          <Button variant="secondary" size="sm" onClick={loadEvidence} disabled={evWork}>
            {evWork ? "LOADING…" : "SHOW EVIDENCE"}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="stamp text-[11px] text-ink-2">EVIDENCE</div>
            {ev.length === 0 && <p className="text-[14px] text-ink-2">No evidence yet.</p>}
            {ev.map((e) => (
              <div key={e.id} className="border border-ink-3 p-3">
                <div className="stamp text-[11px] text-ink-2">
                  {e.role.toUpperCase()} · {e.createdAt.slice(0, 16).replace("T", " ")} UTC
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-[14px]">{e.text}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {e.image && <img src={e.image} alt="Evidence screenshot" className="mt-2 max-h-80 max-w-full border border-ink-3" />}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={loadEvidence} disabled={evWork}>
              REFRESH
            </Button>
          </div>
        )}
        {evErr && (
          <div className="mt-3">
            <Notice tone="danger">{evErr}</Notice>
          </div>
        )}
      </div>

      {left > 0 && (
        <div className="mt-6 space-y-4 border-t border-ink-3 pt-5">
          <Field label="HOLDER SHARE" hint="0% = provider keeps the reserve and the bond. Above 0%: bond goes back to the holder.">
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="range"
                min={0}
                max={10_000}
                step={100}
                value={bps}
                onChange={(e) => setBps(Number(e.target.value))}
                className="w-full accent-lime md:w-auto md:flex-1"
                aria-label="Holder share"
              />
              <input
                className={`${inputCls} !w-28`}
                inputMode="numeric"
                value={bps}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/\D/g, "") || 0);
                  setBps(Math.min(10_000, Math.max(0, v)));
                }}
                aria-label="Holder share in basis points"
              />
              <span className="stamp text-[12px] text-ink-2">BPS · {formatBps(B)}</span>
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            {[0, 5_000, 10_000].map((v) => (
              <Button key={v} variant="ghost" size="sm" onClick={() => setBps(v)}>
                {v / 100}%
              </Button>
            ))}
          </div>
          <div>
            <Row label="HOLDER RECEIVES" value={formatUsd(toHolder)} tone="lime" />
            <Row label="PROVIDER FREE COLLATERAL GETS" value={formatUsd(toProvider)} />
          </div>
          <Button variant="danger" onClick={resolve} disabled={ctx.open || busy(ctx.state)}>
            REVIEW RESOLUTION
          </Button>
        </div>
      )}
      {left <= 0 && (
        <div className="mt-5">
          <Notice>Deadline passed. Anyone can close it from the redemption page; the holder gets the reserve and the bond.</Notice>
        </div>
      )}
      {ctx.view && <div className="mt-5">{ctx.view}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owner desk
// ---------------------------------------------------------------------------

function OwnerDesk() {
  return (
    <div className="space-y-8">
      <div className="stamp text-[13px] text-lime">OWNER DESK</div>
      <ProvidersAdmin />
      <SeriesAdmin />
      <TimelockAdmin />
    </div>
  );
}

function ProvidersAdmin() {
  const { providers, isLoading, refetch } = useProviders();
  const { types } = useGpuTypes();
  const ctx = useConfirmTx(refetch);
  const pending = providers.filter((p) => p.applied && !p.approved);
  const approved = providers.filter((p) => p.approved);

  const act = (p: ProviderInfo, fn: "approveProvider" | "suspendProvider" | "unsuspendProvider") => {
    const label = fn === "approveProvider" ? "APPROVE" : fn === "suspendProvider" ? "SUSPEND" : "UNSUSPEND";
    ctx.ask({
      title: `${label} PROVIDER`,
      lines: [
        { label: "PROVIDER", value: p.meta.name || p.address.slice(0, 10) },
        { label: "ADDRESS", value: <AddressLink address={p.address} /> },
        { label: "USDG", value: "$0.00 · gas only" },
      ],
      note:
        fn === "suspendProvider"
          ? "Blocks new listings, sales and redemptions. Collateral, open jobs, disputes and liquidation keep working."
          : undefined,
      action: label,
      danger: fn === "suspendProvider",
      call: { ...hub, functionName: fn, args: [p.address] },
    });
  };

  const card = (p: ProviderInfo, actions: ReactNode) => (
    <div key={p.address} className="flex flex-col gap-3 border border-ink-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-serif text-[20px] italic">{p.meta.name || "Unnamed"}</span>
          {p.suspended && <Stamp tone="danger" size="xs" boxed>SUSPENDED</Stamp>}
        </div>
        <div className="text-[13px] text-ink-2">
          <AddressLink address={p.address} /> · {p.meta.region || "—"} · {p.meta.gpus || maskToIds(p.gpuMask ?? 0n).map((id) => types.find((t) => t.id === id)?.name ?? id).join(", ") || "—"}
        </div>
        {(p.meta.site || p.meta.benchmark) && (
          <div className="break-all text-[12px] text-ink-2">
            {p.meta.site} {p.meta.benchmark && `· benchmark: ${p.meta.benchmark}`}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );

  return (
    <Panel title="PROVIDERS">
      {isLoading ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="stamp text-[11px] text-ink-2">AWAITING APPROVAL · {pending.length}</div>
            {pending.length === 0 ? (
              <Empty>NO APPLICATIONS</Empty>
            ) : (
              pending.map((p) =>
                card(
                  p,
                  <Button size="sm" onClick={() => act(p, "approveProvider")} disabled={ctx.open || busy(ctx.state)}>
                    APPROVE
                  </Button>,
                ),
              )
            )}
          </div>
          <div className="space-y-3">
            <div className="stamp text-[11px] text-ink-2">APPROVED · {approved.length}</div>
            {approved.length === 0 ? (
              <Empty>NO APPROVED PROVIDERS</Empty>
            ) : (
              approved.map((p) =>
                card(
                  p,
                  p.suspended ? (
                    <Button variant="secondary" size="sm" onClick={() => act(p, "unsuspendProvider")} disabled={ctx.open || busy(ctx.state)}>
                      UNSUSPEND
                    </Button>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => act(p, "suspendProvider")} disabled={ctx.open || busy(ctx.state)}>
                      SUSPEND
                    </Button>
                  ),
                ),
              )
            )}
          </div>
          {ctx.view}
        </div>
      )}
    </Panel>
  );
}

function SeriesAdmin() {
  const { series, refetch } = useAllSeries();
  const paused = useReadContract({ ...hub, functionName: "salesPaused", query: { refetchInterval: 12_000 } });
  const ctx = useConfirmTx(() => (refetch(), paused.refetch()));
  const [year, setYear] = useState(String(new Date().getUTCFullYear()));
  const [quarter, setQuarter] = useState("1");

  const y = /^\d{4}$/.test(year) ? Number(year) : null;
  const q = /^[1-4]$/.test(quarter) ? Number(quarter) : null;
  const exists = y !== null && q !== null && series.some((s) => s.year === y && s.quarter === q);
  const isPaused = paused.data === true;

  function openSeries() {
    if (y === null || q === null) return;
    ctx.ask({
      title: "OPEN SERIES",
      lines: [
        { label: "SERIES", value: `${y}-Q${q}` },
        { label: "TOKEN", value: `Tally Receipt ${y}-Q${q}` },
        { label: "USDG", value: "$0.00 · gas only" },
      ],
      note: "Dates follow from the quarter: listings open 30 days before the start and close 7 days before the end.",
      action: "OPEN SERIES",
      call: { ...hub, functionName: "openSeries", args: [y, q] },
    });
  }

  function togglePause() {
    ctx.ask({
      title: isPaused ? "UNPAUSE SALES" : "PAUSE SALES",
      lines: [
        { label: "SALES NOW", value: isPaused ? "PAUSED" : "LIVE" },
        { label: "AFTER", value: isPaused ? "LIVE" : "PAUSED", tone: "lime" },
      ],
      note: "Pause blocks only listing and buying. Redemptions, collateral, disputes and settlement keep working.",
      action: isPaused ? "UNPAUSE SALES" : "PAUSE SALES",
      danger: !isPaused,
      call: { ...hub, functionName: isPaused ? "unpauseSales" : "pauseSales" },
    });
  }

  return (
    <Panel title="SERIES AND SALES" aside={<Stamp tone={isPaused ? "danger" : "lime"} size="xs">SALES {isPaused ? "PAUSED" : "LIVE"}</Stamp>}>
      <div className="space-y-6">
        <div>
          {series.length === 0 ? (
            <Empty>NO SERIES YET</Empty>
          ) : (
            series.map((s) => (
              <Row key={String(s.id)} label={seriesLabel(s.id)} value={`${PHASE_LABEL[s.phase]} · ${fmtDate(s.startAt).slice(0, 10)} → ${fmtDate(s.endAt).slice(0, 10)}`} />
            ))
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="YEAR">
            <input className={inputCls} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <Field label="QUARTER, 1–4">
            <input className={inputCls} inputMode="numeric" value={quarter} onChange={(e) => setQuarter(e.target.value)} />
          </Field>
          <Button onClick={openSeries} disabled={y === null || q === null || exists || ctx.open || busy(ctx.state)}>
            OPEN SERIES
          </Button>
        </div>
        {exists && <p className="text-[12px] text-ink-2">Series {year}-Q{quarter} already exists.</p>}
        <Button variant={isPaused ? "secondary" : "danger"} onClick={togglePause} disabled={paused.data === undefined || ctx.open || busy(ctx.state)}>
          {isPaused ? "UNPAUSE SALES" : "PAUSE SALES"}
        </Button>
        {ctx.view}
      </div>
    </Panel>
  );
}

const GPU_SCAN = Array.from({ length: 16 }, (_, i) => i);

function TimelockAdmin() {
  const now = useNow(5000);
  const { types } = useGpuTypes();
  const arbiter = useReadContract({ ...hub, functionName: "arbiter" });
  const treasury = useReadContract({ ...hub, functionName: "treasury" });
  const pArb = useReadContract({ ...hub, functionName: "pendingArbiter", query: { refetchInterval: 12_000 } });
  const arbEta = useReadContract({ ...hub, functionName: "arbiterEta", query: { refetchInterval: 12_000 } });
  const pTre = useReadContract({ ...hub, functionName: "pendingTreasury", query: { refetchInterval: 12_000 } });
  const treEta = useReadContract({ ...hub, functionName: "treasuryEta", query: { refetchInterval: 12_000 } });
  const pGpu = useReadContracts({
    contracts: GPU_SCAN.map((id) => ({ ...hub, functionName: "pendingGpuType", args: [id] }) as const),
    query: { refetchInterval: 12_000 },
  });
  const refetchAll = () => {
    arbiter.refetch();
    treasury.refetch();
    pArb.refetch();
    arbEta.refetch();
    pTre.refetch();
    treEta.refetch();
    pGpu.refetch();
  };
  const ctx = useConfirmTx(refetchAll);

  const [gid, setGid] = useState("");
  const [gbps, setGbps] = useState("");
  const [gname, setGname] = useState("");
  const [arb, setArb] = useState("");
  const [tre, setTre] = useState("");

  const pendingGpus = GPU_SCAN.map((id, i) => {
    const r = pGpu.data?.[i];
    const v = r?.status === "success" ? (r.result as { eta: bigint | number; ncuPerHourBps: number; name: string }) : null;
    return v && BigInt(v.eta) > 0n ? { id, eta: BigInt(v.eta), bps: v.ncuPerHourBps, name: v.name } : null;
  }).filter((x): x is { id: number; eta: bigint; bps: number; name: string } => !!x);

  const gidN = /^\d+$/.test(gid) && Number(gid) < 256 ? Number(gid) : null;
  const gbpsN = /^\d+$/.test(gbps) && Number(gbps) > 0 && Number(gbps) < 2 ** 32 ? Number(gbps) : null;
  const gpuTaken = gidN !== null && types.some((t) => t.id === gidN && t.name);

  const ready = (eta?: bigint) => eta !== undefined && eta > 0n && BigInt(now) >= eta;
  const etaText = (eta: bigint) => (BigInt(now) >= eta ? `READY SINCE ${fmtDate(eta)}` : `ETA ${fmtDate(eta)}`);

  const pendingArb = pArb.data as Address | undefined;
  const pendingTre = pTre.data as Address | undefined;
  const aEta = arbEta.data !== undefined ? BigInt(arbEta.data) : undefined;
  const tEta = treEta.data !== undefined ? BigInt(treEta.data) : undefined;
  const dis = ctx.open || busy(ctx.state);

  const note = "Takes effect after a 7-day timelock. Execute once the ETA has passed.";

  return (
    <Panel title="TIMELOCKED CHANGES · 7 DAYS">
      <div className="space-y-8">
        {/* GPU types */}
        <div className="space-y-4">
          <div className="stamp text-[11px] text-ink-2">GPU TYPES</div>
          <div>
            {types.map((t) => (
              <Row key={t.id} label={`#${t.id} ${t.name}`} value={`${t.ncuPerHourBps} bps · ${(Number(t.ncuPerHourBps) / 10_000).toFixed(2)} NCU/h`} />
            ))}
          </div>
          {pendingGpus.map((g) => (
            <div key={g.id} className="flex flex-col gap-3 border border-ink-3 p-3 md:flex-row md:items-center md:justify-between">
              <span className="text-[13px]">
                PENDING #{g.id} {g.name} · {g.bps} bps · <span className="text-ink-2">{etaText(g.eta)}</span>
              </span>
              <Button
                size="sm"
                disabled={!ready(g.eta) || dis}
                onClick={() =>
                  ctx.ask({
                    title: "EXECUTE GPU TYPE",
                    lines: [
                      { label: "ID", value: `#${g.id}` },
                      { label: "NAME", value: g.name },
                      { label: "NCU PER HOUR", value: `${(g.bps / 10_000).toFixed(2)} NCU/h` },
                    ],
                    note: "The rate of a GPU type can never change once added.",
                    action: "EXECUTE",
                    call: { ...hub, functionName: "executeGpuType", args: [g.id] },
                  })
                }
              >
                EXECUTE
              </Button>
            </div>
          ))}
          <div className="grid gap-4 md:grid-cols-[100px_1fr_1fr_auto] md:items-end">
            <Field label="ID">
              <input className={inputCls} inputMode="numeric" value={gid} onChange={(e) => setGid(e.target.value)} placeholder="3" />
            </Field>
            <Field label="NCU/H × 10 000">
              <input className={inputCls} inputMode="numeric" value={gbps} onChange={(e) => setGbps(e.target.value)} placeholder="23000" />
            </Field>
            <Field label="NAME">
              <input className={inputCls} value={gname} onChange={(e) => setGname(e.target.value)} placeholder="H200" />
            </Field>
            <Button
              variant="secondary"
              disabled={gidN === null || gbpsN === null || !gname.trim() || gpuTaken || dis}
              onClick={() =>
                ctx.ask({
                  title: "PROPOSE GPU TYPE",
                  lines: [
                    { label: "ID", value: `#${gidN}` },
                    { label: "NAME", value: gname.trim() },
                    { label: "NCU PER HOUR", value: `${((gbpsN ?? 0) / 10_000).toFixed(2)} NCU/h` },
                    { label: "ETA", value: fmtDate(BigInt(now) + 7n * 86_400n) },
                  ],
                  note,
                  action: "PROPOSE",
                  call: { ...hub, functionName: "proposeGpuType", args: [gidN!, gbpsN!, gname.trim()] },
                })
              }
            >
              PROPOSE
            </Button>
          </div>
          {gpuTaken && <p className="text-[12px] text-danger">GPU type #{gid} already exists.</p>}
        </div>

        {/* Arbiter */}
        <AddressChange
          label="ARBITER"
          current={arbiter.data as Address | undefined}
          pending={pendingArb && pendingArb !== ZERO ? pendingArb : undefined}
          eta={aEta}
          etaText={etaText}
          ready={ready(aEta)}
          value={arb}
          onChange={setArb}
          disabled={dis}
          onPropose={() =>
            ctx.ask({
              title: "PROPOSE ARBITER",
              lines: [
                { label: "NEW ARBITER", value: <AddressLink address={arb} /> },
                { label: "ETA", value: fmtDate(BigInt(now) + 7n * 86_400n) },
              ],
              note,
              action: "PROPOSE",
              call: { ...hub, functionName: "proposeArbiter", args: [arb as Address] },
            })
          }
          onExecute={() =>
            ctx.ask({
              title: "EXECUTE ARBITER",
              lines: [{ label: "NEW ARBITER", value: <AddressLink address={pendingArb ?? ""} /> }],
              action: "EXECUTE",
              call: { ...hub, functionName: "executeArbiter" },
            })
          }
        />

        {/* Treasury */}
        <AddressChange
          label="TREASURY"
          current={treasury.data as Address | undefined}
          pending={pendingTre && pendingTre !== ZERO ? pendingTre : undefined}
          eta={tEta}
          etaText={etaText}
          ready={ready(tEta)}
          value={tre}
          onChange={setTre}
          disabled={dis}
          onPropose={() =>
            ctx.ask({
              title: "PROPOSE TREASURY",
              lines: [
                { label: "NEW TREASURY", value: <AddressLink address={tre} /> },
                { label: "ETA", value: fmtDate(BigInt(now) + 7n * 86_400n) },
              ],
              note,
              action: "PROPOSE",
              call: { ...hub, functionName: "proposeTreasury", args: [tre as Address] },
            })
          }
          onExecute={() =>
            ctx.ask({
              title: "EXECUTE TREASURY",
              lines: [{ label: "NEW TREASURY", value: <AddressLink address={pendingTre ?? ""} /> }],
              action: "EXECUTE",
              call: { ...hub, functionName: "executeTreasury" },
            })
          }
        />
        {ctx.view}
      </div>
    </Panel>
  );
}

function AddressChange(props: {
  label: string;
  current?: Address;
  pending?: Address;
  eta?: bigint;
  etaText: (eta: bigint) => string;
  ready: boolean;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  onPropose: () => void;
  onExecute: () => void;
}) {
  const ok = isAddress(props.value) && props.value !== ZERO;
  return (
    <div className="space-y-4">
      <div className="stamp text-[11px] text-ink-2">{props.label}</div>
      <div>
        <Row label="CURRENT" value={props.current ? <AddressLink address={props.current} /> : "—"} />
        <Row label="PENDING" value={props.pending ? <AddressLink address={props.pending} /> : "None"} />
        {props.pending && props.eta !== undefined && <Row label="ETA" value={props.etaText(props.eta)} />}
      </div>
      {props.pending && (
        <Button size="sm" onClick={props.onExecute} disabled={!props.ready || props.disabled}>
          EXECUTE {props.label}
        </Button>
      )}
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <Field label={`NEW ${props.label} ADDRESS`}>
          <input className={inputCls} value={props.value} onChange={(e) => props.onChange(e.target.value)} placeholder="0x…" />
        </Field>
        <Button variant="secondary" onClick={props.onPropose} disabled={!ok || props.disabled}>
          PROPOSE
        </Button>
      </div>
    </div>
  );
}
