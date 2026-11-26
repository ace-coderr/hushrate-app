// Percent-difference math, null handling and the schema of data/frontier-check.json. Run: npm test -w packages/core
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pctDiff, buildFrontierCheck, validateFrontierCheck, FRONTIER_SCHEMA, type SampleInput } from "./index.js";

const near = (a: number | null, b: number, eps = 1e-9) => assert.ok(a !== null && Math.abs(a - b) < eps, `${a} vs ${b}`);

test("pctDiff is (value - reference) / reference * 100, signed", () => {
  near(pctDiff(110, 100), 10);
  near(pctDiff(90, 100), -10);
  near(pctDiff(83000, 60924.9), 36.23329705916628, 1e-9);
  near(pctDiff(42950, 46662.688189), -7.95643871600867, 1e-9);
  near(pctDiff(100, 100), 0);
});

test("pctDiff returns null, never a number, for anything missing or unusable", () => {
  for (const [v, r] of [[null, 1], [1, null], [undefined, 1], [1, undefined], [1, 0], [NaN, 1], [1, NaN], [Infinity, 1], [1, Infinity]] as [number | null | undefined, number | null | undefined][]) assert.equal(pctDiff(v, r), null);
});

const tape = {
  interval_start: "2026-11-22T16:00:00Z", recorded_at: "2026-11-22T16:17:22.210Z", block_height: 977071,
  btc: { value_usd: 100, source: "telegraph", public_usd: 101, telegraph: { value: 100, accepted: true, rail: "escrow", receipt_hash: "0xaa", signal_hash: "0xbb", epoch_id: 38, receipt_file: "f.json", miner_id: "7320" } },
  hashprice: { value_sats_per_ph_day: 50000, source: "telegraph", public_at_telegraph_height: 50000, public_144: { hashprice_sats_per_ph_day: 51000 }, telegraph: { value: 50000, accepted: true, rail: "escrow", receipt_hash: "0xcc", signal_hash: "0xdd", epoch_id: 38, receipt_file: "g.json", miner_id: "71083", returned_height: 977071 } },
};
const sample = (btc: number | null, hash: number | null): SampleInput => ({
  id: "s", label: "S", asked_at: "2026-11-22T16:00:00Z", asked_at_text: "about 16:00 UTC", conditions: { web_search: true, description: "d" },
  prompts: [{ id: "A", text: "q" }], answers: [{ prompt_ids: ["A"], text: "verbatim", note: null }],
  parsed: { btc_usd: { value: btc, note: null }, hashprice_sats_per_ph_day: { value: hash, note: null } },
});
const build = (t = tape, s = [sample(120, 45000)]) => buildFrontierCheck({ tape: t, tapeFile: "data/market/x.json", assistant: "a frontier chat assistant", disclaimer: "d", samples: s });

test("the built file carries the tape's Telegraph and public values and computes the differences", () => {
  const c = build();
  assert.equal(c.schema, FRONTIER_SCHEMA);
  assert.equal(c.reference.btc_usd.telegraph, 100);
  assert.equal(c.reference.btc_usd.public, 101);
  assert.equal(c.reference.btc_usd.receipt_hash, "0xaa");
  assert.equal(c.reference.hashprice_sats_per_ph_day.epoch_id, 38);
  near(c.samples[0].computed.btc_usd.vs_telegraph_pct, 20);
  near(c.samples[0].computed.btc_usd.vs_public_pct, (120 - 101) / 101 * 100);
  near(c.samples[0].computed.hashprice_sats_per_ph_day.vs_telegraph_pct, -10);
  assert.deepEqual(validateFrontierCheck(c), []);
});

test("a Telegraph value the tape did not accept stays null, and so does every difference against it", () => {
  const rejected = { ...tape, btc: { ...tape.btc, telegraph: { ...tape.btc.telegraph!, accepted: false } } };
  const c = build(rejected);
  assert.equal(c.reference.btc_usd.telegraph, null);
  assert.equal(c.samples[0].computed.btc_usd.vs_telegraph_pct, null);
  near(c.samples[0].computed.btc_usd.vs_public_pct, (120 - 101) / 101 * 100);
  assert.deepEqual(validateFrontierCheck(c), []);
});

test("a missing parsed number gives null differences, not zero", () => {
  const c = build(tape, [sample(null, null)]);
  assert.deepEqual(c.samples[0].computed.btc_usd, { vs_telegraph_pct: null, vs_public_pct: null });
  assert.deepEqual(validateFrontierCheck(c), []);
});

test("the validator rejects a wrong schema version, a missing receipt, empty answers and doctored differences", () => {
  const good = build();
  assert.ok(validateFrontierCheck({ ...good, schema: 2 }).some((p) => /schema/.test(p)));
  assert.ok(validateFrontierCheck({ ...good, reference: { ...good.reference, btc_usd: { ...good.reference.btc_usd, receipt_hash: null } } }).some((p) => /receipt_hash/.test(p)));
  assert.ok(validateFrontierCheck({ ...good, samples: [{ ...good.samples[0], answers: [{ prompt_ids: ["A"], text: "", note: null }] }] }).some((p) => /answers/.test(p)));
  const doctored = structuredClone(good);
  doctored.samples[0].computed.btc_usd.vs_telegraph_pct = 5;
  assert.ok(validateFrontierCheck(doctored).some((p) => /does not match the arithmetic/.test(p)));
  assert.ok(validateFrontierCheck(null).length > 0);
  assert.ok(validateFrontierCheck({ ...good, samples: [] }).some((p) => /non-empty/.test(p)));
});

test("the published data/frontier-check.json is valid and says what was pasted", () => {
  const f = JSON.parse(readFileSync(new URL("../../../data/frontier-check.json", import.meta.url), "utf8"));
  assert.deepEqual(validateFrontierCheck(f), []);
  assert.equal(f.assistant, "a frontier chat assistant");
  assert.equal(f.tape.interval_start, "2026-11-22T16:00:00Z");
  assert.equal(f.samples.length, 2);
  assert.deepEqual(f.samples.map((s: any) => [s.parsed.btc_usd.value, s.parsed.hashprice_sats_per_ph_day.value]), [[83000, 42950], [80000, 47000]]);
  assert.equal(f.samples[0].conditions.web_search, true);
  assert.equal(f.samples[1].conditions.web_search, false);
});
