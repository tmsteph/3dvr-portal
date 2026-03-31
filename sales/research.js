const LOCAL_TRAINING_STATE_KEY = 'training.v1';
const GUN_QUEUE_NODE_PATH = ['3dvr-portal', 'sales-training', 'today-queue'];
const CRM_NODE_KEY = '3dvr-crm';
const LOW_SIGNAL_STATUSES = new Set(['', 'Warm - Awareness', 'Lead', 'Prospect']);

const SEGMENTS = Object.freeze({
  'professional-services': Object.freeze({
    label: 'Professional services',
    marketSegment: 'Creative studio or agency',
    queueLead: 'Professional services Builder outreach',
    nextStep: 'Send first Builder note today',
    opener: 'You probably do not need more software. You need a cleaner way to keep leads moving and follow up before work slips.',
    full: 'Open with: You probably do not need more software. You need a cleaner way to keep leads moving and follow up before work slips.\nAsk: Where do inquiries usually stall right now: replies, follow-up, quoting, or weekly organization?\nClose: If you want, I can show you a lightweight Builder setup that keeps the next client touch visible every week.',
  }),
  'local-service': Object.freeze({
    label: 'Construction and local service',
    marketSegment: 'Owner-led service business',
    queueLead: 'Local service Builder outreach',
    nextStep: 'Send first owner-operator note today',
    opener: 'A lot of owner-operators do not need a giant stack. They need a simple lane for lead flow, follow-up, and jobs in motion.',
    full: 'Open with: A lot of owner-operators do not need a giant stack. They need a simple lane for lead flow, follow-up, and jobs in motion.\nAsk: What gets missed most often right now: new inquiries, quote follow-up, scheduling, or keeping jobs organized?\nClose: I can show you a Builder flow that keeps the next lead, next quote, and next follow-up from getting buried.',
  }),
  'support-team': Object.freeze({
    label: 'Health, support, and local teams',
    marketSegment: 'Educator or community org',
    queueLead: 'Support team Embedded outreach',
    nextStep: 'Send first Embedded note today',
    opener: 'Teams usually do not need more apps first. They need one clearer operating loop for intake, scheduling, and shared follow-up.',
    full: 'Open with: Teams usually do not need more apps first. They need one clearer operating loop for intake, scheduling, and shared follow-up.\nAsk: Where does coordination break down most often right now: intake, scheduling, handoff, or client follow-up?\nClose: If the pain is shared across a real team, Embedded is the cleaner fit because it gives you a tighter monthly execution lane.',
  }),
});

const playbookCopyStatus = document.getElementById('playbookCopyStatus');
const researchQueueStatus = document.getElementById('researchQueueStatus');
const scoreboardUpdated = document.getElementById('scoreboardUpdated');

let researchGun = null;
let reachoutQueueNode = null;
let crmRecordsNode = null;
let queueSnapshot = '[]';
let currentQueue = [];
const crmRecordIndex = Object.create(null);
let scoreboardTimer = null;

function createResearchGun() {
  if (typeof window === 'undefined' || typeof window.Gun !== 'function') {
    return null;
  }

  const peers = window.__GUN_PEERS__ || [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun',
  ];

  try {
    return window.Gun({ peers });
  } catch (error) {
    console.warn('Research desk Gun init failed', error);
    try {
      return window.Gun({ peers, radisk: false, localStorage: false });
    } catch (fallbackError) {
      console.warn('Research desk Gun fallback failed', fallbackError);
      return null;
    }
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeQueueEntry(item = {}) {
  return {
    id: String(item.id || generateId()),
    lead: String(item.lead || '').trim(),
    message: String(item.message || '').trim(),
    next: String(item.next || '').trim(),
    done: Boolean(item.done),
    source: String(item.source || '').trim(),
    segment: String(item.segment || '').trim(),
    playbook: String(item.playbook || '').trim(),
    createdAt: String(item.createdAt || '').trim(),
  };
}

function normalizeQueue(list = []) {
  return Array.isArray(list)
    ? list.map(normalizeQueueEntry).filter(item => item.lead && item.message && item.next)
    : [];
}

function queueSignature(list = []) {
  return JSON.stringify(normalizeQueue(list));
}

function readLocalTrainingState() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_TRAINING_STATE_KEY) || '{}');
  } catch (error) {
    console.warn('Unable to read local training state', error);
    return {};
  }
}

