import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';

const source = (await readFile(new URL('../helm/app.js', import.meta.url), 'utf8'))
  .replace("import { createSignedPortalProof } from '/operator/forge.js';", '');

function screen(result, status = 200) {
  const elements = new Map();
  const events = new Map();
  const storage = new Map([['signedIn', 'true'], ['alias', 'tmsteph@3dvr'], ['username', 'tmsteph']]);
  const element = id => {
    if (!elements.has(id)) elements.set(id, { dataset: {}, classList: { toggle() {}, remove() {} },
      addEventListener(event, fn) { events.set(`${id}:${event}`, fn); } });
    return elements.get(id);
  };
  runInNewContext(source, {
    document: { getElementById: element, querySelectorAll: () => [] },
    window: { addEventListener() {} }, localStorage: { getItem: key => storage.get(key) },
    crypto: { randomUUID }, AbortSignal,
    createSignedPortalProof: async () => ({ authProof: 'signed' }),
    fetch: async () => ({ ok: status === 200, status, json: async () => result })
  });
  return { element, connect: () => events.get('connect:click')() };
}

test('cached homepage username appears before connection, with no verification claim', () => {
  const ui = screen({});
  assert.equal(ui.element('account').textContent, 'tmsteph');
  assert.equal(ui.element('account').dataset.verified, undefined);
  assert.equal(ui.element('send').disabled, true);
});

test('failed agent connection keeps independently verified username visible', async () => {
  const ui = screen({ ok: false, identity: { verified: true, username: 'tmsteph' }, error: 'Agent unavailable' }, 503);
  await ui.connect();
  assert.equal(ui.element('account').textContent, '✓ tmsteph');
  assert.equal(ui.element('account').dataset.verified, 'true');
  assert.match(ui.element('activity').textContent, /account is verified/);
  assert.equal(ui.element('send').disabled, true);
});

test('successful signed status enables chat while unauthorized status never verifies username', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, identity: { verified: true, username: 'tmsteph' } });
  await ui.connect();
  assert.equal(ui.element('send').disabled, false);
  const denied = screen({ error: 'Sign in again' }, 401);
  await denied.connect();
  assert.equal(denied.element('account').textContent, 'Sign in again');
  assert.equal(denied.element('account').dataset.verified, undefined);
  assert.equal(denied.element('send').disabled, true);
});
