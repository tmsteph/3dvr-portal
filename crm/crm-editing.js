const DEFAULT_STATUS_OPTIONS = Object.freeze([
  '',
  'Warm - Awareness',
  'Warm - Discovery',
  'Warm - Invited',
  'Warm - Follow-up',
  'Lead',
  'Prospect',
  'Active',
  'Negotiating',
  'Won',
  'Lost',
]);

const DEFAULT_MARKET_SEGMENT_OPTIONS = Object.freeze([
  '',
  'Professional services',
  'Local services',
  'Support team or community org',
  'Owner-led service business',
  'Creative studio or agency',
  'Event or AV operator',
  'Educator or community org',
  'Independent builder or side-hustle',
]);

const DEFAULT_PAIN_SEVERITY_OPTIONS = Object.freeze([
  '',
  'Low',
  'Medium',
  'High',
  'Critical',
]);

const DEFAULT_PILOT_STATUS_OPTIONS = Object.freeze([
  '',
  'Watching',
  'Warm',
  'Pilot candidate',
  'Pilot active',
  'Customer',
  'Not a fit',
]);

const DEFAULT_WARMTH_OPTIONS = Object.freeze([
  Object.freeze({ value: '', label: 'Warmth' }),
  Object.freeze({ value: 'cold', label: 'Cold' }),
  Object.freeze({ value: 'warm', label: 'Warm' }),
  Object.freeze({ value: 'hot', label: 'Hot' }),
]);

const DEFAULT_FIT_OPTIONS = Object.freeze([
  Object.freeze({ value: '', label: 'Fit' }),
  Object.freeze({ value: 'website', label: 'Website' }),
  Object.freeze({ value: 'branding', label: 'Branding' }),
  Object.freeze({ value: 'app', label: 'App' }),
  Object.freeze({ value: 'support', label: 'Support' }),
  Object.freeze({ value: 'consulting', label: 'Consulting' }),
]);

const DEFAULT_URGENCY_OPTIONS = Object.freeze([
  Object.freeze({ value: '', label: 'Urgency' }),
  Object.freeze({ value: 'low', label: 'Low' }),
  Object.freeze({ value: 'medium', label: 'Medium' }),
  Object.freeze({ value: 'high', label: 'High' }),
]);

const DEFAULT_RECORD_TYPE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'person', label: 'Person / lead' }),
  Object.freeze({ value: 'group', label: 'Group / account' }),
  Object.freeze({ value: 'problem', label: 'Problem / pain' }),
]);

const DEFAULT_CONVERSATION_RELATIONSHIP_OPTIONS = Object.freeze([
  'Friend',
  'Coworker',
  'Client',
  'Family',
  'Stranger',
  'Business Owner',
  'Other',
]);

const DEFAULT_CONVERSATION_CONTACT_METHOD_OPTIONS = Object.freeze([
  'Phone',
  'Email',
  'Instagram',
  'Facebook',
  'In person only',
]);

const DEFAULT_CONVERSATION_PROJECT_TYPE_OPTIONS = Object.freeze([
  'Business',
  'Personal brand',
  'Product',
  'Event',
  'Service',
  'Art/music',
  'Community',
  'Existing website',
  'Just curious',
  'Nothing yet',
]);

const DEFAULT_CONVERSATION_PAIN_POINT_OPTIONS = Object.freeze([
  'No website',
  'Website outdated',
  'Too expensive',
  'Too confusing',
  'No time',
  'Needs design',
  'Needs hosting',
  'Needs marketing',
  'Needs online payments',
  'Needs booking/forms',
  'Not sure yet',
]);

const DEFAULT_CONVERSATION_PLAN_OPTIONS = Object.freeze([
  'Free',
  '$5/mo',
  '$20/mo',
  '$50/mo',
  'Custom',
  'Not interested yet',
]);

const DEFAULT_CONVERSATION_INTEREST_LEVEL_OPTIONS = Object.freeze([
  'Ready now',
  'Interested',
  'Maybe later',
  'Polite only',
  'Not a fit',
]);

const DEFAULT_CONVERSATION_NEXT_ACTION_OPTIONS = Object.freeze([
  'Send link',
  'Send pricing',
  'Send example site',
  'Make free homepage',
  'Schedule call',
  'Ask again later',
  'Introduce to team',
  'No action',
]);

