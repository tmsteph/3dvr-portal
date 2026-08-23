export const DEFAULT_OPERATOR_DRAFT_MODEL = 'gpt-4.1-mini';
export const DEFAULT_OPERATOR_DRAFT_GATEWAY_MODEL = 'openai/gpt-4.1-mini';

const DRAFT_RESPONSE_SCHEMA = {
  name: 'portal_operator_draft_awareness',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'ready', 'checkAgainMs'],
    properties: {
      summary: { type: 'string' },
      ready: { type: 'boolean' },
      checkAgainMs: { type: 'integer', minimum: 0, maximum: 12000 }
    }
  }
};

const clean = (value, max = 3000) => String(value || '').trim().slice(0, max);
const boundedNumber = (value, min, max, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
};

export function normalizeDraftSignals(value = {}) {
  return {
    elapsedMs: boundedNumber(value?.elapsedMs, 0, 300000),
    pauseMs: boundedNumber(value?.pauseMs, 0, 120000),
    editCount: boundedNumber(value?.editCount, 0, 1000),
    deletedChars: boundedNumber(value?.deletedChars, 0, 10000),
    pauseCount: boundedNumber(value?.pauseCount, 0, 100),
    characterCount: boundedNumber(value?.characterCount, 0, 4000)
  };
}

export function buildOperatorDraftRequest({
  prompt,
  history = [],
  draftSignals = {},
  previousDraftSummary = '',
  model = DEFAULT_OPERATOR_DRAFT_MODEL
} = {}) {
  const messages = (Array.isArray(history) ? history : [])
    .slice(-4)
    .map(item => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: clean(item?.content, 700)
    }))
    .filter(item => item.content);

  const signals = normalizeDraftSignals(draftSignals);
  const previousSummary = clean(previousDraftSummary, 180);
  messages.push({
    role: 'user',
    content: [
      'UNSENT_DRAFT_BEGIN',
      clean(prompt, 2000),
      'UNSENT_DRAFT_END',
      `UI_SIGNALS ${JSON.stringify(signals)}`,
      previousSummary ? `PREVIOUS_DRAFT_SUMMARY ${previousSummary}` : ''
    ].filter(Boolean).join('\n')
  });

  return {
    model,
    store: false,
    instructions: [
      'You are a private pre-send awareness process for the 3DVR Operator.',
      'The text marked UNSENT_DRAFT is not a sent message. Never answer it, never take an action, and never claim anything happened.',
      'Infer only enough to help the eventual Operator understand what the user may be trying to say.',
      'Treat typing cadence, edits, deletions, and pauses as weak interface signals. Do not infer emotions, diagnoses, intent to act, or other sensitive mental states from them.',
      'summary must be a short neutral description of the likely topic or direction, not advice and not a reply to the user.',
      'ready should be true only when the draft appears coherent enough that another idle check is unlikely to add useful context before Send.',
      'checkAgainMs controls whether the system should look again if the user remains idle: use 0 when it should wait for another edit or Send; otherwise choose 2000 to 12000 milliseconds.',
      'Prefer fewer checks. A long pause can justify one later recheck, but repeated unchanged checks usually should stop.',
      'Return only the requested JSON.'
    ].join(' '),
    input: messages,
    text: { format: { type: 'json_schema', ...DRAFT_RESPONSE_SCHEMA } }
  };
}

export function normalizeOperatorDraftAwareness(value = {}) {
  const requestedDelay = boundedNumber(value?.checkAgainMs, 0, 12000);
  return {
    summary: clean(value?.summary, 180),
    ready: value?.ready === true,
    checkAgainMs: requestedDelay > 0 && requestedDelay < 2000 ? 2000 : requestedDelay
  };
}
