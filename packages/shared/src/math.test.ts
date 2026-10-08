import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeRefWad,
  quoteRedeem,
  liquidationQuote,
  crBps,
  topUpTo130,
  topUpLinePrice,
  listingEscrow,
  currentRiskRef,
  formatUsd,
  parseUsd,
  formatDuration,
  WAD,
  type RefState,
} from "./math.ts";

const D = 1_000_000n;

test("published example: ref $1.60, redeem 600 on H100", () => {
  const s: RefState = { totalPaid: 5600n * D, totalSold: 3500n, refWad: 0n, sellerCount: 2n };
  s.refWad = computeRefWad([], s.totalPaid, s.totalSold);
  assert.equal(s.refWad, 1_600_000n * WAD);
  const q = quoteRedeem(s, 600n, 23_000n);
  assert.equal(q.fee, 9_600_000n);
  assert.equal(q.value, 960n * D);
  assert.equal(q.reserve, 1104n * D);
  assert.equal(q.duration, 939_130n);
  assert.equal(formatDuration(q.duration), "261 h");
});

test("collateral numbers from the posts", () => {
  assert.equal(listingEscrow(1000n, 1_400_000n), 1820n * D);
  const r = 1_600_000n * WAD;
  assert.equal(crBps(1820n * D, 1000n, r), 11_375n);
  assert.equal(topUpTo130(1820n * D, 1000n, r), 260n * D);
  assert.equal(formatUsd(topUpLinePrice(1820n * D, 1000n)), "$1.58");
});

test("liquidation kMax matches contract test", () => {
  const q = liquidationQuote(1820n * D, 1000n, 1_600_000n * WAD, 650n);
  assert.equal(q.kMax, 650n);
  assert.equal(q.paid, 1092n * D);
});

test("share cap", () => {
  const r = computeRefWad(
    [
      { sold: 8000n, paid: 8000n * D },
      { sold: 1000n, paid: 1200n * D },
      { sold: 1000n, paid: 1200n * D },
    ],
    10_400n * D,
    10_000n,
  );
  assert.ok(r > 1_066_666n * WAD && r < 1_066_667n * WAD);
});

test("riskRef moves ≤5%/day", () => {
  assert.equal(currentRiskRef(1_400_000n * WAD, 0n, 1_600_000n * WAD, 86_400n), 1_470_000n * WAD);
});

test("format/parse", () => {
  assert.equal(parseUsd("1.40"), 1_400_000n);
  assert.equal(formatUsd(8_064_000_000n), "$8,064.00");
});
