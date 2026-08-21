const gunPeers = Array.isArray(window.__GUN_PEERS__) && window.__GUN_PEERS__.length
  ? window.__GUN_PEERS__
  : ['wss://gun-relay-3dvr.fly.dev/gun'];

const gun = typeof window.Gun === 'function'
  ? window.Gun({ peers: gunPeers })
  : null;
const user = gun && typeof gun.user === 'function' ? gun.user() : null;

const elements = {
  app: document.getElementById('app'),
  authGate: document.getElementById('authGate'),
  authMessage: document.getElementById('authMessage'),
  deviceBadge: document.getElementById('deviceBadge'),
  syncBadge: document.getElementById('syncBadge'),
  projectList: document.getElementById('projectList'),
  newProjectButton: document.getElementById('newProjectButton'),
  newThreadButton: document.getElementById('newThreadButton'),
  copyHandoffButton: document.getElementById('copyHandoffButton'),
  projectLabel: document.getElementById('projectLabel'),
  threadTitle: document.getElementById('threadTitle'),
  threadTabs: document.getElementById('threadTabs'),
  messageList: document.getElementById('messageList'),
  composer: document.getElementById('composer'),
  messageInput: document.getElementById('messageInput'),
  queueRunButton: document.getElementById('queueRunButton'),
  memoryForm: document.getElementById('memoryForm'),
  memoryInput: document.getElementById('memoryInput'),
  memoryList: document.getElementById('memoryList'),
  runList: document.getElementById('runList'),
  emptyTemplate: document.getElementById('emptyTemplate')
};

const CACHE_KEY = '3dvr-workspace-cache-v1';
const DEVICE_KEY = '3dvr-workspace-device-v1';
const ACTIVE_PROJECT_KEY = '3dvr-workspace-active-project-v1';
const ACTIVE_THREAD_KEY = '3dvr-workspace-active-thread-v1';
const WORKSPACE_NODE = 'workspace-v1';

let alias = '';
let password = '';
let encryptionKey = '';
let workspaceNode = null;
let state = createInitialState();
let activeProjectId = readStorage(ACTIVE_PROJECT_KEY);
let activeThreadId = readStorage(ACTIVE_THREAD_KEY);
let saveTimer = null;
let isApplyingRemote = false;

const deviceId = (() => {
  const existing = readStorage(DEVICE_KEY);
  if (existing) return existing;
  const created = `device-${makeId().slice(0, 8)}`;
  writeStorage(DEVICE_KEY, created);
  return created;
})();

elements.deviceBadge.textContent = deviceId.replace('device-', 'device ');

function readStorage(key) {
  try { return window.localStorage.getItem(key) || ''; } catch (_err) { return ''; }
}

function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value); } catch (_err) {}
}

