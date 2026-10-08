#!/bin/sh
set -e
cd "$(dirname "$0")"
OUT=src/abi.ts
{ echo "// Generated from contracts/out — do not edit by hand. Run: pnpm --filter @tally/shared gen:abi"
  echo "export const tallyHubAbi = $(jq '.abi' ../../contracts/out/TallyHub.sol/TallyHub.json) as const;"
  echo
  echo "export const tallySeriesAbi = $(jq '.abi' ../../contracts/out/TallySeries.sol/TallySeries.json) as const;"; } > $OUT
