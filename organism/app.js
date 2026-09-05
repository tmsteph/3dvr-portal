import {
  createOrganismFeedbackProof,
  createOrganismRecallProof
} from '../operator/forge.js';

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

async function approveMemory(query, memory, approvalButton) {
  const memoryId = String(memory?.id || '').trim();
  if (!memoryId) return;
  approvalButton.disabled = true;
  setState('Signing your approval…');

  try {
    const requestId = globalThis.crypto?.randomUUID?.() || `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const proof = await createOrganismFeedbackProof(query, memoryId, { requestId });
    const response = await fetch('/api/openai-site?provider=operator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organismRecall: true,
        organismFeedback: true,
        ...proof,
        query,
        memoryId,
        requestId
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not record memory approval.');
    approvalButton.textContent = 'Approved ✓';
    approvalButton.dataset.approved = 'true';
    setState('Approved. This is now high-quality evidence for future retrieval tournaments.');
  } catch (error) {
    approvalButton.disabled = false;
    setState(error?.message || 'Could not approve this memory.', true);
  }
}

function memoryCard(hit, query) {
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

  if (memory.id) {
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'memory-approve';
    approve.textContent = 'This was right';
    approve.addEventListener('click', () => approveMemory(query, memory, approve));
    card.append(approve);
  }

  return card;
}

function renderContext(context = {}, query = '') {
  clearResults();
  const hits = Array.isArray(context.hits) ? context.hits : [];
  if (!hits.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No relevant durable memories yet. The next step is feeding more approved conversation history into the Organism.';
    results.append(empty);
    return;
  }
  for (const hit of hits) results.append(memoryCard(hit, query));
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

    const response = await fetch('/api/openai-site?provider=operator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organismRecall: true, ...proof, query, requestId, limit })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Recall failed.');

    setState('Private recall complete. Mark a memory “This was right” only when it actually answered your question.');
    renderContext(data.context || {}, query);
  } catch (error) {
    setState(error?.message || 'Could not query your Digital Organism.', true);
  } finally {
    button.disabled = !refreshIdentity();
  }
});

refreshIdentity();
