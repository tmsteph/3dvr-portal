import { prepareOperatorChat } from './operator/chat-preparation.js';
import { createOperatorSync, mergeOperatorStores } from './operator/sync.js';
import { ensureConversationTree } from './operator/conversation-tree.js';
import { runOperatorAction, watchOperatorActionOutcome } from './operator/actions.js';
import { collectPortalContext } from './operator/portal-context.js';
import { createOperatorDeveloperProof } from './operator/forge.js';
import { fetchOperatorStream } from './operator/stream.js';
import { operatorHandoffUrl } from './operator/handoff.js';
import { recallOperatorMemoryBestEffort, rememberOperatorTurnBestEffort } from './operator/organism-chat-bridge.js';
import { paintOperatorMarkdown } from './operator/markdown.js';

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

  let scoreUnsubscribe = null;
  let scoreManager = null;
  let activeAlias = '';
  let publicAliasChain = null;
  let publicPubChain = null;

  const render = (livePoints = null) => {
    const state = readAccountState();
    if (state.signedIn) {
      const cached = readCachedPoints(state);
      const points = Number.isFinite(Number(livePoints))
        ? Math.max(cached, Math.max(0, Math.round(Number(livePoints))))
        : cached;
      authEntry.href = '/profile.html#profile';
      authEntry.textContent = `${state.displayName} · ⭐ ${points}`;
      authEntry.setAttribute('aria-label', `Open profile for ${state.displayName}. ${points} points.`);
      return state;
    }

    authEntry.href = '/sign-in.html?redirect=%2F';
    authEntry.textContent = 'Sign in';
    authEntry.setAttribute('aria-label', 'Sign in or create an account');
    return state;
  };

  const detachPublicPoints = () => {
    for (const chain of [publicAliasChain, publicPubChain]) {
      if (!chain || typeof chain.off !== 'function') continue;
      try { chain.off(); } catch {}
    }
    publicAliasChain = null;
    publicPubChain = null;
  };

  const acceptPublicPoints = data => {
    const value = Number(data?.points);
    if (!Number.isFinite(value)) return;
    render(Math.max(0, Math.round(value)));
  };

  const subscribePublicPoints = (portalRoot, state) => {
    detachPublicPoints();
    if (!portalRoot || !state?.alias) return;

    try {
      publicAliasChain = portalRoot.get('userStats').get(state.alias);
      publicAliasChain.once(acceptPublicPoints);
      publicAliasChain.on(acceptPublicPoints);
    } catch (error) {
      console.warn('Homepage alias point sync unavailable.', error);
    }

    const pub = (localStorage.getItem('userPubKey') || '').trim();
    if (!pub) return;
    try {
      publicPubChain = portalRoot.get('userStatsByPub').get(pub);
      publicPubChain.once(acceptPublicPoints);
      publicPubChain.on(acceptPublicPoints);
    } catch (error) {
      console.warn('Homepage pubkey point sync unavailable.', error);
    }
  };

  const hydrate = () => {
    const state = render();
    if (!state.signedIn || !state.alias || !window.ScoreSystem || typeof window.Gun !== 'function') {
      return;
    }

    const normalizedAlias = state.alias.toLowerCase();
    if (scoreManager && activeAlias === normalizedAlias) return;

    if (scoreUnsubscribe) {
      scoreUnsubscribe();
      scoreUnsubscribe = null;
    }
    if (scoreManager && typeof window.ScoreSystem.resetManager === 'function') {
      window.ScoreSystem.resetManager();
    }

    const context = window.ScoreSystem.ensureGun(
      () => window.Gun({
        localStorage: false,
        peers: Array.isArray(window.__GUN_PEERS__) && window.__GUN_PEERS__.length
          ? window.__GUN_PEERS__
          : ['wss://portal.3dvr.tech/gun-relay']
      }),
      { label: 'homepage-score' }
    );

    try {
      window.ScoreSystem.recallUserSession?.(context.user);
    } catch (error) {
      console.warn('Homepage score session recall unavailable.', error);
    }

    const portalRoot = context.gun.get('3dvr-portal');
    subscribePublicPoints(portalRoot, state);

    scoreManager = window.ScoreSystem.getManager({
      gun: context.gun,
      user: context.user,
      portalRoot
    });
    activeAlias = normalizedAlias;
    scoreUnsubscribe = scoreManager.subscribe(points => render(points));
    scoreManager.whenReady().then(points => render(points)).catch(() => {});
  };

  hydrate();
  window.addEventListener('storage', hydrate);
  window.addEventListener('portal-auth:changed', hydrate);
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

