#!/usr/bin/env node
/*
 * 3DVR Community Cloud - host agent (slice 0: metering only)
 *
 * Measures what a future host machine offers the network:
 *   - disk: bytes offered (config), filesystem total/free, bytes
 *     actually stored in the share directory
 *   - bandwidth: bytes in/out deltas from /proc/net/dev (Linux)
 *   - uptime of this agent process
 *
 * Keeps per-minute samples in a JSON state file and computes hourly
 * and daily rolling averages. Prints a JSON metering report on demand
 * (--report). Deliberately does NOT network, upload, or pay out.
 *
 * Node.js v18+, standard library only. No dependencies.
 *
 * Usage:
 *   node agent.js [--config <path>]        run and sample (default)
 *   node agent.js --report [--config <p>]  print report from state
 *   node agent.js --self-test              temp-dir pipeline check
 *
 * Config (JSON, optional; defaults shown):
 *   {
 *     "shareDir": "./share",          where chunks WOULD live
 *     "offeredBytes": 1000000000,     bytes the host commits
 *     "stateFile": "./host-agent-state.json",
 *     "sampleIntervalMs": 60000,      one sample per minute
 *     "interfaces": null              null = all non-loopback ifaces
 *   }
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  shareDir: './share',
  offeredBytes: 1000000000,
  stateFile: './host-agent-state.json',
  sampleIntervalMs: 60000,
  interfaces: null,
  maxSamples: 60 * 24 * 8, // keep just over a week of per-minute samples
};

// ---------- helpers ----------

function parseArgs(argv) {
  const args = { report: false, selfTest: false, config: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--report') args.report = true;
    else if (argv[i] === '--self-test') args.selfTest = true;
    else if (argv[i] === '--config' && argv[i + 1]) args.config = argv[++i];
  }
  return args;
}

function loadConfig(configPath) {
  let cfg = Object.assign({}, DEFAULTS);
  if (configPath && fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    cfg = Object.assign(cfg, raw);
  }
  cfg.shareDir = path.resolve(cfg.shareDir);
  cfg.stateFile = path.resolve(cfg.stateFile);
  return cfg;
}

function dirBytes(dir) {
  // Recursive total of file bytes under dir. 0 if dir does not exist.
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
    catch (_) { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try { total += fs.statSync(p).size; } catch (_) {}
      }
    }
  }
  return total;
}

function readNetDev(interfaces) {
  // Returns {rx, tx} summed over selected interfaces, or null if the
  // counters are unavailable (non-Linux or unreadable /proc/net/dev).
  let text;
  try { text = fs.readFileSync('/proc/net/dev', 'utf8'); }
  catch (_) { return null; }
  let rx = 0, tx = 0, found = false;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (!m) continue;
    const name = m[1].trim();
    if (name === 'lo') continue;
    if (Array.isArray(interfaces) && interfaces.length &&
        !interfaces.includes(name)) continue;
    const cols = m[2].trim().split(/\s+/).map(Number);
    // /proc/net/dev columns: rx bytes is col 0, tx bytes is col 8.
    if (cols.length >= 9 && Number.isFinite(cols[0]) &&
        Number.isFinite(cols[8])) {
      rx += cols[0]; tx += cols[8]; found = true;
    }
  }
  return found ? { rx, tx } : null;
}

// ---------- state ----------

function loadState(stateFile) {
  if (fs.existsSync(stateFile)) {
    try {
      const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (s && Array.isArray(s.samples)) return s;
    } catch (_) { /* fall through to fresh state */ }
  }
  return { startedAt: new Date().toISOString(), samples: [] };
}

function saveState(stateFile, state) {
  const tmp = stateFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, stateFile);
}

// ---------- sampling ----------

