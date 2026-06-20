import path from 'node:path';
import {
  getMoneyPrinterWorkspacePaths,
  readJsonFile,
  writeJsonFile
} from './moneyPrinterFileStorage.js';

const PAIN_PATTERNS = [
  /\b(struggling|stuck|frustrated|annoying|pain|problem|hardest|difficult|overwhelmed)\b/i,
  /\b(can't|cannot|never|broken|falling through|fall through|mess|chaos|manual)\b/i
];

const QUESTION_PATTERNS = [
  /\b(anyone know|does anyone|how do you|what do you use|recommend|recommendations|looking for)\b/i,
  /\b(best way|is there a tool|which tool|alternatives|what's working)\b/i
];

const WORKAROUND_PATTERNS = [
  /\b(spreadsheet|notion|airtable|zapier|manual process|template|checklist|hack|workaround)\b/i,
  /\b(copy paste|copy-paste|export|import|csv|google sheet)\b/i
];

const BUYING_PATTERNS = [
  /\b(pay|paid|budget|hire|consultant|agency|done for me|done-for-me|service|setup)\b/i,
  /\b(urgent|asap|this week|before launch|before demo|client expects)\b/i
];

const SOCIAL_CONTEXT_PATTERNS = [
  /\b(comments?|replies|dm|dms|linkedin|facebook|group|post|thread|founder|client)\b/i
];

function normalizeText(value = '') {
  return String(value || '').trim();
}

function slugify(value = '', fallback = 'weak-signal') {
  const slug = normalizeText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function countMatches(text = '', patterns = []) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function parseCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function engagementScore(signal = {}) {
  const reactions = parseCount(signal.reactions || signal.reactionCount || signal.likes);
  const comments = parseCount(signal.comments || signal.commentCount || signal.replies);
  const shares = parseCount(signal.shares || signal.shareCount);
  return Math.min(20, Math.log10(1 + reactions) * 5)
    + Math.min(30, Math.log10(1 + comments) * 12)
    + Math.min(12, Math.log10(1 + shares) * 8);
}

export function scoreWeakSignal(signal = {}) {
  const text = normalizeText([
    signal.title,
    signal.text,
    signal.summary
  ].filter(Boolean).join('\n'));

  const pain = countMatches(text, PAIN_PATTERNS);
  const question = countMatches(text, QUESTION_PATTERNS);
  const workaround = countMatches(text, WORKAROUND_PATTERNS);
  const buying = countMatches(text, BUYING_PATTERNS);
  const social = countMatches(text, SOCIAL_CONTEXT_PATTERNS);
  const score = Math.min(100, Math.round(
    Math.min(28, pain * 18)
    + Math.min(22, question * 14)
    + Math.min(18, workaround * 12)
    + Math.min(24, buying * 16)
    + Math.min(8, social * 4)
    + engagementScore(signal)
  ));

  let stage = 'listen';
  if (score >= 76) stage = 'offer-test';
  else if (score >= 58) stage = 'interview';
  else if (score >= 38) stage = 'comment';

  const indicators = [];
  if (pain) indicators.push('pain');
  if (question) indicators.push('question');
  if (workaround) indicators.push('workaround');
  if (buying) indicators.push('buying-intent');
  if (social) indicators.push('social-context');

  return {
    score,
    stage,
    indicators
  };
}

export function normalizeWeakSignal(input = {}, options = {}) {
  const source = normalizeText(input.source || options.source || 'manual');
  const platform = normalizeText(input.platform || options.platform || source);
  const text = normalizeText(input.text || input.body || input.summary || '');
  const title = normalizeText(input.title || text.split(/\r?\n/)[0] || 'Weak signal');
  const observedAt = normalizeText(input.observedAt || input.createdAt || options.observedAt) || nowIso();
  const market = normalizeText(input.market || options.market || '');
  const url = normalizeText(input.url || input.link || '');
  const scored = scoreWeakSignal({
    ...input,
    title,
    text
  });
  const id = normalizeText(input.id)
    || `signal-${slugify(`${platform}-${title}`)}-${observedAt.replace(/[-:.TZ]/g, '').slice(0, 12)}`;

  return {
    id,
    source,
    platform,
    market,
    title,
    text,
    url,
    author: normalizeText(input.author || ''),
    reactions: parseCount(input.reactions || input.reactionCount || input.likes),
    comments: parseCount(input.comments || input.commentCount || input.replies),
    shares: parseCount(input.shares || input.shareCount),
    observedAt,
    score: scored.score,
    stage: scored.stage,
    indicators: scored.indicators,
    notes: normalizeText(input.notes || '')
  };
}

export function extractWeakSignalsFromText(raw = '', options = {}) {
  const blocks = normalizeText(raw)
    .split(/\n{2,}|---+/)
    .map(block => block.trim())
    .filter(block => block.length >= 24);

  return blocks.map(block => {
    const urlMatch = block.match(/https?:\/\/\S+/);
    return normalizeWeakSignal({
      text: block,
      url: urlMatch?.[0] || ''
    }, options);
  });
}

export function getWeakSignalPaths(rootDir = process.cwd()) {
  const paths = getMoneyPrinterWorkspacePaths(rootDir);
  return {
    ...paths,
    weakSignalsPath: path.join(paths.workspaceDir, 'weak-signals.json')
  };
}

export async function loadWeakSignals(rootDir = process.cwd()) {
  const { weakSignalsPath } = getWeakSignalPaths(rootDir);
  const value = await readJsonFile(weakSignalsPath, []);
  return Array.isArray(value) ? value.map(item => normalizeWeakSignal(item)).filter(item => item.text || item.title) : [];
}

export async function saveWeakSignals(rootDir = process.cwd(), signals = []) {
  const { weakSignalsPath } = getWeakSignalPaths(rootDir);
  await writeJsonFile(weakSignalsPath, signals.map(item => normalizeWeakSignal(item)));
  return weakSignalsPath;
}

function signalSignature(signal = {}) {
  return [
    signal.platform,
    signal.url,
    signal.title,
    signal.text
  ].map(value => normalizeText(value).toLowerCase()).join('|');
}

function firstSentence(value = '', fallback = 'this workflow') {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  return sentence.slice(0, 220) || fallback;
}

function buildPublicCommentDraft(signal = {}) {
  const pain = firstSentence(signal.text || signal.title, 'this onboarding workflow');
  return [
    `Helpful signal here: ${pain}`,
    'The fastest first pass I would try is to map the first 3 moments where a trial user goes quiet, then write one plain-language email for each moment: welcome/context, first-success nudge, and reply-to-a-human unblocker.',
    'Before buying software, I would check one number: how many trials reach the first valuable action within 24 hours?',
    'What part is breaking most often right now: getting the first setup done, getting replies, or knowing which users are stuck?'
  ].join('\n\n');
}

function buildInterviewQuestions(signal = {}) {
  const market = normalizeText(signal.market || 'this market');
  return [
    `When did ${market} onboarding first become painful enough that you started looking for fixes?`,
    'What are you doing manually today, and which part would you happily stop doing this week?',
    'If someone fixed this as a done-for-you pilot, what result would make it worth paying for in the next 30 days?',
    'What have you already tried, and why did it fail or become too much work?',
    'Who else has this problem badly enough that they are posting, asking, or paying for help?'
  ];
}

function buildOfferHypothesis(signal = {}) {
  const market = normalizeText(signal.market || 'early-stage SaaS teams');
  return [
    `Buyer: ${market}`,
    'Pain: trial users sign up, go quiet, and the founder cannot tell who needs a human follow-up.',
    'Manual pilot: audit the current signup/onboarding flow, write the first 5 lifecycle emails, install simple tracking, and deliver a 14-day follow-up checklist.',
    'Promise to test: more qualified demo replies or activation events from existing trial traffic within 30 days.',
    'Price anchor: paid pilot, not free consulting. Start with a small fixed-scope setup fee and one measurable success criterion.'
  ].join('\n');
}

function buildWeakSignalIssueBody(signal = {}, options = {}) {
  const market = normalizeText(signal.market || options.market || 'unknown');
  const publicCommentDraft = buildPublicCommentDraft(signal);
  const interviewQuestions = buildInterviewQuestions({ ...signal, market });
  const offerHypothesis = buildOfferHypothesis({ ...signal, market });
  const nextAction = signal.stage === 'offer-test'
    ? 'Use the comment draft first. If they engage, ask one interview question, then offer a small paid pilot only after confirming urgency.'
    : signal.stage === 'interview'
      ? 'Ask 2-3 interview questions, capture exact words, and find 5 adjacent posts with the same pain.'
      : 'Post the useful comment, ask one clarifying question, and watch for replies, likes, or follow-up posts before pitching.';

  return [
    'Generated by Money Printer weak-signal radar.',
    '',
    `Market: ${market}`,
    `Platform: ${signal.platform}`,
    `Score: ${signal.score}/100`,
    `Stage: ${signal.stage}`,
    `Indicators: ${(signal.indicators || []).join(', ') || 'none'}`,
    signal.url ? `URL: ${signal.url}` : '',
    '',
    'Observed text:',
    '',
    '```',
    signal.text || signal.title,
    '```',
    '',
    'Founder read:',
    '- This is not a cold email target yet.',
    '- Treat it as demand discovery: teach publicly, ask one question, and look for repeated pain.',
    '- Do not send DMs or offers automatically.',
    '',
    'Draft public comment:',
    '',
    publicCommentDraft,
    '',
    'Interview questions:',
    ...interviewQuestions.map(question => `- ${question}`),
    '',
    'Offer hypothesis:',
    '',
    offerHypothesis,
    '',
    'Next action:',
    nextAction
  ].filter(Boolean).join('\n');
}

export async function addWeakSignals(rootDir = process.cwd(), signals = []) {
  const existing = await loadWeakSignals(rootDir);
  const bySignature = new Map(existing.map(signal => [signalSignature(signal), signal]));
  const added = [];

  signals.map(item => normalizeWeakSignal(item)).forEach(signal => {
    const signature = signalSignature(signal);
    if (!signature || bySignature.has(signature)) return;
    bySignature.set(signature, signal);
    added.push(signal);
  });

  const all = Array.from(bySignature.values())
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  const pathWritten = await saveWeakSignals(rootDir, all);
  return {
    signals: all,
    added,
    path: pathWritten
  };
}

export function buildWeakSignalOperations(signals = [], options = {}) {
  const market = normalizeText(options.market || '');
  return (Array.isArray(signals) ? signals : [])
    .filter(signal => Number(signal.score || 0) >= 38)
    .slice(0, Number(options.limit || 5))
    .map(signal => {
      const title = signal.stage === 'offer-test'
        ? `Offer-test weak signal: ${signal.title}`
        : signal.stage === 'interview'
          ? `Interview from weak signal: ${signal.title}`
          : `Comment/research weak signal: ${signal.title}`;
      return {
        provider: 'github',
        action: 'createIssue',
        title,
        summary: `Weak signal scored ${signal.score}/100 from ${signal.platform}. Stage: ${signal.stage}.`,
        risk: signal.stage === 'offer-test' ? 'yellow' : 'green',
        payload: {
          title,
          body: buildWeakSignalIssueBody(signal, { market }),
          labels: ['money-printer', 'weak-signal']
        }
      };
    });
}
