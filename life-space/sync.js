const SYNC_NODE = 'life-space-v01';
const CHUNK_SIZE = 24 * 1024;
const READ_TIMEOUT_MS = 6000;

const delay = (windowObj, ms) => new Promise(resolve => windowObj.setTimeout(resolve, ms));
const once = (node, windowObj, timeoutMs = READ_TIMEOUT_MS) => new Promise(resolve => {
  let settled = false;
  const finish = value => { if (!settled) { settled = true; resolve(value); } };
  try {
    node.once(value => {
      // GUN may report an empty local cache before the relay answers. Keep
      // listening until useful data arrives or the read window expires.
      if (value !== null && value !== undefined) finish(value);
    });
    windowObj.setTimeout(() => finish(null), timeoutMs);
  } catch { finish(null); }
});
const put = (node, value) => new Promise(resolve => {
  try { node.put(value, ack => resolve(!ack?.err)); } catch { resolve(false); }
});
const modified = value => Number(value?.updatedAt || value?.createdAt || 0);

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

function mergeById(local = [], remote = []) {
  const values = new Map();
  for (const value of [...remote, ...local]) {
    if (!value?.id) continue;
    const current = values.get(value.id);
    if (!current || modified(value) >= modified(current)) values.set(value.id, value);
  }
  return [...values.values()];
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

export function createLifeSpaceSync({ windowObj = window, onStatus = () => {}, readTimeoutMs = READ_TIMEOUT_MS } = {}) {
  let node = null;
  let secret = null;
  let ready = false;
  let revision = 0;
  const init = async () => {
    if (typeof windowObj.Gun !== 'function' || !windowObj.SEA) return false;
    try {
      windowObj.AuthIdentity?.syncStorageFromSharedIdentity?.(windowObj.localStorage);
      const gun = windowObj.Gun({ peers: windowObj.__GUN_PEERS__ || [] });
      const user = gun.user();
      user.recall?.({ sessionStorage: true, localStorage: true });
      for (let attempt = 0; attempt < 12 && !user.is; attempt += 1) await delay(windowObj, 150);
      secret = user?._?.sea || null;
      if (!user.is?.pub || !secret || typeof windowObj.SEA.encrypt !== 'function' || typeof windowObj.SEA.decrypt !== 'function') {
        onStatus('Saved on this device · Sign in to sync');
        return false;
      }
      node = user.get(SYNC_NODE).get('workspace');
      ready = true;
      onStatus('Account sync ready');
      return true;
    } catch {
      onStatus('Saved on this device');
      return false;
    }
  };
  const readyPromise = init();

  async function readPayload() {
    const manifest = await once(node.get('manifest'), windowObj, readTimeoutMs);
    if (!manifest) return { kind: 'missing', payload: null };
    const count = Number(manifest?.chunks || 0);
    if (!count || count > 5000) throw new Error('Invalid Life Space sync manifest');
    const parts = await Promise.all(Array.from(
      { length: count },
      (_, index) => once(node.get('chunks').get(String(index)), windowObj, readTimeoutMs)
    ));
    if (parts.some(part => typeof part?.value !== 'string')) throw new Error('Incomplete Life Space sync payload');
    const ciphertext = parts.map(part => part.value).join('');
    const decoded = await windowObj.SEA.decrypt(ciphertext, secret);
    const payload = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
    if (payload?.format !== '3dvr-life-space') throw new Error('Unsupported Life Space sync payload');
    return { kind: 'ready', payload };
  }

  return {
    ready: readyPromise,
    async load(localPayload) {
      if (!(await readyPromise) || !node) return null;
      try {
        const remote = await readPayload();
        if (remote.kind === 'missing') {
          if (!hasWorkspaceContent(localPayload)) {
            onStatus('Account sync ready');
            return null;
          }
          // Returning the local payload lets app startup write the first
          // encrypted account copy. This is how existing phone-only notes
          // become available on a second device without requiring a new edit.
          onStatus('No account copy yet · Uploading this device…');
          return localPayload;
        }
        onStatus('Synced to your account');
        return mergeLifeSpacePayloads(localPayload, remote.payload);
      } catch {
        onStatus('Account workspace could not be opened');
        return null;
      }
    },
    async save(payload) {
      if (!(await readyPromise) || !node) return false;
      const saveRevision = ++revision;
      try {
        onStatus('Syncing…');
        const ciphertext = await windowObj.SEA.encrypt(JSON.stringify(payload), secret);
        const chunks = String(ciphertext).match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) || [];
        const results = await Promise.all(chunks.map((value, index) => put(node.get('chunks').get(String(index)), { value })));
        if (saveRevision !== revision) return false;
        const saved = results.every(Boolean) && await put(node.get('manifest'), {
          schemaVersion: 1, chunks: chunks.length, updatedAt: new Date().toISOString()
        });
        onStatus(saved ? 'Synced to your account' : 'Saved here · Sync will retry');
        return saved;
      } catch {
        onStatus('Saved here · Sync will retry');
        return false;
      }
    },
    isReady() { return ready; }
  };
}
