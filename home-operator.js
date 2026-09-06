import { runOperatorAction } from './operator/actions.js';
import { collectPortalContext } from './operator/portal-context.js';
import { createOperatorDeveloperProof } from './operator/forge.js';

function aliasToDisplay(alias) {
  const normalized = typeof alias === 'string' ? alias.trim() : '';
  if (!normalized) return '';
  return normalized.includes('@') ? normalized.split('@')[0] : normalized;
}

function syncHomepageIdentity() {
  try {
    window.AuthIdentity?.syncStorageFromSharedIdentity?.(localStorage);
  } catch (error) {
    console.warn('Homepage identity sync unavailable.', error);
  }
}

function readAccountState() {
  syncHomepageIdentity();
  const shared = window.AuthIdentity?.readSharedIdentity?.() || {};
  const signedIn = localStorage.getItem('signedIn') === 'true';
  const alias = (localStorage.getItem('alias') || shared.alias || '').trim();
  const username = (localStorage.getItem('username') || shared.username || '').trim();
  return {
    signedIn,
    alias,
    displayName: signedIn ? username || aliasToDisplay(alias) || 'User' : ''
  };
}

function readCachedPoints(state) {
  if (!state.signedIn || !state.alias) return 0;
  try {
    const key = `3dvr:score:user:${state.alias.toLowerCase()}`;
    return [key, `${key}:pending`, `${key}:portalPending`]
      .map(cacheKey => Number(localStorage.getItem(cacheKey) || 0))
      .filter(Number.isFinite)
      .reduce((best, value) => Math.max(best, Math.max(0, Math.round(value))), 0);
  } catch {
    return 0;
  }
}

function installAccountStatus() {
  const authEntry = document.querySelector('[data-auth-entry]');
  if (!authEntry) return;

  const render = () => {
    const state = readAccountState();
    if (state.signedIn) {
      const points = readCachedPoints(state);
      authEntry.href = '/profile.html#profile';
      authEntry.textContent = `${state.displayName} · ⭐ ${points}`;
      authEntry.setAttribute('aria-label', `Open profile for ${state.displayName}. ${points} points.`);
      return;
    }

    authEntry.href = '/sign-in.html?redirect=%2F';
    authEntry.textContent = 'Sign in';
    authEntry.setAttribute('aria-label', 'Sign in or create an account');
  };

  render();
  window.addEventListener('storage', render);
  window.addEventListener('portal-auth:changed', render);
}

function installOsLauncher() {
  const osUrl = 'https://os.3dvr.tech/';
  const appsList = document.querySelector('#appsList');
  if (appsList && !appsList.querySelector('[data-3dvr-os-app]')) {
    const app = document.createElement('a');
    app.className = 'app-link';
    app.href = osUrl;
    app.dataset.app = '3dvr os daedalos tommyos linux browser desktop';
    app.dataset.threedvrOsApp = 'true';
    app.innerHTML = '<strong>3DVR OS</strong><span>Open personal computing and the browser desktop.</span>';
    appsList.appendChild(app);
  }
}

function installLabsLauncher() {
  const appsList = document.querySelector('#appsList');
  if (appsList && !appsList.querySelector('[data-3dvr-labs-app]')) {
    const app = document.createElement('a');
    app.className = 'app-link';
    app.href = '/labs/';
    app.dataset.app = 'labs experiments experimental computing research life lab noteverse digital organism 13 month calendar';
    app.dataset.threedvrLabsApp = 'true';
    app.innerHTML = '<strong>Labs</strong><span>Explore 3D experiments, artificial life, and new computing ideas.</span>';
    appsList.appendChild(app);
  }

  const menu = document.querySelector('.menu-panel');
  if (menu && !menu.querySelector('[data-3dvr-labs-menu]')) {
    const link = document.createElement('a');
    link.href = '/labs/';
    link.dataset.threedvrLabsMenu = 'true';
    link.textContent = 'Labs';
    const games = [...menu.querySelectorAll('a')].find(item => item.getAttribute('href') === '/games.html');
    menu.insertBefore(link, games || null);
  }
}

installAccountStatus();
installOsLauncher();
installLabsLauncher();

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
  const idlePlaceholder = input.getAttribute('placeholder') || 'Ask Operator…';

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
    input.placeholder = busy ? 'Operator is working on this page…' : idlePlaceholder;
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
    status.textContent = '';

    try {
      const [portalContext, developerAuth] = await Promise.all([
        collectPortalContext(),
        createOperatorDeveloperProof()
      ]);
      portalContext.page = collectPageContext();

      const response = await requestOperator({ prompt, history: prior, portalContext, developerAuth });
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
