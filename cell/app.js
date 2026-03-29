'use strict';

function createLocalGunSubscriptionStub() {
  return {
    off() {}
  };
}

function createLocalGunNodeStub() {
  const node = {
    __isGunStub: true,
    get() {
      return createLocalGunNodeStub();
    },
    put(_value, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
      }
      return node;
    },
    once(callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback(undefined), 0);
      }
      return node;
    },
    map() {
      return {
        __isGunStub: true,
        on() {
          return createLocalGunSubscriptionStub();
        }
      };
    },
    on() {
      return createLocalGunSubscriptionStub();
    },
    off() {}
  };
  return node;
}

function createLocalGunUserStub() {
  const node = createLocalGunNodeStub();
  return {
    ...node,
    is: null,
    _: {},
    recall() {},
    auth(_alias, _password, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
      }
    },
    leave() {},
    create(_alias, _password, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
      }
    }
  };
}

function createGunStub() {
  return {
    __isGunStub: true,
    get() {
      return createLocalGunNodeStub();
    },
    user() {
      return createLocalGunUserStub();
    }
  };
}

function ensureGunContext(factory, label) {
  const ensureGun = window.ScoreSystem && typeof window.ScoreSystem.ensureGun === 'function'
    ? window.ScoreSystem.ensureGun.bind(window.ScoreSystem)
    : null;
  if (ensureGun) {
    return ensureGun(factory, { label });
  }

  let instance = null;
  if (typeof factory === 'function') {
    try {
      instance = factory();
    } catch (err) {
      console.warn(`Failed to initialize ${label || 'gun'} instance`, err);
    }
  }

  if (instance) {
    const resolvedUser = typeof instance.user === 'function'
      ? instance.user()
      : createLocalGunUserStub();
    return {
      gun: instance,
      user: resolvedUser,
      isStub: !!instance.__isGunStub
    };
  }

  const stub = createGunStub();
  return {
    gun: stub,
    user: stub.user(),
    isStub: true
  };
}

