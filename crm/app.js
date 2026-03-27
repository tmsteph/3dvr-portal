import {
  CRM_STATUS_OPTIONS,
  CRM_MARKET_SEGMENT_OPTIONS,
  CRM_PAIN_SEVERITY_OPTIONS,
  CRM_PILOT_STATUS_OPTIONS,
  CRM_RECORD_TYPE_OPTIONS,
  normalizeCrmRecordType,
  parseCrmList,
  sanitizeCrmRecord,
  buildCrmRelationshipBoard,
} from './crm-editing.js';

const gun = Gun(window.__GUN_PEERS__ || [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun',
]);
const user = gun.user();
const portalRoot = gun.get('3dvr-portal');
const guestsRoot = gun.get('3dvr-guests');
const crmRecords = gun.get('3dvr-crm');
const contactsWorkspace = gun.get('org-3dvr-demo');
const touchLogRoot = portalRoot.get('crm-touch-log');
const scoreManager = window.ScoreSystem && typeof window.ScoreSystem.getManager === 'function'
  ? window.ScoreSystem.getManager({ gun, user, portalRoot })
  : null;

try {
  user.recall({ sessionStorage: true, localStorage: true });
} catch (err) {
  console.warn('Unable to recall user session', err);
}

const ls = window.localStorage;
const signedIn = ls.getItem('signedIn') === 'true';
const alias = ls.getItem('alias') || '';
const password = ls.getItem('password') || '';
const contactWorkspaceIndex = Object.create(null);
const crmIndex = Object.create(null);
const touchLogIndex = new Map();
const duplicateSummaryById = new Map();
const WEEKLY_CHALLENGE_GOAL = 3;
const DEFAULT_PERSON_STATUS = 'Warm - Awareness';
const WARM_STATUS_PREFIX = 'warm -';
const focusClasses = ['ring-2', 'ring-sky-400', 'ring-offset-2', 'ring-offset-gray-900'];

const elements = {
  form: document.getElementById('contactForm'),
  list: document.getElementById('contactList'),
  filterInput: document.getElementById('filter'),
  filterAllButton: document.getElementById('filterAllRecords'),
  filterWarmButton: document.getElementById('filterWarmLeads'),
  personWorkflowFilter: document.getElementById('personWorkflowFilter'),
  totalCount: document.getElementById('totalCount'),
  visibleCount: document.getElementById('visibleCount'),
  emptyState: document.getElementById('emptyState'),
  duplicateSummary: document.getElementById('crmDuplicateSummary'),
  quickLeadForm: document.getElementById('quickLeadForm'),
  quickLeadName: document.getElementById('quickLeadName'),
  quickLeadEmail: document.getElementById('quickLeadEmail'),
  quickLeadGroupId: document.getElementById('quickLeadGroupId'),
  quickLeadPrimaryPain: document.getElementById('quickLeadPrimaryPain'),
  createOverlay: document.getElementById('crmCreateOverlay'),
  createTitle: document.getElementById('crmCreateTitle'),
  createDescription: document.querySelector('#crmCreateOverlay .space-y-1 p.text-sm.text-gray-300'),
  openCreate: document.getElementById('openCrmCreate'),
  openGroupCreate: document.getElementById('openGroupCreate'),
  openProblemCreate: document.getElementById('openProblemCreate'),
  closeCreate: document.getElementById('closeCrmCreate'),
  cancelCreate: document.getElementById('cancelCrmCreate'),
  detailOverlay: document.getElementById('crmDetailOverlay'),
  detailName: document.getElementById('crmDetailName'),
  detailSummary: document.getElementById('crmDetailSummary'),
  detailTags: document.getElementById('crmDetailTags'),
  detailNotes: document.getElementById('crmDetailNotes'),
  detailMeta: document.getElementById('crmDetailMeta'),
  detailWorkspace: document.getElementById('crmDetailWorkspace'),
  detailActions: document.getElementById('crmDetailActions'),
  closeDetail: document.getElementById('closeCrmDetail'),
  floatingName: document.getElementById('crmFloatingName'),
  floatingScore: document.getElementById('crmFloatingScore'),
  challengeWeeklyCount: document.getElementById('challengeWeeklyCount'),
  challengeWeeklyGoal: document.getElementById('challengeWeeklyGoal'),
  challengeWeeklyDetail: document.getElementById('challengeWeeklyDetail'),
  challengeProgressBar: document.getElementById('challengeProgressBar'),
  challengeRecentList: document.getElementById('challengeRecentList'),
  challengeStatus: document.getElementById('challengeStatus'),
  recordType: document.getElementById('recordType'),
  groupId: document.getElementById('groupId'),
  linkedGroupIds: document.getElementById('linkedGroupIds'),
  linkedPersonIds: document.getElementById('linkedPersonIds'),
};

const params = new URLSearchParams(window.location.search);
const state = {
  board: buildCrmRelationshipBoard([]),
  renderTimer: null,
  detailId: '',
  editingId: '',
  formMode: 'create',
  filterMode: 'all',
  focusId: (params.get('contact') || params.get('focus') || '').trim(),
  focusApplied: false,
  draftApplied: false,
  urlDraft: {
    type: normalizeCrmRecordType(params.get('type') || ''),
    name: (params.get('name') || '').trim(),
    email: (params.get('email') || '').trim(),
    groupId: (params.get('groupId') || '').trim(),
    pain: (params.get('pain') || '').trim(),
    notes: (params.get('notes') || '').trim(),
    source: (params.get('source') || '').trim(),
  },
};

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeAttr(value) {
  return safe(value).replace(/"/g, '&quot;');
}

function aliasToDisplay(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  return normalized.includes('@') ? normalized.split('@')[0] : normalized;
}

function sanitizeScoreDisplay(value) {
  if (window.ScoreSystem && typeof window.ScoreSystem.sanitizeScore === 'function') {
    return window.ScoreSystem.sanitizeScore(value);
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toActivityCount(value) {
  const numeric = Number.parseInt(value, 10);
  return Number.isNaN(numeric) ? 0 : numeric;
}

function getFieldValue(id) {
  return String(document.getElementById(id)?.value || '').trim();
}

function getSelectedValues(select) {
  if (!select) return [];
  return Array.from(select.selectedOptions || [])
    .map(option => String(option.value || '').trim())
    .filter(Boolean);
}

function renderSelectOptions(options, selectedValue = '', placeholderLabel = 'Select') {
  return (Array.isArray(options) ? options : []).map(option => {
    const value = typeof option === 'object' ? String(option.value || '') : String(option || '');
    const label = typeof option === 'object'
      ? String(option.label || option.value || placeholderLabel)
      : String(option || placeholderLabel);
    const selected = selectedValue === value ? 'selected' : '';
    return `<option value="${safeAttr(value)}" ${selected}>${safe(label)}</option>`;
  }).join('');
}

function setSelectOptions(select, options, selectedValue = '', placeholderLabel = 'Select') {
  if (!select) return;
  select.innerHTML = renderSelectOptions(options, selectedValue, placeholderLabel);
}

function setMultiSelectOptions(select, options, selectedValues = []) {
  if (!select) return;
  const selectedSet = new Set((Array.isArray(selectedValues) ? selectedValues : []).map(value => String(value || '')));
  select.innerHTML = (Array.isArray(options) ? options : []).map(option => {
    const value = typeof option === 'object' ? String(option.value || '') : String(option || '');
    const label = typeof option === 'object' ? String(option.label || option.value || '') : String(option || '');
    const selected = selectedSet.has(value) ? 'selected' : '';
    return `<option value="${safeAttr(value)}" ${selected}>${safe(label)}</option>`;
  }).join('');
}

function formatUpdated(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function timeAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function normalizeFollowUpInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return raw;
}

function getParticipantId() {
  const storedUsername = (ls.getItem('username') || '').trim();
  const storedAlias = alias.trim();
  const guestId = (ls.getItem('guestId') || '').trim();
  return storedUsername || storedAlias || guestId || 'guest';
}

function getParticipantLabel() {
  const username = (ls.getItem('username') || '').trim();
  if (username) return username;
  if (alias.trim()) return alias.trim();
  return (ls.getItem('guestDisplayName') || '').trim() || 'Guest';
}

function startOfCurrentWeek() {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + diff);
  return start;
}

function isTimestampInCurrentWeek(timestamp, weekStart = startOfCurrentWeek()) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  return date >= weekStart;
}

function renderBadgeRow(items) {
  const filtered = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!filtered.length) return '';
  return `<div class="flex flex-wrap gap-1">${filtered.map(item => `<span class="text-xs px-2 py-0.5 rounded bg-white/10 border border-white/10 text-gray-100">${safe(item)}</span>`).join('')}</div>`;
}

