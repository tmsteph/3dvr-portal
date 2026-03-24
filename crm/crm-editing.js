const DEFAULT_STATUS_OPTIONS = Object.freeze([
  '',
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

export const CRM_STATUS_OPTIONS = DEFAULT_STATUS_OPTIONS;
export const CRM_MARKET_SEGMENT_OPTIONS = DEFAULT_MARKET_SEGMENT_OPTIONS;
export const CRM_PAIN_SEVERITY_OPTIONS = DEFAULT_PAIN_SEVERITY_OPTIONS;
export const CRM_PILOT_STATUS_OPTIONS = DEFAULT_PILOT_STATUS_OPTIONS;

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

if (typeof window !== 'undefined') {
  window.crmEditing = Object.assign({}, window.crmEditing, {
    CRM_STATUS_OPTIONS,
    CRM_MARKET_SEGMENT_OPTIONS,
    CRM_PAIN_SEVERITY_OPTIONS,
    CRM_PILOT_STATUS_OPTIONS,
    createCrmEditingManager,
  });
}
