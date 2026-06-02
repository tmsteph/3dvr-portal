export const ALLOWED_BIT_COUNTS = Object.freeze([256, 1024, 4096, 16384]);
const ALLOWED_MODES = Object.freeze([
  'baseline',
  'intention-more-ones',
  'intention-fewer-ones',
  'action-only',
]);
const ACTION_STATUSES = Object.freeze(['completed', 'planned', 'skipped']);
const DEFAULT_PEERS = Object.freeze([
  'wss://gun-relay-3dvr.fly.dev/gun',
  'https://gun-relay-3dvr.fly.dev/gun',
]);
const RECENT_RUN_LIMIT = 8;

let fallbackRunCounter = 0;

export function countBitsFromUint32Array(words, requestedBitCount) {
  if (!words || typeof words.length !== 'number') {
    throw new TypeError('words must be an array-like collection of unsigned 32-bit values');
  }

  const bitCount = normalizePositiveInteger(requestedBitCount, 'requestedBitCount');
  if (bitCount > words.length * 32) {
    throw new RangeError('requestedBitCount exceeds the available bits');
  }

  let ones = 0;
  for (let bitIndex = 0; bitIndex < bitCount; bitIndex += 1) {
    const word = Number(words[Math.floor(bitIndex / 32)]) >>> 0;
    const shift = bitIndex % 32;
    ones += (word >>> shift) & 1;
  }
  return ones;
}

export function makeRandomBitSample(bitCount, cryptoProvider = globalThis.crypto) {
  const normalizedBitCount = normalizeAllowedBitCount(bitCount);
  if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is required for browser randomness trials');
  }

  const words = new Uint32Array(Math.ceil(normalizedBitCount / 32));
  cryptoProvider.getRandomValues(words);
  const ones = countBitsFromUint32Array(words, normalizedBitCount);
  return {
    source: 'browser-crypto-getRandomValues',
    bitCount: normalizedBitCount,
    ones,
    zeros: normalizedBitCount - ones,
    words,
  };
}

export function analyzeBitBalance(ones, bitCount) {
  const normalizedBitCount = normalizePositiveInteger(bitCount, 'bitCount');
  const normalizedOnes = normalizeInteger(ones, 'ones');
  if (normalizedOnes < 0 || normalizedOnes > normalizedBitCount) {
    throw new RangeError('ones must be between 0 and bitCount');
  }

  const expectedOnes = normalizedBitCount / 2;
  const difference = normalizedOnes - expectedOnes;
  const zScore = difference / Math.sqrt(normalizedBitCount * 0.25);
  const pTwoTailed = twoTailedPFromZ(zScore);
  return {
    source: 'browser-crypto-getRandomValues',
    bitCount: normalizedBitCount,
    ones: normalizedOnes,
    zeros: normalizedBitCount - normalizedOnes,
    expectedOnes,
    difference,
    zScore,
    pTwoTailed,
    interpretation: buildNeutralInterpretation(pTwoTailed),
  };
}

export function normalCdfApprox(z) {
  const value = Number(z);
  if (!Number.isFinite(value)) {
    throw new TypeError('z must be a finite number');
  }

  return 0.5 * (1 + erfApprox(value / Math.SQRT2));
}

export function twoTailedPFromZ(z) {
  const value = Math.abs(Number(z));
  if (!Number.isFinite(value)) {
    throw new TypeError('z must be a finite number');
  }

  const p = 2 * (1 - normalCdfApprox(value));
  return Math.max(0, Math.min(1, p));
}

