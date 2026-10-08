"use client";

import { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { isAddress, type Address, type Hex } from "viem";
import {
  formatUsd,
  formatPriceWad,
  formatBps,
  formatDuration,
  formatCountdown,
  parseUsd,
  listingEscrow,
  quoteBuy,
  priceBand,
  crBps,
  topUpTo130,
  topUpLinePrice,
  idsToMask,
  maskToIds,
  seriesLabel,
  PHASE_LABEL,
  Phase,
  Status,
  MIN_CAPACITY,
  FLAG_GRACE,
  ARBITER_DEADLINE,
} from "@tally/shared";
import { Button, Stamp, Countdown, HealthBar } from "@/components/ui";
import { Panel, Row, Field, inputCls, Empty, Loading, Notice, ConnectGate, AddressLink, fmtDate, crPercent, busy } from "./kit";
import { useConfirmTx } from "./confirm-tx";
import {
  useAllSeries,
  useListings,
  useRedemptions,
  useProviders,
  useHealths,
  useGpuTypes,
  useNow,
  useUsdgBalance,
  type ProviderInfo,
  type SeriesView,
  type Health,
  type Redemption,
} from "@/lib/tally/hooks";
import { hub } from "@/lib/tally/contracts";
import { handoff } from "@/lib/tally/handoff";
import { useHandoffSession } from "@/lib/tally/session";

const ZERO32 = ("0x" + "0".repeat(64)) as Hex;

const tryUsd = (s: string): bigint | null => {
  try {
    return parseUsd(s);
  } catch {
    return null;
  }
};
const tryInt = (s: string): bigint | null => (/^\d+$/.test(s.trim()) ? BigInt(s.trim()) : null);
/** USDG units → "12.5" (input-friendly). */
const plainUsd = (u: bigint) => formatUsd(u, 6).replace(/[$,]/g, "").replace(/\.?0+$/, "");
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

function statusOf(p?: ProviderInfo): { label: string; tone: "lime" | "muted" | "danger" | "ink" } {
  if (!p?.applied) return { label: "NOT APPLIED", tone: "muted" };
  if (p.suspended) return { label: "SUSPENDED", tone: "danger" };
  if (p.approved) return { label: "APPROVED", tone: "lime" };
  return { label: "APPLIED · AWAITING APPROVAL", tone: "ink" };
}

export function ProviderDesk() {
  const { isConnected } = useAccount();
  return (
    <div className="space-y-8">
      {!isConnected && <ProviderIntro />}
      <ConnectGate what="apply as a provider">
        <Desk />
      </ConnectGate>
    </div>
  );
}

const INTRO_STEPS = [
  ["APPLY", "Name, site, payout address, GPU types, benchmark result. One transaction."],
  ["GET APPROVED", "Tally checks the benchmark. 1 NCU is one hour on the reference A100 80GB."],
  ["LOCK 130% AND LIST", "Set your cards, capacity and encryption key. List receipts against USDG collateral."],
  ["START WITHIN 30 MIN", "Each redemption has a 30-minute start window. Miss it and the holder is paid value + 15% from your collateral."],
] as const;

function ProviderIntro() {
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <Panel title="HOW IT WORKS FOR PROVIDERS">
          <ol className="space-y-5">
            {INTRO_STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <Stamp size="md">{String(i + 1).padStart(2, "0")}</Stamp>
                <div>
                  <Stamp size="sm" tone="ink">
                    {t}
                  </Stamp>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
      <div className="lg:col-span-5">
        <Panel title="EXAMPLE" tone="lime">
          <p className="font-serif text-[22px] italic leading-snug">Idle GPUs earn nothing. Sell next month&apos;s hours this month.</p>
          <div className="mt-4 space-y-0.5">
            <Row label="8 IDLE A100s × 24 H × 30 DAYS" value="5,760 NCU" tone="lime" />
            <Row label="AT $1.40" value="$8,064 OF RECEIPTS" />
            <Row label="COLLATERAL 130%" value="$10,483 USDG" />
            <Row label="MINT FEE" value="1%" />
          </div>
          <p className="mt-4 text-[13px] text-ink-2">You need a wallet on Robinhood Chain, ETH for gas and USDG for collateral.</p>
        </Panel>
      </div>
    </div>
  );
}

function Desk() {
  const { address } = useAccount();
  const me = address as Address;
  const { byAddress, isLoading, refetch } = useProviders();
  const p = byAddress(me);
  const { series } = useAllSeries();
  const positions = useReadContracts({
    contracts: series.map((s) => ({ ...hub, functionName: "getPosition", args: [me, s.id] }) as const),
    query: { enabled: series.length > 0, refetchInterval: 12_000 },
  });
  const mySeries = series.filter((_, i) => {
    const r = positions.data?.[i];
    return r?.status === "success" && (r.result as { registered: boolean }).registered;
  });
  const healths = useHealths(mySeries.map((s) => ({ provider: me, series: s.id })));

  // Capacity rule: max over active series of min(outstanding, MIN_CAPACITY).
  let required = 0n;
  for (const s of mySeries) {
    if (s.phase !== Phase.Open && s.phase !== Phase.Closing) continue;
    const out = healths.get(me, s.id)?.outstanding ?? 0n;
    const need = out < MIN_CAPACITY ? out : MIN_CAPACITY;
    if (need > required) required = need;
  }

  if (isLoading) return <Loading />;
  const st = statusOf(p);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Stamp tone={st.tone} boxed>
          {st.label}
        </Stamp>
        <AddressLink address={me} />
      </div>

      <ApplicationPanel p={p} me={me} onDone={refetch} />

      {p?.applied && (
        <>
          <QueuePanel me={me} />
          <ConfigPanel p={p} required={required} onDone={refetch} />
          <ListingsPanel me={me} p={p} />
          <Panel title="COLLATERAL">
            {mySeries.length === 0 ? (
              <Empty>NO COLLATERAL YET. LIST RECEIPTS TO START.</Empty>
            ) : (
              <div className="space-y-6">
                {mySeries.map((s) => {
                  const h = healths.get(me, s.id);
                  return h ? <CollateralCard key={String(s.id)} s={s} h={h} /> : <Loading key={String(s.id)} />;
                })}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// a. Application
// ---------------------------------------------------------------------------

type AppForm = { name: string; site: string; payout: string; gpus: string; benchmark: string; region: string; webhook: string; email: string };

function ApplicationPanel({ p, me, onDone }: { p?: ProviderInfo; me: Address; onDone: () => void }) {
  const session = useHandoffSession();
  const ctx = useConfirmTx(onDone);
  const [edit, setEdit] = useState<Partial<AppForm>>({});
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<{ tone: "lime" | "danger"; text: string } | null>(null);
  const [work, setWork] = useState(false);

  const m = p?.meta ?? {};
  const base: AppForm = {
    name: m.name ?? "",
    site: m.site ?? "",
    payout: p?.payout && p.payout !== "0x0000000000000000000000000000000000000000" ? p.payout : me,
    gpus: m.gpus ?? "",
    benchmark: m.benchmark ?? "",
    region: m.region ?? "",
    webhook: "",
    email: "",
  };
  const f: AppForm = { ...base, ...edit };
  const set = (k: keyof AppForm) => (e: { target: { value: string } }) => setEdit((x) => ({ ...x, [k]: e.target.value }));

  const payoutOk = isAddress(f.payout);
  const emailOk = !f.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email);
  const webhookOk = !f.webhook || /^https:\/\//.test(f.webhook);
  const ready = f.name.trim() && payoutOk && emailOk && webhookOk;

  async function saveContact() {
    if (!f.webhook && !f.email) return;
    setContact(null);
    try {
      await session.ensureSignedIn();
      await handoff.setContact(f.webhook.trim(), f.email.trim());
      setContact({ tone: "lime", text: "Contact saved. New jobs are sent to your webhook and e-mail." });
    } catch (e) {
      setContact({ tone: "danger", text: `Contact not saved: ${errText(e)}` });
    }
  }

  async function loadContact() {
    setWork(true);
    setContact(null);
    try {
      await session.ensureSignedIn();
      const c = await handoff.getContact();
      setEdit((x) => ({ ...x, webhook: c.webhook ?? "", email: c.email ?? "" }));
    } catch (e) {
      setContact({ tone: "danger", text: errText(e) });
    }
    setWork(false);
  }

  function submit() {
    const meta = {
      name: f.name.trim(),
      site: f.site.trim(),
      benchmark: f.benchmark.trim(),
      region: f.region.trim(),
      gpus: f.gpus.trim(),
    };
    ctx.ask({
      title: p?.applied ? "UPDATE APPLICATION" : "APPLY AS PROVIDER",
      lines: [
        { label: "NAME", value: meta.name },
        { label: "SITE", value: meta.site || "—" },
        { label: "PAYOUT ADDRESS", value: short(f.payout) },
        { label: "GPU TYPES", value: meta.gpus || "—" },
        { label: "REGION", value: meta.region || "—" },
        { label: "BENCHMARK", value: meta.benchmark ? short(meta.benchmark) : "—" },
        { label: "USDG", value: "$0.00 · gas only", tone: "lime" },
      ],
      note: "Name, site, GPU types, region and benchmark go on chain and are public. Webhook and e-mail go to the handoff service only, after a sign-in signature.",
      action: p?.applied ? "UPDATE" : "APPLY",
      call: { ...hub, functionName: "applyProvider", args: [f.payout as Address, JSON.stringify(meta)] },
      after: async () => {
        setEditing(false);
        await saveContact();
      },
    });
  }

  const showForm = !p?.applied || editing;
  const st = statusOf(p);

  return (
    <Panel title="APPLICATION" aside={<Stamp tone={st.tone} size="xs">{st.label}</Stamp>}>
      {!showForm && p ? (
        <div className="space-y-4">
          <div>
            <Row label="NAME" value={m.name || "—"} />
            <Row label="SITE" value={m.site || "—"} />
            <Row label="PAYOUT" value={<AddressLink address={p.payout} />} />
            <Row label="GPU TYPES" value={m.gpus || "—"} />
            <Row label="REGION" value={m.region || "—"} />
            <Row label="BENCHMARK" value={m.benchmark ? short(m.benchmark) : "—"} />
          </div>
          {!p.approved && <Notice>Applied. The Tally team reviews the benchmark and approves providers by hand.</Notice>}
          {p.suspended && (
            <Notice tone="danger">Suspended. No new listings, sales or redemptions. Collateral, open jobs and disputes run as usual.</Notice>
          )}
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            UPDATE APPLICATION
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="NAME">
              <input className={inputCls} value={f.name} onChange={set("name")} placeholder="Northwind Compute" />
            </Field>
            <Field label="WEBSITE">
              <input className={inputCls} value={f.site} onChange={set("site")} placeholder="https://" />
            </Field>
            <Field label="PAYOUT ADDRESS" hint={!payoutOk ? <span className="text-danger">Not an address.</span> : "Sale proceeds go here."}>
              <input className={inputCls} value={f.payout} onChange={set("payout")} />
            </Field>
            <Field label="GPU TYPES OFFERED">
              <input className={inputCls} value={f.gpus} onChange={set("gpus")} placeholder="8× H100, 16× RTX 4090" />
            </Field>
            <Field label="BENCHMARK RESULT" hint="Score or a link to the full run.">
              <input className={inputCls} value={f.benchmark} onChange={set("benchmark")} placeholder="https://" />
            </Field>
            <Field label="REGION">
              <input className={inputCls} value={f.region} onChange={set("region")} placeholder="EU-West" />
            </Field>
            <Field label="WEBHOOK URL" hint={!webhookOk ? <span className="text-danger">Use https://</span> : "New jobs are posted here. Off chain."}>
              <input className={inputCls} value={f.webhook} onChange={set("webhook")} placeholder="https://" />
            </Field>
            <Field label="E-MAIL" hint={!emailOk ? <span className="text-danger">Not an e-mail.</span> : "Backup alert. Off chain."}>
              <input className={inputCls} value={f.email} onChange={set("email")} placeholder="ops@example.com" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={submit} disabled={!ready || ctx.open || busy(ctx.state)}>
              {p?.applied ? "REVIEW UPDATE" : "REVIEW APPLICATION"}
            </Button>
            {p?.applied && (
              <>
                <Button variant="secondary" onClick={saveContact} disabled={(!f.webhook && !f.email) || !emailOk || !webhookOk}>
                  SAVE CONTACT ONLY
                </Button>
                <Button variant="ghost" onClick={loadContact} disabled={work}>
                  {work ? "LOADING…" : "LOAD SAVED CONTACT"}
                </Button>
                <Button variant="ghost" onClick={() => (setEditing(false), setEdit({}))}>
                  CLOSE
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {ctx.view && <div className="mt-5">{ctx.view}</div>}
      {contact && (
        <div className="mt-4">
          <Notice tone={contact.tone}>{contact.text}</Notice>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// b. Config
// ---------------------------------------------------------------------------

function ConfigPanel({ p, required, onDone }: { p: ProviderInfo; required: bigint; onDone: () => void }) {
  const { types } = useGpuTypes();
  const session = useHandoffSession();
  const ctx = useConfirmTx(onDone);
  const [ids, setIds] = useState<number[] | null>(null);
  const [maxOpen, setMaxOpen] = useState<string | null>(null);
  const [pub, setPub] = useState<Hex | null>(null);
  const [derived, setDerived] = useState<Hex | null>(null);
  const [keyErr, setKeyErr] = useState<string | null>(null);
  const [keyWork, setKeyWork] = useState(false);

  const onchainKey = (p.pubKey ?? ZERO32) as Hex;
  const hasKey = onchainKey.toLowerCase() !== ZERO32;
  const idsVal = ids ?? maskToIds(p.gpuMask ?? 0n);
  const maxVal = maxOpen ?? (p.maxOpenNcu ? String(p.maxOpenNcu) : "");
  const pubVal = pub ?? (hasKey ? onchainKey : ("" as Hex));
  const maxN = tryInt(maxVal);
  const pubOk = /^0x[0-9a-fA-F]{64}$/.test(pubVal) && pubVal.toLowerCase() !== ZERO32;
  const capErr =
    required > 0n && idsVal.length === 0
      ? "Keep at least one GPU type while receipts are out."
      : maxN !== null && maxN < required
        ? `Capacity must stay at ${required} NCU or more while receipts are out.`
        : null;
  const ready = maxN !== null && pubOk && !capErr;
  const mismatch = derived && hasKey && derived.toLowerCase() !== onchainKey.toLowerCase();

  async function generate() {
    setKeyErr(null);
    setKeyWork(true);
    try {
      const kp = await session.ensureKey();
      setPub(kp.publicHex);
      setDerived(kp.publicHex);
    } catch (e) {
      setKeyErr(errText(e));
    }
    setKeyWork(false);
  }

  const toggle = (id: number) => setIds(idsVal.includes(id) ? idsVal.filter((x) => x !== id) : [...idsVal, id].sort((a, b) => a - b));
  const names = idsVal.map((id) => types.find((t) => t.id === id)?.name ?? `GPU ${id}`);

  function submit() {
    ctx.ask({
      title: "SAVE CONFIG",
      lines: [
        { label: "GPU TYPES", value: names.join(", ") || "None" },
        { label: "CAPACITY", value: `${maxN} NCU open at once` },
        { label: "ENCRYPTION KEY", value: short(pubVal) },
        { label: "USDG", value: "$0.00 · gas only", tone: "lime" },
      ],
      note: "Holders pick from these GPU types and encrypt job specs to this key.",
      action: "SAVE CONFIG",
      call: { ...hub, functionName: "setProviderConfig", args: [idsToMask(idsVal), maxN!, pubVal as Hex] },
    });
  }

  return (
    <Panel title="CONFIG">
      <div className="space-y-6">
        <Field label="GPU TYPES">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {types.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 text-[14px]">
                <input type="checkbox" className="h-4 w-4 accent-lime" checked={idsVal.includes(t.id)} onChange={() => toggle(t.id)} />
                <span>{t.name}</span>
                <span className="stamp text-[11px] text-ink-2">{(Number(t.ncuPerHourBps) / 10_000).toFixed(2)} NCU/h</span>
              </label>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="CAPACITY, NCU" hint={`NCU you hold in open redemptions at once. Now in use: ${p.openNcu ?? 0n} NCU.`}>
            <input className={inputCls} inputMode="numeric" value={maxVal} onChange={(e) => setMaxOpen(e.target.value)} placeholder="500" />
          </Field>
          <div className="text-[13px] leading-relaxed text-ink-2 md:pt-6">
            Capacity rule: while your receipts are out in an Open or Closing series, keep at least one GPU type and capacity of at least
            min(outstanding, {String(MIN_CAPACITY)} NCU).{" "}
            <span className="text-ink">Now: {String(required)} NCU minimum.</span>
          </div>
        </div>

        <Field label="ENCRYPTION KEY" hint="Derived from a wallet signature. Same wallet, same key. No transaction.">
          <div className="space-y-3">
            <div className="break-all border border-ink-3 px-3 py-2.5 font-mono text-[13px] text-ink">{pubVal || "No key yet."}</div>
            <Button variant="secondary" size="sm" onClick={generate} disabled={keyWork}>
              {keyWork ? "SIGN IN WALLET…" : "GENERATE KEY FROM WALLET"}
            </Button>
          </div>
        </Field>
        {!hasKey && <Notice tone="lime">No key on chain yet. Holders cannot send you job specs until you save one.</Notice>}
        {mismatch && (
          <Notice tone="danger">
            The key on chain does not match this wallet&apos;s key. Specs sealed to the on-chain key cannot be opened here. Save to replace it.
          </Notice>
        )}
        {derived && !mismatch && hasKey && <Notice tone="lime">Key on chain matches this wallet.</Notice>}
        {keyErr && <Notice tone="danger">{keyErr}</Notice>}
        {capErr && <Notice tone="danger">{capErr}</Notice>}

        <Button onClick={submit} disabled={!ready || ctx.open || busy(ctx.state)}>
          REVIEW CONFIG
        </Button>
        {ctx.view}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// c. Listings
// ---------------------------------------------------------------------------

function ListingsPanel({ me, p }: { me: Address; p: ProviderInfo }) {
  const { series } = useAllSeries();
  const { listings, refetch } = useListings();
  const usdg = useUsdgBalance(me);
  const ctx = useConfirmTx(refetch);
  const cancelCtx = useConfirmTx(refetch);
  const [sid, setSid] = useState<string>("");
  const [n, setN] = useState("");
  const [price, setPrice] = useState("");

  const open = series.filter((s) => s.phase === Phase.Open);
  const s = open.find((x) => String(x.id) === sid) ?? open[0];
  const N = tryInt(n);
  const P = tryUsd(price);
  const escrow = N && P ? listingEscrow(N, P) : null;
  const band = s ? priceBand(s.riskRefWad) : null;
  const outOfBand = !!(band && P && (P < band.min || P > band.max));
  const bal = (usdg.data as bigint | undefined) ?? 0n;
  const short_ = escrow !== null && escrow > bal;
  const configured = (p.gpuMask ?? 0n) > 0n && (p.pubKey ?? ZERO32).toLowerCase() !== ZERO32;
  const canList = p.approved && !p.suspended && configured;
  const ready = canList && s && N && N > 0n && P && P > 0n && !outOfBand && !short_;

  const mine = listings.filter((l) => l.provider.toLowerCase() === me.toLowerCase() && (l.remaining > 0n || l.escrow > 0n));

  function submit() {
    if (!s || !N || !P || escrow === null) return;
    const q = quoteBuy(N, P);
    ctx.ask({
      title: `LIST · ${seriesLabel(s.id)}`,
      lines: [
        { label: "SERIES", value: seriesLabel(s.id) },
        { label: "RECEIPTS", value: `${N} receipts` },
        { label: "PRICE", value: `${formatUsd(P)} per receipt` },
        { label: "IF ALL SELL, GROSS", value: formatUsd(q.cost) },
        { label: "FEE, 1% PER SALE", value: formatUsd(q.fee) },
        { label: "IF ALL SELL, TO PAYOUT ADDRESS", value: formatUsd(q.toProvider) },
        { label: "ESCROW LEAVES WALLET, 130%", value: formatUsd(escrow), tone: "lime" },
      ],
      note: "Escrow backs nothing until receipts sell. At each sale it moves into collateral; if the reference price is above your price, the difference comes from free collateral. Cancel any time: unsold escrow moves to free collateral in this series.",
      action: "LIST RECEIPTS",
      call: { ...hub, functionName: "list", args: [s.id, N, P] },
      usdg: escrow,
      after: () => {
        setN("");
        setPrice("");
      },
    });
  }

  function cancel(l: (typeof mine)[number]) {
    cancelCtx.ask({
      title: `CANCEL LISTING #${l.id}`,
      lines: [
        { label: "SERIES", value: seriesLabel(l.series) },
        { label: "UNSOLD", value: `${l.remaining} receipts` },
        { label: "ESCROW TO FREE COLLATERAL", value: formatUsd(l.escrow), tone: "lime" },
      ],
      note: "Escrow stays in the hub as free collateral in this series. Withdraw it under Collateral.",
      action: "CANCEL LISTING",
      danger: true,
      call: { ...hub, functionName: "cancelListing", args: [l.id] },
    });
  }

  return (
    <Panel title="LISTINGS">
      <div className="space-y-6">
        {!p.approved && <Notice>Listing opens after approval.</Notice>}
        {p.suspended && <Notice tone="danger">Suspended. New listings are blocked.</Notice>}
        {p.approved && !configured && <Notice tone="lime">Save GPU types and an encryption key in Config first.</Notice>}
        {open.length === 0 ? (
          <Empty>NO SERIES OPEN FOR LISTING</Empty>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="SERIES">
                <select className={inputCls} value={s ? String(s.id) : ""} onChange={(e) => setSid(e.target.value)}>
                  {open.map((x) => (
                    <option key={String(x.id)} value={String(x.id)}>
                      {seriesLabel(x.id)} · {PHASE_LABEL[x.phase]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="RECEIPTS, N">
                <input className={inputCls} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} placeholder="1000" />
              </Field>
              <Field label="PRICE PER RECEIPT, USDG">
                <input className={inputCls} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1.40" />
              </Field>
            </div>
            <div>
              <Row
                label="PRICE BAND"
                value={band ? `${formatUsd(band.min)} – ${formatUsd(band.max)} per receipt` : "Free · first sale sets the price"}
              />
              {s && s.riskRefWad > 0n && <Row label="RISK PRICE" value={`${formatPriceWad(s.riskRefWad)} per receipt`} />}
              <Row label="ESCROW, 130%" value={escrow !== null ? formatUsd(escrow) : "—"} tone="lime" />
              <Row label="WALLET" value={`${formatUsd(bal)} USDG`} />
            </div>
            {outOfBand && <Notice tone="danger">Price is outside ±20% of the risk price.</Notice>}
            {short_ && <Notice tone="danger">Not enough USDG in the wallet for the escrow.</Notice>}
            <Button onClick={submit} disabled={!ready || ctx.open || busy(ctx.state)}>
              REVIEW LISTING
            </Button>
            {ctx.view}
          </div>
        )}

        <div>
          <div className="stamp mb-3 text-[11px] text-ink-2">YOUR LISTINGS</div>
          {mine.length === 0 ? (
            <Empty>NO LISTINGS YET</Empty>
          ) : (
            <div className="divide-y divide-ink-3 border-y border-ink-3">
              {mine.map((l) => (
                <div key={String(l.id)} className="grid grid-cols-2 items-center gap-x-4 gap-y-2 py-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <span className="stamp text-[12px]">
                    #{String(l.id)} · {seriesLabel(l.series)}
                  </span>
                  <span className="font-mono text-[13px]">{String(l.remaining)} left</span>
                  <span className="font-mono text-[13px]">{formatUsd(l.price)} / receipt</span>
                  <span className="font-mono text-[13px] text-ink-2">{formatUsd(l.escrow)} escrow</span>
                  <Button variant="ghost" size="sm" onClick={() => cancel(l)} disabled={cancelCtx.open || busy(cancelCtx.state)}>
                    CANCEL
                  </Button>
                </div>
              ))}
            </div>
          )}
          {cancelCtx.view && <div className="mt-4">{cancelCtx.view}</div>}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// d. Collateral
// ---------------------------------------------------------------------------

function CollateralCard({ s, h }: { s: SeriesView; h: Health }) {
  const now = useNow(1000);
  const topCtx = useConfirmTx();
  const wdCtx = useConfirmTx();
  const [top, setTop] = useState<string | null>(null);
  const [wd, setWd] = useState("");

  const r = s.riskRefWad;
  const to130 = topUpTo130(h.free, h.outstanding, r);
  const line = topUpLinePrice(h.free, h.outstanding);
  const topVal = top ?? (to130 > 0n ? plainUsd(to130) : "");
  const T = tryUsd(topVal);
  const W = tryUsd(wd);
  const canTop = s.phase === Phase.Open || s.phase === Phase.Closing || s.phase === Phase.Ended;
  const canWd = s.phase === Phase.Open || s.phase === Phase.Closing || s.phase === Phase.Finalized;
  const graceEnd = Number(h.flaggedAt + FLAG_GRACE);

  function topUp() {
    if (!T) return;
    topCtx.ask({
      title: `TOP UP · ${seriesLabel(s.id)}`,
      lines: [
        { label: "LEAVES WALLET", value: `${formatUsd(T)} USDG`, tone: "lime" },
        { label: "FREE AFTER", value: formatUsd(h.free + T) },
        { label: "RATIO AFTER", value: h.outstanding > 0n ? formatBps(crBps(h.free + T, h.outstanding, r)) : "No receipts out" },
      ],
      note: h.flagged ? "A top-up that brings the ratio back to 115% or more clears the flag." : undefined,
      action: "TOP UP",
      call: { ...hub, functionName: "topUp", args: [s.id, T] },
      usdg: T,
      after: () => setTop(null),
    });
  }

  function withdraw() {
    if (!W) return;
    wdCtx.ask({
      title: `WITHDRAW · ${seriesLabel(s.id)}`,
      lines: [
        { label: "ARRIVES IN WALLET", value: `${formatUsd(W)} USDG`, tone: "lime" },
        { label: "FREE AFTER", value: formatUsd(h.free - W) },
        { label: "RATIO AFTER", value: h.outstanding > 0n ? formatBps(crBps(h.free - W, h.outstanding, r)) : "No receipts out" },
      ],
      note:
        s.phase === Phase.Finalized
          ? "Series finalized. All free collateral can leave."
          : "During the quarter only collateral above 130% of receipts out can leave.",
      action: "WITHDRAW",
      call: { ...hub, functionName: "withdraw", args: [s.id, W] },
      after: () => setWd(""),
    });
  }

  return (
    <div className="border border-ink-3 p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Stamp size="md">{seriesLabel(s.id)}</Stamp>
        <Stamp tone="muted" size="xs" boxed>
          {PHASE_LABEL[s.phase]}
        </Stamp>
      </div>
      <HealthBar value={crPercent(h.crBps)} />
      <div className="mt-5 grid gap-x-8 md:grid-cols-2">
        <div>
          <Row label="LISTING ESCROW" value={formatUsd(h.escrow)} />
          <Row label="COLLATERAL" value={formatUsd(h.collateral)} />
          <Row label="RESERVED, OPEN JOBS" value={formatUsd(h.reserved)} />
          <Row label="FREE" value={formatUsd(h.free)} tone="lime" />
        </div>
        <div>
          <Row label="RECEIPTS OUT" value={`${h.outstanding} receipts`} />
          <Row label="RISK PRICE" value={r > 0n ? `${formatPriceWad(r)} per receipt` : "—"} />
          <Row label="TOP-UP LINE" value={h.outstanding > 0n ? `${formatUsd(line)} per receipt` : "—"} />
          <Row label="TO 130%" value={formatUsd(to130)} />
          <Row label="WITHDRAWABLE" value={formatUsd(h.withdrawable)} />
        </div>
      </div>

      {h.flagged && (
        <div className="mt-4">
          <Notice tone="danger">
            <span className="stamp text-[12px]">{h.liquidatable ? "FLAGGED · LIQUIDATION OPEN." : "FLAGGED."}</span>{" "}
            {h.liquidatable
              ? "Grace period is over. Top up to 115% or more to stop liquidation."
              : `Grace ends ${fmtDate(graceEnd)} (${formatCountdown(graceEnd - now)} left). Top up to 115% or more.`}
          </Notice>
        </div>
      )}
      {!h.flagged && h.belowMaintenance && (
        <div className="mt-4">
          <Notice tone="danger">Below 115%. Anyone can flag this position now. Top up.</Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="TOP UP, USDG">
            <input className={inputCls} inputMode="decimal" value={topVal} onChange={(e) => setTop(e.target.value)} placeholder="0.00" disabled={!canTop} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={topUp} disabled={!canTop || !T || topCtx.open || busy(topCtx.state)}>
              TOP UP
            </Button>
            {to130 > 0n && (
              <Button variant="ghost" size="sm" onClick={() => setTop(plainUsd(to130))} disabled={!canTop}>
                TO 130%
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <Field label="WITHDRAW, USDG">
            <input className={inputCls} inputMode="decimal" value={wd} onChange={(e) => setWd(e.target.value)} placeholder="0.00" disabled={!canWd} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={withdraw}
              disabled={!canWd || !W || W > h.withdrawable || wdCtx.open || busy(wdCtx.state)}
            >
              WITHDRAW
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setWd(plainUsd(h.withdrawable))} disabled={!canWd || h.withdrawable === 0n}>
              MAX {formatUsd(h.withdrawable)}
            </Button>
          </div>
          {W !== null && W > h.withdrawable && <p className="text-[12px] text-danger">Above the withdrawable {formatUsd(h.withdrawable)}.</p>}
        </div>
      </div>
      {(topCtx.view || wdCtx.view) && (
        <div className="mt-5 space-y-4">
          {topCtx.view}
          {wdCtx.view}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// e. Redemption queue
// ---------------------------------------------------------------------------

function QueuePanel({ me }: { me: Address }) {
  const { redemptions, isLoading } = useRedemptions();
  const { types } = useGpuTypes();
  const now = useNow(1000);
  const mine = redemptions.filter((r) => r.provider.toLowerCase() === me.toLowerCase());
  const requested = mine.filter((r) => r.status === Status.Requested);
  const started = mine.filter((r) => r.status === Status.Started);
  const disputed = mine.filter((r) => r.status === Status.Disputed);
  const gpu = (id: number) => types.find((t) => t.id === id)?.name ?? `GPU ${id}`;

  const head = (r: Redemption) => (
    <div className="min-w-0 space-y-1">
      <div className="stamp text-[12px]">
        #{String(r.id)} · {seriesLabel(r.series)} · {String(r.n)} NCU · {gpu(r.gpuType)}
      </div>
      <div className="text-[13px] text-ink-2">
        {formatDuration(r.duration)} job · reserve {formatUsd(r.reserve)} · holder <AddressLink address={r.holder} />
      </div>
    </div>
  );

  return (
    <Panel title="REDEMPTION QUEUE" aside={<Stamp tone={requested.length ? "lime" : "muted"} size="xs">{requested.length} TO START</Stamp>}>
      {isLoading ? (
        <Loading />
      ) : requested.length + started.length + disputed.length === 0 ? (
        <Empty>NO OPEN REDEMPTIONS</Empty>
      ) : (
        <div className="space-y-6">
          {requested.length > 0 && (
            <div className="space-y-3">
              <div className="stamp text-[11px] text-ink-2">TO START · 30 MIN WINDOW</div>
              {requested.map((r) => {
                const left = Number(r.startBy) - now;
                return (
                  <div key={String(r.id)} className={`flex flex-col gap-4 border p-4 md:flex-row md:items-center md:justify-between ${left < 300 ? "border-danger" : "border-lime"}`}>
                    {head(r)}
                    <div className="flex flex-wrap items-center gap-4">
                      {left > 0 ? (
                        <Countdown seconds={left} size="md" label="START BY" />
                      ) : (
                        <Stamp tone="danger">START MISSED · HOLDER CAN CLAIM</Stamp>
                      )}
                      <Button href={`/redemptions/${r.id}`}>
                        OPEN
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {started.length > 0 && (
            <div className="space-y-3">
              <div className="stamp text-[11px] text-ink-2">RUNNING</div>
              {started.map((r) => (
                <div key={String(r.id)} className="flex flex-col gap-3 border border-ink-3 p-4 md:flex-row md:items-center md:justify-between">
                  {head(r)}
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-[13px] text-ink-2">
                      Ends {fmtDate(r.jobEnd)} · disputes until {fmtDate(r.disputeUntil)}
                    </span>
                    <Button variant="secondary" size="sm" href={`/redemptions/${r.id}`}>
                      OPEN
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {disputed.length > 0 && (
            <div className="space-y-3">
              <div className="stamp text-[11px] text-danger">DISPUTES</div>
              {disputed.map((r) => (
                <div key={String(r.id)} className="flex flex-col gap-3 border border-danger p-4 md:flex-row md:items-center md:justify-between">
                  {head(r)}
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-[13px] text-ink-2">
                      Bond {formatUsd(r.bond)} · arbiter deadline {fmtDate(r.disputedAt + ARBITER_DEADLINE)}
                    </span>
                    <Button variant="danger" size="sm" href={`/redemptions/${r.id}`}>
                      ADD EVIDENCE
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
