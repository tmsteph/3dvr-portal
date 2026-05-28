import {
  CRM_STATUS_OPTIONS,
  CRM_WARMTH_OPTIONS,
  buildCrmRelationshipBoard,
  normalizeCrmWarmth,
  sanitizeCrmRecord,
} from './crm-editing.js';

const gun = Gun(window.__GUN_PEERS__ || [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun',
]);
const portalRoot = gun.get('3dvr-portal');
const crmRecords = gun.get('3dvr-crm');
const touchLogRoot = portalRoot.get('crm-touch-log');

const crmIndex = Object.create(null);
const state = {
  board: buildCrmRelationshipBoard([]),
  renderTimer: null,
  mode: 'today',
  selectedId: '',
  spotlightOffset: 0,
  hideDone: false,
};

const els = {
  liveStatus: document.getElementById('liveStatus'),
  leadCountPill: document.getElementById('leadCountPill'),
  dueCountPill: document.getElementById('dueCountPill'),
  search: document.getElementById('flowSearch'),
  todayList: document.getElementById('todayList'),
  spotlightCard: document.getElementById('spotlightCard'),
  pipelineBoard: document.getElementById('pipelineBoard'),
  opportunityMap: document.getElementById('opportunityMap'),
  quickAddOverlay: document.getElementById('quickAddOverlay'),
  quickAddForm: document.getElementById('quickAddForm'),
  quickAddOpen: document.getElementById('openQuickAdd'),
  quickAddClose: document.getElementById('closeQuickAdd'),
  quickAddCancel: document.getElementById('cancelQuickAdd'),
  quickLeadName: document.getElementById('flowLeadName'),
  quickLeadEmail: document.getElementById('flowLeadEmail'),
  quickLeadCompany: document.getElementById('flowLeadCompany'),
  quickLeadWarmth: document.getElementById('flowLeadWarmth'),
  quickLeadPain: document.getElementById('flowLeadPain'),
  quickLeadAction: document.getElementById('flowLeadAction'),
  quickLeadFollowUp: document.getElementById('flowLeadFollowUp'),
  quickLeadOffer: document.getElementById('flowLeadOffer'),
  metricToday: document.getElementById('metricToday'),
  metricHot: document.getElementById('metricHot'),
  metricWarm: document.getElementById('metricWarm'),
  metricWon: document.getElementById('metricWon'),
  metricMoves: document.getElementById('metricMoves'),
  collapseDone: document.getElementById('collapseDone'),
  shuffleSpotlight: document.getElementById('shuffleSpotlight'),
  drawer: document.getElementById('leadDrawer'),
  drawerTitle: document.getElementById('drawerTitle'),
  drawerKicker: document.getElementById('drawerKicker'),
  drawerMeta: document.getElementById('drawerMeta'),
  drawerClose: document.getElementById('closeDrawer'),
  drawerActions: document.getElementById('drawerActions'),
  drawerForm: document.getElementById('drawerForm'),
  drawerStatus: document.getElementById('drawerStatus'),
  drawerWarmth: document.getElementById('drawerWarmth'),
  drawerFollowUp: document.getElementById('drawerFollowUp'),
  drawerAction: document.getElementById('drawerAction'),
  drawerPain: document.getElementById('drawerPain'),
  drawerNotes: document.getElementById('drawerNotes'),
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

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeFollowUpInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 10);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toActivityCount(value) {
  const numeric = Number.parseInt(value, 10);
  return Number.isNaN(numeric) ? 0 : Math.max(0, numeric);
}

function resolveLeadWarmth(record = {}) {
  return normalizeCrmWarmth(record.warmth, record.status);
}

function isClosed(record = {}) {
  const status = String(record.status || '').trim().toLowerCase();
  return status === 'won' || status === 'lost';
}

function hasDueFollowUp(record = {}) {
  const followUp = normalizeFollowUpInput(record.nextFollowUp || '');
  return Boolean(followUp && followUp <= todayKey());
}

