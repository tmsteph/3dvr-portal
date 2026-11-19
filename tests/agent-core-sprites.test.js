import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SPRITE_POPULATION_CAP,
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

test('a tick can end in a fork decision: the child is created with lineage and a carved budget', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha', { budgetUsd: 3 });
  const core = stubCore('I keep thinking about seeds. A riverside variant of me would notice different things.\nFORK: beta | A riverside thinker: same seed questions, but grounded in water and banks instead of dry soil.');
  const result = await tickSprite({ root, name: 'alpha', core });
  assert.equal(result.status, 'ticked');
  assert.equal(result.fork.status, 'forked');
  assert.equal(result.fork.child, 'beta');
  assert.equal(result.fork.childBudgetUsd, 1);
  assert.equal(result.fork.parentBudgetUsd, 2);
  // the parent's cap dropped by the child's cap: funded energy did not grow
  const parentIdentity = await loadIdentity(join(root, 'alpha'));
  assert.equal(parentIdentity.budgetUsd, 2);
  // lineage is recorded in the child
  const childIdentity = await loadIdentity(join(root, 'beta'));
  assert.equal(childIdentity.forkedFrom, 'alpha');
  assert.equal(childIdentity.generation, 1);
  assert.equal(childIdentity.budgetUsd, 1);
  assert.match(childIdentity.forkReason, /riverside thinker/i);
  assert.ok(childIdentity.forkedAt);
  assert.match(childIdentity.persona, /You are beta, a test sprite\./);
  assert.match(childIdentity.persona, /variation of Alpha/);
  // the trailer is stripped from the parent's journaled thought; the fork is logged there
  const parentJournal = await readFile(join(root, 'alpha', 'journal.md'), 'utf8');
  assert.match(parentJournal, /I keep thinking about seeds\./);
  assert.doesNotMatch(parentJournal, /FORK: beta/);
  assert.match(parentJournal, /## Fork/);
  assert.match(parentJournal, /child \*\*beta\*\*/);
  // the child's first journal entry says who it is, whose it is, and why it was made
  const childJournal = await readFile(join(root, 'beta', 'journal.md'), 'utf8');
  assert.match(childJournal, /by alpha itself/);
  assert.match(childJournal, /riverside thinker/i);
  const parentState = await loadState(join(root, 'alpha'));
  assert.ok(parentState.lastForkAt);
});

test('self-forking respects the terrarium population cap', async t => {
  const root = await makeRoot(t);
  for (let i = 0; i < SPRITE_POPULATION_CAP; i++) await writeInstance(root, `s${i}`);
  const core = stubCore('Time to multiply.\nFORK: one-more | Why not.');
  const result = await tickSprite({ root, name: 's0', core });
  assert.equal(result.fork.status, 'denied');
  assert.match(result.fork.reason, /population cap/);
  const { readdir } = await import('node:fs/promises');
  const dirs = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory());
  assert.equal(dirs.length, SPRITE_POPULATION_CAP);
  const journal = await readFile(join(root, 's0', 'journal.md'), 'utf8');
  assert.match(journal, /bounds said no/);
});

test('a self-fork carves the child budget out of what the parent has left', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha', { budgetUsd: 1.5 });
  await tickSprite({ root, name: 'alpha', core: stubCore('A pricey thought.', 0.6) });
  const result = await tickSprite({ root, name: 'alpha', core: stubCore('Forking on fumes.\nFORK: beta | A cheaper, smaller thinker.', 0.01) });
  assert.equal(result.fork.status, 'forked');
  // spent 0.61 of 1.50, so 0.89 remained: the child gets all of it and the parent's cap falls to its spend
  assert.equal(result.fork.childBudgetUsd, 0.89);
  const childIdentity = await loadIdentity(join(root, 'beta'));
  assert.equal(childIdentity.budgetUsd, 0.89);
  const parentIdentity = await loadIdentity(join(root, 'alpha'));
  assert.equal(parentIdentity.budgetUsd, 0.61);
});

test('a forked child cannot fork in its first day, and no sprite forks twice in a day', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha', { budgetUsd: 3 });
  const forkReply = name => `Thinking.\nFORK: ${name} | A variation.`;
  const first = await tickSprite({ root, name: 'alpha', core: stubCore(forkReply('beta')) });
  assert.equal(first.fork.status, 'forked');
  // the parent cannot fork again right away
  const again = await tickSprite({ root, name: 'alpha', core: stubCore(forkReply('gamma')) });
  assert.equal(again.fork.status, 'denied');
  assert.match(again.fork.reason, /already forked within the last 24 hours/);
  // the child cannot fork in its first 24 hours
  const childTry = await tickSprite({ root, name: 'beta', core: stubCore(forkReply('delta')) });
  assert.equal(childTry.fork.status, 'denied');
  assert.match(childTry.fork.reason, /first 24 hours/);
  // a day later the child may fork, and the grandchild is generation 2
  const later = Date.now() + 25 * 60 * 60 * 1000;
  const childFork = await tickSprite({ root, name: 'beta', core: stubCore(forkReply('delta')), now: () => later });
  assert.equal(childFork.fork.status, 'forked');
  const grandchild = await loadIdentity(join(root, 'delta'));
  assert.equal(grandchild.generation, 2);
  assert.equal(grandchild.forkedFrom, 'beta');
});

test('a malformed FORK trailer is ignored, never fatal', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha');
  const core = stubCore('A normal thought.\nFORK: Not A Valid Name | no separator discipline');
  const result = await tickSprite({ root, name: 'alpha', core });
  assert.equal(result.status, 'ticked');
  assert.equal(result.fork, undefined);
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(root), ['alpha']);
  const journal = await readFile(join(root, 'alpha', 'journal.md'), 'utf8');
  assert.match(journal, /A normal thought\./);
  assert.doesNotMatch(journal, /FORK:/);
});

test('a STOP file at the terrarium root halts every sprite', async t => {
  const root = await makeRoot(t);
  await writeInstance(root, 'alpha');
  await writeInstance(root, 'beta');
  await writeFile(join(root, 'STOP'), 'Owner stop for the whole terrarium.\n');
  const core = stubCore();
  const a = await tickSprite({ root, name: 'alpha', core });
  const b = await tickSprite({ root, name: 'beta', core });
  assert.equal(a.status, 'stopped');
  assert.equal(b.status, 'stopped');
  assert.equal(core.calls.length, 0);
  const rows = await spriteStatus({ root });
  assert.ok(rows.every(row => row.stopped));
  await rm(join(root, 'STOP'));
  const after = await tickSprite({ root, name: 'alpha', core });
  assert.equal(after.status, 'ticked');
});
