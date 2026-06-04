#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MANIFEST = 'ops/gun/portal-gun-roots.json';
const DEFAULT_OUT_DIR = 'backups/gun-snapshots';
const DEFAULT_PEERS = [
  'wss://gun-relay-3dvr.fly.dev/gun',
  'https://gun-relay-3dvr.fly.dev/gun'
];
const DEFAULT_TIMEOUT_MS = 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 15000;
const DEFAULT_HARD_TIMEOUT_MS = 600000;
const DEFAULT_MAX_KEYS_PER_NODE = 150;
const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);

function usage() {
  return `Usage: node scripts/gun/backup-known-roots.mjs [options]

Options:
  --manifest <file>          Root manifest JSON. Default: ${DEFAULT_MANIFEST}
  --out-dir <dir>            Snapshot output directory. Default: ${DEFAULT_OUT_DIR}
  --peer <url>               Use a Gun peer. Can be repeated.
  --root <name-or-path>       Snapshot only roots matching a manifest name or slash path. Can be repeated.
  --depth <n>                Override all manifest root depths.
  --timeout-ms <n>           Per-node read timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --connect-timeout-ms <n>   Peer connection timeout. Default: ${DEFAULT_CONNECT_TIMEOUT_MS}
  --hard-timeout-ms <n>      Whole-process timeout. Default: ${DEFAULT_HARD_TIMEOUT_MS}
  --max-keys <n>             Max child keys traversed per node. Default: ${DEFAULT_MAX_KEYS_PER_NODE}
  --dry-run                  Print planned backup targets without connecting.
  --help                     Show this help.

Environment:
  GUN_BACKUP_PEERS           Comma or space separated peers.
  GUN_BACKUP_ROOTS           Comma or space separated manifest names or slash paths.
  GUN_BACKUP_MANIFEST        Manifest path.
  GUN_BACKUP_OUT_DIR         Output directory.
  GUN_BACKUP_DEPTH           Override depth.
  GUN_BACKUP_TIMEOUT_MS      Per-node read timeout.
  GUN_BACKUP_CONNECT_TIMEOUT_MS
  GUN_BACKUP_HARD_TIMEOUT_MS
  GUN_BACKUP_MAX_KEYS
  GUN_BACKUP_DEBUG=1        Print phase logs to stderr.
`;
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function parsePositiveInt(value, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    manifest: env.GUN_BACKUP_MANIFEST || DEFAULT_MANIFEST,
    outDir: env.GUN_BACKUP_OUT_DIR || DEFAULT_OUT_DIR,
    peers: splitList(env.GUN_BACKUP_PEERS),
    roots: splitList(env.GUN_BACKUP_ROOTS),
    depth: parsePositiveInt(env.GUN_BACKUP_DEPTH, undefined, 'GUN_BACKUP_DEPTH'),
    timeoutMs: parsePositiveInt(env.GUN_BACKUP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'GUN_BACKUP_TIMEOUT_MS'),
    connectTimeoutMs: parsePositiveInt(
      env.GUN_BACKUP_CONNECT_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS,
      'GUN_BACKUP_CONNECT_TIMEOUT_MS'
    ),
    hardTimeoutMs: parsePositiveInt(
      env.GUN_BACKUP_HARD_TIMEOUT_MS,
      DEFAULT_HARD_TIMEOUT_MS,
      'GUN_BACKUP_HARD_TIMEOUT_MS'
    ),
    maxKeys: parsePositiveInt(env.GUN_BACKUP_MAX_KEYS, DEFAULT_MAX_KEYS_PER_NODE, 'GUN_BACKUP_MAX_KEYS'),
    debug: env.GUN_BACKUP_DEBUG === '1',
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--manifest') {
      options.manifest = argv[++index];
    } else if (arg === '--out-dir') {
      options.outDir = argv[++index];
    } else if (arg === '--peer') {
      options.peers.push(argv[++index]);
    } else if (arg === '--root') {
      options.roots.push(argv[++index]);
    } else if (arg === '--depth') {
      options.depth = parsePositiveInt(argv[++index], undefined, '--depth');
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = parsePositiveInt(argv[++index], DEFAULT_TIMEOUT_MS, '--timeout-ms');
    } else if (arg === '--connect-timeout-ms') {
      options.connectTimeoutMs = parsePositiveInt(
        argv[++index],
        DEFAULT_CONNECT_TIMEOUT_MS,
        '--connect-timeout-ms'
      );
    } else if (arg === '--hard-timeout-ms') {
      options.hardTimeoutMs = parsePositiveInt(argv[++index], DEFAULT_HARD_TIMEOUT_MS, '--hard-timeout-ms');
    } else if (arg === '--max-keys') {
      options.maxKeys = parsePositiveInt(argv[++index], DEFAULT_MAX_KEYS_PER_NODE, '--max-keys');
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.peers = Array.from(new Set((options.peers.length ? options.peers : DEFAULT_PEERS).filter(Boolean)));
  options.roots = Array.from(new Set(options.roots.filter(Boolean)));
  return options;
}

function debugLog(options, message) {
  if (options.debug) {
    console.error(`[gun-backup] ${message}`);
  }
}

async function withGunConsoleNoiseFiltered(options, action) {
  if (options.debug) return action();
  const originalLog = console.log;
  console.log = (...args) => {
    const message = args.map(String).join(' ');
    if (
      message.includes('Hello wonderful person') ||
      message.includes('AXE relay enabled') ||
      message.startsWith('Multicast on ')
    ) {
      return;
    }
    originalLog(...args);
  };
  try {
    return await action();
  } finally {
    console.log = originalLog;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function normalizeRoot(root, index, manifestDefaultDepth, overrideDepth) {
  const pathParts = Array.isArray(root.path)
    ? root.path.map(String).filter(Boolean)
    : splitList(String(root.path || '').replaceAll('/', ' '));
  if (!pathParts.length) {
    throw new Error(`Manifest root at index ${index} is missing path.`);
  }
  return {
    name: root.name || pathParts.join('/'),
    path: pathParts,
    depth: overrideDepth ?? root.depth ?? manifestDefaultDepth ?? 3,
    critical: Boolean(root.critical),
    sensitive: Boolean(root.sensitive),
    notes: root.notes || ''
  };
}

function getNodeFromPath(gun, pathParts) {
  return pathParts.reduce((node, key) => node.get(key), gun);
}

function omitMetaFields(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (!Array.isArray(value) && Object.keys(value).length === 1 && typeof value['#'] === 'string') {
    return { '#': value['#'] };
  }
  const clone = Array.isArray(value) ? [] : {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '_') continue;
    if (typeof child === 'function') continue;
    clone[key] = omitMetaFields(child, seen);
  }
  return clone;
}

function onceWithTimeout(node, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const timer = nativeSetTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true, value: undefined });
    }, timeoutMs);

    node.once(value => {
      if (settled) return;
      settled = true;
      nativeClearTimeout(timer);
      resolve({ timedOut: false, value });
    });
  });
}

