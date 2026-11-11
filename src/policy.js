/**
 * Policy engine — human-defined constraints the agent cannot override.
 * This is the AI Security & Defense angle: the agent holds the keys, but
 * the human holds the rules. A violating payment is refused with a reason.
 *
 * policy.json:
 *   maxPerTxUsd       — max USD value of one payment
 *   dailyCapUsd       — max USD value per UTC day
 *   allowedChains     — destination chains the agent may pay to
 *   allowedRecipients — addresses/accounts the agent may pay
 *   serviceFeeBps     — agent's fee on each executed payment (10 = 0.1%)
 */
function checkPolicy(policy, plan, amountUsd, spentTodayUsd) {
  const reasons = [];
  if (typeof amountUsd === 'number' && amountUsd > policy.maxPerTxUsd) {
    reasons.push(`amount $${amountUsd.toFixed(2)} exceeds per-transaction limit $${policy.maxPerTxUsd}`);
  }
  if (typeof amountUsd === 'number' && spentTodayUsd + amountUsd > policy.dailyCapUsd) {
    reasons.push(`daily cap $${policy.dailyCapUsd} would be exceeded (spent today $${spentTodayUsd.toFixed(2)} + $${amountUsd.toFixed(2)})`);
  }
  if (plan.toChain && !policy.allowedChains.includes(plan.toChain)) {
    reasons.push(`destination chain "${plan.toChain}" is not on the allowlist`);
  }
  // Recipient is allowed if the name OR the resolved address is allowlisted
  // (plan.destinations holds both when an ENS name was resolved).
  const candidates = plan.destinations || (plan.destination ? [plan.destination] : []);
  if (candidates.length && !candidates.some((d) => policy.allowedRecipients.includes(d))) {
    reasons.push(`recipient "${plan.destination}" is not on the allowlist`);
  }
  if (plan.action === 'swap' && !policy.allowedChains.includes(plan.toChain)) {
    reasons.push(`destination chain "${plan.toChain}" is not on the allowlist`);
  }
  return { allowed: reasons.length === 0, reasons };
}

function serviceFee(amountHuman, feeBps) {
  return (amountHuman * feeBps) / 10000;
}

module.exports = { checkPolicy, serviceFee };
