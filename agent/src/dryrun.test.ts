// The mainnet dry run: refusals (wrong network, wrong payee, amount above the cap, no signing on mainnet), the config switch and the
// report schema. Every address below is an obviously fake fixture value, not a Telegraph or mainnet address. Run: npm test -w agent
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dryRun, refuseToSign, DRYRUN_SCHEMA } from "./dryrun.js";
import { assertSigningAllowed, resolveNetwork, MAINNET_ACK_ENV, MAINNET_ACK_VALUE, type NetworkConfig } from "./network.js";

const repoCfg = JSON.parse(readFileSync(new URL("../../config/networks.json", import.meta.url), "utf8"));
const agentCfg = { telegraph: { hashprice_miner: "111", btc_miner: "222" } };

const DIAMOND = "0x" + "44".repeat(20), TOKEN = "0x" + "11".repeat(20), PAYEE = "0x" + "33".repeat(20), WALLET = "0x" + "22".repeat(20), OTHER = "0x" + "55".repeat(20);
const fakeMainnet = (over: Partial<NetworkConfig> = {}): NetworkConfig => ({
  label: "fixture mainnet", testnet: false, enabled: false, caip2: "eip155:1", chain_id: 1, rpc_url: "https://rpc.invalid",
  assets: [{ address: TOKEN, symbol: "USDC", decimals: 6, pay_to: PAYEE }], escrow: { diamond: DIAMOND, token: TOKEN },
  telegraph_node: "https://node.invalid", expected_wallet: WALLET, explorer_tx: "https://explorer.invalid/tx/",
  max_amount_per_payment: "30000", max_paid_calls_per_run: 3, min_balance_units: "200000", ...over,
});
const cfgWith = (n: NetworkConfig) => ({ active: "sepolia", networks: { ...repoCfg.networks, mainnet: n } });

