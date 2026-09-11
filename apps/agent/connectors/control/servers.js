const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);
const SERVER_TARGETS = Object.freeze({
  hetzner: { mode: 'local', label: 'Hetzner worker' },
  ovh: { mode: 'ssh', alias: '3dvr-ovh', label: 'OVH control plane' },
  digitalocean: { mode: 'ssh', alias: '3dvr-do', label: 'DigitalOcean fallback' },
});

function memorySnapshot() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    totalBytes: total,
    availableBytes: free,
    usedPercent: total ? Math.round(((total - free) / total) * 1000) / 10 : 0,
  };
}

function localHealth() {
  const [load1, load5, load15] = os.loadavg();
  return {
    ok: true,
    hostname: os.hostname(),
    platform: os.platform(),
    uptimeSeconds: Math.round(os.uptime()),
    load: { one: load1, five: load5, fifteen: load15 },
    memory: memorySnapshot(),
  };
}

function parseRemoteHealth(stdout) {
  const rows = Object.fromEntries(String(stdout || '')
    .split(/\r?\n/)
    .map(line => line.split('='))
    .filter(parts => parts.length >= 2)
    .map(([key, ...rest]) => [key, rest.join('=')]));
  const totalKb = Number(rows.mem_total_kb || 0);
  const availableKb = Number(rows.mem_available_kb || 0);
  return {
    ok: true,
    hostname: rows.hostname || '',
    user: rows.user || '',
    uptimeSeconds: Math.round(Number(rows.uptime_seconds || 0)),
    load: {
      one: Number(rows.load_1 || 0),
      five: Number(rows.load_5 || 0),
      fifteen: Number(rows.load_15 || 0),
    },
    memory: {
      totalBytes: totalKb * 1024,
      availableBytes: availableKb * 1024,
      usedPercent: totalKb ? Math.round(((totalKb - availableKb) / totalKb) * 1000) / 10 : 0,
    },
  };
}

async function remoteHealth(alias) {
  const command = [
    'printf "hostname=%s\\n" "$(hostname)"',
    'printf "user=%s\\n" "$(id -un)"',
    'set -- $(cat /proc/loadavg); printf "load_1=%s\\nload_5=%s\\nload_15=%s\\n" "$1" "$2" "$3"',
    'printf "uptime_seconds=%s\\n" "$(cut -d. -f1 /proc/uptime)"',
    'awk \'/MemTotal:/{print "mem_total_kb=" $2} /MemAvailable:/{print "mem_available_kb=" $2}\' /proc/meminfo',
  ].join('; ');
  const { stdout } = await run('ssh', [
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', alias, command,
  ], { timeout: 8000, maxBuffer: 200_000, env: process.env });
  return parseRemoteHealth(stdout);
}

async function oneServerHealth(name) {
  const target = SERVER_TARGETS[name];
  if (!target) throw new Error(`Unknown server target: ${name}`);
  try {
    const health = target.mode === 'local' ? localHealth() : await remoteHealth(target.alias);
    return { name, label: target.label, ...health };
  } catch (error) {
    return {
      name,
      label: target.label,
      ok: false,
      error: String(error?.message || error).slice(0, 240),
    };
  }
}

async function serversHealth({ servers } = {}) {
  const requested = Array.isArray(servers) && servers.length ? servers : Object.keys(SERVER_TARGETS);
  const unique = [...new Set(requested.map(value => String(value || '').trim().toLowerCase()))];
  unique.forEach(name => {
    if (!SERVER_TARGETS[name]) throw new Error(`Unknown server target: ${name}`);
  });
  const results = await Promise.all(unique.map(oneServerHealth));
  return {
    ok: results.every(result => result.ok),
    servers: results,
  };
}

module.exports = {
  SERVER_TARGETS,
  localHealth,
  parseRemoteHealth,
  serversHealth,
};
