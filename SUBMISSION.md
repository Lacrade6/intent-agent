# IntentAgent — submission pack

For the parent agent / team lead. Do NOT submit twice — one submission per
project. The human confirms the full payload before sending.

## 1. `idea` field (20–2000 characters)

> AI agents are starting to earn and spend money on their own — paying for APIs, data, and other agents' work. But today an agent with a wallet is an all-or-nothing risk: give it your keys and it can drain the treasury; don't, and it can't pay for anything. IntentAgent fixes this with plain-language payments guarded by a human policy engine. You (or another agent) say 'send 0.1 NEAR to bob.near' or 'swap 1 NEAR to USDC on Arbitrum'; IntentAgent parses the intent, fetches a real cross-chain quote from the NEAR Intents 1-Click API, checks it against your rules (max per transaction, daily cap, allowlisted recipients and chains), and only executes after explicit confirmation. Violations are refused with a clear reason and recorded. The agent earns a small configurable service fee (0.1% default) on each payment it executes — a real revenue model for agent work. NEAR makes this possible: Intents settle across chains from one account, and testnet + near-api-js give us real on-chain execution for NEAR payments. Cross-chain settlement is simulated in this demo because NEAR Intents has no testnet; the quote is live and the boundary is labeled everywhere.

## 2. X demo post (draft — the human posts it)

> AI agents need to pay — but handing one your keys drains treasuries. IntentAgent takes "send 0.1 NEAR to bob.near", quotes via NEAR Intents, checks YOUR policy, then pays. Demo + real testnet tx below. Built at NEAR HACKATHON @NEARProtocol #NEARHackathon
>
> Repo: https://github.com/Lacrade6/intent-agent

Post must: say it was built at NEAR HACKATHON, tag @NEARProtocol and
#NEARHackathon, attach the demo video or screenshots
(`docs/screenshots/cli-demo.png`, `docs/screenshots/dashboard.png`).

## 3. Submission fields

| Field | Value |
|---|---|
| projectName | `IntentAgent` |
| tracks | `["agents", "business", "security", "defi"]` — Agent Economy, Autonomous Business, AI Security & Defense, Unstoppable DeFi |
| projectUrl | https://github.com/Lacrade6/intent-agent |
| email | lacrade400@gmail.com |
| nearAddress (prize payout, mainnet) | `8d40beb9683aab8627229722aafb6ab4b2f3b6af3fdcab0db5bfe5b2c1971ca0` (64-hex implicit account) |
| leadName | TODO — human to confirm |
| size | TODO — human to confirm (`1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`) |
| demoUrl | TODO — link to the X post, after publishing |
| idea | Section 1 above |
| consent | `true` (only after the human agrees to the contact notice) |

Submit via https://nearhackathon.com/#apply or
`POST https://nearhackathon.com/api/applications` (see HACKATHON.md).
Deadline: **2026-11-14T23:59:00Z**. Repo must be public by then.
