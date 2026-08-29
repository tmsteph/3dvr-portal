import { queueCodeChange } from '../operator/forge.js';

const ROOT = '3dvr-portal';
const DEFAULT_PEERS = [
  'wss://gun-relay-3dvr.fly.dev/gun',
  'https://gun-relay-3dvr.fly.dev/gun'
];

const records = new Map();
const lanes = ['inbox', 'working', 'review', 'done'];
const laneEls = Object.fromEntries(lanes.map(name => [name, document.querySelector(`[data-lane="${name}"]`)]));
const template = document.getElementById('card-template');
const connectionStatus = document.getElementById('connection-status');
const liveDot = document.getElementById('live-dot');
const dispatchForm = document.getElementById('dispatch-form');
const dispatchStatus = document.getElementById('dispatch-status');
const dispatchSubmit = document.getElementById('dispatch-submit');
const dispatchResult = document.getElementById('dispatch-result');

function clean(value = '', max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function laneFor(status = '', kind = '') {
  const normalized = clean(status, 80).toLowerCase().replace(/[\s-]+/g, '_');
  if (['done', 'completed', 'complete', 'merged', 'closed', 'success', 'succeeded'].includes(normalized)) return 'done';
  if (['review', 'ready_for_review', 'awaiting_review', 'needs_review', 'blocked', 'failed', 'error'].includes(normalized)) return 'review';
  if (['working', 'running', 'in_progress', 'executing', 'claimed', 'processing'].includes(normalized)) return 'working';
  if (kind === 'suggestion' && ['open', 'new'].includes(normalized)) return 'inbox';
  return 'inbox';
}

function recordUrl(kind, id) {
  const params = new URLSearchParams({ kind: kind === 'edit' ? 'edit' : 'suggestion', id });
  return `/forge/record.html?${params.toString()}`;
}

function displayDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return 'No timestamp';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function compactTask(record) {
  const raw = clean(record.task || record.text || record.requestedChange || '', 1200);
  return raw.replace(/^Operator code request:\s*/i, '').replace(/\s+Make the smallest useful change[\s\S]*$/i, '');
}

function ownerFor(record) {
  return clean(record.assignedTo || record.agent || record.backend || record.requestedByAlias || record.requestedBy || 'unassigned', 80);
}

function renderCard(item) {
  const node = template.content.firstElementChild.cloneNode(true);
  const record = item.record;
  const status = clean(record.status || 'open', 80);
  const result = clean(record.resultSummary || record.error || '', 500);

  node.dataset.id = item.id;
  node.querySelector('.kind').textContent = item.kind === 'edit' ? 'Forge edit' : 'Suggestion';
  node.querySelector('.status').textContent = status.replaceAll('_', ' ');
  node.querySelector('h3').textContent = clean(record.title || (item.kind === 'edit' ? 'Operator code edit' : 'Operator suggestion'), 160);
  node.querySelector('.task').textContent = compactTask(record) || 'No description yet.';
  node.querySelector('.repo').textContent = clean(record.repo || 'portal', 80);
  node.querySelector('.owner').textContent = ownerFor(record);
  node.querySelector('time').textContent = displayDate(record.updatedAt || record.createdAt);
  node.querySelector('time').dateTime = clean(record.updatedAt || record.createdAt, 80);
  node.querySelector('.open-record').href = recordUrl(item.kind, item.id);

  if (result) {
    const resultEl = node.querySelector('.result');
    resultEl.hidden = false;
    resultEl.textContent = result;
  }

  return node;
}

function render() {
  const all = [...records.values()].sort((a, b) => {
    const aTime = new Date(a.record.updatedAt || a.record.createdAt || 0).getTime();
    const bTime = new Date(b.record.updatedAt || b.record.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const grouped = Object.fromEntries(lanes.map(name => [name, []]));
  all.forEach(item => grouped[laneFor(item.record.status, item.kind)].push(item));

  lanes.forEach(name => {
    const lane = laneEls[name];
    const cards = lane.querySelector('.cards');
    cards.replaceChildren(...grouped[name].map(renderCard));
    lane.querySelector('.count').textContent = grouped[name].length;
  });

  document.getElementById('total-count').textContent = all.length;
  document.getElementById('active-count').textContent = grouped.inbox.length + grouped.working.length;
  document.getElementById('review-count').textContent = grouped.review.length;
  document.getElementById('done-count').textContent = grouped.done.length;
}

function watchCollection(node, kind) {
  node.map().on((value, id) => {
    const key = `${kind}:${id}`;
    if (!value || typeof value !== 'object') records.delete(key);
    else records.set(key, { id, kind, record: value });
    render();
  });
}

async function submitDispatch(event) {
  event.preventDefault();
  const formData = new FormData(dispatchForm);
  const title = clean(formData.get('title'), 160);
  const repo = clean(formData.get('repo'), 80) || 'portal';
  const text = clean(formData.get('task'), 4000);
  if (!text) return;

  dispatchSubmit.disabled = true;
  dispatchResult.hidden = true;
  dispatchStatus.textContent = 'Signing and queuing…';

  try {
    const result = await queueCodeChange({ title, repo, text });
    dispatchStatus.textContent = result.message || 'Queued.';
    dispatchResult.href = result.url;
    dispatchResult.textContent = `${result.label || 'Open queued task'} →`;
    dispatchResult.hidden = false;
    document.getElementById('dispatch-title-input').value = '';
    document.getElementById('dispatch-task').value = '';
  } catch (error) {
    dispatchStatus.textContent = clean(error?.message || 'Could not queue this task.', 240);
  } finally {
    dispatchSubmit.disabled = false;
  }
}

function start() {
  dispatchForm?.addEventListener('submit', submitDispatch);

  if (typeof globalThis.Gun !== 'function') {
    connectionStatus.textContent = 'Forge unavailable';
    return;
  }

  const peers = Array.isArray(globalThis.__GUN_PEERS__) && globalThis.__GUN_PEERS__.length
    ? globalThis.__GUN_PEERS__
    : DEFAULT_PEERS;
  const gun = globalThis.Gun({ peers });
  const forge = gun.get(ROOT).get('forge');

  watchCollection(forge.get('suggestions'), 'suggestion');
  watchCollection(forge.get('editRequests'), 'edit');

  connectionStatus.textContent = 'Live Forge data';
  liveDot.classList.add('live');
}

start();
