const FORGE_ROOT = '3dvr-portal';
const PROOF_WAIT_MS = 900;
const AUTH_WAIT_MS = 2600;
const WRITE_TIMEOUT_MS = 8000;
const GITHUB_WRITE_PATTERN = /\b(push|merge|pull request|open a pr|create a pr|commit(?: to github)?|github branch|push to github)\b/i;
const DEFAULT_PEERS = [
  'wss://gun-relay-3dvr.fly.dev/gun',
  'https://gun-relay-3dvr.fly.dev/gun'
];

let gunInstance = null;
let gunUser = null;
let gunLoadPromise = null;

function normalizeText(value = '', max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function normalizeRepo(value = '') {
  const repo = normalizeText(value, 80).toLowerCase() || 'portal';
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(repo) ? repo : 'portal';
}

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function encodeForgeProof(value = '') {
  const text = String(value || '');
  if (!text) return '';
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `b64:${globalThis.btoa(binary)}`;
}

function forgeRecordUrl(kind, id) {
  const params = new URLSearchParams({ kind, id });
  return `/forge/record.html?${params.toString()}`;
}

function loadScript(src) {
  if (typeof document === 'undefined') return Promise.reject(new Error('Browser script loading is unavailable.'));
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing?.dataset.loaded === 'true') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing || document.createElement('script');
    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const onLoad = () => {
      script.dataset.loaded = 'true';
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Could not load ${src}.`));
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = src;
      document.head.appendChild(script);
    }
  });
}

async function ensureGunRuntime() {
  if (typeof globalThis.Gun === 'function' && globalThis.Gun.SEA?.sign) return;
  if (!gunLoadPromise) {
    gunLoadPromise = (async () => {
      if (typeof globalThis.Gun !== 'function') {
        await loadScript('https://cdn.jsdelivr.net/npm/gun/gun.js');
      }
      if (!globalThis.Gun?.SEA?.sign) {
        await loadScript('https://cdn.jsdelivr.net/npm/gun/sea.js');
      }
      if (!Array.isArray(globalThis.__GUN_PEERS__) || !globalThis.__GUN_PEERS__.length) {
        globalThis.__GUN_PEERS__ = DEFAULT_PEERS.slice();
      }
    })().catch(error => {
      gunLoadPromise = null;
      throw error;
    });
  }
  await gunLoadPromise;
}

async function getGunContext({ loadRuntime = true } = {}) {
  const hasRuntime = typeof globalThis.Gun === 'function' && globalThis.Gun.SEA?.sign;
  if (!hasRuntime && !loadRuntime) return null;
  if (!hasRuntime) await ensureGunRuntime();
  if (gunInstance && gunUser) return { gun: gunInstance, user: gunUser };
  if (typeof globalThis.Gun !== 'function') return null;
  gunInstance = globalThis.Gun({ peers: globalThis.__GUN_PEERS__ || DEFAULT_PEERS });
  gunUser = gunInstance.user();
  try {
    gunUser.recall({ sessionStorage: true, localStorage: true });
  } catch {}
  return { gun: gunInstance, user: gunUser };
}

async function waitForSea(user, waitMs = PROOF_WAIT_MS) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (user?._?.sea && (user?.is?.pub || user._.sea.pub)) return user._.sea;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return user?._?.sea || null;
}

function readStoredPortalIdentity() {
  const storage = globalThis.localStorage;
  if (storage?.getItem?.('signedIn') !== 'true') return null;
  const alias = normalizeText(storage.getItem('alias'), 200);
  const expectedPub = normalizeText(storage.getItem('userPubKey'), 500);
  if (!alias && !expectedPub) return null;
  return { alias, expectedPub };
}

function readStoredPortalAuth() {
  const identity = readStoredPortalIdentity();
  if (!identity) return null;
  const password = normalizeText(globalThis.localStorage?.getItem?.('password'), 1000);
  if (!identity.alias || !password) return null;
  return { ...identity, password };
}

export function developerIdentityMatches({
  expectedAlias = '',
  expectedPub = '',
  actualAlias = '',
  actualPub = ''
} = {}) {
  const wantedAlias = normalizeText(expectedAlias, 200).toLowerCase();
  const wantedPub = normalizeText(expectedPub, 500);
  const seenAlias = normalizeText(actualAlias, 200).toLowerCase();
  const seenPub = normalizeText(actualPub, 500);
  if (!seenPub) return false;
  if (wantedPub && wantedPub !== seenPub) return false;
  if (wantedAlias && seenAlias && wantedAlias !== seenAlias) return false;
  if (!wantedPub && wantedAlias && !seenAlias) return false;
  return true;
}

export async function seaPairCanSign(sea, expectedPub = '') {
  const pub = normalizeText(expectedPub || sea?.pub, 500);
  const SEA = globalThis.Gun?.SEA;
  if (!sea || !pub || !SEA?.sign || !SEA?.verify) return false;
  const challenge = {
    scope: 'operator-session-self-check',
    nonce: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  };
  try {
    const signed = await SEA.sign(challenge, sea);
    const verified = await SEA.verify(signed, pub);
    return Boolean(
      verified
      && verified.scope === challenge.scope
      && verified.nonce === challenge.nonce
    );
  } catch {
    return false;
  }
}

async function restoreStoredPortalSea(user) {
  const stored = readStoredPortalAuth();
  if (!stored || typeof user?.auth !== 'function') return null;

  const authenticated = await new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), AUTH_WAIT_MS);

    try {
      user.auth(stored.alias, stored.password, ack => {
        if (ack?.err) return finish(false);
        const actualPub = normalizeText(user?.is?.pub || user?._?.sea?.pub, 500);
        if (!actualPub) return finish(false);
        if (stored.expectedPub && stored.expectedPub !== actualPub) return finish(false);
        finish(true);
      });
    } catch {
      finish(false);
    }
  });

  if (!authenticated) return null;
  const sea = await waitForSea(user, AUTH_WAIT_MS);
  const actualPub = normalizeText(user?.is?.pub || sea?.pub, 500);
  return await seaPairCanSign(sea, actualPub) ? sea : null;
}

async function ensurePortalSea(user) {
  const stored = readStoredPortalIdentity();
  const recalled = await waitForSea(user);
  if (recalled) {
    const actualPub = normalizeText(user?.is?.pub || recalled.pub, 500);
    const actualAlias = normalizeText(user?.is?.alias, 200);
    if (developerIdentityMatches({
      expectedAlias: stored?.alias,
      expectedPub: stored?.expectedPub,
      actualAlias,
      actualPub
    }) && await seaPairCanSign(recalled, actualPub)) {
      return recalled;
    }
    try {
      user?.leave?.();
    } catch {}
  }
  return restoreStoredPortalSea(user);
}

function writeGun(node, value) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ queued: true, pendingSync: true });
    }, WRITE_TIMEOUT_MS);
    node.put(value, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack?.err) reject(new Error(ack.err));
      else resolve(ack || {});
    });
  });
}

async function signedPortalProof(scope, action, extra = {}, options = {}) {
  const context = await getGunContext(options);
  if (!context || !globalThis.Gun?.SEA?.sign) return null;
  const sea = await ensurePortalSea(context.user);
  const pub = normalizeText(context.user?.is?.pub || sea?.pub, 500);
  if (!sea || !pub) return null;
  const alias = normalizeText(context.user?.is?.alias || globalThis.localStorage?.getItem?.('alias'), 200);
  const payload = {
    scope,
    action,
    alias,
    pub,
    origin: globalThis.location?.origin || '',
    iat: Date.now(),
    ...extra
  };
  const authProof = await globalThis.Gun.SEA.sign(payload, sea);
  let verified = null;
  try {
    verified = await globalThis.Gun.SEA.verify(authProof, pub);
  } catch {}
  if (!verified || verified.scope !== scope || verified.action !== action || verified.pub !== pub) {
    try {
      context.user?.leave?.();
    } catch {}
    throw new Error('3DVR developer signing session is invalid. Sign in again.');
  }
  return {
    authPub: pub,
    authProof,
    portalAlias: alias,
    origin: payload.origin
  };
}

export async function createOperatorDeveloperProof() {
  const signedIn = globalThis.localStorage?.getItem?.('signedIn') === 'true';
  if (!signedIn) return null;
  return signedPortalProof('operator-developer-access', 'operator-chat');
}

export async function createOrganismRecallProof(query, options = {}) {
  const signedIn = globalThis.localStorage?.getItem?.('signedIn') === 'true';
  if (!signedIn) throw new Error('Sign in with your 3DVR account before asking your memory.');
  const text = normalizeText(query, 2000);
  if (!text) throw new Error('A memory question is required.');
  const requestId = normalizeText(options.requestId || makeId('organism-recall'), 160);
  const limit = Math.min(10, Math.max(1, Number.parseInt(options.limit || '5', 10) || 5));
  const proof = await signedPortalProof('digital-organism', 'recall', {
    query: text,
    requestId,
    limit
  });
  if (!proof) throw new Error('Refresh your 3DVR sign-in before asking your memory.');
  return { ...proof, query: text, requestId, limit };
}

export async function createOrganismFeedbackProof(query, memoryId, options = {}) {
  const signedIn = globalThis.localStorage?.getItem?.('signedIn') === 'true';
  if (!signedIn) throw new Error('Sign in with your 3DVR account before approving a memory.');
  const text = normalizeText(query, 2000);
  const id = normalizeText(memoryId, 300);
  if (!text) throw new Error('The original memory question is required.');
  if (!id) throw new Error('A memory id is required.');
  const requestId = normalizeText(options.requestId || makeId('organism-feedback'), 160);
  const proof = await signedPortalProof('digital-organism', 'approve-retrieval', {
    query: text,
    memoryId: id,
    requestId
  });
  if (!proof) throw new Error('Refresh your 3DVR sign-in before approving a memory.');
  return { ...proof, query: text, memoryId: id, requestId };
}

export async function saveCodeSuggestion(action = {}) {
  const context = await getGunContext();
  if (!context) throw new Error('3DVR Forge is unavailable in this browser.');
  const text = normalizeText(action.text);
  if (!text) throw new Error('A code suggestion is required.');
  const id = makeId('suggestion');
  const identity = globalThis.AuthIdentity?.readSharedIdentity?.() || {};
  const record = {
    id,
    title: normalizeText(action.title, 160) || 'Operator suggestion',
    text,
    repo: normalizeRepo(action.repo),
    status: 'open',
    requestedBy: normalizeText(identity.alias || globalThis.localStorage?.getItem?.('alias'), 200) || 'guest',
    createdAt: new Date().toISOString(),
    source: 'portal-operator'
  };
  const writeResult = await writeGun(context.gun.get(FORGE_ROOT).get('forge').get('suggestions').get(id), record);
  return {
    message: writeResult?.pendingSync
      ? 'Saved locally. 3DVR Forge will sync this suggestion when the connection recovers.'
      : 'Saved as a 3DVR Forge suggestion.',
    url: forgeRecordUrl('suggestion', id),
    label: 'Forge suggestion'
  };
}

export async function queueCodeChange(action = {}) {
  const context = await getGunContext();
  if (!context) throw new Error('3DVR Forge is unavailable in this browser.');
  const repo = normalizeRepo(action.repo);
  const requestedChange = normalizeText(action.text);
  if (!requestedChange) throw new Error('A code change request is required.');
  const githubWriteRequested = GITHUB_WRITE_PATTERN.test(requestedChange);
  const id = makeId('operator-task');
  const task = [
    `Operator code request: ${requestedChange}`,
    'Make the smallest useful change in the working repository and run focused tests.',
    'Use an isolated branch or worktree when practical.',
    githubWriteRequested
      ? 'The signed request includes GitHub write intent. Preserve exactly the requested repository workflow.'
      : 'Keep repository changes local for review unless the signed request explicitly authorized a GitHub write.'
  ].join(' ');
  const proof = await signedPortalProof('operator-forge-task', 'queue-code-change', {
    taskId: id,
    repo,
    task,
    githubWriteRequested
  });
  if (!proof) throw new Error('Sign in with your 3DVR developer account before editing code.');

  const now = new Date().toISOString();
  const record = {
    id,
    title: normalizeText(action.title, 160) || 'Operator code edit',
    task,
    repo,
    backend: 'auto',
    githubWriteRequested,
    riskClass: githubWriteRequested ? 'external_write' : 'workspace_write',
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    requestedBy: 'portal-operator',
    requestedByAlias: proof.portalAlias || proof.authPub,
    resultSummary: '',
    error: '',
    authProof: encodeForgeProof(proof.authProof),
    authPub: proof.authPub
  };
  const writeResult = await writeGun(context.gun.get(FORGE_ROOT).get('forge').get('editRequests').get(id), record);
  return {
    message: writeResult?.pendingSync
      ? `Queued the approved ${repo} edit locally. Forge will sync it when the connection recovers.`
      : githubWriteRequested
        ? `Queued the signed owner GitHub edit for ${repo}.`
        : `Queued an approved developer edit for ${repo}.`,
    url: forgeRecordUrl('edit', id),
    label: 'Forge edit'
  };
}
