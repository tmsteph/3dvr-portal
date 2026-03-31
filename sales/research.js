const LOCAL_TRAINING_STATE_KEY = 'training.v1';
const LOCAL_INTERVIEW_STATE_KEY = 'sales-research.interviews.v1';
const LOCAL_INTERVIEW_SCHEDULE_STATE_KEY = 'sales-research.schedule.v1';
const GUN_QUEUE_NODE_PATH = ['3dvr-portal', 'sales-training', 'today-queue'];
const GUN_INTERVIEW_NODE_PATH = ['3dvr-portal', 'sales-research', 'interviews'];
const GUN_INTERVIEW_SCHEDULE_NODE_PATH = ['3dvr-portal', 'sales-research', 'schedule'];
const CRM_NODE_KEY = '3dvr-crm';
const TOUCH_LOG_NODE_PATH = ['3dvr-portal', 'crm-touch-log'];
const INTERVIEW_TARGET = 15;
const DEFAULT_INTERVIEW_DURATION_MINUTES = 15;
const DEFAULT_INTERVIEW_TIME = '11:00';
const INTERVIEW_STATUS_VALUES = Object.freeze([
  'Queued',
  'Reached out',
  'Interviewed',
  'Qualified',
  'Not a fit',
]);

const SEGMENTS = Object.freeze({
  'professional-services': Object.freeze({
    label: 'Professional services',
    marketSegment: 'Professional services',
    queueLead: 'Professional services Builder outreach',
    nextStep: 'Send first Builder note today',
    opener: 'You probably do not need more software. You need a cleaner way to keep leads moving and follow up before work slips.',
    full: 'Open with: You probably do not need more software. You need a cleaner way to keep leads moving and follow up before work slips.\nAsk: Where do inquiries usually stall right now: replies, follow-up, quoting, or weekly organization?\nClose: If you want, I can show you a lightweight Builder setup that keeps the next client touch visible every week.',
  }),
  'local-service': Object.freeze({
    label: 'Construction and local service',
    marketSegment: 'Local services',
    queueLead: 'Local service Builder outreach',
    nextStep: 'Send first owner-operator note today',
    opener: 'A lot of owner-operators do not need a giant stack. They need a simple lane for lead flow, follow-up, and jobs in motion.',
    full: 'Open with: A lot of owner-operators do not need a giant stack. They need a simple lane for lead flow, follow-up, and jobs in motion.\nAsk: What gets missed most often right now: new inquiries, quote follow-up, scheduling, or keeping jobs organized?\nClose: I can show you a Builder flow that keeps the next lead, next quote, and next follow-up from getting buried.',
  }),
  'support-team': Object.freeze({
    label: 'Health, support, and local teams',
    marketSegment: 'Support team or community org',
    queueLead: 'Support team Embedded outreach',
    nextStep: 'Send first Embedded note today',
    opener: 'Teams usually do not need more apps first. They need one clearer operating loop for intake, scheduling, and shared follow-up.',
    full: 'Open with: Teams usually do not need more apps first. They need one clearer operating loop for intake, scheduling, and shared follow-up.\nAsk: Where does coordination break down most often right now: intake, scheduling, handoff, or client follow-up?\nClose: If the pain is shared across a real team, Embedded is the cleaner fit because it gives you a tighter monthly execution lane.',
  }),
});

