import {
  composeMessage,
  filterSuppressed,
  personalize,
  parseRecipients,
  remainingDailyAllowance,
  validateCampaign,
} from './core.js';
import { fetchPortalJson } from './api.js';
import {
  markCampaignLeadStatus,
  queueCampaignLeads
} from '../src/money-printer/campaignBridge.js';
import { createBrowserCampaignCrmBridge } from '../src/money-printer/campaignCrmBridge.js';
import {
  markLeadVaultStatus,
  readLeadVault,
  saveDiscoveredLeads
} from '../src/money-printer/leadVault.js';
import { summarizeBusinessNeeds } from '../src/money-printer/businessIntelligence.js';
import { createBrowserLeadVaultSync } from '../src/money-printer/leadVaultSync.js';
import {
  createBrowserCampaignHistorySync,
  readCampaignHistory,
  writeCampaignHistory
} from '../src/money-printer/campaignHistorySync.js';
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
  sentEvents: '3dvr.campaigns.sent-events',
  oauth: 'portal.oauth.result',
  discovered: '3dvr.campaigns.discovered-leads',
  inboxProcessed: '3dvr.campaigns.inbox-processed',
};
const DAILY_CAP = 25;
const SEND_DELAY_MS = 1600;

const $ = id => document.getElementById(id);
const elements = {
  form: $('campaignForm'), recipients: $('recipients'), recipientCount: $('recipientCount'),
  contactSource: $('contactSource'), subject: $('subject'),
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
  integrationGmail: $('integrationGmail'), integrationLeadVault: $('integrationLeadVault'),
  integrationMoneyPrinter: $('integrationMoneyPrinter'), integrationCrm: $('integrationCrm'),
};

let connection = readJson(STORAGE.connection, null);
let sending = false;
let discoveredLeads = [];
let suggestedCampaign = null;
let leadVaultAccountSync = null;
let leadVaultSyncWrites = Promise.resolve();
let leadVaultSyncRetryTimer = null;
let leadVaultSyncRetryAttempt = 0;
let leadVaultSyncInitializing = false;
let campaignCrmBridge = null;
let campaignHistoryAccountSync = null;
let campaignHistorySyncWrites = Promise.resolve();
let chosenManualLocation = '';

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function showNotice(message, kind = '') {
  elements.notice.hidden = !message;
  elements.notice.className = `notice ${kind}`.trim();
  elements.notice.replaceChildren();

  const text = String(message || '');
  const gmailDisabled = text.match(/Gmail API has not been used in project\s+(\d+)\s+before or it is disabled/i);
  if (gmailDisabled) {
    const project = gmailDisabled[1];
    const copy = document.createElement('span');
    copy.textContent = 'Gmail API is disabled for this Google Cloud project.';
    const link = document.createElement('a');
    link.className = 'notice-action';
    link.href = `https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=${encodeURIComponent(project)}`;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.textContent = 'Enable Gmail API';
    elements.notice.append(copy, link);
    return;
  }

  elements.notice.textContent = text;
}

function showLeadNotice(message, kind = '') {
  elements.leadNotice.hidden = !message;
  elements.leadNotice.className = `notice ${kind}`.trim();
  elements.leadNotice.textContent = message;
}

function setIntegrationPill(element, state, label) {
  if (!element) return;
  element.dataset.state = state;
  element.textContent = label;
}

function initializeCampaignCrmBridge() {
  campaignCrmBridge = createBrowserCampaignCrmBridge();
  setIntegrationPill(
    elements.integrationCrm,
    campaignCrmBridge?.available ? 'ok' : 'warn',
    campaignCrmBridge?.available ? 'CRM · ready' : 'CRM · unavailable'
  );
  return campaignCrmBridge;
}

function setLeadVaultSyncStatus(message) {
  if (elements.leadVaultSyncStatus) {
    elements.leadVaultSyncStatus.textContent = message;
  }
  const text = String(message || '');
  if (/synced securely/i.test(text)) {
    setIntegrationPill(elements.integrationLeadVault, 'ok', 'Lead Vault · synced');
  } else if (/checking|syncing|reconnecting/i.test(text)) {
    setIntegrationPill(elements.integrationLeadVault, 'pending', 'Lead Vault · syncing');
  } else {
    setIntegrationPill(elements.integrationLeadVault, 'warn', 'Lead Vault · local');
  }
}

