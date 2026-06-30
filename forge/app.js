import { readDefaultSecret } from '../web-builder-app/defaults.js';

const STORAGE_KEY = '3dvr.forge.session.v1';
const FORGE_GUN_SESSION_ID_KEY = '3dvr.forge.sessionId.v1';
const FORGE_MODEL = 'gpt-4.1-mini';
const SHARED_DEFAULTS_WAIT_MS = 1200;
const FORGE_API_TIMEOUT_MS = 10000;

const gun = window.Gun ? window.Gun({ peers: window.__GUN_PEERS__ || undefined }) : null;
const portalRoot = gun?.get('3dvr-portal') || null;
const defaultsNode = portalRoot?.get('ai-workbench')?.get('defaults');
const forgeSessionsNode = portalRoot?.get('forge')?.get('sessions');

const stage = {
  INTRO: 'intro',
  INITIAL: 'initial',
  FOLLOWUPS: 'followups',
  GENERATING: 'generating',
  BRIEF: 'brief',
};

const defaultFollowUps = [
  {
    key: 'audience',
    question: 'Who is this for? You can say me.',
  },
  {
    key: 'help',
    question: 'What would help this week?',
  },
];

const followUpPool = {
  shape: {
    key: 'shape',
    question: 'What should this become first? A page, service, tool, or message?',
  },
  resources: {
    key: 'resources',
    question: 'What do you already have? A skill, tool, friend, or place to start?',
  },
};

const starterSparks = [
  'I need money and I do not know what to do first.',
  'I need better work and I do not know where to start.',
  'I have an idea but it feels too big.',
  'I feel stuck and need one small next step.',
];

const briefOrder = [
  ['projectName', 'Name'],
  ['firstActions', 'Do these 3 things'],
  ['testMessage', 'Message to send'],
  ['tinyExperiment', '7-day test'],
  ['realityCheck', 'Watch out'],
];

const refs = {
  form: document.querySelector('[data-forge-form]'),
  answer: document.querySelector('[data-forge-answer]'),
  inputLabel: document.querySelector('[data-input-label]'),
  inputMode: document.querySelector('[data-forge-input-mode]'),
  submit: document.querySelector('[data-submit-answer]'),
  spark: document.querySelector('[data-spark-idea]'),
  easyAnswer: document.querySelector('[data-easy-answer]'),
  presets: document.querySelector('[data-forge-presets]'),
  presetButtons: Array.from(document.querySelectorAll('[data-preset-idea]')),
  reset: document.querySelector('[data-reset-forge]'),
  transcript: document.querySelector('[data-transcript]'),
  progress: document.querySelector('[data-forge-progress]'),
  progressLabel: document.querySelector('[data-forge-progress-label]'),
  progressBar: document.querySelector('[data-forge-progress-bar]'),
  appStatus: document.querySelector('[data-forge-app-status]'),
  stageSteps: Array.from(document.querySelectorAll('[data-forge-step]')),
  guidancePanel: document.querySelector('[data-guidance-panel]'),
  guidanceDiagnosis: document.querySelector('[data-guidance-diagnosis]'),
  guidancePaths: document.querySelector('[data-guidance-paths]'),
  guidanceActions: document.querySelector('[data-guidance-actions]'),
  status: document.querySelector('[data-forge-status]'),
  conversationPanel: document.querySelector('[data-forge-panel="conversation"]'),
  briefPanel: document.querySelector('[data-forge-panel="brief"]'),
  briefOutput: document.querySelector('[data-brief-output]'),
  briefStatus: document.querySelector('[data-brief-status]'),
  copyBrief: document.querySelector('[data-copy-brief]'),
  downloadBrief: document.querySelector('[data-download-brief]'),
  resetBrief: document.querySelector('[data-reset-brief]'),
  messageTemplate: document.getElementById('messageTemplate'),
  sectionTemplate: document.getElementById('briefSectionTemplate'),
  nextMoveButtons: Array.from(document.querySelectorAll('[data-next-move]')),
  nextOutput: document.querySelector('[data-next-output]'),
  nextOutputTitle: document.querySelector('[data-next-output-title]'),
  nextOutputBody: document.querySelector('[data-next-output-body]'),
  copyNextOutput: document.querySelector('[data-copy-next-output]'),
};

let session = {
  stage: stage.INITIAL,
  initial: '',
  guidance: null,
  followUps: defaultFollowUps,
  followUpIndex: 0,
  answers: {},
  brief: null,
  nextOutput: '',
  notice: '',
  briefSource: '',
  updatedAt: '',
};
let isBusy = false;
let forgeSessionId = resolveForgeSessionId();
let forgeActorKey = resolveForgeActorKey();
let sparkIndex = 0;
const sharedSecrets = {
  openai: '',
};
const sharedSecretResolvers = {
  openai: [],
};

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function setNotice(message) {
  session.notice = message;
}

