const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'thomas-agent', 'node', 'inbox-monitor.js'), 'utf8');

test('inbox --dry-run never persists state or sends bounce alerts', () => {
  assert.match(source, /if \(shouldApplyInboxSideEffects\(options\)\) saveState\(state\)/);
  assert.match(source, /const bounceResult = shouldApplyInboxSideEffects\(options\)/);
  assert.match(source, /if \(shouldApplyInboxSideEffects\(options\)\) await writeAgentOpsHeartbeat/);
});