function canRestoreLeadVaultAccount() {
  return localStorage.getItem('signedIn') === 'true'
    && Boolean(String(localStorage.getItem('alias') || '').trim())
    && Boolean(localStorage.getItem('password'));
}

function scheduleLeadVaultInitializationRetry() {
  if (leadVaultSyncRetryTimer) return true;
  const delay = Math.min(30000, 1500 * (2 ** Math.min(leadVaultSyncRetryAttempt, 4)));
  leadVaultSyncRetryAttempt += 1;
  setLeadVaultSyncStatus('Lead Vault: reconnecting secure sync…');
  leadVaultSyncRetryTimer = window.setTimeout(() => {
    leadVaultSyncRetryTimer = null;
    initializeLeadVaultAccountSync();
  }, delay);
  return true;
}

async function initializeLeadVaultAccountSync() {
  if (leadVaultSyncInitializing || leadVaultAccountSync?.available) return;
  leadVaultSyncInitializing = true;
  setLeadVaultSyncStatus('Lead Vault: checking secure sync…');
  try {
    const accountSync = await createBrowserLeadVaultSync({
      onRemoteMerge: leads => {
        setLeadVaultSyncStatus(
          `Lead Vault: synced securely · ${leads.length} lead${leads.length === 1 ? '' : 's'}`
        );
        updateSummary();
      }
    });
    if (!accountSync.available) {
      const portalSignedIn = localStorage.getItem('signedIn') === 'true';
      if (portalSignedIn && canRestoreLeadVaultAccount()) {
        scheduleLeadVaultInitializationRetry();
        return;
      }
      setLeadVaultSyncStatus(
        portalSignedIn
          ? 'Lead Vault: signed in · secure sync unavailable'
          : 'Lead Vault: local · sign in to sync'
      );
      return;
    }

    leadVaultAccountSync = accountSync;
    leadVaultSyncRetryAttempt = 0;
    if (leadVaultSyncRetryTimer) {
      clearTimeout(leadVaultSyncRetryTimer);
      leadVaultSyncRetryTimer = null;
    }
    setLeadVaultSyncStatus(
      `Lead Vault: synced securely · ${accountSync.leads.length} lead${accountSync.leads.length === 1 ? '' : 's'}`
    );
  } catch (_error) {
    if (localStorage.getItem('signedIn') === 'true') {
      scheduleLeadVaultInitializationRetry();
    } else {
      setLeadVaultSyncStatus('Lead Vault: saved locally');
    }
  } finally {
    leadVaultSyncInitializing = false;
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

async function initializeCampaignHistorySync() {
  if (campaignHistoryAccountSync?.available) return campaignHistoryAccountSync;
  try {
    const accountSync = await createBrowserCampaignHistorySync({
      onRemoteMerge: () => renderHistory()
    });
    if (!accountSync.available) return accountSync;
    campaignHistoryAccountSync = accountSync;
    renderHistory();
    return accountSync;
  } catch (error) {
    console.warn('Campaign history sync unavailable', error);
    return { available: false, reason: 'sync-error' };
  }
}

function scheduleCampaignHistorySync() {
  if (!campaignHistoryAccountSync?.available) return campaignHistorySyncWrites;
  campaignHistorySyncWrites = campaignHistorySyncWrites
    .catch(() => undefined)
    .then(() => campaignHistoryAccountSync.reconcile())
    .then(history => {
      writeCampaignHistory(history);
      renderHistory();
      return history;
    })
    .catch(error => {
      console.warn('Campaign history sync failed', error);
      return [];
    });
  return campaignHistorySyncWrites;
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
    checkbox.type = 'radio';
    checkbox.name = 'lead-pick';
    checkbox.checked = index === 0;
    checkbox.dataset.leadIndex = String(index);
    const body = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = lead.name || lead.email;
    const email = document.createElement('span');
    email.className = 'lead-email';
    email.textContent = lead.email;
    const why = document.createElement('small');
    why.textContent = [lead.location, lead.whyFit].filter(Boolean).join(' · ');
    const insight = document.createElement('small');
    const topNeed = Array.isArray(lead.needs) ? lead.needs[0] : null;
    const confidence = topNeed?.confidence ? `${Math.round(Number(topNeed.confidence) * 100)}% confidence` : '';
    insight.textContent = [
      topNeed?.need ? `Need: ${topNeed.need}` : '',
      confidence,
      lead.recommendedAction ? `Next: ${lead.recommendedAction}` : ''
    ].filter(Boolean).join(' · ');
    const source = document.createElement('a');
    source.href = lead.sourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Verify source';
    source.addEventListener('click', event => event.stopPropagation());
    body.append(name, email, why);
    if (insight.textContent) body.append(insight);
    body.append(source);
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
    const needRadar = summarizeBusinessNeeds(discoveredLeads).slice(0, 2);
    const radarNote = needRadar.length
      ? ` Need radar: ${needRadar.map(item => `${item.need} (${item.count} lead${item.count === 1 ? '' : 's'}, ${Math.round(item.averageConfidence * 100)}% avg confidence)`).join('; ')}.`
      : '';
    showLeadNotice(discoveredLeads.length
      ? `Found ${discoveredLeads.length} likely customer${discoveredLeads.length === 1 ? '' : 's'} with public source evidence${suggestedCampaign?.body ? ' and drafted your outreach' : ''}.${defaultNote}${vaultNote}${radarNote} Review the matches, then use the ones you want.${routeNote}`
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
  const primaryLead = selected[0];
  if (primaryLead?.draftSubject) elements.subject.value = primaryLead.draftSubject;
  if (primaryLead?.draftBody) elements.message.value = primaryLead.draftBody;
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
  if (!result || result.provider !== 'google' || !['gmail-send', 'mail', 'gmail'].includes(result.scopeKey)) return;
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
    || scopeKey === 'mail'
    || scopeKey === 'gmail'
    || scopeKey === 'calendar-gmail-send'
    || scope.includes('https://www.googleapis.com/auth/gmail.send');
}
function connectionHasGmailReadScope(value = connection) {
  const scopeKey = String(value?.scopeKey || '').toLowerCase();
  const scope = String(value?.scope || '').toLowerCase();
  return scopeKey === 'mail'
    || scopeKey === 'gmail'
    || scope.includes('https://www.googleapis.com/auth/gmail.readonly')
    || scope.includes('https://www.googleapis.com/auth/gmail.modify');
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
    ? (connectionHasGmailReadScope() ? 'Google OAuth · send + reply watch enabled' : 'Google OAuth · send enabled · reconnect once to watch replies')
    : hasIdentity
      ? 'This saved Google connection is missing verified Gmail send permission.'
      : 'Connect the Google account you want to send from.';
  elements.connect.hidden = connected;
  elements.connect.textContent = hasIdentity ? 'Reconnect Gmail' : 'Connect Gmail';
  elements.disconnect.hidden = !connected;
  elements.sendTest.disabled = !connected || sending;
  elements.sendCampaign.disabled = !connected || sending;
  setIntegrationPill(
    elements.integrationGmail,
    connected ? 'ok' : hasIdentity ? 'warn' : 'off',
    connected ? (connectionHasGmailReadScope() ? 'Gmail · send + watch' : 'Gmail · send only') : hasIdentity ? 'Gmail · reconnect' : 'Gmail · off'
  );
  updateSummary();
}
function currentRecipients() {
  const all = parseRecipients(elements.recipients.value);
  const suppressed = parseRecipients(elements.suppressed.value).map(item => item.email);
  return { all, sendable: filterSuppressed(all, suppressed), suppressedCount: all.length - filterSuppressed(all, suppressed).length };
}
function recentSendEvents(now = Date.now()) {
  const cutoff = now - (24 * 60 * 60 * 1000);
  let events = readJson(STORAGE.sentEvents, []);
  if (!Array.isArray(events) || !events.length) {
    const history = readCampaignHistory();
    events = history.flatMap(item => {
      const at = Number(item?.at || 0);
      const count = Math.max(0, Number(item?.sent || 0));
      return Number.isFinite(at) && at >= cutoff
        ? Array.from({ length: count }, () => at)
        : [];
    });
  }
  const recent = events
    .map(Number)
    .filter(timestamp => Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now + 60_000)
    .slice(-100);
  writeJson(STORAGE.sentEvents, recent);
  return recent;
}
function recentSyncedSendCount(now = Date.now()) {
  const cutoff = now - (24 * 60 * 60 * 1000);
  return readLeadVault().filter(lead => {
    const sentAt = Date.parse(String(lead?.sentAt || ''));
    return Number.isFinite(sentAt) && sentAt >= cutoff && sentAt <= now + 60_000;
  }).length;
}
function sentToday() {
  return Math.max(recentSendEvents().length, recentSyncedSendCount());
}
function incrementSent() {
  const events = recentSendEvents();
  events.push(Date.now());
  writeJson(STORAGE.sentEvents, events.slice(-100));
}
function updateSummary() {
  const { all, sendable, suppressedCount } = currentRecipients();
  const allowance = remainingDailyAllowance(sentToday(), DAILY_CAP);
  const vault = readLeadVault();
  const tracked = vault.filter(lead => lead?.sentAt);
  const replies = tracked.filter(lead => ['replied', 'customer'].includes(String(lead?.status || ''))).length;
  const bounces = tracked.filter(lead => String(lead?.status || '') === 'bounced').length;
  elements.recipientCount.textContent = `${all.length} valid · ${sendable.length} sendable${suppressedCount ? ` · ${suppressedCount} suppressed` : ''}`;
  elements.sendSummary.textContent = connectionReady()
    ? `${Math.min(sendable.length, allowance)} ready · ${tracked.length} sent · ${replies} replies · ${bounces} bounces · ${allowance} slots left`
    : 'Connect Gmail to begin.';
}
async function refreshConnection() {
  if (!connection?.refreshToken) throw new Error('Reconnect Gmail to refresh this session.');
  const response = await fetch('/api/oauth/google?action=refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: connection.refreshToken, scopeKey: connectionHasGmailReadScope() ? 'mail' : 'gmail-send' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.accessToken) throw new Error(payload.error || 'Unable to refresh Gmail connection.');
  connection = {
    ...connection,
    ...payload,
    email: connection.email,
    needsReconnect: false,
    lastAuthError: ''
  };
  writeJson(STORAGE.connection, connection);
  return connection;
}
async function recoverSavedConnection() {
  if (connectionReady() || !connection?.refreshToken || !connection?.email) return false;
  try {
    await refreshConnection();
    showNotice(`Restored Gmail connection for ${connection.email}.`, 'success');
    return true;
  } catch (_error) {
    return false;
  } finally {
    updateConnectionUi();
  }
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
  const text = String(message || '');
  if (status === 401) return true;
  if (/invalid authentication credentials|unauthenticated|invalid_grant|token.*expired|token.*revoked/i.test(text)) return true;
  if (status === 403 && /insufficient authentication scopes|insufficient permission/i.test(text)) return true;
  return false;
}

async function gmailSendAttempt(active, { to, subject, text }) {
  const response = await fetch('/api/oauth/google?action=sendmail', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessToken: active.accessToken,
      idToken: active.idToken || '',
      senderEmail: active.email || '',
      allowSmtpFallback: false,
      to,
      subject,
      text
    }),
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
  });
}
function subjectFor(recipient) {
  return personalize(elements.subject.value.trim(), recipient).trim();
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
  const history = readCampaignHistory();
  history.unshift(entry);
  writeCampaignHistory(history.slice(0, 60));
  renderHistory();
  scheduleCampaignHistorySync();
}
function extractEmailAddress(value = '') {
  const text = String(value || '').trim().toLowerCase();
  const bracket = text.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (bracket) return bracket[1];
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function classifyCampaignInboxMessage(message = {}, leadEmails = new Set()) {
  const fromEmail = extractEmailAddress(message.from);
  const subject = String(message.subject || '');
  const text = [message.text, message.snippet, subject, message.from].filter(Boolean).join('\n');
  const lower = text.toLowerCase();

  if (/mailer-daemon|postmaster|delivery status notification|undeliver|delivery failure|delivery delayed|\bbounce\b/i.test(lower)) {
    const matches = [...leadEmails].filter(email => lower.includes(email));
    return matches.map(email => ({ email, eventType: 'bounced' }));
  }

  if (!leadEmails.has(fromEmail)) return [];

  if (/\b(unsubscribe|remove me|do not contact|don't contact|dont contact|stop emailing|no more emails|no thanks|not interested)\b/i.test(lower)) {
    return [{ email: fromEmail, eventType: 'suppressed' }];
  }

  return [{ email: fromEmail, eventType: 'replied' }];
}

async function listCampaignMail(query, limit = 25) {
  const active = await activeConnection();
  if (!connectionHasGmailReadScope(active)) throw new Error('Reconnect Gmail once to enable reply watching.');
  const { response, payload } = await fetchPortalJson('/api/oauth/google?action=listmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessToken: active.accessToken,
      query,
      limit
    })
  });
  if (!response.ok) throw new Error(payload.error || 'Unable to read Gmail for campaign replies.');
  return Array.isArray(payload.messages) ? payload.messages : [];
}

