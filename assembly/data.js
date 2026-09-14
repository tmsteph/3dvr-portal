export const STORAGE_KEY = '3dvr.assembly.v1';
export const ASSEMBLY_FORMAT = '3dvr-assembly';
export const ASSEMBLY_VERSION = 1;

export function emptyAssemblyState() {
  return {
    identity: { name: '', purpose: '' },
    people: [],
    initiatives: [],
    commitments: [],
    decisions: [],
    needs: [],
  };
}

const text = value => typeof value === 'string' ? value : '';
const timestamp = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const records = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];

function normalizePerson(item) {
  return {
    id: text(item.id),
    name: text(item.name),
    role: text(item.role),
    createdAt: timestamp(item.createdAt),
  };
}

function normalizeInitiative(item) {
  return {
    id: text(item.id),
    name: text(item.name),
    lead: text(item.lead),
    createdAt: timestamp(item.createdAt),
  };
}

function normalizeCommitment(item) {
  return {
    id: text(item.id),
    text: text(item.text),
    owner: text(item.owner),
    initiativeId: text(item.initiativeId),
    due: text(item.due),
    done: Boolean(item.done),
    createdAt: timestamp(item.createdAt),
    doneAt: item.doneAt == null ? null : timestamp(item.doneAt),
  };
}

function normalizeDecision(item) {
  return {
    id: text(item.id),
    text: text(item.text),
    owner: text(item.owner),
    done: Boolean(item.done),
    createdAt: timestamp(item.createdAt),
    doneAt: item.doneAt == null ? null : timestamp(item.doneAt),
  };
}

function normalizeNeed(item) {
  return {
    id: text(item.id),
    text: text(item.text),
    owner: text(item.owner),
    done: Boolean(item.done),
    createdAt: timestamp(item.createdAt),
    doneAt: item.doneAt == null ? null : timestamp(item.doneAt),
  };
}

export function normalizeAssemblyState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const identity = source.identity && typeof source.identity === 'object' ? source.identity : {};
  return {
    identity: {
      name: text(identity.name),
      purpose: text(identity.purpose),
    },
    people: records(source.people).map(normalizePerson).filter(item => item.name),
    initiatives: records(source.initiatives).map(normalizeInitiative).filter(item => item.name),
    commitments: records(source.commitments).map(normalizeCommitment).filter(item => item.text),
    decisions: records(source.decisions).map(normalizeDecision).filter(item => item.text),
    needs: records(source.needs).map(normalizeNeed).filter(item => item.text),
  };
}

export function createAssemblySnapshot(state, now = Date.now()) {
  return {
    format: ASSEMBLY_FORMAT,
    version: ASSEMBLY_VERSION,
    exportedAt: new Date(now).toISOString(),
    state: normalizeAssemblyState(state),
  };
}

export function parseAssemblySnapshot(input) {
  const snapshot = typeof input === 'string' ? JSON.parse(input) : input;
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Assembly file is not valid JSON.');
  if (snapshot.format !== ASSEMBLY_FORMAT) throw new Error('This is not a 3DVR Assembly file.');
  if (snapshot.version !== ASSEMBLY_VERSION) throw new Error(`Unsupported Assembly version: ${snapshot.version}`);
  if (!snapshot.state || typeof snapshot.state !== 'object') throw new Error('Assembly file has no workspace state.');
  return normalizeAssemblyState(snapshot.state);
}
