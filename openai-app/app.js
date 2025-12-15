const gun = Gun({ peers: window.__GUN_PEERS__ || undefined });
const user = gun.user();
const portalRoot = gun.get('3dvr-portal');
// Gun graph: 3dvr-portal/ai-workbench/<identityKey>/<resource>
const workbenchRoot = portalRoot.get('ai-workbench');
// Gun graph: 3dvr-portal/ai-workbench/defaults -> { apiKeyCipher, hint, updatedAt, updatedBy }
const defaultsNode = workbenchRoot.get('defaults');

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
const storedSession = storage.getItem(sessionKey);
let sessionId = storedSession || Gun.text.random();
storage.setItem(sessionKey, sessionId);
let identityKey = sessionId;
let transcriptNode = workbenchRoot.get(identityKey).get('transcripts');
let deploymentNode = workbenchRoot.get(identityKey).get('vercel');
let githubNode = workbenchRoot.get(identityKey).get('github');
let secretsNode = workbenchRoot.get(identityKey).get('secrets');
// Gun graph: ai/key-vault/<alias> -> { cipher, updatedAt, alias }
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
const vaultStatus = document.getElementById('vault-status');
const vaultAutoSyncToggle = document.getElementById('vault-auto-sync');
const vaultRememberPassphraseToggle = document.getElementById('vault-remember-passphrase');
const vaultAccountAliasToggle = document.getElementById('vault-use-account-alias');
const vaultAutoLoadToggle = document.getElementById('vault-auto-load');
const vaultAutoStatus = document.getElementById('vault-auto-status');
const defaultPassphraseInput = document.getElementById('default-passphrase');
const loadDefaultBtn = document.getElementById('load-default');
const defaultKeyStatus = document.getElementById('default-key-status');

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
  }

  if (vercelToken) {
    vercelTokenInput.value = vercelToken;
    storage.setItem(vercelTokenStorageKey, vercelToken);
  }

  if (githubToken) {
    githubTokenInput.value = githubToken;
    storage.setItem(githubTokenStorageKey, githubToken);
  }

  if (apiKey || vercelToken || githubToken) {
    updateAccountStatus('Secrets restored from your Gun account.');
  }
}

function subscribeToDefaults() {
  defaultsNode.on(data => {
    currentDefaultConfig = data || {};
    if (currentDefaultConfig.apiKeyCipher) {
      setDefaultKeyStatus(currentDefaultConfig.hint || 'Admin provided a default key. Add the passphrase to apply it.');
    } else {
      setDefaultKeyStatus('No admin default key configured yet.');
    }
  });
}

async function loadDefaultKey() {
  if (!currentDefaultConfig.apiKeyCipher) {
    setDefaultKeyStatus('No default key available yet.');
    return;
  }

  const passphrase = (defaultPassphraseInput?.value || '').trim();
  if (!passphrase) {
    setDefaultKeyStatus('Enter the passphrase to unlock the admin default key.');
    return;
  }

  try {
    const decrypted = await Gun.SEA.decrypt(currentDefaultConfig.apiKeyCipher, passphrase);
    if (!decrypted) {
      setDefaultKeyStatus('Passphrase incorrect. Try again.');
      return;
    }
    apiKeyInput.value = decrypted;
    storage.setItem(apiKeyStorageKey, decrypted);
    await saveSecretToAccount('openaiApiKey', decrypted);
    updateStorageModeNotice('Loaded admin default key.');
    setDefaultKeyStatus('Default key applied to this session.');
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
  }
}

async function putVaultRecord(alias, passphrase, targetKey, secretValue) {
  if (!Gun.SEA || typeof Gun.SEA.encrypt !== 'function') {
    throw new Error('Gun SEA not available. Refresh and try again.');
  }

  const cipher = await Gun.SEA.encrypt(secretValue, passphrase);
  const record = { alias, cipher, updatedAt: Date.now(), target: targetKey };

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
    setVaultStatus(`${target.label} encrypted and stored in Gun. Use the same alias and passphrase on any device.`);
  } catch (error) {
    setVaultStatus(`Error encrypting or saving: ${error.message}`);
  }
}

function fetchVaultRecord(alias) {
  return new Promise((resolve) => {
    keyVaultNode.get(alias).once((data) => resolve(data));
  });
}

