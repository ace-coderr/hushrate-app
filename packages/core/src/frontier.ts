// The "Frontier check": what a frontier chat assistant answered, next to the value Hushrate bought from Telegraph and the
// public value for the same hour. The file (data/frontier-check.json) is built from a recorded tape and hand-pasted answers.
// These are pure functions so the arithmetic and the schema can be tested.

export const FRONTIER_SCHEMA = 1;

/** Percent difference of `value` from `reference`: (value - reference) / reference * 100. null when either is missing or the reference is 0. */
export function pctDiff(value: number | null | undefined, reference: number | null | undefined): number | null {
  if (typeof value !== "number" || typeof reference !== "number") return null;
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) return null;
  return ((value - reference) / reference) * 100;
}

export interface FrontierReference {
  telegraph: number | null;
  public: number | null;
}

export interface FrontierParsed { value: number | null; note: string | null; }
export interface FrontierDiff { vs_telegraph_pct: number | null; vs_public_pct: number | null; }

export interface FrontierSample {
  id: string;
  label: string;
  /** What the person pasted: when it was asked, as written, and as a UTC timestamp. */
  asked_at: string;
  asked_at_text: string;
  conditions: { web_search: boolean; description: string };
  prompts: { id: string; text: string }[];
  /** Verbatim, never edited. */
  answers: { prompt_ids: string[]; text: string; note: string | null }[];
  parsed: { btc_usd: FrontierParsed; hashprice_sats_per_ph_day: FrontierParsed };
  computed: { btc_usd: FrontierDiff; hashprice_sats_per_ph_day: FrontierDiff };
}

export interface FrontierCheck {
  schema: number;
  kind: "frontier-check";
  assistant: string;
  disclaimer: string;
  tape: { file: string; interval_start: string; recorded_at: string; block_height: number | null };
  reference: {
    btc_usd: FrontierReference & { source: string | null; rail: string | null; receipt_hash: string | null; signal_hash: string | null; epoch_id: number | null; receipt_file: string | null; miner_id: string | null };
    hashprice_sats_per_ph_day: FrontierReference & { source: string | null; rail: string | null; receipt_hash: string | null; signal_hash: string | null; epoch_id: number | null; receipt_file: string | null; miner_id: string | null; returned_height: number | null; public_144_mean: number | null };
  };
  samples: FrontierSample[];
}

type Tape = {
  interval_start: string; recorded_at: string; block_height: number | null;
  btc: { value_usd: number | null; source: string | null; public_usd: number | null; telegraph: null | { value: number | null; accepted: boolean; rail?: string | null; receipt_hash?: string | null; signal_hash?: string | null; epoch_id?: number | null; receipt_file?: string | null; miner_id?: string | null } };
  hashprice: { value_sats_per_ph_day: number | null; source: string | null; public_at_telegraph_height: number | null; public_144: { hashprice_sats_per_ph_day: number } | null; telegraph: null | { value: number | null; accepted: boolean; rail?: string | null; receipt_hash?: string | null; signal_hash?: string | null; epoch_id?: number | null; receipt_file?: string | null; miner_id?: string | null; returned_height?: number | null } };
};

export type SampleInput = Omit<FrontierSample, "computed">;

const diff = (v: number | null, r: FrontierReference): FrontierDiff => ({ vs_telegraph_pct: pctDiff(v, r.telegraph), vs_public_pct: pctDiff(v, r.public) });

