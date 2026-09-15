import { createDefaultMoneyPrinterState, refreshMoneyPrinterState } from './moneyPrinterCore.js';
import {
  ingestMarketPulseCapsuleCandidates,
  parseMarketPulseCapsuleRecord,
} from './marketPulseIngest.js';
import { personalizeMarketPulseCapsulePayload } from './privateAlignmentRanking.js';
import {
  ALIGNMENT_PROFILE_GUN_NODE,
  normalizeAlignmentProfile,
} from '../kernel/alignmentProfile.js';

// Storage adapters for money-printer-web today and future CLI/daemon persistence later.
// The core engine does not depend on localStorage; this module is the browser storage boundary.

export const MONEY_PRINTER_STORAGE_KEY = '3dvr.money-printer.state.v1';

const MARKET_PULSE_CAPSULE_PATH = Object.freeze([
  '3dvr-portal',
  'growth',
  'market-pulse',
  'venture-capsules',
  'latest',
]);
const DEFAULT_GUN_PEERS = Object.freeze(['wss://gun-relay-3dvr.fly.dev/gun']);

function getDefaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function getNode(root, path = []) {
  return path.reduce((node, key) => node.get(key), root);
}

function onceNode(node, timeoutMs = 900) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = globalThis.setTimeout(() => finish(null), timeoutMs);
    try {
      node.once((value) => finish(value));
    } catch (_error) {
      finish(null);
    }
  });
}

function onceNodeStatus(node, timeoutMs = 900) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value, status = 'ok') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ value: value || null, status });
    };
    const timer = globalThis.setTimeout(() => finish(null, 'timeout'), timeoutMs);
    try {
      node.once((value) => finish(value));
    } catch (_error) {
      finish(null, 'error');
    }
  });
}

