(function(global) {
  const SCORE_CACHE_PREFIX = '3dvr:score:';
  const GUEST_ROOT = '3dvr-guests';
  const PORTAL_ROOT_KEY = '3dvr-portal';

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

  function ensureGuestIdentity() {
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
        guestId = `guest_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('guestId', guestId);
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
      this.ready = false;
      this._readyResolvers = [];
      this._scoreHandler = null;
      this._pointsHandler = null;
      this._authPromise = null;

      if (!Number.isFinite(this.current)) {
        this.current = 0;
      }

      if (!this.node) {
        this._markReady();
        return;
      }

      this._ensureUserAuth()
        .catch(err => {
          console.warn('Failed to ensure user auth for score manager', err);
        })
        .finally(() => {
          this.bootstrap();
        });
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
      try {
        this.node.get('score').put(score);
        if (this.state.mode === 'user') {
          this.node.get('points').put(score);
        }
      } catch (err) {
        console.warn('Failed to persist score', err);
      }
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
    }
  }

  const ScoreSystem = {
    sanitizeScore,
    ensureGuestIdentity,
    computeAuthState,
    recallUserSession,
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
    }
  };

  global.ScoreSystem = ScoreSystem;
})(window);
