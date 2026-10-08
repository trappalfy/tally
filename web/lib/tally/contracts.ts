import { getAddress, type Address } from "viem";
import { getDeployment, tallyHubAbi, tallySeriesAbi } from "@tally/shared";
import { activeChain } from "../chains";

const dep = getDeployment(activeChain.id);
const ZERO = "0x0000000000000000000000000000000000000000";

/** NEXT_PUBLIC_HUB_ADDRESS / NEXT_PUBLIC_USDG_ADDRESS override packages/shared/addresses.ts. */
export const HUB: Address = getAddress(process.env.NEXT_PUBLIC_HUB_ADDRESS || dep?.hub || ZERO);
export const USDG: Address = getAddress(process.env.NEXT_PUBLIC_USDG_ADDRESS || dep?.usdg || ZERO);
export const FROM_BLOCK: bigint = BigInt(process.env.NEXT_PUBLIC_HUB_FROM_BLOCK || (dep?.fromBlock ?? 0n).toString());
export const HUB_READY = HUB !== ZERO;

export const hub = { address: HUB, abi: tallyHubAbi } as const;
export { tallyHubAbi, tallySeriesAbi };
