const ADMIN_EMAIL = 'gamboaesai@gmail.com';
const BLACKOUT_PREFIX = '[SDDT unavailable]';
const connectButton = document.querySelector('[data-connect-google]');
const googleStatus = document.querySelector('[data-google-status]');
const blackoutForm = document.querySelector('[data-blackout-form]');
const blackoutStatus = document.querySelector('[data-blackout-status]');
const blackoutsNode = document.querySelector('[data-blackouts]');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function nextDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

function currentConnection() {
  return window.PortalOAuth?.getConnection('google') || null;
}
async function requireEsaiConnection() {
  const connection = await window.PortalOAuth.ensureFreshConnection('google');
  if (!connection) throw new Error('Connect Google first.');
  if (normalizeEmail(connection.email) !== ADMIN_EMAIL) {
    throw new Error(`Connect ${ADMIN_EMAIL}, not ${connection.email || 'this Google account'}.`);
  }
  return connection;
}

function renderConnection() {
  const connection = currentConnection();
  if (!connection) {
    googleStatus.textContent = `Not connected. Use ${ADMIN_EMAIL}.`;
    connectButton.textContent = 'Connect Google';
    return;
  }
  const email = normalizeEmail(connection.email);
  if (email !== ADMIN_EMAIL) {
    googleStatus.textContent = `Wrong account connected: ${email || 'unknown'}. Please reconnect as ${ADMIN_EMAIL}.`;
    connectButton.textContent = 'Reconnect Google';
    return;
  }
  googleStatus.textContent = `${email} connected for Calendar + Gmail.`;
  connectButton.textContent = 'Reconnect Google';
}

async function apiCalendar(connection, body) {
  const response = await fetch('/api/calendar/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, accessToken: connection.accessToken })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Calendar request failed (${response.status}).`);
  return payload;
}

async function loadBlackouts() {
  const connection = await requireEsaiConnection();
  const timeMin = new Date().toISOString();
  const timeMaxDate = new Date();
  timeMaxDate.setDate(timeMaxDate.getDate() + 180);
  const payload = await apiCalendar(connection, {
    action: 'listEvents',
    calendarId: 'primary',
    timeMin,
    timeMax: timeMaxDate.toISOString(),
    maxResults: 100
  });
  const blackouts = (payload.events || []).filter(event =>
    String(event.summary || '').startsWith(BLACKOUT_PREFIX) && event.start?.date
  );
  if (!blackouts.length) {
    blackoutsNode.innerHTML = '<p class="muted">No upcoming blackout dates.</p>';
    return;
  }
  blackoutsNode.replaceChildren(...blackouts.map(event => {
    const row = document.createElement('div');
    row.className = 'blackout';
    const copy = document.createElement('div');
    const date = document.createElement('strong');
    date.textContent = formatDate(event.start.date);
    const note = document.createElement('span');
    note.className = 'muted';
    note.textContent = String(event.description || '').replace(/^SD Day Traders blackout\.\s*/i, '') || 'Unavailable';
    copy.append(date, note);
    row.append(copy);
    return row;
  }));
}

connectButton.addEventListener('click', () => {
  window.PortalOAuth.begin('google', {
    intent: 'connect',
    scopeKey: 'calendar-gmail-send',
    aliasHint: ADMIN_EMAIL,
    returnTo: '/sd-day-traders-admin/'
  });
});

blackoutForm.addEventListener('submit', async event => {
  event.preventDefault();
  blackoutStatus.textContent = '';
  const data = new FormData(blackoutForm);
  const date = String(data.get('date') || '');
  const note = String(data.get('note') || '').trim();
  if (!date) return;
  try {
    const connection = await requireEsaiConnection();
    blackoutStatus.textContent = 'Saving blackout date…';
    await apiCalendar(connection, {
      action: 'createEvent',
      calendarId: 'primary',
      title: `${BLACKOUT_PREFIX} ${date}`,
      description: `SD Day Traders blackout. ${note}`.trim(),
      startDate: date,
      endDate: nextDateKey(date)
    });
    blackoutForm.reset();
    blackoutStatus.textContent = `${formatDate(date)} is blocked.`;
    await loadBlackouts();
  } catch (error) {
    blackoutStatus.textContent = error.message || 'Unable to save blackout date.';
  }
});

const oauthResult = window.PortalOAuth?.consumePendingResult();
if (oauthResult?.ok) {
  window.PortalOAuth.storeConnectionFromResult(oauthResult);
}
renderConnection();
if (currentConnection() && normalizeEmail(currentConnection().email) === ADMIN_EMAIL) {
  loadBlackouts().catch(error => {
    blackoutsNode.innerHTML = `<p class="muted">${error.message || 'Unable to load blackout dates.'}</p>`;
  });
}