function removeStorage(key) {
  try { window.localStorage.removeItem(key); } catch (_err) {}
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createThread(title = 'Main thread') {
  const timestamp = nowIso();
  return {
    id: makeId(),
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: []
  };
}

function createProject(name = 'My workspace') {
  const timestamp = nowIso();
  const thread = createThread('Main thread');
  return {
    id: makeId(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    threads: [thread],
    memory: [],
    runs: []
  };
}

function createInitialState() {
  const project = createProject('3DVR');
  return {
    version: 1,
    updatedAt: Date.now(),
    updatedBy: deviceId || 'unknown-device',
    projects: [project]
  };
}

function normalizeState(candidate) {
  if (!candidate || typeof candidate !== 'object') return createInitialState();
  const projects = Array.isArray(candidate.projects) ? candidate.projects : [];
  const normalizedProjects = projects.map(project => ({
    id: String(project.id || makeId()),
    name: String(project.name || 'Untitled project'),
    createdAt: project.createdAt || nowIso(),
    updatedAt: project.updatedAt || project.createdAt || nowIso(),
    threads: (Array.isArray(project.threads) ? project.threads : []).map(thread => ({
      id: String(thread.id || makeId()),
      title: String(thread.title || 'Thread'),
      createdAt: thread.createdAt || nowIso(),
      updatedAt: thread.updatedAt || thread.createdAt || nowIso(),
      messages: (Array.isArray(thread.messages) ? thread.messages : []).map(message => ({
        id: String(message.id || makeId()),
        role: String(message.role || 'user'),
        content: String(message.content || ''),
        createdAt: message.createdAt || nowIso(),
        deviceId: String(message.deviceId || '')
      })).filter(message => message.content)
    })),
    memory: (Array.isArray(project.memory) ? project.memory : []).map(memory => ({
      id: String(memory.id || makeId()),
      text: String(memory.text || ''),
      createdAt: memory.createdAt || nowIso(),
      deviceId: String(memory.deviceId || '')
    })).filter(memory => memory.text),
    runs: (Array.isArray(project.runs) ? project.runs : []).map(run => ({
      id: String(run.id || makeId()),
      threadId: String(run.threadId || ''),
      prompt: String(run.prompt || ''),
      status: String(run.status || 'queued'),
      requestedAt: run.requestedAt || nowIso(),
      deviceId: String(run.deviceId || '')
    })).filter(run => run.prompt)
  }));

  if (!normalizedProjects.length) normalizedProjects.push(createProject('3DVR'));
  normalizedProjects.forEach(project => {
    if (!project.threads.length) project.threads.push(createThread('Main thread'));
  });

  return {
    version: 1,
    updatedAt: Number(candidate.updatedAt) || Date.now(),
    updatedBy: String(candidate.updatedBy || ''),
    projects: normalizedProjects
  };
}

function setSyncStatus(text, tone = 'warn') {
  elements.syncBadge.textContent = text;
  elements.syncBadge.className = `pill pill-${tone}`;
}

function showAuthGate(message) {
  elements.authMessage.textContent = message;
  elements.authGate.hidden = false;
  elements.app.hidden = true;
}

function showApp() {
  elements.authGate.hidden = true;
  elements.app.hidden = false;
}

function activeProject() {
  let project = state.projects.find(item => item.id === activeProjectId);
  if (!project) {
    project = state.projects[0] || null;
    activeProjectId = project ? project.id : '';
    if (activeProjectId) writeStorage(ACTIVE_PROJECT_KEY, activeProjectId);
  }
  return project;
}

function activeThread() {
  const project = activeProject();
  if (!project) return null;
  let thread = project.threads.find(item => item.id === activeThreadId);
  if (!thread) {
    thread = project.threads[0] || null;
    activeThreadId = thread ? thread.id : '';
    if (activeThreadId) writeStorage(ACTIVE_THREAD_KEY, activeThreadId);
  }
  return thread;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function renderEmpty(container, title = 'Nothing here yet.', detail = 'Start small. The workspace grows with the project.') {
  container.innerHTML = '';
  const fragment = elements.emptyTemplate.content.cloneNode(true);
  fragment.querySelector('strong').textContent = title;
  fragment.querySelector('span').textContent = detail;
  container.appendChild(fragment);
}

function render() {
  const project = activeProject();
  const thread = activeThread();

  elements.projectList.innerHTML = state.projects.map(item => {
    const messageCount = item.threads.reduce((total, candidate) => total + candidate.messages.length, 0);
    return `<button class="project-button" type="button" data-project-id="${escapeHtml(item.id)}" data-active="${item.id === activeProjectId}">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${item.threads.length} thread${item.threads.length === 1 ? '' : 's'} · ${messageCount} message${messageCount === 1 ? '' : 's'}</span>
    </button>`;
  }).join('');

  if (!project || !thread) {
    elements.projectLabel.textContent = 'Project';
    elements.threadTitle.textContent = 'No thread selected';
    renderEmpty(elements.messageList);
    renderEmpty(elements.memoryList);
    renderEmpty(elements.runList);
    return;
  }

  elements.projectLabel.textContent = project.name;
  elements.threadTitle.textContent = thread.title;
  elements.threadTabs.innerHTML = project.threads.map(item => (
    `<button type="button" class="thread-tab" data-thread-id="${escapeHtml(item.id)}" data-active="${item.id === activeThreadId}">${escapeHtml(item.title)}</button>`
  )).join('');

  if (!thread.messages.length) {
    renderEmpty(elements.messageList, 'This thread is empty.', 'Add the first thought, prompt, decision, or handoff.');
  } else {
    elements.messageList.innerHTML = thread.messages.map(message => (
      `<article class="message ${message.role === 'user' ? 'message-user' : ''}">
        <div>${escapeHtml(message.content)}</div>
        <div class="message-meta">${escapeHtml(message.role)} · ${escapeHtml(formatTime(message.createdAt))}${message.deviceId ? ` · ${escapeHtml(message.deviceId.replace('device-', 'device '))}` : ''}</div>
      </article>`
    )).join('');
    requestAnimationFrame(() => { elements.messageList.scrollTop = elements.messageList.scrollHeight; });
  }

  if (!project.memory.length) {
    renderEmpty(elements.memoryList, 'No project memory yet.', 'Save durable decisions, constraints, links, and goals here.');
  } else {
    elements.memoryList.innerHTML = [...project.memory].reverse().map(memory => (
      `<article class="memory-card"><p>${escapeHtml(memory.text)}</p><div class="message-meta">${escapeHtml(formatTime(memory.createdAt))}</div></article>`
    )).join('');
  }

  if (!project.runs.length) {
    renderEmpty(elements.runList, 'No agent runs queued.', 'Queue a prompt here, then let Codex or OpenClaw claim it.');
  } else {
    elements.runList.innerHTML = [...project.runs].reverse().slice(0, 20).map(run => (
      `<article class="run-card"><div class="run-status">${escapeHtml(run.status)}</div><p>${escapeHtml(run.prompt)}</p><div class="message-meta">${escapeHtml(formatTime(run.requestedAt))}</div></article>`
    )).join('');
  }
}

async function encryptState(nextState) {
  if (!window.SEA || !encryptionKey) throw new Error('Encryption unavailable');
  return window.SEA.encrypt(JSON.stringify(nextState), encryptionKey);
}

async function decryptState(payload) {
  if (!window.SEA || !encryptionKey || !payload) return null;
  const decrypted = await window.SEA.decrypt(payload, encryptionKey);
  if (!decrypted) return null;
  if (typeof decrypted === 'string') return JSON.parse(decrypted);
  return decrypted;
}

function cacheRecord(record) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(record)); } catch (_err) {}
}

