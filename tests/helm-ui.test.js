import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { createOutbox } from '../helm/outbox.js';

const source = (await readFile(new URL('../helm/app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));

function screen(result, status = 200, signedIn = true, gate) {
  const elements = new Map();
  const events = new Map();
  const saved = [];
  const requests = [];
  const storage = new Map([['signedIn', signedIn ? 'true' : 'false'], ['alias', 'tmsteph@3dvr'], ['username', 'tmsteph']]);
  const makeElement = () => ({ dataset: {}, value: '', children: [], classList: { toggle() {}, remove() {} },
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
    addEventListener(event, fn) { this.events ||= {}; this.events[event] = fn; }, setAttribute() {}, focus() {} });
  const element = id => {
    if (!elements.has(id)) elements.set(id, { ...makeElement(),
      addEventListener(event, fn) { events.set(`${id}:${event}`, fn); } });
    return elements.get(id);
  };
  runInNewContext(source, {
    document: { getElementById: element, querySelectorAll: () => [], createElement: makeElement, createTextNode: text => text },
    window: { addEventListener(event, fn) { events.set(`window:${event}`, fn); } },
    localStorage: { getItem: key => storage.get(key) }, crypto: { randomUUID }, AbortSignal,
    setInterval: () => 1, createOutbox,
    openHelmMessageStore: async () => ({ save: async record => saved.push(structuredClone(record)), close() {} }),
    createSignedPortalProof: async () => ({ authProof: 'signed' }),
    fetch: async (_url, options) => {
      const payload = JSON.parse(options.body); requests.push(payload);
      if (payload.action === 'status' && gate) await gate;
      const reply = typeof result === 'function' ? result(payload) : { status, body: result };
      return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
    }
  });
  return { element, saved, requests, ready: flush(),
    newChat: () => events.get('new-chat:click')(),
    submit: async text => { element('message').value = text; await events.get('chat-form:submit')({ preventDefault() {} }); } };
}

test('composer accepts a signed-in message before agent startup finishes', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done', identity: { verified: true, username: 'tmsteph' } }, 200, true, gate);
  await ui.ready;
  assert.equal(ui.element('send').disabled, false);
  await ui.submit('Do this when ready');
  assert.equal(ui.saved[0].status, 'queued');
  assert.equal(ui.requests.filter(request => request.action === 'chat').length, 0);
  assert.equal(ui.element('message').value, '');
  release(); await flush(); await flush();
  const chat = ui.requests.find(request => request.action === 'chat');
  assert.equal(chat.requestId, ui.saved[0].id);
  assert.equal(chat.createdAt, ui.saved[0].createdAt);
  assert.equal(ui.saved.at(-1).status, 'completed');
});

test('failed agent connection still accepts queued messages and keeps verified identity', async () => {
  const ui = screen({ ok: false, identity: { verified: true, username: 'tmsteph' }, error: 'Agent unavailable' }, 503);
  await ui.ready;
  assert.equal(ui.element('account').textContent, '✓ tmsteph');
  assert.equal(ui.element('send').disabled, false);
  await ui.submit('Save this while disconnected');
  assert.equal(ui.saved.at(-1).status, 'queued');
  assert.equal(ui.requests.filter(request => request.action === 'chat').length, 0);
});

test('signed-out visitors cannot submit or send automatic agent requests', async () => {
  const ui = screen({}, 200, false);
  await ui.ready;
  await ui.submit('Not signed in');
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.saved.length, 0);
  assert.equal(ui.element('send').disabled, true);
});

test('queued messages from an earlier conversation remain cancellable in history', async () => {
  const ui = screen({ ok: false, error: 'Offline' }, 503);
  await ui.ready;
  await ui.submit('Do not lose my cancel button');
  ui.newChat();
  const card = ui.element('history-list').children[0];
  const cancel = card.children.find(child => child?.textContent === 'Cancel');
  assert.ok(cancel);
  cancel.events.click();
  await flush();
  assert.equal(ui.saved.at(-1).status, 'cancelled');
});

test('HTTP busy rejection stays retryable while unknown delivery stays uncertain', async () => {
  const ui = screen(payload => payload.action === 'status'
    ? { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } }
    : { status: 429, body: { error: 'Agent busy' } });
  await ui.ready;
  await ui.submit('Wait for the busy agent');
  assert.equal(ui.saved.at(-1).status, 'deferred');
  assert.equal(ui.element('queue-summary').textContent.startsWith('1 queued'), true);
});
