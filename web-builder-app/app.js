import {
  hasEncryptedDefault,
  listAvailableDefaultTargets,
  readDefaultSecret
} from './defaults.js';

const gun = Gun({ peers: window.__GUN_PEERS__ || undefined });
const portalRoot = gun.get('3dvr-portal');
const workbenchRoot = portalRoot.get('ai-workbench');
// Gun graph: 3dvr-portal/ai-workbench/defaults -> { apiKey, vercelToken, githubToken, ... }
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
let currentDefaultConfig = {};
let currentHtml = '';
let currentTitle = '';

const identityStorageKey = 'web-builder-identity';
const openaiStorageKey = 'web-builder-openai';
const vercelStorageKey = 'web-builder-vercel';
const githubStorageKey = 'web-builder-github';

const identityLabel = document.getElementById('identity-label');
const loadDefaultsBtn = document.getElementById('load-defaults');
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

const STATUS_TONE_CLASSES = ['status--info', 'status--success', 'status--warning', 'status--error'];
const LOAD_DEFAULTS_LABEL = 'Load shared defaults';

const identityKey = resolveIdentity();

hydrateStoredKeys();
subscribeToDefaults();
subscribeToBillingTier();
subscribeToUsageCounters();
wireEvents();
renderIdentity();
logMessage('Ready to build with shared defaults and daily limits.');

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

function setStatusMessage(element, message, tone = 'info') {
  if (!element) return;
  element.textContent = message;
  element.classList.remove(...STATUS_TONE_CLASSES);
  element.classList.add(`status--${tone}`);
}

function setDefaultStatus(message, tone = 'info') {
  setStatusMessage(defaultStatus, message, tone);
}

function setSharedUsageStatus(message, tone = 'info') {
  setStatusMessage(sharedUsageStatus, message, tone);
}

function setGenerateStatus(message, tone = 'info') {
  setStatusMessage(generateStatus, message, tone);
}

function setLoadDefaultsBusy(isBusy) {
  if (!loadDefaultsBtn) return;
  loadDefaultsBtn.disabled = isBusy;
  loadDefaultsBtn.textContent = isBusy ? 'Loading defaults...' : LOAD_DEFAULTS_LABEL;
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
    currentDefaultConfig = data || {};

    const plainAvailable = describeTargets(
      listAvailableDefaultTargets(currentDefaultConfig, { includePlain: true, includeCipher: false })
    );
    const encryptedAvailable = describeTargets(
      listAvailableDefaultTargets(currentDefaultConfig, { includePlain: false, includeCipher: true })
    );

    if (!plainAvailable.length && !encryptedAvailable.length) {
      setDefaultStatus('No shared defaults yet. Ask an admin to publish defaults in /admin.', 'warning');
      return;
    }

    if (plainAvailable.length) {
      setDefaultStatus(
        `${plainAvailable.join(', ')} defaults are ready. Click "Load shared defaults" to apply them.`,
        'success'
      );
      loadDefaults({ force: false, silent: true });
      return;
    }

    setDefaultStatus(
      `${encryptedAvailable.join(', ')} defaults are encrypted-only. Admin fix: /admin -> Recover encrypted defaults.`,
      'warning'
    );
  });
}