async function snapshotNode(node, context, depth, seen, pathParts) {
  const { timedOut, value } = await onceWithTimeout(node, context.timeoutMs);
  const pathLabel = pathParts.join('/');
  if (timedOut) {
    context.warnings.push(`Timed out reading ${pathLabel}`);
    return { _backup: { status: 'timeout', path: pathLabel } };
  }
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const soul = value._?.['#'];
  if (soul) {
    if (seen.has(soul)) {
      return { _link: soul };
    }
    seen.add(soul);
  }

  const cleaned = omitMetaFields(value);
  if (depth <= 0) {
    return cleaned;
  }

  const keys = Object.keys(cleaned).sort();
  const traversedKeys = keys.slice(0, context.maxKeys);
  const result = {};
  if (keys.length > context.maxKeys) {
    result._backup = {
      status: 'truncated',
      traversedKeys: context.maxKeys,
      totalKeys: keys.length,
      path: pathLabel
    };
    context.warnings.push(`Truncated ${pathLabel}: ${keys.length} keys, traversed ${context.maxKeys}`);
  }

  for (const key of traversedKeys) {
    result[key] = await snapshotNode(node.get(key), context, depth - 1, seen, [...pathParts, key]);
  }
  return result;
}

async function waitForPeer(gun, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const eventTarget = gun?._?.root || gun;
    const done = payload => {
      if (settled) return;
      settled = true;
      nativeClearTimeout(timer);
      resolve(payload);
    };
    const timer = nativeSetTimeout(() => done(null), timeoutMs);
    eventTarget.on('hi', peer => done(peer));
  });
}

function peerLabel(peer) {
  if (!peer) return null;
  if (typeof peer === 'string') return peer;
  return peer.url || peer.id || peer.wire?.url || JSON.stringify(peer);
}

