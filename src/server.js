#!/usr/bin/env node
/**
 * IntentAgent dashboard — TESTNET ONLY.
 * Serves a single-page UI + JSON API on PORT (default 3000).
 *
 * API:
 *   GET  /api/status          treasury balance, policy, fees, history count
 *   GET  /api/history         payment ledger
 *   GET  /api/policy          current policy
 *   POST /api/policy          update policy (JSON body)
 *   POST /api/plan   {text}   parse + policy + quote (no execution)
 *   POST /api/execute {planId} execute a pending plan (real testnet transfer
 *                              for NEAR sends; simulated cross-chain leg)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { loadConfig } = require('./config');
const { buildPlan, executePlan } = require('./agent');
const { getBalanceNear } = require('./near');
const ledger = require('./ledger');

const config = loadConfig();
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pending = new Map(); // planId -> { plan, expiresAt }

function planId() {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

app.get('/api/status', async (req, res) => {
  try {
    const balance = await getBalanceNear(config, config.agentAccountId);
    const recipBalance = await getBalanceNear(config, config.recipientAccountId);
    const fees = ledger.totalFeesEarned(config);
    res.json({
      network: 'testnet',
      agent: config.agentAccountId,
      balance,
      recipient: config.recipientAccountId,
      recipientBalance: recipBalance,
      policy: config.policy,
      feesEarned: fees,
      explorerAccount: config.explorerAccount(config.agentAccountId),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/history', (req, res) => {
  res.json(ledger.loadHistory(config).slice().reverse());
});

app.get('/api/policy', (req, res) => res.json(config.policy));

app.post('/api/policy', (req, res) => {
  const p = req.body || {};
  const next = { ...config.policy };
  if (typeof p.maxPerTxUsd === 'number' && p.maxPerTxUsd > 0) next.maxPerTxUsd = p.maxPerTxUsd;
  if (typeof p.dailyCapUsd === 'number' && p.dailyCapUsd > 0) next.dailyCapUsd = p.dailyCapUsd;
  if (typeof p.serviceFeeBps === 'number' && p.serviceFeeBps >= 0 && p.serviceFeeBps <= 1000) next.serviceFeeBps = p.serviceFeeBps;
  if (Array.isArray(p.allowedChains)) next.allowedChains = p.allowedChains;
  if (Array.isArray(p.allowedRecipients)) next.allowedRecipients = p.allowedRecipients;
  config.policy = next;
  fs.writeFileSync(config.policyFile, JSON.stringify(next, null, 2));
  res.json(next);
});

app.post('/api/plan', async (req, res) => {
  const text = (req.body && req.body.text) || '';
  try {
    const plan = await buildPlan(config, text);
    if (plan.status === 'awaiting-confirmation') {
      const id = planId();
      plan.planId = id;
      pending.set(id, { plan, expiresAt: Date.now() + 5 * 60 * 1000 });
    }
    res.json(plan);
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

app.post('/api/execute', async (req, res) => {
  const entry = pending.get(req.body && req.body.planId);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Plan expired or not found — make a new plan.' });
  }
  pending.delete(req.body.planId);
  try {
    const result = await executePlan(config, entry.plan);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IntentAgent dashboard: http://localhost:${PORT} (NEAR testnet only)`);
  console.log(`Agent account: ${config.agentAccountId}`);
});
