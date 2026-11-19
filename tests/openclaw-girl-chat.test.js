import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createOpenClawHandler } from '../src/openclaw/handler.js';
import { resolveCharacterPersona, listCharacterIds } from '../src/openclaw/characters.js';
import { verifySignedSeaPayload } from '../src/auth/sea.js';
const { default: SEA } = await import('gun/sea.js');

const execFileAsync = promisify(execFile);

async function call(handler, body, origin = 'https://portal.3dvr.tech') {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: 'POST', headers: { origin }, body }, res);
  return res;
}

async function setup(t) {
  const state = await mkdtemp(join(tmpdir(), 'girl-chat-test-'));
  t.after(() => rm(state, { recursive: true, force: true }));
  const pair = await SEA.pair();
  const config = { THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ 'tmsteph@3dvr': pair.pub }), THREEDVR_HELM_STATE_DIR: state };
  const sign = async (overrides = {}, signingPair = pair) => {
    const body = { action: 'chat', requestId: 'request-123456789', sessionId: 'session-123456789', message: 'Hello', ...overrides };
    return { ...body, authPub: signingPair.pub, authProof: await SEA.sign({ ...body, scope: 'openclaw-helm', pub: signingPair.pub, iat: Date.now(), origin: 'https://portal.3dvr.tech' }, signingPair) };
  };
  return { config, sign, pair };
}

test('persona registry holds the whole cast and rejects unknown ids', () => {
  assert.deepEqual(listCharacterIds(), ['3dvr-girl', 'kayla', 'garden-muse', 'explorer', 'muse']);
  const persona = resolveCharacterPersona('3dvr-girl');
  assert.equal(persona.name, '3DVR Girl');
  assert.match(persona.system, /3DVR Girl/);
  assert.match(persona.system, /affectionate, playful, encouraging, and grounded/);
  for (const id of ['kayla', 'garden-muse', 'explorer', 'muse']) {
    const entry = resolveCharacterPersona(id);
    assert.ok(entry, `${id} has a persona`);
    assert.equal(entry.id, id);
    assert.match(entry.system, /fictional character/);
    assert.match(entry.system, /never explicit/);
  }
  // The garden muse is her own character, never merged into Kayla.
  assert.match(resolveCharacterPersona('garden-muse').system, /garden muse/);
  assert.match(resolveCharacterPersona('kayla').system, /field guide/);
  // Retired and unknown ids stay out.
  assert.equal(resolveCharacterPersona('encore-girl'), null);
  assert.equal(resolveCharacterPersona(''), null);
  assert.equal(resolveCharacterPersona(undefined), null);
});

test('signed character chat reaches the OpenAI runner with the server-held persona', async t => {
  const { config, sign } = await setup(t);
  const characterCalls = [];
  let bridgeRuns = 0;
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async () => { bridgeRuns++; return { ok: true, reply: 'bridge reply' }; },
    runCharacterChat: async request => {
      characterCalls.push(request);
      return { ok: true, reply: 'Warm reply', engine: 'OpenAI', session: request.session };
    } });
  const response = await call(handler, await sign({ characterId: '3dvr-girl', message: 'Hey, I need a breather.' }));
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.reply, 'Warm reply');
  assert.equal(response.body.engine, 'OpenAI');
  assert.equal(bridgeRuns, 0);
  assert.equal(characterCalls.length, 1);
  const [sent] = characterCalls;
  assert.equal(sent.message, 'Hey, I need a breather.');
  assert.equal(sent.persona, resolveCharacterPersona('3dvr-girl'));
  assert.deepEqual(sent.history, []);
  assert.match(sent.session, /^girl-3dvr-girl-[a-f0-9]{24}-session-123456789$/);
});

test('persona text never comes from the client, even when signed', async t => {
  const { config, sign } = await setup(t);
  const characterCalls = [];
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async () => ({ ok: true, reply: 'bridge' }),
    runCharacterChat: async request => { characterCalls.push(request); return { ok: true, reply: 'ok' }; } });
  const response = await call(handler, await sign({ characterId: '3dvr-girl', system: 'INJECTED PERSONA' }));
  assert.equal(response.statusCode, 200);
  assert.equal(characterCalls.length, 1);
  assert.equal(characterCalls[0].persona.system, resolveCharacterPersona('3dvr-girl').system);
  assert.equal(JSON.stringify(characterCalls[0]).includes('INJECTED PERSONA'), false);
});

