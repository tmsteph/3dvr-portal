import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { createOutbox } from '../helm/outbox.js';
import { readHelmResponse } from '../helm/stream.js';

const source = (await readFile(new URL('../helm/app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));

function findAll(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const child of node.children || []) findAll(child, predicate, found);
  return found;
}
const findByText = (root, text) => findAll(root, item => item.textContent === text)[0];

const seedRecord = ({ id, sessionId, engine = 'openclaw', text, at, status = 'completed' }) => ({
  id, sessionId, engine, text, status,
  createdAt: at, expiresAt: at + 10 * 60 * 1000, updatedAt: at
});

function screen(result, status = 200, signedIn = true, gate, sessions = new Map()) {
  const elements = new Map();
  const events = new Map();
  const saved = [];
  const requests = [];
  const intervals = new Map();
  let storeCallbacks;
  let clock = Date.now();
  class Clock extends Date { static now() { return clock; } }
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
    Date: Clock,
    sessionStorage: { getItem: key => sessions.get(key), setItem: (key, value) => sessions.set(key, value) },
    setInterval: (fn, delay) => { const id = Symbol(); intervals.set(id, { fn, delay }); return id; },
    clearInterval: id => intervals.delete(id), createOutbox, readHelmResponse,
    openHelmMessageStore: async callbacks => { storeCallbacks = callbacks; return { save: async record => saved.push(structuredClone(record)), close() {} }; },
    createSignedPortalProof: async () => ({ authProof: 'signed' }),
    fetch: async (_url, options) => {
      const payload = JSON.parse(options.body); requests.push(payload);
      if (payload.action === 'status' && gate) await gate;
      const reply = await (typeof result === 'function' ? result(payload) : { status, body: result });
      if (reply.response) return reply.response;
      return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
    }
  });
  return { element, saved, requests, sessions, ready: flush(),
    seed: record => storeCallbacks.onRecord(record),
    activeProgress: () => [...intervals.values()].filter(item => item.delay === 1000).length,
    advance: ms => { clock += ms; for (const item of intervals.values()) if (item.delay === 1000) item.fn(); },
    changeAccount: () => events.get('window:storage')({ key: 'userPubKey' }),
    newChat: () => events.get('new-chat:click')(),
    changeEngine: value => { element('engine').value = value; events.get('engine:change')(); },
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
  const toggle = findAll(ui.element('history-list'), item => /^Show messages/.test(item.textContent || ''))[0];
  assert.ok(toggle);
  toggle.events.click();
  const cancel = findByText(ui.element('history-list'), 'Cancel');
  assert.ok(cancel);
  cancel.events.click();
  await flush();
  assert.equal(ui.saved.at(-1).status, 'cancelled');
});

test('new chat closes the history panel and clears an unsent draft', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' });
  await ui.ready;
  ui.element('history').hidden = false;
  ui.element('message').value = 'Unsent draft text';
  ui.newChat();
  assert.equal(ui.element('history').hidden, true);
  assert.equal(ui.element('message').value, '');
});

test('history resume returns to the earlier conversation session', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' });
  await ui.ready;
  await ui.submit('First conversation message');
  const firstChat = ui.requests.filter(item => item.action === 'chat').at(-1);
  ui.newChat();
  await ui.submit('Second conversation message');
  const secondChat = ui.requests.filter(item => item.action === 'chat').at(-1);
  assert.notEqual(firstChat.sessionId, secondChat.sessionId);
  const resume = findByText(ui.element('history-list'), 'Resume this chat');
  assert.ok(resume);
  resume.events.click();
  await flush(); await flush();
  assert.equal(ui.element('history').hidden, true);
  await ui.submit('Third conversation message');
  const thirdChat = ui.requests.filter(item => item.action === 'chat').at(-1);
  assert.equal(thirdChat.sessionId, firstChat.sessionId);
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

test('slow chat shows elapsed progress and replaces it with a returned reply', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ui = screen(async payload => {
    if (payload.action === 'status') return { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } };
    await gate;
    return { status: 200, body: { ok: true, reply: 'Done' } };
  });
  await ui.ready;
  const submitted = ui.submit('Harmless diagnostic');
  await flush();
  assert.equal(ui.element('connection').textContent, 'Waiting for agent reply');
  ui.advance(55000);
  assert.match(ui.element('activity').textContent, /55s elapsed/);
  assert.equal(ui.activeProgress(), 1);
  release(); await submitted;
  assert.equal(ui.element('connection').textContent, 'Agent replied');
  assert.equal(ui.element('activity').textContent, 'Reply received after 55s.');
  assert.equal(ui.saved.at(-1).status, 'completed');
  assert.equal(ui.activeProgress(), 0);
});

test('unconfirmed delivery stops progress and directs the user to history without replay', async () => {
  const ui = screen(payload => payload.action === 'status'
    ? { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } }
    : { status: 503, body: { ok: false, error: 'Connection interrupted.' } });
  await ui.ready;
  await ui.submit('Do not replay');
  assert.equal(ui.element('connection').textContent, 'Reply not confirmed');
  assert.match(ui.element('activity').textContent, /Check History before sending again/);
  assert.equal(ui.saved.at(-1).status, 'uncertain');
  assert.equal(ui.requests.filter(item => item.action === 'chat').length, 1);
  assert.equal(ui.activeProgress(), 0);
});

