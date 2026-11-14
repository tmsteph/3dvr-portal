import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { createOutbox, MESSAGE_TTL_MS, validMessage } from '../helm/outbox.js';
import { readHelmResponse } from '../helm/stream.js';
import { paintOperatorMarkdown } from '../operator/markdown.js';

const source = (await readFile(new URL('../helm/app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));

function findAll(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const child of node.children || []) findAll(child, predicate, found);
  return found;
}
const findByText = (root, text) => findAll(root, item => item.textContent === text)[0];

// Visible text of a fake-DOM subtree: plain textContent assignments plus
// the string children and element text the markdown painter builds.
const textOf = node => {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  return (typeof node.textContent === 'string' ? node.textContent : '')
    + (node.children || []).map(textOf).join('');
};

const seedRecord = ({ id, sessionId, engine = 'openclaw', text, at, status = 'completed' }) => ({
  id, sessionId, engine, text, status,
  createdAt: at, expiresAt: at + 10 * 60 * 1000, updatedAt: at
});

function screen(result, status = 200, signedIn = true, gate, sessions = new Map(), harness = {}) {
  const elements = new Map();
  const events = new Map();
  const saved = [];
  const requests = [];
  const fetches = [];
  const intervals = new Map();
  let storeCallbacks;
  let clock = Date.now();
  class Clock extends Date { static now() { return clock; } }
  const storage = harness.storage || new Map([['signedIn', signedIn ? 'true' : 'false'], ['alias', 'tmsteph@3dvr'], ['username', 'tmsteph']]);
  const makeElement = () => ({ dataset: {}, value: '', children: [], classList: { toggle() {}, remove() {} },
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
    addEventListener(event, fn) { this.events ||= {}; this.events[event] = fn; }, setAttribute() {}, focus() {} });
  const createElement = tag => { const node = makeElement(); node.tagName = String(tag || '').toUpperCase(); return node; };
  // The shared markdown renderer resolves `document` in this realm (it is
  // imported here, not in the sandbox), so bridge it to the same fake DOM
  // the app code sees, with tags recorded for structure assertions.
  globalThis.document = { createElement, createTextNode: text => text };
  const element = id => {
    if (!elements.has(id)) elements.set(id, { ...makeElement(),
      addEventListener(event, fn) { events.set(`${id}:${event}`, fn); } });
    return elements.get(id);
  };
  runInNewContext(source, {
    document: { getElementById: element, querySelectorAll: () => [], createElement, createTextNode: text => text },
    window: { addEventListener(event, fn) { events.set(`window:${event}`, fn); } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key) }, crypto: { randomUUID }, AbortSignal,
    Date: Clock,
    sessionStorage: { getItem: key => sessions.get(key), setItem: (key, value) => sessions.set(key, value),
      removeItem: key => sessions.delete(key) },
    setInterval: (fn, delay) => { const id = Symbol(); intervals.set(id, { fn, delay }); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: fn => { queueMicrotask(fn); return 0; }, clearTimeout: () => {}, createOutbox, MESSAGE_TTL_MS, validMessage, readHelmResponse, paintOperatorMarkdown,
    openHelmMessageStore: async callbacks => { if (harness.storeGate) await harness.storeGate; storeCallbacks = callbacks; return { save: async record => saved.push(structuredClone(record)), close() {} }; },
    createSignedPortalProof: async () => ({ authProof: 'signed' }),
    fetch: async (_url, options) => {
      fetches.push({ url: _url, options });
      const payload = JSON.parse(options.body); requests.push(payload);
      if (payload.action === 'status' && gate) await gate;
      const reply = await (typeof result === 'function' ? result(payload) : { status, body: result });
      if (reply.response) return reply.response;
      return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
    }
  });
  return { element, saved, requests, fetches, sessions, storage, ready: flush(),
    journal: () => { for (const [key, value] of storage) if (key.startsWith('3dvr.helm.outbox-journal.')) return JSON.parse(value); return []; },
    seed: record => storeCallbacks.onRecord(record),
    activeProgress: () => [...intervals.values()].filter(item => item.delay === 1000).length,
    advance: ms => { clock += ms; for (const item of intervals.values()) if (item.delay === 1000) item.fn(); },
    changeAccount: () => events.get('window:storage')({ key: 'userPubKey' }),
    focus: () => events.get('window:focus')(),
    newChat: () => events.get('new-chat:click')(),
    showQueue: () => events.get('show-queue:click')(),
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

test('a Workspace handoff opens as an unsent Helm draft for its account', async () => {
  const key = '3dvr.helm.prefill.v1';
  const sessionKey = '3dvr.helm.session.tmsteph@3dvr';
  const sessions = new Map([
    [sessionKey, 'existing-chat'],
    [key, JSON.stringify({ alias: 'tmsteph@3dvr', prompt: 'Continue the linked project.' })]
  ]);
  const ui = screen({ ok: false }, 503, true, undefined, sessions);
  await ui.ready;
  assert.notEqual(sessions.get(sessionKey), 'existing-chat');
  assert.equal(sessions.has(key), false);
  assert.equal(ui.element('message').value, 'Continue the linked project.');
  assert.equal(ui.saved.length, 0);
  assert.equal(ui.requests.some(request => request.action === 'chat'), false);
  sessions.set(key, JSON.stringify({ alias: 'another-account', prompt: 'Private draft' }));
  const other = screen({ ok: false }, 503, true, undefined, sessions);
  await other.ready;
  assert.equal(other.element('message').value, '');
  assert.equal(sessions.has(key), false);
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

test('queued messages stay visible in the queue view after starting a new chat', async () => {
  const ui = screen({ ok: false, error: 'Offline' }, 503);
  await ui.ready;
  const now = Date.now();
  ui.seed(seedRecord({ id: 'seed-queue-1001', sessionId: 'chat-queue-1001', text: 'First chat opener', at: now - 180000, status: 'queued' }));
  ui.seed(seedRecord({ id: 'seed-queue-1002', sessionId: 'chat-queue-1001', text: 'First chat follow-up', at: now - 120000, status: 'queued' }));
  ui.seed(seedRecord({ id: 'seed-queue-1003', sessionId: 'chat-queue-1003', text: 'Second chat message', at: now - 60000, status: 'queued' }));
  ui.newChat();
  await flush();
  assert.equal(ui.element('show-queue').textContent, 'Queued (3)');
  const rows = ui.element('queue-list').children;
  assert.equal(rows.length, 3);
  const previews = rows.map(row => findAll(row, item => item.className === 'history-preview')[0]?.textContent);
  assert.deepEqual(previews, ['First chat opener', 'First chat follow-up', 'Second chat message']);
  const metas = rows.map(row => findAll(row, item => item.className === 'history-meta')[0]?.textContent);
  assert.match(metas[0], /Queued · Next up/);
  assert.match(metas[1], /Queued · 1 ahead of it/);
  assert.match(metas[1], /Chat starts “First chat opener”/);
  assert.match(metas[2], /Queued · 2 ahead of it/);
  ui.element('queue').hidden = true;
  ui.showQueue();
  assert.equal(ui.element('queue').hidden, false);
});

test('cancelling in the queue view cancels the same record in its chat', async () => {
  const ui = screen({ ok: false, error: 'Offline' }, 503);
  await ui.ready;
  await ui.submit('Cancel me from the queue view');
  ui.newChat();
  assert.equal(ui.element('show-queue').textContent, 'Queued (1)');
  const cancel = findByText(ui.element('queue-list'), 'Cancel');
  assert.ok(cancel);
  cancel.events.click();
  await flush();
  assert.equal(ui.saved.at(-1).status, 'cancelled');
  assert.equal(ui.element('show-queue').textContent, 'Queued');
  const rows = ui.element('queue-list').children;
  assert.equal(rows.length, 1);
  assert.match(textOf(rows[0]), /Nothing is waiting/);
});

test('opening a queued turn from the queue view returns to its chat', async () => {
  const ui = screen({ ok: false, error: 'Offline' }, 503);
  await ui.ready;
  const now = Date.now();
  ui.seed(seedRecord({ id: 'seed-queue-0001', sessionId: 'chat-queue-0001', text: 'Earlier chat opener', at: now - 120000 }));
  ui.seed(seedRecord({ id: 'seed-queue-0002', sessionId: 'chat-queue-0001', text: 'Still waiting turn', at: now - 60000, status: 'queued' }));
  await flush();
  const open = findByText(ui.element('queue-list'), 'Open chat');
  assert.ok(open);
  open.events.click();
  await flush(); await flush();
  assert.equal(ui.element('queue').hidden, true);
  await ui.submit('Back in the earlier chat');
  assert.equal(ui.saved.at(-1).sessionId, 'chat-queue-0001');
});

test('queue view shows a sending turn as waiting for the agent, without a cancel button', async () => {
  const ui = screen({ ok: false, error: 'Offline' }, 503);
  await ui.ready;
  const now = Date.now();
  ui.seed(seedRecord({ id: 'seed-queue-0003', sessionId: 'chat-queue-0003', text: 'Turn already sent', at: now - 30000, status: 'sending' }));
  await flush();
  assert.equal(ui.element('show-queue').textContent, 'Queued (1)');
  const rows = ui.element('queue-list').children;
  assert.equal(rows.length, 1);
  const meta = findAll(rows[0], item => item.className === 'history-meta')[0];
  assert.match(meta.textContent, /Sending · waiting for the agent/);
  assert.equal(findByText(ui.element('queue-list'), 'Cancel'), undefined);
});

test('completed turns leave the queue view', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' });
  await ui.ready;
  await ui.submit('Finish and clear');
  assert.equal(ui.saved.at(-1).status, 'completed');
  assert.equal(ui.element('show-queue').textContent, 'Queued');
  const rows = ui.element('queue-list').children;
  assert.equal(rows.length, 1);
  assert.match(textOf(rows[0]), /Nothing is waiting/);
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

test('a queued turn shows the receipt preview in its bubble until the final reply replaces it', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let chatCalls = 0;
  const ui = screen(async payload => {
    if (payload.action === 'status') return { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } };
    chatCalls++;
    if (chatCalls === 1) return { status: 202, body: { queued: true, status: 'running', position: 0,
      preview: { text: 'Partial answer', activity: 'Running a command', startedAt: Date.now(), updatedAt: Date.now() } } };
    await gate;
    return { status: 200, body: { ok: true, reply: 'Final answer' } };
  });
  await ui.ready;
  const submitted = ui.submit('Preview diagnostic');
  await flush(); await flush(); await flush(); await flush();
  const card = ui.element('messages').children[0];
  assert.ok(card.children.some(item => item?.textContent === 'Partial answer'));
  const note = findAll(card, item => item.className === 'working-note')[0];
  assert.ok(note);
  assert.match(note.textContent, /Running a command/);
  assert.equal(ui.element('connection').textContent, 'Running a command');
  release(); await submitted;
  assert.equal(ui.saved.at(-1).status, 'completed');
  assert.equal(ui.saved.at(-1).reply, 'Final answer');
  const doneCard = ui.element('messages').children[0];
  assert.equal(findAll(doneCard, item => item.className === 'working-note').length, 0);
  const doneReply = findAll(doneCard, item => item.className === 'saved-reply')[0];
  assert.ok(doneReply);
  assert.equal(textOf(doneReply), 'Final answer');
});

test('a turn bubble names each state: queued, waiting for the agent to start, receiving, done', async () => {
  const gates = [];
  const gated = () => new Promise(resolve => gates.push(resolve));
  let chatCalls = 0;
  const startedAt = Date.now();
  const ui = screen(async payload => {
    if (payload.action === 'status') return { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } };
    chatCalls++;
    if (chatCalls === 1) return { status: 202, body: { queued: true, status: 'queued', position: 2, preview: null } };
    await gated();
    if (chatCalls === 2) return { status: 202, body: { queued: true, status: 'running', position: 0,
      preview: { text: '', activity: null, startedAt, updatedAt: null } } };
    if (chatCalls === 3) return { status: 202, body: { queued: true, status: 'running', position: 0,
      preview: { text: 'Partial answer', activity: null, startedAt, updatedAt: Date.now() } } };
    return { status: 200, body: { ok: true, reply: 'Final answer' } };
  });
  await ui.ready;
  const submitted = ui.submit('State tour diagnostic');
  await flush(); await flush(); await flush(); await flush();
  const note = () => findAll(ui.element('messages').children[0], item => item.className === 'working-note')[0];
  // Still in the server queue: the bubble names the position, not work.
  assert.match(note().textContent, /^Queued · 2 ahead · \d+s$/);
  gates.shift()(); await flush(); await flush(); await flush(); await flush();
  // Dispatched and running on the receipt, but the agent has produced
  // nothing yet: the bubble says so instead of claiming it is working.
  assert.match(note().textContent, /^Waiting for the agent to start · \d+s$/);
  gates.shift()(); await flush(); await flush(); await flush(); await flush();
  // First fragment in the preview: the bubble switches to receiving.
  assert.match(note().textContent, /^Receiving reply · \d+s$/);
  assert.ok(ui.element('messages').children[0].children.some(item => item?.textContent === 'Partial answer'));
  gates.shift()(); await submitted;
  assert.equal(ui.saved.at(-1).status, 'completed');
  assert.equal(ui.saved.at(-1).reply, 'Final answer');
  assert.equal(findAll(ui.element('messages').children[0], item => item.className === 'working-note').length, 0);
});

test('a dispatched turn with no output yet reads as waiting for the agent to start, not working', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ui = screen(async payload => {
    if (payload.action === 'status') return { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } };
    await gate;
    return { status: 200, body: { ok: true, reply: 'Done' } };
  });
  await ui.ready;
  const submitted = ui.submit('Held diagnostic');
  await flush();
  const card = ui.element('messages').children[0];
  const note = findAll(card, item => item.className === 'working-note')[0];
  assert.ok(note);
  assert.match(note.textContent, /^Waiting for the agent to start · \d+s$/);
  release(); await submitted;
  assert.equal(ui.saved.at(-1).status, 'completed');
});

test('a page reload reattaches to a turn still in flight and lands its reply', async () => {
  const ui = screen(payload => payload.action === 'status'
    ? { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } }
    : { status: 200, body: { ok: true, reply: 'Recovered reply' } });
  await ui.ready; await flush(); await flush();
  const now = Date.now();
  ui.seed(seedRecord({ id: 'seed-flight-001', sessionId: 'chat-flight-001', text: 'Long task', at: now - 60000, status: 'sending' }));
  assert.equal(ui.saved.length, 0);
  ui.focus();
  await flush(); await flush(); await flush();
  const poll = ui.requests.find(item => item.action === 'chat');
  assert.ok(poll);
  assert.equal(poll.requestId, 'seed-flight-001');
  assert.equal(ui.saved.at(-1).status, 'completed');
  assert.equal(ui.saved.at(-1).reply, 'Recovered reply');
});

test('assistant replies render markdown while the user message stays plain text', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true,
    reply: 'Yes. I am **Helm** here, front door to **Operator**.\n\n- one\n- two\n\nSee [the portal](https://portal.3dvr.tech/helm/) and run `helm status`.' });
  await ui.ready;
  await ui.submit('You are **helm** right now?');
  const card = ui.element('messages').children[0];
  // The user's own words stay a raw text node, asterisks untouched.
  assert.ok(card.children.includes('You are **helm** right now?'));
  const reply = findAll(card, item => item.className === 'saved-reply')[0];
  assert.ok(reply);
  const strongs = findAll(reply, item => item.tagName === 'STRONG');
  assert.deepEqual(strongs.map(textOf), ['Helm', 'Operator']);
  assert.equal(findAll(reply, item => item.tagName === 'LI').length, 2);
  const code = findAll(reply, item => item.tagName === 'CODE')[0];
  assert.equal(textOf(code), 'helm status');
  const link = findAll(reply, item => item.tagName === 'A')[0];
  assert.equal(link.href, 'https://portal.3dvr.tech/helm/');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(textOf(link), 'the portal');
  // No literal markdown markers survive in the rendered reply text.
  assert.ok(!textOf(reply).includes('**'));
});

