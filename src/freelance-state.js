export const FREELANCE_STATE_KINDS = Object.freeze(['fact', 'decision', 'action']);

const VALID_KINDS = new Set(FREELANCE_STATE_KINDS);

export function normalizeFreelanceStateEntry(record = {}) {
  return {
    id: String(record.id || '').trim(),
    kind: String(record.kind || '').trim().toLowerCase(),
    subjectType: String(record.subjectType || '').trim().toLowerCase(),
    subjectId: String(record.subjectId || '').trim(),
    summary: String(record.summary || '').trim(),
    details: String(record.details || '').trim(),
    createdAt: String(record.createdAt || '').trim(),
    version: 1,
  };
}

export function createFreelanceStateEntry({ createdAt = new Date().toISOString(), ...record } = {}) {
  const entry = normalizeFreelanceStateEntry({ ...record, createdAt });
  if (!entry.id) throw new TypeError('freelance state entry requires an id');
  if (!VALID_KINDS.has(entry.kind)) throw new TypeError(`invalid freelance state kind: ${entry.kind}`);
  if (!entry.subjectType || !entry.subjectId) throw new TypeError('freelance state entry requires a subject');
  if (!entry.summary) throw new TypeError('freelance state entry requires a summary');
  return entry;
}