function renderTagRow(tags) {
  const values = String(tags || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (!values.length) return '';
  return `<div class="flex flex-wrap gap-1">${values.map(tag => `<span class="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-100">${safe(tag)}</span>`).join('')}</div>`;
}

function renderRecordChips(records) {
  const values = Array.isArray(records) ? records : [];
  if (!values.length) return '<p class="text-xs text-gray-400 mt-1">Nothing linked yet.</p>';
  return `<div class="flex flex-wrap gap-2">${values.map(record => `<button type="button" data-action="open-detail" data-record-id="${safeAttr(record.id)}" class="text-xs px-2 py-1 rounded bg-sky-950/70 border border-sky-400/20 text-sky-100 hover:bg-sky-900/80">${safe(record.name || '(untitled)')}</button>`).join('')}</div>`;
}

function buildHaystack(parts) {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function getDuplicateGroups(records) {
  const groups = new Map();
  (Array.isArray(records) ? records : []).forEach(record => {
    const rawName = String(record?.name || '').trim();
    if (!rawName) return;
    const key = rawName.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { name: rawName, items: [] });
    }
    groups.get(key).items.push(record);
  });
  return Array.from(groups.values())
    .filter(group => group.items.length > 1)
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

function primeDuplicateSummary(people) {
  duplicateSummaryById.clear();
  getDuplicateGroups(people).forEach(group => {
    group.items.forEach(record => {
      duplicateSummaryById.set(record.id, { total: group.items.length, name: group.name });
    });
  });
}

function sortByName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

function getGroupRecord(record) {
  if (!record?.groupId) return null;
  const group = state.board.index[record.groupId];
  return group && group.recordType === 'group' ? group : null;
}

function findContactInWorkspace(record) {
  if (!record || record.recordType !== 'person') return null;
  const directIds = [record.id, record.contactId].filter(Boolean);
  for (const id of directIds) {
    if (contactWorkspaceIndex[id]) {
      return { id, data: contactWorkspaceIndex[id] };
    }
  }
  for (const [contactId, data] of Object.entries(contactWorkspaceIndex)) {
    if (data?.crmId === record.id) {
      return { id: contactId, data };
    }
  }
  const email = normaliseEmail(record.email);
  if (email) {
    for (const [contactId, data] of Object.entries(contactWorkspaceIndex)) {
      if (normaliseEmail(data?.email) === email) {
        return { id: contactId, data };
      }
    }
  }
  return null;
}

function getContactButtonLabel(record) {
  return findContactInWorkspace(record) ? 'Open in contacts' : 'Add to contacts';
}

function populateStaticSelects() {
  setSelectOptions(elements.recordType, CRM_RECORD_TYPE_OPTIONS, 'person', 'Record type');
  setSelectOptions(document.getElementById('status'), CRM_STATUS_OPTIONS, DEFAULT_PERSON_STATUS, 'Status (optional)');
  setSelectOptions(document.getElementById('marketSegment'), CRM_MARKET_SEGMENT_OPTIONS, '', 'Market segment');
  setSelectOptions(document.getElementById('painSeverity'), CRM_PAIN_SEVERITY_OPTIONS, '', 'Pain severity');
  setSelectOptions(document.getElementById('pilotStatus'), CRM_PILOT_STATUS_OPTIONS, '', 'Pilot status');
}

function refreshRelationshipControls() {
  const groups = Object.values(crmIndex)
    .map(sanitizeCrmRecord)
    .filter(record => record.recordType === 'group' && String(record.id || '').trim())
    .sort(sortByName);
  const people = Object.values(crmIndex)
    .map(sanitizeCrmRecord)
    .filter(record => record.recordType === 'person' && String(record.id || '').trim())
    .sort(sortByName);

  const selectedQuickGroup = elements.quickLeadGroupId?.value || '';
  const selectedGroup = elements.groupId?.value || '';
  const selectedLinkedGroups = getSelectedValues(elements.linkedGroupIds);
  const selectedLinkedPeople = getSelectedValues(elements.linkedPersonIds);

  const groupOptions = [{ value: '', label: 'No group yet' }, ...groups.map(group => ({ value: group.id, label: group.name || '(untitled group)' }))];
  setSelectOptions(elements.quickLeadGroupId, groupOptions, selectedQuickGroup, 'No group yet');
  setSelectOptions(elements.groupId, groupOptions, selectedGroup, 'No group yet');
  setMultiSelectOptions(elements.linkedGroupIds, groups.map(group => ({ value: group.id, label: group.name || '(untitled group)' })), selectedLinkedGroups);
  setMultiSelectOptions(elements.linkedPersonIds, people.map(person => ({ value: person.id, label: person.name || person.email || '(untitled lead)' })), selectedLinkedPeople);
}

function applyCreateTypeVisibility(recordType) {
  const resolvedType = normalizeCrmRecordType(recordType);
  document.querySelectorAll('[data-create-types]').forEach(wrapper => {
    const allowed = String(wrapper.dataset.createTypes || '')
      .split(/\s+/)
      .map(value => value.trim())
      .filter(Boolean);
    const visible = allowed.includes(resolvedType);
    wrapper.classList.toggle('hidden', !visible);
    wrapper.querySelectorAll('input, select, textarea').forEach(control => {
      control.disabled = !visible;
    });
  });
}

function pruneRecordForType(record) {
  const type = normalizeCrmRecordType(record.recordType);
  const next = sanitizeCrmRecord({ ...record, recordType: type });

  if (type === 'group') {
    next.email = '';
    next.company = '';
    next.phone = '';
    next.role = '';
    next.nextFollowUp = '';
    next.primaryPain = '';
    next.painSeverity = '';
    next.currentWorkaround = '';
    next.offerAmount = '';
    next.lastSignal = '';
    next.nextExperiment = '';
    next.groupId = '';
    next.linkedGroupIds = '';
    next.linkedPersonIds = '';
    next.contactId = '';
    next.lastContacted = '';
    next.activityCount = 0;
    return next;
  }

  if (type === 'problem') {
    next.email = '';
    next.company = '';
    next.phone = '';
    next.role = '';
    next.tags = '';
    next.status = '';
    next.nextFollowUp = '';
    next.marketSegment = '';
    next.currentWorkaround = '';
    next.pilotStatus = '';
    next.groupId = '';
    next.contactId = '';
    next.lastContacted = '';
    next.activityCount = 0;
    return next;
  }

  next.linkedGroupIds = '';
  next.linkedPersonIds = '';
  next.activityCount = toActivityCount(next.activityCount);
  return next;
}

function getCreateTitle(mode, recordType) {
  const type = normalizeCrmRecordType(recordType);
  if (mode === 'edit') {
    if (type === 'group') return 'Edit group';
    if (type === 'problem') return 'Edit problem';
    return 'Edit lead';
  }
  if (type === 'group') return 'Add group';
  if (type === 'problem') return 'Log problem';
  return 'Add lead';
}

function getCreateDescription(mode, recordType) {
  const type = normalizeCrmRecordType(recordType);
  if (mode === 'edit') {
    return 'Update the record so the rest of the portal stays in sync.';
  }
  if (type === 'group') {
    return 'Create the group first, then place people under it.';
  }
  if (type === 'problem') {
    return 'Capture the pain once, then link it to the right people and groups.';
  }
  return 'Add the lead with the minimum detail you need to take the next action.';
}

function fillCreateForm(record = {}) {
  const type = normalizeCrmRecordType(record.recordType || 'person');
  elements.recordType.value = type;
  document.getElementById('name').value = record.name || '';
  document.getElementById('email').value = record.email || '';
  document.getElementById('company').value = record.company || '';
  document.getElementById('phone').value = record.phone || '';
  document.getElementById('role').value = record.role || '';
  document.getElementById('tags').value = record.tags || '';
  document.getElementById('status').value = record.status || (type === 'problem' ? '' : DEFAULT_PERSON_STATUS);
  document.getElementById('nextFollowUp').value = normalizeFollowUpInput(record.nextFollowUp || '');
  document.getElementById('marketSegment').value = record.marketSegment || '';
  document.getElementById('primaryPain').value = record.primaryPain || '';
  document.getElementById('painSeverity').value = record.painSeverity || '';
  document.getElementById('currentWorkaround').value = record.currentWorkaround || '';
  document.getElementById('pilotStatus').value = record.pilotStatus || '';
  document.getElementById('offerAmount').value = record.offerAmount || '';
  document.getElementById('lastSignal').value = record.lastSignal || '';
  document.getElementById('nextExperiment').value = record.nextExperiment || '';
  document.getElementById('notes').value = record.notes || '';
  elements.groupId.value = record.groupId || '';
  setMultiSelectOptions(elements.linkedGroupIds, Array.from(elements.linkedGroupIds.options || []).map(option => ({ value: option.value, label: option.textContent || option.value })), parseCrmList(record.linkedGroupIds));
  setMultiSelectOptions(elements.linkedPersonIds, Array.from(elements.linkedPersonIds.options || []).map(option => ({ value: option.value, label: option.textContent || option.value })), parseCrmList(record.linkedPersonIds));
  applyCreateTypeVisibility(type);
}

function openCreateOverlay({ type = 'person', record = null, preset = {} } = {}) {
  refreshRelationshipControls();
  state.formMode = record ? 'edit' : 'create';
  state.editingId = record?.id || '';
  const resolvedType = normalizeCrmRecordType(record?.recordType || preset.recordType || type);
  const nextRecord = pruneRecordForType({ ...record, ...preset, recordType: resolvedType });
  fillCreateForm(nextRecord);
  elements.createTitle.textContent = getCreateTitle(state.formMode, resolvedType);
  if (elements.createDescription) {
    elements.createDescription.textContent = getCreateDescription(state.formMode, resolvedType);
  }
  elements.createOverlay?.classList.remove('hidden');
  window.requestAnimationFrame(() => {
    const firstInput = elements.createOverlay?.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
    firstInput?.focus();
  });
}

function closeCreateOverlay({ reset = false } = {}) {
  elements.createOverlay?.classList.add('hidden');
  if (reset) {
    state.formMode = 'create';
    state.editingId = '';
    fillCreateForm({ recordType: 'person', status: DEFAULT_PERSON_STATUS });
    elements.createTitle.textContent = getCreateTitle('create', 'person');
    if (elements.createDescription) {
      elements.createDescription.textContent = getCreateDescription('create', 'person');
    }
  }
}

function buildRecordFromForm(existingRecord = {}) {
  const type = normalizeCrmRecordType(elements.recordType?.value || existingRecord.recordType || 'person');
  const groupId = type === 'person' ? String(elements.groupId?.value || '').trim() : '';
  const group = groupId ? state.board.index[groupId] : null;
  const now = new Date().toISOString();

  return pruneRecordForType({
    ...existingRecord,
    id: existingRecord.id || generateId(),
    recordType: type,
    name: getFieldValue('name'),
    email: type === 'person' ? getFieldValue('email') : '',
    company: type === 'person' ? (getFieldValue('company') || group?.name || '') : '',
    phone: type === 'person' ? getFieldValue('phone') : '',
    role: type === 'person' ? getFieldValue('role') : '',
    tags: type === 'problem' ? '' : getFieldValue('tags'),
    status: type === 'problem' ? '' : getFieldValue('status'),
    nextFollowUp: type === 'person' ? normalizeFollowUpInput(getFieldValue('nextFollowUp')) : '',
    marketSegment: type === 'problem' ? '' : getFieldValue('marketSegment'),
    primaryPain: type === 'group' ? '' : getFieldValue('primaryPain'),
    painSeverity: type === 'group' ? '' : getFieldValue('painSeverity'),
    currentWorkaround: type === 'person' ? getFieldValue('currentWorkaround') : '',
    pilotStatus: type === 'problem' ? '' : getFieldValue('pilotStatus'),
    offerAmount: type === 'group' ? '' : getFieldValue('offerAmount'),
    lastSignal: type === 'group' ? '' : getFieldValue('lastSignal'),
    nextExperiment: type === 'group' ? '' : getFieldValue('nextExperiment'),
    notes: getFieldValue('notes'),
    groupId,
    linkedGroupIds: type === 'problem' ? getSelectedValues(elements.linkedGroupIds) : [],
    linkedPersonIds: type === 'problem' ? getSelectedValues(elements.linkedPersonIds) : [],
    source: existingRecord.source || state.urlDraft.source || 'CRM workspace',
    created: existingRecord.created || now,
    updated: now,
    contactId: type === 'person' ? String(existingRecord.contactId || '').trim() : '',
    lastContacted: type === 'person' ? String(existingRecord.lastContacted || '').trim() : '',
    activityCount: type === 'person' ? toActivityCount(existingRecord.activityCount) : 0,
  });
}

function renderSection(title, description, body) {
  return `
    <section data-section class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold text-white">${safe(title)}</h3>
        <p class="text-sm text-gray-400">${safe(description)}</p>
      </div>
      <div class="space-y-4">${body}</div>
    </section>
  `;
}

function renderGroupCluster(cluster) {
  const group = cluster.group;
  const problems = cluster.linkedProblems || [];
  const haystack = buildHaystack([
    group.name,
    group.tags,
    group.status,
    group.marketSegment,
    group.pilotStatus,
    group.notes,
    ...cluster.members.map(member => member.name),
    ...problems.map(problem => problem.name),
  ]);
  const membersHtml = cluster.members.length
    ? cluster.members.map(member => renderPersonCard(member, { nested: true })).join('')
    : '<div class="ml-4 rounded-lg border border-dashed border-white/10 bg-gray-950/40 px-4 py-3 text-sm text-gray-400">No people linked yet. Use “Add lead” to place the next person under this group.</div>';

  return `
    <section class="space-y-3">
      <article class="crm-card bg-gray-900/60 border border-white/5 rounded-lg p-4" data-record-id="${safeAttr(group.id)}" data-record-type="group" data-status="${safeAttr(group.status || "")}" data-haystack="${safeAttr(haystack)}">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-3 lg:max-w-2xl">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[11px] uppercase tracking-[0.28em] rounded-full bg-sky-950/80 border border-sky-400/30 px-2 py-1 text-sky-100">Group</span>
              <h3 class="text-lg font-semibold text-white">${safe(group.name || '(untitled group)')}</h3>
            </div>
            ${renderBadgeRow([
              group.status,
              group.marketSegment,
              group.pilotStatus ? `Pilot ${group.pilotStatus}` : '',
              `${cluster.members.length} ${cluster.members.length === 1 ? 'person' : 'people'}`,
              problems.length ? `${problems.length} linked ${problems.length === 1 ? 'problem' : 'problems'}` : '',
            ])}
            ${renderTagRow(group.tags)}
            ${problems.length ? `<div class="space-y-2"><p class="text-xs uppercase tracking-[0.28em] text-sky-300">Linked problems</p>${renderRecordChips(problems)}</div>` : ''}
            ${group.notes ? `<p class="text-sm text-gray-300 whitespace-pre-line">${safe(group.notes)}</p>` : ''}
            <p class="text-xs text-gray-400">Updated ${safe(formatUpdated(group.updated || group.created))}</p>
          </div>
          <div class="flex flex-col gap-2 lg:w-44">
            <button type="button" data-action="new-member" data-record-id="${safeAttr(group.id)}" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-sm">Add lead</button>
            <button type="button" data-action="new-problem" data-record-id="${safeAttr(group.id)}" class="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-sm">Log problem</button>
            <button type="button" data-action="edit-record" data-record-id="${safeAttr(group.id)}" class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded text-sm">Edit</button>
            <button type="button" data-action="delete-record" data-record-id="${safeAttr(group.id)}" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm">Delete</button>
          </div>
        </div>
      </article>
      <div class="space-y-3 border-l border-white/10 pl-4">${membersHtml}</div>
    </section>
  `;
}

function renderPersonCard(record, { nested = false } = {}) {
  const group = getGroupRecord(record);
  const problems = (state.board.linkedProblemsByPersonId[record.id] || []).slice().sort(sortByName);
  const duplicateInfo = duplicateSummaryById.get(record.id);
  const haystack = buildHaystack([
    record.name,
    record.email,
    record.company,
    record.phone,
    record.role,
    record.tags,
    record.status,
    record.notes,
    record.marketSegment,
    record.primaryPain,
    record.painSeverity,
    record.currentWorkaround,
    record.pilotStatus,
    record.offerAmount,
    record.lastSignal,
    record.nextExperiment,
    group?.name,
    ...problems.map(problem => problem.name),
  ]);

  return `
    <article class="crm-card rounded-lg border p-4 ${nested ? 'bg-gray-950/50 border-white/10' : 'bg-gray-900/60 border-white/5'}" data-record-id="${safeAttr(record.id)}" data-record-type="person" data-status="${safeAttr(record.status || "")}" data-contact-id="${safeAttr(record.contactId || "")}" data-next-follow-up="${safeAttr(normalizeFollowUpInput(record.nextFollowUp || ""))}" data-updated-at="${safeAttr(record.updated || record.created || "")}" data-haystack="${safeAttr(haystack)}">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-3 lg:max-w-2xl">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[11px] uppercase tracking-[0.28em] rounded-full bg-emerald-950/80 border border-emerald-400/30 px-2 py-1 text-emerald-100">Person</span>
            <h3 class="text-lg font-semibold text-white">${safe(record.name || '(untitled lead)')}</h3>
            ${group ? `<button type="button" data-action="open-detail" data-record-id="${safeAttr(group.id)}" class="text-xs px-2 py-0.5 rounded bg-white/10 border border-white/10 text-gray-100">${safe(group.name || 'Group')}</button>` : ''}
          </div>
          ${renderBadgeRow([
            record.status,
            record.nextFollowUp ? `Follow-up ${record.nextFollowUp}` : '',
            record.marketSegment,
            record.painSeverity ? `Pain ${record.painSeverity}` : '',
            record.pilotStatus ? `Pilot ${record.pilotStatus}` : '',
            duplicateInfo ? `Dupes ${duplicateInfo.total}` : '',
          ])}
          ${(record.email || record.company || record.role || record.phone) ? `<p class="text-sm text-gray-300">${[
            record.email ? `<a href="mailto:${encodeURIComponent(record.email)}" class="text-sky-400 hover:underline">${safe(record.email)}</a>` : '',
            record.company ? safe(record.company) : '',
            record.role ? safe(record.role) : '',
            record.phone ? `<a href="tel:${encodeURIComponent(record.phone)}" class="text-sky-400 hover:underline">${safe(record.phone)}</a>` : '',
          ].filter(Boolean).join(' · ')}</p>` : ''}
          ${renderTagRow(record.tags)}
          ${record.primaryPain || record.currentWorkaround || record.lastSignal || record.nextExperiment ? `<p class="text-xs text-sky-100/90 rounded-lg border border-sky-400/15 bg-sky-950/40 p-3">${safe([
            record.primaryPain ? `Pain: ${record.primaryPain}` : '',
            record.currentWorkaround ? `Workaround: ${record.currentWorkaround}` : '',
            record.lastSignal ? `Last signal: ${record.lastSignal}` : '',
            record.nextExperiment ? `Next: ${record.nextExperiment}` : '',
          ].filter(Boolean).join(' · '))}</p>` : ''}
          ${problems.length ? `<div class="space-y-2"><p class="text-xs uppercase tracking-[0.28em] text-sky-300">Problems</p>${renderRecordChips(problems)}</div>` : ''}
          ${record.notes ? `<p class="text-sm text-gray-300 whitespace-pre-line">${safe(record.notes)}</p>` : ''}
          <div class="grid gap-1 text-xs text-gray-400 sm:grid-cols-2">
            <div>Last contacted: ${record.lastContacted ? safe(timeAgo(record.lastContacted)) : '—'}</div>
            <div>Touches: ${safe(String(toActivityCount(record.activityCount)))}</div>
            <div>Group: ${group ? safe(group.name || 'Group') : '—'}</div>
            <div>Updated ${safe(formatUpdated(record.updated || record.created))}</div>
          </div>
        </div>
        <div class="flex flex-col gap-2 lg:w-44">
          <button type="button" data-action="ensure-contact" data-record-id="${safeAttr(record.id)}" class="bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 rounded text-sm">${safe(getContactButtonLabel(record))}</button>
          <button type="button" data-action="log-touch" data-record-id="${safeAttr(record.id)}" class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Log touch</button>
          <button type="button" data-action="quick-follow-up" data-record-id="${safeAttr(record.id)}" class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-sm">+7d follow-up</button>
          <button type="button" data-action="edit-record" data-record-id="${safeAttr(record.id)}" class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded text-sm">Edit</button>
          <button type="button" data-action="delete-record" data-record-id="${safeAttr(record.id)}" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function renderProblemCard(record) {
  const linkedGroups = (state.board.linkedGroupsByProblemId[record.id] || []).slice().sort(sortByName);
  const linkedPeople = (state.board.linkedPeopleByProblemId[record.id] || []).slice().sort(sortByName);
  const haystack = buildHaystack([
    record.name,
    record.primaryPain,
    record.painSeverity,
    record.offerAmount,
    record.lastSignal,
    record.nextExperiment,
    record.notes,
    ...linkedGroups.map(group => group.name),
    ...linkedPeople.map(person => person.name),
  ]);

  return `
    <article class="crm-card bg-gray-900/60 border border-white/5 rounded-lg p-4" data-record-id="${safeAttr(record.id)}" data-record-type="problem" data-status="" data-haystack="${safeAttr(haystack)}">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-3 lg:max-w-2xl">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[11px] uppercase tracking-[0.28em] rounded-full bg-rose-950/80 border border-rose-400/30 px-2 py-1 text-rose-100">Problem</span>
            <h3 class="text-lg font-semibold text-white">${safe(record.name || '(untitled problem)')}</h3>
          </div>
          ${renderBadgeRow([
            record.painSeverity ? `Pain ${record.painSeverity}` : '',
            linkedGroups.length ? `${linkedGroups.length} ${linkedGroups.length === 1 ? 'group' : 'groups'}` : '',
            linkedPeople.length ? `${linkedPeople.length} ${linkedPeople.length === 1 ? 'person' : 'people'}` : '',
            record.offerAmount ? `Impact ${record.offerAmount}` : '',
          ])}
          ${record.primaryPain && record.primaryPain !== record.name ? `<p class="text-sm text-gray-300">${safe(record.primaryPain)}</p>` : ''}
          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.28em] text-sky-300">Linked groups</p>
            ${renderRecordChips(linkedGroups)}
          </div>
          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.28em] text-sky-300">Linked people</p>
            ${renderRecordChips(linkedPeople)}
          </div>
          ${record.notes ? `<p class="text-sm text-gray-300 whitespace-pre-line">${safe(record.notes)}</p>` : ''}
          <p class="text-xs text-gray-400">Updated ${safe(formatUpdated(record.updated || record.created))}</p>
        </div>
        <div class="flex flex-col gap-2 lg:w-44">
          <button type="button" data-action="edit-record" data-record-id="${safeAttr(record.id)}" class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded text-sm">Edit</button>
          <button type="button" data-action="delete-record" data-record-id="${safeAttr(record.id)}" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function updateDuplicateSummary() {
  if (!elements.duplicateSummary) return;
  const groups = getDuplicateGroups(state.board.people);
  if (!groups.length) {
    elements.duplicateSummary.classList.add('hidden');
    elements.duplicateSummary.innerHTML = '';
    return;
  }

  elements.duplicateSummary.classList.remove('hidden');
  elements.duplicateSummary.innerHTML = `
    <p class="text-xs uppercase tracking-[0.32em] text-amber-200/70">Possible duplicates</p>
    <ul class="mt-2 space-y-1 text-sm text-amber-100/90">${groups.slice(0, 5).map(group => `<li class="list-disc list-inside">${safe(group.name)} — ${safe(String(group.items.length))} records</li>`).join('')}</ul>
  `;
}

