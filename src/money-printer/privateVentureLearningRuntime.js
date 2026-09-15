import {
  deriveVentureOutcomeMemory,
  normalizeVentureOutcomeMemory,
} from './ventureOutcomeMemory.js';
import { createVentureOutcomeMemorySync } from './ventureOutcomeMemorySync.js';

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

async function resolveAccount({
  gun,
  storage,
  SEA = globalThis.SEA || globalThis.Gun?.SEA,
  identity = globalThis.AuthIdentity,
  timeoutMs = 900,
} = {}) {
  if (!signedInMarkerExists(storage, identity)) return { status: 'signed-out' };
  if (!gun?.user || !SEA?.decrypt) return { status: 'unavailable' };
  try {
    const user = gun.user();
    if (!user) return { status: 'unavailable' };
    const deadline = Date.now() + Math.max(50, timeoutMs);
    user.recall?.({ sessionStorage: true, localStorage: true });
    while (!user?.is?.pub && Date.now() < deadline) {
      await wait(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    if (!user?.is?.pub || !user?._?.sea) return { status: 'unavailable' };
    return { status: 'available', user, SEA };
  } catch (_error) {
    return { status: 'unavailable' };
  }
}

export async function readPrivateVentureOutcomeMemory(options = {}) {
  const account = await resolveAccount(options);
  if (account.status !== 'available') return { status: account.status, memory: null };
  try {
    const sync = createVentureOutcomeMemorySync({ user: account.user, SEA: account.SEA });
    if (!sync.available) return { status: 'unavailable', memory: null };
    const memory = await sync.read();
    if (!memory?.entries?.length) return { status: 'no-memory', memory: null };
    return { status: 'available', memory: normalizeVentureOutcomeMemory(memory) };
  } catch (_error) {
    return { status: 'unavailable', memory: null };
  }
}

export async function syncPrivateVentureOutcomeMemory({ state, ...options } = {}) {
  const memory = deriveVentureOutcomeMemory(state || {});
  if (!memory.entries.length) {
    return { saved: false, skipped: true, reason: 'No terminal Market Pulse outcomes' };
  }
  const account = await resolveAccount(options);
  if (account.status !== 'available') {
    return { saved: false, skipped: true, reason: account.status };
  }
  try {
    const sync = createVentureOutcomeMemorySync({ user: account.user, SEA: account.SEA });
    if (!sync.available) return { saved: false, skipped: true, reason: 'unavailable' };
    const saved = await sync.write(memory);
    return { saved: Boolean(saved), skipped: !saved, entries: memory.entries.length };
  } catch (_error) {
    return { saved: false, skipped: true, reason: 'sync-failed' };
  }
}
