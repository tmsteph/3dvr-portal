import { queueCodeChange } from '../operator/forge.js';
import { normalizeQueueRecordForWorkboard } from '../src/operator-runtime/task-queue-adapter.js';
import { mergeQueueRuntimeRecord } from '../src/operator-runtime/runtime-sidecar.js';

const ROOT = '3dvr-portal';
const AGENT_OWNER_ALIAS = '3dvr-managed';
const DEFAULT_PEERS = [
  'wss://gun-relay-3dvr.fly.dev/gun',
  'https://gun-relay-3dvr.fly.dev/gun'
];

const records = new Map();
const agentQueueLatest = new Map();
const agentQueueRuntime = new Map();
const template = document.getElementById('card-template');
const cards = document.getElementById('work-cards');
const emptyState = document.getElementById('empty-state');
const connectionStatus = document.getElementById('connection-status');
const liveDot = document.getElementById('live-dot');
const portalOrb = document.getElementById('portal-orb');
const dispatchForm = document.getElementById('dispatch-form');
const dispatchStatus = document.getElementById('dispatch-status');
const dispatchSubmit = document.getElementById('dispatch-submit');
const dispatchResult = document.getElementById('dispatch-result');
const filterButtons = [...document.querySelectorAll('[data-filter]')];

let currentFilter = 'focus';

const filterCopy = {
  focus: ['FOCUS', 'Needs you + active work'],
  inbox: ['QUEUE', 'Waiting to start'],
  review: ['NEEDS YOU', 'Decisions and review'],
  done: ['DONE', 'Recently completed'],
  all: ['ALL WORK', 'Everything in one place']
};

function clean(value = '', max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function laneFor(status = '', kind = '') {
  const normalized = clean(status, 80).toLowerCase().replace(/[\s-]+/g, '_');
  if (kind === 'github-pr') return ['closed', 'merged'].includes(normalized) ? 'done' : 'review';
  if (kind === 'github-issue') return normalized === 'closed' ? 'done' : 'inbox';
  if (['done', 'completed', 'complete', 'merged', 'closed', 'success', 'succeeded', 'cancelled', 'canceled'].includes(normalized)) return 'done';
  if (['review', 'ready_for_review', 'awaiting_review', 'needs_review', 'waiting_human', 'blocked', 'failed', 'error', 'skipped'].includes(normalized)) return 'review';
  if (['working', 'running', 'in_progress', 'executing', 'claimed', 'processing', 'waiting_external', 'verifying'].includes(normalized)) return 'working';
  return 'inbox';
}

function recordUrl(kind, id) {
  if (kind === 'agent-task') return `/operator-runtime/?task=${encodeURIComponent(id)}`;
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
  const raw = clean(record.task || record.text || record.body || record.requestedChange || '', 1200);
  return raw.replace(/^Operator code request:\s*/i, '').replace(/\s+Make the smallest useful change[\s\S]*$/i, '');
}

function ownerFor(record) {
  return clean(record.owner || record.runtimeOwner || record.assignedTo || record.agent || record.backend || record.user || record.requestedByAlias || record.requestedBy || 'unassigned', 80);
}

function kindLabel(kind) {
  if (kind === 'edit') return 'Forge edit';
  if (kind === 'github-pr') return 'Pull request';
  if (kind === 'github-issue') return 'Issue';
  if (kind === 'agent-task') return 'Runtime task';
  return 'Agent task';
}

function friendlyStatus(item, lane) {
  const normalized = clean(item.record.status || 'open', 80).toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'waiting_external') return 'waiting outside';
  if (normalized === 'verifying') return 'verifying';
  if (lane === 'review') {
    if (normalized === 'waiting_human') return 'needs you';
    if (['failed', 'error', 'blocked', 'skipped'].includes(normalized)) return normalized.replaceAll('_', ' ');
    return 'needs review';
  }
  if (lane === 'working') return 'working';
  if (lane === 'done') return normalized === 'merged' ? 'merged' : 'done';
  return 'queued';
}

