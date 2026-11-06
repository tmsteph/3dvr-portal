import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repoRoot = new URL('../', import.meta.url);
const deadRelayPattern = /peers:\s*window\.__GUN_PEERS__\s*\|\|\s*\[[\s\S]*?wss:\/\/relay\.3dvr\.tech\/gun/;

async function read(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

describe('Gun peer configuration', () => {
  it('keeps the OVH relay first in shared peer initializers', async () => {
    for (const path of ['gun-init.js', 'contacts/gun-init.js', 'calendar/gun-init.js']) {
      const source = await read(path);
      const relayIndex = source.indexOf('wss://portal.3dvr.tech/gun-relay');
      const relayHttpsIndex = source.indexOf('https://portal.3dvr.tech/gun-relay');
      const disabledIndex = source.indexOf('wss://relay.3dvr.tech/gun');

      assert.notEqual(relayIndex, -1, `${path} should include the OVH relay`);
      assert.notEqual(relayHttpsIndex, -1, `${path} should include the OVH HTTPS fallback`);
      assert.notEqual(disabledIndex, -1, `${path} should explicitly filter the dead relay`);
      assert.ok(relayIndex < disabledIndex, `${path} should prefer the OVH relay before mentioning disabled relays`);
      assert.ok(relayIndex < relayHttpsIndex, `${path} should try WebSocket before HTTPS fallback`);
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
      assert.match(source, /wss:\/\/portal\.3dvr\.tech\/gun-relay/, `${path} should include the OVH relay fallback`);
    }
  });

  it('lets isolated browser tests disable the default Gun relays', async () => {
    const sharedInit = await read('gun-init.js');
    const chatE2e = await read('tests/chat-cross-browser.e2e.test.js');

    assert.match(sharedInit, /__DISABLE_GUN_DEFAULT_PEERS__/);
    assert.match(sharedInit, /disableDefaultPeers \? \[\] : defaultPeers/);
    assert.match(chatE2e, /__DISABLE_GUN_DEFAULT_PEERS__ = true/);
  });

  it('does not let Chat try the dead relay before the working OVH relay', async () => {
    const source = await read('chat/index.html');

    assert.doesNotMatch(source, /wss:\/\/relay\.3dvr\.tech\/gun/);
    assert.match(source, /wss:\/\/portal\.3dvr\.tech\/gun-relay/);
  });

  it('quarantines the dead relay from the server-side Chat push watcher', async () => {
    const source = await read('services/newsletter-store/server.mjs');
    const relayIndex = source.indexOf("process.env.CHAT_PUSH_GUN_PEERS || 'https://portal.3dvr.tech/gun-relay'");
    const filterIndex = source.indexOf('.filter(peer => peer && !disabledGunPeers.has(peer))');

    assert.notEqual(relayIndex, -1, 'the push watcher should default to the working OVH relay');
    assert.notEqual(filterIndex, -1, 'configured peers should filter the dead relay');
    assert.match(source, /'https:\/\/relay\.3dvr\.tech\/gun'/);
    assert.match(source, /'wss:\/\/relay\.3dvr\.tech\/gun'/);
  });
});
