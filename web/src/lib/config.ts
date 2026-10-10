import { createConfig, fallback, http } from "wagmi";
import { injected, mock, walletConnect } from "wagmi/connectors";
import { monadTestnet } from "viem/chains";
import type { Address } from "viem";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";
// Public RPCs rate-limit and occasionally go down; viem fails over to the next one automatically.
const fallbackRpcUrls = [
  "https://testnet-rpc.monad.xyz",
  "https://rpc-testnet.monadinfra.com",
  "https://monad-testnet.drpc.org",
  "https://rpc.ankr.com/monad_testnet",
].filter((u) => u !== rpcUrl);
const isLocal = /localhost|127\.0\.0\.1/.test(rpcUrl);

export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL || "https://testnet.monadvision.com";
export const AJO_ADDRESS = process.env.NEXT_PUBLIC_AJO_ADDRESS as Address | undefined;
export const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS as Address | undefined;
export const IS_CONFIGURED = Boolean(AJO_ADDRESS && TOKEN_ADDRESS);
export const TOKEN_DECIMALS = 6;

export const chain = {
  ...monadTestnet,
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "MonadVision", url: EXPLORER_URL } },
} as const;

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
// Local QA only: drive the UI with an unlocked anvil account instead of a browser wallet.
const devMockAccount = process.env.NEXT_PUBLIC_DEV_MOCK_ACCOUNT as Address | undefined;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: devMockAccount
    ? [mock({ accounts: [devMockAccount], features: { reconnect: true, defaultConnected: true } })]
    : [
        injected(),
        ...(wcProjectId
          ? [
              walletConnect({
                projectId: wcProjectId,
                showQrModal: true,
                metadata: {
                  name: "Ajo",
                  description: "Savings circles where trust is money",
                  url: "https://ajo.app",
                  icons: [],
                },
              }),
            ]
          : []),
      ],
  transports: {
    [chain.id]: isLocal
      ? http(rpcUrl)
      : fallback([rpcUrl, ...fallbackRpcUrls].map((url) => http(url, { batch: true }))),
  },
  pollingInterval: 1_000,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;
