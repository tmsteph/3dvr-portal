const SYNC_NODE = 'idea-garden-v01';
const CHUNK_SIZE = 24 * 1024;
const READ_TIMEOUT_MS = 6000;
const SESSION_TIMEOUT_MS = 4500;
const WRITE_TIMEOUT_MS = 5000;
const PENDING_KEY = 'idea-garden:pending-account-sync:v1';

const delay = (windowObj, ms) => new Promise(resolve => windowObj.setTimeout(resolve, ms));

function timestamp(value) {
  const raw = value?.updatedAt || value?.deletedAt || value?.createdAt || 0;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function safeStorageGet(storage, key) {
  try { return storage?.getItem?.(key) || ''; } catch { return ''; }
}

function safeStorageSet(storage, key, value) {
  try { storage?.setItem?.(key, value); return true; } catch { return false; }
}

function safeStorageRemove(storage, key) {
  try { storage?.removeItem?.(key); return true; } catch { return false; }
}

function newestById(values = []) {
  const map = new Map();
  values.forEach(value => {
    if (!value?.id) return;
    const current = map.get(value.id);
    if (!current || timestamp(value) >= timestamp(current)) map.set(value.id, value);
  });
  return map;
}

function normalizeFocus(ideas) {
  const focused = ideas
    .filter(idea => idea.focused && idea.stage !== 'done')
    .sort((a, b) => timestamp(b) - timestamp(a))[0]?.id;
  return ideas.map(idea => ({ ...idea, focused: Boolean(focused && idea.id === focused) }));
}

export function mergeGardenPayloads(localPayload, remotePayload) {
  const local = localPayload || { ideas: [], deleted: [] };
  const remote = remotePayload || { ideas: [], deleted: [] };
  const deleted = newestById([...(remote.deleted || []), ...(local.deleted || [])]);
  const ideas = newestById([...(remote.ideas || []), ...(local.ideas || [])]);

  deleted.forEach((record, id) => {
    const idea = ideas.get(id);
    if (!idea || timestamp(record) >= timestamp(idea)) ideas.delete(id);
  });

  const mergedIdeas = normalizeFocus([...ideas.values()].sort((a, b) => timestamp(b) - timestamp(a)));
  return {
    format: '3dvr-idea-garden',
    version: 3,
    exportedAt: new Date().toISOString(),
    ideas: mergedIdeas,
    deleted: [...deleted.values()].sort((a, b) => timestamp(b) - timestamp(a)),
  };
}

function hasGardenContent(payload) {
  return Boolean((payload?.ideas || []).length || (payload?.deleted || []).length);
}

function waitForValue(node, predicate, windowObj, timeoutMs = READ_TIMEOUT_MS) {
  return new Promise(resolve => {
    let settled = false;
    let subscription = null;
    const finish = value => {
      if (settled) return;
      settled = true;
      windowObj.clearTimeout(timer);
      try {
        if (subscription && typeof subscription.off === 'function') subscription.off();
        else node?.off?.();
      } catch {}
      resolve(value);
    };
    const timer = windowObj.setTimeout(() => finish(null), Math.max(0, timeoutMs));
    try {
      if (typeof node?.on === 'function') subscription = node.on(value => {
        try { if (predicate(value)) finish(value); } catch {}
      });
      else if (typeof node?.once === 'function') node.once(value => {
        try { if (predicate(value)) finish(value); } catch {}
      });
      else finish(null);
    } catch { finish(null); }
  });
}

function put(node, value, windowObj, timeoutMs = WRITE_TIMEOUT_MS) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => { if (!settled) { settled = true; resolve(result); } };
    const timer = windowObj.setTimeout(() => finish(false), Math.max(0, timeoutMs));
    try {
      node.put(value, ack => {
        windowObj.clearTimeout(timer);
        finish(!ack?.err);
      });
    } catch {
      windowObj.clearTimeout(timer);
      finish(false);
    }
  });
}

