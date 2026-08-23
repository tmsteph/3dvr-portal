const INSTALL_KEY = '__3dvrOperatorFetchRetryInstalled';
const PENDING_KEY = '3dvr.operator.pending-request.v1';
const RETRY_DELAYS_MS = [650, 1500, 3000, 5000, 8000, 12000, 20000, 30000];
const PENDING_TTL_MS = 30 * 60 * 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function operatorRequestUrl(input) {
  const raw = typeof input === 'string' ? input : input?.url || '';
  if (!raw) return null;
  try {
    return new URL(raw, globalThis.location?.href || 'https://portal.3dvr.tech/');
  } catch {
    return null;
  }
}

function isOperatorApiRequest(input) {
  const url = operatorRequestUrl(input);
  if (!url) return false;
  const currentOrigin = globalThis.location?.origin || url.origin;
  return url.origin === currentOrigin
    && url.pathname === '/api/openai-site'
    && url.searchParams.get('provider') === 'operator';
}

function requestMethod(input, init = {}) {
  return String(init?.method || input?.method || 'GET').toUpperCase();
}

function safeStorage(target) {
  try {
    return target?.localStorage || null;
  } catch {
    return null;
  }
}

function requestPrompt(init = {}) {
  if (typeof init?.body !== 'string') return '';
  try {
    const payload = JSON.parse(init.body);
    return String(payload?.prompt || '').trim().slice(0, 2000);
  } catch {
    return '';
  }
}

function requestId(target) {
  return target?.crypto?.randomUUID?.()
    || `operator-request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function persistPendingRequest(target, input, init, existingId = '') {
  const storage = safeStorage(target);
  if (!storage) return null;
  const url = operatorRequestUrl(input);
  const snapshot = {
    id: existingId || requestId(target),
    prompt: requestPrompt(init),
    path: url ? `${url.pathname}${url.search}` : '/api/openai-site?provider=operator',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attempts: 0
  };
  try {
    storage.setItem(PENDING_KEY, JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

function updatePendingAttempt(target, snapshot, attempts) {
  if (!snapshot) return;
  const storage = safeStorage(target);
  if (!storage) return;
  const next = { ...snapshot, attempts, updatedAt: Date.now() };
  try {
    storage.setItem(PENDING_KEY, JSON.stringify(next));
    Object.assign(snapshot, next);
  } catch {}
}

function clearPendingRequest(target, snapshot) {
  const storage = safeStorage(target);
  if (!storage || !snapshot) return;
  try {
    const current = JSON.parse(storage.getItem(PENDING_KEY) || 'null');
    if (!current || current.id === snapshot.id) storage.removeItem(PENDING_KEY);
  } catch {
    try { storage.removeItem(PENDING_KEY); } catch {}
  }
}

export function readPendingOperatorRequest(target = globalThis) {
  const storage = safeStorage(target);
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(PENDING_KEY) || 'null');
    if (!value || typeof value !== 'object') return null;
    if (Date.now() - Number(value.updatedAt || value.createdAt || 0) > PENDING_TTL_MS) {
      storage.removeItem(PENDING_KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function recoveryState(target) {
  const offline = target?.navigator?.onLine === false;
  const hidden = target?.document?.visibilityState === 'hidden';
  return {
    ready: !offline && !hidden,
    reason: offline ? 'offline' : hidden ? 'background' : 'retry'
  };
}

function announce(target, message) {
  const documentObj = target?.document;
  if (!documentObj?.querySelector) return;
  const node = documentObj.querySelector('#homeOperatorStatus, #operator-status');
  if (node) node.textContent = message;
}

function waitForRetryOpportunity(target, delayMs) {
  const state = recoveryState(target);
  if (state.ready) return sleep(delayMs);

  announce(target, state.reason === 'offline'
    ? 'Waiting for connection…'
    : 'Paused while the screen is away…');

  return new Promise(resolve => {
    const documentObj = target?.document;
    let settled = false;
    let delayTimer = null;
    let pollTimer = null;

    const cleanup = () => {
      target?.removeEventListener?.('online', check);
      target?.removeEventListener?.('pageshow', check);
      documentObj?.removeEventListener?.('visibilitychange', check);
      if (pollTimer) clearInterval(pollTimer);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      announce(target, 'Reconnecting to Operator…');
      delayTimer = setTimeout(resolve, delayMs);
    };

    function check() {
      if (recoveryState(target).ready) finish();
    }

    target?.addEventListener?.('online', check);
    target?.addEventListener?.('pageshow', check);
    documentObj?.addEventListener?.('visibilitychange', check);
    pollTimer = setInterval(check, 2000);
    check();
  });
}

export function installOperatorFetchRetry(target = globalThis) {
  if (!target?.fetch || target[INSTALL_KEY]) return;

  const originalFetch = target.fetch.bind(target);
  target[INSTALL_KEY] = true;

  target.fetch = async (input, init) => {
    const retryable = isOperatorApiRequest(input)
      && requestMethod(input, init) === 'POST';
    if (!retryable) return originalFetch(input, init);

    const pending = persistPendingRequest(target, input, init);
    let lastError = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
        await waitForRetryOpportunity(target, delay);
        updatePendingAttempt(target, pending, attempt);
      }

      try {
        const response = await originalFetch(input, init);
        clearPendingRequest(target, pending);
        return response;
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          const state = recoveryState(target);
          announce(target, state.reason === 'offline'
            ? 'Waiting for connection…'
            : state.reason === 'background'
              ? 'Paused while the screen is away…'
              : 'Connection interrupted. Reconnecting…');
        }
      }
    }

    const message = target.navigator?.onLine === false
      ? 'You appear to be offline. Your Operator request is saved on this device; reconnect and try again.'
      : 'Connection to Operator was interrupted. Your request is saved on this device; please try again.';
    const wrapped = new TypeError(message);
    wrapped.cause = lastError;
    throw wrapped;
  };
}

installOperatorFetchRetry();
