#!/usr/bin/env node
/**
 * IntentAgent CLI — TESTNET ONLY.
 *
 *   node src/cli.js "send 0.1 NEAR to bob.near"   (asks for confirmation)
 *   node src/cli.js --yes "send 0.1 NEAR to bob.near"
 *   node src/cli.js --quote "swap 1 NEAR to USDC on Arbitrum"  (quote only)
 *   node src/cli.js --demo        (scripted demo: refusal, cross-chain quote,
 *                                  real testnet payment)
 *   node src/cli.js balance       (treasury balance)
 *   node src/cli.js history       (payment ledger)
 *   node src/cli.js policy        (current policy)
 */
const readline = require('readline');
const { loadConfig } = require('./config');
const { buildPlan, executePlan } = require('./agent');
const { getBalanceNear } = require('./near');
const ledger = require('./ledger');
const { chainLabel } = require('./assets');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

function printPlan(plan) {
  console.log(`\n── Plan ──────────────────────────────────────────────`);
  console.log(`Instruction : ${plan.instruction}`);
  console.log(`Action      : ${plan.action} ${plan.amount} ${plan.asset} (${plan.fromChain} → ${plan.toChain})`);
  if (plan.destination) console.log(`Destination : ${plan.destination}`);
  if (plan.resolvedDestination) console.log(`Resolved    : ${plan.resolvedDestination} (ENS)`);
  if (plan.toAsset) console.log(`Receive     : ${plan.toAsset} on ${chainLabel(plan.toChain)}`);
  if (plan.amountUsd !== null && plan.amountUsd !== undefined) console.log(`Value       : $${plan.amountUsd.toFixed(4)}`);
  console.log(`Quote source: ${plan.quote.source}`);
  console.log(`You pay     : ${plan.amount} ${plan.asset}`);
  console.log(`Recipient gets: ${plan.recipientGets} ${plan.toAsset || plan.asset}${plan.recipientGetsUsd !== null && plan.recipientGetsUsd !== undefined ? ` ($${plan.recipientGetsUsd.toFixed(4)})` : ''}`);
  console.log(`Service fee : ${plan.feeBps / 100}%${plan.fee.amount ? ` = ${plan.fee.amount} ${plan.fee.asset}` : ''}${plan.fee.usd !== null && plan.fee.usd !== undefined ? ` ($${plan.fee.usd.toFixed(4)})` : ''}`);
  if (plan.quote.timeEstimate) console.log(`Time estimate: ~${plan.quote.timeEstimate}s`);
  if (plan.quote.note) console.log(`Note        : ${plan.quote.note}`);
  if (plan.execution === 'simulated-cross-chain') console.log(`Execution   : ${plan.settlementNote}`);
  else console.log(`Execution   : REAL testnet transfer (NEAR testnet)`);
  if (!plan.policy.allowed) {
    console.log(`\n⛔ POLICY REFUSED:`);
    for (const r of plan.policy.reasons) console.log(`   - ${r}`);
  }
}

async function runInstruction(config, text, { autoConfirm, quoteOnly }) {
  const plan = await buildPlan(config, text);
  if (plan.status === 'needs-clarification' || plan.status === 'error') {
    console.log(`\n❓ ${plan.error}`);
    if (plan.hint) console.log(`   Hint: ${plan.hint}`);
    return plan;
  }
  printPlan(plan);
  if (plan.status === 'refused') {
    const res = await executePlan(config, plan); // records the refusal
    console.log(`\n⛔ Refused and recorded in the ledger (id ${res.entry.id}).`);
    return plan;
  }
  if (quoteOnly) {
    console.log('\n(quote only — nothing executed)');
    return plan;
  }
  let confirmed = autoConfirm;
  if (!confirmed) {
    const ans = await ask('\nExecute this payment? [y/N] ');
    confirmed = ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes';
  }
  if (!confirmed) {
    console.log('Cancelled — nothing executed.');
    return plan;
  }
  const res = await executePlan(config, plan);
  if (res.status === 'executed') {
    console.log(`\n✅ EXECUTED on NEAR testnet`);
    console.log(`   tx hash : ${res.txHash}`);
    console.log(`   explorer: ${res.explorerUrl}`);
  } else if (res.status === 'simulated') {
    console.log(`\n🔶 SIMULATED settlement (no real tx — see note above)`);
    console.log(`   simulation id: ${res.entry.simulationId}`);
  } else {
    console.log(`\n❌ ${res.error}`);
    if (res.hint) console.log(`   Hint: ${res.hint}`);
  }
  return plan;
}

async function runDemo(config) {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  IntentAgent — scripted demo (NEAR testnet only)');
  console.log(`  Agent: ${config.agentAccountId}   Recipient: ${config.recipientAccountId}`);
  console.log('══════════════════════════════════════════════════════════');

  console.log('\n[Act 1] POLICY — the agent refuses a bad payment');
  await runInstruction(config, 'send 100 NEAR to mallory.near', { autoConfirm: false, quoteOnly: true });

  console.log('\n[Act 2] CROSS-CHAIN QUOTE — real 1-Click dry quote, simulated settlement');
  await runInstruction(config, 'swap 1 NEAR to USDC on Arbitrum', { autoConfirm: true, quoteOnly: false });

  console.log('\n[Act 3] REAL TESTNET PAYMENT — executed on-chain');
  await runInstruction(config, `send 0.01 NEAR to ${config.recipientAccountId}`, { autoConfirm: true, quoteOnly: false });

  const fees = ledger.totalFeesEarned(config);
  console.log('\n── Demo summary ────────────────────────────────────────');
  console.log(`Payments recorded: ${fees.count}   Fees earned: ${fees.near.toFixed(5)} NEAR ($${fees.usd.toFixed(4)})`);
  console.log(`Ledger: data/history.json`);
}

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);
  const autoConfirm = args.includes('--yes') || args.includes('-y');
  const quoteOnly = args.includes('--quote');
  const rest = args.filter((a) => !a.startsWith('--') && a !== '-y');

  if (args.includes('--demo')) return runDemo(config);
  if (rest[0] === 'balance') {
    console.log(`Agent ${config.agentAccountId}: ${await getBalanceNear(config, config.agentAccountId)} NEAR (testnet)`);
    console.log(`Recipient ${config.recipientAccountId}: ${await getBalanceNear(config, config.recipientAccountId)} NEAR (testnet)`);
    return;
  }
  if (rest[0] === 'history') {
    console.log(JSON.stringify(ledger.loadHistory(config), null, 2));
    return;
  }
  if (rest[0] === 'policy') {
    console.log(JSON.stringify(config.policy, null, 2));
    return;
  }
  const text = rest.join(' ');
  if (!text) {
    console.log('Usage: node src/cli.js "send 0.1 NEAR to bob.near" [--yes] [--quote] | --demo | balance | history | policy');
    process.exit(1);
  }
  await runInstruction(config, text, { autoConfirm, quoteOnly });
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
