import {
  mergeLeadVaultRecords,
  readLeadVault,
  writeLeadVault
} from './leadVault.js';

export const LEAD_VAULT_GUN_NODE = 'lead-vault-v1';

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

function put(node, value, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(
      () => finish(new Error('Lead Vault sync timed out.')),
      timeoutMs
    );
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

function decodePayload(value) {
  if (!value) return [];
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (Array.isArray(parsed)) return parsed;
  return Array.isArray(parsed?.leads) ? parsed.leads : [];
}

export function createLeadVaultSync({
  user,
  SEA,
  nodeName = LEAD_VAULT_GUN_NODE
} = {}) {
  const pair = user?._?.sea;
  const available = Boolean(
    user?.is?.pub
    && pair
    && SEA?.encrypt
    && SEA?.decrypt
    && user?.get
  );
  const node = available
    ? user.get('money-printer').get(nodeName)
    : null;

  async function read() {
    if (!available) return [];
    const record = await once(node);
    if (!record?.ciphertext) return [];
    const decrypted = await SEA.decrypt(record.ciphertext, pair);
    if (!decrypted) {
      throw new Error('Unable to decrypt the Lead Vault.');
    }
    return decodePayload(decrypted);
  }

  async function write(leads = []) {
    if (!available) return false;
    const normalized = mergeLeadVaultRecords([], leads);
    const payload = {
      schemaVersion: 1,
      leads: normalized,
      updatedAt: new Date().toISOString()
    };
    const ciphertext = await SEA.encrypt(JSON.stringify(payload), pair);
    if (!ciphertext) {
      throw new Error('Unable to encrypt the Lead Vault.');
    }
    await put(node, {
      ciphertext,
      schemaVersion: 1,
      updatedAt: payload.updatedAt
    });
    return true;
  }

  function subscribe(onLeads) {
    if (!available || typeof onLeads !== 'function') return () => {};
    let active = true;
    node.on(async record => {
      if (!active || !record?.ciphertext) return;
      try {
        const decrypted = await SEA.decrypt(record.ciphertext, pair);
        if (!decrypted || !active) return;
        onLeads(decodePayload(decrypted));
      } catch {
        // A transient/decryption failure must not break local Lead Vault use.
      }
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
    async mergeAndWrite(localLeads = []) {
      if (!available) return localLeads;
      const remoteLeads = await read();
      const merged = mergeLeadVaultRecords(localLeads, remoteLeads);
      await write(merged);
      return merged;
    }
  };
}

export function waitForLeadVaultAuth(user, timeoutMs = 2200) {
  if (user?.is?.pub) return Promise.resolve(true);
  try {
    user?.recall?.({ sessionStorage: true, localStorage: true });
  } catch {
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    const startedAt = Date.now();
    const check = () => {
      if (user?.is?.pub) return resolve(true);
      if (Date.now() - startedAt >= timeoutMs) return resolve(false);
      setTimeout(check, 80);
    };
    check();
  });
}

export async function createBrowserLeadVaultSync({
  GunImpl = globalThis.Gun,
  SEA = globalThis.SEA || globalThis.Gun?.SEA,
  peers = globalThis.__GUN_PEERS__,
  storage = globalThis.localStorage,
  authTimeoutMs = 2200,
  onRemoteMerge = null
} = {}) {
  if (typeof GunImpl !== 'function' || !storage) {
    return { available: false, reason: 'gun-unavailable' };
  }

  const gun = GunImpl(
    Array.isArray(peers) && peers.length
      ? peers
      : ['wss://gun-relay-3dvr.fly.dev/gun']
  );
  const user = gun.user();
  const authenticated = await waitForLeadVaultAuth(user, authTimeoutMs);
  const sync = createLeadVaultSync({ user, SEA });

  if (!authenticated || !sync.available) {
    return { available: false, reason: 'sign-in-required', user, sync };
  }

  async function reconcile() {
    const local = readLeadVault(storage);
    const merged = await sync.mergeAndWrite(local);
    writeLeadVault(merged, storage);
    return merged;
  }

  const merged = await reconcile();
  const unsubscribe = sync.subscribe(remoteLeads => {
    const current = readLeadVault(storage);
    const next = mergeLeadVaultRecords(current, remoteLeads);
    writeLeadVault(next, storage);
    if (typeof onRemoteMerge === 'function') onRemoteMerge(next);
  });

  return {
    available: true,
    user,
    sync,
    leads: merged,
    reconcile,
    unsubscribe
  };
}
