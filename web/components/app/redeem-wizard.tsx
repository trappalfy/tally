"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { parseEventLogs, type Address, type Hex } from "viem";
import {
  quoteRedeem,
  durationSeconds,
  formatUsd,
  formatDuration,
  formatPriceWad,
  seriesLabel,
  maskToIds,
  Phase,
  type RefState,
} from "@tally/shared";
import { Button, Stamp } from "@/components/ui";
import { HealthBar } from "@/components/ui/health-bar";
import {
  Panel,
  Field,
  inputCls,
  textareaCls,
  Empty,
  Loading,
  ConnectGate,
  ConfirmSheet,
  Notice,
  crPercent,
} from "./kit";
import {
  useAllSeries,
  useGpuTypes,
  useHealths,
  useProviders,
  useSeriesBalances,
  useTx,
  type SeriesView,
} from "@/lib/tally/hooks";
import { hub, tallyHubAbi } from "@/lib/tally/contracts";
import { handoff } from "@/lib/tally/handoff";
import { sealTo } from "@/lib/tally/crypto";
import { useHandoffSession } from "@/lib/tally/session";

const refState = (s: SeriesView): RefState => ({
  totalPaid: s.totalPaid,
  totalSold: s.totalSold,
  refWad: s.refWad,
  sellerCount: s.sellerCount,
});

type Spec = { image: string; sshKey: string; region: string; comment: string };