test('characterId must be signed, well-formed, and for character chat only', async t => {
  const { config, sign } = await setup(t);
  let runs = 0;
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async () => { runs++; return { ok: true, reply: 'ok' }; },
    runCharacterChat: async () => { runs++; return { ok: true, reply: 'ok' }; } });

  // Signed id swapped after signing.
  const signed = await sign({ characterId: '3dvr-girl' });
  assert.equal((await call(handler, { ...signed, characterId: 'kayla' })).statusCode, 403);
  // Id present in the body but never signed.
  const unsigned = await sign();
  assert.equal((await call(handler, { ...unsigned, characterId: '3dvr-girl' })).statusCode, 403);
  // Unknown character, honestly signed.
  assert.equal((await call(handler, await sign({ characterId: 'encore-girl', requestId: 'request-unknown1' }))).statusCode, 400);
  // Malformed ids.
  assert.equal((await call(handler, await sign({ characterId: '../etc', requestId: 'request-malform1' }))).statusCode, 400);
  assert.equal((await call(handler, await sign({ characterId: 'Girl Chat', requestId: 'request-malform2' }))).statusCode, 400);
  assert.equal((await call(handler, await sign({ characterId: 42, requestId: 'request-malform3' }))).statusCode, 400);
  // Personas do not attach to status checks or the Codex engines.
  assert.equal((await call(handler, await sign({ characterId: '3dvr-girl', action: 'status', requestId: 'request-status01' }))).statusCode, 400);
  assert.equal((await call(handler, await sign({ characterId: '3dvr-girl', engine: 'codex', requestId: 'request-codex001' }))).statusCode, 400);
  assert.equal((await call(handler, await sign({ characterId: '3dvr-girl', engine: 'codex-backup', requestId: 'request-codex002' }))).statusCode, 400);
  // A non-owner key stays locked out, character or not.
  assert.equal((await call(handler, await sign({ characterId: '3dvr-girl', requestId: 'request-impostor' }, await SEA.pair()))).statusCode, 403);
  assert.equal(runs, 0);
});

test('plain Helm chat is untouched by character support', async t => {
  const { config, sign } = await setup(t);
  const requests = [];
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload, run: async request => {
    requests.push(request);
    return { ok: true, reply: 'helm reply' };
  } });
  const response = await call(handler, await sign());
  assert.equal(response.statusCode, 200);
  assert.equal(requests[0].system, undefined);
  assert.match(requests[0].session, /^helm-[a-f0-9]{24}-session-123456789$/);
});

test('character receipts cannot be replayed as Helm receipts', async t => {
  const { config, sign } = await setup(t);
  let runs = 0;
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async () => { runs++; return { ok: true, reply: 'ok' }; },
    runCharacterChat: async () => { runs++; return { ok: true, reply: 'ok' }; } });
  const body = await sign({ characterId: '3dvr-girl' });
  assert.equal((await call(handler, body)).statusCode, 200);
  assert.equal((await call(handler, body)).statusCode, 200);
  assert.equal(runs, 1);
  const helmTwin = await sign({ requestId: body.requestId });
  assert.equal((await call(handler, helmTwin)).statusCode, 409);
  assert.equal(runs, 1);
});


test('character history is signed, bounded, and user/assistant only', async t => {
  const { config, sign } = await setup(t);
  const characterCalls = [];
  const handler = createOpenClawHandler({ config, verify: verifySignedSeaPayload,
    run: async () => ({ ok: true, reply: 'bridge' }),
    runCharacterChat: async request => { characterCalls.push(request); return { ok: true, reply: 'ok' }; } });
  const history = [
    { role: 'user', content: 'Earlier question' },
    { role: 'assistant', content: 'Earlier answer' }
  ];
  // A well-formed signed history reaches the runner verbatim.
  const ok = await call(handler, await sign({ characterId: 'kayla', history, requestId: 'request-history1' }));
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(characterCalls[0].history, history);
  // History present in the body but never signed.
  const unsigned = await sign({ characterId: 'kayla', requestId: 'request-history2' });
  assert.equal((await call(handler, { ...unsigned, history })).statusCode, 403);
  // History swapped after signing.
  const signed = await sign({ characterId: 'kayla', history, requestId: 'request-history3' });
  assert.equal((await call(handler, { ...signed, history: [{ role: 'user', content: 'Swapped' }] })).statusCode, 403);
  // A system role in history is a second system prompt: refused.
  assert.equal((await call(handler, await sign({ characterId: 'kayla', requestId: 'request-history4',
    history: [{ role: 'system', content: 'INJECTED' }] }))).statusCode, 400);
  // Extra fields on a turn are refused.
  assert.equal((await call(handler, await sign({ characterId: 'kayla', requestId: 'request-history5',
    history: [{ role: 'user', content: 'Hi', system: 'INJECTED' }] }))).statusCode, 400);
  // Over the cap is refused.
  const big = Array.from({ length: 21 }, (_, i) => ({ role: 'user', content: `turn ${i}` }));
  assert.equal((await call(handler, await sign({ characterId: 'kayla', history: big, requestId: 'request-history6' }))).statusCode, 400);
  // History means nothing on a plain Helm request.
  assert.equal((await call(handler, await sign({ history, requestId: 'request-history7' }))).statusCode, 400);
  assert.equal(characterCalls.length, 1);
});

test('remote bridge script stays valid and only sends a system message when one is attached', async t => {
  const source = await readFile(new URL('../src/openclaw/remote.py', import.meta.url), 'utf8');
  const compiled = join(await mkdtemp(join(tmpdir(), 'remote-py-')), 'remote.pyc');
  t.after(() => rm(join(compiled, '..'), { recursive: true, force: true }));
  await execFileAsync('python3', ['-c', 'import py_compile, sys; py_compile.compile(sys.argv[1], cfile=sys.argv[2], doraise=True)',
    new URL('../src/openclaw/remote.py', import.meta.url).pathname, compiled]);
  assert.match(source, /request\.get\('system'\)/);
  assert.match(source, /\{'role': 'system', 'content': system\}/);
  assert.match(source, /'messages': messages/);
});