async function syncCampaignInbox() {
  if (!connectionReady() || !connectionHasGmailReadScope()) return { checked: 0, matched: 0 };
  const sentLeads = readLeadVault().filter(lead => ['sent', 'replied', 'bounced', 'suppressed'].includes(String(lead?.status || '')));
  const leadEmails = new Set(sentLeads.map(lead => String(lead.email || '').trim().toLowerCase()).filter(Boolean));
  if (!leadEmails.size) return { checked: 0, matched: 0 };

  const processed = new Set(readJson(STORAGE.inboxProcessed, []));
  const messages = await listCampaignMail('newer_than:30d -in:sent', 25);
  let matched = 0;

  for (const message of messages) {
    const messageId = String(message.id || '').trim();
    if (!messageId || processed.has(messageId)) continue;
    const events = classifyCampaignInboxMessage(message, leadEmails);
    if (!events.length) continue;

    for (const event of events) {
      markLeadVaultStatus(event.email, event.eventType);
      markCampaignLeadStatus(event.email, event.eventType);
      try {
        if (!campaignCrmBridge?.available) initializeCampaignCrmBridge();
        await campaignCrmBridge?.recordInboxEvent?.({
          email: event.email,
          eventType: event.eventType,
          subject: message.subject || '',
          messageId,
          occurredAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(message.date || Date.now())
        });
      } catch (error) {
        console.error('Campaign inbox CRM sync failed', error);
      }
      matched += 1;
    }
    processed.add(messageId);
  }

  writeJson(STORAGE.inboxProcessed, [...processed].slice(-500));
  if (matched) scheduleLeadVaultSync();
  return { checked: messages.length, matched };
}

