// Account sync for the Squat Timer.
//
// The timer session (a running countdown, an open set) stays on the device:
// a countdown on your phone should not teleport to your desktop. Your
// settings and your counts (today, streak, all time) are account data, so
// when you are signed in to the portal they are mirrored, SEA-encrypted, to
// your Gun user space and merged back on any device. Local storage stays
// the source of truth when sync is unavailable.
const SETTINGS_KEY = 'squatTimer.settings.v1';
const STATS_KEY = 'squatTimer.stats.v1';
const META_KEY = 'squatTimer.meta.v1';
const OWNER_KEY = 'squatTimer.owner.v1';
const SESSION_KEY = 'squatTimer.session.v1';
const ACCOUNT_NODE = 'squat-timer-v1';

const DEFAULT_SETTINGS = { intervalMin: 45, reps: 10, sound: true, vibrate: true };
const EMPTY_STATS = { days: {}, totalSets: 0, totalSquats: 0, lastSetAt: null };

function normalizeSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    intervalMin: [30, 45, 60].includes(Number(source.intervalMin)) ? Number(source.intervalMin) : 45,
    reps: [5, 10, 15, 20].includes(Number(source.reps)) ? Number(source.reps) : 10,
    sound: source.sound !== false,
    vibrate: source.vibrate !== false
  };
}

function normalizeStats(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const days = {};
  if (source.days && typeof source.days === 'object') {
    for (const [key, entry] of Object.entries(source.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !entry || typeof entry !== 'object') continue;
      days[key] = {
        sets: Math.max(0, Number(entry.sets) || 0),
        squats: Math.max(0, Number(entry.squats) || 0)
      };
    }
  }
  return {
    days,
    totalSets: Math.max(0, Number(source.totalSets) || 0),
    totalSquats: Math.max(0, Number(source.totalSquats) || 0),
    lastSetAt: typeof source.lastSetAt === 'string' ? source.lastSetAt : null
  };
}

function laterIso(a, b) {
  const aMs = Date.parse(a || '') || 0;
  const bMs = Date.parse(b || '') || 0;
  return aMs >= bMs ? (a || null) : (b || null);
}

// Counts only ever grow, so merging two devices takes the larger count for
// each day. That can undercount a day where two devices both logged sets
// before either synced, but it can never double count or lose a streak.
export function mergeSquatStats(localValue = {}, remoteValue = {}) {
  const local = normalizeStats(localValue);
  const remote = normalizeStats(remoteValue);
  const days = {};
  for (const key of new Set([...Object.keys(local.days), ...Object.keys(remote.days)])) {
    const a = local.days[key] || { sets: 0, squats: 0 };
    const b = remote.days[key] || { sets: 0, squats: 0 };
    days[key] = { sets: Math.max(a.sets, b.sets), squats: Math.max(a.squats, b.squats) };
  }
  let totalSets = 0;
  let totalSquats = 0;
  for (const entry of Object.values(days)) {
    totalSets += entry.sets;
    totalSquats += entry.squats;
  }
  return {
    days,
    totalSets: Math.max(totalSets, local.totalSets, remote.totalSets),
    totalSquats: Math.max(totalSquats, local.totalSquats, remote.totalSquats),
    lastSetAt: laterIso(local.lastSetAt, remote.lastSetAt)
  };
}

export function mergeSquatPayload(localPayload = {}, remotePayload = {}) {
  const localSettingsAt = Date.parse(localPayload.settingsAt || '') || 0;
  const remoteSettingsAt = Date.parse(remotePayload.settingsAt || '') || 0;
  const settings = remoteSettingsAt > localSettingsAt
    ? normalizeSettings(remotePayload.settings)
    : normalizeSettings(localPayload.settings);
  return {
    settings,
    stats: mergeSquatStats(localPayload.stats, remotePayload.stats),
    settingsAt: laterIso(localPayload.settingsAt, remotePayload.settingsAt),
    statsAt: laterIso(localPayload.statsAt, remotePayload.statsAt)
  };
}

