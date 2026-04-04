import {
  CRM_STATUS_OPTIONS,
  CRM_MARKET_SEGMENT_OPTIONS,
  CRM_PAIN_SEVERITY_OPTIONS,
  CRM_PILOT_STATUS_OPTIONS,
  CRM_WARMTH_OPTIONS,
  CRM_FIT_OPTIONS,
  CRM_URGENCY_OPTIONS,
  CRM_RECORD_TYPE_OPTIONS,
  normalizeCrmRecordType,
  normalizeCrmWarmth,
  parseCrmList,
  sanitizeCrmRecord,
  buildCrmRelationshipBoard,
} from './crm-editing.js';
import {
  CONTACT_IMPORT_ACCEPT,
  buildImportMatchKeys,
  buildImportedCrmRecord,
  mergeCommaSeparatedValues,
  parseContactFileText,
  pickDeviceContacts,
  supportsDeviceContactPicker,
} from '../src/contacts/import.js';
import {
  PORTAL_OAUTH_AUTH_METHOD,
  PORTAL_OAUTH_CONTACTS_ROOT,
  getOAuthContactsNodeKey,
} from '../src/oauth/shared.js';

const gun = Gun(window.__GUN_PEERS__ || [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun',
]);
const user = gun.user();
const portalRoot = gun.get('3dvr-portal');
const guestsRoot = gun.get('3dvr-guests');
const crmRecords = gun.get('3dvr-crm');
const CRM_DRAFTS_NODE_PATH = ['3dvr-portal', 'crm-outreach-drafts'];
const ORG_CONTACTS_SPACE = 'org-3dvr';
const ORG_CONTACTS_NODE_KEY = 'org-3dvr-demo';
const contactsWorkspaceOrg = gun.get(ORG_CONTACTS_NODE_KEY);
const touchLogRoot = portalRoot.get('crm-touch-log');
const crmDraftsRoot = portalRoot.get('crm-outreach-drafts');
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
const authMethod = String(ls.getItem('authMethod') || '').trim();
const contactsWorkspacePersonal = authMethod === PORTAL_OAUTH_AUTH_METHOD && alias
  ? portalRoot.get(PORTAL_OAUTH_CONTACTS_ROOT).get(getOAuthContactsNodeKey(alias))
  : user.get('contacts');
const contactWorkspaceOrgIndex = Object.create(null);
const contactWorkspacePersonalIndex = Object.create(null);
const crmIndex = Object.create(null);
const draftIndex = new Map();
const touchLogIndex = new Map();
const duplicateSummaryById = new Map();
const WEEKLY_CHALLENGE_GOAL = 3;
const SALES_STALE_DAYS = 7;
const DEFAULT_PERSON_STATUS = 'Warm - Awareness';
const WARM_STATUS_PREFIX = 'warm -';
const DEFAULT_DRAFT_TONE = 'professional';
const SALES_DRAFT_PRESETS = Object.freeze({
  builder: Object.freeze({
    name: 'Builder follow-up',
    status: DEFAULT_PERSON_STATUS,
    warmth: 'warm',
    fit: 'website',
    marketSegment: 'Professional services',
    primaryPain: 'Lead flow and follow-up',
    pilotStatus: 'Warm',
    offerAmount: '$50/mo',
    lastSignal: 'Sales handoff',
    nextExperiment: 'Book a 15-minute discovery call',
    nextBestAction: 'Send a short Builder intro and ask for a call.',
    source: 'Sales handoff',
  }),
  embedded: Object.freeze({
    name: 'Embedded follow-up',
    status: 'Lead',
    warmth: 'warm',
    fit: 'support',
    marketSegment: 'Support team or community org',
    primaryPain: 'Intake, scheduling, and shared coordination',
    pilotStatus: 'Pilot candidate',
    offerAmount: '$200/mo',
    lastSignal: 'Sales handoff',
    nextExperiment: 'Book a 15-minute workflow call',
    nextBestAction: 'Offer a short operations call and confirm the bottleneck.',
    source: 'Sales handoff',
  }),
  custom: Object.freeze({
    name: 'Custom project follow-up',
    status: DEFAULT_PERSON_STATUS,
    warmth: 'warm',
    fit: 'app',
    marketSegment: 'Owner-led service business',
    primaryPain: 'A custom workflow or build is still under discussion',
    pilotStatus: 'Watching',
    offerAmount: 'Custom quote',
    lastSignal: 'Sales handoff',
    nextExperiment: 'Send the next scoped offer',
    nextBestAction: 'Share the direct offer and ask for the decision path.',
    source: 'Sales handoff',
  }),
});
const DRAFT_TYPE_OPTIONS = Object.freeze([
  Object.freeze({
    value: 'firstMessage',
    label: 'First message',
    description: 'Open the relationship with a clear, human first note.',
  }),
  Object.freeze({
    value: 'followUp',
    label: 'Follow-up',
    description: 'Reference the last touch and make the next step easy.',
  }),
  Object.freeze({
    value: 'softCheckIn',
    label: 'Soft check-in',
    description: 'Keep the lead warm without forcing a hard ask.',
  }),
  Object.freeze({
    value: 'directOffer',
    label: 'Direct offer',
    description: 'State the offer, fit, and next best action directly.',
  }),
]);
const TOUCH_TYPE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'drafted', label: 'Drafted' }),
  Object.freeze({ value: 'outreach-sent', label: 'Outreach sent' }),
  Object.freeze({ value: 'reply-received', label: 'Reply received' }),
  Object.freeze({ value: 'follow-up-scheduled', label: 'Follow-up scheduled' }),
  Object.freeze({ value: 'call-booked', label: 'Call booked' }),
  Object.freeze({ value: 'meeting-held', label: 'Meeting held' }),
  Object.freeze({ value: 'closed-won', label: 'Closed won' }),
  Object.freeze({ value: 'closed-later', label: 'Closed later' }),
  Object.freeze({ value: 'not-a-fit', label: 'Not a fit' }),
]);
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
  importPicker: document.getElementById('crmPickDeviceContacts'),
  importFile: document.getElementById('crmImportFile'),
  importGoogle: document.getElementById('crmImportGoogleContacts'),
  importMicrosoft: document.getElementById('crmImportMicrosoftContacts'),
  importStatus: document.getElementById('crmImportStatus'),
  draftBuilder: document.getElementById('crmDraftBuilder'),
  draftEmbedded: document.getElementById('crmDraftEmbedded'),
  draftCustom: document.getElementById('crmDraftCustom'),
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
  salesMovesSummary: document.getElementById('salesMovesSummary'),
  salesMovesFollowUpCount: document.getElementById('salesMovesFollowUpCount'),
  salesMovesFollowUpList: document.getElementById('salesMovesFollowUpList'),
  salesMovesHotDraftCount: document.getElementById('salesMovesHotDraftCount'),
  salesMovesHotDraftList: document.getElementById('salesMovesHotDraftList'),
  salesMovesWarmStaleCount: document.getElementById('salesMovesWarmStaleCount'),
  salesMovesWarmStaleList: document.getElementById('salesMovesWarmStaleList'),
  salesMovesRepliesCount: document.getElementById('salesMovesRepliesCount'),
  salesMovesRepliesList: document.getElementById('salesMovesRepliesList'),
  recordType: document.getElementById('recordType'),
  groupId: document.getElementById('groupId'),
  linkedGroupIds: document.getElementById('linkedGroupIds'),
  linkedPersonIds: document.getElementById('linkedPersonIds'),
  detailDrafts: document.getElementById('crmDetailDrafts'),
  detailTimeline: document.getElementById('crmDetailTimeline'),
  detailSalesNote: document.getElementById('crmDetailSalesNote'),
};

const params = new URLSearchParams(window.location.search);
const cellContextId = (params.get('cellId') || params.get('cell') || '').trim();
const draftTypeParam = (params.get('type') || '').trim();
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
    type: draftTypeParam ? normalizeCrmRecordType(draftTypeParam) : '',
    name: (params.get('name') || '').trim(),
    lead: (params.get('lead') || '').trim(),
    email: (params.get('email') || '').trim(),
    company: (params.get('company') || '').trim(),
    phone: (params.get('phone') || '').trim(),
    role: (params.get('role') || '').trim(),
    tags: (params.get('tags') || '').trim(),
    status: (params.get('status') || '').trim(),
    warmth: (params.get('warmth') || '').trim(),
    fit: (params.get('fit') || '').trim(),
    urgency: (params.get('urgency') || '').trim(),
    nextFollowUp: (params.get('next') || params.get('followup') || params.get('nextFollowup') || '').trim(),
    marketSegment: (params.get('segment') || '').trim(),
    primaryPain: (params.get('pain') || '').trim(),
    painSeverity: (params.get('severity') || '').trim(),
    currentWorkaround: (params.get('workaround') || '').trim(),
    pilotStatus: (params.get('pilot') || '').trim(),
    offerAmount: (params.get('offer') || params.get('amount') || '').trim(),
    lastSignal: (params.get('signal') || '').trim(),
    nextExperiment: (params.get('experiment') || '').trim(),
    nextBestAction: (params.get('nextBestAction') || params.get('nextAction') || '').trim(),
    objection: (params.get('objection') || '').trim(),
    lastContacted: (params.get('lastContacted') || '').trim(),
    groupId: (params.get('groupId') || '').trim(),
    notes: (params.get('notes') || params.get('note') || '').trim(),
    source: (params.get('source') || '').trim(),
  },
};

const cellContextBanner = document.getElementById('cellContextBanner');
const cellContextLabel = document.getElementById('cellContextLabel');
const cellContextLink = document.getElementById('cellContextLink');