export function buildRunRecord(input = {}, identity = {}) {
  const now = new Date().toISOString();
  const mode = ALLOWED_MODES.includes(input.mode) ? input.mode : 'baseline';
  const rng = normalizeRngResult(input.rng);
  const author = normalizeAuthor(identity);

  return {
    id: normalizeText(input.id) || makeRunId(),
    app: 'intention-lab',
    version: 1,
    createdAt: normalizeText(input.createdAt) || now,
    updatedAt: normalizeText(input.updatedAt) || now,
    author,
    mode,
    intention: {
      statement: normalizeText(input.intention?.statement),
      thought: normalizeText(input.intention?.thought),
      desiredState: normalizeText(input.intention?.desiredState),
      nextAction: normalizeText(input.intention?.nextAction),
    },
    preState: normalizeStateRatings(input.preState),
    grounding: {
      seconds: normalizeTimerSeconds(input.grounding?.seconds),
      completed: Boolean(input.grounding?.completed),
    },
    rng,
    postState: normalizeStateRatings(input.postState),
    action: {
      status: ACTION_STATUSES.includes(input.action?.status) ? input.action.status : 'planned',
      note: normalizeText(input.action?.note),
    },
    notes: normalizeText(input.notes),
    safetyAcknowledged: Boolean(input.safetyAcknowledged),
  };
}

export function escapeCsvValue(value) {
  if (value === null || typeof value === 'undefined') {
    return '';
  }
  const stringValue = String(value);
  if (!/[",\n\r]/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function runRecordToCsv(run) {
  const record = buildRunRecord(run, run?.author || {});
  const headers = [
    'id',
    'createdAt',
    'authorId',
    'mode',
    'intention',
    'nextAction',
    'preCalm',
    'preFocus',
    'preEnergy',
    'preMood',
    'postCalm',
    'postFocus',
    'postEnergy',
    'postMood',
    'bitCount',
    'ones',
    'zeros',
    'difference',
    'zScore',
    'pTwoTailed',
    'actionStatus',
    'actionNote',
    'notes',
  ];
  const values = [
    record.id,
    record.createdAt,
    record.author.id,
    record.mode,
    record.intention.statement,
    record.intention.nextAction,
    record.preState.calm,
    record.preState.focus,
    record.preState.energy,
    record.preState.mood,
    record.postState.calm,
    record.postState.focus,
    record.postState.energy,
    record.postState.mood,
    record.rng.bitCount,
    record.rng.ones,
    record.rng.zeros,
    record.rng.difference,
    record.rng.zScore,
    record.rng.pTwoTailed,
    record.action.status,
    record.action.note,
    record.notes,
  ];

  return `${headers.join(',')}\n${values.map(escapeCsvValue).join(',')}\n`;
}

function normalizeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new TypeError(`${label} must be an integer`);
  }
  return number;
}

function normalizePositiveInteger(value, label) {
  const number = normalizeInteger(value, label);
  if (number <= 0) {
    throw new RangeError(`${label} must be greater than zero`);
  }
  return number;
}

function normalizeAllowedBitCount(value) {
  const bitCount = normalizePositiveInteger(value, 'bitCount');
  if (!ALLOWED_BIT_COUNTS.includes(bitCount)) {
    throw new RangeError(`bitCount must be one of: ${ALLOWED_BIT_COUNTS.join(', ')}`);
  }
  return bitCount;
}

function erfApprox(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function buildNeutralInterpretation(pTwoTailed) {
  if (pTwoTailed < 0.01) {
    return 'This run shows an uncommon statistical deviation. It does not prove intention caused the result.';
  }
  if (pTwoTailed < 0.05) {
    return 'This run shows a noticeable statistical deviation. Treat it as one data point, not a conclusion.';
  }
  return 'This is a small statistical deviation summary. It does not prove intention caused the result.';
}

function normalizeRngResult(rng = {}) {
  const source = 'browser-crypto-getRandomValues';
  const bitCount = Number(rng.bitCount || 0);
  const ones = Number(rng.ones || 0);

  if (Number.isInteger(bitCount) && bitCount > 0 && Number.isInteger(ones)) {
    return analyzeBitBalance(ones, bitCount);
  }

  return {
    source,
    bitCount: 0,
    ones: 0,
    zeros: 0,
    expectedOnes: 0,
    difference: 0,
    zScore: 0,
    pTwoTailed: 1,
    interpretation: 'No randomness trial was run for this session.',
  };
}

function normalizeStateRatings(source = {}) {
  return {
    calm: clampRating(source.calm),
    focus: clampRating(source.focus),
    energy: clampRating(source.energy),
    mood: clampRating(source.mood),
  };
}

function clampRating(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 3;
  }
  return Math.max(1, Math.min(5, Math.round(number)));
}

