"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import {
  quoteBuy,
  listingEscrow,
  refAmount,
  priceBand,
  formatUsd,
  formatPriceWad,
  seriesLabel,
  PHASE_LABEL,
  Phase,
  MINT_CR_BPS,
} from "@tally/shared";
import { Button, Stamp } from "@/components/ui";
import { HealthBar } from "@/components/ui/health-bar";
import { Panel, Row, Field, inputCls, Empty, Loading, Notice, NotDeployed, ConnectGate, ConfirmSheet, crPercent, fmtDate } from "./kit";
import {
  useAllSeries,
  useListings,
  useProviders,
  useHealths,
  useUsdgBalance,
  useTx,
  type Listing,
  type SeriesView,
  type Health,
} from "@/lib/tally/hooks";
import { hub, HUB_READY } from "@/lib/tally/contracts";
import { site } from "@/lib/config";
import { refState, ncuSymbol, money, providerName, parseSeriesId } from "./shared";

export function Market() {
  const params = useSearchParams();
  const { series, isLoading, error } = useAllSeries();
  const { listings, isLoading: lLoading } = useListings();
  const { byAddress } = useProviders();
  const paused = useReadContract({ ...hub, functionName: "salesPaused", query: { enabled: HUB_READY, refetchInterval: 12_000 } });
  const [picked, setPicked] = useState<bigint | undefined>(() => {
    const p = params.get("series");
    return p ? parseSeriesId(p) : undefined;
  });
  const [buying, setBuying] = useState<bigint | undefined>();

  const s =
    series.find((x) => x.id === picked) ?? series.find((x) => x.phase === Phase.Open) ?? series[series.length - 1];

  const rows = useMemo(
    () =>
      s
        ? listings.filter((l) => l.series === s.id && l.remaining > 0n).sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0))
        : [],
    [listings, s],
  );
  const pairs = useMemo(() => {
    const seen = new Set<string>();
    return rows
      .filter((l) => (seen.has(l.provider) ? false : (seen.add(l.provider), true)))
      .map((l) => ({ provider: l.provider, series: l.series }));
  }, [rows]);
  const healths = useHealths(pairs);

  if (!HUB_READY) return <NotDeployed />;
  if (isLoading) return <Loading />;
  if (error) return <Notice tone="danger">Could not read the chain. {error.message}</Notice>;
  if (!s) return <Empty>No series open yet</Empty>;

  const isPaused = paused.data === true;
  const open = s.phase === Phase.Open;
  const band = priceBand(s.riskRefWad);

  return (
    <div className="space-y-6">
      {/* series picker */}
      <div className="flex flex-wrap gap-2">
        {series.map((x) => (
          <button
            key={x.id.toString()}
            onClick={() => {
              setPicked(x.id);
              setBuying(undefined);
            }}
            className={`stamp border px-3 py-2 text-[13px] ${s.id === x.id ? "border-lime text-lime" : "border-ink-3 text-ink-2 hover:text-ink"}`}
          >
            {seriesLabel(x.id)} · {PHASE_LABEL[x.phase]}
          </button>
        ))}
      </div>

      {isPaused && (
        <Notice tone="danger">
          <span className="stamp text-[12px]">SALES PAUSED.</span> New listings and purchases are stopped. Redemptions, collateral and
          settlement work as usual.
        </Notice>
      )}
      {!open && (
        <Notice>
          <span className="stamp text-[12px]">SERIES {PHASE_LABEL[s.phase]}.</span>{" "}
          {s.phase === Phase.Pending
            ? `Sales open ${fmtDate(s.openAt)}.`
            : "Primary sales are closed for this series. Receipts already issued can still be sent, redeemed or settled."}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Panel title={`LISTINGS · ${seriesLabel(s.id)}`} aside={<Stamp tone="muted">{rows.length} OPEN</Stamp>}>
            {lLoading ? (
              <Loading />
            ) : rows.length === 0 ? (
              <Empty>No receipts listed yet</Empty>
            ) : (
              <div className="divide-y divide-ink-3 border-y border-ink-3">
                {rows.map((l) => {
                  const p = byAddress(l.provider);
                  const h = healths.get(l.provider, l.series);
                  const outOfBand = !!band && (l.price < band.min || l.price > band.max);
                  const blocked = !p?.approved || !!p?.suspended || !!h?.flagged || outOfBand;
                  return (
                    <div key={l.id.toString()} className="py-4">
                      <div className="grid grid-cols-2 items-center gap-x-4 gap-y-3 md:grid-cols-12">
                        <div className="col-span-2 min-w-0 md:col-span-4">
                          <Link href={`/providers/${l.provider}`} className="block truncate font-serif text-[22px] leading-tight hover:text-lime">
                            {providerName(p, l.provider)}
                          </Link>
                          <span className="stamp text-[10px] text-ink-3">LISTING #{l.id.toString()}</span>
                        </div>
                        <div className="md:col-span-2">
                          <div className="stamp text-[10px] text-ink-2">PRICE</div>
                          <div className="stamp text-[17px] text-ink">{formatUsd(l.price)}</div>
                        </div>
                        <div className="text-right md:col-span-2 md:text-left">
                          <div className="stamp text-[10px] text-ink-2">AVAILABLE</div>
                          <div className="stamp text-[17px] text-ink">{l.remaining.toString()} NCU</div>
                        </div>
                        <div className="md:col-span-2">
                          <HealthBar value={crPercent(h?.crBps)} compact />
                          <div className={`stamp mt-1 text-[10px] ${h?.flagged ? "text-danger" : "text-ink-2"}`}>
                            {h?.flagged ? "FLAGGED" : crLabel(h)}
                          </div>
                        </div>
                        <div className="text-right md:col-span-2">
                          <Button
                            size="sm"
                            variant={buying === l.id ? "ghost" : "primary"}
                            disabled={!open || isPaused || blocked}
                            onClick={() => setBuying(buying === l.id ? undefined : l.id)}
                          >
                            {buying === l.id ? "CLOSE" : "BUY"}
                          </Button>
                        </div>
                      </div>
                      {(outOfBand || p?.suspended) && (
                        <p className="stamp mt-2 text-[11px] text-ink-2">
                          {p?.suspended ? "PROVIDER SUSPENDED" : "PRICE OUTSIDE ±20% OF RISK PRICE"}
                        </p>
                      )}
                      {buying === l.id && (
                        <div className="mt-4">
                          <BuyBox l={l} s={s} name={providerName(p, l.provider)} onDone={() => setBuying(undefined)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <Panel title="SERIES" aside={<Stamp tone={open ? "lime" : "muted"}>{PHASE_LABEL[s.phase]}</Stamp>}>
            <Row label="RECEIPT" value={ncuSymbol(s)} tone="lime" />
            <Row label="REF PRICE" value={s.totalSold > 0n ? formatPriceWad(s.refWad) : "—"} />
            <Row label="RISK PRICE" value={s.riskRefWad > 0n ? formatPriceWad(s.riskRefWad) : "—"} />
            {band && <Row label="LISTING BAND" value={`${formatUsd(band.min)}–${formatUsd(band.max)}`} />}
            <Row label="ISSUED" value={`${s.totalSold} NCU`} />
            <Row label="LISTINGS CLOSE" value={fmtDate(s.listingsCloseAt)} />
            <Row label="QUARTER ENDS" value={fmtDate(s.endAt)} />
            <div className="mt-4">
              <Button href={`/series/${s.id}`} variant="ghost" size="sm">
                SERIES DETAIL
              </Button>
            </div>
          </Panel>
          {site.dexPoolUrl && (
            <Panel title="SECONDARY">
              <p className="text-[14px] text-ink-2">Receipts are plain tokens. Trade them in the pool. Tally takes no fee there.</p>
              <div className="mt-4">
                <Button href={site.dexPoolUrl} external variant="secondary" size="sm">
                  OPEN POOL
                </Button>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function crLabel(h?: Health) {
  const v = crPercent(h?.crBps);
  return v === null ? "NO RECEIPTS OUT" : `CR ${v.toFixed(0)}%`;
}

function BuyBox({ l, s, name, onDone }: { l: Listing; s: SeriesView; name: string; onDone: () => void }) {
  const { address } = useAccount();
  const usdg = useUsdgBalance(address);
  const [nStr, setNStr] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const tx = useTx();
  const n = /^\d+$/.test(nStr) ? BigInt(nStr) : 0n;
  const q = quoteBuy(n, l.price);
  const atRef = s.totalSold > 0n ? refAmount(refState(s), n, MINT_CR_BPS, true) : 0n;
  const esc = listingEscrow(n, l.price);
  const locked = atRef > esc ? atRef : esc;
  const bal = usdg.data ?? 0n;
  const tooMuch = n > l.remaining;
  const short = !!address && n > 0n && q.cost > bal;
  const ok = n > 0n && !tooMuch && !short;

  const confirm = (
      <ConfirmSheet
        title="BUY · CONFIRM"
        lines={[
          { label: "SERIES", value: seriesLabel(s.id) },
          { label: "PROVIDER", value: name },
          { label: "PRICE", value: `${formatUsd(l.price)} / NCU` },
          { label: "YOU PAY", value: `${money(q.cost)} USDG`, tone: "lime" },
          { label: "FEE 1% TO TREASURY", value: `${money(q.fee)} USDG` },
          { label: "TO PROVIDER", value: `${money(q.toProvider)} USDG` },
          { label: "YOU RECEIVE", value: `${n} ${ncuSymbol(s)}`, tone: "lime" },
          { label: "PROVIDER LOCKS (130%)", value: `${money(locked)} USDG` },
        ]}
        note="The 1% fee comes out of the price, not on top. USDG approval is for this exact amount. Receipts are minted to your wallet in the same transaction."
        action={`PAY ${formatUsd(q.cost)}`}
        onConfirm={async () => {
          const rc = await tx.run({ ...hub, functionName: "buy", args: [l.id, n] }, q.cost);
          if (rc) setTimeout(onDone, 2500);
        }}
        onCancel={() => {
          tx.reset();
          setStep("form");
        }}
        state={tx.state}
      />
  );

  return (
    <ConnectGate what="buy receipts">
      {step === "form" ? (
          <div className="border border-ink-3 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="RECEIPTS" hint={`Up to ${l.remaining} NCU. Wallet ${formatUsd(bal)} USDG.`}>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={nStr}
                  onChange={(e) => setNStr(e.target.value.replace(/\D/g, ""))}
                  placeholder="100"
                  autoFocus
                />
              </Field>
              <div className="space-y-0.5 self-end">
                <Row label="YOU PAY" value={`${formatUsd(q.cost)} USDG`} tone="lime" />
                <Row label="YOU GET" value={`${n} ${ncuSymbol(s)}`} />
              </div>
            </div>
            {tooMuch && <p className="mt-2 text-[13px] text-danger">Only {l.remaining.toString()} NCU left in this listing.</p>}
            {short && <p className="mt-2 text-[13px] text-danger">Not enough USDG in this wallet.</p>}
            <Button className="mt-4 w-full sm:w-auto" disabled={!ok} onClick={() => setStep("confirm")}>
              REVIEW PURCHASE
            </Button>
          </div>
      ) : (
        confirm
      )}
    </ConnectGate>
  );
}