function updateCounts(total, visible) {
  if (elements.totalCount) elements.totalCount.textContent = String(total);
  if (elements.visibleCount) elements.visibleCount.textContent = String(visible);
  if (!elements.emptyState) return;
  if (total === 0) {
    elements.emptyState.textContent = 'No records yet. Add a group, lead, or problem to get started.';
    elements.emptyState.classList.remove('hidden');
  } else if (visible === 0) {
    elements.emptyState.textContent = 'No records match this filter yet.';
    elements.emptyState.classList.remove('hidden');
  } else {
    elements.emptyState.classList.add('hidden');
  }
}

function isWarmLeadStatus(status) {
  return String(status || '').trim().toLowerCase().startsWith(WARM_STATUS_PREFIX);
}

function updateFilterButtons() {
  const isWarm = state.filterMode === 'warm';
  if (elements.filterAllButton) {
    elements.filterAllButton.classList.toggle('bg-sky-600', !isWarm);
    elements.filterAllButton.classList.toggle('text-white', !isWarm);
    elements.filterAllButton.classList.toggle('bg-white/10', isWarm);
    elements.filterAllButton.classList.toggle('text-gray-200', isWarm);
  }
  if (elements.filterWarmButton) {
    elements.filterWarmButton.classList.toggle('bg-sky-600', isWarm);
    elements.filterWarmButton.classList.toggle('text-white', isWarm);
    elements.filterWarmButton.classList.toggle('bg-white/10', !isWarm);
    elements.filterWarmButton.classList.toggle('text-gray-200', !isWarm);
  }
}