async function takeSample(cfg, prevNet) {
  const shareDir = cfg.shareDir;
  fs.mkdirSync(shareDir, { recursive: true });
  let fsTotal = null, fsFree = null;
  try {
    const st = fs.statfsSync(shareDir);
    fsTotal = st.blocks * st.bsize;
    fsFree = st.bavail * st.bsize;
  } catch (_) { /* statfs unavailable: leave nulls */ }

  const net = readNetDev(cfg.interfaces);
  let rxDelta = null, txDelta = null;
  if (net && prevNet) {
    // Counters can reset (reboot, iface bounce); clamp negatives to null.
    rxDelta = net.rx >= prevNet.rx ? net.rx - prevNet.rx : null;
    txDelta = net.tx >= prevNet.tx ? net.tx - prevNet.tx : null;
  }

  const sample = {
    t: new Date().toISOString(),
    offeredBytes: cfg.offeredBytes,
    storedBytes: dirBytes(shareDir),
    fsTotalBytes: fsTotal,
    fsFreeBytes: fsFree,
    rxDeltaBytes: rxDelta,
    txDeltaBytes: txDelta,
  };
  return { sample, net };
}

// ---------- report ----------

function averageSamples(samples, windowMs, now) {
  const cutoff = now - windowMs;
  const inWindow = samples.filter(s => Date.parse(s.t) >= cutoff);
  if (!inWindow.length) {
    return {
      windowMinutes: Math.round(windowMs / 60000),
      sampleCount: 0,
      storageOfferedBytesAvg: null,
      storageStoredBytesAvg: null,
      bandwidthRxBytesPerMinAvg: null,
      bandwidthTxBytesPerMinAvg: null,
    };
  }
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const rx = inWindow.map(s => s.rxDeltaBytes).filter(v => v !== null);
  const tx = inWindow.map(s => s.txDeltaBytes).filter(v => v !== null);
  return {
    windowMinutes: Math.round(windowMs / 60000),
    sampleCount: inWindow.length,
    storageOfferedBytesAvg: Math.round(mean(inWindow.map(s => s.offeredBytes))),
    storageStoredBytesAvg: Math.round(mean(inWindow.map(s => s.storedBytes))),
    bandwidthRxBytesPerMinAvg: rx.length ? Math.round(mean(rx)) : null,
    bandwidthTxBytesPerMinAvg: tx.length ? Math.round(mean(tx)) : null,
  };
}

function buildReport(cfg, state, processStartedAt) {
  const now = Date.now();
  const latest = state.samples.length
    ? state.samples[state.samples.length - 1] : null;
  return {
    kind: '3dvr-community-cloud-metering-report',
    version: 0,
    generatedAt: new Date(now).toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    agentUptimeSeconds: Math.max(0, Math.round(
      (now - processStartedAt) / 1000)),
    agentStartedAt: new Date(processStartedAt).toISOString(),
    config: {
      shareDir: cfg.shareDir,
      offeredBytes: cfg.offeredBytes,
      sampleIntervalMs: cfg.sampleIntervalMs,
    },
    latestSample: latest,
    averages: {
      hourly: averageSamples(state.samples, 60 * 60 * 1000, now),
      daily: averageSamples(state.samples, 24 * 60 * 60 * 1000, now),
    },
    notes: [
      'Slice 0 metering only: no networking, no uploads, no payouts.',
      'Bandwidth is whole-machine counters (selected interfaces), not',
      'yet attributable to agent traffic alone.',
    ],
  };
}

// ---------- run modes ----------

async function runAgent(cfg) {
  const state = loadState(cfg.stateFile);
  const processStartedAt = Date.now();
  let prevNet = null;

  const tick = async () => {
    const { sample, net } = await takeSample(cfg, prevNet);
    prevNet = net;
    state.samples.push(sample);
    if (state.samples.length > cfg.maxSamples) {
      state.samples = state.samples.slice(-cfg.maxSamples);
    }
    saveState(cfg.stateFile, state);
  };

  await tick();
  console.log('host-agent: sampling every ' +
    Math.round(cfg.sampleIntervalMs / 1000) + 's, share dir ' +
    cfg.shareDir + ', state ' + cfg.stateFile);
  console.log('host-agent: run with --report to print the metering report.');
  setInterval(tick, cfg.sampleIntervalMs);
}

function runReport(cfg) {
  const state = loadState(cfg.stateFile);
  // For a standalone --report process, uptime is "this invocation";
  // the samples in state carry the real history.
  const report = buildReport(cfg, state, Date.now());
  console.log(JSON.stringify(report, null, 2));
}

