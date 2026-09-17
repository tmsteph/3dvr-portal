const fs = require('node:fs');
const path = require('node:path');
const { enqueueTask } = require('./agent-task-queue');

const DEFAULT_WEIGHTS = Object.freeze({
  purposeAlignment: 3,
  userValue: 3,
  revenue: 2,
  urgency: 1,
  unblocks: 2,
  reuse: 2,
  effort: -2,
});

const APPROVAL_REQUIRED_RISKS = new Set(['external_write', 'money', 'credential']);
const VALID_RISKS = new Set(['read_only', 'draft', 'workspace_write', 'external_write', 'money', 'credential']);

function clampMetric(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(5, number));
}

function text(value) {
  return String(value || '').trim();
}

function normalizeRisk(value) {
  const risk = text(value).toLowerCase() || 'draft';
  return VALID_RISKS.has(risk) ? risk : 'draft';
}

function normalizeCandidate(candidate = {}, index = 0) {
  const riskClass = normalizeRisk(candidate.riskClass || candidate.risk);
  const approvalStatus = text(candidate.approvalStatus)
    || (APPROVAL_REQUIRED_RISKS.has(riskClass) ? 'required' : 'not_required');
  return {
    id: text(candidate.id) || `candidate-${index + 1}`,
    task: text(candidate.task || candidate.title),
    purposeAlignment: clampMetric(candidate.purposeAlignment),
    userValue: clampMetric(candidate.userValue),
    revenue: clampMetric(candidate.revenue),
    urgency: clampMetric(candidate.urgency),
    unblocks: clampMetric(candidate.unblocks),
    reuse: clampMetric(candidate.reuse),
    effort: clampMetric(candidate.effort, 3),
    blocked: Boolean(candidate.blocked),
    blockedReason: text(candidate.blockedReason),
    riskClass,
    approvalStatus,
    backend: text(candidate.backend) || 'auto',
    repo: text(candidate.repo),
    requiredCapabilities: text(candidate.requiredCapabilities || candidate.requires),
    maxRuntimeMs: Number.isFinite(Number(candidate.maxRuntimeMs)) ? Number(candidate.maxRuntimeMs) : 0,
    metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {},
  };
}

function scoreCandidate(candidate, weights = DEFAULT_WEIGHTS) {
  const c = normalizeCandidate(candidate);
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += clampMetric(c[key], key === 'effort' ? 3 : 0) * Number(weight || 0);
  }
  if (APPROVAL_REQUIRED_RISKS.has(c.riskClass) && c.approvalStatus !== 'approved') score -= 100;
  if (c.blocked) score -= 1000;
  return Number(score.toFixed(2));
}

function candidateEligibility(candidate = {}) {
  const c = normalizeCandidate(candidate);
  if (!c.task) return { ok: false, reason: 'missing task' };
  if (c.blocked) return { ok: false, reason: c.blockedReason || 'blocked' };
  if (APPROVAL_REQUIRED_RISKS.has(c.riskClass) && c.approvalStatus !== 'approved') {
    return { ok: false, reason: `approval required for ${c.riskClass}` };
  }
  return { ok: true, reason: 'ready' };
}

function rankCandidates(candidates = [], weights = DEFAULT_WEIGHTS) {
  return candidates
    .map((candidate, index) => {
      const normalized = normalizeCandidate(candidate, index);
      const eligibility = candidateEligibility(normalized);
      return {
        ...normalized,
        score: scoreCandidate(normalized, weights),
        eligible: eligibility.ok,
        eligibilityReason: eligibility.reason,
      };
    })
    .sort((a, b) => b.score - a.score || a.effort - b.effort || a.id.localeCompare(b.id));
}

function planTranscendCycle(input = {}, options = {}) {
  const purpose = text(input.purpose || options.purpose);
  const weights = { ...DEFAULT_WEIGHTS, ...(input.weights || {}), ...(options.weights || {}) };
  const ranked = rankCandidates(Array.isArray(input.candidates) ? input.candidates : [], weights);
  const next = ranked.find(candidate => candidate.eligible) || null;
  return {
    purpose,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    next,
    ranked,
    weights,
    rule: 'Choose the highest-leverage eligible task; require explicit approval before external writes, money movement, or credential work.',
  };
}

async function enqueueTranscendCycle(input = {}, options = {}) {
  const plan = planTranscendCycle(input, options);
  if (!plan.next) return { plan, enqueued: null };
  const enqueueTaskImpl = options.enqueueTaskImpl || enqueueTask;
  const selected = plan.next;
  const enqueued = await enqueueTaskImpl(selected.task, {
    backend: selected.backend,
    repo: selected.repo || options.repo,
    riskClass: selected.riskClass,
    approvalStatus: selected.approvalStatus,
    requiredCapabilities: selected.requiredCapabilities,
    maxRuntimeMs: selected.maxRuntimeMs || options.maxRuntimeMs,
    tenantId: options.tenantId,
    tenantAlias: options.tenantAlias,
    tenantPlan: options.tenantPlan,
    queueStore: options.queueStore,
    requestedBy: options.requestedBy || 'transcend-loop',
  });
  return { plan, enqueued };
}

function formatPlan(plan) {
  const lines = [
    `Purpose: ${plan.purpose || 'not specified'}`,
    plan.next ? `Next: ${plan.next.task}` : 'Next: no eligible task',
    plan.next ? `Score: ${plan.next.score} | Risk: ${plan.next.riskClass}` : '',
    '',
    'Ranked candidates:',
  ].filter(Boolean);
  for (const candidate of plan.ranked) {
    lines.push(`${candidate.eligible ? '✓' : '·'} ${candidate.score.toFixed(2)}  ${candidate.task} (${candidate.eligibilityReason})`);
  }
  return lines.join('\n');
}

function parseCli(argv) {
  const options = { command: 'plan', input: '', queueStore: '', tenantId: '', tenantAlias: '', tenantPlan: '' };
  const args = [...argv];
  if (args[0] && !args[0].startsWith('-')) options.command = args.shift();
  while (args.length) {
    const arg = args.shift();
    if (arg === '--input') options.input = args.shift() || '';
    else if (arg === '--queue-store') options.queueStore = args.shift() || '';
    else if (arg === '--tenant-id') options.tenantId = args.shift() || '';
    else if (arg === '--tenant-alias') options.tenantAlias = args.shift() || '';
    else if (arg === '--tenant-plan') options.tenantPlan = args.shift() || '';
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.input) throw new Error('Use --input <cycle.json>.');
  options.input = path.resolve(options.input);
  return options;
}

async function cli(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  const input = JSON.parse(fs.readFileSync(options.input, 'utf8'));
  const result = options.command === 'enqueue'
    ? await enqueueTranscendCycle(input, options)
    : { plan: planTranscendCycle(input, options), enqueued: null };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(formatPlan(result.plan));
    if (result.enqueued) console.log(`\nQueued: ${result.enqueued.id}`);
  }
}

module.exports = {
  DEFAULT_WEIGHTS,
  candidateEligibility,
  enqueueTranscendCycle,
  formatPlan,
  normalizeCandidate,
  planTranscendCycle,
  rankCandidates,
  scoreCandidate,
};

if (require.main === module) {
  cli().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
