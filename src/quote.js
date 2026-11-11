/**
 * NEAR Intents 1-Click API client.
 * Base: https://1click.chaindefuser.com/v0 (docs: docs.near-intents.org)
 *
 * Endpoints verified live 2026-11-11:
 *   GET  /v0/tokens            — no auth, live prices
 *   POST /v0/quote             — dry quotes need NO JWT (0.25% unauthenticated
 *                                fee applies to real swaps). Required fields:
 *                                dry, swapType, slippageTolerance,
 *                                originAsset, depositType, destinationAsset,
 *                                amount, refundTo, refundType, recipient,
 *                                recipientType, deadline.
 *   GET  /v0/status?depositAddress=... — swap status (not needed for dry demo)
 *
 * NOTE: NEAR Intents has NO testnet (per HACKATHON.md Q-007). Quotes here are
 * always dry:true — real settlement needs a mainnet deposit, which this
 * testnet-only demo never does. If the live quote service errors, we fall
 * back to an estimate computed from live token prices and label it as such.
 */
const fs = require('fs');
const { fallbackToken } = require('./assets');

const BASE = 'https://1click.chaindefuser.com/v0';
const TOKENS_TTL_MS = 60 * 60 * 1000;

async function fetchJson(url, options = {}, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep raw text */ }
    return { status: res.status, ok: res.ok, json, text };
  } finally {
    clearTimeout(t);
  }
}

async function fetchTokens(config) {
  // Fresh cache?
  try {
    const cached = JSON.parse(fs.readFileSync(config.tokensCacheFile, 'utf8'));
    if (cached && Date.now() - cached.fetchedAt < TOKENS_TTL_MS && Array.isArray(cached.tokens)) {
      return { tokens: cached.tokens, source: 'cache' };
    }
  } catch { /* no cache */ }
  const { status, ok, json } = await fetchJson(`${BASE}/tokens`);
  if (ok && Array.isArray(json)) {
    fs.writeFileSync(config.tokensCacheFile, JSON.stringify({ fetchedAt: Date.now(), tokens: json }));
    return { tokens: json, source: '1click-live' };
  }
  // Fall back to the verified table + any cache.
  try {
    const cached = JSON.parse(fs.readFileSync(config.tokensCacheFile, 'utf8'));
    if (Array.isArray(cached.tokens)) return { tokens: cached.tokens, source: 'cache-stale' };
  } catch { /* ignore */ }
  const { FALLBACK_TOKENS } = require('./assets');
  return { tokens: FALLBACK_TOKENS, source: 'fallback-table' };
}

function priceOf(tokens, assetId) {
  const t = tokens.find((x) => x.assetId === assetId);
  return t && typeof t.price === 'number' ? t.price : null;
}

async function getQuote(config, params, attempts = 3) {
  const body = {
    dry: true,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100,
    depositType: 'ORIGIN_CHAIN',
    recipientType: 'DESTINATION_CHAIN',
    refundType: 'ORIGIN_CHAIN',
    deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    ...params,
  };
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const { ok, json } = await fetchJson(`${BASE}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, 60000);
      if (ok && json && json.quote) {
        return { ok: true, quote: json.quote, source: '1click-live', correlationId: json.correlationId };
      }
      lastError = (json && (json.message || json.error)) || `HTTP error (no body)`;
    } catch (e) {
      lastError = e.name === 'AbortError' ? 'quote request timed out' : e.message;
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  return { ok: false, error: lastError || 'quote failed' };
}

/**
 * Estimate a cross-chain swap from LIVE token prices (used only when the
 * 1-Click quote endpoint is unreachable). Clearly labeled by the caller.
 */
function estimateFromPrices(tokens, originAsset, destinationAsset, amountBaseUnits) {
  const origin = tokens.find((t) => t.assetId === originAsset.assetId);
  const dest = tokens.find((t) => t.assetId === destinationAsset.assetId);
  const o = origin || fallbackToken(originAsset.symbol, originAsset.blockchain);
  const d = dest || fallbackToken(destinationAsset.symbol, destinationAsset.blockchain);
  if (!o || !d || typeof o.price !== 'number' || typeof d.price !== 'number') return null;
  const { fromBaseUnits, toBaseUnits } = require('./assets');
  const amountHuman = parseFloat(fromBaseUnits(amountBaseUnits, o.decimals));
  const usd = amountHuman * o.price;
  const outHuman = (usd * 0.9975) / d.price; // minus 0.25% unauthenticated fee
  return {
    amountIn: amountBaseUnits,
    amountInFormatted: amountHuman.toString(),
    amountInUsd: usd.toFixed(6),
    amountOut: toBaseUnits(outHuman.toFixed(d.decimals), d.decimals),
    amountOutFormatted: outHuman.toFixed(6).replace(/0+$/, '').replace(/\.$/, ''),
    amountOutUsd: (usd * 0.9975).toFixed(6),
    timeEstimate: null,
  };
}

module.exports = { fetchTokens, getQuote, estimateFromPrices, priceOf, BASE };