test('account changes reconnect while an old chat is pending and ignore its late result', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let turns = 0;
  const ui = screen(async payload => {
    if (payload.action === 'status') return { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } };
    if (++turns === 1) {
      await gate;
      return { status: 200, body: { ok: true, reply: 'Old account reply', identity: { verified: true, username: 'old-account' } } };
    }
    return { status: 200, body: { ok: true, reply: 'New account reply' } };
  });
  await ui.ready;
  const oldSubmission = ui.submit('Old account diagnostic');
  await flush();
  ui.changeAccount();
  await flush(); await flush();
  assert.equal(ui.requests.filter(item => item.action === 'status').length, 2);
  await ui.submit('New account diagnostic');
  assert.equal(ui.element('connection').textContent, 'Agent replied');
  const activity = ui.element('activity').textContent;
  release(); await oldSubmission;
  assert.equal(ui.element('connection').textContent, 'Agent replied');
  assert.equal(ui.element('activity').textContent, activity);
  assert.notEqual(ui.element('account').textContent, '✓ old-account');
  assert.equal(ui.activeProgress(), 0);
});

test('an obsolete connection check cannot disconnect the new account or stop its queue', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let checks = 0;
  const ui = screen(async payload => {
    if (payload.action === 'status') {
      if (++checks === 1) await gate;
      return { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } };
    }
    return { status: 200, body: { ok: true, reply: 'Current account reply' } };
  });
  await ui.ready;
  ui.changeAccount();
  await flush(); await flush();
  const connection = ui.element('connection').textContent;
  const activity = ui.element('activity').textContent;
  release(); await flush(); await flush();
  assert.equal(ui.element('connection').textContent, connection);
  assert.equal(ui.element('activity').textContent, activity);
  await ui.submit('Current account diagnostic');
  assert.equal(ui.saved.at(-1).status, 'completed');
  assert.equal(ui.element('connection').textContent, 'Agent replied');
});

test('streamed text appears while delivery is pending and completes only with the final result', async () => {
  let controller;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }),
    { headers: { 'Content-Type': 'text/event-stream' } });
  const ui = screen(payload => payload.action === 'status'
    ? { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } }
    : { response });
  await ui.ready;
  const sending = ui.submit('Stream diagnostic');
  await flush();
  controller.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"Early reply"}\n\n'));
  await flush();
  assert.equal(ui.saved.at(-1).status, 'sending');
  assert.equal(ui.element('connection').textContent, 'Receiving agent reply');
  const card = ui.element('messages').children[0];
  assert.ok(card.children.some(item => item?.textContent === 'Early reply'));
  controller.enqueue(new TextEncoder().encode('event: result\ndata: {"ok":true,"reply":"Final reply"}\n\n'));
  controller.close();
  await sending;
  assert.equal(ui.saved.at(-1).status, 'completed');
  assert.equal(ui.saved.at(-1).reply, 'Final reply');
});

test('an interrupted partial reply stays uncertain without a second dispatch', async () => {
  const response = new Response('event: delta\ndata: {"text":"Partial"}\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } });
  const ui = screen(payload => payload.action === 'status'
    ? { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } }
    : { response });
  await ui.ready;
  await ui.submit('Never replay this');
  assert.equal(ui.saved.at(-1).status, 'uncertain');
  assert.equal(ui.requests.filter(item => item.action === 'chat').length, 1);
});

test('native engine is saved and signed with messages, while switching starts a separate chat', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' });
  await ui.ready;
  ui.changeEngine('openclaw'); await flush(); await flush();
  await ui.submit('Claw conversation');
  const first = ui.requests.find(item => item.action === 'chat');
  assert.equal(first.engine, 'openclaw');
  ui.changeEngine('codex'); await flush(); await flush();
  assert.match(ui.element('engine-note').textContent, /chat and code advice/);
  await ui.submit('Native conversation');
  const last = ui.requests.filter(item => item.action === 'chat').at(-1);
  assert.equal(last.engine, 'codex');
  assert.notEqual(first.sessionId, last.sessionId);
  assert.equal(ui.saved.at(-1).engine, 'codex');
});

test('engine cannot change during an in-flight turn', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ui = screen(async payload => {
    if (payload.action === 'chat') await gate;
    return { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' } };
  });
  await ui.ready;
  const sending = ui.submit('Keep engine stable'); await flush();
  assert.equal(ui.element('engine').disabled, true);
  ui.changeEngine('codex');
  assert.equal(ui.element('engine').value, 'openclaw');
  release(); await sending;
  assert.equal(ui.element('engine').disabled, false);
});

