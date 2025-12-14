const gun = Gun({ peers: window.__GUN_PEERS__ || undefined });
const portalRoot = gun.get('3dvr-portal');
// Gun graph: 3dvr-portal/workbench-site-builder/<sessionId>/runs/<runId> -> { prompt, html, title, summary, createdAt }
const builderRoot = portalRoot.get('workbench-site-builder');

const keyStorageKey = 'openai-api-key';
const sessionKey = 'workbench-site-builder-session';
const sessionId = getOrCreateSession();
const historyNode = builderRoot.get(sessionId).get('runs');

const apiKeyInput = document.getElementById('api-key');
const keyStatus = document.getElementById('key-status');
const saveKeyBtn = document.getElementById('save-key');
const clearKeyBtn = document.getElementById('clear-key');
const generateBtn = document.getElementById('generate');
const clearBriefBtn = document.getElementById('clear-brief');
const generateStatus = document.getElementById('generate-status');
const outputBox = document.getElementById('output');
const previewFrame = document.getElementById('preview');
const previewTitle = document.getElementById('preview-title');
const historyList = document.getElementById('history');
const sessionLabel = document.getElementById('session-label');

const siteTitleInput = document.getElementById('site-title');
const siteBriefInput = document.getElementById('site-brief');
const toneSelect = document.getElementById('tone');
const paletteInput = document.getElementById('palette');
const ctaInput = document.getElementById('cta');
const audienceInput = document.getElementById('audience');
const extrasInput = document.getElementById('extras');

const seenRuns = new Set();

sessionLabel.textContent = sessionId;

hydrateStoredKey();
wireEvents();
loadHistory();

actionLog('Ready to build.');

function getOrCreateSession() {
  const stored = safeRead(localStorage, sessionKey) || safeRead(sessionStorage, sessionKey);
  if (stored) return stored;
  const id = Gun.text.random();
  safeWrite(localStorage, sessionKey, id);
  return id;
}

