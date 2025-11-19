// src/gun/toolkit.js
// Higher-level orchestration for Gun that standardizes connections, monitoring, and backups.
import { createGun } from './adapter.js';
import { getEnvInfo } from './env.js';

function nowIso() {
  return new Date().toISOString();
}

export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) return [value];
  return [];
}

export function omitMetaFields(data = {}) {
  if (data === null || typeof data !== 'object') return data;
  const clone = Array.isArray(data) ? [] : {};
  for (const key of Object.keys(data)) {
    if (key === '_') continue;
    clone[key] = omitMetaFields(data[key]);
  }
  return clone;
}

async function snapshotNode(node, depth, seen) {
  return new Promise(resolve => {
    node.once(async value => {
      if (value === undefined) return resolve(undefined);
      if (value === null || typeof value !== 'object') return resolve(value);

      const metaSoul = value._?.['#'];
      if (metaSoul && seen.has(metaSoul)) {
        return resolve({ _link: metaSoul });
      }

      if (metaSoul) {
        seen.add(metaSoul);
      }

      const cleaned = omitMetaFields(value);
      const keys = Object.keys(cleaned);
      if (!keys.length || depth <= 0) {
        return resolve(cleaned);
      }

      const result = {};
      for (const key of keys) {
        result[key] = await snapshotNode(node.get(key), depth - 1, seen);
      }
      resolve(result);
    });
  });
}

export function searchSnapshot(snapshot, predicate, path = []) {
  const hits = [];
  if (predicate(snapshot, path)) {
    hits.push({ path, value: snapshot });
  }

  if (snapshot && typeof snapshot === 'object') {
    for (const [key, value] of Object.entries(snapshot)) {
      hits.push(...searchSnapshot(value, predicate, [...path, key]));
    }
  }
  return hits;
}

export async function createGunToolkit(options = {}, deps = {}) {
  const getEnvDetails = deps.getEnvInfo || getEnvInfo;
  const createGunImpl = deps.createGun || createGun;

  const env = getEnvDetails();
  const { monitorPeers = true, preferPeers = [] } = options;

  const { gun, root, path, put, sub, once } = await createGunImpl();

  const peerStatus = new Map();
  const statusListeners = new Set();
  const peerListeners = new Set();
  let latestStatus = null;

  function notifyStatus(status, detail = {}) {
    const payload = { status, detail, timestamp: nowIso() };
    latestStatus = payload;
    for (const listener of statusListeners) {
      listener(payload);
    }
  }

  function setPeerState(peer, state) {
    peerStatus.set(peer, { state, updatedAt: nowIso() });
    for (const listener of peerListeners) {
      listener(getPeerStatus());
    }
  }

  function getPeerStatus() {
    return Array.from(peerStatus.entries()).map(([peer, info]) => ({ peer, ...info }));
  }

  if (monitorPeers && gun && typeof gun.on === 'function') {
    gun.on('hi', peer => setPeerState(peer, 'connected'));
    gun.on('bye', peer => setPeerState(peer, 'disconnected'));
  }

  const preferredPeers = Array.from(new Set([
    ...ensureArray(options?.peers),
    ...ensureArray(preferPeers)
  ])).filter(Boolean);

  if (preferredPeers.length) {
    for (const peer of preferredPeers) {
      setPeerState(peer, 'preferred');
    }
  }

  notifyStatus('ready', { root: env.ROOT });

  function resolve(target = []) {
    if (target && typeof target.get === 'function') return target;
    return path(...ensureArray(target));
  }

  async function read(keys = []) {
    return once(resolve(keys));
  }

  async function write(keys = [], value) {
    return put(resolve(keys), value);
  }

  function listen(keys = [], handler) {
    const unsubscribe = sub(resolve(keys), handler);
    return unsubscribe;
  }

  async function captureSnapshot(keys = [], depth = 2) {
    const node = resolve(keys);
    const seen = new Set();
    const payload = await snapshotNode(node, depth, seen);
    return {
      root: env.ROOT,
      capturedAt: nowIso(),
      depth,
      data: payload
    };
  }

  function saveSnapshotLocally(snapshot, storageKey = `${env.ROOT}:backup`) {
    if (typeof localStorage === 'undefined') return false;
    const serialized = JSON.stringify(snapshot, null, 2);
    localStorage.setItem(storageKey, serialized);
    return true;
  }

  function findInSnapshot(snapshot, predicate) {
    return searchSnapshot(snapshot?.data ?? snapshot, predicate);
  }

  return {
    env,
    gun,
    root,
    status: {
      onStatus: listener => {
        statusListeners.add(listener);
        if (latestStatus) {
          listener(latestStatus);
        }
        return () => statusListeners.delete(listener);
      }
    },
    peers: {
      onChange: listener => {
        peerListeners.add(listener);
        return () => peerListeners.delete(listener);
      },
      get: getPeerStatus
    },
    path: resolve,
    read,
    write,
    listen,
    backup: {
      capture: captureSnapshot,
      saveLocal: saveSnapshotLocally,
      query: findInSnapshot
    }
  };
}
