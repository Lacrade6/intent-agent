/**
 * NEAR testnet helpers (near-api-js v5). TESTNET ONLY.
 */
const { connect, keyStores, KeyPair, utils } = require('near-api-js');

let cached = null;

async function getNear(config) {
  if (cached) return cached;
  const ks = new keyStores.InMemoryKeyStore();
  await ks.setKey(config.networkId, config.agentAccountId, KeyPair.fromString(config.agentSecretKey));
  const near = await connect({
    networkId: config.networkId,
    nodeUrl: config.nodeUrl,
    walletUrl: config.walletUrl,
    helperUrl: config.helperUrl,
    keyStore: ks,
  });
  cached = near;
  return near;
}

async function getAgentAccount(config) {
  const near = await getNear(config);
  return near.account(config.agentAccountId);
}

async function getBalanceNear(config, accountId) {
  const near = await getNear(config);
  const acct = await near.account(accountId);
  const state = await acct.state();
  return utils.format.formatNearAmount(state.amount);
}

async function getBalanceYocto(config, accountId) {
  const near = await getNear(config);
  const acct = await near.account(accountId);
  const state = await acct.state();
  return state.amount;
}

/** Send native NEAR on testnet. Returns the real tx hash. */
async function sendNear(config, to, amountNearStr) {
  const acct = await getAgentAccount(config);
  const outcome = await acct.sendMoney(to, utils.format.parseNearAmount(amountNearStr));
  return { hash: outcome.transaction.hash, outcome };
}

module.exports = { getNear, getAgentAccount, getBalanceNear, getBalanceYocto, sendNear };