async function createGun(peers, options = {}) {
  debugLog(options, 'importing gun/lib/server.js');
  const { gun } = await withGunConsoleNoiseFiltered(options, async () => {
    const moduleResult = await import('gun/lib/server.js');
    const Gun = moduleResult.default || moduleResult;
    debugLog(options, 'constructing Gun client');
    const gun = Gun({
      peers,
      axe: false,
      multicast: false,
      localStorage: false,
      radisk: false,
      file: false
    });
    return { gun };
  });
  debugLog(options, 'Gun client constructed');
  return { gun };
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function runBackup(options) {
  const manifestPath = path.resolve(options.manifest);
  debugLog(options, `reading manifest ${manifestPath}`);
  const manifest = await readJson(manifestPath);
  const roots = (manifest.roots || []).map((root, index) =>
    normalizeRoot(root, index, manifest.defaultDepth, options.depth)
  );
  const rootFilters = new Set(options.roots);
  const selectedRoots = rootFilters.size
    ? roots.filter(root => rootFilters.has(root.name) || rootFilters.has(root.path.join('/')))
    : roots;
  if (!selectedRoots.length) {
    throw new Error(`No roots found in ${manifestPath}`);
  }

  if (options.dryRun) {
    return {
      dryRun: true,
      manifest: manifestPath,
      peers: options.peers,
      roots: selectedRoots.map(({ name, path: rootPath, depth, critical, sensitive }) => ({
        name,
        path: rootPath,
        depth,
        critical,
        sensitive
      }))
    };
  }

  debugLog(options, `creating Gun client for ${options.peers.join(', ')}`);
  const { gun } = await createGun(options.peers, options);
  debugLog(options, 'attaching peer wait');
  const peerWait = waitForPeer(gun, options.connectTimeoutMs);
  debugLog(options, `triggering connection read at ${selectedRoots[0].path.join('/')}`);
  getNodeFromPath(gun, selectedRoots[0].path).once(() => {});
  const connectedPeer = await peerWait;
  if (!connectedPeer) {
    throw new Error(`No Gun peer connected within ${options.connectTimeoutMs}ms.`);
  }
  debugLog(options, `connected to ${peerLabel(connectedPeer)}`);

  const warnings = [];
  const startedAt = new Date();
  const snapshot = {
    schema: '3dvr.portal.gun-known-roots.snapshot.v1',
    capturedAt: startedAt.toISOString(),
    connectedPeer: peerLabel(connectedPeer),
    peers: options.peers,
    manifest: {
      path: manifestPath,
      version: manifest.version || null,
      rootCount: selectedRoots.length
    },
    options: {
      timeoutMs: options.timeoutMs,
      connectTimeoutMs: options.connectTimeoutMs,
      hardTimeoutMs: options.hardTimeoutMs,
      maxKeys: options.maxKeys
    },
    roots: [],
    warnings
  };

  for (const root of selectedRoots) {
    debugLog(options, `snapshotting ${root.path.join('/')} at depth ${root.depth}`);
    const rootStarted = Date.now();
    const context = { timeoutMs: options.timeoutMs, maxKeys: options.maxKeys, warnings };
    const seen = new Set();
    let status = 'ok';
    let data;
    try {
      data = await snapshotNode(getNodeFromPath(gun, root.path), context, root.depth, seen, root.path);
    } catch (error) {
      status = 'error';
      data = { _backup: { status: 'error', message: error.message } };
      warnings.push(`Error reading ${root.path.join('/')}: ${error.message}`);
    }

    snapshot.roots.push({
      name: root.name,
      path: root.path,
      depth: root.depth,
      critical: root.critical,
      sensitive: root.sensitive,
      notes: root.notes,
      status,
      durationMs: Date.now() - rootStarted,
      data
    });
  }

  snapshot.finishedAt = new Date().toISOString();
  snapshot.durationMs = new Date(snapshot.finishedAt).getTime() - startedAt.getTime();

  await mkdir(options.outDir, { recursive: true });
  const fileName = `portal-gun-known-roots-${timestampForFile(startedAt)}.json`;
  const outputPath = path.resolve(options.outDir, fileName);
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  debugLog(options, `writing ${outputPath}`);
  await writeFile(outputPath, serialized, { mode: 0o600 });

  const digest = sha256(serialized);
  await writeFile(`${outputPath}.sha256`, `${digest}  ${fileName}\n`, { mode: 0o600 });

  return {
    dryRun: false,
    outputPath,
    sha256Path: `${outputPath}.sha256`,
    sha256: digest,
    connectedPeer: snapshot.connectedPeer,
    rootCount: snapshot.roots.length,
    warningCount: warnings.length,
    durationMs: snapshot.durationMs
  };
}

export { parseArgs, runBackup };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let exitCode = 0;
  let hardTimer = null;
  try {
    const options = parseArgs();
    hardTimer = nativeSetTimeout(() => {
      console.error(`Gun backup exceeded hard timeout of ${options.hardTimeoutMs}ms.`);
      process.exit(1);
    }, options.hardTimeoutMs);
    if (options.help) {
      console.log(usage());
    } else {
      const result = await runBackup(options);
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    exitCode = 1;
    console.error(error.message);
  } finally {
    if (hardTimer) nativeClearTimeout(hardTimer);
    nativeSetTimeout(() => process.exit(exitCode), 50);
  }
}
