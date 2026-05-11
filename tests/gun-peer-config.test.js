import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repoRoot = new URL('../', import.meta.url);
const deadRelayPattern = /peers:\s*window\.__GUN_PEERS__\s*\|\|\s*\[[\s\S]*?wss:\/\/relay\.3dvr\.tech\/gun/;

async function read(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

describe('Gun peer configuration', () => {
  it('keeps the known-working Fly relay first in shared peer initializers', async () => {
    for (const path of ['gun-init.js', 'contacts/gun-init.js', 'calendar/gun-init.js']) {
      const source = await read(path);
      const flyIndex = source.indexOf('wss://gun-relay-3dvr.fly.dev/gun');
      const disabledIndex = source.indexOf('wss://relay.3dvr.tech/gun');

      assert.notEqual(flyIndex, -1, `${path} should include the Fly relay`);
      assert.notEqual(disabledIndex, -1, `${path} should explicitly filter the dead relay`);
      assert.ok(flyIndex < disabledIndex, `${path} should prefer Fly before mentioning disabled relays`);
      assert.match(source, /disabledPeers|DISABLED/);
      assert.match(source, /filter\(peer => !disabledPeers\.has\(peer\)\)/);
    }
  });

  it('does not let Notes, CRM, or Clipboard fall back to the dead relay', async () => {
    const files = {
      'notes/index.html': await read('notes/index.html'),
      'crm/app.js': await read('crm/app.js'),
      'clipboard/app.js': await read('clipboard/app.js'),
    };

    for (const [path, source] of Object.entries(files)) {
      assert.doesNotMatch(source, deadRelayPattern, `${path} should not initialize Gun with the dead relay fallback`);
      assert.match(source, /wss:\/\/gun-relay-3dvr\.fly\.dev\/gun/, `${path} should include the Fly relay fallback`);
    }
  });
});
