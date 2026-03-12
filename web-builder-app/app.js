import {
  hasEncryptedDefault,
  listAvailableDefaultTargets,
  readDefaultSecret
} from './defaults.js';
import { classifyPreviewHref } from './preview-guards.js';

const gun = Gun({ peers: window.__GUN_PEERS__ || undefined });
const portalRoot = gun.get('3dvr-portal');
const workbenchRoot = portalRoot.get('ai-workbench');
// Gun graph: 3dvr-portal/ai-workbench/defaults -> { apiKey, vercelToken, githubToken, ... }
const defaultsNode = workbenchRoot.get('defaults');
// Gun graph: 3dvr-portal/ai-workbench/rate-limits/<YYYY-MM-DD>/<identityKey> -> usage counters
const rateLimitsNode = workbenchRoot.get('rate-limits');
const billingTierNode = portalRoot.get('billing').get('usageTier');

const SHARED_USAGE_LIMITS = {
  guest: 2,
  account: 5,
  supporter: 20,
  pro: 100,
  builder: 250
};

const TIER_LABELS = {
  guest: 'guest',
  account: 'account',
  supporter: '$5 supporter',
  pro: '$20 pro',
  builder: '$50 builder'
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
let currentSources = [];
let currentSearchUsage = null;
let generateStatusAnimationTimer = null;

const identityStorageKey = 'web-builder-identity';
const sharedBillingTierStorageKey = 'portal-usage-tier';
const userPubStorageKey = 'userPubKey';
const openaiStorageKey = 'web-builder-openai';
const vercelStorageKey = 'web-builder-vercel';
const githubStorageKey = 'web-builder-github';
const modelStorageKey = 'web-builder-model';

const STATUS_TONE_CLASSES = ['status--info', 'status--success', 'status--warning', 'status--error'];
const LOAD_DEFAULTS_LABEL = 'Reload shared defaults';

const menuToggle = document.getElementById('menu-toggle');
const builderNav = document.getElementById('builder-nav');
const profileLink = document.getElementById('builder-profile-link');
const profileNameLabel = document.getElementById('builder-profile-name');
const profileMetaLabel = document.getElementById('builder-profile-meta');
const identityLabel = document.getElementById('identity-label');
const configPanel = document.getElementById('config-panel');
const promptPanel = document.getElementById('prompt-panel');
const publishPanel = document.getElementById('publish-panel');
const loadDefaultsBtn = document.getElementById('load-defaults');
const defaultStatus = document.getElementById('default-status');
const sharedUsageStatus = document.getElementById('shared-usage');
const keyStatus = document.getElementById('key-status');
const openaiInput = document.getElementById('openai-key');
const vercelInput = document.getElementById('vercel-token');
const githubInput = document.getElementById('github-token');
const saveKeysBtn = document.getElementById('save-keys');
const clearKeysBtn = document.getElementById('clear-keys');
const builderRequestInput = document.getElementById('builder-request');
const iterationRequestInput = document.getElementById('iteration-request');
const builderModelSelect = document.getElementById('builder-model');
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
const iterateBtn = document.getElementById('iterate');
const deployBtn = document.getElementById('deploy');
const publishBtn = document.getElementById('publish');
const generateStatus = document.getElementById('generate-status');
const previewFrame = document.getElementById('preview');
const builderSources = document.getElementById('builder-sources');
const outputBox = document.getElementById('output');

const identityKey = resolveIdentity();

hydrateStoredKeys();
subscribeToDefaults();
subscribeToBillingTier();
subscribeToUsageCounters();
wireEvents();
initMenuToggle();
renderIdentity();
renderSources([]);
renderPreview('');
bindPreviewGuards();
logMessage('Ready. Describe the site, audience, and tone, then draft the first version.');

function resolveIdentity() {
  const storedPub = safeRead(localStorage, userPubStorageKey) || safeRead(sessionStorage, userPubStorageKey);
  if (storedPub) {
    return storedPub;
  }

  const storedAlias = safeRead(localStorage, 'alias') || safeRead(sessionStorage, 'alias');
  if (storedAlias) {
    return storedAlias;
  }

  const stored = safeRead(localStorage, identityStorageKey) || safeRead(sessionStorage, identityStorageKey);
  if (stored) {
    return stored;
  }

  const generated = Gun.text.random();
  safeWrite(localStorage, identityStorageKey, generated);
  return generated;
}

function aliasToDisplay(alias) {
  const normalized = String(alias || '').trim();
  if (!normalized) return '';
  return normalized.includes('@') ? normalized.split('@')[0] : normalized;
}

function compactIdentity(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'guest';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function resolveStoredProfile() {
  const signedIn = safeRead(localStorage, 'signedIn') === 'true';
  const guest = !signedIn && safeRead(localStorage, 'guest') === 'true';
  const alias = String(safeRead(localStorage, 'alias') || '').trim();
  const username = String(safeRead(localStorage, 'username') || '').trim();
  const guestName = String(safeRead(localStorage, 'guestDisplayName') || '').trim();

  if (signedIn) {
    return {
      alias,
      name: (username && username.toLowerCase() !== 'guest' ? username : aliasToDisplay(alias)) || 'Member',
      signedIn: true,
      guest: false
    };
  }

  if (guest) {
    return {
      alias,
      name: guestName || aliasToDisplay(alias) || 'Guest',
      signedIn: false,
      guest: true
    };
  }

  return {
    alias,
    name: aliasToDisplay(alias) || username || 'Guest',
    signedIn: false,
    guest: false
  };
}

function initMenuToggle() {
  if (!menuToggle || !builderNav) {
    return;
  }

  const mobileQuery = window.matchMedia('(max-width: 720px)');

  function closeMenu() {
    document.body.classList.remove('nav-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  menuToggle.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('nav-open');
    menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  builderNav.addEventListener('click', (event) => {
    if (mobileQuery.matches && event.target && event.target.tagName === 'A') {
      closeMenu();
    }
  });

  const syncMenuState = () => {
    if (!mobileQuery.matches) {
      closeMenu();
    }
  };

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', syncMenuState);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(syncMenuState);
  }

  syncMenuState();
}

function renderIdentity() {
  const tierLabel = TIER_LABELS[currentUsageTier] || currentUsageTier;
  const profile = resolveStoredProfile();
  const builderId = compactIdentity(identityKey);
  const identityText = profile.alias ? `${profile.name} (${profile.alias})` : profile.name;

  identityLabel.textContent = `${identityText} - ${tierLabel} tier - builder ${builderId}`;

  if (profileNameLabel) {
    profileNameLabel.textContent = profile.name;
  }

  if (profileMetaLabel) {
    const parts = [];
    if (profile.alias) {
      parts.push(profile.alias);
    } else if (profile.guest) {
      parts.push('guest profile');
    } else {
      parts.push(`builder ${builderId}`);
    }
    parts.push(`${tierLabel} tier`);
    profileMetaLabel.textContent = parts.join(' - ');
  }

  if (profileLink) {
    profileLink.title = profile.alias ? `${profile.name} (${profile.alias})` : `${profile.name} profile`;
  }
}

function renderSources(sources) {
  if (!builderSources) {
    return;
  }

  currentSources = Array.isArray(sources) ? sources : [];

  if (!currentSources.length) {
    if (currentSearchUsage === true) {
      builderSources.innerHTML = 'Live web search ran for the latest draft, but no source list was returned.';
      return;
    }

    if (currentSearchUsage === false) {
      builderSources.innerHTML = 'The model did not use live web search for the latest draft.';
      return;
    }

    builderSources.innerHTML = 'The model will use live web search only when it needs current sources.';
    return;
  }

  builderSources.innerHTML = currentSources.map(source => {
    const title = escapeHtml(source?.title || source?.url || 'Source');
    const url = escapeAttribute(sanitizeSourceUrl(source?.url));
    return `<a class="source-link" href="${url}" target="_blank" rel="noopener">${title}</a>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function sanitizeSourceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
  } catch (error) {
    // Ignore invalid URLs and fall back to a safe inert target.
  }

  return '#';
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

function revealPanel(panel) {
  if (panel && !panel.open) {
    panel.open = true;
  }
}

function revealConfig() {
  revealPanel(configPanel);
}

function revealPromptPanel() {
  revealPanel(promptPanel);
}

function revealPublishPanel() {
  revealPanel(publishPanel);
}

function setStatusMessage(element, message, tone = 'info') {
  if (!element) return;
  element.textContent = message;
  element.classList.remove(...STATUS_TONE_CLASSES);
  element.classList.add(`status--${tone}`);
}

function updateKeyStatus(message) {
  keyStatus.textContent = message;
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

function stopGenerateStatusAnimation() {
  if (generateStatusAnimationTimer) {
    clearInterval(generateStatusAnimationTimer);
    generateStatusAnimationTimer = null;
  }
}

function startGenerateStatusAnimation(baseMessage, tone = 'info') {
  stopGenerateStatusAnimation();

  const normalizedBase = String(baseMessage || '').replace(/\.+$/, '');
  const frames = ['.', '..', '...'];
  let frameIndex = 0;

  const render = () => {
    setStatusMessage(generateStatus, `${normalizedBase}${frames[frameIndex]}`, tone);
  };

  render();
  generateStatusAnimationTimer = window.setInterval(() => {
    frameIndex = (frameIndex + 1) % frames.length;
    render();
  }, 420);
}

function setLoadDefaultsBusy(isBusy) {
  if (!loadDefaultsBtn) return;
  loadDefaultsBtn.disabled = isBusy;
  loadDefaultsBtn.textContent = isBusy ? 'Loading...' : LOAD_DEFAULTS_LABEL;
}

function setGenerationBusy(isBusy) {
  if (generateBtn) generateBtn.disabled = isBusy;
  if (iterateBtn) iterateBtn.disabled = isBusy;
}

function hydrateStoredKeys() {
  const openai = safeRead(localStorage, openaiStorageKey) || safeRead(sessionStorage, openaiStorageKey);
  const vercel = safeRead(localStorage, vercelStorageKey) || safeRead(sessionStorage, vercelStorageKey);
  const github = safeRead(localStorage, githubStorageKey) || safeRead(sessionStorage, githubStorageKey);
  const model = safeRead(localStorage, modelStorageKey) || safeRead(sessionStorage, modelStorageKey);

  if (openai) openaiInput.value = openai;
  if (vercel) vercelInput.value = vercel;
  if (github) githubInput.value = github;
  if (model && builderModelSelect?.querySelector(`option[value="${CSS.escape(model)}"]`)) {
    builderModelSelect.value = model;
  }

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
        `${plainAvailable.join(', ')} defaults detected. Auto-applying in background.`,
        'success'
      );
      loadDefaultsWithOptions({ force: false, silent: true });
      return;
    }

    setDefaultStatus(
      `${encryptedAvailable.join(', ')} defaults are encrypted-only. Ask admin to recover them in /admin.`,
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
  if (['supporter', 'starter', 'paid', '5'].includes(normalized)) return 'supporter';
  if (['pro', '20'].includes(normalized)) return 'pro';
  if (['builder', '50'].includes(normalized)) return 'builder';
  return 'guest';
}

currentUsageTier = normalizeTier(
  safeRead(localStorage, sharedBillingTierStorageKey) || safeRead(localStorage, 'openai-workbench-tier')
) || currentUsageTier;

function resolveUsageTier() {
  return currentUsageTier || 'guest';
}

function subscribeToBillingTier() {
  detachTierSubscription();
  tierSubscription = billingTierNode.get(identityKey);
  tierSubscription.on(data => {
    const nextTier = normalizeTier(data?.tier || data?.plan || data);
    currentUsageTier = nextTier;
    safeWrite(localStorage, sharedBillingTierStorageKey, nextTier);
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
    setSharedUsageStatus('Using personal keys or no keys. Shared limits are idle.', 'info');
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
  return `Daily shared-key limit reached: ${used}/${limit} for ${label}. Use personal keys or try tomorrow.`;
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
      const notes = [`Loaded shared defaults: ${applied.join(', ')}.`];
      if (skipped.length) {
        notes.push(`Kept personal keys for ${skipped.join(', ')}.`);
      }
      setDefaultStatus(notes.join(' '), 'success');
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
        `${labels.join(', ')} defaults are encrypted-only. Ask admin to recover in /admin.`,
        'warning'
      );
    }
    return;
  }

  if (skipped.length) {
    if (!silent) {
      setDefaultStatus(`Shared defaults are ready. Kept personal keys for ${skipped.join(', ')}.`, 'info');
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
  safeWrite(localStorage, modelStorageKey, builderModelSelect?.value || '');
  updateKeyStatus('Saved personal keys on this device.');
  refreshSharedKeyUsage('openai', openaiInput.value);
  refreshSharedKeyUsage('vercel', vercelInput.value);
  refreshSharedKeyUsage('github', githubInput.value);
}

function clearLocalKeys() {
  safeRemove(localStorage, openaiStorageKey);
  safeRemove(localStorage, vercelStorageKey);
  safeRemove(localStorage, githubStorageKey);
  safeRemove(localStorage, modelStorageKey);
  safeRemove(sessionStorage, openaiStorageKey);
  safeRemove(sessionStorage, vercelStorageKey);
  safeRemove(sessionStorage, githubStorageKey);
  safeRemove(sessionStorage, modelStorageKey);
  openaiInput.value = '';
  vercelInput.value = '';
  githubInput.value = '';
  if (builderModelSelect) {
    builderModelSelect.value = 'gpt-4.1-mini';
  }
  updateKeyStatus('Removed personal keys from this device.');
  refreshSharedKeyUsage('openai', '');
  refreshSharedKeyUsage('vercel', '');
  refreshSharedKeyUsage('github', '');
}

function buildPromptHints() {
  const hints = [];
  const title = (siteTitleInput?.value || '').trim();
  const goal = (siteGoalInput?.value || '').trim();
  const audience = (siteAudienceInput?.value || '').trim();
  const style = (siteStyleSelect?.value || '').trim();
  const extras = (siteExtrasInput?.value || '').trim();

  if (title) hints.push(`Preferred title: ${title}.`);
  if (goal) hints.push(`Primary goal/CTA: ${goal}.`);
  if (audience) hints.push(`Target audience: ${audience}.`);
  if (style) hints.push(`Design style: ${style}.`);
  if (extras) hints.push(`Extra notes: ${extras}.`);

  return hints;
}

function buildInitialPrompt() {
  const request = (builderRequestInput?.value || '').trim();
  if (!request) return '';

  const parts = [
    `Create a single-page website for this request: ${request}.`,
    'Return json with title, summary, and html keys.',
    'The summary must briefly explain the page structure, tone, and any date-sensitive footer or legal copy choices.',
    'Use semantic HTML with inline CSS only and no external assets/scripts.',
    'The html value must be a complete standalone HTML document with doctype, html, head, and body tags.',
    'Prioritize accessibility, clear hierarchy, and mobile-first layout.',
    'Avoid a flat pure-white page background unless the request explicitly asks for it. Use a more intentional visual atmosphere that matches the brief.'
  ];

  const hints = buildPromptHints();
  if (hints.length) {
    parts.push(...hints);
  }

  return parts.join(' ');
}

function buildIterationPrompt(iterationRequest) {
  return [
    'Revise this existing single-page website using the request below.',
    `Revision request: ${iterationRequest}`,
    'Return json with title, summary, and html keys.',
    'The summary must briefly explain what changed, including any footer or legal-copy updates.',
    'The html value must be a complete updated HTML document, not a fragment or partial diff.',
    'Keep the page accessible and mobile-friendly.',
    'Preserve a deliberate page atmosphere and avoid regressing to a flat pure-white background unless the request explicitly asks for it.',
    'Current HTML:',
    currentHtml
  ].join('\n\n');
}

function renderPreview(html) {
  previewFrame.srcdoc = buildPreviewDocument(html);
}

function bindPreviewGuards() {
  if (!previewFrame) {
    return;
  }

  previewFrame.addEventListener('load', () => {
    const doc = previewFrame.contentDocument;
    const frameWindow = previewFrame.contentWindow;

    if (!doc || !frameWindow) {
      return;
    }

    doc.addEventListener('click', (event) => {
      const link = event.target?.closest?.('a[href]');
      if (!link) {
        return;
      }

      const href = link.getAttribute('href');
      const action = classifyPreviewHref(href, window.location.href);

      if (action.action === 'hash') {
        event.preventDefault();
        const targetId = decodeURIComponent(String(action.hash || '').replace(/^#/, ''));
        const target = targetId ? doc.getElementById(targetId) : null;
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      if (action.action === 'external') {
        event.preventDefault();
        window.open(action.url, '_blank', 'noopener');
        return;
      }

      if (action.action === 'block' || action.action === 'stay') {
        event.preventDefault();
        frameWindow.scrollTo({ top: 0, behavior: 'smooth' });
        logMessage('Blocked preview navigation to a local portal route.');
      }
    });

    doc.addEventListener('submit', (event) => {
      event.preventDefault();
      logMessage('Blocked form submission inside the preview.');
    });
  });
}

function buildPreviewDocument(html) {
  const markup = (html || '').trim();

  if (!markup) {
    return [
      '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<style>',
      '*{box-sizing:border-box;}',
      'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      'background:radial-gradient(circle at top, rgba(95,176,255,0.22), transparent 30%),linear-gradient(180deg,#0a121f 0%,#070d16 100%);',
      'color:#e6eef7;}',
      '.preview-empty{max-width:560px;padding:28px;border-radius:24px;border:1px solid rgba(77,110,156,0.45);',
      'background:linear-gradient(180deg, rgba(15,25,43,0.94), rgba(9,16,27,0.96));',
      'box-shadow:0 24px 50px rgba(0,0,0,0.35);}',
      '.preview-empty p{margin:0 0 10px;color:#9db7da;letter-spacing:0.08em;text-transform:uppercase;font-size:12px;font-weight:700;}',
      '.preview-empty h1{margin:0 0 10px;font-size:clamp(1.6rem,4vw,2.4rem);}',
      '.preview-empty span{display:block;color:#c7d7ee;line-height:1.6;}',
      '</style></head><body>',
      '<section class="preview-empty"><p>Preview</p><h1>Describe a site to start the first draft.</h1><span>Your draft will render here, and you can keep refining it with revision requests.</span></section>',
      '</body></html>'
    ].join('');
  }

  return markup;
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

async function parseApiError(response) {
  const errorText = await response.text();
  let message = 'Unexpected OpenAI error.';

  try {
    const parsedError = JSON.parse(errorText);
    message = parsedError?.error || parsedError?.message || message;
  } catch (error) {
    if (errorText) {
      message = errorText;
    }
  }

  return message;
}

function shouldRetryWithoutStreaming(error) {
  const message = String(error?.message || '').trim();
  if (!message) {
    return true;
  }

  return /network|failed to fetch|load failed|streaming is not available|no generation result was returned|unexpected end|unexpected token/i.test(message);
}

async function requestGenerationJson(requestBody) {
  const response = await fetch('/api/openai-site', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json();
}

async function requestGenerationWithStreaming(requestBody, { onStatus } = {}) {
  const response = await fetch('/api/openai-site', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...requestBody,
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return readGenerationStream(response, { onStatus });
}

function parseSseBlock(block) {
  const normalized = String(block || '').replace(/\r/g, '');
  if (!normalized.trim()) {
    return null;
  }

  let eventName = 'message';
  const dataLines = [];

  normalized.split('\n').forEach(line => {
    if (!line || line.startsWith(':')) {
      return;
    }

    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
      return;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  });

  const rawData = dataLines.join('\n');
  if (!rawData || rawData === '[DONE]') {
    return null;
  }

  return {
    event: eventName,
    data: JSON.parse(rawData)
  };
}

async function readGenerationStream(response, { onStatus } = {}) {
  if (!response.body?.getReader) {
    throw new Error('Streaming is not available for this response.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '');

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex >= 0) {
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const parsed = parseSseBlock(block);

      if (parsed?.event === 'status') {
        onStatus?.(parsed.data);
      } else if (parsed?.event === 'result') {
        finalResult = parsed.data;
      } else if (parsed?.event === 'error') {
        throw new Error(parsed.data?.message || 'Streaming generation failed.');
      }

      separatorIndex = buffer.indexOf('\n\n');
    }
  }

  const trailing = parseSseBlock(buffer + decoder.decode());
  if (trailing?.event === 'status') {
    onStatus?.(trailing.data);
  } else if (trailing?.event === 'result') {
    finalResult = trailing.data;
  } else if (trailing?.event === 'error') {
    throw new Error(trailing.data?.message || 'Streaming generation failed.');
  }

  if (!finalResult) {
    throw new Error('No generation result was returned.');
  }

  return finalResult;
}

async function requestGeneration(prompt, mode) {
  const apiKey = getActiveKey(openaiInput, defaultSecrets.openai, 'openai');
  if (!apiKey) {
    setGenerateStatus('No OpenAI key available. Open Config and load defaults or add a personal key.', 'warning');
    revealConfig();
    return;
  }

  if (!canUseSharedKey('openai')) {
    setGenerateStatus(sharedLimitMessage(), 'warning');
    revealConfig();
    return;
  }

  setGenerationBusy(true);
  startGenerateStatusAnimation('Generating... please wait', 'info');
  if (mode === 'iterate') {
    logMessage('Sending revision request to /api/openai-site');
  } else {
    logMessage('Sending first-draft request to /api/openai-site');
  }

  try {
    const requestBody = {
      prompt,
      apiKey,
      model: builderModelSelect?.value || 'gpt-4.1-mini'
    };

    let result;
    try {
      result = await requestGenerationWithStreaming(requestBody, {
        onStatus(payload) {
          if (!payload?.message) {
            return;
          }

          startGenerateStatusAnimation(payload.message, payload.tone || 'info');
          logMessage(payload.message);
        }
      });
    } catch (error) {
      if (!shouldRetryWithoutStreaming(error)) {
        throw error;
      }

      logMessage(`Streaming status unavailable. Retrying without live updates. (${error.message || 'network error'})`);
      startGenerateStatusAnimation('Generating... please wait', 'info');
      result = await requestGenerationJson(requestBody);
    }

    currentHtml = result.html || '';
    currentTitle = result.title || currentTitle || (siteTitleInput?.value || '').trim() || 'Drafted site';
    currentSearchUsage = result.usedWebSearch === true;
    renderSources(result.sources || []);

    renderPreview(currentHtml);
    stopGenerateStatusAnimation();
    setGenerateStatus(
      result.summary || (mode === 'iterate' ? 'Revision applied. Review the updated draft.' : 'Draft ready to review.'),
      'success'
    );
    logMessage(
      mode === 'iterate'
        ? `Revision applied with ${result.model || 'OpenAI'}. Preview updated.`
        : `Draft ready with ${result.model || 'OpenAI'}. Preview updated.`
    );
    if (result.usedWebSearch) {
      logMessage(`Live search returned ${Array.isArray(result.sources) ? result.sources.length : 0} source(s).`);
    }

    if (mode === 'iterate' && iterationRequestInput) {
      iterationRequestInput.value = '';
    }
  } catch (error) {
    const message = error?.message || 'Unable to reach the OpenAI endpoint.';
    stopGenerateStatusAnimation();
    setGenerateStatus(message, 'error');
    logMessage(message);
  } finally {
    stopGenerateStatusAnimation();
    setGenerationBusy(false);
  }
}

async function handleGenerate() {
  const prompt = buildInitialPrompt();
  if (!prompt) {
    setGenerateStatus('Tell me what to build first.', 'warning');
    builderRequestInput?.focus();
    return;
  }

  await requestGeneration(prompt, 'generate');
}

async function handleIterate() {
  if (!currentHtml) {
    setGenerateStatus('Generate a draft first, then ask for a revision.', 'warning');
    return;
  }

  const iterationRequest = (iterationRequestInput?.value || '').trim();
  if (!iterationRequest) {
    setGenerateStatus('Type a revision request before applying changes.', 'warning');
    iterationRequestInput?.focus();
    return;
  }

  const prompt = buildIterationPrompt(iterationRequest);
  await requestGeneration(prompt, 'iterate');
}

async function handleDeploy() {
  if (!currentHtml) {
    setGenerateStatus('Generate a site first, then deploy from the Publish panel.', 'warning');
    return;
  }

  const token = getActiveKey(vercelInput, defaultSecrets.vercel, 'vercel');
  if (!token) {
    setGenerateStatus('Add a Vercel token in Config or use shared defaults.', 'warning');
    revealConfig();
    return;
  }

  if (!canUseSharedKey('vercel')) {
    setGenerateStatus(sharedLimitMessage(), 'warning');
    revealConfig();
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
    setGenerateStatus('Generate a site first, then publish from the Publish panel.', 'warning');
    return;
  }

  const token = getActiveKey(githubInput, defaultSecrets.github, 'github');
  if (!token) {
    setGenerateStatus('Add a GitHub token in Config or use shared defaults.', 'warning');
    revealConfig();
    return;
  }

  if (!canUseSharedKey('github')) {
    setGenerateStatus(sharedLimitMessage(), 'warning');
    revealConfig();
    return;
  }

  const repo = (githubRepoInput.value || '').trim();
  if (!repo || !repo.includes('/')) {
    setGenerateStatus('Enter the GitHub repo as owner/name in the Publish panel.', 'warning');
    revealPublishPanel();
    return;
  }

  const [owner, name] = repo.split('/');
  const branch = (githubBranchInput.value || '').trim() || 'main';
  const path = (githubPathInput.value || '').trim() || 'index.html';
  const message = (githubMessageInput.value || '').trim() || `chore: publish ${currentTitle || 'generated site'}`;

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
      const statusMessage = result?.error || 'GitHub publish failed.';
      setGenerateStatus(statusMessage, 'error');
      logMessage(statusMessage);
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
  iterateBtn.addEventListener('click', handleIterate);
  deployBtn.addEventListener('click', handleDeploy);
  publishBtn.addEventListener('click', handlePublish);

  [openaiInput, vercelInput, githubInput].forEach(input => {
    input.addEventListener('input', () => {
      refreshSharedKeyUsage(keyTargetForInput(input), input.value);
    });
  });

  builderModelSelect?.addEventListener('change', () => {
    safeWrite(localStorage, modelStorageKey, builderModelSelect.value);
    logMessage(`Selected model: ${builderModelSelect.value}`);
  });

  builderRequestInput?.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      handleGenerate();
    }
  });

  iterationRequestInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleIterate();
    }
  });
}

window.addEventListener('storage', (event) => {
  if (!event || ['signedIn', 'guest', 'alias', 'username', 'guestDisplayName'].includes(event.key)) {
    renderIdentity();
  }
});
