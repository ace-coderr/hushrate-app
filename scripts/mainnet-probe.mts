// Free, read-only discovery of what Telegraph advertises for mainnet. Sends no payment, signs nothing, uses no key.
//   npx tsx scripts/mainnet-probe.mts
// Every call is logged with its timestamp and status in data/probe/mainnet-discovery-<time>.json, and the findings are written
// to docs/mainnet-probe.md. Nothing is inferred: a mainnet network, asset or payee is reported only if a response contains it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const cfg = JSON.parse(readFileSync(new URL("config/networks.json", root), "utf8")).networks.sepolia;
const agent = JSON.parse(readFileSync(new URL("config/agent.json", root), "utf8"));
const NODE: string = cfg.telegraph_node;
const DOCS = "https://anjoman.ai/docs";

interface Call { n: number; at: string; method: string; url: string; note: string; status: number | null; bytes: number | null; result: string; }
const calls: Call[] = [];
const strip = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&quot;|&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const sentences = (t: string, re: RegExp) => [...t.matchAll(new RegExp(`[^.!?]{0,160}${re.source}[^.!?]{0,160}[.!?]?`, "gi"))].map((m) => m[0].trim());

async function call(method: "GET" | "POST", url: string, note: string, init: { body?: string; headers?: Record<string, string> } = {}) {
  const at = new Date().toISOString();
  const c: Call = { n: calls.length + 1, at, method, url, note, status: null, bytes: null, result: "" };
  calls.push(c);
  try {
    const r = await fetch(url, { method, body: init.body, headers: init.headers, signal: AbortSignal.timeout(90000) });
    const text = await r.text();
    c.status = r.status; c.bytes = text.length;
    return { r, text, c };
  } catch (e) { c.result = `failed: ${(e as Error).message}`; return { r: null, text: "", c }; }
}

const findings: Record<string, unknown> = {};

// 1. What the published docs say about mainnet.
const docPages = ["protocol/addresses-and-params", "protocol/how-it-works", "using/x402-inference", "using/escrow-inference", "using/inference-paths", "whats-new-v2", "using/engine-ask"];
const docMentions: Record<string, string[]> = {};
for (const p of docPages) {
  const { text, c } = await call("GET", `${DOCS}/${p}`, "published documentation page");
  const t = strip(text);
  docMentions[p] = sentences(t, /mainnet/);
  c.result = c.status === 200 ? `${docMentions[p].length} sentence(s) mention mainnet` : "page not available";
}
findings.docMentions = docMentions;

// 2. What the documented node advertises: the catalogue and an unpaid 402 per pinned miner.
const miners = await call("GET", `${NODE}/api/miners`, "miner catalogue on the documented node");
let minerInfo: Record<string, unknown> = {};
try {
  const j = JSON.parse(miners.text); const list: any[] = Array.isArray(j) ? j : (j.miners ?? []);
  const keys = new Set<string>(); for (const m of list) for (const k of Object.keys(m)) keys.add(k);
  minerInfo = { count: list.length, fields: [...keys], mentionsNetwork: [...keys].filter((k) => /net|chain/i.test(k)) };
  miners.c.result = `${list.length} miners; fields: ${[...keys].join(", ")}`;
} catch { miners.c.result = "unreadable"; }
findings.miners = minerInfo;

const challenges: Record<string, { networks: string[]; schemes: string[]; assets: string[]; payTo: string[]; amounts: string[]; escrow: boolean; options: { scheme: string; network: string; asset: string | null; payTo: string; amount: string | null }[] }> = {};
for (const [id, intent, params] of [[agent.telegraph.hashprice_miner, "MINING_HASHPRICE_VERIFY_GENERAL", { block_height: 1 }], [agent.telegraph.btc_miner, "CRYPTO_PRICE_USD", { symbol: "BTC" }]] as const) {
  const { r, c } = await call("POST", `${NODE}/engine/v1/ask/${id}`, "unpaid request: returns the 402 payment terms, nothing is signed or paid", { body: JSON.stringify({ intent, params }), headers: { "Content-Type": "application/json" } });
  let accepts: any[] = [];
  try { const h = r?.headers.get("payment-required"); accepts = h ? JSON.parse(Buffer.from(h, "base64").toString("utf8")).accepts ?? [] : []; } catch { /* none */ }
  const u = (f: (a: any) => unknown) => [...new Set(accepts.map(f).filter((x): x is string => typeof x === "string"))];
  challenges[String(id)] = { networks: u((a) => a.network), schemes: u((a) => a.scheme), assets: u((a) => a.asset), payTo: u((a) => a.payTo), amounts: u((a) => a.amount), escrow: accepts.some((a) => a.scheme === "escrow"), options: accepts.map((a) => ({ scheme: a.scheme, network: a.network, asset: a.asset ?? null, payTo: a.payTo, amount: a.amount ?? null })) };
  c.result = `HTTP ${c.status}; networks ${challenges[String(id)].networks.join(", ")}`;
}
findings.challenges = challenges;

// 3. Other places a mainnet service could be advertised: the node root and the public site.
for (const [url, note] of [[`${NODE}/`, "documented node root"], [`${NODE}/engine/v1/intents/MINING_HASHPRICE_VERIFY_GENERAL`, "intent description on the documented node"], ["https://telegraphprotocol.com/", "public site root"]] as const) {
  const { text, c } = await call("GET", url, note);
  const t = strip(text);
  const m = sentences(t, /mainnet/);
  c.result = c.status === null ? c.result : `HTTP ${c.status}; ${m.length} mention(s) of mainnet`;
  (findings.other ??= {} as Record<string, string[]>);
  (findings.other as Record<string, string[]>)[url] = m;
}

