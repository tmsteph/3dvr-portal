import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  forkSprite,
  loadIdentity,
  loadState,
  resumeSprite,
  spriteStatus,
  stopSprite,
  tickSprite,
} from '../src/agent-core/sprites/sprite.js';

const COST = 0.01;

async function makeRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'sprites-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeInstance(root, name, overrides = {}) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(join(root, name), { recursive: true });
  const identity = {
    name,
    persona: `You are ${name}, a test sprite.`,
    goals: ['Think about seeds.', 'Notice the rain.'],
    budgetUsd: 1,
    paused: false,
    forkedFrom: null,
    createdAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
  await writeFile(join(root, name, 'identity.json'), `${JSON.stringify(identity, null, 2)}\n`);
  return identity;
}

function stubCore(reply = 'I thought about seeds today.', cost = COST) {
  const calls = [];
  return {
    calls,
    run: async request => {
      calls.push(request);
      return { ok: true, reply, usage: { estimatedCost: cost } };
    },
  };
}

test('a tick appends the thought to the journal and meters spend', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha');
  const core = stubCore();
  const result = await tickSprite({ root, name: 'alpha', core });
  assert.equal(result.status, 'ticked');
  assert.equal(result.tick, 1);
  assert.equal(result.cost, COST);
  assert.equal(core.calls.length, 1);
  assert.equal(core.calls[0].session, 'sprite-alpha');
  assert.match(core.calls[0].message, /Think about seeds\./);
  const journal = await readFile(join(root, 'alpha', 'journal.md'), 'utf8');
  assert.match(journal, /## Tick 1/);
  assert.match(journal, /I thought about seeds today\./);
  const state = await loadState(join(root, 'alpha'));
  assert.equal(state.ticks, 1);
  assert.equal(state.spentUsd, COST);
  assert.ok(state.lastTickAt);
  const second = await tickSprite({ root, name: 'alpha', core });
  assert.equal(second.tick, 2);
  const journalAfter = await readFile(join(root, 'alpha', 'journal.md'), 'utf8');
  assert.match(journalAfter, /## Tick 2/);
  // the second tick is given the first thought as context
  assert.match(core.calls[1].message, /I thought about seeds today\./);
});

test('a tick honors the STOP file and spends nothing', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha');
  await stopSprite({ root, name: 'alpha' });
  const core = stubCore();
  const result = await tickSprite({ root, name: 'alpha', core });
  assert.equal(result.status, 'stopped');
  assert.equal(core.calls.length, 0);
  await assert.rejects(access(join(root, 'alpha', 'journal.md')));
  await resumeSprite({ root, name: 'alpha' });
  const after = await tickSprite({ root, name: 'alpha', core });
  assert.equal(after.status, 'ticked');
  assert.equal(core.calls.length, 1);
});

test('a tick honors a paused identity', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha', { paused: true });
  const core = stubCore();
  const result = await tickSprite({ root, name: 'alpha', core });
  assert.equal(result.status, 'stopped');
  assert.equal(core.calls.length, 0);
});

test('the budget cap stops ticks once the tally reaches it', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha', { budgetUsd: 0.015 });
  const core = stubCore();
  const first = await tickSprite({ root, name: 'alpha', core });
  assert.equal(first.status, 'ticked');
  const second = await tickSprite({ root, name: 'alpha', core });
  assert.equal(second.status, 'ticked-budget-reached');
  const third = await tickSprite({ root, name: 'alpha', core });
  assert.equal(third.status, 'budget-exhausted');
  assert.equal(core.calls.length, 2);
  const state = await loadState(join(root, 'alpha'));
  assert.equal(state.ticks, 2);
  assert.equal(state.spentUsd, 0.02);
});

test('fork creates an independent copy with a fresh journal', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha');
  const core = stubCore('parent thought');
  await tickSprite({ root, name: 'alpha', core });
  const child = await forkSprite({ root, source: 'alpha', target: 'beta', overrides: { goals: ['Think about rivers.'] } });
  assert.equal(child.name, 'beta');
  assert.equal(child.forkedFrom, 'alpha');
  assert.deepEqual(child.goals, ['Think about rivers.']);
  const childJournal = await readFile(join(root, 'beta', 'journal.md'), 'utf8');
  assert.doesNotMatch(childJournal, /parent thought/);
  const childState = await loadState(join(root, 'beta'));
  assert.equal(childState.ticks, 0);
  assert.equal(childState.spentUsd, 0);
  // editing the copy leaves the parent untouched
  const childIdentity = await loadIdentity(join(root, 'beta'));
  childIdentity.goals = ['Changed by the owner.'];
  await writeFile(join(root, 'beta', 'identity.json'), JSON.stringify(childIdentity));
  const parentIdentity = await loadIdentity(join(root, 'alpha'));
  assert.deepEqual(parentIdentity.goals, ['Think about seeds.', 'Notice the rain.']);
  // ticking the child does not move the parent
  await tickSprite({ root, name: 'beta', core: stubCore('child thought') });
  const parentState = await loadState(join(root, 'alpha'));
  assert.equal(parentState.ticks, 1);
  await assert.rejects(forkSprite({ root, source: 'alpha', target: 'beta' }), /already exists/);
});

test('a failed tick is explicit: no fabricated thought, reason recorded, no spend', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha');
  const core = { run: async () => ({ ok: false, error: 'provider is down' }) };
  const result = await tickSprite({ root, name: 'alpha', core });
  assert.equal(result.status, 'error');
  assert.match(result.error, /provider is down/);
  await assert.rejects(access(join(root, 'alpha', 'journal.md')));
  const state = await loadState(join(root, 'alpha'));
  assert.equal(state.ticks, 0);
  assert.equal(state.spentUsd, 0);
  assert.match(state.lastError, /provider is down/);
});

test('status reads every instance side by side', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha');
  await writeInstance(root, 'beta', { budgetUsd: 2 });
  await tickSprite({ root, name: 'alpha', core: stubCore() });
  await stopSprite({ root, name: 'beta' });
  const rows = await spriteStatus({ root });
  assert.equal(rows.length, 2);
  const alpha = rows.find(row => row.name === 'alpha');
  assert.equal(alpha.ticks, 1);
  assert.equal(alpha.spentUsd, COST);
  assert.equal(alpha.remainingUsd, 0.99);
  assert.ok(alpha.lastTickAt);
  assert.equal(alpha.stopped, false);
  const beta = rows.find(row => row.name === 'beta');
  assert.equal(beta.ticks, 0);
  assert.equal(beta.stopped, true);
  assert.equal(beta.lastTickAt, null);
});
