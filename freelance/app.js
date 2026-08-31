import { sanitizeCrmRecord } from '../crm/crm-editing.js';
import {
  buildFreelancerDashboard,
  normalizeFreelanceClient,
  normalizeFreelanceGig,
} from '../src/freelance-client-system.js';

const gun = Gun(window.__GUN_PEERS__ || [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun',
]);
const crmRecords = gun.get('3dvr-crm');
const gigRecords = gun.get('3dvr-freelance-gigs');

const state = {
  clients: Object.create(null),
  gigs: Object.create(null),
  renderTimer: null,
};

const els = {
  syncState: document.getElementById('syncState'),
  metricDue: document.getElementById('metricDue'),
  metricBooked: document.getElementById('metricBooked'),
  metricActive: document.getElementById('metricActive'),
  metricUnpaid: document.getElementById('metricUnpaid'),
  todayList: document.getElementById('todayList'),
  clientList: document.getElementById('clientList'),
  gigList: document.getElementById('gigList'),
  unpaidList: document.getElementById('unpaidList'),
  clientSearch: document.getElementById('clientSearch'),
  clientDialog: document.getElementById('clientDialog'),
  clientForm: document.getElementById('clientForm'),
  clientName: document.getElementById('clientName'),
  clientCompany: document.getElementById('clientCompany'),
  clientEmail: document.getElementById('clientEmail'),
  clientPhone: document.getElementById('clientPhone'),
  clientRole: document.getElementById('clientRole'),
  clientRate: document.getElementById('clientRate'),
  clientWarmth: document.getElementById('clientWarmth'),
  clientSource: document.getElementById('clientSource'),
  clientFollowUp: document.getElementById('clientFollowUp'),
  clientAction: document.getElementById('clientAction'),
  clientNotes: document.getElementById('clientNotes'),
  gigDialog: document.getElementById('gigDialog'),
  gigForm: document.getElementById('gigForm'),
  gigClient: document.getElementById('gigClient'),
  gigTitle: document.getElementById('gigTitle'),
  gigStart: document.getElementById('gigStart'),
  gigEnd: document.getElementById('gigEnd'),
  gigRole: document.getElementById('gigRole'),
  gigRate: document.getElementById('gigRate'),
  gigVenue: document.getElementById('gigVenue'),
  gigStatus: document.getElementById('gigStatus'),
  gigNotes: document.getElementById('gigNotes'),
};

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeAttr(value) {
  return safe(value).replace(/"/g, '&quot;');
}

function makeId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function prettyDate(value) {
  if (!value) return 'No date';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function scheduleRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(render, 35);
}

function setSynced() {
  if (!els.syncState) return;
  els.syncState.textContent = 'Live';
  els.syncState.classList.add('live');
}

function getDashboard() {
  return buildFreelancerDashboard({
    clients: Object.values(state.clients),
    gigs: Object.values(state.gigs),
  });
}

function empty(message, action = '') {
  return `<div class="empty">${safe(message)}${action ? `<div style="margin-top:12px">${action}</div>` : ''}</div>`;
}

function clientNameForGig(gig, dashboard) {
  return dashboard.clients.find(client => client.id === gig.clientId)?.name || gig.clientName || 'Unassigned client';
}

function renderMetrics(dashboard) {
  els.metricDue.textContent = String(dashboard.metrics.due);
  els.metricBooked.textContent = String(dashboard.metrics.booked);
  els.metricActive.textContent = String(dashboard.metrics.active);
  els.metricUnpaid.textContent = String(dashboard.metrics.unpaid);
}

function renderToday(dashboard) {
  const actions = [];

  dashboard.dueClients.forEach(client => {
    actions.push(`
      <article class="action-card">
        <div>
          <h3>${safe(client.name)}${client.company ? ` · ${safe(client.company)}` : ''}</h3>
          <p class="due">Follow-up due ${safe(prettyDate(client.nextFollowUp))}</p>
          <p>${safe(client.nextBestAction || 'Reach out and keep the relationship warm.')}</p>
        </div>
        <div class="card-actions">
          ${client.email ? `<a class="mini-button" href="mailto:${safeAttr(client.email)}">Email</a>` : ''}
          ${client.phone ? `<a class="mini-button" href="tel:${safeAttr(client.phone)}">Call</a>` : ''}
          <button class="mini-button good" type="button" data-client-action="contacted" data-client-id="${safeAttr(client.id)}">Done</button>
        </div>
      </article>
    `);
  });

  dashboard.upcomingGigs.slice(0, 3).forEach(gig => {
    actions.push(`
      <article class="action-card">
        <div>
          <h3>${safe(gig.title || gig.role || 'Booked gig')}</h3>
          <p class="due">${safe(prettyDate(gig.startDate))} · ${safe(clientNameForGig(gig, dashboard))}</p>
          <p>${safe([gig.role, gig.venue, gig.rate].filter(Boolean).join(' · ') || 'Confirm call details before show day.')}</p>
        </div>
        <div class="card-actions">
          <a class="mini-button" href="/calendar/">Calendar</a>
        </div>
      </article>
    `);
  });

  dashboard.unpaidGigs.slice(0, 3).forEach(gig => {
    actions.push(`
      <article class="action-card">
        <div>
          <h3>Get paid · ${safe(gig.title || clientNameForGig(gig, dashboard))}</h3>
          <p class="due">${safe(gig.paymentStatus)}</p>
          <p>${safe([clientNameForGig(gig, dashboard), gig.rate].filter(Boolean).join(' · '))}</p>
        </div>
        <div class="card-actions">
          ${gig.paymentStatus === 'Not invoiced' ? `<button class="mini-button" type="button" data-gig-action="invoice" data-gig-id="${safeAttr(gig.id)}">Invoiced</button>` : ''}
          <button class="mini-button good" type="button" data-gig-action="paid" data-gig-id="${safeAttr(gig.id)}">Paid</button>
        </div>
      </article>
    `);
  });

  els.todayList.innerHTML = actions.length
    ? actions.slice(0, 8).join('')
    : empty('Nothing urgent. Add a client, find an opportunity, or book your next gig.');
}

function renderClients(dashboard) {
  const query = String(els.clientSearch.value || '').trim().toLowerCase();
  const clients = dashboard.pipelineClients.filter(client => {
    const haystack = [client.name, client.company, client.email, client.freelanceRole, client.status, client.source]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return !query || haystack.includes(query);
  });

  if (!clients.length) {
    els.clientList.innerHTML = empty(
      query ? 'No clients match that search.' : 'No clients yet.',
      query ? '' : '<button class="button primary" type="button" data-open-dialog="clientDialog">Add your first client</button>',
    );
    return;
  }

  els.clientList.innerHTML = clients.map(client => {
    const statusTone = ['active', 'won'].includes(client.status.toLowerCase()) ? 'active' : '';
    const warmthTone = client.warmth === 'hot' ? 'hot' : '';
    return `
      <article class="client-card">
        <div class="client-head">
          <div>
            <h3>${safe(client.name)}</h3>
            <p>${safe(client.company || client.source || 'Independent contact')}</p>
          </div>
          <span class="chip ${statusTone}">${safe(client.status)}</span>
        </div>
        <div class="client-meta">
          ${client.warmth ? `<span class="chip ${warmthTone}">${safe(client.warmth)}</span>` : ''}
          ${client.freelanceRole ? `<span class="chip">${safe(client.freelanceRole)}</span>` : ''}
          ${client.freelanceRate ? `<span class="chip">${safe(client.freelanceRate)}</span>` : ''}
        </div>
        <div class="client-next">
          <p><strong>Next:</strong> ${safe(client.nextBestAction || 'Keep the relationship warm.')}</p>
          <p>${client.nextFollowUp ? `Follow up ${safe(prettyDate(client.nextFollowUp))}` : 'No follow-up set'}</p>
        </div>
        <div class="card-actions">
          ${client.email ? `<a class="mini-button" href="mailto:${safeAttr(client.email)}">Email</a>` : ''}
          ${client.phone ? `<a class="mini-button" href="tel:${safeAttr(client.phone)}">Call</a>` : ''}
          <button class="mini-button" type="button" data-client-action="contacted" data-client-id="${safeAttr(client.id)}">Log touch</button>
          ${statusTone ? '' : `<button class="mini-button good" type="button" data-client-action="active" data-client-id="${safeAttr(client.id)}">Repeat client</button>`}
        </div>
      </article>
    `;
  }).join('');
}

function renderGigs(dashboard) {
  const gigs = dashboard.gigs
    .filter(gig => gig.status.toLowerCase() !== 'cancelled')
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

  if (!gigs.length) {
    els.gigList.innerHTML = empty('No gigs tracked yet. Add the next tentative or booked job.');
    return;
  }

  els.gigList.innerHTML = gigs.slice(0, 20).map(gig => `
    <article class="gig-row">
      <div class="gig-date">
        <strong>${safe(prettyDate(gig.startDate))}</strong>
        <span>${safe(gig.status)}</span>
      </div>
      <div>
        <h3>${safe(gig.title || gig.role || 'Freelance gig')}</h3>
        <p>${safe([clientNameForGig(gig, dashboard), gig.role, gig.rate, gig.venue].filter(Boolean).join(' · '))}</p>
      </div>
      <div class="card-actions">
        ${gig.status === 'Booked' ? `<button class="mini-button good" type="button" data-gig-action="complete" data-gig-id="${safeAttr(gig.id)}">Complete</button>` : ''}
        ${gig.status === 'Completed' && gig.paymentStatus === 'Not invoiced' ? `<button class="mini-button" type="button" data-gig-action="invoice" data-gig-id="${safeAttr(gig.id)}">Invoiced</button>` : ''}
        ${gig.status === 'Completed' && gig.paymentStatus !== 'Paid' ? `<button class="mini-button good" type="button" data-gig-action="paid" data-gig-id="${safeAttr(gig.id)}">Paid</button>` : ''}
      </div>
    </article>
  `).join('');
}

function renderUnpaid(dashboard) {
  if (!dashboard.unpaidGigs.length) {
    els.unpaidList.innerHTML = empty('Nothing waiting for payment.');
    return;
  }

  els.unpaidList.innerHTML = dashboard.unpaidGigs.map(gig => `
    <article class="action-card">
      <div>
        <h3>${safe(gig.title || clientNameForGig(gig, dashboard))}</h3>
        <p>${safe(clientNameForGig(gig, dashboard))} · ${safe(gig.rate || 'Rate not recorded')}</p>
        <p class="due">${safe(gig.paymentStatus)}</p>
      </div>
      <div class="card-actions">
        ${gig.paymentStatus === 'Not invoiced' ? `<button class="mini-button" type="button" data-gig-action="invoice" data-gig-id="${safeAttr(gig.id)}">Mark invoiced</button>` : ''}
        <button class="mini-button good" type="button" data-gig-action="paid" data-gig-id="${safeAttr(gig.id)}">Mark paid</button>
      </div>
    </article>
  `).join('');
}

function renderGigClientOptions(dashboard) {
  const selected = els.gigClient.value;
  const options = dashboard.clients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(client => `<option value="${safeAttr(client.id)}">${safe(client.name)}${client.company ? ` — ${safe(client.company)}` : ''}</option>`)
    .join('');
  els.gigClient.innerHTML = `<option value="">No client yet</option>${options}`;
  if ([...els.gigClient.options].some(option => option.value === selected)) {
    els.gigClient.value = selected;
  }
}

function render() {
  const dashboard = getDashboard();
  renderMetrics(dashboard);
  renderToday(dashboard);
  renderClients(dashboard);
  renderGigs(dashboard);
  renderUnpaid(dashboard);
  renderGigClientOptions(dashboard);
  setSynced();
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog || typeof dialog.showModal !== 'function') return;
  if (id === 'clientDialog' && !els.clientFollowUp.value) {
    els.clientFollowUp.value = addDays(2);
  }
  if (id === 'gigDialog' && !els.gigStart.value) {
    els.gigStart.value = dateKey();
  }
  dialog.showModal();
}

