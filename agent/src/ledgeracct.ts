// Reads the wallet's escrow balance from the Telegraph node. A free GET: no key, no signature, no payment.
import { loadNetwork } from "./network.js";

export interface LedgerAccount { available: bigint; deposited: bigint; balance: bigint; unbilled: bigint; withdrawn: bigint; }

/** The read itself, for any node and wallet (the dry run uses it for a network that is not enabled). */
export async function readLedger(node: string, wallet: string, fetcher: typeof fetch = fetch): Promise<LedgerAccount | null> {
  try {
    const r = await fetcher(`${node.replace(/\/$/, "")}/v1/ledger/account/${wallet.toLowerCase()}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const j = await r.json() as Record<string, unknown>;
    const big = (k: string) => { const v = j[k]; if (typeof v !== "string" || !/^\d+$/.test(v)) throw new Error(k); return BigInt(v); };
    return { available: big("available"), deposited: big("deposited"), balance: big("balance"), unbilled: big("unbilled"), withdrawn: big("withdrawn") };
  } catch { return null; }
}

/** null when the balance cannot be read (network error, non-200, unexpected shape): callers must then not pay by settlement. */
export async function ledgerAccount(fetcher: typeof fetch = fetch): Promise<LedgerAccount | null> {
  const net = loadNetwork();
  return readLedger(net.telegraph_node, net.expected_wallet, fetcher);
}

export const usdc = (units: bigint) => (Number(units) / 1e6).toFixed(2);
