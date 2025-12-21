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
const editNotesInput = document.getElementById('edit-notes');
const useExistingHtml = document.getElementById('use-existing-html');
const editingSource = document.getElementById('editing-source');

const seenRuns = new Set();
let currentHtml = '';
let currentRunLabel = 'No run loaded yet.';

sessionLabel.textContent = sessionId;
editingSource.textContent = currentRunLabel;

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
    editNotesInput.value = '';
    useExistingHtml.checked = false;
    updateEditingSource('', '');
    outputBox.textContent = 'Waiting for a request...';
    renderPreview('', '');
    generateStatus.textContent = 'Brief cleared.';
  });

  generateBtn.addEventListener('click', handleGenerate);
}

function buildPrompt() {
  const formState = collectFormState();
  const title = formState.title || 'AI landing page';
  const brief = formState.brief;
  const tone = formState.tone;
  const palette = formState.palette;
  const cta = formState.cta;
  const audience = formState.audience;
  const extras = formState.extras;
  const editNotes = formState.editNotes;
  const includeExistingHtml = formState.useExistingHtml && Boolean(currentHtml);

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
  if (editNotes) promptParts.push(`Editing notes: ${editNotes}`);
  if (includeExistingHtml) {
    promptParts.push('Update the HTML below with the edits and return the full updated document.');
    promptParts.push(`Current HTML:\n${currentHtml}`);
  }

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
    const inputs = collectFormState();

    outputBox.textContent = JSON.stringify(result, null, 2);
    renderPreview(html, title || 'Generated site');
    generateStatus.textContent = 'Site generated. Preview updated and saved to history.';

    const record = { prompt, html, title, summary, createdAt: createdAt || Date.now(), inputs };
    saveHistory(runId, record);
    prependHistory(runId, record);
    updateEditingSource(title || 'Generated site', record.createdAt);
    currentHtml = html || '';
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

function collectFormState() {
  return {
    title: siteTitleInput.value.trim(),
    brief: siteBriefInput.value.trim(),
    tone: toneSelect.value,
    palette: paletteInput.value.trim(),
    cta: ctaInput.value.trim(),
    audience: audienceInput.value.trim(),
    extras: extrasInput.value.trim(),
    editNotes: editNotesInput.value.trim(),
    useExistingHtml: useExistingHtml.checked
  };
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
    currentHtml = data.html || '';
    updateEditingSource(title, data?.createdAt);
  });

  const reuseBtn = document.createElement('button');
  reuseBtn.className = 'primary';
  reuseBtn.textContent = 'Rebuild';
  reuseBtn.addEventListener('click', () => {
    hydrateBriefFromHistory(data);
    currentHtml = data.html || '';
    updateEditingSource(title, data?.createdAt);
    handleGenerate();
  });

  const continueBtn = document.createElement('button');
  continueBtn.className = 'ghost';
  continueBtn.textContent = 'Continue editing';
  continueBtn.addEventListener('click', () => {
    hydrateBriefFromHistory(data);
    currentHtml = data.html || '';
    useExistingHtml.checked = Boolean(currentHtml);
    updateEditingSource(title, data?.createdAt);
    renderPreview(data.html || '', title);
    outputBox.textContent = JSON.stringify(data, null, 2);
    generateStatus.textContent = 'Editing draft loaded. Add notes and generate again.';
  });

  actions.appendChild(loadBtn);
  actions.appendChild(reuseBtn);
  actions.appendChild(continueBtn);

  li.appendChild(heading);
  li.appendChild(summaryP);
  li.appendChild(actions);

  historyList.prepend(li);
}

function hydrateBriefFromHistory(data) {
  if (!data) return;
  const inputs = data.inputs || {};

  if (inputs.title || data.title) {
    siteTitleInput.value = inputs.title || data.title;
  }

  if (inputs.brief) {
    siteBriefInput.value = inputs.brief;
  } else if (data.prompt) {
    siteBriefInput.value = data.prompt;
  }

  toneSelect.value = inputs.tone || toneSelect.value || 'calm';
  paletteInput.value = inputs.palette || '';
  ctaInput.value = inputs.cta || '';
  audienceInput.value = inputs.audience || '';
  extrasInput.value = inputs.extras || '';
  editNotesInput.value = inputs.editNotes || '';

  generateStatus.textContent = 'Brief restored from history. Adjust any fields and rebuild.';
}

function updateEditingSource(title, createdAt) {
  if (!title) {
    currentRunLabel = 'No run loaded yet.';
    editingSource.textContent = currentRunLabel;
    return;
  }

  const timeLabel = createdAt ? new Date(createdAt).toLocaleString() : 'Unknown time';
  currentRunLabel = `Loaded: ${title} (${timeLabel})`;
  editingSource.textContent = currentRunLabel;
}

function actionLog(message) {
  generateStatus.textContent = message;
}