test('reload restores the conversation session but starts on the OpenClaw default', async () => {
  const result = { ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' };
  const first = screen(result); await first.ready;
  first.changeEngine('codex'); await flush(); await flush();
  await first.submit('Remember this conversation');
  const original = first.requests.filter(item => item.action === 'chat').at(-1);
  const reloaded = screen(result, 200, true, undefined, first.sessions); await reloaded.ready;
  assert.equal(reloaded.element('engine').value, 'openclaw');
  assert.equal(reloaded.requests[0].engine, 'openclaw');
  await reloaded.submit('Continue');
  const continued = reloaded.requests.find(item => item.action === 'chat');
  assert.equal(continued.sessionId, original.sessionId);
  assert.equal(continued.engine, 'openclaw');
});

test('fresh sessions and account changes default to OpenClaw, whatever engine was stored', async () => {
  const result = { ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' };
  const fresh = screen(result); await fresh.ready;
  assert.equal(fresh.element('engine').value, 'openclaw');
  assert.equal(fresh.requests[0].engine, 'openclaw');
  fresh.changeAccount(); await flush(); await flush();
  assert.equal(fresh.requests.at(-1).engine, 'openclaw');
  const sessions = new Map([['3dvr.helm.session.tmsteph@3dvr.engine', 'codex']]);
  const saved = screen(result, 200, true, undefined, sessions); await saved.ready;
  assert.equal(saved.element('engine').value, 'openclaw');
  assert.equal(saved.requests[0].engine, 'openclaw');
});

test('new chat returns to the OpenClaw default engine', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' });
  await ui.ready;
  ui.changeEngine('codex'); await flush(); await flush();
  assert.equal(ui.element('engine').value, 'codex');
  ui.newChat(); await flush(); await flush();
  assert.equal(ui.element('engine').value, 'openclaw');
  await ui.submit('Fresh chat message');
  const chat = ui.requests.filter(item => item.action === 'chat').at(-1);
  assert.equal(chat.engine, 'openclaw');
});

test('resuming a history chat restores that chat engine', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' });
  await ui.ready;
  ui.changeEngine('codex'); await flush(); await flush();
  await ui.submit('Codex chat message');
  const codexChat = ui.requests.filter(item => item.action === 'chat').at(-1);
  assert.equal(codexChat.engine, 'codex');
  ui.newChat(); await flush(); await flush();
  await ui.submit('OpenClaw chat message');
  const resume = findByText(ui.element('history-list'), 'Resume this chat');
  assert.ok(resume);
  resume.events.click();
  await flush(); await flush();
  assert.equal(ui.element('engine').value, 'codex');
  await ui.submit('Back in the Codex chat');
  const back = ui.requests.filter(item => item.action === 'chat').at(-1);
  assert.equal(back.sessionId, codexChat.sessionId);
  assert.equal(back.engine, 'codex');
});

test('history lists conversations newest first with previews and expandable records', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' });
  await ui.ready;
  const now = Date.now();
  const H = 60 * 60 * 1000;
  const M = 60 * 1000;
  ui.seed(seedRecord({ id: 'seed-alpha-0001', sessionId: 'chat-alpha-0001', text: 'Alpha first message', at: now - 5 * H }));
  ui.seed(seedRecord({ id: 'seed-bravo-0001', sessionId: 'chat-bravo-0001', engine: 'codex', text: 'Bravo first message', at: now - 4 * H }));
  ui.seed(seedRecord({ id: 'seed-alpha-0002', sessionId: 'chat-alpha-0001', text: 'Alpha later message', at: now - 3 * H }));
  ui.seed(seedRecord({ id: 'seed-charlie-01', sessionId: 'chat-charlie-01', text: 'Charlie only message', at: now - 2 * H }));
  ui.seed(seedRecord({ id: 'seed-delta-0001', sessionId: 'chat-delta-0001', text: 'Delta expired message', at: now - 1 * H, status: 'stale' }));
  ui.seed(seedRecord({ id: 'seed-bravo-0002', sessionId: 'chat-bravo-0001', engine: 'codex', text: 'Bravo latest message', at: now - 30 * M }));
  const rows = ui.element('history-list').children;
  assert.equal(rows.length, 4);
  const previews = rows.map(row => findAll(row, item => item.className === 'history-preview')[0]?.textContent);
  assert.deepEqual(previews, ['Bravo first message', 'Delta expired message', 'Charlie only message', 'Alpha first message']);
  const firstMeta = findAll(rows[0], item => item.className === 'history-meta')[0];
  assert.match(firstMeta.textContent, /30m ago · Codex/);
  const toggles = findAll(ui.element('history-list'), item => /^Show messages/.test(item.textContent || ''));
  assert.equal(toggles.length, 4);
  toggles.at(-1).events.click();
  const shown = findAll(ui.element('history-list'), item => (item.children || []).includes('Alpha later message'));
  assert.equal(shown.length, 1);
  const deltaToggle = findAll(ui.element('history-list'), item => /^Show messages/.test(item.textContent || ''))[1];
  deltaToggle.events.click();
  const reuse = findByText(ui.element('history-list'), 'Use as new message');
  assert.ok(reuse);
  reuse.events.click();
  assert.equal(ui.element('message').value, 'Delta expired message');
});
