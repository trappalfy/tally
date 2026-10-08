import { defineChain, type Chain } from "viem";

export const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
});

export const SUPPORTED_CHAINS = [robinhoodMainnet, robinhoodTestnet] as const;

function resolveActiveChain(): Chain {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  const id = raw ? Number(raw) : robinhoodMainnet.id;
  return SUPPORTED_CHAINS.find((c) => c.id === id) ?? robinhoodMainnet;
}

/** Chain selected by NEXT_PUBLIC_CHAIN_ID (default 4663, Robinhood Chain mainnet). */
export const activeChain: Chain = resolveActiveChain();

/** RPC for the active chain. NEXT_PUBLIC_RPC_URL overrides the public endpoint. */
export const activeRpcUrl: string =
  process.env.NEXT_PUBLIC_RPC_URL || activeChain.rpcUrls.default.http[0];

export const explorerUrl: string = activeChain.blockExplorers?.default.url ?? "";

export function explorerAddressUrl(address: string): string {
  return `${explorerUrl}/address/${address}`;
}

export function explorerTxUrl(hash: string): string {
  return `${explorerUrl}/tx/${hash}`;
}
