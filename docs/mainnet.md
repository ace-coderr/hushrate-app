# Path to mainnet

**Hushrate is NOT live on mainnet and has never run on it.** Every payment recorded here is Ethereum Sepolia test USDC at $0.01 per request. As of 2026-11-22 Telegraph does not advertise a mainnet payment option ([mainnet-probe.md](mainnet-probe.md): free calls, with timestamps), so this repository contains **no mainnet addresses**, and none were invented.

> **Update, 23 Nov 2026.** A member of the Telegraph team replied in the hackathon Discord channel that mainnet is expected in "Dec-Jan, hopefully". That is not a confirmation and no date was given. They also pointed to the Anjoman API as an alternative. The reply came after the probe below (22 Nov 2026) and gave no node, asset, payee or payment rail, so there is still nothing real to put in the mainnet entry. Hushrate therefore stays on testnet for this submission, and it has never run on mainnet.

What exists is the machinery to validate and, once Telegraph publishes mainnet values, to switch safely:

- a **mainnet entry** in `config/networks.json` that is disabled and empty on purpose;
- a **dry run** (`npm run dryrun -- --network mainnet`) that checks every pin and cap against the network's live payment terms, builds the unsigned request and **stops before signing**. It reads no key and imports no payment client. Its last result is `data/mainnet-dryrun.json` (today: `not_configured`, because there is nothing to validate). The same path run on Sepolia as a rehearsal passes: `data/probe/dryrun-rehearsal-sepolia.json`;
- it is run by hand; nothing schedules it;
- a **last gate before any signature** (`assertSigningAllowed`): a dry run never signs, on any network, and a network that is not a testnet signs only with an explicit acknowledgement.

## What differs between Sepolia and mainnet

| Area | Sepolia (today) | Mainnet |
|---|---|---|
| Network entry | Complete, `enabled: true`, `active` | Present but `enabled: false` and every value `null`; `active` stays `sepolia` |
| Chain / CAIP-2 | `11155111` / `eip155:11155111` | Telegraph says its canonical mainnet chain is Ethereum (`eip155:1`); the entry is not filled because no node is documented |
| Node | `https://devnode.telegraphprotocol.com` | **Unknown**: no mainnet node URL is published |
| Asset | Two allow-listed test USDC tokens (6 decimals); the previous one is mintable | **Unknown**: no mainnet asset is published; it would be real USDC and must be pinned with its payee. Nothing is guessed |
| Payee | The Telegraph Diamond `0x72a7…aa08b`, pinned per asset and for escrow | **Unknown** until published; pinned exactly, in the challenge and in the signed message |
| Rails | Escrow first, then exact, then labelled public values. On 2026-11-22 the node offers escrow only on Sepolia (exact is offered on other test networks) | **Unknown** which rails a mainnet node offers; the order of preference is unchanged |
| Caps | `max_amount_per_payment` 30000 (3 cents), `max_paid_calls_per_run` 3, `min_balance_units` 200000 (0.20 USDC) | Must be set explicitly (nothing is defaulted) and re-checked against real prices |
| Price | $0.01 per call | **Unknown**. Telegraph documents price = floor x a demand multiplier (1x to 10x); anything above the 3-cent cap is refused, not paid |
| Funding | Faucet or mint for the test token; `scripts/fund-escrow.ts` (pinned in code to Sepolia, 8 USDC cap per run) | Real USDC bought and deposited by a person; the script needs a deliberate, reviewed edit for another network. Two transactions of **real gas (ETH)**: cost unknown |
| Billing proof | Epoch 1 hour: a call's billing record appears within about an hour | Documented as 24 hours: a billing record can take about a day; the check stays "pending" until then |
| Withdrawal | `requestWithdraw` then wait (about 15 minutes on Sepolia) | **Not documented** for mainnet |
| Failure handling | A refused asset, payee, network or amount stops the run loudly; labelled public values; the paid-data-paused banner after two empty hours | Identical code path. Signing additionally needs `HUSHRATE_MAINNET_ENABLE=I_UNDERSTAND_THIS_USES_REAL_MONEY` |
| Web app | Explorer links, public RPC and node follow the active network in the config | Same; the prose that says "Sepolia" and "test USDC" must be reviewed |
| Miners | 71083 (hashprice) and 7320 (BTC price), chosen on testnet | Ids and scores differ per network: re-probe |

### What is unknown, stated plainly

