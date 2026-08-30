import {
  canAutoPromote,
  computeConversionStats,
  experimentPath,
  normalizeExperimentDefinition,
  normalizeExperimentEvent,
  pickConversionWinner,
} from './experiment-engine.js';
import { DEFAULT_GUN_PEERS, getNode } from './homepage-hero.js';
import { parseGunPeers, readGunMap } from './homepage-hero-cron.js';

function onceNode(node) {
  return new Promise((resolve) => {
    if (!node || typeof node.once !== 'function') return resolve(undefined);
    node.once((value) => resolve(value));
  });
}

function putNode(node, value) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.put !== 'function') return reject(new Error('Experiment config node is not writable.'));
    node.put(value, (ack) => ack?.err ? reject(new Error(String(ack.err))) : resolve(ack || {}));
  });
}

async function loadGun(explicitImpl) {
  if (explicitImpl) return explicitImpl;
  const moduleResult = await import('gun');
  return moduleResult?.default || moduleResult;
}

export async function createExperimentGrowthClient(definition, options = {}) {
  const normalized = normalizeExperimentDefinition(definition);
  const GunImpl = await loadGun(options.GunImpl);
  const peers = parseGunPeers(options.peers || options.gunPeers, DEFAULT_GUN_PEERS);
  const gun = options.gun || GunImpl({
    peers,
    localStorage: false,
    radisk: false,
    file: false,
    multicast: false,
    axe: false,
  });
  const configNode = getNode(gun, experimentPath(normalized.id, 'config'));
  const eventsNode = getNode(gun, experimentPath(normalized.id, 'events'));

  return {
    async readConfig() {
      const data = await onceNode(configNode) || {};
      const winner = normalized.variants.some((variant) => variant.key === data.winner)
        ? String(data.winner)
        : '';
      return {
        autoMode: typeof data.autoMode === 'boolean' ? data.autoMode : true,
        winner,
        winnerReason: String(data.winnerReason || '').trim(),
        updatedAt: String(data.updatedAt || '').trim(),
        updatedBy: String(data.updatedBy || '').trim(),
      };
    },
    async readEvents(readOptions = {}) {
      return readGunMap(
        eventsNode,
        (data, id) => normalizeExperimentEvent(normalized, data, id),
        readOptions
      );
    },
    async writeConfig(value) {
      await putNode(configNode, value);
    },
  };
}

export async function runExperimentCronCycle(definition, options = {}) {
  const normalized = normalizeExperimentDefinition(definition);
  const client = options.client || await createExperimentGrowthClient(normalized, options);
  const generatedAt = typeof options.now === 'function' ? options.now() : new Date().toISOString();
  const dryRun = Boolean(options.dryRun);
  const [config, events] = await Promise.all([client.readConfig(), client.readEvents(options)]);
  const stats = computeConversionStats(normalized, events);
  const recommended = pickConversionWinner(normalized, stats, options);
  const safe = canAutoPromote(normalized);
  const wouldPromote = Boolean(safe && config.autoMode && recommended && config.winner !== recommended.key);
  let promoted = false;
  let winnerAfter = config.winner;

  if (wouldPromote) {
    winnerAfter = recommended.key;
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
  }

  return {
    experiment: normalized.id,
    generatedAt,
    dryRun,
    autoMode: config.autoMode,
    safeToAutoPromote: safe,
    winnerBefore: config.winner,
    winnerAfter,
    recommendedWinner: recommended?.key || '',
    recommendedReason: recommended?.reason || '',
    wouldPromote,
    promoted,
    action: !safe ? 'approval-required'
      : !config.autoMode ? 'auto-mode-disabled'
        : !recommended ? 'insufficient-data'
          : config.winner === recommended.key ? 'winner-already-current'
            : dryRun ? 'dry-run'
              : promoted ? 'promoted' : 'no-change',
    stats,
  };
}
