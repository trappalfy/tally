"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import {
  formatUsd,
  formatDuration,
  formatPriceWad,
  seriesLabel,
  disputeBond,
  Status,
  Outcome,
  OUTCOME_LABEL,
  ARBITER_DEADLINE,
} from "@tally/shared";
import { Button, Stamp, Countdown } from "@/components/ui";
import {
  Panel,
  Row,
  Field,
  inputCls,
  textareaCls,
  Loading,
  Notice,
  TxStatus,
  busy,
  AddressLink,
  fmtDate,
  NotDeployed,
} from "./kit";
import { useRedemption, useNow, useTx, useProviders, useGpuTypes, useIsOwnerOrArbiter, type Redemption } from "@/lib/tally/hooks";
import { hub, HUB_READY } from "@/lib/tally/contracts";
import { handoff } from "@/lib/tally/handoff";
import { openSealed, sealTo } from "@/lib/tally/crypto";
import { useHandoffSession } from "@/lib/tally/session";
import { WalletButton } from "@/components/wallet-button";

const STEPS = ["REQUESTED", "STARTED", "RUNNING", "DISPUTE WINDOW", "CLOSED"] as const;

function stageOf(r: Redemption, now: number): number {
  if (r.status === Status.Closed) return 4;
  if (r.status === Status.Requested) return 0;
  if (r.status === Status.Disputed) return 3;
  if (now < Number(r.jobEnd)) return 2;
  return 3;
}