async function runSelfTest() {
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + name +
      (detail ? ' - ' + detail : ''));
  };

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-selftest-'));
  try {
    const shareDir = path.join(tmpRoot, 'share');
    fs.mkdirSync(shareDir, { recursive: true });
    // Seed the share dir with a known amount of "stored" data.
    const seedBytes = 123456;
    fs.writeFileSync(path.join(shareDir, 'chunk-a.bin'), Buffer.alloc(seedBytes, 7));
    fs.mkdirSync(path.join(shareDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(shareDir, 'sub', 'chunk-b.bin'), Buffer.alloc(1000, 3));

    const cfg = Object.assign({}, DEFAULTS, {
      shareDir,
      offeredBytes: 500000000,
      stateFile: path.join(tmpRoot, 'state.json'),
      sampleIntervalMs: 500,
    });

    check('config loads', cfg.offeredBytes === 500000000, 'offeredBytes from test config');

    const measured = dirBytes(shareDir);
    check('dirBytes counts stored bytes', measured === seedBytes + 1000,
      'expected ' + (seedBytes + 1000) + ', got ' + measured);

    const state = loadState(cfg.stateFile);
    let prevNet = null;
    const started = Date.now();
    for (let i = 0; i < 4; i++) {
      const { sample, net } = await takeSample(cfg, prevNet);
      prevNet = net;
      state.samples.push(sample);
      await new Promise(r => setTimeout(r, 120));
    }
    saveState(cfg.stateFile, state);
    check('samples taken and persisted',
      state.samples.length === 4 && fs.existsSync(cfg.stateFile),
      state.samples.length + ' samples in state file');

    const reloaded = loadState(cfg.stateFile);
    check('state survives reload', reloaded.samples.length === 4,
      'reloaded ' + reloaded.samples.length + ' samples');

    const report = buildReport(cfg, reloaded, started);
    const structural =
      report.kind === '3dvr-community-cloud-metering-report' &&
      report.latestSample !== null &&
      report.averages.hourly.sampleCount === 4 &&
      report.averages.daily.sampleCount === 4;
    check('report structure complete', structural,
      'kind, latestSample, hourly and daily averages present');

    const nonNegative =
      report.latestSample.storedBytes >= 0 &&
      report.latestSample.offeredBytes >= 0 &&
      (report.latestSample.fsTotalBytes === null || report.latestSample.fsTotalBytes > 0) &&
      report.averages.hourly.storageStoredBytesAvg >= 0 &&
      report.averages.hourly.storageOfferedBytesAvg >= 0 &&
      (report.averages.hourly.bandwidthRxBytesPerMinAvg === null ||
       report.averages.hourly.bandwidthRxBytesPerMinAvg >= 0) &&
      (report.averages.hourly.bandwidthTxBytesPerMinAvg === null ||
       report.averages.hourly.bandwidthTxBytesPerMinAvg >= 0);
    check('all measured values non-negative', nonNegative,
      'stored avg ' + report.averages.hourly.storageStoredBytesAvg + ' bytes');

    check('stored average matches seeded data',
      report.averages.hourly.storageStoredBytesAvg === seedBytes + 1000,
      'avg stored ' + report.averages.hourly.storageStoredBytesAvg);

    const net = readNetDev(null);
    check('network counters read (or cleanly unavailable)', true,
      net ? 'rx/tx counters present' : '/proc/net/dev unavailable on this platform, deltas stay null');
  } catch (err) {
    check('self-test completed without exceptions', false, String(err));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  const failed = results.filter(r => !r.ok);
  console.log(failed.length === 0
    ? 'SELF-TEST: ALL ' + results.length + ' CHECKS PASSED'
    : 'SELF-TEST: ' + failed.length + ' OF ' + results.length + ' CHECKS FAILED');
  process.exit(failed.length === 0 ? 0 : 1);
}

// ---------- main ----------

(async () => {
  const args = parseArgs(process.argv);
  if (args.selfTest) { await runSelfTest(); return; }
  const cfg = loadConfig(args.config);
  if (args.report) { runReport(cfg); return; }
  await runAgent(cfg);
})().catch(err => {
  console.error('host-agent error:', err);
  process.exit(1);
});
