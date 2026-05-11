const MAX_LENGTH = 12000;
const CLIPBOARD_NODE = 'portalClipboard';
const ENCRYPTION_CONTEXT = '3dvr-portal-clipboard-v1';

const state = {
  gun: null,
  user: null,
  alias: '',
  username: '',
  password: '',
  secret: '',
  entries: new Map(),
  root: null,
};

const els = {
  authGate: document.querySelector('[data-auth-gate]'),
  workspace: document.querySelector('[data-clipboard-workspace]'),
  sessionLabel: document.querySelector('[data-session-label]'),
  authLink: document.querySelector('[data-auth-link]'),
  form: document.querySelector('[data-entry-form]'),
  text: document.querySelector('[data-entry-text]'),
  count: document.querySelector('[data-entry-count]'),
  readClipboard: document.querySelector('[data-read-clipboard]'),
  refresh: document.querySelector('[data-refresh]'),
  status: document.querySelector('[data-status]'),
  list: document.querySelector('[data-entries-list]'),
  template: document.getElementById('clipboard-entry-template'),
};

function createLocalGunNodeStub() {
  const node = {
    __isGunStub: true,
    get() {
      return createLocalGunNodeStub();
    },
    put(_value, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
      }
      return node;
    },
    once(callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback(undefined), 0);
      }
      return node;
    },
    on() {
      return { off() {} };
    },
    map() {
      return {
        on() {
          return { off() {} };
        }
      };
    }
  };
  return node;
}

