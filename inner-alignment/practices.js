export const INNER_ALIGNMENT_KEYS = Object.freeze({
  preferences: 'innerAlignment.preferences',
  sessions: 'innerAlignment.sessions',
  activePractice: 'innerAlignment.activePractice',
  reflections: 'innerAlignment.reflections',
});

export const INNER_ALIGNMENT_CATEGORIES = Object.freeze([
  'Seated Body Reset',
  'Breath & Nervous System',
  'Focus & Awareness',
  'Light / Energy Visualization',
  'Intention Into Action',
]);

export const INNER_ALIGNMENT_PRACTICES = Object.freeze([
  {
    id: 'seated-spinal-wave',
    title: 'Seated Spinal Wave',
    category: 'Seated Body Reset',
    duration: 90,
    intention: 'Loosen the spine and restore flow.',
    instructions: [
      'Sit tall with both feet on the ground.',
      'Inhale and gently arch the chest forward.',
      'Exhale and round the spine back.',
      'Move slowly like a wave through the spine.',
    ],
    visual: 'spine-wave',
    breathPattern: 'inhale-exhale',
    reflectionPrompt: 'Where do I feel blocked or tense?',
  },
  {
    id: 'neck-shoulder-release',
    title: 'Neck & Shoulder Release',
    category: 'Seated Body Reset',
    duration: 120,
    intention: 'Release screen posture and soften the upper body.',
    instructions: [
      'Let the jaw soften and drop the shoulders away from the ears.',
      'Slowly turn the head right, center, then left without forcing range.',
      'Roll the shoulders forward three times, then backward three times.',
      'Pause with the chest open and breathe into the back of the ribs.',
    ],
    visual: 'spine-wave',
    breathPattern: 'slow-nasal',
    reflectionPrompt: 'What changes when I stop bracing my shoulders?',
  },
  {
    id: 'chest-opener',
    title: 'Chest Opener',
    category: 'Seated Body Reset',
    duration: 75,
    intention: 'Open the front body and make more room for breath.',
    instructions: [
      'Interlace fingers behind the back or hold the sides of the chair.',
      'Inhale and gently lift the sternum without compressing the low back.',
      'Keep the neck long and the jaw easy.',
      'Exhale slowly and keep the front body spacious.',
    ],
    visual: 'heart-light',
    breathPattern: 'inhale-expand',
    reflectionPrompt: 'What feels easier to receive when the chest has space?',
  },
  {
    id: 'wrist-forearm-reset',
    title: 'Wrist & Forearm Reset',
    category: 'Seated Body Reset',
    duration: 80,
    intention: 'Give keyboard and controller muscles a clean reset.',
    instructions: [
      'Extend one arm forward with palm facing down.',
      'Use the other hand to gently draw the fingers back for one breath.',
      'Turn the palm up and repeat with the wrist soft.',
      'Switch sides, then shake out both hands lightly.',
    ],
    visual: 'rising-particles',
    breathPattern: 'easy-breath',
    reflectionPrompt: 'Where can I grip less today?',
  },
  {
    id: 'box-breathing',
    title: 'Box Breathing',
    category: 'Breath & Nervous System',
    duration: 120,
    intention: 'Create a steady rhythm for calm focus.',
    instructions: [
      'Inhale for four counts.',
      'Hold gently for four counts.',
      'Exhale for four counts.',
      'Hold gently for four counts, then repeat.',
    ],
    visual: 'breathing-orb',
    breathPattern: '4-4-4-4',
    reflectionPrompt: 'What becomes clearer when the breath has a shape?',
  },
  {
    id: 'long-exhale-calm',
    title: 'Long Exhale Calm',
    category: 'Breath & Nervous System',
    duration: 150,
    intention: 'Downshift through a longer, softer exhale.',
    instructions: [
      'Inhale through the nose for four counts.',
      'Exhale slowly for six to eight counts.',
      'Let the ribs soften down without collapsing.',
      'Repeat gently and keep the face relaxed.',
    ],
    visual: 'breathing-orb',
    breathPattern: '4-8',
    reflectionPrompt: 'What am I ready to release without forcing it?',
  },
  {
    id: 'third-eye-focus',
    title: 'Third-Eye Focus',
    category: 'Focus & Awareness',
    duration: 180,
    intention: 'Train attention on one quiet point.',
    instructions: [
      'Let the gaze rest softly near the center point.',
      'Feel the space between the eyebrows without strain.',
      'When thought pulls attention away, notice it and return.',
      'Keep the body grounded while the mind becomes simple.',
    ],
    visual: 'third-eye-focus',
    breathPattern: 'natural',
    reflectionPrompt: 'What did I notice about attention when it wandered?',
  },
  {
    id: 'heart-light-gratitude',
    title: 'Heart Light Gratitude',
    category: 'Light / Energy Visualization',
    duration: 150,
    intention: 'Practice warmth, appreciation, and steadiness.',
    instructions: [
      'Rest one hand on the center of the chest if comfortable.',
      'Imagine a warm light expanding from the heart area.',
      'Name one person, place, or moment you appreciate.',
      'Let gratitude be felt in the body, not only thought.',
    ],
    visual: 'heart-light',
    breathPattern: 'coherent',
    reflectionPrompt: 'What did gratitude change in my body?',
  },
  {
    id: 'observe-the-observer',
    title: 'Observe the Observer',
    category: 'Focus & Awareness',
    duration: 180,
    intention: 'Notice awareness without chasing every thought.',
    instructions: [
      'Sit upright and let the breath happen naturally.',
      'Notice thoughts as events passing through awareness.',
      'Ask softly: who is aware of this thought?',
      'Rest as the noticing, without needing an answer.',
    ],
    visual: 'mandala-calm',
    breathPattern: 'natural',
    reflectionPrompt: 'What remains when I do not follow the thought?',
  },
  {
    id: 'intention-into-action',
    title: 'Intention Into Action',
    category: 'Intention Into Action',
    duration: 120,
    intention: 'Turn insight into one physical step.',
    instructions: [
      'Write the intention in plain language.',
      'Feel the desired state in the body for three breaths.',
      'Name the smallest action that would make it real today.',
      'Commit to the first visible step, not the whole mountain.',
    ],
    visual: 'rising-particles',
    breathPattern: 'three-breaths',
    reflectionPrompt: 'What one action will prove this intention in the real world?',
  },
]);

