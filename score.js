(function(global) {
  const SCORE_CACHE_PREFIX = '3dvr:score:';
  const GUEST_ROOT = '3dvr-guests';
  const PORTAL_ROOT_KEY = '3dvr-portal';
  const PENDING_SUFFIX = ':pending';

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

  function computeDeviceFingerprint() {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      return '';
    }

    const screenData = window.screen || {};
    let timeZone = '';
    try {
      const resolved = Intl && Intl.DateTimeFormat
        ? Intl.DateTimeFormat().resolvedOptions()
        : null;
      timeZone = resolved && resolved.timeZone ? resolved.timeZone : '';
    } catch (err) {
      timeZone = '';
    }

    const parts = [
      navigator.userAgent || '',
      navigator.language || '',
      navigator.platform || '',
      `${screenData.width || ''}x${screenData.height || ''}`,
      screenData.colorDepth || '',
      timeZone || '',
      typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : '',
      typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : '',
      typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : ''
    ];

    return parts.join('|').toLowerCase();
  }

  function fingerprintToKey(fingerprint) {
    if (!fingerprint) return '';
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i += 1) {
      hash = (hash << 5) - hash + fingerprint.charCodeAt(i);
      hash |= 0;
    }
    const normalized = Math.abs(hash).toString(36);
    if (!normalized) return '';
    return `fp_${normalized}`;
  }

  function getGuestFingerprintKey() {
    const fingerprint = computeDeviceFingerprint();
    return fingerprintToKey(fingerprint);
  }

  function persistGuestFingerprintMapping(portalRoot, fingerprintKey, guestId, { username, score } = {}) {
    if (!portalRoot || !fingerprintKey || !guestId) {
      return;
    }

    const payload = {
      guestId,
      updatedAt: Date.now()
    };

    if (Number.isFinite(score)) {
      payload.score = sanitizeScore(score);
    }

    if (typeof username === 'string' && username.trim()) {
      payload.username = username.trim();
    }

    try {
      portalRoot.get('guestFingerprints').get(fingerprintKey).put(payload);
    } catch (err) {
      console.warn('Failed to persist guest fingerprint mapping', err);
    }
  }

  function ensureGuestIdentity(options = {}) {
    const { createIfMissing = true } = options;
    try {
      const legacyId = localStorage.getItem('userId');
      if (legacyId && !localStorage.getItem('guestId')) {
        localStorage.setItem('guestId', legacyId);
      }
      if (legacyId) {
        localStorage.removeItem('userId');
      }

      let guestId = localStorage.getItem('guestId');

      if (!guestId) {
        const backupId = typeof global !== 'undefined' && global.__scoreSystemGuestId
          ? String(global.__scoreSystemGuestId).trim()
          : '';
        if (backupId) {
          guestId = backupId;
          localStorage.setItem('guestId', guestId);
        }
      }

      if (!guestId && createIfMissing) {
        const fingerprint = computeDeviceFingerprint();
        const fingerprintKey = fingerprintToKey(fingerprint);
        if (fingerprintKey) {
          guestId = `guest_${fingerprintKey}`;
          localStorage.setItem('guestId', guestId);
        }
      }

      if (!guestId && createIfMissing) {
        guestId = `guest_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('guestId', guestId);
      }

      if (guestId) {
        localStorage.setItem('guest', 'true');
        if (!localStorage.getItem('guestDisplayName')) {
          localStorage.setItem('guestDisplayName', 'Guest');
        }
        try {
          global.__scoreSystemGuestId = guestId;
        } catch (err) {
          // Ignore inability to cache guest id globally
        }
      }

      return guestId || '';
    } catch (err) {
      console.warn('Failed to ensure guest identity', err);
      return '';
    }
  }

  function restoreGuestIdentity({ gun, portalRoot, timeout = 1200 } = {}) {
    if (typeof window === 'undefined') {
      return Promise.resolve('');
    }

    const root = portalRoot || (gun && typeof gun.get === 'function' ? gun.get(PORTAL_ROOT_KEY) : null);
    const existingId = ensureGuestIdentity({ createIfMissing: false });

    if (existingId) {
      if (root) {
        const fingerprintKey = getGuestFingerprintKey();
        if (fingerprintKey) {
          const username = (localStorage.getItem('guestDisplayName') || '').trim();
          const cachedScore = readCachedScore({ mode: 'guest', guestId: existingId });
          persistGuestFingerprintMapping(root, fingerprintKey, existingId, { username, score: cachedScore });
        }
      }
      return Promise.resolve(existingId);
    }

    const fingerprintKey = getGuestFingerprintKey();

    if (!root || !fingerprintKey) {
      const generated = ensureGuestIdentity();
      if (root && generated) {
        const username = (localStorage.getItem('guestDisplayName') || '').trim();
        const cachedScore = readCachedScore({ mode: 'guest', guestId: generated });
        persistGuestFingerprintMapping(root, fingerprintKey, generated, { username, score: cachedScore });
      }
      return Promise.resolve(generated);
    }

    return new Promise(resolve => {
      let settled = false;

      const finalize = (guestId, metadata = {}) => {
        if (settled) return;
        settled = true;
        const normalized = typeof guestId === 'string' ? guestId.trim() : '';
        const username = metadata && typeof metadata.username === 'string'
          ? metadata.username.trim()
          : '';
        if (normalized) {
          try {
            localStorage.setItem('guestId', normalized);
            localStorage.setItem('guest', 'true');
            if (username && !localStorage.getItem('guestDisplayName')) {
              localStorage.setItem('guestDisplayName', username);
            }
            global.__scoreSystemGuestId = normalized;
          } catch (err) {
            console.warn('Unable to persist guest identity locally', err);
          }
        }

        const ensured = ensureGuestIdentity({ createIfMissing: !normalized });
        const activeId = normalized || ensured || '';

        const cachedScore = readCachedScore({ mode: 'guest', guestId: activeId });
        const snapshotUsername = (localStorage.getItem('guestDisplayName') || '').trim() || username;

        if (activeId) {
          persistGuestFingerprintMapping(root, fingerprintKey, activeId, {
            username: snapshotUsername,
            score: cachedScore
          });
        }

        resolve(activeId);
      };

      try {
        root.get('guestFingerprints').get(fingerprintKey).once(data => {
          if (settled) return;
          const storedId = data && typeof data.guestId === 'string' ? data.guestId.trim() : '';
          const storedUsername = data && typeof data.username === 'string' ? data.username.trim() : '';
          if (storedId) {
            finalize(storedId, { username: storedUsername });
          } else {
            finalize(ensureGuestIdentity(), {});
          }
        });
      } catch (err) {
        console.warn('Failed to load guest fingerprint mapping', err);
        finalize(ensureGuestIdentity(), {});
        return;
      }

      setTimeout(() => {
        if (settled) return;
        finalize(ensureGuestIdentity(), {});
      }, timeout);
    });
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
      let guestId = ensureGuestIdentity({ createIfMissing: false });
      if (!guestId) {
        guestId = (localStorage.getItem('guestId') || '').trim();
      }
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

  function displayNameFromAlias(alias) {
    const normalized = typeof alias === 'string' ? alias.trim() : '';
    if (!normalized) return '';
    return normalized.includes('@') ? normalized.split('@')[0] : normalized;
  }

  class ScoreManager {
    constructor({ gun, user, portalRoot, guestRestorePromise } = {}) {
      this.gun = gun || null;
      this.user = user || null;
      this.portalRoot = portalRoot || (this.gun ? this.gun.get(PORTAL_ROOT_KEY) : null);
      this.listeners = new Set();
      this.state = { mode: 'anon' };
      this.current = 0;
      this.pending = 0;
      this.node = null;
      this.ready = false;
      this._readyResolvers = [];
      this._scoreHandler = null;
      this._pointsHandler = null;
      this._authPromise = null;
      this._handleOnline = null;
      this._handleStorage = null;
      this._initialization = null;

      const restorePromise = guestRestorePromise
        ? Promise.resolve(guestRestorePromise)
        : Promise.resolve();

      this._initialization = restorePromise
        .catch(err => {
          console.warn('Guest identity restoration failed', err);
        })
        .then(() => {
          this.state = computeAuthState();
          this.current = readCachedScore(this.state);
          this.pending = readPendingScore(this.state);
          this._normalizeCacheState();

          this.node = this.resolveNode();

          if (!this.node) {
            this._markReady();
            return null;
          }

          return this._ensureUserAuth()
            .catch(err => {
              console.warn('Failed to ensure user auth for score manager', err);
            });
        })
        .finally(() => {
          if (!this.node) {
            return;
          }
          this.bootstrap();
        });

      if (typeof window !== 'undefined') {
        this._handleOnline = () => {
          this._flushPendingScore();
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

      if (this.pending > 0) {
        this._flushPendingScore();
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

      if (this.state.mode === 'guest' && (field === 'score' || field === 'points')) {
        this._syncGuestFingerprint();
      }
    }

    _updateCurrent(score, { persist = true } = {}) {
      const normalized = sanitizeScore(score);
      this.current = normalized;
      writeCachedScore(this.state, normalized);

      if (this.state.mode === 'user') {
        this._syncPublicStats();
      } else if (this.state.mode === 'guest') {
        this._syncGuestFingerprint();
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
      if (this.state.mode === 'guest') {
        this._syncGuestFingerprint();
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
    }

    _normalizeCacheState() {
      if (!Number.isFinite(this.current)) {
        this.current = 0;
      }

      if (!Number.isFinite(this.pending)) {
        this.pending = 0;
      }

      if (this.pending > this.current) {
        this.current = this.pending;
        writeCachedScore(this.state, this.current);
      }
    }

    _syncGuestFingerprint() {
      if (this.state.mode !== 'guest') {
        return;
      }
      if (!this.portalRoot) {
        return;
      }
      const guestId = this.state.guestId || ensureGuestIdentity();
      const fingerprintKey = getGuestFingerprintKey();
      if (!guestId || !fingerprintKey) {
        return;
      }
      const username = (localStorage.getItem('guestDisplayName') || '').trim();
      persistGuestFingerprintMapping(this.portalRoot, fingerprintKey, guestId, {
        username,
        score: this.current
      });
    }

    _syncPublicStats() {
      if (!this.portalRoot) return;
      const alias = (localStorage.getItem('alias') || '').trim();
      if (!alias) return;
      const username = (localStorage.getItem('username') || '').trim() || displayNameFromAlias(alias);
      try {
        this.portalRoot.get('userStats').get(alias).put({
          alias,
          username,
          points: this.current,
          lastUpdated: Date.now()
        });
      } catch (err) {
        console.warn('Failed to sync public stats', err);
      }
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
    }
  }

  const ScoreSystem = {
    sanitizeScore,
    ensureGuestIdentity,
    computeAuthState,
    recallUserSession,
    restoreGuestIdentity,
    getManager(context = {}) {
      if (!this._manager) {
        if (!this._guestRestorePromise && typeof this.restoreGuestIdentity === 'function') {
          this._guestRestorePromise = this.restoreGuestIdentity(context)
            .catch(err => {
              console.warn('Guest identity restore failed', err);
              return '';
            });
        }
        this._manager = new ScoreManager({ ...context, guestRestorePromise: this._guestRestorePromise });
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
      this._guestRestorePromise = null;
    }
  };

  global.ScoreSystem = ScoreSystem;
})(window);
