import {
  campaignDayKey,
  composeMessage,
  filterSuppressed,
  parseRecipients,
  remainingDailyAllowance,
  validateCampaign,
} from '../src/campaigns/core.js';

const STORAGE = {
  connection: '3dvr.campaigns.google.connection',
  draft: '3dvr.campaigns.draft',
  history: '3dvr.campaigns.history',
  sent: '3dvr.campaigns.sent-by-day',
  oauth: 'portal.oauth.result',
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
};

let connection = readJson(STORAGE.connection, null);
let sending = false;

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
  connection = result.connection;
  writeJson(STORAGE.connection, connection);
  showNotice(`Connected ${connection.email || 'Google account'}.`, 'success');
}
function connectionReady() { return Boolean(connection?.accessToken && connection?.email); }
function updateConnectionUi() {
  const connected = connectionReady();
  elements.status.textContent = connected ? connection.email : 'Not connected';
  elements.detail.textContent = connected ? 'Google OAuth · Gmail send permission' : 'Connect the Google account you want to send from.';
  elements.connect.hidden = connected;
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
  if (!connectionReady()) throw new Error('Connect Gmail first.');
  if (!connection.expiresAt || Date.now() > Number(connection.expiresAt) - 60_000) await refreshConnection();
  return connection;
}
async function gmailSend({ to, subject, text }) {
  const active = await activeConnection();
  const response = await fetch('/api/oauth/google?action=sendmail', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: active.accessToken, to, subject, text }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Gmail send failed.');
  return payload;
}
function validation(sendable) {
  return validateCampaign({
    subject: elements.subject.value,
    body: elements.message.value,
    businessName: elements.businessName.value,
    postalAddress: elements.postalAddress.value,
    recipients: sendable,
    sourceAcknowledged: elements.sourceAck.checked && Boolean(elements.contactSource.value),
  });
}
function messageFor(recipient) {
  return composeMessage({
    body: elements.message.value,
    recipient,
    businessName: elements.businessName.value,
    postalAddress: elements.postalAddress.value,
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
  if (!connectionReady()) check.errors.unshift('Connect Gmail first.');
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

  sending = true;
  updateConnectionUi();
  let sent = 0;
  let failed = 0;
  setProgress(0, batch.length, 'Starting…');

  for (let index = 0; index < batch.length; index += 1) {
    const recipient = batch[index];
    setProgress(index, batch.length, `Sending ${index + 1} of ${batch.length} to ${recipient.email}…`);
    try {
      await gmailSend({ to: recipient.email, subject: elements.subject.value.trim(), text: messageFor(recipient) });
      sent += 1;
      incrementSent();
    } catch (error) {
      failed += 1;
      console.error(error);
    }
    setProgress(index + 1, batch.length, `Sent ${sent} · Failed ${failed}`);
    if (index < batch.length - 1) await sleep(SEND_DELAY_MS);
  }

  addHistory({ at: Date.now(), subject: elements.subject.value.trim(), sent, failed, from: connection.email });
  showNotice(`Campaign finished. ${sent} sent, ${failed} failed.`, failed ? 'error' : 'success');
  sending = false;
  updateConnectionUi();
}

async function sendTest() {
  showNotice('');
  const recipient = { email: connection?.email || '', name: connection?.displayName || 'Test' };
  const check = validation([recipient]);
  if (!connectionReady()) check.errors.unshift('Connect Gmail first.');
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
elements.form.addEventListener('input', () => {
  writeJson(STORAGE.draft, draftSnapshot());
  updateSummary();
});

restoreDraft();
consumeOAuthResult();
renderHistory();
updateConnectionUi();
