"use client";

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { Button, Stamp, ReceiptLine } from "@/components/ui";
import { useRightChain, WalletButton, shortAddress } from "@/components/wallet-button";
import { explorerTxUrl, explorerAddressUrl } from "@/lib/chains";
import { HUB_READY } from "@/lib/tally/contracts";
import type { TxState } from "@/lib/tally/hooks";

/** Engraved double-border panel used across the app. */
export function Panel({
  title,
  aside,
  children,
  className = "",
  tone = "ink",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "ink" | "lime" | "danger";
}) {
  const border = tone === "lime" ? "border-lime" : tone === "danger" ? "border-danger" : "border-ink-3";
  return (
    <div className={`border ${border} p-[3px] ${className}`}>
      <div className="h-full border border-ink-3">
        {(title || aside) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-3 px-4 py-3">
            <span className="stamp text-[12px] text-ink-2">{title}</span>
            {aside}
          </div>
        )}
        <div className="p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}

export function Row({ label, value, tone = "ink" }: { label: ReactNode; value: ReactNode; tone?: "lime" | "ink" }) {
  return <ReceiptLine label={label} value={value} tone={tone} className="py-1.5 !text-[13px]" />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="stamp mb-2 block text-[11px] text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] text-ink-2">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full border border-ink-3 bg-paper px-3 py-2.5 font-mono text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-lime";
export const textareaCls =
  "w-full border border-ink-3 bg-paper px-3 py-2.5 font-sans text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-lime";

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-ink-3 px-6 py-12 text-center">
      <Stamp tone="muted" size="sm">
        {children}
      </Stamp>
    </div>
  );
}

export function Loading({ label = "READING CHAIN" }: { label?: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <Stamp tone="muted" size="sm" className="animate-pulse">
        {label}…
      </Stamp>
    </div>
  );
}

export function Notice({ tone = "ink", children }: { tone?: "ink" | "lime" | "danger"; children: ReactNode }) {
  const cls =
    tone === "danger" ? "border-danger text-danger" : tone === "lime" ? "border-lime text-lime" : "border-ink-3 text-ink-2";
  return <div className={`border px-4 py-3 text-[14px] ${cls}`}>{children}</div>;
}

export function NotDeployed() {
  return (
    <Notice tone="lime">
      <span className="stamp text-[12px]">CONTRACTS NOT CONNECTED.</span>{" "}
      <span className="text-ink-2">The hub address is not configured for this network yet.</span>
    </Notice>
  );
}

/** Wallet + network gate for transaction screens. */
export function ConnectGate({ children, what = "continue" }: { children: ReactNode; what?: string }) {
  const { isConnected } = useAccount();
  const { isWrongChain, switchToRightChain, isSwitching, targetChain } = useRightChain();
  if (!HUB_READY) return <NotDeployed />;
  if (!isConnected)
    return (
      <div className="flex flex-wrap items-center gap-4 border border-ink-3 px-4 py-4">
        <span className="text-[14px] text-ink-2">Connect a wallet to {what}.</span>
        <WalletButton />
      </div>
    );
  if (isWrongChain)
    return (
      <div className="flex flex-wrap items-center gap-4 border border-danger px-4 py-4">
        <span className="text-[14px] text-danger">Wrong network. Tally runs on {targetChain.name}.</span>
        <Button variant="danger" size="sm" onClick={switchToRightChain} disabled={isSwitching}>
          {isSwitching ? "SWITCHING…" : "SWITCH NETWORK"}
        </Button>
      </div>
    );
  return <>{children}</>;
}

export function TxStatus({ state }: { state: TxState }) {
  if (state.status === "idle") return null;
  const link = (h?: string) =>
    h ? (
      <a className="underline decoration-ink-3 underline-offset-4 hover:text-lime" href={explorerTxUrl(h)} target="_blank" rel="noreferrer">
        VIEW TX
      </a>
    ) : null;
  const map: Record<TxState["status"], { tone: "ink" | "lime" | "danger"; text: string }> = {
    idle: { tone: "ink", text: "" },
    approving: { tone: "ink", text: "APPROVING EXACT USDG AMOUNT…" },
    signing: { tone: "ink", text: "CONFIRM IN WALLET…" },
    pending: { tone: "ink", text: "SENT. WAITING FOR BLOCK…" },
    confirmed: { tone: "lime", text: "CONFIRMED." },
    reverted: { tone: "danger", text: "REVERTED." },
    error: { tone: "danger", text: "FAILED." },
  };
  const m = map[state.status];
  return (
    <Notice tone={m.tone}>
      <span className="stamp text-[12px]">{m.text}</span>{" "}
      {"message" in state && <span className="text-[13px]">{state.message}</span>}{" "}
      <span className="stamp text-[11px]">{"hash" in state && link(state.hash)}</span>
    </Notice>
  );
}

export const busy = (s: TxState) => s.status === "approving" || s.status === "signing" || s.status === "pending";

/**
 * Pre-transaction screen: what will happen, what leaves the wallet, what arrives, fees.
 */
export function ConfirmSheet({
  title,
  lines,
  note,
  action,
  onConfirm,
  onCancel,
  state,
  danger = false,
}: {
  title: string;
  lines: { label: ReactNode; value: ReactNode; tone?: "lime" | "ink" }[];
  note?: ReactNode;
  action: string;
  onConfirm: () => void;
  onCancel?: () => void;
  state: TxState;
  danger?: boolean;
}) {
  return (
    <Panel title={title} tone={danger ? "danger" : "lime"}>
      <div className="space-y-0.5">
        {lines.map((l, i) => (
          <Row key={i} label={l.label} value={l.value} tone={l.tone ?? "ink"} />
        ))}
      </div>
      {note && <p className="mt-4 text-[13px] leading-relaxed text-ink-2">{note}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy(state)}>
          {busy(state) ? "WORKING…" : action}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy(state)}>
            BACK
          </Button>
        )}
      </div>
      <div className="mt-4">
        <TxStatus state={state} />
      </div>
    </Panel>
  );
}

export function AddressLink({ address, label }: { address: string; label?: ReactNode }) {
  return (
    <a
      href={explorerAddressUrl(address)}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[13px] text-ink-2 underline decoration-ink-3 underline-offset-4 hover:text-lime"
    >
      {label ?? shortAddress(address)}
    </a>
  );
}

export function fmtDate(ts: bigint | number): string {
  const d = new Date(Number(ts) * 1000);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function crPercent(crBps: bigint | undefined): number | null {
  if (crBps === undefined) return null;
  if (crBps > 10n ** 12n) return null; // max uint: no outstanding
  return Number(crBps) / 100;
}
