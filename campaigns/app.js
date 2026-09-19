import {
  campaignDayKey,
  composeMessage,
  filterSuppressed,
  parseRecipients,
  remainingDailyAllowance,
  validateCampaign,
} from './core.js';
import { fetchPortalJson } from './api.js';
import {
  markCampaignLeadStatus,
  queueCampaignLeads
} from '../src/money-printer/campaignBridge.js';
import {
  markLeadVaultStatus,
  saveDiscoveredLeads
} from '../src/money-printer/leadVault.js';
import { createBrowserLeadVaultSync } from '../src/money-printer/leadVaultSync.js';
import {
  resolveBrowserLocation,
  resolveTypedLocation
} from './location.js';
import {
  formatPostalAddress,
  normalizePostalAddressInput
} from './address.js';

const STORAGE = {
  connection: '3dvr.campaigns.google.connection',
  draft: '3dvr.campaigns.draft',
  history: '3dvr.campaigns.history',
  sent: '3dvr.campaigns.sent-by-day',
  oauth: 'portal.oauth.result',
  discovered: '3dvr.campaigns.discovered-leads',
};
const DAILY_CAP = 25;
const SEND_DELAY_MS = 1600;

const $ = id => document.getElementById(id);
const elements = {
  form: $('campaignForm'), recipients: $('recipients'), recipientCount: $('recipientCount'),
  contactSource: $('contactSource'), sourceAck: $('sourceAck'), subject: $('subject'),
  message: $('message'), businessName: $('businessName'), postalAddress: $('postalAddress'),
  suppressed: $('suppressed'), connect: $('connectGmail'), disconnect: $('disconnectGmail'),
  status: $('gmailStatus'), detail: $('gmailDetail'), sendTest: $('sendTest'),
  sendCampaign: $('sendCampaign'), sendSummary: $('sendSummary'), csvFile: $('csvFile'),
  notice: $('notice'), progress: $('progress'), progressBar: $('progressBar'),
  progressText: $('progressText'), history: $('history'), clearHistory: $('clearHistory'),
  leadForm: $('leadFinderForm'), leadDescription: $('leadDescription'), leadLocation: $('leadLocation'),
  leadCount: $('leadCount'), findLeads: $('findLeads'), leadNotice: $('leadNotice'),
  leadLocationStatus: $('leadLocationStatus'), leadLocationChoices: $('leadLocationChoices'),
  leadResults: $('leadResults'), leadActions: $('leadActions'), addLeads: $('addLeads'),
  leadVaultSyncStatus: $('leadVaultSyncStatus'),
};

let connection = readJson(STORAGE.connection, null);
let sending = false;
let discoveredLeads = [];
let suggestedCampaign = null;
let leadVaultAccountSync = null;
let leadVaultSyncWrites = Promise.resolve();
let chosenManualLocation = '';

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function showNotice(message, kind = '') {
  elements.notice.hidden = !message;
  elements.notice.className = `notice ${kind}`.trim();
  elements.notice.textContent = message;
}

function showLeadNotice(message, kind = '') {
  elements.leadNotice.hidden = !message;
  elements.leadNotice.className = `notice ${kind}`.trim();
  elements.leadNotice.textContent = message;
}

function setLeadVaultSyncStatus(message) {
  if (elements.leadVaultSyncStatus) {
    elements.leadVaultSyncStatus.textContent = message;
  }
}

async function initializeLeadVaultAccountSync() {
  setLeadVaultSyncStatus('Lead Vault: checking secure sync…');
  try {
    const accountSync = await createBrowserLeadVaultSync({
      onRemoteMerge: leads => {
        setLeadVaultSyncStatus(
          `Lead Vault: synced securely · ${leads.length} lead${leads.length === 1 ? '' : 's'}`
        );
      }
    });
    if (!accountSync.available) {
      setLeadVaultSyncStatus('Lead Vault: device only · sign in to sync');
      return;
    }

    leadVaultAccountSync = accountSync;
    setLeadVaultSyncStatus(
      `Lead Vault: synced securely · ${accountSync.leads.length} lead${accountSync.leads.length === 1 ? '' : 's'}`
    );
  } catch (_error) {
    setLeadVaultSyncStatus('Lead Vault: saved locally · sync retry needed');
  }
}

