/**
 * Config loader. Everything is TESTNET-only.
 * The agent key lives in demo-account.json (gitignored, chmod 600) — a
 * throwaway testnet account created by scripts/create-demo-account.js.
 * No mainnet, no real funds, no secrets in the repo.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig() {
  const demo = loadJson(path.join(ROOT, 'demo-account.json'), null);
  const policy = loadJson(path.join(ROOT, 'policy.json'), null);
  if (!demo) {
    throw new Error('demo-account.json not found — run: node scripts/create-demo-account.js');
  }
  if (!policy) throw new Error('policy.json not found');
  ensureDataDir();
  return {
    root: ROOT,
    dataDir: DATA_DIR,
    networkId: 'testnet',
    nodeUrl: 'https://rpc.testnet.near.org',
    walletUrl: 'https://testnet.mynearwallet.com',
    helperUrl: 'https://helper.testnet.near.org',
    explorerTx: (h) => `https://testnet.nearblocks.io/txns/${h}`,
    explorerAccount: (a) => `https://testnet.nearblocks.io/address/${a}`,
    agentAccountId: demo.accountId,
    agentSecretKey: demo.secretKey,
    recipientAccountId: demo.recipientId,
    policy,
    policyFile: path.join(ROOT, 'policy.json'),
    historyFile: path.join(DATA_DIR, 'history.json'),
    tokensCacheFile: path.join(DATA_DIR, 'tokens-cache.json'),
  };
}

module.exports = { loadConfig, loadJson };
