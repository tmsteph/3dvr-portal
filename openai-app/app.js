const gun = Gun({ peers: window.__GUN_PEERS__ || undefined });
const user = gun.user();
const portalRoot = gun.get('3dvr-portal');
// Gun graph: 3dvr-portal/ai-workbench/<identityKey>/<resource>
const workbenchRoot = portalRoot.get('ai-workbench');
// Gun graph: 3dvr-portal/ai-workbench/defaults -> { apiKeyCipher, hint, updatedAt, updatedBy }
const defaultsNode = workbenchRoot.get('defaults');
// Gun graph: 3dvr-portal/ai-workbench/rate-limits/<YYYY-MM-DD>/<identityKey> ->
// { total, openai, vercel, github, updatedAt, tier }
const rateLimitsNode = workbenchRoot.get('rate-limits');
// Gun graph: 3dvr-portal/billing/usageTier/<identityKey> -> { tier, updatedAt, source }
const billingTierNode = portalRoot.get('billing').get('usageTier');

const storage = (() => {
  const memoryStore = {};

  function isUsable(store) {
    try {
      const testKey = '__storage-test__';
      store.setItem(testKey, 'ok');
      const ok = store.getItem(testKey) === 'ok';
      store.removeItem(testKey);
      return ok;
    } catch (error) {
      return false;
    }
  }

  const primary = isUsable(localStorage) ? localStorage : null;
  const secondary = isUsable(sessionStorage) ? sessionStorage : null;

  function setItem(key, value) {
    if (primary) {
      try {
        primary.setItem(key, value);
        return 'localStorage';
      } catch (error) {
        // fall through to secondary options
      }
    }

    if (secondary) {
      try {
        secondary.setItem(key, value);
        return 'sessionStorage';
      } catch (error) {
        // fall through to memory store
      }
    }

    memoryStore[key] = value;
    return 'memory';
  }

  function getItem(key) {
    if (primary) {
      try {
        const value = primary.getItem(key);
        if (value !== null) return value;
      } catch (error) {
        // fall through to secondary options
      }
    }

    if (secondary) {
      try {
        const value = secondary.getItem(key);
        if (value !== null) return value;
      } catch (error) {
        // fall through to memory store
      }
    }

    return memoryStore[key] || null;
  }

  function removeItem(key) {
    if (primary) {
      try {
        primary.removeItem(key);
      } catch (error) {
        // ignore
      }
    }

    if (secondary) {
      try {
        secondary.removeItem(key);
      } catch (error) {
        // ignore
      }
    }

    delete memoryStore[key];
  }

  function mode() {
    if (primary) return 'localStorage';
    if (secondary) return 'sessionStorage';
    return 'memory';
  }

  return { setItem, getItem, removeItem, mode };
})();

const transientStorage = (() => {
  const memoryStore = {};

  function isUsable(store) {
    try {
      const testKey = '__transient-storage-test__';
      store.setItem(testKey, 'ok');
      const ok = store.getItem(testKey) === 'ok';
      store.removeItem(testKey);
      return ok;
    } catch (error) {
      return false;
    }
  }

  const primary = isUsable(sessionStorage) ? sessionStorage : null;

  function setItem(key, value) {
    if (primary) {
      try {
        primary.setItem(key, value);
        return;
      } catch (error) {
        // fall through to memory store
      }
    }

    memoryStore[key] = value;
  }

  function getItem(key) {
    if (primary) {
      try {
        const value = primary.getItem(key);
        if (value !== null) return value;
      } catch (error) {
        // fall through to memory store
      }
    }

    return memoryStore[key] || null;
  }

  function removeItem(key) {
    if (primary) {
      try {
        primary.removeItem(key);
      } catch (error) {
        // ignore
      }
    }

    delete memoryStore[key];
  }

  return { setItem, getItem, removeItem };
})();

const apiKeyStorageKey = 'openai-api-key';
const vercelTokenStorageKey = 'vercel-token';
const githubTokenStorageKey = 'github-token';
const sessionKey = 'openai-workbench-session';
const vaultAutoEnabledKey = 'vault-auto-enabled';
const vaultRememberPassphraseKey = 'vault-remember-passphrase';
const vaultAutoAliasKey = 'vault-auto-alias';
const vaultAutoPassphraseKey = 'vault-auto-passphrase';
const vaultUseAccountAliasKey = 'vault-use-account-alias';
const vaultAutoLoadKey = 'vault-auto-load';
const lastStateStorageKey = 'openai-workbench-last-state';
const formStateStorageKey = 'openai-workbench-form-state';
const defaultPassphraseStorageKey = 'openai-workbench-default-passphrase';
const defaultRememberPassphraseKey = 'openai-workbench-default-remember';
const defaultAutoLoadKey = 'openai-workbench-default-auto-load';
const storedSession = storage.getItem(sessionKey);
let sessionId = storedSession || Gun.text.random();
storage.setItem(sessionKey, sessionId);
let identityKey = sessionId;
let transcriptNode = workbenchRoot.get(identityKey).get('transcripts');
let deploymentNode = workbenchRoot.get(identityKey).get('vercel');
let githubNode = workbenchRoot.get(identityKey).get('github');
let secretsNode = workbenchRoot.get(identityKey).get('secrets');
// Gun graph: ai/key-vault/<alias> -> { alias, updatedAt, targets: { <targetKey>: { cipher, updatedAt, target } } }
const keyVaultNode = gun.get('ai').get('key-vault');

const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key');
const clearKeyBtn = document.getElementById('clear-key');
const modelSelect = document.getElementById('model-select');
const messageInput = document.getElementById('message');
const outputBox = document.getElementById('output');
const historyList = document.getElementById('history');
const previewFrame = document.getElementById('response-preview');
const applyPreviewBtn = document.getElementById('apply-preview');
const submitBtn = document.getElementById('submit-btn');
const vercelTokenInput = document.getElementById('vercel-token');
const saveVercelBtn = document.getElementById('save-vercel');
const clearVercelBtn = document.getElementById('clear-vercel');
const projectInput = document.getElementById('vercel-project');
const deployNoteInput = document.getElementById('deploy-note');
const deployBtn = document.getElementById('deploy-btn');
const vercelStatus = document.getElementById('vercel-status');
const deploymentsList = document.getElementById('deployments');
const githubTokenInput = document.getElementById('github-token');
const saveGithubBtn = document.getElementById('save-github');
const clearGithubBtn = document.getElementById('clear-github');
const githubRepoInput = document.getElementById('github-repo');
const githubBranchInput = document.getElementById('github-branch');
const githubPathInput = document.getElementById('github-path');
const githubMessageInput = document.getElementById('github-message');
const githubBtn = document.getElementById('github-btn');
const githubStatus = document.getElementById('github-status');
const githubHistoryList = document.getElementById('github-history');
const createRepoBtn = document.getElementById('create-repo');
const repoStatus = document.getElementById('repo-create-status');
const repoOwnerRadios = document.querySelectorAll('input[name="repo-owner"]');
const repoOrgInput = document.getElementById('repo-org');
const repoNameInput = document.getElementById('repo-name');
const repoVisibilitySelect = document.getElementById('repo-visibility');
const repoDescriptionInput = document.getElementById('repo-description');
const repoReadmeCheckbox = document.getElementById('repo-readme');
const repoBranchCleanupCheckbox = document.getElementById('repo-branch-cleanup');
const storageModeNotice = document.getElementById('storage-mode');
const accountStatus = document.getElementById('account-status');
const vaultAliasInput = document.getElementById('vault-alias');
const vaultPassphraseInput = document.getElementById('vault-passphrase');
const vaultTargetSelect = document.getElementById('vault-target');
const vaultSaveBtn = document.getElementById('vault-save');
const vaultLoadBtn = document.getElementById('vault-load');
const vaultSaveAllBtn = document.getElementById('vault-save-all');
const vaultLoadAllBtn = document.getElementById('vault-load-all');
const vaultStatus = document.getElementById('vault-status');
const vaultAutoSyncToggle = document.getElementById('vault-auto-sync');
const vaultRememberPassphraseToggle = document.getElementById('vault-remember-passphrase');
const vaultAccountAliasToggle = document.getElementById('vault-use-account-alias');
const vaultAutoLoadToggle = document.getElementById('vault-auto-load');
const vaultAutoStatus = document.getElementById('vault-auto-status');
const defaultPassphraseInput = document.getElementById('default-passphrase');
const loadDefaultBtn = document.getElementById('load-default');
const defaultKeyStatus = document.getElementById('default-key-status');
const defaultRememberPassphraseToggle = document.getElementById('default-remember-passphrase');
const defaultAutoLoadToggle = document.getElementById('default-auto-load');
const defaultsStatusList = document.getElementById('defaults-status');
const sharedUsageStatus = document.getElementById('shared-usage-status');

const systemPrompt = [
  'You are the 3dvr portal co-pilot.',
  'Suggest concise, actionable edits.',
  'When providing HTML/CSS/JS, keep it minimal and ready for copy/paste.'
].join(' ');

const developerPrompt = [
  'Always respond with a complete, self-contained HTML document.',
  'Include inline styling when needed so the page previews correctly without extra assets.',
  'Avoid Markdown or plaintext summaries—return production-ready HTML only.',
  'The response will be rendered live, so structure it for immediate display in the preview iframe.'
].join(' ');