function wait(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function signedInMarkerExists(storage, identity = globalThis.AuthIdentity) {
  let storedSignedIn = false;
  try {
    storedSignedIn = storage?.getItem('signedIn') === 'true';
  } catch (_error) {
    storedSignedIn = false;
  }
  try {
    return identity?.readSharedIdentity?.()?.signedIn === true || storedSignedIn;
  } catch (_error) {
    return storedSignedIn;
  }
}

async function readPrivateAlignmentProfile({
  gun,
  storage,
  SEA = globalThis.SEA || globalThis.Gun?.SEA,
  identity = globalThis.AuthIdentity,
  timeoutMs = 900,
} = {}) {
  if (!signedInMarkerExists(storage, identity)) {
    return { status: 'signed-out', profile: null };
  }
  if (!gun?.user || !SEA?.decrypt) {
    return { status: 'unavailable', profile: null };
  }

  try {
    const user = gun.user();
    if (!user) return { status: 'unavailable', profile: null };
    const deadline = Date.now() + Math.max(50, timeoutMs);
    user.recall?.({ sessionStorage: true, localStorage: true });
    while (!user?.is?.pub && Date.now() < deadline) {
      await wait(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    const pair = user?._?.sea;
    if (!user?.is?.pub || !pair) return { status: 'unavailable', profile: null };

    const remaining = Math.max(1, deadline - Date.now());
    const recordResult = await onceNodeStatus(
      user.get('kernel').get(ALIGNMENT_PROFILE_GUN_NODE),
      remaining,
    );
    if (recordResult.status !== 'ok') {
      return { status: 'unavailable', profile: null };
    }
    if (!recordResult.value?.ciphertext) {
      return { status: 'no-profile', profile: null };
    }
    const decoded = await SEA.decrypt(recordResult.value.ciphertext, pair);
    if (!decoded) return { status: 'unavailable', profile: null };
    const parsed = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
    const profile = normalizeAlignmentProfile(parsed);
    return profile.keywords.length
      ? { status: 'available', profile }
      : { status: 'no-profile', profile: null };
  } catch (_error) {
    return { status: 'unavailable', profile: null };
  }
}

async function readPrivateAlignmentProfileWithRetry(
  args,
  retryCount = 1,
  retryDelayMs = 75,
) {
  let result = await readPrivateAlignmentProfile(args);
  for (let attempt = 0; result.status === 'unavailable' && attempt < retryCount; attempt += 1) {
    await wait(Math.max(0, retryDelayMs));
    result = await readPrivateAlignmentProfile(args);
  }
  return result;
}

export function readMoneyPrinterState(storage = getDefaultStorage(), key = MONEY_PRINTER_STORAGE_KEY) {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeMoneyPrinterState(state, storage = getDefaultStorage(), key = MONEY_PRINTER_STORAGE_KEY) {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function removeMoneyPrinterState(storage = getDefaultStorage(), key = MONEY_PRINTER_STORAGE_KEY) {
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function hydrateMoneyPrinterState(storage = getDefaultStorage(), key = MONEY_PRINTER_STORAGE_KEY) {
  const defaults = createDefaultMoneyPrinterState();
  const stored = readMoneyPrinterState(storage, key);
  return refreshMoneyPrinterState({
    ...defaults,
    ...(stored || {})
  });
}

export async function importLatestMarketPulseCapsules({
  storage = getDefaultStorage(),
  GunImpl = globalThis.Gun,
  SEA = globalThis.SEA || globalThis.Gun?.SEA,
  identity = globalThis.AuthIdentity,
  peers = globalThis.__GUN_PEERS__,
  timeoutMs = 900,
  profileRetryCount = 1,
  profileRetryDelayMs = 75,
} = {}) {
  if (!storage || typeof GunImpl !== 'function') {
    return { imported: 0, updated: 0, skipped: true, reason: 'Gun unavailable' };
  }

  try {
    const peerList = Array.isArray(peers) && peers.length ? peers : [...DEFAULT_GUN_PEERS];
    const gun = GunImpl(peerList);
    const [record, alignmentRead] = await Promise.all([
      onceNode(getNode(gun, MARKET_PULSE_CAPSULE_PATH), timeoutMs),
      readPrivateAlignmentProfileWithRetry(
        { gun, storage, SEA, identity, timeoutMs },
        profileRetryCount,
        profileRetryDelayMs,
      ),
    ]);
    if (!record?.candidatesJson) {
      return { imported: 0, updated: 0, skipped: true, reason: 'No capsule queue available' };
    }
    const publicPayload = parseMarketPulseCapsuleRecord(record);
    if (!publicPayload.candidates.length) {
      return { imported: 0, updated: 0, skipped: true, reason: 'Capsule queue empty' };
    }

    const current = hydrateMoneyPrinterState(storage);
    if (alignmentRead.status === 'unavailable' && current.marketPulseLastPersonalizationKey) {
      return {
        state: current,
        imported: 0,
        updated: 0,
        skipped: true,
        reason: 'Private alignment temporarily unavailable',
        personalized: true,
        retryRecommended: true,
      };
    }

    const payload = personalizeMarketPulseCapsulePayload(publicPayload, alignmentRead.profile || {});
    const result = ingestMarketPulseCapsuleCandidates(current, payload);
    if (result.imported > 0 || result.updated > 0) {
      writeMoneyPrinterState(result.state, storage);
    }
    return {
      ...result,
      personalized: Boolean(payload.personalizationKey),
      retryRecommended: alignmentRead.status === 'unavailable',
    };
  } catch (_error) {
    return { imported: 0, updated: 0, skipped: true, reason: 'Capsule queue unavailable' };
  }
}

export function createMoneyPrinterStorage(storage = getDefaultStorage(), key = MONEY_PRINTER_STORAGE_KEY) {
  return {
    key,
    read() {
      return readMoneyPrinterState(storage, key);
    },
    write(state) {
      return writeMoneyPrinterState(state, storage, key);
    },
    remove() {
      return removeMoneyPrinterState(storage, key);
    },
    hydrate() {
      return hydrateMoneyPrinterState(storage, key);
    }
  };
}

if (typeof window !== 'undefined') {
  const initialImport = await importLatestMarketPulseCapsules();
  if (initialImport.retryRecommended) {
    globalThis.setTimeout(() => {
      void importLatestMarketPulseCapsules({ profileRetryCount: 2, profileRetryDelayMs: 150 });
    }, 1200);
  }
}
