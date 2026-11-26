/// <reference types="vite/client" />

/** The active network from config/networks.json (public values), injected at build time by vite.config.ts. */
declare const __NETWORK__: {
  name: string; label: string; testnet: boolean; caip2: string | null;
  explorer_base: string | null; public_rpc_url: string | null; public_rpc_fallbacks: string[]; telegraph_node: string | null;
};
