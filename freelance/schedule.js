import {
  SCHEDULE_ACTION_TYPES,
  buildWorkSchedulePlan,
} from '../src/work-schedule-coordinator.js';

const gun = Gun(window.__GUN_PEERS__ || [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun',
]);

const gigRecords = gun.get('3dvr-freelance-gigs');
const protectedRecords = gun.get('3dvr-schedule-protected');
const encoreRecords = gun.get('3dvr-encore-shifts');
const actionStateRecords = gun.get('3dvr-schedule-action-state');

const state = {
  gigs: Object.create(null),
  protected: Object.create(null),
  encore: Object.create(null),
  actionState: Object.create(null),
  renderTimer: null,
};

const els = {
  metricOutside: document.getElementById('metricOutside'),
  metricEncoreRequests: document.getElementById('metricEncoreRequests'),
  metricRest: document.getElementById('metricRest'),
  metricConflicts: document.getElementById('metricConflicts'),
  actionList: document.getElementById('actionList'),
  restList: document.getElementById('restList'),
  encoreList: document.getElementById('encoreList'),
  protectedForm: document.getElementById('protectedForm'),
  protectedDate: document.getElementById('protectedDate'),
  protectedLabel: document.getElementById('protectedLabel'),
  encoreForm: document.getElementById('encoreForm'),
  encoreDate: document.getElementById('encoreDate'),
  encoreTitle: document.getElementById('encoreTitle'),
  syncState: document.getElementById('syncState'),
};

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeId(prefix) {
  if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dateKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function prettyDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function scheduleRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(render, 40);
}

function currentPlan() {
  const start = dateKey();
  return buildWorkSchedulePlan({
    gigs: Object.values(state.gigs).map(gig => ({ ...gig, source: gig.source || 'freelance' })),
    encoreShifts: Object.values(state.encore),
    protectedCommitments: Object.values(state.protected),
    horizonStart: start,
    horizonEnd: addDays(start, 41),
    minimumRestDays: 2,
  });
}

function actionLabel(action, plan) {
  if (action.type === SCHEDULE_ACTION_TYPES.REQUEST_ENCORE_OFF) {
    const gig = Object.values(state.gigs).find(item => item.id === action.gigId);
    return {
      title: `Request Encore off · ${prettyDate(action.date)}`,
      copy: gig?.title ? `Outside booking: ${gig.title}` : 'Outside work is booked for this day.',
      tone: 'status-warning',
    };
  }
  if (action.type === SCHEDULE_ACTION_TYPES.RESOLVE_CONFLICT) {
    return {
      title: `Double-booking · ${prettyDate(action.date)}`,
      copy: 'Encore and outside work overlap. Do not auto-change either booking.',
      tone: 'status-danger',
    };
  }
  if (action.type === SCHEDULE_ACTION_TYPES.PROTECT_REST_DAY) {
    return {
      title: `Protect rest day · ${prettyDate(action.date)}`,
      copy: `Keep this day unavailable so the week retains at least two days off. IATSE: ${plan.iatseAvailability[action.date]}.`,
      tone: 'status-good',
    };
  }
  return {
    title: action.title,
    copy: '',
    tone: '',
  };
}

function renderActions(plan) {
  const useful = plan.actions.filter(action => [
    SCHEDULE_ACTION_TYPES.REQUEST_ENCORE_OFF,
    SCHEDULE_ACTION_TYPES.RESOLVE_CONFLICT,
    SCHEDULE_ACTION_TYPES.PROTECT_REST_DAY,
  ].includes(action.type));

  const open = useful.filter(action => state.actionState[action.id]?.status !== 'done');
  if (!open.length) {
    els.actionList.innerHTML = '<div class="empty">No scheduling actions waiting.</div>';
    return;
  }

  els.actionList.innerHTML = open.slice(0, 30).map(action => {
    const label = actionLabel(action, plan);
    const blocked = action.type === SCHEDULE_ACTION_TYPES.RESOLVE_CONFLICT;
    return `
      <div class="schedule-row">
        <div>
          <strong class="${label.tone}">${safe(label.title)}</strong>
          <p>${safe(label.copy)}</p>
        </div>
        ${blocked ? '<span class="status-danger">Review</span>' : `<button class="mini-button" type="button" data-action-done="${safe(action.id)}">Done</button>`}
      </div>
    `;
  }).join('');
}

