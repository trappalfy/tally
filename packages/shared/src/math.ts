/**
 * Tally math, one implementation for the whole frontend. Mirrors TallyHub.sol to the last unit.
 *
 * Rounding rules (same as the contract):
 * - every division is last, via mulDiv;
 * - fees, liquidation payouts, payoutPerReceipt, redemption value: rounded down;
 * - reserve (value + 15%), listing escrow (130%), required collateral, dispute bond: rounded up;
 * - payouts from a reserve never exceed the reserve.
 *
 * Units: USDG amounts are integer base units (6 decimals). Prices "Wad" are USDG units per receipt × 1e18.
 */

export const BPS = 10_000n;
export const WAD = 10n ** 18n;
export const USDG_DECIMALS = 6;

export const MINT_CR_BPS = 13_000n;
export const MAINT_CR_BPS = 11_500n;
export const RESERVE_BPS = 11_500n;
export const FEE_BPS = 100n;
export const START_WINDOW = 30n * 60n;
export const DISPUTE_GRACE = 2n * 3600n;
export const DISPUTE_BOND_BPS = 500n;
export const ARBITER_DEADLINE = 7n * 86400n;
export const TIMELOCK = 7n * 86400n;
export const PRICE_BAND_BPS = 2_000n;
export const RISK_SPEED_BPS = 500n;
export const SHARE_CAP_BPS = 4_000n;
export const SHARE_CAP_MIN_SELLERS = 3n;
export const MIN_CAPACITY = 100n;
export const FLAG_GRACE = 86400n;
export const LIQ_BONUS_BPS = 500n;
export const DAY = 86400n;

export function mulDiv(a: bigint, b: bigint, d: bigint, roundUp = false): bigint {
  if (d === 0n) throw new Error("mulDiv: division by zero");
  const p = a * b;
  const q = p / d;
  return roundUp && q * d !== p ? q + 1n : q;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);

export type RefState = {
  totalPaid: bigint;
  totalSold: bigint;
  refWad: bigint;
  sellerCount: bigint;
};

/** n × ref × bps / BPS. Below three sellers ref = Σpaid / Σsold exactly, otherwise the capped refWad. */
export function refAmount(s: RefState, n: bigint, bps: bigint, roundUp = false): bigint {
  if (s.totalSold === 0n) return 0n;
  if (s.sellerCount < SHARE_CAP_MIN_SELLERS) return mulDiv(n * s.totalPaid, bps, s.totalSold * BPS, roundUp);
  return mulDiv(n * s.refWad, bps, WAD * BPS, roundUp);
}

/** Volume-weighted reference price with the 40% per-provider cap once three or more providers sold. */
export function computeRefWad(sellers: { sold: bigint; paid: bigint }[], totalPaid: bigint, totalSold: bigint): bigint {
  if (totalSold === 0n) return 0n;
  if (BigInt(sellers.length) < SHARE_CAP_MIN_SELLERS) return mulDiv(totalPaid, WAD, totalSold);
  const cap = (SHARE_CAP_BPS * WAD) / BPS;
  let sumW = 0n;
  let sumWV = 0n;
  for (const p of sellers) {
    const w = min(mulDiv(p.sold, WAD, totalSold), cap);
    sumW += w;
    sumWV += mulDiv(w, p.paid, p.sold);
  }
  return mulDiv(sumWV, WAD, sumW);
}

/** riskRef follows ref, moving at most 5% of its last value per day. */
export function currentRiskRef(lastWad: bigint, lastAt: bigint, refWad: bigint, now: bigint): bigint {
  if (lastWad === 0n) return 0n;
  const dt = now - lastAt;
  if (dt <= 0n || refWad === lastWad) return lastWad;
  const maxMove = mulDiv(lastWad, RISK_SPEED_BPS * dt, BPS * DAY);
  if (refWad > lastWad) return min(refWad, lastWad + maxMove);
  return maxMove >= lastWad ? refWad : max(refWad, lastWad - maxMove);
}

/** Price corridor for listings and purchases: ±20% of riskRef (inclusive). */
export function priceBand(riskRefWad: bigint): { min: bigint; max: bigint } | null {
  if (riskRefWad === 0n) return null;
  return {
    min: mulDiv(riskRefWad, BPS - PRICE_BAND_BPS, WAD * BPS, true),
    max: mulDiv(riskRefWad, BPS + PRICE_BAND_BPS, WAD * BPS),
  };
}

export function listingEscrow(n: bigint, price: bigint): bigint {
  return mulDiv(n * price, MINT_CR_BPS, BPS, true);
}

export function quoteBuy(n: bigint, price: bigint) {
  const cost = n * price;
  const fee = mulDiv(cost, FEE_BPS, BPS);
  return { cost, fee, toProvider: cost - fee };
}

export function durationSeconds(n: bigint, ncuPerHourBps: bigint): bigint {
  return (n * BPS * 3600n) / ncuPerHourBps;
}

