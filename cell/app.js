import { openPrivateCellStore, cellIdentity } from './private-store.js';
import { openCellInvitations } from './invitations.js';

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

function readStoredValue(key) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch (err) {
    return '';
  }
}

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
  cellSearch: document.getElementById('cellSearch'),
  cellSearchStatus: document.getElementById('cellSearchStatus'),
  cellSaveStatus: document.getElementById('cellSaveStatus'),
  accountStatus: document.getElementById('cellAccountStatus'),
  retry: document.getElementById('cellRetry'),
  memberCode: document.getElementById('cellMemberCode'),
  inviteCode: document.getElementById('cellInviteCode'),
  inviteButton: document.getElementById('cellInviteButton'),
  inviteLink: document.getElementById('cellInviteLink'),
  inviteAccept: document.getElementById('cellInviteAccept'),
  members: document.getElementById('cellMembers'),
  sharingStatus: document.getElementById('cellSharingStatus'),
};

const state = {
  cells: Object.create(null),
  selectedCellId: requestedCellId || '',
  lastSavedAt: '',
  pendingRender: false,
  pendingFocusSelection: requestedCellId || '',
};

let privateStore = null;
let invitations = null;
let sharingBusy = false;
const cellMembers = new Map();
let accountEpoch = 0;
let saving = false;
let formRevision = 0;
let identity = cellIdentity();

function normalizeCell(value, id) {
  const record = value && typeof value === 'object' ? value : {};
  const createdAt = String(record.createdAt || record.created || '');
  const updatedAt = String(record.updatedAt || record.updated || createdAt || '');
  const pillars = normalizeList(Array.isArray(record.pillars) ? record.pillars.join(',') : record.pillars);
  return {
    id: String(record.id || id || '').trim(),
    readOnly: Boolean(record.readOnly),
    ownerPub: String(record.ownerPub || ''),
    name: String(record.name || 'Untitled Cell').trim(),
    focus: String(record.focus || 'Cross-line organization').trim(),
    size: String(record.size || '3–15 people').trim(),
    rhythm: String(record.rhythm || 'Weekly').trim(),
    purpose: String(record.purpose || '').trim(),
    pillars,
    linkedApps: [],
    memberCount: parseMemberCount(record.size || record.memberCount || ''),
    owner: String(record.owner || record.creator || 'Guest').trim(),
    createdAt,
    updatedAt,
  };
}

function getSelectedCell() {
  return state.cells[state.selectedCellId] || null;
}

function syncPreviewFromForm() {
  if (typeof window.__updateCellPreview === 'function') {
    window.__updateCellPreview();
  }
}

function syncSubmitLabel() {
  if (!elements.submit) return;
  elements.submit.textContent = saving ? 'Saving…' : elements.cellId.value ? 'Update private Cell' : 'Save private Cell';
  elements.submit.disabled = !privateStore || saving || Boolean(getSelectedCell()?.readOnly);
  elements.inviteButton.disabled = !invitations || sharingBusy || !getSelectedCell() || Boolean(getSelectedCell()?.readOnly);
}

function populateForm(cell) {
  const defaults = window.__cellDefaults || {};
  const data = cell || {};
  elements.cellId.value = data.id || '';
  elements.cellName.value = data.name || defaults.cellName || '3dvr Builder Cell';
  elements.focus.value = data.focus || defaults.focus || 'Cross-line organization';
  elements.size.value = data.size || defaults.size || '3 people';
  elements.rhythm.value = data.rhythm || defaults.rhythm || 'Weekly';
  elements.purpose.value = data.purpose || defaults.purpose || '';
  elements.pillars.value = data.pillars && data.pillars.length
    ? data.pillars.join(', ')
    : defaults.pillars || 'support, leads, projects, coordination';
  syncPreviewFromForm();
  syncSubmitLabel();
}

function updateMetaPanel() {
  const cells = Object.values(state.cells);
  elements.cellCount.textContent = String(cells.length);
  elements.lastSavedAt.textContent = state.lastSavedAt ? formatStamp(state.lastSavedAt) : '—';
  const selected = getSelectedCell();
  elements.activeCellLabel.textContent = selected ? selected.name : 'None';
  elements.linkedAppCount.textContent = selected?.readOnly ? 'Read-only member' : 'Owner';
  renderMembers();
}

