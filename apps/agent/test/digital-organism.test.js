const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  ask,
  buildContext,
  correct,
  forget,
  recall,
  remember,
} = require('../thomas-agent/node/digital-organism');

async function tempStateDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), '3dvr-organism-'));
}

test('remembers, retrieves, and exposes provenance locally', async (t) => {
  const stateDir = await tempStateDir();
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));

  const memory = await remember('The primary worker is the DigitalOcean node.', {
    stateDir,
    subject: 'infrastructure',
    sourceType: 'conversation',
    sourceId: 'chat-123',
  });
  const hits = await recall('Which DigitalOcean worker do we use?', { stateDir });
  assert.equal(hits[0].memory.id, memory.id);

  const context = await buildContext('Which DigitalOcean worker do we use?', { stateDir });
  assert.match(context.text, /primary worker is the DigitalOcean node/);
  assert.match(context.text, /source=conversation:chat-123/);
});

test('forget removes a memory from active recall while keeping append-only history', async (t) => {
  const stateDir = await tempStateDir();
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));

  const memory = await remember('Temporary launch detail alpha.', { stateDir });
  await forget(memory.id, { stateDir });
  const hits = await recall('launch detail alpha', { stateDir });
  assert.equal(hits.length, 0);

  const lines = (await fs.readFile(path.join(stateDir, 'memories.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).type, 'forget');
});

test('correction supersedes the active memory without rewriting history', async (t) => {
  const stateDir = await tempStateDir();
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));

  const original = await remember('The server is blue.', { stateDir, subject: 'server' });
  const replacement = await correct(original.id, 'The server is green.', { stateDir });
  assert.notEqual(replacement.id, original.id);

  const oldHits = await recall('blue', { stateDir });
  assert.equal(oldHits.length, 0);
  const newHits = await recall('green', { stateDir });
  assert.equal(newHits[0].memory.id, replacement.id);
});

test('ask refuses to transmit context unless a provider is explicitly selected', async (t) => {
  const stateDir = await tempStateDir();
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));
  await remember('Private memory.', { stateDir });

  await assert.rejects(
    ask('What do you remember?', { stateDir }),
    /No model provider selected/,
  );
});

test('compatible provider receives retrieved context only after explicit selection', async (t) => {
  const stateDir = await tempStateDir();
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));
  await remember('The project codename is Firefly.', { stateDir, subject: 'project' });

  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: 'Firefly' } }] };
      },
    };
  };

  const result = await ask('What is the project codename?', {
    stateDir,
    provider: 'compatible',
    url: 'http://127.0.0.1:11434',
    model: 'local-model',
  }, { fetchImpl });

  assert.equal(result.answer, 'Firefly');
  assert.equal(request.url, 'http://127.0.0.1:11434/v1/chat/completions');
  const body = JSON.parse(request.options.body);
  assert.match(body.messages[1].content, /codename is Firefly/);
});
