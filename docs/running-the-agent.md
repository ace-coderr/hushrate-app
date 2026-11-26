# Running the agent, and how it was scheduled

This page is documentation only. **Nothing in this repository is scheduled or runs by itself.**

## What one run does

1. Runs the agent (`npm run agent`): reads public references (mempool.space, CAISO), checks the escrow balance, buys the hashprice and BTC price from Telegraph if this UTC hour has not already bought them, verifies each against a public source, and writes the market tape, status, history, ledger and receipts under `data/`.
2. Runs the billing check (`npm run billing`): for each escrow receipt not yet verified, asks the node for its delivery record and writes `data/billing.json`. Free.
3. The new files in `data/` are committed, and the web app is rebuilt so the site shows them.

## How it was triggered before the pause (description, not configuration)

- A record job ran the tests, then the agent, then the billing check, then committed `data/` and rebuilt and deployed the site. It used the wallet key from a repository secret. Only one run could be active at a time, and it checked out the newest commit before running so the same-hour guard saw earlier purchases.
- It was started in two ways: an hourly schedule at 17 minutes past the hour, and a self-chaining timer job that slept until the next 17 minutes past the hour, started the record job, and then started itself again.
- When committing, generated data was never rebased or merged: the run saved its files, reset to the remote branch, copied its files back, committed and pushed, retrying up to three times.
- A push to the main branch only rebuilt and redeployed the site; it never bought data.
- The mainnet dry run could be started by hand; it used no secrets and never signed.

## Turning the hourly run back on

Do this only if running it is allowed where you host it, and check that host's terms for scheduled automation first.

1. Use a machine you control (or a scheduler whose terms permit it), with this repository, Node 20 or newer and `npm install`.
2. Put a Sepolia **test** wallet key in `.env` on that machine. Never commit it. Fund the escrow (`scripts/fund-escrow.ts`, see the README).
3. Schedule, once an hour: `npm run agent`, then `npm run billing`. One run at a time.
4. Publish the new `data/` however you serve the site: `npm run build -w web` produces `web/dist` with the data copied in.
5. A successful run writes a new `data/status.json` without the paused fields, so the paused banner disappears.

Limits that apply to every run: at most 3 cents per payment, at most 3 paid calls per run, one purchase per intent per UTC hour, about 0.02 test USDC per run.
