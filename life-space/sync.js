const SYNC_NODE = 'life-space-v01';
const CHUNK_SIZE = 24 * 1024;

const delay = (windowObj, ms) => new Promise(resolve => windowObj.setTimeout(resolve, ms));
const once = (node, windowObj) => new Promise(resolve => {
  let settled = false;
  const finish = value => { if (!settled) { settled = true; resolve(value); } };
  try { node.once(finish); windowObj.setTimeout(() => finish(null), 2500); } catch { finish(null); }
});
const put = (node, value) => new Promise(resolve => {
  try { node.put(value, ack => resolve(!ack?.err)); } catch { resolve(false); }
});
const modified = value => Number(value?.updatedAt || value?.createdAt || 0);

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

export function createLifeSpaceSync({ windowObj = window, onStatus = () => {} } = {}) {
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
    const manifest = await once(node.get('manifest'), windowObj);
    const count = Number(manifest?.chunks || 0);
    if (!count || count > 5000) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, index) => once(node.get('chunks').get(String(index)), windowObj)));
    if (parts.some(part => typeof part?.value !== 'string')) return null;
    const ciphertext = parts.map(part => part.value).join('');
    const decoded = await windowObj.SEA.decrypt(ciphertext, secret);
    const payload = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
    return payload?.format === '3dvr-life-space' ? payload : null;
  }

  return {
    ready: readyPromise,
    async load(localPayload) {
      if (!(await readyPromise) || !node) return null;
      try {
        const remotePayload = await readPayload();
        if (!remotePayload) return null;
        onStatus('Synced to your account');
        return mergeLifeSpacePayloads(localPayload, remotePayload);
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