function parseLocal(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function readLocalPayload(storage) {
  const meta = parseLocal(storage, META_KEY, { settingsAt: null, statsAt: null });
  return {
    settings: normalizeSettings(parseLocal(storage, SETTINGS_KEY, DEFAULT_SETTINGS)),
    stats: normalizeStats(parseLocal(storage, STATS_KEY, EMPTY_STATS)),
    settingsAt: meta.settingsAt || null,
    statsAt: meta.statsAt || null
  };
}

function writeLocalPayload(storage, payload) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(payload.settings));
  storage.setItem(STATS_KEY, JSON.stringify(payload.stats));
  storage.setItem(META_KEY, JSON.stringify({ settingsAt: payload.settingsAt, statsAt: payload.statsAt }));
}

function payloadsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function signedInMarkerExists(windowObj, storage) {
  const shared = windowObj.AuthIdentity?.readSharedIdentity?.() || {};
  let storedSignedIn = false;
  try {
    storedSignedIn = storage.getItem('signedIn') === 'true';
  } catch {
    storedSignedIn = false;
  }
  return shared.signedIn === true || storedSignedIn;
}

function once(node, timerWindow = window) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = timerWindow.setTimeout(() => finish(null), 2500);
    try {
      node.once((value) => finish(value));
    } catch {
      finish(null);
    }
  });
}

function put(node, value) {
  return new Promise((resolve) => {
    try {
      node.put(value, (ack) => resolve(!ack?.err));
    } catch {
      resolve(false);
    }
  });
}

