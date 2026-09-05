const fs = require('node:fs/promises');
const path = require('node:path');

const {
  appendEvent,
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

const STOP_TOKENS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'are', 'was', 'were',
  'have', 'has', 'had', 'our', 'your', 'their', 'its', 'about', 'what', 'which', 'when',
  'where', 'who', 'why', 'how', 'can', 'could', 'should', 'would', 'will', 'use', 'used',
]);

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
        evidenceType: testCase.evidenceType || 'benchmark',
        weight: Math.max(0, normalizeNumber(testCase.weight, 1)),
        reciprocalRank: rr,
        hitAt1: rr === 1,
        rankedIds: hits.map(hit => hit.memory.id),
      };
    });

    const totalWeight = caseResults.reduce((sum, result) => sum + result.weight, 0) || 1;
    const mrr = caseResults.reduce((sum, result) => sum + result.reciprocalRank * result.weight, 0) / totalWeight;
    const hitAt1 = caseResults.reduce((sum, result) => sum + (result.hitAt1 ? result.weight : 0), 0) / totalWeight;
    return {
      strategy,
      score: mrr,
      mrr,
      hitAt1,
      caseCount: caseResults.length,
      evidenceWeight: totalWeight,
      cases: caseResults,
    };
  });

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.hitAt1 !== a.hitAt1) return b.hitAt1 - a.hitAt1;
    return a.strategy.localeCompare(b.strategy);
  });

  return {
    winner: cases.length ? results[0]?.strategy || null : null,
    results: cases.length ? results : [],
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

function usefulTokens(text, limit = 5) {
  return [...tokens(text)]
    .filter(token => !STOP_TOKENS.has(token))
    .slice(0, limit);
}

function benchmarkQueryForMemory(memory = {}) {
  const query = [...new Set([
    ...usefulTokens(memory.subject || '', 4),
    ...usefulTokens(memory.content || '', 5),
  ])];
  return query.join(' ');
}

function correctionBenchmarkQuery(previous = {}, replacement = {}) {
  const previousTokens = usefulTokens(previous.content || '', 12);
  const replacementTokens = new Set(usefulTokens(replacement.content || '', 12));
  const shared = previousTokens.filter(token => replacementTokens.has(token));
  const query = [...new Set([
    ...usefulTokens(replacement.subject || previous.subject || '', 4),
    ...shared.slice(0, 5),
  ])];
  return query.join(' ') || benchmarkQueryForMemory(replacement);
}

function memoriesById(events = []) {
  const memories = new Map();
  for (const event of events) {
    if (event.memory?.id) memories.set(event.memory.id, event.memory);
  }
  return memories;
}

function realBenchmarkFromEvents(events = []) {
  const active = replayMemories(events);
  const activeIds = new Set(active.map(memory => memory.id));
  const history = memoriesById(events);
  const cases = [];
  const seen = new Set();
  const counts = {
    correction: 0,
    'context-hq': 0,
    'retrieval-feedback': 0,
  };

  function addCase(testCase) {
    const query = String(testCase.query || '').trim();
    if (!query || !activeIds.has(testCase.expectedId)) return;
    const key = `${testCase.evidenceType}\u0000${testCase.expectedId}\u0000${query.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    cases.push({ ...testCase, query });
    counts[testCase.evidenceType] = (counts[testCase.evidenceType] || 0) + 1;
  }

  for (const event of events) {
    if (event.type === 'correct' && event.memory?.id) {
      const previous = history.get(event.memoryId) || {};
      addCase({
        name: `correction ${event.memoryId} -> ${event.memory.id}`,
        query: correctionBenchmarkQuery(previous, event.memory),
        expectedId: event.memory.id,
        evidenceType: 'correction',
        weight: 2,
        now: Date.parse(event.recordedAt || event.memory.createdAt || '') || undefined,
      });
    }

    if (event.type === 'remember' && event.memory?.sourceType === 'context-hq') {
      addCase({
        name: `approved Context HQ handoff ${event.memory.sourceId || event.memory.id}`,
        query: benchmarkQueryForMemory(event.memory),
        expectedId: event.memory.id,
        evidenceType: 'context-hq',
        weight: 0.5,
        now: Date.parse(event.recordedAt || event.memory.createdAt || '') || undefined,
      });
    }

    if (event.type === 'retrieval-feedback' && event.outcome === 'approved') {
      addCase({
        name: `approved retrieval ${event.memoryId}`,
        query: event.query,
        expectedId: event.memoryId,
        evidenceType: 'retrieval-feedback',
        weight: 3,
        now: Date.parse(event.recordedAt || '') || undefined,
      });
    }
  }

  return {
    memories: active,
    cases,
    evidence: {
      ...counts,
      caseCount: cases.length,
      highQualityCount: counts.correction + counts['retrieval-feedback'],
      activeMemoryCount: active.length,
    },
  };
}

async function realBenchmark(options = {}) {
  return realBenchmarkFromEvents(await loadEvents(options));
}

async function recordRetrievalFeedback(query, memoryId, options = {}) {
  const text = String(query || '').trim();
  const id = String(memoryId || '').trim();
  if (!text) throw new Error('Retrieval feedback requires the original query.');
  if (!id) throw new Error('Retrieval feedback requires --memory MEMORY_ID.');

  const events = await loadEvents(options);
  const active = replayMemories(events);
  if (!active.some(memory => memory.id === id)) {
    throw new Error(`Cannot approve inactive or unknown memory: ${id}`);
  }

  return appendEvent({
    type: 'retrieval-feedback',
    outcome: 'approved',
    recordedAt: new Date(options.now || Date.now()).toISOString(),
    query: text,
    memoryId: id,
    sourceType: options.sourceType || 'manual',
  }, options);
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
      evidence: tournament.evidence || null,
      results: tournament.results.map(result => ({
        strategy: result.strategy,
        mrr: result.mrr,
        hitAt1: result.hitAt1,
        caseCount: result.caseCount,
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
    tournament.promotionBlocked = 'synthetic benchmark cannot promote live retrieval; use real-tournament --promote with real evidence';
  }
  return tournament;
}

function promotionDecision(tournament = {}, selected = null, options = {}) {
  const incumbent = selected?.strategy || 'baseline-jaccard';
  const challenger = tournament.winner || '';
  const minMrrGain = Number.isFinite(Number(options.minMrrGain))
    ? Math.max(0, Number(options.minMrrGain))
    : 0.02;
  if (!challenger) {
    return { eligible: false, reason: 'no challenger won the tournament', incumbent, challenger, minMrrGain };
  }
  if (challenger === incumbent) {
    return { eligible: false, reason: `incumbent ${incumbent} already leads`, incumbent, challenger, minMrrGain, mrrGain: 0, hitAt1Gain: 0 };
  }
  const incumbentResult = (tournament.results || []).find(result => result.strategy === incumbent);
  const challengerResult = (tournament.results || []).find(result => result.strategy === challenger);
  if (!incumbentResult || !challengerResult) {
    return { eligible: false, reason: 'incumbent and challenger must both be evaluated', incumbent, challenger, minMrrGain };
  }
  const mrrGain = challengerResult.mrr - incumbentResult.mrr;
  const hitAt1Gain = challengerResult.hitAt1 - incumbentResult.hitAt1;
  if (mrrGain + Number.EPSILON < minMrrGain) {
    return { eligible: false, reason: `challenger MRR gain ${mrrGain.toFixed(3)} is below required ${minMrrGain.toFixed(3)}`, incumbent, challenger, minMrrGain, mrrGain, hitAt1Gain };
  }
  if (hitAt1Gain < -Number.EPSILON) {
    return { eligible: false, reason: `challenger would regress hit@1 by ${Math.abs(hitAt1Gain).toFixed(3)}`, incumbent, challenger, minMrrGain, mrrGain, hitAt1Gain };
  }
  return { eligible: true, reason: 'challenger clears incumbent margin', incumbent, challenger, minMrrGain, mrrGain, hitAt1Gain };
}

function realPromotionEligibility(benchmark, options = {}) {
  const minCases = Math.max(1, Number.parseInt(options.minCases || '5', 10) || 5);
  const minHighQuality = Math.max(1, Number.parseInt(options.minHighQuality || '2', 10) || 2);
  if (benchmark.cases.length < minCases) {
    return { eligible: false, reason: `need at least ${minCases} real benchmark cases`, minCases, minHighQuality };
  }
  if (benchmark.evidence.highQualityCount < minHighQuality) {
    return { eligible: false, reason: `need at least ${minHighQuality} corrections or explicitly approved retrievals`, minCases, minHighQuality };
  }
  return { eligible: true, reason: 'real evidence threshold met', minCases, minHighQuality };
}

async function runRealTournament(options = {}) {
  const benchmark = await realBenchmark(options);
  const tournament = evaluateStrategies(benchmark.cases, benchmark.memories, options);
  tournament.evidence = benchmark.evidence;
  tournament.promotionEligibility = realPromotionEligibility(benchmark, options);
  const selected = await readSelectedStrategy(options);
  tournament.promotionDecision = promotionDecision(tournament, selected, options);

  if (options.promote && tournament.winner) {
    if (!tournament.promotionEligibility.eligible) {
      tournament.promotionBlocked = tournament.promotionEligibility.reason;
    } else if (!tournament.promotionDecision.eligible) {
      tournament.promotionBlocked = tournament.promotionDecision.reason;
    } else {
      tournament.promotion = await promoteStrategy(tournament.winner, tournament, options);
    }
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
    else if (arg === '--memory') options.memoryId = argv[++index] || '';
    else if (arg === '--limit') options.limit = Number.parseInt(argv[++index] || '', 10) || 5;
    else if (arg === '--min-cases') options.minCases = Number.parseInt(argv[++index] || '', 10) || 5;
    else if (arg === '--min-high-quality') options.minHighQuality = Number.parseInt(argv[++index] || '', 10) || 2;
    else if (arg === '--min-mrr-gain') options.minMrrGain = Number.parseFloat(argv[++index] || '');
    else if (arg === '--state-dir') options.stateDir = argv[++index] || '';
    else positional.push(arg);
  }
  options.text = positional.join(' ');
  return options;
}

function renderTournament(tournament) {
  const lines = [`winner: ${tournament.winner || 'none'}`];
  if (tournament.evidence) {
    lines.push(`real evidence: ${tournament.evidence.caseCount} cases (${tournament.evidence.correction} corrections, ${tournament.evidence['retrieval-feedback']} approvals, ${tournament.evidence['context-hq']} Context HQ)`);
  }
  for (const result of tournament.results) {
    lines.push(`${result.strategy}\tmrr=${result.mrr.toFixed(3)}\thit@1=${result.hitAt1.toFixed(3)}\tcases=${result.caseCount}`);
  }
  if (tournament.promotion) lines.push(`promoted: ${tournament.promotion.strategy}`);
  if (tournament.promotionBlocked) lines.push(`promotion blocked: ${tournament.promotionBlocked}`);
  return lines.join('\n');
}

function renderEvidence(benchmark) {
  const evidence = benchmark.evidence;
  return [
    `real benchmark cases: ${evidence.caseCount}`,
    `corrections: ${evidence.correction}`,
    `explicit approvals: ${evidence['retrieval-feedback']}`,
    `approved Context HQ handoffs: ${evidence['context-hq']}`,
    `active memories: ${evidence.activeMemoryCount}`,
  ].join('\n');
}

async function cli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === 'tournament') {
    const result = await runBuiltInTournament(options);
    console.log(options.json ? JSON.stringify(result, null, 2) : renderTournament(result));
    return 0;
  }
  if (options.command === 'real-tournament') {
    const result = await runRealTournament(options);
    console.log(options.json ? JSON.stringify(result, null, 2) : renderTournament(result));
    return 0;
  }
  if (options.command === 'evidence') {
    const benchmark = await realBenchmark(options);
    console.log(options.json ? JSON.stringify(benchmark, null, 2) : renderEvidence(benchmark));
    return 0;
  }
  if (options.command === 'approve') {
    const event = await recordRetrievalFeedback(options.text, options.memoryId, options);
    console.log(options.json ? JSON.stringify(event, null, 2) : `approved ${event.memoryId}`);
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
  benchmarkQueryForMemory,
  builtInBenchmark,
  correctionBenchmarkQuery,
  evaluateStrategies,
  lexicalMetrics,
  memoriesById,
  promoteStrategy,
  promotionDecision,
  rankMemories,
  readSelectedStrategy,
  realBenchmark,
  realBenchmarkFromEvents,
  realPromotionEligibility,
  recordRetrievalFeedback,
  recencyScore,
  runBuiltInTournament,
  runRealTournament,
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