function normalizeTimerSeconds(value) {
  const seconds = Number(value);
  return [30, 60, 180].includes(seconds) ? seconds : 30;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAuthor(identity = {}) {
  const pub = normalizeText(identity.pub);
  const alias = normalizeText(identity.alias);
  const id = normalizeText(identity.id) || pub || alias || 'guest';
  return {
    id,
    ...(pub ? { pub } : {}),
    ...(alias ? { alias } : {}),
    isGuest: typeof identity.isGuest === 'boolean' ? identity.isGuest : !pub,
  };
}

function makeRunId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `intention-${cryptoApi.randomUUID()}`;
  }
  fallbackRunCounter += 1;
  return `intention-${Date.now()}-${fallbackRunCounter}`;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return '{}';
  }
}

function formatNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '0';
  }
  return number.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatPValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 'n/a';
  }
  if (number < 0.0001) {
    return '< 0.0001';
  }
  return number.toLocaleString(undefined, {
    maximumFractionDigits: 4,
    minimumFractionDigits: 4,
  });
}

function safeLocalStorageGet(key) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch (_error) {
    return '';
  }
}

function safeSetText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function initBrowserApp() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const refs = {
    form: document.getElementById('intentionForm'),
    mode: document.getElementById('sessionMode'),
    bitCount: document.getElementById('bitCount'),
    runRng: document.getElementById('runRng'),
    rngStatus: document.getElementById('rngStatus'),
    rngGrid: document.getElementById('rngGrid'),
    rngResults: document.getElementById('rngResults'),
    timerDisplay: document.getElementById('timerDisplay'),
    timerCue: document.getElementById('timerCue'),
    timerRing: document.getElementById('timerRing'),
    timerStatus: document.getElementById('timerStatus'),
    startTimer: document.getElementById('startTimer'),
    pauseTimer: document.getElementById('pauseTimer'),
    resetTimer: document.getElementById('resetTimer'),
    saveRun: document.getElementById('saveRun'),
    copyJson: document.getElementById('copyJson'),
    downloadCsv: document.getElementById('downloadCsv'),
    clearSession: document.getElementById('clearSession'),
    syncStatus: document.getElementById('syncStatus'),
    recentRuns: document.getElementById('recentRuns'),
    stateDelta: document.getElementById('stateDelta'),
    preOutputs: Array.from(document.querySelectorAll('[data-rating-output="pre"]')),
    postOutputs: Array.from(document.querySelectorAll('[data-rating-output="post"]')),
    timerOptions: Array.from(document.querySelectorAll('[data-timer-seconds]')),
    ratingInputs: Array.from(document.querySelectorAll('input[type="range"][data-rating]')),
  };

  if (!refs.form || !refs.runRng) {
    return;
  }

  const state = {
    timerDuration: 30,
    timerRemaining: 30,
    timerId: null,
    timerCompleted: false,
    latestSample: null,
    latestRun: null,
    recentRuns: new Map(),
    gunContext: null,
    gunRoot: null,
    author: { id: 'guest', isGuest: true },
  };

  bindEvents(refs, state);
  connectGun(refs, state);
  renderTimer(refs, state);
  renderRatings(refs);
  renderStateDelta(refs);
  renderRecentRuns(refs, state);
  renderCryptoStatus(refs);
}

