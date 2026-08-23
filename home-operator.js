import { runOperatorAction } from './operator/actions.js';
import { collectPortalContext } from './operator/portal-context.js';

const ACCOUNT_SCORE_PREFIX = '3dvr:score:';

function aliasToDisplay(alias) {
  const normalized = typeof alias === 'string' ? alias.trim() : '';
  if (!normalized) return '';
  return normalized.includes('@') ? normalized.split('@')[0] : normalized;
}

function readSharedIdentity() {
  const entry = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith('portalIdentity='));
  if (!entry) return null;
  try {
    return JSON.parse(decodeURIComponent(entry.slice('portalIdentity='.length)));
  } catch {
    return null;
  }
}

function readAccountState() {
  const shared = readSharedIdentity() || {};
  const signedIn = localStorage.getItem('signedIn') === 'true';
  const guest = !signedIn && localStorage.getItem('guest') === 'true';
  const alias = (localStorage.getItem('alias') || shared.alias || '').trim();
  const username = (localStorage.getItem('username') || shared.username || '').trim();
  const guestName = (localStorage.getItem('guestDisplayName') || '').trim();
  const displayName = signedIn
    ? username || aliasToDisplay(alias) || 'User'
    : guest
      ? guestName || 'Guest'
      : '';

  return { signedIn, guest, alias, displayName };
}

function readCachedPoints(state) {
  try {
    let key = `${ACCOUNT_SCORE_PREFIX}anon`;
    if (state.signedIn) {
      key = `${ACCOUNT_SCORE_PREFIX}user:${state.alias.toLowerCase()}`;
    } else if (state.guest) {
      key = `${ACCOUNT_SCORE_PREFIX}${localStorage.getItem('guestId') || 'guest'}`;
    }
    return [key, `${key}:pending`, `${key}:portalPending`]
      .map(cacheKey => Number(localStorage.getItem(cacheKey) || 0))
      .filter(Number.isFinite)
      .reduce((best, value) => Math.max(best, Math.max(0, Math.round(value))), 0);
  } catch {
    return 0;
  }
}

function loadClassicScript(src) {
  const existing = Array.from(document.scripts).find(script => script.src === new URL(src, window.location.href).href);
  if (existing) {
    return existing.dataset.loaded === 'true'
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', reject, { once: true });
        });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });
}

