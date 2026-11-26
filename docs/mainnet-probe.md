# Mainnet probe

Run 2026-11-22T18:41:27.463Z with `scripts/mainnet-probe.mts`. Free, read-only calls only: no payment was made, nothing was signed, no key was used. The raw log is `data/probe/mainnet-discovery-2026-11-22T18-41-27-463Z.json`.

## Result

**Telegraph does not advertise a mainnet payment option today.** The documented node returns a payment challenge for Ethereum Sepolia (and other test networks) only, and the published documentation lists no mainnet node URL, asset address, payee or Diamond. Because nothing is advertised, Hushrate pins nothing for mainnet and invents nothing.

## Update after the probe (23 Nov 2026)

A member of the Telegraph team replied in the hackathon Discord channel that mainnet is expected in "Dec-Jan, hopefully". That is not a confirmation and no date was given. They also pointed to the Anjoman API as an alternative. The reply came after the probe on this page (22 Nov 2026) and gave no node, asset, payee or payment rail, so there is still nothing real to put in the mainnet entry. Hushrate therefore stays on testnet for this submission, and it has never run on mainnet. Nothing in the results above changes: the probe is a record of what the service advertised on 22 Nov 2026, and the reply does not add a node, asset, payee or rail to it.

## Calls made

| # | Time (UTC) | Call | Why | Status | Result |
|---|---|---|---|---|---|
| 1 | 2026-11-22T18:41:13.302Z | GET https://anjoman.ai/docs/protocol/addresses-and-params | published documentation page | 200 | 3 sentence(s) mention mainnet |
| 2 | 2026-11-22T18:41:15.058Z | GET https://anjoman.ai/docs/protocol/how-it-works | published documentation page | 200 | 1 sentence(s) mention mainnet |
| 3 | 2026-11-22T18:41:15.507Z | GET https://anjoman.ai/docs/using/x402-inference | published documentation page | 200 | 0 sentence(s) mention mainnet |
| 4 | 2026-11-22T18:41:16.359Z | GET https://anjoman.ai/docs/using/escrow-inference | published documentation page | 200 | 1 sentence(s) mention mainnet |
| 5 | 2026-11-22T18:41:16.831Z | GET https://anjoman.ai/docs/using/inference-paths | published documentation page | 200 | 0 sentence(s) mention mainnet |
| 6 | 2026-11-22T18:41:17.279Z | GET https://anjoman.ai/docs/whats-new-v2 | published documentation page | 200 | 0 sentence(s) mention mainnet |
| 7 | 2026-11-22T18:41:17.858Z | GET https://anjoman.ai/docs/using/engine-ask | published documentation page | 200 | 0 sentence(s) mention mainnet |
| 8 | 2026-11-22T18:41:18.315Z | GET https://devnode.telegraphprotocol.com/api/miners | miner catalogue on the documented node | 200 | 2188 miners; fields: id, slug, kind, protocol, name, description, endpoints, input_schema, output_schema, signal_mapping, supported_intents, docs, limitations, base_url, wallet_address, fee_address, activation_status, min_price_usdc, yaml_url, registered_at, total_requests_served, scored, last_scored_epoch, last_scored_at, scores |
| 9 | 2026-11-22T18:41:22.479Z | POST https://devnode.telegraphprotocol.com/engine/v1/ask/71083 | unpaid request: returns the 402 payment terms, nothing is signed or paid | 402 | HTTP 402; networks eip155:84532, solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1, eip155:11155111 |
| 10 | 2026-11-22T18:41:23.120Z | POST https://devnode.telegraphprotocol.com/engine/v1/ask/7320 | unpaid request: returns the 402 payment terms, nothing is signed or paid | 402 | HTTP 402; networks eip155:84532, solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1, eip155:11155111 |
| 11 | 2026-11-22T18:41:24.740Z | GET https://devnode.telegraphprotocol.com/ | documented node root | 200 | HTTP 200; 0 mention(s) of mainnet |
| 12 | 2026-11-22T18:41:25.290Z | GET https://devnode.telegraphprotocol.com/engine/v1/intents/MINING_HASHPRICE_VERIFY_GENERAL | intent description on the documented node | 200 | HTTP 200; 2 mention(s) of mainnet |
| 13 | 2026-11-22T18:41:26.173Z | GET https://telegraphprotocol.com/ | public site root | 200 | HTTP 200; 1 mention(s) of mainnet |
| 14 | 2026-11-22T18:41:26.904Z | POST https://ethereum-rpc.publicnode.com | read-only JSON-RPC: eth_chainId (no key, no transaction) | 200 | chain id 1 |

