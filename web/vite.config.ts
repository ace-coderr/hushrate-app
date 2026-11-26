import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync, mkdirSync, createReadStream, statSync, readFileSync } from "node:fs";
import { resolve, join, normalize } from "node:path";

const DATA = resolve(__dirname, "../data");

// The ACTIVE network from config/networks.json, public values only, so the web app's links, RPC and node follow the config. The agent's
// rpc_url may carry a key and is never published; the browser uses public_rpc_url, which must be key-free.
const netCfg = JSON.parse(readFileSync(resolve(__dirname, "../config/networks.json"), "utf8"));
const active = netCfg.networks[netCfg.active];
const NETWORK = {
  name: netCfg.active as string, label: active.label as string, testnet: active.testnet as boolean, caip2: (active.caip2 ?? null) as string | null,
  explorer_base: active.explorer_tx ? String(active.explorer_tx).replace(/tx\/$/, "") : null,
  public_rpc_url: (active.public_rpc_url ?? null) as string | null, public_rpc_fallbacks: (active.public_rpc_fallbacks ?? []) as string[], telegraph_node: (active.telegraph_node ?? null) as string | null,
};
// Only the published market data is served; discovery dumps and probe files stay in the repo.
const PUBLISHED = ["latest.json", "history.json", "status.json", "ledger.json", "ticker.json", "billing.json", "deposits.json", "frontier-check.json", "mainnet-dryrun.json", "market", "receipts"];

/** Serves ../data at /data in dev and copies the published subset into dist/data on build. */
function publishData(): Plugin {
  return {
    name: "hushrate-publish-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/data\/([^?]+)/.exec(req.url ?? "");
        if (!m) return next();
        const p = normalize(join(DATA, decodeURIComponent(m[1])));
        const top = p.slice(DATA.length + 1).split(/[\\/]/)[0];
        if (!p.startsWith(DATA) || !PUBLISHED.includes(top) || !existsSync(p) || !statSync(p).isFile()) { res.statusCode = 404; return res.end("not found"); }
        res.setHeader("Content-Type", "application/json");
        createReadStream(p).pipe(res);
      });
    },
    closeBundle() {
      const out = resolve(__dirname, "dist/data");
      mkdirSync(out, { recursive: true });
      for (const name of PUBLISHED) if (existsSync(join(DATA, name))) cpSync(join(DATA, name), join(out, name), { recursive: true });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? "/hushrate-app/",
  plugins: [react(), publishData()],
  define: { __NETWORK__: JSON.stringify(NETWORK) },
  server: { fs: { allow: [".."] } },
});