function createCellGun() {
  if (typeof Gun !== 'function') {
    return null;
  }

  const peers = window.__GUN_PEERS__ || [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun'
  ];

  try {
    return Gun({ peers });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (/storage|quota|blocked|third-party/i.test(message)) {
      console.warn('Retrying Gun init for Cell without localStorage (likely blocked cookies)', err);
      try {
        return Gun({ peers, radisk: false, localStorage: false });
      } catch (fallbackErr) {
        console.warn('Cell Gun fallback init failed', fallbackErr);
      }
    } else {
      console.warn('Cell Gun init failed unexpectedly', err);
    }
  }

  return null;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeList(value) {
  return String(value || '')
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatStamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function parseMemberCount(sizeValue) {
  const numeric = Number.parseInt(String(sizeValue || '').match(/\d+/)?.[0] || '', 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

const gunContext = ensureGunContext(createCellGun, 'cell');
const gun = gunContext.gun;
const user = gunContext.user;
const portalRoot = gun && typeof gun.get === 'function'
  ? gun.get('3dvr-portal')
  : createLocalGunNodeStub();
const cellHubRoot = portalRoot && typeof portalRoot.get === 'function'
  ? portalRoot.get('cellHub')
  : createLocalGunNodeStub();
const cellsRoot = cellHubRoot && typeof cellHubRoot.get === 'function'
  ? cellHubRoot.get('cells')
  : createLocalGunNodeStub();
const activityRoot = cellHubRoot && typeof cellHubRoot.get === 'function'
  ? cellHubRoot.get('activity')
  : createLocalGunNodeStub();
const metaRoot = cellHubRoot && typeof cellHubRoot.get === 'function'
  ? cellHubRoot.get('meta')
  : createLocalGunNodeStub();

const params = new URLSearchParams(window.location.search);
const requestedCellId = (params.get('cellId') || params.get('cell') || '').trim();

const elements = {
  form: document.getElementById('cellForm'),
  cellId: document.getElementById('cellId'),
  cellName: document.getElementById('cellName'),
  focus: document.getElementById('focus'),
  size: document.getElementById('size'),
  rhythm: document.getElementById('rhythm'),
  purpose: document.getElementById('purpose'),
  pillars: document.getElementById('pillars'),
  submit: document.querySelector('#cellForm button[type="submit"]'),
  syncStatus: document.getElementById('syncStatus'),
  cellCount: document.getElementById('cellCount'),
  activeCellLabel: document.getElementById('activeCellLabel'),
  linkedAppCount: document.getElementById('linkedAppCount'),
  lastSavedAt: document.getElementById('lastSavedAt'),
  cellList: document.getElementById('cellList'),
  cellEmpty: document.getElementById('cellEmpty'),
  appLinks: Array.from(document.querySelectorAll('[data-cell-app]')),
};

const DEFAULT_APP_LINKS = [
  { key: 'contacts', label: 'Contacts', href: '../contacts/index.html' },
  { key: 'crm', label: 'CRM', href: '../crm/index.html' },
  { key: 'finance', label: 'Finance', href: '../finance/index.html' },
  { key: 'chat', label: 'Chat', href: '../chat/' },
  { key: 'billing', label: 'Billing', href: '../billing/index.html' },
];

const state = {
  cells: Object.create(null),
  selectedCellId: requestedCellId || '',
  lastSavedAt: '',
  pendingRender: false,
  pendingFocusSelection: requestedCellId || '',
};

function portalHref(path, cellId = '') {
  if (!cellId) {
    return path;
  }
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}cellId=${encodeURIComponent(cellId)}`;
}

function resolveAppLink(appKey, cellId) {
  const entry = DEFAULT_APP_LINKS.find(item => item.key === appKey);
  if (!entry) return '#';
  return portalHref(entry.href, cellId);
}

function normalizeCell(value, id) {
  const record = value && typeof value === 'object' ? value : {};
  const createdAt = String(record.createdAt || record.created || '');
  const updatedAt = String(record.updatedAt || record.updated || createdAt || '');
  const pillars = normalizeList(Array.isArray(record.pillars) ? record.pillars.join(',') : record.pillars);
  const linkedApps = normalizeList(Array.isArray(record.linkedApps) ? record.linkedApps.join(',') : record.linkedApps);
  return {
    id: String(record.id || id || '').trim(),
    name: String(record.name || 'Untitled Cell').trim(),
    focus: String(record.focus || 'Cross-line organization').trim(),
    size: String(record.size || '3-12 people').trim(),
    rhythm: String(record.rhythm || 'Weekly').trim(),
    purpose: String(record.purpose || '').trim(),
    pillars,
    linkedApps: linkedApps.length ? linkedApps : DEFAULT_APP_LINKS.map(item => item.key),
    memberCount: parseMemberCount(record.size || record.memberCount || ''),
    owner: String(record.owner || record.creator || 'Guest').trim(),
    createdAt,
    updatedAt,
  };
}

function getSelectedCell() {
  return state.cells[state.selectedCellId] || null;
}

function setAppLinks(cellId) {
  elements.appLinks.forEach(link => {
    const appKey = link.getAttribute('data-cell-app') || '';
    if (!appKey) return;
    link.href = resolveAppLink(appKey, cellId);
  });
}

function syncPreviewFromForm() {
  if (typeof window.__updateCellPreview === 'function') {
    window.__updateCellPreview();
  }
}

function syncSubmitLabel() {
  if (!elements.submit) return;
  elements.submit.textContent = elements.cellId && elements.cellId.value ? 'Update Cell' : 'Save Cell';
}

function populateForm(cell) {
  const defaults = window.__cellDefaults || {};
  const data = cell || {};
  elements.cellId.value = data.id || '';
  elements.cellName.value = data.name || defaults.cellName || '3dvr Builder Cell';
  elements.focus.value = data.focus || defaults.focus || 'Cross-line organization';
  elements.size.value = data.size || defaults.size || '6 people';
  elements.rhythm.value = data.rhythm || defaults.rhythm || 'Weekly';
  elements.purpose.value = data.purpose || defaults.purpose || '';
  elements.pillars.value = data.pillars && data.pillars.length
    ? data.pillars.join(', ')
    : defaults.pillars || 'support, leads, projects, coordination';
  syncPreviewFromForm();
  syncSubmitLabel();
  setAppLinks(data.id || '');
}

function updateMetaPanel() {
  const cells = Object.values(state.cells);
  elements.cellCount.textContent = String(cells.length);
  elements.lastSavedAt.textContent = state.lastSavedAt ? formatStamp(state.lastSavedAt) : '—';
  const selected = getSelectedCell();
  elements.activeCellLabel.textContent = selected ? selected.name : 'None';
  elements.linkedAppCount.textContent = String(DEFAULT_APP_LINKS.length);
}

function renderCellList() {
  const cells = Object.values(state.cells)
    .filter(cell => cell && cell.id)
    .sort((a, b) => {
      const aStamp = a.updatedAt || a.createdAt || '';
      const bStamp = b.updatedAt || b.createdAt || '';
      if (aStamp !== bStamp) {
        return bStamp.localeCompare(aStamp);
      }
      return a.name.localeCompare(b.name);
    });

  elements.cellEmpty.hidden = cells.length > 0;
  elements.cellList.innerHTML = cells.map(cell => {
    const active = cell.id === state.selectedCellId ? ' is-active' : '';
    const appLinks = cell.linkedApps.map(appKey => {
      const entry = DEFAULT_APP_LINKS.find(item => item.key === appKey);
      if (!entry) return '';
      return `<a class="app-link" href="${escapeHtml(resolveAppLink(entry.key, cell.id))}" target="_blank" rel="noopener">${escapeHtml(entry.label)}</a>`;
    }).join('');
    const pillars = cell.pillars.slice(0, 5).map(pillar => `<span class="cell-pill">${escapeHtml(pillar)}</span>`).join('');
    const ownerLabel = cell.owner ? `Owner: ${cell.owner}` : 'Owner: Guest';
    const memberLabel = cell.memberCount ? `${cell.memberCount} member target` : cell.size;
    return `
      <article class="cell-card${active}" data-cell-id="${escapeHtml(cell.id)}">
        <div class="cell-card__header">
          <div>
            <h3 class="cell-card__title">${escapeHtml(cell.name)}</h3>
            <p class="cell-card__meta">${escapeHtml(cell.focus)} · ${escapeHtml(memberLabel)} · ${escapeHtml(cell.rhythm)}</p>
          </div>
          <button type="button" class="secondary" data-select-cell="${escapeHtml(cell.id)}">Open</button>
        </div>
        <p class="cell-card__meta">${escapeHtml(cell.purpose || 'No purpose saved yet.')}</p>
        <div class="cell-pill-row">
          ${pillars || '<span class="cell-pill cell-pill--gold">No pillars yet</span>'}
        </div>
        <div class="cell-actions">
          <span class="cell-pill cell-pill--gold">${escapeHtml(ownerLabel)}</span>
          <span class="cell-pill">Updated ${escapeHtml(formatStamp(cell.updatedAt || cell.createdAt))}</span>
        </div>
        <div class="app-link-row">
          ${appLinks}
        </div>
      </article>
    `;
  }).join('');
}

function renderState() {
  if (state.pendingRender) {
    return;
  }
  state.pendingRender = true;
  window.requestAnimationFrame(() => {
    state.pendingRender = false;
    updateMetaPanel();
    renderCellList();
    syncSubmitLabel();
    syncPreviewFromForm();
  });
}

function selectCell(cellId, { focusForm = false } = {}) {
  const id = String(cellId || '').trim();
  if (!id) return;
  state.selectedCellId = id;
  const cell = state.cells[id];
  if (cell) {
    populateForm(cell);
  } else {
    setAppLinks(id);
    syncSubmitLabel();
  }
  if (focusForm && typeof elements.cellName.focus === 'function') {
    elements.cellName.focus();
  }
  const url = new URL(window.location.href);
  url.searchParams.set('cellId', id);
  history.replaceState({}, '', url.toString());
  renderState();
  metaRoot.get('selectedCell').put({ id, updatedAt: new Date().toISOString() });
}

function buildCellRecord(existing = {}) {
  const id = String(elements.cellId.value || existing.id || generateId()).trim();
  const now = new Date().toISOString();
  const pillars = normalizeList(elements.pillars.value);
  const size = String(elements.size.value || existing.size || '3-12 people').trim();
  const record = {
    id,
    name: String(elements.cellName.value || existing.name || 'Untitled Cell').trim(),
    focus: String(elements.focus.value || existing.focus || 'Cross-line organization').trim(),
    size,
    rhythm: String(elements.rhythm.value || existing.rhythm || 'Weekly').trim(),
    purpose: String(elements.purpose.value || existing.purpose || '').trim(),
    pillars,
    linkedApps: DEFAULT_APP_LINKS.map(item => item.key),
    owner: existing.owner || (window.localStorage.getItem('username') || window.localStorage.getItem('alias') || 'Guest').trim(),
    createdAt: existing.createdAt || now,
    updatedAt: now,
    memberCount: parseMemberCount(size),
    source: 'cell-app',
  };
  return record;
}

function logCellActivity(record) {
  const entryId = `${record.id}:${Date.now()}`;
  activityRoot.get(entryId).put({
    id: entryId,
    type: state.cells[record.id] ? 'cell.updated' : 'cell.created',
    cellId: record.id,
    name: record.name,
    focus: record.focus,
    timestamp: record.updatedAt,
  });
  state.lastSavedAt = record.updatedAt;
  metaRoot.get('lastSavedAt').put(record.updatedAt);
}

function saveCell(event) {
  event.preventDefault();
  const existing = getSelectedCell() || {};
  const record = buildCellRecord(existing);
  if (!record.name) {
    record.name = 'Untitled Cell';
  }
  cellsRoot.get(record.id).put(record, ack => {
    if (ack && ack.err) {
      console.warn('Unable to save cell to Gun', ack.err);
      return;
    }
    state.cells[record.id] = normalizeCell(record, record.id);
    state.selectedCellId = record.id;
    elements.cellId.value = record.id;
    setAppLinks(record.id);
    syncSubmitLabel();
    if (typeof window.__updateCellPreview === 'function') {
      window.__updateCellPreview();
    }
    logCellActivity(record);
    renderState();
  });
}

function resetCellForm() {
  state.selectedCellId = '';
  elements.cellId.value = '';
  const defaults = window.__cellDefaults || {};
  elements.cellName.value = defaults.cellName || '3dvr Builder Cell';
  elements.focus.value = defaults.focus || 'Cross-line organization';
  elements.size.value = defaults.size || '6 people';
  elements.rhythm.value = defaults.rhythm || 'Weekly';
  elements.purpose.value = defaults.purpose || '';
  elements.pillars.value = defaults.pillars || 'support, leads, projects, coordination';
  syncPreviewFromForm();
  syncSubmitLabel();
  setAppLinks('');
  const url = new URL(window.location.href);
  url.searchParams.delete('cellId');
  history.replaceState({}, '', url.toString());
  renderState();
}

function handleSelectedCellClick(event) {
  const button = event.target.closest('[data-select-cell]');
  if (!button) return;
  const cellId = button.getAttribute('data-select-cell');
  if (cellId) {
    selectCell(cellId, { focusForm: true });
  }
}

function hydrateSelectedCellFromQuery() {
  if (!state.pendingFocusSelection) {
    return;
  }
  const cell = state.cells[state.pendingFocusSelection];
  if (cell) {
    selectCell(state.pendingFocusSelection);
    state.pendingFocusSelection = '';
  }
}

function createCellGunFactory() {
  return createCellGun;
}

if (gunContext.isStub) {
  const retryDelays = [500, 1500, 3000];
  retryDelays.forEach(delay => {
    setTimeout(() => {
      const refreshed = ensureGunContext(createCellGunFactory(), 'cell-retry');
      if (refreshed && !refreshed.isStub && refreshed.gun && !refreshed.gun.__isGunStub) {
        try {
          window.location.reload();
        } catch (err) {
          console.warn('Cell reload after Gun reconnection failed', err);
        }
      }
    }, delay);
  });
}

if (typeof user.recall === 'function') {
  try {
    user.recall({ sessionStorage: true, localStorage: true });
  } catch (err) {
    console.warn('Unable to recall Cell user session', err);
  }
}

elements.form.addEventListener('submit', saveCell);
document.getElementById('resetBtn').addEventListener('click', resetCellForm);
elements.form.addEventListener('input', () => {
  syncPreviewFromForm();
  syncSubmitLabel();
});
elements.cellList.addEventListener('click', handleSelectedCellClick);
elements.appLinks.forEach(link => {
  link.href = resolveAppLink(link.getAttribute('data-cell-app') || '', state.selectedCellId);
});

if (typeof cellsRoot.map === 'function') {
  cellsRoot.map().on((value, key) => {
    if (!value || typeof value !== 'object') {
      return;
    }
    const cell = normalizeCell(value, key);
    if (!cell.id) {
      return;
    }
    state.cells[cell.id] = cell;
    renderState();
    hydrateSelectedCellFromQuery();
  });
}

metaRoot.get('lastSavedAt').once(value => {
  if (typeof value === 'string') {
    state.lastSavedAt = value;
    renderState();
  }
});

if (requestedCellId) {
  state.pendingFocusSelection = requestedCellId;
}

populateForm(state.cells[state.selectedCellId] || null);
setAppLinks(state.selectedCellId);
syncSubmitLabel();
renderState();
hydrateSelectedCellFromQuery();

if (gunContext.isStub) {
  elements.syncStatus.textContent = 'Offline stub';
} else {
  elements.syncStatus.textContent = 'Gun live';
}