test('assistant replies render hostile markup as inert text', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true,
    reply: 'Safe <script>alert(1)</script> and <img src=x onerror=alert(2)> plus [click](javascript:alert(3))' });
  await ui.ready;
  await ui.submit('Show me the payload');
  const card = ui.element('messages').children[0];
  const reply = findAll(card, item => item.className === 'saved-reply')[0];
  assert.ok(reply);
  assert.equal(findAll(reply, item => item.tagName === 'SCRIPT').length, 0);
  assert.equal(findAll(reply, item => item.tagName === 'IMG').length, 0);
  assert.equal(findAll(reply, item => item.tagName === 'A').length, 0);
  const visible = textOf(reply);
  assert.ok(visible.includes('<script>alert(1)</script>'));
  assert.ok(visible.includes('<img src=x onerror=alert(2)>'));
  assert.ok(visible.includes('click'));
});

test('tapping Queue journals the message synchronously, before the store save lands', async () => {
  let releaseStore;
  const storeGate = new Promise(resolve => { releaseStore = resolve; });
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' }, 200, true, null, new Map(), { storeGate });
  await ui.ready;
  const submitted = ui.submit('Do not lose this one');
  await flush(); await flush();
  // The encrypted store has not opened yet, so nothing reached it and
  // no request was made; the journal already holds the message, which
  // is what makes leaving the page right now safe.
  assert.equal(ui.saved.length, 0);
  assert.equal(ui.requests.filter(request => request.action === 'chat').length, 0);
  const journaled = ui.journal();
  assert.equal(journaled.length, 1);
  assert.equal(journaled[0].text, 'Do not lose this one');
  assert.equal(journaled[0].status, 'queued');
  releaseStore();
  await submitted; await flush(); await flush();
  // Once the store save lands, the journal entry is retired: the store
  // copy is the one record from here on.
  assert.equal(ui.journal().length, 0);
  assert.equal(ui.saved[0].id, journaled[0].id);
  assert.equal(ui.saved[0].createdAt, journaled[0].createdAt);
  assert.equal(ui.saved.at(-1).status, 'completed');
});

