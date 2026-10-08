import type { Address } from "viem";

export type Deployment = {
  hub: Address;
  usdg: Address;
  /** block the hub was deployed at, for log scans */
  fromBlock: bigint;
};

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Addresses by chainId. Fill `hub` after deploy (see contracts/script/Deploy.s.sol). */
export const deployments: Record<number, Deployment> = {
  // Robinhood Chain mainnet
  4663: {
    hub: "0x98867Aa6bc921a11CC05392dB5CF18D8dB8d00A1",
    usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    fromBlock: 83519334n,
  },
  // Robinhood Chain testnet (mock USDG)
  46630: {
    hub: ZERO,
    usdg: ZERO,
    fromBlock: 0n,
  },
};

export function getDeployment(chainId: number): Deployment | undefined {
  return deployments[chainId];
}

export const isDeployed = (d?: Deployment) => !!d && d.hub !== ZERO;
