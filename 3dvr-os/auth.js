(() => {
  'use strict';

  const PEERS = [
    'wss://gun-relay-3dvr.fly.dev/gun',
    'https://gun-relay-3dvr.fly.dev/gun'
  ];
  const FS_KEY = 'daedalos.fs.v1';
  const LOCAL_UPDATED_KEY = 'daedalos.fs.local-updated.v1';
  const DEVICE_KEY = 'daedalos.device.v1';
  const COOKIE_NAME = 'portalIdentity';
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
  const CLOUD_PATH = 'filesystem-v1';

  let gun = null;
  let user = null;
  let cloudNode = null;
  let authenticated = false;
  let syncReady = false;
  let relayConnected = false;
  let username = '';
  let alias = '';
  let syncTimer = null;
  let pendingFs = null;
  let remoteListener = null;

  const originalSetItem = Storage.prototype.setItem;
  const deviceId = (() => {
    try {
      const existing = localStorage.getItem(DEVICE_KEY);
      if (existing) return existing;
      const created = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      originalSetItem.call(localStorage, DEVICE_KEY, created);
      return created;
    } catch {
      return `device-${Math.random().toString(16).slice(2)}`;
    }
  })();

  function clean(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function usernameFromAlias(value = '') {
    const normalized = clean(value);
    if (!normalized) return '';
    return normalized.endsWith('@3dvr') ? normalized.slice(0, -5) : normalized.split('@')[0];
  }

  function normalizeAlias(value = '') {
    const normalized = clean(value).toLowerCase();
    if (!normalized) return '';
    return normalized.includes('@') ? normalized : `${normalized}@3dvr`;
  }

  function readSharedIdentity() {
    try {
      for (const entry of document.cookie.split(';')) {
        const [rawKey, ...rest] = entry.split('=');
        if (rawKey.trim() !== COOKIE_NAME) continue;
        const parsed = JSON.parse(decodeURIComponent(rest.join('=')));
        return parsed && typeof parsed === 'object' ? parsed : null;
      }
    } catch {}
    return null;
  }

  function writeSharedIdentity(nextAlias, nextUsername) {
    const payload = encodeURIComponent(JSON.stringify({
      alias: nextAlias,
      username: nextUsername,
      signedIn: true,
      updatedAt: Date.now(),
      authMethod: 'gun',
      authProvider: 'gun'
    }));
    document.cookie = `${COOKIE_NAME}=${payload}; Path=/; Domain=.3dvr.tech; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; Secure`;
  }

  function clearSharedIdentity() {
    document.cookie = `${COOKIE_NAME}=; Path=/; Domain=.3dvr.tech; Max-Age=0; SameSite=Lax; Secure`;
    document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
  }

  function nowLocalUpdated() {
    const value = Number(localStorage.getItem(LOCAL_UPDATED_KEY) || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function markLocalUpdated(timestamp = Date.now()) {
    try {
      originalSetItem.call(localStorage, LOCAL_UPDATED_KEY, String(timestamp));
    } catch {}
    return timestamp;
  }

  function readLocalFs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FS_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function dispatchFilesystem(fs, updatedAt) {
    window.dispatchEvent(new CustomEvent('daedalos:filesystem', {
      detail: { fs, updatedAt, source: 'gun' }
    }));
  }

  function injectUi() {
    if (document.getElementById('daedalos-auth-dialog')) return;

    const style = document.createElement('style');
    style.textContent = `
      .account-btn{border:1px solid #30363c;background:#171a1d;color:#dce5e9;border-radius:999px;padding:6px 10px;font-size:12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .account-btn:hover,.account-btn:focus-visible{border-color:#80d6a2;outline:none}
      .account-btn[data-signed-in="true"]{color:#bff0d0;border-color:#3d7050}
      .gun-auth-dialog{width:min(420px,calc(100vw - 24px));border:1px solid #3a4249;border-radius:16px;padding:0;background:#15191c;color:#f2f4f5;box-shadow:0 24px 80px rgba(0,0,0,.6)}
      .gun-auth-dialog::backdrop{background:rgba(0,0,0,.6);backdrop-filter:blur(5px)}
      .gun-auth{padding:20px;display:grid;gap:15px}.gun-auth h2{margin:0;font-size:22px}.gun-auth p{margin:0;color:#9aa3aa;font-size:13px;line-height:1.5}
      .gun-auth label{display:grid;gap:6px;font-size:12px;color:#c6cdd2}.gun-auth input{width:100%;border:1px solid #30363c;border-radius:9px;background:#0d1012;padding:10px 11px;outline:none}.gun-auth input:focus{border-color:#80d6a2}
      .gun-auth-actions{display:flex;gap:8px;justify-content:flex-end}.gun-auth-actions button{border:1px solid #30363c;border-radius:9px;background:#20252a;padding:9px 12px}.gun-auth-actions .primary{background:#244c34;border-color:#3d7050;color:#dff7e7;font-weight:700}
      .gun-auth-status{min-height:18px;color:#9aa3aa;font-size:12px}.gun-auth-status.error{color:#ffb5b5}.gun-auth-status.success{color:#bff0d0}
      .gun-auth-account{display:none;gap:12px}.gun-auth-account.open{display:grid}.gun-auth-login[hidden]{display:none}.gun-sync-state{display:flex;align-items:center;gap:7px;font-size:12px;color:#9aa3aa}.gun-sync-dot{width:8px;height:8px;border-radius:50%;background:#59626a}.gun-sync-dot.online{background:#80d6a2;box-shadow:0 0 10px rgba(128,214,162,.45)}
      @media(max-width:680px){.account-btn{padding:6px 8px;max-width:105px}.gun-auth-dialog{width:calc(100vw - 16px)}}
    `;
    document.head.appendChild(style);

    const topbar = document.querySelector('.topbar');
    const clock = document.getElementById('clock');
    if (topbar && !document.getElementById('account-button')) {
      const button = document.createElement('button');
      button.id = 'account-button';
      button.className = 'account-btn';
      button.type = 'button';
      button.textContent = 'Sign in';
      topbar.insertBefore(button, clock || null);
      button.addEventListener('click', openLogin);
    }

    const dialog = document.createElement('dialog');
    dialog.id = 'daedalos-auth-dialog';
    dialog.className = 'gun-auth-dialog';
    dialog.innerHTML = `
      <div class="gun-auth">
        <div>
          <h2>3DVR identity</h2>
          <p>Sign in with your existing 3DVR username. New usernames are created automatically. Files sync encrypted through the 3DVR GUN relay.</p>
        </div>
        <form id="gun-auth-form" class="gun-auth-login">
          <label>Username<input id="gun-auth-user" autocomplete="username" required></label>
          <label>Password<input id="gun-auth-pass" type="password" autocomplete="current-password" required></label>
          <div id="gun-auth-status" class="gun-auth-status" role="status" aria-live="polite"></div>
          <div class="gun-auth-actions"><button type="button" data-auth-close>Cancel</button><button class="primary" type="submit">Sign in / create</button></div>
        </form>
        <div id="gun-auth-account" class="gun-auth-account">
          <div class="gun-sync-state"><span id="gun-sync-dot" class="gun-sync-dot"></span><span id="gun-sync-copy">Local only</span></div>
          <p id="gun-account-copy"></p>
          <div class="gun-auth-actions"><button type="button" data-auth-close>Close</button><button id="gun-sync-now" type="button">Sync now</button><button id="gun-logout" type="button">Sign out</button></div>
        </div>
      </div>`;
    document.body.appendChild(dialog);

    dialog.querySelectorAll('[data-auth-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    document.getElementById('gun-auth-form').addEventListener('submit', event => {
      event.preventDefault();
      signInOrCreate();
    });
    document.getElementById('gun-logout').addEventListener('click', signOut);
    document.getElementById('gun-sync-now').addEventListener('click', () => {
      queueFilesystemSync(readLocalFs(), { immediate: true, force: true });
    });

    const shared = readSharedIdentity();
    if (shared?.alias) {
      const field = document.getElementById('gun-auth-user');
      if (field) field.value = usernameFromAlias(shared.alias);
    }
    renderIdentity();
  }

  function setAuthStatus(message = '', tone = '') {
    const node = document.getElementById('gun-auth-status');
    if (!node) return;
    node.textContent = message;
    node.className = `gun-auth-status${tone ? ` ${tone}` : ''}`;
  }

  function renderIdentity() {
    const button = document.getElementById('account-button');
    if (button) {
      button.textContent = authenticated ? username || 'Account' : 'Sign in';
      button.dataset.signedIn = String(authenticated);
      button.title = authenticated ? `${alias} · encrypted sync` : 'Sign in to sync this desktop';
    }

    const login = document.getElementById('gun-auth-form');
    const account = document.getElementById('gun-auth-account');
    if (login) login.hidden = authenticated;
    if (account) account.classList.toggle('open', authenticated);
    const accountCopy = document.getElementById('gun-account-copy');
    if (accountCopy && authenticated) accountCopy.textContent = `${alias} · session remembered in this browser tab.`;
    renderSyncState();
  }

  function renderSyncState(copy = '') {
    const dot = document.getElementById('gun-sync-dot');
    const label = document.getElementById('gun-sync-copy');
    if (dot) dot.classList.toggle('online', relayConnected && authenticated);
    if (label) {
      label.textContent = copy || (authenticated
        ? relayConnected ? syncReady ? 'Encrypted sync ready' : 'Connecting workspace…' : 'Offline · changes stay local'
        : relayConnected ? 'Relay online · sign in to sync' : 'Local only');
    }
  }

  function openLogin() {
    injectUi();
    renderIdentity();
    const dialog = document.getElementById('daedalos-auth-dialog');
    if (dialog && !dialog.open) dialog.showModal();
    if (!authenticated) setTimeout(() => document.getElementById('gun-auth-pass')?.focus(), 0);
  }

  function authWith(aliasValue, password) {
    return new Promise(resolve => {
      user.auth(aliasValue, password, ack => resolve(ack || {}));
    });
  }

  function createUser(aliasValue, password) {
    return new Promise(resolve => {
      user.create(aliasValue, password, ack => resolve(ack || {}));
    });
  }

  async function signInOrCreate() {
    if (!user) {
      setAuthStatus('GUN is unavailable in this browser.', 'error');
      return;
    }
    const usernameInput = clean(document.getElementById('gun-auth-user')?.value);
    const password = document.getElementById('gun-auth-pass')?.value || '';
    const nextAlias = normalizeAlias(usernameInput);
    if (!nextAlias || password.length < 8) {
      setAuthStatus('Enter a username and a password of at least 8 characters.', 'error');
      return;
    }

    setAuthStatus('Signing in…');
    let ack = await authWith(nextAlias, password);
    if (!ack.err) return;

    setAuthStatus('Account not unlocked; checking whether it needs to be created…');
    const created = await createUser(nextAlias, password);
    if (created.err) {
      if (/already|created|exist/i.test(String(created.err))) {
        setAuthStatus('That account exists, but the password did not match.', 'error');
      } else {
        setAuthStatus(String(created.err), 'error');
      }
      return;
    }

    ack = await authWith(nextAlias, password);
    if (ack.err) {
      setAuthStatus(`Account created, but sign-in failed: ${ack.err}`, 'error');
      return;
    }
  }

  async function onAuthenticated() {
    const userAlias = clean(user?.is?.alias) || clean(user?.is?.pub);
    if (!userAlias || !user?.is?.pub) return;

    authenticated = true;
    alias = userAlias;
    const shared = readSharedIdentity();
    username = clean(shared?.username) || usernameFromAlias(alias) || 'User';
    writeSharedIdentity(alias, username);
    setAuthStatus('Signed in. Loading encrypted workspace…', 'success');
    renderIdentity();

    cloudNode = user.get('3dvr-os').get(CLOUD_PATH);
    syncReady = false;
    renderSyncState();

    let initialResolved = false;
    const finishInitial = async snapshot => {
      if (initialResolved) return;
      initialResolved = true;
      await reconcileInitialSnapshot(snapshot);
      syncReady = true;
      renderSyncState();
      if (pendingFs) queueFilesystemSync(pendingFs, { immediate: true });
    };

    try {
      cloudNode.once(snapshot => finishInitial(snapshot));
      setTimeout(() => finishInitial(undefined), 3500);
      remoteListener = cloudNode.on(snapshot => {
        if (!syncReady) return;
        applyRemoteSnapshot(snapshot).catch(error => console.warn('Remote workspace update could not be applied', error));
      });
    } catch (error) {
      console.warn('Unable to subscribe to encrypted workspace', error);
      await finishInitial(undefined);
    }
  }

  async function reconcileInitialSnapshot(snapshot) {
    const remoteUpdated = Number(snapshot?.updatedAt || 0);
    const localUpdated = nowLocalUpdated();
    const localFs = readLocalFs();

    if (snapshot?.cipher && remoteUpdated >= localUpdated) {
      const applied = await applyRemoteSnapshot(snapshot, { force: true });
      if (applied) return;
    }

    pendingFs = localFs;
    if (Object.keys(localFs).length) {
      await pushFilesystem(localFs);
    }
  }

  async function applyRemoteSnapshot(snapshot, { force = false } = {}) {
    if (!authenticated || !snapshot?.cipher || !window.SEA) return false;
    const remoteUpdated = Number(snapshot.updatedAt || 0);
    if (!force && remoteUpdated <= nowLocalUpdated()) return false;

    const pair = user?.pair?.();
    if (!pair?.epriv) return false;
    const payload = await SEA.decrypt(snapshot.cipher, pair);
    const remoteFs = payload?.files;
    if (!remoteFs || typeof remoteFs !== 'object' || Array.isArray(remoteFs)) return false;

    markLocalUpdated(remoteUpdated || Date.now());
    try {
      originalSetItem.call(localStorage, FS_KEY, JSON.stringify(remoteFs));
    } catch {}
    dispatchFilesystem(remoteFs, remoteUpdated);
    renderSyncState(snapshot.deviceId === deviceId ? 'Encrypted sync saved' : 'Workspace synced from GUN');
    return true;
  }

  async function pushFilesystem(nextFs) {
    if (!authenticated || !cloudNode || !window.SEA) return false;
    const pair = user?.pair?.();
    if (!pair?.epriv) return false;

    const updatedAt = Date.now();
    const cipher = await SEA.encrypt({ version: 1, files: nextFs }, pair);
    if (!cipher) return false;

    return new Promise(resolve => {
      cloudNode.put({
        cipher,
        updatedAt,
        deviceId,
        version: 1
      }, ack => {
        if (ack?.err) {
          renderSyncState('Offline · changes queued locally');
          resolve(false);
          return;
        }
        markLocalUpdated(updatedAt);
        pendingFs = null;
        renderSyncState('Encrypted sync saved');
        resolve(true);
      });
    });
  }

  function queueFilesystemSync(nextFs, { immediate = false, force = false } = {}) {
    if (!nextFs || typeof nextFs !== 'object' || Array.isArray(nextFs)) return;
    pendingFs = JSON.parse(JSON.stringify(nextFs));
    markLocalUpdated(Date.now());
    if (!authenticated || !syncReady) return;
    clearTimeout(syncTimer);
    const run = () => pushFilesystem(pendingFs).catch(error => console.warn('Encrypted workspace sync failed', error));
    if (immediate || force) run();
    else syncTimer = setTimeout(run, 650);
  }

  function signOut() {
    try {
      if (remoteListener?.off) remoteListener.off();
      user?.leave?.();
    } catch {}
    clearTimeout(syncTimer);
    authenticated = false;
    syncReady = false;
    cloudNode = null;
    username = '';
    alias = '';
    pendingFs = null;
    clearSharedIdentity();
    renderIdentity();
    document.getElementById('gun-auth-pass').value = '';
    setAuthStatus('Signed out. Local files stay on this device.', 'success');
  }

  function installStorageBridge() {
    if (Storage.prototype.setItem.__daedalosGunBridge) return;
    const bridged = function setItem(key, value) {
      originalSetItem.call(this, key, value);
      if (this === localStorage && key === FS_KEY) {
        try {
          const parsed = JSON.parse(value);
          queueFilesystemSync(parsed);
        } catch {}
      }
    };
    bridged.__daedalosGunBridge = true;
    Storage.prototype.setItem = bridged;
  }

  function initGun() {
    if (typeof window.Gun !== 'function' || !window.SEA) {
      console.warn('GUN/SEA unavailable; Daedalos will stay local-only.');
      injectUi();
      renderSyncState('Local only · GUN unavailable');
      return;
    }

    gun = Gun({ peers: PEERS });
    user = gun.user();
    gun.on('hi', () => {
      relayConnected = true;
      renderSyncState();
    });
    gun.on('bye', () => {
      relayConnected = false;
      renderSyncState();
    });
    gun.on('auth', () => {
      onAuthenticated().catch(error => {
        console.error('Daedalos auth initialization failed', error);
        setAuthStatus('Signed in, but workspace sync could not start.', 'error');
      });
    });

    // This tells GUN to remember the SEA pair in sessionStorage after auth and
    // automatically restore it on reload. It deliberately does not persist the
    // raw password in localStorage.
    user.recall({ sessionStorage: true });
  }

  window.DaedalosIdentity = {
    get authenticated() { return authenticated; },
    get username() { return username; },
    get alias() { return alias; },
    get relayConnected() { return relayConnected; },
    openLogin,
    signOut,
    queueFilesystemSync,
    syncNow() { queueFilesystemSync(readLocalFs(), { immediate: true, force: true }); },
    readSharedIdentity
  };

  installStorageBridge();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUi, { once: true });
  } else {
    injectUi();
  }
  initGun();
})();
