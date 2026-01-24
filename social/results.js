const socialGun = window.SocialGun || {};
const scoreSystem = window.ScoreSystem || {};

const resolveGunNodeStub = typeof socialGun.resolveGunNodeStub === 'function'
  ? socialGun.resolveGunNodeStub
  : createBasicGunNodeStub;
const resolveGunUserStub = typeof socialGun.resolveGunUserStub === 'function'
  ? socialGun.resolveGunUserStub
  : createBasicGunUserStub;
const ensureGunContext = typeof socialGun.ensureGunContext === 'function'
  ? socialGun.ensureGunContext
  : createBasicGunContext;
const recallUserSessionIfAvailable = typeof socialGun.recallUserSessionIfAvailable === 'function'
  ? socialGun.recallUserSessionIfAvailable
  : function() {};

const resultsForm = document.getElementById('resultsForm');
const resultsList = document.getElementById('resultsList');
const resultsEmpty = document.getElementById('resultsEmpty');
const resultGoalSelect = document.getElementById('resultGoal');
const resultStatusSelect = document.getElementById('resultStatus');

const resultRecords = new Map();

const urlParams = new URLSearchParams(window.location.search);
const requestedGoalId = urlParams.get('goalId');

const gunContext = ensureGunContext(() => (typeof Gun === 'function'
  ? Gun(window.__GUN_PEERS__ || [
      'wss://relay.3dvr.tech/gun',
      'wss://gun-relay-3dvr.fly.dev/gun'
    ])
  : null), { label: 'social-results' });

const gun = gunContext.gun;
const user = gunContext.user;
const socialRoot = gun && typeof gun.get === 'function'
  ? gun.get('social-media')
  : resolveGunNodeStub();
// Node shape: social-media/results/<id> -> { goalId, label, metrics, status, createdAt, updatedAt }
const resultsNode = socialRoot && typeof socialRoot.get === 'function'
  ? socialRoot.get('results')
  : resolveGunNodeStub();
// Node shape: social-media/goals/<id> -> { title, ... }
const goalsNode = socialRoot && typeof socialRoot.get === 'function'
  ? socialRoot.get('goals')
  : resolveGunNodeStub();

recallUserSessionIfAvailable(user);

if (scoreSystem && typeof scoreSystem.ensureGuestIdentity === 'function') {
  try {
    scoreSystem.ensureGuestIdentity();
  } catch (err) {
    console.warn('Failed to ensure guest identity for results', err);
  }
}

if (resultStatusSelect) {
  resultStatusSelect.value = 'in-progress';
}

if (resultsForm) {
  resultsForm.addEventListener('submit', handleResultSubmit);
}

if (resultsList) {
  resultsList.addEventListener('click', handleResultsClick);
}

if (goalsNode && typeof goalsNode.map === 'function') {
  goalsNode.map().on((data, id) => {
    handleGoalUpdate(data, id);
  }, { change: true });
}

if (resultsNode && typeof resultsNode.map === 'function') {
  resultsNode.map().on((data, id) => {
    handleResultUpdate(data, id);
  }, { change: true });
}

function createBasicGunNodeStub() {
  const node = {
    __isGunStub: true,
    get() {
      return createBasicGunNodeStub();
    },
    put() {
      return node;
    },
    map() {
      return {
        on() {
          return { off() {} };
        }
      };
    },
    set() {
      return node;
    }
  };
  return node;
}

function createBasicGunUserStub(node) {
  return node || createBasicGunNodeStub();
}

function createBasicGunContext(factory) {
  let instance = null;
  if (typeof factory === 'function') {
    try {
      instance = factory();
    } catch (err) {
      console.warn('Failed to initialize Gun for results', err);
    }
  }

  if (instance) {
    const resolvedUser = typeof instance.user === 'function'
      ? instance.user()
      : resolveGunUserStub(instance);
    return {
      gun: instance,
      user: resolvedUser,
      isStub: !!instance.__isGunStub
    };
  }

  const stubGun = {
    __isGunStub: true,
    get() {
      return resolveGunNodeStub();
    },
    user() {
      return resolveGunUserStub();
    }
  };
  return { gun: stubGun, user: stubGun.user(), isStub: true };
}

