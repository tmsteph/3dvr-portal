const peers = Array.isArray(window.__GUN_PEERS__) && window.__GUN_PEERS__.length
  ? window.__GUN_PEERS__
  : ['wss://gun-relay-3dvr.fly.dev/gun'];
const gun = typeof window.Gun === 'function' ? window.Gun({ peers }) : null;
const user = gun && typeof gun.user === 'function' ? gun.user() : null;

const $ = id => document.getElementById(id);
const ui = {
  app: $('app'), authGate: $('authGate'), authMessage: $('authMessage'), deviceBadge: $('deviceBadge'), syncBadge: $('syncBadge'),
  projectList: $('projectList'), newProjectButton: $('newProjectButton'), newThreadButton: $('newThreadButton'), copyHandoffButton: $('copyHandoffButton'),
  projectLabel: $('projectLabel'), threadTitle: $('threadTitle'), threadTabs: $('threadTabs'), messageList: $('messageList'), composer: $('composer'),
  messageInput: $('messageInput'), queueRunButton: $('queueRunButton'), memoryForm: $('memoryForm'), memoryInput: $('memoryInput'), memoryList: $('memoryList'),
  runList: $('runList'), emptyTemplate: $('emptyTemplate')
};

const KEYS = {
  cache: '3dvr-workspace-cache-v1', device: '3dvr-workspace-device-v1', project: '3dvr-workspace-active-project-v1', thread: '3dvr-workspace-active-thread-v1'
};
const storage = {
  get(key) { try { return localStorage.getItem(key) || ''; } catch (_err) { return ''; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (_err) {} },
  remove(key) { try { localStorage.removeItem(key); } catch (_err) {} }
};
const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const iso = () => new Date().toISOString();
const deviceId = storage.get(KEYS.device) || `device-${id().slice(0, 8)}`;
storage.set(KEYS.device, deviceId);
ui.deviceBadge.textContent = deviceId.replace('device-', 'device ');

let alias = '';
let password = '';
let secret = '';
let node = null;
let activeProjectId = storage.get(KEYS.project);
let activeThreadId = storage.get(KEYS.thread);
let applyingRemote = false;
let saveTimer = null;

function newThread(title = 'Main thread') {
  const time = iso();
  return { id: id(), title, createdAt: time, updatedAt: time, messages: [] };
}
function newProject(name = '3DVR') {
  const time = iso();
  return { id: id(), name, createdAt: time, updatedAt: time, threads: [newThread()], memory: [], runs: [] };
}
function initialState() {
  return { version: 1, updatedAt: Date.now(), updatedBy: deviceId, projects: [newProject()] };
}
let state = initialState();

function normalize(input) {
  if (!input || typeof input !== 'object') return initialState();
  const projects = (Array.isArray(input.projects) ? input.projects : []).map(project => ({
    id: String(project.id || id()), name: String(project.name || 'Untitled project'), createdAt: project.createdAt || iso(), updatedAt: project.updatedAt || iso(),
    threads: (Array.isArray(project.threads) ? project.threads : []).map(thread => ({
      id: String(thread.id || id()), title: String(thread.title || 'Thread'), createdAt: thread.createdAt || iso(), updatedAt: thread.updatedAt || iso(),
      messages: (Array.isArray(thread.messages) ? thread.messages : []).map(message => ({
        id: String(message.id || id()), role: String(message.role || 'user'), content: String(message.content || ''), createdAt: message.createdAt || iso(), deviceId: String(message.deviceId || '')
      })).filter(message => message.content)
    })),
    memory: (Array.isArray(project.memory) ? project.memory : []).map(item => ({ id: String(item.id || id()), text: String(item.text || ''), createdAt: item.createdAt || iso(), deviceId: String(item.deviceId || '') })).filter(item => item.text),
    runs: (Array.isArray(project.runs) ? project.runs : []).map(run => ({ id: String(run.id || id()), threadId: String(run.threadId || ''), prompt: String(run.prompt || ''), status: String(run.status || 'queued'), requestedAt: run.requestedAt || iso(), deviceId: String(run.deviceId || '') })).filter(run => run.prompt)
  }));
  if (!projects.length) projects.push(newProject());
  projects.forEach(project => { if (!project.threads.length) project.threads.push(newThread()); });
  return { version: 1, updatedAt: Number(input.updatedAt) || Date.now(), updatedBy: String(input.updatedBy || ''), projects };
}

function syncStatus(text, tone = 'warn') {
  ui.syncBadge.textContent = text;
  ui.syncBadge.className = `pill pill-${tone}`;
}
function gate(message) {
  ui.authMessage.textContent = message;
  ui.authGate.hidden = false;
  ui.app.hidden = true;
}
function showApp() { ui.authGate.hidden = true; ui.app.hidden = false; }
function currentProject() {
  let project = state.projects.find(item => item.id === activeProjectId) || state.projects[0];
  if (project && activeProjectId !== project.id) { activeProjectId = project.id; storage.set(KEYS.project, project.id); }
  return project || null;
}
function currentThread() {
  const project = currentProject();
  if (!project) return null;
  let thread = project.threads.find(item => item.id === activeThreadId) || project.threads[0];
  if (thread && activeThreadId !== thread.id) { activeThreadId = thread.id; storage.set(KEYS.thread, thread.id); }
  return thread || null;
}
function esc(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function when(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}
function empty(container, title, detail) {
  container.innerHTML = '';
  const fragment = ui.emptyTemplate.content.cloneNode(true);
  fragment.querySelector('strong').textContent = title;
  fragment.querySelector('span').textContent = detail;
  container.appendChild(fragment);
}

function render() {
  const project = currentProject();
  const thread = currentThread();
  ui.projectList.innerHTML = state.projects.map(item => {
    const messages = item.threads.reduce((total, candidate) => total + candidate.messages.length, 0);
    return `<button class="project-button" type="button" data-project-id="${esc(item.id)}" data-active="${item.id === activeProjectId}"><strong>${esc(item.name)}</strong><span>${item.threads.length} threads · ${messages} messages</span></button>`;
  }).join('');
  if (!project || !thread) return;
  ui.projectLabel.textContent = project.name;
  ui.threadTitle.textContent = thread.title;
  ui.threadTabs.innerHTML = project.threads.map(item => `<button type="button" class="thread-tab" data-thread-id="${esc(item.id)}" data-active="${item.id === activeThreadId}">${esc(item.title)}</button>`).join('');
  if (!thread.messages.length) empty(ui.messageList, 'This thread is empty.', 'Add the first prompt, decision, note, or handoff.');
  else {
    ui.messageList.innerHTML = thread.messages.map(message => `<article class="message ${message.role === 'user' ? 'message-user' : ''}"><div>${esc(message.content)}</div><div class="message-meta">${esc(message.role)} · ${esc(when(message.createdAt))}${message.deviceId ? ` · ${esc(message.deviceId.replace('device-', 'device '))}` : ''}</div></article>`).join('');
    requestAnimationFrame(() => { ui.messageList.scrollTop = ui.messageList.scrollHeight; });
  }
  if (!project.memory.length) empty(ui.memoryList, 'No project memory yet.', 'Save durable goals, constraints, decisions, and links.');
  else ui.memoryList.innerHTML = [...project.memory].reverse().map(item => `<article class="memory-card"><p>${esc(item.text)}</p><div class="message-meta">${esc(when(item.createdAt))}</div></article>`).join('');
  if (!project.runs.length) empty(ui.runList, 'No agent runs queued.', 'Queue a prompt here, then let a worker claim it.');
  else ui.runList.innerHTML = [...project.runs].reverse().slice(0, 20).map(run => `<article class="run-card"><div class="run-status">${esc(run.status)}</div><p>${esc(run.prompt)}</p><div class="message-meta">${esc(when(run.requestedAt))}</div></article>`).join('');
}

async function decrypt(payload) {
  const value = await SEA.decrypt(payload, secret);
  if (!value) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}
async function encrypt() { return SEA.encrypt(JSON.stringify(state), secret); }
function cache(record) { storage.set(KEYS.cache, JSON.stringify(record)); }
async function loadCache() {
  try {
    const record = JSON.parse(storage.get(KEYS.cache) || 'null');
    if (!record?.payload) return false;
    const value = await decrypt(record.payload);
    if (!value) return false;
    state = normalize(value); render(); syncStatus('cached · connecting', 'warn'); return true;
  } catch (_err) { storage.remove(KEYS.cache); return false; }
}

async function save() {
  if (!node || applyingRemote) return;
  state.updatedAt = Date.now();
  state.updatedBy = deviceId;
  render(); syncStatus('encrypting…', 'warn');
  try {
    const record = { version: 1, payload: await encrypt(), updatedAt: state.updatedAt, updatedBy: deviceId };
    cache(record);
    node.put(record, ack => ack?.err ? syncStatus('offline · cached', 'danger') : syncStatus('synced', 'good'));
  } catch (error) { console.error(error); syncStatus('encryption error', 'danger'); }
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 100); }
async function applyRemote(record) {
  if (!record?.payload || Number(record.updatedAt || 0) < Number(state.updatedAt || 0)) return false;
  try {
    const value = await decrypt(record.payload);
    if (!value) return false;
    applyingRemote = true; state = normalize(value); cache(record); render(); applyingRemote = false;
    syncStatus(record.updatedBy === deviceId ? 'synced' : 'synced · updated', 'good');
    return true;
  } catch (error) { applyingRemote = false; console.error(error); syncStatus('unlock failed', 'danger'); return false; }
}

function touch(project) { project.updatedAt = iso(); }
function addMessage(content, role = 'user') {
  const project = currentProject(); const thread = currentThread(); const text = String(content || '').trim();
  if (!project || !thread || !text) return null;
  const message = { id: id(), role, content: text, createdAt: iso(), deviceId };
  thread.messages.push(message); thread.updatedAt = message.createdAt; touch(project); scheduleSave(); return message;
}
function addRun(prompt) {
  const project = currentProject(); const thread = currentThread(); const text = String(prompt || '').trim();
  if (!project || !thread || !text) return;
  project.runs.push({ id: id(), threadId: thread.id, prompt: text, status: 'queued', requestedAt: iso(), deviceId }); touch(project); scheduleSave();
}
function handoff() {
  const project = currentProject(); const thread = currentThread(); if (!project || !thread) return '';
  const memory = project.memory.length ? project.memory.map(item => `- ${item.text}`).join('\n') : '- No saved memory yet.';
  const transcript = thread.messages.length ? thread.messages.map(message => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n') : 'No messages yet.';
  return `# 3DVR Workspace Handoff\n\nProject: ${project.name}\nThread: ${thread.title}\n\n## Project memory\n${memory}\n\n## Thread\n${transcript}\n\nContinue this work using the project memory and thread above. Return durable decisions and results to the 3DVR workspace.`;
}

ui.projectList.addEventListener('click', event => {
  const button = event.target.closest('[data-project-id]'); if (!button) return;
  activeProjectId = button.dataset.projectId; activeThreadId = ''; storage.set(KEYS.project, activeProjectId); storage.remove(KEYS.thread); render();
});
ui.threadTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-thread-id]'); if (!button) return;
  activeThreadId = button.dataset.threadId; storage.set(KEYS.thread, activeThreadId); render();
});
ui.newProjectButton.addEventListener('click', () => {
  const name = prompt('Project name?')?.trim(); if (!name) return;
  const project = newProject(name); state.projects.push(project); activeProjectId = project.id; activeThreadId = project.threads[0].id;
  storage.set(KEYS.project, activeProjectId); storage.set(KEYS.thread, activeThreadId); scheduleSave();
});
ui.newThreadButton.addEventListener('click', () => {
  const project = currentProject(); const title = prompt('Thread name?')?.trim(); if (!project || !title) return;
  const thread = newThread(title); project.threads.push(thread); activeThreadId = thread.id; storage.set(KEYS.thread, activeThreadId); touch(project); scheduleSave();
});
ui.composer.addEventListener('submit', event => {
  event.preventDefault(); if (!addMessage(ui.messageInput.value)) return; ui.messageInput.value = ''; ui.messageInput.focus();
});
ui.queueRunButton.addEventListener('click', () => {
  let text = ui.messageInput.value.trim();
  if (text) { addMessage(text); ui.messageInput.value = ''; }
  else text = [...(currentThread()?.messages || [])].reverse().find(message => message.role === 'user')?.content || '';
  if (!text) return ui.messageInput.focus();
  addRun(text); syncStatus('agent queued · syncing', 'warn');
});
ui.memoryForm.addEventListener('submit', event => {
  event.preventDefault(); const project = currentProject(); const text = ui.memoryInput.value.trim(); if (!project || !text) return;
  project.memory.push({ id: id(), text, createdAt: iso(), deviceId }); ui.memoryInput.value = ''; touch(project); scheduleSave();
});
ui.copyHandoffButton.addEventListener('click', async () => {
  const text = handoff(); if (!text) return;
  try { await navigator.clipboard.writeText(text); ui.copyHandoffButton.textContent = 'Copied'; setTimeout(() => { ui.copyHandoffButton.textContent = 'Copy handoff'; }, 1200); }
  catch (_err) { prompt('Copy this handoff:', text); }
});