function persistLocalTrainingQueue(list) {
  try {
    const nextState = readLocalTrainingState();
    nextState.reachoutQueue = normalizeQueue(list);
    window.localStorage.setItem(LOCAL_TRAINING_STATE_KEY, JSON.stringify(nextState));
  } catch (error) {
    console.warn('Unable to persist local training queue', error);
  }
}

function renderQueueStatus(message = '') {
  if (!researchQueueStatus) {
    return;
  }
  const activeCount = currentQueue.filter(item => !item.done).length;
  const mode = reachoutQueueNode ? 'Shared with Gun' : 'Local fallback';
  researchQueueStatus.textContent = message
    ? `${mode} • ${activeCount} queued now • ${message}`
    : `${mode} • ${activeCount} queued now`;
}

function persistQueueToGun() {
  if (!reachoutQueueNode) {
    return;
  }
  reachoutQueueNode.put({
    items: currentQueue,
    updatedAt: new Date().toISOString(),
  }, ack => {
    if (ack && ack.err) {
      console.warn('Research desk queue sync failed', ack.err);
      renderQueueStatus('queue sync failed');
    }
  });
}

function setQueue(nextQueue, options = {}) {
  currentQueue = normalizeQueue(nextQueue);
  queueSnapshot = queueSignature(currentQueue);
  persistLocalTrainingQueue(currentQueue);
  renderQueueStatus(options.message || '');
  if (!options.fromGun) {
    persistQueueToGun();
  }
}

function hydrateQueueFromLocal() {
  const state = readLocalTrainingState();
  currentQueue = normalizeQueue(state.reachoutQueue || []);
  queueSnapshot = queueSignature(currentQueue);
  renderQueueStatus();
}

function hydrateQueueFromGun() {
  if (!reachoutQueueNode) {
    return;
  }

  const applyRemoteQueue = (data) => {
    if (!data || !data.updatedAt) {
      return;
    }
    const nextQueue = normalizeQueue(data.items || []);
    const nextSignature = queueSignature(nextQueue);
    if (nextSignature === queueSnapshot) {
      return;
    }
    setQueue(nextQueue, { fromGun: true });
  };

  reachoutQueueNode.once(applyRemoteQueue);
  reachoutQueueNode.on(applyRemoteQueue);
}

async function copyPlaybookText(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn('Clipboard API unavailable', error);
  }

  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.style.position = 'absolute';
  helper.style.left = '-9999px';
  document.body.appendChild(helper);
  helper.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(helper);
  return copied;
}

function updatePlaybookStatus(message) {
  if (playbookCopyStatus) {
    playbookCopyStatus.textContent = message;
  }
}

function queueSegmentPlaybook(segmentId) {
  const segment = SEGMENTS[segmentId];
  if (!segment) {
    return;
  }

  const duplicate = currentQueue.find(item => !item.done && item.playbook === segmentId);
  if (duplicate) {
    renderQueueStatus(`${segment.label} is already queued`);
    updatePlaybookStatus('That segment is already in the reach-out desk. Move it there before queuing another copy.');
    return;
  }

  setQueue([
    ...currentQueue,
    {
      id: generateId(),
      lead: segment.queueLead,
      message: segment.opener,
      next: segment.nextStep,
      source: 'Market research desk',
      segment: segment.label,
      playbook: segmentId,
      createdAt: new Date().toISOString(),
      done: false,
    },
  ], {
    message: `queued ${segment.label}`,
  });
  updatePlaybookStatus('Queued the opener in the shared reach-out desk. Open training or CRM while the segment is still warm.');
}

function normalizeCrmRecord(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const clean = {};
  Object.entries(data).forEach(([key, value]) => {
    if (key === '_' || typeof value === 'function') {
      return;
    }
    clean[key] = value;
  });
  return clean;
}

function isEngaged(record) {
  const status = String(record?.status || '').trim();
  return status !== '' && !LOW_SIGNAL_STATUSES.has(status);
}

function getPeopleForSegment(segment) {
  return Object.values(crmRecordIndex).filter(record => {
    if (!record || record.recordType !== 'person') {
      return false;
    }
    return String(record.marketSegment || '').trim() === segment.marketSegment;
  });
}

