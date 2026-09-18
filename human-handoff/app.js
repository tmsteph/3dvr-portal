const intro = document.querySelector('#intro');
const session = document.querySelector('#session');
const continueButton = document.querySelector('#continue');
const doneButton = document.querySelector('#done');
const keyboardProxy = document.querySelector('#keyboardProxy');
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
let frameLoopRunning = false;
let frameSeq = 0;
let pointerStart = null;
let currentFrameUrl = '';
const activePointers = new Map();
let pinchActive = false;
let pinchStartDistance = 0;
let pinchStartZoom = 1;
let pinchStartCenter = null;
let zoom = 1;
let panX = 0;
let panY = 0;
let keyboardArmed = false;
let composing = false;
let inputQueue = Promise.resolve();

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
  if (!frameLoopRunning) pollFrame();
}

async function pollFrame() {
  if (frameLoopRunning) return;
  frameLoopRunning = true;

  while (polling && sessionToken) {
    try {
      const response = await fetch(`${API}/frame?after=${frameSeq}`, {
        headers: { authorization: `Bearer ${sessionToken}` },
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        let message = 'Secure handoff failed.';
        if (contentType.includes('application/json')) {
          const body = await response.json().catch(() => ({}));
          message = body.error || message;
        }
        throw new Error(message);
      }

      const nextSeq = Number(response.headers.get('x-handoff-frame-seq'));
      if (Number.isFinite(nextSeq) && nextSeq > frameSeq) frameSeq = nextSeq;
      const image = await response.blob();
      const nextUrl = URL.createObjectURL(image);
      frame.onload = () => {
        loading.hidden = true;
        if (currentFrameUrl) URL.revokeObjectURL(currentFrameUrl);
        currentFrameUrl = nextUrl;
      };
      frame.src = nextUrl;
      sessionStatus.textContent = 'Live · tap a field and type · drag to scroll · pinch to zoom';
    } catch (error) {
      sessionStatus.textContent = error.message;
      if (/expired|not active|not open|not found/i.test(error.message)) {
        polling = false;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  frameLoopRunning = false;
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
  return api('/input', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }, true);
}

function armKeyboardProxy() {
  keyboardArmed = true;
  keyboardProxy.value = '';
  keyboardProxy.focus({ preventScroll: true });
}

function releaseKeyboardProxy() {
  keyboardArmed = false;
  composing = false;
  keyboardProxy.value = '';
  keyboardProxy.blur();
}

function queueRemoteInput(payload) {
  inputQueue = inputQueue
    .then(() => sendInput(payload))
    .catch(error => {
      sessionStatus.textContent = error.message;
    });
  return inputQueue;
}

function distanceBetweenPointers() {
  const points = [...activePointers.values()];
  if (points.length < 2) return 0;
  return Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY);
}

function centerBetweenPointers() {
  const points = [...activePointers.values()];
  if (points.length < 2) return null;
  return {
    x: (points[0].clientX + points[1].clientX) / 2,
    y: (points[0].clientY + points[1].clientY) / 2,
  };
}

function applyViewportTransform() {
  frame.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
}

frame.addEventListener('pointerdown', event => {
  event.preventDefault();
  const point = remotePoint(event);
  if (!point) return;
  frame.setPointerCapture?.(event.pointerId);
  activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });

  if (activePointers.size === 1) {
    pointerStart = {
      ...point,
      clientX: event.clientX,
      clientY: event.clientY,
      panX,
      panY,
      moved: false,
    };
    return;
  }

  if (activePointers.size === 2) {
    pinchActive = true;
    pointerStart = null;
    pinchStartDistance = Math.max(1, distanceBetweenPointers());
    pinchStartZoom = zoom;
    pinchStartCenter = centerBetweenPointers();
  }
});

