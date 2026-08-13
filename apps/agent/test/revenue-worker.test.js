const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../thomas-agent/node/revenue-worker');

test('foundation worker records one no-send run per trigger', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-'));
  const previous = process.env.THREEDVR_REVENUE_LEDGER_FILE;
  process.env.THREEDVR_REVENUE_LEDGER_FILE = path.join(tmp, 'ledger.sqlite');
  try {
    const first = run('test-trigger');
    const second = run('test-trigger');
    assert.equal(first.status, 'succeeded');
    assert.equal(first.summary_json.includes('sends'), true);
    assert.equal(second.replayed, true);
  } finally {
    if (previous === undefined) delete process.env.THREEDVR_REVENUE_LEDGER_FILE;
    else process.env.THREEDVR_REVENUE_LEDGER_FILE = previous;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