function renderScoreboardCard(segmentId, records) {
  const card = document.querySelector(`[data-score-segment="${segmentId}"]`);
  if (!card) {
    return;
  }

  const tracked = records.length;
  const engaged = records.filter(isEngaged).length;
  const won = records.filter(record => String(record.status || '').trim() === 'Won').length;
  const closeRate = tracked ? `${Math.round((won / tracked) * 100)}%` : '0%';
  const lost = records.filter(record => String(record.status || '').trim() === 'Lost').length;

  const trackedEl = card.querySelector('[data-score-metric="tracked"]');
  const engagedEl = card.querySelector('[data-score-metric="engaged"]');
  const wonEl = card.querySelector('[data-score-metric="won"]');
  const closeRateEl = card.querySelector('[data-score-metric="close-rate"]');
  const noteEl = card.querySelector('[data-score-note]');

  if (trackedEl) trackedEl.textContent = String(tracked);
  if (engagedEl) engagedEl.textContent = String(engaged);
  if (wonEl) wonEl.textContent = String(won);
  if (closeRateEl) closeRateEl.textContent = closeRate;
  if (noteEl) {
    noteEl.textContent = tracked
      ? `${engaged} engaged proxy, ${won} won, ${lost} lost. Move the segment with the strongest close rate.`
      : 'No CRM records yet for this segment.';
  }
}

function renderScoreboard() {
  Object.entries(SEGMENTS).forEach(([segmentId, segment]) => {
    renderScoreboardCard(segmentId, getPeopleForSegment(segment));
  });
  if (scoreboardUpdated) {
    scoreboardUpdated.textContent = `Live from ${CRM_NODE_KEY} • ${new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }
}

function scheduleScoreboardRender() {
  window.clearTimeout(scoreboardTimer);
  scoreboardTimer = window.setTimeout(() => {
    scoreboardTimer = null;
    renderScoreboard();
  }, 40);
}

function hydrateCrmScoreboard() {
  if (!crmRecordsNode) {
    if (scoreboardUpdated) {
      scoreboardUpdated.textContent = 'CRM live sync unavailable. Scoreboard will stay local-only until Gun is available.';
    }
    return;
  }

  crmRecordsNode.map().on((data, id) => {
    const recordId = String(id || '').trim();
    if (!recordId) {
      return;
    }
    const record = normalizeCrmRecord(data);
    if (!record || Object.keys(record).length === 0) {
      delete crmRecordIndex[recordId];
      scheduleScoreboardRender();
      return;
    }
    crmRecordIndex[recordId] = record;
    scheduleScoreboardRender();
  });
}

function bindPlaybookActions() {
  document.querySelectorAll('[data-copy-playbook-id]').forEach(button => {
    button.addEventListener('click', async () => {
      const playbookId = button.getAttribute('data-copy-playbook-id') || '';
      const segmentId = playbookId.replace(/-(opener|full)$/, '');
      const segment = SEGMENTS[segmentId];
      const text = playbookId.endsWith('-full') ? segment?.full : segment?.opener;
      const copied = await copyPlaybookText(text || '');
      updatePlaybookStatus(
        copied
          ? 'Copied playbook text. Start the CRM draft or queue the segment while it is still in front of you.'
          : 'Copy failed. Select the text manually and keep moving.'
      );
    });
  });

  document.querySelectorAll('[data-queue-playbook-id]').forEach(button => {
    button.addEventListener('click', () => {
      const segmentId = button.getAttribute('data-queue-playbook-id') || '';
      queueSegmentPlaybook(segmentId);
    });
  });
}

function init() {
  bindPlaybookActions();
  hydrateQueueFromLocal();

  researchGun = createResearchGun();
  if (researchGun) {
    reachoutQueueNode = researchGun
      .get(GUN_QUEUE_NODE_PATH[0])
      .get(GUN_QUEUE_NODE_PATH[1])
      .get(GUN_QUEUE_NODE_PATH[2]);
    crmRecordsNode = researchGun.get(CRM_NODE_KEY);
  }

  hydrateQueueFromGun();
  hydrateCrmScoreboard();
  renderScoreboard();
}

init();