## What a live 402 advertises today (documented node)

| Miner | Scheme | Network | Asset | Payee | Amount (uUSDC) |
|---|---|---|---|---|---|
| 7320 | exact | eip155:84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0xC0A3FB6d3F1f4B54617d29ffbdA4663Af5F96e2e` | 10000 |
| 7320 | exact | solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | `G53EbeTZSNsAn7bj6iMFUQnq3zpDdEbHhKkPRywo8bix` | 10000 |
| 7320 | escrow | eip155:11155111 | (escrow: no asset field) | `0x72a70e949362670bf8bcead24efc5b8f950aa08b` | 10000 |
| 71083 | exact | eip155:84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0xC0A3FB6d3F1f4B54617d29ffbdA4663Af5F96e2e` | 10000 |
| 71083 | exact | solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | `G53EbeTZSNsAn7bj6iMFUQnq3zpDdEbHhKkPRywo8bix` | 10000 |
| 71083 | escrow | eip155:11155111 | (escrow: no asset field) | `0x72a70e949362670bf8bcead24efc5b8f950aa08b` | 10000 |

Every option is a test network: Ethereum Sepolia (`eip155:11155111`, escrow only today), Base Sepolia (`eip155:84532`) and a Solana test network. **No option is Ethereum mainnet (`eip155:1`) or any other mainnet.** Observation: the Sepolia `exact` option that Hushrate saw until 2026-11-19 is no longer in the challenge; on Sepolia only escrow is offered now, so the exact fallback has nothing to pay on that network.

## What the public site says about mainnet

- The home page (https://telegraphprotocol.com/) shows a statistics row that includes "Jan 2027 Mainnet" next to "Transactions (testnet)": mainnet is presented as upcoming, not live.

The intent description on the node also contains the word mainnet, but it refers to Bitcoin's chain (a block height) and to the EVM chains a miner can read, not to a Telegraph payment network.

## What the documentation says about mainnet

- `protocol/addresses-and-params`: "Most ask you to sign in, solve a captcha or hold a little mainnet ETH."
- `protocol/addresses-and-params`: "Network Configuration Parameter Value Chain Ethereum Sepolia Chain ID 11155111 Canonical mainnet Ethereum RPC (public, no key) https://ethereum-sepolia-rpc."
- `protocol/addresses-and-params`: "3 failed rounds) Minimum Validator stake Set in USD, paid in MACHINA at the pool price ( protocolParams() ) Unbonding period 21 days Epoch duration 24 hours on mainnet; 1 hour on the testnet Commit phase timeout 45 seconds Reveal phase timeout 45 seconds Leader failover timeout 90 seconds Scoring & Penalties Parameter Value C"
- `protocol/how-it-works`: "The canonical chain for Telegraph mainnet is Ethereum ."
- `using/escrow-inference`: "A node on Ethereum mainnet refuses a signature without it."

These sentences are the only mainnet information published: the canonical chain for Telegraph mainnet is Ethereum, and a mainnet epoch is 24 hours (the testnet's is 1 hour). No address, node URL or asset is given.

## What this means for Hushrate

- The `mainnet` entry in `config/networks.json` stays disabled with every value `null`: there is nothing real to put in it.
- When Telegraph publishes mainnet values, they go into that entry (network id, node URL, asset and payee or Diamond, caps), the dry run (`npm run dryrun -- --network mainnet`) validates them against the live challenge before anything is enabled.
- A mainnet read-only RPC works without a key (chain id 1), so the dry run's balance and funding checks need no secret.
- **Not proven:** that a mainnet node exists, what it charges, which miners serve it, and how escrow withdrawal and billing verification behave there (a 24-hour epoch means a billing record can take about a day).