Mainnet node URL, asset, payee or Diamond, offered rails, price and multiplier, miner ids, escrow withdrawal delay, gas cost of funding. All of these must come from Telegraph, not from this repository.

## How the switch works

1. Telegraph publishes the mainnet values. Put them in the `mainnet` entry of `config/networks.json`: network id, node URL, RPC, asset(s) with their payee, escrow Diamond and token, the expected wallet, explorer, and the three caps. Leave `enabled: false`.
2. Run `npm run dryrun -- --network mainnet` by hand. It must report `all pins passed`, show the amount that would be paid and the unsigned request, and say nothing was signed. A wrong network, payee or asset, an amount above the cap, or an unreadable balance gives `refused` or `unreachable`, and nothing is paid.
3. Only then, deliberately: set `enabled: true`, set `"active": "mainnet"`, fund a dedicated low-balance wallet, give its key to the machine that runs the agent, and set `HUSHRATE_MAINNET_ENABLE`. The agent refuses to start if any of these is missing. The enabled switch and the acknowledgement are guards on purpose: filling the entry and changing `active` is the configuration change, and the guards make sure it cannot happen by accident.

## Cost and risk (at 2 paid calls per run, run hourly; the agent is paused now)

| Item | Amount |
|---|---|
| Per run | $0.02 |
| Per day (24 runs) | $0.48 |
| Per 30 days | $14.40 |
| Ceiling if every cap were reached (3 calls of 3 cents per run) | $0.09 per run, $2.16 per day, $64.80 per 30 days |
| Escrow deposit sized for 7 days / 30 days | $3.36 / $14.40, plus gas for approve and deposit (unknown) |

| If this happens | Hushrate does |
|---|---|
| The asset, payee or network changes | Refuses before signing, names what was asked for, records labelled public values, shows the banner. A person updates the config after checking Telegraph's documentation |
| The price is above 3 cents, or the message amount differs from the quote | Refuses; nothing is signed |
| The facilitator is down or slow | The escrow rail does not use it. A failed call is not billed; the hour falls back to labelled public values |
| The node is down, or the escrow balance cannot be read | No payment of any kind (never a fallback to settlement without knowing the balance) |
| The escrow runs low or empty | A note below 0.20 USDC; below the cost of a run it stops paying and says so |
| A second purchase in the same hour | Blocked per intent by the same-hour guard under both rails |

**Kill switch.** Stop whatever schedules the agent, remove the key from that machine, set `active` back to `sepolia`, and ask the escrow for a withdrawal (two steps; the mainnet delay is not documented). **Top-up.** Deposit again with the funding script after reviewing its pins. **Keys.** A dedicated low-balance wallet used by this agent only and never reused; a local environment file is acceptable for a small balance, not long term. The dry run has no key at all.

## What is NOT proven

- That a mainnet node exists, what it charges and which rails, assets and payees it uses.
- That escrow deposit, call, billing verification and withdrawal behave on mainnet as they do on Sepolia (the billing record is expected after a 24-hour epoch).
- Mainnet gas cost of funding.
- Anything with real money. Nothing in this repository has signed or sent a mainnet payment, and the dry run cannot.

## Checklist before anyone flips it

0. **Learn from 2026-11-17.** Telegraph changed the testnet payment asset and payee without notice ([payment-asset-change.md](payment-asset-change.md)), and the node dropped the Sepolia exact option on a later date. On mainnet the same could happen with real money at stake: keep an explicit allow-list with a pinned payee for each asset, keep the refusal loud, and decide in advance who updates the config and funds the wallet when it does.
1. **Addresses from Telegraph.** From its own documentation or team, never from this repository or a guess.
2. **A real USDC budget and caps.** A small total budget; recompute the table above at real prices.
3. **Key custody.** A dedicated low-balance hot wallet; move to a secrets manager, a short-lived signing service or a smart wallet with a spending limit for anything larger.
4. **Alerts.** A notification when scheduled runs stop (Settings shows the last successful run) and when the balance nears the floor.
5. **Re-verify everything.** Re-run the miner probes on mainnet; re-check the acceptance tolerances (hashprice 1%, BTC price 0.5%); re-test the same-hour guard and the duplicate-payment key with real settlement; confirm what happens to a payment whose request fails upstream; re-read Telegraph's terms for production use.
6. **Scope the claims.** Until all of the above is done and checked, keep the site and README labelled testnet only.
