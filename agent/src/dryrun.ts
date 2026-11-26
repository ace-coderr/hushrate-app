// Mainnet dry run: run the payment decision path against a network's LIVE challenge, validate every pin, build the unsigned
// request, print what would be paid, and STOP before signing.
//   tsx src/dryrun.ts --network mainnet        writes data/mainnet-dryrun.json
//   tsx src/dryrun.ts --network sepolia        a rehearsal of the same path on the testnet (no file unless --out)
//   tsx src/dryrun.ts --config path.json ...   validate a candidate networks.json (for example once Telegraph publishes values)
//
// This module never reads a key and never imports the payment client: it cannot sign. HUSHRATE_DRY_RUN is set so that, even if
// something imported the payment client, assertSigningAllowed() would refuse. It makes only free calls: unpaid requests (which
// return the 402 terms) and a read of the escrow balance.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  checkEscrowOffer, escrowFunding, chooseRail, buildEscrowRequest, selectPayment, describeRefusal,
  type EscrowOption, type PaymentChallengeOption, type PaymentPin, type EscrowOffer,
} from "@hushrate/core";
import { resolveNetwork, NETWORK_ERROR, type NetworkConfig, type Network } from "./network.js";
import { readLedger } from "./ledgeracct.js";

export const DRYRUN_SCHEMA = 1;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export interface DryRunCheck { name: string; ok: boolean; detail: string; }
export interface WouldPay { intent: string; miner: string; resource: string; rail: "escrow" | "exact" | "public"; network: string; asset: string | null; pay_to: string | null; amount_uusdc: string | null; reason: string; }
export interface UnsignedRequest { miner: string; rail: "escrow"; header: "X-PAYMENT"; message: string; authorization: Record<string, string>; signature: null; }

export interface DryRunReport {
  schema: number;
  kind: "mainnet-dryrun";
  generated_at: string;
  network: string;
  testnet: boolean | null;
  caip2: string | null;
  node: string | null;
  /** not_configured: the network entry is incomplete, nothing to validate. unreachable: the node could not be read. refused: a pin or cap failed. ok: every check passed. */
  status: "not_configured" | "unreachable" | "refused" | "ok";
  summary: string;
  signing: "never: this is a dry run";
  caps: { max_amount_per_payment_uusdc: string | null; max_paid_calls_per_run: number | null } | null;
  checks: DryRunCheck[];
  would_pay: WouldPay[];
  unsigned_requests: UnsignedRequest[];
  planned_cost_per_run_uusdc: string | null;
}

export interface DryRunInput {
  cfg: { active: string; networks: Record<string, NetworkConfig> };
  network: string;
  agent: { telegraph: { hashprice_miner: string | number; btc_miner: string | number } };
  fetcher?: typeof fetch;
  now?: () => Date;
}

const empty = (network: string, now: Date, n: NetworkConfig | undefined): Omit<DryRunReport, "status" | "summary" | "checks"> => ({
  schema: DRYRUN_SCHEMA, kind: "mainnet-dryrun", generated_at: now.toISOString(), network, testnet: n ? n.testnet : null, caip2: n?.caip2 ?? null,
  node: n?.telegraph_node ?? null, signing: "never: this is a dry run", caps: null, would_pay: [], unsigned_requests: [], planned_cost_per_run_uusdc: null,
});

/** Called by nothing in the dry run: it exists so the refusal is explicit and testable. A dry run has no signing path. */
export function refuseToSign(network: string): never {
  throw new Error(`${NETWORK_ERROR}: the dry run never signs (network "${network}")`);
}

