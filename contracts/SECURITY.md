# Tally contracts — security notes

No external audit. These notes record known risks and design choices.

## Money paths
USDG leaves the hub only through:
- `buy` — buyer → provider payout address and treasury (fee), never through the hub balance;
- `redeem` — holder → treasury (redeem fee);
- `withdraw` — provider's free collateral above 130% (Open/Closing) or everything free after finalization;
- `liquidate` — liquidator receives `k × riskRef × 1.05` (or a pro-rata share of free) for burning `k` receipts;
- `claimMissedStart`, `resolve`, `closeStaleDispute` — holder payouts from the reserve (+ dispute bond);
- `settle` — `amount × payoutPerReceipt` from the series pool;
- `claimOwed` — payouts that could not be pushed (USDG paused or the holder address frozen).

Owner and arbiter have no path to collateral, reserves, bonds or pools. The arbiter can only split one disputed
reserve between holder and provider, within 7 days of the dispute. Arbiter and treasury changes are timelocked 7 days.

## USDG specifics (Paxos)
- Proxy token, 6 decimals; issuer can freeze addresses and pause transfers.
- Holder payouts use `_payOrCredit`: a failed transfer is recorded in `owed[holder]` instead of reverting, so a
  frozen holder cannot block a redemption from closing and cannot block quarter-end finalization.
- A frozen provider can still top up/withdraw only if unfrozen; its collateral stays in the hub and still backs
  its receipts (finalization moves it into the pool without any transfer).
- A frozen treasury blocks `buy` and `redeem` (fee transfer). The owner can move the treasury via the 7-day timelock.

## Invariants (tested in `test/Invariant.t.sol`)
- `USDG.balanceOf(hub) == Σ(collateral + escrow) + Σ pool + totalBonds + totalOwed`
- `series.totalSupply == Σ outstanding` before finalization
- `reserved ≤ collateral` for every position

## Known residual risks
- Self-purchase to move `ref`: bounded by the ±20% listing band around `riskRef`, the 5%/day `riskRef` speed and the
  40% per-provider weight cap (from three sellers). It still costs only the 1% mint fee.
- Bad debt: if a provider's free collateral runs out, the shortfall reduces `payoutPerReceipt` equally for all holders.
- `_computeRef` loops over sellers of a series; providers are owner-approved in v1, so the set stays small.
- Runtime size is ~31 KB; Robinhood Chain (Arbitrum Orbit) accepts it (checked with `eth_call` creation on mainnet).
- `block.timestamp` is the only clock. `confirmStart` needs `timestamp < startBy`, `claimMissedStart` needs `≥ startBy`.
