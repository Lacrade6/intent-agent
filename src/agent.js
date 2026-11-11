/**
 * IntentAgent core: parse -> resolve assets -> policy check -> quote ->
 * confirm -> execute.
 *
 * Execution modes (honest by design):
 * - NEAR -> NEAR (testnet): REAL on-chain transfer via near-api-js.
 *   The agent keeps its service fee by sending (amount - fee); the fee
 *   stays in the agent's account and is recorded in the ledger.
 * - Cross-chain (via NEAR Intents 1-Click): the QUOTE is real (dry quote
 *   from the live 1-Click API, or a labeled estimate from live token
 *   prices if the quote endpoint is down). SETTLEMENT is SIMULATED and
 *   labeled as such — NEAR Intents has no testnet (HACKATHON.md Q-007),
 *   and this demo never touches mainnet or real money.
 */
const { parseInstruction } = require('./parse');
const { fetchTokens, getQuote, estimateFromPrices } = require('./quote');
const { checkPolicy } = require('./policy');
const { findToken, fallbackToken, toBaseUnits, fromBaseUnits, chainLabel } = require('./assets');
const { sendNear, getBalanceNear } = require('./near');
const ledger = require('./ledger');

/** Resolve an ENS name (alice.eth) to its 0x address via a public resolver. */
async function resolveEns(name) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`https://api.ensideas.com/ens/resolve/${encodeURIComponent(name)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    return j && /^0x[0-9a-fA-F]{40}$/.test(j.address) ? j.address : null;
  } catch {
    return null;
  }
}

async function buildPlan(config, instruction) {
  const parsed = parseInstruction(instruction);
  if (!parsed.ok) {
    return { status: 'needs-clarification', instruction, error: parsed.error, hint: parsed.hint };
  }
  const plan = parsed.plan;

  // ENS names (alice.eth) are not valid 1-Click recipients — resolve first.
  if (plan.destination && plan.destination.endsWith('.eth')) {
    const resolved = await resolveEns(plan.destination);
    if (!resolved) {
      return { status: 'needs-clarification', instruction, error: `Could not resolve ENS name ${plan.destination}.`, hint: 'Use a 0x address instead, e.g. pay 5 USDC on Base to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e' };
    }
    plan.resolvedDestination = resolved;
    plan.destinations = [plan.destination, resolved];
  }
  const { tokens, source: tokensSource } = await fetchTokens(config);

  const originToken = findToken(tokens, plan.asset, 'near') || fallbackToken(plan.asset, 'near');
  if (!originToken) {
    return { status: 'needs-clarification', instruction, error: `Unknown asset on NEAR: ${plan.asset}`, hint: 'Assets: NEAR, USDC, ETH.' };
  }
  const destSymbol = plan.toAsset || plan.asset;
  const destToken = findToken(tokens, destSymbol, plan.toChain) || fallbackToken(destSymbol, plan.toChain);
  if (!destToken) {
    return { status: 'needs-clarification', instruction, error: `Unknown asset ${destSymbol} on ${chainLabel(plan.toChain)}`, hint: 'Try USDC on Arbitrum / Base / Ethereum.' };
  }

  const amountHuman = parseFloat(plan.amount);
  const originPrice = typeof originToken.price === 'number' ? originToken.price : null;
  const amountUsd = originPrice !== null ? amountHuman * originPrice : null;

  // Policy check (needs USD value; if no price is available, USD checks are skipped but noted).
  const spentToday = ledger.spentTodayUsd(config);
  const policy = checkPolicy(config.policy, plan, amountUsd, spentToday);
  const feeBps = config.policy.serviceFeeBps;

  const base = {
    instruction, action: plan.action, asset: plan.asset, amount: plan.amount,
    amountUsd, fromChain: plan.fromChain, toChain: plan.toChain,
    destination: plan.destination, resolvedDestination: plan.resolvedDestination || null,
    toAsset: destSymbol,
    originAssetId: originToken.assetId, destinationAssetId: destToken.assetId,
    feeBps, policy, spentTodayUsd: spentToday, tokensSource,
    crossChain: plan.crossChain,
  };

  // ---- Same-chain NEAR transfer: local quote, real execution ----
  if (!plan.crossChain && plan.action === 'send' && plan.asset === 'NEAR') {
    const amountYocto = BigInt(toBaseUnits(plan.amount, 24));
    const feeYocto = (amountYocto * BigInt(feeBps)) / 10000n;
    const recipientYocto = amountYocto - feeYocto;
    const feeNear = parseFloat(fromBaseUnits(feeYocto.toString(), 24));
    const recipientGets = fromBaseUnits(recipientYocto.toString(), 24);
    const quote = {
      source: 'local',
      amountOut: recipientGets,
      amountOutFormatted: recipientGets,
      amountOutUsd: amountUsd !== null ? amountUsd * (1 - feeBps / 10000) : null,
      timeEstimate: 2,
      gas: '~0.00001 NEAR',
    };
    return {
      ...base,
      status: policy.allowed ? 'awaiting-confirmation' : 'refused',
      execution: 'testnet-near',
      quote,
      fee: { amount: feeNear.toFixed(5), asset: 'NEAR', usd: amountUsd !== null ? amountUsd * feeBps / 10000 : null },
      recipientGets, recipientGetsUsd: quote.amountOutUsd,
      _amountYocto: amountYocto.toString(),
      _feeYocto: feeYocto.toString(),
      _recipientYocto: recipientYocto.toString(),
    };
  }

  // ---- Cross-chain (or non-NEAR asset): real 1-Click dry quote ----
  const amountBaseUnits = toBaseUnits(plan.amount, originToken.decimals);
  const recipient = plan.resolvedDestination || plan.destination || config.policy.demoEvmRecipient;
  const q = await getQuote(config, {
    originAsset: originToken.assetId,
    destinationAsset: destToken.assetId,
    amount: amountBaseUnits,
    refundTo: config.policy.quoteRefundTo,
    recipient,
  });

  let quote;
  let quoteSource;
  if (q.ok) {
    quote = q.quote;
    quoteSource = '1click-live';
  } else {
    const est = estimateFromPrices(tokens, originToken, destToken, amountBaseUnits);
    if (!est) {
      return { ...base, status: 'error', error: `1-Click quote failed (${q.error}) and no price estimate is available.`, hint: 'The 1-Click API may be down — retry in a minute.' };
    }
    quote = est;
    quoteSource = 'price-estimate';
  }

  const amountOutUsd = quote.amountOutUsd !== undefined ? parseFloat(quote.amountOutUsd) : null;
  const feeUsd = amountOutUsd !== null ? amountOutUsd * feeBps / 10000 : null;
  const recipientGetsUsd = amountOutUsd !== null ? amountOutUsd - feeUsd : null;
  const destPrice = typeof destToken.price === 'number' ? destToken.price : null;
  const recipientGets = destPrice && recipientGetsUsd !== null
    ? (recipientGetsUsd / destPrice).toFixed(destToken.decimals).replace(/0+$/, '').replace(/\.$/, '')
    : quote.amountOutFormatted;

  return {
    ...base,
    status: policy.allowed ? 'awaiting-confirmation' : 'refused',
    execution: 'simulated-cross-chain',
    quote: {
      source: quoteSource,
      amountOut: quote.amountOut,
      amountOutFormatted: quote.amountOutFormatted,
      amountOutUsd,
      minAmountOut: quote.minAmountOut,
      timeEstimate: quote.timeEstimate ?? null,
      note: quoteSource === 'price-estimate'
        ? 'Live 1-Click quote endpoint was unreachable; estimated from live 1-Click token prices (0.25% unauthenticated fee applied).'
        : 'Live dry quote from the NEAR Intents 1-Click API (no JWT; 0.25% unauthenticated fee included).',
    },
    fee: { amount: null, asset: destSymbol, usd: feeUsd },
    recipientGets, recipientGetsUsd,
    settlementNote: 'SIMULATED SETTLEMENT — NEAR Intents has no testnet (HACKATHON.md Q-007). A real settlement needs a mainnet deposit, which this testnet-only demo never makes.',
  };
}

async function executePlan(config, plan) {
  if (plan.status === 'refused') {
    const entry = ledger.record(config, {
      instruction: plan.instruction, action: plan.action, status: 'refused',
      amount: plan.amount, asset: plan.asset, amountUsd: plan.amountUsd,
      fromChain: plan.fromChain, toChain: plan.toChain, destination: plan.destination,
      policyReasons: plan.policy.reasons,
    });
    return { status: 'refused', reasons: plan.policy.reasons, entry };
  }

  if (plan.execution === 'testnet-near') {
    // Recipient must exist on testnet — a transfer to a missing account fails.
    let recipientBalance;
    try {
      recipientBalance = await getBalanceNear(config, plan.destination);
    } catch {
      return { status: 'error', error: `Recipient account "${plan.destination}" does not exist on NEAR testnet.`, hint: 'Pay an existing testnet account, e.g. the demo recipient in policy.json.' };
    }
    const agentBalance = await getBalanceNear(config, config.agentAccountId);
    if (parseFloat(agentBalance) < parseFloat(plan.amount) + 0.001) {
      return { status: 'error', error: `Agent balance ${agentBalance} NEAR is too low for this payment.`, hint: 'Fund the demo account from the testnet faucet.' };
    }
    const { hash } = await sendNear(config, plan.destination, plan.recipientGets);
    const entry = ledger.record(config, {
      instruction: plan.instruction, action: plan.action, status: 'executed',
      amount: plan.amount, asset: plan.asset, amountUsd: plan.amountUsd,
      fromChain: plan.fromChain, toChain: plan.toChain, destination: plan.destination,
      recipientGets: plan.recipientGets, feeNear: parseFloat(plan.fee.amount), feeUsd: plan.fee.usd,
      quoteSource: plan.quote.source,
      txHash: hash, explorerUrl: config.explorerTx(hash),
      recipientBalanceBefore: recipientBalance,
    });
    return { status: 'executed', txHash: hash, explorerUrl: config.explorerTx(hash), entry };
  }

  // Simulated cross-chain settlement — never a fake tx hash.
  const entry = ledger.record(config, {
    instruction: plan.instruction, action: plan.action, status: 'simulated',
    amount: plan.amount, asset: plan.asset, amountUsd: plan.amountUsd,
    fromChain: plan.fromChain, toChain: plan.toChain, destination: plan.destination || config.policy.demoEvmRecipient,
    resolvedDestination: plan.resolvedDestination || null,
    recipientGets: plan.recipientGets, recipientGetsUsd: plan.recipientGetsUsd,
    feeUsd: plan.fee.usd, feeAsset: plan.fee.asset,
    quoteSource: plan.quote.source,
    quoteAmountOut: plan.quote.amountOutFormatted,
    timeEstimateSec: plan.quote.timeEstimate,
    simulationId: `sim-${Date.now()}`,
    note: plan.settlementNote,
  });
  return { status: 'simulated', entry, note: plan.settlementNote };
}

module.exports = { buildPlan, executePlan };