function safeReadStorage(key) {
  try {
    return window.localStorage?.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeWriteStorage(key, value) {
  try {
    window.localStorage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveStorage(key) {
  try {
    window.localStorage?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function createForgeId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `forge-${window.crypto.randomUUID()}`;
  }

  if (window.Gun?.text && typeof window.Gun.text.random === 'function') {
    return `forge-${window.Gun.text.random(16)}`;
  }

  return `forge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeGunKey(value) {
  return encodeURIComponent(clean(value) || 'guest');
}

function resolveForgeSessionId() {
  const stored = clean(safeReadStorage(FORGE_GUN_SESSION_ID_KEY));
  if (stored) return stored;

  const generated = createForgeId();
  safeWriteStorage(FORGE_GUN_SESSION_ID_KEY, generated);
  return generated;
}

function resolveForgeActorKey() {
  const signedIn = safeReadStorage('signedIn') === 'true';
  const actor = clean(safeReadStorage('userPubKey'))
    || (signedIn ? clean(safeReadStorage('alias')) : '')
    || clean(safeReadStorage('guestId'))
    || clean(safeReadStorage('alias'))
    || forgeSessionId;

  return normalizeGunKey(actor);
}

function hasDefaultRecord(data) {
  return Boolean(
    data &&
    typeof data === 'object' &&
    Object.keys(data).some((key) => key !== '_')
  );
}

function resolveSharedSecretWaiters(targetKey) {
  const waiters = sharedSecretResolvers[targetKey] || [];
  while (waiters.length) {
    waiters.shift()?.();
  }
}

function subscribeToSharedDefaults() {
  if (!defaultsNode) {
    resolveSharedSecretWaiters('openai');
    return;
  }

  defaultsNode.on((data) => {
    if (!hasDefaultRecord(data)) {
      return;
    }

    sharedSecrets.openai = readDefaultSecret(data, 'openai');
    if (sharedSecrets.openai) {
      resolveSharedSecretWaiters('openai');
    }
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForSharedSecret(targetKey, message) {
  if (sharedSecrets[targetKey]) {
    return true;
  }

  if (!defaultsNode) {
    return false;
  }

  setNotice(message);
  render();
  await Promise.race([
    new Promise((resolve) => {
      sharedSecretResolvers[targetKey]?.push(resolve);
    }),
    wait(SHARED_DEFAULTS_WAIT_MS),
  ]);

  return Boolean(sharedSecrets[targetKey]);
}

function sentence(value, fallback) {
  const text = clean(value) || fallback;
  return `${text.replace(/[.?!]+$/, '')}.`;
}

function clause(value, fallback) {
  return (clean(value) || fallback).replace(/[.?!]+$/, '');
}

function titleCase(value) {
  return clean(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function meaningfulWords(value) {
  const stop = new Set([
    'the',
    'and',
    'but',
    'with',
    'that',
    'this',
    'they',
    'them',
    'just',
    'really',
    'feel',
    'like',
    'into',
    'from',
    'have',
    'been',
    'about',
    'because',
  ]);
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stop.has(word));
}

function chooseFollowUps(initial) {
  const lower = clean(initial).toLowerCase();
  const chosen = [...defaultFollowUps];

  if (/\b(app|software|tool|site|website|business|startup|service|community|content)\b/.test(lower)) {
    chosen[1] = followUpPool.shape;
  }

  if (/\b(skill|build|make|code|design|write|film|stage|tech|crew|freelance)\b/.test(lower)) {
    chosen[1] = followUpPool.resources;
  }

  return chosen.slice(0, 2);
}

function deriveProjectName(initial, answers) {
  const shape = clause(answers.shape, '');
  const words = meaningfulWords(`${initial} ${shape}`).slice(0, 4);
  if (/\b(money|income|cash|revenue|paid|client|clients|bills?|rent|sales?)\b/i.test(initial)) return '7-Day Revenue Signal Test';
  if (/\bstage|crew|theater|theatre|tech\b/i.test(initial)) return 'Crew Signal Forge';
  if (/\bjob|work|burned|burnt|boss|shift\b/i.test(initial)) return 'Unlaunched Work Test';
  if (/\bclient|customer|service\b/i.test(initial)) return 'Service Signal Test';
  if (words.length >= 2) return `${titleCase(words.join(' '))} Project`;
  return 'Useful Project Test';
}

function guessProjectShape(answers, initial = '') {
  const shape = clean(answers.shape).toLowerCase();
  if (shape) return shape;
  const combined = clean(`${initial} ${Object.values(answers).join(' ')}`).toLowerCase();
  if (/\b(money|income|cash|revenue|paid|client|clients|bills?|rent|sales?|no time|busy)\b/.test(combined)) {
    return 'paid micro-offer and direct outreach test';
  }
  const tiny = clean(answers.tiny).toLowerCase();
  if (tiny.includes('page') || tiny.includes('site')) return 'landing page and outreach test';
  if (tiny.includes('group') || tiny.includes('community')) return 'small community test';
  if (tiny.includes('service') || tiny.includes('offer')) return 'service offer';
  if (tiny.includes('app') || tiny.includes('tool')) return 'simple tool prototype';
  return 'small useful offer';
}

function buildLocalForgeGuidance(initial = '') {
  const raw = clean(initial);
  const lower = raw.toLowerCase();
  const moneyPressure = /\b(money|income|cash|revenue|paid|client|clients|bills?|rent|sales?|no time|busy)\b/.test(lower);
  const jobPressure = /\b(job|work|resume|interview|hiring|career|boss|shift|laid off|unemployed)\b/.test(lower);

  if (moneyPressure) {
    return {
      diagnosis: 'This looks like money pressure. Start with one small offer, not a big app.',
      solutionPaths: [
        'Offer one small paid service to people you already know.',
        'Ask 10 people what they would pay for before building.',
        'Cut or pause one bill while you test the offer.'
      ],
      nextActions: [
        'Write: I help [person] do [thing] this week.',
        'Name 10 people you can text.',
        'Build only after one person shows real interest.'
      ]
    };
  }

  if (jobPressure) {
    return {
      diagnosis: 'This looks like work pressure. Start with one proof of skill.',
      solutionPaths: [
        'Make one small proof that shows what you can do.',
        'Text one warm person and ask who needs that skill.',
        'Test a tiny freelance offer before waiting for a perfect job.'
      ],
      nextActions: [
        'Pick one skill you want to be paid for.',
        'Name five places where that skill helps.',
        'Send one message asking for advice, not a job.'
      ]
    };
  }

  return {
    diagnosis: 'This is still wide. Make it smaller.',
    solutionPaths: [
      'Make one page, checklist, message, or tiny service.',
      'Start with one person before a big audience.',
      'Use a direct message before building software.'
    ],
    nextActions: [
      'Name who this helps.',
      'Write one useful promise.',
      'Send it before adding features.'
    ]
  };
}

function buildMockMovementBrief(currentSession) {
  const initial = clean(currentSession.initial);
  const answers = currentSession.answers;
  const projectName = deriveProjectName(initial, answers);
  const audience = clause(answers.audience, 'me first, then people like me');
  const tiny = clause(answers.help || answers.tiny, 'one page, one message, or one checklist that helps this week');
  const shape = guessProjectShape(answers, initial);
  const coreFrustration = sentence(
    initial,
    'You can feel a useful project trying to form, but it is still scattered and under-tested'
  );
  const isRevenuePressure = /\b(money|income|cash|revenue|paid|client|clients|bills?|rent|sales?|no time|busy)\b/i.test(`${initial} ${Object.values(answers).join(' ')}`);
  const projectConcept = isRevenuePressure
    ? `${projectName} is a ${shape} for ${audience}. Test a clear paid offer before building.`
    : `${projectName} is a ${shape} for ${audience}. Test if people care before building.`;
  const tinyExperiment = `This week: make ${tiny}. Send it to 10 people. Track replies.`;
  const firstActions = [
    'Write one clear promise.',
    'Text 10 people.',
    'Build after one yes.',
  ];
  const testMessage = `Quick question: I am testing ${projectName}. It is for ${audience}. Would this help you this week?`;
  const codexPrompt = [
    `Build a minimal first version of ${projectName}.`,
    '',
    `Audience: ${audience}.`,
    `Core frustration: ${coreFrustration}`,
    `Tiny experiment: ${tinyExperiment}`,
    '',
    'Requirements:',
    '- Make a focused landing page or single-screen prototype.',
    '- Include one clear call to action for feedback or signups.',
    '- If this is a revenue test, prioritize the offer, outreach script, and reply tracker before product features.',
    '- Keep the implementation small and mobile-first.',
    '- Do not add accounts, dashboards, or complex persistence unless required.',
    '- Add tests or a simple verification path for the core interaction.',
  ].join('\n');
  const realityCheck = [
    'Pick one kind of person first.',
    'Send the message before building.',
  ];

  return {
    projectName,
    coreFrustration,
    audience,
    projectConcept,
    tinyExperiment,
    firstActions,
    testMessage,
    codexPrompt,
    realityCheck,
  };
}

function normalizeGuidanceList(value, fallback, limit = 3) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list.map(clean).filter(Boolean).slice(0, limit);

  fallback.forEach((item) => {
    if (normalized.length < Math.min(2, limit)) {
      normalized.push(item);
    }
  });

  return normalized.slice(0, limit);
}

function normalizeForgeGuidanceResponse(value, initial = session.initial) {
  const fallback = buildLocalForgeGuidance(initial);

  return {
    diagnosis: clean(value?.diagnosis) || fallback.diagnosis,
    solutionPaths: normalizeGuidanceList(value?.solutionPaths, fallback.solutionPaths, 3),
    nextActions: normalizeGuidanceList(value?.nextActions, fallback.nextActions, 3),
  };
}

function normalizeFollowUpsResponse(value) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list
    .map((item, index) => ({
      key: clean(item?.key)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || `followup_${index + 1}`,
      question: clean(item?.question),
    }))
    .filter((item) => item.question)
    .slice(0, 2);

  defaultFollowUps.forEach((fallback) => {
    if (normalized.length < 2) {
      normalized.push(fallback);
    }
  });

  return normalized.slice(0, 2);
}

function mergeFollowUpsResponse(value, lockedCount = 0) {
  const incoming = normalizeFollowUpsResponse(value);
  const locked = session.followUps.slice(0, lockedCount);
  const merged = [...locked];

  const add = (item) => {
    if (!item?.question || !item?.key) return;
    if (session.answers[item.key]) return;
    if (merged.some((existing) => existing.key === item.key)) return;
    merged.push(item);
  };

  incoming.forEach(add);
  session.followUps.slice(lockedCount).forEach(add);
  defaultFollowUps.forEach(add);
  Object.values(followUpPool).forEach(add);

  return merged.slice(0, 2);
}

function normalizeStringList(value, fallback, limit) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list.map(clean).filter(Boolean).slice(0, limit);

  fallback.forEach((item) => {
    if (normalized.length < Math.min(3, limit)) {
      normalized.push(item);
    }
  });

  return normalized.slice(0, limit);
}

function normalizeBriefResponse(value) {
  const fallback = buildMockMovementBrief(session);

  return {
    projectName: clean(value?.projectName) || fallback.projectName,
    coreFrustration: clean(value?.coreFrustration) || fallback.coreFrustration,
    audience: clean(value?.audience) || fallback.audience,
    projectConcept: clean(value?.projectConcept) || fallback.projectConcept,
    tinyExperiment: clean(value?.tinyExperiment) || fallback.tinyExperiment,
    firstActions: normalizeStringList(value?.firstActions, fallback.firstActions, 3),
    testMessage: clean(value?.testMessage) || fallback.testMessage,
    codexPrompt: clean(value?.codexPrompt) || fallback.codexPrompt,
    realityCheck: normalizeStringList(value?.realityCheck, fallback.realityCheck, 2),
  };
}

async function parseApiError(response) {
  const errorText = await response.text();
  if (!errorText) {
    return 'The Forge API is not available.';
  }

  try {
    const parsed = JSON.parse(errorText);
    return parsed?.error || parsed?.message || errorText;
  } catch {
    return errorText;
  }
}

async function requestForge(mode, payload = {}) {
  await waitForSharedSecret('openai', 'Loading shared Forge key...');

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FORGE_API_TIMEOUT_MS);
  let response;

  try {
    response = await fetch('/api/openai-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        forge: true,
        mode,
        model: FORGE_MODEL,
        ...(sharedSecrets.openai ? { apiKey: sharedSecrets.openai } : {}),
        ...payload,
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Forge request timed out.');
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json();
}

function normalizeStage(value) {
  return Object.values(stage).includes(value) && value !== stage.INTRO ? value : stage.INITIAL;
}

function normalizeSessionSnapshot(value = {}, updatedAt = '') {
  const parsedStage = value.stage === stage.INTRO ? stage.INITIAL : value.stage;
  const followUps = Array.isArray(value.followUps) && value.followUps.length
    ? normalizeFollowUpsResponse(value.followUps)
    : defaultFollowUps;
  const answers = value.answers && typeof value.answers === 'object' && !Array.isArray(value.answers)
    ? Object.fromEntries(Object.entries(value.answers).map(([key, answer]) => [clean(key), clean(answer)]).filter(([key]) => key))
    : {};
  const initial = clean(value.initial);
  const guidance = value.guidance && typeof value.guidance === 'object' && !Array.isArray(value.guidance)
    ? normalizeForgeGuidanceResponse(value.guidance, initial)
    : initial
      ? buildLocalForgeGuidance(initial)
      : null;
  const brief = value.brief && typeof value.brief === 'object' && !Array.isArray(value.brief)
    ? normalizeBriefResponse(value.brief)
    : null;

  return {
    stage: normalizeStage(parsedStage),
    initial,
    guidance,
    followUps,
    followUpIndex: Number.isInteger(value.followUpIndex)
      ? Math.max(0, Math.min(value.followUpIndex, followUps.length))
      : 0,
    answers,
    brief,
    nextOutput: String(value.nextOutput || ''),
    notice: clean(value.notice),
    briefSource: clean(value.briefSource),
    updatedAt: updatedAt || clean(value.updatedAt) || new Date().toISOString(),
  };
}

function serializeSessionForGun(snapshot) {
  return {
    sessionId: forgeSessionId,
    actor: forgeActorKey,
    stage: snapshot.stage,
    initial: snapshot.initial || '',
    projectName: snapshot.brief?.projectName || '',
    updatedAt: snapshot.updatedAt,
    cleared: false,
    payload: JSON.stringify(snapshot),
  };
}

function parseGunSessionRecord(record) {
  if (!record || typeof record !== 'object' || record.cleared || typeof record.payload !== 'string') {
    return null;
  }

  try {
    return normalizeSessionSnapshot(JSON.parse(record.payload), clean(record.updatedAt));
  } catch {
    return null;
  }
}

function sessionTimestamp(value) {
  const time = Date.parse(value?.updatedAt || '');
  return Number.isNaN(time) ? 0 : time;
}

function getForgeSessionNode() {
  if (!forgeSessionsNode || !forgeActorKey || !forgeSessionId) return null;
  return forgeSessionsNode.get(forgeActorKey).get(forgeSessionId);
}

function writeLocalSession(snapshot) {
  return safeWriteStorage(STORAGE_KEY, JSON.stringify(snapshot));
}

function persistSessionToGun(snapshot) {
  const sessionNode = getForgeSessionNode();
  if (!sessionNode) return;

  const record = serializeSessionForGun(snapshot);
  sessionNode.put(record, (ack) => {
    if (ack?.err) {
      console.warn('Forge Gun session sync failed:', ack.err);
    }
  });
  forgeSessionsNode.get(forgeActorKey).get('latest').put({
    sessionId: forgeSessionId,
    actor: forgeActorKey,
    stage: snapshot.stage,
    projectName: snapshot.brief?.projectName || '',
    updatedAt: snapshot.updatedAt,
    cleared: false,
  });
}

function saveSession() {
  const snapshot = normalizeSessionSnapshot(session, new Date().toISOString());
  session = { ...session, ...snapshot };
  writeLocalSession(snapshot);
  persistSessionToGun(snapshot);
}

function clearGunSession() {
  const sessionNode = getForgeSessionNode();
  if (!sessionNode) return;

  const updatedAt = new Date().toISOString();
  const record = {
    sessionId: forgeSessionId,
    actor: forgeActorKey,
    stage: stage.INITIAL,
    projectName: '',
    updatedAt,
    cleared: true,
    payload: '',
  };
  sessionNode.put(record);
  forgeSessionsNode.get(forgeActorKey).get('latest').put(record);
}

function clearSession() {
  safeRemoveStorage(STORAGE_KEY);
  clearGunSession();
}

function loadSession() {
  try {
    const raw = safeReadStorage(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      session = { ...session, ...normalizeSessionSnapshot(parsed, clean(parsed.updatedAt)) };
    }
  } catch {
    safeRemoveStorage(STORAGE_KEY);
  }
}

function applyGunSession(record) {
  const remoteUpdatedAt = Date.parse(record?.updatedAt || '');
  const localUpdatedAt = sessionTimestamp(session);
  if (record?.cleared) {
    if (!Number.isNaN(remoteUpdatedAt) && remoteUpdatedAt > localUpdatedAt) {
      session = normalizeSessionSnapshot({}, record.updatedAt);
      writeLocalSession(session);
      render();
    }
    return;
  }

  const remoteSession = parseGunSessionRecord(record);
  if (!remoteSession) return;
  if (session.initial && sessionTimestamp(remoteSession) < localUpdatedAt) return;

  session = { ...session, ...remoteSession };
  writeLocalSession(remoteSession);
  render();
}

function loadGunSession() {
  if (!forgeSessionsNode || !forgeActorKey) return;

  getForgeSessionNode()?.once(applyGunSession);

  forgeSessionsNode.get(forgeActorKey).get('latest').once((latest) => {
    const latestSessionId = clean(latest?.sessionId);
    if (!latestSessionId || latest?.cleared || latestSessionId === forgeSessionId || session.initial) return;

    forgeSessionId = latestSessionId;
    safeWriteStorage(FORGE_GUN_SESSION_ID_KEY, forgeSessionId);
    getForgeSessionNode()?.once(applyGunSession);
  });
}

function addMessage(role, text) {
  const node = refs.messageTemplate.content.firstElementChild.cloneNode(true);
  node.classList.toggle('forge-message--user', role === 'You');
  node.querySelector('.forge-message__role').textContent = role;
  node.querySelector('p').textContent = text;
  refs.transcript.appendChild(node);
}

function formatGuidanceMessage(guidance) {
  if (!guidance) return '';

  return [
    `What I see: ${guidance.diagnosis}`,
    '',
    'Try this:',
    `- ${guidance.solutionPaths[0] || 'Make it smaller.'}`,
    '',
    'Then do this:',
    `- ${guidance.nextActions[0] || 'Pick one next step.'}`,
  ].join('\n');
}

function renderTranscript() {
  refs.transcript.replaceChildren();

  if (!session.initial) return;

  addMessage('You', session.initial);

  session.followUps.forEach((followUp, index) => {
    if (index < session.followUpIndex || session.answers[followUp.key]) {
      addMessage('Forge', followUp.question);
    }
    if (session.answers[followUp.key]) {
      addMessage('You', session.answers[followUp.key]);
    }
  });

  if (session.stage === stage.GENERATING) {
    addMessage('Forge', 'Good raw material. Too vague right now. Let’s sharpen it into a test.');
  }
}

function renderGuidance() {
  const shouldShow = Boolean(session.initial && session.guidance && session.stage !== stage.BRIEF);
  if (!refs.guidancePanel) return;

  refs.guidancePanel.hidden = !shouldShow;
  if (!shouldShow) return;

  refs.guidanceDiagnosis.textContent = session.guidance.diagnosis;
  refs.guidancePaths.replaceChildren();
  refs.guidanceActions.replaceChildren();

  session.guidance.solutionPaths.slice(0, 1).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    refs.guidancePaths.appendChild(li);
  });

  session.guidance.nextActions.slice(0, 1).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    refs.guidanceActions.appendChild(li);
  });
}

function renderProgress() {
  if (!refs.progress || !refs.progressLabel || !refs.progressBar) return;

  if (session.stage === stage.INITIAL || session.stage === stage.INTRO || session.stage === stage.BRIEF) {
    refs.progress.hidden = true;
    return;
  }

  const total = session.followUps.length || 3;
  const answered = Math.min(Object.keys(session.answers || {}).length, total);
  const active = Math.min(session.followUpIndex + 1, total);
  const percent = session.stage === stage.GENERATING
    ? 100
    : Math.max(18, Math.round(((answered + 1) / (total + 1)) * 100));
  const label = session.stage === stage.GENERATING
    ? 'Making the plan'
    : `Step ${active} of ${total}`;

  refs.progress.hidden = false;
  refs.progressLabel.textContent = label;
  refs.progressBar.style.width = `${percent}%`;
}

function resolveAppStep() {
  if (session.stage === stage.BRIEF || session.stage === stage.GENERATING) {
    return 'brief';
  }

  if (session.stage === stage.FOLLOWUPS) {
    return 'followups';
  }

  return 'initial';
}

function renderAppChrome(statusText) {
  const activeStep = resolveAppStep();

  if (refs.appStatus) {
    refs.appStatus.textContent = statusText.replace(/\.$/, '');
  }

  if (refs.inputMode) {
    const labels = {
      initial: 'Sort',
      followups: 'Shape',
      brief: 'Plan',
    };
    refs.inputMode.textContent = labels[activeStep] || 'Sort';
  }

  refs.stageSteps.forEach((step) => {
    const isActive = step.dataset.forgeStep === activeStep;
    step.dataset.active = isActive ? 'true' : 'false';
    if (isActive) {
      step.setAttribute('aria-current', 'step');
    } else {
      step.removeAttribute('aria-current');
    }
  });
}

function currentPrompt() {
  if (session.stage === stage.GENERATING) {
    return {
      label: 'Making your plan.',
      button: 'Making...',
      placeholder: 'Hold tight. Forge is making a simple plan.',
    };
  }

  if (session.stage === stage.INITIAL || session.stage === stage.INTRO) {
    return {
      label: 'Tell me what feels stuck. One sentence is enough.',
      button: 'Help me sort it',
      placeholder: 'Example: I need money and I do not know what to do first.',
    };
  }

  const followUp = session.followUps[session.followUpIndex];
  const total = session.followUps.length || 3;
  const active = Math.min(session.followUpIndex + 1, total);
  return {
    label: followUp?.question ? `Step ${active} of ${total}: ${followUp.question}` : 'Ready to make the plan.',
    button: session.followUpIndex >= session.followUps.length - 1 ? 'Make my plan' : 'Next',
    placeholder: 'A short answer is enough. You can say I do not know.',
  };
}

function simpleAnswerForCurrentPrompt() {
  const followUp = session.followUps[session.followUpIndex];
  const key = followUp?.key || '';

  if (key === 'audience') {
    return 'Me first, then people like me.';
  }

  if (key === 'help' || key === 'tiny') {
    return 'a simple page, message, or checklist I can use this week.';
  }

  if (key === 'shape') {
    return 'Start with a simple page or service.';
  }

  if (key === 'resources') {
    return 'My skills, my phone, and a few people I can ask.';
  }

  return 'I do not know yet. Help me pick the simplest next step.';
}

function renderBriefSection(key, label, value) {
  const node = refs.sectionTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.briefSection = key;
  node.classList.toggle('brief-section--strong', key === 'projectName' || key === 'realityCheck');
  node.classList.toggle(
    'brief-section--wide',
    ['projectName', 'projectConcept', 'tinyExperiment', 'testMessage', 'codexPrompt', 'realityCheck'].includes(key)
  );
  node.querySelector('.brief-section__label').textContent = label;
  const body = node.querySelector('.brief-section__body');

  if (Array.isArray(value)) {
    const list = document.createElement(key === 'firstActions' ? 'ol' : 'ul');
    value.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    body.appendChild(list);
  } else if (key === 'projectName') {
    const heading = document.createElement('h3');
    heading.textContent = value;
    body.appendChild(heading);
  } else {
    const paragraph = document.createElement('p');
    paragraph.textContent = value;
    body.appendChild(paragraph);
  }

  refs.briefOutput.appendChild(node);
}

function renderBrief() {
  refs.briefOutput.replaceChildren();
  if (!session.brief) return;

  briefOrder.forEach(([key, label]) => {
    renderBriefSection(key, label, session.brief[key]);
  });
}

function briefToMarkdown(brief) {
  if (!brief) return '';
  return [
    `# ${brief.projectName}`,
    '',
    '## Core Frustration',
    brief.coreFrustration,
    '',
    '## Audience',
    brief.audience,
    '',
    '## Project Concept',
    brief.projectConcept,
    '',
    '## Tiny 7-Day Experiment',
    brief.tinyExperiment,
    '',
    '## First 3 Actions',
    ...brief.firstActions.map((item) => `- ${item}`),
    '',
    '## Test Message',
    brief.testMessage,
    '',
    '## Codex Build Prompt',
    brief.codexPrompt,
    '',
    '## Reality Check',
    ...brief.realityCheck.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function makeLandingCopy(brief) {
  return [
    `${brief.projectName}`,
    '',
    `${brief.projectConcept}`,
    '',
    `For: ${brief.audience}.`,
    '',
    `This week's test: ${brief.tinyExperiment}`,
    '',
    'Want to react to the first version? Reply with what feels useful, vague, or missing.',
  ].join('\n');
}

function makeChecklist(brief) {
  return [
    'Day 1: Rewrite the project promise in one paragraph.',
    'Day 2: Choose 10 real people who match the audience.',
    'Day 3: Send the test message.',
    'Day 4: Track replies and objections.',
    'Day 5: Build only the smallest useful artifact.',
    'Day 6: Show the artifact to 3 people.',
    'Day 7: Decide whether to continue, change the audience, or stop.',
    '',
    `Project: ${brief.projectName}`,
  ].join('\n');
}

function renderNextOutput(kind) {
  if (!session.brief) return;

  const outputs = {
    testMessage: ['Test Message', session.brief.testMessage],
    codexPrompt: ['Codex Build Prompt', session.brief.codexPrompt],
    landingCopy: ['Landing Page Copy', makeLandingCopy(session.brief)],
    checklist: ['7-Day Checklist', makeChecklist(session.brief)],
  };
  const [title, body] = outputs[kind] || outputs.testMessage;

  session.nextOutput = body;
  refs.nextOutputTitle.textContent = title;
  refs.nextOutputBody.textContent = body;
  refs.nextOutput.hidden = false;
  saveSession();
}

function render() {
  const prompt = currentPrompt();
  const statusText = isBusy
    ? (session.notice || 'Forge AI is working...')
    : session.notice || (session.stage === stage.BRIEF ? 'Plan ready.' : 'Ready.');

  document.body.dataset.forgeStage = session.stage;
  refs.conversationPanel.hidden = session.stage === stage.BRIEF;
  refs.inputLabel.textContent = prompt.label;
  refs.submit.textContent = prompt.button;
  refs.answer.placeholder = prompt.placeholder;
  refs.answer.value = '';
  refs.answer.disabled = isBusy || session.stage === stage.GENERATING || session.stage === stage.BRIEF;
  refs.submit.disabled = isBusy || session.stage === stage.GENERATING || session.stage === stage.BRIEF;
  refs.spark.hidden = isBusy || Boolean(session.initial) || session.stage !== stage.INITIAL;
  if (refs.easyAnswer) {
    refs.easyAnswer.hidden = isBusy || session.stage !== stage.FOLLOWUPS;
  }
  if (refs.presets) {
    refs.presets.hidden = isBusy || Boolean(session.initial) || session.stage !== stage.INITIAL;
  }
  refs.reset.hidden = !session.initial && session.stage === stage.INITIAL;
  refs.briefPanel.hidden = session.stage !== stage.BRIEF;
  refs.status.textContent = statusText;
  if (refs.briefStatus) refs.briefStatus.textContent = statusText;
  renderAppChrome(statusText);

  renderProgress();
  renderTranscript();
  renderGuidance();
  renderBrief();

  if (session.nextOutput && refs.nextOutput.hidden && session.stage === stage.BRIEF) {
    refs.nextOutputBody.textContent = session.nextOutput;
    refs.nextOutput.hidden = false;
  }
}

async function prepareFollowUps(initial) {
  isBusy = true;
  setNotice('Finding a simple first step...');
  render();

  try {
    const result = await requestForge('followups', { initial });
    session.guidance = normalizeForgeGuidanceResponse(result?.guidance, initial);
    session.followUps = normalizeFollowUpsResponse(result?.questions);
    setNotice('Start here. Answer two easy steps, or use the simple answer.');
  } catch (error) {
    session.guidance = buildLocalForgeGuidance(initial);
    session.followUps = chooseFollowUps(initial);
    setNotice('Simple path loaded. Keep going.');
  } finally {
    isBusy = false;
    session.stage = stage.FOLLOWUPS;
    saveSession();
    render();
    window.requestAnimationFrame(() => refs.answer.focus());
  }
}

async function refineForgeTurn() {
  isBusy = true;
  setNotice('Updating the plan...');
  render();

  try {
    const result = await requestForge('followups', {
      initial: session.initial,
      followUps: session.followUps,
      answers: session.answers,
    });
    session.guidance = normalizeForgeGuidanceResponse(result?.guidance, session.initial);
    session.followUps = mergeFollowUpsResponse(result?.questions, session.followUpIndex);
    setNotice('Plan updated. One more small step.');
  } catch (error) {
    setNotice('Kept the simple path. Keep going.');
  } finally {
    isBusy = false;
    saveSession();
    render();
    window.requestAnimationFrame(() => refs.answer.focus());
  }
}

async function generateBrief() {
  session.stage = stage.GENERATING;
  isBusy = true;
  setNotice('Making your plan...');
  render();

  try {
    const result = await requestForge('brief', {
      initial: session.initial,
      followUps: session.followUps,
      answers: session.answers,
    });
    session.brief = normalizeBriefResponse(result?.brief);
    session.briefSource = 'ai';
    setNotice('Plan ready.');
  } catch (error) {
    session.brief = buildMockMovementBrief(session);
    session.briefSource = 'local-fallback';
    setNotice('Plan ready.');
  } finally {
    isBusy = false;
    session.stage = stage.BRIEF;
    saveSession();
    render();
    refs.briefPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isBusy) return;

  const value = clean(refs.answer.value);
  if (!value) {
    refs.status.textContent = 'Type one sentence or pick a starter.';
    return;
  }

  if (session.stage === stage.INTRO || session.stage === stage.INITIAL) {
    session.initial = value;
    session.guidance = buildLocalForgeGuidance(value);
    session.followUps = chooseFollowUps(value);
    session.followUpIndex = 0;
    session.stage = stage.FOLLOWUPS;
    setNotice('Start here. Answer two easy steps, or use the simple answer.');
    saveSession();
    render();
    window.requestAnimationFrame(() => refs.answer.focus());
    return;
  }

  const followUp = session.followUps[session.followUpIndex];
  if (followUp) {
    session.answers[followUp.key] = value;
  }

  if (session.followUpIndex >= session.followUps.length - 1) {
    saveSession();
    await generateBrief();
    return;
  }

  session.followUpIndex += 1;
  setNotice('Good. One more small step.');
  saveSession();
  render();
  window.requestAnimationFrame(() => refs.answer.focus());
}

async function writeText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = document.createElement('textarea');
    fallback.value = text;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed';
    fallback.style.left = '-9999px';
    document.body.appendChild(fallback);
    fallback.select();
    document.execCommand('copy');
    fallback.remove();
  }
  refs.status.textContent = successMessage;
  if (refs.briefStatus) refs.briefStatus.textContent = successMessage;
}

function downloadBrief() {
  if (!session.brief) return;
  const blob = new Blob([briefToMarkdown(session.brief)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${session.brief.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'forge-brief'}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  refs.status.textContent = 'Plan downloaded.';
  if (refs.briefStatus) refs.briefStatus.textContent = 'Plan downloaded.';
}

function resetForge() {
  session = {
    stage: stage.INITIAL,
    initial: '',
    guidance: null,
    followUps: defaultFollowUps,
    followUpIndex: 0,
    answers: {},
    brief: null,
    nextOutput: '',
    notice: '',
    briefSource: '',
  };
  refs.nextOutput.hidden = true;
  refs.nextOutputBody.textContent = '';
  clearSession();
  render();
}

function sparkIdea() {
  const spark = starterSparks[sparkIndex % starterSparks.length];
  sparkIndex += 1;
  refs.answer.value = spark;
  refs.status.textContent = 'Example loaded. Edit it or send it.';
  refs.answer.focus();
}

function usePresetIdea(event) {
  const idea = clean(event.currentTarget?.dataset?.presetIdea);
  if (!idea) return;

  refs.answer.value = idea;
  refs.status.textContent = 'Starter loaded. Edit it or send it.';
  refs.answer.focus();
}

function useSimpleAnswer() {
  refs.answer.value = simpleAnswerForCurrentPrompt();
  refs.status.textContent = 'Simple answer added. You can edit it.';
  refs.answer.focus();
}

refs.form?.addEventListener('submit', handleSubmit);
refs.spark?.addEventListener('click', sparkIdea);
refs.easyAnswer?.addEventListener('click', useSimpleAnswer);
refs.presetButtons.forEach((button) => {
  button.addEventListener('click', usePresetIdea);
});
refs.reset?.addEventListener('click', resetForge);
refs.resetBrief?.addEventListener('click', resetForge);
refs.copyBrief?.addEventListener('click', () => {
  if (session.brief) {
    writeText(briefToMarkdown(session.brief), 'Plan copied.');
  }
});
refs.downloadBrief?.addEventListener('click', downloadBrief);
refs.nextMoveButtons.forEach((button) => {
  button.addEventListener('click', () => renderNextOutput(button.dataset.nextMove));
});
refs.copyNextOutput?.addEventListener('click', () => {
  if (session.nextOutput) {
    writeText(session.nextOutput, 'Next move copied.');
  }
});

subscribeToSharedDefaults();
loadSession();
render();
loadGunSession();