function setFilterMode(mode) {
  const normalized = mode === 'warm' ? 'warm' : 'all';
  if (state.filterMode === normalized) {
    return;
  }
  state.filterMode = normalized;
  updateFilterButtons();
  applyFilter();
}

function applyFocusHighlight() {
  if (!state.focusId) return;
  const cards = elements.list?.querySelectorAll('.crm-card[data-record-id]') || [];
  cards.forEach(card => {
    focusClasses.forEach(cls => card.classList.remove(cls));
  });
  const target = elements.list?.querySelector(`.crm-card[data-record-id="${CSS.escape(state.focusId)}"]`);
  if (!target) return;
  focusClasses.forEach(cls => target.classList.add(cls));
  if (!state.focusApplied) {
    state.focusApplied = true;
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }
}

function applyFilter() {
  const query = String(elements.filterInput?.value || '').trim().toLowerCase();
  const workflowFilter = String(elements.personWorkflowFilter?.value || '');
  const warmOnly = state.filterMode === 'warm';
  const cards = Array.from(elements.list?.querySelectorAll('.crm-card[data-haystack]') || []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let visible = 0;

  cards.forEach(card => {
    const haystackMiss = Boolean(query) && !String(card.dataset.haystack || '').includes(query);
    const status = String(card.dataset.status || '');
    const recordType = String(card.dataset.recordType || '');
    const warmMiss = warmOnly && (recordType !== 'person' || !isWarmLeadStatus(status));

    let workflowMiss = false;
    if (workflowFilter) {
      if (recordType !== 'person') {
        workflowMiss = true;
      } else {
        const contactId = String(card.dataset.contactId || '').trim();
        const nextFollowUpRaw = String(card.dataset.nextFollowUp || '').trim();
        const updatedAtRaw = String(card.dataset.updatedAt || '').trim();
        const nextFollowUp = nextFollowUpRaw ? new Date(`${nextFollowUpRaw}T00:00:00`) : null;
        const updatedAt = updatedAtRaw ? new Date(updatedAtRaw) : null;

        if (workflowFilter === 'linked') workflowMiss = !contactId;
        if (workflowFilter === 'unlinked') workflowMiss = Boolean(contactId);
        if (workflowFilter === 'none') workflowMiss = Boolean(nextFollowUp);
        if (workflowFilter === 'overdue') workflowMiss = !nextFollowUp || nextFollowUp >= today;
        if (workflowFilter === 'week') {
          if (!nextFollowUp) {
            workflowMiss = true;
          } else {
            const end = new Date(today);
            end.setDate(end.getDate() + 7);
            workflowMiss = !(nextFollowUp >= today && nextFollowUp <= end);
          }
        }
        if (workflowFilter === 'stale-14') {
          if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
            workflowMiss = true;
          } else {
            const staleCutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
            workflowMiss = updatedAt.getTime() > staleCutoff;
          }
        }
      }
    }

    const hidden = haystackMiss || warmMiss || workflowMiss;
    card.classList.toggle('hidden', hidden);
    if (!hidden) visible += 1;
  });

  Array.from(elements.list?.querySelectorAll('[data-section]') || []).forEach(section => {
    const visibleCards = section.querySelectorAll('.crm-card[data-haystack]:not(.hidden)').length;
    section.classList.toggle('hidden', visibleCards === 0);
  });

  updateCounts(Object.keys(state.board.index).length, visible);
  updateDuplicateSummary();
  applyFocusHighlight();
}

