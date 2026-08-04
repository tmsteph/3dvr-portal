const SYNC_NODE = 'life-space-v01';
const CHUNK_SIZE = 24 * 1024;
const READ_TIMEOUT_MS = 6000;
const SESSION_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 5000;
const PENDING_KEY = 'life-space:pending-account-sync:v2';

const delay = (windowObj, ms) => new Promise(resolve => windowObj.setTimeout(resolve, ms));
const modified = value => Number(value?.updatedAt || value?.createdAt || 0);

function safeStorageGet(storage, key) {
  try { return storage?.getItem?.(key) || ''; } catch { return ''; }
}

function safeStorageSet(storage, key, value) {
  try { storage?.setItem?.(key, value); return true; } catch { return false; }
}

function safeStorageRemove(storage, key) {
  try { storage?.removeItem?.(key); return true; } catch { return false; }
}

function waitForValue(node, predicate, windowObj, timeoutMs = READ_TIMEOUT_MS) {
  return new Promise(resolve => {
    let settled = false;
    let subscription = null;
    let timer = null;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (timer) windowObj.clearTimeout?.(timer);
      try {
        if (subscription && typeof subscription.off === 'function') subscription.off();
        else if (typeof node?.off === 'function') node.off();
      } catch {}
      resolve(value);
    };
    const accept = value => {
      try { if (predicate(value)) finish(value); } catch {}
    };
    timer = windowObj.setTimeout(() => finish(null), Math.max(0, timeoutMs));
    try {
      if (typeof node?.on === 'function') subscription = node.on(accept);
      else if (typeof node?.once === 'function') node.once(accept);
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
        windowObj.clearTimeout?.(timer);
        finish(!ack?.err);
      });
    } catch {
      windowObj.clearTimeout?.(timer);
      finish(false);
    }
  });
}

function mergeById(local = [], remote = []) {
  const values = new Map();
  for (const value of [...remote, ...local]) {
    if (!value?.id) continue;
    const current = values.get(value.id);
    if (!current || modified(value) >= modified(current)) values.set(value.id, value);
  }
  return [...values.values()];
}

function hasWorkspaceContent(payload) {
  const state = payload?.state;
  const spaces = Array.isArray(state?.spaces) ? state.spaces : [];
  if ((payload?.files || []).length || (state?.deletedSpaceIds || []).length || spaces.length > 1) return true;
  return spaces.some(space => (
    (space?.items || []).length
    || (space?.strokes || []).length
    || (space?.deletedItemIds || []).length
    || modified(space) > 0
    || (space?.id && space.id !== 'space-home')
    || (space?.name && space.name !== 'My Life')
  ));
}

export function mergeLifeSpaceStates(localState, remoteState) {
  if (!localState) return remoteState;
  if (!remoteState) return localState;
  const deletedSpaces = new Set([...(remoteState.deletedSpaceIds || []), ...(localState.deletedSpaceIds || [])]);
  const localSpaces = new Map((localState.spaces || []).map(space => [space.id, space]));
  const remoteSpaces = new Map((remoteState.spaces || []).map(space => [space.id, space]));
  const spaces = [];
  for (const id of new Set([...remoteSpaces.keys(), ...localSpaces.keys()])) {
    if (deletedSpaces.has(id)) continue;
    const local = localSpaces.get(id);
    const remote = remoteSpaces.get(id);
    if (!local || !remote) { spaces.push(local || remote); continue; }
    const winner = modified(local) >= modified(remote) ? local : remote;
    const deletedItems = new Set([...(remote.deletedItemIds || []), ...(local.deletedItemIds || [])]);
    spaces.push({
      ...winner,
      items: mergeById(local.items, remote.items).filter(item => !deletedItems.has(item.id)),
      strokes: mergeById(local.strokes, remote.strokes).filter(stroke => !deletedItems.has(stroke.id)),
      deletedItemIds: [...deletedItems]
    });
  }
  const winner = modified(localState) >= modified(remoteState) ? localState : remoteState;
  const activeSpaceId = spaces.some(space => space.id === winner.activeSpaceId) ? winner.activeSpaceId : spaces[0]?.id;
  return { ...winner, spaces, activeSpaceId, deletedSpaceIds: [...deletedSpaces], updatedAt: Math.max(modified(localState), modified(remoteState)) };
}