export const CRM_STATUS_OPTIONS = DEFAULT_STATUS_OPTIONS;
export const CRM_MARKET_SEGMENT_OPTIONS = DEFAULT_MARKET_SEGMENT_OPTIONS;
export const CRM_PAIN_SEVERITY_OPTIONS = DEFAULT_PAIN_SEVERITY_OPTIONS;
export const CRM_PILOT_STATUS_OPTIONS = DEFAULT_PILOT_STATUS_OPTIONS;
export const CRM_WARMTH_OPTIONS = DEFAULT_WARMTH_OPTIONS;
export const CRM_FIT_OPTIONS = DEFAULT_FIT_OPTIONS;
export const CRM_URGENCY_OPTIONS = DEFAULT_URGENCY_OPTIONS;
export const CRM_RECORD_TYPE_OPTIONS = DEFAULT_RECORD_TYPE_OPTIONS;
export const CRM_CONVERSATION_RELATIONSHIP_OPTIONS = DEFAULT_CONVERSATION_RELATIONSHIP_OPTIONS;
export const CRM_CONVERSATION_CONTACT_METHOD_OPTIONS = DEFAULT_CONVERSATION_CONTACT_METHOD_OPTIONS;
export const CRM_CONVERSATION_PROJECT_TYPE_OPTIONS = DEFAULT_CONVERSATION_PROJECT_TYPE_OPTIONS;
export const CRM_CONVERSATION_PAIN_POINT_OPTIONS = DEFAULT_CONVERSATION_PAIN_POINT_OPTIONS;
export const CRM_CONVERSATION_PLAN_OPTIONS = DEFAULT_CONVERSATION_PLAN_OPTIONS;
export const CRM_CONVERSATION_INTEREST_LEVEL_OPTIONS = DEFAULT_CONVERSATION_INTEREST_LEVEL_OPTIONS;
export const CRM_CONVERSATION_NEXT_ACTION_OPTIONS = DEFAULT_CONVERSATION_NEXT_ACTION_OPTIONS;

export function createCrmEditingManager(initialIds = []) {
  const editing = new Set();
  if (Array.isArray(initialIds)) {
    initialIds.forEach(id => {
      if (id) {
        editing.add(String(id));
      }
    });
  }

  const manager = {
    enter(id) {
      if (!id) return false;
      const key = String(id);
      const sizeBefore = editing.size;
      editing.add(key);
      return editing.size !== sizeBefore;
    },
    exit(id) {
      if (!id) return false;
      return editing.delete(String(id));
    },
    isEditing(id) {
      if (!id) return false;
      return editing.has(String(id));
    },
    list() {
      return Array.from(editing);
    },
    clear() {
      const hadEntries = editing.size > 0;
      editing.clear();
      return hadEntries;
    },
    count() {
      return editing.size;
    },
    markRecords(records) {
      return (Array.isArray(records) ? records : []).map(record => ({
        record,
        editing: record && record.id != null ? editing.has(String(record.id)) : false,
      }));
    },
  };

  return manager;
}

export function normalizeCrmRecordType(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'group' || normalized === 'problem') {
    return normalized;
  }
  return 'person';
}

export function normalizeCrmWarmth(value = '', fallbackStatus = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'cold' || normalized === 'warm' || normalized === 'hot') {
    return normalized;
  }

  const status = String(fallbackStatus || '').trim().toLowerCase();
  if (status === 'active' || status === 'negotiating' || status === 'won') {
    return 'hot';
  }
  if (status.startsWith('warm -')) {
    return 'warm';
  }
  if (status === 'lead' || status === 'prospect' || status === 'lost') {
    return 'cold';
  }
  return '';
}

export function normalizeCrmFit(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'website' || normalized === 'branding' || normalized === 'app' || normalized === 'support' || normalized === 'consulting') {
    return normalized;
  }
  return '';
}

export function normalizeCrmUrgency(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return '';
}

export function parseCrmList(value) {
  const parts = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,]/);
  const output = [];
  const seen = new Set();

  parts.forEach(entry => {
    const normalized = String(entry || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    output.push(normalized);
  });

  return output;
}

export function serializeCrmList(value) {
  return parseCrmList(value).join(', ');
}

function normalizeConversationOption(value = '', options = []) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = (Array.isArray(options) ? options : []).find(option => (
    String(option || '').trim().toLowerCase() === raw.toLowerCase()
  ));
  return match || raw;
}

export function normalizeConversationCaptureList(value = [], options = []) {
  const parts = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
    ? Object.keys(value)
      .filter(key => key !== '_')
      .sort((a, b) => Number(a) - Number(b))
      .map(key => value[key])
    : String(value || '').split(/[\n,]/);
  const output = [];
  const seen = new Set();

  parts.forEach(entry => {
    const normalized = normalizeConversationOption(entry, options);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push(normalized);
  });

  return output;
}

function normalizeIsoDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString();
}

