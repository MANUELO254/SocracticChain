import * as chains from "viem/chains";

export type BaseConfig = {
  targetNetworks: readonly chains.Chain[];
  pollingInterval: number;
  alchemyApiKey: string;
  rpcOverrides?: Record<number, string>;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
};

export type ScaffoldConfig = BaseConfig;

export const DEFAULT_ALCHEMY_API_KEY = "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";

const scaffoldConfig = {
  // 🟢 Target Optimism Sepolia
  targetNetworks: [chains.optimismSepolia],

  // Optional: Poll slower since it’s testnet
  pollingInterval: 30000,

  // Use your own Alchemy key or fallback
  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || DEFAULT_ALCHEMY_API_KEY,

  // Optional RPC override (explicitly define the same URL you already use)
  rpcOverrides: {
    [chains.optimismSepolia.id]: "https://opt-sepolia.g.alchemy.com/v2/8AcQ1xczTCQV9-oLhYUDewyQ4jizWZ-r",
  },

  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",

  // You can disable this if you want real wallets in production
  onlyLocalBurnerWallet: false,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
