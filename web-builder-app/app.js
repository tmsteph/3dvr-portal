import { summarizeDefaults } from '../src/web-builder/defaults.js';

const gun = Gun({ peers: window.__GUN_PEERS__ || undefined });
const portalRoot = gun.get('3dvr-portal');
const workbenchRoot = portalRoot.get('ai-workbench');
// Gun graph: 3dvr-portal/ai-workbench/defaults => { apiKey, vercelToken, githubToken, apiKeyCipher, ... }
const defaultsNode = workbenchRoot.get('defaults');
const rateLimitsNode = workbenchRoot.get('rate-limits');
const billingTierNode = portalRoot.get('billing').get('usageTier');

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

const sharedKeyUsage = {
  openai: false,
  vercel: false,
  github: false
};

let currentUsageTier = 'guest';
let sharedUsageCounts = { total: 0, openai: 0, vercel: 0, github: 0 };
let usageDateKey = '';
let usageSubscription = null;
let tierSubscription = null;
let currentHtml = '';
let currentTitle = '';

const identityStorageKey = 'web-builder-identity';
const openaiStorageKey = 'web-builder-openai';
const vercelStorageKey = 'web-builder-vercel';
const githubStorageKey = 'web-builder-github';

const identityLabel = document.getElementById('identity-label');
const defaultStatus = document.getElementById('default-status');
const sharedUsageStatus = document.getElementById('shared-usage');
const keyStatus = document.getElementById('key-status');
const openaiInput = document.getElementById('openai-key');
const vercelInput = document.getElementById('vercel-token');
const githubInput = document.getElementById('github-token');
const saveKeysBtn = document.getElementById('save-keys');
const clearKeysBtn = document.getElementById('clear-keys');
const siteTitleInput = document.getElementById('site-title');
const siteGoalInput = document.getElementById('site-goal');
const siteAudienceInput = document.getElementById('site-audience');
const siteStyleSelect = document.getElementById('site-style');
const siteExtrasInput = document.getElementById('site-extras');
const vercelProjectInput = document.getElementById('vercel-project');
const githubRepoInput = document.getElementById('github-repo');
const githubBranchInput = document.getElementById('github-branch');
const githubPathInput = document.getElementById('github-path');
const githubMessageInput = document.getElementById('github-message');
const generateBtn = document.getElementById('generate');
const deployBtn = document.getElementById('deploy');
const publishBtn = document.getElementById('publish');
const generateStatus = document.getElementById('generate-status');
const previewFrame = document.getElementById('preview');
const outputBox = document.getElementById('output');

const identityKey = resolveIdentity();

hydrateStoredKeys();
subscribeToDefaults();
subscribeToBillingTier();
subscribeToUsageCounters();
wireEvents();
renderIdentity();
logMessage('Ready to build with shared defaults.');

function resolveIdentity() {
  const stored = safeRead(localStorage, identityStorageKey) || safeRead(sessionStorage, identityStorageKey);
  if (stored) {
    return stored;
  }

  const generated = Gun.text.random();
  safeWrite(localStorage, identityStorageKey, generated);
  return generated;
}

function renderIdentity() {
  const tierLabel = TIER_LABELS[currentUsageTier] || currentUsageTier;
  identityLabel.textContent = `Usage recorded for ${identityKey} (${tierLabel}).`;
}

function safeRead(store, key) {
  try {
    return store?.getItem(key) || '';
  } catch (error) {
    return '';
  }
}

