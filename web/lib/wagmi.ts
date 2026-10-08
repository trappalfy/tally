import { cookieStorage, createConfig, createStorage, http, type CreateConnectorFn } from "wagmi";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { activeChain, activeRpcUrl } from "./chains";
import { site } from "./config";

export function makeWagmiConfig() {
  const connectors: CreateConnectorFn[] = [injected({ shimDisconnect: true })];

  // WalletConnect touches browser-only storage, so it is only created in the browser
  // and only when a project id is configured.
  if (site.walletConnectProjectId && typeof window !== "undefined") {
    connectors.push(
      walletConnect({
        projectId: site.walletConnectProjectId,
        showQrModal: true,
        metadata: {
          name: "Tally",
          description: site.description,
          url: site.url,
          icons: [`${site.url}/icon.svg`],
        },
      }),
    );
  }

  connectors.push(coinbaseWallet({ appName: "Tally" }));

  return createConfig({
    chains: [activeChain],
    connectors,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: { [activeChain.id]: http(activeRpcUrl) },
  });
}