/** Build the file from a tape and the pasted samples. The Telegraph value is null unless the tape accepted it. */
export function buildFrontierCheck(args: { tape: Tape; tapeFile: string; assistant: string; disclaimer: string; samples: SampleInput[] }): FrontierCheck {
  const { tape, tapeFile } = args;
  const b = tape.btc.telegraph, h = tape.hashprice.telegraph;
  const bought = (c: typeof b) => (c && c.accepted && typeof c.value === "number" ? c.value : null);
  const btcRef: FrontierReference = { telegraph: bought(b), public: tape.btc.public_usd ?? null };
  // The public value for hashprice is the one the agent compares with: the single block at the height Telegraph returned.
  const hashRef: FrontierReference = { telegraph: bought(h), public: tape.hashprice.public_at_telegraph_height ?? null };
  return {
    schema: FRONTIER_SCHEMA, kind: "frontier-check", assistant: args.assistant, disclaimer: args.disclaimer,
    tape: { file: tapeFile, interval_start: tape.interval_start, recorded_at: tape.recorded_at, block_height: tape.block_height },
    reference: {
      btc_usd: { ...btcRef, source: tape.btc.source, rail: b?.rail ?? null, receipt_hash: b?.receipt_hash ?? null, signal_hash: b?.signal_hash ?? null, epoch_id: b?.epoch_id ?? null, receipt_file: b?.receipt_file ?? null, miner_id: b?.miner_id ?? null },
      hashprice_sats_per_ph_day: { ...hashRef, source: tape.hashprice.source, rail: h?.rail ?? null, receipt_hash: h?.receipt_hash ?? null, signal_hash: h?.signal_hash ?? null, epoch_id: h?.epoch_id ?? null, receipt_file: h?.receipt_file ?? null, miner_id: h?.miner_id ?? null, returned_height: h?.returned_height ?? null, public_144_mean: tape.hashprice.public_144?.hashprice_sats_per_ph_day ?? null },
    },
    samples: args.samples.map((s) => ({ ...s, computed: { btc_usd: diff(s.parsed.btc_usd.value, btcRef), hashprice_sats_per_ph_day: diff(s.parsed.hashprice_sats_per_ph_day.value, hashRef) } })),
  };
}

const num = (x: unknown) => x === null || (typeof x === "number" && Number.isFinite(x));
const close = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);

/** Problems with a frontier-check file; an empty list means it is valid. Checks shape, honest nulls and that stored differences match the arithmetic. */
export function validateFrontierCheck(x: unknown): string[] {
  const p: string[] = [];
  const o = x as Partial<FrontierCheck> | null;
  if (!o || typeof o !== "object") return ["not an object"];
  if (o.schema !== FRONTIER_SCHEMA) p.push(`schema must be ${FRONTIER_SCHEMA}`);
  if (o.kind !== "frontier-check") p.push("kind must be frontier-check");
  if (typeof o.assistant !== "string" || !o.assistant) p.push("assistant is missing");
  if (!o.tape || typeof o.tape.file !== "string" || typeof o.tape.interval_start !== "string") p.push("tape.file and tape.interval_start are required");
  const r = o.reference;
  if (!r) p.push("reference is missing");
  else for (const k of ["btc_usd", "hashprice_sats_per_ph_day"] as const) {
    const q = r[k];
    if (!q || !num(q.telegraph) || !num(q.public)) p.push(`reference.${k}.telegraph and .public must be a finite number or null`);
    else if (q.telegraph !== null && !q.receipt_hash) p.push(`reference.${k}: a Telegraph value needs its receipt_hash`);
  }
  if (!Array.isArray(o.samples) || o.samples.length === 0) p.push("samples must be a non-empty list");
  else for (const [i, s] of o.samples.entries()) {
    const at = `samples[${i}]`;
    if (!s.id || !s.label) p.push(`${at}: id and label are required`);
    if (Number.isNaN(Date.parse(s.asked_at))) p.push(`${at}: asked_at must be a timestamp`);
    if (typeof s.conditions?.web_search !== "boolean") p.push(`${at}: conditions.web_search must be true or false`);
    if (!Array.isArray(s.prompts) || s.prompts.length === 0 || s.prompts.some((q) => !q.text)) p.push(`${at}: prompts must be non-empty`);
    if (!Array.isArray(s.answers) || s.answers.length === 0 || s.answers.some((a) => !a.text)) p.push(`${at}: answers must be non-empty verbatim text`);
    for (const k of ["btc_usd", "hashprice_sats_per_ph_day"] as const) {
      const v = s.parsed?.[k]?.value;
      if (!num(v)) p.push(`${at}.parsed.${k}.value must be a finite number or null`);
      if (r && r[k] && num(v) && s.computed?.[k]) {
        if (!close(s.computed[k].vs_telegraph_pct, pctDiff(v as number | null, r[k].telegraph))) p.push(`${at}.computed.${k}.vs_telegraph_pct does not match the arithmetic`);
        if (!close(s.computed[k].vs_public_pct, pctDiff(v as number | null, r[k].public))) p.push(`${at}.computed.${k}.vs_public_pct does not match the arithmetic`);
      } else if (!s.computed?.[k]) p.push(`${at}.computed.${k} is missing`);
    }
  }
  return p;
}