export function mergeLifeSpacePayloads(localPayload, remotePayload) {
  if (!localPayload) return remotePayload;
  if (!remotePayload) return localPayload;
  const files = mergeById(localPayload.files, remotePayload.files);
  return {
    format: '3dvr-life-space', version: 1, exportedAt: new Date().toISOString(),
    state: mergeLifeSpaceStates(localPayload.state, remotePayload.state), files
  };
}

export function createLifeSpaceSync({
  windowObj = window,
  onStatus = () => {},
  readTimeoutMs = READ_TIMEOUT_MS,
  sessionTimeoutMs = SESSION_TIMEOUT_MS,
  verifyTimeoutMs = Math.max(readTimeoutMs, 6000),
  writeTimeoutMs = WRITE_TIMEOUT_MS
} = {}) {
  let gun = null;
  let user = null;
  let node = null;
  let secret = null;
  let ready = false;
  let setupPromise = null;
  let pendingPayload = null;
  let pendingToken = 0;
  let confirmedToken = 0;
  let drainPromise = null;
  let retryTimer = null;
  let retryDelay = 2000;

  const storage = windowObj.localStorage;
  const peers = Array.isArray(windowObj.__GUN_PEERS__) ? windowObj.__GUN_PEERS__ : [];

  function pendingMarker() {
    return safeStorageGet(storage, PENDING_KEY);
  }

  function markPending(payload) {
    pendingPayload = payload;
    pendingToken += 1;
    const marker = {
      queuedAt: Date.now(),
      stateUpdatedAt: modified(payload?.state),
      token: pendingToken
    };
    safeStorageSet(storage, PENDING_KEY, JSON.stringify(marker));
    return pendingToken;
  }

  function clearPending(token) {
    if (token !== pendingToken) return;
    pendingPayload = null;
    confirmedToken = token;
    safeStorageRemove(storage, PENDING_KEY);
    retryDelay = 2000;
  }

  function signedInMarkerExists() {
    const shared = windowObj.AuthIdentity?.readSharedIdentity?.() || {};
    return shared.signedIn === true || safeStorageGet(storage, 'signedIn') === 'true';
  }

  function sessionStatus() {
    if (signedInMarkerExists()) {
      return 'Signed in to the portal · Re-enter your password to sync Life Space';
    }
    return 'Saved on this device · Sign in to sync';
  }

  async function waitForSession(timeoutMs = sessionTimeoutMs) {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (!user?.is?.pub && Date.now() <= deadline) {
      await delay(windowObj, 120);
    }
    return Boolean(user?.is?.pub);
  }

  async function restoreSession() {
    if (user?.is?.pub) return true;
    try { user?.recall?.({ sessionStorage: true, localStorage: true }); } catch {}
    if (await waitForSession(Math.min(2400, sessionTimeoutMs))) return true;

    const alias = safeStorageGet(storage, 'alias').trim();
    const password = safeStorageGet(storage, 'password').trim();
    if (!alias || !password || typeof user?.auth !== 'function') return false;

    await new Promise(resolve => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      try { user.auth(alias, password, finish); } catch { finish(); }
      windowObj.setTimeout(finish, Math.min(2500, sessionTimeoutMs));
    });
    return waitForSession(Math.max(0, sessionTimeoutMs - 2400));
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
        node = user.get(SYNC_NODE).get('workspace');
        ready = true;
        onStatus(pendingMarker() ? 'Account sync ready · Pending changes will retry' : 'Account sync ready');
        return true;
      } catch {
        ready = false;
        onStatus('Saved on this device · Account sync unavailable');
        return false;
      }
    })().finally(() => { setupPromise = null; });
    return setupPromise;
  }

  function createVerificationNode() {
    const pub = user?.is?.pub;
    if (!pub || typeof windowObj.Gun !== 'function') return null;
    try {
      const verifier = windowObj.Gun({ peers, localStorage: false, radisk: false });
      if (!verifier || typeof verifier.get !== 'function') return null;
      return verifier.get(`~${pub}`).get(SYNC_NODE).get('workspace');
    } catch {
      return null;
    }
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
      if (expectedRevision) throw new Error('Life Space manifest was not visible from the relay');
      return { kind: 'missing', payload: null };
    }

    const count = Number(manifest.chunks || 0);
    if (!count || count > 5000) throw new Error('Invalid Life Space sync manifest');
    const revision = typeof manifest.revision === 'string' ? manifest.revision : '';
    const requireRevision = Number(manifest.schemaVersion || 1) >= 2 && Boolean(revision);
    const parts = await Promise.all(Array.from({ length: count }, (_, index) => waitForValue(
      sourceNode.get('chunks').get(String(index)),
      part => Boolean(
        part
        && typeof part.value === 'string'
        && (!requireRevision || part.revision === revision)
      ),
      windowObj,
      timeoutMs
    )));
    if (parts.some(part => typeof part?.value !== 'string')) throw new Error('Incomplete Life Space sync payload');

    const ciphertext = parts.map(part => part.value).join('');
    if (manifest.bytes && Number(manifest.bytes) !== ciphertext.length) throw new Error('Life Space sync payload length did not match');
    const decoded = await windowObj.SEA.decrypt(ciphertext, secret);
    const serialized = typeof decoded === 'string' ? decoded : JSON.stringify(decoded);
    const payload = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
    if (payload?.format !== '3dvr-life-space') throw new Error('Unsupported Life Space sync payload');
    return { kind: 'ready', payload, serialized, manifest };
  }

  function newRevision() {
    const random = windowObj.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    return `${Date.now().toString(36)}-${random}`;
  }

  async function writeAndVerify(payload) {
    if (!(await ensureReady()) || !node) return false;
    try {
      const serialized = JSON.stringify(payload);
      const ciphertext = await windowObj.SEA.encrypt(serialized, secret);
      const chunks = String(ciphertext).match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) || [];
      const revision = newRevision();
      onStatus('Syncing…');

      const results = await Promise.all(chunks.map((value, index) => put(
        node.get('chunks').get(String(index)),
        { revision, index, value },
        windowObj,
        writeTimeoutMs
      )));
      if (!results.every(Boolean)) return false;

      const manifestSaved = await put(node.get('manifest'), {
        schemaVersion: 2,
        revision,
        chunks: chunks.length,
        bytes: String(ciphertext).length,
        payloadUpdatedAt: modified(payload?.state),
        updatedAt: new Date().toISOString()
      }, windowObj, writeTimeoutMs);
      if (!manifestSaved) return false;

      onStatus('Verifying account copy…');
      const verificationNode = createVerificationNode();
      if (!verificationNode) return false;
      const verified = await readPayload(verificationNode, {
        expectedRevision: revision,
        timeoutMs: verifyTimeoutMs
      });
      return verified.kind === 'ready' && verified.serialized === serialized;
    } catch {
      return false;
    }
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
        const payload = pendingPayload;
        const token = pendingToken;
        const saved = await writeAndVerify(payload);
        if (!saved) {
          onStatus('Saved here · Account sync pending');
          scheduleRetry();
          return false;
        }
        if (token === pendingToken) {
          clearPending(token);
          onStatus('Synced and verified on your account');
          return true;
        }
      }
      return true;
    })().finally(() => { drainPromise = null; });
    return drainPromise;
  }

  function retryPending() {
    if (retryTimer) {
      windowObj.clearTimeout?.(retryTimer);
      retryTimer = null;
    }
    ready = Boolean(ready && user?.is?.pub && secret && node);
    return drainPending();
  }

  const retryOnReturn = () => {
    if (pendingPayload) retryPending();
  };
  windowObj.addEventListener?.('online', retryOnReturn);
  windowObj.addEventListener?.('focus', retryOnReturn);
  windowObj.document?.addEventListener?.('visibilitychange', () => {
    if (windowObj.document.visibilityState === 'visible') retryOnReturn();
  });

  const readyPromise = ensureReady();

  return {
    ready: readyPromise,
    async load(localPayload) {
      if (pendingMarker()) {
        pendingPayload = localPayload;
        pendingToken += 1;
      }
      if (!(await ensureReady()) || !node) return null;
      try {
        const remote = await readPayload(node);
        if (remote.kind === 'missing') {
          if (!hasWorkspaceContent(localPayload)) {
            onStatus('Account sync ready');
            return null;
          }
          onStatus('No account copy yet · Uploading this device…');
          return localPayload;
        }
        const merged = mergeLifeSpacePayloads(localPayload, remote.payload);
        if (pendingMarker()) pendingPayload = merged;
        onStatus(pendingMarker() ? 'Account copy loaded · Pending changes will retry' : 'Account copy loaded');
        return merged;
      } catch {
        onStatus('Account workspace could not be opened');
        return null;
      }
    },
    async save(payload) {
      const token = markPending(payload);
      const saved = await drainPending();
      return saved && confirmedToken >= token;
    },
    retry: retryPending,
    isReady() { return ready; },
    hasPending() { return Boolean(pendingPayload || pendingMarker()); }
  };
}