async function loadCachedState() {
  let record = null;
  try { record = JSON.parse(readStorage(CACHE_KEY) || 'null'); } catch (_err) { record = null; }
  if (!record || !record.payload) return false;
  try {
    const decrypted = await decryptState(record.payload);
    if (!decrypted) return false;
    state = normalizeState(decrypted);
    render();
    setSyncStatus('cached · connecting', 'warn');
    return true;
  } catch (_err) {
    removeStorage(CACHE_KEY);
    return false;
  }
}

async function persistState() {
  if (!workspaceNode || isApplyingRemote) return;
  state.updatedAt = Date.now();
  state.updatedBy = deviceId;
  render();
  setSyncStatus('encrypting…', 'warn');
  try {
    const payload = await encryptState(state);
    const record = {
      version: 1,
      payload,
      updatedAt: state.updatedAt,
      updatedBy: deviceId
    };
    cacheRecord(record);
    workspaceNode.put(record, ack => {
      if (ack && ack.err) {
        console.warn('Workspace sync write failed', ack.err);
        setSyncStatus('offline · cached', 'danger');
      } else {
        setSyncStatus('synced', 'good');
      }
    });
  } catch (error) {
    console.error('Workspace encryption failed', error);
    setSyncStatus('encryption error', 'danger');
  }
}

function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { persistState(); }, 90);
}