async function startCampaignInboxWatch() {
  if (!connectionReady() || !connectionHasGmailReadScope()) return;
  try {
    await syncCampaignInbox();
  } catch (error) {
    console.warn('Campaign inbox watch failed', error);
  }
  window.setInterval(() => {
    syncCampaignInbox().catch(error => console.warn('Campaign inbox watch failed', error));
  }, 5 * 60 * 1000);
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
    detail.textContent = `${item.sent || 0} sent · ${item.failed || 0} failed · via ${item.from || 'unknown sender'} · ${new Date(item.at).toLocaleString()}`;
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
  if (!window.confirm(`Send this campaign to ${batch.length} recipient${batch.length === 1 ? '' : 's'} using Gmail connection ${connection.email}?`)) return;

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
  let backupSender = '';
  const sentEmails = new Set();
  setProgress(0, batch.length, 'Starting…');

  for (let index = 0; index < batch.length; index += 1) {
    const recipient = batch[index];
    setProgress(index, batch.length, `Sending ${index + 1} of ${batch.length} to ${recipient.email}…`);
    try {
      saveDiscoveredLeads({
        leads: [recipient],
        offer: elements.leadDescription.value,
        campaignDraft: {
          subject: subjectFor(recipient),
          body: elements.message.value
        }
      });
      queueCampaignLeads({
        leads: [recipient],
        subject: subjectFor(recipient),
        body: elements.message.value,
        offer: elements.leadDescription.value,
        senderName: elements.businessName.value
      });
      const sendResult = await gmailSend({
        to: recipient.email,
        subject: subjectFor(recipient),
        text: messageFor(recipient)
      });
      if (sendResult?.transport === 'gmail-smtp-fallback') {
        backupSender = sendResult.senderEmail || sendResult.sentFolderAccount || backupSender;
      }
      sent += 1;
      sentEmails.add(recipient.email);
      incrementSent();
      markCampaignLeadStatus(recipient.email, 'sent');
      markLeadVaultStatus(recipient.email, 'sent');

      try {
        if (!campaignCrmBridge?.available) initializeCampaignCrmBridge();
        if (!campaignCrmBridge?.available) throw new Error('crm-bridge-unavailable');
        await campaignCrmBridge.recordSend({
          recipient,
          subject: subjectFor(recipient),
          offer: elements.leadDescription.value,
          senderEmail: sendResult?.senderEmail || connection.email,
          gmailMessageId: sendResult?.id || sendResult?.messageId || sendResult?.gmailMessageId || '',
          sentAt: new Date()
        });
        setIntegrationPill(elements.integrationCrm, 'ok', 'CRM · synced');
      } catch (crmError) {
        console.error('Campaign CRM sync failed', crmError);
        setIntegrationPill(elements.integrationCrm, 'warn', 'CRM · retry needed');
      }
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

  if (sentEmails.size) {
    const remaining = parseRecipients(elements.recipients.value)
      .filter(recipient => !sentEmails.has(recipient.email));
    elements.recipients.value = remaining.map(recipient => recipient.name
      ? `${recipient.name} <${recipient.email}>`
      : recipient.email).join('\n');
    writeJson(STORAGE.draft, draftSnapshot());
  }

  addHistory({
    at: Date.now(),
    subject: elements.subject.value.trim(),
    sent,
    failed,
    from: backupSender || connection.email,
    connectedAs: connection.email,
    transport: backupSender ? 'gmail-smtp-fallback' : 'gmail-api',
    error: fatalError
  });
  scheduleLeadVaultSync();
  showNotice(
    fatalError
      ? `${fatalError} No further recipients were attempted. ${sent} sent before the stop.`
      : backupSender
        ? `Campaign finished. ${sent} sent, ${failed} failed. Backup sender: ${backupSender}; those messages are stored in that account’s Sent folder.`
        : `Campaign finished. ${sent} sent, ${failed} failed from ${connection.email}.`,
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
    const sendResult = await gmailSend({
      to: recipient.email,
      subject: `[TEST] ${subjectFor(recipient)}`,
      text: messageFor(recipient)
    });
    showNotice(
      sendResult?.transport === 'gmail-smtp-fallback'
        ? `Test sent to ${recipient.email} via backup sender ${sendResult.senderEmail || sendResult.sentFolderAccount || '3DVR Gmail'}. Check that account’s Sent folder.`
        : `Test sent to ${recipient.email} from ${connection.email}.`,
      'success'
    );
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
  location.href = '/api/oauth/google?action=start&scopeKey=mail&intent=campaigns&returnTo=/campaigns/';
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
setIntegrationPill(elements.integrationMoneyPrinter, 'ok', 'Money Printer · ready');
initializeCampaignCrmBridge();
updateConnectionUi();
recoverSavedConnection();
initializeLeadVaultAccountSync().finally(() => initializeCampaignHistorySync());
startCampaignInboxWatch();
window.addEventListener('online', () => {
  if (!leadVaultAccountSync?.available && localStorage.getItem('signedIn') === 'true') {
    initializeLeadVaultAccountSync().finally(() => initializeCampaignHistorySync());
  } else if (!campaignHistoryAccountSync?.available && localStorage.getItem('signedIn') === 'true') {
    initializeCampaignHistorySync();
  }
});
