const fs = require('node:fs/promises');
const path = require('node:path');

const {
  loadEvents,
  replayMemories,
  statePaths,
  tokens,
} = require('./digital-organism');

const STRATEGY_NAMES = [
  'baseline-jaccard',
  'query-coverage',
  'recency-coverage',
];

function normalizeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function memoryText(memory = {}) {
  return `${memory.subject || ''} ${memory.content || ''} ${memory.kind || ''}`;
}

function lexicalMetrics(queryTokens, memory) {
  const haystack = tokens(memoryText(memory));
  const subjectTokens = tokens(memory.subject || '');
  const overlap = [...queryTokens].filter(token => haystack.has(token)).length;
  const subjectOverlap = [...queryTokens].filter(token => subjectTokens.has(token)).length;
  const union = new Set([...queryTokens, ...haystack]).size || 1;
  const querySize = queryTokens.size || 1;
  return {
    overlap,
    jaccard: overlap / union,
    queryCoverage: overlap / querySize,
    subjectCoverage: subjectOverlap / querySize,
  };
}

function recencyScore(memory, now = Date.now(), halfLifeDays = 30) {
  const timestamp = Date.parse(memory.createdAt || '');
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (now - timestamp) / 86_400_000);
  return Math.pow(0.5, ageDays / Math.max(1, halfLifeDays));
}

function scoreWithStrategy(strategy, queryTokens, memory, options = {}) {
  const metrics = lexicalMetrics(queryTokens, memory);
  const importance = normalizeNumber(memory.importance, 0);
  const confidence = normalizeNumber(memory.confidence, 0);
  const recency = recencyScore(memory, options.now, options.halfLifeDays);

  let score;
  if (strategy === 'baseline-jaccard') {
    score = metrics.jaccard * 0.75 + importance * 0.15 + confidence * 0.10;
  } else if (strategy === 'query-coverage') {
    score = metrics.queryCoverage * 0.65
      + metrics.subjectCoverage * 0.20
      + importance * 0.10
      + confidence * 0.05;
  } else if (strategy === 'recency-coverage') {
    score = metrics.queryCoverage * 0.55
      + metrics.subjectCoverage * 0.15
      + recency * 0.15
      + importance * 0.10
      + confidence * 0.05;
  } else {
    throw new Error(`Unknown retrieval strategy: ${strategy}`);
  }

  return {
    score,
    overlap: metrics.overlap,
    metrics: {
      ...metrics,
      recency,
    },
  };
}

function rankMemories(query, memories = [], strategy = 'baseline-jaccard', options = {}) {
  if (!STRATEGY_NAMES.includes(strategy)) {
    throw new Error(`Unknown retrieval strategy: ${strategy}`);
  }
  const queryTokens = tokens(query);
  const limit = Math.max(1, Number.parseInt(options.limit || '5', 10) || 5);

  return memories
    .map(memory => ({
      ...scoreWithStrategy(strategy, queryTokens, memory, options),
      strategy,
      memory,
    }))
    .filter(hit => hit.overlap > 0 || queryTokens.size === 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.memory.createdAt || '').localeCompare(String(a.memory.createdAt || ''));
    })
    .slice(0, limit);
}

function reciprocalRank(hits, expectedIds = []) {
  const expected = new Set(expectedIds);
  const index = hits.findIndex(hit => expected.has(hit.memory.id));
  return index === -1 ? 0 : 1 / (index + 1);
}

function evaluateStrategies(cases = [], memories = [], options = {}) {
  const strategies = options.strategies || STRATEGY_NAMES;
  const results = strategies.map(strategy => {
    const caseResults = cases.map(testCase => {
      const expectedIds = testCase.expectedIds || [testCase.expectedId].filter(Boolean);
      const hits = rankMemories(testCase.query, memories, strategy, {
        ...options,
        limit: testCase.limit || options.limit || 5,
        now: testCase.now || options.now,
      });
      const rr = reciprocalRank(hits, expectedIds);
      return {
        name: testCase.name || testCase.query,
        query: testCase.query,
        expectedIds,
        reciprocalRank: rr,
        hitAt1: rr === 1,
        rankedIds: hits.map(hit => hit.memory.id),
      };
    });

    const total = Math.max(1, caseResults.length);
    const mrr = caseResults.reduce((sum, result) => sum + result.reciprocalRank, 0) / total;
    const hitAt1 = caseResults.filter(result => result.hitAt1).length / total;
    return {
      strategy,
      score: mrr,
      mrr,
      hitAt1,
      cases: caseResults,
    };
  });

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.hitAt1 !== a.hitAt1) return b.hitAt1 - a.hitAt1;
    return a.strategy.localeCompare(b.strategy);
  });

  return {
    winner: results[0]?.strategy || null,
    results,
  };
}

