import { buildAlignmentProfileFromLaunchRoomState } from '../src/kernel/alignmentProfile.js';
import { createAlignmentProfileSync } from '../src/kernel/alignmentProfileSync.js';

const STORAGE_KEY = '3dvr.launch-room.movement-brief.v1';

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function readDraft(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function hasDirection(draft = {}) {
  return ['movementName', 'worldPain', 'worldWish', 'firstAudience', 'tinyProject']
    .some((key) => clean(draft[key]).length >= 3);
}

function signedInMarkerExists(windowObj, storage) {
  const shared = windowObj.AuthIdentity?.readSharedIdentity?.() || {};
  let storedSignedIn = false;
  try {
    storedSignedIn = storage.getItem('signedIn') === 'true';
  } catch {
    storedSignedIn = false;
  }
  return shared.signedIn === true || storedSignedIn;
}

function loadScript(documentObj, src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(documentObj.scripts || []).find((script) => script.src?.includes(src));
    if (existing) return resolve(existing);
    const script = documentObj.createElement('script');
    script.src = src;
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    documentObj.head.appendChild(script);
  });
}

async function ensureAccountRuntime(windowObj) {
  if (typeof windowObj.Gun === 'function' && windowObj.SEA) return true;
  const documentObj = windowObj.document;
  if (!documentObj?.head) return false;
  if (typeof windowObj.Gun !== 'function') {
    await loadScript(documentObj, 'https://cdn.jsdelivr.net/npm/gun/gun.js');
  }
  if (!windowObj.__GUN_PEERS__) {
    await loadScript(documentObj, '/gun-init.js');
  }
  if (!windowObj.SEA) {
    await loadScript(documentObj, 'https://cdn.jsdelivr.net/npm/gun/sea.js');
  }
  if (!windowObj.AuthIdentity) {
    await loadScript(documentObj, '/auth-identity.js');
  }
  return typeof windowObj.Gun === 'function' && Boolean(windowObj.SEA);
}

async function waitForAuthentication(user, windowObj, attempts = 12) {
  if (user?.is?.pub) return true;
  user?.recall?.({ sessionStorage: true, localStorage: true });
  for (let attempt = 0; attempt < attempts && !user?.is?.pub; attempt += 1) {
    await new Promise((resolve) => windowObj.setTimeout(resolve, 150));
  }
  return Boolean(user?.is?.pub);
}

export async function createLaunchRoomAlignmentRuntime({ windowObj = window } = {}) {
  const storage = windowObj.localStorage;
  try {
    if (!signedInMarkerExists(windowObj, storage)) {
      return { available: false, syncCurrent: async () => false };
    }
    if (!await ensureAccountRuntime(windowObj)) {
      return { available: false, syncCurrent: async () => false };
    }

    windowObj.AuthIdentity?.syncStorageFromSharedIdentity?.(storage);
    const gun = windowObj.Gun({ peers: windowObj.__GUN_PEERS__ || [] });
    const user = gun.user();
    if (!await waitForAuthentication(user, windowObj)) {
      return { available: false, syncCurrent: async () => false };
    }

    const SEA = windowObj.SEA || windowObj.Gun.SEA;
    const sync = createAlignmentProfileSync({ user, SEA });
    if (!sync.available) return { available: false, syncCurrent: async () => false };

    const syncCurrent = async () => {
      const draft = readDraft(storage);
      if (!hasDirection(draft)) return false;
      const contribution = buildAlignmentProfileFromLaunchRoomState({
        ...draft,
        updatedAt: new Date().toISOString()
      });
      return sync.write(contribution);
    };

    await syncCurrent();
    return { available: true, syncCurrent };
  } catch {
    return { available: false, syncCurrent: async () => false };
  }
}

async function boot() {
  const runtime = await createLaunchRoomAlignmentRuntime();
  if (!runtime.available) return;

  let lastRaw = localStorage.getItem(STORAGE_KEY) || '';
  window.setInterval(async () => {
    const currentRaw = localStorage.getItem(STORAGE_KEY) || '';
    if (currentRaw === lastRaw) return;
    lastRaw = currentRaw;
    try {
      await runtime.syncCurrent();
    } catch {
      // Launch Room remains local-first when secure account sync is temporarily unavailable.
    }
  }, 2500);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot();
}
