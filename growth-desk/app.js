const SPRINT_TAG = 'follow-up-leak-sprint';
const RECORD_PREFIX = 'follow-up-leak-';
const gun = window.Gun
  ? window.Gun({ peers: window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun'] })
  : null;

const elements = {
  status: document.getElementById('syncStatus'),
  total: document.getElementById('totalCount'),
  ready: document.getElementById('readyCount'),
  manual: document.getElementById('manualCount'),
  hold: document.getElementById('holdCount'),
  list: document.getElementById('leadList'),
  refresh: document.getElementById('refreshButton'),
};

const state = {
  records: {},
  drafts: {},
};

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSprintRecord(record, id) {
  const recordId = String(record?.id || id || '');
  const tags = String(record?.tags || '');
  return recordId.startsWith(RECORD_PREFIX) || tags.includes(SPRINT_TAG);
}

function classify(record = {}) {
  const status = String(record.status || '').toLowerCase();
  const tags = String(record.tags || '').toLowerCase();
  if (status === 'lost' || tags.includes('do_not_send')) return 'hold';
  if (tags.includes('manual_verify') || tags.includes('contact_form_or_manual')) return 'manual';
  if (status.includes('invited') || tags.includes('ready_for_review')) return 'ready';
  return 'manual';
}

function statusLabel(record = {}) {
  const status = String(record.status || 'Lead').trim();
  const type = classify(record);
  const className = type === 'ready' ? 'status-ready' : type === 'hold' ? 'status-hold' : 'status-manual';
  return `<span class="${className}">${safe(status)}</span>`;
}

function crmUrl(record = {}) {
  const filter = encodeURIComponent(record.id || record.name || SPRINT_TAG);
  return `../crm/?filter=${filter}`;
}

function draftPreview(record = {}) {
  const draft = state.drafts[record.id] || {};
  return draft.subject || record.nextBestAction || 'Open CRM to review this record.';
}

function render() {
  const records = Object.values(state.records)
    .filter(Boolean)
    .sort((left, right) => {
      const order = { ready: 0, manual: 1, hold: 2 };
      const byClass = order[classify(left)] - order[classify(right)];
      if (byClass) return byClass;
      return String(left.name || '').localeCompare(String(right.name || ''));
    });

  const counts = records.reduce((acc, record) => {
    acc[classify(record)] += 1;
    return acc;
  }, { ready: 0, manual: 0, hold: 0 });

  elements.total.textContent = String(records.length);
  elements.ready.textContent = String(counts.ready);
  elements.manual.textContent = String(counts.manual);
  elements.hold.textContent = String(counts.hold);

  if (!records.length) {
    elements.list.innerHTML = '<p class="empty">No Follow-Up Leak Sprint records found yet. Run the command-center CRM sync first.</p>';
    return;
  }

  elements.list.innerHTML = records.map((record) => `
    <article class="lead-card">
      <div>
        <h3>${safe(record.name || 'Unnamed record')}</h3>
        <p>${safe(record.lastSignal || record.primaryPain || 'No signal recorded yet.')}</p>
        <div class="lead-card__meta">
          ${statusLabel(record)}
          <span>${safe(record.nextFollowUp ? `Follow up ${record.nextFollowUp}` : 'No follow-up date')}</span>
          <span>${safe(record.offerAmount || '$20-$50/mo')}</span>
        </div>
      </div>
      <div class="lead-card__actions">
        <a class="button primary" href="${safe(crmUrl(record))}">Open CRM record</a>
        <a class="button" href="../crm/flow.html">Flow view</a>
        <span>${safe(draftPreview(record))}</span>
      </div>
    </article>
  `).join('');
}

function setStatus(message) {
  if (elements.status) elements.status.textContent = message;
}

function connect() {
  if (!gun) {
    setStatus('Gun is unavailable. Open CRM directly.');
    render();
    return;
  }

  setStatus('Listening to 3dvr-crm and outreach drafts.');
  gun.get('3dvr-crm').map().on((data, id) => {
    if (!id) return;
    if (!data) {
      delete state.records[id];
      render();
      return;
    }
    if (!isSprintRecord(data, id)) return;
    state.records[id] = { ...data, id: data.id || id };
    render();
  });

  gun.get('3dvr-portal').get('crm-outreach-drafts').map().on((data, id) => {
    if (!id || !data) return;
    state.drafts[id] = data;
    render();
  });
}

elements.refresh?.addEventListener('click', () => {
  setStatus('Refreshing live CRM data.');
  render();
});

connect();
