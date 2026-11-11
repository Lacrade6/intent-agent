/**
 * Asset + chain registry.
 *
 * 1-Click assetIds are resolved from the LIVE token list
 * (GET https://1click.chaindefuser.com/v0/tokens). The FALLBACK table below
 * holds assetIds verified live on 2026-11-11, used only if the list fetch
 * fails.
 */
const FALLBACK_TOKENS = [
  { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.72 },
  { assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', symbol: 'USDC', blockchain: 'near', decimals: 6, price: 1 },
  { assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near', symbol: 'USDC', blockchain: 'arbitrum', decimals: 6, price: 1 },
  { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', symbol: 'USDC', blockchain: 'base', decimals: 6, price: 1 },
  { assetId: 'nep141:eth.bridge.near', symbol: 'ETH', blockchain: 'near', decimals: 18, price: 2079.75 },
];

const CHAIN_ALIASES = {
  near: 'near',
  eth: 'ethereum', ethereum: 'ethereum',
  arb: 'arbitrum', arbitrum: 'arbitrum',
  base: 'base',
  op: 'optimism', optimism: 'optimism',
  polygon: 'polygon', matic: 'polygon',
  bsc: 'bsc', bnb: 'bsc',
  solana: 'solana', sol: 'solana',
};

const CHAIN_LABELS = {
  near: 'NEAR', ethereum: 'Ethereum', arbitrum: 'Arbitrum', base: 'Base',
  optimism: 'Optimism', polygon: 'Polygon', bsc: 'BNB Chain', solana: 'Solana',
};

function normalizeChain(name) {
  if (!name) return null;
  return CHAIN_ALIASES[name.toLowerCase().trim()] || null;
}

function chainLabel(chain) {
  return CHAIN_LABELS[chain] || chain;
}

/** Find a token in a token list by symbol + blockchain. */
function findToken(tokens, symbol, blockchain) {
  const sym = symbol.toUpperCase();
  const list = tokens || [];
  return (
    list.find((t) => t.symbol === sym && t.blockchain === blockchain) ||
    // The 1-Click list calls wrapped NEAR "wNEAR"; native NEAR == wNEAR price.
    (sym === 'NEAR' && blockchain === 'near'
      ? list.find((t) => t.assetId === 'nep141:wrap.near')
      : null) ||
    null
  );
}

function fallbackToken(symbol, blockchain) {
  return FALLBACK_TOKENS.find((t) => t.symbol === symbol.toUpperCase() && t.blockchain === blockchain) || null;
}

/** Decimal string -> base units (BigInt string). */
function toBaseUnits(amountStr, decimals) {
  const [whole = '0', frac = ''] = String(amountStr).split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0')).toString();
}

/** Base units (string) -> human decimal string. */
function fromBaseUnits(units, decimals) {
  const v = BigInt(units);
  const d = 10n ** BigInt(decimals);
  const whole = v / d;
  const frac = (v % d).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

function isNearAccount(addr) {
  return /^[a-z0-9._-]+\.(near|testnet)$/.test(addr) || addr.endsWith('.near') || addr.endsWith('.testnet');
}

function isEvmAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

module.exports = {
  FALLBACK_TOKENS, CHAIN_ALIASES, CHAIN_LABELS,
  normalizeChain, chainLabel, findToken, fallbackToken,
  toBaseUnits, fromBaseUnits, isNearAccount, isEvmAddress,
};
