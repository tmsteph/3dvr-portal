export const STORAGE_KEY = '3dvr.assembly.v1';
export const ASSEMBLY_FORMAT = '3dvr-assembly';
export const ASSEMBLY_VERSION = 1;

export function emptyAssemblyState() {
  return {
    workspace: { id: '', createdAt: 0 },
    identity: { name: '', purpose: '' },
    people: [],
    teams: [],
    assignments: [],
    initiatives: [],
    commitments: [],
    decisions: [],
    needs: [],
    offers: [],
  };
}

const text = value => typeof value === 'string' ? value : '';
const timestamp = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const records = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];

function normalizeWorkspace(item) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    id: text(source.id),
    createdAt: timestamp(source.createdAt),
  };
}

function normalizePerson(item) {
  return {
    id: text(item.id),
    name: text(item.name),
    role: text(item.role),
    createdAt: timestamp(item.createdAt),
  };
}

function normalizeTeam(item) {
  return {
    id: text(item.id),
    name: text(item.name),
    purpose: text(item.purpose),
    createdAt: timestamp(item.createdAt),
  };
}

function normalizeAssignment(item) {
  return {
    id: text(item.id),
    personId: text(item.personId),
    teamId: text(item.teamId),
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
    resolution: text(item.resolution),
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
    matchedOfferId: text(item.matchedOfferId),
    done: Boolean(item.done),
    createdAt: timestamp(item.createdAt),
    doneAt: item.doneAt == null ? null : timestamp(item.doneAt),
  };
}

function normalizeOffer(item) {
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
  const people = records(source.people).map(normalizePerson).filter(item => item.name);
  const teams = records(source.teams).map(normalizeTeam).filter(item => item.name);
  const personIds = new Set(people.map(item => item.id).filter(Boolean));
  const teamIds = new Set(teams.map(item => item.id).filter(Boolean));
  const assignments = records(source.assignments)
    .map(normalizeAssignment)
    .filter(item => item.personId && item.teamId && item.role)
    .filter(item => personIds.has(item.personId) && teamIds.has(item.teamId));
  const normalized = {
    workspace: normalizeWorkspace(source.workspace),
    identity: {
      name: text(identity.name),
      purpose: text(identity.purpose),
    },
    people,
    teams,
    assignments,
    initiatives: records(source.initiatives).map(normalizeInitiative).filter(item => item.name),
    commitments: records(source.commitments).map(normalizeCommitment).filter(item => item.text),
    decisions: records(source.decisions).map(normalizeDecision).filter(item => item.text),
    offers: records(source.offers).map(normalizeOffer).filter(item => item.text),
    needs: [],
  };
  const offerIds = new Set(normalized.offers.map(item => item.id).filter(Boolean));
  normalized.needs = records(source.needs)
    .map(normalizeNeed)
    .filter(item => item.text)
    .map(item => item.matchedOfferId && !offerIds.has(item.matchedOfferId) ? { ...item, matchedOfferId: '' } : item);
  return normalized;
}

function defaultWorkspaceId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `asm_${uuid}`;
  return `asm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function ensureWorkspaceIdentity(value, options = {}) {
  const normalized = normalizeAssemblyState(value);
  if (normalized.workspace.id) return normalized;
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultWorkspaceId;
  normalized.workspace = {
    id: String(idFactory()),
    createdAt: now,
  };
  return normalized;
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
