(function initContactsScore(global) {
  if (global.ScoreSystem && typeof global.ScoreSystem.getManager === 'function') {
    return;
  }

  const SCORE_CACHE_PREFIX = '3dvr:score:';
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

  function sanitizeScore(value) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.round(numeric));
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (_err) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      if (value == null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, String(value));
      }
      return true;
    } catch (_err) {
      return false;
    }
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
        guestId = `guest_${Math.random().toString(36).slice(2, 11)}`;
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
    try {
      const signedIn = localStorage.getItem('signedIn') === 'true';
      const alias = (localStorage.getItem('alias') || '').trim();
      let username = (localStorage.getItem('username') || '').trim();
      if (username.toLowerCase() === 'guest') {
        username = '';
      }
      if (signedIn) {
        return {
          mode: 'user',
          alias,
          username
        };
      }
      const isGuest = localStorage.getItem('guest') === 'true';
      if (isGuest) {
        return {
          mode: 'guest',
          guestId: ensureGuestIdentity(),
          guestDisplayName: (localStorage.getItem('guestDisplayName') || '').trim()
        };
      }
      return { mode: 'anon' };
    } catch (_err) {
      return { mode: 'anon' };
    }
  }

  function recallUserSession(targetUser, { useLocal = true, useSession = true } = {}) {
    const user = targetUser;
    if (!user || typeof user.recall !== 'function') {
      return false;
    }
    const options = {};
    if (useSession) options.sessionStorage = true;
    if (useLocal) options.localStorage = true;
    if (!Object.keys(options).length) {
      return false;
    }
    try {
      user.recall(options);
      return true;
    } catch (err) {
      console.warn('Failed to recall user session', err);
      return false;
    }
  }

  function scoreKeyForState(state) {
    if (!state || state.mode === 'anon') {
      return `${SCORE_CACHE_PREFIX}anon`;
    }
    if (state.mode === 'user') {
      const alias = typeof state.alias === 'string' ? state.alias.trim().toLowerCase() : '';
      return `${SCORE_CACHE_PREFIX}user:${alias || 'default'}`;
    }
    const guestId = typeof state.guestId === 'string' ? state.guestId.trim() : '';
    return `${SCORE_CACHE_PREFIX}${guestId || 'guest'}`;
  }

  class ScoreManager {
    constructor(_context = {}) {
      this.state = computeAuthState();
      this.storageKey = scoreKeyForState(this.state);
      this.current = sanitizeScore(readStorage(this.storageKey));
      this.listeners = new Set();
      this._handleStorage = event => {
        if (!event || event.key !== this.storageKey) {
          return;
        }
        const next = sanitizeScore(event.newValue);
        if (next !== this.current) {
          this.current = next;
          this._notify();
        }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', this._handleStorage);
      }
    }

    _notify() {
      this.listeners.forEach(handler => {
        try {
          handler(this.current);
        } catch (err) {
          console.error('Score listener failed', err);
        }
      });
    }

    _setCurrent(value, { persist = false } = {}) {
      const normalized = sanitizeScore(value);
      if (normalized === this.current) {
        return this.current;
      }
      this.current = normalized;
      if (persist) {
        writeStorage(this.storageKey, this.current);
      }
      this._notify();
      return this.current;
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
      return this._setCurrent(this.current + Math.round(delta), { persist: true });
    }

    decrement(amount, { floor = 0, maxDrop } = {}) {
      const delta = Number(amount);
      if (!Number.isFinite(delta) || delta === 0) {
        return this.current;
      }
      const desiredDrop = Math.max(0, Math.round(Math.abs(delta)));
      const cappedDrop = Number.isFinite(maxDrop) ? Math.max(0, Math.round(maxDrop)) : desiredDrop;
      const appliedDrop = Math.min(desiredDrop, cappedDrop);
      const floorValue = sanitizeScore(floor);
      const next = Math.max(floorValue, this.current - appliedDrop);
      return this._setCurrent(next, { persist: true });
    }

    set(value) {
      return this._setCurrent(value, { persist: true });
    }

    ensureMinimum(value) {
      const minimum = sanitizeScore(value);
      if (minimum <= this.current) {
        return this.current;
      }
      return this._setCurrent(minimum, { persist: true });
    }

    getCurrent() {
      return this.current;
    }

    whenReady() {
      return Promise.resolve(this.current);
    }

    getState() {
      return { ...this.state };
    }

    getNode() {
      return createGunNodeStub();
    }

    dispose() {
      this.listeners.clear();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', this._handleStorage);
      }
    }
  }

  const ScoreSystem = {
    sanitizeScore,
    ensureGuestIdentity,
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
          console.warn('Failed to dispose score manager', err);
        }
      }
      this._manager = null;
    }
  };

  global.ScoreSystem = ScoreSystem;
})(typeof window !== 'undefined' ? window : globalThis);
