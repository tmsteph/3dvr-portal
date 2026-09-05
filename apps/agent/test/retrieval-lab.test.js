const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { remember } = require('../thomas-agent/node/digital-organism');
const {
  adaptiveRecall,
  builtInBenchmark,
  evaluateStrategies,
  promoteStrategy,
  readSelectedStrategy,
  runBuiltInTournament,
} = require('../thomas-agent/node/retrieval-lab');

async function tempStateDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), '3dvr-retrieval-lab-'));
}

test('retrieval strategies compete on the same labeled benchmark', () => {
  const benchmark = builtInBenchmark();
  const tournament = evaluateStrategies(benchmark.cases, benchmark.memories);

  assert.equal(tournament.results.length, 3);
  assert.ok(tournament.winner);
  assert.equal(tournament.results[0].strategy, tournament.winner);
  assert.ok(tournament.results[0].mrr >= tournament.results[1].mrr);
});

test('built-in tournament rewards a strategy that handles current-state conflicts', async () => {
  const tournament = await runBuiltInTournament();
  const winner = tournament.results[0];

  assert.ok(winner.mrr > 0);
  assert.ok(winner.cases.some(result => result.name.includes('current state')));
  assert.equal(winner.strategy, tournament.winner);
});

test('winning strategy can be promoted and reused for adaptive recall', async (t) => {
  const stateDir = await tempStateDir();
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));

  const tournament = await runBuiltInTournament({ stateDir });
  const promotion = await promoteStrategy(tournament.winner, tournament, { stateDir });
  const selected = await readSelectedStrategy({ stateDir });

  assert.equal(selected.strategy, promotion.strategy);
  assert.equal(selected.evaluation.winner, tournament.winner);

  const oldMemory = await remember('The current habitat is DigitalOcean.', {
    stateDir,
    subject: 'current habitat',
    createdAt: '2026-01-01T12:00:00.000Z',
  });
  const newMemory = await remember('The current habitat is OVH.', {
    stateDir,
    subject: 'current habitat',
    createdAt: '2026-09-05T12:00:00.000Z',
  });

  const hits = await adaptiveRecall('current habitat', {
    stateDir,
    now: Date.parse('2026-09-05T13:00:00.000Z'),
  });

  assert.ok(hits.length >= 2);
  assert.equal(hits[0].strategy, selected.strategy);
  assert.ok([oldMemory.id, newMemory.id].includes(hits[0].memory.id));
});
