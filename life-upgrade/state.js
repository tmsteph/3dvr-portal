export const STORAGE_KEY = '3dvr-life-upgrade-v01';
export const SCHEMA_VERSION = 1;

export const STAGES = Object.freeze([
  { id: 'check-in', label: 'Notice', prompt: 'What needs your care this week?', support: 'Just tell the truth. Short is good.' },
  { id: 'choose', label: 'Pick one', prompt: 'What one thing will you work on?', support: 'Pick a small thing you can touch and change.' },
  { id: 'result', label: 'Name your win', prompt: 'What would make you proud in 7 days?', support: 'Make it easy to see. “Feel better” could be “one calm morning.”' },
  { id: 'plan', label: 'Make a plan', prompt: 'What three tiny steps can help?', support: 'Make each step so small you can start today.' },
  { id: 'complete', label: 'Do one thing', prompt: 'Which step can you do today?', support: 'A small step is still a step. Go!' },
  { id: 'evidence', label: 'Spot the change', prompt: 'What changed?', support: 'A photo, note, finished thing, or clear thought all count.' },
  { id: 'review', label: 'Look back', prompt: 'What did you learn?', support: 'Plans can change. That is okay. Notice what helped.' },
  { id: 'next', label: 'Pick your next step', prompt: 'What small step comes next?', support: 'Keep what worked. Try a new way for what did not.' }
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