function closeDialog(id) {
  document.getElementById(id)?.close();
}

function handleClientSubmit(event) {
  event.preventDefault();
  const id = makeId('client');
  const now = new Date().toISOString();
  const record = {
    id,
    recordType: 'person',
    name: els.clientName.value.trim(),
    company: els.clientCompany.value.trim(),
    email: els.clientEmail.value.trim(),
    phone: els.clientPhone.value.trim(),
    status: 'Lead',
    warmth: els.clientWarmth.value,
    freelanceRole: els.clientRole.value.trim(),
    freelanceRate: els.clientRate.value.trim(),
    source: els.clientSource.value.trim() || 'freelance-desk',
    marketSegment: 'Event or AV operator',
    nextFollowUp: els.clientFollowUp.value,
    nextBestAction: els.clientAction.value.trim(),
    notes: els.clientNotes.value.trim(),
    created: now,
    updated: now,
  };
  if (!record.name) return;
  crmRecords.get(id).put(record);
  els.clientForm.reset();
  closeDialog('clientDialog');
}

function handleGigSubmit(event) {
  event.preventDefault();
  const id = makeId('gig');
  const client = state.clients[els.gigClient.value];
  const startDate = els.gigStart.value;
  const record = {
    id,
    clientId: client?.id || '',
    clientName: client?.name || '',
    title: els.gigTitle.value.trim(),
    startDate,
    endDate: els.gigEnd.value || startDate,
    role: els.gigRole.value.trim(),
    rate: els.gigRate.value.trim(),
    venue: els.gigVenue.value.trim(),
    status: els.gigStatus.value,
    paymentStatus: els.gigStatus.value === 'Completed' ? 'Not invoiced' : 'Not invoiced',
    notes: els.gigNotes.value.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!record.title || !record.startDate) return;
  gigRecords.get(id).put(record);
  if (client && ['Booked', 'Completed'].includes(record.status)) {
    crmRecords.get(client.id).put({
      status: 'Active',
      warmth: 'hot',
      updated: new Date().toISOString(),
    });
  }
  els.gigForm.reset();
  closeDialog('gigDialog');
}