function handleResultSubmit(event) {
  event.preventDefault();
  if (!resultsForm) return;

  const record = {
    goalId: resultsForm.resultGoal.value,
    label: resultsForm.resultLabel.value.trim(),
    impressions: Number(resultsForm.resultImpressions.value || 0),
    clicks: Number(resultsForm.resultClicks.value || 0),
    ctr: Number(resultsForm.resultCtr.value || 0),
    conversions: Number(resultsForm.resultConversions.value || 0),
    signups: Number(resultsForm.resultSignups.value || 0),
    status: resultsForm.resultStatus.value || 'in-progress',
    notes: resultsForm.resultNotes.value.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const id = `result-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  resultsNode.get(id).put(record);
  handleResultUpdate(record, id);
  resultsForm.reset();
  if (resultStatusSelect) {
    resultStatusSelect.value = 'in-progress';
  }
}

function handleResultUpdate(data, id) {
  const record = sanitizeRecord(data);
  if (!record) {
    resultRecords.delete(id);
    removeResultCard(id);
    updateResultsEmptyState();
    return;
  }
  resultRecords.set(id, record);
  const card = ensureResultCard(id);
  renderResultCard(card, record);
  updateResultsEmptyState();
}

function handleGoalUpdate(data, id) {
  const record = sanitizeRecord(data);
  if (!resultGoalSelect) return;
  const existing = resultGoalSelect.querySelector(`option[value="${id}"]`);
  if (!record) {
    if (existing) existing.remove();
    return;
  }
  if (existing) {
    existing.textContent = record.title || 'Untitled goal';
  } else {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = record.title || 'Untitled goal';
    resultGoalSelect.appendChild(option);
  }

  if (requestedGoalId && requestedGoalId === id) {
    resultGoalSelect.value = id;
  }
}

function handleResultsClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.resultId;
  if (!id) return;

  if (action === 'delete-result') {
    resultsNode.get(id).put(null);
    handleResultUpdate(null, id);
  }
}

function ensureResultCard(id) {
  let card = resultsList.querySelector(`[data-result-id="${id}"]`);
  if (card) return card;
  card = createResultCard(id);
  resultsList.prepend(card);
  return card;
}

function createResultCard(id) {
  const card = document.createElement('div');
  card.className = 'list-card';
  card.dataset.resultId = id;

  const title = document.createElement('h3');
  title.className = 'list-card__title';
  title.dataset.role = 'resultLabel';
  card.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'list-card__meta';
  meta.dataset.role = 'resultMeta';
  card.appendChild(meta);

  const metrics = document.createElement('p');
  metrics.className = 'list-card__meta';
  metrics.dataset.role = 'resultMetrics';
  card.appendChild(metrics);

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete-button';
  deleteButton.dataset.action = 'delete-result';
  deleteButton.dataset.resultId = id;
  deleteButton.textContent = 'Delete';
  actions.appendChild(deleteButton);
  card.appendChild(actions);

  card.titleEl = title;
  card.metaEl = meta;
  card.metricsEl = metrics;

  return card;
}

function renderResultCard(card, record) {
  card.titleEl.textContent = record.label || 'Results snapshot';
  card.metaEl.textContent = record.status ? `Status: ${record.status}` : 'Status: in-progress';
  card.metricsEl.textContent = buildMetrics(record);
}

function buildMetrics(record) {
  const parts = [];
  if (Number.isFinite(record.impressions)) parts.push(`Impressions ${record.impressions}`);
  if (Number.isFinite(record.clicks)) parts.push(`Clicks ${record.clicks}`);
  if (Number.isFinite(record.ctr)) parts.push(`CTR ${record.ctr}%`);
  if (Number.isFinite(record.conversions)) parts.push(`Conversions ${record.conversions}`);
  if (Number.isFinite(record.signups)) parts.push(`Sign-ups ${record.signups}`);
  return parts.join(' · ') || 'No metrics yet.';
}

function removeResultCard(id) {
  const card = resultsList.querySelector(`[data-result-id="${id}"]`);
  if (card) card.remove();
}

function updateResultsEmptyState() {
  if (!resultsEmpty) return;
  const hasItems = resultsList && resultsList.querySelector('[data-result-id]');
  resultsEmpty.hidden = !!hasItems;
}

function sanitizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === '_' || typeof value === 'function') continue;
    result[key] = value;
  }
  return result;
}
