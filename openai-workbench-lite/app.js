const gun = Gun({ peers: window.__GUN_PEERS__ || undefined });
const portalRoot = gun.get('3dvr-portal');
const workbenchRoot = portalRoot.get('ai-workbench');
const defaultsNode = workbenchRoot.get('defaults');

const identityInput = document.getElementById('identity-input');
const applyIdentityBtn = document.getElementById('apply-identity');
const identityStatus = document.getElementById('identity-status');
const transcriptList = document.getElementById('transcript-list');
const transcriptStatus = document.getElementById('transcript-status');
const deployList = document.getElementById('deploy-list');
const deployStatus = document.getElementById('deploy-status');
const githubList = document.getElementById('github-list');
const githubStatus = document.getElementById('github-status');
const defaultHint = document.getElementById('default-hint');
const defaultUpdatedBy = document.getElementById('default-updated-by');
const defaultUpdatedAt = document.getElementById('default-updated-at');
const defaultStatus = document.getElementById('default-status');
const promptCount = document.getElementById('prompt-count');
const deployCount = document.getElementById('deploy-count');
const githubCount = document.getElementById('github-count');
const storageMode = document.getElementById('storage-mode');

const storageKey = 'workbench-explorer-identity';

const subscriptions = [];

function safeDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function updateStatus(el, message) {
  el.textContent = message;
}

function addSubscription(node, callback) {
  const handler = node.on(callback);
  subscriptions.push(() => {
    if (handler && typeof handler.off === 'function') handler.off();
    node.off();
  });
}

function clearSubscriptions() {
  while (subscriptions.length) {
    const stop = subscriptions.pop();
    try {
      stop();
    } catch (error) {
      console.error('Failed to clear subscription', error);
    }
  }
}

function clearLists() {
  transcriptList.innerHTML = '';
  deployList.innerHTML = '';
  githubList.innerHTML = '';
  promptCount.textContent = '0';
  deployCount.textContent = '0';
  githubCount.textContent = '0';
}

function renderTranscript(key, entry) {
  const li = document.createElement('li');
  const title = document.createElement('h3');
  title.textContent = entry.prompt || 'Untitled prompt';
  const metaRow = document.createElement('div');
  metaRow.className = 'meta-row';
  metaRow.textContent = `${entry.model || 'n/a'} • ${safeDate(entry.createdAt)}`;
  li.appendChild(title);
  li.appendChild(metaRow);
  transcriptList.prepend(li);

  promptCount.textContent = transcriptList.children.length;
  transcriptStatus.textContent = 'Live transcript feed loaded.';
}

function renderDeploy(key, entry) {
  const li = document.createElement('li');
  const title = document.createElement('h3');
  title.textContent = entry.project || 'Unknown project';
  const metaRow = document.createElement('div');
  metaRow.className = 'meta-row';
  const link = entry.url ? ` • ${entry.url}` : '';
  metaRow.textContent = `${safeDate(entry.deployedAt)}${link}`;
  if (entry.note) {
    const note = document.createElement('p');
    note.className = 'meta';
    note.textContent = entry.note;
    li.appendChild(note);
  }
  li.appendChild(title);
  li.appendChild(metaRow);
  deployList.prepend(li);

  deployCount.textContent = deployList.children.length;
  deployStatus.textContent = 'Deployment history synced.';
}

function renderGithub(key, entry) {
  const li = document.createElement('li');
  const title = document.createElement('h3');
  title.textContent = entry.repo || 'Unknown repo';
  const metaRow = document.createElement('div');
  metaRow.className = 'meta-row';
  const branch = entry.branch || 'main';
  const path = entry.path || 'index.html';
  metaRow.textContent = `${branch}:${path} • ${safeDate(entry.pushedAt)}`;
  if (entry.message) {
    const note = document.createElement('p');
    note.className = 'meta';
    note.textContent = entry.message;
    li.appendChild(note);
  }
  if (entry.url) {
    const url = document.createElement('a');
    url.href = entry.url;
    url.target = '_blank';
    url.rel = 'noreferrer';
    url.textContent = 'View commit';
    li.appendChild(url);
  }
  li.appendChild(title);
  li.appendChild(metaRow);
  githubList.prepend(li);

  githubCount.textContent = githubList.children.length;
  githubStatus.textContent = 'GitHub publish history synced.';
}

function loadDefaults() {
  updateStatus(defaultStatus, 'Loading shared defaults...');
  defaultsNode.once((data = {}) => {
    const { hint, updatedAt, updatedBy } = data;
    defaultHint.textContent = hint || 'No hint set';
    defaultUpdatedBy.textContent = updatedBy || '—';
    defaultUpdatedAt.textContent = safeDate(updatedAt);
    updateStatus(defaultStatus, 'Defaults loaded from ai-workbench/defaults.');
  });
}

function hydrateIdentity(identity) {
  clearSubscriptions();
  clearLists();

  const transcriptNode = workbenchRoot.get(identity).get('transcripts');
  const deploymentNode = workbenchRoot.get(identity).get('vercel');
  const githubNode = workbenchRoot.get(identity).get('github');

  addSubscription(transcriptNode.map(), (entry, key) => {
    if (!entry || entry === null) return;
    renderTranscript(key, entry);
  });

  addSubscription(deploymentNode.map(), (entry, key) => {
    if (!entry || entry === null) return;
    renderDeploy(key, entry);
  });

  addSubscription(githubNode.map(), (entry, key) => {
    if (!entry || entry === null) return;
    renderGithub(key, entry);
  });

  updateStatus(transcriptStatus, 'Subscribed to transcript feed...');
  updateStatus(deployStatus, 'Subscribed to deployment feed...');
  updateStatus(githubStatus, 'Subscribed to GitHub feed...');
}

function applyIdentity() {
  const identity = (identityInput.value || 'default').trim();
  if (!identity) {
    updateStatus(identityStatus, 'Identity cannot be empty.');
    return;
  }

  localStorage.setItem(storageKey, identity);
  updateStatus(identityStatus, `Now reading from ai-workbench/${identity}.`);
  hydrateIdentity(identity);
}

function init() {
  const savedIdentity = localStorage.getItem(storageKey) || 'default';
  identityInput.value = savedIdentity;
  storageMode.textContent = `Storage: ${localStorage ? 'localStorage' : 'memory only'}.`;

  applyIdentityBtn.addEventListener('click', applyIdentity);
  identityInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') applyIdentity();
  });

  loadDefaults();
  applyIdentity();
}

init();