function updateClient(id, patch) {
  if (!id || !state.clients[id]) return;
  crmRecords.get(id).put({
    ...patch,
    updated: new Date().toISOString(),
  });
}

function updateGig(id, patch) {
  if (!id || !state.gigs[id]) return;
  gigRecords.get(id).put({
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function handleActionClick(event) {
  const open = event.target.closest('[data-open-dialog]');
  if (open) {
    openDialog(open.dataset.openDialog);
    return;
  }

  const close = event.target.closest('[data-close-dialog]');
  if (close) {
    closeDialog(close.dataset.closeDialog);
    return;
  }

  const clientButton = event.target.closest('[data-client-action]');
  if (clientButton) {
    const { clientAction, clientId } = clientButton.dataset;
    if (clientAction === 'contacted') {
      updateClient(clientId, {
        lastContacted: new Date().toISOString(),
        nextFollowUp: addDays(7),
        nextBestAction: 'Follow up if new work or availability comes up.',
      });
    }
    if (clientAction === 'active') {
      updateClient(clientId, { status: 'Active', warmth: 'hot' });
    }
    return;
  }

  const gigButton = event.target.closest('[data-gig-action]');
  if (gigButton) {
    const { gigAction, gigId } = gigButton.dataset;
    if (gigAction === 'complete') updateGig(gigId, { status: 'Completed', paymentStatus: 'Not invoiced' });
    if (gigAction === 'invoice') updateGig(gigId, { paymentStatus: 'Invoiced' });
    if (gigAction === 'paid') updateGig(gigId, { paymentStatus: 'Paid' });
  }
}

crmRecords.map().on((data, key) => {
  if (!data) {
    delete state.clients[key];
    scheduleRender();
    return;
  }
  const record = sanitizeCrmRecord({ ...data, id: data.id || key });
  if (record.recordType !== 'person') return;
  const client = normalizeFreelanceClient(record);
  if (!client.id || !client.name) return;
  state.clients[client.id] = client;
  scheduleRender();
});

gigRecords.map().on((data, key) => {
  if (!data) {
    delete state.gigs[key];
    scheduleRender();
    return;
  }
  const gig = normalizeFreelanceGig({ ...data, id: data.id || key });
  if (!gig.id) return;
  state.gigs[gig.id] = gig;
  scheduleRender();
});

document.addEventListener('click', handleActionClick);
els.clientForm.addEventListener('submit', handleClientSubmit);
els.gigForm.addEventListener('submit', handleGigSubmit);
els.clientSearch.addEventListener('input', scheduleRender);

render();
