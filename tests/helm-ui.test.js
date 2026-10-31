import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { createOutbox } from '../helm/outbox.js';
import { readHelmResponse } from '../helm/stream.js';

const source = (await readFile(new URL('../helm/app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));

function screen(result, status = 200, signedIn = true, gate, sessions = new Map()) {
  const elements = new Map();
  const events = new Map();
  const saved = [];
  const requests = [];
  const intervals = new Map();
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
    openHelmMessageStore: async () => ({ save: async record => saved.push(structuredClone(record)), close() {} }),
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
  ui.changeEngine('openclaw');
  assert.equal(ui.element('engine').value, 'codex');
  release(); await sending;
  assert.equal(ui.element('engine').disabled, false);
});

test('reload restores native engine and its conversation session', async () => {
  const result = { ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' };
  const first = screen(result); await first.ready;
  first.changeEngine('codex'); await flush(); await flush();
  await first.submit('Remember this conversation');
  const original = first.requests.filter(item => item.action === 'chat').at(-1);
  const reloaded = screen(result, 200, true, undefined, first.sessions); await reloaded.ready;
  assert.equal(reloaded.element('engine').value, 'codex');
  assert.equal(reloaded.requests[0].engine, 'codex');
  await reloaded.submit('Continue');
  const continued = reloaded.requests.find(item => item.action === 'chat');
  assert.equal(continued.sessionId, original.sessionId);
  assert.equal(continued.engine, 'codex');
});

test('fresh sessions and account changes default to native chat, preserving explicit OpenClaw preference', async () => {
  const result = { ok: true, gateway: 'reachable', chatEnabled: true, reply: 'Done' };
  const fresh = screen(result); await fresh.ready;
  assert.equal(fresh.requests[0].engine, 'codex');
  fresh.changeAccount(); await flush(); await flush();
  assert.equal(fresh.requests.at(-1).engine, 'codex');
  const sessions = new Map([['3dvr.helm.session.tmsteph@3dvr.engine', 'openclaw']]);
  const saved = screen(result, 200, true, undefined, sessions); await saved.ready;
  assert.equal(saved.requests[0].engine, 'openclaw');
});
