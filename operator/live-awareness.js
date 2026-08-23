const STORAGE_KEY = '3dvr.operator.live-draft-awareness.v1';
const DEFAULT_DELAY_MS = 3600;
const MIN_DELAY_MS = 1800;
const MAX_DELAY_MS = 12000;
const MIN_DRAFT_CHARS = 12;
const MAX_IDLE_RECHECKS = 2;

export function clampDraftDelay(value, fallback = DEFAULT_DELAY_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, Math.round(parsed || fallback)));
}

export function changedDraftCharacters(previous = '', current = '') {
  const before = String(previous);
  const after = String(current);
  if (before === after) return 0;

  let prefix = 0;
  const prefixLimit = Math.min(before.length, after.length);
  while (prefix < prefixLimit && before[prefix] === after[prefix]) prefix += 1;

  let suffix = 0;
  const suffixLimit = Math.min(before.length - prefix, after.length - prefix);
  while (
    suffix < suffixLimit
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1;

  return (before.length - prefix - suffix) + (after.length - prefix - suffix);
}

export function shouldObserveDraft({ draft = '', lastObserved = '', forceIdle = false } = {}) {
  const text = String(draft).trim();
  if (text.length < MIN_DRAFT_CHARS) return false;
  if (forceIdle) return text === String(lastObserved).trim();
  if (!lastObserved) return true;
  if (text === String(lastObserved).trim()) return false;

  const changed = changedDraftCharacters(lastObserved, text);
  return changed >= 8 || Math.abs(text.length - String(lastObserved).trim().length) >= 8 || /[.!?…]\s*$/.test(text);
}

function readEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Boolean(enabled)));
  } catch {
    // Live awareness is optional; a blocked localStorage should not affect chat.
  }
}

function recentVisibleHistory() {
  const messages = Array.from(document.querySelectorAll('#operator-log article.message'))
    .slice(-6)
    .map(article => ({
      role: article.classList.contains('assistant') ? 'assistant' : 'user',
      content: article.querySelector('p')?.textContent?.trim() || ''
    }))
    .filter(item => item.content);

  if (messages.length) return messages;

  const homeReply = document.querySelector('#homeOperatorReply')?.textContent?.trim();
  return homeReply ? [{ role: 'assistant', content: homeReply }] : [];
}

