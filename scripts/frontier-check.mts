// Builds data/frontier-check.json: two manual samples of what a frontier chat assistant answered, next to the value Hushrate
// bought from Telegraph and the public value, for the same hour (the 16:00Z tape of 2026-11-22). No network access.
//   npx tsx scripts/frontier-check.mts
// The answers are pasted VERBATIM (transcribed from a screenshot for sample 1, so its last lines may be cut off) and are never edited.
import { readFileSync, writeFileSync } from "node:fs";
import { buildFrontierCheck, validateFrontierCheck, type SampleInput } from "@hushrate/core";

const TAPE_FILE = "data/market/2026-11-22T16-17-22Z.json";
const root = new URL("../", import.meta.url);
const tape = JSON.parse(readFileSync(new URL(TAPE_FILE, root), "utf8"));
if (tape.interval_start !== "2026-11-22T16:00:00Z") throw new Error(`expected the 16:00Z tape, got ${tape.interval_start}`);

const sample1: SampleInput = {
  id: "sample-1",
  label: "Sample 1: web search on",
  asked_at: "2026-11-22T16:00:00Z",
  asked_at_text: "about 16:00 UTC on 22 Nov 2026",
  conditions: { web_search: true, description: "A frontier chat assistant with web search on (it said \"Searched the web\"). Transcribed from a screenshot of the conversation; the last lines may be cut off. Two separate questions." },
  prompts: [
    { id: "A", text: "What is the current Bitcoin price in USD? Give one number." },
    { id: "B", text: "What is the current Bitcoin network hashprice in sats per PH per day? Give one number and say how you got it." },
  ],
  answers: [
    {
      prompt_ids: ["A"],
      text: "I couldn't get a live quote. The search results were cached pages with mixed dates, and none was stamped today. The most recent dated one, from Bitget on Oct 28, 2026, showed about $80,849. Several undated Binance pages showed roughly $83,200-$83,900. About $83,000 USD is my best estimate, but check a live exchange for the exact price.",
      note: null,
    },
    {
      prompt_ids: ["B"],
      text: "About 42,950 sats per PH per day. I calculated it from a Nov 22, 2026 article. It reports a hashprice of $25.36 per PH/s per day on November 22, 2026, with Bitcoin at $59,048. Dividing $25.36 by $59,048 gives 0.00042948 BTC, which is about 42,948 sats. Hashprice in sats doesn't depend on the BTC price, so the price only matters for converting the dollar figure. Two caveats: Single source: the $25.36 figure comes from one article that uses mempool.space's hashrate estimate. I couldn't reach a live dashboard such as Hashrate Index or NewHedge to confirm it. Consistency check: it fits BitcoinStats.io's last visible reading of 42,628 sats per PH/day on Nov 4. That's close, so the figure looks plausible. I also need to correct my last answer. That article puts Bitcoin near $59,000 today, not the ~$83,000 I estimated from undated cached pages. Treat my earlier figure as stale.",
      note: "The assistant itself later called its first answer stale.",
    },
  ],
  parsed: {
    btc_usd: { value: 83000, note: "First answer; the assistant later called it stale and pointed to about $59,000." },
    hashprice_sats_per_ph_day: { value: 42950, note: null },
  },
};

const sample2: SampleInput = {
  id: "sample-2",
  label: "Sample 2: no search, no tools",
  asked_at: "2026-11-22T16:10:00Z",
  asked_at_text: "16:10 UTC on 22 Nov 2026",
  conditions: { web_search: false, description: "The same assistant, told not to search the web or use any tools, in one message with both questions." },
  prompts: [
    { id: "P", text: "Do not search the web or use any tools. Answer from your own knowledge only. 1) What is the current Bitcoin price in USD? Give one number. 2) What is the current Bitcoin network hashprice in sats per PH per day? Give one number and say how you got it." },
  ],
  answers: [
    {
      prompt_ids: ["P"],
      text: "Neither number is live. I can't see real-time data, so both are estimates from what I knew as of mid-2026. 1) Bitcoin price: about $80,000 USD. This is a rough guess. The real price today could be well above or below it. 2) Hashprice: about 47,000 sats per PH/s per day. I worked it out like this: Block rewards: the subsidy is 3.125 BTC per block, and there are about 144 blocks a day, so that is about 450 BTC a day. Fees: I added roughly 5% for transaction fees, which brings the total to about 470 BTC a day, or 4.7 x 10^10 sats. Network hashrate: I assumed about 1,000 EH/s, which is 1,000,000 PH/s. Division: 4.7 x 10^10 sats / 1,000,000 PH/s = about 47,000 sats per PH/s per day. Hashprice in sats doesn't depend on the BTC price. It moves only with network hashrate and fee levels. At my $80k guess it would be about $37 per PH/s per day. For real figures, check a live source like Hashrate Index or mempool.space.",
      note: null,
    },
  ],
  parsed: {
    btc_usd: { value: 80000, note: null },
    hashprice_sats_per_ph_day: { value: 47000, note: "Derived from block rewards, an assumed 5% fees and an assumed hashrate of about 1,000 EH/s." },
  },
};

const out = buildFrontierCheck({
  tape, tapeFile: TAPE_FILE, assistant: "a frontier chat assistant",
  disclaimer: "Two manual samples, not a benchmark. Results vary by model and by time. The answers are pasted verbatim.",
  samples: [sample1, sample2],
});
const problems = validateFrontierCheck(out);
if (problems.length) throw new Error(`frontier-check.json would be invalid:\n${problems.join("\n")}`);
writeFileSync(new URL("data/frontier-check.json", root), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ reference: { btc: [out.reference.btc_usd.telegraph, out.reference.btc_usd.public], hash: [out.reference.hashprice_sats_per_ph_day.telegraph, out.reference.hashprice_sats_per_ph_day.public] }, computed: out.samples.map((s) => s.computed) }, null, 1));
