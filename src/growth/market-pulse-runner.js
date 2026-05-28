import { DEFAULT_GUN_PEERS } from './homepage-hero.js';
import {
  DEFAULT_MARKET_PULSE_PROFILE,
  runMarketPulseCycle,
} from './market-pulse.js';

const HELP_TEXT = `Usage: npm run market:pulse -- [options]

Options:
  --market <text>       Market or audience to research.
  --keywords <csv>      Comma-separated pains or phrases.
  --channels <csv>      Comma-separated social probe channels.
  --limit <number>      Maximum demand signals to analyze.
  --gun-peers <csv>     Comma-separated Gun relay peers for persistence.
  --dry-run             Research and score without writing to Gun.
  --json                Print a machine-readable summary.
  --help                Show this help.
`;

function normalizeText(value = '') {
  return String(value || '').trim();
}

function splitList(value, fallback = []) {
  const items = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  return items.length ? items : [...fallback];
}

function parseBoolEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function readFlagValue(argv, index, flag) {
  const next = argv[index + 1];
  if (!next || String(next).startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return next;
}

export function parseMarketPulseArgs(argv = []) {
  const parsed = {
    dryRun: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '');
    if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--market') {
      parsed.market = readFlagValue(argv, index, arg);
      index += 1;
    } else if (arg === '--keywords') {
      parsed.keywords = splitList(readFlagValue(argv, index, arg));
      index += 1;
    } else if (arg === '--channels') {
      parsed.channels = splitList(readFlagValue(argv, index, arg));
      index += 1;
    } else if (arg === '--limit') {
      parsed.limit = Number.parseInt(readFlagValue(argv, index, arg), 10);
      index += 1;
    } else if (arg === '--gun-peers') {
      parsed.gunPeers = splitList(readFlagValue(argv, index, arg));
      index += 1;
    } else {
      throw new Error(`Unknown market pulse option: ${arg}`);
    }
  }

  return parsed;
}

export function buildMarketPulseRunOptions(parsed = {}, env = process.env) {
  const keywords = parsed.keywords || splitList(env.MARKET_PULSE_KEYWORDS, DEFAULT_MARKET_PULSE_PROFILE.keywords);
  const channels = parsed.channels || splitList(env.MARKET_PULSE_CHANNELS, DEFAULT_MARKET_PULSE_PROFILE.channels);
  const peers = parsed.gunPeers || splitList(env.GROWTH_GUN_PEERS, DEFAULT_GUN_PEERS);
  const envLimit = Number.parseInt(env.MARKET_PULSE_LIMIT, 10);
  const parsedLimit = Number.parseInt(parsed.limit, 10);

  return {
    market: normalizeText(parsed.market || env.MARKET_PULSE_MARKET) || DEFAULT_MARKET_PULSE_PROFILE.market,
    keywords,
    channels,
    limit: Number.isFinite(parsedLimit)
      ? parsedLimit
      : (Number.isFinite(envLimit) ? envLimit : DEFAULT_MARKET_PULSE_PROFILE.limit),
    gunPeers: peers,
    dryRun: Boolean(parsed.dryRun || parseBoolEnv(env.MARKET_PULSE_DRY_RUN)),
  };
}

function summarizeProbes(probes = []) {
  return probes
    .slice(0, 4)
    .map((probe) => ({
      channel: probe.channelLabel || probe.channel || '',
      approvalStatus: probe.approvalStatus || '',
      title: probe.title || '',
    }));
}

function summarizeReactions(reactions = []) {
  return reactions
    .slice(0, 4)
    .map((item) => ({
      channel: item.channelLabel || item.channel || '',
      marketFitScore: Number(item.marketFitScore || 0),
      signals: Number(item.signalCount || 0),
      comments: Number(item.commentCount || 0),
      reactions: Number(item.reactionCount || 0),
    }));
}

export function buildMarketPulseCliSummary(result = {}) {
  return {
    runId: result.runId || '',
    generatedAt: result.generatedAt || '',
    dryRun: Boolean(result.dryRun),
    market: result.profile?.market || '',
    keywords: Array.isArray(result.profile?.keywords) ? result.profile.keywords : [],
    signalsAnalyzed: Number(result.signalsAnalyzed || 0),
    approvalsRequired: Number(result.approvalsRequired || 0),
    marketFit: {
      score: Number(result.marketFit?.score || 0),
      verdict: result.marketFit?.verdict || '',
      strongestChannel: result.marketFit?.strongestChannel || '',
      nextAction: result.marketFit?.nextAction || '',
    },
    topOpportunity: {
      title: result.topOpportunity?.title || '',
      problem: result.topOpportunity?.problem || '',
      score: Number(result.topOpportunity?.score || 0),
    },
    persist: result.persist || {},
    socialProbes: summarizeProbes(result.socialProbeDrafts),
    reactionRadar: summarizeReactions(result.reactionSnapshots),
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
  };
}

function formatSummary(summary = {}) {
  const lines = [
    'Market Pulse automation complete',
    `Run: ${summary.runId || 'unknown'}`,
    `Mode: ${summary.dryRun ? 'dry run' : 'persisted to Gun'}`,
    `Market: ${summary.market || 'unknown'}`,
    `Fit: ${summary.marketFit.score} (${summary.marketFit.verdict || 'searching'})`,
    `Signals: ${summary.signalsAnalyzed}`,
    `Approvals: ${summary.approvalsRequired}`,
  ];

  if (summary.persist?.directoryListingsPublished != null) {
    lines.push(`Directory listings published: ${summary.persist.directoryListingsPublished}`);
  }
  if (summary.topOpportunity.title) {
    lines.push(`Top opportunity: ${summary.topOpportunity.title}`);
  }
  if (summary.marketFit.nextAction) {
    lines.push(`Next action: ${summary.marketFit.nextAction}`);
  }
  if (summary.socialProbes.length) {
    lines.push('Social probes:');
    summary.socialProbes.forEach((probe) => {
      lines.push(`- ${probe.channel}: ${probe.approvalStatus} - ${probe.title}`);
    });
  }
  if (summary.reactionRadar.length) {
    lines.push('Reaction radar:');
    summary.reactionRadar.forEach((item) => {
      lines.push(`- ${item.channel}: ${item.marketFitScore} fit, ${item.comments} comments, ${item.reactions} reactions`);
    });
  }
  if (summary.warnings.length) {
    lines.push('Warnings:');
    summary.warnings.forEach((warning) => {
      lines.push(`- ${warning}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

export async function runMarketPulseCli(options = {}) {
  const argv = options.argv || process.argv.slice(2);
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const env = options.env || process.env;
  const runCycleImpl = options.runCycleImpl || runMarketPulseCycle;

  try {
    const parsed = parseMarketPulseArgs(argv);
    if (parsed.help) {
      stdout.write(HELP_TEXT);
      return { exitCode: 0 };
    }

    const runOptions = {
      ...buildMarketPulseRunOptions(parsed, env),
      fetchImpl: options.fetchImpl,
      now: options.now,
    };
    const result = await runCycleImpl(runOptions);
    const summary = buildMarketPulseCliSummary(result);
    stdout.write(parsed.json ? `${JSON.stringify(summary, null, 2)}\n` : formatSummary(summary));
    return { exitCode: 0, result, summary };
  } catch (error) {
    stderr.write(`Market Pulse automation failed: ${error.message}\n`);
    return { exitCode: 1, error };
  }
}
