#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MARKER_FILE = '.3dvr-venture-sandbox';
const EXTERNAL_ACTIONS = [
  'publish', 'outreach', 'account_create', 'wallet_create', 'transaction_sign',
  'spend', 'contract_accept', 'customer_fulfillment', 'refund'
];

function defaultCharter(ventureId = 'sandbox-001') {
  return {
    schemaVersion: 1,
    ventureId,
    name: 'Site Steward Sandbox 001',
    mode: 'simulation_only',
    lawfulSponsor: null,
    currency: 'USD_SIMULATED',
    seedCapitalCents: 5000,
    publicDisclosure: 'Simulation only. No customers, payments, outreach, or public service exist.',
    purpose: 'Test whether an agent can plan and account for a narrow, useful service without external action.',
    actionPolicy: Object.fromEntries(EXTERNAL_ACTIONS.map((action) => [action, 'blocked'])),
    allowedActions: ['local_drafting', 'local_research_notes', 'simulation', 'reporting'],
    stopConditions: ['uncertain_authority', 'policy_violation', 'negative_simulated_runway']
  };
}

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function appendChained(file, entry) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean) : [];
  const previousHash = lines.length ? JSON.parse(lines.at(-1)).hash : null;
  const body = { ...entry, previousHash };
  const record = { ...body, hash: sha(JSON.stringify(body)) };
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return record;
}

function ensureIdentity(stateDir, ventureId) {
  const privatePath = path.join(stateDir, 'machine-private-key.pem');
  const publicPath = path.join(stateDir, 'machine-identity.json');
  if (!fs.existsSync(privatePath)) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    fs.writeFileSync(publicPath, JSON.stringify({
      ventureId,
      algorithm: 'Ed25519',
      publicKey: publicPem,
      fingerprint: sha(publicPem),
      notice: 'Machine identity only; this is not a cryptocurrency wallet.'
    }, null, 2));
  }
  fs.chmodSync(privatePath, 0o600);
  return JSON.parse(fs.readFileSync(publicPath, 'utf8'));
}

function calculateRunwayDays(cashCents, reservedCents, monthlyCostCents) {
  if (monthlyCostCents <= 0) return null;
  return Math.max(0, Math.floor(((cashCents - reservedCents) / monthlyCostCents) * 30));
}

function resetStateDir(stateDir) {
  const resolved = path.resolve(stateDir);
  const forbidden = new Set([path.parse(resolved).root, os.homedir(), process.cwd()]);
  if (forbidden.has(resolved) || !fs.existsSync(path.join(resolved, MARKER_FILE))) {
    throw new Error(`Refusing to reset unmarked or unsafe directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function runSimulation({ stateDir = path.join(os.homedir(), '.3dvr', 'ventures', 'sandbox-001'), reset = false } = {}) {
  stateDir = path.resolve(stateDir);
  if (reset && fs.existsSync(stateDir)) resetStateDir(stateDir);
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(stateDir, MARKER_FILE), 'simulation-only\n', { mode: 0o600 });

  const charter = defaultCharter();
  fs.writeFileSync(path.join(stateDir, 'charter.json'), JSON.stringify(charter, null, 2));
  const identity = ensureIdentity(stateDir, charter.ventureId);
  const ledgerFile = path.join(stateDir, 'ledger.ndjson');
  const eventsFile = path.join(stateDir, 'events.ndjson');
  const hasSeed = fs.existsSync(ledgerFile) && fs.readFileSync(ledgerFile, 'utf8').includes('simulated_seed_capital');
  if (!hasSeed) appendChained(ledgerFile, { type: 'simulated_seed_capital', amountCents: 5000, memo: 'Simulation only; no funds exist.' });
  appendChained(ledgerFile, { type: 'simulated_compute_expense', amountCents: -250, memo: 'Modeled cost; no payment occurred.' });
  appendChained(ledgerFile, { type: 'simulated_customer_payment', amountCents: 2000, memo: 'No customer or payment exists.' });
  appendChained(eventsFile, { type: 'charter_verified', mode: charter.mode });
  appendChained(eventsFile, { type: 'identity_verified', fingerprint: identity.fingerprint });
  appendChained(eventsFile, { type: 'offer_drafted', offer: 'site-steward-report', published: false });
  appendChained(eventsFile, { type: 'cycle_completed', externalActions: 0 });

  const ledger = fs.readFileSync(ledgerFile, 'utf8').trim().split('\n').map(JSON.parse);
  const cashCents = ledger.reduce((sum, row) => sum + row.amountCents, 0);
  const state = {
    ventureId: charter.ventureId,
    mode: charter.mode,
    identityFingerprint: identity.fingerprint,
    offer: { slug: 'site-steward-report', published: false },
    customersContacted: 0,
    cashCents,
    refundReserveCents: 200,
    monthlyCostCents: 1000,
    runwayDays: calculateRunwayDays(cashCents, 200, 1000),
    readiness: {
      simulation: true,
      realOperations: false,
      blockers: ['lawful_sponsor_missing', 'treasury_approval_missing', 'recovery_drill_missing', 'customer_terms_missing', 'external_actions_blocked']
    }
  };
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify(state, null, 2));
  const report = `# Autonomous Venture Sandbox\n\n**Mode:** simulation only\n\nNo customers, payments, outreach, publishing, wallet, or real spending occurred.\n\n- Offer drafted: Site Steward Report\n- Simulated cash: $${(cashCents / 100).toFixed(2)}\n- Simulated runway: ${state.runwayDays} days\n- External actions: 0\n- Ready for real operations: no\n\n## Required gates\n\n${state.readiness.blockers.map((item) => `- ${item}`).join('\n')}\n`;
  fs.writeFileSync(path.join(stateDir, 'latest-report.md'), report);
  return { stateDir, state };
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--reset') result.reset = true;
    if (argv[i] === '--state-dir') result.stateDir = argv[++i];
  }
  return result;
}

if (require.main === module) {
  try {
    const result = runSimulation(parseArgs(process.argv.slice(2)));
    console.log(`Simulation complete: ${path.join(result.stateDir, 'latest-report.md')}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { EXTERNAL_ACTIONS, calculateRunwayDays, defaultCharter, resetStateDir, runSimulation };
