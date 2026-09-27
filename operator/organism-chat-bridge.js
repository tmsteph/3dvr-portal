import {
  createOrganismRecallProof,
  createOrganismRememberProof
} from './forge.js';

const DEFAULT_ENDPOINT = '/api/openai-site?provider=operator';

function clean(value = '', max = 4000) {
  return String(value || '').trim().slice(0, max);
}

async function postJson(payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  if (typeof fetchImpl !== 'function') throw new Error('Memory bridge fetch is unavailable.');

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || 'Digital Organism request failed.');
  }
  return data;
}

export async function recallOperatorMemory(query, options = {}) {
  const text = clean(query, 2000);
  if (!text) return null;
  const createProof = options.createRecallProof || createOrganismRecallProof;
  const proof = await createProof(text, { limit: options.limit || 6 });
  const data = await postJson({ organismRecall: true, ...proof }, options);
  const context = data?.context;
  if (!context || typeof context !== 'object') return null;
  return {
    text: clean(context.text, 7000),
    hits: Array.isArray(context.hits) ? context.hits.slice(0, 10) : [],
    strategy: clean(context.strategy, 120)
  };
}

export async function rememberOperatorTurn(turn = {}, options = {}) {
  const prompt = clean(turn.prompt, 1800);
  const reply = clean(turn.reply, 1800);
  if (!prompt && !reply) return null;

  const conversationId = clean(turn.conversationId, 180) || 'unknown';
  const createdAt = clean(turn.createdAt, 80) || new Date().toISOString();
  const sourceId = clean(
    turn.sourceId || `portal-operator:${conversationId}:${createdAt}`,
    300
  );
  const subject = clean(turn.subject, 300) || '3DVR Operator conversation';
  const content = [
    prompt ? `User: ${prompt}` : '',
    reply ? `Operator: ${reply}` : ''
  ].filter(Boolean).join('\n\n').slice(0, 4000);

  const createProof = options.createRememberProof || createOrganismRememberProof;
  const proof = await createProof(content, {
    subject,
    kind: 'conversation',
    sourceId
  });
  const data = await postJson({ organismRemember: true, ...proof }, options);
  return data?.memory || null;
}

export async function recallOperatorMemoryBestEffort(query, options = {}) {
  try {
    return await recallOperatorMemory(query, options);
  } catch {
    return null;
  }
}

export async function rememberOperatorTurnBestEffort(turn = {}, options = {}) {
  try {
    return await rememberOperatorTurn(turn, options);
  } catch {
    return null;
  }
}