export function quoteRedeem(s: RefState, n: bigint, ncuPerHourBps: bigint) {
  return {
    value: refAmount(s, n, BPS),
    fee: refAmount(s, n, FEE_BPS),
    reserve: refAmount(s, n, RESERVE_BPS, true),
    duration: durationSeconds(n, ncuPerHourBps),
  };
}

export function disputeBond(value: bigint): bigint {
  return mulDiv(value, DISPUTE_BOND_BPS, BPS, true);
}

export function resolvePayout(reserve: bigint, bond: bigint, holderShareBps: bigint): bigint {
  const toHolder = mulDiv(reserve, holderShareBps, BPS);
  return holderShareBps > 0n ? toHolder + bond : 0n;
}

/** Collateral ratio in bps. null when outstanding == 0 (healthy). */
export function crBps(free: bigint, outstanding: bigint, riskRefWad: bigint): bigint | null {
  if (outstanding === 0n || riskRefWad === 0n) return null;
  return mulDiv(free * BPS, WAD, outstanding * riskRefWad);
}

export function belowMaintenance(free: bigint, outstanding: bigint, riskRefWad: bigint): boolean {
  if (outstanding === 0n || riskRefWad === 0n) return false;
  return free * BPS * WAD < MAINT_CR_BPS * outstanding * riskRefWad;
}

/** Free collateral above 130% of outstanding at riskRef. */
export function withdrawable(free: bigint, outstanding: bigint, riskRefWad: bigint): bigint {
  const req = mulDiv(outstanding * riskRefWad, MINT_CR_BPS, BPS * WAD, true);
  return free > req ? free - req : 0n;
}

/** Top-up needed to bring CR back to 130%. */
export function topUpTo130(free: bigint, outstanding: bigint, riskRefWad: bigint): bigint {
  const req = mulDiv(outstanding * riskRefWad, MINT_CR_BPS, BPS * WAD, true);
  return req > free ? req - free : 0n;
}

/** Price (USDG units per receipt) below which the provider must top up: free / 1.15 / outstanding. */
export function topUpLinePrice(free: bigint, outstanding: bigint): bigint {
  if (outstanding === 0n) return 0n;
  return mulDiv(free, BPS, MAINT_CR_BPS * outstanding);
}

/** Liquidation quote for k receipts. Mirrors _liqQuoteAt. */
export function liquidationQuote(free: bigint, outstanding: bigint, riskRefWad: bigint, k: bigint) {
  const o = outstanding;
  const r = riskRefWad;
  const full = free * BPS * WAD <= (BPS + LIQ_BONUS_BPS) * o * r;
  let kMax: bigint;
  let paid: bigint;
  if (full) {
    kMax = o;
    paid = o === 0n ? 0n : mulDiv(free, k, o);
  } else {
    const num = MINT_CR_BPS * o * r;
    const have = free * BPS * WAD;
    const den = (MINT_CR_BPS - BPS - LIQ_BONUS_BPS) * r;
    kMax = num > have ? (num - have + den - 1n) / den : 0n;
    if (kMax > o) kMax = o;
    paid = min(mulDiv(k * r, BPS + LIQ_BONUS_BPS, BPS * WAD), free);
  }
  return { kMax, paid, full };
}

export function payoutPerReceipt(s: RefState, pool: bigint, supply: bigint): bigint {
  if (supply === 0n) return 0n;
  return min(refAmount(s, 1n, BPS), pool / supply);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const UNIT = 10n ** BigInt(USDG_DECIMALS);

/** "$1,820.00" from USDG base units. */
export function formatUsd(units: bigint, decimals = 2): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const scale = 10n ** BigInt(USDG_DECIMALS - decimals);
  const rounded = decimals < USDG_DECIMALS ? abs / scale : abs;
  const whole = rounded / 10n ** BigInt(decimals);
  const frac = rounded % 10n ** BigInt(decimals);
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const f = decimals > 0 ? "." + frac.toString().padStart(decimals, "0") : "";
  return `${neg ? "-" : ""}$${w}${f}`;
}

/** Price per receipt from a Wad value, e.g. 1_600_000e18 → "$1.60". */
export function formatPriceWad(wad: bigint, decimals = 2): string {
  return formatUsd(wad / WAD, decimals);
}

/** "1.40" → 1_400_000n */
export function parseUsd(input: string): bigint {
  const s = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") throw new Error("Invalid amount");
  const [w, f = ""] = s.split(".");
  if (f.length > USDG_DECIMALS) throw new Error("Too many decimals");
  return BigInt(w || "0") * UNIT + BigInt(f.padEnd(USDG_DECIMALS, "0") || "0");
}

export function formatBps(bps: bigint | null, decimals = 2): string {
  if (bps === null) return "—";
  const v = Number(bps) / 100;
  return `${v.toFixed(decimals)}%`;
}

/** "261 h", "26 min", "2 h 10 min" */
export function formatDuration(seconds: bigint | number): string {
  const s = Number(seconds);
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h >= 48 || m === 0) return `${Math.round(s / 3600)} h`;
  return `${h} h ${m} min`;
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