function scheduleLeadVaultSync() {
  if (!leadVaultAccountSync?.available) return leadVaultSyncWrites;

  setLeadVaultSyncStatus('Lead Vault: syncing securely…');
  leadVaultSyncWrites = leadVaultSyncWrites
    .catch(() => undefined)
    .then(() => leadVaultAccountSync.reconcile())
    .then(leads => {
      setLeadVaultSyncStatus(
        `Lead Vault: synced securely · ${leads.length} lead${leads.length === 1 ? '' : 's'}`
      );
      return leads;
    })
    .catch(() => {
      setLeadVaultSyncStatus('Lead Vault: saved locally · sync retry needed');
      return [];
    });
  return leadVaultSyncWrites;
}

function setLocationStatus(message, kind = '') {
  if (!elements.leadLocationStatus) return;
  elements.leadLocationStatus.textContent = message;
  elements.leadLocationStatus.className = `location-status ${kind}`.trim();
}

function clearLocationChoices() {
  if (!elements.leadLocationChoices) return;
  elements.leadLocationChoices.replaceChildren();
  elements.leadLocationChoices.hidden = true;
}

function renderLocationChoices(candidates = []) {
  clearLocationChoices();
  if (!elements.leadLocationChoices) return;

  candidates.slice(0, 4).forEach(candidate => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'location-choice';
    button.textContent = candidate.label;
    button.addEventListener('click', () => {
      chosenManualLocation = candidate.label;
      elements.leadLocation.value = candidate.label;
      clearLocationChoices();
      setLocationStatus(`Searching near: ${candidate.label}`, 'verified');
      elements.leadForm.requestSubmit();
    });
    elements.leadLocationChoices.append(button);
  });
  elements.leadLocationChoices.hidden = false;
}

async function resolveSearchLocation() {
  const typed = elements.leadLocation.value.trim();
  clearLocationChoices();

  if (typed) {
    if (chosenManualLocation && typed === chosenManualLocation) {
      setLocationStatus(`Searching near: ${typed}`, 'verified');
      return { location: typed, source: 'manual' };
    }

    setLocationStatus('Checking that location…');
    const result = await resolveTypedLocation(typed);
    if (!result.candidates.length) {
      throw new Error('I could not verify that location. Try City, State or a ZIP code.');
    }
    if (result.ambiguous) {
      renderLocationChoices(result.candidates);
      setLocationStatus('Which location did you mean? Choose one below.', 'choice');
      return { needsChoice: true };
    }

    const candidate = result.candidate;
    chosenManualLocation = candidate.label;
    elements.leadLocation.value = candidate.label;
    setLocationStatus(`Searching near: ${candidate.label}`, 'verified');
    return { location: candidate.label, source: 'manual', candidate };
  }

  setLocationStatus('Checking your approximate browser location…');
  try {
    const result = await resolveBrowserLocation();
    if (result.candidate?.label) {
      setLocationStatus(
        `Using your approximate location: ${result.candidate.label}`,
        'verified'
      );
      return {
        location: result.candidate.label,
        source: 'browser',
        candidate: result.candidate
      };
    }
  } catch (_error) {
    // Browser location is optional. Fall through to a broad search.
  }

  setLocationStatus(
    'Location unavailable — searching anywhere. Add City, State or ZIP to target an area.'
  );
  return { location: '', source: 'broad' };
}

