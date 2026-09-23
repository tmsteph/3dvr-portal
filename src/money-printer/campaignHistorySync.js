import {
  authenticateLeadVaultUserFromStorage,
  waitForLeadVaultAuth
} from './leadVaultSync.js';

export const CAMPAIGN_HISTORY_STORAGE_KEY = '3dvr.campaigns.history';
export const CAMPAIGN_HISTORY_GUN_NODE = 'campaign-history-v1';

function clean(value = '') {
  return String(value || '').trim();
}

function stableHash(value = '') {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function historyId(item = {}) {
  const existing = clean(item.id);
  if (existing) return existing;
  const at = Number(item.at || 0);
  return `campaign-${at || 'unknown'}-${stableHash([
    item.subject,
    item.from,
    item.sent,
    item.failed,
    item.transport
  ].join('|'))}`;
}

function once(node, timeoutMs = 3000) {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    }
    node.once(data => finish(data));
  });
}

function put(node, value, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Campaign history sync timed out.')), timeoutMs);
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    }
    node.put(value, acknowledgement => {
      if (acknowledgement?.err) finish(new Error(acknowledgement.err));
      else finish(null, acknowledgement || {});
    });
  });
}

export function normalizeCampaignHistory(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item && Number.isFinite(Number(item.at)))
    .map(item => ({
      ...item,
      id: historyId(item),
      at: Number(item.at),
      subject: clean(item.subject),
      from: clean(item.from),
      connectedAs: clean(item.connectedAs),
      transport: clean(item.transport),
      error: clean(item.error),
      sent: Math.max(0, Number(item.sent) || 0),
      failed: Math.max(0, Number(item.failed) || 0),
    }));
}

export function mergeCampaignHistory(local = [], remote = []) {
  const byId = new Map();
  for (const item of [...normalizeCampaignHistory(local), ...normalizeCampaignHistory(remote)]) {
    const current = byId.get(item.id);
    if (!current || item.at >= current.at) byId.set(item.id, { ...current, ...item });
  }
  return [...byId.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, 100);
}

export function readCampaignHistory(storage = globalThis.localStorage) {
  if (!storage) return [];
  try {
    return normalizeCampaignHistory(JSON.parse(storage.getItem(CAMPAIGN_HISTORY_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
}

export function writeCampaignHistory(items = [], storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    storage.setItem(CAMPAIGN_HISTORY_STORAGE_KEY, JSON.stringify(mergeCampaignHistory(items, [])));
    return true;
  } catch {
    return false;
  }
}

function decodePayload(value) {
  if (!value) return [];
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (Array.isArray(parsed)) return normalizeCampaignHistory(parsed);
  return normalizeCampaignHistory(parsed?.history || []);
}

export function createCampaignHistorySync({ user, SEA, nodeName = CAMPAIGN_HISTORY_GUN_NODE } = {}) {
  const pair = user?._?.sea;
  const available = Boolean(user?.is?.pub && pair && SEA?.encrypt && SEA?.decrypt && user?.get);
  const node = available ? user.get('money-printer').get(nodeName) : null;

  async function read() {
    if (!available) return [];
    const record = await once(node);
    if (!record?.ciphertext) return [];
    const decrypted = await SEA.decrypt(record.ciphertext, pair);
    if (!decrypted) throw new Error('Unable to decrypt campaign history.');
    return decodePayload(decrypted);
  }

  async function write(history = []) {
    if (!available) return false;
    const normalized = mergeCampaignHistory([], history);
    const payload = { schemaVersion: 1, history: normalized, updatedAt: new Date().toISOString() };
    const ciphertext = await SEA.encrypt(JSON.stringify(payload), pair);
    if (!ciphertext) throw new Error('Unable to encrypt campaign history.');
    await put(node, { ciphertext, schemaVersion: 1, updatedAt: payload.updatedAt });
    return true;
  }

  function subscribe(onHistory) {
    if (!available || typeof onHistory !== 'function') return () => {};
    let active = true;
    node.on(async record => {
      if (!active || !record?.ciphertext) return;
      try {
        const decrypted = await SEA.decrypt(record.ciphertext, pair);
        if (!decrypted || !active) return;
        onHistory(decodePayload(decrypted));
      } catch {}
    });
    return () => {
      active = false;
      try { node.off?.(); } catch {}
    };
  }

  return {
    available,
    read,
    write,
    subscribe,
    async mergeAndWrite(local = []) {
      if (!available) return normalizeCampaignHistory(local);
      const remote = await read();
      const merged = mergeCampaignHistory(local, remote);
      await write(merged);
      return merged;
    }
  };
}

export async function createBrowserCampaignHistorySync({
  GunImpl = globalThis.Gun,
  SEA = globalThis.SEA || globalThis.Gun?.SEA,
  peers = globalThis.__GUN_PEERS__,
  storage = globalThis.localStorage,
  authTimeoutMs = 2200,
  credentialAuthTimeoutMs = Math.max(authTimeoutMs, 8000),
  onRemoteMerge = null
} = {}) {
  if (typeof GunImpl !== 'function' || !storage) return { available: false, reason: 'gun-unavailable' };
  const gun = GunImpl(Array.isArray(peers) && peers.length ? peers : ['wss://gun-relay-3dvr.fly.dev/gun']);
  const user = gun.user();
  let authenticated = await waitForLeadVaultAuth(user, authTimeoutMs);
  if (!authenticated) {
    authenticated = await authenticateLeadVaultUserFromStorage(user, storage, credentialAuthTimeoutMs);
  }
  const sync = createCampaignHistorySync({ user, SEA });
  if (!authenticated || !sync.available) {
    return {
      available: false,
      reason: storage.getItem('signedIn') === 'true' ? 'account-sync-unavailable' : 'sign-in-required',
      user,
      sync
    };
  }

  async function reconcile() {
    const local = readCampaignHistory(storage);
    const merged = await sync.mergeAndWrite(local);
    writeCampaignHistory(merged, storage);
    return merged;
  }

  const merged = await reconcile();
  const unsubscribe = sync.subscribe(remoteHistory => {
    const next = mergeCampaignHistory(readCampaignHistory(storage), remoteHistory);
    writeCampaignHistory(next, storage);
    if (typeof onRemoteMerge === 'function') onRemoteMerge(next);
  });

  return { available: true, user, sync, history: merged, reconcile, unsubscribe };
}
