"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { makeWagmiConfig } from "@/lib/wagmi";

/**
 * Wallet + query providers.
 * ssr: true with cookieStorage. Server renders the disconnected state and the client
 * reconnects on mount (no cookies() read in the layout, so pages stay static).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [config] = useState(() => makeWagmiConfig());
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