function safeRead(store, key) {
  try {
    return store?.getItem(key);
  } catch (error) {
    return null;
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

function hydrateStoredKey() {
  const stored = safeRead(localStorage, keyStorageKey) || safeRead(sessionStorage, keyStorageKey);
  if (stored) {
    apiKeyInput.value = stored;
    updateKeyStatus('Using the OpenAI key stored by the Workbench.');
  } else {
    updateKeyStatus('No key found yet. Paste one from the Workbench.');
  }
}

function updateKeyStatus(message) {
  keyStatus.textContent = message;
}

function wireEvents() {
  saveKeyBtn.addEventListener('click', () => {
    const value = apiKeyInput.value.trim();
    if (!value) {
      updateKeyStatus('Add a key before saving.');
      return;
    }

    const wroteLocal = safeWrite(localStorage, keyStorageKey, value);
    const wroteSession = wroteLocal ? false : safeWrite(sessionStorage, keyStorageKey, value);
    const mode = wroteLocal ? 'localStorage' : wroteSession ? 'sessionStorage' : 'memory-only';
    updateKeyStatus(`Saved key to ${mode} to match the Workbench.`);
  });

  clearKeyBtn.addEventListener('click', () => {
    safeRemove(localStorage, keyStorageKey);
    safeRemove(sessionStorage, keyStorageKey);
    apiKeyInput.value = '';
    updateKeyStatus('Cleared local copies. Pull a fresh key from the Workbench.');
  });

  clearBriefBtn.addEventListener('click', () => {
    siteTitleInput.value = '';
    siteBriefInput.value = '';
    paletteInput.value = '';
    ctaInput.value = '';
    audienceInput.value = '';
    extrasInput.value = '';
    toneSelect.value = 'calm';
    outputBox.textContent = 'Waiting for a request...';
    renderPreview('', '');
    generateStatus.textContent = 'Brief cleared.';
  });

  generateBtn.addEventListener('click', handleGenerate);
}

function buildPrompt() {
  const title = siteTitleInput.value.trim() || 'AI landing page';
  const brief = siteBriefInput.value.trim();
  const tone = toneSelect.value;
  const palette = paletteInput.value.trim();
  const cta = ctaInput.value.trim();
  const audience = audienceInput.value.trim();
  const extras = extrasInput.value.trim();

  const promptParts = [
    `Build a single-page site called "${title}" using semantic, mobile-first HTML and inline CSS only.`,
    'Respond as JSON with keys: title, summary, and html. The html should include the full document.',
    'Avoid external assets or scripts. Prioritize accessible labels and keyboard-friendly targets.',
    `Tone: ${tone}.`,
  ];

  if (brief) promptParts.push(`Brief: ${brief}`);
  if (palette) promptParts.push(`Palette: ${palette}`);
  if (audience) promptParts.push(`Audience: ${audience}`);
  if (cta) promptParts.push(`Primary call-to-action: ${cta}`);
  if (extras) promptParts.push(`Extras to include: ${extras}`);

  promptParts.push('Use section headings, short paragraphs, and reassuring microcopy.');

  return promptParts.join(' ');
}

async function handleGenerate() {
  const prompt = buildPrompt();
  const apiKey = (apiKeyInput.value || '').trim() || safeRead(localStorage, keyStorageKey) || safeRead(sessionStorage, keyStorageKey);

  if (!apiKey) {
    updateKeyStatus('Add your OpenAI key first.');
    return;
  }

  generateBtn.disabled = true;
  generateStatus.textContent = 'Sending to OpenAI...';
  outputBox.textContent = 'Request in flight...';

  try {
    const response = await fetch('/api/openai-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, apiKey })
    });

    const result = await response.json();

    if (!response.ok) {
      const errorText = result?.error || 'Unexpected error';
      generateStatus.textContent = `Error: ${errorText}`;
      outputBox.textContent = JSON.stringify(result, null, 2);
      return;
    }

    const { html, title, summary, createdAt } = result;
    const runId = `${createdAt || Date.now()}`;

    outputBox.textContent = JSON.stringify(result, null, 2);
    renderPreview(html, title || 'Generated site');
    generateStatus.textContent = 'Site generated. Preview updated and saved to history.';

    const record = { prompt, html, title, summary, createdAt: createdAt || Date.now() };
    saveHistory(runId, record);
    prependHistory(runId, record);
  } catch (error) {
    generateStatus.textContent = 'Unable to reach the builder API.';
    outputBox.textContent = error.message || 'Network error';
  } finally {
    generateBtn.disabled = false;
  }
}

function renderPreview(html, title = '') {
  previewFrame.srcdoc = html || '';
  previewTitle.textContent = title ? `Previewing: ${title}` : '';
}

function saveHistory(id, data) {
  historyNode.get(id).put(data);
}

function loadHistory() {
  historyNode.map().on((data, id) => {
    if (!data || seenRuns.has(id)) return;
    seenRuns.add(id);
    prependHistory(id, data);
  });
}

function prependHistory(id, data) {
  const li = document.createElement('li');
  const title = data?.title || 'Untitled run';
  const summary = data?.summary || 'No summary provided.';
  const createdAt = data?.createdAt ? new Date(data.createdAt).toLocaleString() : 'Unknown time';

  const heading = document.createElement('div');
  heading.innerHTML = `<strong>${title}</strong> <span class="badge">${createdAt}</span>`;

  const summaryP = document.createElement('p');
  summaryP.className = 'muted';
  summaryP.textContent = summary;

  const actions = document.createElement('div');
  actions.className = 'history-actions';

  const loadBtn = document.createElement('button');
  loadBtn.className = 'ghost';
  loadBtn.textContent = 'Load preview';
  loadBtn.addEventListener('click', () => {
    renderPreview(data.html || '', title);
    outputBox.textContent = JSON.stringify(data, null, 2);
    generateStatus.textContent = 'Loaded from history.';
    hydrateBriefFromHistory(data);
  });

  const reuseBtn = document.createElement('button');
  reuseBtn.className = 'primary';
  reuseBtn.textContent = 'Rebuild';
  reuseBtn.addEventListener('click', () => {
    hydrateBriefFromHistory(data);
    handleGenerate();
  });

  actions.appendChild(loadBtn);
  actions.appendChild(reuseBtn);

  li.appendChild(heading);
  li.appendChild(summaryP);
  li.appendChild(actions);

  historyList.prepend(li);
}

function hydrateBriefFromHistory(data) {
  if (!data) return;

  if (data.title) {
    siteTitleInput.value = data.title;
  }

  if (data.prompt) {
    siteBriefInput.value = data.prompt;
  }

  generateStatus.textContent = 'Brief restored from history. Adjust any fields and rebuild.';
}

function actionLog(message) {
  generateStatus.textContent = message;
}
