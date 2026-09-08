import {
  FREELANCE_BOOKING_POLICY,
  mergeFreelanceSources,
  normalizeFreelanceSource,
} from '../src/freelance-booking-policy.js';

const gun = Gun(window.__GUN_PEERS__ || [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun',
]);
const ownerKey = resolveOwnerKey();
const sourceRecords = gun.get('3dvr-freelance-sources').get(ownerKey);
const overrides = Object.create(null);
let showAllSources = false;

const els = {
  policyList: document.getElementById('policyList'),
  sourceList: document.getElementById('sourceList'),
  sourceSyncState: document.getElementById('sourceSyncState'),
  showAllButton: document.getElementById('showAllButton'),
  addSourceButton: document.getElementById('addSourceButton'),
  sourceDialog: document.getElementById('sourceDialog'),
  sourceDialogTitle: document.getElementById('sourceDialogTitle'),
  sourceForm: document.getElementById('sourceForm'),
  sourceId: document.getElementById('sourceId'),
  sourceName: document.getElementById('sourceName'),
  sourceKind: document.getElementById('sourceKind'),
  sourceStatus: document.getElementById('sourceStatus'),
  sourceLogin: document.getElementById('sourceLogin'),
  sourceOnboarding: document.getElementById('sourceOnboarding'),
  sourceRate: document.getElementById('sourceRate'),
  sourcePriority: document.getElementById('sourcePriority'),
  sourceUrl: document.getElementById('sourceUrl'),
  sourceLastAction: document.getElementById('sourceLastAction'),
  sourceNextAction: document.getElementById('sourceNextAction'),
  closeSourceDialog: document.getElementById('closeSourceDialog'),
  cancelSourceDialog: document.getElementById('cancelSourceDialog'),
};

function resolveOwnerKey() {
  const sharedIdentity = window.AuthIdentity?.readSharedIdentity?.();
  const signedIn = Boolean(sharedIdentity?.signedIn) || localStorage.getItem('signedIn') === 'true';
  const alias = String(sharedIdentity?.alias || localStorage.getItem('alias') || '').trim();
  if (signedIn && alias) return `user:${alias}`;

  const storageKey = '3dvr-freelance-device-id';
  let deviceId = String(localStorage.getItem(storageKey) || '').trim();
  if (!deviceId) {
    deviceId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(storageKey, deviceId);
  }
  return `device:${deviceId}`;
}

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeAttr(value) {
  return safe(value).replace(/"/g, '&quot;');
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? safeAttr(url.href) : '';
  } catch {
    return '';
  }
}

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `source-${crypto.randomUUID()}`;
  }
  return `source-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderPolicy() {
  els.policyList.innerHTML = FREELANCE_BOOKING_POLICY.map(rule => `
    <article class="policy-card">
      <span class="chip policy-level ${safeAttr(rule.level)}">${safe(rule.level)}</span>
      <h3>${safe(rule.title)}</h3>
      <p>${safe(rule.summary)}</p>
    </article>
  `).join('');
}

function statusTone(status) {
  return /active|ready|warm|known/i.test(status) ? 'active' : '';
}

function renderSources() {
  const sources = mergeFreelanceSources(Object.values(overrides));
  const visibleSources = showAllSources ? sources : sources.slice(0, 8);
  els.showAllButton.textContent = showAllSources ? 'Show priority 8' : `Show all ${sources.length}`;
  els.sourceList.innerHTML = visibleSources.map(source => {
    const url = safeHttpUrl(source.url);
    return `
      <article class="source-row">
        <div class="source-main">
          <strong>${safe(source.name)}</strong>
          <span>#${safe(source.priority)} · ${safe(source.kind)}</span>
        </div>
        <div class="source-status">
          <span class="chip ${statusTone(source.status)}">${safe(source.status)}</span>
          <span class="chip ${statusTone(source.login)}">Login: ${safe(source.login)}</span>
          <span class="chip">${safe(source.onboarding)}</span>
        </div>
        <div class="source-rate ${source.rate ? '' : 'muted'}">${safe(source.rate || 'Rate TBD')}</div>
        <div class="source-actions-copy">
          <p><strong>Last:</strong> ${safe(source.lastAction || 'Nothing logged')}</p>
          <p><strong>Next:</strong> ${safe(source.nextAction || 'Decide next action')}</p>
        </div>
        <div class="source-buttons">
          ${url ? `<a class="mini-button" href="${url}" target="_blank" rel="noreferrer">Open</a>` : ''}
          <button class="mini-button" type="button" data-edit-source="${safeAttr(source.id)}">Edit</button>
        </div>
      </article>
    `;
  }).join('');
  els.sourceSyncState.textContent = 'Live';
  els.sourceSyncState.classList.add('live');
}

function openSourceDialog(source = {}) {
  const normalized = normalizeFreelanceSource(source);
  els.sourceDialogTitle.textContent = normalized.id ? 'Edit source' : 'Add source';
  els.sourceId.value = normalized.id;
  els.sourceName.value = normalized.name;
  els.sourceKind.value = normalized.kind;
  els.sourceStatus.value = normalized.status;
  els.sourceLogin.value = normalized.login;
  els.sourceOnboarding.value = normalized.onboarding;
  els.sourceRate.value = normalized.rate;
  els.sourcePriority.value = String(normalized.priority || 50);
  els.sourceUrl.value = normalized.url;
  els.sourceLastAction.value = normalized.lastAction;
  els.sourceNextAction.value = normalized.nextAction;
  els.sourceDialog.showModal();
}

function closeSourceDialog() {
  els.sourceDialog.close();
}

function handleSourceSubmit(event) {
  event.preventDefault();
  const id = els.sourceId.value || makeId();
  const record = normalizeFreelanceSource({
    id,
    name: els.sourceName.value,
    kind: els.sourceKind.value,
    status: els.sourceStatus.value,
    login: els.sourceLogin.value,
    onboarding: els.sourceOnboarding.value,
    rate: els.sourceRate.value,
    priority: els.sourcePriority.value,
    url: els.sourceUrl.value,
    lastAction: els.sourceLastAction.value,
    nextAction: els.sourceNextAction.value,
    updatedAt: new Date().toISOString(),
  });
  if (!record.name) return;
  sourceRecords.get(id).put(record);
  overrides[id] = record;
  renderSources();
  closeSourceDialog();
}

sourceRecords.map().on((data, key) => {
  if (!data) {
    delete overrides[key];
    renderSources();
    return;
  }
  const record = normalizeFreelanceSource({ ...data, id: data.id || key });
  if (!record.id || !record.name) return;
  overrides[record.id] = record;
  renderSources();
});

els.addSourceButton.addEventListener('click', () => openSourceDialog({ priority: 50 }));
els.showAllButton.addEventListener('click', () => {
  showAllSources = !showAllSources;
  renderSources();
});
els.sourceList.addEventListener('click', event => {
  const button = event.target.closest('[data-edit-source]');
  if (!button) return;
  const source = mergeFreelanceSources(Object.values(overrides))
    .find(item => item.id === button.dataset.editSource);
  if (source) openSourceDialog(source);
});
els.sourceForm.addEventListener('submit', handleSourceSubmit);
els.closeSourceDialog.addEventListener('click', closeSourceDialog);
els.cancelSourceDialog.addEventListener('click', closeSourceDialog);

renderPolicy();
renderSources();