test('chat submits are sent with fetch keepalive so leaving mid-send cannot abort them', async () => {
  const ui = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' });
  await ui.ready;
  await ui.submit('Survive my exit');
  const chatFetch = ui.fetches.find(item => JSON.parse(item.options.body).action === 'chat');
  assert.ok(chatFetch);
  assert.equal(chatFetch.options.keepalive, true);
  const statusFetch = ui.fetches.find(item => JSON.parse(item.options.body).action === 'status');
  assert.equal(statusFetch.options.keepalive, undefined);
});

test('a journaled message from a page that died before saving is sent exactly once after reload', async () => {
  const storage = new Map([['signedIn', 'true'], ['alias', 'tmsteph@3dvr'], ['username', 'tmsteph']]);
  const neverOpens = new Promise(() => {});
  const dead = screen({ ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' }, 200, true, null, new Map(), { storage, storeGate: neverOpens });
  await dead.ready;
  void dead.submit('Sent while leaving');
  await flush(); await flush();
  assert.equal(dead.saved.length, 0);
  const journaled = dead.journal();
  assert.equal(journaled.length, 1);
  // A fresh page life over the same local storage: the store never saw
  // the message, so the journal is the only copy. It must be picked up
  // and sent once, under its original id, and then retired.
  const ui = screen(payload => payload.action === 'status'
    ? { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } }
    : { status: 200, body: { ok: true, reply: 'Landed after all' } }, 200, true, null, new Map(), { storage });
  await ui.ready; await flush(); await flush(); await flush(); await flush();
  const chats = ui.requests.filter(request => request.action === 'chat');
  assert.equal(chats.length, 1);
  assert.equal(chats[0].requestId, journaled[0].id);
  assert.equal(chats[0].message, 'Sent while leaving');
  assert.equal(chats[0].createdAt, journaled[0].createdAt);
  assert.equal(ui.saved.at(-1).status, 'completed');
  assert.equal(ui.saved.at(-1).reply, 'Landed after all');
  assert.equal(ui.journal().length, 0);
});

test('a sending record restored on reload resubmits its identical payload, never a new message', async () => {
  const ui = screen(payload => payload.action === 'status'
    ? { status: 200, body: { ok: true, gateway: 'reachable', chatEnabled: true } }
    : { status: 200, body: { ok: true, reply: 'Recovered reply' } });
  await ui.ready; await flush(); await flush();
  const now = Date.now();
  ui.seed(seedRecord({ id: 'seed-flight-002', sessionId: 'chat-flight-002', text: 'Long task', at: now - 60000, status: 'sending' }));
  ui.focus();
  await flush(); await flush(); await flush();
  // The resubmission is the receipt query: same request id, same
  // createdAt, so the server fingerprint matches the original send and
  // the turn can only ever run once.
  const chats = ui.requests.filter(item => item.action === 'chat');
  assert.equal(chats.length, 1);
  assert.equal(chats[0].requestId, 'seed-flight-002');
  assert.equal(chats[0].createdAt, now - 60000);
  assert.equal(ui.saved.at(-1).status, 'completed');
});