function renderLeadResults() {
  elements.leadResults.replaceChildren();
  elements.leadResults.hidden = discoveredLeads.length === 0;
  elements.leadActions.hidden = discoveredLeads.length === 0;
  discoveredLeads.forEach((lead, index) => {
    const row = document.createElement('label');
    row.className = 'lead-result';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.leadIndex = String(index);
    const body = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = lead.name || lead.email;
    const email = document.createElement('span');
    email.className = 'lead-email';
    email.textContent = lead.email;
    const why = document.createElement('small');
    why.textContent = [lead.location, lead.whyFit].filter(Boolean).join(' · ');
    const source = document.createElement('a');
    source.href = lead.sourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Verify source';
    source.addEventListener('click', event => event.stopPropagation());
    body.append(name, email, why, source);
    row.append(checkbox, body);
    elements.leadResults.append(row);
  });
}

async function findLeads(event) {
  event.preventDefault();
  const description = elements.leadDescription.value.trim();

  discoveredLeads = [];
  renderLeadResults();
  elements.findLeads.disabled = true;
  const originalLabel = elements.findLeads.textContent;

  try {
    elements.findLeads.textContent = 'Checking location…';
    const locationResolution = await resolveSearchLocation();
    if (locationResolution.needsChoice) return;

    showLeadNotice('Searching the public web for verified business emails…');
    elements.findLeads.textContent = 'Searching…';
    const { response, payload, usedFallback } = await fetchPortalJson('/api/openai-site?provider=lead-finder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadFinder: true,
        description,
        location: locationResolution.location,
        count: Number(elements.leadCount.value) || 10,
      }),
    });
    if (!response.ok || !payload.ok) {
      const code = String(payload.code || '').toLowerCase();
      if (response.status === 402 || /credit|quota|billing|spend/.test(code + ' ' + String(payload.error || ''))) {
        throw new Error('OpenAI API billing needs credits before automatic lead search can run. Manual paste/CSV still works meanwhile.');
      }
      throw new Error(payload.error || 'Lead search failed.');
    }
    discoveredLeads = Array.isArray(payload.leads) ? payload.leads : [];
    suggestedCampaign = payload.campaignDraft && typeof payload.campaignDraft === 'object'
      ? payload.campaignDraft
      : null;
    if (suggestedCampaign?.subject && !elements.subject.value.trim()) {
      elements.subject.value = suggestedCampaign.subject;
    }
    if (suggestedCampaign?.body && !elements.message.value.trim()) {
      elements.message.value = suggestedCampaign.body;
    }
    writeJson(STORAGE.draft, draftSnapshot());
    writeJson(STORAGE.discovered, {
      at: Date.now(),
      query: payload.query,
      leads: discoveredLeads,
      campaignDraft: suggestedCampaign
    });
    const vault = saveDiscoveredLeads({
      leads: discoveredLeads,
      offer: payload.query?.description || description,
      location: payload.query?.location || locationResolution.location,
      campaignDraft: suggestedCampaign
    });
    scheduleLeadVaultSync();
    renderLeadResults();
    updateSummary();
    const routeNote = usedFallback ? ' Backup route used.' : '';
    const defaultNote = payload.query?.usedDefaultBrief ? ' I chose a practical offer automatically.' : '';
    const vaultNote = discoveredLeads.length ? ` Saved in Lead Vault (${vault.total} total).` : '';
    showLeadNotice(discoveredLeads.length
      ? `Found ${discoveredLeads.length} likely customer${discoveredLeads.length === 1 ? '' : 's'} with public source evidence${suggestedCampaign?.body ? ' and drafted your outreach' : ''}.${defaultNote}${vaultNote} Review the matches, then use the ones you want.${routeNote}`
      : `No publicly verified business emails were found for that search. Try broadening the offer, customer type, or location.${routeNote}`,
      discoveredLeads.length ? 'success' : '');
  } catch (error) {
    showLeadNotice(error.message || 'Lead search failed.', 'error');
  } finally {
    elements.findLeads.disabled = false;
    elements.findLeads.textContent = originalLabel;
  }
}

