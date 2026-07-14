import {
  FREE_PAGE_ANALYTICS_PATH,
  getGunNode,
  normalizeFreePageAnalyticsEvent,
  summarizeFreePageAnalytics,
  utcDay
} from './freePage.js';
import { readGunMap } from '../growth/homepage-hero-cron.js';

export const DEFAULT_ANALYTICS_GUN_PEERS = Object.freeze([
  'wss://gun-relay-3dvr.fly.dev/gun'
]);

function parsePeers(value) {
  const peers = Array.isArray(value) ? value : String(value || '').split(',');
  const cleaned = peers.map(peer => String(peer || '').trim()).filter(Boolean);
  return cleaned.length ? [...new Set(cleaned)] : [...DEFAULT_ANALYTICS_GUN_PEERS];
}

function dateRange(now, days) {
  const end = new Date(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days) + 1);
  start.setUTCHours(0, 0, 0, 0);

  const keys = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(utcDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { start, end, keys };
}

async function resolveGunImpl(explicitImpl) {
  if (explicitImpl) return explicitImpl;
  const moduleResult = await import('gun');
  const GunImpl = moduleResult.default || moduleResult;
  if (typeof GunImpl !== 'function') {
    throw new Error('Unable to load Gun for first-party analytics.');
  }
  return GunImpl;
}

function waitForPeer(gun, timeoutMs, triggerNode) {
  return new Promise(resolve => {
    let settled = false;
    const eventTarget = gun?._?.root || gun;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    eventTarget?.on?.('hi', peer => finish(peer));
    triggerNode?.once?.(() => {});
  });
}

export async function createFreePageAnalyticsReader(options = {}) {
  if (options.client) return options.client;

  const GunImpl = await resolveGunImpl(options.GunImpl);
  const peers = parsePeers(options.peers);
  const gun = options.gun || GunImpl({
    peers,
    axe: false,
    multicast: false,
    localStorage: false,
    radisk: false,
    file: false
  });
  const eventsNode = getGunNode(gun, FREE_PAGE_ANALYTICS_PATH);
  const connectedPeer = await waitForPeer(gun, options.connectTimeoutMs || 3500, eventsNode);
  if (!connectedPeer) {
    throw new Error('No Gun analytics peer connected.');
  }

  return {
    async readDay(day, readOptions = {}) {
      const entries = await readGunMap(
        eventsNode.get(day),
        normalizeFreePageAnalyticsEvent,
        readOptions
      );
      return Object.values(entries);
    }
  };
}

export async function fetchFirstPartyAnalyticsHints(config = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const days = Math.min(90, Math.max(1, Number.parseInt(config.days, 10) || 30));
  const range = dateRange(now, days);

  try {
    const reader = await createFreePageAnalyticsReader({
      client: options.client,
      GunImpl: options.GunImpl,
      gun: options.gun,
      peers: config.gunPeers,
      connectTimeoutMs: options.connectTimeoutMs
    });
    const dailyEvents = await Promise.all(
      range.keys.map(day => reader.readDay(day, options.readOptions))
    );
    const summary = summarizeFreePageAnalytics(dailyEvents.flat(), {
      startAt: range.start.toISOString(),
      endAt: range.end.toISOString()
    });

    return {
      enabled: true,
      source: 'gun-first-party',
      warnings: [],
      keywords: [],
      topPaths: summary.pageViews ? ['/free-page/'] : [],
      topSources: [],
      ...summary
    };
  } catch (error) {
    return {
      enabled: false,
      source: 'gun-first-party',
      warnings: [`First-party analytics unavailable: ${error.message}`],
      keywords: [],
      topPaths: [],
      topSources: []
    };
  }
}
