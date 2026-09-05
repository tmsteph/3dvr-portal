const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  correct,
  importContextSessions,
  remember,
} = require('../thomas-agent/node/digital-organism');
const {
  adaptiveRecall,
  builtInBenchmark,
  evaluateStrategies,
  promoteStrategy,
  promotionDecision,
  readSelectedStrategy,
  realBenchmark,
  recordRetrievalFeedback,
  runBuiltInTournament,
  runRealTournament,
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

test('real benchmark turns corrections, approved handoffs, and retrieval approval into weighted evidence', async (t) => {
  const stateDir = await tempStateDir();
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));

  const oldMemory = await remember('The primary worker is DigitalOcean.', {
    stateDir,
    subject: 'primary worker',
    createdAt: '2026-01-01T12:00:00.000Z',
  });
  const replacement = await correct(oldMemory.id, 'The primary worker is OVH.', {
    stateDir,
    createdAt: '2026-09-05T12:00:00.000Z',
  });

  await importContextSessions([{
    id: 'approved-handoff',
    project: 'digital-organism',
    summary: 'The Digital Organism uses evidence to select retrieval strategies.',
    createdAt: '2026-09-05T12:10:00.000Z',
  }], { stateDir });

  await recordRetrievalFeedback('Which machine is the primary worker?', replacement.id, {
    stateDir,
    now: Date.parse('2026-09-05T12:20:00.000Z'),
  });

  const benchmark = await realBenchmark({ stateDir });
  assert.equal(benchmark.evidence.caseCount, 3);
  assert.equal(benchmark.evidence.correction, 1);
  assert.equal(benchmark.evidence['context-hq'], 1);
  assert.equal(benchmark.evidence['retrieval-feedback'], 1);
  assert.equal(benchmark.evidence.highQualityCount, 2);
  assert.equal(benchmark.memories.some(memory => memory.id === oldMemory.id), false);
  assert.equal(benchmark.memories.some(memory => memory.id === replacement.id), true);

  const feedbackCase = benchmark.cases.find(testCase => testCase.evidenceType === 'retrieval-feedback');
  const correctionCase = benchmark.cases.find(testCase => testCase.evidenceType === 'correction');
  const contextCase = benchmark.cases.find(testCase => testCase.evidenceType === 'context-hq');
  assert.equal(feedbackCase.weight, 3);
  assert.equal(correctionCase.weight, 2);
  assert.equal(contextCase.weight, 0.5);
});

test('real tournament keeps the baseline incumbent when real evidence only ties', async (t) => {
  const stateDir = await tempStateDir();
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));

  const oldMemory = await remember('The current deployment home is DigitalOcean.', {
    stateDir,
    subject: 'deployment home',
    createdAt: '2026-01-01T12:00:00.000Z',
  });
  const replacement = await correct(oldMemory.id, 'The current deployment home is OVH.', {
    stateDir,
    createdAt: '2026-09-05T12:00:00.000Z',
  });
  await recordRetrievalFeedback('Where is the current deployment home?', replacement.id, {
    stateDir,
    now: Date.parse('2026-09-05T12:10:00.000Z'),
  });
  await importContextSessions([{
    id: 'approved-real-tournament',
    project: 'deployment',
    summary: 'OVH is the persistent workload host for the Digital Organism.',
    createdAt: '2026-09-05T12:15:00.000Z',
  }], { stateDir });

  const tournament = await runRealTournament({
    stateDir,
    promote: true,
    now: Date.parse('2026-09-05T13:00:00.000Z'),
  });

  assert.ok(tournament.winner);
  assert.equal(tournament.evidence.caseCount, 3);
  assert.equal(tournament.promotionEligibility.eligible, true);
  assert.equal(tournament.winner, 'baseline-jaccard');
  assert.equal(tournament.promotion, undefined);
  assert.match(tournament.promotionBlocked, /incumbent baseline-jaccard already leads/);
  assert.equal(await readSelectedStrategy({ stateDir }), null);
});

test('promotion decision requires a meaningful MRR gain without hit@1 regression', () => {
  const selected = { strategy: 'baseline-jaccard' };
  const tinyGain = promotionDecision({
    winner: 'query-coverage',
    results: [
      { strategy: 'baseline-jaccard', mrr: 0.70, hitAt1: 0.60 },
      { strategy: 'query-coverage', mrr: 0.71, hitAt1: 0.61 },
    ],
  }, selected);
  assert.equal(tinyGain.eligible, false);
  assert.match(tinyGain.reason, /below required/);

  const realGain = promotionDecision({
    winner: 'query-coverage',
    results: [
      { strategy: 'baseline-jaccard', mrr: 0.70, hitAt1: 0.60 },
      { strategy: 'query-coverage', mrr: 0.75, hitAt1: 0.62 },
    ],
  }, selected);
  assert.equal(realGain.eligible, true);

  const regression = promotionDecision({
    winner: 'query-coverage',
    results: [
      { strategy: 'baseline-jaccard', mrr: 0.70, hitAt1: 0.70 },
      { strategy: 'query-coverage', mrr: 0.76, hitAt1: 0.65 },
    ],
  }, selected);
  assert.equal(regression.eligible, false);
  assert.match(regression.reason, /regress hit@1/);
});

test('Context HQ evidence alone cannot promote a strategy', async (t) => {
  const stateDir = await tempStateDir();
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));

  await importContextSessions([
    { id: 'ctx-1', project: 'one', summary: 'Alpha project uses local memory.', createdAt: '2026-09-05T10:00:00.000Z' },
    { id: 'ctx-2', project: 'two', summary: 'Beta project uses durable provenance.', createdAt: '2026-09-05T10:01:00.000Z' },
    { id: 'ctx-3', project: 'three', summary: 'Gamma project evaluates retrieval.', createdAt: '2026-09-05T10:02:00.000Z' },
  ], { stateDir });

  const tournament = await runRealTournament({ stateDir, promote: true });
  assert.ok(tournament.winner);
  assert.equal(tournament.evidence.caseCount, 3);
  assert.equal(tournament.evidence.highQualityCount, 0);
  assert.equal(tournament.promotionEligibility.eligible, false);
  assert.match(tournament.promotionBlocked, /correction|approved retrieval/);
  assert.equal(await readSelectedStrategy({ stateDir }), null);
});

test('retrieval approval rejects unknown or forgotten memories', async (t) => {
  const stateDir = await tempStateDir();
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));

  await assert.rejects(
    recordRetrievalFeedback('Where is it?', 'mem_missing', { stateDir }),
    /inactive or unknown memory/,
  );
});