async function challengeFor(node: string, miner: string | number, intent: string, params: Record<string, unknown>, f: typeof fetch): Promise<{ status: number; accepts: (EscrowOption & PaymentChallengeOption)[] | null }> {
  const r = await f(`${node.replace(/\/$/, "")}/engine/v1/ask/${encodeURIComponent(String(miner))}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent, params }), signal: AbortSignal.timeout(30000) });
  if (r.status !== 402) return { status: r.status, accepts: null };
  try {
    const h = r.headers.get("payment-required");
    const j = JSON.parse(h ? Buffer.from(h, "base64").toString("utf8") : await r.text());
    return { status: 402, accepts: (j.accepts ?? []) as (EscrowOption & PaymentChallengeOption)[] };
  } catch { return { status: 402, accepts: null }; }
}

export async function dryRun(input: DryRunInput): Promise<DryRunReport> {
  const f = input.fetcher ?? fetch;
  const now = (input.now ?? (() => new Date()))();
  const raw = input.cfg.networks[input.network];
  const base = empty(input.network, now, raw);
  const checks: DryRunCheck[] = [];
  const done = (status: DryRunReport["status"], summary: string, extra: Partial<DryRunReport> = {}): DryRunReport => ({ ...base, ...extra, status, summary, checks });

  if (!raw) return done("not_configured", `network "${input.network}" is not defined in the config`);

  // 1. The network entry must be complete. A dry run skips the enabled switch (it is validating, not enabling) but nothing else.
  let net: Network;
  try { net = resolveNetwork({ active: input.network, networks: input.cfg.networks }, {}, { dryRun: true }); }
  catch (e) {
    const m = (e as Error).message.replace(`${NETWORK_ERROR}: `, "");
    checks.push({ name: "network entry is complete", ok: false, detail: m });
    return done("not_configured", `Nothing to validate: ${m}. Hushrate does not guess mainnet values; they must come from Telegraph.`);
  }
  checks.push({ name: "network entry is complete", ok: true, detail: `${net.label}: chain ${net.chain_id} (${net.caip2}), ${net.assets.length} allowed asset(s), node ${net.telegraph_node}` });
  const cap = BigInt(net.max_amount_per_payment);
  const caps = { max_amount_per_payment_uusdc: net.max_amount_per_payment, max_paid_calls_per_run: net.max_paid_calls_per_run };
  const pins: PaymentPin[] = net.assets.map((a) => ({ network: net.caip2, asset: a.address, payTo: a.pay_to, symbol: a.symbol, decimals: a.decimals }));
  const planned = [
    { intent: "MINING_HASHPRICE_VERIFY_GENERAL", miner: input.agent.telegraph.hashprice_miner, params: { block_height: 1 } },
    { intent: "CRYPTO_PRICE_USD", miner: input.agent.telegraph.btc_miner, params: { symbol: "BTC" } },
  ];
  checks.push({ name: "planned paid calls are within the per-run cap", ok: planned.length <= net.max_paid_calls_per_run, detail: `${planned.length} planned, cap ${net.max_paid_calls_per_run}` });

  // 2. Free reads: the unpaid challenge per planned call, and the escrow balance.
  const ledger = net.escrow ? await readLedger(net.telegraph_node, net.expected_wallet, f) : null;
  const wouldPay: WouldPay[] = [];
  const unsigned: UnsignedRequest[] = [];
  let reachable = true;
  let total = 0n;
  for (const p of planned) {
    const resource = `/v1/ask/${p.miner}`;
    let ch: Awaited<ReturnType<typeof challengeFor>>;
    try { ch = await challengeFor(net.telegraph_node, p.miner, p.intent, p.params, f); }
    catch (e) { reachable = false; checks.push({ name: `${p.intent}: the node answered`, ok: false, detail: `could not read the 402 challenge from ${net.telegraph_node}: ${(e as Error).message}` }); continue; }
    if (!ch.accepts) { checks.push({ name: `${p.intent}: a 402 challenge was returned`, ok: false, detail: `HTTP ${ch.status}: the node did not return readable payment terms for miner ${p.miner}` }); continue; }
    checks.push({ name: `${p.intent}: a 402 challenge was returned`, ok: true, detail: `${ch.accepts.length} option(s): ${ch.accepts.map((a) => `${a.scheme} ${a.network}`).join(", ")}` });

    // Escrow rail.
    const offer: EscrowOffer = net.escrow ? checkEscrowOffer(ch.accepts, { network: net.caip2, diamond: net.escrow.diamond }, cap, resource) : { state: "absent" };
    if (offer.state === "refused") checks.push({ name: `${p.intent}: escrow terms match the pins`, ok: false, detail: offer.reason });
    if (offer.state === "ok") checks.push({ name: `${p.intent}: escrow terms match the pins`, ok: true, detail: `network ${net.caip2}, payee ${net.escrow!.diamond}, amount ${offer.amount} <= cap ${cap}, resource ${resource}` });
    // Exact rail.
    const sel = selectPayment(ch.accepts as PaymentChallengeOption[], pins);
    const exactAmount = sel ? (sel.option.amount ?? null) : null;
    const exactOk = !!sel && exactAmount !== null && /^\d+$/.test(exactAmount) && BigInt(exactAmount) <= cap;

    const funding = offer.state === "ok" ? escrowFunding(ledger?.available, offer.amount) : null;
    const exactReason = sel ? "the exact option is above the cap" : describeRefusal(ch.accepts as PaymentChallengeOption[], pins);
    const choice = chooseRail(offer, funding, { ok: exactOk, reason: exactReason });
    // The exact rail only has to pass when it is the one that would pay. Other networks' options in the challenge are not a failure.
    if (sel && exactOk) checks.push({ name: `${p.intent}: exact option matches the pins`, ok: true, detail: `asset ${sel.pin.asset}, payee ${sel.pin.payTo}, amount ${exactAmount} <= cap ${cap}${choice.rail === "exact" ? "" : " (available, not used: escrow pays first)"}` });
    else if (choice.rail === "exact" || ch.accepts.some((a) => a.scheme === "exact")) checks.push({ name: `${p.intent}: exact option matches the pins`, ok: choice.rail !== "exact" && offer.state === "ok", detail: `${exactReason}${offer.state === "ok" ? " (not needed: escrow pays)" : ""}` });
    checks.push({ name: `${p.intent}: a payment rail can pay`, ok: choice.rail !== "public", detail: choice.reason });
    if (offer.state === "ok") checks.push({ name: `${p.intent}: escrow balance can be read and covers the call`, ok: funding?.state === "ok", detail: funding?.state === "ok" ? `${funding.available} uUSDC available` : funding?.state === "unfunded" ? `${funding.available} available, ${funding.needed} needed` : "the escrow balance could not be read (a dry run does not fall back to settlement)" });
    const amount = choice.rail === "escrow" && offer.state === "ok" ? offer.amount : choice.rail === "exact" && exactAmount ? BigInt(exactAmount) : null;
    if (amount !== null) total += amount;
    wouldPay.push({
      intent: p.intent, miner: String(p.miner), resource, rail: choice.rail, network: net.caip2,
      asset: choice.rail === "exact" && sel ? sel.pin.asset : choice.rail === "escrow" ? net.escrow!.token : null,
      pay_to: choice.rail === "escrow" ? net.escrow!.diamond : choice.rail === "exact" && sel ? sel.pin.payTo : null,
      amount_uusdc: amount === null ? null : amount.toString(), reason: choice.reason,
    });
    if (choice.rail === "escrow" && offer.state === "ok") {
      // The unsigned request: the message that WOULD be signed, with a fixed placeholder nonce. There is no signature, by construction.
      const { message, authorization } = buildEscrowRequest(offer, net.expected_wallet, `dry-run-${p.miner}`, Math.floor(now.getTime() / 1000));
      unsigned.push({ miner: String(p.miner), rail: "escrow", header: "X-PAYMENT", message, authorization: { ...authorization }, signature: null });
    }
  }
  checks.push({ name: "total planned cost per run is within the caps", ok: total <= cap * BigInt(net.max_paid_calls_per_run), detail: `${total} uUSDC planned for ${planned.length} call(s); per-payment cap ${cap}, call cap ${net.max_paid_calls_per_run}` });

  const failed = checks.filter((c) => !c.ok);
  const extra = { caps, would_pay: wouldPay, unsigned_requests: unsigned, planned_cost_per_run_uusdc: total.toString() };
  if (!reachable) return done("unreachable", `The node could not be read: ${failed.map((c) => c.detail).join("; ")}`, extra);
  if (failed.length) return done("refused", `Refused, nothing would be paid: ${failed.map((c) => c.name).join("; ")}`, extra);
  return done("ok", `Every pin and cap passed. This run would pay ${total} uUSDC (${(Number(total) / 1e6).toFixed(2)} USDC) by ${[...new Set(wouldPay.map((w) => w.rail))].join(" and ")}. Nothing was signed.`, extra);
}

// ---- command line ------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!) && process.argv[1].includes("dryrun")) {
  process.env.HUSHRATE_DRY_RUN = "1";
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
  const cfgPath = arg("--config") ?? `${ROOT}config/networks.json`;
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const agent = JSON.parse(readFileSync(`${ROOT}config/agent.json`, "utf8"));
  const network = arg("--network") ?? "mainnet";
  const report = await dryRun({ cfg, network, agent });
  const outArg = arg("--out");
  const out = outArg ? (/^([A-Za-z]:|\/)/.test(outArg) ? outArg : `${ROOT}${outArg}`) : network === "mainnet" ? `${ROOT}data/mainnet-dryrun.json` : null;
  console.log(`Mainnet dry run: network ${network}${report.testnet ? " (testnet rehearsal)" : ""}: ${report.status}`);
  console.log(report.summary);
  for (const c of report.checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
  for (const w of report.would_pay) console.log(`  would pay: ${w.intent} via miner ${w.miner}: ${w.rail}${w.amount_uusdc ? ` ${w.amount_uusdc} uUSDC to ${w.pay_to} on ${w.network}${w.asset ? ` (asset ${w.asset})` : ""}` : ""} (${w.reason})`);
  if (report.unsigned_requests.length) console.log("  stopped before signing: the unsigned message(s) are in the output file, with no signature");
  if (out) { mkdirSync(out.slice(0, Math.max(out.lastIndexOf("/"), out.lastIndexOf("\\"))), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 2) + "\n"); console.log(`wrote ${out.replace(ROOT, "")}`); }
}
