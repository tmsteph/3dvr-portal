import { openCellAccount } from '../operator/forge.js';
import { openPrivateCellStore, cellIdentity } from './private-store.js';

const KEY = /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;
const ID = /^[A-Za-z0-9-]{1,100}$/;
const MEMBER_PREFIX = '3dvr-cell-member:';
const SCOPE = '3dvr-cell-share-v1';

function invitationReference(value) {
  let parsed;
  try {
    const fragment = new URL(value, 'https://portal.3dvr.tech/cell/').hash.slice(1);
    parsed = JSON.parse(new URLSearchParams(fragment).get('invite') || 'null');
  } catch { throw new Error('Use a complete Cell invitation link.'); }
  if (!parsed || parsed.v !== 1 || !KEY.test(parsed.ownerPub) || !KEY.test(parsed.ownerEpub)
    || !KEY.test(parsed.recipientPub) || !ID.test(parsed.grantId)) throw new Error('Invalid Cell invitation.');
  return parsed;
}

export async function openCellInvitations({
  getAccount = openCellAccount, storage = globalThis.localStorage,
  onSharedCell = () => {}, onMembers = () => {}, timeoutMs = 5000
} = {}) {
  const identity = cellIdentity(storage);
  const account = await getAccount();
  const { gun, user, pair, sea } = account;
  let closed = false;
  let lastStamp = 0;
  const stamp = () => new Date(lastStamp = Math.max(Date.now(), lastStamp + 1)).toISOString();
  let journal;
  const metadataInbox = [];
  let queue = Promise.resolve();
  let retrying = null;
  const grants = new Map();
  const memberships = new Map();
  const streams = new Map();
  const versions = new Map();
  const revoked = new Set();
  const current = () => !closed && user.is?.pub === pair.pub && cellIdentity(storage) === identity;
  const check = () => { if (!current()) throw new Error('Account changed. Reopen Cell.'); };
  check();
  const enqueue = work => {
    const next = queue.then(() => { check(); return work(); });
    queue = next.catch(() => {});
    return next;
  };
  const sharedId = ref => `shared:${ref.ownerPub}:${ref.grantId}`;
  const membershipId = ref => `membership:${ref.ownerPub}:${ref.grantId}`;
  const showMembers = cellId => onMembers(cellId, [...grants.values()].filter(g => g.cellId === cellId));
  async function verifiedEvent(ref, envelope, eventId) {
    check();
    if (ref.recipientPub !== pair.pub || !envelope?.ciphertext) throw new Error('This invitation belongs to another account.');
    const secret = await sea.secret(ref.ownerEpub, pair);
    const signed = secret && await sea.decrypt(envelope.ciphertext, secret);
    const payload = signed && await sea.verify(signed, ref.ownerPub);
    check();
    if (!payload || payload.scope !== SCOPE || payload.eventId !== eventId
      || payload.grantId !== ref.grantId || payload.issuerPub !== ref.ownerPub
      || payload.issuerEpub !== ref.ownerEpub || payload.recipientPub !== pair.pub
      || payload.role !== 'reader' || !Number.isFinite(Date.parse(payload.updatedAt))
      || (!payload.revoked && (!payload.cell || typeof payload.cell.id !== 'string'))) {
      throw new Error('Invitation signature or recipient did not match.');
    }
    return { payload, signed };
  }
  function renderMembership(ref, payload) {
    if (payload.revoked) revoked.add(sharedId(ref));
    if (revoked.has(sharedId(ref))) {
      onSharedCell(null, sharedId(ref));
      return;
    }
    onSharedCell({ ...payload.cell, ownerPub: ref.ownerPub, readOnly: true }, sharedId(ref));
  }
  function watchShares(ref, listener) {
    // Gun caches map chains. Dispose only this listener's events, never the shared chain.
    const chain = gun.user(ref.ownerPub).get('cell-v1').get('shares').get(ref.grantId).map();
    const events = new Set();
    let active = true;
    chain.on((envelope, eventId, _message, event) => {
      if (event?.off) events.add(event);
      if (!active) { event?.off?.(); return; }
      listener(envelope, eventId);
    });
    return {off() { active = false; for (const event of events) event.off(); }};
  }
  function subscribe(ref) {
    const key = sharedId(ref);
    if (streams.has(key) || revoked.has(key) || !current()) return;
    const stream = watchShares(ref, (envelope, eventId) => {
      void (async () => {
        if (revoked.has(key)) return;
        const { payload, signed } = await verifiedEvent(ref, envelope, eventId);
        const version = `${payload.updatedAt}:${eventId}`;
        if ((versions.get(key) || '') >= version && !payload.revoked) return;
        versions.set(key, version);
        renderMembership(ref, payload);
        // Preserve the owner's signature inside the member's encrypted account journal.
        await journal.save({ id: membershipId(ref), type: 'membership', ref, signed,
          eventId, updatedAt: stamp() });
      })().catch(() => {});
    });
    streams.set(key, stream);
  }
  async function receiveMetadata(record) {
    if (!current()) return;
    if (record.type === 'grant') {
      grants.set(record.id, record);
      showMembers(record.cellId);
    } else if (record.type === 'membership') {
      const { ref } = record;
      if (ref?.recipientPub !== pair.pub) return;
      const payload = await sea.verify(record.signed, ref.ownerPub);
      check();
      // Cached records are checked with the same owner/recipient binding as relay events.
      if (!payload || payload.scope !== SCOPE || payload.grantId !== ref.grantId
        || payload.eventId !== record.eventId || payload.issuerPub !== ref.ownerPub
        || payload.issuerEpub !== ref.ownerEpub || payload.recipientPub !== pair.pub
        || payload.role !== 'reader') return;
      const key = sharedId(ref);
      const version = `${payload.updatedAt}:${record.eventId}`;
      if ((versions.get(key) || '') <= version || payload.revoked) {
        versions.set(key, version);
        memberships.set(key, record);
        renderMembership(ref, payload);
      }
      subscribe(ref);
    }
  }
  journal = await openPrivateCellStore({ getAccount: async () => account, storage, timeoutMs,
    namespace: 'cell-sharing-v1', onCell: record => {
      if (!journal) metadataInbox.push(record);
      else void receiveMetadata(record).catch(() => {});
    } });
  for (const record of metadataInbox) await receiveMetadata(record);
  check();
  async function publishGrant(grant) {
    check();
    const pendingSync = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(true), timeoutMs);
      user.get('cell-v1').get('shares').get(grant.id).get(grant.eventId)
        .put({ciphertext: grant.outbound}, ack => {
          clearTimeout(timer);
          resolve(Boolean(ack?.err || !ack?.ok));
        });
    });
    check();
    if (!pendingSync && grants.get(grant.id)?.eventId === grant.eventId) {
      await journal.save({ ...grant, pendingSync: false, updatedAt: stamp() });
    }
    return { pendingSync };
  }
  async function writeGrant(grant, cell, isRevoked = false) {
    check();
    const eventId = crypto.randomUUID();
    const now = stamp();
    const payload = { scope: SCOPE, eventId, grantId: grant.id, issuerPub: pair.pub,
      issuerEpub: pair.epub, recipientPub: grant.recipientPub, role: 'reader',
      updatedAt: now, revoked: isRevoked, cell: isRevoked ? null : cell };
    const signed = await sea.sign(payload, pair);
    const secret = await sea.secret(grant.recipientEpub, pair);
    const outbound = signed && secret && await sea.encrypt(signed, secret);
    check();
    if (!outbound) throw new Error('Could not encrypt the invitation.');
    const record = { ...grant, type: 'grant', eventId, outbound, pendingSync: true,
      revoked: isRevoked, lastSharedAt: cell?.updatedAt || grant.lastSharedAt || '', updatedAt: now };
    await journal.save(record);
    check();
    grants.set(record.id, record);
    showMembers(record.cellId);
    return publishGrant(record);
  }
  function retryPending() {
    if (!current()) return Promise.resolve();
    if (retrying) return retrying;
    retrying = (async () => {
      await journal.retryPending();
      const pending = [...grants.values()].filter(grant => grant.pendingSync);
      // Background relay timeouts must not block owner invitation/revocation controls.
      for (let index = 0; index < pending.length && current(); index += 4) {
        await Promise.all(pending.slice(index, index + 4).map(grant =>
          grants.get(grant.id)?.eventId === grant.eventId ? publishGrant(grant) : undefined));
      }
    })().finally(() => { retrying = null; });
    return retrying;
  }
  void retryPending().catch(() => {});
  return {
    async memberCode() {
      check();
      const proof = await sea.sign({scope: 'cell-member-key', pub: pair.pub, epub: pair.epub}, pair);
      check();
      return MEMBER_PREFIX + encodeURIComponent(JSON.stringify({pub: pair.pub, proof}));
    },
    invite(cell, code, baseUrl) {
      return enqueue(async () => {
        if (!cell || cell.readOnly) throw new Error('Only the Cell owner can invite members.');
        let card;
        try { card = JSON.parse(decodeURIComponent(String(code).replace(MEMBER_PREFIX, ''))); }
        catch { throw new Error('Paste the member’s complete account code.'); }
        const recipient = KEY.test(card.pub) && await sea.verify(card.proof, card.pub);
        if (!recipient || recipient.scope !== 'cell-member-key' || recipient.pub !== card.pub || !KEY.test(recipient.epub)) {
          throw new Error('The member account code could not be verified.');
        }
        if (recipient.pub === pair.pub) throw new Error('You already own this Cell.');
        if ([...grants.values()].some(g => g.cellId === cell.id && g.recipientPub === recipient.pub && !g.revoked)) {
          throw new Error('That account already has an invitation. Copy its link below.');
        }
        const grant = {id: crypto.randomUUID(), cellId: cell.id,
          recipientPub: recipient.pub, recipientEpub: recipient.epub};
        const result = await writeGrant(grant, cell);
        const ref = {v: 1, ownerPub: pair.pub, ownerEpub: pair.epub,
          recipientPub: recipient.pub, grantId: grant.id};
        const url = new URL(baseUrl);
        url.search = ''; url.hash = new URLSearchParams({invite:JSON.stringify(ref)}).toString();
        return {...result, url: url.toString()};
      });
    },
    link(grantId, baseUrl) {
      check();
      const grant = grants.get(grantId);
      if (!grant || grant.revoked) throw new Error('Invitation is no longer active.');
      const url = new URL(baseUrl); url.search = '';
      url.hash = new URLSearchParams({invite:JSON.stringify({v:1, ownerPub:pair.pub,
        ownerEpub:pair.epub, recipientPub:grant.recipientPub, grantId})}).toString();
      return url.toString();
    },
    accept(link) {
      return enqueue(async () => {
        const ref = invitationReference(link);
        if (ref.recipientPub !== pair.pub) throw new Error('This invitation belongs to another account.');
        let stream;
        const candidates = [];
        let latestError;
        await new Promise(resolve => {
          const timer = setTimeout(() => { stream?.off(); resolve(); }, timeoutMs);
          stream = watchShares(ref, (envelope, eventId) => {
            const candidate = verifiedEvent(ref, envelope, eventId)
              .catch(error => { latestError = error; return null; });
            candidates.push(candidate);
          });
          if (!current()) { clearTimeout(timer); stream.off(); resolve(); }
        });
        check();
        const verified = (await Promise.all(candidates)).filter(Boolean);
        if (!verified.length) throw latestError || new Error('Invitation has not synced yet. Retry after the owner reconnects.');
        if (verified.some(v => v.payload.revoked)) throw new Error('The owner revoked this invitation.');
        verified.sort((a,b) => `${a.payload.updatedAt}:${a.payload.eventId}`.localeCompare(`${b.payload.updatedAt}:${b.payload.eventId}`));
        const {payload, signed} = verified.at(-1);
        await journal.save({id:membershipId(ref), type:'membership', ref, signed,
          eventId:payload.eventId, updatedAt:stamp()});
        check();
        renderMembership(ref, payload);
        subscribe(ref);
        return payload.cell;
      });
    },
    publishCell(cell) {
      return enqueue(async () => {
        for (const grant of grants.values()) {
          if (grant.cellId === cell.id && !grant.revoked && cell.updatedAt > grant.lastSharedAt) {
            await writeGrant(grant, cell);
          }
        }
      });
    },
    revoke(grantId) {
      return enqueue(async () => {
        const grant = grants.get(grantId);
        if (!grant || grant.revoked) throw new Error('Invitation is no longer active.');
        return writeGrant(grant, null, true);
      });
    },
    retryPending,
    close() { closed = true; journal.close(); for (const stream of streams.values()) stream.off(); }
  };
}