const playbookCopyStatus = document.getElementById('playbookCopyStatus');
const researchQueueStatus = document.getElementById('researchQueueStatus');
const scoreboardUpdated = document.getElementById('scoreboardUpdated');
const interviewSprintStatus = document.getElementById('interviewSprintStatus');
const interviewSprintDetail = document.getElementById('interviewSprintDetail');
const interviewSprintBar = document.getElementById('interviewSprintBar');
const interviewMinimumStatus = document.getElementById('interviewMinimumStatus');
const interviewLoggedCount = document.getElementById('interviewLoggedCount');
const interviewTargetCount = document.getElementById('interviewTargetCount');
const interviewProfessionalCount = document.getElementById('interviewProfessionalCount');
const interviewLocalCount = document.getElementById('interviewLocalCount');
const interviewSupportCount = document.getElementById('interviewSupportCount');
const interviewLogForm = document.getElementById('interviewLogForm');
const interviewSegment = document.getElementById('interviewSegment');
const interviewCompany = document.getElementById('interviewCompany');
const interviewContact = document.getElementById('interviewContact');
const interviewStatus = document.getElementById('interviewStatus');
const interviewNotes = document.getElementById('interviewNotes');
const interviewNextStep = document.getElementById('interviewNextStep');
const interviewLogSaveStatus = document.getElementById('interviewLogSaveStatus');
const interviewLogList = document.getElementById('interviewLogList');
const scheduleInterviewForm = document.getElementById('scheduleInterviewForm');
const scheduleInterviewSegment = document.getElementById('scheduleInterviewSegment');
const scheduleInterviewCompany = document.getElementById('scheduleInterviewCompany');
const scheduleInterviewContact = document.getElementById('scheduleInterviewContact');
const scheduleInterviewDate = document.getElementById('scheduleInterviewDate');
const scheduleInterviewTime = document.getElementById('scheduleInterviewTime');
const scheduleInterviewDuration = document.getElementById('scheduleInterviewDuration');
const scheduleInterviewNote = document.getElementById('scheduleInterviewNote');
const scheduleInterviewCalendarLink = document.getElementById('scheduleInterviewCalendarLink');
const scheduledInterviewStatus = document.getElementById('scheduledInterviewStatus');
const scheduledInterviewSummary = document.getElementById('scheduledInterviewSummary');
const scheduledInterviewList = document.getElementById('scheduledInterviewList');

