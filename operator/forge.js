const FORGE_ROOT = '3dvr-portal';
const PROOF_WAIT_MS = 900;
const AUTH_WAIT_MS = 12000;
const WRITE_TIMEOUT_MS = 8000;
const HELM_CACHE_ENTRY_LIMIT = 1000;
const GITHUB_WRITE_PATTERN = /\b(push|merge|pull request|open a pr|create a pr|commit(?: to github)?|github branch|push to github)\b/i;
const DEFAULT_PEERS = [
  'wss://portal.3dvr.tech/gun-relay',
  'https://portal.3dvr.tech/gun-relay'
];

let gunInstance = null;
let gunUser = null;
let gunLoadPromise = null;

function normalizeText(value = '', max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function normalizeRepo(value = '') {
  const repo = normalizeText(value, 80).toLowerCase() || 'portal';
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(repo) ? repo : 'portal';
}

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function encodeForgeProof(value = '') {
  const text = String(value || '');
  if (!text) return '';
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `b64:${globalThis.btoa(binary)}`;
}

function forgeRecordUrl(kind, id) {
  const params = new URLSearchParams({ kind, id });
  return `/forge/record.html?${params.toString()}`;
}

function loadScript(src) {
  if (typeof document === 'undefined') return Promise.reject(new Error('Browser script loading is unavailable.'));
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing?.dataset.loaded === 'true') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing || document.createElement('script');
    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const onLoad = () => {
      script.dataset.loaded = 'true';
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Could not load ${src}.`));
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = src;
      document.head.appendChild(script);
    }
  });
}

async function ensureGunRuntime() {
  if (typeof globalThis.Gun === 'function' && globalThis.Gun.SEA?.sign) return;
  if (!gunLoadPromise) {
    gunLoadPromise = (async () => {
      if (typeof globalThis.Gun !== 'function') {
        await loadScript('https://cdn.jsdelivr.net/npm/gun/gun.js');
      }
      if (!globalThis.Gun?.SEA?.sign) {
        await loadScript('https://cdn.jsdelivr.net/npm/gun/sea.js');
      }
      if (!Array.isArray(globalThis.__GUN_PEERS__) || !globalThis.__GUN_PEERS__.length) {
        globalThis.__GUN_PEERS__ = DEFAULT_PEERS.slice();
      }
    })().catch(error => {
      gunLoadPromise = null;
      throw error;
    });
  }
  await gunLoadPromise;
}

async function getGunContext({ loadRuntime = true } = {}) {
  const hasRuntime = typeof globalThis.Gun === 'function' && globalThis.Gun.SEA?.sign;
  if (!hasRuntime && !loadRuntime) return null;
  if (!hasRuntime) await ensureGunRuntime();
  if (gunInstance && gunUser) return { gun: gunInstance, user: gunUser };
  if (typeof globalThis.Gun !== 'function') return null;
  gunInstance = globalThis.Gun({ localStorage: false, peers: globalThis.__GUN_PEERS__ || DEFAULT_PEERS });
  gunUser = gunInstance.user();
  try {
    gunUser.recall({ sessionStorage: true, localStorage: true });
  } catch {}
  return { gun: gunInstance, user: gunUser };
}

async function waitForSea(user, waitMs = PROOF_WAIT_MS) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (user?._?.sea && (user?.is?.pub || user._.sea.pub)) return user._.sea;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return user?._?.sea || null;
}

function readStoredPortalIdentity() {
  const storage = globalThis.localStorage;
  if (storage?.getItem?.('signedIn') !== 'true') return null;
  const alias = normalizeText(storage.getItem('alias'), 200);
  const expectedPub = normalizeText(storage.getItem('userPubKey'), 500);
  if (!alias && !expectedPub) return null;
  return { alias, expectedPub };
}

function readStoredPortalAuth() {
  const identity = readStoredPortalIdentity();
  if (!identity) return null;
  const password = normalizeText(globalThis.localStorage?.getItem?.('password'), 1000);
  if (!identity.alias || !password) return null;
  return { ...identity, password };
}

export function developerIdentityMatches({
  expectedAlias = '',
  expectedPub = '',
  actualAlias = '',
  actualPub = ''
} = {}) {
  const wantedAlias = normalizeText(expectedAlias, 200).toLowerCase();
  const wantedPub = normalizeText(expectedPub, 500);
  const seenAlias = normalizeText(actualAlias, 200).toLowerCase();
  const seenPub = normalizeText(actualPub, 500);
  if (!seenPub) return false;
  // Gun pair recall uses the public key as its alias. A bound key is the
  // authoritative identity; comparing that alias would discard a valid session.
  if (wantedPub) return wantedPub === seenPub;
  if (wantedAlias && seenAlias && wantedAlias !== seenAlias) return false;
  if (!wantedPub && wantedAlias && !seenAlias) return false;
  return true;
}

export async function seaPairCanSign(sea, expectedPub = '') {
  const pub = normalizeText(expectedPub || sea?.pub, 500);
  const SEA = globalThis.Gun?.SEA;
  if (!sea || !pub || !SEA?.sign || !SEA?.verify) return false;
  const challenge = {
    scope: 'operator-session-self-check',
    nonce: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  };
  try {
    const signed = await SEA.sign(challenge, sea);
    const verified = await SEA.verify(signed, pub);
    return Boolean(
      verified
      && verified.scope === challenge.scope
      && verified.nonce === challenge.nonce
    );
  } catch {
    return false;
  }
}

async function restoreStoredPortalSea(user) {
  const stored = readStoredPortalAuth();
  if (!stored || typeof user?.auth !== 'function') return null;

  const authenticated = await new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), AUTH_WAIT_MS);

    try {
      user.auth(stored.alias, stored.password, ack => {
        if (ack?.err) return finish(false);
        const actualPub = normalizeText(user?.is?.pub || user?._?.sea?.pub, 500);
        if (!actualPub) return finish(false);
        if (stored.expectedPub && stored.expectedPub !== actualPub) return finish(false);
        finish(true);
      });
    } catch {
      finish(false);
    }
  });

  if (!authenticated) return null;
  const sea = await waitForSea(user, AUTH_WAIT_MS);
  const actualPub = normalizeText(user?.is?.pub || sea?.pub, 500);
  return await seaPairCanSign(sea, actualPub) ? sea : null;
}

async function ensurePortalSea(user) {
  const stored = readStoredPortalIdentity();
  const recalled = await waitForSea(user);
  if (recalled) {
    const actualPub = normalizeText(user?.is?.pub || recalled.pub, 500);
    const actualAlias = normalizeText(user?.is?.alias, 200);
    if (developerIdentityMatches({
      expectedAlias: stored?.alias,
      expectedPub: stored?.expectedPub,
      actualAlias,
      actualPub
    }) && await seaPairCanSign(recalled, actualPub)) {
      return recalled;
    }
    try {
      user?.leave?.();
    } catch {}
  }
  return restoreStoredPortalSea(user);
}

// Cell reuses Portal session recovery and key verification; cached display names are not authority.
export async function openCellAccount() {
  if (!readStoredPortalIdentity()) throw new Error('Sign in to open your private Cells.');
  if (globalThis.localStorage?.getItem('authMethod') === 'oauth' && !readStoredPortalIdentity()?.expectedPub) {
    throw new Error('Private Cells require a Portal username and password. OAuth-only sign-in has no encryption key yet.');
  }
  const context = await getGunContext();
  const pair = context && await ensurePortalSea(context.user);
  if (!pair?.pub || context.user.is?.pub !== pair.pub) {
    throw new Error('Sign in again to unlock your private Cells.');
  }
  return { gun: context.gun, user: context.user, pair, sea: globalThis.Gun.SEA };
}

function writeGun(node, value) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ queued: true, pendingSync: true });
    }, WRITE_TIMEOUT_MS);
    node.put(value, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack?.err) reject(new Error(ack.err));
      else resolve(ack || {});
    });
  });
}

async function signedPortalProof(scope, action, extra = {}, options = {}) {
  const context = await getGunContext(options);
  if (!context || !globalThis.Gun?.SEA?.sign) return null;
  const sea = await ensurePortalSea(context.user);
  const pub = normalizeText(context.user?.is?.pub || sea?.pub, 500);
  if (!sea || !pub) return null;
  const alias = normalizeText(context.user?.is?.alias || globalThis.localStorage?.getItem?.('alias'), 200);
  const payload = {
    scope,
    action,
    alias,
    pub,
    origin: globalThis.location?.origin || '',
    iat: Date.now(),
    ...extra
  };
  const authProof = await globalThis.Gun.SEA.sign(payload, sea);
  let verified = null;
  try {
    verified = await globalThis.Gun.SEA.verify(authProof, pub);
  } catch {}
  if (!verified || verified.scope !== scope || verified.action !== action || verified.pub !== pub) {
    try {
      context.user?.leave?.();
    } catch {}
    throw new Error('3DVR developer signing session is invalid. Sign in again.');
  }
  return {
    authPub: pub,
    authProof,
    portalAlias: alias,
    origin: payload.origin
  };
}

async function hasPortalSession() {
  try {
    const response = await globalThis.fetch?.('/api/session', { cache: 'no-store', credentials: 'same-origin' });
    if (!response?.ok) return false;
    const payload = await response.json();
    return payload?.authenticated === true;
  } catch {
    return false;
  }
}

export async function createSignedPortalProof(scope, action, extra = {}) {
  const signedIn = globalThis.localStorage?.getItem?.('signedIn') === 'true';
  if (!signedIn && !await hasPortalSession()) return null;
  return signedPortalProof(scope, action, extra);
}

// Private per-message Helm records share Portal's existing authenticated Gun session.
//
// The encrypted device cache lives in IndexedDB. localStorage's small origin
// quota is shared with everything else the portal keeps there (including Gun's
// own local graph data, which this store must never evict), so the earlier
// self-pruning eviction inside Helm's own localStorage keys could free every
// Helm entry and still leave a save with no room. IndexedDB's quota is far
// larger, so message payloads live there now. localStorage remains as the
// fallback for environments where IndexedDB cannot be opened, and as the
// migration source: on first open, the cache entries this account still holds
// in localStorage move into IndexedDB and the localStorage copies are removed,
// which is what actually frees that space. If IndexedDB open or migration
// fails at any point, the localStorage data is left untouched and the store
// runs on the localStorage path, exactly as it did before. Only small
// non-message keys (sign-in state, session ids) stay in localStorage.
const HELM_CACHE_DB_NAME = '3dvr-helm-cache';
const HELM_CACHE_STORE_NAME = 'messages';

function helmIdbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function openHelmCacheDb() {
  const indexedDB = globalThis.indexedDB;
  if (!indexedDB) return Promise.resolve(null);
  return new Promise(resolve => {
    let request;
    try {
      request = indexedDB.open(HELM_CACHE_DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      try { request.result.createObjectStore(HELM_CACHE_STORE_NAME); } catch {}
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function helmIdbRun(db, mode, run) {
  const transaction = db.transaction(HELM_CACHE_STORE_NAME, mode);
  const done = new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
  });
  done.catch(() => {}); // A failed run rejects first; keep the transaction promise handled.
  const result = await run(transaction.objectStore(HELM_CACHE_STORE_NAME));
  await done;
  return result;
}

export async function openHelmMessageStore({ onRecord, onSync = () => {} } = {}) {
  const context = await getGunContext();
  const pair = context && await ensurePortalSea(context.user);
  if (!pair?.pub) throw new Error('Sign in to save queued messages.');
  const pub = pair.pub;
  const root = context.user.get('helm-v1').get('messages');
  const cacheKey = `3dvr.helm.encrypted-messages.${pub}`;
  // Each state gets its own storage entry so tabs never replace one another's cache.
  const entryPrefix = `${cacheKey}:`;
  const decode = async (value, id) => {
    if (!value?.ciphertext) return;
    try {
      const decoded = await globalThis.Gun.SEA.decrypt(value.ciphertext, pair);
      const record = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
      if (`${record?.id}:${record?.status}` !== id) return;
      onRecord?.(record);
    } catch {}
  };
  const isQuotaError = error => error?.name === 'QuotaExceededError'
    || error?.code === 22 || error?.code === 1014
    || /quota/i.test(String(error?.name || error?.message || ''));
  // Every cache entry this account still holds in localStorage, as a
  // record-key -> value map: the legacy combined blob first, then the
  // per-entry keys (which win on a duplicate, being the newer representation).
  const readLocalCache = () => {
    const entries = new Map();
    try {
      const blob = JSON.parse(globalThis.localStorage.getItem(cacheKey) || '{}');
      if (blob && typeof blob === 'object' && !Array.isArray(blob)) {
        for (const [id, value] of Object.entries(blob)) entries.set(id, value);
      }
    } catch {}
    for (let index = 0; index < globalThis.localStorage.length; index += 1) {
      const key = globalThis.localStorage.key(index);
      if (!key?.startsWith(entryPrefix)) continue;
      try { entries.set(key.slice(entryPrefix.length), JSON.parse(globalThis.localStorage.getItem(key))); } catch {}
    }
    return entries;
  };
  const removeLocalCache = () => {
    const keys = [];
    for (let index = 0; index < globalThis.localStorage.length; index += 1) {
      const key = globalThis.localStorage.key(index);
      if (key === cacheKey || key?.startsWith(entryPrefix)) keys.push(key);
    }
    for (const key of keys) {
      try { globalThis.localStorage.removeItem(key); } catch {}
    }
  };
  // IndexedDB persistence: the account's entries load into memory at open and
  // saves write through, so callers see the same behavior as the localStorage
  // store while the bytes live somewhere with real headroom.
  const openIndexedDbCache = async () => {
    const db = await openHelmCacheDb();
    if (!db) return null;
    try {
      const range = globalThis.IDBKeyRange?.bound?.(entryPrefix, `${entryPrefix}\uffff`);
      if (!range) throw new Error('IndexedDB key ranges are unavailable.');
      const entries = await helmIdbRun(db, 'readonly', async store => {
        const [keys, values] = await Promise.all([
          helmIdbRequest(store.getAllKeys(range)),
          helmIdbRequest(store.getAll(range))
        ]);
        return new Map(keys.map((key, index) => [String(key).slice(entryPrefix.length), values[index]]));
      });
      // Migration: fold whatever localStorage still holds for this account
      // into IndexedDB (newest updatedAt wins a collision), then remove the
      // localStorage copies. Any failure before the removal step aborts into
      // the fallback with localStorage untouched.
      const local = readLocalCache();
      const migrated = [];
      for (const [id, value] of local) {
        const existing = entries.get(id);
        if (!existing || (value?.updatedAt || 0) > (existing.updatedAt || 0)) {
          entries.set(id, value);
          migrated.push([id, value]);
        }
      }
      if (migrated.length) {
        await helmIdbRun(db, 'readwrite', async store => {
          await Promise.all(migrated.map(([id, value]) => helmIdbRequest(store.put(value, `${entryPrefix}${id}`))));
        });
      }
      if (local.size) removeLocalCache();
      return { db, entries };
    } catch {
      try { db.close?.(); } catch {}
      return null;
    }
  };
  const indexedDbPersist = ({ db, entries }) => {
    // Same eviction contract as the localStorage store: plain history first
    // (oldest first), unsent outbox states last, never the entry being
    // written, and only this account's entries are ever candidates.
    const evictionOrder = preserveKey => [...entries]
      .filter(([id]) => `${entryPrefix}${id}` !== preserveKey)
      .map(([id, value]) => ({ id, tier: id.endsWith(':queued') ? 1 : 0, updatedAt: value?.updatedAt || 0 }))
      .sort((a, b) => a.tier - b.tier || a.updatedAt - b.updatedAt);
    const evict = async entry => {
      entries.delete(entry.id);
      await helmIdbRun(db, 'readwrite', store => helmIdbRequest(store.delete(`${entryPrefix}${entry.id}`)));
    };
    const put = (entryKey, value) => helmIdbRun(db, 'readwrite', store => helmIdbRequest(store.put(value, entryKey)));
    return async (recordKey, value) => {
      const entryKey = `${entryPrefix}${recordKey}`;
      entries.set(recordKey, value);
      let surplus = entries.size - HELM_CACHE_ENTRY_LIMIT;
      for (const entry of evictionOrder(entryKey)) {
        if (surplus <= 0) break;
        await evict(entry);
        surplus -= 1;
      }
      try {
        await put(entryKey, value);
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        // IndexedDB running out of room is far rarer, but keep the contract:
        // free the oldest entries one at a time until the write lands.
        let failure = error;
        let landed = false;
        for (const entry of evictionOrder(entryKey)) {
          await evict(entry);
          try {
            await put(entryKey, value);
            landed = true;
            break;
          } catch (retryError) {
            if (!isQuotaError(retryError)) throw retryError;
            failure = retryError;
          }
        }
        if (!landed) throw failure;
      }
      // A localStorage shadow of this record can survive only if a cleanup
      // was interrupted; never let it resurrect a stale state on a later open.
      try { globalThis.localStorage?.removeItem?.(entryKey); } catch {}
    };
  };
  // The localStorage store, unchanged: the encrypted cache is a device
  // convenience and the Gun graph stays the source of truth, so when the
  // origin quota fills up, drop the oldest cached states so a save keeps
  // working instead of failing until the user clears site data by hand.
  const localStoragePersist = () => {
    const cachedEntriesOldestFirst = preserveKey => {
      const entries = [];
      for (let index = 0; index < globalThis.localStorage.length; index += 1) {
        const key = globalThis.localStorage.key(index);
        if (!key?.startsWith(entryPrefix) || key === preserveKey) continue;
        let updatedAt = 0;
        try { updatedAt = JSON.parse(globalThis.localStorage.getItem(key))?.updatedAt || 0; } catch {}
        entries.push({ key, updatedAt, tier: key.endsWith(':queued') ? 2 : 0 });
      }
      // The legacy combined blob under the bare cache key was written by older
      // versions and is never rewritten now, so on long-lived browsers it can
      // hold most of the quota while per-entry eviction frees almost nothing.
      // It is a local cache copy like the history entries (the Gun graph stays
      // the source of truth and re-syncs), so it becomes a candidate once this
      // account's per-entry history is gone, but ahead of unsent outbox states.
      if (cacheKey !== preserveKey && globalThis.localStorage.getItem(cacheKey) != null) {
        entries.push({ key: cacheKey, updatedAt: 0, tier: 1 });
      }
      // Unsent outbox states outlive history: evict plain history entries first
      // (oldest first), then the legacy blob, then queued entries (oldest
      // first), and never the entry being written. Other accounts' keys are
      // never candidates.
      return entries.sort((a, b) => a.tier - b.tier || a.updatedAt - b.updatedAt);
    };
    const trimCache = preserveKey => {
      const entries = cachedEntriesOldestFirst(preserveKey);
      const surplus = entries.length + 1 - HELM_CACHE_ENTRY_LIMIT;
      for (const entry of entries.slice(0, Math.max(0, surplus))) {
        globalThis.localStorage.removeItem(entry.key);
      }
    };
    const writeCacheEntry = (key, value) => {
      let failure;
      try {
        globalThis.localStorage.setItem(key, value);
        return;
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        failure = error;
      }
      // Evict one entry at a time so a retry frees only as much room as it needs.
      for (const entry of cachedEntriesOldestFirst(key)) {
        globalThis.localStorage.removeItem(entry.key);
        try {
          globalThis.localStorage.setItem(key, value);
          return;
        } catch (error) {
          if (!isQuotaError(error)) throw error;
          failure = error;
        }
      }
      // Nothing evictable remains: surface the storage failure itself.
      throw failure;
    };
    return (recordKey, value) => {
      const entryKey = `${entryPrefix}${recordKey}`;
      trimCache(entryKey);
      writeCacheEntry(entryKey, JSON.stringify(value));
    };
  };
  let persistCacheEntry;
  let closeCache = () => {};
  const idbCache = await openIndexedDbCache();
  if (idbCache) {
    persistCacheEntry = indexedDbPersist(idbCache);
    closeCache = () => { try { idbCache.db.close?.(); } catch {} };
    // Replay history oldest first. The outbox resolves per-message state by
    // status rank and updatedAt, so this order only mirrors what the
    // localStorage store effectively replayed; it is not load-bearing.
    const restored = [...idbCache.entries]
      .sort((a, b) => (a[1]?.updatedAt || 0) - (b[1]?.updatedAt || 0) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (const [id, value] of restored) await decode(value, id);
  } else {
    persistCacheEntry = localStoragePersist();
    for (const [id, value] of readLocalCache()) await decode(value, id);
  }
  const stream = root.map();
  stream.on((value, id) => { void decode(value, id); });
  return {
    pub,
    async save(record) {
      if (context.user.is?.pub !== pub) throw new Error('Account changed. Sign in before saving.');
      const ciphertext = await globalThis.Gun.SEA.encrypt(JSON.stringify(record), pair);
      if (!ciphertext) throw new Error('Message encryption failed.');
      const value = { ciphertext, updatedAt: record.updatedAt };
      // Encrypted device cache makes a peer outage survivable without publishing plaintext.
      const recordKey = `${record.id}:${record.status}`;
      await persistCacheEntry(recordKey, value);
      // Separate state nodes keep a late queued writer from overwriting completion history.
      root.get(recordKey).put(value, ack => onSync(ack && !ack.err ? 'Saved here · account sync active' : 'Saved here · account sync pending'));
      return true;
    },
    close() { stream.off(); closeCache(); }
  };
}

export async function createOperatorDeveloperProof() {
  return createSignedPortalProof('operator-developer-access', 'operator-chat');
}

export async function createOrganismRecallProof(query, options = {}) {
  const signedIn = globalThis.localStorage?.getItem?.('signedIn') === 'true';
  if (!signedIn) throw new Error('Sign in with your 3DVR account before asking your memory.');
  const text = normalizeText(query, 2000);
  if (!text) throw new Error('A memory question is required.');
  const requestId = normalizeText(options.requestId || makeId('organism-recall'), 160);
  const limit = Math.min(10, Math.max(1, Number.parseInt(options.limit || '5', 10) || 5));
  const proof = await signedPortalProof('digital-organism', 'recall', {
    query: text,
    requestId,
    limit
  });
  if (!proof) throw new Error('Refresh your 3DVR sign-in before asking your memory.');
  return { ...proof, query: text, requestId, limit };
}


export async function createPrivateKnowledgeListProof(options = {}) {
  const signedIn = globalThis.localStorage?.getItem?.('signedIn') === 'true';
  if (!signedIn) throw new Error('Sign in with your 3DVR account before opening private knowledge.');
  const requestId = normalizeText(options.requestId || makeId('knowledge-list'), 160);
  const proof = await signedPortalProof('digital-organism', 'knowledge-list', { requestId });
  if (!proof) throw new Error('Refresh your 3DVR sign-in before opening private knowledge.');
  return { ...proof, requestId };
}

export async function createPrivateKnowledgeReadProof(note, options = {}) {
  const signedIn = globalThis.localStorage?.getItem?.('signedIn') === 'true';
  if (!signedIn) throw new Error('Sign in with your 3DVR account before opening private knowledge.');
  const path = normalizeText(note, 300);
  if (!path) throw new Error('A private knowledge note path is required.');
  const requestId = normalizeText(options.requestId || makeId('knowledge-read'), 160);
  const proof = await signedPortalProof('digital-organism', 'knowledge-read', {
    note: path,
    requestId
  });
  if (!proof) throw new Error('Refresh your 3DVR sign-in before opening private knowledge.');
  return { ...proof, note: path, requestId };
}

export async function createOrganismRememberProof(content, options = {}) {
  const signedIn = globalThis.localStorage?.getItem?.('signedIn') === 'true';
  if (!signedIn) throw new Error('Sign in with your 3DVR account before saving durable memory.');
  const text = normalizeText(content, 4000);
  const subject = normalizeText(options.subject, 300);
  const kind = normalizeText(options.kind, 80) || 'note';
  const sourceId = normalizeText(options.sourceId, 300);
  if (!text) throw new Error('Memory content is required.');
  if (!sourceId) throw new Error('A source id is required for durable memory.');
  const requestId = normalizeText(options.requestId || makeId('organism-remember'), 160);
  const proof = await signedPortalProof('digital-organism', 'remember', {
    content: text,
    subject,
    kind,
    sourceId,
    requestId
  });
  if (!proof) throw new Error('Refresh your 3DVR sign-in before saving durable memory.');
  return { ...proof, content: text, subject, kind, sourceId, requestId };
}

export async function createOrganismFeedbackProof(query, memoryId, options = {}) {
  const signedIn = globalThis.localStorage?.getItem?.('signedIn') === 'true';
  if (!signedIn) throw new Error('Sign in with your 3DVR account before rating a memory.');
  const text = normalizeText(query, 2000);
  const id = normalizeText(memoryId, 300);
  const outcome = options.outcome === 'rejected' ? 'rejected' : 'approved';
  const action = outcome === 'rejected' ? 'reject-retrieval' : 'approve-retrieval';
  if (!text) throw new Error('The original memory question is required.');
  if (!id) throw new Error('A memory id is required.');
  const requestId = normalizeText(options.requestId || makeId('organism-feedback'), 160);
  const proof = await signedPortalProof('digital-organism', action, {
    query: text,
    memoryId: id,
    requestId,
    outcome
  });
  if (!proof) throw new Error('Refresh your 3DVR sign-in before rating a memory.');
  return { ...proof, query: text, memoryId: id, requestId, outcome };
}

export async function saveCodeSuggestion(action = {}) {
  const context = await getGunContext();
  if (!context) throw new Error('3DVR Forge is unavailable in this browser.');
  const text = normalizeText(action.text);
  if (!text) throw new Error('A code suggestion is required.');
  const id = makeId('suggestion');
  const identity = globalThis.AuthIdentity?.readSharedIdentity?.() || {};
  const record = {
    id,
    title: normalizeText(action.title, 160) || 'Operator suggestion',
    text,
    repo: normalizeRepo(action.repo),
    status: 'open',
    requestedBy: normalizeText(identity.alias || globalThis.localStorage?.getItem?.('alias'), 200) || 'guest',
    createdAt: new Date().toISOString(),
    source: 'portal-operator'
  };
  const writeResult = await writeGun(context.gun.get(FORGE_ROOT).get('forge').get('suggestions').get(id), record);
  return {
    message: writeResult?.pendingSync
      ? 'Saved locally. 3DVR Forge will sync this suggestion when the connection recovers.'
      : 'Saved as a 3DVR Forge suggestion.',
    url: forgeRecordUrl('suggestion', id),
    label: 'Forge suggestion'
  };
}

export async function queueCodeChange(action = {}) {
  const context = await getGunContext();
  if (!context) throw new Error('3DVR Forge is unavailable in this browser.');
  const repo = normalizeRepo(action.repo);
  const requestedChange = normalizeText(action.text);
  if (!requestedChange) throw new Error('A code change request is required.');
  const githubWriteRequested = GITHUB_WRITE_PATTERN.test(requestedChange);
  const id = makeId('operator-task');
  const task = [
    `Operator code request: ${requestedChange}`,
    'Make the smallest useful change in the working repository and run focused tests.',
    'Use an isolated branch or worktree when practical.',
    'Return a result summary with what changed, the exact checks run and their outcomes, any remaining blocker, and available commit or pull request links. Distinguish local changes, published commits, merged code, and live deployment. Claim a working live link only after checking that URL; do not deploy without authorization.',
    githubWriteRequested
      ? 'The signed request includes GitHub write intent. Preserve exactly the requested repository workflow.'
      : 'Keep repository changes local for review unless the signed request explicitly authorized a GitHub write.'
  ].join(' ');
  const proof = await signedPortalProof('operator-forge-task', 'queue-code-change', {
    taskId: id,
    repo,
    task,
    githubWriteRequested
  });
  if (!proof) throw new Error('Sign in with your 3DVR developer account before editing code.');

  const now = new Date().toISOString();
  const record = {
    id,
    title: normalizeText(action.title, 160) || 'Operator code edit',
    task,
    repo,
    backend: 'auto',
    githubWriteRequested,
    riskClass: githubWriteRequested ? 'external_write' : 'workspace_write',
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    requestedBy: 'portal-operator',
    requestedByAlias: proof.portalAlias || proof.authPub,
    resultSummary: '',
    error: '',
    authProof: encodeForgeProof(proof.authProof),
    authPub: proof.authPub
  };
  const writeResult = await writeGun(context.gun.get(FORGE_ROOT).get('forge').get('editRequests').get(id), record);
  return {
    message: writeResult?.pendingSync
      ? `Queued the approved ${repo} edit locally. Forge will sync it when the connection recovers.`
      : githubWriteRequested
        ? `Queued the signed owner GitHub edit for ${repo}.`
        : `Queued an approved developer edit for ${repo}.`,
    url: forgeRecordUrl('edit', id),
    label: 'Forge edit'
  };
}