let currentDefaultConfig = {};
let subscriptionVersion = 0;
let accountAlias = '';
const demoState = {
  prompt: 'Create a simple landing page for a VR coworking lounge with a hero, feature list, and contact button.',
  response: [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    "  <meta charset=\"UTF-8\">",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    '  <title>VR Lounge</title>',
    '  <style>',
    "    body{font-family:'Inter',sans-serif;background:#0b1224;color:#f4f6fb;margin:0;padding:32px;}",
    '    .shell{max-width:960px;margin:0 auto;}',
    '    .hero{display:grid;gap:16px;align-items:center;grid-template-columns:1fr;}',
    '    @media (min-width: 720px){.hero{grid-template-columns:1.2fr 0.8fr;}}',
    '    h1{font-size:2.5rem;margin:0 0 8px;}',
    '    p{margin:0 0 12px;line-height:1.6;}',
    '    .card{background:#0f1830;border:1px solid #1e2a4a;border-radius:16px;padding:20px;}',
    '    .pill{display:inline-block;padding:8px 12px;background:#182544;border-radius:999px;font-size:0.85rem;}',
    '    .btn{display:inline-flex;align-items:center;gap:8px;',
    '      padding:12px 18px;border-radius:10px;border:none;}',
    '    .btn{background:linear-gradient(120deg,#5ca0d3,#7a5bd2);color:white;font-weight:600;cursor:pointer;}',
    '    ul{list-style:none;padding:0;margin:0;display:grid;gap:10px;}',
    '    li{display:flex;align-items:flex-start;gap:10px;}',
    '    .dot{width:10px;height:10px;border-radius:50%;background:#7a5bd2;margin-top:8px;}',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="shell">',
    '    <div class="pill">Live demo defaults</div>',
    '    <section class="hero">',
    '      <div>',
    '        <h1>Build and ship VR-ready sites faster</h1>',
    '        <p>Use the workbench to tweak copy, preview layouts, and deploy with a single click.</p>',
    '        <button class="btn">Launch workspace</button>',
    '      </div>',
    '      <div class="card">',
    '        <h3>What you get</h3>',
    '        <ul>',
    '          <li><span class="dot"></span><div>Live preview updates as you chat with the model.</div></li>',
    '          <li><span class="dot"></span><div>Deploy to your own Vercel project once you add a token.</div></li>',
    '          <li><span class="dot"></span><div>Commit HTML changes directly to GitHub.</div></li>',
    '        </ul>',
    '      </div>',
    '    </section>',
    '  </div>',
    '</body>',
    '</html>'
  ].join(''),
  model: 'gpt-4o'
};

const SHARED_USAGE_LIMITS = {
  guest: 2,
  account: 5,
  supporter: 20,
  pro: 100
};

const TIER_LABELS = {
  guest: 'guest',
  account: 'account',
  supporter: '$5 supporter',
  pro: '$20 pro'
};

const defaultSecrets = {
  openai: '',
  vercel: '',
  github: ''
};

const DEFAULT_CIPHERS = {
  openai: ['apiKeyCipher', 'openaiCipher'],
  vercel: ['vercelTokenCipher'],
  github: ['githubTokenCipher']
};

const sharedKeyUsage = {
  openai: false,
  vercel: false,
  github: false
};

let currentUsageTier = '';
let sharedUsageCounts = {
  total: 0,
  openai: 0,
  vercel: 0,
  github: 0
};
let usageDateKey = '';
let usageSubscription = null;
let tierSubscription = null;

const defaultFormState = {
  vercelProject: 'vr-lounge-demo',
  deployNote: 'Initial live demo from defaults',
  githubRepo: 'demo/vr-workbench-sample',
  githubBranch: 'main',
  githubPath: 'index.html',
  githubMessage: 'feat: add demo landing page',
  repoOwner: 'user',
  repoOrg: '',
  repoName: '',
  repoVisibility: 'public',
  repoDescription: '',
  repoReadme: true,
  repoBranchCleanup: true
};

