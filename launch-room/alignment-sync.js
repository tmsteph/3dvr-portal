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
  if (typeof windowObj.Gun !== 'function' || !windowObj.SEA) {
    return { available: false, syncCurrent: async () => false };
  }

  try {
    windowObj.AuthIdentity?.syncStorageFromSharedIdentity?.(storage);
    if (!signedInMarkerExists(windowObj, storage)) {
      return { available: false, syncCurrent: async () => false };
    }

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