frame.addEventListener('pointermove', event => {
  if (!activePointers.has(event.pointerId)) return;
  event.preventDefault();
  activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });

  if (pinchActive && activePointers.size >= 2) {
    const nextDistance = distanceBetweenPointers();
    const nextCenter = centerBetweenPointers();
    zoom = Math.max(1, Math.min(4, pinchStartZoom * nextDistance / pinchStartDistance));
    if (nextCenter && pinchStartCenter) {
      panX += nextCenter.x - pinchStartCenter.x;
      panY += nextCenter.y - pinchStartCenter.y;
      pinchStartCenter = nextCenter;
    }
    if (zoom === 1) {
      panX = 0;
      panY = 0;
    }
    applyViewportTransform();
    sessionStatus.textContent = `Zoom ${Math.round(zoom * 100)}% · pinch to adjust`;
    return;
  }

  if (pointerStart && zoom > 1 && activePointers.size === 1) {
    const dx = event.clientX - pointerStart.clientX;
    const dy = event.clientY - pointerStart.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 6) pointerStart.moved = true;
    panX = pointerStart.panX + dx;
    panY = pointerStart.panY + dy;
    applyViewportTransform();
  }
});

frame.addEventListener('pointerup', event => {
  const end = remotePoint(event);
  const wasPinch = pinchActive;
  activePointers.delete(event.pointerId);

  if (wasPinch) {
    if (activePointers.size === 0) pinchActive = false;
    pointerStart = null;
    return;
  }

  if (!pointerStart || !end) return;
  const dx = event.clientX - pointerStart.clientX;
  const dy = event.clientY - pointerStart.clientY;
  const moved = pointerStart.moved || Math.abs(dx) + Math.abs(dy) >= 12;
  const payload = !moved
    ? { type: 'click', x: end.x, y: end.y }
    : zoom > 1
      ? null
      : { type: 'scroll', x: end.x, y: end.y, deltaY: -dy * 4 };
  pointerStart = null;
  if (payload) {
    if (payload.type === 'click') armKeyboardProxy();
    sendInput(payload)
      .then(result => {
        if (payload.type === 'click') {
          if (result?.editable) {
            sessionStatus.textContent = 'Typing directly into the remote field';
          } else {
            releaseKeyboardProxy();
          }
        }
      })
      .catch(error => {
        if (payload.type === 'click') releaseKeyboardProxy();
        sessionStatus.textContent = error.message;
      });
  }
});

frame.addEventListener('pointercancel', event => {
  activePointers.delete(event.pointerId);
  if (activePointers.size === 0) {
    pinchActive = false;
    pointerStart = null;
  }
});

keyboardProxy.addEventListener('compositionstart', () => {
  composing = true;
});

keyboardProxy.addEventListener('compositionend', event => {
  composing = false;
  const text = event.data || keyboardProxy.value;
  keyboardProxy.value = '';
  if (keyboardArmed && text) queueRemoteInput({ type: 'text', text });
});

keyboardProxy.addEventListener('beforeinput', event => {
  if (!keyboardArmed || composing) return;

  if (event.inputType === 'deleteContentBackward') {
    event.preventDefault();
    queueRemoteInput({ type: 'key', key: 'Backspace' });
    return;
  }

  if (event.inputType === 'insertLineBreak') {
    event.preventDefault();
    queueRemoteInput({ type: 'key', key: 'Enter' });
    return;
  }

  if (event.inputType?.startsWith('insert') && event.data) {
    event.preventDefault();
    queueRemoteInput({ type: 'text', text: event.data });
  }
});

keyboardProxy.addEventListener('input', () => {
  if (!keyboardArmed || composing) return;
  const text = keyboardProxy.value;
  keyboardProxy.value = '';
  if (text) queueRemoteInput({ type: 'text', text });
});

doneButton.addEventListener('click', async () => {
  doneButton.disabled = true;
  sessionStatus.textContent = 'Returning control…';
  try {
    await api('/resolve', { method: 'POST' }, true);
    polling = false;
    releaseKeyboardProxy();
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