function safeWrite(store, key, value) {
  try {
    store?.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function safeRemove(store, key) {
  try {
    store?.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}

function updateKeyStatus(message) {
  keyStatus.textContent = message;
}

function hydrateStoredKeys() {
  const openai = safeRead(localStorage, openaiStorageKey) || safeRead(sessionStorage, openaiStorageKey);
  const vercel = safeRead(localStorage, vercelStorageKey) || safeRead(sessionStorage, vercelStorageKey);
  const github = safeRead(localStorage, githubStorageKey) || safeRead(sessionStorage, githubStorageKey);

  if (openai) openaiInput.value = openai;
  if (vercel) vercelInput.value = vercel;
  if (github) githubInput.value = github;

  if (openai || vercel || github) {
    updateKeyStatus('Loaded personal keys from this device.');
  }

  refreshSharedKeyUsage('openai', openaiInput.value);
  refreshSharedKeyUsage('vercel', vercelInput.value);
  refreshSharedKeyUsage('github', githubInput.value);
}

function subscribeToDefaults() {
  defaultsNode.on(data => {
    const { defaults, hasPublic, hasEncrypted } = summarizeDefaults(data || {});
    const applied = applyDefaults(defaults, { fromSubscription: true });

    if (!applied.length) {
      defaultStatus.textContent = hasEncrypted && !hasPublic
        ? 'Defaults are encrypted. Ask an admin to publish public defaults.'
        : 'No defaults configured yet.';
      return;
    }

    defaultStatus.textContent = `Defaults loaded automatically: ${applied.join(', ')}. Shared limits active.`;
  });
}

function normalizeTier(rawTier) {
  if (!rawTier) return 'guest';
  const normalized = String(rawTier).toLowerCase();
  if (normalized === 'guest') return 'guest';
  if (['free', 'account'].includes(normalized)) return 'account';
  if (['supporter', 'paid', '5'].includes(normalized)) return 'supporter';
  if (['pro', '20'].includes(normalized)) return 'pro';
  return 'guest';
}

function resolveUsageTier() {
  return currentUsageTier || 'guest';
}

function subscribeToBillingTier() {
  detachTierSubscription();
  tierSubscription = billingTierNode.get(identityKey);
  tierSubscription.on(data => {
    const nextTier = normalizeTier(data?.tier || data?.plan || data);
    currentUsageTier = nextTier;
    renderIdentity();
    updateSharedUsageStatus();
  });
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeUsageRecord(record) {
  if (!record) return { total: 0, openai: 0, vercel: 0, github: 0 };
  return {
    total: Number(record.total) || 0,
    openai: Number(record.openai) || 0,
    vercel: Number(record.vercel) || 0,
    github: Number(record.github) || 0,
    updatedAt: record.updatedAt || Date.now(),
    tier: normalizeTier(record.tier) || resolveUsageTier()
  };
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

function detachTierSubscription() {
  try {
    tierSubscription?.off?.();
  } catch (error) {
    console.warn('Failed to detach tier listener', error);
  }
  tierSubscription = null;
}

function updateSharedUsageStatus(message) {
  if (message) {
    sharedUsageStatus.textContent = message;
    return;
  }

  if (!usingAnySharedKey()) {
    sharedUsageStatus.textContent = 'Using personal tokens; shared limits are idle.';
    return;
  }

  const tier = resolveUsageTier();
  const used = sharedUsageCounts.total || 0;
  const limit = SHARED_USAGE_LIMITS[tier] || SHARED_USAGE_LIMITS.account;
  const label = TIER_LABELS[tier] || tier;

  sharedUsageStatus.textContent = `Shared key usage: ${used}/${limit} today (${label}).`;
}

function sharedLimitMessage() {
  const tier = resolveUsageTier();
  const used = sharedUsageCounts.total || 0;
  const limit = SHARED_USAGE_LIMITS[tier] || SHARED_USAGE_LIMITS.account;
  const label = TIER_LABELS[tier] || tier;
  return `Shared key limit reached: ${used}/${limit} used today for the ${label} tier.`;
}

function refreshSharedKeyUsage(targetKey, value) {
  if (!(targetKey in sharedKeyUsage)) return;
  const trimmed = (value || '').trim();
  sharedKeyUsage[targetKey] = Boolean(trimmed && trimmed === defaultSecrets[targetKey]);
  updateSharedUsageStatus();
}

function ensureUsageSubscription() {
  const todayKey = getTodayKey();
  if (usageDateKey !== todayKey || !usageSubscription) {
    subscribeToUsageCounters();
  }
}

function canUseSharedKey(action) {
  if (!sharedKeyUsage[action]) return true;

  ensureUsageSubscription();
  const limit = SHARED_USAGE_LIMITS[resolveUsageTier()] || SHARED_USAGE_LIMITS.account;
  const used = sharedUsageCounts.total || 0;

  if (used >= limit) {
    updateSharedUsageStatus(sharedLimitMessage());
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

function usingAnySharedKey() {
  return sharedKeyUsage.openai || sharedKeyUsage.vercel || sharedKeyUsage.github;
}

function applyDefaults(defaults, { fromSubscription = false } = {}) {
  const applied = [];

  if (defaults.openai) {
    defaultSecrets.openai = defaults.openai;
    if (!openaiInput.value.trim()) {
      openaiInput.value = defaults.openai;
    }
    safeWrite(localStorage, openaiStorageKey, defaults.openai);
    refreshSharedKeyUsage('openai', openaiInput.value);
    applied.push('OpenAI');
  }

  if (defaults.vercel) {
    defaultSecrets.vercel = defaults.vercel;
    if (!vercelInput.value.trim()) {
      vercelInput.value = defaults.vercel;
    }
    safeWrite(localStorage, vercelStorageKey, defaults.vercel);
    refreshSharedKeyUsage('vercel', vercelInput.value);
    applied.push('Vercel');
  }

  if (defaults.github) {
    defaultSecrets.github = defaults.github;
    if (!githubInput.value.trim()) {
      githubInput.value = defaults.github;
    }
    safeWrite(localStorage, githubStorageKey, defaults.github);
    refreshSharedKeyUsage('github', githubInput.value);
    applied.push('GitHub');
  }

  if (applied.length && !fromSubscription) {
    defaultStatus.textContent = `Defaults loaded automatically: ${applied.join(', ')}. Shared limits active.`;
  }

  if (applied.length) {
    updateSharedUsageStatus();
  }

  return applied;
}

function saveLocalKeys() {
  safeWrite(localStorage, openaiStorageKey, openaiInput.value.trim());
  safeWrite(localStorage, vercelStorageKey, vercelInput.value.trim());
  safeWrite(localStorage, githubStorageKey, githubInput.value.trim());
  updateKeyStatus('Saved keys locally.');
  refreshSharedKeyUsage('openai', openaiInput.value);
  refreshSharedKeyUsage('vercel', vercelInput.value);
  refreshSharedKeyUsage('github', githubInput.value);
}

function clearLocalKeys() {
  safeRemove(localStorage, openaiStorageKey);
  safeRemove(localStorage, vercelStorageKey);
  safeRemove(localStorage, githubStorageKey);
  safeRemove(sessionStorage, openaiStorageKey);
  safeRemove(sessionStorage, vercelStorageKey);
  safeRemove(sessionStorage, githubStorageKey);
  openaiInput.value = '';
  vercelInput.value = '';
  githubInput.value = '';
  updateKeyStatus('Cleared local copies.');
  refreshSharedKeyUsage('openai', '');
  refreshSharedKeyUsage('vercel', '');
  refreshSharedKeyUsage('github', '');
}

function buildPrompt() {
  const parts = [
    `Create a single-page site titled "${siteTitleInput.value.trim() || 'Untitled site'}".`,
    `Goal: ${siteGoalInput.value.trim() || 'Explain the offer and capture interest.'}`,
    `Audience: ${siteAudienceInput.value.trim() || 'general visitors'}.`,
    `Style: ${siteStyleSelect.value || 'clean'}.`,
    'Use semantic HTML with inline CSS only. Avoid external assets or scripts.',
    'Return JSON with title, summary, and html keys.',
    'Use accessible labels, high contrast, and mobile-first layout.'
  ];

  if (siteExtrasInput.value.trim()) {
    parts.push(`Extras: ${siteExtrasInput.value.trim()}`);
  }

  return parts.join(' ');
}

function renderPreview(html) {
  previewFrame.srcdoc = html || '<p>Generate a site to preview.</p>';
}

function logMessage(message) {
  const timestamp = new Date().toLocaleTimeString();
  const next = `[${timestamp}] ${message}`;
  outputBox.textContent = next + '\n' + (outputBox.textContent || '');
}

function getActiveKey(input, defaultValue, targetKey) {
  const trimmed = (input.value || '').trim();
  if (trimmed) {
    refreshSharedKeyUsage(targetKey, trimmed);
    return trimmed;
  }
  if (defaultValue) {
    refreshSharedKeyUsage(targetKey, defaultValue);
    return defaultValue;
  }
  return '';
}

async function handleGenerate() {
  const apiKey = getActiveKey(openaiInput, defaultSecrets.openai, 'openai');
  if (!apiKey) {
    generateStatus.textContent = 'Add an OpenAI key or wait for shared defaults.';
    return;
  }

  if (!canUseSharedKey('openai')) {
    generateStatus.textContent = sharedLimitMessage();
    return;
  }

  const prompt = buildPrompt();
  generateBtn.disabled = true;
  generateStatus.textContent = 'Sending to OpenAI...';
  logMessage('Sending brief to /api/openai-site');

  try {
    const response = await fetch('/api/openai-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, apiKey })
    });

    const result = await response.json();
    if (!response.ok) {
      generateStatus.textContent = result?.error || 'Unexpected OpenAI error.';
      logMessage(generateStatus.textContent);
      return;
    }

    currentHtml = result.html || '';
    currentTitle = result.title || siteTitleInput.value || 'Generated site';

    renderPreview(currentHtml);
    generateStatus.textContent = result.summary || 'Site generated.';
    logMessage('Site generated. Preview updated.');
  } catch (error) {
    generateStatus.textContent = 'Unable to reach the OpenAI endpoint.';
    logMessage(error.message || 'Network error');
  } finally {
    generateBtn.disabled = false;
  }
}

async function handleDeploy() {
  if (!currentHtml) {
    generateStatus.textContent = 'Generate HTML before deploying to Vercel.';
    return;
  }

  const token = getActiveKey(vercelInput, defaultSecrets.vercel, 'vercel');
  if (!token) {
    generateStatus.textContent = 'Add a Vercel token or wait for shared defaults.';
    return;
  }

  if (!canUseSharedKey('vercel')) {
    generateStatus.textContent = sharedLimitMessage();
    return;
  }

  const projectName = (vercelProjectInput.value || '').trim() || 'web-builder-demo';
  generateStatus.textContent = `Deploying ${projectName}...`;
  logMessage(`Deploying to Vercel project ${projectName}`);

  try {
    const response = await fetch('/api/vercel-deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, projectName, html: currentHtml })
    });

    const result = await response.json();
    if (!response.ok) {
      generateStatus.textContent = result?.error || 'Vercel deployment failed.';
      logMessage(generateStatus.textContent);
      return;
    }

    generateStatus.textContent = `Deployed: ${result.url || result.inspectUrl}`;
    logMessage(`Deployment ready at ${result.url || 'Vercel inspect panel'}`);
  } catch (error) {
    generateStatus.textContent = 'Unable to reach the Vercel deploy API.';
    logMessage(error.message || 'Network error');
  }
}

async function handlePublish() {
  if (!currentHtml) {
    generateStatus.textContent = 'Generate HTML before publishing to GitHub.';
    return;
  }

  const token = getActiveKey(githubInput, defaultSecrets.github, 'github');
  if (!token) {
    generateStatus.textContent = 'Add a GitHub token or wait for shared defaults.';
    return;
  }

  if (!canUseSharedKey('github')) {
    generateStatus.textContent = sharedLimitMessage();
    return;
  }

  const repo = (githubRepoInput.value || '').trim();
  if (!repo || !repo.includes('/')) {
    generateStatus.textContent = 'Enter the repo as owner/name.';
    return;
  }

  const [owner, name] = repo.split('/');
  const branch = (githubBranchInput.value || '').trim() || 'main';
  const path = (githubPathInput.value || '').trim() || 'index.html';
  const message = (githubMessageInput.value || '').trim() || 'chore: add generated site';

  generateStatus.textContent = `Publishing to ${repo}...`;
  logMessage(`Publishing to GitHub repo ${repo}`);

  try {
    const response = await fetch('/api/github-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, owner, repo: name, branch, path, content: currentHtml, message })
    });

    const result = await response.json();
    if (!response.ok) {
      generateStatus.textContent = result?.error || 'GitHub publish failed.';
      logMessage(generateStatus.textContent);
      return;
    }

    generateStatus.textContent = `Published to ${repo}@${branch}:${path}`;
    logMessage(`GitHub commit ready: ${result.commitSha || 'see repo history'}`);
  } catch (error) {
    generateStatus.textContent = 'Unable to reach the GitHub publish API.';
    logMessage(error.message || 'Network error');
  }
}

function keyTargetForInput(input) {
  if (input === openaiInput) return 'openai';
  if (input === vercelInput) return 'vercel';
  return 'github';
}

function wireEvents() {
  saveKeysBtn.addEventListener('click', saveLocalKeys);
  clearKeysBtn.addEventListener('click', clearLocalKeys);
  generateBtn.addEventListener('click', handleGenerate);
  deployBtn.addEventListener('click', handleDeploy);
  publishBtn.addEventListener('click', handlePublish);

  [openaiInput, vercelInput, githubInput].forEach(input => {
    input.addEventListener('input', () => {
      refreshSharedKeyUsage(keyTargetForInput(input), input.value);
    });
  });
}