export function RedeemWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { address } = useAccount();
  const { series, isLoading } = useAllSeries();
  const active = series.filter((s) => s.phase === Phase.Open || s.phase === Phase.Closing);
  const balances = useSeriesBalances(address, active);
  const { types } = useGpuTypes();
  const { providers } = useProviders();

  const [sid, setSid] = useState<bigint | undefined>(params.get("series") ? BigInt(params.get("series")!) : undefined);
  const [nStr, setNStr] = useState("");
  const [gpu, setGpu] = useState<number | undefined>();
  const [prov, setProv] = useState<Address | undefined>();
  const [spec, setSpec] = useState<Spec>({ image: "", sshKey: "", region: "", comment: "" });
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [prep, setPrep] = useState<string | null>(null);
  const [prepErr, setPrepErr] = useState<string | null>(null);
  const session = useHandoffSession();
  const tx = useTx();

  const s = active.find((x) => x.id === sid) ?? (active.length === 1 ? active[0] : undefined);
  const bal = s ? balances.get(s.id) : 0n;
  const n = /^\d+$/.test(nStr) ? BigInt(nStr) : 0n;
  const g = types.find((t) => t.id === gpu);

  const pairs = useMemo(() => (s ? providers.map((p) => ({ provider: p.address, series: s.id })) : []), [providers, s]);
  const healths = useHealths(pairs);

  const q = s && g && n > 0n ? quoteRedeem(refState(s), n, g.ncuPerHourBps) : undefined;

  const candidates = providers
    .filter((p) => p.approved && !p.suspended && g !== undefined && maskToIds(p.gpuMask ?? 0n).includes(g.id))
    .map((p) => {
      const h = s ? healths.get(p.address, s.id) : undefined;
      const cap = (p.maxOpenNcu ?? 0n) - (p.openNcu ?? 0n);
      const out = h?.outstanding ?? 0n;
      // how many receipts this provider can take now: outstanding, capacity, free ≥ reserve
      let maxN = out < cap ? out : cap;
      if (s && h && maxN > 0n) {
        const st = refState(s);
        while (maxN > 0n && quoteRedeem(st, maxN, g!.ncuPerHourBps).reserve > h.free) maxN = (maxN * 9n) / 10n;
      }
      return { p, h, maxN: maxN < 0n ? 0n : maxN };
    })
    .sort((a, b) => Number(b.maxN - a.maxN));

  const chosen = candidates.find((c) => c.p.address === prov);
  const canAll = candidates.some((c) => c.maxN >= n);
  const specOk = spec.image.trim() !== "" || spec.sshKey.trim() !== "";
  const formOk = !!s && n > 0n && n <= bal && !!g && !!chosen && chosen.maxN >= n && specOk;

  async function submit() {
    if (!s || !g || !chosen || !address) return;
    setPrepErr(null);
    let specHash: Hex;
    try {
      setPrep("SIGN IN TO THE HANDOFF SERVICE…");
      await session.ensureSignedIn();
      setPrep("UNLOCK YOUR ENCRYPTION KEY…");
      await session.ensurePublishedKey();
      setPrep("ENCRYPTING JOB SPEC TO THE PROVIDER…");
      const ct = await sealTo(chosen.p.pubKey, JSON.stringify({ v: 1, ...spec, holder: address, n: n.toString(), gpu: g.name }));
      specHash = (await handoff.postSpec(chosen.p.address, ct)).hash;
      setPrep(null);
    } catch (e) {
      setPrep(null);
      setPrepErr(e instanceof Error ? e.message : String(e));
      return;
    }
    const rc = await tx.run(
      { ...hub, functionName: "redeem", args: [s.id, n, chosen.p.address, g.id, specHash] },
      q?.fee,
    );
    if (rc) {
      const ev = parseEventLogs({ abi: tallyHubAbi, logs: rc.logs, eventName: "RedemptionRequested" })[0];
      if (ev) {
        const id = ev.args.id;
        handoff.notify(id).catch(() => {});
        router.push(`/redemptions/${id}`);
      }
    }
  }

  if (isLoading) return <Loading />;

  return (
    <ConnectGate what="redeem receipts">
      {active.length === 0 ? (
        <Empty>No series open for redemption</Empty>
      ) : step === "form" ? (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <Panel title="1 · SERIES">
              <div className="flex flex-wrap gap-2">
                {active.map((x) => (
                  <button
                    key={x.id.toString()}
                    onClick={() => setSid(x.id)}
                    className={`stamp border px-3 py-2 text-[13px] ${s?.id === x.id ? "border-lime text-lime" : "border-ink-3 text-ink-2 hover:text-ink"}`}
                  >
                    {seriesLabel(x.id)} · {balances.get(x.id).toString()} HELD
                  </button>
                ))}
              </div>
              {s && (
                <p className="mt-3 text-[13px] text-ink-2">
                  Reference price {formatPriceWad(s.refWad)}. You hold {bal.toString()} receipts.
                </p>
              )}
            </Panel>

            <Panel title="2 · HOW MANY NCU">
              <Field label="RECEIPTS TO BURN" hint={bal === 0n ? "No receipts in this series yet." : `Up to ${bal}.`}>
                <input className={inputCls} inputMode="numeric" value={nStr} onChange={(e) => setNStr(e.target.value.replace(/\D/g, ""))} placeholder="120" />
              </Field>
              {n > bal && <p className="mt-2 text-[13px] text-danger">You hold {bal.toString()}.</p>}
            </Panel>

            <Panel title="3 · GPU TYPE">
              <div className="grid gap-2 sm:grid-cols-3">
                {types.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setGpu(t.id);
                      setProv(undefined);
                    }}
                    className={`border p-3 text-left ${gpu === t.id ? "border-lime" : "border-ink-3 hover:border-ink-2"}`}
                  >
                    <div className="font-serif text-[20px] italic">{t.name}</div>
                    <div className="stamp mt-1 text-[12px] text-lime">
                      {n > 0n ? formatDuration(durationSeconds(n, t.ncuPerHourBps)) : `${(Number(t.ncuPerHourBps) / 10_000).toFixed(1)} NCU/H`}
                    </div>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="4 · PROVIDER">
              {g === undefined ? (
                <p className="text-[14px] text-ink-2">Pick a GPU type first.</p>
              ) : candidates.length === 0 ? (
                <Empty>No provider runs this card</Empty>
              ) : (
                <div className="space-y-2">
                  {n > 0n && !canAll && (
                    <Notice>
                      No single provider can take all {n.toString()} NCU right now. Split it: redeem up to the amount shown at one
                      provider, then run the wizard again for the rest.
                    </Notice>
                  )}
                  {candidates.map(({ p, h, maxN }) => (
                    <button
                      key={p.address}
                      onClick={() => setProv(p.address)}
                      disabled={maxN === 0n}
                      className={`grid w-full grid-cols-12 items-center gap-3 border p-3 text-left disabled:opacity-40 ${
                        prov === p.address ? "border-lime" : "border-ink-3 hover:border-ink-2"
                      }`}
                    >
                      <div className="col-span-12 sm:col-span-5">
                        <div className="font-serif text-[19px]">{p.meta.name || p.address.slice(0, 10)}</div>
                        <div className="stamp text-[11px] text-ink-2">CAN TAKE {maxN.toString()} NCU</div>
                      </div>
                      <div className="col-span-12 sm:col-span-7">
                        <HealthBar value={crPercent(h?.crBps)} compact />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="5 · JOB SPEC · ENCRYPTED TO THE PROVIDER">
              <div className="grid gap-4">
                <Field label="DOCKER IMAGE" hint="Public image the provider pulls, e.g. ghcr.io/you/train:latest">
                  <input className={inputCls} value={spec.image} onChange={(e) => setSpec({ ...spec, image: e.target.value })} />
                </Field>
                <Field label="OR SSH PUBLIC KEY" hint="The provider gives you a shell on the machine.">
                  <textarea className={textareaCls} rows={3} value={spec.sshKey} onChange={(e) => setSpec({ ...spec, sshKey: e.target.value })} placeholder="ssh-ed25519 AAAA…" />
                </Field>
                <Field label="PREFERRED REGION">
                  <input className={inputCls} value={spec.region} onChange={(e) => setSpec({ ...spec, region: e.target.value })} placeholder="EU / US / any" />
                </Field>
                <Field label="COMMENT">
                  <textarea className={textareaCls} rows={2} value={spec.comment} onChange={(e) => setSpec({ ...spec, comment: e.target.value })} />
                </Field>
              </div>
            </Panel>
          </div>

          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <Panel title="RECEIPT" tone={formOk ? "lime" : "ink"}>
                <SummaryLines s={s} n={n} gName={g?.name} q={q} />
                <Button className="mt-5 w-full" disabled={!formOk} onClick={() => setStep("confirm")}>
                  REVIEW REDEMPTION
                </Button>
              </Panel>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-[640px] space-y-4">
          <ConfirmSheet
            title="REDEEM · CONFIRM"
            lines={[
              { label: "SERIES", value: s ? seriesLabel(s.id) : "" },
              { label: "BURN", value: `${n} RECEIPTS`, tone: "lime" },
              { label: "GPU", value: g?.name ?? "" },
              { label: "PROVIDER", value: chosen?.p.meta.name || chosen?.p.address.slice(0, 10) || "" },
              { label: "JOB LENGTH", value: q ? formatDuration(q.duration) : "" },
              { label: "REDEEM FEE (1%)", value: q ? formatUsd(q.fee, 6) + " USDG" : "", tone: "lime" },
              { label: "START BY", value: "30 MIN AFTER CONFIRMATION" },
              { label: "IF START IS MISSED", value: q ? formatUsd(q.reserve) + " TO YOU" : "" },
            ]}
            note="You will sign up to three messages (sign-in and your encryption key, free) and then the transaction. The job spec is encrypted in this browser; only its hash goes on chain."
            action="SIGN AND REDEEM"
            onConfirm={submit}
            onCancel={() => setStep("form")}
            state={prep ? { status: "signing" } : tx.state}
          />
          {prep && (
            <Notice>
              <Stamp size="sm" tone="ink">
                {prep}
              </Stamp>
            </Notice>
          )}
          {prepErr && <Notice tone="danger">{prepErr}</Notice>}
        </div>
      )}
    </ConnectGate>
  );
}

function SummaryLines({
  s,
  n,
  gName,
  q,
}: {
  s?: SeriesView;
  n: bigint;
  gName?: string;
  q?: { value: bigint; fee: bigint; reserve: bigint; duration: bigint };
}) {
  const rows: [string, string][] = [
    ["SERIES", s ? seriesLabel(s.id) : "—"],
    ["BURN", n > 0n ? `${n} NCU` : "—"],
    ["CARD", gName ?? "—"],
    ["RUNS FOR", q ? formatDuration(q.duration) : "—"],
    ["VALUE AT REF", q ? formatUsd(q.value) : "—"],
    ["FEE 1%", q ? formatUsd(q.fee, 6) : "—"],
    ["MISSED START PAYS", q ? formatUsd(q.reserve) : "—"],
  ];
  return (
    <div className="space-y-1">
      {rows.map(([l, v]) => (
        <div key={l} className="stamp flex items-baseline gap-3 py-1 text-[13px]">
          <span className="text-ink-2">{l}</span>
          <span className="min-w-6 flex-1 translate-y-[-3px] border-b border-dotted border-ink-3" />
          <span className="text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}
