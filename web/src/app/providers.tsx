"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import { chain, PRIVY_APP_ID, USE_PRIVY, wagmiConfig } from "@/lib/config";
import { GasTopUp } from "@/components/GasTopUp";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 2 } } }));

  if (!USE_PRIVY) {
    return (
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID!}
      config={{
        // Email and Google first: most people we're building for have never used a crypto wallet.
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#c05a35",
          landingHeader: "Sign in to Ajo",
          loginMessage: "Use your email or Google. We'll set up your savings wallet for you.",
          walletChainType: "ethereum-only",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          // Actions are confirmed by the app's own buttons; no extra wallet pop-ups.
          showWalletUIs: false,
        },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={wagmiConfig}>
          {children}
          <GasTopUp />
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
