const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'thomas-agent', 'node', 'inbox-monitor.js'), 'utf8');

test('inbox --dry-run never persists state or sends bounce alerts', () => {
  assert.match(source, /if \(shouldApplyInboxSideEffects\(options\)\) saveState\(state\)/);
  assert.match(source, /const bounceResult = await handleBounceMessages\(unread, state, \{ dryRun: options\.dryRun \}\)/);
  assert.match(source, /if \(dryRun \|\| updateLeadStatusByEmail\(LEADS_FILE, email, 'failed'\)\)/);
  assert.match(source, /if \(dryRun\) return \{ ok: true, preview: true, alert \}/);
  assert.match(source, /if \(bounceResult\?\.preview\)/);
  assert.match(source, /if \(shouldApplyInboxSideEffects\(options\)\) await writeAgentOpsHeartbeat/);
});
