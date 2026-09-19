const intro = document.querySelector('#intro');
const session = document.querySelector('#session');
const continueButton = document.querySelector('#continue');
const doneButton = document.querySelector('#done');
const pasteButton = document.querySelector('#paste');
const backspaceButton = document.querySelector('#backspace');
const keyboardProxy = document.querySelector('#keyboardProxy');
const frame = document.querySelector('#frame');
const loading = document.querySelector('#loading');
const status = document.querySelector('#status');
const title = document.querySelector('#title');
const reason = document.querySelector('#reason');
const expiry = document.querySelector('#expiry');
const sessionTitle = document.querySelector('#sessionTitle');
const sessionStatus = document.querySelector('#sessionStatus');
const viewport = document.querySelector('#viewport');
const guide = document.querySelector('#guide');
const guideProgress = document.querySelector('#guideProgress');
const guideInstruction = document.querySelector('#guideInstruction');
const guideBack = document.querySelector('#guideBack');
const guideNext = document.querySelector('#guideNext');

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
const KEYBOARD_SENTINEL = '\u200B';
let inputQueue = Promise.resolve();
let guideSteps = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('3dvr-handoff-guide') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
})();
let guideIndex = Math.max(0, Number(sessionStorage.getItem('3dvr-handoff-guide-index')) || 0);
let lastEdgeScrollAt = 0;

if (initialToken) {
  continueButton.disabled = false;
  status.textContent = 'Secure handoff link received. You can continue now.';
}

