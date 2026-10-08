/**
 * Site configuration and protocol parameters used in copy.
 *
 * Never hardcode these values in page copy: import them from here.
 * Values marked PENDING are proposed in TALLY_BRIEF.md and await owner confirmation
 * (section 16). Values marked FIXED are published promises (section 3).
 */

const xHandle = (process.env.NEXT_PUBLIC_X_HANDLE ?? "").replace(/^@/, "").trim();

export const site = {
  name: "Tally",
  tagline: "Time is money. So we put it on Tally.",
  description:
    "A Tally receipt is good for one hour of GPU compute. Buy at today's price. Redeem when you need the machine, or sell to someone who does.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  xHandle,
  xUrl: xHandle ? `https://x.com/${xHandle}` : "",
  dexPoolUrl: process.env.NEXT_PUBLIC_DEX_POOL_URL ?? "",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
} as const;

/** Banknote serial printed in the hero and footer. */
export const SERIAL = "TL 04 0000001 A";
export const SERIAL_PREFIX = "TL 04";

// ---- FIXED (published, section 3) ----
export const MINT_COLLATERAL = "130%";
export const TOPUP_LINE = "115%";
export const MISSED_START_PENALTY = "15%";
export const START_WINDOW = "30 minutes";
export const START_WINDOW_SHORT = "30 MIN";
export const MINT_FEE = "1%";
export const REDEEM_FEE = "1%";
export const EXAMPLE_SERIES = "2026-Q4";

// ---- PENDING owner confirmation (section 16) ----
/** Q12: dispute window after the job is due to end. */
export const DISPUTE_WINDOW = "2 hours";
/** Q12: arbiter deadline after a dispute opens. */
export const ARBITER_DEADLINE = "7 days";
/** Team target for answering a dispute (not a contract rule). */
export const ARBITER_TARGET = "72 hours";
/** Q12: dispute bond as a share of N x ref. */
export const DISPUTE_BOND = "5%";
/** Q9: grace period after a provider is flagged. */
export const GRACE = "24 hours";
/** Q10: liquidator bonus. */
export const LIQUIDATION_BONUS = "5%";
/** Q6: listing price band around the risk price. */
export const PRICE_BAND = "20%";
/** Q6: max daily move of the risk price. */
export const RISK_PRICE_SPEED = "5%";
/** Q7: max weight of one provider in the reference price. */
export const PROVIDER_CAP = "40%";
/** Q5: timelock on GPU types, arbiter and treasury changes. */
export const TIMELOCK = "7 days";
/** Q8: minimum capacity a provider must keep open. */
export const MIN_CAPACITY = "100 NCU";
/** Q2: series opens this long before the quarter starts. */
export const SERIES_OPENS_BEFORE = "30 days";
/** Q2: listings close this long before quarter end. */
export const LISTINGS_CLOSE_BEFORE = "7 days";

/** Reference GPU table (section 5.1). Benchmark-measured, not spec sheet. */
export const GPU_TYPES = [
  { name: "A100 80GB", ncuPerHour: "1.0", minutesPerNcu: 60, note: "REFERENCE" },
  { name: "H100", ncuPerHour: "2.3", minutesPerNcu: 26, note: "BENCHMARK" },
  { name: "RTX 4090", ncuPerHour: "0.9", minutesPerNcu: 67, note: "BENCHMARK" },
] as const;

export const NAV_LINKS = [
  { href: "/market", label: "Market" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/redeem", label: "Redeem" },
  { href: "/provider", label: "For providers" },
  { href: "/docs", label: "Docs" },
] as const;
