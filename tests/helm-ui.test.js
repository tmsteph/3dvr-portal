import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';

const source = (await readFile(new URL('../helm/app.js', import.meta.url), 'utf8'))
  .replace("import { createSignedPortalProof } from '/operator/forge.js';", '');

function screen(result, status = 200, signedIn = true) {
  const elements = new Map();
  const events = new Map();
  const storage = new Map([['signedIn', signedIn ? 'true' : 'false'], ['alias', 'tmsteph@3dvr'], ['username', 'tmsteph']]);
  const element = id => {
    if (!elements.has(id)) elements.set(id, { dataset: {}, classList: { toggle() {}, remove() {} },
      addEventListener(event, fn) { events.set(`${id}:${event}`, fn); } });
    return elements.get(id);
  };
  let requests = 0;
  runInNewContext(source, {
    document: { getElementById: element, querySelectorAll: () => [] },
    window: { addEventListener() {} }, localStorage: { getItem: key => storage.get(key) },
    crypto: { randomUUID }, AbortSignal,
    createSignedPortalProof: async () => ({ authProof: 'signed' }),
    fetch: async () => { requests++; return { ok: status === 200, status, json: async () => result }; }
  });
  return { element, ready: new Promise(resolve => setImmediate(resolve)), requests: () => requests, connect: () => events.get('connect:click')() };
}

test('cached homepage username appears before connection, with no verification claim', () => {
  const ui = screen({});
  assert.equal(ui.element('account').textContent, 'tmsteph');
  assert.equal(ui.element('account').dataset.verified, undefined);
  assert.equal(ui.element('send').disabled, true);
});

test('failed agent connection keeps independently verified username visible', async () => {
  const ui = screen({ ok: false, identity: { verified: true, username: 'tmsteph' }, error: 'Agent unavailable' }, 503);
  await ui.ready;
  assert.equal(ui.element('account').textContent, '✓ tmsteph');
  assert.equal(ui.element('account').dataset.verified, 'true');
  assert.match(ui.element('activity').textContent, /account is verified/);
  assert.equal(ui.element('send').disabled, true);
});

test('successful signed status enables chat while unauthorized status never verifies username', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, identity: { verified: true, username: 'tmsteph' } });
  await ui.ready;
  assert.equal(ui.element('send').disabled, false);
  const denied = screen({ error: 'Sign in again' }, 401);
  await denied.ready;
  assert.equal(denied.element('account').textContent, 'Sign in again');
  assert.equal(denied.element('account').dataset.verified, undefined);
  assert.equal(denied.element('send').disabled, true);
});


test('signed-in owner connects on load without clicking and hides retry after success', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, identity: { verified: true, username: 'tmsteph' } });
  await ui.ready;
  assert.equal(ui.requests(), 1);
  assert.equal(ui.element('send').disabled, false);
  assert.equal(ui.element('connect').hidden, true);
});

test('signed-out visitors do not send automatic agent requests', async () => {
  const ui = screen({}, 200, false);
  await ui.ready;
  assert.equal(ui.requests(), 0);
  assert.equal(ui.element('send').disabled, true);
  assert.match(ui.element('activity').textContent, /Sign in/);
});
