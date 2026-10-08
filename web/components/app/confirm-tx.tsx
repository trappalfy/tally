"use client";

import { useState, type ReactNode } from "react";
import { useTx } from "@/lib/tally/hooks";
import { ConfirmSheet, TxStatus } from "./kit";

type Call = Parameters<ReturnType<typeof useTx>["run"]>[0];

export type PendingTx = {
  title: string;
  lines: { label: ReactNode; value: ReactNode; tone?: "lime" | "ink" }[];
  note?: ReactNode;
  action: string;
  danger?: boolean;
  call: Call;
  /** Exact USDG amount to approve before the call. */
  usdg?: bigint;
  /** Runs after the transaction is confirmed. */
  after?: () => unknown;
};

/**
 * Every transaction goes through a ConfirmSheet first. `ask` opens the sheet, `view` renders it
 * (or the last transaction status once the sheet is closed).
 */
export function useConfirmTx(onDone?: () => void) {
  const tx = useTx(onDone);
  const [pending, setPending] = useState<PendingTx | null>(null);

  const ask = (p: PendingTx) => {
    tx.reset();
    setPending(p);
  };

  const view = pending ? (
    <ConfirmSheet
      title={pending.title}
      lines={pending.lines}
      note={pending.note}
      action={pending.action}
      danger={pending.danger}
      state={tx.state}
      onConfirm={async () => {
        const rc = await tx.run(pending.call, pending.usdg);
        if (rc) {
          setPending(null);
          await pending.after?.();
        }
      }}
      onCancel={() => {
        setPending(null);
        tx.reset();
      }}
    />
  ) : tx.state.status !== "idle" ? (
    <TxStatus state={tx.state} />
  ) : null;

  return { ask, view, state: tx.state, open: pending !== null };
}