function renderCellList() {
  const query = elements.cellSearch.value.trim().toLocaleLowerCase();
  const cells = Object.values(state.cells)
    .filter(cell => cell && cell.id)
    .filter(cell => !query || [cell.name, cell.focus, cell.purpose, ...cell.pillars]
      .some(value => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => {
      const aStamp = a.updatedAt || a.createdAt || '';
      const bStamp = b.updatedAt || b.createdAt || '';
      if (aStamp !== bStamp) {
        return bStamp.localeCompare(aStamp);
      }
      return a.name.localeCompare(b.name);
    });

  elements.cellEmpty.hidden = Object.keys(state.cells).length > 0;
  elements.cellSearchStatus.textContent = query
    ? `${cells.length} matching Cells`
    : `${cells.length} Cells · no fixed group limit`;
  elements.cellList.innerHTML = cells.map(cell => {
    const active = cell.id === state.selectedCellId ? ' is-active' : '';
    const pillars = cell.pillars.slice(0, 5).map(pillar => `<span class="cell-pill">${escapeHtml(pillar)}</span>`).join('');
    const ownerLabel = cell.owner ? `Owner: ${cell.owner}` : 'Owner: Guest';
    const memberLabel = `${cell.size} target`;
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
          <span class="cell-pill">${cell.readOnly ? 'Private · read-only member' : 'Private · owner'}</span>
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
  formRevision += 1;
  elements.inviteLink.value = '';
  state.selectedCellId = id;
  const cell = state.cells[id];
  if (cell) {
    populateForm(cell);
  } else {
    syncSubmitLabel();
  }
  if (focusForm && typeof elements.cellName.focus === 'function') {
    elements.cellName.focus();
  }
  const url = new URL(window.location.href);
  url.searchParams.set('cellId', id);
  history.replaceState({}, '', url.toString());
  renderState();
}

function buildCellRecord(existing = {}) {
  const id = String(elements.cellId.value || existing.id || generateId()).trim();
  const now = new Date().toISOString();
  const pillars = normalizeList(elements.pillars.value);
  const size = String(elements.size.value || existing.size || '3–15 people').trim();
  const record = {
    id,
    name: String(elements.cellName.value || existing.name || 'Untitled Cell').trim(),
    focus: String(elements.focus.value || existing.focus || 'Cross-line organization').trim(),
    size,
    rhythm: String(elements.rhythm.value || existing.rhythm || 'Weekly').trim(),
    purpose: String(elements.purpose.value || existing.purpose || '').trim(),
    // Gun records accept scalar fields; normalizeCell restores these lists for the UI.
    pillars: pillars.join(', '),
    linkedApps: '',
    visibility: 'private',
    owner: existing.owner || (readStoredValue('username') || readStoredValue('alias') || 'Guest').trim(),
    createdAt: existing.createdAt || now,
    updatedAt: now,
    memberCount: parseMemberCount(size),
    source: 'cell-app',
  };
  return record;
}

async function saveCell(event) {
  event.preventDefault();
  if (!privateStore || saving || getSelectedCell()?.readOnly) return;
  const store = privateStore;
  const epoch = accountEpoch;
  const originalId = elements.cellId.value;
  const revision = formRevision;
  const record = buildCellRecord(state.cells[originalId] || {});
  saving = true;
  syncSubmitLabel();
  elements.cellSaveStatus.textContent = 'Encrypting and saving your private Cell…';
  try {
    const result = await store.save(record);
    if (epoch !== accountEpoch || cellIdentity() !== identity) return;
    state.cells[record.id] = normalizeCell(record, record.id);
    // A slow save must not reopen a Cell after the user starts another one.
    if (formRevision === revision && elements.cellId.value === originalId && state.selectedCellId === originalId) {
      state.selectedCellId = record.id;
      elements.cellId.value = record.id;
    }
    state.lastSavedAt = record.updatedAt;
    if (invitations) void invitations.publishCell(record).catch(error => {
      if (epoch === accountEpoch) elements.sharingStatus.textContent = `Cell saved; member updates pending: ${error.message}`;
    });
    elements.cellSaveStatus.textContent = result.pendingSync
      ? 'Saved encrypted in this browser. Account sync is pending.'
      : 'Private Cell saved encrypted. Availability on other devices is not verified.';
    renderState();
  } catch (error) {
    if (epoch === accountEpoch) elements.cellSaveStatus.textContent = error.message || 'Cell was not saved. Try again.';
  } finally {
    if (epoch === accountEpoch) { saving = false; syncSubmitLabel(); }
  }
}

function resetCellForm() {
  elements.inviteLink.value = '';
  elements.inviteCode.value = '';
  formRevision += 1;
  state.selectedCellId = '';
  state.pendingFocusSelection = '';
  elements.cellSaveStatus.textContent = '';
  elements.cellId.value = '';
  const defaults = window.__cellDefaults || {};
  elements.cellName.value = defaults.cellName || '3dvr Builder Cell';
  elements.focus.value = defaults.focus || 'Cross-line organization';
  elements.size.value = defaults.size || '3 people';
  elements.rhythm.value = defaults.rhythm || 'Weekly';
  elements.purpose.value = defaults.purpose || '';
  elements.pillars.value = defaults.pillars || 'support, leads, projects, coordination';
  syncPreviewFromForm();
  syncSubmitLabel();
  const url = new URL(window.location.href);
  url.searchParams.delete('cellId');
  url.searchParams.delete('cell');
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

async function connectPrivateCells() {
  const epoch = ++accountEpoch;
  privateStore?.close();
  invitations?.close();
  invitations = null;
  sharingBusy = false;
  cellMembers.clear();
  elements.memberCode.value = '';
  elements.inviteLink.value = '';
  elements.sharingStatus.textContent = '';
  privateStore = null;
  saving = false;
  state.cells = Object.create(null);
  state.lastSavedAt = '';
  identity = cellIdentity();
  elements.cellSearch.value = '';
  resetCellForm();
  state.pendingFocusSelection = requestedCellId;
  elements.syncStatus.textContent = 'Unlocking…';
  elements.accountStatus.textContent = 'Checking your Portal account…';
  syncSubmitLabel();
  try {
    const store = await openPrivateCellStore({
      onCell(record, id) {
        if (epoch !== accountEpoch || cellIdentity() !== identity) return;
        state.cells[id] = normalizeCell(record, id);
        if (invitations) void invitations.publishCell(record).catch(() => {});
        if (record.updatedAt > state.lastSavedAt) state.lastSavedAt = record.updatedAt;
        renderState();
        hydrateSelectedCellFromQuery();
      }
    });
    if (epoch !== accountEpoch || cellIdentity() !== identity) { store.close(); return; }
    privateStore = store;
    elements.syncStatus.textContent = 'Encrypted · sync unverified';
    elements.accountStatus.textContent = 'Private workspace unlocked. You control invitations to each Cell.';
    try {
      const sharing = await openCellInvitations({
        onMembers(cellId, grants) {
          if (epoch !== accountEpoch || cellIdentity() !== identity) return;
          cellMembers.set(cellId, grants); renderState();
          const cell = state.cells[cellId];
          if (cell && invitations) void invitations.publishCell(cell).catch(() => {});
        },
        onSharedCell(record, key) {
          if (epoch !== accountEpoch || cellIdentity() !== identity) return;
          if (record) state.cells[key] = normalizeCell({...record, id:key}, key);
          else {
            delete state.cells[key];
            if (state.selectedCellId === key) resetCellForm();
          }
          renderState();
        }
      });
      if (epoch !== accountEpoch || cellIdentity() !== identity) { sharing.close(); return; }
      invitations = sharing;
      elements.memberCode.value = await sharing.memberCode();
      for (const cell of Object.values(state.cells)) if (!cell.readOnly) void sharing.publishCell(cell).catch(() => {});
    } catch (error) {
      if (epoch === accountEpoch) elements.sharingStatus.textContent = `Invitations unavailable: ${error.message}`;
    }
  } catch (error) {
    if (epoch !== accountEpoch) return;
    elements.syncStatus.textContent = 'Locked';
    elements.accountStatus.textContent = error.message || 'Sign in to unlock your private Cells.';
  }
  syncSubmitLabel();
  renderState();
}

function renderMembers() {
  const cell = getSelectedCell();
  const grants = cellMembers.get(cell?.id) || [];
  elements.members.innerHTML = grants.map(grant => `
    <li>${escapeHtml(grant.recipientPub.slice(0, 12))}… · ${grant.revoked ? 'revoked' : 'read-only invitation'}
      ${grant.revoked ? '' : `<button type="button" class="secondary" data-copy-invite="${escapeHtml(grant.id)}">Show link</button>
      <button type="button" class="secondary" data-revoke-invite="${escapeHtml(grant.id)}">Revoke</button>`}
    </li>`).join('');
}

async function sharingAction(action) {
  if (!invitations || sharingBusy) return;
  const epoch = accountEpoch;
  sharingBusy = true; syncSubmitLabel();
  elements.sharingStatus.textContent = 'Working on the encrypted invitation…';
  try {
    const result = await action(invitations);
    if (epoch !== accountEpoch) return;
    elements.sharingStatus.textContent = result?.pendingSync
      ? 'Invitation saved encrypted here. Sync is pending; keep Cell open to retry.'
      : 'Done. Account sync is not proof the other person has received it.';
  } catch (error) {
    if (epoch === accountEpoch) elements.sharingStatus.textContent = error.message;
  } finally {
    if (epoch === accountEpoch) { sharingBusy = false; syncSubmitLabel(); }
  }
}

function checkAccount() {
  if (cellIdentity() !== identity) void connectPrivateCells();
}

elements.form.addEventListener('submit', saveCell);
document.getElementById('resetBtn').addEventListener('click', resetCellForm);
elements.form.addEventListener('input', () => { syncPreviewFromForm(); syncSubmitLabel(); });
elements.cellList.addEventListener('click', handleSelectedCellClick);
elements.cellSearch.addEventListener('input', renderState);
elements.retry.addEventListener('click', () => { void connectPrivateCells(); });
window.addEventListener('storage', checkAccount);
window.addEventListener('focus', () => { checkAccount(); void privateStore?.retryPending(); void invitations?.retryPending().catch(() => {}); });
window.addEventListener('online', () => { void privateStore?.retryPending(); void invitations?.retryPending().catch(() => {}); });
setInterval(() => { void privateStore?.retryPending(); void invitations?.retryPending().catch(() => {}); }, 30000);
setInterval(checkAccount, 1000);
void connectPrivateCells();

elements.inviteButton.addEventListener('click', () => {
  const cell = getSelectedCell();
  if (!cell || cell.readOnly) return;
  const epoch = accountEpoch;
  void sharingAction(async service => {
    const result = await service.invite(cell, elements.inviteCode.value.trim(), window.location.href);
    if (epoch === accountEpoch && getSelectedCell()?.id === cell.id) elements.inviteLink.value = result.url;
    return result;
  });
});
elements.inviteAccept.addEventListener('click', () => {
  void sharingAction(service => service.accept(window.location.href));
});
function updateInviteLocation() {
  elements.inviteAccept.hidden = !new URLSearchParams(window.location.hash.slice(1)).has('invite');
  document.getElementById('cellSignIn').href = '/auth/sign-in.html?redirect=' + encodeURIComponent('/cell/' + window.location.hash);
}
window.addEventListener('hashchange', updateInviteLocation);
updateInviteLocation();
elements.members.addEventListener('click', event => {
  const copy = event.target.closest('[data-copy-invite]');
  const revoke = event.target.closest('[data-revoke-invite]');
  if (copy && invitations) elements.inviteLink.value = invitations.link(copy.getAttribute('data-copy-invite'), window.location.href);
  if (revoke) void sharingAction(service => service.revoke(revoke.getAttribute('data-revoke-invite')));
});

async function copyInvitationField(field) {
  if (!field.value) { elements.sharingStatus.textContent = 'Unlock your account or create an invitation first.'; return; }
  try {
    await navigator.clipboard.writeText(field.value);
    elements.sharingStatus.textContent = 'Copied. Share it with the intended person.';
  } catch {
    field.focus(); field.select();
    elements.sharingStatus.textContent = 'Select and copy the highlighted text.';
  }
}
document.getElementById('copyMemberCode').addEventListener('click', () => { void copyInvitationField(elements.memberCode); });
document.getElementById('copyInvitation').addEventListener('click', () => { void copyInvitationField(elements.inviteLink); });