async function loadVaultSecret({ alias, passphrase, targetKey, silent = false }) {
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
    setVaultStatus('Fetching and decrypting secret from Gun...');
  }

  try {
    const record = await fetchVaultRecord(alias);
    if (!record || !record.cipher) {
      if (!silent) {
        setVaultStatus('No encrypted secret found for that alias.');
      }
      return false;
    }

    const vaultTarget = getVaultTargetConfig(record.target || targetKey || 'openai');

    if (vaultTargetSelect) {
      vaultTargetSelect.value = vaultTarget.key;
    }

    const decrypted = await Gun.SEA.decrypt(record.cipher, passphrase);
    if (!decrypted) {
      if (!silent) {
        setVaultStatus('Decryption failed. Check your passphrase and try again.');
      }
      return false;
    }

    if (vaultTarget.input) {
      vaultTarget.input.value = decrypted;
    }

    if (vaultTarget.storageKey) {
      storage.setItem(vaultTarget.storageKey, decrypted);
    }

    if (vaultTarget.accountField) {
      saveSecretToAccount(vaultTarget.accountField, decrypted);
    }

    if (!silent) {
      updateStorageModeNotice(`${vaultTarget.label} loaded from Gun and stored locally for this device.`);
      setVaultStatus(`${vaultTarget.label} loaded from Gun and applied to this session.`);
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
  }
}

function loadStoredGithubToken() {
  const stored = storage.getItem(githubTokenStorageKey);
  if (stored) {
    githubTokenInput.value = stored;
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

repoOwnerRadios.forEach((radio) => radio.addEventListener('change', toggleRepoOrgField));
toggleRepoOrgField();

function buildRepoEndpoint(ownerType, orgName) {
  if (ownerType === 'org') {
    return `https://api.github.com/orgs/${encodeURIComponent(orgName)}/repos`;
  }
  return 'https://api.github.com/user/repos';
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

async function createGithubRepo(event) {
  event.preventDefault();
  const token = githubTokenInput.value.trim();
  const ownerType = document.querySelector('input[name="repo-owner"]:checked')?.value;
  const orgName = repoOrgInput.value.trim();
  const repoName = repoNameInput.value.trim();
  const visibility = repoVisibilitySelect.value;
  const description = repoDescriptionInput.value.trim();
  const autoInit = repoReadmeCheckbox.checked;
  const deleteBranchOnMerge = repoBranchCleanupCheckbox.checked;

  if (!token) {
    setRepoStatus('Add a GitHub token first.', 'error');
    return;
  }

  if (!repoName) {
    setRepoStatus('Name your repository to continue.', 'error');
    return;
  }

  if (ownerType === 'org' && !orgName) {
    setRepoStatus('Enter the organization handle.', 'error');
    return;
  }

  setRepoStatus('Creating repository…');
  createRepoBtn.disabled = true;

  const payload = {
    name: repoName,
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

  try {
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
      const message = data?.message || 'GitHub returned an error. Check scopes and owner settings.';
      setRepoStatus(message, 'error');
      return;
    }

    const details = data?.full_name || repoName;
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
  } catch (error) {
    setRepoStatus('Network issue while talking to GitHub.', 'error');
  } finally {
    createRepoBtn.disabled = false;
  }
}

async function publishToGithub() {
  const token = githubTokenInput.value.trim();
  const repo = githubRepoInput.value.trim();
  const branch = githubBranchInput.value.trim() || 'main';
  const path = githubPathInput.value.trim() || 'index.html';
  const message = githubMessageInput.value.trim();
  const html = sanitizeResponseContent(outputBox.textContent || '');

  if (!token) {
    setGithubStatus('Add your GitHub token to publish.');
    return;
  }

  if (!repo || !repo.includes('/')) {
    setGithubStatus('Provide the repo in the form owner/name.');
    return;
  }

  if (!html || html.length < 20 || !html.toLowerCase().includes('<html')) {
    setGithubStatus('Generate HTML in the response before publishing to GitHub.');
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
    setGithubStatus(`Error: ${error.message}`);
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
});

submitBtn.addEventListener('click', sendToOpenAI);
applyPreviewBtn.addEventListener('click', applyPreview);
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
});

clearVercelBtn.addEventListener('click', () => {
  storage.removeItem(vercelTokenStorageKey);
  vercelTokenInput.value = '';
  setVercelStatus('Vercel token cleared from this browser.');
  removeAccountSecret('vercelToken');
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
});

clearGithubBtn.addEventListener('click', () => {
  storage.removeItem(githubTokenStorageKey);
  githubTokenInput.value = '';
  setGithubStatus('GitHub token cleared from this browser.');
  removeAccountSecret('githubToken');
});

loadDefaultBtn?.addEventListener('click', loadDefaultKey);

createRepoBtn.addEventListener('click', createGithubRepo);
githubBtn.addEventListener('click', publishToGithub);
vaultSaveBtn?.addEventListener('click', saveKeyToVault);
vaultLoadBtn?.addEventListener('click', loadKeyFromVault);

restoreAutoVaultPreferences();

recallUserSession();
subscribeToDefaults();
user.on('auth', () => {
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
  hydrateAccountSecrets();
});
attemptStoredAuth();

updateStorageModeNotice();
loadStoredKey();
loadStoredVercelToken();
loadStoredGithubToken();
maybeAutoLoadVaultSecret();
startHistorySubscription();
startDeploymentSubscription();
startGithubSubscription();