async function startWorkspace() {
  showApp(); await loadCache(); render();
  node = user.get('workspace-v1').get('state');
  syncStatus('loading cloud…', 'warn');
  let resolved = false;
  const subscribe = () => node.on(record => { if (record?.payload) applyRemote(record); });
  node.once(async record => {
    if (resolved) return; resolved = true;
    if (record?.payload) { if (!(await applyRemote(record))) await save(); }
    else await save();
    subscribe();
  });
  setTimeout(async () => {
    if (resolved) return; resolved = true; syncStatus('relay slow · cached', 'warn'); await save(); subscribe();
  }, 4500);
}

async function boot() {
  if (!gun || !user || !window.SEA) return gate('The workspace sync runtime could not load. Check your connection and reload.');
  try { window.AuthIdentity?.syncStorageFromSharedIdentity?.(); } catch (_err) {}
  alias = storage.get('alias').trim(); password = storage.get('password');
  if (storage.get('signedIn') !== 'true' || !alias) { syncStatus('sign in required', 'warn'); return gate('Sign in to your 3DVR account to unlock encrypted cross-device workspace sync.'); }
  if (!password) { syncStatus('password unlock needed', 'warn'); return gate('This first encrypted workspace version needs a password-based 3DVR sign-in. OAuth-only workspace unlock is next.'); }
  syncStatus('authenticating…', 'warn');
  secret = await SEA.work(password, `3dvr-workspace:${alias}`);
  user.auth(alias, password, async ack => {
    if (ack?.err) { syncStatus('auth failed', 'danger'); return gate('The workspace could not unlock your account. Sign in again, then return here.'); }
    await startWorkspace();
  });
}

boot().catch(error => { console.error(error); syncStatus('startup error', 'danger'); gate('The workspace hit an unexpected startup error. Reload or sign in again.'); });
