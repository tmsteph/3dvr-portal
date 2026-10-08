const KEY = '3dvr.cs-build-lab.v1';
export const ACCOUNT_NODE = 'cs-build-lab-v2';
const phases = ['learn', 'build', 'explain'];
const fields = [...phases, 'notes', 'completedAt'];
const empty = () => ({ version: 1, modules: {} });
const copy = value => JSON.parse(JSON.stringify(value));
const valid = (record, ids) => record && ids.includes(record.module) && fields.includes(record.field)
  && Number.isFinite(record.time) && record.time >= 0 && typeof record.writer === 'string'
  && (phases.includes(record.field) ? typeof record.value === 'boolean'
    : record.field === 'notes' ? typeof record.value === 'string' && record.value.length <= 40000
    : record.value === null || (typeof record.value === 'string' && Number.isFinite(Date.parse(record.value))));
export function mergeRegisters(a = {}, b = {}, ids = []) {
  const merged = {};
  for (const source of [a, b]) for (const record of Object.values(source || {})) {
    if (!valid(record, ids)) continue;
    const key = record.module + ':' + record.field;
    const current = merged[key];
    if (!current || record.time > current.time || (record.time === current.time && record.writer > current.writer)) {
      merged[key] = copy(record);
    }
  }
  return merged;
}
export function stateFromRegisters(registers, ids) {
  const state = empty();
  for (const id of ids) {
    const e = state.modules[id] = { steps: {}, notes: '', completedAt: null };
    for (const phase of phases) e.steps[phase] = registers[id + ':' + phase]?.value === true;
    e.notes = registers[id + ':notes']?.value || '';
    if (phases.every(p => e.steps[p])) {
      e.completedAt = registers[id + ':completedAt']?.value
        || new Date(Math.max(1, ...phases.map(p => registers[id + ':' + p]?.time || 0))).toISOString();
    }
  }
  return state;
}
function legacyRegisters(state, ids) {
  const result = {};
  for (const id of ids) {
    const e = state?.modules?.[id];
    if (!e) continue;
    for (const field of fields) {
      const value = phases.includes(field) ? e.steps?.[field] === true
        : field === 'notes' ? String(e.notes || '').slice(0, 40000)
        : Number.isFinite(Date.parse(e.completedAt)) ? e.completedAt : null;
      result[id + ':' + field] = { module: id, field, value, time: 0, writer: 'legacy' };
    }
    if (phases.every(p => e.steps?.[p]) && !result[id + ':completedAt'].value) {
      result[id + ':completedAt'].value = new Date().toISOString();
    }
  }
  return result;
}
function bounded(windowObj, operation, ms, fallback) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      windowObj.clearTimeout(timer);
      resolve(value);
    };
    const timer = windowObj.setTimeout(() => finish(fallback), ms);
    try { operation(finish); } catch { finish(fallback); }
  });
}
export function createLabAccountSync({ windowObj = window, ids, getGuestState, onState, onStatus }) {
  const storage = windowObj.localStorage;
  let pub = '', user, pair, SEA, writer, records = {}, chain, stopped = false;
  let queue = Promise.resolve(), retryTimer, identityTimer, dirty = false;
  const writerId = windowObj.crypto.randomUUID();
  const status = text => { if (!stopped) onStatus(text); };
  const accountKey = () => KEY + ':account:' + pub;
  function cache() {
    try { storage.setItem(accountKey(), JSON.stringify({ version: 2, registers: records })); }
    catch { status('Account sync active · Browser cache unavailable'); }
  }
  function matchesAccount() {
    if (stopped || !pub || user?.is?.pub !== pub || storage.getItem('signedIn') !== 'true') return false;
    const expected = storage.getItem('userPubKey');
    const alias = storage.getItem('alias') || '';
    return (!expected || expected === pub) && (!alias || alias.toLowerCase() === (user.is.alias || '').toLowerCase());
  }
  async function publish() {
    if (!matchesAccount()) return false;
    const snapshot = JSON.stringify({ version: 2, registers: records });
    const ciphertext = await SEA.encrypt(snapshot, pair);
    if (!ciphertext || !matchesAccount()) return false;
    status('Saving to your account…');
    const ok = await bounded(windowObj, done => writer.put({ ciphertext, schemaVersion: 2 }, ack => done(Boolean(ack && !ack.err))), 6000, false);
    if (stopped) return false;
    dirty = !ok;
    // A write acknowledgement is not proof that another device has downloaded it.
    status(ok ? 'Account save acknowledged · Listening for updates' : 'Saved on this device · Account sync will retry');
    if (!ok) {
      windowObj.clearTimeout(retryTimer);
      retryTimer = windowObj.setTimeout(() => enqueuePublish(), 10000);
    }
    return ok;
  }
  function enqueuePublish() {
    queue = queue.catch(() => false).then(publish);
    return queue;
  }
  const runtime = {
    get pub() { return pub; },
    get available() { return matchesAccount(); },
    save(state) {
      if (!matchesAccount()) return Promise.resolve(false);
      const desired = legacyRegisters(state, ids);
      const clock = Math.max(Date.now(), ...Object.values(records).map(r => r.time + 1));
      let changed = false;
      for (const [key, record] of Object.entries(desired)) {
        if (records[key]?.value === record.value) continue;
        records[key] = { ...record, time: clock, writer: writerId };
        changed = true;
      }
      if (!changed && !dirty) return queue;
      dirty = true;
      cache();
      return enqueuePublish();
    },
    stop() {
      stopped = true;
      chain?.off?.();
      windowObj.clearTimeout(retryTimer);
      windowObj.clearInterval(identityTimer);
    }
  };
  runtime.ready = (async () => {
    try {
      windowObj.AuthIdentity?.syncStorageFromSharedIdentity?.(storage);
      if (storage.getItem('signedIn') !== 'true') {
        status('Saved on this device · Sign in to sync across devices');
        return false;
      }
      SEA = windowObj.SEA || windowObj.Gun?.SEA;
      if (typeof windowObj.Gun !== 'function' || !SEA?.encrypt || !SEA?.decrypt) throw new Error('Gun unavailable');
      const gun = windowObj.Gun({ peers: windowObj.__GUN_PEERS__ || [] });
      user = gun.user();
      user.recall?.({ sessionStorage: true, localStorage: true });
      for (let i = 0; i < 10 && !user.is?.pub; i++) await new Promise(r => windowObj.setTimeout(r, 150));
      const expected = storage.getItem('userPubKey') || '';
      const alias = storage.getItem('alias') || '';
      if (!user.is?.pub || (expected && expected !== user.is.pub) || (alias && user.is.alias !== alias)) {
        user.leave?.();
        const password = storage.getItem('password');
        if (!alias || !password) throw new Error('Signing session unavailable');
        const ok = await bounded(windowObj, done => user.auth(alias, password, ack => done(Boolean(ack && !ack.err))), 6000, false);
        if (!ok) throw new Error('Authentication failed');
      }
      pub = user.is?.pub || '';
      pair = user._?.sea;
      if (!pub || !pair || !matchesAccount()) throw new Error('Account mismatch');
      const challenge = { scope: ACCOUNT_NODE, nonce: writerId };
      const signed = await SEA.sign(challenge, pair);
      if (!await SEA.verify(signed, pub)) throw new Error('Signing session unavailable');
      let stored;
      try { stored = JSON.parse(storage.getItem(accountKey()) || 'null'); } catch { stored = null; }
      if (stored?.version === 2) records = mergeRegisters({}, stored.registers, ids);
      // Claim the original guest cache once, so a second account never inherits it.
      const owner = storage.getItem(KEY + ':migration-owner');
      if (!owner || owner === pub) {
        records = mergeRegisters(legacyRegisters(getGuestState(), ids), records, ids);
        storage.setItem(KEY + ':migration-owner', pub);
      }
      cache();
      onState(stateFromRegisters(records, ids));
      const devices = user.get('education').get(ACCOUNT_NODE).get('devices');
      writer = devices.get(writerId);
      chain = devices.map();
      chain.on(async record => {
        if (!record?.ciphertext || !matchesAccount()) return;
        try {
          const decoded = await SEA.decrypt(record.ciphertext, pair);
          const remote = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
          if (remote?.version !== 2 || !matchesAccount()) return;
          const merged = mergeRegisters(records, remote.registers, ids);
          if (JSON.stringify(merged) === JSON.stringify(records)) return;
          records = merged;
          cache();
          onState(stateFromRegisters(records, ids));
          status(dirty ? 'Account updates received · Local changes still saving' : 'Account updates received');
        } catch { status('An account update could not be opened · Local progress preserved'); }
      });
      status('Account connected · Loading progress…');
      // Per-session writers avoid whole-account snapshots overwriting other devices.
      dirty = true;
      enqueuePublish();
      identityTimer = windowObj.setInterval(() => {
        if (matchesAccount()) return;
        runtime.stop();
        onStatus('Account changed · Reload or retry to connect');
        onState(getGuestState());
      }, 1500);
      return true;
    } catch {
      pub = '';
      status('Saved on this device · Sign-in could not be restored. Retry or open sign-in.');
      return false;
    }
  })();
  return runtime;
}