export function createGardenSync({
  windowObj = window,
  onStatus = () => {},
  readTimeoutMs = READ_TIMEOUT_MS,
  sessionTimeoutMs = SESSION_TIMEOUT_MS,
  verifyTimeoutMs = Math.max(readTimeoutMs, 6000),
  writeTimeoutMs = WRITE_TIMEOUT_MS,
} = {}) {
  const storage = windowObj.localStorage;
  const peers = Array.isArray(windowObj.__GUN_PEERS__) ? windowObj.__GUN_PEERS__ : [];
  let gun = null;
  let user = null;
  let node = null;
  let secret = null;
  let ready = false;
  let setupPromise = null;
  let pendingPayload = null;
  let pendingNeedsMerge = false;
  let initialLoadComplete = false;
  let pendingToken = 0;
  let confirmedToken = 0;
  let drainPromise = null;
  let retryTimer = null;
  let retryDelay = 2000;

  function pendingMarker() {
    return safeStorageGet(storage, PENDING_KEY);
  }

  function readPendingMarker() {
    try { return JSON.parse(pendingMarker()) || null; } catch { return null; }
  }

  function persistPendingMarker() {
    safeStorageSet(storage, PENDING_KEY, JSON.stringify({
      queuedAt: Date.now(),
      token: pendingToken,
      needsMerge: pendingNeedsMerge,
    }));
  }

  function markPending(payload, { needsMerge = !initialLoadComplete } = {}) {
    pendingPayload = payload;
    pendingNeedsMerge = Boolean(needsMerge);
    pendingToken += 1;
    persistPendingMarker();
    return pendingToken;
  }

  function clearPending(token) {
    if (token !== pendingToken) return;
    pendingPayload = null;
    pendingNeedsMerge = false;
    confirmedToken = token;
    retryDelay = 2000;
    safeStorageRemove(storage, PENDING_KEY);
  }

  function signedInMarkerExists() {
    const shared = windowObj.AuthIdentity?.readSharedIdentity?.() || {};
    return shared.signedIn === true || safeStorageGet(storage, 'signedIn') === 'true';
  }

  function sessionStatus() {
    return signedInMarkerExists()
      ? 'Saved here · Sign in again to resume encrypted sync'
      : 'Saved on this device · Sign in to sync privately';
  }

  async function waitForSession(timeoutMs = sessionTimeoutMs) {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (!user?.is?.pub && Date.now() <= deadline) await delay(windowObj, 120);
    return Boolean(user?.is?.pub);
  }

  async function restoreSession() {
    if (user?.is?.pub) return true;
    try { user?.recall?.({ sessionStorage: true, localStorage: true }); } catch {}
    return waitForSession(sessionTimeoutMs);
  }

  async function ensureReady() {
    if (ready && user?.is?.pub && secret && node) return true;
    if (setupPromise) return setupPromise;
    setupPromise = (async () => {
      if (typeof windowObj.Gun !== 'function' || !windowObj.SEA) return false;
      try {
        windowObj.AuthIdentity?.syncStorageFromSharedIdentity?.(storage);
        if (!gun) gun = windowObj.Gun({ peers });
        if (!user) user = gun.user();
        if (!(await restoreSession())) {
          ready = false;
          onStatus(sessionStatus());
          return false;
        }
        secret = user?._?.sea || null;
        if (!secret || typeof windowObj.SEA.encrypt !== 'function' || typeof windowObj.SEA.decrypt !== 'function') {
          ready = false;
          onStatus(sessionStatus());
          return false;
        }
        node = user.get(SYNC_NODE).get('garden');
        ready = true;
        onStatus(pendingMarker() ? 'Encrypted sync ready · Pending changes will retry' : 'Encrypted account sync ready');
        return true;
      } catch {
        ready = false;
        onStatus('Saved on this device · Encrypted sync unavailable');
        return false;
      }
    })().finally(() => { setupPromise = null; });
    return setupPromise;
  }

  function verificationNode() {
    const pub = user?.is?.pub;
    if (!pub || typeof windowObj.Gun !== 'function') return null;
    try {
      const verifier = windowObj.Gun({ peers, localStorage: false, radisk: false });
      return verifier?.get?.(`~${pub}`)?.get(SYNC_NODE)?.get('garden') || null;
    } catch { return null; }
  }

  async function readPayload(sourceNode = node, { expectedRevision = '', timeoutMs = readTimeoutMs } = {}) {
    if (!sourceNode) return { kind: 'missing', payload: null };
    const manifest = await waitForValue(
      sourceNode.get('manifest'),
      value => Boolean(value && typeof value === 'object' && (!expectedRevision || value.revision === expectedRevision)),
      windowObj,
      timeoutMs
    );
    if (!manifest) {
      if (expectedRevision) throw new Error('Garden manifest not visible from relay');
      return { kind: 'missing', payload: null };
    }
    const count = Number(manifest.chunks || 0);
    if (!count || count > 1000) throw new Error('Invalid Garden sync manifest');
    const revision = String(manifest.revision || '');
    const parts = await Promise.all(Array.from({ length: count }, (_, index) => waitForValue(
      sourceNode.get('chunks').get(String(index)),
      part => Boolean(part && typeof part.value === 'string' && (!revision || part.revision === revision)),
      windowObj,
      timeoutMs
    )));
    if (parts.some(part => typeof part?.value !== 'string')) throw new Error('Incomplete Garden sync payload');
    const ciphertext = parts.map(part => part.value).join('');
    if (manifest.bytes && Number(manifest.bytes) !== ciphertext.length) throw new Error('Garden sync payload length mismatch');
    const decoded = await windowObj.SEA.decrypt(ciphertext, secret);
    const serialized = typeof decoded === 'string' ? decoded : JSON.stringify(decoded);
    const payload = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
    if (payload?.format !== '3dvr-idea-garden') throw new Error('Unsupported Garden sync payload');
    return { kind: 'ready', payload, serialized };
  }

  function newRevision() {
    const random = windowObj.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    return `${Date.now().toString(36)}-${random}`;
  }

  async function writeAndVerify(payload) {
    if (!(await ensureReady()) || !node) return false;
    try {
      const serialized = JSON.stringify(payload);
      const ciphertext = String(await windowObj.SEA.encrypt(serialized, secret));
      const chunks = ciphertext.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) || [];
      const revision = newRevision();
      onStatus('Encrypting and syncing…');
      const chunksSaved = await Promise.all(chunks.map((value, index) => put(
        node.get('chunks').get(String(index)), { revision, index, value }, windowObj, writeTimeoutMs
      )));
      if (!chunksSaved.every(Boolean)) return false;
      const manifestSaved = await put(node.get('manifest'), {
        schemaVersion: 1,
        revision,
        chunks: chunks.length,
        bytes: ciphertext.length,
        updatedAt: new Date().toISOString(),
      }, windowObj, writeTimeoutMs);
      if (!manifestSaved) return false;

      onStatus('Verifying encrypted account copy…');
      const verifier = verificationNode();
      if (!verifier) return false;
      const verified = await readPayload(verifier, { expectedRevision: revision, timeoutMs: verifyTimeoutMs });
      return verified.kind === 'ready' && verified.serialized === serialized;
    } catch { return false; }
  }

  function scheduleRetry() {
    if (retryTimer || !pendingPayload) return;
    retryTimer = windowObj.setTimeout(() => {
      retryTimer = null;
      drainPending();
    }, retryDelay);
    retryDelay = Math.min(30000, retryDelay * 2);
  }

  async function drainPending() {
    if (drainPromise) return drainPromise;
    if (!pendingPayload) return false;
    drainPromise = (async () => {
      while (pendingPayload) {
        if (pendingNeedsMerge) {
          if (!(await ensureReady()) || !node) {
            onStatus('Saved here · Encrypted account sync pending');
            scheduleRetry();
            return false;
          }
          try {
            const remote = await readPayload(node);
            if (remote.kind === 'ready') pendingPayload = mergeGardenPayloads(pendingPayload, remote.payload);
            pendingNeedsMerge = false;
            initialLoadComplete = true;
            persistPendingMarker();
          } catch {
            onStatus('Saved here · Waiting to reconcile account copy');
            scheduleRetry();
            return false;
          }
        }

        const payload = pendingPayload;
        const token = pendingToken;
        const saved = await writeAndVerify(payload);
        if (!saved) {
          onStatus('Saved here · Encrypted account sync pending');
          scheduleRetry();
          return false;
        }
        if (token === pendingToken) {
          clearPending(token);
          onStatus('Encrypted and verified on your account');
          return true;
        }
      }
      return true;
    })().finally(() => { drainPromise = null; });
    return drainPromise;
  }

  function retryPending() {
    if (retryTimer) {
      windowObj.clearTimeout(retryTimer);
      retryTimer = null;
    }
    return drainPending();
  }

  const retryOnReturn = () => { if (pendingPayload) retryPending(); };
  windowObj.addEventListener?.('online', retryOnReturn);
  windowObj.addEventListener?.('focus', retryOnReturn);
  windowObj.document?.addEventListener?.('visibilitychange', () => {
    if (windowObj.document.visibilityState === 'visible') retryOnReturn();
  });

  const readyPromise = ensureReady();

  return {
    ready: readyPromise,
    async load(localPayload) {
      const storedMarker = readPendingMarker();
      if (storedMarker) {
        pendingPayload = localPayload;
        pendingNeedsMerge = storedMarker.needsMerge !== false;
        pendingToken += 1;
      }
      if (!(await ensureReady()) || !node) {
        if (hasGardenContent(localPayload) && !pendingPayload) {
          markPending(localPayload, { needsMerge: true });
          onStatus('Saved here · Sign in will resume encrypted sync');
        }
        return null;
      }
      try {
        const remote = await readPayload(node);
        initialLoadComplete = true;
        if (remote.kind === 'missing') {
          if (!hasGardenContent(localPayload)) {
            onStatus('Encrypted account sync ready');
            return null;
          }
          onStatus('No account copy yet · Uploading this Garden…');
          return localPayload;
        }
        const merged = mergeGardenPayloads(localPayload, remote.payload);
        if (storedMarker) {
          pendingPayload = merged;
          pendingNeedsMerge = false;
          persistPendingMarker();
        }
        onStatus('Encrypted account copy loaded');
        return merged;
      } catch {
        if (hasGardenContent(localPayload) && !pendingPayload) markPending(localPayload, { needsMerge: true });
        onStatus('Saved here · Encrypted account copy could not be opened');
        return null;
      }
    },
    async save(payload) {
      const token = markPending(payload, { needsMerge: !initialLoadComplete });
      const saved = await drainPending();
      return saved && confirmedToken >= token;
    },
    retry: retryPending,
    isReady() { return ready; },
    hasPending() { return Boolean(pendingPayload || pendingMarker()); },
  };
}