interface Terms { escrowNetwork?: string; escrowPayTo?: string; amount?: string; messageAmount?: string; available?: string | null }
/** A stub node: an unpaid request returns the 402 challenge, the ledger read returns a balance. It records every call. */
function stub(t: Terms = {}) {
  const calls: { method: string; url: string; hasPayment: boolean }[] = [];
  const amount = t.amount ?? "10000";
  const f = (async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ method: init?.method ?? "GET", url, hasPayment: headers.has("x-payment") || headers.has("payment-signature") });
    const m = /\/engine\/v1\/ask\/(\d+)$/.exec(url);
    if (m) {
      const resource = `/v1/ask/${m[1]}`;
      const payTo = t.escrowPayTo ?? DIAMOND;
      const accepts = [{
        scheme: "escrow", network: t.escrowNetwork ?? "eip155:1", payTo, amount,
        extra: { resource, message: `Telegraph Escrow Payment\n\nWallet: {from}\nPay To: ${payTo.toLowerCase()}\nNetwork: ${t.escrowNetwork ?? "eip155:1"}\nAmount: ${t.messageAmount ?? amount} uUSDC\nResource: ${resource}\nNonce: {nonce}\nValid After: {validAfter}\nValid Before: {validBefore}` },
      }];
      return new Response(JSON.stringify({ accepts }), { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify({ accepts })).toString("base64") } });
    }
    if (/\/v1\/ledger\/account\//.test(url)) {
      if (t.available === null) return new Response("{}", { status: 500 });
      const a = t.available ?? "5000000";
      return new Response(JSON.stringify({ available: a, balance: a, deposited: a, unbilled: "0", withdrawn: "0" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const run = (n: NetworkConfig, s = stub()) => dryRun({ cfg: cfgWith(n), network: "mainnet", agent: agentCfg, fetcher: s.f, now: () => new Date("2026-11-22T19:00:00Z") });

test("the committed mainnet entry is not configured: nothing is validated, nothing is called, nothing is guessed", async () => {
  const s = stub();
  const r = await dryRun({ cfg: repoCfg, network: "mainnet", agent: agentCfg, fetcher: s.f });
  assert.equal(r.status, "not_configured");
  assert.match(r.summary, /does not guess mainnet values/);
  assert.equal(s.calls.length, 0, "no request of any kind");
  assert.deepEqual([r.would_pay, r.unsigned_requests], [[], []]);
});

test("a complete mainnet entry passes every pin and cap, builds the unsigned request and stops before signing", async () => {
  const s = stub();
  const r = await run(fakeMainnet(), s);
  assert.equal(r.status, "ok", r.summary);
  assert.equal(r.schema, DRYRUN_SCHEMA);
  assert.equal(r.kind, "mainnet-dryrun");
  assert.equal(r.signing, "never: this is a dry run");
  assert.deepEqual(r.would_pay.map((w) => [w.rail, w.network, w.pay_to, w.amount_uusdc]), [["escrow", "eip155:1", DIAMOND, "10000"], ["escrow", "eip155:1", DIAMOND, "10000"]]);
  assert.equal(r.planned_cost_per_run_uusdc, "20000");
  assert.equal(r.unsigned_requests.length, 2);
  for (const u of r.unsigned_requests) {
    assert.equal(u.signature, null, "there is no signature");
    assert.ok(u.message.includes(`Wallet: ${WALLET}`) && !u.message.includes("{"), "the message is filled in");
  }
  assert.ok(s.calls.every((c) => !c.hasPayment), "no request carried a payment header");
});

test("a wrong network in the terms is refused", async () => {
  const r = await run(fakeMainnet(), stub({ escrowNetwork: "eip155:8453" }));
  assert.equal(r.status, "refused");
  assert.ok(r.checks.some((c) => !c.ok && /escrow terms match the pins/.test(c.name) && /network eip155:8453 is not the pinned eip155:1/.test(c.detail)));
  assert.deepEqual(r.unsigned_requests, [], "nothing is built from refused terms");
  assert.ok(r.would_pay.every((w) => w.rail === "public"));
});

test("a wrong payee is refused", async () => {
  const r = await run(fakeMainnet(), stub({ escrowPayTo: OTHER }));
  assert.equal(r.status, "refused");
  assert.ok(r.checks.some((c) => !c.ok && /not the pinned Diamond/.test(c.detail)));
  assert.deepEqual(r.unsigned_requests, []);
});

test("an amount above the per-payment cap is refused", async () => {
  const r = await run(fakeMainnet(), stub({ amount: "40000" }));
  assert.equal(r.status, "refused");
  assert.ok(r.checks.some((c) => !c.ok && /above the per-payment cap 30000/.test(c.detail)));
});

test("a message amount that differs from the quote is refused", async () => {
  const r = await run(fakeMainnet(), stub({ amount: "10000", messageAmount: "20000" }));
  assert.equal(r.status, "refused");
  assert.ok(r.checks.some((c) => !c.ok && /differs from the quoted/.test(c.detail)));
});

test("an unreadable or too-small escrow balance never leads to a payment", async () => {
  const unknown = await run(fakeMainnet(), stub({ available: null }));
  assert.equal(unknown.status, "refused");
  assert.ok(unknown.would_pay.every((w) => w.rail === "public" && w.amount_uusdc === null));
  const small = await run(fakeMainnet(), stub({ available: "5000" }));
  assert.equal(small.status, "refused");
  assert.ok(small.checks.some((c) => !c.ok && /5000 available, 10000 needed/.test(c.detail)));
});

test("an unreachable node is reported as unreachable, not as ok", async () => {
  const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const r = await dryRun({ cfg: cfgWith(fakeMainnet()), network: "mainnet", agent: agentCfg, fetcher: down });
  assert.equal(r.status, "unreachable");
});

test("a per-run call cap below the planned calls is refused", async () => {
  const r = await run(fakeMainnet({ max_paid_calls_per_run: 1 }));
  assert.equal(r.status, "refused");
  assert.ok(r.checks.some((c) => !c.ok && /per-run cap/.test(c.name)));
});

test("signing on mainnet is refused: no acknowledgement, dry run, and the dry run's own refusal", () => {
  const main = { name: "mainnet", testnet: false }, test_ = { name: "sepolia", testnet: true };
  assert.throws(() => assertSigningAllowed(main, {}), /refusing to sign.*not a testnet/);
  assert.throws(() => assertSigningAllowed(main, { [MAINNET_ACK_ENV]: "yes" }), /refusing to sign/);
  assert.throws(() => assertSigningAllowed(main, { [MAINNET_ACK_ENV]: MAINNET_ACK_VALUE, HUSHRATE_DRY_RUN: "1" }), /dry run: signing is disabled/, "even fully acknowledged, a dry run cannot sign");
  assert.throws(() => assertSigningAllowed(test_, { HUSHRATE_DRY_RUN: "1" }), /dry run: signing is disabled/, "a dry run cannot sign on the testnet either");
  assert.doesNotThrow(() => assertSigningAllowed(test_, {}));
  assert.doesNotThrow(() => assertSigningAllowed(main, { [MAINNET_ACK_ENV]: MAINNET_ACK_VALUE }));
  assert.throws(() => refuseToSign("mainnet"), /never signs/);
});

test("the dry run module has no way to sign: it imports no payment client and reads no key", () => {
  const src = readFileSync(new URL("./dryrun.ts", import.meta.url), "utf8");
  for (const forbidden of [/from "\.\/x402\.js"/, /privateKeyToAccount/, /signMessage/, /signTypedData/, /process\.env\.EVM_PRIVATE_KEY/, /loadEnvFile/]) assert.ok(!forbidden.test(src), `dryrun.ts must not contain ${forbidden}`);
});

test("the config switch: a disabled mainnet entry cannot run, and enabling it still needs every value and the acknowledgement", () => {
  const cfg = (n: NetworkConfig) => ({ active: "mainnet", networks: { mainnet: n } });
  assert.throws(() => resolveNetwork(cfg(fakeMainnet({ enabled: false })), { [MAINNET_ACK_ENV]: MAINNET_ACK_VALUE }), /disabled/);
  assert.throws(() => resolveNetwork(cfg(fakeMainnet({ enabled: true })), {}), /not a testnet.*HUSHRATE_MAINNET_ENABLE/);
  assert.throws(() => resolveNetwork(cfg(fakeMainnet({ enabled: true, telegraph_node: null })), { [MAINNET_ACK_ENV]: MAINNET_ACK_VALUE }), /missing telegraph_node/);
  assert.equal(resolveNetwork(cfg(fakeMainnet({ enabled: true })), { [MAINNET_ACK_ENV]: MAINNET_ACK_VALUE }).caip2, "eip155:1");
  // The dry run validates a disabled entry without enabling it, but still demands every value.
  assert.equal(resolveNetwork(cfg(fakeMainnet({ enabled: false })), {}, { dryRun: true }).testnet, false);
  assert.throws(() => resolveNetwork(cfg(fakeMainnet({ enabled: false, expected_wallet: null })), {}, { dryRun: true }), /missing expected_wallet/);
});

test("the committed data/mainnet-dryrun.json follows the schema and carries no secret", () => {
  const raw = readFileSync(new URL("../../data/mainnet-dryrun.json", import.meta.url), "utf8");
  const j = JSON.parse(raw);
  assert.equal(j.schema, DRYRUN_SCHEMA);
  assert.equal(j.kind, "mainnet-dryrun");
  assert.equal(j.network, "mainnet");
  assert.ok(["not_configured", "unreachable", "refused", "ok"].includes(j.status));
  assert.equal(j.signing, "never: this is a dry run");
  assert.ok(Array.isArray(j.checks) && Array.isArray(j.would_pay) && Array.isArray(j.unsigned_requests));
  assert.ok(j.unsigned_requests.every((u: { signature: unknown }) => u.signature === null));
  assert.ok(!/EVM_PRIVATE_KEY|private/i.test(raw));
  assert.ok(!/0x[0-9a-fA-F]{64}\b/.test(raw), "nothing key-shaped");
});
