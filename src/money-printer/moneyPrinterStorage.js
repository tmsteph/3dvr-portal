import { createDefaultMoneyPrinterState, refreshMoneyPrinterState } from './moneyPrinterCore.js';
import {
  ingestMarketPulseCapsuleCandidates,
  parseMarketPulseCapsuleRecord,
} from './marketPulseIngest.js';

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
  peers = globalThis.__GUN_PEERS__,
  timeoutMs = 900,
} = {}) {
  if (!storage || typeof GunImpl !== 'function') {
    return { imported: 0, updated: 0, skipped: true, reason: 'Gun unavailable' };
  }

  try {
    const peerList = Array.isArray(peers) && peers.length ? peers : [...DEFAULT_GUN_PEERS];
    const gun = GunImpl(peerList);
    const record = await onceNode(getNode(gun, MARKET_PULSE_CAPSULE_PATH), timeoutMs);
    if (!record?.candidatesJson) {
      return { imported: 0, updated: 0, skipped: true, reason: 'No capsule queue available' };
    }
    const payload = parseMarketPulseCapsuleRecord(record);
    if (!payload.candidates.length) {
      return { imported: 0, updated: 0, skipped: true, reason: 'Capsule queue empty' };
    }
    const current = hydrateMoneyPrinterState(storage);
    const result = ingestMarketPulseCapsuleCandidates(current, payload);
    if (result.imported > 0 || result.updated > 0) {
      writeMoneyPrinterState(result.state, storage);
    }
    return result;
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
  await importLatestMarketPulseCapsules();
}