function addSelectedLeads() {
  const selected = Array.from(elements.leadResults.querySelectorAll('[data-lead-index]:checked'))
    .map(input => discoveredLeads[Number(input.dataset.leadIndex)])
    .filter(Boolean);
  if (!selected.length) {
    showLeadNotice('Select at least one lead to prepare outreach.', 'error');
    return;
  }
  selected.forEach(lead => markLeadVaultStatus(lead.email, 'selected'));
  scheduleLeadVaultSync();
  const additions = selected.map(lead => lead.name ? `${lead.name} <${lead.email}>` : lead.email);
  const merged = parseRecipients([elements.recipients.value, ...additions].filter(Boolean).join('\n'));
  elements.recipients.value = merged.map(recipient => recipient.name
    ? `${recipient.name} <${recipient.email}>`
    : recipient.email).join('\n');
  elements.contactSource.value = 'Business contacts I researched individually';
  writeJson(STORAGE.draft, draftSnapshot());
  const moneyPrinter = queueCampaignLeads({
    leads: selected,
    subject: elements.subject.value,
    body: elements.message.value,
    offer: elements.leadDescription.value,
    senderName: elements.businessName.value
  });
  updateSummary();
  showLeadNotice(
    `Prepared outreach for ${selected.length} selected lead${selected.length === 1 ? '' : 's'} and queued ${moneyPrinter.queued || selected.length} in Money Printer for review.`,
    'success'
  );
  elements.subject?.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function draftSnapshot() {
  return {
    recipients: elements.recipients.value,
    contactSource: elements.contactSource.value,
    subject: elements.subject.value,
    message: elements.message.value,
    businessName: elements.businessName.value,
    postalAddress: elements.postalAddress.value,
    suppressed: elements.suppressed.value,
  };
}
function restoreDraft() {
  const draft = readJson(STORAGE.draft, {});
  Object.entries(draft).forEach(([key, value]) => {
    if (elements[key] && typeof value === 'string') elements[key].value = value;
  });
}
function consumeOAuthResult() {
  const result = readJson(STORAGE.oauth, null);
  if (!result || result.provider !== 'google' || result.scopeKey !== 'gmail-send') return;
  localStorage.removeItem(STORAGE.oauth);
  if (!result.ok || !result.connection?.accessToken) {
    showNotice(result.error || 'Google connection failed.', 'error');
    return;
  }
  connection = { ...result.connection, needsReconnect: false, lastAuthError: '' };
  writeJson(STORAGE.connection, connection);
  if (!elements.businessName.value.trim() && connection.displayName) {
    elements.businessName.value = connection.displayName;
    writeJson(STORAGE.draft, draftSnapshot());
  }
  showNotice(`Connected ${connection.email || 'Google account'}.`, 'success');
}
function connectionHasGmailSendScope(value = connection) {
  const scopeKey = String(value?.scopeKey || '').toLowerCase();
  const scope = String(value?.scope || '').toLowerCase();
  return scopeKey === 'gmail-send'
    || scopeKey === 'calendar-gmail-send'
    || scope.includes('https://www.googleapis.com/auth/gmail.send');
}
function connectionReady() {
  return Boolean(
    connection?.accessToken
    && connection?.email
    && connectionHasGmailSendScope(connection)
    && !connection?.needsReconnect
  );
}

function markConnectionNeedsReconnect(reason = '') {
  if (!connection) return;
  connection = {
    ...connection,
    accessToken: '',
    expiresAt: 0,
    needsReconnect: true,
    lastAuthError: String(reason || '').slice(0, 500)
  };
  writeJson(STORAGE.connection, connection);
}
function updateConnectionUi() {
  const connected = connectionReady();
  const hasIdentity = Boolean(connection?.accessToken && connection?.email);
  elements.status.textContent = connected
    ? connection.email
    : hasIdentity
      ? 'Reconnect Gmail'
      : 'Not connected';
  elements.detail.textContent = connected
    ? 'Google OAuth · Gmail send permission verified'
    : hasIdentity
      ? 'This saved Google connection is missing verified Gmail send permission.'
      : 'Connect the Google account you want to send from.';
  elements.connect.hidden = connected;
  elements.connect.textContent = hasIdentity ? 'Reconnect Gmail' : 'Connect Gmail';
  elements.disconnect.hidden = !connected;
  elements.sendTest.disabled = !connected || sending;
  elements.sendCampaign.disabled = !connected || sending;
  updateSummary();
}
function currentRecipients() {
  const all = parseRecipients(elements.recipients.value);
  const suppressed = parseRecipients(elements.suppressed.value).map(item => item.email);
  return { all, sendable: filterSuppressed(all, suppressed), suppressedCount: all.length - filterSuppressed(all, suppressed).length };
}
function sentToday() {
  const sent = readJson(STORAGE.sent, {});
  return Number(sent[campaignDayKey()] || 0);
}
function incrementSent() {
  const sent = readJson(STORAGE.sent, {});
  const key = campaignDayKey();
  sent[key] = Number(sent[key] || 0) + 1;
  writeJson(STORAGE.sent, sent);
}
function updateSummary() {
  const { all, sendable, suppressedCount } = currentRecipients();
  const allowance = remainingDailyAllowance(sentToday(), DAILY_CAP);
  elements.recipientCount.textContent = `${all.length} valid · ${sendable.length} sendable${suppressedCount ? ` · ${suppressedCount} suppressed` : ''}`;
  elements.sendSummary.textContent = connectionReady()
    ? `${Math.min(sendable.length, allowance)} ready now · ${allowance} daily slots left`
    : 'Connect Gmail to begin.';
}
async function refreshConnection() {
  if (!connection?.refreshToken) throw new Error('Reconnect Gmail to refresh this session.');
  const response = await fetch('/api/oauth/google?action=refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: connection.refreshToken, scopeKey: 'gmail-send' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.accessToken) throw new Error(payload.error || 'Unable to refresh Gmail connection.');
  connection = { ...connection, ...payload, email: connection.email };
  writeJson(STORAGE.connection, connection);
  return connection;
}
async function activeConnection() {
  if (!connectionReady()) {
    throw new Error(connection?.needsReconnect ? 'Reconnect Gmail before sending.' : 'Connect Gmail first.');
  }
  if (!connection.expiresAt || Date.now() > Number(connection.expiresAt) - 60_000) {
    try {
      await refreshConnection();
    } catch (error) {
      markConnectionNeedsReconnect(error.message);
      updateConnectionUi();
      throw new Error('Gmail authorization needs to be reconnected. Reconnect Gmail, then send a test message.');
    }
  }
  return connection;
}
function isGmailAuthFailure(status, message = '') {
  return status === 401
    || status === 403
    || /invalid authentication credentials|insufficient authentication scopes|insufficient permission|unauthenticated|invalid_grant|access token|oauth/i.test(String(message || ''));
}

async function gmailSendAttempt(active, { to, subject, text }) {
  const response = await fetch('/api/oauth/google?action=sendmail', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: active.accessToken, to, subject, text }),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function gmailSend({ to, subject, text }) {
  let active = await activeConnection();
  let attempt = await gmailSendAttempt(active, { to, subject, text });
  let message = attempt.payload.error || 'Gmail send failed.';

  if ((!attempt.response.ok || !attempt.payload.ok)
    && isGmailAuthFailure(attempt.response.status, message)
    && active.refreshToken) {
    try {
      active = await refreshConnection();
      attempt = await gmailSendAttempt(active, { to, subject, text });
      message = attempt.payload.error || 'Gmail send failed.';
    } catch (error) {
      message = error.message || message;
    }
  }

  if (!attempt.response.ok || !attempt.payload.ok) {
    const authFailure = isGmailAuthFailure(attempt.response.status, message);
    if (authFailure) {
      markConnectionNeedsReconnect(message);
      updateConnectionUi();
    }
    const error = new Error(
      authFailure
        ? 'Gmail authorization needs to be reconnected. Reconnect Gmail, then send a test message before starting the campaign.'
        : message
    );
    error.stopCampaign = authFailure;
    throw error;
  }
  return attempt.payload;
}
function formattedPostalAddress() {
  return formatPostalAddress(elements.postalAddress.value);
}

function validation(sendable) {
  return validateCampaign({
    subject: elements.subject.value,
    body: elements.message.value,
    businessName: elements.businessName.value,
    postalAddress: formattedPostalAddress(),
    recipients: sendable,
    sourceAcknowledged: elements.sourceAck.checked && Boolean(elements.contactSource.value),
  });
}
function messageFor(recipient) {
  return composeMessage({
    body: elements.message.value,
    recipient,
    businessName: elements.businessName.value,
    postalAddress: formattedPostalAddress(),
  });
}
function addHistory(entry) {
  const history = readJson(STORAGE.history, []);
  history.unshift(entry);
  writeJson(STORAGE.history, history.slice(0, 60));
  renderHistory();
}
function renderHistory() {
  const history = readJson(STORAGE.history, []);
  if (!history.length) {
    elements.history.className = 'history-empty';
    elements.history.textContent = 'No sends from this browser yet.';
    return;
  }
  elements.history.className = 'history-list';
  elements.history.replaceChildren(...history.slice(0, 12).map(item => {
    const row = document.createElement('div');
    row.className = 'history-item';
    const title = document.createElement('strong');
    title.textContent = item.subject || '(no subject)';
    const detail = document.createElement('span');
    detail.textContent = `${item.sent || 0} sent · ${item.failed || 0} failed · ${new Date(item.at).toLocaleString()}`;
    row.append(title, detail);
    return row;
  }));
}
function setProgress(done, total, text) {
  elements.progress.hidden = false;
  elements.progressBar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  elements.progressText.textContent = text;
}
async function runCampaign(event) {
  event.preventDefault();
  if (sending) return;
  showNotice('');
  const { sendable } = currentRecipients();
  const check = validation(sendable);
  if (!connectionReady()) {
    check.errors.unshift(connection?.needsReconnect ? 'Reconnect Gmail before sending.' : 'Connect Gmail first.');
  }
  if (!check.ok || !connectionReady()) {
    showNotice(check.errors.join('\n'), 'error');
    return;
  }
  const allowance = remainingDailyAllowance(sentToday(), DAILY_CAP);
  const batch = sendable.slice(0, allowance);
  if (!batch.length) {
    showNotice('Daily beta send limit reached for this browser/account.', 'error');
    return;
  }
  if (!window.confirm(`Send this campaign to ${batch.length} recipient${batch.length === 1 ? '' : 's'} from ${connection.email}?`)) return;

  try {
    await activeConnection();
  } catch (error) {
    showNotice(error.message || 'Reconnect Gmail before sending.', 'error');
    updateConnectionUi();
    return;
  }

  sending = true;
  updateConnectionUi();
  let sent = 0;
  let failed = 0;
  let fatalError = '';
  setProgress(0, batch.length, 'Starting…');

  for (let index = 0; index < batch.length; index += 1) {
    const recipient = batch[index];
    setProgress(index, batch.length, `Sending ${index + 1} of ${batch.length} to ${recipient.email}…`);
    try {
      await gmailSend({ to: recipient.email, subject: elements.subject.value.trim(), text: messageFor(recipient) });
      sent += 1;
      incrementSent();
      markCampaignLeadStatus(recipient.email, 'sent');
      markLeadVaultStatus(recipient.email, 'sent');
    } catch (error) {
      failed += 1;
      markCampaignLeadStatus(recipient.email, 'send-failed');
      markLeadVaultStatus(recipient.email, 'send-failed');
      console.error(error);
      if (error.stopCampaign) {
        fatalError = error.message || 'Gmail authorization failed.';
      }
    }
    setProgress(index + 1, batch.length, fatalError
      ? `Stopped after Gmail authorization failed · Sent ${sent} · Failed ${failed}`
      : `Sent ${sent} · Failed ${failed}`);
    if (fatalError) break;
    if (index < batch.length - 1) await sleep(SEND_DELAY_MS);
  }

  addHistory({
    at: Date.now(),
    subject: elements.subject.value.trim(),
    sent,
    failed,
    from: connection.email,
    error: fatalError
  });
  scheduleLeadVaultSync();
  showNotice(
    fatalError
      ? `${fatalError} No further recipients were attempted. ${sent} sent before the stop.`
      : `Campaign finished. ${sent} sent, ${failed} failed.`,
    failed ? 'error' : 'success'
  );
  sending = false;
  updateConnectionUi();
}

async function sendTest() {
  showNotice('');
  const recipient = { email: connection?.email || '', name: connection?.displayName || 'Test' };
  const check = validation([recipient]);
  if (!connectionReady()) {
    check.errors.unshift(connection?.needsReconnect ? 'Reconnect Gmail before sending.' : 'Connect Gmail first.');
  }
  if (!check.ok || !connectionReady()) return showNotice(check.errors.join('\n'), 'error');
  elements.sendTest.disabled = true;
  try {
    await gmailSend({ to: recipient.email, subject: `[TEST] ${elements.subject.value.trim()}`, text: messageFor(recipient) });
    showNotice(`Test sent to ${recipient.email}.`, 'success');
  } catch (error) {
    showNotice(error.message || 'Test send failed.', 'error');
  } finally {
    updateConnectionUi();
  }
}

function importCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result || '').split(/\r?\n/).filter(Boolean);
    if (!lines.length) return;
    const header = lines[0].toLowerCase().split(',').map(value => value.trim());
    const emailIndex = Math.max(0, header.findIndex(value => value.includes('email')));
    const nameIndex = header.findIndex(value => value === 'name' || value.includes('full name'));
    const start = header.some(value => value.includes('email')) ? 1 : 0;
    const imported = lines.slice(start).map(line => {
      const cells = line.split(',').map(value => value.trim().replace(/^"|"$/g, ''));
      const email = cells[emailIndex] || '';
      const name = nameIndex >= 0 ? cells[nameIndex] : '';
      return name ? `${name} <${email}>` : email;
    }).filter(Boolean);
    elements.recipients.value = [elements.recipients.value.trim(), ...imported].filter(Boolean).join('\n');
    writeJson(STORAGE.draft, draftSnapshot());
    updateSummary();
  };
  reader.readAsText(file);
}