function renderRestDays(plan) {
  if (!plan.restDays.length) {
    els.restList.innerHTML = '<div class="empty">No rest days could be protected in this window.</div>';
    return;
  }

  els.restList.innerHTML = plan.restDays.slice(0, 14).map(date => {
    const explicit = Object.values(state.protected).find(item => (item.date || item.startDate) === date);
    return `
      <div class="schedule-row">
        <div>
          <strong>${safe(prettyDate(date))}</strong>
          <p>${explicit ? safe(explicit.label || 'Protected personal day') : 'Planner-selected rest day'} · IATSE: Not Available</p>
        </div>
        ${explicit ? `<button class="mini-button" type="button" data-remove-protected="${safe(explicit.id)}">Remove</button>` : '<span class="status-good">Protected</span>'}
      </div>
    `;
  }).join('');
}

function renderEncore() {
  const shifts = Object.values(state.encore)
    .filter(item => item?.id)
    .sort((a, b) => String(a.startDate || a.date || '').localeCompare(String(b.startDate || b.date || '')));
  if (!shifts.length) {
    els.encoreList.innerHTML = '<div class="empty">No manual Encore shifts. The UKG/Lighthouse connector will replace this bridge.</div>';
    return;
  }
  els.encoreList.innerHTML = shifts.slice(0, 20).map(shift => `
    <div class="schedule-row">
      <div><strong>${safe(prettyDate(shift.startDate || shift.date))}</strong><p>${safe(shift.title || 'Encore shift')}</p></div>
      <button class="mini-button" type="button" data-remove-encore="${safe(shift.id)}">Remove</button>
    </div>
  `).join('');
}

function render() {
  const plan = currentPlan();
  els.metricOutside.textContent = String(plan.metrics.outsideBookedDays);
  els.metricEncoreRequests.textContent = String(plan.metrics.encoreRequestsNeeded);
  els.metricRest.textContent = String(plan.metrics.restDays);
  els.metricConflicts.textContent = String(plan.metrics.conflicts);
  renderActions(plan);
  renderRestDays(plan);
  renderEncore();
  els.syncState.textContent = 'Live';
  els.syncState.classList.add('live');
}

els.protectedForm?.addEventListener('submit', event => {
  event.preventDefault();
  const date = els.protectedDate.value;
  if (!date) return;
  const id = makeId('protected');
  protectedRecords.get(id).put({
    id,
    date,
    startDate: date,
    endDate: date,
    label: els.protectedLabel.value.trim() || 'Personal day',
    countsAsRestDay: true,
    createdAt: new Date().toISOString(),
  });
  els.protectedForm.reset();
});

els.encoreForm?.addEventListener('submit', event => {
  event.preventDefault();
  const date = els.encoreDate.value;
  if (!date) return;
  const id = makeId('encore');
  encoreRecords.get(id).put({
    id,
    date,
    startDate: date,
    endDate: date,
    source: 'encore',
    status: 'Booked',
    title: els.encoreTitle.value.trim() || 'Encore shift',
    createdAt: new Date().toISOString(),
  });
  els.encoreForm.reset();
});

document.addEventListener('click', event => {
  const done = event.target.closest('[data-action-done]');
  if (done) {
    actionStateRecords.get(done.dataset.actionDone).put({
      id: done.dataset.actionDone,
      status: 'done',
      completedAt: new Date().toISOString(),
    });
    return;
  }

  const removeProtected = event.target.closest('[data-remove-protected]');
  if (removeProtected) {
    protectedRecords.get(removeProtected.dataset.removeProtected).put(null);
    return;
  }

  const removeEncore = event.target.closest('[data-remove-encore]');
  if (removeEncore) {
    encoreRecords.get(removeEncore.dataset.removeEncore).put(null);
  }
});

function bindCollection(root, target) {
  root.map().on((record, id) => {
    if (!id) return;
    if (!record) delete target[id];
    else target[id] = { ...record, id: record.id || id };
    scheduleRender();
  });
}

bindCollection(gigRecords, state.gigs);
bindCollection(protectedRecords, state.protected);
bindCollection(encoreRecords, state.encore);
bindCollection(actionStateRecords, state.actionState);

els.protectedDate.value = dateKey();
els.encoreDate.value = dateKey();
scheduleRender();
