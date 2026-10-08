# Tally

Warehouse receipts for GPU compute on Robinhood Chain. 1 receipt = 1 NCU = one hour on the reference A100 80GB.
Spec: [TALLY_BRIEF.md](TALLY_BRIEF.md).

```
contracts/          Foundry: TallyHub (everything) + TallySeries (ERC-20 per quarter)
packages/shared/    ABI, addresses by chainId, bigint math mirrored from the contract
services/handoff/   Hono app: SIWE, encrypted job specs / access details, dispute evidence (mounted in web at /api/handoff)
web/                Next.js 16: landing, docs and the app
brand/              brand assets
```

## Run locally

```sh
pnpm install
cp .env.example .env            # fill DEPLOYER_PRIVATE_KEY only when deploying
pnpm dev                        # http://localhost:3000
```

`web/.env.local` holds the public config (`NEXT_PUBLIC_HUB_ADDRESS`, `NEXT_PUBLIC_HUB_FROM_BLOCK`, chain and RPC).
`contracts/deploy.sh` writes it after a deploy. Without `DATABASE_URL` the handoff service keeps data in memory (dev only).

## Contracts

```sh
cd contracts
forge test                                                       # unit + invariant
FORK_URL=https://rpc.mainnet.chain.robinhood.com forge test --mc ForkTest   # full cycle on real USDG
./deploy.sh mainnet                                              # deploy, open 2026-Q4, verify, write web/.env.local
pnpm --filter @tally/shared gen:abi                              # after any contract change
```

Robinhood Chain mainnet: chain id 4663, USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (6 decimals, Paxos: freeze + pause).
See [contracts/SECURITY.md](contracts/SECURITY.md).

## Parameters awaiting owner confirmation

Constants in `TallyHub.sol` (fixed at deploy) use the values proposed in brief section 16: series opens 30 days before
the quarter, listings close 7 days before the end; ±20% price band; riskRef ≤ 5%/day; 40% provider cap from 3 sellers;
min capacity 100 NCU; 24 h grace; 5% liquidation bonus; equal haircut on bad debt; dispute window job + 2 h,
5% bond, 7-day arbiter deadline, partial resolutions allowed; redeem fee not refunded; 7-day timelocks.
