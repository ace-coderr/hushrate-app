import { useLatest, useStatus } from "../lib/data";

/** Says plainly that nothing is running. The timestamp is the one on data/latest.json, the last run that was recorded. */
export function PausedBanner() {
  const status = useStatus();
  const latest = useLatest();
  const p = status.data?.agent_paused;
  if (!p) return null;
  const at = latest.data?.recorded_at ?? p.last_run;
  return (
    <div className="notice warn" role="status">
      <b>{p.message}</b> Last run: {at.slice(0, 16).replace("T", " ")} UTC. The numbers on this site are the recorded snapshot; nothing new is being bought.
    </div>
  );
}