export function RedemptionView({ id }: { id: bigint }) {
  const { address } = useAccount();
  const { data: r, isLoading, refetch } = useRedemption(id);
  const now = useNow(1000);
  const { byAddress } = useProviders();
  const { types } = useGpuTypes();
  const { isArbiter } = useIsOwnerOrArbiter();
  const tx = useTx(() => refetch());

  if (!HUB_READY) return <NotDeployed />;
  if (isLoading) return <Loading />;
  if (!r || r.holder === "0x0000000000000000000000000000000000000000") return <Notice tone="danger">Redemption not found.</Notice>;

  const me = address?.toLowerCase();
  const isHolder = me === r.holder.toLowerCase();
  const isProvider = me === r.provider.toLowerCase();
  const prov = byAddress(r.provider);
  const gpu = types.find((t) => t.id === r.gpuType);
  const stage = stageOf(r, now);
  const startLeft = Number(r.startBy) - now;
  const missed = r.status === Status.Requested && startLeft <= 0;

  return (
    <div className="space-y-6">
      {/* timeline */}
      <ol className="grid grid-cols-5 gap-1">
        {STEPS.map((label, i) => {
          const isMissed = i === 1 && (missed || r.outcome === Outcome.MissedStart);
          const done = i < stage || (i === stage && r.status === Status.Closed);
          const cur = i === stage && r.status !== Status.Closed;
          return (
            <li key={label} className={`border-t-[3px] pt-2 ${isMissed ? "border-danger" : done ? "border-lime" : cur ? "border-ink" : "border-ink-3"}`}>
              <span className={`stamp text-[10px] md:text-[11px] ${isMissed ? "text-danger" : cur || done ? "text-ink" : "text-ink-3"}`}>
                {isMissed ? "MISSED" : label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {/* primary state panel */}
          {r.status === Status.Requested && (
            <Panel title="START WINDOW" tone={missed ? "danger" : "lime"}>
              {!missed ? (
                <>
                  <Countdown seconds={startLeft} size="xl" label="PROVIDER MUST START WITHIN" />
                  <p className="mt-4 text-[14px] text-ink-2">
                    Deadline {fmtDate(r.startBy)}. If the provider does not confirm the start in time, anyone can trigger the payout:
                    {" "}{formatUsd(r.reserve)} to the holder, from the provider&apos;s collateral.
                  </p>
                </>
              ) : (
                <>
                  <Stamp tone="danger" size="lg">
                    START MISSED
                  </Stamp>
                  <p className="mt-3 text-[14px] text-ink-2">
                    The 30-minute window has passed. Anyone can trigger the payout now. No approvals.
                  </p>
                  <div className="mt-5">
                    {address ? (
                      <Button
                        size="lg"
                        className="w-full sm:w-auto"
                        disabled={busy(tx.state)}
                        onClick={() => tx.run({ ...hub, functionName: "claimMissedStart", args: [r.id] })}
                      >
                        CLAIM PAYOUT · {formatUsd(r.reserve)}
                      </Button>
                    ) : (
                      <WalletButton />
                    )}
                  </div>
                </>
              )}
              <div className="mt-4">
                <TxStatus state={tx.state} />
              </div>
            </Panel>
          )}

          {(r.status === Status.Started || r.status === Status.Disputed) && (
            <Panel title={r.status === Status.Disputed ? "IN DISPUTE" : now < Number(r.jobEnd) ? "JOB RUNNING" : "DISPUTE WINDOW"} tone={r.status === Status.Disputed ? "danger" : "lime"}>
              {r.status === Status.Started && now < Number(r.jobEnd) && (
                <Countdown seconds={Number(r.jobEnd) - now} size="lg" label="JOB ENDS IN" dangerBelow={-1} />
              )}
              {r.status === Status.Started && now >= Number(r.jobEnd) && now <= Number(r.disputeUntil) && (
                <Countdown seconds={Number(r.disputeUntil) - now} size="lg" label="DISPUTE WINDOW CLOSES IN" />
              )}
              {r.status === Status.Disputed && (
                <Countdown
                  seconds={Number(r.disputedAt) + Number(ARBITER_DEADLINE) - now}
                  size="lg"
                  label="ARBITER DEADLINE"
                  dangerBelow={-1}
                />
              )}
              <div className="mt-4 space-y-0.5">
                <Row label="STARTED" value={fmtDate(r.startedAt)} />
                <Row label="JOB ENDS" value={fmtDate(r.jobEnd)} />
                <Row label="DISPUTE UNTIL" value={fmtDate(r.disputeUntil)} />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {r.status === Status.Started && isHolder && now <= Number(r.disputeUntil) && (
                  <DisputeButton r={r} tx={tx} />
                )}
                {r.status === Status.Started && now > Number(r.disputeUntil) && address && (
                  <Button variant="secondary" disabled={busy(tx.state)} onClick={() => tx.run({ ...hub, functionName: "releaseReserve", args: [r.id] })}>
                    CLOSE · RELEASE RESERVE
                  </Button>
                )}
                {r.status === Status.Disputed && now > Number(r.disputedAt) + Number(ARBITER_DEADLINE) && address && (
                  <Button disabled={busy(tx.state)} onClick={() => tx.run({ ...hub, functionName: "closeStaleDispute", args: [r.id] })}>
                    CLOSE EXPIRED DISPUTE · PAY HOLDER
                  </Button>
                )}
                {r.status === Status.Disputed && isArbiter && (
                  <Button variant="secondary" href={`/arbiter#r${r.id}`}>
                    RESOLVE IN ARBITER DESK
                  </Button>
                )}
              </div>
              <div className="mt-4">
                <TxStatus state={tx.state} />
              </div>
            </Panel>
          )}

          {r.status === Status.Closed && (
            <Panel title="CLOSED" tone={r.outcome === Outcome.Released ? "lime" : "ink"}>
              <Stamp size="lg" tone={r.outcome === Outcome.MissedStart ? "danger" : "lime"}>
                {OUTCOME_LABEL[r.outcome]}
              </Stamp>
              {r.outcome === Outcome.MissedStart && (
                <p className="mt-3 text-[14px] text-ink-2">{formatUsd(r.reserve)} was paid to the holder from the provider&apos;s collateral.</p>
              )}
            </Panel>
          )}

          {isProvider && r.status === Status.Requested && !missed && <ProviderStart r={r} onDone={refetch} />}
          {isHolder && r.status !== Status.Requested && <AccessDetails r={r} />}
          {(r.status === Status.Started || r.status === Status.Disputed) && (isHolder || isProvider || isArbiter) && <Evidence r={r} canPost={isHolder || isProvider} />}
        </div>

        <div className="lg:col-span-5">
          <Panel title={`REDEMPTION #${r.id}`}>
            <div className="space-y-0.5">
              <Row label="SERIES" value={seriesLabel(r.series)} />
              <Row label="NCU BURNED" value={r.n.toString()} tone="lime" />
              <Row label="CARD" value={gpu?.name ?? `#${r.gpuType}`} />
              <Row label="DURATION" value={formatDuration(r.duration)} />
              <Row label="REF AT REDEEM" value={formatPriceWad(r.refWad)} />
              <Row label="VALUE" value={formatUsd(r.value)} />
              <Row label="RESERVE (+15%)" value={formatUsd(r.reserve)} tone="lime" />
              {r.bond > 0n && <Row label="DISPUTE BOND" value={formatUsd(r.bond)} />}
              <Row label="START BY" value={fmtDate(r.startBy)} />
            </div>
            <div className="mt-4 space-y-2 text-[13px] text-ink-2">
              <div>
                Holder <AddressLink address={r.holder} />
              </div>
              <div>
                Provider <AddressLink address={r.provider} label={prov?.meta.name} />
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function DisputeButton({ r, tx }: { r: Redemption; tx: ReturnType<typeof useTx> }) {
  const [open, setOpen] = useState(false);
  const bond = disputeBond(r.value);
  if (!open)
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        DISPUTE
      </Button>
    );
  return (
    <div className="w-full border border-danger p-4">
      <p className="text-[14px] text-ink-2">
        Open a dispute if the job did not start or was stopped early. Bond: {formatUsd(bond, 6)} USDG (5%), returned if any share is
        awarded to you. Disputes are resolved by the Tally team multisig in v1, within 7 days; after that the full reserve is yours.
      </p>
      <div className="mt-3 flex gap-3">
        <Button variant="danger" disabled={busy(tx.state)} onClick={() => tx.run({ ...hub, functionName: "dispute", args: [r.id] }, bond)}>
          POST BOND AND DISPUTE
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          BACK
        </Button>
      </div>
    </div>
  );
}

function ProviderStart({ r, onDone }: { r: Redemption; onDone: () => void }) {
  const session = useHandoffSession();
  const tx = useTx(onDone);
  const [spec, setSpec] = useState<string | null>(null);
  const [access, setAccess] = useState({ host: "", port: "22", login: "", link: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [work, setWork] = useState<string | null>(null);

  async function readSpec() {
    setErr(null);
    try {
      setWork("SIGNING IN…");
      await session.ensureSignedIn();
      setWork("UNLOCKING KEY…");
      const kp = await session.ensureKey();
      const s = await handoff.getSpec(r.specHash, r.id);
      setSpec(await openSealed(kp, s.ciphertext));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setWork(null);
  }

  async function start() {
    setErr(null);
    let hash: `0x${string}`;
    try {
      setWork("SIGNING IN…");
      await session.ensureSignedIn();
      setWork("CHECKING HOLDER KEY…");
      const pub = await session.verifiedHolderKey(r.holder);
      setWork("ENCRYPTING ACCESS DETAILS…");
      const ct = await sealTo(pub, JSON.stringify({ v: 1, ...access }));
      hash = (await handoff.postAccess(r.id, ct)).hash;
    } catch (e) {
      setWork(null);
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }
    setWork(null);
    await tx.run({ ...hub, functionName: "confirmStart", args: [r.id, hash] });
  }

  let pretty: Record<string, string> | null = null;
  try {
    pretty = spec ? JSON.parse(spec) : null;
  } catch {
    pretty = null;
  }

  return (
    <Panel title="PROVIDER · START THE JOB" tone="lime">
      {!spec ? (
        <Button variant="secondary" onClick={readSpec} disabled={!!work}>
          DECRYPT JOB SPEC
        </Button>
      ) : (
        <div className="space-y-1 border border-ink-3 p-3 font-mono text-[13px] text-ink-2">
          {pretty ? Object.entries(pretty).map(([k, v]) => <div key={k}><span className="text-ink-3">{k}:</span> {String(v)}</div>) : spec}
        </div>
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="HOST">
          <input className={inputCls} value={access.host} onChange={(e) => setAccess({ ...access, host: e.target.value })} />
        </Field>
        <Field label="PORT">
          <input className={inputCls} value={access.port} onChange={(e) => setAccess({ ...access, port: e.target.value })} />
        </Field>
        <Field label="LOGIN">
          <input className={inputCls} value={access.login} onChange={(e) => setAccess({ ...access, login: e.target.value })} />
        </Field>
        <Field label="OR NOTEBOOK LINK">
          <input className={inputCls} value={access.link} onChange={(e) => setAccess({ ...access, link: e.target.value })} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="NOTE TO HOLDER">
          <textarea className={textareaCls} rows={2} value={access.note} onChange={(e) => setAccess({ ...access, note: e.target.value })} />
        </Field>
      </div>
      <p className="mt-3 text-[13px] text-ink-2">
        Access details are encrypted to the holder&apos;s key in this browser. Their hash goes on chain with the start confirmation.
      </p>
      <Button className="mt-4" onClick={start} disabled={!!work || busy(tx.state) || (!access.host && !access.link)}>
        CONFIRM START
      </Button>
      {work && <p className="stamp mt-3 text-[12px] text-ink-2">{work}</p>}
      {err && <div className="mt-3"><Notice tone="danger">{err}</Notice></div>}
      <div className="mt-3">
        <TxStatus state={tx.state} />
      </div>
    </Panel>
  );
}

function AccessDetails({ r }: { r: Redemption }) {
  const session = useHandoffSession();
  const [data, setData] = useState<Record<string, string> | null>(null);
  const [matches, setMatches] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [work, setWork] = useState(false);

  async function load() {
    setErr(null);
    setWork(true);
    try {
      await session.ensureSignedIn();
      const kp = await session.ensurePublishedKey();
      const a = await handoff.getAccess(r.id);
      setMatches(a.matches);
      setData(JSON.parse(await openSealed(kp, a.ciphertext)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setWork(false);
  }

  return (
    <Panel title="ACCESS DETAILS">
      {!data ? (
        <Button variant="secondary" onClick={load} disabled={work}>
          {work ? "DECRYPTING…" : "DECRYPT ACCESS DETAILS"}
        </Button>
      ) : (
        <div className="space-y-1 font-mono text-[14px]">
          {Object.entries(data)
            .filter(([k, v]) => k !== "v" && v)
            .map(([k, v]) => (
              <div key={k} className="break-all">
                <span className="text-ink-3">{k}:</span> <span className="text-ink">{String(v)}</span>
              </div>
            ))}
          <p className={`stamp mt-3 text-[11px] ${matches ? "text-lime" : "text-danger"}`}>
            {matches ? "HASH MATCHES THE ON-CHAIN START PROOF" : "HASH DOES NOT MATCH THE ON-CHAIN START PROOF"}
          </p>
        </div>
      )}
      {err && <div className="mt-3"><Notice tone="danger">{err}</Notice></div>}
    </Panel>
  );
}

function Evidence({ r, canPost }: { r: Redemption; canPost: boolean }) {
  const session = useHandoffSession();
  const [items, setItems] = useState<Awaited<ReturnType<typeof handoff.getEvidence>> | null>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [work, setWork] = useState(false);

  async function load() {
    setErr(null);
    setWork(true);
    try {
      await session.ensureSignedIn();
      setItems(await handoff.getEvidence(r.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setWork(false);
  }

  async function post() {
    setErr(null);
    setWork(true);
    try {
      await session.ensureSignedIn();
      await handoff.postEvidence(r.id, text, image);
      setText("");
      setImage(null);
      setItems(await handoff.getEvidence(r.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setWork(false);
  }

  function onFile(f?: File) {
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) return setErr("Image must be under 3 MB.");
    const rd = new FileReader();
    rd.onload = () => setImage(String(rd.result));
    rd.readAsDataURL(f);
  }

  return (
    <Panel title="EVIDENCE">
      {items === null ? (
        <Button variant="secondary" onClick={load} disabled={work}>
          {work ? "LOADING…" : "SHOW EVIDENCE"}
        </Button>
      ) : (
        <div className="space-y-3">
          {items.length === 0 && <p className="text-[14px] text-ink-2">No evidence yet.</p>}
          {items.map((e) => (
            <div key={e.id} className="border border-ink-3 p-3">
              <div className="stamp text-[11px] text-ink-2">
                {e.role.toUpperCase()} · {e.createdAt.slice(0, 16).replace("T", " ")}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[14px]">{e.text}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {e.image && <img src={e.image} alt="Evidence screenshot" className="mt-2 max-h-80 border border-ink-3" />}
            </div>
          ))}
          {canPost && (
            <div className="space-y-3 border-t border-ink-3 pt-4">
              <textarea className={textareaCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened, with times." />
              <input type="file" accept="image/png,image/jpeg" onChange={(e) => onFile(e.target.files?.[0])} className="text-[13px] text-ink-2" />
              <Button onClick={post} disabled={work || !text.trim()}>
                ADD EVIDENCE
              </Button>
            </div>
          )}
        </div>
      )}
      {err && <div className="mt-3"><Notice tone="danger">{err}</Notice></div>}
    </Panel>
  );
}
