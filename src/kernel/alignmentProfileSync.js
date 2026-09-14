import {
  ALIGNMENT_PROFILE_GUN_NODE,
  normalizeAlignmentProfile
} from './alignmentProfile.js';

function once(node, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      node.once((value) => finish(value));
    } catch {
      finish(null);
    }
  });
}

function put(node, value, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Alignment profile sync timed out.')), timeoutMs);
    try {
      node.put(value, (ack) => {
        if (ack?.err) finish(new Error(String(ack.err)));
        else finish(null, ack || {});
      });
    } catch (error) {
      finish(error);
    }
  });
}

export function createAlignmentProfileSync({ user, SEA, nodeName = ALIGNMENT_PROFILE_GUN_NODE } = {}) {
  const pair = user?._?.sea;
  const available = Boolean(user?.is?.pub && pair && SEA?.encrypt && SEA?.decrypt && user?.get);
  const node = available ? user.get('kernel').get(nodeName) : null;

  return {
    available,
    async read() {
      if (!available || !node) return null;
      const record = await once(node);
      if (!record?.ciphertext) return null;
      const decoded = await SEA.decrypt(record.ciphertext, pair);
      if (!decoded) return null;
      const parsed = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
      return normalizeAlignmentProfile(parsed);
    },
    async write(profile) {
      if (!available || !node) return false;
      const normalized = normalizeAlignmentProfile(profile);
      const ciphertext = await SEA.encrypt(JSON.stringify(normalized), pair);
      if (!ciphertext) throw new Error('Unable to encrypt the Alignment Profile.');
      await put(node, {
        schemaVersion: normalized.schemaVersion,
        updatedAt: normalized.updatedAt || new Date().toISOString(),
        ciphertext
      });
      return true;
    }
  };
}