function sanitizeResponseContent(content) {
  if (!content) return '';

  let cleaned = content.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, '');
    cleaned = cleaned.replace(/```\s*$/, '');
  }

  if (cleaned.startsWith('"""')) {
    cleaned = cleaned.replace(/^"""\s*/, '');
    cleaned = cleaned.replace(/"""\s*$/, '');
  }

  return cleaned.trim();
}

function parseStoredJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeTier(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (['guest', 'account', 'supporter', 'pro'].includes(normalized)) {
    return normalized;
  }
  if (normalized === 'supporter5' || normalized === 'supporter-5') {
    return 'supporter';
  }
  if (normalized === 'pro20' || normalized === 'pro-20') {
    return 'pro';
  }
  return '';
}

function resolveUsageTier() {
  const stored = normalizeTier(storage.getItem('openai-workbench-tier'));
  if (stored) return stored;
  const normalized = normalizeTier(currentUsageTier);
  if (normalized) return normalized;
  return user?.is ? 'account' : 'guest';
}

function normalizeUsageRecord(record) {
  if (!record) {
    return {
      total: 0,
      openai: 0,
      vercel: 0,
      github: 0
    };
  }
  return {
    total: Number(record.total) || 0,
    openai: Number(record.openai) || 0,
    vercel: Number(record.vercel) || 0,
    github: Number(record.github) || 0,
    updatedAt: record.updatedAt || Date.now(),
    tier: normalizeTier(record.tier) || resolveUsageTier()
  };
}

function usingAnySharedKey() {
  return sharedKeyUsage.openai || sharedKeyUsage.vercel || sharedKeyUsage.github;
}

function updateSharedUsageStatus(message) {
  if (!sharedUsageStatus) return;

  if (message) {
    sharedUsageStatus.textContent = message;
    return;
  }

  if (!usingAnySharedKey()) {
    sharedUsageStatus.textContent = 'Using personal tokens; shared limits are idle.';
    return;
  }

  const tier = resolveUsageTier();
  const limit = SHARED_USAGE_LIMITS[tier] || SHARED_USAGE_LIMITS.account;
  const used = sharedUsageCounts.total || 0;
  const label = TIER_LABELS[tier] || tier;

  sharedUsageStatus.textContent = `Shared key usage: ${used}/${limit} today (${label}). Resets daily.`;
}

function refreshSharedKeyUsage(targetKey, value) {
  if (!targetKey || !(targetKey in sharedKeyUsage)) return;
  const trimmed = (value || '').trim();
  sharedKeyUsage[targetKey] = Boolean(trimmed && trimmed === defaultSecrets[targetKey]);
  updateSharedUsageStatus();
  updateDefaultsStatusList();
}

function resolveDefaultCipher(targetKey) {
  const fields = DEFAULT_CIPHERS[targetKey] || [];
  for (const field of fields) {
    if (currentDefaultConfig[field]) return currentDefaultConfig[field];
  }
  return null;
}

function detachUsageSubscription() {
  try {
    usageSubscription?.off?.();
  } catch (error) {
    console.warn('Failed to detach usage listener', error);
  }
  usageSubscription = null;
}

function subscribeToUsageCounters() {
  detachUsageSubscription();
  usageDateKey = getTodayKey();
  usageSubscription = rateLimitsNode.get(usageDateKey).get(identityKey);
  usageSubscription.on(data => {
    sharedUsageCounts = normalizeUsageRecord(data);
    updateSharedUsageStatus();
  });
}

function ensureUsageSubscription() {
  const todayKey = getTodayKey();
  if (usageDateKey !== todayKey || !usageSubscription) {
    subscribeToUsageCounters();
  }
}

function detachTierSubscription() {
  try {
    tierSubscription?.off?.();
  } catch (error) {
    console.warn('Failed to detach tier listener', error);
  }
  tierSubscription = null;
}

function subscribeToBillingTier() {
  detachTierSubscription();
  currentUsageTier = normalizeTier(storage.getItem('openai-workbench-tier'));
  tierSubscription = billingTierNode.get(identityKey);
  tierSubscription.on(data => {
    const nextTier = normalizeTier(data?.tier || data?.plan || data);
    if (nextTier) {
      currentUsageTier = nextTier;
    }
    updateSharedUsageStatus();
  });
}

function resetUsageTracking() {
  sharedUsageCounts = {
    total: 0,
    openai: 0,
    vercel: 0,
    github: 0
  };
  updateSharedUsageStatus();
  subscribeToUsageCounters();
  subscribeToBillingTier();
}

function getSharedLimit() {
  const tier = resolveUsageTier();
  return SHARED_USAGE_LIMITS[tier] || SHARED_USAGE_LIMITS.account;
}

function sharedLimitMessage() {
  const tier = resolveUsageTier();
  const used = sharedUsageCounts.total || 0;
  const limit = getSharedLimit();
  const label = TIER_LABELS[tier] || tier;
  return `Shared key limit reached: ${used}/${limit} used today for the ${label} tier.`;
}

function canUseSharedKey(action) {
  if (!sharedKeyUsage[action]) return true;

  ensureUsageSubscription();
  const limit = getSharedLimit();
  const used = sharedUsageCounts.total || 0;

  if (used >= limit) {
    updateSharedUsageStatus();
    return false;
  }

  const nextCounts = {
    ...sharedUsageCounts,
    total: used + 1,
    updatedAt: Date.now(),
    tier: resolveUsageTier()
  };
  nextCounts[action] = (nextCounts[action] || 0) + 1;

  sharedUsageCounts = nextCounts;
  rateLimitsNode.get(usageDateKey).get(identityKey).put(nextCounts);
  updateSharedUsageStatus();
  return true;
}

function persistLastState({ prompt, response, model }) {
  const payload = {
    prompt: prompt || '',
    response: response || '',
    model: model || 'gpt-4o',
    updatedAt: Date.now()
  };
  storage.setItem(lastStateStorageKey, JSON.stringify(payload));
}

function applyDemoState() {
  if (modelSelect) {
    modelSelect.value = demoState.model;
  }
  if (messageInput) {
    messageInput.value = demoState.prompt;
  }
  if (outputBox) {
    outputBox.textContent = sanitizeResponseContent(demoState.response);
  }
  applyPreview(demoState.response);
  persistLastState(demoState);
}

function hydrateLastState() {
  const stored = parseStoredJson(storage.getItem(lastStateStorageKey));
  if (stored?.prompt || stored?.response) {
    if (modelSelect && stored.model) {
      modelSelect.value = stored.model;
    }
    if (messageInput && stored.prompt) {
      messageInput.value = stored.prompt;
    }
    if (outputBox && stored.response) {
      outputBox.textContent = sanitizeResponseContent(stored.response);
      applyPreview(stored.response);
    }
    return;
  }

  applyDemoState();
}

function persistFormState() {
  const repoOwner = document.querySelector('input[name="repo-owner"]:checked')?.value || 'user';
  const payload = {
    vercelProject: projectInput?.value?.trim() || '',
    deployNote: deployNoteInput?.value?.trim() || '',
    githubRepo: githubRepoInput?.value?.trim() || '',
    githubBranch: githubBranchInput?.value?.trim() || '',
    githubPath: githubPathInput?.value?.trim() || '',
    githubMessage: githubMessageInput?.value?.trim() || '',
    repoOwner,
    repoOrg: repoOrgInput?.value?.trim() || '',
    repoName: repoNameInput?.value?.trim() || '',
    repoVisibility: repoVisibilitySelect?.value || 'public',
    repoDescription: repoDescriptionInput?.value?.trim() || '',
    repoReadme: repoReadmeCheckbox?.checked ?? true,
    repoBranchCleanup: repoBranchCleanupCheckbox?.checked ?? true
  };
  storage.setItem(formStateStorageKey, JSON.stringify(payload));
}

function hydrateFormState() {
  const stored = parseStoredJson(storage.getItem(formStateStorageKey));
  const state = stored || defaultFormState;

  if (projectInput && state.vercelProject) {
    projectInput.value = state.vercelProject;
  }
  if (deployNoteInput && state.deployNote) {
    deployNoteInput.value = state.deployNote;
  }
  if (githubRepoInput && state.githubRepo) {
    githubRepoInput.value = state.githubRepo;
  }
  if (githubBranchInput && state.githubBranch) {
    githubBranchInput.value = state.githubBranch;
  }
  if (githubPathInput && state.githubPath) {
    githubPathInput.value = state.githubPath;
  }
  if (githubMessageInput && state.githubMessage) {
    githubMessageInput.value = state.githubMessage;
  }
  if (repoNameInput && state.repoName) {
    repoNameInput.value = state.repoName;
  }
  if (repoOrgInput && state.repoOrg) {
    repoOrgInput.value = state.repoOrg;
  }
  if (repoVisibilitySelect && state.repoVisibility) {
    repoVisibilitySelect.value = state.repoVisibility;
  }
  if (repoDescriptionInput && state.repoDescription) {
    repoDescriptionInput.value = state.repoDescription;
  }
  if (repoReadmeCheckbox) {
    repoReadmeCheckbox.checked = state.repoReadme ?? true;
  }
  if (repoBranchCleanupCheckbox) {
    repoBranchCleanupCheckbox.checked = state.repoBranchCleanup ?? true;
  }
  if (repoOwnerRadios?.length && state.repoOwner) {
    repoOwnerRadios.forEach((radio) => {
      radio.checked = radio.value === state.repoOwner;
    });
  }
  toggleRepoOrgField();

  if (!stored) {
    persistFormState();
  }
}
const vaultTargets = {
  openai: {
    label: 'OpenAI API key',
    input: apiKeyInput,
    storageKey: apiKeyStorageKey,
    accountField: 'openaiApiKey',
  },
  vercel: {
    label: 'Vercel token',
    input: vercelTokenInput,
    storageKey: vercelTokenStorageKey,
    accountField: 'vercelToken',
  },
  github: {
    label: 'GitHub token',
    input: githubTokenInput,
    storageKey: githubTokenStorageKey,
    accountField: 'githubToken',
  }
};

function updateAccountStatus(message) {
  if (accountStatus) {
    accountStatus.textContent = message;
  }
}

function setIdentityScope(key) {
  if (!key || key === identityKey) return;

  identityKey = key;
  transcriptNode = workbenchRoot.get(identityKey).get('transcripts');
  deploymentNode = workbenchRoot.get(identityKey).get('vercel');
  githubNode = workbenchRoot.get(identityKey).get('github');
  secretsNode = workbenchRoot.get(identityKey).get('secrets');
  subscriptionVersion += 1;
  historyList.innerHTML = '';
  deploymentsList.innerHTML = '';
  githubHistoryList.innerHTML = '';
  startHistorySubscription();
  startDeploymentSubscription();
  startGithubSubscription();
  resetUsageTracking();
  hydrateAccountSecrets();
}

function recallUserSession() {
  try {
    user.recall({ sessionStorage: true, localStorage: true });
  } catch (error) {
    updateAccountStatus('Unable to recall session.');
  }
}

function attemptStoredAuth() {
  const storedAlias = (localStorage.getItem('alias') || '').trim();
  const storedPassword = (localStorage.getItem('password') || '').trim();

  if (!storedAlias || !storedPassword) {
    updateAccountStatus('Not signed in. Keys stay with this device until you connect your account.');
    return;
  }

  updateAccountStatus(`Signing in as ${storedAlias}...`);
  user.auth(storedAlias, storedPassword, ack => {
    if (ack?.err) {
      updateAccountStatus('Sign-in failed. Keys remain device-local.');
      return;
    }
    setIdentityScope(user?.is?.pub || identityKey);
    updateAccountStatus(`Synced to ${storedAlias}. Secrets will follow you across browsers.`);
  });
}

function updateStorageModeNotice(context) {
  if (!storageModeNotice) return;

  const mode = storage.mode();
  if (mode === 'localStorage') {
    storageModeNotice.textContent = context || 'Keys save to your Gun account when signed in; otherwise they persist in localStorage on this device.';
    return;
  }

  if (mode === 'sessionStorage') {
    storageModeNotice.textContent = context || 'Signed-in users sync to Gun; otherwise keys sit in sessionStorage until the tab closes.';
    return;
  }

  storageModeNotice.textContent = context || 'Storage is blocked. Keys remain for this page load unless you sign in so Gun can hold them for you.';
}

function setDefaultKeyStatus(message) {
  if (defaultKeyStatus) {
    defaultKeyStatus.textContent = message;
  }
}

function updateDefaultsStatusList() {
  if (!defaultsStatusList) return;

  const entries = [
    {
      key: 'openai',
      label: 'OpenAI',
      input: apiKeyInput,
      available: !!resolveDefaultCipher('openai')
    },
    {
      key: 'vercel',
      label: 'Vercel',
      input: vercelTokenInput,
      available: !!resolveDefaultCipher('vercel')
    },
    {
      key: 'github',
      label: 'GitHub',
      input: githubTokenInput,
      available: !!resolveDefaultCipher('github')
    }
  ];

  defaultsStatusList.innerHTML = '';

  entries.forEach((entry) => {
    const currentValue = entry.input?.value?.trim() || '';
    const isApplied = entry.available && defaultSecrets[entry.key]
      && currentValue
      && currentValue === defaultSecrets[entry.key];
    const status = entry.available ? (isApplied ? 'Applied' : 'Ready') : 'Missing';
    const tone = entry.available ? (isApplied ? 'applied' : 'ready') : 'missing';

    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = entry.label;
    const badge = document.createElement('span');
    badge.className = `status-badge ${tone}`;
    badge.textContent = status;
    item.append(label, badge);
    defaultsStatusList.appendChild(item);
  });
}

function hasAnyStoredSecret() {
  return [apiKeyInput, vercelTokenInput, githubTokenInput]
    .some((input) => Boolean(input?.value?.trim()));
}

function saveDefaultPreferences() {
  const remember = !!defaultRememberPassphraseToggle?.checked;
  const autoLoad = !!defaultAutoLoadToggle?.checked;
  const passphrase = defaultPassphraseInput?.value?.trim() || '';

  storage.setItem(defaultRememberPassphraseKey, remember ? 'true' : 'false');
  storage.setItem(defaultAutoLoadKey, autoLoad ? 'true' : 'false');

  if (remember && passphrase) {
    transientStorage.setItem(defaultPassphraseStorageKey, passphrase);
  } else {
    transientStorage.removeItem(defaultPassphraseStorageKey);
  }
}

function restoreDefaultPreferences() {
  const remember = storage.getItem(defaultRememberPassphraseKey) === 'true';
  const autoLoad = storage.getItem(defaultAutoLoadKey) === 'true';
  const storedPassphrase = remember ? transientStorage.getItem(defaultPassphraseStorageKey) || '' : '';

  if (defaultRememberPassphraseToggle) {
    defaultRememberPassphraseToggle.checked = remember;
  }

  if (defaultAutoLoadToggle) {
    defaultAutoLoadToggle.checked = autoLoad;
  }

  if (defaultPassphraseInput && storedPassphrase) {
    defaultPassphraseInput.value = storedPassphrase;
  }
}

async function maybeAutoLoadDefaults() {
  if (defaultAutoLoadToggle?.checked !== true) return;
  if (hasAnyStoredSecret()) return;
  const passphrase = defaultPassphraseInput?.value?.trim();
  if (!passphrase) return;

  const hasAnyDefault = resolveDefaultCipher('openai')
    || resolveDefaultCipher('vercel')
    || resolveDefaultCipher('github');
  if (!hasAnyDefault) return;

  await loadDefaultKey();
}

async function saveSecretToAccount(field, value) {
  if (!user?.is || !user?._?.sea) {
    updateAccountStatus('Sign in to sync secrets with your Gun account.');
    return false;
  }

  if (!value) {
    return removeAccountSecret(field);
  }

  try {
    const cipher = await Gun.SEA.encrypt(value, user._.sea);
    return new Promise(resolve => {
      secretsNode.get(field).put({ cipher, updatedAt: Date.now() }, ack => {
        if (ack?.err) {
          updateAccountStatus('Unable to sync with Gun right now.');
          resolve(false);
          return;
        }
        updateAccountStatus('Saved to your Gun account.');
        resolve(true);
      });
    });
  } catch (error) {
    updateAccountStatus('Encryption failed. Refresh and try again.');
    return false;
  }
}

function removeAccountSecret(field) {
  if (!user?.is) return false;

  return new Promise(resolve => {
    secretsNode.get(field).put(null, () => resolve(true));
  });
}

function fetchAccountSecret(field) {
  return new Promise(resolve => {
    secretsNode.get(field).once(async data => {
      if (!data?.cipher || !user?._?.sea) {
        resolve(null);
        return;
      }

      try {
        const decrypted = await Gun.SEA.decrypt(data.cipher, user._.sea);
        resolve(typeof decrypted === 'string' ? decrypted : null);
      } catch (error) {
        resolve(null);
      }
    });
  });
}

async function hydrateAccountSecrets() {
  if (!user?.is) return;

  const [apiKey, vercelToken, githubToken] = await Promise.all([
    fetchAccountSecret('openaiApiKey'),
    fetchAccountSecret('vercelToken'),
    fetchAccountSecret('githubToken')
  ]);

  if (apiKey) {
    apiKeyInput.value = apiKey;
    storage.setItem(apiKeyStorageKey, apiKey);
    updateStorageModeNotice('OpenAI key loaded from your Gun account.');
    refreshSharedKeyUsage('openai', apiKey);
  }

  if (vercelToken) {
    vercelTokenInput.value = vercelToken;
    storage.setItem(vercelTokenStorageKey, vercelToken);
    refreshSharedKeyUsage('vercel', vercelToken);
  }

  if (githubToken) {
    githubTokenInput.value = githubToken;
    storage.setItem(githubTokenStorageKey, githubToken);
    refreshSharedKeyUsage('github', githubToken);
  }

  if (apiKey || vercelToken || githubToken) {
    updateAccountStatus('Secrets restored from your Gun account.');
  }
}

async function syncCachedSecretsToAccount() {
  if (!user?.is || !user?._?.sea) return;

  const cachedApiKey = (storage.getItem(apiKeyStorageKey) || '').trim();
  const cachedVercel = (storage.getItem(vercelTokenStorageKey) || '').trim();
  const cachedGithub = (storage.getItem(githubTokenStorageKey) || '').trim();

  if (!cachedApiKey && !cachedVercel && !cachedGithub) return;

  const [accountApiKey, accountVercel, accountGithub] = await Promise.all([
    fetchAccountSecret('openaiApiKey'),
    fetchAccountSecret('vercelToken'),
    fetchAccountSecret('githubToken')
  ]);

  const synced = [];

  if (!accountApiKey && cachedApiKey) {
    const saved = await saveSecretToAccount('openaiApiKey', cachedApiKey);
    if (saved) synced.push('OpenAI');
  }

  if (!accountVercel && cachedVercel) {
    const saved = await saveSecretToAccount('vercelToken', cachedVercel);
    if (saved) synced.push('Vercel');
  }

  if (!accountGithub && cachedGithub) {
    const saved = await saveSecretToAccount('githubToken', cachedGithub);
    if (saved) synced.push('GitHub');
  }

  if (synced.length) {
    updateAccountStatus(`${synced.join(', ')} synced to your Gun account from this device.`);
  }
}

function subscribeToDefaults() {
  defaultsNode.on(data => {
    currentDefaultConfig = data || {};
    const available = [];
    if (resolveDefaultCipher('openai')) available.push('OpenAI');
    if (resolveDefaultCipher('vercel')) available.push('Vercel');
    if (resolveDefaultCipher('github')) available.push('GitHub');
    if (!resolveDefaultCipher('openai')) {
      defaultSecrets.openai = '';
      refreshSharedKeyUsage('openai', apiKeyInput?.value);
    }
    if (!resolveDefaultCipher('vercel')) {
      defaultSecrets.vercel = '';
      refreshSharedKeyUsage('vercel', vercelTokenInput?.value);
    }
    if (!resolveDefaultCipher('github')) {
      defaultSecrets.github = '';
      refreshSharedKeyUsage('github', githubTokenInput?.value);
    }
    if (!available.length) {
      setDefaultKeyStatus('No admin defaults configured yet.');
      updateDefaultsStatusList();
      return;
    }
    const hint = currentDefaultConfig.hint
      ? `Hint: ${currentDefaultConfig.hint}`
      : 'Ask an admin for the passphrase to unlock shared keys.';
    setDefaultKeyStatus(`${available.join(', ')} defaults ready. ${hint}`);
    updateDefaultsStatusList();
    maybeAutoLoadDefaults();
  });
}

async function loadDefaultKey() {
  const hasAnyDefault = resolveDefaultCipher('openai')
    || resolveDefaultCipher('vercel')
    || resolveDefaultCipher('github');

  if (!hasAnyDefault) {
    setDefaultKeyStatus('No default key available yet.');
    return;
  }

  const passphrase = (defaultPassphraseInput?.value || '').trim();
  if (!passphrase) {
    setDefaultKeyStatus('Enter the passphrase to unlock the admin default key.');
    return;
  }

  saveDefaultPreferences();

  try {
    const applied = [];

    const apiKeyCipher = resolveDefaultCipher('openai');
    if (apiKeyCipher) {
      const decrypted = await Gun.SEA.decrypt(apiKeyCipher, passphrase);
      if (decrypted) {
        apiKeyInput.value = decrypted;
        storage.setItem(apiKeyStorageKey, decrypted);
        defaultSecrets.openai = decrypted;
        refreshSharedKeyUsage('openai', decrypted);
        await saveSecretToAccount('openaiApiKey', decrypted);
        autoSyncSecret('openai', decrypted);
        applied.push('OpenAI');
      }
    }

    const vercelCipher = resolveDefaultCipher('vercel');
    if (vercelCipher) {
      const decrypted = await Gun.SEA.decrypt(vercelCipher, passphrase);
      if (decrypted) {
        vercelTokenInput.value = decrypted;
        storage.setItem(vercelTokenStorageKey, decrypted);
        defaultSecrets.vercel = decrypted;
        refreshSharedKeyUsage('vercel', decrypted);
        await saveSecretToAccount('vercelToken', decrypted);
        autoSyncSecret('vercel', decrypted);
        applied.push('Vercel');
      }
    }

    const githubCipher = resolveDefaultCipher('github');
    if (githubCipher) {
      const decrypted = await Gun.SEA.decrypt(githubCipher, passphrase);
      if (decrypted) {
        githubTokenInput.value = decrypted;
        storage.setItem(githubTokenStorageKey, decrypted);
        defaultSecrets.github = decrypted;
        refreshSharedKeyUsage('github', decrypted);
        await saveSecretToAccount('githubToken', decrypted);
        autoSyncSecret('github', decrypted);
        applied.push('GitHub');
      }
    }

    if (!applied.length) {
      setDefaultKeyStatus('Passphrase incorrect. Try again.');
      return;
    }

    updateStorageModeNotice('Loaded admin defaults.');
    setDefaultKeyStatus(`Defaults applied: ${applied.join(', ')}. Shared rate limits are active when using these keys.`);
    updateSharedUsageStatus();
    updateDefaultsStatusList();
  } catch (error) {
    setDefaultKeyStatus('Unable to decrypt the default key.');
  }
}

function setVaultStatus(message) {
  if (vaultStatus) {
    vaultStatus.textContent = message;
  }
}

function setVaultAutoStatus(message) {
  if (vaultAutoStatus) {
    vaultAutoStatus.textContent = message;
  }
}

function getVaultTargetConfig(targetKey) {
  if (vaultTargets[targetKey]) {
    return { key: targetKey, ...vaultTargets[targetKey] };
  }
  return { key: 'openai', ...vaultTargets.openai };
}

function getSelectedVaultTarget() {
  const selected = vaultTargetSelect?.value || 'openai';
  return getVaultTargetConfig(selected);
}

function updateVaultAutoStatus(message) {
  if (!vaultAutoStatus) return;

  if (message) {
    setVaultAutoStatus(message);
    return;
  }

  const alias = sanitizeVaultAlias(vaultAliasInput?.value?.trim());
  const hasPassphrase = !!(vaultPassphraseInput?.value || '').trim();

  if (vaultAutoSyncToggle?.checked) {
    if (!alias) {
      setVaultAutoStatus('Set a vault label to auto-sync secrets across devices.');
      return;
    }
    if (!hasPassphrase) {
      setVaultAutoStatus('Add a passphrase to encrypt secrets before auto-syncing.');
      return;
    }
    setVaultAutoStatus('Auto-sync is on. Secrets encrypt locally after you save them.');
    return;
  }

  setVaultAutoStatus('Enable auto-sync to push encrypted secrets to Gun after saving.');
}

function saveAutoVaultPreferences() {
  const alias = sanitizeVaultAlias(vaultAliasInput?.value?.trim());
  const autoEnabled = !!vaultAutoSyncToggle?.checked;
  const rememberPassphrase = !!vaultRememberPassphraseToggle?.checked;
  const useAccountAlias = vaultAccountAliasToggle?.checked !== false;
  const autoLoad = vaultAutoLoadToggle?.checked !== false;
  const passphrase = vaultPassphraseInput?.value || '';

  storage.setItem(vaultAutoAliasKey, alias || '');
  storage.setItem(vaultAutoEnabledKey, autoEnabled ? 'true' : 'false');
  storage.setItem(vaultRememberPassphraseKey, rememberPassphrase ? 'true' : 'false');
  storage.setItem(vaultUseAccountAliasKey, useAccountAlias ? 'true' : 'false');
  storage.setItem(vaultAutoLoadKey, autoLoad ? 'true' : 'false');

  if (rememberPassphrase && passphrase) {
    storage.setItem(vaultAutoPassphraseKey, passphrase);
  } else {
    storage.removeItem(vaultAutoPassphraseKey);
  }
}

function restoreAutoVaultPreferences() {
  const savedAlias = storage.getItem(vaultAutoAliasKey) || '';
  const savedAutoEnabled = storage.getItem(vaultAutoEnabledKey) === 'true';
  const savedRemember = storage.getItem(vaultRememberPassphraseKey) === 'true';
  const savedUseAccountAlias = storage.getItem(vaultUseAccountAliasKey);
  const savedAutoLoad = storage.getItem(vaultAutoLoadKey);
  const savedPassphrase = savedRemember ? storage.getItem(vaultAutoPassphraseKey) || '' : '';

  if (vaultAliasInput && savedAlias) {
    vaultAliasInput.value = savedAlias;
  }

  if (vaultAutoSyncToggle) {
    vaultAutoSyncToggle.checked = savedAutoEnabled;
  }

  if (vaultRememberPassphraseToggle) {
    vaultRememberPassphraseToggle.checked = savedRemember;
  }

  if (vaultAccountAliasToggle) {
    vaultAccountAliasToggle.checked = savedUseAccountAlias !== 'false';
  }

  if (vaultAutoLoadToggle) {
    vaultAutoLoadToggle.checked = savedAutoLoad !== 'false';
  }

  if (vaultPassphraseInput && savedPassphrase) {
    vaultPassphraseInput.value = savedPassphrase;
  }

  updateVaultAutoStatus();
}

function applyAccountAliasToVault() {
  if (!accountAlias || !vaultAliasInput) return;
  if (vaultAccountAliasToggle?.checked === false) return;

  vaultAliasInput.value = accountAlias;
  saveAutoVaultPreferences();
  updateVaultAutoStatus();
}

async function autoLoadVaultForAccount({ silent = true } = {}) {
  if (vaultAutoLoadToggle?.checked === false) return;

  const alias = sanitizeVaultAlias(vaultAliasInput?.value?.trim()) || accountAlias;
  const passphrase = vaultPassphraseInput?.value || '';

  if (!alias) return;

  if (!passphrase) {
    if (!silent) {
      setVaultAutoStatus('Add your vault passphrase to load secrets tied to your username.');
    }
    return;
  }

  const selectedTarget = getSelectedVaultTarget();
  const loaded = await loadVaultSecret({
    alias,
    passphrase,
    targetKey: selectedTarget.key,
    silent,
  });

  if (loaded && !silent) {
    setVaultAutoStatus(`${selectedTarget.label} loaded using your username vault.`);
  }
}

function setAccountAlias(value) {
  accountAlias = sanitizeVaultAlias(value);
  if (accountAlias) {
    applyAccountAliasToVault();
  }
}

function sanitizeVaultAlias(input) {
  return (input || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 64);
}

function loadStoredKey() {
  const stored = storage.getItem(apiKeyStorageKey);
  if (stored) {
    apiKeyInput.value = stored;
    refreshSharedKeyUsage('openai', stored);
  }
}

function getVaultableSecrets() {
  const secrets = {};
  Object.entries(vaultTargets).forEach(([targetKey, details]) => {
    const value = details.input?.value?.trim();
    if (value) {
      secrets[targetKey] = value;
    }
  });
  return secrets;
}

function normalizeVaultTarget(targetKey) {
  if (!targetKey) return null;
  const key = targetKey.toLowerCase();
  if (vaultTargets[key]) return key;
  if (['apikey', 'openaiapikey', 'openai_api_key'].includes(key)) return 'openai';
  return null;
}

// Keep vault records target-scoped so saving one secret never wipes another.
function buildVaultTargetMap(record) {
  const targets = {};
  const storedTargets = record?.targets && typeof record.targets === 'object' ? record.targets : {};

  Object.entries(storedTargets).forEach(([targetKey, entry]) => {
    const normalizedTarget = normalizeVaultTarget(targetKey);
    if (entry?.cipher && normalizedTarget) {
      targets[normalizedTarget] = {
        cipher: entry.cipher,
        updatedAt: entry.updatedAt || record?.updatedAt,
        target: entry.target || normalizedTarget,
      };
    }
  });

  if (!Object.keys(targets).length && record?.cipher) {
    const targetKey = normalizeVaultTarget(record.target) || 'openai';
    targets[targetKey] = {
      cipher: record.cipher,
      updatedAt: record.updatedAt,
      target: targetKey,
    };
  }

  return targets;
}

async function putVaultEntries(alias, passphrase, secretsByTarget) {
  if (!Gun.SEA || typeof Gun.SEA.encrypt !== 'function') {
    throw new Error('Gun SEA not available. Refresh and try again.');
  }

  const secrets = Object.entries(secretsByTarget || {}).filter(([, value]) => !!value);
  if (!secrets.length) {
    throw new Error('No secrets to store.');
  }

  const now = Date.now();
  // Merge with any prior targets so vault saves never overwrite sibling secrets.
  const existing = await fetchVaultRecord(alias);
  const targets = buildVaultTargetMap(existing);

  const encryptedEntries = await Promise.all(secrets.map(async ([targetKey, secretValue]) => {
    const cipher = await Gun.SEA.encrypt(secretValue, passphrase);
    return [targetKey, { cipher, updatedAt: now, target: targetKey }];
  }));

  encryptedEntries.forEach(([targetKey, payload]) => {
    targets[targetKey] = payload;
  });

  const record = { alias, targets, updatedAt: now };

  return new Promise((resolve, reject) => {
    keyVaultNode.get(alias).put(record, ack => {
      if (ack?.err) {
        reject(new Error(ack.err));
        return;
      }
      resolve(record);
    });
  });
}

async function putVaultRecord(alias, passphrase, targetKey, secretValue) {
  return putVaultEntries(alias, passphrase, { [targetKey]: secretValue });
}

function applyVaultTargetValue(targetKey, secretValue, { silent = false, skipSelect = false } = {}) {
  const vaultTarget = getVaultTargetConfig(targetKey);

  if (!skipSelect && vaultTargetSelect) {
    vaultTargetSelect.value = vaultTarget.key;
  }

  if (vaultTarget.input) {
    vaultTarget.input.value = secretValue;
  }

  if (vaultTarget.storageKey) {
    storage.setItem(vaultTarget.storageKey, secretValue);
  }

  if (vaultTarget.accountField) {
    saveSecretToAccount(vaultTarget.accountField, secretValue);
  }

  if (!silent) {
    refreshSharedKeyUsage(vaultTarget.key, secretValue);
  }
}

async function saveKeyToVault() {
  const alias = sanitizeVaultAlias(vaultAliasInput?.value?.trim());
  const passphrase = vaultPassphraseInput?.value || '';
  const target = getSelectedVaultTarget();
  const secretValue = target.input?.value?.trim() || '';

  if (!alias) {
    setVaultStatus('Add a vault label using letters, numbers, or dashes.');
    return;
  }

  if (!passphrase || passphrase.length < 6) {
    setVaultStatus('Add a passphrase (6+ characters) to encrypt your secret.');
    return;
  }

  if (!secretValue) {
    setVaultStatus(`Add your ${target.label} before saving to Gun.`);
    return;
  }

  try {
    await putVaultRecord(alias, passphrase, target.key, secretValue);
    setVaultStatus(`${target.label} encrypted and stored in Gun. Save all to keep every token under one vault.`);
  } catch (error) {
    setVaultStatus(`Error encrypting or saving: ${error.message}`);
  }
}

async function saveAllKeysToVault() {
  const alias = sanitizeVaultAlias(vaultAliasInput?.value?.trim());
  const passphrase = vaultPassphraseInput?.value || '';
  const secrets = getVaultableSecrets();
  const secretLabels = Object.keys(secrets).map((key) => getVaultTargetConfig(key).label);

  if (!alias) {
    setVaultStatus('Add a vault label using letters, numbers, or dashes.');
    return;
  }

  if (!passphrase || passphrase.length < 6) {
    setVaultStatus('Add a passphrase (6+ characters) to encrypt your secrets.');
    return;
  }

  if (!secretLabels.length) {
    setVaultStatus('Add at least one secret before saving them all to Gun.');
    return;
  }

  try {
    await putVaultEntries(alias, passphrase, secrets);
    setVaultStatus(`Saved ${secretLabels.join(', ')} to Gun with one passphrase. Use Load all to restore quickly.`);
  } catch (error) {
    setVaultStatus(`Error encrypting or saving: ${error.message}`);
  }
}

function fetchVaultRecord(alias) {
  return new Promise((resolve) => {
    keyVaultNode.get(alias).once((data) => resolve(data));
  });
}

async function loadVaultSecret({ alias, passphrase, targetKey, silent = false, loadAll = false } = {}) {
  if (!alias) {
    if (!silent) {
      setVaultStatus('Enter the vault label you used when saving your secret.');
    }
    return false;
  }

  if (!passphrase) {
    if (!silent) {
      setVaultStatus('Enter the passphrase used to encrypt your secret.');
    }
    return false;
  }

  if (!Gun.SEA || typeof Gun.SEA.decrypt !== 'function') {
    if (!silent) {
      setVaultStatus('Gun SEA not available. Refresh the page and try again.');
    }
    return false;
  }

  if (!silent) {
    setVaultStatus('Fetching and decrypting secrets from Gun...');
  }

  try {
    const record = await fetchVaultRecord(alias);
    const targetMap = buildVaultTargetMap(record);
    const availableTargets = Object.keys(targetMap);

    if (!availableTargets.length) {
      if (!silent) {
        setVaultStatus('No encrypted secret found for that alias.');
      }
      return false;
    }

    const hasRequestedTarget = targetKey && targetMap[targetKey];
    const targetsToLoad = loadAll
      ? availableTargets
      : [hasRequestedTarget ? targetKey : availableTargets[0]];
    const missingRequested = targetKey && !hasRequestedTarget;
    const appliedLabels = new Set();
    const loadedTargets = new Set();

    for (const key of targetsToLoad) {
      const entry = targetMap[key];
      if (!entry?.cipher) continue;

      const decrypted = await Gun.SEA.decrypt(entry.cipher, passphrase);
      if (!decrypted) continue;

      if (typeof decrypted === 'object' && decrypted !== null) {
        Object.entries(decrypted).forEach(([innerKey, innerValue]) => {
          if (!vaultTargets[innerKey] || typeof innerValue !== 'string' || !innerValue) return;
          applyVaultTargetValue(innerKey, innerValue, { silent, skipSelect: loadAll });
          appliedLabels.add(getVaultTargetConfig(innerKey).label);
          loadedTargets.add(innerKey);
        });
        continue;
      }

      if (typeof decrypted !== 'string') continue;

      applyVaultTargetValue(key, decrypted, { silent, skipSelect: loadAll });
      appliedLabels.add(getVaultTargetConfig(key).label);
      loadedTargets.add(key);
    }

    const appliedList = Array.from(appliedLabels);

    if (!appliedList.length) {
      if (!silent) {
        setVaultStatus('Decryption failed. Check your passphrase and try again.');
      }
      return false;
    }

    if (!silent) {
      if (loadAll) {
        const missingLabels = Object.keys(vaultTargets)
          .filter((key) => !loadedTargets.has(key))
          .map((key) => getVaultTargetConfig(key).label);
        const missingText = missingLabels.length ? ` Missing: ${missingLabels.join(', ')}.` : '';
        updateStorageModeNotice('Vault secrets loaded from Gun and cached for this device.');
        setVaultStatus(`Loaded ${appliedList.join(', ')} from Gun.${missingText}`);
      } else {
        const loadedLabel = appliedList[0];
        const prefix = missingRequested
          ? `${getVaultTargetConfig(targetKey).label} not stored yet. `
          : '';
        updateStorageModeNotice(`${loadedLabel} loaded from Gun and stored locally for this device.`);
        setVaultStatus(`${prefix}${loadedLabel} applied to this session.`);
      }
    }

    return true;
  } catch (error) {
    if (!silent) {
      setVaultStatus(`Error loading from Gun: ${error.message}`);
    }
    return false;
  }
}

async function loadKeyFromVault() {
  const alias = sanitizeVaultAlias(vaultAliasInput?.value?.trim());
  const passphrase = vaultPassphraseInput?.value || '';
  const selectedTarget = getSelectedVaultTarget();

  await loadVaultSecret({ alias, passphrase, targetKey: selectedTarget.key });
}

async function loadAllVaultSecrets() {
  const alias = sanitizeVaultAlias(vaultAliasInput?.value?.trim());
  const passphrase = vaultPassphraseInput?.value || '';

  await loadVaultSecret({ alias, passphrase, loadAll: true });
}

async function autoSyncSecret(targetKey, secretValue) {
  if (!vaultAutoSyncToggle?.checked) return;

  const alias = sanitizeVaultAlias(vaultAliasInput?.value?.trim());
  const passphrase = vaultPassphraseInput?.value || '';
  const target = getVaultTargetConfig(targetKey);

  if (!alias || !passphrase) {
    updateVaultAutoStatus('Add a vault label and passphrase to keep auto-sync running.');
    return;
  }

  if (!secretValue) {
    updateVaultAutoStatus(`Add your ${target.label.toLowerCase()} before auto-syncing.`);
    return;
  }

  try {
    await putVaultRecord(alias, passphrase, target.key, secretValue);
    updateVaultAutoStatus(`${target.label} auto-synced to Gun for your next device.`);
  } catch (error) {
    updateVaultAutoStatus(`Auto-sync failed: ${error.message}`);
  }
}

async function maybeAutoLoadVaultSecret() {
  if (!vaultAutoSyncToggle?.checked) return;

  const alias = sanitizeVaultAlias(vaultAliasInput?.value?.trim());
  const passphrase = vaultPassphraseInput?.value || '';
  const selectedTarget = getSelectedVaultTarget();

  if (!alias || !passphrase) return;

  const loaded = await loadVaultSecret({
    alias,
    passphrase,
    targetKey: selectedTarget.key,
    silent: true,
  });

  if (loaded) {
    updateVaultAutoStatus(`${selectedTarget.label} restored automatically from Gun.`);
  }
}

function loadStoredVercelToken() {
  const stored = storage.getItem(vercelTokenStorageKey);
  if (stored) {
    vercelTokenInput.value = stored;
    refreshSharedKeyUsage('vercel', stored);
  }
}

function loadStoredGithubToken() {
  const stored = storage.getItem(githubTokenStorageKey);
  if (stored) {
    githubTokenInput.value = stored;
    refreshSharedKeyUsage('github', stored);
  }
}

function renderHistoryItem(entry) {
  const listItem = document.createElement('li');
  const prompt = document.createElement('div');
  prompt.textContent = entry.prompt || '[no prompt]';
  const response = document.createElement('div');
  response.textContent = entry.response || '[no response]';
  const meta = document.createElement('div');
  meta.className = 'meta';
  const date = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'unknown time';
  meta.textContent = `Saved ${date}`;
  listItem.appendChild(prompt);
  listItem.appendChild(response);
  listItem.appendChild(meta);
  historyList.prepend(listItem);
}

function renderDeploymentItem(entry) {
  const listItem = document.createElement('li');

  const title = document.createElement('div');
  title.textContent = entry.projectName || 'Untitled project';
  listItem.appendChild(title);

  const links = document.createElement('div');
  links.className = 'meta-row';

  if (entry.url) {
    const liveLink = document.createElement('a');
    liveLink.href = entry.url;
    liveLink.target = '_blank';
    liveLink.rel = 'noopener noreferrer';
    liveLink.textContent = 'View site';
    links.appendChild(liveLink);
  }

  if (entry.inspectUrl) {
    const inspectLink = document.createElement('a');
    inspectLink.href = entry.inspectUrl;
    inspectLink.target = '_blank';
    inspectLink.rel = 'noopener noreferrer';
    inspectLink.textContent = 'Inspect deployment';
    links.appendChild(inspectLink);
  }

  const meta = document.createElement('div');
  meta.className = 'meta-row';

  const created = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'unknown time';
  const createdText = document.createElement('span');
  createdText.textContent = `Deployed ${created}`;
  meta.appendChild(createdText);

  if (entry.note) {
    const note = document.createElement('span');
    note.textContent = `Note: ${entry.note}`;
    meta.appendChild(note);
  }

  listItem.appendChild(links);
  listItem.appendChild(meta);

  deploymentsList.prepend(listItem);
}

function renderGithubCommit(entry) {
  const listItem = document.createElement('li');

  const title = document.createElement('div');
  title.textContent = entry.repo || 'Unknown repo';
  listItem.appendChild(title);

  const links = document.createElement('div');
  links.className = 'meta-row';

  if (entry.htmlUrl) {
    const fileLink = document.createElement('a');
    fileLink.href = entry.htmlUrl;
    fileLink.target = '_blank';
    fileLink.rel = 'noopener noreferrer';
    fileLink.textContent = entry.path || 'View file';
    links.appendChild(fileLink);
  }

  const meta = document.createElement('div');
  meta.className = 'meta-row';
  const created = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'unknown time';
  const createdText = document.createElement('span');
  createdText.textContent = `Committed ${created}`;
  meta.appendChild(createdText);

  if (entry.branch) {
    const branch = document.createElement('span');
    branch.textContent = `Branch: ${entry.branch}`;
    meta.appendChild(branch);
  }

  if (entry.message) {
    const message = document.createElement('span');
    message.textContent = `Message: ${entry.message}`;
    meta.appendChild(message);
  }

  listItem.appendChild(links);
  listItem.appendChild(meta);

  githubHistoryList.prepend(listItem);
}

function startHistorySubscription() {
  const version = subscriptionVersion;
  transcriptNode.map().once((data) => {
    if (!data || subscriptionVersion !== version) return;
    renderHistoryItem(data);
  });
}

function startDeploymentSubscription() {
  const version = subscriptionVersion;
  deploymentNode.map().once((data) => {
    if (!data || !data.id || subscriptionVersion !== version) return;
    renderDeploymentItem(data);
  });
}

function startGithubSubscription() {
  const version = subscriptionVersion;
  githubNode.map().once((data) => {
    if (!data || !data.commitSha || subscriptionVersion !== version) return;
    renderGithubCommit(data);
  });
}

function setVercelStatus(message) {
  vercelStatus.textContent = message;
}

function setGithubStatus(message) {
  githubStatus.textContent = message;
}

function setRepoStatus(message, tone = 'neutral') {
  repoStatus.textContent = message;
  repoStatus.classList.remove('success', 'error');
  if (tone === 'success') {
    repoStatus.classList.add('success');
  }
  if (tone === 'error') {
    repoStatus.classList.add('error');
  }
}

function toggleRepoOrgField() {
  const owner = document.querySelector('input[name="repo-owner"]:checked')?.value;
  const isOrg = owner === 'org';
  repoOrgInput.disabled = !isOrg;
  repoOrgInput.required = isOrg;
  if (!isOrg) {
    repoOrgInput.value = '';
  }
}

toggleRepoOrgField();

function buildRepoEndpoint(ownerType, orgName) {
  if (ownerType === 'org') {
    return `https://api.github.com/orgs/${encodeURIComponent(orgName)}/repos`;
  }
  return 'https://api.github.com/user/repos';
}