function daysSince(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function formatShortDate(value) {
  const raw = normalizeFollowUpInput(value);
  if (!raw) return '';
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function humanAge(value) {
  const days = daysSince(value);
  if (days == null) return 'No touch';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function getAllRecords() {
  return Object.values(crmIndex)
    .map(sanitizeCrmRecord)
    .filter(record => String(record.id || '').trim());
}

function getPeople() {
  return state.board.people.slice();
}

function getOpenPeople() {
  return getPeople().filter(record => !isClosed(record));
}

function getLeadScore(record = {}) {
  let score = 0;
  const warmth = resolveLeadWarmth(record);
  if (hasDueFollowUp(record)) score += 90;
  if (warmth === 'hot') score += 70;
  if (warmth === 'warm') score += 35;
  if (String(record.urgency || '').toLowerCase() === 'high') score += 30;
  if (record.nextBestAction || record.nextExperiment) score += 18;
  if (!record.lastContacted) score += 16;
  const age = daysSince(record.lastContacted);
  if (age != null && age >= 7) score += 14;
  if (record.lastReplyAt) score += 24;
  return score;
}

function comparePriority(a, b) {
  const scoreDelta = getLeadScore(b) - getLeadScore(a);
  if (scoreDelta !== 0) return scoreDelta;
  const followA = normalizeFollowUpInput(a.nextFollowUp || '') || '9999-12-31';
  const followB = normalizeFollowUpInput(b.nextFollowUp || '') || '9999-12-31';
  if (followA !== followB) return followA.localeCompare(followB);
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function getFilteredPeople() {
  const query = String(els.search?.value || '').trim().toLowerCase();
  return getPeople().filter(record => {
    const haystack = [
      record.name,
      record.email,
      record.company,
      record.tags,
      record.status,
      record.primaryPain,
      record.nextBestAction,
      record.nextExperiment,
      record.notes,
      record.offerAmount,
      resolveLeadWarmth(record),
    ].filter(Boolean).join(' ').toLowerCase();
    return !query || haystack.includes(query);
  });
}

function getTodayPeople() {
  return getFilteredPeople()
    .filter(record => !isClosed(record))
    .filter(record => hasDueFollowUp(record) || getLeadScore(record) >= 70)
    .sort(comparePriority);
}

function getHotPeople() {
  return getFilteredPeople()
    .filter(record => !isClosed(record))
    .filter(record => resolveLeadWarmth(record) === 'hot')
    .sort(comparePriority);
}

function getModePeople() {
  if (state.mode === 'hot') return getHotPeople();
  if (state.mode === 'all') return getFilteredPeople().sort(comparePriority);
  return getTodayPeople();
}

function getStage(record = {}) {
  if (String(record.status || '').trim().toLowerCase() === 'won') return 'won';
  if (hasDueFollowUp(record)) return 'now';
  const warmth = resolveLeadWarmth(record);
  if (warmth === 'hot') return 'hot';
  if (warmth === 'warm') return 'warm';
  return 'parked';
}

function setStatus(message, tone = 'neutral') {
  if (!els.liveStatus) return;
  els.liveStatus.textContent = message;
  els.liveStatus.className = `flow-pill ${tone}`;
}

function setSelectOptions(select, options, selectedValue = '') {
  if (!select) return;
  select.innerHTML = (Array.isArray(options) ? options : []).map(option => {
    const value = typeof option === 'object' ? String(option.value || '') : String(option || '');
    const label = typeof option === 'object' ? String(option.label || option.value || '') : String(option || '');
    const selected = value === selectedValue ? 'selected' : '';
    return `<option value="${safeAttr(value)}" ${selected}>${safe(label || 'Any')}</option>`;
  }).join('');
}

function getLeadBadges(record = {}) {
  const badges = [];
  const warmth = resolveLeadWarmth(record);
  if (hasDueFollowUp(record)) badges.push({ label: 'Due', tone: 'coral' });
  if (warmth) badges.push({ label: warmth, tone: warmth === 'hot' ? 'amber' : 'blue' });
  if (record.offerAmount) badges.push({ label: record.offerAmount, tone: 'green' });
  if (String(record.urgency || '').toLowerCase() === 'high') badges.push({ label: 'High urgency', tone: 'purple' });
  return badges;
}

function renderBadges(record = {}) {
  const badges = getLeadBadges(record);
  if (!badges.length) return '';
  return `<div class="hero-tags">${badges.map(badge => `<span class="flow-pill ${safeAttr(badge.tone)}">${safe(badge.label)}</span>`).join('')}</div>`;
}

function renderLeadCard(record = {}, { spotlight = false } = {}) {
  const stage = getStage(record);
  const cardClasses = [
    'lead-card',
    stage === 'now' ? 'is-priority' : '',
    stage === 'hot' ? 'is-hot' : '',
    stage === 'won' ? 'is-won' : '',
  ].filter(Boolean).join(' ');
  const group = record.groupId ? state.board.index[record.groupId] : null;
  const action = String(record.nextBestAction || record.nextExperiment || '').trim();
  const body = action || record.primaryPain || record.objection || record.notes || 'No next action set.';
  const subtitle = [
    record.company || group?.name || '',
    record.status || '',
    record.nextFollowUp ? `Follow-up ${formatShortDate(record.nextFollowUp)}` : '',
    `Last touch ${humanAge(record.lastContacted)}`,
  ].filter(Boolean).join(' | ');

  return `
    <article class="${cardClasses}" data-record-id="${safeAttr(record.id)}">
      <div class="lead-topline">
        <h3 class="lead-name">${safe(record.name || '(untitled lead)')}</h3>
        <button class="icon-button" type="button" data-flow-action="open" data-record-id="${safeAttr(record.id)}" aria-label="Open ${safeAttr(record.name || 'lead')}">
          <i data-lucide="panel-right-open" aria-hidden="true"></i>
        </button>
      </div>
      <div class="lead-subtitle">${safe(subtitle || record.email || 'Lead')}</div>
      ${renderBadges(record)}
      <p class="lead-body">${safe(body)}</p>
      <div class="lead-actions">
        <button class="flow-button compact primary" type="button" data-flow-action="log-touch" data-record-id="${safeAttr(record.id)}">
          <i data-lucide="check-circle-2" aria-hidden="true"></i>
          <span>Touch</span>
        </button>
        <button class="flow-button compact coral" type="button" data-flow-action="snooze" data-record-id="${safeAttr(record.id)}">
          <i data-lucide="calendar-plus" aria-hidden="true"></i>
          <span>Snooze</span>
        </button>
        ${spotlight ? `
          <a class="flow-button compact ghost" href="${safeAttr(buildEmailHref(record))}">
            <i data-lucide="mail-plus" aria-hidden="true"></i>
            <span>Email</span>
          </a>
        ` : ''}
      </div>
    </article>
  `;
}

function renderMetrics() {
  const people = getPeople();
  const open = people.filter(record => !isClosed(record));
  const today = open.filter(hasDueFollowUp);
  const hot = open.filter(record => resolveLeadWarmth(record) === 'hot');
  const warm = open.filter(record => resolveLeadWarmth(record) === 'warm');
  const won = people.filter(record => String(record.status || '').trim().toLowerCase() === 'won');
  const moves = open.filter(record => hasDueFollowUp(record) || !record.nextBestAction || !record.lastContacted);

  if (els.metricToday) els.metricToday.textContent = String(today.length);
  if (els.metricHot) els.metricHot.textContent = String(hot.length);
  if (els.metricWarm) els.metricWarm.textContent = String(warm.length);
  if (els.metricWon) els.metricWon.textContent = String(won.length);
  if (els.metricMoves) els.metricMoves.textContent = String(moves.length);
  if (els.leadCountPill) els.leadCountPill.textContent = `${people.length} lead${people.length === 1 ? '' : 's'}`;
  if (els.dueCountPill) els.dueCountPill.textContent = `${today.length} due`;
}

function renderTodayList() {
  if (!els.todayList) return;
  const records = getModePeople();
  if (!records.length) {
    els.todayList.innerHTML = '<div class="empty-card">No leads in this slice.</div>';
    return;
  }
  els.todayList.innerHTML = records.slice(0, 9).map(record => renderLeadCard(record)).join('');
}

function renderSpotlight() {
  if (!els.spotlightCard) return;
  const records = getOpenPeople().sort(comparePriority);
  if (!records.length) {
    els.spotlightCard.innerHTML = '<div class="empty-card">No open leads yet.</div>';
    return;
  }
  const record = records[state.spotlightOffset % records.length];
  state.selectedId = state.selectedId || record.id;
  els.spotlightCard.innerHTML = renderLeadCard(record, { spotlight: true });
}

function renderPipeline() {
  if (!els.pipelineBoard) return;
  const stages = [
    { id: 'now', label: 'Now' },
    { id: 'hot', label: 'Hot' },
    { id: 'warm', label: 'Warm' },
    { id: 'parked', label: 'Parked' },
    { id: 'won', label: 'Won' },
  ].filter(stage => !(state.hideDone && stage.id === 'won'));
  const people = getFilteredPeople().sort(comparePriority);

  els.pipelineBoard.innerHTML = stages.map(stage => {
    const records = people.filter(record => getStage(record) === stage.id).slice(0, 5);
    return `
      <section class="pipeline-lane" data-stage="${safeAttr(stage.id)}">
        <div class="lane-title">
          <span>${safe(stage.label)}</span>
          <span>${safe(String(records.length))}</span>
        </div>
        <div class="lead-stack">
          ${records.length ? records.map(record => renderLeadCard(record)).join('') : '<div class="empty-card">Empty</div>'}
        </div>
      </section>
    `;
  }).join('');
}

function renderOpportunityMap() {
  if (!els.opportunityMap) return;
  const groups = state.board.groups.slice(0, 4);
  const standaloneProblems = state.board.standaloneProblems.slice(0, 4);
  const cards = groups.map(cluster => {
    const group = cluster.group;
    return `
      <article class="map-card">
        <h3>${safe(group.name || '(untitled group)')}</h3>
        <div class="map-meta">${safe(group.marketSegment || group.status || 'Group')}</div>
        <div class="map-row"><span>People</span><strong>${safe(String(cluster.members.length))}</strong></div>
        <div class="map-row"><span>Pains</span><strong>${safe(String(cluster.linkedProblems.length))}</strong></div>
        <button class="flow-button compact ghost" type="button" data-flow-action="open" data-record-id="${safeAttr(group.id)}">
          <i data-lucide="panel-right-open" aria-hidden="true"></i>
          <span>Open</span>
        </button>
      </article>
    `;
  });

  standaloneProblems.forEach(problem => {
    cards.push(`
      <article class="map-card">
        <h3>${safe(problem.name || problem.primaryPain || '(untitled pain)')}</h3>
        <div class="map-meta">${safe(problem.painSeverity || 'Problem')}</div>
        <div class="map-row"><span>Offer</span><strong>${safe(problem.offerAmount || '-')}</strong></div>
        <div class="map-row"><span>Signal</span><strong>${safe(problem.lastSignal || '-')}</strong></div>
        <button class="flow-button compact ghost" type="button" data-flow-action="open" data-record-id="${safeAttr(problem.id)}">
          <i data-lucide="panel-right-open" aria-hidden="true"></i>
          <span>Open</span>
        </button>
      </article>
    `);
  });

  els.opportunityMap.innerHTML = cards.length ? cards.join('') : '<div class="empty-card">No groups or pains yet.</div>';
}

function renderIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function render() {
  const records = getAllRecords();
  state.board = buildCrmRelationshipBoard(records);
  renderMetrics();
  renderTodayList();
  renderSpotlight();
  renderPipeline();
  renderOpportunityMap();
  refreshDrawer();
  renderIcons();
}

function scheduleRender() {
  window.clearTimeout(state.renderTimer);
  state.renderTimer = window.setTimeout(render, 40);
}

function putCrmRecord(record) {
  return new Promise((resolve, reject) => {
    crmRecords.get(record.id).put(record, ack => {
      if (ack && ack.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      crmIndex[record.id] = { ...(crmIndex[record.id] || {}), ...sanitizeCrmRecord(record), id: record.id };
      setStatus('Saved', 'green');
      scheduleRender();
      resolve(record);
    });
  });
}

function appendTouchLogEntry(record = {}, touchType = 'outreach-sent') {
  const id = `${record.id || 'crm'}-${generateId()}`;
  const entry = {
    id,
    recordId: record.contactId || record.id || '',
    crmRecordId: record.id || '',
    contactId: record.contactId || '',
    contactName: record.name || record.email || 'Unnamed contact',
    timestamp: new Date().toISOString(),
    followUp: normalizeFollowUpInput(record.nextFollowUp || ''),
    note: touchType === 'closed-won' ? 'Marked won from CRM Flow.' : 'Logged from CRM Flow.',
    touchType,
    touchTypeLabel: touchType === 'closed-won' ? 'Closed won' : 'Outreach sent',
    source: 'CRM Flow',
    statusAfter: record.status || '',
  };
  touchLogRoot.get(id).put(entry);
  return entry;
}

function updateRecord(id, patch = {}) {
  const current = sanitizeCrmRecord(crmIndex[id] || state.board.index[id] || {});
  if (!current.id) return Promise.resolve(null);
  const next = sanitizeCrmRecord({
    ...current,
    ...patch,
    id: current.id,
    recordType: current.recordType || 'person',
    updated: new Date().toISOString(),
  });
  return putCrmRecord(next);
}

async function logTouch(id) {
  const current = sanitizeCrmRecord(crmIndex[id] || {});
  if (!current.id) return;
  const next = {
    lastContacted: new Date().toISOString(),
    activityCount: toActivityCount(current.activityCount) + 1,
    status: current.status || 'Warm - Follow-up',
  };
  const saved = await updateRecord(id, next);
  if (saved) appendTouchLogEntry(saved, 'outreach-sent');
}

async function snoozeLead(id) {
  await updateRecord(id, { nextFollowUp: addDays(3), status: 'Warm - Follow-up' });
}

async function markWon(id) {
  const saved = await updateRecord(id, {
    status: 'Won',
    warmth: 'hot',
    lastContacted: new Date().toISOString(),
    activityCount: toActivityCount(crmIndex[id]?.activityCount) + 1,
  });
  if (saved) appendTouchLogEntry(saved, 'closed-won');
}

function buildEmailHref(record = {}) {
  const params = new URLSearchParams();
  params.set('draft', '1');
  params.set('source', 'crm-flow');
  if (record.id) params.set('recordId', record.id);
  if (record.name) params.set('lead', record.name);
  if (record.email) params.set('email', record.email);
  if (record.company) params.set('company', record.company);
  if (record.primaryPain) params.set('pain', record.primaryPain);
  if (record.nextBestAction || record.nextExperiment) {
    params.set('next', record.nextBestAction || record.nextExperiment);
  }
  return `../email-operator/index.html?${params.toString()}`;
}

function openQuickAdd() {
  if (!els.quickAddOverlay) return;
  els.quickAddOverlay.hidden = false;
  window.requestAnimationFrame(() => els.quickLeadName?.focus());
}

function closeQuickAdd({ reset = false } = {}) {
  if (!els.quickAddOverlay) return;
  els.quickAddOverlay.hidden = true;
  if (reset) els.quickAddForm?.reset();
}

async function handleQuickAddSubmit(event) {
  event.preventDefault();
  const now = new Date().toISOString();
  const warmth = String(els.quickLeadWarmth?.value || '').trim();
  const record = sanitizeCrmRecord({
    id: generateId(),
    recordType: 'person',
    name: String(els.quickLeadName?.value || '').trim(),
    email: String(els.quickLeadEmail?.value || '').trim(),
    company: String(els.quickLeadCompany?.value || '').trim(),
    warmth,
    status: warmth === 'hot' ? 'Warm - Discovery' : 'Warm - Awareness',
    primaryPain: String(els.quickLeadPain?.value || '').trim(),
    nextBestAction: String(els.quickLeadAction?.value || '').trim(),
    nextFollowUp: normalizeFollowUpInput(els.quickLeadFollowUp?.value || ''),
    offerAmount: String(els.quickLeadOffer?.value || '').trim(),
    source: 'CRM Flow',
    created: now,
    updated: now,
    activityCount: 0,
    replyCount: 0,
  });

  if (!record.name) {
    setStatus('Name required', 'coral');
    els.quickLeadName?.focus();
    return;
  }

  await putCrmRecord(record);
  state.selectedId = record.id;
  closeQuickAdd({ reset: true });
  openDrawer(record.id);
}

function openDrawer(id) {
  const record = sanitizeCrmRecord(crmIndex[id] || state.board.index[id] || {});
  if (!record.id || !els.drawer) return;
  state.selectedId = record.id;
  refreshDrawer();
  els.drawer.hidden = false;
}

function closeDrawer() {
  if (!els.drawer) return;
  els.drawer.hidden = true;
}

function refreshDrawer() {
  if (!state.selectedId || !els.drawer || els.drawer.hidden) return;
  const record = sanitizeCrmRecord(crmIndex[state.selectedId] || state.board.index[state.selectedId] || {});
  if (!record.id) return;
  const isPerson = record.recordType === 'person';
  if (els.drawerTitle) els.drawerTitle.textContent = record.name || '(untitled record)';
  if (els.drawerKicker) els.drawerKicker.textContent = record.recordType === 'person' ? 'Lead' : record.recordType;
  if (els.drawerActions) els.drawerActions.hidden = !isPerson;
  if (els.drawerMeta) {
    els.drawerMeta.innerHTML = [
      record.company || record.email || '',
      record.primaryPain ? `Pain: ${record.primaryPain}` : '',
      record.nextFollowUp ? `Follow-up: ${formatShortDate(record.nextFollowUp)}` : '',
      record.lastContacted ? `Last touch: ${humanAge(record.lastContacted)}` : 'Last touch: none',
    ].filter(Boolean).map(item => `<div>${safe(item)}</div>`).join('');
  }
  if (els.drawerStatus) els.drawerStatus.value = record.status || '';
  if (els.drawerWarmth) els.drawerWarmth.value = resolveLeadWarmth(record);
  if (els.drawerFollowUp) els.drawerFollowUp.value = normalizeFollowUpInput(record.nextFollowUp || '');
  if (els.drawerAction) els.drawerAction.value = record.nextBestAction || record.nextExperiment || '';
  if (els.drawerPain) els.drawerPain.value = record.primaryPain || '';
  if (els.drawerNotes) els.drawerNotes.value = record.notes || '';
}

async function handleDrawerSubmit(event) {
  event.preventDefault();
  if (!state.selectedId) return;
  const current = sanitizeCrmRecord(crmIndex[state.selectedId] || state.board.index[state.selectedId] || {});
  const isPerson = current.recordType === 'person';
  await updateRecord(state.selectedId, isPerson ? {
    status: String(els.drawerStatus?.value || '').trim(),
    warmth: String(els.drawerWarmth?.value || '').trim(),
    nextFollowUp: normalizeFollowUpInput(els.drawerFollowUp?.value || ''),
    nextBestAction: String(els.drawerAction?.value || '').trim(),
    primaryPain: String(els.drawerPain?.value || '').trim(),
    notes: String(els.drawerNotes?.value || '').trim(),
  } : {
    status: String(els.drawerStatus?.value || current.status || '').trim(),
    primaryPain: String(els.drawerPain?.value || current.primaryPain || '').trim(),
    notes: String(els.drawerNotes?.value || '').trim(),
  });
}

async function handleFlowAction(action, id) {
  if (!id) return;
  const current = sanitizeCrmRecord(crmIndex[id] || state.board.index[id] || {});
  if ((action === 'log-touch' || action === 'snooze' || action === 'mark-won') && current.recordType !== 'person') {
    setStatus('Open lead first', 'amber');
    return;
  }
  if (action === 'open') openDrawer(id);
  if (action === 'log-touch') await logTouch(id);
  if (action === 'snooze') await snoozeLead(id);
  if (action === 'mark-won') await markWon(id);
}

function setMode(mode) {
  state.mode = mode === 'hot' || mode === 'all' ? mode : 'today';
  document.querySelectorAll('[data-flow-mode]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.flowMode === state.mode);
  });
  renderTodayList();
  renderIcons();
}

function bindEvents() {
  els.quickAddOpen?.addEventListener('click', openQuickAdd);
  els.quickAddClose?.addEventListener('click', () => closeQuickAdd());
  els.quickAddCancel?.addEventListener('click', () => closeQuickAdd());
  els.quickAddOverlay?.addEventListener('click', event => {
    if (event.target === els.quickAddOverlay) closeQuickAdd();
  });
  els.quickAddForm?.addEventListener('submit', handleQuickAddSubmit);
  els.search?.addEventListener('input', () => {
    renderTodayList();
    renderPipeline();
    renderIcons();
  });
  els.shuffleSpotlight?.addEventListener('click', () => {
    state.spotlightOffset += 1;
    renderSpotlight();
    renderIcons();
  });
  els.collapseDone?.addEventListener('click', () => {
    state.hideDone = !state.hideDone;
    els.collapseDone.querySelector('span').textContent = state.hideDone ? 'Show done' : 'Hide done';
    renderPipeline();
    renderIcons();
  });
  els.drawerClose?.addEventListener('click', closeDrawer);
  els.drawer?.addEventListener('click', event => {
    if (event.target === els.drawer) closeDrawer();
  });
  els.drawerForm?.addEventListener('submit', handleDrawerSubmit);
  document.querySelectorAll('[data-flow-mode]').forEach(button => {
    button.addEventListener('click', () => setMode(button.dataset.flowMode));
  });
  document.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-flow-action], [data-drawer-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.flowAction || actionButton.dataset.drawerAction || '';
    const id = actionButton.dataset.recordId || state.selectedId;
    handleFlowAction(action, id);
  });
  document.addEventListener('keydown', event => {
    const tag = String(event.target?.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (event.key === '/' && !isTyping) {
      event.preventDefault();
      els.search?.focus();
    }
    if (event.key.toLowerCase() === 'n' && !isTyping) {
      openQuickAdd();
    }
    if (event.key === 'Escape') {
      closeQuickAdd();
      closeDrawer();
    }
  });
}

function initSelects() {
  setSelectOptions(els.quickLeadWarmth, CRM_WARMTH_OPTIONS, 'warm');
  setSelectOptions(els.drawerStatus, CRM_STATUS_OPTIONS, '');
  setSelectOptions(els.drawerWarmth, CRM_WARMTH_OPTIONS, '');
}

function subscribeToCrm() {
  crmRecords.map().on((data, id) => {
    if (!data) {
      delete crmIndex[id];
      scheduleRender();
      return;
    }
    const record = sanitizeCrmRecord({ ...data, id: data.id || id });
    if (!record.id) return;
    crmIndex[record.id] = record;
    setStatus('Live', 'green');
    scheduleRender();
  });
}

function init() {
  initSelects();
  bindEvents();
  subscribeToCrm();
  render();
  renderIcons();
  window.setTimeout(() => {
    if (Object.keys(crmIndex).length === 0) setStatus('Live', 'green');
  }, 1200);
}

init();

if (typeof window !== 'undefined') {
  window.crmFlow = {
    getLeadScore,
    getStage,
    normalizeFollowUpInput,
    render,
  };
}