function installStyles() {
  if (document.querySelector('#operator-live-awareness-style')) return;
  const style = document.createElement('style');
  style.id = 'operator-live-awareness-style';
  style.textContent = `
    .operator-live-awareness {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 3px 8px;
      border: 1px solid rgba(125, 211, 252, 0.24);
      border-radius: 999px;
      background: rgba(8, 18, 31, 0.72);
      color: #a7b6c9;
      font: inherit;
      font-size: 0.76rem;
      cursor: pointer;
    }

    .operator-live-awareness[aria-pressed="true"] {
      border-color: rgba(103, 232, 249, 0.52);
      color: #d7fbff;
      box-shadow: inset 0 0 0 1px rgba(103, 232, 249, 0.08);
    }

    .operator-live-awareness__dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.5;
    }

    .operator-live-awareness[aria-pressed="true"] .operator-live-awareness__dot {
      opacity: 1;
      box-shadow: 0 0 8px rgba(103, 232, 249, 0.65);
    }

    .operator-live-awareness-status {
      max-width: 230px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

export function attachLiveDraftAwareness({
  input,
  form,
  statusTarget,
  request = globalThis.fetch
} = {}) {
  if (!input || !form || typeof request !== 'function') return null;

  installStyles();

  const footer = form.querySelector(':scope > div > span') || form.querySelector('span') || form;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'operator-live-awareness';
  toggle.title = 'When enabled, unsent draft text may be sent to Operator while you type. Draft checks can never take actions.';
  toggle.innerHTML = '<span class="operator-live-awareness__dot" aria-hidden="true"></span><span>Live awareness</span>';

  const liveStatus = document.createElement('small');
  liveStatus.className = 'operator-live-awareness-status';
  liveStatus.setAttribute('role', 'status');
  liveStatus.hidden = true;

  footer.append(toggle, liveStatus);

  let enabled = readEnabled();
  let timer = null;
  let inFlight = false;
  let lastObserved = '';
  let previousValue = input.value || '';
  let startedAt = 0;
  let lastInputAt = 0;
  let editCount = 0;
  let deletedChars = 0;
  let pauseCount = 0;
  let idleRechecks = 0;
  let nextDelayMs = DEFAULT_DELAY_MS;
  let previousSummary = '';

  const renderToggle = () => {
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.setAttribute('aria-label', enabled ? 'Disable live draft awareness' : 'Enable live draft awareness');
    if (!enabled) {
      liveStatus.hidden = true;
      if (statusTarget?.dataset?.liveAwareness === 'true') {
        statusTarget.textContent = 'Ready';
        delete statusTarget.dataset.liveAwareness;
      }
    }
  };

  const setListeningStatus = message => {
    liveStatus.hidden = false;
    liveStatus.textContent = message;
    if (statusTarget && !/Working|Try again/i.test(statusTarget.textContent || '')) {
      statusTarget.textContent = message;
      statusTarget.dataset.liveAwareness = 'true';
    }
  };

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const schedule = (delay = nextDelayMs, { forceIdle = false } = {}) => {
    clearTimer();
    if (!enabled || document.hidden) return;
    const draft = input.value.trim();
    if (!shouldObserveDraft({ draft, lastObserved, forceIdle })) return;
    timer = setTimeout(() => observe({ forceIdle }), Math.max(MIN_DELAY_MS, delay));
  };

  const observe = async ({ forceIdle = false } = {}) => {
    clearTimer();
    if (!enabled || document.hidden || inFlight) return;

    const draft = input.value.trim();
    if (!shouldObserveDraft({ draft, lastObserved, forceIdle })) return;

    const observedDraft = draft;
    const observedAt = Date.now();
    pauseCount += 1;
    inFlight = true;
    setListeningStatus('Operator is listening…');

    try {
      const response = await request('/api/openai-site?provider=operator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: true,
          prompt: observedDraft,
          history: recentVisibleHistory(),
          previousDraftSummary: previousSummary,
          draftSignals: {
            elapsedMs: startedAt ? observedAt - startedAt : 0,
            pauseMs: lastInputAt ? observedAt - lastInputAt : 0,
            editCount,
            deletedChars,
            pauseCount,
            characterCount: observedDraft.length
          }
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Draft awareness unavailable.');

      const awareness = data.draftAwareness || {};
      if (input.value.trim() !== observedDraft) {
        idleRechecks = 0;
        schedule(DEFAULT_DELAY_MS);
        return;
      }

      lastObserved = observedDraft;
      previousSummary = String(awareness.summary || '').trim().slice(0, 180);
      nextDelayMs = clampDraftDelay(awareness.checkAgainMs);
      setListeningStatus(awareness.ready ? 'Following · waiting for Send' : 'Following your thought…');
      if (previousSummary) liveStatus.title = previousSummary;

      if (nextDelayMs > 0 && idleRechecks < MAX_IDLE_RECHECKS) {
        idleRechecks += 1;
        schedule(nextDelayMs, { forceIdle: true });
      }
    } catch {
      liveStatus.hidden = false;
      liveStatus.textContent = 'Live awareness paused';
    } finally {
      inFlight = false;
    }
  };

  const onInput = () => {
    const value = input.value;
    const timestamp = Date.now();
    if (!startedAt && value.trim()) startedAt = timestamp;
    if (value.length < previousValue.length) deletedChars += previousValue.length - value.length;
    if (value !== previousValue) editCount += 1;
    previousValue = value;
    lastInputAt = timestamp;
    idleRechecks = 0;

    if (!value.trim()) {
      clearTimer();
      lastObserved = '';
      previousSummary = '';
      nextDelayMs = DEFAULT_DELAY_MS;
      startedAt = 0;
      editCount = 0;
      deletedChars = 0;
      pauseCount = 0;
      if (enabled) setListeningStatus('Live awareness on');
      return;
    }

    if (enabled) schedule(/[.!?…]\s*$/.test(value) ? 2200 : nextDelayMs);
  };

  toggle.addEventListener('click', () => {
    enabled = !enabled;
    writeEnabled(enabled);
    renderToggle();
    if (enabled) {
      setListeningStatus('Live awareness on');
      onInput();
    } else {
      clearTimer();
    }
  });

  input.addEventListener('input', onInput, { passive: true });
  form.addEventListener('submit', () => clearTimer());
  document.addEventListener('visibilitychange', () => {
    clearTimer();
    if (!document.hidden && enabled && input.value.trim()) schedule();
  });
  window.addEventListener('beforeunload', clearTimer, { once: true });

  renderToggle();
  if (enabled) {
    setListeningStatus('Live awareness on');
    if (input.value.trim()) onInput();
  }

  return {
    isEnabled: () => enabled,
    checkNow: () => observe(),
    disable: () => {
      enabled = false;
      writeEnabled(false);
      clearTimer();
      renderToggle();
    }
  };
}

if (typeof document !== 'undefined') {
  const input = document.querySelector('#operator-input');
  const form = document.querySelector('#operator-form');
  if (input && form) {
    attachLiveDraftAwareness({
      input,
      form,
      statusTarget: document.querySelector('#operator-status')
    });
  }
}