function bindEvents(refs, state) {
  refs.timerOptions.forEach(button => {
    button.addEventListener('click', () => {
      const seconds = normalizeTimerSeconds(button.getAttribute('data-timer-seconds'));
      stopTimer(state);
      state.timerDuration = seconds;
      state.timerRemaining = seconds;
      state.timerCompleted = false;
      renderTimer(refs, state);
    });
  });

  refs.startTimer.addEventListener('click', () => startTimer(refs, state));
  refs.pauseTimer.addEventListener('click', () => {
    stopTimer(state);
    renderTimer(refs, state);
  });
  refs.resetTimer.addEventListener('click', () => {
    stopTimer(state);
    state.timerRemaining = state.timerDuration;
    state.timerCompleted = false;
    renderTimer(refs, state);
  });

  refs.ratingInputs.forEach(input => {
    input.addEventListener('input', () => {
      renderRatings(refs);
      renderStateDelta(refs);
    });
  });

  refs.runRng.addEventListener('click', () => runRngTrial(refs, state));
  refs.saveRun.addEventListener('click', () => saveCurrentRun(refs, state));
  refs.copyJson.addEventListener('click', () => copyCurrentJson(refs, state));
  refs.downloadCsv.addEventListener('click', () => downloadCurrentCsv(refs, state));
  refs.clearSession.addEventListener('click', () => clearSession(refs, state));

  refs.form.addEventListener('input', () => {
    state.latestRun = null;
  });
}

function connectGun(refs, state) {
  const context = getGunContext();
  state.gunContext = context;
  state.author = resolveAuthor(context.user);

  if (!context.gun || typeof context.gun.get !== 'function') {
    setSyncStatus(refs, 'Sync helper unavailable. Copy JSON or CSV to keep this run.', 'warn');
    return;
  }

  state.gunRoot = context.gun.get('3dvr-portal').get('intention-lab');
  setSyncStatus(
    refs,
    context.isStub ? 'Offline sync mode. Export is available.' : `Gun sync ready as ${state.author.alias || state.author.id}.`,
    context.isStub ? 'warn' : 'ok'
  );
  subscribeRecentRuns(refs, state);
}

function getGunContext() {
  const factory = () => {
    if (typeof window.Gun !== 'function') {
      return null;
    }
    const peers = Array.isArray(window.__GUN_PEERS__) ? window.__GUN_PEERS__ : DEFAULT_PEERS;
    try {
      return window.Gun({ peers, axe: true });
    } catch (error) {
      console.warn('Intention Lab Gun init failed', error);
      return null;
    }
  };

  if (window.ScoreSystem && typeof window.ScoreSystem.ensureGun === 'function') {
    return window.ScoreSystem.ensureGun(factory, { label: 'intention-lab' });
  }

  const gun = factory();
  if (gun) {
    return {
      gun,
      user: typeof gun.user === 'function' ? gun.user() : null,
      isStub: !!gun.__isGunStub,
    };
  }

  return {
    gun: null,
    user: null,
    isStub: true,
  };
}

function resolveAuthor(user) {
  if (window.AuthIdentity && typeof window.AuthIdentity.syncStorageFromSharedIdentity === 'function') {
    try {
      window.AuthIdentity.syncStorageFromSharedIdentity(window.localStorage);
    } catch (error) {
      console.warn('Failed to sync shared identity', error);
    }
  }

  if (user && user.is && user.is.pub) {
    return {
      id: user.is.pub,
      pub: user.is.pub,
      alias: normalizeText(user.is.alias) || normalizeText(safeLocalStorageGet('alias')),
      isGuest: false,
    };
  }

  const signedIn = safeLocalStorageGet('signedIn') === 'true';
  const alias = normalizeText(safeLocalStorageGet('alias'));
  if (signedIn && alias) {
    return {
      id: alias.toLowerCase(),
      alias,
      isGuest: false,
    };
  }

  const guestId = window.ScoreSystem && typeof window.ScoreSystem.ensureGuestIdentity === 'function'
    ? window.ScoreSystem.ensureGuestIdentity()
    : safeLocalStorageGet('guestId') || 'guest';
  return {
    id: guestId || 'guest',
    alias: normalizeText(safeLocalStorageGet('guestDisplayName')) || 'Guest',
    isGuest: true,
  };
}

