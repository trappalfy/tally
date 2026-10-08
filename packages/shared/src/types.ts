export enum Phase {
  Pending = 0,
  Open = 1,
  Closing = 2,
  Ended = 3,
  Finalized = 4,
}

export const PHASE_LABEL: Record<number, string> = {
  0: "PENDING",
  1: "OPEN",
  2: "CLOSING",
  3: "ENDED",
  4: "FINALIZED",
};

export enum Status {
  None = 0,
  Requested = 1,
  Started = 2,
  Disputed = 3,
  Closed = 4,
}

export enum Outcome {
  None = 0,
  Released = 1,
  MissedStart = 2,
  Resolved = 3,
  StaleDispute = 4,
}

export const OUTCOME_LABEL: Record<number, string> = {
  0: "—",
  1: "COMPLETED",
  2: "MISSED START · PAID",
  3: "DISPUTE RESOLVED",
  4: "DISPUTE EXPIRED · PAID",
};

/** 20264 → "2026-Q4" */
export function seriesLabel(id: bigint | number): string {
  const n = Number(id);
  return `${Math.floor(n / 10)}-Q${n % 10}`;
}
