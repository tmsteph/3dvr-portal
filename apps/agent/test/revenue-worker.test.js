const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../thomas-agent/node/revenue-worker');
const { openLedger } = require('../thomas-agent/node/revenue-ledger');

function candidate(filePath) {
  fs.writeFileSync(filePath, JSON.stringify({
    name: 'Acme',
    contact: 'owner@acme.test',
    sourceUrl: 'https://acme.test',
    subject: 'Research question',
    body: 'Commercial message. Postal address: 1 Test St. Reply unsubscribe or stop.',
    attemptId: 'canary-1',
  }));
}

test('worker records one no-send run per trigger', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-'));
  const previous = process.env.THREEDVR_REVENUE_LEDGER_FILE;
  const delivery = process.env.THREEDVR_REVENUE_DELIVERY_ENABLED;
  process.env.THREEDVR_REVENUE_LEDGER_FILE = path.join(tmp, 'ledger.sqlite');
  delete process.env.THREEDVR_REVENUE_DELIVERY_ENABLED;
  try {
    const first = await run('test-trigger');
    const second = await run('test-trigger');
    assert.equal(first.status, 'succeeded');
    assert.equal(first.summary_json.includes('sends'), true);
    assert.equal(second.replayed, true);
  } finally {
    if (previous === undefined) delete process.env.THREEDVR_REVENUE_LEDGER_FILE;
    else process.env.THREEDVR_REVENUE_LEDGER_FILE = previous;
    if (delivery === undefined) delete process.env.THREEDVR_REVENUE_DELIVERY_ENABLED;
    else process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = delivery;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('worker sends one canonical candidate and does not resend it', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-send-'));
  const previous = {
    ledger: process.env.THREEDVR_REVENUE_LEDGER_FILE,
    candidate: process.env.THREEDVR_REVENUE_CANDIDATE_FILE,
    delivery: process.env.THREEDVR_REVENUE_DELIVERY_ENABLED,
  };
  const ledger = path.join(tmp, 'ledger.sqlite');
  const candidateFile = path.join(tmp, 'candidate.json');
  candidate(candidateFile);
  process.env.THREEDVR_REVENUE_LEDGER_FILE = ledger;
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  let calls = 0;
  try {
    const first = await run('send-1', { send: async () => { calls += 1; return { acknowledged: true, messageId: 'm1', transport: 'test' }; } });
    const second = await run('send-2', { send: async () => { calls += 1; return { acknowledged: true, messageId: 'm2', transport: 'test' }; } });
    assert.equal(JSON.parse(first.summary_json).sends, 1);
    assert.equal(JSON.parse(second.summary_json).sends, 0);
    assert.equal(calls, 1);
    const db = openLedger({ filePath: ledger });
    try { assert.equal(db.prepare("SELECT state FROM prospects").get().state, 'sent'); } finally { db.close(); }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const env = { ledger: 'THREEDVR_REVENUE_LEDGER_FILE', candidate: 'THREEDVR_REVENUE_CANDIDATE_FILE', delivery: 'THREEDVR_REVENUE_DELIVERY_ENABLED' }[key];
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('worker records sender failure without claiming a send', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-fail-'));
  const previous = {
    ledger: process.env.THREEDVR_REVENUE_LEDGER_FILE,
    candidate: process.env.THREEDVR_REVENUE_CANDIDATE_FILE,
    delivery: process.env.THREEDVR_REVENUE_DELIVERY_ENABLED,
  };
  const candidateFile = path.join(tmp, 'candidate.json');
  candidate(candidateFile);
  process.env.THREEDVR_REVENUE_LEDGER_FILE = path.join(tmp, 'ledger.sqlite');
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  try {
    const result = await run('fail-1', { send: async () => { throw new Error('sender timeout'); } });
    const summary = JSON.parse(result.summary_json);
    assert.equal(result.status, 'failed');
    assert.equal(summary.sends, 0);
    assert.match(summary.delivery.error, /timeout/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const env = { ledger: 'THREEDVR_REVENUE_LEDGER_FILE', candidate: 'THREEDVR_REVENUE_CANDIDATE_FILE', delivery: 'THREEDVR_REVENUE_DELIVERY_ENABLED' }[key];
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('worker enforces the default one-send daily quota', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-quota-'));
  const previous = {
    ledger: process.env.THREEDVR_REVENUE_LEDGER_FILE,
    candidate: process.env.THREEDVR_REVENUE_CANDIDATE_FILE,
    delivery: process.env.THREEDVR_REVENUE_DELIVERY_ENABLED,
  };
  const candidateFile = path.join(tmp, 'candidate.json');
  candidate(candidateFile);
  process.env.THREEDVR_REVENUE_LEDGER_FILE = path.join(tmp, 'ledger.sqlite');
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  let calls = 0;
  try {
    await run('quota-1', { send: async () => { calls += 1; return { acknowledged: true }; } });
    const data = JSON.parse(fs.readFileSync(candidateFile, 'utf8'));
    fs.writeFileSync(candidateFile, JSON.stringify({ ...data, name: 'Beta', contact: 'owner@beta.test', sourceUrl: 'https://beta.test', attemptId: 'canary-2' }));
    const second = await run('quota-2', { send: async () => { calls += 1; return { acknowledged: true }; } });
    assert.equal(calls, 1);
    assert.equal(JSON.parse(second.summary_json).delivery.reason, 'quota exhausted');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const env = { ledger: 'THREEDVR_REVENUE_LEDGER_FILE', candidate: 'THREEDVR_REVENUE_CANDIDATE_FILE', delivery: 'THREEDVR_REVENUE_DELIVERY_ENABLED' }[key];
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
