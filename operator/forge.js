const FORGE_ROOT = '3dvr-portal';
const PROOF_WAIT_MS = 900;
const WRITE_TIMEOUT_MS = 3500;
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

async function waitForSea(user) {
  const deadline = Date.now() + PROOF_WAIT_MS;
  while (Date.now() < deadline) {
    if (user?._?.sea && (user?.is?.pub || user._.sea.pub)) return user._.sea;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return user?._?.sea || null;
}

function writeGun(node, value) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('3DVR Forge sync timed out.'));
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
  const sea = await waitForSea(context.user);
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
  return {
    authPub: pub,
    authProof,
    portalAlias: alias,
    origin: payload.origin
  };
}

export async function createOperatorDeveloperProof() {
  return signedPortalProof('operator-developer-access', 'operator-chat');
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
  await writeGun(context.gun.get(FORGE_ROOT).get('forge').get('suggestions').get(id), record);
  return { message: 'Saved as a 3DVR Forge suggestion.' };
}

export async function queueCodeChange(action = {}) {
  const context = await getGunContext();
  if (!context) throw new Error('3DVR Forge is unavailable in this browser.');
  const repo = normalizeRepo(action.repo);
  const requestedChange = normalizeText(action.text);
  if (!requestedChange) throw new Error('A code change request is required.');
  const id = makeId('operator-task');
  const task = [
    `Operator code request: ${requestedChange}`,
    'Make the smallest useful change in the working repository.',
    'Use an isolated branch or worktree when practical, run focused tests, and keep the changes local for review.'
  ].join(' ');
  const proof = await signedPortalProof('operator-forge-task', 'queue-code-change', {
    taskId: id,
    repo,
    task
  });
  if (!proof) throw new Error('Sign in with your 3DVR developer account before editing code.');

  const now = new Date().toISOString();
  const record = {
    id,
    title: normalizeText(action.title, 160) || 'Operator code edit',
    task,
    repo,
    backend: 'auto',
    riskClass: 'workspace_write',
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    requestedBy: 'portal-operator',
    requestedByAlias: proof.portalAlias || proof.authPub,
    resultSummary: '',
    error: '',
    authProof: proof.authProof,
    authPub: proof.authPub
  };
  await writeGun(context.gun.get(FORGE_ROOT).get('forge').get('editRequests').get(id), record);
  return { message: `Queued an approved developer edit for ${repo}.` };
}
