const DEFAULT_STATUS_OPTIONS = Object.freeze([
  '',
  'Lead',
  'Prospect',
  'Active',
  'Negotiating',
  'Won',
  'Lost',
]);

export const CRM_STATUS_OPTIONS = DEFAULT_STATUS_OPTIONS;

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
    createCrmEditingManager,
  });
}
