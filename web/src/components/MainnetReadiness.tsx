import { useDryRun } from "../lib/data";
import { ago } from "../lib/format";

const LABEL = { not_configured: "not configured", unreachable: "unreachable", refused: "refused", ok: "all pins passed" } as const;

/** The last mainnet dry run, stated plainly. Mainnet has not been run: a dry run validates and stops before signing. */
export function MainnetReadiness({ compact = false }: { compact?: boolean }) {
  const d = useDryRun();
  const r = d.data;
  return (
    <div className="card">
      <h3>Mainnet readiness</h3>
      <p><b>Hushrate has not run on mainnet.</b> Every payment recorded here is Ethereum Sepolia test USDC. The dry run checks the mainnet payment path against the network's live payment terms and stops before signing; it uses no key.</p>
      <p><b>Update, 23 Nov 2026.</b> A member of the Telegraph team replied in the hackathon Discord channel that mainnet is expected in "Dec-Jan, hopefully": not confirmed, and no date was given. They also pointed to the Anjoman API as an alternative. The reply came after the probe (22 Nov 2026) and gave no node, asset, payee or rail, so Hushrate stays on testnet for this submission and has never run on mainnet.</p>
      {d.loading && <p className="muted">Loading the last dry run…</p>}
      {!d.loading && !r && <p className="muted">No dry run is published yet ({d.error}).</p>}
      {r && (
        <dl>
          <dt>Last dry run</dt><dd>{ago(r.generated_at)} · network <span className="mono">{r.network}</span></dd>
          <dt>Result</dt><dd><span className={`badge ${r.status === "ok" ? "run" : r.status === "not_configured" ? "hold" : "cut"}`}>{LABEL[r.status]}</span></dd>
          {!compact && <><dt>What it says</dt><dd>{r.summary}</dd></>}
          {r.would_pay.length > 0 && <><dt>Would pay</dt><dd>{r.would_pay.map((w) => `${w.intent.replace(/_GENERAL$/, "")}: ${w.rail}${w.amount_uusdc ? ` ${w.amount_uusdc} uUSDC` : ""}`).join("; ")}. Nothing was signed.</dd></>}
          <dt>Signing</dt><dd>{r.signing}</dd>
        </dl>
      )}
      <p className="small muted">Telegraph does not advertise a mainnet payment option yet (probe in docs/mainnet-probe.md), so the mainnet entry in the config is empty on purpose. See <a href="#/docs">Docs, Path to mainnet</a>.</p>
    </div>
  );
}
