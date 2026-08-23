const params = new URLSearchParams(window.location.search);
const kind = params.get('kind') === 'edit' ? 'edit' : params.get('kind') === 'suggestion' ? 'suggestion' : '';
const id = String(params.get('id') || '').trim();

const refs = {
  kind: document.querySelector('[data-record-kind]'),
  title: document.querySelector('[data-record-title]'),
  loading: document.querySelector('[data-record-loading]'),
  content: document.querySelector('[data-record-content]'),
  status: document.querySelector('[data-record-status]'),
  repo: document.querySelector('[data-record-repo]'),
  created: document.querySelector('[data-record-created]'),
  bodyLabel: document.querySelector('[data-record-body-label]'),
  body: document.querySelector('[data-record-body]'),
  resultSection: document.querySelector('[data-record-result-section]'),
  result: document.querySelector('[data-record-result]'),
  errorSection: document.querySelector('[data-record-error-section]'),
  error: document.querySelector('[data-record-error]'),
  id: document.querySelector('[data-record-id]'),
};

function clean(value = '', max = 6000) {
  return String(value || '').trim().slice(0, max);
}

function safeDate(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function showError(message) {
  refs.kind.textContent = 'Forge item';
  refs.title.textContent = 'Could not open this item';
  refs.loading.textContent = message;
  refs.loading.classList.add('record-error');
  refs.content.hidden = true;
}

function renderRecord(record = {}) {
  const isEdit = kind === 'edit';
  const title = clean(record.title, 240) || (isEdit ? 'Operator code edit' : 'Operator suggestion');
  const body = clean(isEdit ? record.task : record.text);
  const status = clean(record.status, 80) || (isEdit ? 'queued' : 'open');
  const repo = clean(record.repo, 120) || 'portal';
  const created = safeDate(record.createdAt || record.updatedAt);
  const result = clean(record.resultSummary);
  const error = clean(record.error);

  document.title = `${title} | 3DVR Forge`;
  refs.kind.textContent = isEdit ? 'Forge edit' : 'Forge suggestion';
  refs.title.textContent = title;
  refs.status.textContent = status;
  refs.repo.textContent = repo;
  refs.created.textContent = created || 'Date unavailable';
  refs.bodyLabel.textContent = isEdit ? 'Edit request' : 'Suggestion';
  refs.body.textContent = body || 'No request text was stored.';
  refs.result.textContent = result;
  refs.resultSection.hidden = !result;
  refs.error.textContent = error;
  refs.errorSection.hidden = !error;
  refs.id.textContent = `ID: ${id}`;
  refs.loading.hidden = true;
  refs.content.hidden = false;
}

if (!kind || !id) {
  showError('This link is missing a valid Forge record type or ID.');
} else if (!window.Gun) {
  showError('Forge sync is unavailable in this browser.');
} else {
  const gun = window.Gun({ peers: window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun'] });
  const collection = kind === 'edit' ? 'editRequests' : 'suggestions';
  const node = gun.get('3dvr-portal').get('forge').get(collection).get(id);
  let resolved = false;

  const timer = window.setTimeout(() => {
    if (!resolved) showError('This Forge item did not load. It may still be syncing; try opening the link again.');
  }, 5000);

  node.once(record => {
    resolved = true;
    window.clearTimeout(timer);
    if (!record || typeof record !== 'object' || (!record.id && !record.title && !record.status)) {
      showError('This Forge item could not be found.');
      return;
    }
    renderRecord(record);
  });

  node.on(record => {
    if (!record || typeof record !== 'object') return;
    renderRecord(record);
  });
}
