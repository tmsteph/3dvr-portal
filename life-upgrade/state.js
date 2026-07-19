export const STORAGE_KEY = '3dvr-life-upgrade-v01';
export const SCHEMA_VERSION = 1;

export const STAGES = Object.freeze([
  { id: 'check-in', label: 'Check in', prompt: 'What deserves your attention before the week disappears?', support: 'Start with what is true. You do not have to make it sound tidy.' },
  { id: 'choose', label: 'Choose one', prompt: 'What part of life is asking for a little care?', support: 'A small surface you can touch is more useful than a giant life category.' },
  { id: 'result', label: 'Name the result', prompt: 'What would you be proud to point to in seven days?', support: 'Make it visible. “Feel better” can become “one calm morning” or “a sent proposal.”' },
  { id: 'plan', label: 'Plan three', prompt: 'What three small moves would make that result more likely?', support: 'Give future-you a few easy doors to walk through.' },
  { id: 'complete', label: 'Complete one', prompt: 'Which move can you make real today?', support: 'Momentum starts when an intention leaves your head and meets the world.' },
  { id: 'evidence', label: 'Capture evidence', prompt: 'What is different enough to notice?', support: 'Keep the proof for yourself. A finished thing, a photo, or a clear observation all count.' },
  { id: 'review', label: 'Review the week', prompt: 'What did this week teach you about how you move?', support: 'Learning is part of the upgrade—not a consolation prize when plans change.' },
  { id: 'next', label: 'Choose next', prompt: 'What is the next kind move—not the biggest one?', support: 'Keep what worked. Adjust what did not. You are allowed to build slowly.' }
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