function refreshCellContextBanner() {
  if (!cellContextBanner || !cellContextLabel || !cellContextLink) {
    return;
  }
  if (!cellContextId) {
    cellContextBanner.hidden = true;
    return;
  }
  cellContextBanner.hidden = false;
  cellContextLabel.textContent = `Linked from Cell ${cellContextId}`;
  cellContextLink.href = `../cell/index.html?cellId=${encodeURIComponent(cellContextId)}`;
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

function escapeSelectorValue(value) {
  const raw = String(value || '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(raw);
  }
  return raw.replace(/["\\]/g, '\\$&');
}

function buildEmailOperatorHref(record = {}) {
  const params = new URLSearchParams();
  params.set('draft', '1');
  if (record.id) params.set('threadId', `crm-${record.id}`);
  if (record.id) params.set('recordId', record.id);
  if (record.name) {
    params.set('lead', record.name);
    params.set('contact', record.name);
  }
  if (record.email) params.set('email', record.email);
  if (record.company) params.set('company', record.company);
  if (record.status) params.set('status', record.status);
  if (record.marketSegment) params.set('segment', record.marketSegment);
  if (record.primaryPain) params.set('pain', record.primaryPain);
  if (record.offerAmount) params.set('offer', record.offerAmount);
  if (record.lastSignal) params.set('signal', record.lastSignal);
  if (record.nextExperiment) params.set('experiment', record.nextExperiment);
  if (record.notes) params.set('notes', record.notes);
  if (record.tags) params.set('tags', record.tags);
  params.set('source', 'crm');

  const nextAction = String(record.nextBestAction || record.nextExperiment || record.nextFollowUp || '').trim();
  if (nextAction) {
    params.set('next', nextAction);
  }

  const subjectTarget = String(record.company || record.name || 'lead').trim();
  params.set('subject', `3dvr follow-up for ${subjectTarget}`);

  return `../email-operator/index.html?${params.toString()}`;
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

function normalizeTouchType(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'sent') return 'outreach-sent';
  if (normalized === 'replied') return 'reply-received';
  if (normalized === 'closed-lost') return 'closed-later';
  const match = TOUCH_TYPE_OPTIONS.find(option => option.value === normalized);
  return match ? match.value : 'outreach-sent';
}

function getTouchTypeLabel(value = '') {
  const normalized = normalizeTouchType(value);
  const match = TOUCH_TYPE_OPTIONS.find(option => option.value === normalized);
  return match ? match.label : 'Outreach sent';
}

function deriveStatusFromTouch(record = {}, touchType = 'outreach-sent') {
  const current = String(record.status || '').trim();
  const normalizedType = normalizeTouchType(touchType);

  if (normalizedType === 'closed-won') return 'Won';
  if (normalizedType === 'not-a-fit') return 'Lost';
  if (current === 'Won' || current === 'Lost') return current;

  if (normalizedType === 'reply-received') {
    if (!current || current === 'Lead' || current === 'Prospect' || current === DEFAULT_PERSON_STATUS || current === 'Warm - Follow-up') {
      return 'Warm - Discovery';
    }
    return current;
  }

  if (normalizedType === 'call-booked') {
    return current && current !== DEFAULT_PERSON_STATUS ? current : 'Active';
  }

  if (normalizedType === 'meeting-held') {
    return 'Negotiating';
  }

  if (normalizedType === 'closed-later') {
    return 'Warm - Follow-up';
  }

  return current || DEFAULT_PERSON_STATUS;
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

function mergeImportedNotes(existingValue = '', importedValue = '') {
  const existing = String(existingValue || '').trim();
  const imported = String(importedValue || '').trim();
  if (!imported) return existing;
  if (!existing) return imported;
  if (existing.includes(imported)) return existing;
  return `${existing}\n\nImported note:\n${imported}`;
}

function showImportStatus(message = '', tone = 'info') {
  if (!elements.importStatus) return;
  const copy = String(message || '').trim();
  if (!copy) {
    elements.importStatus.className = 'hidden rounded-lg border px-3 py-2 text-xs';
    elements.importStatus.textContent = '';
    return;
  }
  const palettes = {
    info: 'border border-sky-500/30 bg-sky-950/40 text-sky-100',
    success: 'border border-emerald-500/30 bg-emerald-950/40 text-emerald-100',
    warn: 'border border-amber-500/30 bg-amber-950/40 text-amber-100',
    error: 'border border-rose-500/30 bg-rose-950/40 text-rose-100',
  };
  elements.importStatus.className = `rounded-lg px-3 py-2 text-xs ${palettes[tone] || palettes.info}`;
  elements.importStatus.textContent = copy;
}

function refreshImportControls() {
  if (elements.importFile) {
    elements.importFile.accept = CONTACT_IMPORT_ACCEPT;
  }
  if (!elements.importPicker) return;
  const supported = supportsDeviceContactPicker(window.navigator);
  elements.importPicker.disabled = !supported;
  elements.importPicker.classList.toggle('opacity-60', !supported);
  elements.importPicker.classList.toggle('cursor-not-allowed', !supported);
  elements.importPicker.textContent = supported ? 'Pick from phone' : 'Phone picker unavailable';
}

async function refreshOauthImportControls() {
  const runtime = window.PortalOAuth;
  const buttons = [
    { provider: 'google', button: elements.importGoogle },
    { provider: 'microsoft', button: elements.importMicrosoft },
  ];
  if (!runtime || typeof runtime.fetchProviderConfig !== 'function') {
    buttons.forEach(entry => {
      if (!entry.button) return;
      entry.button.disabled = true;
      entry.button.classList.add('opacity-60', 'cursor-not-allowed');
    });
    return;
  }

  await Promise.all(buttons.map(async entry => {
    if (!entry.button) return;
    try {
      const config = await runtime.fetchProviderConfig(entry.provider);
      const enabled = Boolean(config && config.configured);
      entry.button.disabled = !enabled;
      entry.button.classList.toggle('opacity-60', !enabled);
      entry.button.classList.toggle('cursor-not-allowed', !enabled);
      entry.button.title = enabled
        ? `Import contacts from ${config.label}`
        : `${config.label} OAuth is not configured on this deployment yet.`;
    } catch (err) {
      entry.button.disabled = true;
      entry.button.classList.add('opacity-60', 'cursor-not-allowed');
      entry.button.title = err.message || 'OAuth config unavailable.';
    }
  }));
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

function normalizeDateTimeLocalInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseDateTimeLocalInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toISOString();
}

function formatTitleCase(value) {
  return String(value || '')
    .split(/[\s-]+/)
    .map(token => token ? `${token.slice(0, 1).toUpperCase()}${token.slice(1)}` : '')
    .join(' ');
}

function resolveLeadWarmth(record = {}) {
  return normalizeCrmWarmth(record.warmth, record.status);
}

function resolveLeadFit(record = {}) {
  return String(record.fit || '').trim().toLowerCase();
}

function resolveLeadUrgency(record = {}) {
  const normalized = String(record.urgency || '').trim().toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return '';
}

function getDraftTypeConfig(draftType) {
  return DRAFT_TYPE_OPTIONS.find(option => option.value === draftType) || DRAFT_TYPE_OPTIONS[0];
}

function sanitizeDraftBundle(recordId, data = {}) {
  const clean = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (key === '_' || typeof value === 'function') {
      return;
    }
    clean[key] = value;
  });
  const leadId = String(clean.leadId || clean.recordId || recordId || '').trim();
  const next = {
    leadId,
    tone: String(clean.tone || DEFAULT_DRAFT_TONE).trim().toLowerCase() || DEFAULT_DRAFT_TONE,
    updated: String(clean.updated || '').trim(),
    updatedBy: String(clean.updatedBy || '').trim(),
  };
  DRAFT_TYPE_OPTIONS.forEach(option => {
    next[option.value] = String(clean[option.value] || '').trim();
  });
  return next;
}

function getLeadDraftBundle(recordId) {
  return sanitizeDraftBundle(recordId, draftIndex.get(recordId) || {});
}

function hasOutreachDraft(recordId) {
  const bundle = getLeadDraftBundle(recordId);
  return DRAFT_TYPE_OPTIONS.some(option => Boolean(bundle[option.value]));
}

function sortByTimestampDesc(a, b) {
  return String(b?.timestamp || '').localeCompare(String(a?.timestamp || ''));
}

function getRecordTimelineEntries(record = {}) {
  const contactId = String(record.contactId || '').trim();
  return Array.from(touchLogIndex.values())
    .filter(entry => {
      const entryRecordId = String(entry?.recordId || '').trim();
      const entryCrmRecordId = String(entry?.crmRecordId || '').trim();
      const entryContactId = String(entry?.contactId || '').trim();
      return entryCrmRecordId === record.id
        || entryRecordId === record.id
        || Boolean(contactId && (entryRecordId === contactId || entryContactId === contactId));
    })
    .sort(sortByTimestampDesc);
}

function comparePeopleByFollowUpThenName(a, b) {
  const aDate = normalizeFollowUpInput(a.nextFollowUp || '');
  const bDate = normalizeFollowUpInput(b.nextFollowUp || '');
  if (aDate && bDate && aDate !== bDate) {
    return aDate.localeCompare(bDate);
  }
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

function comparePeopleByRecencyThenName(a, b) {
  const aDate = String(a?.lastContacted || '');
  const bDate = String(b?.lastContacted || '');
  if (aDate !== bDate) {
    return aDate.localeCompare(bDate);
  }
  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

function isClosedStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'won' || normalized === 'lost';
}

function needsReplyResponse(record = {}) {
  if (!record.lastReplyAt || isClosedStatus(record.status)) {
    return false;
  }
  const lastReplyAt = new Date(record.lastReplyAt);
  const lastContacted = record.lastContacted ? new Date(record.lastContacted) : null;
  if (Number.isNaN(lastReplyAt.getTime())) {
    return false;
  }
  if (!lastContacted || Number.isNaN(lastContacted.getTime())) {
    return true;
  }
  return lastReplyAt.getTime() >= lastContacted.getTime();
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

function getPreferredContactsSpace() {
  return signedIn ? 'personal' : ORG_CONTACTS_SPACE;
}

function getContactsSpaceLabel(space = getPreferredContactsSpace()) {
  return space === 'personal' ? 'your personal contacts workspace' : 'the shared contacts workspace';
}

function getContactsWorkspaceNode(space = getPreferredContactsSpace()) {
  return space === 'personal' ? contactsWorkspacePersonal : contactsWorkspaceOrg;
}

function getContactWorkspaceIndex(space = getPreferredContactsSpace()) {
  return space === 'personal' ? contactWorkspacePersonalIndex : contactWorkspaceOrgIndex;
}

function getOtherContactsSpace(space = getPreferredContactsSpace()) {
  return space === 'personal' ? ORG_CONTACTS_SPACE : 'personal';
}

function findContactInIndex(record, index, space) {
  if (!record || record.recordType !== 'person') return null;
  const directIds = [record.id, record.contactId].filter(Boolean);
  for (const id of directIds) {
    if (index[id]) {
      return { id, data: index[id], space };
    }
  }
  for (const [contactId, data] of Object.entries(index)) {
    if (data?.crmId === record.id) {
      return { id: contactId, data, space };
    }
  }
  const email = normaliseEmail(record.email);
  if (email) {
    for (const [contactId, data] of Object.entries(index)) {
      if (normaliseEmail(data?.email) === email) {
        return { id: contactId, data, space };
      }
    }
  }
  return null;
}

function getGroupRecord(record) {
  if (!record?.groupId) return null;
  const group = state.board.index[record.groupId];
  return group && group.recordType === 'group' ? group : null;
}

function findContactInWorkspace(record, { space = getPreferredContactsSpace(), allowFallback = true } = {}) {
  const primaryIndex = getContactWorkspaceIndex(space);
  const primaryMatch = findContactInIndex(record, primaryIndex, space);
  if (primaryMatch || !allowFallback) {
    return primaryMatch;
  }

  const fallbackSpace = getOtherContactsSpace(space);
  const fallbackIndex = getContactWorkspaceIndex(fallbackSpace);
  return findContactInIndex(record, fallbackIndex, fallbackSpace);
}

function getContactButtonLabel(record) {
  return findContactInWorkspace(record, { allowFallback: false }) ? 'Open in contacts' : 'Add to contacts';
}

function findExistingImportedLead(importedRecord) {
  const targetKeys = new Set(buildImportMatchKeys(importedRecord));
  if (!targetKeys.size) return null;
  return state.board.people.find(record => buildImportMatchKeys(record).some(key => targetKeys.has(key))) || null;
}

function mergeImportedLead(existingRecord, importedRecord, { sourceLabel = 'Phone import' } = {}) {
  const base = buildImportedCrmRecord(importedRecord, {
    source: sourceLabel,
    tags: mergeCommaSeparatedValues(importedRecord.tags, 'source/phone-import'),
    now: new Date().toISOString(),
    idFactory: generateId,
  });
  if (!base) return null;
  const existing = existingRecord ? sanitizeCrmRecord(existingRecord) : null;
  const timestamp = new Date().toISOString();
  return pruneRecordForType({
    ...(existing || {}),
    ...base,
    id: existing?.id || base.id,
    name: existing?.name || base.name,
    email: existing?.email || base.email,
    phone: existing?.phone || base.phone,
    company: existing?.company || base.company,
    role: existing?.role || base.role,
    tags: mergeCommaSeparatedValues(existing?.tags, base.tags),
    status: existing?.status || base.status || DEFAULT_PERSON_STATUS,
    warmth: existing?.warmth || base.warmth || 'warm',
    fit: existing?.fit || base.fit || '',
    urgency: existing?.urgency || base.urgency || '',
    nextFollowUp: existing?.nextFollowUp || base.nextFollowUp || '',
    notes: mergeImportedNotes(existing?.notes, base.notes),
    source: existing?.source || base.source || sourceLabel,
    nextBestAction: existing?.nextBestAction || base.nextBestAction,
    objection: existing?.objection || base.objection || '',
    lastSignal: existing?.lastSignal || base.lastSignal,
    contactId: existing?.contactId || base.contactId || '',
    created: existing?.created || base.created || timestamp,
    updated: timestamp,
    lastContacted: existing?.lastContacted || '',
    activityCount: toActivityCount(existing?.activityCount),
    replyCount: toActivityCount(existing?.replyCount),
    lastReplyAt: String(existing?.lastReplyAt || ''),
  });
}

async function importContactsIntoCrm(records, { sourceLabel = 'Phone import' } = {}) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const importedIds = [];

  for (const record of (Array.isArray(records) ? records : [])) {
    if (!record) {
      skipped += 1;
      continue;
    }
    const existing = findExistingImportedLead(record);
    const merged = mergeImportedLead(existing, record, { sourceLabel });
    if (!merged) {
      skipped += 1;
      continue;
    }
    await putCrmRecord(merged);
    importedIds.push(merged.id);
    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  if (importedIds.length) {
    state.focusId = importedIds[0];
    state.focusApplied = false;
    if (importedIds.length === 1) {
      openDetail(importedIds[0]);
    }
  }
  if (scoreManager && importedIds.length) {
    scoreManager.increment(importedIds.length);
  }
  return { created, updated, skipped, total: created + updated };
}

async function importOauthContacts(provider) {
  const runtime = window.PortalOAuth;
  if (!runtime || typeof runtime.begin !== 'function' || typeof runtime.listContacts !== 'function') {
    showImportStatus('OAuth is not available in this browser.', 'error');
    return;
  }
  const connection = typeof runtime.getConnection === 'function'
    ? runtime.getConnection(provider)
    : null;
  if (!connection || !connection.accessToken) {
    showImportStatus(`Connecting ${provider} so contacts can be imported…`, 'info');
    runtime.begin(provider, {
      intent: 'crm-import',
      scopeKey: 'contacts',
      returnTo: `${window.location.pathname}${window.location.search}`,
      aliasHint: signedIn ? alias : '',
    });
    return;
  }

  showImportStatus(`Loading ${provider} contacts…`, 'info');
  try {
    const payload = await runtime.listContacts(provider, {
      accessToken: connection.accessToken,
      limit: 200,
    });
    const summary = await importContactsIntoCrm(payload.contacts || [], {
      sourceLabel: provider === 'google' ? 'Google OAuth' : 'Microsoft OAuth',
    });
    showImportStatus(
      summary.total
        ? `Imported ${summary.created} new and updated ${summary.updated} existing lead${summary.total === 1 ? '' : 's'} from ${provider}.`
        : `No contacts were returned from ${provider}.`,
      summary.total ? 'success' : 'warn'
    );
  } catch (err) {
    console.error(`Unable to import ${provider} contacts into CRM`, err);
    showImportStatus(`CRM import failed: ${err.message}`, 'error');
  }
}

async function consumePendingOauthImportResult() {
  const runtime = window.PortalOAuth;
  if (!runtime || typeof runtime.consumePendingResult !== 'function') {
    return;
  }
  const result = runtime.consumePendingResult();
  if (!result) {
    return;
  }
  if (!result.ok) {
    showImportStatus(result.error || 'OAuth import could not be completed.', 'error');
    return;
  }
  if (typeof runtime.storeConnectionFromResult === 'function') {
    runtime.storeConnectionFromResult(result);
  }
  if (result.intent === 'crm-import') {
    await importOauthContacts(result.provider || '');
  }
}

function populateStaticSelects() {
  setSelectOptions(elements.recordType, CRM_RECORD_TYPE_OPTIONS, 'person', 'Record type');
  setSelectOptions(document.getElementById('status'), CRM_STATUS_OPTIONS, DEFAULT_PERSON_STATUS, 'Status (optional)');
  setSelectOptions(document.getElementById('warmth'), CRM_WARMTH_OPTIONS, '', 'Warmth');
  setSelectOptions(document.getElementById('fit'), CRM_FIT_OPTIONS, '', 'Fit');
  setSelectOptions(document.getElementById('urgency'), CRM_URGENCY_OPTIONS, '', 'Urgency');
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
    next.warmth = '';
    next.fit = '';
    next.urgency = '';
    next.objection = '';
    next.nextBestAction = '';
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
    next.lastReplyAt = '';
    next.replyCount = 0;
    return next;
  }

  if (type === 'problem') {
    next.email = '';
    next.company = '';
    next.phone = '';
    next.role = '';
    next.tags = '';
    next.status = '';
    next.warmth = '';
    next.fit = '';
    next.urgency = '';
    next.objection = '';
    next.nextBestAction = '';
    next.nextFollowUp = '';
    next.marketSegment = '';
    next.currentWorkaround = '';
    next.pilotStatus = '';
    next.groupId = '';
    next.contactId = '';
    next.lastContacted = '';
    next.activityCount = 0;
    next.lastReplyAt = '';
    next.replyCount = 0;
    return next;
  }

  next.linkedGroupIds = '';
  next.linkedPersonIds = '';
  next.activityCount = toActivityCount(next.activityCount);
  next.replyCount = toActivityCount(next.replyCount);
  next.warmth = resolveLeadWarmth(next);
  next.fit = resolveLeadFit(next);
  next.urgency = resolveLeadUrgency(next);
  next.objection = String(next.objection || '').trim();
  next.nextBestAction = String(next.nextBestAction || next.nextExperiment || '').trim();
  next.lastContacted = String(next.lastContacted || '').trim();
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
  document.getElementById('warmth').value = resolveLeadWarmth(record);
  document.getElementById('fit').value = resolveLeadFit(record);
  document.getElementById('urgency').value = resolveLeadUrgency(record);
  document.getElementById('nextFollowUp').value = normalizeFollowUpInput(record.nextFollowUp || '');
  document.getElementById('lastContacted').value = normalizeDateTimeLocalInput(record.lastContacted || '');
  document.getElementById('marketSegment').value = record.marketSegment || '';
  document.getElementById('primaryPain').value = record.primaryPain || '';
  document.getElementById('painSeverity').value = record.painSeverity || '';
  document.getElementById('currentWorkaround').value = record.currentWorkaround || '';
  document.getElementById('pilotStatus').value = record.pilotStatus || '';
  document.getElementById('offerAmount').value = record.offerAmount || '';
  document.getElementById('lastSignal').value = record.lastSignal || '';
  document.getElementById('nextExperiment').value = record.nextExperiment || '';
  document.getElementById('nextBestAction').value = record.nextBestAction || record.nextExperiment || '';
  document.getElementById('objection').value = record.objection || '';
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
    warmth: type === 'person' ? resolveLeadWarmth({ warmth: getFieldValue('warmth'), status: getFieldValue('status') }) : '',
    fit: type === 'person' ? resolveLeadFit({ fit: getFieldValue('fit') }) : '',
    urgency: type === 'person' ? resolveLeadUrgency({ urgency: getFieldValue('urgency') }) : '',
    nextFollowUp: type === 'person' ? normalizeFollowUpInput(getFieldValue('nextFollowUp')) : '',
    lastContacted: type === 'person'
      ? (parseDateTimeLocalInput(getFieldValue('lastContacted')) || String(existingRecord.lastContacted || '').trim())
      : '',
    marketSegment: type === 'problem' ? '' : getFieldValue('marketSegment'),
    primaryPain: type === 'group' ? '' : getFieldValue('primaryPain'),
    painSeverity: type === 'group' ? '' : getFieldValue('painSeverity'),
    currentWorkaround: type === 'person' ? getFieldValue('currentWorkaround') : '',
    pilotStatus: type === 'problem' ? '' : getFieldValue('pilotStatus'),
    offerAmount: type === 'group' ? '' : getFieldValue('offerAmount'),
    lastSignal: type === 'group' ? '' : getFieldValue('lastSignal'),
    nextExperiment: type === 'group' ? '' : getFieldValue('nextExperiment'),
    nextBestAction: type === 'person' ? getFieldValue('nextBestAction') : '',
    objection: type === 'person' ? getFieldValue('objection') : '',
    notes: getFieldValue('notes'),
    groupId,
    linkedGroupIds: type === 'problem' ? getSelectedValues(elements.linkedGroupIds) : [],
    linkedPersonIds: type === 'problem' ? getSelectedValues(elements.linkedPersonIds) : [],
    source: existingRecord.source || state.urlDraft.source || 'CRM workspace',
    created: existingRecord.created || now,
    updated: now,
    contactId: type === 'person' ? String(existingRecord.contactId || '').trim() : '',
    activityCount: type === 'person' ? toActivityCount(existingRecord.activityCount) : 0,
  });
}

function renderSection(title, description, body) {
  return `
    <section data-section class="space-y-3">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-white">${safe(title)}</h3>
          <p class="text-sm text-gray-400">${safe(description)}</p>
        </div>
      </div>
      <div class="space-y-3">${body}</div>
    </section>
  `;
}

function renderCompactFacts(items = []) {
  const tokens = Array.isArray(items)
    ? items.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  if (!tokens.length) return '';
  return `<p class="text-xs text-gray-400">${tokens.map(item => safe(item)).join(' · ')}</p>`;
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

  return `
    <section class="space-y-3">
      <article class="crm-card bg-gray-900/60 border border-white/5 rounded-2xl p-4 transition hover:border-white/15 hover:bg-gray-800/80" data-record-id="${safeAttr(group.id)}" data-record-type="group" data-status="${safeAttr(group.status || '')}" data-haystack="${safeAttr(haystack)}">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[11px] uppercase tracking-[0.28em] rounded-full bg-sky-950/80 border border-sky-400/30 px-2 py-1 text-sky-100">Group</span>
              <h3 class="text-lg font-semibold text-white truncate">${safe(group.name || '(untitled group)')}</h3>
            </div>
            ${renderCompactFacts([
              group.status,
              group.marketSegment,
              group.pilotStatus ? `Pilot ${group.pilotStatus}` : '',
              `${cluster.members.length} ${cluster.members.length === 1 ? 'person' : 'people'}`,
              problems.length ? `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}` : '',
            ])}
            ${renderTagRow(group.tags)}
            ${renderCompactFacts([
              group.notes ? group.notes.split(/\s+/).slice(0, 14).join(' ') : '',
            ])}
          </div>
          <div class="flex shrink-0 items-start">
            <button type="button" data-action="open-detail" data-record-id="${safeAttr(group.id)}" class="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-sm">Open</button>
          </div>
        </div>
      </article>
      <div class="space-y-3 border-l border-white/10 pl-4">${cluster.members.length ? cluster.members.map(member => renderPersonCard(member, { nested: true })).join('') : '<div class="ml-4 rounded-lg border border-dashed border-white/10 bg-gray-950/40 px-4 py-3 text-sm text-gray-400">No people linked yet. Use “Add lead” from the detail view.</div>'}</div>
    </section>
  `;
}