function createGunContext() {
  if (typeof Gun !== 'function') {
    return {
      gun: createLocalGunNodeStub(),
      user: createLocalGunNodeStub(),
      isStub: true
    };
  }

  const gun = Gun({
    peers: window.__GUN_PEERS__ || [
      'wss://relay.3dvr.tech/gun',
      'wss://gun-relay-3dvr.fly.dev/gun'
    ],
    axe: true
  });

  return {
    gun,
    user: typeof gun.user === 'function' ? gun.user() : createLocalGunNodeStub(),
    isStub: false
  };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getSession() {
  try {
    if (window.AuthIdentity && typeof window.AuthIdentity.syncStorageFromSharedIdentity === 'function') {
      window.AuthIdentity.syncStorageFromSharedIdentity(localStorage);
    }
  } catch (err) {
    console.warn('Unable to sync shared identity for clipboard', err);
  }

  const signedIn = localStorage.getItem('signedIn') === 'true';
  const alias = normalizeText(localStorage.getItem('alias'));
  const username = normalizeText(localStorage.getItem('username'));
  const password = normalizeText(localStorage.getItem('password'));

  return {
    signedIn: Boolean(signedIn && alias && password),
    alias,
    username,
    password
  };
}

function signInUrl() {
  return `/sign-in.html?redirect=${encodeURIComponent('/clipboard/')}`;
}

function setStatus(message) {
  if (els.status) {
    els.status.textContent = message;
  }
}

function showAuthGate(reason = 'Sign in required') {
  if (els.sessionLabel) {
    els.sessionLabel.textContent = reason;
  }
  if (els.authLink) {
    els.authLink.href = signInUrl();
  }
  document.querySelectorAll('[data-auth-link]').forEach(link => {
    link.href = signInUrl();
  });
  if (els.authGate) {
    els.authGate.hidden = false;
  }
  if (els.workspace) {
    els.workspace.hidden = true;
  }
}

function showWorkspace(label) {
  if (els.sessionLabel) {
    els.sessionLabel.textContent = label;
  }
  if (els.authGate) {
    els.authGate.hidden = true;
  }
  if (els.workspace) {
    els.workspace.hidden = false;
  }
}

function authenticateUser() {
  return new Promise((resolve, reject) => {
    if (!state.user || state.user.__isGunStub) {
      reject(new Error('Gun is unavailable'));
      return;
    }

    if (state.user.is) {
      resolve();
      return;
    }

    try {
      state.user.auth(state.alias, state.password, ack => {
        if (ack && ack.err) {
          reject(new Error(ack.err));
          return;
        }
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

function buildSecret() {
  state.secret = `${ENCRYPTION_CONTEXT}\n${state.alias}\n${state.password}`;
}

async function encryptText(value) {
  if (!window.SEA || typeof window.SEA.encrypt !== 'function') {
    throw new Error('SEA encryption is unavailable');
  }
  return window.SEA.encrypt(value, state.secret);
}

async function decryptText(cipher) {
  if (!window.SEA || typeof window.SEA.decrypt !== 'function' || !cipher) {
    return '';
  }
  const value = await window.SEA.decrypt(cipher, state.secret);
  return typeof value === 'string' ? value : '';
}

function entryTitle(text) {
  const firstLine = normalizeText(text.split(/\r?\n/).find(Boolean) || text);
  if (!firstLine) return 'Untitled clipboard item';
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function formatDate(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function sortEntries() {
  return Array.from(state.entries.values())
    .filter(entry => !entry.deleted)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

function renderEntries() {
  const entries = sortEntries();
  els.list.replaceChildren();

  if (!entries.length) {
    setStatus('No saved clipboard items yet.');
    return;
  }

  setStatus(`${entries.length} encrypted item${entries.length === 1 ? '' : 's'} synced to your account.`);

  entries.forEach(entry => {
    const fragment = els.template.content.cloneNode(true);
    const article = fragment.querySelector('.clipboard-entry');
    const title = fragment.querySelector('[data-entry-title]');
    const meta = fragment.querySelector('[data-entry-meta]');
    const preview = fragment.querySelector('[data-entry-preview]');
    const copy = fragment.querySelector('[data-copy-entry]');
    const remove = fragment.querySelector('[data-delete-entry]');

    article.dataset.entryId = entry.id;
    title.textContent = entryTitle(entry.text);
    meta.textContent = `Updated ${formatDate(entry.updatedAt)} from ${entry.device || 'unknown device'}`;
    preview.textContent = entry.text;

    copy.addEventListener('click', () => copyEntry(entry.id));
    remove.addEventListener('click', () => deleteEntry(entry.id));
    els.list.appendChild(fragment);
  });
}

function updateCount() {
  const length = els.text.value.length;
  els.count.textContent = `${length} / ${MAX_LENGTH}`;
}

function entryNode(id) {
  return state.root.get(id);
}

function currentDeviceLabel() {
  const platform = navigator.userAgentData && navigator.userAgentData.platform
    ? navigator.userAgentData.platform
    : navigator.platform;
  return normalizeText(platform) || 'browser';
}

async function saveEntry(event) {
  event.preventDefault();
  const text = els.text.value.trim();
  if (!text) {
    setStatus('Paste something before saving.');
    return;
  }
  if (text.length > MAX_LENGTH) {
    setStatus(`Clipboard item is too long. Keep it under ${MAX_LENGTH} characters.`);
    return;
  }

  setStatus('Encrypting clipboard item...');
  try {
    const now = Date.now();
    const id = `${now}-${Math.random().toString(36).slice(2, 10)}`;
    const cipher = await encryptText(text);
    const record = {
      id,
      cipher,
      owner: state.alias,
      device: currentDeviceLabel(),
      createdAt: now,
      updatedAt: now,
      deleted: false
    };

    entryNode(id).put(record, ack => {
      if (ack && ack.err) {
        setStatus(`Save failed: ${ack.err}`);
        return;
      }
      els.text.value = '';
      updateCount();
      setStatus('Encrypted clipboard item saved.');
    });
  } catch (err) {
    console.error('Clipboard save failed', err);
    setStatus(`Save failed: ${err.message || err}`);
  }
}

async function copyEntry(id) {
  const entry = state.entries.get(id);
  if (!entry) return;

  try {
    await navigator.clipboard.writeText(entry.text);
    setStatus('Copied to this device clipboard.');
  } catch (err) {
    console.warn('Clipboard copy failed', err);
    setStatus('Copy failed. Select the text and copy it manually.');
  }
}

function deleteEntry(id) {
  const entry = state.entries.get(id);
  if (!entry) return;

  entryNode(id).put({
    id,
    owner: state.alias,
    deleted: true,
    cipher: null,
    updatedAt: Date.now()
  }, ack => {
    if (ack && ack.err) {
      setStatus(`Delete failed: ${ack.err}`);
    } else {
      state.entries.delete(id);
      renderEntries();
      setStatus('Clipboard item deleted.');
    }
  });
}

async function readDeviceClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    els.text.value = text.slice(0, MAX_LENGTH);
    updateCount();
    setStatus(text.length > MAX_LENGTH ? 'Pasted the first 12000 characters.' : 'Pasted from this device clipboard.');
  } catch (err) {
    console.warn('Clipboard read failed', err);
    setStatus('Browser blocked clipboard read. Paste into the text area directly.');
  }
}

async function handleRemoteRecord(record, id) {
  if (!record || typeof record !== 'object') {
    return;
  }

  const entryId = record.id || id;
  if (!entryId) return;

  if (record.deleted) {
    state.entries.delete(entryId);
    renderEntries();
    return;
  }

  if (record.owner && record.owner !== state.alias) {
    return;
  }

  const text = await decryptText(record.cipher);
  if (!text) {
    return;
  }

  state.entries.set(entryId, {
    id: entryId,
    text,
    device: record.device,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deleted: false
  });
  renderEntries();
}

function subscribeEntries() {
  state.root.map().on((record, id) => {
    handleRemoteRecord(record, id).catch(err => {
      console.warn('Failed to decrypt clipboard record', err);
      setStatus('One clipboard item could not be decrypted on this device.');
    });
  });
}

async function boot() {
  const session = getSession();
  if (!session.signedIn) {
    showAuthGate('Signed out');
    return;
  }

  state.alias = session.alias;
  state.username = session.username || session.alias.split('@')[0];
  state.password = session.password;
  buildSecret();

  const context = createGunContext();
  state.gun = context.gun;
  state.user = context.user;

  if (context.isStub) {
    showAuthGate('Sync unavailable');
    return;
  }

  try {
    await authenticateUser();
  } catch (err) {
    console.warn('Clipboard authentication failed', err);
    showAuthGate('Sign in again');
    return;
  }

  state.root = state.user.get(CLIPBOARD_NODE);
  showWorkspace(`Signed in as ${state.username}`);
  setStatus('Loading encrypted clipboard entries...');
  subscribeEntries();
}

els.form.addEventListener('submit', saveEntry);
els.text.addEventListener('input', updateCount);
els.readClipboard.addEventListener('click', readDeviceClipboard);
els.refresh.addEventListener('click', () => {
  renderEntries();
  setStatus('Clipboard view refreshed.');
});

updateCount();
boot();