async function createDeveloperProofWithRetry() {
  const delays = [0, 700, 1600];
  let lastError = null;
  for (const delay of delays) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    try {
      const proof = await createOperatorDeveloperProof();
      if (proof) return proof;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

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
  const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)');
  const roomyChatLayout = window.matchMedia?.('(min-width: 860px) and (min-height: 600px)');

  const syncChatLayout = () => {
    const canDockSpinner = Boolean(
      document.body.dataset.homeChatActive === 'true'
      && roomyChatLayout?.matches
      && !result.hidden
      && result.scrollHeight >= 280
    );
    document.body.dataset.homeChatLong = canDockSpinner ? 'true' : 'false';
  };

  const activateChatMode = () => {
    document.body.dataset.homeChatActive = 'true';
    syncChatLayout();
  };

  const focusComposerWithoutScroll = () => {
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  };

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

  // The local copy is a cache; the synced record lives with the account.
  // If the browser refuses the write (storage full), keep the active and
  // newest conversations locally and carry on. This must never throw:
  // persistHistory runs ahead of the send, so a failed cache write would
  // otherwise kill the send button silently, with no error shown.
  const writeConversationStore = store => {
    const byNewest = [...(store.conversations || [])]
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const active = byNewest.find(item => item.id === store.activeId);
    const attempts = [store];
    for (const keep of [20, 5, 1]) {
      const kept = byNewest.slice(0, keep);
      if (active && !kept.includes(active)) kept[kept.length - 1] = active;
      attempts.push({ ...store, conversations: kept });
    }
    for (const candidate of attempts) {
      try {
        localStorage.setItem(conversationStoreKey, JSON.stringify(candidate));
        return true;
      } catch {
        // Storage still full; try the next smaller copy.
      }
    }
    return false;
  };

  const accountSync = createOperatorSync({ windowObj: window });

  // A full sync re-reads, decrypts, merges, rewrites, and re-encrypts the
  // whole conversation store. Running it on every window focus made the
  // composer stutter exactly when the user came back to type (measured
  // 2026-11-09: ~4.8s of long tasks in the seconds after one focus event
  // with a 142-conversation store). Focus/online/visibility syncs are
  // throttled to one run a minute, and a sync whose merge changes nothing
  // skips the rewrite and the account save entirely. persistHistory keeps
  // saving each turn on its own, so nothing durable depends on this
  // catch-up path running more often.
  const SYNC_MIN_INTERVAL_MS = 60_000;
  let homeSyncPromise = null;
  let lastSyncStartedAt = 0;

  const storeSignature = store => {
    const conversations = Array.isArray(store?.conversations) ? store.conversations : [];
    let messages = 0;
    let newest = '';
    for (const item of conversations) {
      messages += Array.isArray(item?.messages) ? item.messages.length : 0;
      const updatedAt = String(item?.updatedAt || '');
      if (updatedAt > newest) newest = updatedAt;
    }
    return `${conversations.length}|${messages}|${newest}|${store?.activeId || ''}`;
  };

  const syncHomeHistory = () => {
    if (homeSyncPromise) return homeSyncPromise;
    const startedAt = Date.now();
    if (startedAt - lastSyncStartedAt < SYNC_MIN_INTERVAL_MS) return Promise.resolve();
    lastSyncStartedAt = startedAt;
    homeSyncPromise = (async () => {
      const local = readConversationStore();
      // A store that exists only in memory (a legacy-history migration)
      // still gets its first write even when the account has nothing new.
      if (local.conversations.length && !localStorage.getItem(conversationStoreKey)) {
        writeConversationStore(local);
      }
      const remote = await accountSync.load(local);
      if (!remote) return;
      const merged = mergeOperatorStores(readConversationStore(), remote);
      if (storeSignature(merged) === storeSignature(local)) return;
      writeConversationStore(merged);
      if (merged.conversations.length) await accountSync.save(merged);
    })().catch(() => {}).finally(() => { homeSyncPromise = null; });
    return homeSyncPromise;
  };
  window.addEventListener('focus', () => { void syncHomeHistory(); });
  window.addEventListener('online', () => { void syncHomeHistory(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') void syncHomeHistory();
  });
  // Let the first paint and the first click win; the history catch-up idles.
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => { void syncHomeHistory(); }, { timeout: 2500 });
  } else {
    window.setTimeout(() => { void syncHomeHistory(); }, 600);
  }

  const persistHistory = () => {
    try {
      persistHistoryInner();
    } catch {
      // A damaged local cache should never stop Operator from answering.
    }
  };

  const persistHistoryInner = () => {
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

    conversation.messages = history.slice();
    ensureConversationTree(conversation);
    conversation.activeLeafId = conversation.messages.at(-1)?.id || null;
    conversation.updatedAt = updatedAt;
    store.activeId = homeConversationId;
    store.conversations = store.conversations
      .filter(item => Array.isArray(item.messages) && item.messages.length)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    writeConversationStore(store);
    if (conversationStoreKey !== BASE_KEY) localStorage.removeItem(BASE_KEY);
    localStorage.removeItem(LEGACY_KEY);
    refreshOperatorNavigation();
    void accountSync.save(store);
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
        transition: background-color 480ms ease, box-shadow 480ms ease;
      }

      #homeOperatorSubmit .operator-submit__arrow,
      #homeOperatorSubmit .operator-submit__portal {
        grid-area: 1 / 1;
        pointer-events: none;
        transition: opacity 320ms ease, transform 420ms cubic-bezier(.22,.8,.24,1);
      }

      #homeOperatorSubmit .operator-submit__arrow {
        line-height: 1;
      }

      #homeOperatorSubmit .operator-submit__portal {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        opacity: 0;
        transform: scale(0.82);
        filter: drop-shadow(0 0 4px rgba(103, 232, 249, 0.24));
      }

      #homeOperatorSubmit[data-busy="true"] {
        background: #126b68;
        box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.08);
      }

      #homeOperatorSubmit[data-busy="true"] .operator-submit__arrow {
        opacity: 0;
        transform: scale(0.72);
      }

      #homeOperatorSubmit[data-busy="true"] .operator-submit__portal {
        opacity: 0.94;
        transform: scale(1);
        animation: operator-mini-portal-breathe 2400ms ease-in-out infinite;
      }

      @keyframes operator-mini-portal-breathe {
        0%, 100% {
          transform: translateY(1px) scale(0.94);
          filter: drop-shadow(0 0 3px rgba(103, 232, 249, 0.22));
        }
        50% {
          transform: translateY(-1px) scale(1.04);
          filter: drop-shadow(0 0 8px rgba(103, 232, 249, 0.5));
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #homeOperatorSubmit,
        #homeOperatorSubmit .operator-submit__arrow,
        #homeOperatorSubmit .operator-submit__portal {
          transition: none;
        }

        #homeOperatorSubmit[data-busy="true"] .operator-submit__portal {
          animation: none;
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
      <a id="homeOperatorFull" href="/operator/">Open full Operator</a>
      <a href="/operator/?history=1">Past conversations</a>
    `;
    form.insertAdjacentElement('afterend', nav);
  };

  const installQueueRegion = () => {
    const existing = document.querySelector('#homeOperatorQueue');
    if (existing) return existing;

    const style = document.createElement('style');
    style.textContent = `
      .home-operator-queue {
        margin: 8px 4px 0;
        display: grid;
        gap: 6px;
      }

      .home-operator-queue[hidden] { display: none; }

      .home-operator-queue__item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border: 1px dashed #30363d;
        border-radius: 10px;
        background: rgba(22, 27, 34, 0.6);
        color: #c9d1d9;
        font-size: 0.88rem;
      }

      .home-operator-queue__badge {
        flex: none;
        color: #79c0ff;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .home-operator-queue__text {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .home-operator-queue__remove {
        margin-left: auto;
        flex: none;
        width: 24px;
        height: 24px;
        border: 1px solid #30363d;
        border-radius: 999px;
        background: transparent;
        color: #8b949e;
        line-height: 1;
        cursor: pointer;
      }

      .home-operator-queue__remove:hover,
      .home-operator-queue__remove:focus-visible {
        color: #f0f6fc;
        border-color: #58a6ff;
        outline: none;
      }
    `;
    document.head.appendChild(style);

    const region = document.createElement('div');
    region.id = 'homeOperatorQueue';
    region.className = 'home-operator-queue';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-label', 'Messages queued for Operator');
    region.hidden = true;
    status.insertAdjacentElement('afterend', region);
    return region;
  };

  installSubmitLoader();
  installOperatorNavigation();
  const queueRegion = installQueueRegion();

  const refreshOperatorNavigation = () => {
    const fullOperatorLinks = [
      document.querySelector('#homeOperatorFull'),
      document.querySelector('#homeOperatorFullInline')
    ].filter(Boolean);
    if (!fullOperatorLinks.length) return;
    const href = operatorHandoffUrl({
      conversation: homeConversationId,
      path: window.location.pathname,
      title: document.title,
      heading: document.querySelector('#home-title')?.textContent?.trim() || ''
    });
    fullOperatorLinks.forEach(link => {
      link.href = href;
    });
  };

  refreshOperatorNavigation();

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

  const requestOperator = (payload, handlers = {}) => fetchOperatorStream(payload, handlers);

  const setBusy = busy => {
    // The composer stays live while a turn runs: a send during a turn
    // queues behind it (see the submit handler) instead of being blocked
    // by a disabled input the user cannot type into.
    input.placeholder = busy ? 'Operator is working on this page…' : idlePlaceholder;
    submit.dataset.busy = String(busy);
    submit.setAttribute('aria-label', busy ? 'Operator is working' : 'Send to Operator');
    form.setAttribute('aria-busy', String(busy));
  };

  // Sends made while a turn is running wait here, visibly, and dispatch
  // first-in-first-out when the turn finishes (the queue half of Thomas's
  // batch / queue / steer model, matching Helm's queue). Steering a live
  // turn is not possible on this surface: a home turn is a single
  // request/stream with no channel to inject into it mid-flight.
  let turnInFlight = false;
  const pendingPrompts = [];

  const renderQueue = () => {
    queueRegion.replaceChildren();
    queueRegion.hidden = pendingPrompts.length === 0;
    pendingPrompts.forEach(queuedPrompt => {
      const row = document.createElement('div');
      row.className = 'home-operator-queue__item';

      const badge = document.createElement('span');
      badge.className = 'home-operator-queue__badge';
      badge.textContent = 'Queued';

      const text = document.createElement('span');
      text.className = 'home-operator-queue__text';
      text.textContent = queuedPrompt;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'home-operator-queue__remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove queued message: ${queuedPrompt}`);
      remove.addEventListener('click', () => {
        const at = pendingPrompts.indexOf(queuedPrompt);
        if (at >= 0) pendingPrompts.splice(at, 1);
        renderQueue();
      });

      row.append(badge, text, remove);
      queueRegion.appendChild(row);
    });
  };

  let replyPaintTimer = 0;
  let pendingReplyText = '';

  const paintReply = () => {
    replyPaintTimer = 0;
    paintOperatorMarkdown(reply, pendingReplyText);
    window.requestAnimationFrame(syncChatLayout);
  };

  const queueReplyPaint = message => {
    pendingReplyText = message;
    if (replyPaintTimer) return;
    replyPaintTimer = window.setTimeout(paintReply, 90);
  };

  const flushReplyPaint = message => {
    pendingReplyText = message;
    if (replyPaintTimer) {
      window.clearTimeout(replyPaintTimer);
      replyPaintTimer = 0;
    }
    paintReply();
  };

  const beginResponse = () => {
    activateChatMode();
    if (replyPaintTimer) {
      window.clearTimeout(replyPaintTimer);
      replyPaintTimer = 0;
    }
    pendingReplyText = '';
    reply.textContent = '';
    followUps.replaceChildren();
    actionLink.hidden = true;
    result.scrollTop = 0;
    result.dataset.streaming = 'true';
    result.hidden = false;
  };

  const renderResponse = ({ message, suggestions = [], url = '', label = 'Open workspace' }) => {
    flushReplyPaint(message);
    followUps.replaceChildren();
    suggestions.slice(0, 3).forEach((suggestion, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'operator-follow-up';
      button.style.setProperty('--suggestion-index', index);
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
    result.dataset.streaming = 'false';
    result.hidden = false;
    window.requestAnimationFrame(syncChatLayout);
  };

  roomyChatLayout?.addEventListener?.('change', syncChatLayout);
  window.addEventListener('resize', syncChatLayout, { passive: true });

  const runTurn = async prompt => {
    turnInFlight = true;

    const prior = history.slice(-12);
    const shouldRestoreComposerFocus = Boolean(
      finePointer?.matches
      && window.innerWidth > 580
      && form.contains(document.activeElement)
    );
    history.push({ role: 'user', content: prompt });
    persistHistory();
    setBusy(true);
    status.textContent = '';
    beginResponse();

    try {
      const [portalContext, developerAuth, memoryContext] = await prepareOperatorChat({
        collectContext: collectPortalContext,
        createProof: createDeveloperProofWithRetry,
        recallMemory: recallOperatorMemoryBestEffort,
        prompt
      });
      portalContext.page = collectPageContext();

      let streamedReply = '';
      const data = await requestOperator(
        { prompt, history: prior, portalContext, developerAuth, memoryContext },
        {
          onStatus: message => {
            status.textContent = message;
          },
          onReplyDelta: delta => {
            streamedReply += delta;
            queueReplyPaint(streamedReply);
            status.textContent = 'Operator is responding…';
          }
        }
      );

      let outcome = null;
      if (data.action?.type && data.action.type !== 'none') {
        outcome = await runOperatorAction(data.action, { developerAccess: data.developerAccess, onStatus: message => { status.textContent = message; queueReplyPaint([data.reply || streamedReply, message].filter(Boolean).join('\n\n')); } });
      }

      const message = [data.reply || streamedReply, outcome?.message].filter(Boolean).join('\n\n');
      const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      const lifeSpaceActions = new Set(['create_note', 'create_checklist', 'save_link']);
      const storedActionLabel = lifeSpaceActions.has(data.action?.type)
        ? 'Life Space'
        : data.action?.type === 'add_lead'
          ? 'Lead Finder'
          : 'workspace';
      const label = storedActionLabel === 'workspace' ? 'Open workspace' : `Open ${storedActionLabel}`;

      const assistantEntry = {
        role: 'assistant',
        content: message,
        suggestions,
        actionUrl: outcome?.url || '',
        actionLabel: storedActionLabel
      };
      history.push(assistantEntry);
      persistHistory();
      void rememberOperatorTurnBestEffort({
        conversationId: homeConversationId,
        prompt,
        reply: message,
        subject: '3DVR Operator home conversation'
      });

      renderResponse({
        message,
        suggestions,
        url: outcome?.url || '',
        label
      });

      if (outcome?.backgroundTask) {
        status.textContent = 'Tracking delegated work…';
        void watchOperatorActionOutcome(outcome, {
          onStatus: liveStatus => {
            if (history[history.length - 1] === assistantEntry) status.textContent = liveStatus;
          },
          onUpdate: update => {
            const liveMessage = [data.reply || streamedReply, update.message].filter(Boolean).join('\n\n');
            assistantEntry.content = liveMessage;
            persistHistory();
            if (history[history.length - 1] === assistantEntry) flushReplyPaint(liveMessage);
            if (update.terminal) {
              void rememberOperatorTurnBestEffort({
                conversationId: homeConversationId,
                prompt,
                reply: liveMessage,
                subject: '3DVR Operator home conversation'
              });
            }
          }
        }).catch(() => {
          if (history[history.length - 1] === assistantEntry) {
            status.textContent = 'Task is still queued. Open the task if you need deeper detail.';
          }
        });
      } else {
        status.textContent = '';
      }
    } catch (error) {
      const message = `I could not finish that: ${error.message}`;
      history.push({ role: 'assistant', content: message });
      persistHistory();
      renderResponse({ message });
      status.textContent = 'Operator needs another try.';
    } finally {
      turnInFlight = false;
      setBusy(false);
      if (shouldRestoreComposerFocus && document.visibilityState === 'visible') {
        focusComposerWithoutScroll();
      }
      const next = pendingPrompts.shift();
      if (next !== undefined) {
        renderQueue();
        void runTurn(next);
      }
    }
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;
    input.value = '';

    if (turnInFlight) {
      pendingPrompts.push(prompt);
      renderQueue();
      status.textContent = pendingPrompts.length === 1
        ? 'Queued. Operator will take it next.'
        : `Queued. ${pendingPrompts.length} messages waiting.`;
      return;
    }

    void runTurn(prompt);
  });
}

// Account status, score sync, and the app launchers start after the
// composer above is wired: their Gun/Score startup work can hold the main
// thread, and it must not sit between the user and a working chat box
// (an unwired form would swallow Enter as a page reload, and every
// millisecond of startup jank delays the first click into the input).
installAccountStatus();
installOsLauncher();
installLabsLauncher();