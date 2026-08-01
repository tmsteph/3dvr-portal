import { createOpportunityEngineState } from './opportunityEngine.js';

export const OPPORTUNITY_ENGINE_GUN_NODE = 'opportunity-engine-v1';

function recordTimestamp(record = {}) {
  const timestamp = Date.parse(record.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeRecords(localRecords = [], remoteRecords = []) {
  const records = new Map();
  [...localRecords, ...remoteRecords].forEach(record => {
    if (!record?.id) return;
    const current = records.get(record.id);
    if (!current || recordTimestamp(record) >= recordTimestamp(current)) {
      records.set(record.id, record);
    }
  });
  return [...records.values()];
}

export function mergeOpportunityEngineStates(localState = {}, remoteState = {}, now = new Date()) {
  const local = createOpportunityEngineState(localState, now);
  const remote = createOpportunityEngineState(remoteState, now);
  return createOpportunityEngineState({
    signals: mergeRecords(local.signals, remote.signals),
    opportunities: mergeRecords(local.opportunities, remote.opportunities),
    updatedAt: new Date(Math.max(
      recordTimestamp(local),
      recordTimestamp(remote),
      now.getTime()
    )).toISOString()
  }, now);
}

function once(node, timeoutMs = 2500) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    node.once(data => finish(data));
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
    const timer = setTimeout(() => finish(new Error('Opportunity sync timed out.')), timeoutMs);
    node.put(value, acknowledgement => {
      if (acknowledgement?.err) finish(new Error(acknowledgement.err));
      else finish(null, acknowledgement || {});
    });
  });
}

export function createOpportunityEngineSync({ user, SEA, nodeName = OPPORTUNITY_ENGINE_GUN_NODE } = {}) {
  const pair = user?._?.sea;
  const available = Boolean(user?.is?.pub && pair && SEA?.encrypt && SEA?.decrypt && user?.get);
  const node = available ? user.get('money-printer').get(nodeName) : null;

  return {
    available,
    async read() {
      if (!available) return null;
      const record = await once(node);
      if (!record?.ciphertext) return null;
      const decrypted = await SEA.decrypt(record.ciphertext, pair);
      if (!decrypted) throw new Error('Unable to decrypt the shared Opportunity Inbox.');
      return createOpportunityEngineState(typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted);
    },
    async write(state) {
      if (!available) return false;
      const normalized = createOpportunityEngineState(state);
      const ciphertext = await SEA.encrypt(JSON.stringify(normalized), pair);
      if (!ciphertext) throw new Error('Unable to encrypt the Opportunity Inbox.');
      await put(node, {
        ciphertext,
        schemaVersion: normalized.schemaVersion,
        updatedAt: normalized.updatedAt
      });
      return true;
    }
  };
}