function slugifyRepoName(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildRepoNameSeed() {
  const prompt = messageInput?.value?.trim();
  const note = deployNoteInput?.value?.trim();
  if (prompt) return prompt;
  if (note) return note;
  return 'workbench';
}

function suggestRepoName({ force = false } = {}) {
  if (!repoNameInput) return '';
  const current = repoNameInput.value.trim();
  if (current && !force) return current;

  const slug = slugifyRepoName(buildRepoNameSeed());
  const fallback = `${getTodayKey()}-${Gun.text.random(4)}`.toLowerCase();
  const base = slug || fallback;
  const name = base.startsWith('workbench') ? base : `workbench-${base}`;

  repoNameInput.value = name;
  persistFormState();
  return name;
}

function persistDeployment(entry) {
  const id = entry.id || Gun.text.random();
  const record = {
    ...entry,
    id,
    createdAt: entry.createdAt || Date.now(),
  };

  deploymentNode.get(id).put(record);
  return record;
}

function persistGithubCommit(entry) {
  const id = entry.commitSha || Gun.text.random();
  const record = {
    ...entry,
    id,
    createdAt: entry.createdAt || Date.now(),
  };

  // Gun graph: 3dvr-portal/ai-workbench/<identityKey>/github/<commitSha>
  githubNode.get(id).put(record);
  return record;
}

async function sendToOpenAI() {
  const apiKey = apiKeyInput.value.trim();
  const prompt = messageInput.value.trim();
  const model = modelSelect.value;

  if (!apiKey) {
    outputBox.textContent = 'Add your OpenAI API key to start chatting.';
    return;
  }

  if (!prompt) {
    outputBox.textContent = 'Type a prompt to send to the model.';
    return;
  }

  if (!canUseSharedKey('openai')) {
    outputBox.textContent = sharedLimitMessage();
    return;
  }

  submitBtn.disabled = true;
  outputBox.textContent = 'Sending to OpenAI...';

  const body = {
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'developer',
        content: developerPrompt
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No reply received.';
    const cleanedReply = sanitizeResponseContent(reply);
    outputBox.textContent = cleanedReply;
    applyPreview(cleanedReply);
    persistLastState({ prompt, response: cleanedReply, model });
    transcriptNode.set({ prompt, response: cleanedReply, createdAt: Date.now() });
  } catch (error) {
    outputBox.textContent = `Error: ${error.message}`;
  } finally {
    submitBtn.disabled = false;
  }
}

function applyPreview(content) {
  const sanitizedContent = sanitizeResponseContent(content ?? (outputBox.textContent || ''));
  const previewStyle = [
    "<style>body{font-family:'Poppins',sans-serif;padding:16px;",
    "background:#f8fbff;color:#1d1d1f;}a{color:#5ca0d3;}</style>"
  ].join('');
  previewFrame.srcdoc = `${previewStyle}${sanitizedContent}`;
}

async function deployCurrentResponse() {
  const token = vercelTokenInput.value.trim();
  const projectName = projectInput.value.trim();
  const note = deployNoteInput.value.trim();
  const html = sanitizeResponseContent(outputBox.textContent || '');

  if (!token) {
    setVercelStatus('Add your Vercel token to deploy.');
    return;
  }

  if (!projectName) {
    setVercelStatus('Name the Vercel project before deploying.');
    return;
  }

  if (!html || html.length < 20 || !html.toLowerCase().includes('<html')) {
    setVercelStatus('Generate HTML in the response before deploying to Vercel.');
    return;
  }

  if (!canUseSharedKey('vercel')) {
    setVercelStatus(sharedLimitMessage());
    return;
  }

  deployBtn.disabled = true;
  setVercelStatus('Deploying to Vercel...');

  try {
    const response = await fetch('/api/vercel-deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, projectName, html })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deploy error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    persistDeployment({
      id: data.id,
      projectName,
      url: data.url,
      inspectUrl: data.inspectUrl,
      note,
      createdAt: data.createdAt
    });

    setVercelStatus(data.url ? `Deployment live at ${data.url}` : 'Deployment created.');
  } catch (error) {
    setVercelStatus(`Error: ${error.message}`);
  } finally {
    deployBtn.disabled = false;
  }
}

