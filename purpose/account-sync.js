import { buildAlignmentProfileFromPurposeState } from '../src/kernel/alignmentProfile.js';
import { createAlignmentProfileSync } from '../src/kernel/alignmentProfileSync.js';

const PURPOSE_STORAGE_KEY = '3dvr-purpose-draft-v1';
const PURPOSE_ACCOUNT_NODE = 'purpose-map-v1';
const EMPTY_STATE = Object.freeze({
  version: 1,
  step: 'start',
  promptIndex: 0,
  answers: ['', '', '', '', ''],
  map: null,
  updatedAt: null
});

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizePurposeState(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const answers = Array.isArray(source.answers) ? source.answers : [];
  return {
    version: 1,
    step: ['start', 'prompt', 'map'].includes(source.step) ? source.step : 'start',
    promptIndex: Math.min(4, Math.max(0, Number.parseInt(source.promptIndex, 10) || 0)),
    answers: Array.from({ length: 5 }, (_item, index) => cleanText(answers[index])),
    map: source.map && typeof source.map === 'object' ? source.map : null,
    updatedAt: source.updatedAt || null
  };
}

function parseLocal(storage) {
  try {
    const raw = storage.getItem(PURPOSE_STORAGE_KEY);
    return raw ? normalizePurposeState(JSON.parse(raw)) : { ...EMPTY_STATE, answers: [...EMPTY_STATE.answers] };
  } catch {
    return { ...EMPTY_STATE, answers: [...EMPTY_STATE.answers] };
  }
}

function updatedAtMs(state = {}) {
  const parsed = Date.parse(state.updatedAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasPurposeSignal(state = {}) {
  return Array.isArray(state.answers) && state.answers.slice(1).some((answer) => cleanText(answer).length >= 3);
}

function once(node, timerWindow = window) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = timerWindow.setTimeout(() => finish(null), 2500);
    try {
      node.once((value) => finish(value));
    } catch {
      finish(null);
    }
  });
}

function put(node, value) {
  return new Promise((resolve) => {
    try {
      node.put(value, (ack) => resolve(!ack?.err));
    } catch {
      resolve(false);
    }
  });
}

export function pickNewestPurposeState(localState = {}, remoteState = {}) {
  const local = normalizePurposeState(localState);
  const remote = normalizePurposeState(remoteState);
  return updatedAtMs(remote) > updatedAtMs(local) ? remote : local;
}

export async function createPurposeAccountRuntime({ windowObj = window } = {}) {
  const storage = windowObj.localStorage;
  const setStatus = (message) => {
    const node = windowObj.document?.querySelector?.('[data-status]');
    if (node && message) node.textContent = message;
  };

  if (typeof windowObj.Gun !== 'function' || !windowObj.SEA) {
    return { available: false, syncCurrent: async () => false };
  }

  try {
    windowObj.AuthIdentity?.syncStorageFromSharedIdentity?.(storage);
    const gun = windowObj.Gun({ peers: windowObj.__GUN_PEERS__ || [] });
    const user = gun.user();
    user.recall?.({ sessionStorage: true, localStorage: true });
    for (let attempt = 0; attempt < 12 && !user.is; attempt += 1) {
      await new Promise((resolve) => windowObj.setTimeout(resolve, 150));
    }

    const pair = user?._?.sea;
    const SEA = windowObj.SEA || windowObj.Gun.SEA;
    if (!user.is?.pub || !pair || !SEA?.encrypt || !SEA?.decrypt) {
      return { available: false, syncCurrent: async () => false };
    }

    const purposeNode = user.get('purpose').get(PURPOSE_ACCOUNT_NODE);
    const alignmentSync = createAlignmentProfileSync({ user, SEA });
    const remoteRecord = await once(purposeNode, windowObj);
    let remoteState = null;
    if (remoteRecord?.ciphertext) {
      const decoded = await SEA.decrypt(remoteRecord.ciphertext, pair);
      if (decoded) remoteState = normalizePurposeState(typeof decoded === 'string' ? JSON.parse(decoded) : decoded);
    }

    const localState = parseLocal(storage);
    const restored = Boolean(remoteState && updatedAtMs(remoteState) > updatedAtMs(localState));
    if (restored) storage.setItem(PURPOSE_STORAGE_KEY, JSON.stringify(remoteState));

    const syncCurrent = async () => {
      const current = parseLocal(storage);
      if (!hasPurposeSignal(current)) return false;
      const ciphertext = await SEA.encrypt(JSON.stringify(current), pair);
      if (!ciphertext) return false;
      const saved = await put(purposeNode, {
        schemaVersion: 1,
        updatedAt: current.updatedAt || new Date().toISOString(),
        ciphertext
      });
      if (!saved) return false;
      await alignmentSync.write(buildAlignmentProfileFromPurposeState(current));
      return true;
    };

    if (!restored && hasPurposeSignal(localState)) await syncCurrent();
    setStatus('Purpose Map sync is ready. Personal alignment stays encrypted to your account.');
    return { available: true, restored, syncCurrent };
  } catch {
    setStatus('Purpose Map is saved on this device. Account sync will retry later.');
    return { available: false, syncCurrent: async () => false };
  }
}

async function boot() {
  const runtime = await createPurposeAccountRuntime();
  await import('./app.js');

  const saveLink = document.querySelector('[data-create-account]');
  if (runtime.available && saveLink) {
    saveLink.textContent = 'Synced to Account';
    saveLink.href = '/account/';
  }

  if (!runtime.available) return;
  let lastRaw = localStorage.getItem(PURPOSE_STORAGE_KEY) || '';
  window.setInterval(async () => {
    const currentRaw = localStorage.getItem(PURPOSE_STORAGE_KEY) || '';
    if (currentRaw === lastRaw) return;
    lastRaw = currentRaw;
    try {
      if (await runtime.syncCurrent()) {
        const status = document.querySelector('[data-status]');
        if (status) status.textContent = 'Saved securely to your account and this device.';
      }
    } catch {
      // Local storage remains the source of truth until secure sync is available again.
    }
  }, 2500);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot();
}