export async function createSquatTimerSync({ windowObj = window } = {}) {
  const storage = windowObj.localStorage;
  const setStatus = (message) => {
    const node = windowObj.document?.querySelector?.('#syncStatus');
    if (node && message) node.textContent = message;
  };

  if (typeof windowObj.Gun !== 'function' || !windowObj.SEA) {
    setStatus('Saved on this device. Account sync is unavailable here.');
    return { available: false, syncNow: async () => false };
  }

  try {
    windowObj.AuthIdentity?.syncStorageFromSharedIdentity?.(storage);
    if (!signedInMarkerExists(windowObj, storage)) {
      setStatus('Saved on this device. Sign in to your 3DVR account to sync your counts across devices.');
      return { available: false, syncNow: async () => false };
    }

    const gun = windowObj.Gun({ peers: windowObj.__GUN_PEERS__ || [] });
    const user = gun.user();
    user.recall?.({ sessionStorage: true, localStorage: true });
    for (let attempt = 0; attempt < 12 && !user.is; attempt += 1) {
      await new Promise((resolve) => windowObj.setTimeout(resolve, 150));
    }

    const pair = user?._?.sea;
    const SEA = windowObj.SEA || windowObj.Gun.SEA;
    if (!user.is?.pub || !pair || !SEA?.encrypt || !SEA?.decrypt) {
      setStatus('Saved on this device. Account sync will retry later.');
      return { available: false, syncNow: async () => false };
    }

    // The local cache belongs to exactly one account. If a different
    // account used this browser before, archive that account's local
    // payload under its own key and start this account from a clean slate,
    // so one account's history and settings never merge into another's.
    const ownerPub = user.is.pub;
    let storedOwner = null;
    try {
      storedOwner = storage.getItem(OWNER_KEY);
    } catch {
      storedOwner = null;
    }
    if (storedOwner && storedOwner !== ownerPub) {
      try {
        storage.setItem(`squatTimer.archive.v1.${storedOwner}`, JSON.stringify(readLocalPayload(storage)));
      } catch {
        // The archive is best effort; the partition itself is what matters.
      }
      writeLocalPayload(storage, {
        settings: normalizeSettings(DEFAULT_SETTINGS),
        stats: normalizeStats(EMPTY_STATS),
        settingsAt: null,
        statsAt: null
      });
      try {
        storage.removeItem(SESSION_KEY);
      } catch {
        // No stored session to clear.
      }
      windowObj.SquatTimer?.reloadFromStorage?.();
    }
    try {
      storage.setItem(OWNER_KEY, ownerPub);
    } catch {
      // Storage full or blocked: sync still works, the partition is retried next load.
    }

    const node = user.get(ACCOUNT_NODE).get('state');

    const readRemote = async () => {
      const record = await once(node, windowObj);
      if (!record?.ciphertext) return null;
      const decoded = await SEA.decrypt(record.ciphertext, pair);
      if (!decoded) return null;
      const parsed = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
      return {
        settings: normalizeSettings(parsed.settings),
        stats: normalizeStats(parsed.stats),
        settingsAt: parsed.settingsAt || null,
        statsAt: parsed.statsAt || null
      };
    };

    const pushPayload = async (payload) => {
      const ciphertext = await SEA.encrypt(JSON.stringify(payload), pair);
      if (!ciphertext) return false;
      return put(node, {
        schemaVersion: 1,
        updatedAt: laterIso(payload.settingsAt, payload.statsAt) || new Date().toISOString(),
        ciphertext
      });
    };

    const runSync = async () => {
      const local = readLocalPayload(storage);
      const remote = await readRemote();
      let merged = remote ? mergeSquatPayload(local, remote) : local;
      // A set can be logged while the remote read is in flight. Re-read the
      // local payload before writing anything back and merge once more, so
      // fresh work is never clobbered by a snapshot taken before it happened.
      const fresh = readLocalPayload(storage);
      if (!payloadsEqual(fresh, local)) {
        merged = mergeSquatPayload(fresh, merged);
      }
      if (!payloadsEqual(merged, fresh)) {
        writeLocalPayload(storage, merged);
        windowObj.SquatTimer?.reloadFromStorage?.();
      }
      if (!remote || !payloadsEqual(merged, remote)) {
        return pushPayload(merged);
      }
      return true;
    };

    let syncInFlight = null;
    const syncNow = () => {
      if (!syncInFlight) {
        syncInFlight = runSync().finally(() => {
          syncInFlight = null;
        });
      }
      return syncInFlight;
    };

    await syncNow();
    setStatus('Synced to your 3DVR account. Your counts follow you across devices.');
    return { available: true, syncNow };
  } catch {
    setStatus('Saved on this device. Account sync will retry later.');
    return { available: false, syncNow: async () => false };
  }
}

async function boot() {
  const runtime = await createSquatTimerSync();
  if (!runtime.available) return;
  let lastSettings = localStorage.getItem(SETTINGS_KEY) || '';
  let lastStats = localStorage.getItem(STATS_KEY) || '';
  let lastRemotePoll = Date.now();

  const attemptSync = async () => {
    let ok = false;
    try {
      ok = await runtime.syncNow();
    } catch {
      ok = false;
    }
    if (ok) {
      // Advance the markers only once the account copy is confirmed in
      // sync, so a failed upload is retried on a later pass instead of
      // being silently dropped.
      lastSettings = localStorage.getItem(SETTINGS_KEY) || '';
      lastStats = localStorage.getItem(STATS_KEY) || '';
      lastRemotePoll = Date.now();
    }
    return ok;
  };

  window.setInterval(async () => {
    const currentSettings = localStorage.getItem(SETTINGS_KEY) || '';
    const currentStats = localStorage.getItem(STATS_KEY) || '';
    if (currentSettings !== lastSettings || currentStats !== lastStats) {
      await attemptSync();
      return;
    }
    // Nothing changed on this device. Still check the account copy every
    // so often, so sets logged on another device arrive here without
    // needing a local change or a reload first.
    if (Date.now() - lastRemotePoll >= 30000) {
      await attemptSync();
    }
  }, 2500);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void attemptSync();
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot();
}
