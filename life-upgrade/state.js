export const STORAGE_KEY = '3dvr-life-upgrade-v01';
export const SCHEMA_VERSION = 1;

export const STAGES = Object.freeze([
  { id: 'check-in', label: 'Check in', prompt: 'What would make this week feel useful?' },
  { id: 'choose', label: 'Choose one', prompt: 'Choose one area to upgrade.' },
  { id: 'result', label: 'Name the result', prompt: 'What will be different by the end of seven days?' },
  { id: 'plan', label: 'Plan three', prompt: 'Write three actions that can get you there.' },
  { id: 'complete', label: 'Complete one', prompt: 'Do one action now or schedule it.' },
  { id: 'evidence', label: 'Capture evidence', prompt: 'Record what proves movement happened.' },
  { id: 'review', label: 'Review the week', prompt: 'Notice what worked, what did not, and what you learned.' },
  { id: 'next', label: 'Choose next', prompt: 'Choose the next move without starting over.' }
]);

export function createPlan() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: null,
    currentStage: 'check-in',
    checkIn: '',
    upgrade: '',
    result: '',
    actions: [
      { text: '', completed: false },
      { text: '', completed: false },
      { text: '', completed: false }
    ],
    evidence: '',
    review: '',
    nextMove: ''
  };
}

export function normalizePlan(value) {
  const plan = createPlan();
  const source = value && typeof value === 'object' ? value : {};
  const actions = Array.isArray(source.actions) ? source.actions.slice(0, 3) : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : plan.updatedAt,
    currentStage: STAGES.some((stage) => stage.id === source.currentStage)
      ? source.currentStage
      : plan.currentStage,
    actions: [0, 1, 2].map((index) => {
      const action = actions[index];
      if (typeof action === 'string') return { text: action.trim(), completed: false };
      return {
        text: String(action?.text || '').trim(),
        completed: action?.completed === true
      };
    }),
    checkIn: String(source.checkIn || '').trim(),
    upgrade: String(source.upgrade || '').trim(),
    result: String(source.result || '').trim(),
    evidence: String(source.evidence || '').trim(),
    review: String(source.review || '').trim(),
    nextMove: String(source.nextMove || '').trim()
  };
}

export function loadStoredPlan(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return createPlan();
  try {
    return normalizePlan(JSON.parse(rawValue));
  } catch {
    return createPlan();
  }
}

export function saveStoredPlan(storage, plan) {
  try {
    storage.setItem(STORAGE_KEY, serializePlan(plan));
    return true;
  } catch {
    return false;
  }
}

export function deleteStoredPlan(storage) {
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function updatePlan(plan, changes) {
  return normalizePlan({ ...normalizePlan(plan), ...changes, updatedAt: new Date().toISOString() });
}

export function updateAction(plan, index, value) {
  const actions = normalizePlan(plan).actions;
  if (index < 0 || index > 2) return normalizePlan(plan);
  actions[index] = { ...actions[index], text: String(value || '').trim() };
  return updatePlan(plan, { actions });
}

export function completeAction(plan, index, completed = true) {
  const actions = normalizePlan(plan).actions;
  if (index < 0 || index > 2) return normalizePlan(plan);
  actions[index] = { ...actions[index], completed: completed === true };
  return updatePlan(plan, { actions });
}

export function getStage(plan, stageId = normalizePlan(plan).currentStage) {
  return STAGES.find((stage) => stage.id === stageId) || STAGES[0];
}

export function nextStage(plan) {
  const current = normalizePlan(plan);
  const index = STAGES.findIndex((stage) => stage.id === current.currentStage);
  return updatePlan(current, { currentStage: STAGES[Math.min(index + 1, STAGES.length - 1)].id });
}

export function hasUsefulResult(plan) {
  const current = normalizePlan(plan);
  return Boolean(current.upgrade && current.result && current.actions.some((action) => action.text));
}

export function hasProgress(plan) {
  const current = normalizePlan(plan);
  return Boolean(
    current.updatedAt ||
    current.currentStage !== 'check-in' ||
    current.checkIn ||
    current.upgrade ||
    current.result ||
    current.evidence ||
    current.review ||
    current.nextMove ||
    current.actions.some((action) => action.text || action.completed)
  );
}

export function serializePlan(plan) {
  return JSON.stringify(normalizePlan(plan));
}