async function api(path, options = {}, useSession = false) {
  const headers = { ...(options.headers || {}) };
  if (useSession && sessionToken) headers.authorization = `Bearer ${sessionToken}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store', signal: options.signal || controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Connection timed out. Tap Continue to retry.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
    guideSteps = Array.isArray(info.guideSteps) ? info.guideSteps : [];
    guideIndex = 0;
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
    history.replaceState(null, '', location.pathname);
    sessionTitle.textContent = info.serviceName;
    guideSteps = Array.isArray(info.guideSteps) ? info.guideSteps : guideSteps;
    guideIndex = Math.min(guideIndex, Math.max(0, guideSteps.length - 1));
    sessionStorage.setItem('3dvr-handoff-guide', JSON.stringify(guideSteps));
    sessionStorage.setItem('3dvr-handoff-guide-index', String(guideIndex));
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
  renderGuideStep();
  if (!frameLoopRunning) pollFrame();
}

function resetViewportTransform() {
  zoom = 1;
  panX = 0;
  panY = 0;
  applyViewportTransform();
}

async function focusGuideStep() {
  if (!sessionToken || !guideSteps.length) return;
  try {
    const result = await api('/guide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ index: guideIndex }),
    }, true);
    if (result?.found) resetViewportTransform();
  } catch (error) {
    sessionStatus.textContent = error.message;
  }
}

function renderGuideStep() {
  if (!guide || !guideSteps.length) {
    if (guide) guide.hidden = true;
    return;
  }
  guide.hidden = false;
  guideProgress.textContent = `Step ${guideIndex + 1} of ${guideSteps.length}`;
  guideInstruction.textContent = guideSteps[guideIndex]?.instruction || 'Complete this step.';
  sessionStorage.setItem('3dvr-handoff-guide-index', String(guideIndex));
  guideBack.disabled = guideIndex === 0;
  guideNext.textContent = guideIndex === guideSteps.length - 1 ? 'Last step ✓' : 'Next';
  focusGuideStep();
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

function resetKeyboardProxy() {
  keyboardProxy.value = KEYBOARD_SENTINEL;
  try {
    keyboardProxy.setSelectionRange(KEYBOARD_SENTINEL.length, KEYBOARD_SENTINEL.length);
  } catch {}
}

function armKeyboardProxy() {
  keyboardArmed = true;
  resetKeyboardProxy();
  keyboardProxy.focus({ preventScroll: true });
  setTimeout(resetKeyboardProxy, 0);
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

function panLimits() {
  const baseWidth = frame.offsetWidth || 0;
  const baseHeight = frame.offsetHeight || 0;
  const viewWidth = viewport?.clientWidth || 0;
  const viewHeight = viewport?.clientHeight || 0;
  return {
    x: Math.max(0, (baseWidth * zoom - viewWidth) / 2),
    y: Math.max(0, (baseHeight * zoom - viewHeight) / 2),
  };
}

function clampPan(nextX, nextY) {
  const limits = panLimits();
  return {
    x: Math.max(-limits.x, Math.min(limits.x, nextX)),
    y: Math.max(-limits.y, Math.min(limits.y, nextY)),
  };
}

function scrollRemoteAtEdge(event, overscrollY) {
  if (Math.abs(overscrollY) < 8) return;
  const now = performance.now();
  if (now - lastEdgeScrollAt < 70) return;
  lastEdgeScrollAt = now;
  const point = remotePoint(event) || {
    x: frame.naturalWidth / 2,
    y: frame.naturalHeight / 2,
  };
  const deltaY = Math.max(-480, Math.min(480, -overscrollY * 6));
  queueRemoteInput({ type: 'scroll', x: point.x, y: point.y, deltaY });
  sessionStatus.textContent = 'Panning edge · scrolling page';
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
    } else {
      const clamped = clampPan(panX, panY);
      panX = clamped.x;
      panY = clamped.y;
    }
    applyViewportTransform();
    sessionStatus.textContent = `Zoom ${Math.round(zoom * 100)}% · pinch to adjust`;
    return;
  }

  if (pointerStart && zoom > 1 && activePointers.size === 1) {
    const dx = event.clientX - pointerStart.clientX;
    const dy = event.clientY - pointerStart.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 6) pointerStart.moved = true;
    const rawPanX = pointerStart.panX + dx;
    const rawPanY = pointerStart.panY + dy;
    const clamped = clampPan(rawPanX, rawPanY);
    panX = clamped.x;
    panY = clamped.y;
    applyViewportTransform();
    scrollRemoteAtEdge(event, rawPanY - clamped.y);
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
  const text = event.data || keyboardProxy.value.replace(KEYBOARD_SENTINEL, '');
  resetKeyboardProxy();
  if (keyboardArmed && text) queueRemoteInput({ type: 'text', text });
});

keyboardProxy.addEventListener('beforeinput', event => {
  if (!keyboardArmed || composing) return;

  if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteWordBackward') {
    event.preventDefault();
    queueRemoteInput({ type: 'key', key: 'Backspace' });
    resetKeyboardProxy();
    return;
  }

  if (event.inputType === 'deleteContentForward' || event.inputType === 'deleteWordForward') {
    event.preventDefault();
    queueRemoteInput({ type: 'key', key: 'Delete' });
    resetKeyboardProxy();
    return;
  }

  if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') {
    event.preventDefault();
    queueRemoteInput({ type: 'key', key: 'Enter' });
    resetKeyboardProxy();
    return;
  }

  if (event.inputType?.startsWith('insert') && event.data) {
    event.preventDefault();
    queueRemoteInput({ type: 'text', text: event.data });
    resetKeyboardProxy();
  }
});

keyboardProxy.addEventListener('keydown', event => {
  if (!keyboardArmed) return;
  if (event.key === 'Backspace') {
    event.preventDefault();
    queueRemoteInput({ type: 'key', key: 'Backspace' });
    resetKeyboardProxy();
  } else if (event.key === 'Delete') {
    event.preventDefault();
    queueRemoteInput({ type: 'key', key: 'Delete' });
    resetKeyboardProxy();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    queueRemoteInput({ type: 'key', key: 'Enter' });
    resetKeyboardProxy();
  }
});

keyboardProxy.addEventListener('input', event => {
  if (!keyboardArmed || composing) return;

  // Some Android keyboards do not emit beforeinput/keydown for Backspace.
  // Keeping one invisible sentinel gives deletion something to remove; if it
  // disappears, mirror that deletion to the remote browser.
  if (!keyboardProxy.value.includes(KEYBOARD_SENTINEL)) {
    if (event.inputType?.startsWith('delete') || keyboardProxy.value === '') {
      queueRemoteInput({ type: 'key', key: 'Backspace' });
      resetKeyboardProxy();
      return;
    }
  }

  const text = keyboardProxy.value.replace(KEYBOARD_SENTINEL, '');
  resetKeyboardProxy();
  if (text) queueRemoteInput({ type: 'text', text });
});

pasteButton?.addEventListener('click', () => {
  if (!sessionToken) return;
  queueRemoteInput({ type: 'paste' });
  armKeyboardProxy();
  sessionStatus.textContent = 'Paste sent';
});

backspaceButton?.addEventListener('click', () => {
  if (!sessionToken) return;
  queueRemoteInput({ type: 'key', key: 'Backspace' });
  armKeyboardProxy();
  sessionStatus.textContent = 'Backspace sent';
});

guideBack?.addEventListener('click', () => {
  if (!guideSteps.length || guideIndex === 0) return;
  guideIndex -= 1;
  renderGuideStep();
});

guideNext?.addEventListener('click', () => {
  if (!guideSteps.length) return;
  if (guideIndex < guideSteps.length - 1) {
    guideIndex += 1;
    renderGuideStep();
    return;
  }
  guide.hidden = true;
  sessionStatus.textContent = 'Guided steps complete · tap Done after the site confirms success';
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
    sessionStorage.removeItem('3dvr-handoff-guide');
    sessionStorage.removeItem('3dvr-handoff-guide-index');
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