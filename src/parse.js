/**
 * Natural-language intent parser (deterministic, regex-based — no LLM needed
 * for the demo grammar).
 *
 * Supported instructions:
 *   "send 0.1 NEAR to bob.near"
 *   "swap 2 NEAR to USDC on Arbitrum"
 *   "pay 5 USDC on Base to alice.eth"
 *   "pay 5 USDC on Base to 0x742d...44e"
 *
 * Returns { ok: true, plan } or { ok: false, error, hint }.
 * The parser never guesses: a missing chain for an EVM destination, or an
 * unknown asset/chain, is a clarification request, not a guess.
 */
const { normalizeChain, isNearAccount, isEvmAddress } = require('./assets');

const AMOUNT = '(\\d+(?:\\.\\d+)?)';
const ASSET = '([A-Za-z]{2,10})';
const DEST = '([A-Za-z0-9._-]+|0x[0-9a-fA-F]{40})';
const CHAIN = '([A-Za-z]+)';

const PATTERNS = [
  // pay 5 USDC on Base to alice.eth
  new RegExp(`^pay\\s+${AMOUNT}\\s+${ASSET}\\s+on\\s+${CHAIN}\\s+to\\s+${DEST}$`, 'i'),
  // swap 2 NEAR to USDC on Arbitrum
  new RegExp(`^swap\\s+${AMOUNT}\\s+${ASSET}\\s+to\\s+${ASSET}\\s+on\\s+${CHAIN}$`, 'i'),
  // swap 2 NEAR to USDC (defaults destination chain to NEAR)
  new RegExp(`^swap\\s+${AMOUNT}\\s+${ASSET}\\s+to\\s+${ASSET}$`, 'i'),
  // send 0.1 NEAR to bob.near
  new RegExp(`^send\\s+${AMOUNT}\\s+${ASSET}\\s+to\\s+${DEST}$`, 'i'),
  // send 0.1 NEAR on NEAR to bob.near
  new RegExp(`^send\\s+${AMOUNT}\\s+${ASSET}\\s+on\\s+${CHAIN}\\s+to\\s+${DEST}$`, 'i'),
];

function parseInstruction(text) {
  const input = String(text || '').trim().replace(/\s+/g, ' ');
  if (!input) return { ok: false, error: 'Empty instruction.', hint: 'Try: send 0.1 NEAR to bob.near' };

  let m = null;
  let kind = null;
  for (const re of PATTERNS) {
    m = input.match(re);
    if (m) {
      kind = re.source.startsWith('^pay') ? 'pay' : re.source.startsWith('^swap') ? 'swap' : 'send';
      break;
    }
  }
  if (!m) {
    return {
      ok: false,
      error: `Could not parse: "${input}"`,
      hint: 'Supported: "send 0.1 NEAR to bob.near", "swap 2 NEAR to USDC on Arbitrum", "pay 5 USDC on Base to alice.eth".',
    };
  }

  if (kind === 'pay') {
    const [, amount, asset, chainName, dest] = m;
    const chain = normalizeChain(chainName);
    if (!chain) return { ok: false, error: `Unknown chain: ${chainName}`, hint: 'Chains: NEAR, Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain.' };
    return {
      ok: true,
      plan: {
        action: 'pay', asset: asset.toUpperCase(), amount,
        fromChain: 'near', toChain: chain, destination: dest,
        crossChain: true,
      },
    };
  }

  if (kind === 'swap') {
    const [, amount, fromAsset, toAsset, chainName] = m;
    const chain = chainName ? normalizeChain(chainName) : 'near';
    if (!chain) return { ok: false, error: `Unknown chain: ${chainName}`, hint: 'Chains: NEAR, Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain.' };
    return {
      ok: true,
      plan: {
        action: 'swap', asset: fromAsset.toUpperCase(), amount,
        toAsset: toAsset.toUpperCase(),
        fromChain: 'near', toChain: chain, destination: null, // agent receives on destination chain
        crossChain: chain !== 'near' || toAsset.toUpperCase() !== fromAsset.toUpperCase(),
      },
    };
  }

  // send
  const [, amount, asset, chainNameOrDest, maybeDest] = m;
  let dest = maybeDest || chainNameOrDest;
  let chainName = maybeDest ? chainNameOrDest : null;
  if (chainName) {
    const chain = normalizeChain(chainName);
    if (!chain) return { ok: false, error: `Unknown chain: ${chainName}`, hint: 'Chains: NEAR, Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain.' };
    if (chain !== 'near') {
      return { ok: false, error: 'Direct sends only run on NEAR in this demo.', hint: 'For other chains use: pay 5 USDC on Base to alice.eth' };
    }
  }
  if (!isNearAccount(dest) && !isEvmAddress(dest)) {
    return { ok: false, error: `Unrecognized destination: ${dest}`, hint: 'Use a NEAR account (bob.near) or an EVM address (0x...).' };
  }
  if (isEvmAddress(dest)) {
    return {
      ok: false,
      error: 'EVM destination needs a chain — I will not guess it.',
      hint: `Try: pay ${amount} ${asset.toUpperCase()} on Base to ${dest}`,
    };
  }
  return {
    ok: true,
    plan: {
      action: 'send', asset: asset.toUpperCase(), amount,
      fromChain: 'near', toChain: 'near', destination: dest,
      crossChain: false,
    },
  };
}

module.exports = { parseInstruction };