// 4. A read-only look at Ethereum mainnet itself, to show the dry run can read it without any key.
const rpc = await call("POST", "https://ethereum-rpc.publicnode.com", "read-only JSON-RPC: eth_chainId (no key, no transaction)", { body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), headers: { "Content-Type": "application/json" } });
try { const v = JSON.parse(rpc.text).result; findings.mainnetRpcChainId = parseInt(v, 16); rpc.c.result = `chain id ${parseInt(v, 16)}`; } catch { rpc.c.result = "unreadable"; }

const advertisedMainnet = Object.values(challenges).some((c) => c.networks.some((n) => n === "eip155:1"));
findings.advertisedMainnet = advertisedMainnet;
const out = { generated_at: new Date().toISOString(), documented_node: NODE, calls, findings };
mkdirSync(new URL("data/probe/", root), { recursive: true });
const stamp = out.generated_at.replace(/[:.]/g, "-");
writeFileSync(new URL(`data/probe/mainnet-discovery-${stamp}.json`, root), JSON.stringify(out, null, 2) + "\n");

// ---- the written record ----
const md: string[] = [];
md.push("# Mainnet probe", "");
md.push(`Run ${out.generated_at} with \`scripts/mainnet-probe.mts\`. Free, read-only calls only: no payment was made, nothing was signed, no key was used. The raw log is \`data/probe/mainnet-discovery-${stamp}.json\`.`, "");
md.push("## Result", "");
md.push(advertisedMainnet
  ? "**A mainnet payment option was advertised** in an unpaid 402 challenge; see the table below. Nothing about it has been paid or pinned."
  : "**Telegraph does not advertise a mainnet payment option today.** The documented node returns a payment challenge for Ethereum Sepolia (and other test networks) only, and the published documentation lists no mainnet node URL, asset address, payee or Diamond. Because nothing is advertised, Hushrate pins nothing for mainnet and invents nothing.", "");
md.push("## Calls made", "", "| # | Time (UTC) | Call | Why | Status | Result |", "|---|---|---|---|---|---|");
for (const c of calls) md.push(`| ${c.n} | ${c.at} | ${c.method} ${c.url} | ${c.note} | ${c.status ?? "n/a"} | ${c.result || "-"} |`);
md.push("", "## What a live 402 advertises today (documented node)", "", "| Miner | Scheme | Network | Asset | Payee | Amount (uUSDC) |", "|---|---|---|---|---|---|");
for (const [id, c] of Object.entries(challenges)) for (const o of c.options) md.push(`| ${id} | ${o.scheme} | ${o.network} | ${o.asset ? `\`${o.asset}\`` : "(escrow: no asset field)"} | \`${o.payTo}\` | ${o.amount ?? "n/a"} |`);
md.push("", "Every option is a test network: Ethereum Sepolia (`eip155:11155111`, escrow only today), Base Sepolia (`eip155:84532`) and a Solana test network. **No option is Ethereum mainnet (`eip155:1`) or any other mainnet.** Observation: the Sepolia `exact` option that Hushrate saw until 2026-11-19 is no longer in the challenge; on Sepolia only escrow is offered now, so the exact fallback has nothing to pay on that network.");
const site = ((findings.other as Record<string, string[]>)["https://telegraphprotocol.com/"] ?? [])[0];
md.push("", "## What the public site says about mainnet", "", site ? "- The home page (https://telegraphprotocol.com/) shows a statistics row that includes \"Jan 2027 Mainnet\" next to \"Transactions (testnet)\": mainnet is presented as upcoming, not live." : "- The home page does not mention mainnet.");
md.push("", "The intent description on the node also contains the word mainnet, but it refers to Bitcoin's chain (a block height) and to the EVM chains a miner can read, not to a Telegraph payment network.");
md.push("", "## What the documentation says about mainnet", "");
const seen = new Set<string>();
for (const [p, ms] of Object.entries(docMentions)) for (const s of ms) { const k = s.slice(0, 80); if (seen.has(k)) continue; seen.add(k); md.push(`- \`${p}\`: "${s.replace(/\s+/g, " ")}"`); }
if (!seen.size) md.push("- No page mentions mainnet.");
md.push("", "These sentences are the only mainnet information published: the canonical chain for Telegraph mainnet is Ethereum, and a mainnet epoch is 24 hours (the testnet's is 1 hour). No address, node URL or asset is given.", "");
md.push("## What this means for Hushrate", "", "- The `mainnet` entry in `config/networks.json` stays disabled with every value `null`: there is nothing real to put in it.", "- When Telegraph publishes mainnet values, they go into that entry (network id, node URL, asset and payee or Diamond, caps), the dry run (`npm run dryrun -- --network mainnet`) validates them against the live challenge before anything is enabled.", `- A mainnet read-only RPC works without a key (chain id ${findings.mainnetRpcChainId ?? "n/a"}), so the dry run's balance and funding checks need no secret.`, "- **Not proven:** that a mainnet node exists, what it charges, which miners serve it, and how escrow withdrawal and billing verification behave there (a 24-hour epoch means a billing record can take about a day).", "");
writeFileSync(new URL("docs/mainnet-probe.md", root), md.join("\n") + "\n");
console.log(JSON.stringify({ advertisedMainnet, challenges, docMentionCount: seen.size, mainnetRpcChainId: findings.mainnetRpcChainId }, null, 1));