function installAccountStatus() {
  const menu = document.querySelector('.menu');
  const summary = menu?.querySelector('summary');
  const panel = menu?.querySelector('.menu-panel');
  const signInLink = document.querySelector('.top-action--signin');
  if (!menu || !summary || !panel || !signInLink) return;

  const style = document.createElement('style');
  style.textContent = `
    .menu summary[data-account-state="user"],
    .menu summary[data-account-state="guest"] {
      max-width: min(250px, 42vw);
      gap: 5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .menu-panel [data-account-profile] {
      color: #79c0ff;
      font-weight: 800;
    }

    @media (max-width: 580px) {
      .top-action--signin.account-signin-visible { display: inline-flex; }
      .menu summary[data-account-state="user"],
      .menu summary[data-account-state="guest"] {
        max-width: 145px;
        padding-inline: 10px;
        font-size: 0.84rem;
      }
    }
  `;
  document.head.appendChild(style);

  let latestNetworkPoints = null;

  const ensureProfileLink = () => {
    let profile = panel.querySelector('[data-account-profile]');
    if (!profile) {
      profile = document.createElement('a');
      profile.href = '/profile.html#profile';
      profile.dataset.accountProfile = 'true';
      panel.prepend(profile);
    }
    return profile;
  };

  const render = () => {
    const state = readAccountState();
    const cachedPoints = readCachedPoints(state);
    const points = latestNetworkPoints == null
      ? cachedPoints
      : Math.max(cachedPoints, latestNetworkPoints);
    const profile = ensureProfileLink();

    if (state.signedIn) {
      signInLink.hidden = true;
      signInLink.classList.remove('account-signin-visible');
      summary.dataset.accountState = 'user';
      summary.textContent = `${state.displayName} · ⭐ ${points}`;
      summary.setAttribute('aria-label', `Signed in as ${state.displayName}. ${points} points. Open account menu.`);
      profile.hidden = false;
      profile.textContent = `Profile · ⭐ ${points}`;
      return;
    }

    if (state.guest) {
      signInLink.hidden = false;
      signInLink.classList.add('account-signin-visible');
      summary.dataset.accountState = 'guest';
      summary.textContent = `${state.displayName} · ⭐ ${points}`;
      summary.setAttribute('aria-label', `Guest profile. ${points} points. Open account menu.`);
      profile.hidden = false;
      profile.textContent = `Guest profile · ⭐ ${points}`;
      return;
    }

    signInLink.hidden = false;
    signInLink.classList.add('account-signin-visible');
    summary.dataset.accountState = 'anon';
    summary.textContent = 'Menu';
    summary.setAttribute('aria-label', 'Open portal menu');
    profile.hidden = true;
  };

  render();
  window.addEventListener('storage', render);
  window.addEventListener('portal-auth:changed', render);

  const state = readAccountState();
  if (!state.signedIn && !state.guest) return;

  (async () => {
    try {
      await loadClassicScript('https://cdn.jsdelivr.net/npm/gun/gun.js');
      await loadClassicScript('/gun-init.js');
      await loadClassicScript('https://cdn.jsdelivr.net/npm/gun/sea.js');
      await loadClassicScript('/score.js');
      if (!window.Gun || !window.ScoreSystem) return;

      const gun = window.Gun({ peers: window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun'] });
      const user = gun.user();
      window.ScoreSystem.recallUserSession(user);
      const scoreManager = window.ScoreSystem.getManager({
        gun,
        user,
        portalRoot: gun.get('3dvr-portal')
      });
      scoreManager.subscribe(points => {
        latestNetworkPoints = window.ScoreSystem.sanitizeScore(points);
        render();
      });
    } catch (error) {
      console.warn('Homepage account score sync unavailable; using cached points.', error);
    }
  })();
}

installAccountStatus();

const form = document.querySelector('#homeOperatorForm');
const input = document.querySelector('#homeOperatorInput');
const submit = document.querySelector('#homeOperatorSubmit');
const status = document.querySelector('#homeOperatorStatus');
const result = document.querySelector('#homeOperatorResult');
const reply = document.querySelector('#homeOperatorReply');
const followUps = document.querySelector('#homeOperatorFollowUps');
const actionLink = document.querySelector('#homeOperatorAction');

if (form && input && submit && status && result && reply && followUps && actionLink) {
  const LEGACY_KEY = '3dvr.operator.history.v1';
  const BASE_KEY = '3dvr.operator.conversations.v2';
  const identity = window.AuthIdentity?.readSharedIdentity?.() || {};
  const accountKey = localStorage.getItem('signedIn') === 'true'
    ? String(localStorage.getItem('userPubKey') || identity.alias || localStorage.getItem('alias') || '').trim().toLowerCase()
    : '';
  const conversationStoreKey = accountKey
    ? `${BASE_KEY}.account.${encodeURIComponent(accountKey)}`
    : BASE_KEY;
  const makeConversationId = () => globalThis.crypto?.randomUUID?.()
    || `conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = () => new Date().toISOString();

  let history = [];
  let homeConversationId = '';
  let homeConversationCreatedAt = '';

  const readConversationStore = () => {
    let store = { activeId: '', conversations: [] };

    try {
      const savedRaw = localStorage.getItem(conversationStoreKey)
        || (conversationStoreKey !== BASE_KEY ? localStorage.getItem(BASE_KEY) : '')
        || '';
      const saved = JSON.parse(savedRaw || 'null');
      if (saved && Array.isArray(saved.conversations)) {
        store = {
          activeId: String(saved.activeId || ''),
          conversations: saved.conversations
        };
      } else {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
        if (Array.isArray(legacy) && legacy.length) {
          const migratedAt = now();
          store = {
            activeId: makeConversationId(),
            conversations: [{
              id: makeConversationId(),
              createdAt: migratedAt,
              updatedAt: migratedAt,
              messages: legacy
            }]
          };
          store.activeId = store.conversations[0].id;
        }
      }
    } catch {
      // A damaged local cache should never stop Operator from answering.
    }

    return store;
  };

  const persistHistory = () => {
    if (!history.length) return;

    if (!homeConversationId) {
      homeConversationId = makeConversationId();
      homeConversationCreatedAt = now();
    }

    const store = readConversationStore();
    const updatedAt = now();
    let conversation = store.conversations.find(item => item.id === homeConversationId);

    if (!conversation) {
      conversation = {
        id: homeConversationId,
        createdAt: homeConversationCreatedAt || updatedAt,
        updatedAt,
        messages: []
      };
      store.conversations.push(conversation);
    }

    conversation.messages = history.slice(-40);
    conversation.updatedAt = updatedAt;
    store.activeId = homeConversationId;
    store.conversations = store.conversations
      .filter(item => Array.isArray(item.messages) && item.messages.length)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, 50);

    localStorage.setItem(conversationStoreKey, JSON.stringify(store));
    if (conversationStoreKey !== BASE_KEY) localStorage.removeItem(BASE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  };

  const installSubmitLoader = () => {
    if (submit.querySelector('.operator-submit__portal')) return;

    const style = document.createElement('style');
    style.textContent = `
      #homeOperatorSubmit {
        position: relative;
        display: grid;
        place-items: center;
        overflow: hidden;
      }

      #homeOperatorSubmit .operator-submit__arrow,
      #homeOperatorSubmit .operator-submit__portal {
        grid-area: 1 / 1;
        pointer-events: none;
        transition: opacity 160ms ease, transform 180ms ease;
      }

      #homeOperatorSubmit .operator-submit__arrow {
        line-height: 1;
      }

      #homeOperatorSubmit .operator-submit__portal {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        opacity: 0;
        transform: scale(0.68) rotate(-35deg);
        filter: drop-shadow(0 0 6px rgba(103, 232, 249, 0.42));
      }

      #homeOperatorSubmit[data-busy="true"] {
        background: #0f766e;
      }

      #homeOperatorSubmit[data-busy="true"]:disabled {
        opacity: 1;
        cursor: progress;
      }

      #homeOperatorSubmit[data-busy="true"] .operator-submit__arrow {
        opacity: 0;
        transform: scale(0.45) rotate(90deg);
      }

      #homeOperatorSubmit[data-busy="true"] .operator-submit__portal {
        opacity: 1;
        transform: scale(1);
        animation: operator-mini-portal-spin 900ms linear infinite, operator-mini-portal-pulse 760ms ease-in-out infinite alternate;
      }

      @keyframes operator-mini-portal-spin {
        to { transform: scale(1) rotate(360deg); }
      }

      @keyframes operator-mini-portal-pulse {
        from { filter: drop-shadow(0 0 3px rgba(103, 232, 249, 0.28)); }
        to { filter: drop-shadow(0 0 9px rgba(103, 232, 249, 0.72)); }
      }

      @media (prefers-reduced-motion: reduce) {
        #homeOperatorSubmit .operator-submit__arrow,
        #homeOperatorSubmit .operator-submit__portal {
          transition: none;
        }

        #homeOperatorSubmit[data-busy="true"] .operator-submit__portal {
          animation: operator-mini-portal-pulse 1100ms ease-in-out infinite alternate;
        }
      }
    `;
    document.head.appendChild(style);

    const arrow = document.createElement('span');
    arrow.className = 'operator-submit__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';

    const portal = document.createElement('img');
    portal.className = 'operator-submit__portal';
    portal.src = '/brand/portal-logo.svg';
    portal.alt = '';
    portal.setAttribute('aria-hidden', 'true');

    submit.replaceChildren(arrow, portal);
  };

  const installOperatorNavigation = () => {
    if (document.querySelector('.home-operator-links')) return;

    const style = document.createElement('style');
    style.textContent = `
      .home-operator-links {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .home-operator-links a {
        min-height: 40px;
        padding: 8px 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #30363d;
        border-radius: 999px;
        background: rgba(22, 27, 34, 0.78);
        color: #c9d1d9;
        font-size: 0.9rem;
        font-weight: 750;
        text-decoration: none;
      }

      .home-operator-links a:hover,
      .home-operator-links a:focus-visible {
        border-color: #58a6ff;
        color: #f0f6fc;
        outline: none;
      }
    `;
    document.head.appendChild(style);

    const nav = document.createElement('nav');
    nav.className = 'home-operator-links';
    nav.setAttribute('aria-label', 'Operator navigation');
    nav.innerHTML = `
      <a href="/operator/">Open full Operator</a>
      <a href="/operator/?history=1">Past conversations</a>
    `;
    form.insertAdjacentElement('afterend', nav);
  };

  installSubmitLoader();
  installOperatorNavigation();

  const collectPageContext = () => ({
    path: window.location.pathname,
    url: window.location.href,
    title: document.title,
    heading: document.querySelector('#home-title')?.textContent?.trim() || '',
    area: 'home',
    visibleActions: Array.from(document.querySelectorAll('.action-card strong'))
      .map(node => node.textContent?.trim())
      .filter(Boolean)
  });

  const requestOperator = payload => fetch('/api/openai-site?provider=operator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const setBusy = busy => {
    submit.disabled = busy;
    input.disabled = busy;
    submit.dataset.busy = String(busy);
    submit.setAttribute('aria-label', busy ? 'Operator is working' : 'Send to Operator');
    form.setAttribute('aria-busy', String(busy));
  };

  const renderResponse = ({ message, suggestions = [], url = '', label = 'Open workspace' }) => {
    reply.textContent = message;
    followUps.replaceChildren();
    suggestions.slice(0, 3).forEach(suggestion => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'operator-follow-up';
      button.textContent = suggestion;
      button.addEventListener('click', () => {
        input.value = suggestion;
        form.requestSubmit();
      });
      followUps.appendChild(button);
    });
    actionLink.hidden = !url;
    if (url) {
      actionLink.href = url;
      actionLink.textContent = `${label} →`;
    }
    result.hidden = false;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    const prior = history.slice(-12);
    history.push({ role: 'user', content: prompt });
    persistHistory();
    input.value = '';
    setBusy(true);
    status.textContent = 'Operator is working on this page…';

    try {
      const portalContext = await collectPortalContext();
      portalContext.page = collectPageContext();

      const response = await requestOperator({ prompt, history: prior, portalContext });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Operator request failed.');

      let outcome = null;
      if (data.action?.type && data.action.type !== 'none') {
        outcome = await runOperatorAction(data.action);
      }

      const message = [data.reply, outcome?.message].filter(Boolean).join('\n\n');
      const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      const lifeSpaceActions = new Set(['create_note', 'create_checklist', 'save_link']);
      const storedActionLabel = lifeSpaceActions.has(data.action?.type)
        ? 'Life Space'
        : data.action?.type === 'add_lead'
          ? 'Lead Finder'
          : 'workspace';
      const label = storedActionLabel === 'workspace' ? 'Open workspace' : `Open ${storedActionLabel}`;

      history.push({
        role: 'assistant',
        content: message,
        suggestions,
        actionUrl: outcome?.url || '',
        actionLabel: storedActionLabel
      });
      persistHistory();

      renderResponse({
        message,
        suggestions,
        url: outcome?.url || '',
        label
      });
      status.textContent = 'Operator is ready.';
    } catch (error) {
      const message = `I could not finish that: ${error.message}`;
      history.push({ role: 'assistant', content: message });
      persistHistory();
      renderResponse({ message });
      status.textContent = 'Operator needs another try.';
    } finally {
      setBusy(false);
      input.focus();
    }
  });
}
