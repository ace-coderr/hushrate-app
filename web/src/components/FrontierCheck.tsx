import { pctDiff, type FrontierCheck as Check, type FrontierSample } from "@hushrate/core";
import { useFrontier } from "../lib/data";
import { num, shortHash } from "../lib/format";
import { FrontierIntro } from "./FrontierIntro";

const signed = (p: number | null) => (p === null ? "n/a" : `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`);

function Hash({ h, epoch }: { h: string | null; epoch: number | null }) {
  if (!h) return <>n/a</>;
  return <><a className="mono" href={`#/receipts?hash=${h}`} title={h}>{shortHash(h)}</a>{epoch != null ? <small className="muted"> · epoch {epoch}</small> : null}</>;
}

function SampleTable({ s, c }: { s: FrontierSample; c: Check }) {
  const rows = [
    { key: "btc_usd" as const, label: "Bitcoin price (USD)", ref: c.reference.btc_usd, fmt: (n: number | null) => (n === null ? "n/a" : `$${num(n, n % 1 ? 2 : 0)}`) },
    { key: "hashprice_sats_per_ph_day" as const, label: "Hashprice (sats per PH per day)", ref: c.reference.hashprice_sats_per_ph_day, fmt: (n: number | null) => (n === null ? "n/a" : num(n, n % 1 ? 1 : 0)) },
  ];
  return (
    <div className="scroll">
      <table>
        <thead><tr><th>Question</th><th>Assistant answer</th><th>Telegraph (bought)</th><th>Public</th><th>Assistant vs Telegraph</th><th>Assistant vs public</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const v = s.parsed[r.key].value;
            return (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="mono">{r.fmt(v)}</td>
                <td className="mono">{r.fmt(r.ref.telegraph)}</td>
                <td className="mono">{r.fmt(r.ref.public)}</td>
                <td className="mono">{signed(pctDiff(v, r.ref.telegraph))}</td>
                <td className="mono">{signed(pctDiff(v, r.ref.public))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Proof page section: what a frontier chat assistant answered, next to the Telegraph-bought value and the public value for the same hour. */
export function FrontierCheck() {
  const f = useFrontier();
  const c = f.data;
  return (
    <section aria-labelledby="frontier-h">
      <h2 id="frontier-h">Frontier check</h2>
      {f.loading && <p className="muted">Loading the frontier check…</p>}
      {!f.loading && !c && <p className="muted">No frontier check is published ({f.error}).</p>}
      {c && (
        <>
          <FrontierIntro assistant={c.assistant} intervalStart={c.tape.interval_start} recordedAt={c.tape.recorded_at} blockHeight={c.tape.block_height} />
          <div className="card">
            <h3>The reference values for that hour</h3>
            <dl>
              <dt>Bitcoin price, Telegraph</dt><dd className="mono">${num(c.reference.btc_usd.telegraph, 2)} <small className="muted">({c.reference.btc_usd.rail ?? "rail n/a"}, miner {c.reference.btc_usd.miner_id ?? "n/a"})</small></dd>
              <dt>Receipt</dt><dd><Hash h={c.reference.btc_usd.receipt_hash} epoch={c.reference.btc_usd.epoch_id} /></dd>
              <dt>Bitcoin price, public</dt><dd className="mono">${num(c.reference.btc_usd.public, 2)} <small className="muted">(mempool.space, recorded with the purchase)</small></dd>
              <dt>Hashprice, Telegraph</dt><dd className="mono">{num(c.reference.hashprice_sats_per_ph_day.telegraph, 1)} sats/PH/day <small className="muted">({c.reference.hashprice_sats_per_ph_day.rail ?? "rail n/a"}, miner {c.reference.hashprice_sats_per_ph_day.miner_id ?? "n/a"}, block {num(c.reference.hashprice_sats_per_ph_day.returned_height)})</small></dd>
              <dt>Receipt</dt><dd><Hash h={c.reference.hashprice_sats_per_ph_day.receipt_hash} epoch={c.reference.hashprice_sats_per_ph_day.epoch_id} /></dd>
              <dt>Hashprice, public</dt><dd className="mono">{num(c.reference.hashprice_sats_per_ph_day.public, 1)} sats/PH/day <small className="muted">(the single block at the height Telegraph returned, recomputed from its reward and difficulty; the 144-block mean was {num(c.reference.hashprice_sats_per_ph_day.public_144_mean, 1)})</small></dd>
            </dl>
          </div>

          {c.samples.map((s) => (
            <div key={s.id} className="card" style={{ marginTop: 16 }}>
              <h3>{s.label}</h3>
              <p className="small muted">Asked {s.asked_at_text}. {s.conditions.description}</p>
              <p className="small"><b>Exact {s.prompts.length > 1 ? "questions" : "prompt"}:</b></p>
              <ul className="small">{s.prompts.map((q) => <li key={q.id}>{s.prompts.length > 1 ? `${q.id}: ` : ""}“{q.text}”</li>)}</ul>
              <SampleTable s={s} c={c} />
              {s.parsed.btc_usd.note && <p className="small muted">Bitcoin price: {s.parsed.btc_usd.note}</p>}
              {s.parsed.hashprice_sats_per_ph_day.note && <p className="small muted">Hashprice: {s.parsed.hashprice_sats_per_ph_day.note}</p>}
              <details>
                <summary>Raw answer{s.answers.length > 1 ? "s" : ""}, verbatim</summary>
                {s.answers.map((a, i) => (
                  <blockquote key={i} className="small">
                    {a.prompt_ids.length ? <b>{s.prompts.length > 1 ? `Answer to ${a.prompt_ids.join(", ")}: ` : ""}</b> : null}{a.text}
                    {a.note ? <><br /><span className="muted">{a.note}</span></> : null}
                  </blockquote>
                ))}
              </details>
            </div>
          ))}

          <div className="notice" style={{ marginTop: 16 }}>
            <b>How to read this.</b> These are two manual samples, not a benchmark. Results vary by model and by time, and a different question or day would give different numbers.
            In sample 2 the hashprice came close because it can be derived from block rewards and an assumed network hashrate; the Bitcoin price, which cannot be derived, was off by a wide margin
            in both samples. In sample 1 the assistant itself noted that its first Bitcoin figure was stale. The point is narrower than who is right: the Telegraph value arrives with a receipt and is
            checked against public data, and the assistant's answer does not carry either. {c.disclaimer}
          </div>
        </>
      )}
    </section>
  );
}
