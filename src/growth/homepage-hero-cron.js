import {
  DEFAULT_GUN_PEERS,
  EXPERIMENT_CONFIG_PATH,
  EXPERIMENT_EVENT_PATH,
  FEEDBACK_EVENT_PATH,
  HOMEPAGE_HERO_EXPERIMENT_ID,
  computeStats,
  getNode,
  normalizeConfig,
  normalizeEvent,
  normalizeFeedback,
  pickRecommendedWinner,
  summarizeStats,
} from './homepage-hero.js';

const DEFAULT_SETTLE_MS = 300;
const DEFAULT_TIMEOUT_MS = 2500;

export function parseGunPeers(value, fallback = DEFAULT_GUN_PEERS) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const peers = list
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

  if (!peers.length) {
    return [...fallback];
  }

  return Array.from(new Set(peers));
}

function onceNode(node) {
  return new Promise((resolve) => {
    if (!node || typeof node.once !== 'function') {
      resolve(undefined);
      return;
    }
    node.once((value) => resolve(value));
  });
}

function putNode(node, value) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.put !== 'function') {
      reject(new Error('Growth config node is not writable.'));
      return;
    }

    node.put(value, (ack) => {
      if (ack?.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      resolve(ack || {});
    });
  });
}

export function readGunMap(node, normalizeEntry, options = {}) {
  const settleMs = Number.parseInt(options.settleMs, 10) || DEFAULT_SETTLE_MS;
  const timeoutMs = Number.parseInt(options.timeoutMs, 10) || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    if (!node || typeof node.map !== 'function') {
      resolve(Object.create(null));
      return;
    }

    const entries = Object.create(null);
    const mapped = node.map();
    let settled = false;
    let settleTimer = null;
    let timeoutTimer = null;

    const cleanup = () => {
      clearTimeout(settleTimer);
      clearTimeout(timeoutTimer);
      if (mapped && typeof mapped.off === 'function') {
        mapped.off();
      }
    };

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(entries);
    };

    const bump = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, settleMs);
    };

    timeoutTimer = setTimeout(finish, timeoutMs);
    bump();

    try {
      mapped.once((data, id) => {
        const entry = normalizeEntry(data, id);
        if (entry?.id) {
          entries[entry.id] = entry;
        }
        bump();
      });
    } catch (_error) {
      finish();
    }
  });
}

async function resolveGunImpl(explicitImpl) {
  if (explicitImpl) {
    return explicitImpl;
  }

  const moduleResult = await import('gun');
  if (typeof moduleResult?.default === 'function') {
    return moduleResult.default;
  }
  if (typeof moduleResult === 'function') {
    return moduleResult;
  }

  throw new Error('Unable to load Gun for homepage growth cron.');
}

export async function createHomepageHeroGrowthClient(options = {}) {
  const GunImpl = await resolveGunImpl(options.GunImpl);
  const peers = parseGunPeers(options.peers || options.gunPeers || options.config?.GROWTH_GUN_PEERS);
  const gun = options.gun || GunImpl({
    peers,
    localStorage: false,
    radisk: false,
    file: false,
    multicast: false,
    axe: false,
  });

  const configNode = getNode(gun, EXPERIMENT_CONFIG_PATH);
  const eventsNode = getNode(gun, EXPERIMENT_EVENT_PATH);
  const feedbackNode = getNode(gun, FEEDBACK_EVENT_PATH);

  return {
    async readConfig() {
      return normalizeConfig(await onceNode(configNode));
    },
    async readEvents(readOptions = {}) {
      return readGunMap(eventsNode, normalizeEvent, readOptions);
    },
    async readFeedback(readOptions = {}) {
      return readGunMap(feedbackNode, normalizeFeedback, readOptions);
    },
    async writeConfig(value) {
      await putNode(configNode, value);
    },
  };
}

function getCycleAction({ autoMode, recommended, matchesCurrentWinner, dryRun, promoted }) {
  if (!autoMode) {
    return 'auto-mode-disabled';
  }
  if (!recommended) {
    return 'insufficient-data';
  }
  if (matchesCurrentWinner) {
    return 'winner-already-current';
  }
  if (dryRun && !promoted) {
    return 'dry-run';
  }
  if (promoted) {
    return 'promoted';
  }
  return 'no-change';
}

export async function runHomepageHeroCronCycle(options = {}) {
  const client = options.client || await createHomepageHeroGrowthClient(options);
  const generatedAt = typeof options.now === 'function'
    ? options.now()
    : new Date().toISOString();
  const dryRun = Boolean(options.dryRun);

  const [config, events, feedback] = await Promise.all([
    client.readConfig(),
    client.readEvents(options),
    client.readFeedback(options),
  ]);

  const stats = computeStats(events, feedback);
  const recommended = pickRecommendedWinner(stats, options);
  const matchesCurrentWinner = Boolean(
    recommended &&
    config.winner === recommended.key &&
    config.winnerReason === recommended.reason
  );
  const wouldPromote = Boolean(config.autoMode && recommended && !matchesCurrentWinner);
  let promoted = false;
  let winnerAfter = config.winner;
  let reason = config.winnerReason || 'No winner chosen yet.';

  if (wouldPromote) {
    winnerAfter = recommended.key;
    reason = recommended.reason;
    if (!dryRun) {
      await client.writeConfig({
        ...config,
        winner: recommended.key,
        winnerReason: recommended.reason,
        updatedAt: generatedAt,
        updatedBy: 'growth-cron',
      });
      promoted = true;
    }
  } else if (!recommended && config.autoMode) {
    reason = 'Waiting for enough split traffic to recommend a winner.';
  } else if (!config.autoMode) {
    reason = config.winnerReason || 'Auto mode is disabled.';
  }

  return {
    experiment: HOMEPAGE_HERO_EXPERIMENT_ID,
    generatedAt,
    dryRun,
    autoMode: Boolean(config.autoMode),
    winnerBefore: config.winner,
    winnerAfter,
    recommendedWinner: recommended?.key || '',
    recommendedReason: recommended?.reason || '',
    updatedBy: promoted ? 'growth-cron' : config.updatedBy || '',
    wouldPromote,
    promoted,
    action: getCycleAction({
      autoMode: Boolean(config.autoMode),
      recommended,
      matchesCurrentWinner,
      dryRun,
      promoted,
    }),
    stats,
    totals: summarizeStats(stats),
    reason,
  };
}