async function applyRemoteRecord(record) {
  if (!record || !record.payload) return false;
  const remoteTimestamp = Number(record.updatedAt) || 0;
  if (remoteTimestamp && remoteTimestamp < Number(state.updatedAt || 0)) return false;
  try {
    const decrypted = await decryptState(record.payload);
    if (!decrypted) throw new Error('Unable to decrypt workspace');
    isApplyingRemote = true;
    state = normalizeState(decrypted);
    cacheRecord(record);
    render();
    setSyncStatus(record.updatedBy === deviceId ? 'synced' : 'synced · updated', 'good');
    isApplyingRemote = false;
    return true;
  } catch (error) {
    isApplyingRemote = false;
    console.error('Workspace remote decrypt failed', error);
    setSyncStatus('unlock failed', 'danger');
    return false;
  }
}

async function initializeWorkspace() {
  showApp();
  await loadCachedState();
  render();

  workspaceNode = user.get(WORKSPACE_NODE).get('state');
  setSyncStatus('loading cloud…', 'warn');

  let initialResolved = false;
  workspaceNode.once(async record => {
    if (initialResolved) return;
    initialResolved = true;
    if (record && record.payload) {
      const applied = await applyRemoteRecord(record);
      if (!applied) await persistState();
    } else {
      await persistState();
    }

    workspaceNode.on(recordUpdate => {
      if (!recordUpdate || !recordUpdate.payload) return;
      applyRemoteRecord(recordUpdate);
    });
  });

  window.setTimeout(async () => {
    if (!initialResolved) {
      initialResolved = true;
      setSyncStatus('relay slow · cached', 'warn');
      await persistState();
      workspaceNode.on(recordUpdate => {
        if (!recordUpdate || !recordUpdate.payload) return;
        applyRemoteRecord(recordUpdate);
      });
    }
  }, 4500);
}

function updateProjectTimestamp(project) {
  project.updatedAt = nowIso();
}

function saveMessage(content, role = 'user') {
  const project = activeProject();
  const thread = activeThread();
  const trimmed = String(content || '').trim();
  if (!project || !thread || !trimmed) return null;
  const message = {
    id: makeId(),
    role,
    content: trimmed,
    createdAt: nowIso(),
    deviceId
  };
  thread.messages.push(message);
  thread.updatedAt = message.createdAt;
  updateProjectTimestamp(project);
  schedulePersist();
  return message;
}

function queueRun(promptText) {
  const project = activeProject();
  const thread = activeThread();
  const prompt = String(promptText || '').trim();
  if (!project || !thread || !prompt) return null;
  const run = {
    id: makeId(),
    threadId: thread.id,
    prompt,
    status: 'queued',
    requestedAt: nowIso(),
    deviceId
  };
  project.runs.push(run);
  updateProjectTimestamp(project);
  schedulePersist();
  return run;
}

function buildHandoff() {
  const project = activeProject();
  const thread = activeThread();
  if (!project || !thread) return '';
  const memory = project.memory.length
    ? project.memory.map(item => `- ${item.text}`).join('\n')
    : '- No saved memory yet.';
  const transcript = thread.messages.length
    ? thread.messages.map(message => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n')
    : 'No messages yet.';
  return `# 3DVR Workspace Handoff\n\nProject: ${project.name}\nThread: ${thread.title}\n\n## Project memory\n${memory}\n\n## Thread\n${transcript}\n\nContinue this work using the project memory and thread above. Preserve important decisions and return durable updates to the 3DVR workspace.`;
}

elements.projectList.addEventListener('click', event => {
  const button = event.target.closest('[data-project-id]');
  if (!button) return;
  activeProjectId = button.dataset.projectId;
  activeThreadId = '';
  writeStorage(ACTIVE_PROJECT_KEY, activeProjectId);
  removeStorage(ACTIVE_THREAD_KEY);
  render();
});

elements.threadTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-thread-id]');
  if (!button) return;
  activeThreadId = button.dataset.threadId;
  writeStorage(ACTIVE_THREAD_KEY, activeThreadId);
  render();
});