document.querySelectorAll('[data-lead-example]').forEach(button => {
  button.addEventListener('click', () => {
    elements.leadDescription.value = button.dataset.leadExample || '';
    elements.leadDescription.focus();
  });
});

elements.leadLocation.addEventListener('input', () => {
  chosenManualLocation = '';
  clearLocationChoices();
  setLocationStatus(
    elements.leadLocation.value.trim()
      ? 'We will verify this place before searching.'
      : 'Leave blank to use your approximate browser location.'
  );
});

elements.leadForm.addEventListener('submit', findLeads);
elements.addLeads.addEventListener('click', addSelectedLeads);
elements.connect.addEventListener('click', () => {
  location.href = '/api/oauth/google?action=start&scopeKey=gmail-send&intent=campaigns&returnTo=/campaigns/';
});
elements.disconnect.addEventListener('click', () => {
  localStorage.removeItem(STORAGE.connection);
  connection = null;
  showNotice('Gmail disconnected from this browser.');
  updateConnectionUi();
});
elements.form.addEventListener('submit', runCampaign);
elements.sendTest.addEventListener('click', sendTest);
elements.csvFile.addEventListener('change', () => {
  const [file] = elements.csvFile.files || [];
  if (file) importCsv(file);
  elements.csvFile.value = '';
});
elements.clearHistory.addEventListener('click', () => {
  localStorage.removeItem(STORAGE.history);
  renderHistory();
});
elements.postalAddress.addEventListener('blur', () => {
  normalizePostalAddressInput(elements.postalAddress);
  writeJson(STORAGE.draft, draftSnapshot());
});

elements.form.addEventListener('input', () => {
  writeJson(STORAGE.draft, draftSnapshot());
  updateSummary();
});

restoreDraft();
if (elements.postalAddress.value) normalizePostalAddressInput(elements.postalAddress);
consumeOAuthResult();
renderHistory();
updateConnectionUi();
initializeLeadVaultAccountSync();
