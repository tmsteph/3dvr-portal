(function() {
  'use strict';

  const GUN_FALLBACK_ERROR = { err: 'gun-unavailable' };
  const scoreSystem = window.ScoreSystem || {};

  function createLocalGunSubscriptionStub() {
    return { off() {} };
  }

  function createLocalGunNodeStub() {
    const node = {
      __isGunStub: true,
      get() {
        return createLocalGunNodeStub();
      },
      put(_value, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(GUN_FALLBACK_ERROR), 0);
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
        return createLocalGunSubscriptionStub();
      },
      map() {
        return {
          __isGunStub: true,
          on() {
            return createLocalGunSubscriptionStub();
          }
        };
      },
      set() {
        return node;
      },
      off() {}
    };
    return node;
  }

  function createLocalGunUserStub(baseNode) {
    const node = baseNode && typeof baseNode.get === 'function'
      ? baseNode
      : createLocalGunNodeStub();
    return {
      ...node,
      is: null,
      _: {},
      recall() {},
      auth(_alias, _password, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(GUN_FALLBACK_ERROR), 0);
        }
      },
      leave() {},
      create(_alias, _password, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(GUN_FALLBACK_ERROR), 0);
        }
      }
    };
  }

  function resolveGunNodeStub() {
    if (typeof scoreSystem.createGunNodeStub === 'function') {
      try {
        return scoreSystem.createGunNodeStub();
      } catch (err) {
        console.warn('Failed to reuse ScoreSystem node stub', err);
      }
    }
    return createLocalGunNodeStub();
  }

  function resolveGunUserStub(node) {
    if (typeof scoreSystem.createGunUserStub === 'function') {
      try {
        return scoreSystem.createGunUserStub(node);
      } catch (err) {
        console.warn('Failed to reuse ScoreSystem user stub', err);
      }
    }
    return createLocalGunUserStub(node);
  }

  function ensureGunContext(factory, options) {
    const ensureGun = typeof scoreSystem.ensureGun === 'function'
      ? scoreSystem.ensureGun.bind(scoreSystem)
      : null;
    const label = options && options.label ? options.label : 'social-media';

    if (ensureGun) {
      return ensureGun(factory, { label });
    }

    let instance = null;
    if (typeof factory === 'function') {
      try {
        instance = factory();
      } catch (err) {
        console.warn('Failed to initialize Gun for social tools', err);
      }
    }

    if (instance) {
      const resolvedUser = typeof instance.user === 'function'
        ? instance.user()
        : resolveGunUserStub(instance);
      return {
        gun: instance,
        user: resolvedUser,
        isStub: !!instance.__isGunStub
      };
    }

    console.warn('Gun.js is unavailable for social tools; using offline stub.');
    const stubGun = {
      __isGunStub: true,
      get() {
        return resolveGunNodeStub();
      },
      user() {
        return resolveGunUserStub();
      }
    };
    return {
      gun: stubGun,
      user: stubGun.user(),
      isStub: true
    };
  }

  function recallUserSessionIfAvailable(targetUser) {
    if (!targetUser || typeof targetUser.recall !== 'function') {
      return;
    }

    if (typeof scoreSystem.recallUserSession === 'function') {
      try {
        const reused = scoreSystem.recallUserSession(targetUser);
        if (reused) {
          return;
        }
      } catch (err) {
        console.warn('Failed to recall session via ScoreSystem', err);
      }
    }

    try {
      targetUser.recall({ sessionStorage: true, localStorage: true });
    } catch (err) {
      console.warn('Unable to recall user session for social tools', err);
    }
  }

  window.SocialGun = {
    GUN_FALLBACK_ERROR,
    createLocalGunNodeStub,
    createLocalGunUserStub,
    resolveGunNodeStub,
    resolveGunUserStub,
    ensureGunContext,
    recallUserSessionIfAvailable
  };
})();