let researchGun = null;
let reachoutQueueNode = null;
let interviewsNode = null;
let scheduledInterviewsNode = null;
let crmRecordsNode = null;
let touchLogRoot = null;
let queueSnapshot = '[]';
let currentQueue = [];
let interviewSnapshot = '[]';
let currentInterviews = [];
let scheduleSnapshot = '[]';
let currentScheduledInterviews = [];
const crmRecordIndex = Object.create(null);
const touchLogIndex = Object.create(null);
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

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeAttr(value) {
  return safe(value).replace(/"/g, '&quot;');
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function padNumber(value) {
  return String(value).padStart(2, '0');
}

function toLocalDateInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function toLocalTimeInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function parseScheduledInterviewStart(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return null;
  }
  const parsed = new Date(`${dateValue}T${timeValue}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampInterviewDuration(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_INTERVIEW_DURATION_MINUTES;
  }
  return Math.max(15, Math.min(Math.trunc(value), 120));
}

function buildNextInterviewDefaults() {
  const next = new Date();
  next.setSeconds(0, 0);
  next.setDate(next.getDate() + 1);
  next.setHours(11, 0, 0, 0);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  return {
    date: toLocalDateInputValue(next),
    time: DEFAULT_INTERVIEW_TIME,
    durationMinutes: DEFAULT_INTERVIEW_DURATION_MINUTES,
  };
}

function formatInterviewSlot(value, durationMinutes = DEFAULT_INTERVIEW_DURATION_MINUTES) {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) {
    return 'Unscheduled';
  }
  return `${start.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })} • ${clampInterviewDuration(durationMinutes)} min`;
}

function buildInterviewCalendarUrl(interview = {}) {
  const segmentId = SEGMENTS[interview.segmentId] ? String(interview.segmentId) : 'professional-services';
  const segment = SEGMENTS[segmentId];
  const start = new Date(interview.startsAt || '');
  if (Number.isNaN(start.getTime())) {
    return '../calendar/index.html';
  }
  const end = new Date(start.getTime() + (clampInterviewDuration(interview.durationMinutes) * 60 * 1000));
  const titleTarget = String(interview.company || interview.contact || segment.label).trim();
  const title = `Interview • ${segment.label} • ${titleTarget}`;
  const descriptionLines = [
    `Segment: ${segment.label}`,
    interview.company ? `Company: ${interview.company}` : '',
    interview.contact ? `Contact: ${interview.contact}` : '',
    interview.note ? `Prep note: ${interview.note}` : '',
    `Opener: ${segment.opener}`,
    'Source: Sales research desk',
  ].filter(Boolean);
  const params = new URLSearchParams();
  params.set('prefill', '1');
  params.set('source', 'sales-research');
  params.set('title', title);
  params.set('start', start.toISOString());
  params.set('end', end.toISOString());
  params.set('description', descriptionLines.join('\n'));
  params.set('timeZone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  if (interview.note) {
    params.set('reminderMessage', interview.note);
  }
  return `../calendar/index.html?${params.toString()}`;
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
    completedAt: String(item.completedAt || '').trim(),
    touchLogId: String(item.touchLogId || '').trim(),
    touchType: String(item.touchType || 'outreach-sent').trim(),
    recordId: String(item.recordId || '').trim(),
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

function serializeQueueForGun(list = []) {
  return JSON.stringify(normalizeQueue(list));
}

function parseQueueFromGun(data = {}) {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const rawJson = typeof data.itemsJson === 'string' ? data.itemsJson.trim() : '';
  if (rawJson) {
    try {
      return normalizeQueue(JSON.parse(rawJson));
    } catch (error) {
      console.warn('Research desk queue parse failed', error);
    }
  }

  return normalizeQueue(Array.isArray(data.items) ? data.items : []);
}

function persistQueueToGun() {
  if (!reachoutQueueNode) {
    return;
  }
  reachoutQueueNode.put({
    itemsJson: serializeQueueForGun(currentQueue),
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
    const nextQueue = parseQueueFromGun(data);
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
      completedAt: '',
      touchLogId: '',
      touchType: 'outreach-sent',
      recordId: '',
      done: false,
    },
  ], {
    message: `queued ${segment.label}`,
  });
  updatePlaybookStatus('Queued the opener in the shared reach-out desk. Open training or CRM while the segment is still warm.');
}

function normalizeInterviewEntry(item = {}) {
  const segmentId = SEGMENTS[item.segmentId] ? String(item.segmentId) : 'professional-services';
  const segment = SEGMENTS[segmentId];
  const status = INTERVIEW_STATUS_VALUES.includes(String(item.status || '').trim())
    ? String(item.status || '').trim()
    : 'Queued';
  return {
    id: String(item.id || generateId()),
    segmentId,
    segmentLabel: segment.label,
    company: String(item.company || '').trim(),
    contact: String(item.contact || '').trim(),
    status,
    notes: String(item.notes || '').trim(),
    nextStep: String(item.nextStep || '').trim(),
    createdAt: String(item.createdAt || new Date().toISOString()).trim(),
    updatedAt: String(item.updatedAt || item.createdAt || new Date().toISOString()).trim(),
    source: String(item.source || 'Market research desk').trim(),
  };
}

function normalizeInterviews(list = []) {
  return Array.isArray(list)
    ? list
      .map(normalizeInterviewEntry)
      .filter(item => item.company || item.contact || item.notes)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    : [];
}

function interviewSignature(list = []) {
  return JSON.stringify(normalizeInterviews(list));
}

function normalizeScheduledInterviewEntry(item = {}) {
  const segmentId = SEGMENTS[item.segmentId] ? String(item.segmentId) : 'professional-services';
  const startsAtValue = String(item.startsAt || '').trim();
  const startsAtDate = new Date(startsAtValue);
  const startsAt = Number.isNaN(startsAtDate.getTime()) ? '' : startsAtDate.toISOString();
  return {
    id: String(item.id || generateId()),
    segmentId,
    segmentLabel: SEGMENTS[segmentId].label,
    company: String(item.company || '').trim(),
    contact: String(item.contact || '').trim(),
    startsAt,
    durationMinutes: clampInterviewDuration(Number.parseInt(item.durationMinutes, 10)),
    note: String(item.note || '').trim(),
    createdAt: String(item.createdAt || new Date().toISOString()).trim(),
    updatedAt: String(item.updatedAt || item.createdAt || new Date().toISOString()).trim(),
    source: String(item.source || 'Market research desk').trim(),
  };
}

function normalizeScheduledInterviews(list = []) {
  return Array.isArray(list)
    ? list
      .map(normalizeScheduledInterviewEntry)
      .filter(item => item.startsAt && (item.company || item.contact))
      .sort((a, b) => String(a.startsAt || '').localeCompare(String(b.startsAt || '')))
    : [];
}

function scheduledInterviewSignature(list = []) {
  return JSON.stringify(normalizeScheduledInterviews(list));
}

function readLocalScheduledInterviews() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_INTERVIEW_SCHEDULE_STATE_KEY) || '{}');
  } catch (error) {
    console.warn('Unable to read scheduled interview state', error);
    return {};
  }
}

function persistLocalScheduledInterviews(list) {
  try {
    window.localStorage.setItem(LOCAL_INTERVIEW_SCHEDULE_STATE_KEY, JSON.stringify({
      items: normalizeScheduledInterviews(list),
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.warn('Unable to persist scheduled interview state', error);
  }
}

function serializeScheduledInterviewsForGun(list = []) {
  return JSON.stringify(normalizeScheduledInterviews(list));
}

function parseScheduledInterviewsFromGun(data = {}) {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const rawJson = typeof data.itemsJson === 'string' ? data.itemsJson.trim() : '';
  if (rawJson) {
    try {
      return normalizeScheduledInterviews(JSON.parse(rawJson));
    } catch (error) {
      console.warn('Scheduled interview parse failed', error);
    }
  }

  return normalizeScheduledInterviews(Array.isArray(data.items) ? data.items : []);
}

function renderScheduledInterviewStatus(message = '') {
  if (!scheduledInterviewStatus) {
    return;
  }
  const mode = scheduledInterviewsNode ? 'Shared with Gun' : 'Local fallback';
  scheduledInterviewStatus.textContent = message
    ? `${mode} • ${currentScheduledInterviews.length} slots saved • ${message}`
    : `${mode} • ${currentScheduledInterviews.length} slots saved`;
}

function renderScheduledInterviewList() {
  if (!scheduledInterviewList) {
    return;
  }

  if (!currentScheduledInterviews.length) {
    scheduledInterviewList.innerHTML = `
      <div class="rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-5 text-sm text-slate-400">
        No interview slots saved yet. Book one real time on the calendar, not just another intention.
      </div>
    `;
    if (scheduledInterviewSummary) {
      scheduledInterviewSummary.textContent = 'No slots saved yet';
    }
    return;
  }

  const nextSlot = currentScheduledInterviews[0];
  if (scheduledInterviewSummary) {
    scheduledInterviewSummary.textContent = `${currentScheduledInterviews.length} saved • next ${formatInterviewSlot(nextSlot.startsAt, nextSlot.durationMinutes)}`;
  }

  scheduledInterviewList.innerHTML = currentScheduledInterviews
    .slice(0, 6)
    .map(item => `
      <article class="rounded-xl border border-white/5 bg-slate-900/70 p-4 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.24em] text-slate-400">${safe(item.segmentLabel)}</p>
            <h4 class="text-sm font-semibold text-slate-100">${safe(item.company || item.contact || 'Scheduled interview')}</h4>
            <p class="text-xs text-slate-400">${safe(item.contact || 'No contact saved')} • ${safe(formatInterviewSlot(item.startsAt, item.durationMinutes))}</p>
          </div>
          <button
            type="button"
            data-scheduled-interview-remove-id="${safeAttr(item.id)}"
            class="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >Remove</button>
        </div>
        <p class="text-sm text-slate-300">${safe(item.note || 'Use the segment opener, keep it to 15 minutes, and capture the real pain clearly.')}</p>
        <div class="flex flex-wrap gap-2">
          <a
            href="${safeAttr(buildInterviewCalendarUrl(item))}"
            class="inline-flex items-center justify-center rounded-lg border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/20"
          >Open calendar draft</a>
        </div>
      </article>
    `)
    .join('');
}

function updateScheduleCalendarLink() {
  if (!scheduleInterviewCalendarLink) {
    return;
  }

  const startsAt = parseScheduledInterviewStart(
    String(scheduleInterviewDate?.value || '').trim(),
    String(scheduleInterviewTime?.value || '').trim()
  );

  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    scheduleInterviewCalendarLink.href = '../calendar/index.html';
    return;
  }

  const entry = normalizeScheduledInterviewEntry({
    segmentId: String(scheduleInterviewSegment?.value || '').trim(),
    company: String(scheduleInterviewCompany?.value || '').trim(),
    contact: String(scheduleInterviewContact?.value || '').trim(),
    startsAt: startsAt.toISOString(),
    durationMinutes: Number.parseInt(scheduleInterviewDuration?.value || '', 10),
    note: String(scheduleInterviewNote?.value || '').trim(),
  });
  scheduleInterviewCalendarLink.href = buildInterviewCalendarUrl(entry);
}

function persistScheduledInterviewsToGun() {
  if (!scheduledInterviewsNode) {
    return;
  }
  scheduledInterviewsNode.put({
    itemsJson: serializeScheduledInterviewsForGun(currentScheduledInterviews),
    updatedAt: new Date().toISOString(),
  }, ack => {
    if (ack && ack.err) {
      console.warn('Scheduled interview sync failed', ack.err);
      renderScheduledInterviewStatus('sync failed');
    }
  });
}

function setScheduledInterviews(nextInterviews, options = {}) {
  currentScheduledInterviews = normalizeScheduledInterviews(nextInterviews);
  scheduleSnapshot = scheduledInterviewSignature(currentScheduledInterviews);
  persistLocalScheduledInterviews(currentScheduledInterviews);
  renderScheduledInterviewList();
  renderScheduledInterviewStatus(options.message || '');
  if (!options.fromGun) {
    persistScheduledInterviewsToGun();
  }
}

function hydrateScheduledInterviewsFromLocal() {
  const state = readLocalScheduledInterviews();
  currentScheduledInterviews = normalizeScheduledInterviews(state.items || []);
  scheduleSnapshot = scheduledInterviewSignature(currentScheduledInterviews);
  renderScheduledInterviewList();
  renderScheduledInterviewStatus();
}

function hydrateScheduledInterviewsFromGun() {
  if (!scheduledInterviewsNode) {
    return;
  }

  const applyRemoteSchedule = (data) => {
    if (!data || !data.updatedAt) {
      return;
    }
    const nextSchedule = parseScheduledInterviewsFromGun(data);
    const nextSignature = scheduledInterviewSignature(nextSchedule);
    if (nextSignature === scheduleSnapshot) {
      return;
    }
    setScheduledInterviews(nextSchedule, { fromGun: true });
  };

  scheduledInterviewsNode.once(applyRemoteSchedule);
  scheduledInterviewsNode.on(applyRemoteSchedule);
}

function resetScheduledInterviewForm() {
  if (!scheduleInterviewForm) {
    return;
  }
  scheduleInterviewForm.reset();
  const defaults = buildNextInterviewDefaults();
  if (scheduleInterviewSegment) {
    scheduleInterviewSegment.value = 'professional-services';
  }
  if (scheduleInterviewDate) {
    scheduleInterviewDate.value = defaults.date;
  }
  if (scheduleInterviewTime) {
    scheduleInterviewTime.value = defaults.time;
  }
  if (scheduleInterviewDuration) {
    scheduleInterviewDuration.value = String(defaults.durationMinutes);
  }
  updateScheduleCalendarLink();
}

function handleScheduledInterviewSubmit(event) {
  event.preventDefault();
  const company = String(scheduleInterviewCompany?.value || '').trim();
  const contact = String(scheduleInterviewContact?.value || '').trim();
  const startsAt = parseScheduledInterviewStart(
    String(scheduleInterviewDate?.value || '').trim(),
    String(scheduleInterviewTime?.value || '').trim()
  );

  if (!company && !contact) {
    renderScheduledInterviewStatus('add at least a company or contact');
    scheduleInterviewCompany?.focus();
    return;
  }

  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    renderScheduledInterviewStatus('choose a valid date and time');
    scheduleInterviewDate?.focus();
    return;
  }

  const now = new Date().toISOString();
  setScheduledInterviews([
    ...currentScheduledInterviews,
    {
      id: generateId(),
      segmentId: String(scheduleInterviewSegment?.value || '').trim(),
      company,
      contact,
      startsAt: startsAt.toISOString(),
      durationMinutes: Number.parseInt(scheduleInterviewDuration?.value || '', 10),
      note: String(scheduleInterviewNote?.value || '').trim(),
      createdAt: now,
      updatedAt: now,
      source: 'Market research desk',
    },
  ], {
    message: 'saved slot',
  });

  resetScheduledInterviewForm();
}

function handleScheduledInterviewListClick(event) {
  const removeButton = event.target.closest('[data-scheduled-interview-remove-id]');
  if (!removeButton) {
    return;
  }
  const scheduledInterviewId = String(removeButton.getAttribute('data-scheduled-interview-remove-id') || '').trim();
  if (!scheduledInterviewId) {
    return;
  }
  setScheduledInterviews(
    currentScheduledInterviews.filter(item => item.id !== scheduledInterviewId),
    { message: 'removed slot' }
  );
}

function readLocalInterviewState() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_INTERVIEW_STATE_KEY) || '{}');
  } catch (error) {
    console.warn('Unable to read interview state', error);
    return {};
  }
}

function persistLocalInterviews(list) {
  try {
    window.localStorage.setItem(LOCAL_INTERVIEW_STATE_KEY, JSON.stringify({
      items: normalizeInterviews(list),
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.warn('Unable to persist interview state', error);
  }
}

function serializeInterviewsForGun(list = []) {
  return JSON.stringify(normalizeInterviews(list));
}

function parseInterviewsFromGun(data = {}) {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const rawJson = typeof data.itemsJson === 'string' ? data.itemsJson.trim() : '';
  if (rawJson) {
    try {
      return normalizeInterviews(JSON.parse(rawJson));
    } catch (error) {
      console.warn('Interview log parse failed', error);
    }
  }

  return normalizeInterviews(Array.isArray(data.items) ? data.items : []);
}

function updateInterviewStatus(message = '') {
  if (!interviewSprintStatus) {
    return;
  }
  const mode = interviewsNode ? 'Shared with Gun' : 'Local fallback';
  interviewSprintStatus.textContent = message
    ? `${mode} • ${currentInterviews.length}/${INTERVIEW_TARGET} logged • ${message}`
    : `${mode} • ${currentInterviews.length}/${INTERVIEW_TARGET} logged`;
}

function renderInterviewList() {
  if (!interviewLogList) {
    return;
  }

  if (!currentInterviews.length) {
    interviewLogList.innerHTML = '<div class="rounded-2xl border border-dashed border-white/10 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">No interviews logged yet. Use a CRM draft above, talk to a real buyer, then log what you learned here.</div>';
    return;
  }

  interviewLogList.innerHTML = currentInterviews
    .slice(0, INTERVIEW_TARGET)
    .map(item => `
      <article class="rounded-2xl border border-white/5 bg-slate-950/80 p-4 shadow-lg space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.24em] text-slate-400">${safe(item.segmentLabel)}</p>
            <h3 class="text-lg font-semibold text-slate-100">${safe(item.company || item.contact || 'Untitled interview')}</h3>
            <p class="text-sm text-slate-400">${safe(item.contact || 'No contact saved')} • ${safe(item.status)}</p>
          </div>
          <button
            type="button"
            data-interview-remove-id="${safeAttr(item.id)}"
            class="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >Remove</button>
        </div>
        <p class="text-sm text-slate-300">${safe(item.notes || 'No pain notes saved yet.')}</p>
        <div class="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>Next step: ${safe(item.nextStep || 'Not set')}</span>
          <span>${safe(formatTimestamp(item.updatedAt))}</span>
        </div>
      </article>
    `)
    .join('');
}

function renderInterviewTracker() {
  const total = currentInterviews.length;
  const professional = currentInterviews.filter(item => item.segmentId === 'professional-services').length;
  const local = currentInterviews.filter(item => item.segmentId === 'local-service').length;
  const support = currentInterviews.filter(item => item.segmentId === 'support-team').length;
  const remaining = Math.max(INTERVIEW_TARGET - total, 0);
  const progress = Math.min((total / INTERVIEW_TARGET) * 100, 100);

  if (interviewLoggedCount) interviewLoggedCount.textContent = String(total);
  if (interviewTargetCount) interviewTargetCount.textContent = String(INTERVIEW_TARGET);
  if (interviewProfessionalCount) interviewProfessionalCount.textContent = String(professional);
  if (interviewLocalCount) interviewLocalCount.textContent = String(local);
  if (interviewSupportCount) interviewSupportCount.textContent = String(support);
  if (interviewSprintBar) interviewSprintBar.style.width = `${progress}%`;
  const minimumSlots = [
    { key: 'professional-services', count: professional },
    { key: 'local-service', count: local },
    { key: 'support-team', count: support },
  ];
  const minimumComplete = minimumSlots.filter(item => item.count > 0).length;
  if (interviewMinimumStatus) {
    interviewMinimumStatus.textContent = `${minimumComplete} / 3 segments covered`;
  }
  minimumSlots.forEach(item => {
    const card = document.querySelector(`[data-interview-minimum="${item.key}"]`);
    if (!card) {
      return;
    }
    const stateEl = card.querySelector('[data-interview-minimum-state]');
    const noteEl = card.querySelector('[data-interview-minimum-note]');
    if (item.count > 0) {
      card.classList.add('border-emerald-400/30', 'bg-emerald-500/10');
      card.classList.remove('border-white/5', 'bg-slate-900/70');
      if (stateEl) stateEl.textContent = 'Covered';
      if (noteEl) noteEl.textContent = `${item.count} logged so far.`;
      return;
    }
    card.classList.remove('border-emerald-400/30', 'bg-emerald-500/10');
    card.classList.add('border-white/5', 'bg-slate-900/70');
    if (stateEl) stateEl.textContent = 'Not covered yet';
    if (noteEl) noteEl.textContent = 'Log one conversation to cover this lane.';
  });
  if (interviewSprintDetail) {
    interviewSprintDetail.textContent = total
      ? `${remaining} left to reach the first ${INTERVIEW_TARGET}. Keep the mix balanced across all three segments.`
      : 'No interviews logged yet. Open a draft, have the conversation, then log it here.';
  }
  renderInterviewList();
}

function persistInterviewsToGun() {
  if (!interviewsNode) {
    return;
  }
  interviewsNode.put({
    itemsJson: serializeInterviewsForGun(currentInterviews),
    updatedAt: new Date().toISOString(),
  }, ack => {
    if (ack && ack.err) {
      console.warn('Interview log sync failed', ack.err);
      updateInterviewStatus('sync failed');
    }
  });
}

function setInterviews(nextInterviews, options = {}) {
  currentInterviews = normalizeInterviews(nextInterviews);
  interviewSnapshot = interviewSignature(currentInterviews);
  persistLocalInterviews(currentInterviews);
  renderInterviewTracker();
  updateInterviewStatus(options.message || '');
  if (!options.fromGun) {
    persistInterviewsToGun();
  }
}

function hydrateInterviewsFromLocal() {
  const state = readLocalInterviewState();
  currentInterviews = normalizeInterviews(state.items || []);
  interviewSnapshot = interviewSignature(currentInterviews);
  renderInterviewTracker();
  updateInterviewStatus();
}

function hydrateInterviewsFromGun() {
  if (!interviewsNode) {
    return;
  }

  const applyRemoteInterviews = (data) => {
    if (!data || !data.updatedAt) {
      return;
    }
    const nextInterviews = parseInterviewsFromGun(data);
    const nextSignature = interviewSignature(nextInterviews);
    if (nextSignature === interviewSnapshot) {
      return;
    }
    setInterviews(nextInterviews, { fromGun: true });
  };

  interviewsNode.once(applyRemoteInterviews);
  interviewsNode.on(applyRemoteInterviews);
}

function handleInterviewSubmit(event) {
  event.preventDefault();
  const segmentId = SEGMENTS[String(interviewSegment?.value || '').trim()]
    ? String(interviewSegment.value).trim()
    : 'professional-services';
  const company = String(interviewCompany?.value || '').trim();
  const contact = String(interviewContact?.value || '').trim();
  const notes = String(interviewNotes?.value || '').trim();
  const nextStep = String(interviewNextStep?.value || '').trim();
  const status = INTERVIEW_STATUS_VALUES.includes(String(interviewStatus?.value || '').trim())
    ? String(interviewStatus.value).trim()
    : 'Queued';

  if (!company && !contact) {
    if (interviewLogSaveStatus) {
      interviewLogSaveStatus.textContent = 'Add at least a company or contact before saving.';
    }
    interviewCompany?.focus();
    return;
  }

  const now = new Date().toISOString();
  setInterviews([
    {
      id: generateId(),
      segmentId,
      company,
      contact,
      status,
      notes,
      nextStep,
      createdAt: now,
      updatedAt: now,
      source: 'Market research desk',
    },
    ...currentInterviews,
  ], {
    message: 'saved interview',
  });

  interviewLogForm?.reset();
  if (interviewSegment) {
    interviewSegment.value = segmentId;
  }
  if (interviewLogSaveStatus) {
    interviewLogSaveStatus.textContent = 'Saved the interview log. Keep the next step concrete.';
  }
}

function handleInterviewListClick(event) {
  const removeButton = event.target.closest('[data-interview-remove-id]');
  if (!removeButton) {
    return;
  }
  const interviewId = String(removeButton.getAttribute('data-interview-remove-id') || '').trim();
  if (!interviewId) {
    return;
  }
  setInterviews(currentInterviews.filter(item => item.id !== interviewId), {
    message: 'removed interview',
  });
  if (interviewLogSaveStatus) {
    interviewLogSaveStatus.textContent = 'Removed the interview log entry.';
  }
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

function normalizeTouchLogEntry(data, id) {
  if (!data || typeof data !== 'object') {
    return null;
  }
  return {
    ...normalizeCrmRecord(data),
    id: String(id || data.id || '').trim(),
    timestamp: String(data.timestamp || data.time || data.lastContacted || '').trim(),
    touchType: String(data.touchType || 'outreach-sent').trim(),
    segment: String(data.segment || '').trim(),
  };
}

function getPeopleForSegment(segment) {
  return Object.values(crmRecordIndex).filter(record => {
    if (!record || record.recordType !== 'person') {
      return false;
    }
    return String(record.marketSegment || '').trim() === segment.marketSegment;
  });
}

function getTouchesForSegment(segment) {
  return Object.values(touchLogIndex).filter(entry => {
    if (!entry) return false;
    const entrySegment = String(entry.segment || '').trim();
    return entrySegment === segment.label || entrySegment === segment.marketSegment;
  });
}

function renderScoreboardCard(segmentId, records) {
  const card = document.querySelector(`[data-score-segment="${segmentId}"]`);
  if (!card) {
    return;
  }

  const segment = SEGMENTS[segmentId];
  const touches = getTouchesForSegment(segment);
  const tracked = records.length;
  const sent = touches.filter(entry => entry.touchType === 'outreach-sent').length;
  const replies = touches.filter(entry => entry.touchType === 'reply-received').length;
  const won = touches.filter(entry => entry.touchType === 'closed-won').length;
  const replyRate = sent ? `${Math.round((replies / sent) * 100)}%` : '0%';

  const trackedEl = card.querySelector('[data-score-metric="tracked"]');
  const sentEl = card.querySelector('[data-score-metric="sent"]');
  const repliesEl = card.querySelector('[data-score-metric="replies"]');
  const wonEl = card.querySelector('[data-score-metric="won"]');
  const noteEl = card.querySelector('[data-score-note]');

  if (trackedEl) trackedEl.textContent = String(tracked);
  if (sentEl) sentEl.textContent = String(sent);
  if (repliesEl) repliesEl.textContent = String(replies);
  if (wonEl) wonEl.textContent = String(won);
  if (noteEl) {
    noteEl.textContent = tracked || touches.length
      ? `${sent} sent, ${replies} replies, ${won} won. Reply rate ${replyRate}.`
      : 'No CRM or touch-log records yet for this segment.';
  }
}

function renderScoreboard() {
  Object.entries(SEGMENTS).forEach(([segmentId, segment]) => {
    renderScoreboardCard(segmentId, getPeopleForSegment(segment));
  });
  if (scoreboardUpdated) {
    scoreboardUpdated.textContent = `Live from ${CRM_NODE_KEY} + ${TOUCH_LOG_NODE_PATH[1]} • ${new Date().toLocaleTimeString([], {
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

function hydrateTouchLogScoreboard() {
  if (!touchLogRoot) {
    return;
  }

  touchLogRoot.map().on((data, id) => {
    const entryId = String(id || '').trim();
    if (!entryId) {
      return;
    }
    const entry = normalizeTouchLogEntry(data, id);
    if (!entry || !Object.keys(entry).length) {
      delete touchLogIndex[entryId];
      scheduleScoreboardRender();
      return;
    }
    touchLogIndex[entryId] = entry;
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
  hydrateInterviewsFromLocal();
  hydrateScheduledInterviewsFromLocal();
  resetScheduledInterviewForm();

  interviewLogForm?.addEventListener('submit', handleInterviewSubmit);
  interviewLogList?.addEventListener('click', handleInterviewListClick);
  scheduleInterviewForm?.addEventListener('submit', handleScheduledInterviewSubmit);
  scheduledInterviewList?.addEventListener('click', handleScheduledInterviewListClick);
  scheduleInterviewForm?.addEventListener('input', updateScheduleCalendarLink);
  scheduleInterviewForm?.addEventListener('change', updateScheduleCalendarLink);

  researchGun = createResearchGun();
  if (researchGun) {
    reachoutQueueNode = researchGun
      .get(GUN_QUEUE_NODE_PATH[0])
      .get(GUN_QUEUE_NODE_PATH[1])
      .get(GUN_QUEUE_NODE_PATH[2]);
    interviewsNode = researchGun
      .get(GUN_INTERVIEW_NODE_PATH[0])
      .get(GUN_INTERVIEW_NODE_PATH[1])
      .get(GUN_INTERVIEW_NODE_PATH[2]);
    scheduledInterviewsNode = researchGun
      .get(GUN_INTERVIEW_SCHEDULE_NODE_PATH[0])
      .get(GUN_INTERVIEW_SCHEDULE_NODE_PATH[1])
      .get(GUN_INTERVIEW_SCHEDULE_NODE_PATH[2]);
    crmRecordsNode = researchGun.get(CRM_NODE_KEY);
    touchLogRoot = researchGun
      .get(TOUCH_LOG_NODE_PATH[0])
      .get(TOUCH_LOG_NODE_PATH[1]);
  }

  hydrateQueueFromGun();
  hydrateInterviewsFromGun();
  hydrateScheduledInterviewsFromGun();
  hydrateCrmScoreboard();
  hydrateTouchLogScoreboard();
  renderInterviewTracker();
  renderScheduledInterviewList();
  renderScoreboard();
}

init();