function renderPersonCard(record, { nested = false } = {}) {
  const group = getGroupRecord(record);
  const problems = (state.board.linkedProblemsByPersonId[record.id] || []).slice().sort(sortByName);
  const duplicateInfo = duplicateSummaryById.get(record.id);
  const warmth = resolveLeadWarmth(record);
  const fit = resolveLeadFit(record);
  const urgency = resolveLeadUrgency(record);
  const nextBestAction = String(record.nextBestAction || record.nextExperiment || '').trim();
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
    record.objection,
    record.pilotStatus,
    record.offerAmount,
    record.lastSignal,
    record.nextExperiment,
    nextBestAction,
    warmth,
    fit,
    urgency,
    group?.name,
    ...problems.map(problem => problem.name),
  ]);
  const detailLine = [record.primaryPain, record.currentWorkaround, record.objection, nextBestAction]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');

  return `
    <article class="crm-card rounded-2xl border p-4 transition hover:border-white/15 hover:bg-gray-800/80 ${nested ? 'bg-gray-950/55 border-white/10' : 'bg-gray-900/60 border-white/5'}" data-record-id="${safeAttr(record.id)}" data-record-type="person" data-status="${safeAttr(record.status || '')}" data-warmth="${safeAttr(warmth)}" data-contact-id="${safeAttr(record.contactId || '')}" data-next-follow-up="${safeAttr(normalizeFollowUpInput(record.nextFollowUp || ''))}" data-updated-at="${safeAttr(record.updated || record.created || '')}" data-haystack="${safeAttr(haystack)}">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div class="min-w-0 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[11px] uppercase tracking-[0.28em] rounded-full bg-emerald-950/80 border border-emerald-400/30 px-2 py-1 text-emerald-100">Person</span>
            <h3 class="text-lg font-semibold text-white truncate">${safe(record.name || '(untitled lead)')}</h3>
            ${group ? `<span class="text-xs px-2 py-0.5 rounded bg-white/10 border border-white/10 text-gray-100">${safe(group.name || 'Group')}</span>` : ''}
            ${duplicateInfo ? `<span class="text-xs px-2 py-0.5 rounded bg-amber-900/50 border border-amber-500/30 text-amber-100">Dupes ${safe(String(duplicateInfo.total))}</span>` : ''}
          </div>
          ${renderBadgeRow([
            warmth ? `Warmth ${formatTitleCase(warmth)}` : '',
            fit ? `Fit ${formatTitleCase(fit)}` : '',
            urgency ? `Urgency ${formatTitleCase(urgency)}` : '',
          ])}
          ${renderCompactFacts([
            record.status,
            record.nextFollowUp ? `Follow-up ${record.nextFollowUp}` : '',
            record.marketSegment,
            record.painSeverity ? `Pain ${record.painSeverity}` : '',
            record.pilotStatus ? `Pilot ${record.pilotStatus}` : '',
          ])}
          ${(record.email || record.company || record.role || record.phone) ? `<p class="text-sm text-gray-300">${[
            record.email ? `<a href="mailto:${encodeURIComponent(record.email)}" class="text-sky-400 hover:underline">${safe(record.email)}</a>` : '',
            record.company ? safe(record.company) : '',
            record.role ? safe(record.role) : '',
            record.phone ? `<a href="tel:${encodeURIComponent(record.phone)}" class="text-sky-400 hover:underline">${safe(record.phone)}</a>` : '',
          ].filter(Boolean).join(' · ')}</p>` : ''}
          ${detailLine ? `<p class="text-xs text-sky-100/90 rounded-lg border border-sky-400/15 bg-sky-950/40 p-3">${safe(detailLine)}</p>` : ''}
          ${nextBestAction ? `<p class="text-xs text-amber-100/90 rounded-lg border border-amber-400/15 bg-amber-950/40 p-3">Next best action: ${safe(nextBestAction)}</p>` : ''}
          ${renderCompactFacts([
            `Last contacted ${record.lastContacted ? timeAgo(record.lastContacted) : '—'}`,
            `Touches ${safe(String(toActivityCount(record.activityCount)))}`,
            `Replies ${safe(String(toActivityCount(record.replyCount)))}`,
            `Updated ${safe(formatUpdated(record.updated || record.created))}`,
          ])}
        </div>
        <div class="flex shrink-0 items-start">
          <button type="button" data-action="open-detail" data-record-id="${safeAttr(record.id)}" class="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-sm">Open</button>
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
    <article class="crm-card bg-gray-900/60 border border-white/5 rounded-2xl p-4 transition hover:border-white/15 hover:bg-gray-800/80" data-record-id="${safeAttr(record.id)}" data-record-type="problem" data-status="" data-haystack="${safeAttr(haystack)}">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div class="min-w-0 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[11px] uppercase tracking-[0.28em] rounded-full bg-rose-950/80 border border-rose-400/30 px-2 py-1 text-rose-100">Problem</span>
            <h3 class="text-lg font-semibold text-white truncate">${safe(record.name || '(untitled problem)')}</h3>
          </div>
          ${renderCompactFacts([
            record.painSeverity ? `Pain ${record.painSeverity}` : '',
            linkedGroups.length ? `${linkedGroups.length} ${linkedGroups.length === 1 ? 'group' : 'groups'}` : '',
            linkedPeople.length ? `${linkedPeople.length} ${linkedPeople.length === 1 ? 'person' : 'people'}` : '',
            record.offerAmount ? `Impact ${record.offerAmount}` : '',
          ])}
          ${record.primaryPain && record.primaryPain !== record.name ? `<p class="text-sm text-gray-300">${safe(record.primaryPain)}</p>` : ''}
          ${renderCompactFacts([
            linkedGroups.length ? 'Groups linked' : '',
            linkedPeople.length ? 'People linked' : '',
            record.lastSignal ? `Signal ${record.lastSignal}` : '',
          ])}
          <p class="text-xs text-gray-400">Updated ${safe(formatUpdated(record.updated || record.created))}</p>
        </div>
        <div class="flex shrink-0 items-start">
          <button type="button" data-action="open-detail" data-record-id="${safeAttr(record.id)}" class="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-sm">Open</button>
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

function isWarmLeadCard(card) {
  const warmth = String(card?.dataset?.warmth || '').trim().toLowerCase();
  return warmth === 'warm' || (!warmth && isWarmLeadStatus(card?.dataset?.status || ''));
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
    const warmMiss = warmOnly && (recordType !== 'person' || !isWarmLeadCard(card));

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
  renderSalesMoves();
}

function renderSalesMoveRows(target, records, formatter) {
  if (!target) return;
  if (!records.length) {
    target.innerHTML = '<p class="text-sm text-gray-400">Nothing urgent in this lane right now.</p>';
    return;
  }
  target.innerHTML = records
    .slice(0, 4)
    .map(record => {
      const copy = formatter(record);
      return `
        <button
          type="button"
          data-action="open-detail"
          data-record-id="${safeAttr(record.id)}"
          class="w-full rounded-xl border border-white/10 bg-gray-950/45 px-3 py-3 text-left transition hover:border-sky-400/30 hover:bg-gray-900/70"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-white truncate">${safe(record.name || '(untitled lead)')}</p>
              <p class="text-xs text-gray-400 mt-1">${safe(copy.kicker)}</p>
            </div>
            <span class="text-[11px] uppercase tracking-[0.24em] text-sky-200/80">${safe(copy.badge)}</span>
          </div>
          <p class="text-sm text-gray-200 mt-2">${safe(copy.body)}</p>
        </button>
      `;
    })
    .join('');
}

function renderSalesMoves() {
  const people = state.board.people.filter(record => !isClosedStatus(record.status));
  const todayKey = normalizeFollowUpInput(new Date().toISOString().slice(0, 10));
  const staleCutoff = Date.now() - (SALES_STALE_DAYS * 24 * 60 * 60 * 1000);

  const followUpToday = people
    .filter(record => {
      const nextFollowUp = normalizeFollowUpInput(record.nextFollowUp || '');
      return Boolean(nextFollowUp && nextFollowUp <= todayKey);
    })
    .sort(comparePeopleByFollowUpThenName);

  const hotWithoutDraft = people
    .filter(record => resolveLeadWarmth(record) === 'hot' && !hasOutreachDraft(record.id))
    .sort((a, b) => String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || '')));

  const warmNotContacted = people
    .filter(record => {
      if (resolveLeadWarmth(record) !== 'warm') {
        return false;
      }
      if (!record.lastContacted) {
        return true;
      }
      const lastContacted = new Date(record.lastContacted);
      if (Number.isNaN(lastContacted.getTime())) {
        return true;
      }
      return lastContacted.getTime() <= staleCutoff;
    })
    .sort(comparePeopleByRecencyThenName);

  const repliesNeedingResponse = people
    .filter(needsReplyResponse)
    .sort((a, b) => String(b.lastReplyAt || '').localeCompare(String(a.lastReplyAt || '')));

  if (elements.salesMovesSummary) {
    const totalMoves = followUpToday.length + hotWithoutDraft.length + warmNotContacted.length + repliesNeedingResponse.length;
    elements.salesMovesSummary.textContent = totalMoves
      ? `${totalMoves} sales moves need attention across ${people.length} live leads.`
      : `No urgent sales moves right now across ${people.length} live leads.`;
  }
  if (elements.salesMovesFollowUpCount) elements.salesMovesFollowUpCount.textContent = String(followUpToday.length);
  if (elements.salesMovesHotDraftCount) elements.salesMovesHotDraftCount.textContent = String(hotWithoutDraft.length);
  if (elements.salesMovesWarmStaleCount) elements.salesMovesWarmStaleCount.textContent = String(warmNotContacted.length);
  if (elements.salesMovesRepliesCount) elements.salesMovesRepliesCount.textContent = String(repliesNeedingResponse.length);

  renderSalesMoveRows(elements.salesMovesFollowUpList, followUpToday, record => ({
    badge: 'Follow-up',
    kicker: record.nextFollowUp ? `Due ${record.nextFollowUp}` : 'No date set',
    body: record.nextBestAction || record.nextExperiment || record.primaryPain || 'Reach out and move the conversation forward.',
  }));
  renderSalesMoveRows(elements.salesMovesHotDraftList, hotWithoutDraft, record => ({
    badge: 'Hot lead',
    kicker: record.fit ? `${formatTitleCase(record.fit)} fit` : (record.company || record.status || 'Hot lead'),
    body: record.nextBestAction || 'Create a first outreach draft before this lead cools down.',
  }));
  renderSalesMoveRows(elements.salesMovesWarmStaleList, warmNotContacted, record => ({
    badge: 'Warm',
    kicker: record.lastContacted ? `Last touch ${timeAgo(record.lastContacted)}` : 'No touch logged yet',
    body: record.nextBestAction || record.objection || 'Send a soft check-in and keep the thread alive.',
  }));
  renderSalesMoveRows(elements.salesMovesRepliesList, repliesNeedingResponse, record => ({
    badge: 'Reply',
    kicker: record.lastReplyAt ? `Reply ${timeAgo(record.lastReplyAt)}` : 'Reply waiting',
    body: record.objection || record.nextBestAction || 'Answer the reply while the conversation is still warm.',
  }));
}

function putCrmRecord(record) {
  return new Promise((resolve, reject) => {
    crmRecords.get(record.id).put(record, ack => {
      if (ack && ack.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      crmIndex[record.id] = { ...(crmIndex[record.id] || {}), ...sanitizeCrmRecord(record), id: record.id };
      scheduleRender();
      resolve(record);
    });
  });
}

function putContactRecord(id, payload, space = getPreferredContactsSpace()) {
  return new Promise((resolve, reject) => {
    const node = getContactsWorkspaceNode(space);
    if (!node || typeof node.get !== 'function') {
      reject(new Error(`Unable to resolve contacts node for space: ${space}`));
      return;
    }
    node.get(id).put(payload, ack => {
      if (ack && ack.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      const index = getContactWorkspaceIndex(space);
      index[id] = { ...(index[id] || {}), ...payload, id };
      scheduleRender();
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
      delete crmIndex[id];
      scheduleRender();
      resolve();
    });
  });
}

function putLeadDrafts(recordId, payload) {
  return new Promise((resolve, reject) => {
    crmDraftsRoot.get(recordId).put(payload, ack => {
      if (ack && ack.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      resolve(payload);
    });
  });
}

function showDetailSalesNote(message = '', tone = 'sky') {
  if (!elements.detailSalesNote) return;
  const palette = tone === 'amber'
    ? 'border border-amber-500/30 bg-amber-950/40 text-amber-100'
    : tone === 'rose'
    ? 'border border-rose-500/30 bg-rose-950/40 text-rose-100'
    : 'border border-sky-500/30 bg-sky-950/40 text-sky-100';

  if (!message) {
    elements.detailSalesNote.className = 'hidden';
    elements.detailSalesNote.textContent = '';
    return;
  }

  elements.detailSalesNote.className = `rounded-lg px-3 py-2 text-xs ${palette}`;
  elements.detailSalesNote.textContent = message;
}

async function copyTextToClipboard(value) {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error('Nothing to copy.');
  }
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
  }
  const fallback = document.createElement('textarea');
  fallback.value = text;
  fallback.setAttribute('readonly', 'readonly');
  fallback.className = 'fixed -left-[9999px] top-0';
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand('copy');
  fallback.remove();
}

function buildMockDraft(record, draftType, tone = DEFAULT_DRAFT_TONE) {
  const firstName = String(record.name || 'there').trim().split(/\s+/)[0] || 'there';
  const fit = resolveLeadFit(record);
  const fitLine = fit ? `${formatTitleCase(fit)} support` : '3DVR support';
  const pain = String(record.primaryPain || record.currentWorkaround || record.objection || '').trim();
  const action = String(record.nextBestAction || record.nextExperiment || '').trim();
  const offer = String(record.offerAmount || '').trim();
  const company = String(record.company || '').trim();
  const subject = company || record.name || 'your team';
  const toneLine = tone === 'playful'
    ? 'Wanted to send a quick note before this drifted.'
    : tone === 'confident'
    ? 'I can help tighten this up fast.'
    : tone === 'friendly'
    ? 'Wanted to check in with a quick note.'
    : 'Following up with a focused note.';

  if (draftType === 'firstMessage') {
    return [
      `Hi ${firstName},`,
      '',
      `${toneLine} I think 3DVR could help ${subject} around ${pain || fitLine}.`,
      action ? `If it helps, the next best move is simple: ${action}.` : 'If it helps, I can sketch the cleanest next step from here.',
      offer ? `That likely fits inside ${offer}.` : '',
      '',
      'Thomas',
    ].filter(Boolean).join('\n');
  }

  if (draftType === 'followUp') {
    return [
      `Hi ${firstName},`,
      '',
      `Circling back on ${pain || fitLine}.`,
      action ? `If this is still live, I can take the next step on ${action}.` : 'If this is still active, I can send over the most useful next step.',
      '',
      'Thomas',
    ].filter(Boolean).join('\n');
  }

  if (draftType === 'softCheckIn') {
    return [
      `Hi ${firstName},`,
      '',
      'Quick check-in in case the timing is better now.',
      pain ? `I still think there is a clean way to help with ${pain}.` : 'I still think there is a clean way to help here.',
      action ? `Happy to take ${action} if that would help.` : 'Happy to send a simple outline if useful.',
      '',
      'Thomas',
    ].filter(Boolean).join('\n');
  }

  return [
    `Hi ${firstName},`,
    '',
    `Here is the direct offer from my side: I can help ${subject} with ${pain || fitLine}.`,
    offer ? `The current scope would land around ${offer}.` : '',
    action ? `Next best action: ${action}.` : 'If that is useful, I can send the next step today.',
    '',
    'Thomas',
  ].filter(Boolean).join('\n');
}

async function generateOutreachDraft(record, draftType, tone = DEFAULT_DRAFT_TONE) {
  if (window.crmOutreach && typeof window.crmOutreach.generateDraft === 'function') {
    const response = await window.crmOutreach.generateDraft({
      record,
      draftType,
      tone,
      drafts: getLeadDraftBundle(record.id),
    });
    return String(response || '').trim();
  }
  return buildMockDraft(record, draftType, tone);
}

function appendTouchLogEntry(record = {}, {
  touchType = 'outreach-sent',
  note = '',
  followUp = '',
  source = 'CRM workspace',
  statusAfter = '',
  draftType = '',
  timestamp = new Date().toISOString(),
} = {}) {
  const normalizedRecord = sanitizeCrmRecord(record);
  const normalizedType = normalizeTouchType(touchType);
  const logId = `${normalizedRecord.id || 'crm'}-${generateId()}`;
  const entry = {
    id: logId,
    recordId: normalizedRecord.contactId || normalizedRecord.id || '',
    crmRecordId: normalizedRecord.id || '',
    contactId: normalizedRecord.contactId || '',
    contactName: normalizedRecord.name || normalizedRecord.email || 'Unnamed contact',
    timestamp,
    followUp: normalizeFollowUpInput(followUp || normalizedRecord.nextFollowUp || ''),
    note: String(note || '').trim(),
    touchType: normalizedType,
    touchTypeLabel: getTouchTypeLabel(normalizedType),
    draftType: String(draftType || '').trim(),
    source,
    segment: normalizedRecord.marketSegment || '',
    statusAfter: statusAfter || normalizedRecord.status || '',
    participantId: getParticipantId(),
    loggedBy: getParticipantLabel(),
  };
  touchLogRoot.get(logId).put(entry);
  touchLogIndex.set(logId, entry);
  renderWeeklyChallenge();
  renderSalesMoves();
  return entry;
}

async function saveLeadDraft(recordId, draftType, content) {
  const record = sanitizeCrmRecord(crmIndex[recordId] || state.board.index[recordId] || {});
  if (!record.id || record.recordType !== 'person') {
    throw new Error('Only person records can store outreach drafts.');
  }

  const draftConfig = getDraftTypeConfig(draftType);
  const previous = getLeadDraftBundle(recordId);
  const nextValue = String(content || '').trim();
  const now = new Date().toISOString();
  const payload = sanitizeDraftBundle(recordId, {
    ...previous,
    leadId: recordId,
    [draftConfig.value]: nextValue,
    updated: now,
    updatedBy: getParticipantLabel(),
  });
  await putLeadDrafts(recordId, payload);
  draftIndex.set(recordId, payload);
  renderSalesMoves();

  if (nextValue && nextValue !== previous[draftConfig.value]) {
    appendTouchLogEntry(record, {
      touchType: 'drafted',
      note: `Saved ${draftConfig.label.toLowerCase()} draft.`,
      followUp: record.nextFollowUp || '',
      source: 'CRM drafts',
      statusAfter: record.status || '',
      draftType: draftConfig.value,
      timestamp: now,
    });
  }

  return payload;
}

function renderDraftCards(record) {
  if (!elements.detailDrafts) return;
  if (record.recordType !== 'person') {
    elements.detailDrafts.innerHTML = '';
    return;
  }

  const bundle = getLeadDraftBundle(record.id);
  elements.detailDrafts.innerHTML = `
    <section class="space-y-4 rounded-lg border border-white/10 bg-gray-800/80 p-4">
      <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.32em] text-sky-300">Outreach drafts</p>
          <h3 class="text-lg font-semibold text-white">Human-in-the-loop messages</h3>
          <p class="text-sm text-gray-300">Save one working draft per move, copy it fast, or use the mock generator as an AI hook.</p>
        </div>
        <p class="text-xs text-gray-400">${bundle.updated ? `Last saved ${formatUpdated(bundle.updated)} by ${safe(bundle.updatedBy || 'Unknown')}` : 'No outreach drafts saved yet.'}</p>
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        ${DRAFT_TYPE_OPTIONS.map(option => `
          <article class="rounded-xl border border-white/10 bg-gray-950/45 p-4 space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h4 class="text-sm font-semibold text-white">${safe(option.label)}</h4>
                <p class="text-xs text-gray-400 mt-1">${safe(option.description)}</p>
              </div>
              <span class="text-[11px] uppercase tracking-[0.24em] text-sky-200/80">${safe(option.value)}</span>
            </div>
            <textarea
              data-draft-input
              data-record-id="${safeAttr(record.id)}"
              data-draft-type="${safeAttr(option.value)}"
              rows="6"
              class="w-full rounded-lg border border-white/10 bg-gray-900/70 p-3 text-sm text-white"
              placeholder="Write the ${safeAttr(option.label.toLowerCase())} here"
            >${safe(bundle[option.value] || '')}</textarea>
            <div class="flex flex-wrap gap-2">
              <button type="button" data-action="save-draft" data-record-id="${safeAttr(record.id)}" data-draft-type="${safeAttr(option.value)}" class="bg-sky-500 hover:bg-sky-400 text-white text-sm px-3 py-1.5 rounded">Save</button>
              <button type="button" data-action="copy-draft" data-record-id="${safeAttr(record.id)}" data-draft-type="${safeAttr(option.value)}" class="bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded">Copy</button>
              <button type="button" data-action="generate-draft" data-record-id="${safeAttr(record.id)}" data-draft-type="${safeAttr(option.value)}" class="bg-indigo-500 hover:bg-indigo-400 text-white text-sm px-3 py-1.5 rounded">Mock generate</button>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderTimeline(record) {
  if (!elements.detailTimeline) return;
  if (record.recordType !== 'person') {
    elements.detailTimeline.innerHTML = '';
    return;
  }

  const entries = getRecordTimelineEntries(record);
  elements.detailTimeline.innerHTML = `
    <section class="space-y-4 rounded-lg border border-white/10 bg-gray-800/80 p-4">
      <div>
        <p class="text-xs uppercase tracking-[0.32em] text-sky-300">Interaction timeline</p>
        <h3 class="text-lg font-semibold text-white">Append-only history</h3>
        <p class="text-sm text-gray-300">Drafts, touches, replies, and outcome changes stay in one timeline.</p>
      </div>
      <div class="space-y-3 ${entries.length > 6 ? 'max-h-96 overflow-y-auto pr-1' : ''}">
        ${entries.length ? entries.map(entry => `
          <article class="rounded-xl border border-white/10 bg-gray-950/45 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-semibold text-white">${safe(entry.touchTypeLabel || getTouchTypeLabel(entry.touchType))}</p>
              <p class="text-xs text-gray-400">${safe(entry.timestamp ? formatUpdated(entry.timestamp) : 'Unknown time')}</p>
            </div>
            <p class="text-xs text-sky-200 mt-1">${safe(entry.source || 'CRM workspace')}${entry.draftType ? ` · ${safe(getDraftTypeConfig(entry.draftType).label)}` : ''}${entry.followUp ? ` · Follow-up ${safe(entry.followUp)}` : ''}</p>
            ${entry.note ? `<p class="text-sm text-gray-200 mt-2 whitespace-pre-wrap">${safe(entry.note)}</p>` : ''}
            <p class="text-xs text-gray-400 mt-2">Logged by ${safe(entry.loggedBy || entry.participantId || 'Unknown')}</p>
          </article>
        `).join('') : '<p class="text-sm text-gray-400">Timeline entries will appear here after you save a draft, log a touch, or schedule follow-up.</p>'}
      </div>
    </section>
  `;
}

async function ensureContact(recordId) {
  const record = sanitizeCrmRecord(crmIndex[recordId] || state.board.index[recordId] || {});
  if (!record.id || record.recordType !== 'person') {
    window.alert('Only person records can sync to contacts.');
    return;
  }

  const now = new Date().toISOString();
  const targetSpace = getPreferredContactsSpace();
  const existing = findContactInWorkspace(record, { space: targetSpace, allowFallback: false });
  if (existing) {
    if (existing.data?.crmId !== record.id) {
      await putContactRecord(existing.id, {
        ...existing.data,
        crmId: record.id,
        syncedFromCrmAt: now,
        updated: now,
      }, targetSpace);
    }
    await putCrmRecord({
      ...record,
      contactId: existing.id,
      syncedToContactsAt: now,
      updated: now,
      created: record.created || now,
    });
    openContactsWorkspace(existing.id, targetSpace);
    return;
  }

  const targetIndex = getContactWorkspaceIndex(targetSpace);
  const contactId = record.contactId && !targetIndex[record.contactId]
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
  }, targetSpace);
  await putCrmRecord({
    ...record,
    contactId,
    syncedToContactsAt: now,
    updated: now,
    created: record.created || now,
  });
  openContactsWorkspace(contactId, targetSpace);
}

function openContactsWorkspace(contactId, space = getPreferredContactsSpace()) {
  const url = new URL('../contacts/index.html', window.location.href);
  url.searchParams.set('space', space);
  if (contactId) {
    url.searchParams.set('contact', contactId);
  }
  window.location.href = url.toString();
}

function updateContactsLinks() {
  const space = getPreferredContactsSpace();
  const url = new URL('../contacts/index.html', window.location.href);
  url.searchParams.set('space', space);
  const href = url.toString();
  document.querySelectorAll('[data-contacts-link]').forEach(link => {
    link.setAttribute('href', href);
  });
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
            <label class="block text-sm text-gray-200">Touch type</label>
            <select data-touch-type class="w-full p-2 rounded text-black">
              ${TOUCH_TYPE_OPTIONS.map(option => `<option value="${safeAttr(option.value)}">${safe(option.label)}</option>`).join('')}
            </select>
          </div>
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
    const typeInput = overlay.querySelector('[data-touch-type]');
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
      close({ notes: '', followUp: '', touchType: typeInput ? typeInput.value : 'outreach-sent' });
    });
    form?.addEventListener('submit', event => {
      event.preventDefault();
      close({
        notes: noteInput ? noteInput.value.trim() : '',
        followUp: followInput ? followInput.value : '',
        touchType: typeInput ? typeInput.value : 'outreach-sent',
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
  const touchType = normalizeTouchType(promptResult.touchType);
  const touchTypeLabel = getTouchTypeLabel(touchType);
  const nextStatus = deriveStatusFromTouch(record, touchType);
  const isReply = touchType === 'reply-received';
  const followUp = normalizeFollowUpInput(promptResult.followUp || record.nextFollowUp || '');
  const touchNotes = String(promptResult.notes || '').trim();
  const notePrefix = touchNotes ? `[${touchTypeLabel} ${new Date(now).toLocaleString()}] ${touchNotes}` : '';
  const mergedNotes = notePrefix
    ? (record.notes ? `${record.notes}\n\n${notePrefix}` : notePrefix)
    : record.notes || '';

  await putCrmRecord(pruneRecordForType({
    ...record,
    id: recordId,
    status: nextStatus,
    lastContacted: now,
    activityCount: toActivityCount(record.activityCount) + 1,
    nextFollowUp: touchType === 'closed-won' || touchType === 'not-a-fit' ? '' : (followUp || record.nextFollowUp || ''),
    lastReplyAt: isReply ? now : String(record.lastReplyAt || ''),
    replyCount: isReply ? toActivityCount(record.replyCount) + 1 : toActivityCount(record.replyCount),
    lastTouchType: touchType,
    pilotStatus: touchType === 'not-a-fit' ? 'Not a fit' : record.pilotStatus || '',
    notes: mergedNotes,
    updated: now,
    created: record.created || now,
  }));
  appendTouchLogEntry({
    ...record,
    status: nextStatus,
  }, {
    touchType,
    followUp: followUp || record.nextFollowUp || '',
    note: touchNotes,
    source: 'CRM workspace',
    statusAfter: nextStatus,
    timestamp: now,
  });
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
  })).then(() => {
    appendTouchLogEntry(record, {
      touchType: 'follow-up-scheduled',
      followUp: base.toISOString().slice(0, 10),
      note: 'Scheduled the next follow-up.',
      source: 'CRM workspace',
      statusAfter: record.status || '',
    });
  }).catch(err => {
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
      ['Warmth', resolveLeadWarmth(record) ? formatTitleCase(resolveLeadWarmth(record)) : '—'],
      ['Fit', resolveLeadFit(record) ? formatTitleCase(resolveLeadFit(record)) : '—'],
      ['Urgency', resolveLeadUrgency(record) ? formatTitleCase(resolveLeadUrgency(record)) : '—'],
      ['Group', context.group?.name || '—'],
      ['Market segment', record.marketSegment || '—'],
      ['Primary pain', record.primaryPain || '—'],
      ['Pain severity', record.painSeverity || '—'],
      ['Current workaround', record.currentWorkaround || '—'],
      ['Objection', record.objection || '—'],
      ['Pilot status', record.pilotStatus || '—'],
      ['Offer amount', record.offerAmount || '—'],
      ['Last signal', record.lastSignal || '—'],
      ['Next experiment', record.nextExperiment || '—'],
      ['Next best action', record.nextBestAction || '—'],
      ['Next follow-up', record.nextFollowUp || '—'],
      ['Last contacted', record.lastContacted ? `${timeAgo(record.lastContacted)} · ${new Date(record.lastContacted).toLocaleString()}` : '—'],
      ['Touches', toActivityCount(record.activityCount)],
      ['Replies', toActivityCount(record.replyCount)],
      ['Last reply', record.lastReplyAt ? `${timeAgo(record.lastReplyAt)} · ${new Date(record.lastReplyAt).toLocaleString()}` : '—'],
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

  const preferredSpace = getPreferredContactsSpace();
  const workspaceMatch = findContactInWorkspace(record, { space: preferredSpace, allowFallback: false });
  return `
    <div class="space-y-3">
      <div class="rounded-lg border border-white/10 bg-gray-950/45 p-4">
        <p class="text-sm font-semibold text-gray-100">Sales cockpit</p>
        <p class="text-xs text-gray-400 mt-1">${safe(record.nextBestAction || record.nextExperiment || 'Choose the next human move and keep it explicit.')}</p>
        ${renderBadgeRow([
          resolveLeadWarmth(record) ? `Warmth ${formatTitleCase(resolveLeadWarmth(record))}` : '',
          resolveLeadFit(record) ? `Fit ${formatTitleCase(resolveLeadFit(record))}` : '',
          resolveLeadUrgency(record) ? `Urgency ${formatTitleCase(resolveLeadUrgency(record))}` : '',
        ])}
      </div>
      <div class="rounded-lg border ${workspaceMatch ? 'border-teal-500/30 bg-teal-900/40' : 'border-white/10 bg-gray-800/80'} p-4">
        <p class="text-sm font-semibold ${workspaceMatch ? 'text-teal-200' : 'text-gray-100'}">${workspaceMatch ? 'Linked contacts entry' : 'No linked contact yet'}</p>
        <p class="text-xs mt-1 ${workspaceMatch ? 'text-teal-100/80' : 'text-gray-400'}">${workspaceMatch ? safe(workspaceMatch.data?.name || '(untitled contact)') : `Use “Add to contacts” to place this person in ${getContactsSpaceLabel(preferredSpace)}.`}</p>
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
    <a href="${safeAttr(buildEmailOperatorHref(record))}" class="inline-flex items-center justify-center bg-sky-500 hover:bg-sky-400 text-white text-sm px-3 py-1.5 rounded">Queue outreach</a>
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
  showDetailSalesNote('');
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
  renderDraftCards(record);
  renderTimeline(record);
  elements.detailOverlay?.classList.remove('hidden');
  elements.detailOverlay.scrollTop = 0;
}

function closeDetail() {
  state.detailId = '';
  showDetailSalesNote('');
  if (elements.detailDrafts) elements.detailDrafts.innerHTML = '';
  if (elements.detailTimeline) elements.detailTimeline.innerHTML = '';
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
        <p class="text-xs text-sky-200 mt-1">${safe(entry.touchTypeLabel || getTouchTypeLabel(entry.touchType))}${entry.segment ? ` • ${safe(entry.segment)}` : ''}${entry.source ? ` • ${safe(entry.source)}` : ''}</p>
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
  const hasDraft = params.has('type') || Object.values(draft).some(value => Boolean(value));
  if (!hasDraft) return;
  state.draftApplied = true;
  openCreateOverlay({
    type: draft.type || 'person',
    preset: {
      recordType: draft.type || 'person',
      name: draft.lead || draft.name,
      email: draft.email,
      company: draft.company,
      phone: draft.phone,
      role: draft.role,
      tags: draft.tags,
      status: draft.status,
      warmth: draft.warmth,
      fit: draft.fit,
      urgency: draft.urgency,
      nextFollowUp: draft.nextFollowUp,
      lastContacted: draft.lastContacted,
      marketSegment: draft.marketSegment,
      groupId: draft.groupId,
      primaryPain: draft.primaryPain,
      painSeverity: draft.painSeverity,
      currentWorkaround: draft.currentWorkaround,
      pilotStatus: draft.pilotStatus,
      offerAmount: draft.offerAmount,
      lastSignal: draft.lastSignal,
      nextExperiment: draft.nextExperiment,
      nextBestAction: draft.nextBestAction,
      objection: draft.objection,
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
      warmth: 'warm',
      fit: '',
      urgency: '',
      primaryPain: pain,
      objection: '',
      nextBestAction: '',
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

async function handleImportPicker() {
  if (!supportsDeviceContactPicker(window.navigator)) {
    showImportStatus('This browser cannot open the phone contact picker. Import a .vcf or .csv file instead.', 'warn');
    elements.importFile?.click();
    return;
  }

  showImportStatus('Opening the phone contact picker…', 'info');
  try {
    const records = await pickDeviceContacts({
      navigatorLike: window.navigator,
      multiple: true,
      source: 'Phone import',
      now: new Date().toISOString(),
      idFactory: generateId,
    });
    if (!records.length) {
      showImportStatus('No contacts were selected from the phone picker.', 'warn');
      return;
    }
    const summary = await importContactsIntoCrm(records, { sourceLabel: 'Phone import' });
    showImportStatus(
      `Imported ${summary.created} new and updated ${summary.updated} existing lead${summary.total === 1 ? '' : 's'} from your phone.`,
      'success'
    );
  } catch (err) {
    if (err && err.name === 'AbortError') {
      showImportStatus('Phone contact picking was canceled.', 'warn');
      return;
    }
    console.error('Unable to import phone contacts into CRM', err);
    showImportStatus(`Phone contact import failed: ${err.message}`, 'error');
  }
}

async function handleImportFiles(event) {
  const files = Array.from(event.target?.files || []);
  if (!files.length) return;

  try {
    let created = 0;
    let updated = 0;
    for (const file of files) {
      const text = await file.text();
      const records = parseContactFileText(text, file.name, {
        now: new Date().toISOString(),
        idFactory: generateId,
        source: 'Phone import file',
      });
      if (!records.length) continue;
      const summary = await importContactsIntoCrm(records, { sourceLabel: 'Phone import file' });
      created += summary.created;
      updated += summary.updated;
    }
    const total = created + updated;
    showImportStatus(
      total
        ? `Imported ${created} new and updated ${updated} existing lead${total === 1 ? '' : 's'} from uploaded file(s).`
        : 'No leads were detected in the uploaded files.',
      total ? 'success' : 'warn'
    );
  } catch (err) {
    console.error('Unable to import CRM files', err);
    showImportStatus(`CRM import failed: ${err.message}`, 'error');
  } finally {
    if (elements.importFile) {
      elements.importFile.value = '';
    }
  }
}

function getDetailDraftInput(recordId, draftType) {
  if (!elements.detailDrafts) return null;
  const safeRecordId = escapeSelectorValue(recordId);
  const safeDraftType = escapeSelectorValue(draftType);
  return elements.detailDrafts.querySelector(`[data-draft-input][data-record-id="${safeRecordId}"][data-draft-type="${safeDraftType}"]`);
}

async function handleDraftAction(action, recordId, draftType) {
  const record = sanitizeCrmRecord(crmIndex[recordId] || state.board.index[recordId] || {});
  if (!record.id || record.recordType !== 'person') {
    showDetailSalesNote('Only person records can use outreach drafts.', 'rose');
    return;
  }

  const input = getDetailDraftInput(recordId, draftType);
  const draftConfig = getDraftTypeConfig(draftType);

  try {
    if (action === 'copy-draft') {
      const value = String(input?.value || getLeadDraftBundle(recordId)[draftConfig.value] || '').trim();
      await copyTextToClipboard(value);
      showDetailSalesNote(`Copied ${draftConfig.label.toLowerCase()} to the clipboard.`, 'sky');
      return;
    }

    if (action === 'generate-draft') {
      const nextValue = await generateOutreachDraft(record, draftConfig.value, getLeadDraftBundle(recordId).tone || DEFAULT_DRAFT_TONE);
      if (input) {
        input.value = nextValue;
      }
      await saveLeadDraft(recordId, draftConfig.value, nextValue);
      renderTimeline(record);
      showDetailSalesNote(`Generated and saved a mock ${draftConfig.label.toLowerCase()}.`, 'amber');
      return;
    }

    if (action === 'save-draft') {
      await saveLeadDraft(recordId, draftConfig.value, input?.value || '');
      renderTimeline(record);
      showDetailSalesNote(`Saved ${draftConfig.label.toLowerCase()}.`, 'sky');
    }
  } catch (err) {
    console.error(`Unable to ${action}`, err);
    showDetailSalesNote(`Unable to ${draftConfig.label.toLowerCase()} right now.`, 'rose');
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
  elements.importPicker?.addEventListener('click', handleImportPicker);
  elements.importFile?.addEventListener('change', handleImportFiles);
  elements.importGoogle?.addEventListener('click', async () => {
    await importOauthContacts('google');
  });
  elements.importMicrosoft?.addEventListener('click', async () => {
    await importOauthContacts('microsoft');
  });
  elements.draftBuilder?.addEventListener('click', () => openCreateOverlay({ type: 'person', preset: SALES_DRAFT_PRESETS.builder }));
  elements.draftEmbedded?.addEventListener('click', () => openCreateOverlay({ type: 'person', preset: SALES_DRAFT_PRESETS.embedded }));
  elements.draftCustom?.addEventListener('click', () => openCreateOverlay({ type: 'person', preset: SALES_DRAFT_PRESETS.custom }));
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
  [
    elements.salesMovesFollowUpList,
    elements.salesMovesHotDraftList,
    elements.salesMovesWarmStaleList,
    elements.salesMovesRepliesList,
  ].forEach(section => {
    section?.addEventListener('click', handleDetailActionClick);
  });
  elements.detailDrafts?.addEventListener('click', async event => {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    event.preventDefault();
    event.stopPropagation();
    await handleDraftAction(
      actionTarget.dataset.action || '',
      actionTarget.dataset.recordId || '',
      actionTarget.dataset.draftType || ''
    );
  });
}

function startSync() {
  if (!user.is && signedIn && authMethod !== PORTAL_OAUTH_AUTH_METHOD && alias && password) {
    user.auth(alias, password, ack => {
      if (ack && ack.err) {
        console.warn('CRM auth failed', ack.err);
      }
    });
  }

  contactsWorkspaceOrg.map().on((data, id) => {
    if (!id) return;
    if (!data) {
      delete contactWorkspaceOrgIndex[id];
    } else {
      contactWorkspaceOrgIndex[id] = { ...(contactWorkspaceOrgIndex[id] || {}), ...data, id };
    }
    scheduleRender();
  });

  if (signedIn && contactsWorkspacePersonal && typeof contactsWorkspacePersonal.map === 'function') {
    contactsWorkspacePersonal.map().on((data, id) => {
      if (!id) return;
      if (!data) {
        delete contactWorkspacePersonalIndex[id];
      } else {
        contactWorkspacePersonalIndex[id] = { ...(contactWorkspacePersonalIndex[id] || {}), ...data, id };
      }
      scheduleRender();
    });
  }

  crmDraftsRoot.map().on((data, id) => {
    if (!id) return;
    if (!data) {
      draftIndex.delete(id);
    } else {
      draftIndex.set(id, sanitizeDraftBundle(id, data));
    }
    renderSalesMoves();
  });

  touchLogRoot.map().on((data, id) => {
    if (!id) return;
    if (!data) {
      touchLogIndex.delete(id);
    } else {
      touchLogIndex.set(id, {
        ...sanitizeCrmRecord(data),
        id,
        recordId: String(data.recordId || '').trim(),
        crmRecordId: String(data.crmRecordId || '').trim(),
        contactId: String(data.contactId || '').trim(),
        timestamp: data.timestamp || data.time || data.lastContacted || '',
        touchType: normalizeTouchType(data.touchType || ''),
        touchTypeLabel: data.touchTypeLabel || getTouchTypeLabel(data.touchType || ''),
        draftType: String(data.draftType || '').trim(),
      });
    }
    renderWeeklyChallenge();
    renderSalesMoves();
    if (state.detailId) {
      const currentRecord = sanitizeCrmRecord(crmIndex[state.detailId] || state.board.index[state.detailId] || {});
      if (currentRecord.id) {
        renderTimeline(currentRecord);
      }
    }
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
  refreshImportControls();
  refreshOauthImportControls();
  populateStaticSelects();
  refreshRelationshipControls();
  fillCreateForm({ recordType: 'person', status: DEFAULT_PERSON_STATUS });
  attachEvents();
  consumePendingOauthImportResult();
  startIdentityBadge();
  updateContactsLinks();
  refreshCellContextBanner();
  startSync();
  renderWeeklyChallenge();
  renderList();
  applyUrlDraftIfNeeded();
}

init();