function renderList() {
  const records = Object.values(crmIndex)
    .map(sanitizeCrmRecord)
    .filter(record => String(record.id || '').trim());
  state.board = buildCrmRelationshipBoard(records);
  refreshRelationshipControls();
  primeDuplicateSummary(state.board.people);

  const sections = [];
  if (state.board.groups.length) {
    sections.push(renderSection('Groups', 'Accounts first. Keep the people nested under the right group.', state.board.groups.map(renderGroupCluster).join('')));
  }
  if (state.board.standalonePeople.length) {
    sections.push(renderSection('Ungrouped leads', 'People you have not attached to a group yet.', state.board.standalonePeople.map(record => renderPersonCard(record)).join('')));
  }
  if (state.board.problems.length) {
    sections.push(renderSection('Problems', 'Track the pains that connect back to groups and people.', state.board.problems.map(renderProblemCard).join('')));
  }

  elements.list.innerHTML = sections.join('');
  applyFilter();
}

function putCrmRecord(record) {
  return new Promise((resolve, reject) => {
    crmRecords.get(record.id).put(record, ack => {
      if (ack && ack.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      resolve(record);
    });
  });
}

function putContactRecord(id, payload) {
  return new Promise((resolve, reject) => {
    contactsWorkspace.get(id).put(payload, ack => {
      if (ack && ack.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      resolve(payload);
    });
  });
}

function deleteCrmRecord(id) {
  return new Promise((resolve, reject) => {
    crmRecords.get(id).put(null, ack => {
      if (ack && ack.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      resolve();
    });
  });
}

async function ensureContact(recordId) {
  const record = sanitizeCrmRecord(crmIndex[recordId] || state.board.index[recordId] || {});
  if (!record.id || record.recordType !== 'person') {
    window.alert('Only person records can sync to contacts.');
    return;
  }

  const now = new Date().toISOString();
  const existing = findContactInWorkspace(record);
  if (existing) {
    if (existing.data?.crmId !== record.id) {
      await putContactRecord(existing.id, {
        ...existing.data,
        crmId: record.id,
        syncedFromCrmAt: now,
        updated: now,
      });
    }
    await putCrmRecord({
      ...record,
      contactId: existing.id,
      syncedToContactsAt: now,
      updated: now,
      created: record.created || now,
    });
    openContactsWorkspace(existing.id);
    return;
  }

  const contactId = record.contactId && !contactWorkspaceIndex[record.contactId]
    ? record.contactId
    : generateId();
  await putContactRecord(contactId, {
    id: contactId,
    name: record.name || '',
    email: record.email || '',
    phone: record.phone || '',
    company: record.company || '',
    role: record.role || '',
    tags: record.tags || '',
    status: record.status || '',
    nextFollowUp: record.nextFollowUp || '',
    notes: record.notes || '',
    created: record.created || now,
    updated: now,
    lastContacted: record.lastContacted || '',
    activityCount: toActivityCount(record.activityCount),
    crmId: record.id,
    source: record.source || 'CRM workspace',
    syncedFromCrmAt: now,
  });
  await putCrmRecord({
    ...record,
    contactId,
    syncedToContactsAt: now,
    updated: now,
    created: record.created || now,
  });
  openContactsWorkspace(contactId);
}

function openContactsWorkspace(contactId) {
  const url = new URL('../contacts/index.html', window.location.href);
  url.searchParams.set('space', 'org-3dvr');
  if (contactId) {
    url.searchParams.set('contact', contactId);
  }
  window.location.href = url.toString();
}

function openTouchPrompt(record) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm px-4 py-8 overflow-y-auto flex items-start justify-center';
    overlay.innerHTML = `
      <div class="w-full max-w-xl bg-gray-900/95 border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4" role="dialog" aria-modal="true">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.32em] text-amber-300">Log touch</p>
            <h3 class="text-xl font-semibold text-white">${safe(record.name || record.email || 'Unnamed contact')}</h3>
            <p class="text-sm text-gray-300">Capture quick context now or leave blank to add later.</p>
          </div>
          <button type="button" class="text-sm text-gray-300 hover:text-white" data-touch-cancel>Cancel</button>
        </div>
        <form data-touch-form class="space-y-4">
          <div class="space-y-2">
            <label class="block text-sm text-gray-200">Any notes about this touch?</label>
            <textarea data-touch-note class="w-full p-2 rounded text-black" rows="3" placeholder="Add quick notes (optional)"></textarea>
          </div>
          <div class="space-y-2">
            <label class="block text-sm text-gray-200">Schedule the next touch</label>
            <input data-touch-follow-up type="date" class="w-full p-2 rounded text-black" />
            <button type="button" data-touch-clear-follow class="text-xs text-sky-300 hover:text-sky-200">Skip follow-up date</button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="submit" class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded text-sm">Log touch</button>
            <button type="button" data-touch-skip class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm">Log without updates</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('[data-touch-form]');
    const noteInput = overlay.querySelector('[data-touch-note]');
    const followInput = overlay.querySelector('[data-touch-follow-up]');
    if (followInput && record.nextFollowUp) {
      followInput.value = normalizeFollowUpInput(record.nextFollowUp);
    }

    function close(result) {
      overlay.remove();
      resolve(result);
    }

    overlay.addEventListener('click', event => {
      if (event.target === overlay) close(null);
    });
    overlay.querySelector('[data-touch-cancel]')?.addEventListener('click', () => close(null));
    overlay.querySelector('[data-touch-clear-follow]')?.addEventListener('click', event => {
      event.preventDefault();
      if (followInput) followInput.value = '';
    });
    overlay.querySelector('[data-touch-skip]')?.addEventListener('click', event => {
      event.preventDefault();
      close({ notes: '', followUp: '' });
    });
    form?.addEventListener('submit', event => {
      event.preventDefault();
      close({
        notes: noteInput ? noteInput.value.trim() : '',
        followUp: followInput ? followInput.value : '',
      });
    });
  });
}

async function logTouch(recordId) {
  const record = sanitizeCrmRecord(crmIndex[recordId] || state.board.index[recordId] || {});
  if (!record.id || record.recordType !== 'person') {
    window.alert('Only person records can log touches.');
    return;
  }

  const promptResult = await openTouchPrompt(record);
  if (!promptResult) return;

  const now = new Date().toISOString();
  const followUp = normalizeFollowUpInput(promptResult.followUp || record.nextFollowUp || '');
  const touchNotes = String(promptResult.notes || '').trim();
  const notePrefix = touchNotes ? `[Touch ${new Date(now).toLocaleString()}] ${touchNotes}` : '';
  const mergedNotes = notePrefix
    ? (record.notes ? `${record.notes}\n\n${notePrefix}` : notePrefix)
    : record.notes || '';

  await putCrmRecord(pruneRecordForType({
    ...record,
    id: recordId,
    lastContacted: now,
    activityCount: toActivityCount(record.activityCount) + 1,
    nextFollowUp: followUp || record.nextFollowUp || '',
    notes: mergedNotes,
    updated: now,
    created: record.created || now,
  }));

  const logId = `${recordId}-${Date.now()}`;
  const entry = {
    id: logId,
    recordId: record.contactId || record.id || recordId,
    contactName: record.name || record.email || 'Unnamed contact',
    timestamp: now,
    followUp: followUp || record.nextFollowUp || '',
    note: touchNotes,
    participantId: getParticipantId(),
    loggedBy: getParticipantLabel(),
  };
  touchLogRoot.get(logId).put(entry);
  touchLogIndex.set(logId, entry);
  renderWeeklyChallenge();
  if (scoreManager) scoreManager.increment(1);
}

function quickFollowUp(recordId) {
  const record = sanitizeCrmRecord(crmIndex[recordId] || state.board.index[recordId] || {});
  if (!record.id || record.recordType !== 'person') {
    window.alert('Only person records can get follow-up dates.');
    return;
  }

  const base = record.nextFollowUp ? new Date(record.nextFollowUp) : new Date();
  if (Number.isNaN(base.getTime())) {
    base.setTime(Date.now());
  }
  base.setDate(base.getDate() + 7);
  putCrmRecord(pruneRecordForType({
    ...record,
    id: recordId,
    nextFollowUp: base.toISOString().slice(0, 10),
    updated: new Date().toISOString(),
    created: record.created || new Date().toISOString(),
  })).catch(err => {
    console.error('Unable to set follow-up', err);
  });
}

function buildDetailSummary(record, context) {
  if (record.recordType === 'group') {
    return [
      'Group account',
      `${context.members.length} ${context.members.length === 1 ? 'person' : 'people'}`,
      context.linkedProblems.length ? `${context.linkedProblems.length} linked problems` : '',
    ].filter(Boolean).join(' · ');
  }

  if (record.recordType === 'problem') {
    return [
      'Problem record',
      context.linkedGroups.length ? `${context.linkedGroups.length} linked groups` : '',
      context.linkedPeople.length ? `${context.linkedPeople.length} linked people` : '',
    ].filter(Boolean).join(' · ');
  }

  return [
    record.email ? `<a class="underline hover:no-underline" href="mailto:${encodeURIComponent(record.email)}">${safe(record.email)}</a>` : '',
    record.role ? safe(record.role) : '',
    record.company ? safe(record.company) : '',
    record.phone ? `<a class="underline hover:no-underline" href="tel:${encodeURIComponent(record.phone)}">${safe(record.phone)}</a>` : '',
    context.group ? `Group: ${safe(context.group.name || 'Group')}` : '',
  ].filter(Boolean).join(' · ') || 'Person lead';
}

function buildDetailMeta(record, context) {
  const rows = record.recordType === 'group'
    ? [
      ['Type', 'Group'],
      ['Status', record.status || '—'],
      ['Market segment', record.marketSegment || '—'],
      ['Pilot status', record.pilotStatus || '—'],
      ['People linked', context.members.length],
      ['Problems linked', context.linkedProblems.length],
      ['Created', record.created ? new Date(record.created).toLocaleString() : '—'],
      ['Updated', record.updated ? new Date(record.updated).toLocaleString() : '—'],
    ]
    : record.recordType === 'problem'
    ? [
      ['Type', 'Problem'],
      ['Primary pain', record.primaryPain || '—'],
      ['Pain severity', record.painSeverity || '—'],
      ['Offer amount', record.offerAmount || '—'],
      ['Last signal', record.lastSignal || '—'],
      ['Next experiment', record.nextExperiment || '—'],
      ['Linked groups', context.linkedGroups.length],
      ['Linked people', context.linkedPeople.length],
      ['Created', record.created ? new Date(record.created).toLocaleString() : '—'],
      ['Updated', record.updated ? new Date(record.updated).toLocaleString() : '—'],
    ]
    : [
      ['Type', 'Person'],
      ['Status', record.status || '—'],
      ['Group', context.group?.name || '—'],
      ['Market segment', record.marketSegment || '—'],
      ['Primary pain', record.primaryPain || '—'],
      ['Pain severity', record.painSeverity || '—'],
      ['Current workaround', record.currentWorkaround || '—'],
      ['Pilot status', record.pilotStatus || '—'],
      ['Offer amount', record.offerAmount || '—'],
      ['Last signal', record.lastSignal || '—'],
      ['Next experiment', record.nextExperiment || '—'],
      ['Next follow-up', record.nextFollowUp || '—'],
      ['Last contacted', record.lastContacted ? `${timeAgo(record.lastContacted)} · ${new Date(record.lastContacted).toLocaleString()}` : '—'],
      ['Touches', toActivityCount(record.activityCount)],
      ['Created', record.created ? new Date(record.created).toLocaleString() : '—'],
      ['Updated', record.updated ? new Date(record.updated).toLocaleString() : '—'],
    ];

  return rows.map(([label, value]) => `
    <div class="flex justify-between gap-3">
      <span class="text-gray-400">${safe(String(label))}</span>
      <span class="font-medium text-white/90 text-right">${safe(String(value))}</span>
    </div>
  `).join('');
}

function buildDetailWorkspace(record, context) {
  if (record.recordType === 'group') {
    return `
      <div class="space-y-3 rounded-lg border border-white/10 bg-gray-800/80 p-4">
        <div>
          <p class="text-sm font-semibold text-gray-100">People under this group</p>
          ${renderRecordChips(context.members)}
        </div>
        <div>
          <p class="text-sm font-semibold text-gray-100">Problems linked here</p>
          ${renderRecordChips(context.linkedProblems)}
        </div>
      </div>
    `;
  }

  if (record.recordType === 'problem') {
    return `
      <div class="space-y-3 rounded-lg border border-white/10 bg-gray-800/80 p-4">
        <div>
          <p class="text-sm font-semibold text-gray-100">Linked groups</p>
          ${renderRecordChips(context.linkedGroups)}
        </div>
        <div>
          <p class="text-sm font-semibold text-gray-100">Linked people</p>
          ${renderRecordChips(context.linkedPeople)}
        </div>
      </div>
    `;
  }

  const workspaceMatch = findContactInWorkspace(record);
  return `
    <div class="space-y-3">
      <div class="rounded-lg border ${workspaceMatch ? 'border-teal-500/30 bg-teal-900/40' : 'border-white/10 bg-gray-800/80'} p-4">
        <p class="text-sm font-semibold ${workspaceMatch ? 'text-teal-200' : 'text-gray-100'}">${workspaceMatch ? 'Linked contacts entry' : 'No linked contact yet'}</p>
        <p class="text-xs mt-1 ${workspaceMatch ? 'text-teal-100/80' : 'text-gray-400'}">${workspaceMatch ? safe(workspaceMatch.data?.name || '(untitled contact)') : 'Use “Add to contacts” to place this person in the shared contacts workspace.'}</p>
      </div>
      <div class="rounded-lg border border-white/10 bg-gray-800/80 p-4">
        <p class="text-sm font-semibold text-gray-100">Problems linked to this person</p>
        ${renderRecordChips(context.linkedProblems)}
      </div>
    </div>
  `;
}

function buildDetailActions(record) {
  if (record.recordType === 'group') {
    return `
      <button data-action="new-member" data-record-id="${safeAttr(record.id)}" class="bg-blue-500 hover:bg-blue-600 text-white text-sm px-3 py-1.5 rounded">Add lead</button>
      <button data-action="new-problem" data-record-id="${safeAttr(record.id)}" class="bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded">Log problem</button>
      <button data-action="edit-record" data-record-id="${safeAttr(record.id)}" class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-3 py-1.5 rounded">Edit</button>
      <button data-action="delete-record" data-record-id="${safeAttr(record.id)}" class="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1.5 rounded">Delete</button>
    `;
  }

  if (record.recordType === 'problem') {
    return `
      <button data-action="edit-record" data-record-id="${safeAttr(record.id)}" class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-3 py-1.5 rounded">Edit</button>
      <button data-action="delete-record" data-record-id="${safeAttr(record.id)}" class="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1.5 rounded">Delete</button>
    `;
  }

  return `
    <button data-action="ensure-contact" data-record-id="${safeAttr(record.id)}" class="bg-teal-600 hover:bg-teal-500 text-white text-sm px-3 py-1.5 rounded">${safe(getContactButtonLabel(record))}</button>
    <button data-action="log-touch" data-record-id="${safeAttr(record.id)}" class="bg-indigo-500 hover:bg-indigo-600 text-white text-sm px-3 py-1.5 rounded">Log touch</button>
    <button data-action="quick-follow-up" data-record-id="${safeAttr(record.id)}" class="bg-amber-500 hover:bg-amber-600 text-white text-sm px-3 py-1.5 rounded">+7d follow-up</button>
    <button data-action="edit-record" data-record-id="${safeAttr(record.id)}" class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-3 py-1.5 rounded">Edit</button>
    <button data-action="delete-record" data-record-id="${safeAttr(record.id)}" class="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1.5 rounded">Delete</button>
  `;
}

function openDetail(recordId) {
  const record = sanitizeCrmRecord(crmIndex[recordId] || state.board.index[recordId] || {});
  if (!record.id) return;

  const context = record.recordType === 'group'
    ? {
      members: state.board.groups.find(entry => entry.group.id === record.id)?.members || [],
      linkedProblems: state.board.groups.find(entry => entry.group.id === record.id)?.linkedProblems || [],
      linkedGroups: [],
      linkedPeople: [],
      group: null,
    }
    : record.recordType === 'problem'
    ? {
      members: [],
      linkedProblems: [],
      linkedGroups: state.board.linkedGroupsByProblemId[record.id] || [],
      linkedPeople: state.board.linkedPeopleByProblemId[record.id] || [],
      group: null,
    }
    : {
      members: [],
      linkedProblems: state.board.linkedProblemsByPersonId[record.id] || [],
      linkedGroups: [],
      linkedPeople: [],
      group: getGroupRecord(record),
    };

  state.detailId = recordId;
  elements.detailName.textContent = record.name || '(untitled record)';
  elements.detailSummary.innerHTML = buildDetailSummary(record, context);
  if (record.tags) {
    elements.detailTags.innerHTML = renderTagRow(record.tags);
    elements.detailTags.classList.remove('hidden');
  } else {
    elements.detailTags.innerHTML = '';
    elements.detailTags.classList.add('hidden');
  }
  if (record.notes) {
    elements.detailNotes.innerHTML = `<div class="bg-gray-800/70 border border-white/10 rounded-lg p-3 text-sm text-gray-200 whitespace-pre-wrap">${safe(record.notes)}</div>`;
    elements.detailNotes.classList.remove('hidden');
  } else {
    elements.detailNotes.innerHTML = '';
    elements.detailNotes.classList.add('hidden');
  }
  elements.detailMeta.innerHTML = buildDetailMeta(record, context);
  elements.detailWorkspace.innerHTML = buildDetailWorkspace(record, context);
  elements.detailActions.innerHTML = buildDetailActions(record);
  elements.detailOverlay?.classList.remove('hidden');
  elements.detailOverlay.scrollTop = 0;
}

function closeDetail() {
  state.detailId = '';
  elements.detailOverlay?.classList.add('hidden');
}

function renderRecentTouchList(entries) {
  if (!elements.challengeRecentList) return;
  if (!entries.length) {
    elements.challengeRecentList.innerHTML = '<p class="text-gray-400">Logs will appear after you click “Log touch” on a CRM lead.</p>';
    return;
  }

  elements.challengeRecentList.innerHTML = entries
    .slice()
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    .slice(0, 5)
    .map(entry => `
      <div class="bg-gray-900/60 border border-white/5 rounded-lg p-3">
        <div class="flex flex-wrap justify-between text-sm text-gray-200">
          <span class="font-semibold">${safe(entry.contactName || 'Unnamed contact')}</span>
          <span class="text-xs text-gray-400">${safe(entry.timestamp ? timeAgo(entry.timestamp) : 'Unknown time')}</span>
        </div>
        <p class="text-xs text-gray-300 mt-1">Next follow-up: ${safe(entry.followUp || 'Not scheduled')}</p>
        ${entry.note ? `<p class="text-xs text-gray-200 mt-2 whitespace-pre-line">Touch notes: ${safe(entry.note)}</p>` : ''}
        <p class="text-xs text-gray-400">Logged by ${safe(entry.loggedBy || entry.participantId || 'Unknown')}</p>
      </div>
    `).join('');
}

function renderWeeklyChallenge() {
  if (elements.challengeWeeklyGoal) {
    elements.challengeWeeklyGoal.textContent = String(WEEKLY_CHALLENGE_GOAL);
  }
  if (!elements.challengeWeeklyCount || !elements.challengeProgressBar || !elements.challengeWeeklyDetail) return;

  const weekStart = startOfCurrentWeek();
  const participantId = getParticipantId();
  const entries = Array.from(touchLogIndex.values()).filter(entry => {
    if (!entry?.timestamp) return false;
    const matchesOwner = !entry.participantId || entry.participantId === participantId;
    return matchesOwner && isTimestampInCurrentWeek(entry.timestamp, weekStart);
  });

  const count = entries.length;
  const remaining = Math.max(0, WEEKLY_CHALLENGE_GOAL - count);
  const percent = Math.min(100, Math.round((count / WEEKLY_CHALLENGE_GOAL) * 100));
  elements.challengeWeeklyCount.textContent = String(count);
  elements.challengeProgressBar.style.width = `${percent}%`;
  elements.challengeWeeklyDetail.textContent = count >= WEEKLY_CHALLENGE_GOAL ? 'Goal met—keep going.' : `${remaining} to go this week`;
  if (elements.challengeStatus) {
    elements.challengeStatus.textContent = count >= WEEKLY_CHALLENGE_GOAL ? 'On track' : 'Keep going';
    elements.challengeStatus.classList.toggle('bg-emerald-600/40', count >= WEEKLY_CHALLENGE_GOAL);
    elements.challengeStatus.classList.toggle('bg-white/10', count < WEEKLY_CHALLENGE_GOAL);
  }
  renderRecentTouchList(entries);
}

function startIdentityBadge() {
  if (!elements.floatingName || !elements.floatingScore) return;
  const isGuest = !signedIn && ls.getItem('guest') === 'true';
  let latestDisplayName = '';
  let aliasDisplay = aliasToDisplay(alias);

  function updateName() {
    let display = '';
    if (latestDisplayName) {
      display = latestDisplayName;
    } else if (signedIn) {
      display = (ls.getItem('username') || '').trim() || aliasDisplay || 'Guest';
    } else if (isGuest) {
      display = (ls.getItem('guestDisplayName') || '').trim() || aliasDisplay || 'Guest';
    } else {
      display = aliasDisplay || 'Guest';
    }
    elements.floatingName.textContent = `👤 ${display}`;
  }

  function updateScore(value) {
    elements.floatingScore.textContent = `⭐ ${sanitizeScoreDisplay(value)}`;
  }

  updateName();
  updateScore(scoreManager ? scoreManager.getCurrent() : 0);
  if (scoreManager) scoreManager.subscribe(updateScore);

  if (signedIn) {
    try {
      user.get('alias').on(value => {
        aliasDisplay = aliasToDisplay(value);
        updateName();
      });
      user.get('username').on(value => {
        const normalized = typeof value === 'string' ? value.trim() : '';
        latestDisplayName = normalized;
        if (normalized) {
          ls.setItem('username', normalized);
        }
        updateName();
      });
    } catch (err) {
      console.warn('Failed to bind signed-in identity listeners', err);
    }
  } else if (isGuest) {
    const guestId = (ls.getItem('guestId') || '').trim();
    if (guestId) {
      try {
        guestsRoot.get(guestId).get('username').on(value => {
          const normalized = typeof value === 'string' ? value.trim() : '';
          latestDisplayName = normalized;
          if (normalized) {
            ls.setItem('guestDisplayName', normalized);
          }
          updateName();
        });
      } catch (err) {
        console.warn('Failed to bind guest identity listener', err);
      }
    }
  }
}

function scheduleRender() {
  window.clearTimeout(state.renderTimer);
  state.renderTimer = window.setTimeout(() => {
    state.renderTimer = null;
    renderList();
  }, 40);
}

function applyUrlDraftIfNeeded() {
  if (state.draftApplied) return;
  const draft = state.urlDraft;
  const hasDraft = params.has('type') || Boolean(draft.name || draft.email || draft.groupId || draft.pain || draft.notes);
  if (!hasDraft) return;
  state.draftApplied = true;
  openCreateOverlay({
    type: draft.type || 'person',
    preset: {
      recordType: draft.type || 'person',
      name: draft.name,
      email: draft.email,
      groupId: draft.groupId,
      primaryPain: draft.pain,
      notes: draft.notes,
      source: draft.source,
    },
  });
}

async function handleCreateSubmit(event) {
  event.preventDefault();
  const existing = state.editingId ? sanitizeCrmRecord(crmIndex[state.editingId] || {}) : {};
  const record = buildRecordFromForm(existing);
  if (!record.name) {
    window.alert('Add a name or problem title first.');
    document.getElementById('name')?.focus();
    return;
  }

  try {
    await putCrmRecord(record);
    state.focusId = record.id;
    state.focusApplied = false;
    if (scoreManager) {
      scoreManager.increment(state.formMode === 'edit' ? 1 : 10);
    }
    closeCreateOverlay({ reset: true });
  } catch (err) {
    console.error('Unable to save CRM record', err);
    window.alert('Unable to save this CRM record right now.');
  }
}

async function handleQuickLeadSubmit(event) {
  event.preventDefault();
  const name = String(elements.quickLeadName?.value || '').trim();
  if (!name) {
    elements.quickLeadName?.focus();
    return;
  }

  const now = new Date().toISOString();
  const id = generateId();
  const groupId = String(elements.quickLeadGroupId?.value || '').trim();
  const group = groupId ? state.board.index[groupId] : null;
  const pain = String(elements.quickLeadPrimaryPain?.value || '').trim();

  try {
    await putCrmRecord(pruneRecordForType({
      id,
      recordType: 'person',
      name,
      email: String(elements.quickLeadEmail?.value || '').trim(),
      company: group?.name || '',
      tags: 'quick lead',
      status: DEFAULT_PERSON_STATUS,
      primaryPain: pain,
      lastSignal: 'Captured from quick lead form',
      groupId,
      source: 'CRM quick lead',
      created: now,
      updated: now,
      contactId: '',
      lastContacted: '',
      activityCount: 0,
    }));

    if (pain) {
      await putCrmRecord(pruneRecordForType({
        id: generateId(),
        recordType: 'problem',
        name: pain,
        primaryPain: pain,
        lastSignal: 'Captured from quick lead form',
        linkedGroupIds: groupId ? [groupId] : [],
        linkedPersonIds: [id],
        notes: `Captured from quick lead form for ${name}.`,
        source: 'CRM quick lead',
        created: now,
        updated: now,
      }));
    }

    state.focusId = id;
    state.focusApplied = false;
    elements.quickLeadForm?.reset();
    refreshRelationshipControls();
    if (scoreManager) scoreManager.increment(10);
  } catch (err) {
    console.error('Unable to add quick lead', err);
    window.alert('Unable to add this lead right now.');
  }
}

async function handleAction(action, recordId) {
  const record = sanitizeCrmRecord(crmIndex[recordId] || state.board.index[recordId] || {});
  if (action === 'open-detail') {
    openDetail(recordId);
    return;
  }
  if (action === 'edit-record') {
    closeDetail();
    openCreateOverlay({ record });
    return;
  }
  if (action === 'delete-record') {
    if (!record.id) return;
    if (!window.confirm(`Delete this ${record.recordType === 'group' ? 'group' : record.recordType === 'problem' ? 'problem' : 'lead'}?`)) {
      return;
    }
    closeDetail();
    await deleteCrmRecord(record.id);
    return;
  }
  if (action === 'new-member') {
    openCreateOverlay({
      type: 'person',
      preset: { groupId: record.id, company: record.name || '', status: DEFAULT_PERSON_STATUS, source: 'CRM group lane' },
    });
    return;
  }
  if (action === 'new-problem') {
    openCreateOverlay({
      type: 'problem',
      preset: record.recordType === 'group'
        ? { linkedGroupIds: [record.id], source: 'CRM group lane' }
        : { linkedPersonIds: [record.id], linkedGroupIds: record.groupId ? [record.groupId] : [], source: 'CRM person lane' },
    });
    return;
  }
  if (action === 'ensure-contact') {
    await ensureContact(record.id);
    return;
  }
  if (action === 'log-touch') {
    await logTouch(record.id);
    return;
  }
  if (action === 'quick-follow-up') {
    quickFollowUp(record.id);
  }
}

function attachEvents() {
  elements.form?.addEventListener('submit', handleCreateSubmit);
  elements.quickLeadForm?.addEventListener('submit', handleQuickLeadSubmit);
  elements.filterInput?.addEventListener('input', applyFilter);
  elements.personWorkflowFilter?.addEventListener('change', applyFilter);
  elements.filterAllButton?.addEventListener('click', () => setFilterMode('all'));
  elements.filterWarmButton?.addEventListener('click', () => setFilterMode('warm'));
  elements.recordType?.addEventListener('change', () => applyCreateTypeVisibility(elements.recordType.value));
  elements.openCreate?.addEventListener('click', () => openCreateOverlay({ type: 'person' }));
  elements.openGroupCreate?.addEventListener('click', () => openCreateOverlay({ type: 'group' }));
  elements.openProblemCreate?.addEventListener('click', () => openCreateOverlay({ type: 'problem' }));
  elements.closeCreate?.addEventListener('click', () => closeCreateOverlay({ reset: true }));
  elements.cancelCreate?.addEventListener('click', () => closeCreateOverlay({ reset: true }));
  elements.closeDetail?.addEventListener('click', closeDetail);

  elements.createOverlay?.addEventListener('click', event => {
    if (event.target === elements.createOverlay) {
      closeCreateOverlay({ reset: true });
    }
  });
  elements.detailOverlay?.addEventListener('click', event => {
    if (event.target === elements.detailOverlay) {
      closeDetail();
    }
  });

  document.addEventListener('keydown', event => {
    const targetTag = String(event.target?.tagName || '').toLowerCase();
    const isTypingContext = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select' || event.target?.isContentEditable;
    if (event.key === '/' && !isTypingContext) {
      event.preventDefault();
      elements.filterInput?.focus();
      return;
    }

    if (event.key !== 'Escape') return;
    if (elements.detailOverlay && !elements.detailOverlay.classList.contains('hidden')) {
      closeDetail();
      return;
    }
    if (elements.createOverlay && !elements.createOverlay.classList.contains('hidden')) {
      closeCreateOverlay({ reset: true });
    }
  });

  elements.list?.addEventListener('click', async event => {
    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
      event.preventDefault();
      event.stopPropagation();
      await handleAction(actionTarget.dataset.action || '', actionTarget.dataset.recordId || '');
      return;
    }
    const card = event.target.closest('.crm-card[data-record-id]');
    if (!card || event.target.closest('button, a, input, select, textarea, form')) return;
    openDetail(card.dataset.recordId || '');
  });

  const handleDetailActionClick = async event => {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    event.preventDefault();
    event.stopPropagation();
    await handleAction(actionTarget.dataset.action || '', actionTarget.dataset.recordId || '');
  };

  elements.detailActions?.addEventListener('click', handleDetailActionClick);
  elements.detailWorkspace?.addEventListener('click', handleDetailActionClick);
}

function startSync() {
  if (!user.is && signedIn && alias && password) {
    user.auth(alias, password, ack => {
      if (ack && ack.err) {
        console.warn('CRM auth failed', ack.err);
      }
    });
  }

  contactsWorkspace.map().on((data, id) => {
    if (!id) return;
    if (!data) {
      delete contactWorkspaceIndex[id];
    } else {
      contactWorkspaceIndex[id] = { ...(contactWorkspaceIndex[id] || {}), ...data, id };
    }
    scheduleRender();
  });

  touchLogRoot.map().on((data, id) => {
    if (!id) return;
    if (!data) {
      touchLogIndex.delete(id);
    } else {
      touchLogIndex.set(id, {
        ...sanitizeCrmRecord(data),
        id,
        timestamp: data.timestamp || data.time || data.lastContacted || '',
      });
    }
    renderWeeklyChallenge();
  });

  crmRecords.map().on((data, id) => {
    if (!id) return;
    if (!data) {
      delete crmIndex[id];
    } else {
      const sanitized = sanitizeCrmRecord(data);
      crmIndex[id] = { ...(crmIndex[id] || {}), ...sanitized, id };
    }
    scheduleRender();
  });
}

function init() {
  updateFilterButtons();
  populateStaticSelects();
  refreshRelationshipControls();
  fillCreateForm({ recordType: 'person', status: DEFAULT_PERSON_STATUS });
  attachEvents();
  startIdentityBadge();
  startSync();
  renderWeeklyChallenge();
  renderList();
  applyUrlDraftIfNeeded();
}

init();
