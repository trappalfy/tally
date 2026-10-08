/** Starting GPU table (ncuPerHourBps = NCU per hour × 10 000). Live values come from the contract. */
export const GPU_TYPES = [
  { id: 0, name: "A100 80GB", ncuPerHourBps: 10_000n, minPerNcu: 60 },
  { id: 1, name: "H100", ncuPerHourBps: 23_000n, minPerNcu: 26 },
  { id: 2, name: "RTX 4090", ncuPerHourBps: 9_000n, minPerNcu: 67 },
] as const;

export function maskToIds(mask: bigint): number[] {
  const ids: number[] = [];
  for (let i = 0; i < 256 && mask >> BigInt(i) > 0n; i++) if ((mask >> BigInt(i)) & 1n) ids.push(i);
  return ids;
}

export function idsToMask(ids: number[]): bigint {
  return ids.reduce((m, i) => m | (1n << BigInt(i)), 0n);
}