function createConversationCaptureId(now, idFactory) {
  if (typeof idFactory === 'function') {
    return String(idFactory() || '').trim();
  }
  const timestamp = now instanceof Date && !Number.isNaN(now.getTime())
    ? now.getTime()
    : Date.now();
  return `conversation-${timestamp}`;
}

export function sanitizeConversationCaptureRecord(data = {}) {
  const clean = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (key === '_' || typeof value === 'function') return;
    clean[key] = value;
  });

  clean.id = String(clean.id || '').trim();
  clean.personId = String(clean.personId || '').trim();
  clean.name = String(clean.name || '').trim();
  clean.relationship = normalizeConversationOption(clean.relationship, CRM_CONVERSATION_RELATIONSHIP_OPTIONS);
  clean.contactMethod = normalizeConversationOption(clean.contactMethod, CRM_CONVERSATION_CONTACT_METHOD_OPTIONS);
  clean.contactDetail = String(clean.contactDetail || '').trim();
  clean.projectType = normalizeConversationOption(clean.projectType, CRM_CONVERSATION_PROJECT_TYPE_OPTIONS);
  clean.projectDescription = String(clean.projectDescription || '').trim();
  clean.painPoints = normalizeConversationCaptureList(clean.painPoints, CRM_CONVERSATION_PAIN_POINT_OPTIONS);
  clean.exactWords = String(clean.exactWords || '').trim();
  clean.interestedPlan = normalizeConversationOption(clean.interestedPlan, CRM_CONVERSATION_PLAN_OPTIONS);
  clean.signupTrigger = String(clean.signupTrigger || '').trim();
  clean.interestLevel = normalizeConversationOption(clean.interestLevel, CRM_CONVERSATION_INTEREST_LEVEL_OPTIONS);
  clean.nextAction = normalizeConversationOption(clean.nextAction, CRM_CONVERSATION_NEXT_ACTION_OPTIONS);
  clean.followUpDate = String(clean.followUpDate || '').trim();
  clean.createdAt = normalizeIsoDate(clean.createdAt);
  clean.updatedAt = normalizeIsoDate(clean.updatedAt);
  clean.source = String(clean.source || 'mobile-conversation').trim();

  return clean;
}

export function buildConversationCaptureRecord(input = {}, identity = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const timestamp = Number.isNaN(now.getTime()) ? new Date().toISOString() : now.toISOString();
  const id = String(input.id || createConversationCaptureId(now, options.idFactory)).trim();

  return sanitizeConversationCaptureRecord({
    id,
    personId: input.personId,
    name: input.name,
    relationship: input.relationship,
    contactMethod: input.contactMethod,
    contactDetail: input.contactDetail,
    projectType: input.projectType,
    projectDescription: input.projectDescription,
    painPoints: input.painPoints,
    exactWords: input.exactWords,
    interestedPlan: input.interestedPlan,
    signupTrigger: input.signupTrigger,
    interestLevel: input.interestLevel,
    nextAction: input.nextAction,
    followUpDate: input.followUpDate,
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
    source: 'mobile-conversation',
    capturedBy: String(identity.id || identity.alias || '').trim(),
    capturedByLabel: String(identity.label || identity.alias || '').trim(),
  });
}

export function buildGunConversationCapturePayload(data = {}) {
  const clean = sanitizeConversationCaptureRecord(data);

  return {
    ...clean,
    painPoints: clean.painPoints.join('\n'),
  };
}

export function sanitizeCrmRecord(data) {
  if (!data || typeof data !== 'object') return {};
  const clean = {};
  Object.entries(data).forEach(([key, value]) => {
    if (key === '_' || typeof value === 'function') return;
    clean[key] = value;
  });

  clean.recordType = normalizeCrmRecordType(clean.recordType);
  clean.groupId = String(clean.groupId || '').trim();
  clean.linkedGroupIds = serializeCrmList(clean.linkedGroupIds);
  clean.linkedPersonIds = serializeCrmList(clean.linkedPersonIds);
  clean.nextFollowUp = String(clean.nextFollowUp || clean.nextFollowup || '').trim();
  delete clean.nextFollowup;
  clean.warmth = normalizeCrmWarmth(clean.warmth, clean.status);
  clean.fit = normalizeCrmFit(clean.fit);
  clean.urgency = normalizeCrmUrgency(clean.urgency);
  clean.objection = String(clean.objection || '').trim();
  clean.nextBestAction = String(clean.nextBestAction || clean.nextExperiment || '').trim();
  clean.lastContacted = String(clean.lastContacted || '').trim();

  return clean;
}

function getFreshnessStamp(record) {
  return String(record?.updated || record?.created || '').trim();
}