export function getInnerAlignmentPractice(practiceId) {
  return INNER_ALIGNMENT_PRACTICES.find(practice => practice.id === practiceId) || null;
}

export function getPracticesByCategory(category) {
  return INNER_ALIGNMENT_PRACTICES.filter(practice => practice.category === category);
}

export function formatPracticeDuration(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const remainingSeconds = value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function buildPracticeSession(input = {}) {
  const practice = getInnerAlignmentPractice(input.practiceId) || INNER_ALIGNMENT_PRACTICES[0];
  const now = new Date().toISOString();
  return {
    id: normalizeText(input.id) || makeSessionId(),
    app: 'inner-alignment',
    version: 1,
    practiceId: practice.id,
    practiceTitle: practice.title,
    category: practice.category,
    createdAt: normalizeText(input.createdAt) || now,
    completedAt: normalizeText(input.completedAt) || now,
    reflection: normalizeText(input.reflection),
    action: normalizeText(input.action),
  };
}

export function readInnerAlignmentList(keyName, storage = globalThis.localStorage) {
  const key = INNER_ALIGNMENT_KEYS[keyName] || keyName;
  if (!storage || typeof storage.getItem !== 'function') {
    return [];
  }
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

export function writeInnerAlignmentList(keyName, entries, storage = globalThis.localStorage) {
  const key = INNER_ALIGNMENT_KEYS[keyName] || keyName;
  if (!storage || typeof storage.setItem !== 'function') {
    return [];
  }
  const safeEntries = Array.isArray(entries) ? entries : [];
  storage.setItem(key, JSON.stringify(safeEntries));
  return safeEntries;
}

export function savePracticeSession(sessionInput, storage = globalThis.localStorage) {
  const session = buildPracticeSession(sessionInput);
  const sessions = readInnerAlignmentList('sessions', storage);
  writeInnerAlignmentList('sessions', [session, ...sessions].slice(0, 80), storage);

  const reflections = readInnerAlignmentList('reflections', storage);
  writeInnerAlignmentList('reflections', [{
    id: session.id,
    practiceId: session.practiceId,
    reflection: session.reflection,
    action: session.action,
    createdAt: session.createdAt,
  }, ...reflections].slice(0, 80), storage);

  return session;
}

export function readInnerAlignmentPreferences(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { reduceMotion: false, lastPracticeId: INNER_ALIGNMENT_PRACTICES[0].id };
  }
  try {
    const parsed = JSON.parse(storage.getItem(INNER_ALIGNMENT_KEYS.preferences) || '{}');
    return {
      reduceMotion: Boolean(parsed.reduceMotion),
      lastPracticeId: getInnerAlignmentPractice(parsed.lastPracticeId)
        ? parsed.lastPracticeId
        : INNER_ALIGNMENT_PRACTICES[0].id,
    };
  } catch (_error) {
    return { reduceMotion: false, lastPracticeId: INNER_ALIGNMENT_PRACTICES[0].id };
  }
}

export function writeInnerAlignmentPreferences(preferences, storage = globalThis.localStorage) {
  const next = {
    ...readInnerAlignmentPreferences(storage),
    ...preferences,
  };
  if (storage && typeof storage.setItem === 'function') {
    storage.setItem(INNER_ALIGNMENT_KEYS.preferences, JSON.stringify(next));
  }
  return next;
}

let fallbackSessionCounter = 0;

function makeSessionId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `inner-${cryptoApi.randomUUID()}`;
  }
  fallbackSessionCounter += 1;
  return `inner-${Date.now()}-${fallbackSessionCounter}`;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