async function createGithubRepoRequest({ autoName = false } = {}) {
  const token = githubTokenInput.value.trim();
  const ownerType = document.querySelector('input[name="repo-owner"]:checked')?.value;
  const orgName = repoOrgInput.value.trim();
  const visibility = repoVisibilitySelect.value;
  const description = repoDescriptionInput.value.trim();
  const autoInit = repoReadmeCheckbox.checked;
  const deleteBranchOnMerge = repoBranchCleanupCheckbox.checked;

  if (!token) {
    setRepoStatus('Add a GitHub token first.', 'error');
    return null;
  }

  if (ownerType === 'org' && !orgName) {
    setRepoStatus('Enter the organization handle.', 'error');
    return null;
  }

  let repoName = repoNameInput.value.trim();
  if (!repoName && autoName) {
    repoName = suggestRepoName({ force: true });
  }

  if (!repoName) {
    setRepoStatus('Name your repository to continue.', 'error');
    return null;
  }

  setRepoStatus(autoName ? 'Naming and creating repository…' : 'Creating repository…');
  createRepoBtn.disabled = true;

  const attemptNames = [repoName];
  if (autoName) {
    attemptNames.push(`${repoName}-${Gun.text.random(4)}`.toLowerCase());
  }

  try {
    for (const candidate of attemptNames) {
      repoNameInput.value = candidate;
      persistFormState();
      const payload = {
        name: candidate,
        description: description || undefined,
        private: visibility === 'private',
        auto_init: autoInit,
        has_issues: true,
        has_wiki: false,
        has_projects: false,
        delete_branch_on_merge: deleteBranchOnMerge,
        allow_squash_merge: true,
        allow_merge_commit: true,
        allow_rebase_merge: true
      };

      const response = await fetch(buildRepoEndpoint(ownerType, orgName), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (autoName && response.status === 422) {
          continue;
        }
        const message = data?.message || 'GitHub returned an error. Check scopes and owner settings.';
        setRepoStatus(message, 'error');
        return null;
      }

      const details = data?.full_name || candidate;
      const cloneUrl = data?.clone_url;
      const htmlUrl = data?.html_url;
      const defaultBranch = data?.default_branch;

      setRepoStatus(`Created ${details}. ${defaultBranch ? `Default branch: ${defaultBranch}.` : ''}`, 'success');

      if (htmlUrl) {
        const link = document.createElement('a');
        link.href = htmlUrl;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = htmlUrl;
        repoStatus.append(document.createElement('br'), link);
      }

      if (cloneUrl) {
        const cloneDetails = document.createElement('div');
        cloneDetails.className = 'status-note';
        cloneDetails.textContent = `Clone: git clone ${cloneUrl}`;
        repoStatus.appendChild(cloneDetails);
      }

      if (data?.full_name) {
        githubRepoInput.value = data.full_name;
      }
      if (defaultBranch) {
        githubBranchInput.value = defaultBranch;
      }
      persistFormState();

      return {
        fullName: data?.full_name || details,
        defaultBranch: defaultBranch || '',
        htmlUrl,
        cloneUrl
      };
    }

    setRepoStatus('Repo name already exists. Try a different name.', 'error');
    return null;
  } catch (error) {
    setRepoStatus('Network issue while talking to GitHub.', 'error');
    return null;
  } finally {
    createRepoBtn.disabled = false;
  }
}

