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
  'Owner-led service business',
  'Creative studio or agency',
  'Event or AV operator',
  'Educator or community org',
  'Local business with referrals',
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

const DEFAULT_RECORD_TYPE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'person', label: 'Person / lead' }),
  Object.freeze({ value: 'group', label: 'Group / account' }),
  Object.freeze({ value: 'problem', label: 'Problem / pain' }),
]);

export const CRM_STATUS_OPTIONS = DEFAULT_STATUS_OPTIONS;
export const CRM_MARKET_SEGMENT_OPTIONS = DEFAULT_MARKET_SEGMENT_OPTIONS;
export const CRM_PAIN_SEVERITY_OPTIONS = DEFAULT_PAIN_SEVERITY_OPTIONS;
export const CRM_PILOT_STATUS_OPTIONS = DEFAULT_PILOT_STATUS_OPTIONS;
export const CRM_RECORD_TYPE_OPTIONS = DEFAULT_RECORD_TYPE_OPTIONS;

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
    createCrmEditingManager,
    normalizeCrmRecordType,
    parseCrmList,
    serializeCrmList,
    sanitizeCrmRecord,
    buildCrmRelationshipBoard,
  });
}
