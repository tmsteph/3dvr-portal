(function(global) {
  const GUN_OFFLINE_ERROR = { err: 'gun-unavailable' };

  function createGunSubscriptionStub() {
    return {
      off() {}
    };
  }

  function createGunNodeStub() {
    const node = {
      __isGunStub: true,
      get() {
        return createGunNodeStub();
      },
      put(_value, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(GUN_OFFLINE_ERROR), 0);
        }
        return node;
      },
      once(callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(undefined), 0);
        }
        return node;
      },
      on(_listener) {
        return createGunSubscriptionStub();
      },
      off() {},
      map() {
        return {
          __isGunStub: true,
          on() {
            return createGunSubscriptionStub();
          }
        };
      },
      set() {
        return node;
      }
    };
    return node;
  }

  function createGunUserStub() {
    const node = createGunNodeStub();
    return {
      ...node,
      is: null,
      _: {},
      recall() {},
      auth(_alias, _password, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(GUN_OFFLINE_ERROR), 0);
        }
      },
      leave() {},
      create(_alias, _password, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(GUN_OFFLINE_ERROR), 0);
        }
      }
    };
  }

  function createGunStub() {
    return {
      __isGunStub: true,
      user() {
        return createGunUserStub();
      },
      get() {
        return createGunNodeStub();
      }
    };
  }

  function ensureGun(factory, { label = 'gun' } = {}) {
    if (typeof factory === 'function') {
      try {
        const instance = factory();
        if (instance) {
          const resolvedUser = typeof instance.user === 'function'
            ? instance.user()
            : createGunUserStub();
          return {
            gun: instance,
            user: resolvedUser,
            isStub: !!instance.__isGunStub
          };
        }
      } catch (err) {
        console.warn(`Failed to initialize ${label} Gun instance`, err);
      }
    }
    console.warn(`Gun.js is unavailable for ${label}; running in offline mode.`);
    const stub = createGunStub();
    return {
      gun: stub,
      user: stub.user(),
      isStub: true
    };
  }

  const SCORE_CACHE_PREFIX = '3dvr:score:';
  const GUEST_ROOT = '3dvr-guests';
  const PORTAL_ROOT_KEY = '3dvr-portal';
  const PENDING_SUFFIX = ':pending';
  const PORTAL_PENDING_SUFFIX = ':portalPending';
  const PORTAL_PUB_STATS_KEY = 'userStatsByPub';
  const USER_PUB_STORAGE_KEY = 'userPubKey';

  function sanitizeScore(value) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.round(numeric));
  }

  function recallUserSession(targetUser, { useLocal = true, useSession = true } = {}) {
    const user = targetUser;
    if (!user || typeof user.recall !== 'function') {
      return false;
    }

    const recallOptions = {};
    if (useSession) recallOptions.sessionStorage = true;
    if (useLocal) recallOptions.localStorage = true;

    if (!Object.keys(recallOptions).length) {
      return false;
    }

    try {
      user.recall(recallOptions);
      return true;
    } catch (err) {
      console.warn('Failed to recall user session with combined storage', err);
    }

    if (useLocal && useSession) {
      try {
        user.recall({ localStorage: true });
        return true;
      } catch (fallbackErr) {
        console.warn('Fallback recall from localStorage failed', fallbackErr);
      }
    }

    return false;
  }

  function aliasToCacheKey(alias) {
    const normalized = typeof alias === 'string' ? alias.trim() : '';
    if (!normalized) return 'user';
    return `user:${normalized.toLowerCase()}`;
  }

  function readStoredPubKey() {
    try {
      return localStorage.getItem(USER_PUB_STORAGE_KEY) || '';
    } catch (err) {
      console.warn('Failed to read stored pub key', err);
      return '';
    }
  }

  function writeStoredPubKey(pub) {
    try {
      if (pub) {
        localStorage.setItem(USER_PUB_STORAGE_KEY, pub);
      } else {
        localStorage.removeItem(USER_PUB_STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Failed to persist pub key', err);
    }
  }

  function generateGuestId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `guest_${crypto.randomUUID()}`;
      }
    } catch (err) {
      console.warn('Failed to use crypto.randomUUID for guest id', err);
    }
    return `guest_${Math.random().toString(36).substr(2, 9)}`;
  }

  function ensureGuestIdentity() {
    try {
      const legacyId = localStorage.getItem('userId');
      if (legacyId && !localStorage.getItem('guestId')) {
        localStorage.setItem('guestId', legacyId);
      }
      if (legacyId) {
        localStorage.removeItem('userId');
      }
      let guestId = localStorage.getItem('guestUid') || localStorage.getItem('guestId');
      if (!guestId) {
        guestId = generateGuestId();
        localStorage.setItem('guestId', guestId);
      }
      localStorage.setItem('guestUid', guestId);
      if (!localStorage.getItem('guestCreatedAt')) {
        localStorage.setItem('guestCreatedAt', `${Date.now()}`);
      }
      if (!localStorage.getItem('guestDisplayName')) {
        localStorage.setItem('guestDisplayName', 'Guest');
      }
      localStorage.setItem('guest', 'true');
      return guestId;
    } catch (err) {
      console.warn('Failed to ensure guest identity', err);
      return '';
    }
  }

  function computeAuthState() {
    const signedIn = localStorage.getItem('signedIn') === 'true';
    const alias = (localStorage.getItem('alias') || '').trim();
    const username = (localStorage.getItem('username') || '').trim();

    if (signedIn) {
      return {
        mode: 'user',
        alias,
        username
      };
    }

    const isGuest = localStorage.getItem('guest') === 'true';
    if (isGuest) {
      const guestId = ensureGuestIdentity();
      const guestDisplayName = (localStorage.getItem('guestDisplayName') || '').trim();
      return {
        mode: 'guest',
        guestId,
        guestDisplayName
      };
    }

    return {
      mode: 'anon'
    };
  }

  function snapshotGuestIdentity() {
    const guestId = ensureGuestIdentity();
    const displayName = (localStorage.getItem('guestDisplayName') || '').trim() || 'Guest';
    const createdAt = Number(localStorage.getItem('guestCreatedAt')) || Date.now();
    return { guestId, displayName, createdAt };
  }

  function resolvePortalRoot(deps = {}) {
    if (deps.portalRoot) return deps.portalRoot;
    if (deps.gun && typeof deps.gun.get === 'function') {
      return deps.gun.get(PORTAL_ROOT_KEY);
    }
    if (typeof window !== 'undefined' && window.gun && typeof window.gun.get === 'function') {
      return window.gun.get(PORTAL_ROOT_KEY);
    }
    return null;
  }

  function syncGuestProfile(identity, deps = {}) {
    const portalRoot = resolvePortalRoot(deps);
    const snapshot = identity && identity.guestId ? identity : snapshotGuestIdentity();
    if (!portalRoot || !snapshot.guestId) return snapshot;
    try {
      portalRoot.get('guestProfiles').get(snapshot.guestId).put({
        guestId: snapshot.guestId,
        uid: snapshot.guestId,
        displayName: snapshot.displayName || 'Guest',
        createdAt: snapshot.createdAt || Date.now(),
        lastSeen: Date.now(),
      });
    } catch (err) {
      console.warn('Failed to sync guest profile to portal root', err);
    }
    return snapshot;
  }

  function linkGuestToAlias(alias, deps = {}) {
    const normalizedAlias = typeof alias === 'string' ? alias.trim() : '';
    if (!normalizedAlias) return false;
    const portalRoot = resolvePortalRoot(deps);
    if (!portalRoot) return false;
    const snapshot = snapshotGuestIdentity();
    try {
      portalRoot.get('guestAliasIndex').get(normalizedAlias).put({
        guestId: snapshot.guestId,
        alias: normalizedAlias,
        linkedAt: Date.now(),
        lastSeen: Date.now(),
      });
      portalRoot.get('guestProfiles').get(snapshot.guestId).put({
        guestId: snapshot.guestId,
        uid: snapshot.guestId,
        displayName: snapshot.displayName || 'Guest',
        createdAt: snapshot.createdAt,
        linkedAlias: normalizedAlias,
        lastSeen: Date.now(),
      });
      return true;
    } catch (err) {
      console.warn('Failed to link guest to alias from ScoreSystem', err);
      return false;
    }
  }

  function lookupGuestIdForAlias(alias, deps = {}) {
    const normalizedAlias = typeof alias === 'string' ? alias.trim() : '';
    const portalRoot = resolvePortalRoot(deps);
    return new Promise(resolve => {
      if (!normalizedAlias || !portalRoot) {
        resolve('');
        return;
      }
      try {
        portalRoot.get('guestAliasIndex').get(normalizedAlias).once(data => {
          const guestId = data && typeof data.guestId === 'string' ? data.guestId.trim() : '';
          resolve(guestId);
        });
      } catch (err) {
        console.warn('Failed to look up guest id for alias', err);
        resolve('');
      }
    });
  }

  function createGhostAccount({ alias = '', displayName = 'Guest', createdAt = Date.now() } = {}, deps = {}) {
    const guestId = generateGuestId();
    const portalRoot = resolvePortalRoot(deps);
    const normalizedAlias = typeof alias === 'string' ? alias.trim() : '';
    if (portalRoot) {
      try {
        portalRoot.get('guestProfiles').get(guestId).put({
          guestId,
          uid: guestId,
          displayName: displayName.trim() || 'Guest',
          createdAt,
          lastSeen: Date.now(),
          ghost: true,
        });
        if (normalizedAlias) {
          portalRoot.get('guestAliasIndex').get(normalizedAlias).put({
            guestId,
            alias: normalizedAlias,
            linkedAt: Date.now(),
            lastSeen: Date.now(),
            ghost: true,
          });
        }
      } catch (err) {
        console.warn('Unable to create ghost account', err);
      }
    }
    return guestId;
  }

  function cacheKeyForState(state) {
    if (!state || state.mode === 'anon') {
      return `${SCORE_CACHE_PREFIX}anon`;
    }

    if (state.mode === 'user') {
      return `${SCORE_CACHE_PREFIX}${aliasToCacheKey(state.alias)}`;
    }

    if (state.mode === 'guest') {
      const guestId = (state.guestId || '').trim();
      const suffix = guestId ? guestId : 'guest';
      return `${SCORE_CACHE_PREFIX}${suffix}`;
    }

    return `${SCORE_CACHE_PREFIX}anon`;
  }

  function readCachedScore(state) {
    try {
      const key = cacheKeyForState(state);
      const raw = localStorage.getItem(key);
      if (!raw) return 0;
      return sanitizeScore(raw);
    } catch (err) {
      console.warn('Unable to read cached score', err);
      return 0;
    }
  }

  function writeCachedScore(state, score) {
    try {
      const key = cacheKeyForState(state);
      localStorage.setItem(key, String(sanitizeScore(score)));
    } catch (err) {
      console.warn('Unable to store cached score', err);
    }
  }

  function pendingCacheKeyForState(state) {
    return `${cacheKeyForState(state)}${PENDING_SUFFIX}`;
  }

  function readPendingScore(state) {
    try {
      const key = pendingCacheKeyForState(state);
      const raw = localStorage.getItem(key);
      if (!raw) return 0;
      return sanitizeScore(raw);
    } catch (err) {
      console.warn('Unable to read pending score', err);
      return 0;
    }
  }

  function writePendingScore(state, score) {
    try {
      const key = pendingCacheKeyForState(state);
      if (!score) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, String(sanitizeScore(score)));
    } catch (err) {
      console.warn('Unable to write pending score', err);
    }
  }

  function clearPendingScore(state) {
    try {
      localStorage.removeItem(pendingCacheKeyForState(state));
    } catch (err) {
      console.warn('Unable to clear pending score', err);
    }
  }

  function portalPendingKeyForState(state) {
    if (!state || state.mode !== 'user') {
      return null;
    }
    return `${cacheKeyForState(state)}${PORTAL_PENDING_SUFFIX}`;
  }

  function readPortalPending(state) {
    const key = portalPendingKeyForState(state);
    if (!key) {
      return 0;
    }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return 0;
      return sanitizeScore(raw);
    } catch (err) {
      console.warn('Unable to read pending portal score', err);
      return 0;
    }
  }

  function writePortalPending(state, score) {
    const key = portalPendingKeyForState(state);
    if (!key) {
      return;
    }
    try {
      localStorage.setItem(key, String(sanitizeScore(score)));
    } catch (err) {
      console.warn('Unable to store pending portal score', err);
    }
  }

  function clearPortalPending(state) {
    const key = portalPendingKeyForState(state);
    if (!key) {
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('Unable to clear pending portal score', err);
    }
  }

  function displayNameFromAlias(alias) {
    const normalized = typeof alias === 'string' ? alias.trim() : '';
    if (!normalized) return '';
    return normalized.includes('@') ? normalized.split('@')[0] : normalized;
  }

  class ScoreManager {
    constructor({ gun, user, portalRoot } = {}) {
      this.gun = gun || null;
      this.user = user || null;
      this.portalRoot = portalRoot || (this.gun ? this.gun.get(PORTAL_ROOT_KEY) : null);
      this.state = computeAuthState();
      this.node = this.resolveNode();
      this.listeners = new Set();
      this.current = readCachedScore(this.state);
      this.pending = readPendingScore(this.state);
      this.portalPending = this.state.mode === 'user' ? readPortalPending(this.state) : 0;
      this.pubKey = this.state.mode === 'user' ? this._extractPubKey() : '';
      this.ready = false;
      this._readyResolvers = [];
      this._scoreHandler = null;
      this._pointsHandler = null;
      this._authPromise = null;
      this._handleOnline = null;
      this._handleStorage = null;
      this._portalAliasChain = null;
      this._portalPubChain = null;

      if (!Number.isFinite(this.current)) {
        this.current = 0;
      }

      if (!Number.isFinite(this.pending)) {
        this.pending = 0;
      }

      if (!Number.isFinite(this.portalPending)) {
        this.portalPending = 0;
      }

      if (this.pending > this.current) {
        this.current = this.pending;
        writeCachedScore(this.state, this.current);
      }

      if (this.portalPending > this.current) {
        this.current = this.portalPending;
        writeCachedScore(this.state, this.current);
      }

      if (!this.node) {
        this._markReady();
        return;
      }

      this._ensureUserAuth()
        .catch(err => {
          console.warn('Failed to ensure user auth for score manager', err);
          return null;
        })
        .then(() => this._refreshIdentity())
        .catch(err => {
          console.warn('Failed to refresh user identity for score manager', err);
        })
        .finally(() => {
          this.bootstrap();
        });

      if (this.state.mode === 'user') {
        this._linkStoredGuestToAlias();
      }

      this._syncGuestProfile();

      if (typeof window !== 'undefined') {
        this._handleOnline = () => {
          this._flushPendingScore();
          this._flushPortalPending();
        };
        this._handleStorage = event => {
          this._handleStorageEvent(event);
        };
        window.addEventListener('online', this._handleOnline);
        window.addEventListener('storage', this._handleStorage);
      }
    }

    resolveNode() {
      if (!this.gun) return null;
      if (this.state.mode === 'user') {
        return this.user || this.gun.user();
      }
      if (this.state.mode === 'guest') {
        const guestId = this.state.guestId || ensureGuestIdentity();
        if (!guestId) return null;
        return this.gun.get(GUEST_ROOT).get(guestId);
      }
      return null;
    }

    bootstrap() {
      if (this.state.mode === 'user' && this.user) {
        recallUserSession(this.user);
      }

      this._attachRealtime();
      if (this.state.mode === 'user') {
        this._attachPortalRealtime();
      }

      if (this.state.mode === 'guest') {
        this._syncGuestProfile();
      }

      if (this.pending > 0) {
        this._flushPendingScore();
      }

      if (this.portalPending > 0) {
        this._flushPortalPending();
      }

      this.node.get('score').once(value => {
        this._handleRemoteValue(value, 'score');
        this._markReady();
      });

      if (this.state.mode === 'user') {
        this.node.get('points').once(value => {
          this._handleRemoteValue(value, 'points');
        });
      }

      setTimeout(() => this._markReady(), 1200);
    }

    _attachRealtime() {
      try {
        this.node.get('score').on(value => this._handleRemoteValue(value, 'score'));
        if (this.state.mode === 'user') {
          this.node.get('points').on(value => this._handleRemoteValue(value, 'points'));
        }
      } catch (err) {
        console.warn('Failed to subscribe to score updates', err);
      }
    }

    _ensureUserAuth() {
      if (this.state.mode !== 'user' || !this.user) {
        return Promise.resolve();
      }
      if (this.user.is) {
        return Promise.resolve();
      }
      if (this._authPromise) {
        return this._authPromise;
      }

      const alias = (localStorage.getItem('alias') || '').trim();
      const password = localStorage.getItem('password') || '';

      if (!alias || !password) {
        return Promise.resolve();
      }

      this._authPromise = new Promise(resolve => {
        try {
          this.user.auth(alias, password, ack => {
            if (ack && ack.err) {
              console.warn('Auto-auth failed for score manager', ack.err);
            }
            this._authPromise = null;
            resolve();
          });
        } catch (err) {
          console.warn('Unexpected error during score auto-auth', err);
          this._authPromise = null;
          resolve();
        }
      });

      return this._authPromise;
    }

    _handleRemoteValue(value, field) {
      const sanitized = sanitizeScore(value);
      const best = Math.max(this.current, sanitized);
      const previous = this.current;
      const changed = best !== previous;

      if (changed) {
        this._updateCurrent(best, { persist: false });
      }

      if (!this.node) {
        return;
      }

      if (field === 'score' && sanitized !== best) {
        this.node.get('score').put(best);
      }

      if (this.state.mode === 'user' && field === 'points' && sanitized !== best) {
        this.node.get('points').put(best);
      }

      if (field === 'score' || field === 'points') {
        if (sanitized >= this.pending) {
          this._setPending(0);
        } else if (this.pending > 0 && sanitized < this.pending) {
          this._flushPendingScore();
        }
      }

      if (!this.ready && (field === 'score' || field === 'points')) {
        this._markReady();
      }
    }

    _updateCurrent(score, { persist = true } = {}) {
      const normalized = sanitizeScore(score);
      this.current = normalized;
      writeCachedScore(this.state, normalized);

      if (this.state.mode === 'user') {
        this._syncPublicStats();
      }

      for (const listener of this.listeners) {
        try {
          listener(normalized);
        } catch (err) {
          console.error('Score listener failed', err);
        }
      }

      if (persist) {
        this._persistScore(normalized);
      }
    }

    _persistScore(score) {
      if (!this.node) return;
      const normalized = sanitizeScore(score);
      this._setPending(Math.max(this.pending, normalized));
      this._sendScoreToNetwork(normalized);
    }

    _sendScoreToNetwork(score) {
      const normalized = sanitizeScore(score);
      this._putWithAck('score', normalized);
      if (this.state.mode === 'user') {
        this._putWithAck('points', normalized);
        this._setPortalPending(Math.max(this.portalPending, normalized));
        this._putPortalStats(normalized);
      }
    }

    _flushPendingScore() {
      if (!this.node) return;
      if (!this.pending) return;
      this._sendScoreToNetwork(this.pending);
    }

    _setPending(value) {
      const normalized = sanitizeScore(value);
      if (normalized > 0) {
        this.pending = normalized;
        writePendingScore(this.state, normalized);
      } else {
        this.pending = 0;
        clearPendingScore(this.state);
      }
    }

    _setPortalPending(value) {
      if (this.state.mode !== 'user') {
        return;
      }
      const normalized = sanitizeScore(value);
      if (normalized > 0) {
        this.portalPending = normalized;
        writePortalPending(this.state, normalized);
      } else {
        this.portalPending = 0;
        clearPortalPending(this.state);
      }
    }

    _flushPortalPending() {
      if (this.state.mode !== 'user') return;
      if (!this.portalPending) return;
      this._putPortalStats(this.portalPending);
    }

    _putWithAck(field, value) {
      if (!this.node) return;
      try {
        this.node.get(field).put(value, ack => {
          if (ack && ack.err) {
            console.warn(`Failed to persist ${field}`, ack.err);
            return;
          }
          this._handlePersistSuccess(field, value);
        });
      } catch (err) {
        console.warn(`Failed to persist ${field}`, err);
      }
    }

    _handlePersistSuccess(field, value) {
      if (field !== 'score' && field !== 'points') {
        return;
      }
      const normalized = sanitizeScore(value);
      if (normalized >= this.pending) {
        this._setPending(0);
      }
    }

    _handlePortalPersistSuccess(value) {
      const normalized = sanitizeScore(value);
      if (normalized >= this.portalPending) {
        this._setPortalPending(0);
      }
    }

    _putPortalStats(score) {
      if (!this.portalRoot) return;
      if (this.state.mode !== 'user') return;
      const alias = (localStorage.getItem('alias') || '').trim();
      if (!alias) return;
      const username = (localStorage.getItem('username') || '').trim() || displayNameFromAlias(alias);
      const points = sanitizeScore(score);
      const payload = {
        alias,
        username,
        points,
        lastUpdated: Date.now()
      };
      try {
        this.portalRoot.get('userStats').get(alias).put(payload, ack => {
          if (ack && ack.err) {
            console.warn('Failed to sync public stats', ack.err);
            return;
          }
          this._handlePortalPersistSuccess(points);
        });
        const pub = this._getPubKey();
        if (pub) {
          this.portalRoot.get(PORTAL_PUB_STATS_KEY).get(pub).put({ ...payload, pub }, ack => {
            if (ack && ack.err) {
              console.warn('Failed to sync pub stats', ack.err);
              return;
            }
            this._handlePortalPersistSuccess(points);
          });
        }
      } catch (err) {
        console.warn('Failed to sync public stats', err);
      }
    }

    _attachPortalRealtime() {
      if (!this.portalRoot) return;
      if (this.state.mode !== 'user') return;
      this._attachPortalAliasRealtime();
      this._attachPortalPubRealtime();
    }

    _handlePortalValue(value) {
      const sanitized = sanitizeScore(value);
      if (sanitized <= 0) {
        if (sanitized >= this.portalPending) {
          this._setPortalPending(0);
        }
        return;
      }
      const previous = this.current;
      if (sanitized > previous) {
        this._updateCurrent(sanitized, { persist: false });
        this._sendScoreToNetwork(sanitized);
      }
      if (sanitized >= this.portalPending) {
        this._setPortalPending(0);
      }
    }

    _handleStorageEvent(event) {
      if (!event) {
        return;
      }
      const key = event.key;
      const newValue = event.newValue;
      const cacheKey = cacheKeyForState(this.state);
      const pendingKey = pendingCacheKeyForState(this.state);
      const portalPendingKey = portalPendingKeyForState(this.state);

      if (key === cacheKey) {
        const sanitized = sanitizeScore(newValue);
        if (sanitized > this.current) {
          this._updateCurrent(sanitized, { persist: false });
        }
      }

      if (key === pendingKey) {
        const sanitizedPending = sanitizeScore(newValue);
        this.pending = sanitizedPending;
        if (sanitizedPending > this.current) {
          this._updateCurrent(sanitizedPending, { persist: false });
        }
        if (sanitizedPending > 0) {
          this._flushPendingScore();
        }
      }

      if (portalPendingKey && key === portalPendingKey) {
        const sanitizedPortal = sanitizeScore(newValue);
        this.portalPending = sanitizedPortal;
        if (sanitizedPortal > this.current) {
          this._updateCurrent(sanitizedPortal, { persist: false });
        }
        if (sanitizedPortal > 0) {
          this._flushPortalPending();
        }
      }

      if (this.state.mode === 'user') {
        if (key === 'alias') {
          this.state.alias = (newValue || '').trim();
          this._attachPortalRealtime();
        }
        if (key === USER_PUB_STORAGE_KEY) {
          const trimmed = typeof newValue === 'string' ? newValue.trim() : '';
          if (trimmed && trimmed !== this.pubKey) {
            this.pubKey = trimmed;
            this._attachPortalRealtime();
          }
          if (!trimmed && this.pubKey) {
            this.pubKey = '';
            this._attachPortalRealtime();
          }
        }
      }
    }

    _syncPublicStats() {
      if (!this.portalRoot) return;
      this._putPortalStats(this.current);
    }

    _syncGuestProfile() {
      if (!this.portalRoot) return;
      if (this.state.mode !== 'guest') return;
      const guestId = this.state.guestId || ensureGuestIdentity();
      if (!guestId) return;
      const displayName = (localStorage.getItem('guestDisplayName') || '').trim() || 'Guest';
      const createdAt = Number(localStorage.getItem('guestCreatedAt')) || Date.now();
      const profileNode = this.portalRoot.get('guestProfiles').get(guestId);
      try {
        profileNode.put({
          guestId,
          uid: guestId,
          displayName,
          createdAt,
          lastSeen: Date.now(),
        });
      } catch (err) {
        console.warn('Failed to sync guest profile', err);
      }
    }

    _linkStoredGuestToAlias() {
      if (!this.portalRoot) return;
      const alias = (localStorage.getItem('alias') || '').trim();
      const guestId = (localStorage.getItem('guestUid') || localStorage.getItem('guestId') || '').trim();
      if (!alias || !guestId) return;
      const displayName = (localStorage.getItem('guestDisplayName') || '').trim() || 'Guest';
      const createdAt = Number(localStorage.getItem('guestCreatedAt')) || Date.now();
      try {
        const aliasNode = this.portalRoot.get('guestAliasIndex').get(alias);
        aliasNode.put({ guestId, alias, linkedAt: Date.now(), lastSeen: Date.now() });
        const profileNode = this.portalRoot.get('guestProfiles').get(guestId);
        profileNode.put({
          guestId,
          uid: guestId,
          displayName,
          createdAt,
          linkedAlias: alias,
          lastSeen: Date.now(),
        });
      } catch (err) {
        console.warn('Failed to link stored guest identity to alias', err);
      }
    }

    _attachPortalAliasRealtime() {
      if (!this.portalRoot) return;
      const alias = (this.state.alias || '').trim() || (localStorage.getItem('alias') || '').trim();
      if (!alias) {
        this._detachPortalAliasRealtime();
        return;
      }
      try {
        const chain = this.portalRoot.get('userStats').get(alias);
        if (this._portalAliasChain && this._portalAliasChain !== chain) {
          try {
            this._portalAliasChain.off();
          } catch (err) {
            console.warn('Failed to detach previous alias listener', err);
          }
        }
        this._portalAliasChain = chain;
        chain.once(data => {
          if (data && typeof data.points !== 'undefined') {
            this._handlePortalValue(data.points);
            this._markReady();
          }
        });
        chain.on(data => {
          if (data && typeof data.points !== 'undefined') {
            this._handlePortalValue(data.points);
          }
        });
      } catch (err) {
        console.warn('Failed to subscribe to portal stats', err);
      }
    }

    _attachPortalPubRealtime() {
      if (!this.portalRoot) return;
      const pub = this._getPubKey();
      if (!pub) {
        this._detachPortalPubRealtime();
        return;
      }
      try {
        const chain = this.portalRoot.get(PORTAL_PUB_STATS_KEY).get(pub);
        if (this._portalPubChain && this._portalPubChain !== chain) {
          try {
            this._portalPubChain.off();
          } catch (err) {
            console.warn('Failed to detach previous pub listener', err);
          }
        }
        this._portalPubChain = chain;
        chain.once(data => {
          if (data && typeof data.points !== 'undefined') {
            this._handlePortalValue(data.points);
            this._markReady();
          }
        });
        chain.on(data => {
          if (data && typeof data.points !== 'undefined') {
            this._handlePortalValue(data.points);
          }
        });
      } catch (err) {
        console.warn('Failed to subscribe to pub stats', err);
      }
    }

    _detachPortalAliasRealtime() {
      if (!this._portalAliasChain) return;
      try {
        this._portalAliasChain.off();
      } catch (err) {
        console.warn('Failed to detach alias listener', err);
      }
      this._portalAliasChain = null;
    }

    _detachPortalPubRealtime() {
      if (!this._portalPubChain) return;
      try {
        this._portalPubChain.off();
      } catch (err) {
        console.warn('Failed to detach pub listener', err);
      }
      this._portalPubChain = null;
    }

    _extractPubKey() {
      if (!this.user || !this.user.is) return '';
      const pub = typeof this.user.is.pub === 'string' ? this.user.is.pub.trim() : '';
      return pub || '';
    }

    _getPubKey() {
      if (this.pubKey) return this.pubKey;
      const stored = readStoredPubKey();
      if (stored) {
        this.pubKey = stored;
        return stored;
      }
      const extracted = this._extractPubKey();
      if (extracted) {
        this._updatePubKeyCache(extracted);
      }
      return extracted;
    }

    _updatePubKeyCache(pub) {
      const normalized = typeof pub === 'string' ? pub.trim() : '';
      this.pubKey = normalized;
      if (normalized) {
        writeStoredPubKey(normalized);
      } else {
        writeStoredPubKey('');
      }
    }

    _refreshIdentity() {
      if (this.state.mode !== 'user') {
        this._updatePubKeyCache('');
        return Promise.resolve();
      }
      const immediate = this._extractPubKey();
      if (immediate) {
        this._updatePubKeyCache(immediate);
        return Promise.resolve(immediate);
      }
      const stored = readStoredPubKey();
      if (stored) {
        this._updatePubKeyCache(stored);
      }
      return new Promise(resolve => {
        let settled = false;
        const finalize = value => {
          if (settled) return;
          settled = true;
          if (value) {
            this._updatePubKeyCache(value);
          }
          resolve(value || '');
        };
        if (!this.user) {
          finalize('');
          return;
        }
        try {
          this.user.get('pub').once(pub => {
            const normalized = typeof pub === 'string' ? pub.trim() : '';
            finalize(normalized);
          });
        } catch (err) {
          console.warn('Failed to fetch pub key from user graph', err);
          finalize('');
        }
        setTimeout(() => finalize(this.pubKey), 800);
      });
    }

    _markReady() {
      if (this.ready) return;
      this.ready = true;
      while (this._readyResolvers.length) {
        const resolve = this._readyResolvers.shift();
        try {
          resolve(this.current);
        } catch (err) {
          console.error('Failed to resolve score readiness', err);
        }
      }
    }

    subscribe(handler) {
      if (typeof handler !== 'function') {
        return () => {};
      }
      this.listeners.add(handler);
      try {
        handler(this.current);
      } catch (err) {
        console.error('Score listener failed during subscribe', err);
      }
      return () => {
        this.listeners.delete(handler);
      };
    }

    increment(amount) {
      const delta = Number(amount);
      if (!Number.isFinite(delta) || delta === 0) {
        return this.current;
      }
      const updated = Math.max(0, this.current + Math.round(delta));
      if (updated === this.current) {
        return this.current;
      }
      this._updateCurrent(updated, { persist: true });
      return this.current;
    }

    set(value) {
      const normalized = sanitizeScore(value);
      if (normalized === this.current) {
        return this.current;
      }
      this._updateCurrent(normalized, { persist: true });
      return this.current;
    }

    ensureMinimum(value) {
      const normalized = sanitizeScore(value);
      if (normalized <= this.current) {
        return this.current;
      }
      this._updateCurrent(normalized, { persist: true });
      return this.current;
    }

    getCurrent() {
      return this.current;
    }

    whenReady() {
      if (this.ready) {
        return Promise.resolve(this.current);
      }
      return new Promise(resolve => {
        this._readyResolvers.push(resolve);
      });
    }

    getNode() {
      return this.node;
    }

    getState() {
      return { ...this.state };
    }

    dispose() {
      try {
        if (this.node) {
          this.node.get('score').off();
          if (this.state.mode === 'user') {
            this.node.get('points').off();
          }
        }
      } catch (err) {
        console.warn('Failed to dispose score manager', err);
      }
      this.listeners.clear();
      if (typeof window !== 'undefined') {
        if (this._handleOnline) {
          window.removeEventListener('online', this._handleOnline);
        }
        if (this._handleStorage) {
          window.removeEventListener('storage', this._handleStorage);
        }
      }
      this._detachPortalAliasRealtime();
      this._detachPortalPubRealtime();
    }
  }

  // Brave shield popup suppression removed; rely on default browser behavior.
  const ScoreSystem = {
    sanitizeScore,
    ensureGuestIdentity,
    snapshotGuestIdentity,
    syncGuestProfile,
    linkGuestToAlias,
    lookupGuestIdForAlias,
    createGhostAccount,
    computeAuthState,
    recallUserSession,
    ensureGun,
    createGunUserStub,
    createGunNodeStub,
    getManager(context = {}) {
      if (!this._manager) {
        this._manager = new ScoreManager(context);
      }
      return this._manager;
    },
    resetManager() {
      if (this._manager) {
        try {
          this._manager.dispose();
        } catch (err) {
          console.warn('Failed to dispose existing score manager', err);
        }
      }
      this._manager = null;
      try {
        localStorage.removeItem(USER_PUB_STORAGE_KEY);
      } catch (err) {
        console.warn('Failed to clear stored pub key', err);
      }
    }
  };

  global.ScoreSystem = ScoreSystem;
})(window);
