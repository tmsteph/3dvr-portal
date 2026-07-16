const fs = require('node:fs');
const path = require('node:path');
const { readOutreachLog } = require('./outreach-log');

const DEFAULT_EXPERIMENTS_FILE = process.env.THREEDVR_EXPERIMENTS_FILE
  || path.join(__dirname, '..', 'state', 'experiments.ndjson');

function normalizeText(value) {
  return String(value || '').trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function experimentId(name, date = todayIso()) {
  const slug = slugify(name) || 'experiment';
  return `${date}-${slug}`;
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendExperiment(record = {}, options = {}) {
  const filePath = options.filePath || DEFAULT_EXPERIMENTS_FILE;
  const normalized = normalizeExperiment(record);
  ensureParent(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(normalized)}\n`);
  return normalized;
}

function readExperiments(options = {}) {
  const filePath = options.filePath || DEFAULT_EXPERIMENTS_FILE;
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function normalizeExperiment(record = {}) {
  const name = normalizeText(record.name) || 'Untitled experiment';
  return {
    id: normalizeText(record.id) || experimentId(name),
    timestamp: normalizeText(record.timestamp) || new Date().toISOString(),
    name,
    goal: normalizeText(record.goal) || 'Learn which message gets more qualified replies.',
    market: normalizeText(record.market),
    hypothesis: normalizeText(record.hypothesis),
    variants: Array.isArray(record.variants) && record.variants.length
      ? record.variants.map(normalizeVariant)
      : defaultVariants(),
    successMetric: normalizeText(record.successMetric) || 'qualified replies / sent',
    minSampleSize: Number.isFinite(Number(record.minSampleSize)) ? Number(record.minSampleSize) : 20,
    notes: normalizeText(record.notes),
  };
}

function normalizeVariant(variant, index = 0) {
  if (typeof variant === 'string') {
    return { id: String.fromCharCode(97 + index), angle: variant };
  }
  return {
    id: normalizeText(variant.id) || String.fromCharCode(97 + index),
    angle: normalizeText(variant.angle || variant.name),
    messageMode: normalizeText(variant.messageMode),
  };
}

function defaultVariants() {
  return [
    { id: 'a', angle: 'Problem-led opener: asks what operational friction exists now.', messageMode: 'template' },
    { id: 'b', angle: 'Conversion-led opener: focuses on turning website visits into next steps.', messageMode: 'template' },
  ];
}

function buildMarketResearchPrompt({ market = '', offer = '', location = '', channels = '' } = {}) {
  return [
    'Run market research for 3DVR.',
    '',
    `Market: ${normalizeText(market) || 'small service businesses'}`,
    `Offer: ${normalizeText(offer) || 'websites, follow-up systems, and simple customer workflows'}`,
    `Location: ${normalizeText(location) || 'United States, starting local/regional'}`,
    `Channels: ${normalizeText(channels) || 'email, contact forms, phone, portal, and direct referrals'}`,
    '',
    'Return:',
    '1. Top buyer segments and why they buy now.',
    '2. Urgent pains and observable buying triggers.',
    '3. Competitor categories and positioning gaps.',
    '4. Concrete lead sources we can crawl or research.',
    '5. Messaging angles worth A/B testing.',
    '6. Ethical constraints and claims to avoid.',
    '7. A 7-day action plan the agent can execute.',
  ].join('\n');
}

function buildExperimentPlan({ name = '', market = '', goal = '', hypothesis = '', variants = [] } = {}) {
  const experiment = normalizeExperiment({
    name: name || `${market || 'sales'} outreach test`,
    market,
    goal,
    hypothesis,
    variants: variants.length ? variants : defaultVariants(),
  });
  return {
    experiment,
    instructions: [
      `Experiment: ${experiment.id}`,
      `Goal: ${experiment.goal}`,
      `Market: ${experiment.market || 'not specified'}`,
      `Hypothesis: ${experiment.hypothesis || 'One message angle will produce more qualified replies.'}`,
      `Success metric: ${experiment.successMetric}`,
      `Minimum sample: ${experiment.minSampleSize} sent messages per variant before deciding.`,
      '',
      'Variants:',
      ...experiment.variants.map((variant) => `- ${variant.id}: ${variant.angle}`),
      '',
      'Run:',
      `export THREEDVR_OUTREACH_EXPERIMENT_ID="${experiment.id}"`,
      'Set lead variant column to a/b before sending, or use `ask-track contact "Lead" a` after manual sends.',
      'Use `3dvr revenue report` to compare results.',
    ].join('\n'),
  };
}

function summarizeExperiments(entries = readOutreachLog()) {
  const groups = new Map();
  for (const entry of entries) {
    const experiment = normalizeText(entry.experiment || entry.experimentId || 'unassigned');
    const variant = normalizeText(entry.variant || entry.mode || 'unknown');
    const key = `${experiment}::${variant}`;
    if (!groups.has(key)) {
      groups.set(key, {
        experiment,
        variant,
        sent: 0,
        submitted: 0,
        failed: 0,
        replies: 0,
        closed: 0,
        entries: 0,
      });
    }
    const group = groups.get(key);
    const status = normalizeText(entry.status).toLowerCase();
    group.entries += 1;
    if (status === 'sent') group.sent += 1;
    if (status === 'submitted') group.submitted += 1;
    if (status.includes('fail')) group.failed += 1;
    if (status === 'replied' || status === 'reply') group.replies += 1;
    if (status === 'closed') group.closed += 1;
  }
  return [...groups.values()].sort((a, b) => (
    a.experiment.localeCompare(b.experiment) || a.variant.localeCompare(b.variant)
  ));
}

function formatExperimentReport(rows = []) {
  if (!rows.length) return 'No experiment outreach log entries found.';
  return [
    'Experiment results:',
    ...rows.map((row) => {
      const attempts = row.sent + row.submitted;
      const replyRate = attempts ? `${Math.round((row.replies / attempts) * 100)}%` : '-';
      return [
        `- ${row.experiment} / ${row.variant}`,
        `sent=${row.sent}`,
        `forms=${row.submitted}`,
        `failed=${row.failed}`,
        `replies=${row.replies}`,
        `closed=${row.closed}`,
        `replyRate=${replyRate}`,
      ].join(' | ');
    }),
  ].join('\n');
}

function parseCli(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  const args = argv.slice(1);
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      options[key] = args[index + 1] && !args[index + 1].startsWith('--') ? args[++index] : true;
    } else {
      positional.push(arg);
    }
  }
  return { command, options, positional };
}

function cli(argv = process.argv.slice(2)) {
  const { command, options, positional } = parseCli(argv);
  if (command === 'research') {
    const prompt = buildMarketResearchPrompt({
      market: options.market || positional.join(' '),
      offer: options.offer,
      location: options.location,
      channels: options.channels,
    });
    console.log(prompt);
    console.log('');
    console.log('Run with an executor:');
    console.log(`3dvr agent task --execute ${JSON.stringify(prompt)}`);
    return;
  }
  if (command === 'plan' || command === 'experiment') {
    const plan = buildExperimentPlan({
      name: options.name || positional.join(' '),
      market: options.market,
      goal: options.goal,
      hypothesis: options.hypothesis,
    });
    if (options.save) {
      appendExperiment(plan.experiment);
    }
    console.log(plan.instructions);
    return;
  }
  if (command === 'list') {
    const experiments = readExperiments();
    if (!experiments.length) {
      console.log('No saved experiments found.');
      return;
    }
    for (const experiment of experiments) {
      console.log(`${experiment.id} | ${experiment.goal}`);
    }
    return;
  }
  if (command === 'report') {
    console.log(formatExperimentReport(summarizeExperiments(readOutreachLog())));
    return;
  }

  console.log('Usage: 3dvr revenue research|experiment|plan|list|report');
}

module.exports = {
  appendExperiment,
  buildExperimentPlan,
  buildMarketResearchPrompt,
  defaultVariants,
  experimentId,
  formatExperimentReport,
  normalizeExperiment,
  readExperiments,
  summarizeExperiments,
};

if (require.main === module) {
  cli();
}
