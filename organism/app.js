import { createOrganismRecallProof } from '../operator/forge.js';

const form = document.getElementById('recallForm');
const question = document.getElementById('question');
const button = document.getElementById('askButton');
const state = document.getElementById('state');
const results = document.getElementById('results');
const identity = document.getElementById('identity');

function signedInIdentity() {
  const signedIn = globalThis.localStorage?.getItem?.('signedIn') === 'true';
  const alias = String(globalThis.localStorage?.getItem?.('alias') || '').trim();
  const pub = String(globalThis.localStorage?.getItem?.('userPubKey') || '').trim();
  return { signedIn, alias, pub };
}

function setState(message = '', error = false) {
  state.textContent = message;
  state.classList.toggle('error', Boolean(error));
}

function clearResults() {
  while (results.firstChild) results.firstChild.remove();
}

function memoryCard(hit) {
  const memory = hit?.memory || {};
  const card = document.createElement('article');
  card.className = 'memory';

  const subject = document.createElement('div');
  subject.className = 'subject';
  subject.textContent = memory.subject || memory.kind || 'Memory';

  const content = document.createElement('div');
  content.className = 'content';
  content.textContent = memory.content || '';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const source = [memory.sourceType, memory.sourceId].filter(Boolean).join(':');
  const score = Number.isFinite(Number(hit?.score)) ? ` · score ${Number(hit.score).toFixed(3)}` : '';
  meta.textContent = `${source || 'private memory'}${memory.createdAt ? ` · ${memory.createdAt}` : ''}${score}`;

  card.append(subject, content, meta);
  return card;
}

function renderContext(context = {}) {
  clearResults();
  const hits = Array.isArray(context.hits) ? context.hits : [];
  if (!hits.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No relevant durable memories yet. The next step is feeding more approved conversation history into the Organism.';
    results.append(empty);
    return;
  }
  for (const hit of hits) results.append(memoryCard(hit));
}

function refreshIdentity() {
  const current = signedInIdentity();
  if (current.signedIn && current.pub) {
    identity.textContent = current.alias || 'Signed in';
    button.disabled = false;
    return true;
  }
  identity.textContent = 'Sign in required';
  button.disabled = true;
  setState('Sign in from the 3DVR Portal first, then return here.', true);
  return false;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!refreshIdentity()) return;
  const query = question.value.trim();
  if (!query) return;

  button.disabled = true;
  clearResults();
  setState('Signing your question…');

  try {
    const requestId = globalThis.crypto?.randomUUID?.() || `recall-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const limit = 5;
    const proof = await createOrganismRecallProof(query, { requestId, limit });
    setState('Asking your private OVH memory…');

    const response = await fetch('/api/organism-recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...proof, query, requestId, limit })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Recall failed.');

    setState('Private recall complete.');
    renderContext(data.context || {});
  } catch (error) {
    setState(error?.message || 'Could not query your Digital Organism.', true);
  } finally {
    button.disabled = !refreshIdentity();
  }
});

refreshIdentity();