function builtInBenchmark() {
  const memories = [
    {
      id: 'bench_primary',
      kind: 'decision',
      subject: 'production deployment target',
      content: 'The production deployment target for the Digital Organism is the OVH worker, with the DigitalOcean node kept as the control plane and many supporting operational details documented elsewhere.',
      createdAt: '2026-09-05T12:00:00.000Z',
      importance: 0.8,
      confidence: 1,
    },
    {
      id: 'bench_distractor',
      kind: 'note',
      subject: 'production deployment notes',
      content: 'Production deployment notes mention staging checks.',
      createdAt: '2026-09-05T12:00:00.000Z',
      importance: 0.8,
      confidence: 1,
    },
    {
      id: 'bench_old',
      kind: 'fact',
      subject: 'agent runtime',
      content: 'The agent runtime is on the DigitalOcean node.',
      createdAt: '2026-01-01T12:00:00.000Z',
      importance: 0.7,
      confidence: 1,
    },
    {
      id: 'bench_new',
      kind: 'fact',
      subject: 'agent runtime',
      content: 'The agent runtime is on the OVH node.',
      createdAt: '2026-09-05T12:00:00.000Z',
      importance: 0.7,
      confidence: 1,
    },
    {
      id: 'bench_project',
      kind: 'project',
      subject: 'digital organism',
      content: 'The Digital Organism keeps user-owned memory separate from replaceable models.',
      createdAt: '2026-09-04T12:00:00.000Z',
      importance: 0.9,
      confidence: 1,
    },
  ];

  const cases = [
    {
      name: 'prefer complete query coverage over a short partial match',
      query: 'production deployment target OVH',
      expectedId: 'bench_primary',
      now: Date.parse('2026-09-05T13:00:00.000Z'),
    },
    {
      name: 'prefer current state when two facts conflict lexically',
      query: 'agent runtime node',
      expectedId: 'bench_new',
      now: Date.parse('2026-09-05T13:00:00.000Z'),
    },
    {
      name: 'retain strong topical recall',
      query: 'digital organism user-owned memory models',
      expectedId: 'bench_project',
      now: Date.parse('2026-09-05T13:00:00.000Z'),
    },
  ];

  return { memories, cases };
}

function selectionPath(options = {}) {
  return path.join(statePaths(options).stateDir, 'retrieval-strategy.json');
}

async function readSelectedStrategy(options = {}) {
  try {
    const raw = await fs.readFile(selectionPath(options), 'utf8');
    const data = JSON.parse(raw);
    return STRATEGY_NAMES.includes(data.strategy) ? data : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function promoteStrategy(strategy, tournament, options = {}) {
  if (!STRATEGY_NAMES.includes(strategy)) {
    throw new Error(`Unknown retrieval strategy: ${strategy}`);
  }
  const target = selectionPath(options);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const record = {
    strategy,
    selectedAt: new Date(options.now || Date.now()).toISOString(),
    evaluation: tournament ? {
      winner: tournament.winner,
      results: tournament.results.map(result => ({
        strategy: result.strategy,
        mrr: result.mrr,
        hitAt1: result.hitAt1,
      })),
    } : null,
  };
  await fs.writeFile(target, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}

async function activeMemories(options = {}) {
  return replayMemories(await loadEvents(options));
}

async function adaptiveRecall(query, options = {}) {
  const selected = options.strategy
    ? { strategy: options.strategy }
    : await readSelectedStrategy(options);
  const strategy = selected?.strategy || 'baseline-jaccard';
  const memories = await activeMemories(options);
  return rankMemories(query, memories, strategy, options);
}

async function runBuiltInTournament(options = {}) {
  const benchmark = builtInBenchmark();
  const tournament = evaluateStrategies(benchmark.cases, benchmark.memories, options);
  if (options.promote && tournament.winner) {
    tournament.promotion = await promoteStrategy(tournament.winner, tournament, options);
  }
  return tournament;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    command: argv[0] || 'tournament',
    json: false,
    promote: false,
  };
  const positional = [];
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--promote') options.promote = true;
    else if (arg === '--strategy') options.strategy = argv[++index] || '';
    else if (arg === '--limit') options.limit = Number.parseInt(argv[++index] || '', 10) || 5;
    else if (arg === '--state-dir') options.stateDir = argv[++index] || '';
    else positional.push(arg);
  }
  options.text = positional.join(' ');
  return options;
}

function renderTournament(tournament) {
  const lines = [`winner: ${tournament.winner || 'none'}`];
  for (const result of tournament.results) {
    lines.push(`${result.strategy}\tmrr=${result.mrr.toFixed(3)}\thit@1=${result.hitAt1.toFixed(3)}`);
  }
  if (tournament.promotion) lines.push(`promoted: ${tournament.promotion.strategy}`);
  return lines.join('\n');
}

async function cli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === 'tournament') {
    const result = await runBuiltInTournament(options);
    console.log(options.json ? JSON.stringify(result, null, 2) : renderTournament(result));
    return 0;
  }
  if (options.command === 'recall') {
    const hits = await adaptiveRecall(options.text, options);
    console.log(options.json
      ? JSON.stringify(hits, null, 2)
      : hits.map(hit => `${hit.strategy}\t${hit.score.toFixed(3)}\t${hit.memory.id}\t${hit.memory.content}`).join('\n'));
    return 0;
  }
  if (options.command === 'selected') {
    const selected = await readSelectedStrategy(options);
    console.log(options.json ? JSON.stringify(selected, null, 2) : selected?.strategy || 'baseline-jaccard');
    return 0;
  }
  if (options.command === 'strategies') {
    console.log(STRATEGY_NAMES.join('\n'));
    return 0;
  }
  throw new Error(`Unknown retrieval-lab command: ${options.command}`);
}

module.exports = {
  STRATEGY_NAMES,
  activeMemories,
  adaptiveRecall,
  builtInBenchmark,
  evaluateStrategies,
  lexicalMetrics,
  promoteStrategy,
  rankMemories,
  readSelectedStrategy,
  recencyScore,
  runBuiltInTournament,
  scoreWithStrategy,
  selectionPath,
};

if (require.main === module) {
  cli().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