function subscribeRecentRuns(refs, state) {
  if (!state.gunRoot || typeof state.gunRoot.get !== 'function') {
    return;
  }

  const runsNode = state.gunRoot.get('runs');
  if (!runsNode || typeof runsNode.map !== 'function') {
    return;
  }

  runsNode.map().on((run, key) => {
    if (!run || run.app !== 'intention-lab') {
      return;
    }
    const runId = normalizeText(run.id) || key;
    state.recentRuns.set(runId, run);
    renderRecentRuns(refs, state);
  });
}

function renderCryptoStatus(refs) {
  const cryptoReady = !!(window.crypto && typeof window.crypto.getRandomValues === 'function');
  refs.runRng.disabled = !cryptoReady;
  if (!cryptoReady) {
    setRngStatus(refs, 'Browser crypto is unavailable here, so RNG trials are disabled.', 'warn');
    return;
  }
  setRngStatus(refs, 'Ready to sample browser cryptographic randomness.', 'neutral');
}

function startTimer(refs, state) {
  if (state.timerId) {
    return;
  }
  if (state.timerRemaining <= 0) {
    state.timerRemaining = state.timerDuration;
    state.timerCompleted = false;
  }
  state.timerId = window.setInterval(() => {
    state.timerRemaining = Math.max(0, state.timerRemaining - 1);
    if (state.timerRemaining === 0) {
      stopTimer(state);
      state.timerCompleted = true;
    }
    renderTimer(refs, state);
  }, 1000);
  renderTimer(refs, state);
}

