#!/usr/bin/env node
/**
 * Create the throwaway TESTNET demo accounts for IntentAgent.
 * Uses the NEAR testnet helper (faucet) — no real money, testnet only.
 * Saves the agent account key to demo-account.json (gitignored, chmod 600).
 * The recipient account is created with a throwaway key that is NOT saved.
 */
const fs = require('fs');
const path = require('path');
const { KeyPair } = require('near-api-js');

const HELPER_URL = 'https://helper.testnet.near.org/account';

function suffix() {
  return Math.random().toString(36).slice(2, 6).toLowerCase().replace(/[^a-z0-9]/g, 'x');
}

async function createAccount(accountId, keyPair) {
  const res = await fetch(HELPER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newAccountId: accountId,
      newAccountPublicKey: keyPair.getPublicKey().toString(),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`helper ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  const s = suffix();
  const agentId = `intentagent-${s}.testnet`;
  const recipId = `intentagent-recip-${s}.testnet`;

  const agentKey = KeyPair.fromRandom('ed25519');
  const recipKey = KeyPair.fromRandom('ed25519');

  console.log('Creating agent account:', agentId);
  await createAccount(agentId, agentKey);
  console.log('Creating recipient account:', recipId);
  await createAccount(recipId, recipKey);

  const out = {
    accountId: agentId,
    secretKey: agentKey.toString(),
    recipientId: recipId,
    networkId: 'testnet',
    createdAt: new Date().toISOString(),
    note: 'THROWAWAY TESTNET-ONLY demo account for the NEAR Hackathon. Never mainnet, never real funds.',
  };
  const outPath = path.join(__dirname, '..', 'demo-account.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  fs.chmodSync(outPath, 0o600);
  console.log('Saved agent key to demo-account.json (chmod 600, gitignored).');

  // Keep policy.json in sync: point the allowlist at the fresh recipient.
  const policyPath = path.join(__dirname, '..', 'policy.json');
  try {
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    policy.allowedRecipients = (policy.allowedRecipients || []).map((r) =>
      /^intentagent-recip-[a-z0-9]+\.testnet$/.test(r) ? recipId : r
    );
    if (!policy.allowedRecipients.includes(recipId)) policy.allowedRecipients.unshift(recipId);
    fs.writeFileSync(policyPath, JSON.stringify(policy, null, 2));
    console.log('Updated policy.json allowlist to the new recipient account.');
  } catch (e) {
    console.log('NOTE: could not update policy.json:', e.message);
  }

  console.log(JSON.stringify({ agentId, recipId }, null, 2));
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