elements.newProjectButton.addEventListener('click', () => {
  const name = window.prompt('Project name?');
  if (!name || !name.trim()) return;
  const project = createProject(name.trim());
  state.projects.push(project);
  activeProjectId = project.id;
  activeThreadId = project.threads[0].id;
  writeStorage(ACTIVE_PROJECT_KEY, activeProjectId);
  writeStorage(ACTIVE_THREAD_KEY, activeThreadId);
  schedulePersist();
});

elements.newThreadButton.addEventListener('click', () => {
  const project = activeProject();
  if (!project) return;
  const title = window.prompt('Thread name?');
  if (!title || !title.trim()) return;
  const thread = createThread(title.trim());
  project.threads.push(thread);
  activeThreadId = thread.id;
  writeStorage(ACTIVE_THREAD_KEY, activeThreadId);
  updateProjectTimestamp(project);
  schedulePersist();
});

elements.composer.addEventListener('submit', event => {
  event.preventDefault();
  const value = elements.messageInput.value;
  if (!saveMessage(value)) return;
  elements.messageInput.value = '';
  elements.messageInput.focus();
});

elements.queueRunButton.addEventListener('click', () => {
  let prompt = elements.messageInput.value.trim();
  if (prompt) {
    saveMessage(prompt);
    elements.messageInput.value = '';
  } else {
    const thread = activeThread();
    const latest = thread && [...thread.messages].reverse().find(message => message.role === 'user');
    prompt = latest ? latest.content : '';
  }
  if (!prompt) {
    elements.messageInput.focus();
    return;
  }
  queueRun(prompt);
  setSyncStatus('agent queued · syncing', 'warn');
});

elements.memoryForm.addEventListener('submit', event => {
  event.preventDefault();
  const project = activeProject();
  const text = elements.memoryInput.value.trim();
  if (!project || !text) return;
  project.memory.push({ id: makeId(), text, createdAt: nowIso(), deviceId });
  elements.memoryInput.value = '';
  updateProjectTimestamp(project);
  schedulePersist();
});

elements.copyHandoffButton.addEventListener('click', async () => {
  const handoff = buildHandoff();
  if (!handoff) return;
  try {
    await navigator.clipboard.writeText(handoff);
    const original = elements.copyHandoffButton.textContent;
    elements.copyHandoffButton.textContent = 'Copied';
    window.setTimeout(() => { elements.copyHandoffButton.textContent = original; }, 1200);
  } catch (_err) {
    window.prompt('Copy this handoff:', handoff);
  }
});

async function boot() {
  if (!gun || !user || !window.SEA) {
    showAuthGate('The workspace sync runtime could not load. Check your connection and reload.');
    setSyncStatus('runtime unavailable', 'danger');
    return;
  }

  try {
    if (window.AuthIdentity && typeof window.AuthIdentity.syncStorageFromSharedIdentity === 'function') {
      window.AuthIdentity.syncStorageFromSharedIdentity();
    }
  } catch (_err) {}

  alias = readStorage('alias').trim();
  password = readStorage('password');
  const signedIn = readStorage('signedIn') === 'true';

  if (!signedIn || !alias) {
    showAuthGate('Sign in to your 3DVR account to unlock encrypted cross-device workspace sync.');
    setSyncStatus('sign in required', 'warn');
    return;
  }

  if (!password) {
    showAuthGate('This first encrypted workspace version needs a 3DVR password sign-in so every device can derive the same encryption key. OAuth-only workspace unlock is next.');
    setSyncStatus('password unlock needed', 'warn');
    return;
  }

  setSyncStatus('authenticating…', 'warn');
  encryptionKey = await window.SEA.work(password, `3dvr-workspace:${alias}`);

  user.auth(alias, password, async ack => {
    if (ack && ack.err) {
      console.warn('Workspace auth failed', ack.err);
      showAuthGate('Your portal identity is present, but the workspace could not unlock it. Sign in again, then return here.');
      setSyncStatus('auth failed', 'danger');
      return;
    }
    await initializeWorkspace();
  });
}

boot().catch(error => {
  console.error('Workspace boot failed', error);
  showAuthGate('The workspace hit an unexpected startup error. Reload or sign in again.');
  setSyncStatus('startup error', 'danger');
});