function stopTimer(state) {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function renderTimer(refs, state) {
  const minutes = String(Math.floor(state.timerRemaining / 60)).padStart(2, '0');
  const seconds = String(state.timerRemaining % 60).padStart(2, '0');
  const progress = state.timerDuration
    ? (state.timerDuration - state.timerRemaining) / state.timerDuration
    : 0;
  refs.timerDisplay.textContent = `${minutes}:${seconds}`;
  refs.timerRing.style.setProperty('--timer-progress', String(Math.max(0, Math.min(1, progress))));
  refs.timerRing.style.setProperty('--timer-angle', `${Math.max(0, Math.min(1, progress)) * 360}deg`);
  refs.timerOptions.forEach(button => {
    const isActive = Number(button.getAttribute('data-timer-seconds')) === state.timerDuration;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  const cue = state.timerCompleted ? 'Complete. Take the next action.' : getBreathingCue(state);
  refs.timerCue.textContent = cue;
  refs.timerStatus.textContent = state.timerId
    ? 'Timer running'
    : (state.timerCompleted ? 'Grounding completed' : 'Timer paused');
}

function getBreathingCue(state) {
  if (!state.timerId) {
    return 'Settle your attention before the next step.';
  }
  const elapsed = state.timerDuration - state.timerRemaining;
  return elapsed % 8 < 4 ? 'Inhale slowly' : 'Exhale and soften';
}

function runRngTrial(refs, state) {
  try {
    const sample = makeRandomBitSample(Number(refs.bitCount.value), window.crypto);
    const analysis = analyzeBitBalance(sample.ones, sample.bitCount);
    state.latestSample = {
      ...analysis,
      words: sample.words,
    };
    state.latestRun = null;
    renderRngResults(refs, state.latestSample);
    renderBitGrid(refs, sample);
    setRngStatus(refs, 'RNG trial complete. The stats are descriptive, not proof of causation.', 'ok');
  } catch (error) {
    state.latestSample = null;
    renderRngResults(refs, null);
    refs.rngGrid.innerHTML = '';
    setRngStatus(refs, error.message || 'RNG trial failed.', 'warn');
  }
}

function renderRngResults(refs, result) {
  if (!result) {
    refs.rngResults.innerHTML = '<p class="muted">Run a sample to see neutral statistics.</p>';
    return;
  }

  refs.rngResults.innerHTML = `
    <dl class="stats-grid">
      <div><dt>Ones</dt><dd>${result.ones.toLocaleString()}</dd></div>
      <div><dt>Zeros</dt><dd>${result.zeros.toLocaleString()}</dd></div>
      <div><dt>Expected ones</dt><dd>${result.expectedOnes.toLocaleString()}</dd></div>
      <div><dt>Difference</dt><dd>${formatNumber(result.difference, 0)}</dd></div>
      <div><dt>z-score</dt><dd>${formatNumber(result.zScore)}</dd></div>
      <div><dt>two-tailed p</dt><dd>${formatPValue(result.pTwoTailed)}</dd></div>
    </dl>
    <p class="result-note">${escapeHtml(result.interpretation)}</p>
  `;
}

function renderBitGrid(refs, sample) {
  const visibleBits = Math.min(160, sample.bitCount);
  const step = Math.max(1, Math.floor(sample.bitCount / visibleBits));
  const cells = [];
  for (let bitIndex = 0; bitIndex < sample.bitCount && cells.length < visibleBits; bitIndex += step) {
    const word = sample.words[Math.floor(bitIndex / 32)] >>> 0;
    const value = (word >>> (bitIndex % 32)) & 1;
    cells.push(`<span class="bit-cell bit-cell--${value}" title="Bit ${bitIndex + 1}: ${value}">${value}</span>`);
  }
  refs.rngGrid.innerHTML = cells.join('');
}

function saveCurrentRun(refs, state) {
  const input = collectRunInput(refs, state);
  if (input.mode !== 'action-only' && !state.latestSample) {
    setSyncStatus(refs, 'Run an RNG trial first, or choose action-only reflection.', 'warn');
    return;
  }

  const run = buildRunRecord(input, state.author);
  state.latestRun = run;
  state.recentRuns.set(run.id, run);
  renderRecentRuns(refs, state);

  if (!state.gunRoot || typeof state.gunRoot.get !== 'function') {
    setSyncStatus(refs, 'Run prepared. Gun sync is unavailable, so use copy or CSV export.', 'warn');
    return;
  }

  const runsNode = state.gunRoot.get('runs');
  const authorsNode = state.gunRoot.get('authors').get(run.author.id).get('runs');
  runsNode.get(run.id).put(run, ack => {
    if (ack && ack.err) {
      setSyncStatus(refs, 'Run prepared. Gun sync will retry when the relay is reachable.', 'warn');
      return;
    }
    setSyncStatus(refs, 'Saved to Gun at 3dvr-portal/intention-lab/runs.', 'ok');
  });
  authorsNode.get(run.id).put(true);
  mirrorScienceSummary(state, run);
}

function mirrorScienceSummary(state, run) {
  if (!state.gunContext?.gun || typeof state.gunContext.gun.get !== 'function') {
    return;
  }
  const summary = {
    id: run.id,
    app: run.app,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    mode: run.mode,
    authorId: run.author.id,
    bitCount: run.rng.bitCount,
    ones: run.rng.ones,
    zeros: run.rng.zeros,
    zScore: run.rng.zScore,
    pTwoTailed: run.rng.pTwoTailed,
    actionStatus: run.action.status,
    sourcePath: `3dvr-portal/intention-lab/runs/${run.id}`,
  };
  state.gunContext.gun.get('science').get('runs').get(run.id).put(summary);
}

function collectRunInput(refs, state) {
  const formData = new FormData(refs.form);
  return {
    mode: normalizeText(formData.get('mode')),
    intention: {
      statement: normalizeText(formData.get('intention')),
      thought: normalizeText(formData.get('thought')),
      desiredState: normalizeText(formData.get('desiredState')),
      nextAction: normalizeText(formData.get('nextAction')),
    },
    preState: readStateRatings(formData, 'pre'),
    grounding: {
      seconds: state.timerDuration,
      completed: state.timerCompleted,
    },
    rng: state.latestSample,
    postState: readStateRatings(formData, 'post'),
    action: {
      status: normalizeText(formData.get('actionStatus')),
      note: normalizeText(formData.get('actionNote')),
    },
    notes: normalizeText(formData.get('notes')),
    safetyAcknowledged: formData.get('safetyAcknowledged') === 'on',
  };
}

function readStateRatings(formData, prefix) {
  return {
    calm: Number(formData.get(`${prefix}Calm`)),
    focus: Number(formData.get(`${prefix}Focus`)),
    energy: Number(formData.get(`${prefix}Energy`)),
    mood: Number(formData.get(`${prefix}Mood`)),
  };
}

function copyCurrentJson(refs, state) {
  const run = state.latestRun || buildRunRecord(collectRunInput(refs, state), state.author);
  state.latestRun = run;
  const text = safeStringify(run);
  copyText(text)
    .then(() => setSyncStatus(refs, 'JSON copied.', 'ok'))
    .catch(() => setSyncStatus(refs, 'Could not copy automatically. Use CSV export instead.', 'warn'));
}

function downloadCurrentCsv(refs, state) {
  const run = state.latestRun || buildRunRecord(collectRunInput(refs, state), state.author);
  state.latestRun = run;
  const csv = runRecordToCsv(run);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${run.id}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setSyncStatus(refs, 'CSV export downloaded.', 'ok');
}

async function copyText(value) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function clearSession(refs, state) {
  refs.form.reset();
  stopTimer(state);
  state.timerDuration = 30;
  state.timerRemaining = 30;
  state.timerCompleted = false;
  state.latestSample = null;
  state.latestRun = null;
  renderTimer(refs, state);
  renderRatings(refs);
  renderStateDelta(refs);
  renderRngResults(refs, null);
  refs.rngGrid.innerHTML = '';
  setSyncStatus(refs, 'Session cleared. Synced runs are unchanged.', 'neutral');
  renderCryptoStatus(refs);
}

function renderRatings(refs) {
  refs.ratingInputs.forEach(input => {
    const output = document.getElementById(`${input.id}Value`);
    if (output) {
      output.textContent = input.value;
    }
  });
}

function renderStateDelta(refs) {
  const formData = new FormData(refs.form);
  const pre = readStateRatings(formData, 'pre');
  const post = readStateRatings(formData, 'post');
  const delta = {
    calm: post.calm - pre.calm,
    focus: post.focus - pre.focus,
    energy: post.energy - pre.energy,
    mood: post.mood - pre.mood,
  };
  const parts = Object.entries(delta).map(([label, value]) => {
    const sign = value > 0 ? '+' : '';
    return `${label}: ${sign}${value}`;
  });
  refs.stateDelta.textContent = parts.join(' | ');
}

function renderRecentRuns(refs, state) {
  const runs = Array.from(state.recentRuns.values())
    .filter(run => run && run.app === 'intention-lab')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, RECENT_RUN_LIMIT);

  if (!runs.length) {
    refs.recentRuns.innerHTML = '<p class="muted">No synced runs yet.</p>';
    return;
  }

  refs.recentRuns.innerHTML = runs.map(run => {
    const title = run.intention?.statement || run.mode || 'Untitled run';
    const pValue = typeof run.rng?.pTwoTailed === 'number' ? formatPValue(run.rng.pTwoTailed) : 'n/a';
    const bitCount = Number(run.rng?.bitCount || 0).toLocaleString();
    return `
      <article class="recent-run">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(run.mode)} | ${escapeHtml(new Date(run.createdAt).toLocaleString())}</span>
        </div>
        <dl>
          <div><dt>bits</dt><dd>${bitCount}</dd></div>
          <div><dt>z</dt><dd>${formatNumber(run.rng?.zScore || 0)}</dd></div>
          <div><dt>p</dt><dd>${pValue}</dd></div>
        </dl>
      </article>
    `;
  }).join('');
}

function setSyncStatus(refs, message, tone = 'neutral') {
  refs.syncStatus.textContent = message;
  refs.syncStatus.dataset.tone = tone;
}

function setRngStatus(refs, message, tone = 'neutral') {
  refs.rngStatus.textContent = message;
  refs.rngStatus.dataset.tone = tone;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrowserApp, { once: true });
  } else {
    initBrowserApp();
  }
}
