/**
 * Payment ledger — append-only JSON history (data/history.json).
 * Each entry records the instruction, plan, quote source, policy decision,
 * fee earned, and either a REAL testnet tx hash or a clearly-marked
 * simulated settlement (cross-chain legs are simulated because NEAR Intents
 * has no testnet — see README).
 */
const fs = require('fs');

function loadHistory(config) {
  try {
    const h = JSON.parse(fs.readFileSync(config.historyFile, 'utf8'));
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

function saveHistory(config, history) {
  fs.writeFileSync(config.historyFile, JSON.stringify(history, null, 2));
}

function record(config, entry) {
  const history = loadHistory(config);
  entry.id = `pay-${Date.now()}-${history.length}`;
  entry.recordedAt = new Date().toISOString();
  history.push(entry);
  saveHistory(config, history);
  return entry;
}

function totalFeesEarned(config) {
  const history = loadHistory(config);
  let near = 0;
  let usd = 0;
  for (const e of history) {
    if (e.status === 'executed' || e.status === 'simulated') {
      near += e.feeNear || 0;
      usd += e.feeUsd || 0;
    }
  }
  return { near, usd, count: history.filter((e) => e.status === 'executed' || e.status === 'simulated').length };
}

function spentTodayUsd(config) {
  const history = loadHistory(config);
  const today = new Date().toISOString().slice(0, 10);
  let usd = 0;
  for (const e of history) {
    if ((e.status === 'executed' || e.status === 'simulated') && e.recordedAt.slice(0, 10) === today) {
      usd += e.amountUsd || 0;
    }
  }
  return usd;
}

module.exports = { loadHistory, saveHistory, record, totalFeesEarned, spentTodayUsd };
