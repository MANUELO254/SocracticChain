import { wagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { hardhat, mainnet, optimismSepolia } from "viem/chains"; // Added optimismSepolia
import { createConfig } from "wagmi";
import scaffoldConfig, { DEFAULT_ALCHEMY_API_KEY, ScaffoldConfig } from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
let enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

// Explicitly add OP Sepolia if not already included
if (!enabledChains.find((chain) => chain.id === 11155420)) {
  enabledChains = [...enabledChains, optimismSepolia] as const;
}

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: wagmiConnectors(), // Assumes this is v2-compatible; update if custom
  ssr: true,
  client: ({ chain }) => {
    let rpcFallbacks = [http()];
    const rpcOverrideUrl = (scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"])?.[chain.id];
    if (rpcOverrideUrl) {
      rpcFallbacks = [http(rpcOverrideUrl), http()];
    } else {
      const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
      if (alchemyHttpUrl) {
        const isUsingDefaultKey = scaffoldConfig.alchemyApiKey === DEFAULT_ALCHEMY_API_KEY;
        rpcFallbacks = isUsingDefaultKey ? [http(), http(alchemyHttpUrl)] : [http(alchemyHttpUrl), http()];
      } else {
        // Fallback for OP Sepolia (public RPCs)
        if (chain.id === 11155420) {
          rpcFallbacks = [
            http("https://sepolia.optimism.io"), // Official public RPC
            http("https://opt-sepolia.g.alchemy.com/v2/demo"), // Alchemy demo (rate-limited)
            http(), // Generic fallback
          ];
        }
      }
    }
    return createClient({
      chain,
      transport: fallback(rpcFallbacks),
      ...(chain.id !== (hardhat as Chain).id ? { pollingInterval: scaffoldConfig.pollingInterval } : {}),
    });
  },
});