async function createGithubRepo(event) {
  event.preventDefault();
  await createGithubRepoRequest({ autoName: true });
}

async function publishToGithub() {
  const token = githubTokenInput.value.trim();
  let repo = githubRepoInput.value.trim();
  const branch = githubBranchInput.value.trim() || 'main';
  const path = githubPathInput.value.trim() || 'index.html';
  const message = githubMessageInput.value.trim();
  const html = sanitizeResponseContent(outputBox.textContent || '');

  if (!token) {
    setGithubStatus('Add your GitHub token to publish.');
    return;
  }

  if (!repo || !repo.includes('/')) {
    setGithubStatus('No repo provided. Creating one automatically...');
    const created = await createGithubRepoRequest({ autoName: true });
    repo = created?.fullName || githubRepoInput.value.trim();
    if (!repo || !repo.includes('/')) {
      setGithubStatus('Provide the repo in the form owner/name.');
      return;
    }
    setGithubStatus('Repository created. Publishing to GitHub...');
  }

  if (!html || html.length < 20 || !html.toLowerCase().includes('<html')) {
    setGithubStatus('Generate HTML in the response before publishing to GitHub.');
    return;
  }

  if (!canUseSharedKey('github')) {
    setGithubStatus(sharedLimitMessage());
    return;
  }

  githubBtn.disabled = true;
  setGithubStatus('Publishing to GitHub...');

  try {
    const response = await fetch('/api/github-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, repo, branch, path, content: html, message })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    persistGithubCommit({
      commitSha: data.commitSha,
      repo: data.repo,
      path: data.path,
      branch: data.branch,
      htmlUrl: data.htmlUrl,
      message: data.message,
      createdAt: data.createdAt,
    });

    setGithubStatus(data.htmlUrl ? `Committed to ${data.htmlUrl}` : 'Commit created.');
  } catch (error) {
    const details = error?.message || 'GitHub request failed.';
    const lowerDetails = details.toLowerCase();
    if (lowerDetails.includes('resource not accessible by personal access token')) {
      setGithubStatus('Error: Resource not accessible by personal access token. Confirm repo access, contents scope, '
        + 'and SSO authorization.');
      return;
    }
    setGithubStatus(`Error: ${details}`);
  } finally {
    githubBtn.disabled = false;
  }
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    outputBox.textContent = 'Enter a valid API key first.';
    return;
  }
  const mode = storage.setItem(apiKeyStorageKey, key);
  const savedMessage = user?.is
    ? 'API key saved to your Gun account and cached locally.'
    : mode === 'memory'
      ? 'API key saved for this page only. Adjust Brave Shields or storage settings to persist across refreshes.'
      : `API key saved to ${mode}.`;
  updateStorageModeNotice(savedMessage);
  outputBox.textContent = savedMessage;
  saveSecretToAccount('openaiApiKey', key);
  autoSyncSecret('openai', key);
  refreshSharedKeyUsage('openai', key);
});

