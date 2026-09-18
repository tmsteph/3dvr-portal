const intro = document.querySelector('#intro');
const session = document.querySelector('#session');
const continueButton = document.querySelector('#continue');
const doneButton = document.querySelector('#done');
const keyboardButton = document.querySelector('#keyboard');
const textBar = document.querySelector('#textBar');
const textInput = document.querySelector('#textInput');
const frame = document.querySelector('#frame');
const loading = document.querySelector('#loading');
const status = document.querySelector('#status');
const title = document.querySelector('#title');
const reason = document.querySelector('#reason');
const expiry = document.querySelector('#expiry');
const sessionTitle = document.querySelector('#sessionTitle');
const sessionStatus = document.querySelector('#sessionStatus');

const API = '/human-handoff/api';
const initialToken = decodeURIComponent(location.hash.slice(1));
let sessionToken = sessionStorage.getItem('3dvr-handoff-session') || '';
let polling = false;
let pointerStart = null;
let currentFrameUrl = '';

history.replaceState(null, '', location.pathname);

async function api(path, options = {}, useSession = false) {
  const headers = { ...(options.headers || {}) };
  if (useSession && sessionToken) headers.authorization = `Bearer ${sessionToken}`;
  const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = 'Secure handoff failed.';
    if (contentType.includes('application/json')) {
      const body = await response.json().catch(() => ({}));
      message = body.error || message;
    }
    throw new Error(message);
  }
  return contentType.includes('application/json') ? response.json() : response.blob();
}

function formatExpiry(value) {
  const seconds = Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 1000));
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Expires in about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

async function loadPreview() {
  if (!initialToken && sessionToken) return showSession();
  if (!initialToken) {
    status.textContent = 'This handoff link is missing or expired.';
    return;
  }
  try {
    const info = await api('/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: initialToken }),
    });
    title.textContent = `${info.serviceName} needs you`;
    reason.textContent = info.reason;
    expiry.textContent = formatExpiry(info.expiresAt);
    sessionTitle.textContent = info.serviceName;
    status.textContent = 'Secure temporary access is ready.';
    continueButton.disabled = false;
  } catch (error) {
    status.textContent = error.message;
  }
}

async function openHandoff() {
  continueButton.disabled = true;
  status.textContent = 'Opening the exact browser session…';
  try {
    const info = await api('/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: initialToken }),
    });
    sessionToken = info.sessionToken;
    sessionStorage.setItem('3dvr-handoff-session', sessionToken);
    sessionTitle.textContent = info.serviceName;
    showSession();
  } catch (error) {
    status.textContent = error.message;
    continueButton.disabled = false;
  }
}

function showSession() {
  intro.hidden = true;
  session.hidden = false;
  polling = true;
  pollFrame();
}

async function pollFrame() {
  if (!polling || !sessionToken) return;
  try {
    const image = await api('/frame', {}, true);
    const nextUrl = URL.createObjectURL(image);
    frame.onload = () => {
      loading.hidden = true;
      if (currentFrameUrl) URL.revokeObjectURL(currentFrameUrl);
      currentFrameUrl = nextUrl;
    };
    frame.src = nextUrl;
    sessionStatus.textContent = 'Live · tap, scroll, or use Keyboard';
  } catch (error) {
    sessionStatus.textContent = error.message;
    if (/expired|not active|not open/i.test(error.message)) polling = false;
  }
  if (polling) setTimeout(pollFrame, 700);
}

function remotePoint(event) {
  const rect = frame.getBoundingClientRect();
  if (!rect.width || !rect.height || !frame.naturalWidth || !frame.naturalHeight) return null;
  return {
    x: (event.clientX - rect.left) * frame.naturalWidth / rect.width,
    y: (event.clientY - rect.top) * frame.naturalHeight / rect.height,
  };
}

async function sendInput(payload) {
  await api('/input', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }, true);
}

frame.addEventListener('pointerdown', event => {
  const point = remotePoint(event);
  if (!point) return;
  pointerStart = { ...point, clientY: event.clientY };
  frame.setPointerCapture?.(event.pointerId);
});

frame.addEventListener('pointerup', event => {
  const end = remotePoint(event);
  if (!pointerStart || !end) return;
  const drag = event.clientY - pointerStart.clientY;
  const payload = Math.abs(drag) < 12
    ? { type: 'click', x: end.x, y: end.y }
    : { type: 'scroll', x: end.x, y: end.y, deltaY: -drag * 4 };
  pointerStart = null;
  sendInput(payload).catch(error => { sessionStatus.textContent = error.message; });
});

keyboardButton.addEventListener('click', () => {
  textBar.hidden = !textBar.hidden;
  if (!textBar.hidden) textInput.focus();
});

textBar.addEventListener('submit', event => {
  event.preventDefault();
  if (!textInput.value) return;
  const value = textInput.value;
  textInput.value = '';
  sendInput({ type: 'text', text: value }).catch(error => { sessionStatus.textContent = error.message; });
});

textBar.querySelectorAll('[data-key]').forEach(button => {
  button.addEventListener('click', () => {
    sendInput({ type: 'key', key: button.dataset.key }).catch(error => { sessionStatus.textContent = error.message; });
  });
});

doneButton.addEventListener('click', async () => {
  doneButton.disabled = true;
  sessionStatus.textContent = 'Returning control…';
  try {
    await api('/resolve', { method: 'POST' }, true);
    polling = false;
    sessionToken = '';
    sessionStorage.removeItem('3dvr-handoff-session');
    session.hidden = true;
    intro.hidden = false;
    title.textContent = 'Done';
    reason.textContent = 'Control returned safely. Your agent can reacquire the browser lane and continue.';
    continueButton.hidden = true;
    status.textContent = 'Temporary access is closed.';
  } catch (error) {
    sessionStatus.textContent = error.message;
    doneButton.disabled = false;
  }
});

continueButton.addEventListener('click', openHandoff);
loadPreview();