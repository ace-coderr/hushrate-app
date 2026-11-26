import type { LedgerRow } from "../lib/data";
import { hourLabel } from "../lib/time";
import { billingProofUrl } from "../lib/billing";

/** The status of an escrow row's billing check, with the link to Telegraph's own record. */
export function BillingCell({ r }: { r: LedgerRow }) {
  const url = r.rail === "escrow" ? billingProofUrl(r.epoch_id, r.receipt_hash) : null;
  return <><BillingStatus r={r} />{url && <><br /><small><a href={url} target="_blank" rel="noopener noreferrer">billing proof</a></small></>}</>;
}

/** What the Billing column says for an escrow row. Never claims verified without a recorded real response. hourLabel already ends with UTC. */
function BillingStatus({ r }: { r: LedgerRow }) {
  if (r.rail !== "escrow") return <span className="muted">n/a (settled per call)</span>;
  if (r.billing_verified === true) return <><span className="badge run">verified</span><br /><small className="muted">{r.billing_checked_at ? hourLabel(r.billing_checked_at) : ""}</small></>;
  if (r.billing_verified === false) return <><span className="badge cut">not found</span><br /><small className="muted">{r.billing_status}</small></>;
  return <><span className="badge hold">pending</span><br /><small className="muted">{r.billing_checked_at ? `checked ${hourLabel(r.billing_checked_at)}, epoch block not recorded yet` : "not checked yet; no result was recorded before the agent was paused"}</small></>;
}