vaultAliasInput?.addEventListener('input', () => {
  saveAutoVaultPreferences();
  updateVaultAutoStatus();
});

vaultPassphraseInput?.addEventListener('input', () => {
  saveAutoVaultPreferences();
  updateVaultAutoStatus();
  autoLoadVaultForAccount({ silent: true });
});

vaultAutoSyncToggle?.addEventListener('change', () => {
  saveAutoVaultPreferences();
  updateVaultAutoStatus();
  if (vaultAutoSyncToggle.checked) {
    maybeAutoLoadVaultSecret();
  }
});

vaultRememberPassphraseToggle?.addEventListener('change', () => {
  saveAutoVaultPreferences();
  updateVaultAutoStatus();
});

vaultAccountAliasToggle?.addEventListener('change', () => {
  saveAutoVaultPreferences();
  if (vaultAccountAliasToggle.checked) {
    applyAccountAliasToVault();
  }
});

vaultAutoLoadToggle?.addEventListener('change', () => {
  saveAutoVaultPreferences();
  if (vaultAutoLoadToggle.checked) {
    autoLoadVaultForAccount({ silent: false });
  }
});

clearKeyBtn.addEventListener('click', () => {
  storage.removeItem(apiKeyStorageKey);
  apiKeyInput.value = '';
  outputBox.textContent = 'API key cleared from this browser.';
  removeAccountSecret('openaiApiKey');
  refreshSharedKeyUsage('openai', '');
});