function compareCrmRecords(a, b) {
  const aStamp = getFreshnessStamp(a);
  const bStamp = getFreshnessStamp(b);
  if (aStamp !== bStamp) {
    return bStamp.localeCompare(aStamp);
  }
  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

function uniqueRecords(records) {
  const output = [];
  const seen = new Set();
  (Array.isArray(records) ? records : []).forEach(record => {
    const id = String(record?.id || '').trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    output.push(record);
  });
  return output;
}

export function buildCrmRelationshipBoard(records) {
  const normalizedRecords = (Array.isArray(records) ? records : [])
    .map(sanitizeCrmRecord)
    .filter(record => String(record.id || '').trim())
    .sort(compareCrmRecords);

  const index = Object.create(null);
  normalizedRecords.forEach(record => {
    index[record.id] = record;
  });

  const groups = normalizedRecords.filter(record => record.recordType === 'group');
  const people = normalizedRecords.filter(record => record.recordType === 'person');
  const problems = normalizedRecords.filter(record => record.recordType === 'problem');
  const groupIds = new Set(groups.map(record => record.id));

  const linkedGroupsByProblemId = Object.create(null);
  const linkedPeopleByProblemId = Object.create(null);
  const linkedProblemsByPersonId = Object.create(null);
  const directProblemsByGroupId = Object.create(null);

  problems.forEach(problem => {
    const linkedGroups = parseCrmList(problem.linkedGroupIds)
      .map(id => index[id])
      .filter(record => record && record.recordType === 'group');
    const linkedPeople = parseCrmList(problem.linkedPersonIds)
      .map(id => index[id])
      .filter(record => record && record.recordType === 'person');

    linkedGroupsByProblemId[problem.id] = linkedGroups;
    linkedPeopleByProblemId[problem.id] = linkedPeople;

    linkedGroups.forEach(group => {
      if (!directProblemsByGroupId[group.id]) {
        directProblemsByGroupId[group.id] = [];
      }
      directProblemsByGroupId[group.id].push(problem);
    });

    linkedPeople.forEach(person => {
      if (!linkedProblemsByPersonId[person.id]) {
        linkedProblemsByPersonId[person.id] = [];
      }
      linkedProblemsByPersonId[person.id].push(problem);
    });
  });

  const groupsWithMembers = groups.map(group => {
    const members = people
      .filter(person => person.groupId === group.id)
      .sort(compareCrmRecords);
    const memberProblems = members.flatMap(person => linkedProblemsByPersonId[person.id] || []);
    const linkedProblems = uniqueRecords([
      ...(directProblemsByGroupId[group.id] || []),
      ...memberProblems,
    ]).sort(compareCrmRecords);

    return {
      group,
      members,
      linkedProblems,
    };
  });

  const standalonePeople = people
    .filter(person => !person.groupId || !groupIds.has(person.groupId))
    .sort(compareCrmRecords);

  const standaloneProblems = problems
    .filter(problem => {
      const linkedGroups = linkedGroupsByProblemId[problem.id] || [];
      const linkedPeople = linkedPeopleByProblemId[problem.id] || [];
      return linkedGroups.length === 0 && linkedPeople.length === 0;
    })
    .sort(compareCrmRecords);

  return {
    index,
    groups: groupsWithMembers,
    people,
    problems,
    standalonePeople,
    standaloneProblems,
    linkedGroupsByProblemId,
    linkedPeopleByProblemId,
    linkedProblemsByPersonId,
  };
}

if (typeof window !== 'undefined') {
  window.crmEditing = Object.assign({}, window.crmEditing, {
    CRM_STATUS_OPTIONS,
    CRM_MARKET_SEGMENT_OPTIONS,
    CRM_PAIN_SEVERITY_OPTIONS,
    CRM_PILOT_STATUS_OPTIONS,
    CRM_RECORD_TYPE_OPTIONS,
    CRM_CONVERSATION_RELATIONSHIP_OPTIONS,
    CRM_CONVERSATION_CONTACT_METHOD_OPTIONS,
    CRM_CONVERSATION_PROJECT_TYPE_OPTIONS,
    CRM_CONVERSATION_PAIN_POINT_OPTIONS,
    CRM_CONVERSATION_PLAN_OPTIONS,
    CRM_CONVERSATION_INTEREST_LEVEL_OPTIONS,
    CRM_CONVERSATION_NEXT_ACTION_OPTIONS,
    createCrmEditingManager,
    normalizeCrmRecordType,
    normalizeConversationCaptureList,
    sanitizeConversationCaptureRecord,
    buildConversationCaptureRecord,
    buildGunConversationCapturePayload,
    parseCrmList,
    serializeCrmList,
    sanitizeCrmRecord,
    buildCrmRelationshipBoard,
  });
}
