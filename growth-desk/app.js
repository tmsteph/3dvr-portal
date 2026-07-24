const gun = window.Gun
  ? window.Gun({ peers: window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun'] })
  : null;
const SPRINT_TAG = 'follow-up-leak-sprint';

const elements = {
  navToggle: document.getElementById('navToggle'),
  navMenu: document.getElementById('growthNav'),
  status: document.getElementById('syncStatus'),
  total: document.getElementById('totalCount'),
  ready: document.getElementById('readyCount'),
  manual: document.getElementById('manualCount'),
  hold: document.getElementById('holdCount'),
  list: document.getElementById('leadList'),
  refresh: document.getElementById('refreshButton'),
};

const autopilotStateRoot = gun ? gun.get('3dvr').get('ops').get('autopilot').get('state') : null;

function setNav(open) {
  if (!elements.navToggle || !elements.navMenu) return;
  elements.navToggle.setAttribute('aria-expanded', String(open));
  elements.navMenu.classList.toggle('is-open', open);
}

elements.navToggle?.addEventListener('click', () => {
  setNav(elements.navToggle.getAttribute('aria-expanded') !== 'true');
});

elements.navMenu?.addEventListener('click', () => setNav(false));
document.addEventListener('click', (event) => {
  if (!event.target.closest('.topbar')) setNav(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setNav(false);
});

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

function isRelevantRecord(record, id) {
  const recordId = String(record?.id || id || '');
  const name = String(record?.name || '').trim();
  // The old desk only showed one sprint tag. The CRM is now the source of truth,
  // so show every real contact record and leave campaign filtering to the CRM.
  return Boolean(recordId && name && !recordId.startsWith('system-'));
}

function classify(record = {}) {
  const status = String(record.status || '').toLowerCase();
  const tags = String(record.tags || '').toLowerCase();
  if (status === 'lost' || tags.includes('do_not_send')) return 'hold';
  if (tags.includes('manual_verify') || tags.includes('contact_form_or_manual')) return 'manual';
  if (record.email || tags.includes('route/email') || status.includes('invited') || tags.includes('ready_for_review')) return 'ready';
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
  return draft.subject || record.lastMessageSubject || record.nextBestAction || 'Open CRM to review this record.';
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
        <p>${safe(record.lastMessage || record.lastSignal || record.primaryPain || 'No signal recorded yet.')}</p>
        <div class="lead-card__meta">
          ${statusLabel(record)}
          <span>${safe(record.nextFollowUp ? `Follow up ${record.nextFollowUp}` : 'No follow-up date')}</span>
          <span>${safe(record.offerAmount || '$20-$50/mo')}</span>
        </div>
      </div>
      <div class="lead-card__actions">
        <a class="button primary" href="${safe(crmUrl(record))}">Open CRM record</a>
        <a class="button approval-button" href="../growth-operator/?record=${encodeURIComponent(record.id || '')}">Inspect outreach</a>
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

  setStatus('Listening to the unified CRM and outreach history.');
  autopilotStateRoot?.on((data) => {
    const lastRun = String(data?.lastRunAt || data?.ranAt || '').trim();
    const blocked = String(data?.campaign?.sendBlockedReason || '').trim();
    if (lastRun) {
      setStatus(`Worker last ran ${lastRun}${blocked ? ` · sends paused: ${blocked}` : ' · worker state received'}.`);
    }
  });
  window.setTimeout(() => {
    if (!Object.keys(state.records).length) {
      setStatus('No CRM records arrived yet. Check the worker sync/relay before assuming outreach is running.');
    }
  }, 8000);
  gun.get('3dvr-crm').map().on((data, id) => {
    if (!id) return;
    if (!data) {
      delete state.records[id];
      render();
      return;
    }
    if (!isRelevantRecord(data, id)) return;
    state.records[id] = { ...data, id: data.id || id };
    render();
  });

  gun.get('3dvr-portal').get('crm-outreach-drafts').map().on((data, id) => {
    if (!id || !data) return;
    state.drafts[id] = data;
    render();
  });

  gun.get('3dvr-portal').get('crm-touch-log').map().on((data) => {
    if (!data?.recordId && !data?.crmRecordId) return;
    const recordId = data.recordId || data.crmRecordId;
    const record = state.records[recordId];
    if (!record) return;
    const existingTime = String(record.lastTouchAt || record.lastContacted || '');
    const nextTime = String(data.created || data.updated || '');
    if (nextTime >= existingTime) {
      state.records[recordId] = {
        ...record,
        lastTouchAt: nextTime,
        lastMessage: data.message || record.lastMessage,
        lastMessageSubject: data.subject || record.lastMessageSubject,
        lastDeliveryStatus: data.deliveryStatus || record.lastDeliveryStatus,
        replyCount: record.replyCount || (data.touchType === 'reply-received' ? 1 : 0),
      };
      render();
    }
  });
}

elements.refresh?.addEventListener('click', () => {
  setStatus('Refreshing live CRM data.');
  render();
});

connect();