submitBtn.addEventListener('click', sendToOpenAI);
applyPreviewBtn.addEventListener('click', applyPreview);
messageInput?.addEventListener('input', () => {
  if (!repoNameInput?.value?.trim()) {
    suggestRepoName();
  }
});
projectInput?.addEventListener('input', persistFormState);
deployNoteInput?.addEventListener('input', () => {
  persistFormState();
  if (!repoNameInput?.value?.trim()) {
    suggestRepoName();
  }
});
githubRepoInput?.addEventListener('input', persistFormState);
githubBranchInput?.addEventListener('input', persistFormState);
githubPathInput?.addEventListener('input', persistFormState);
githubMessageInput?.addEventListener('input', persistFormState);
repoNameInput?.addEventListener('input', persistFormState);
repoOrgInput?.addEventListener('input', persistFormState);
repoVisibilitySelect?.addEventListener('change', persistFormState);
repoDescriptionInput?.addEventListener('input', persistFormState);
repoReadmeCheckbox?.addEventListener('change', persistFormState);
repoBranchCleanupCheckbox?.addEventListener('change', persistFormState);
repoOwnerRadios?.forEach((radio) => {
  radio.addEventListener('change', () => {
    toggleRepoOrgField();
    persistFormState();
  });
});
apiKeyInput?.addEventListener('input', () => refreshSharedKeyUsage('openai', apiKeyInput.value));
vercelTokenInput?.addEventListener('input', () => refreshSharedKeyUsage('vercel', vercelTokenInput.value));
githubTokenInput?.addEventListener('input', () => refreshSharedKeyUsage('github', githubTokenInput.value));
saveVercelBtn.addEventListener('click', () => {
  const token = vercelTokenInput.value.trim();
  if (!token) {
    setVercelStatus('Enter a valid Vercel token first.');
    return;
  }

  const mode = storage.setItem(vercelTokenStorageKey, token);
  const status = user?.is
    ? 'Vercel token saved to your Gun account and cached locally.'
    : mode === 'memory'
      ? 'Vercel token saved for this page only. Allow storage for persistence.'
      : `Vercel token saved to ${mode}.`;
  updateStorageModeNotice(status);
  setVercelStatus(status);
  saveSecretToAccount('vercelToken', token);
  autoSyncSecret('vercel', token);
  refreshSharedKeyUsage('vercel', token);
});

clearVercelBtn.addEventListener('click', () => {
  storage.removeItem(vercelTokenStorageKey);
  vercelTokenInput.value = '';
  setVercelStatus('Vercel token cleared from this browser.');
  removeAccountSecret('vercelToken');
  refreshSharedKeyUsage('vercel', '');
});

deployBtn.addEventListener('click', deployCurrentResponse);

saveGithubBtn.addEventListener('click', () => {
  const token = githubTokenInput.value.trim();
  if (!token) {
    setGithubStatus('Enter a valid GitHub token first.');
    return;
  }

  const mode = storage.setItem(githubTokenStorageKey, token);
  const githubMessage = user?.is
    ? 'GitHub token saved to your Gun account and cached locally.'
    : mode === 'memory'
      ? 'GitHub token saved for this page only. Allow storage for persistence.'
      : `GitHub token saved to ${mode}.`;
  updateStorageModeNotice(githubMessage);
  setGithubStatus(githubMessage);
  saveSecretToAccount('githubToken', token);
  autoSyncSecret('github', token);
  refreshSharedKeyUsage('github', token);
});

clearGithubBtn.addEventListener('click', () => {
  storage.removeItem(githubTokenStorageKey);
  githubTokenInput.value = '';
  setGithubStatus('GitHub token cleared from this browser.');
  removeAccountSecret('githubToken');
  refreshSharedKeyUsage('github', '');
});

loadDefaultBtn?.addEventListener('click', loadDefaultKey);
defaultPassphraseInput?.addEventListener('input', saveDefaultPreferences);
defaultRememberPassphraseToggle?.addEventListener('change', () => {
  saveDefaultPreferences();
});
defaultAutoLoadToggle?.addEventListener('change', () => {
  saveDefaultPreferences();
  maybeAutoLoadDefaults();
});

createRepoBtn.addEventListener('click', createGithubRepo);
githubBtn.addEventListener('click', publishToGithub);
vaultSaveBtn?.addEventListener('click', saveKeyToVault);
vaultLoadBtn?.addEventListener('click', loadKeyFromVault);
vaultSaveAllBtn?.addEventListener('click', saveAllKeysToVault);
vaultLoadAllBtn?.addEventListener('click', loadAllVaultSecrets);

restoreAutoVaultPreferences();
restoreDefaultPreferences();

recallUserSession();
subscribeToDefaults();
resetUsageTracking();
user.on('auth', async () => {
  const pub = user?.is?.pub;
  if (pub) {
    setIdentityScope(pub);
  }
  user.get('alias').once((value) => {
    if (value) {
      setAccountAlias(value);
      updateAccountStatus(`Synced to ${value}. Secrets will follow you across browsers.`);
      autoLoadVaultForAccount({ silent: true });
    }
  });
  await syncCachedSecretsToAccount();
  hydrateAccountSecrets();
});
attemptStoredAuth();

updateStorageModeNotice();
loadStoredKey();
loadStoredVercelToken();
loadStoredGithubToken();
updateDefaultsStatusList();
hydrateFormState();
hydrateLastState();
if (!repoNameInput?.value?.trim()) {
  suggestRepoName();
}
maybeAutoLoadVaultSecret();
startHistorySubscription();
startDeploymentSubscription();
startGithubSubscription();