function describeTargets(targets) {
  return targets
    .map(targetKey => {
      if (targetKey === 'openai') return 'OpenAI';
      if (targetKey === 'vercel') return 'Vercel';
      if (targetKey === 'github') return 'GitHub';
      return targetKey;
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

function updateSharedUsageStatus(message, tone = 'info') {
  if (message) {
    setSharedUsageStatus(message, tone);
    return;
  }

  if (!usingAnySharedKey()) {
    setSharedUsageStatus('Using personal keys. Shared daily limits are idle.', 'info');
    return;
  }

  const tier = resolveUsageTier();
  const used = sharedUsageCounts.total || 0;
  const limit = SHARED_USAGE_LIMITS[tier] || SHARED_USAGE_LIMITS.account;
  const label = TIER_LABELS[tier] || tier;

  setSharedUsageStatus(`Shared key usage today: ${used}/${limit} (${label}).`, 'success');
}

function sharedLimitMessage() {
  const tier = resolveUsageTier();
  const used = sharedUsageCounts.total || 0;
  const limit = SHARED_USAGE_LIMITS[tier] || SHARED_USAGE_LIMITS.account;
  const label = TIER_LABELS[tier] || tier;
  return `Daily shared-key limit reached: ${used}/${limit} for ${label}. Add personal keys or try tomorrow.`;
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
    updateSharedUsageStatus(sharedLimitMessage(), 'warning');
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

async function loadDefaults(options = {}) {
  return loadDefaultsWithOptions(options);
}

async function loadDefaultsWithOptions(options = {}) {
  const { force = true, silent = false } = options;
  const hasCachedConfig = Object.keys(currentDefaultConfig || {}).length > 0;
  const config = hasCachedConfig ? currentDefaultConfig : await new Promise(resolve => defaultsNode.once(resolve));
  const targets = [
    {
      key: 'openai',
      label: 'OpenAI',
      input: openaiInput,
      storageKey: openaiStorageKey
    },
    {
      key: 'vercel',
      label: 'Vercel',
      input: vercelInput,
      storageKey: vercelStorageKey
    },
    {
      key: 'github',
      label: 'GitHub',
      input: githubInput,
      storageKey: githubStorageKey
    }
  ];

  const applied = [];
  const skipped = [];

  targets.forEach(target => {
    const value = readDefaultSecret(config, target.key);
    if (!value) {
      defaultSecrets[target.key] = '';
      refreshSharedKeyUsage(target.key, target.input.value);
      return;
    }

    const existing = (target.input.value || '').trim();
    const hasPersonalValue = existing && existing !== defaultSecrets[target.key];
    if (!force && hasPersonalValue) {
      skipped.push(target.label);
      return;
    }

    target.input.value = value;
    safeWrite(localStorage, target.storageKey, value);
    defaultSecrets[target.key] = value;
    refreshSharedKeyUsage(target.key, value);
    applied.push(target.label);
  });

  if (applied.length) {
    if (!silent) {
      const notes = [`Defaults applied: ${applied.join(', ')}.`];
      if (skipped.length) {
        notes.push(`Kept personal keys for ${skipped.join(', ')}.`);
      }
      setDefaultStatus(`${notes.join(' ')} Shared limits are active for those keys.`, 'success');
    }
    updateSharedUsageStatus();
    return;
  }

  const encryptedOnly = ['openai', 'vercel', 'github'].filter(targetKey => {
    return !readDefaultSecret(config, targetKey) && hasEncryptedDefault(config, targetKey);
  });

  if (encryptedOnly.length) {
    if (!silent) {
      const labels = describeTargets(encryptedOnly);
      setDefaultStatus(
        `${labels.join(', ')} defaults are encrypted-only. Admin fix: /admin -> Recover encrypted defaults.`,
        'warning'
      );
    }
    return;
  }

  if (skipped.length) {
    if (!silent) {
      setDefaultStatus(`Shared defaults are ready. Kept your personal keys for ${skipped.join(', ')}.`, 'info');
    }
    return;
  }

  if (!silent) {
    setDefaultStatus('No shared defaults are configured yet.', 'warning');
  }
}

function saveLocalKeys() {
  safeWrite(localStorage, openaiStorageKey, openaiInput.value.trim());
  safeWrite(localStorage, vercelStorageKey, vercelInput.value.trim());
  safeWrite(localStorage, githubStorageKey, githubInput.value.trim());
  updateKeyStatus('Saved personal keys on this device.');
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
  updateKeyStatus('Removed personal keys from this device.');
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
    setGenerateStatus('Add an OpenAI key or click "Load shared defaults" first.', 'warning');
    return;
  }

  if (!canUseSharedKey('openai')) {
    setGenerateStatus(sharedLimitMessage(), 'warning');
    return;
  }

  const prompt = buildPrompt();
  generateBtn.disabled = true;
  setGenerateStatus('Generating your site with OpenAI...', 'info');
  logMessage('Sending brief to /api/openai-site');

  try {
    const response = await fetch('/api/openai-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, apiKey })
    });

    const result = await response.json();
    if (!response.ok) {
      const message = result?.error || 'Unexpected OpenAI error.';
      setGenerateStatus(message, 'error');
      logMessage(message);
      return;
    }

    currentHtml = result.html || '';
    currentTitle = result.title || siteTitleInput.value || 'Generated site';

    renderPreview(currentHtml);
    setGenerateStatus(result.summary || 'Site generated. Preview updated.', 'success');
    logMessage('Site generated. Preview updated.');
  } catch (error) {
    setGenerateStatus('Unable to reach the OpenAI endpoint.', 'error');
    logMessage(error.message || 'Network error');
  } finally {
    generateBtn.disabled = false;
  }
}

async function handleDeploy() {
  if (!currentHtml) {
    setGenerateStatus('Generate HTML before deploying to Vercel.', 'warning');
    return;
  }

  const token = getActiveKey(vercelInput, defaultSecrets.vercel, 'vercel');
  if (!token) {
    setGenerateStatus('Add a Vercel token or click "Load shared defaults".', 'warning');
    return;
  }

  if (!canUseSharedKey('vercel')) {
    setGenerateStatus(sharedLimitMessage(), 'warning');
    return;
  }

  const projectName = (vercelProjectInput.value || '').trim() || 'web-builder-demo';
  setGenerateStatus(`Deploying ${projectName}...`, 'info');
  logMessage(`Deploying to Vercel project ${projectName}`);

  try {
    const response = await fetch('/api/vercel-deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, projectName, html: currentHtml })
    });

    const result = await response.json();
    if (!response.ok) {
      const message = result?.error || 'Vercel deployment failed.';
      setGenerateStatus(message, 'error');
      logMessage(message);
      return;
    }

    setGenerateStatus(`Deployed: ${result.url || result.inspectUrl}`, 'success');
    logMessage(`Deployment ready at ${result.url || 'Vercel inspect panel'}`);
  } catch (error) {
    setGenerateStatus('Unable to reach the Vercel deploy API.', 'error');
    logMessage(error.message || 'Network error');
  }
}

async function handlePublish() {
  if (!currentHtml) {
    setGenerateStatus('Generate HTML before publishing to GitHub.', 'warning');
    return;
  }

  const token = getActiveKey(githubInput, defaultSecrets.github, 'github');
  if (!token) {
    setGenerateStatus('Add a GitHub token or click "Load shared defaults".', 'warning');
    return;
  }

  if (!canUseSharedKey('github')) {
    setGenerateStatus(sharedLimitMessage(), 'warning');
    return;
  }

  const repo = (githubRepoInput.value || '').trim();
  if (!repo || !repo.includes('/')) {
    setGenerateStatus('Enter the GitHub repo as owner/name.', 'warning');
    return;
  }

  const [owner, name] = repo.split('/');
  const branch = (githubBranchInput.value || '').trim() || 'main';
  const path = (githubPathInput.value || '').trim() || 'index.html';
  const message = (githubMessageInput.value || '').trim() || 'chore: add generated site';

  setGenerateStatus(`Publishing to ${repo}...`, 'info');
  logMessage(`Publishing to GitHub repo ${repo}`);

  try {
    const response = await fetch('/api/github-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, owner, repo: name, branch, path, content: currentHtml, message })
    });

    const result = await response.json();
    if (!response.ok) {
      const message = result?.error || 'GitHub publish failed.';
      setGenerateStatus(message, 'error');
      logMessage(message);
      return;
    }

    setGenerateStatus(`Published to ${repo}@${branch}:${path}`, 'success');
    logMessage(`GitHub commit ready: ${result.commitSha || 'see repo history'}`);
  } catch (error) {
    setGenerateStatus('Unable to reach the GitHub publish API.', 'error');
    logMessage(error.message || 'Network error');
  }
}

function keyTargetForInput(input) {
  if (input === openaiInput) return 'openai';
  if (input === vercelInput) return 'vercel';
  return 'github';
}

function wireEvents() {
  loadDefaultsBtn.addEventListener('click', async () => {
    setLoadDefaultsBusy(true);
    try {
      await loadDefaultsWithOptions({ force: true });
    } finally {
      setLoadDefaultsBusy(false);
    }
  });
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