function sortedItems() {
  return [...records.values()].sort((a, b) => {
    const aTime = new Date(a.record.updatedAt || a.record.createdAt || 0).getTime();
    const bTime = new Date(b.record.updatedAt || b.record.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function matchesFilter(item, filter) {
  const lane = laneFor(item.record.status, item.kind);
  if (filter === 'all') return true;
  if (filter === 'focus') return lane === 'review' || lane === 'working';
  return lane === filter;
}

function runtimeDetails(record) {
  const details = [];
  if (record.workflow) details.push(`workflow ${clean(record.workflow, 100)}`);
  if (record.domain) details.push(clean(record.domain, 80));
  if (record.workerLane) details.push(`lane ${clean(record.workerLane, 80)}`);
  if (record.workerDeviceId) details.push(`worker ${clean(record.workerDeviceId, 24)}`);
  if (record.humanCheckpointStatus && record.humanCheckpointStatus !== 'not_required') {
    details.push(`checkpoint ${clean(record.humanCheckpointStatus, 60)}`);
  }
  if (record.verificationStatus && record.verificationStatus !== 'not_started') {
    details.push(`verification ${clean(record.verificationStatus, 60)}`);
  }
  const evidenceCount = Number.parseInt(record.evidenceCount || 0, 10) || 0;
  if (evidenceCount) details.push(`${evidenceCount} evidence`);
  return details;
}

function renderCard(item) {
  const node = template.content.firstElementChild.cloneNode(true);
  const record = item.record;
  const lane = laneFor(record.status, item.kind);
  const result = clean(record.resultSummary || record.error || '', 500);
  const link = node.querySelector('.open-record');
  const runtimeMeta = node.querySelector('.runtime-meta');
  const details = runtimeDetails(record);

  node.dataset.id = item.id;
  node.dataset.lane = lane;
  node.querySelector('.kind').textContent = kindLabel(item.kind);
  node.querySelector('.status').textContent = friendlyStatus(item, lane);
  node.querySelector('h3').textContent = clean(record.title || (item.kind === 'edit' ? 'Operator code edit' : 'Agent task'), 160);
  node.querySelector('.task').textContent = compactTask(record) || 'No description yet.';
  node.querySelector('.repo').textContent = clean(record.repo || record.domain || 'portal', 80);
  node.querySelector('.owner').textContent = ownerFor(record);
  node.querySelector('time').textContent = displayDate(record.updatedAt || record.createdAt);
  node.querySelector('time').dateTime = clean(record.updatedAt || record.createdAt, 80);
  link.href = item.url || recordUrl(item.kind, item.id);

  if (/^https?:\/\//i.test(item.url || '')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  if (details.length) {
    runtimeMeta.hidden = false;
    runtimeMeta.textContent = details.join(' · ');
  }

  if (result) {
    const resultEl = node.querySelector('.result');
    resultEl.hidden = false;
    resultEl.textContent = result;
  }

  return node;
}

function setPulseMessage({ review, working }) {
  const message = document.getElementById('focus-message');
  if (review > 0) {
    message.textContent = review === 1 ? 'One thing is waiting for your decision.' : `${review} things are waiting for your decision.`;
    return;
  }
  if (working > 0) {
    message.textContent = working === 1 ? 'One task is moving. Nothing needs you.' : `${working} tasks are moving. Nothing needs you.`;
    return;
  }
  message.textContent = 'Nothing needs you right now.';
}

function updateEmptyState(filter) {
  const title = emptyState.querySelector('strong');
  const copy = emptyState.querySelector('span');
  if (filter === 'focus') {
    title.textContent = 'Nothing demanding your attention.';
    copy.textContent = 'The agents can keep moving.';
  } else if (filter === 'inbox') {
    title.textContent = 'The queue is clear.';
    copy.textContent = 'Give an agent something new above.';
  } else if (filter === 'review') {
    title.textContent = 'You are all caught up.';
    copy.textContent = 'No decisions are waiting on you.';
  } else if (filter === 'done') {
    title.textContent = 'No completed work yet.';
    copy.textContent = 'Finished work will collect here.';
  } else {
    title.textContent = 'No work to show.';
    copy.textContent = 'Queue something above to get moving.';
  }
}

function render() {
  const all = sortedItems();
  const counts = { inbox: 0, working: 0, review: 0, done: 0 };
  all.forEach(item => { counts[laneFor(item.record.status, item.kind)] += 1; });

  const visible = all.filter(item => matchesFilter(item, currentFilter));
  cards.replaceChildren(...visible.map(renderCard));
  cards.hidden = visible.length === 0;
  emptyState.hidden = visible.length !== 0;
  updateEmptyState(currentFilter);

  document.getElementById('review-count').textContent = counts.review;
  document.getElementById('working-count').textContent = counts.working;
  document.getElementById('focus-count').textContent = counts.review + counts.working;
  document.getElementById('inbox-count').textContent = counts.inbox;
  document.getElementById('review-filter-count').textContent = counts.review;
  document.getElementById('done-count').textContent = counts.done;
  document.getElementById('visible-count').textContent = `${visible.length} ${visible.length === 1 ? 'item' : 'items'}`;

  const [eyebrow, title] = filterCopy[currentFilter] || filterCopy.focus;
  document.getElementById('feed-eyebrow').textContent = eyebrow;
  document.getElementById('feed-title').textContent = title;
  setPulseMessage(counts);
}

function setFilter(filter) {
  currentFilter = filterCopy[filter] ? filter : 'focus';
  filterButtons.forEach(button => {
    const active = button.dataset.filter === currentFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  render();
}

function watchCollection(node, kind) {
  node.map().on((value, id) => {
    const key = `${kind}:${id}`;
    if (!value || typeof value !== 'object') records.delete(key);
    else records.set(key, { id, kind, record: value });
    render();
  });
}

function syncAgentQueueItem(id) {
  const latest = agentQueueLatest.get(id);
  const key = `agent-task:${id}`;
  if (!latest || typeof latest !== 'object') {
    records.delete(key);
    render();
    return;
  }
  const runtime = agentQueueRuntime.get(id) || {};
  const merged = mergeQueueRuntimeRecord(latest, runtime);
  records.set(key, {
    id,
    kind: 'agent-task',
    record: normalizeQueueRecordForWorkboard(merged)
  });
  render();
}

function watchAgentQueue(taskQueue) {
  taskQueue.get('latest').map().on((value, id) => {
    if (!value || typeof value !== 'object') agentQueueLatest.delete(id);
    else agentQueueLatest.set(id, value);
    syncAgentQueueItem(id);
  });
  taskQueue.get('runtime').map().on((value, id) => {
    if (!value || typeof value !== 'object') agentQueueRuntime.delete(id);
    else agentQueueRuntime.set(id, value);
    syncAgentQueueItem(id);
  });
}

async function loadGithubWork() {
  try {
    const response = await fetch('/api/workboard/github', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`GitHub feed returned ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];

    for (const key of [...records.keys()]) {
      if (key.startsWith('github:')) records.delete(key);
    }

    items.forEach(item => {
      const kind = item.kind === 'github-pr' ? 'github-pr' : 'github-issue';
      const status = item.merged ? 'merged' : clean(item.state || 'open', 80);
      const key = `github:${kind}:${item.id}`;
      records.set(key, {
        id: item.id,
        kind,
        url: clean(item.url, 1000),
        record: {
          title: clean(item.title, 240),
          body: clean(item.body, 2000),
          repo: clean(payload.repository || '3dvr-portal', 80),
          user: clean(item.user, 80),
          status,
          createdAt: clean(item.createdAt, 80),
          updatedAt: clean(item.updatedAt, 80)
        }
      });
    });

    render();
    connectionStatus.textContent = 'Runtime + Forge + GitHub live';
  } catch (error) {
    console.warn('Workboard GitHub feed unavailable:', error);
  }
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
  dispatchStatus.textContent = 'Signing + queuing…';

  try {
    const result = await queueCodeChange({ title, repo, text });
    dispatchStatus.textContent = result.message || 'Queued.';
    dispatchResult.href = result.url;
    dispatchResult.textContent = `${result.label || 'Open task'} →`;
    dispatchResult.hidden = false;
    document.getElementById('dispatch-title-input').value = '';
    document.getElementById('dispatch-task').value = '';
    setFilter('inbox');
  } catch (error) {
    dispatchStatus.textContent = clean(error?.message || 'Could not queue this task.', 240);
  } finally {
    dispatchSubmit.disabled = false;
  }
}

function start() {
  dispatchForm?.addEventListener('submit', submitDispatch);
  filterButtons.forEach(button => button.addEventListener('click', () => setFilter(button.dataset.filter)));
  loadGithubWork();
  render();

  if (typeof globalThis.Gun !== 'function') {
    connectionStatus.textContent = 'Runtime queue unavailable';
    return;
  }

  const peers = Array.isArray(globalThis.__GUN_PEERS__) && globalThis.__GUN_PEERS__.length
    ? globalThis.__GUN_PEERS__
    : DEFAULT_PEERS;
  const gun = globalThis.Gun({ peers });
  const root = gun.get(ROOT);
  const forge = root.get('forge');
  const taskQueue = root.get('agentOps').get(AGENT_OWNER_ALIAS).get('taskQueue');

  watchCollection(forge.get('suggestions'), 'suggestion');
  watchCollection(forge.get('editRequests'), 'edit');
  watchAgentQueue(taskQueue);

  connectionStatus.textContent = 'Runtime + Forge live';
  liveDot.classList.add('live');
  portalOrb?.classList.add('live');
}

start();
