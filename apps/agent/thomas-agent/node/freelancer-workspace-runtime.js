const { randomBytes } = require('node:crypto');
const { mkdir, readFile, writeFile, chmod, readdir } = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');

const execFileAsync = promisify(execFile);
const SAFE_ID = /^[a-z0-9][a-z0-9-]{2,62}$/;
const DEFAULT_IMAGE = 'lscr.io/linuxserver/webtop:debian-xfce';

function normalizeText(value = '', max = 300) {
  return String(value || '').trim().slice(0, max);
}

function validateWorkspaceId(value = '') {
  const workspaceId = normalizeText(value, 80).toLowerCase();
  if (!SAFE_ID.test(workspaceId)) throw new Error('Invalid freelancer workspace id.');
  return workspaceId;
}

function containerNameForWorkspace(workspaceId) {
  return `3dvr-${validateWorkspaceId(workspaceId)}`;
}

function buildDockerRunArgs(metadata, env = process.env) {
  const bindAddress = normalizeText(env.FREELANCER_WORKSPACE_BIND_ADDRESS, 80) || '127.0.0.1';
  const timezone = normalizeText(metadata.timezone, 80) || 'America/Los_Angeles';
  const image = normalizeText(env.FREELANCER_WORKSPACE_IMAGE, 240) || DEFAULT_IMAGE;
  const configDir = path.join(metadata.rootDir, 'config');
  return [
    'run', '-d',
    '--name', metadata.containerName,
    '--label', '3dvr.kind=freelancer-workspace',
    '--label', `3dvr.workspace=${metadata.workspaceId}`,
    '--restart', 'unless-stopped',
    '--shm-size', '1g',
    '--memory', normalizeText(env.FREELANCER_WORKSPACE_MEMORY, 40) || '1536m',
    '--cpus', normalizeText(env.FREELANCER_WORKSPACE_CPUS, 20) || '1.0',
    '-e', 'PUID=1000',
    '-e', 'PGID=1000',
    '-e', `TZ=${timezone}`,
    '-e', 'CUSTOM_USER=freelancer',
    '-e', `PASSWORD=${metadata.password}`,
    '-e', 'START_DOCKER=false',
    '-e', `TITLE=3DVR Work · ${metadata.workspaceId}`,
    '-p', `${bindAddress}:${metadata.port}:3001`,
    '-v', `${configDir}:/config`,
    image,
  ];
}

async function defaultRun(command, args = []) {
  try {
    const result = await execFileAsync(command, args, { maxBuffer: 1024 * 1024 * 4 });
    return { ok: true, stdout: result.stdout || '', stderr: result.stderr || '' };
  } catch (error) {
    return { ok: false, code: error.code, stdout: error.stdout || '', stderr: error.stderr || error.message || '' };
  }
}

async function canListen(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ port, host }, () => server.close(() => resolve(true)));
  });
}

function workspaceRoot(env = process.env) {
  return normalizeText(env.FREELANCER_WORKSPACE_ROOT, 400) || '/var/lib/3dvr/freelancer-workspaces';
}

function metadataPath(rootDir) {
  return path.join(rootDir, '.workspace.json');
}

async function readMetadata(rootDir) {
  try {
    return JSON.parse(await readFile(metadataPath(rootDir), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function allocatedWorkspacePorts(env = process.env) {
  const root = workspaceRoot(env);
  const allocated = new Set();
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metadata = await readMetadata(path.join(root, entry.name)).catch(() => null);
    if (Number.isInteger(Number(metadata?.port))) allocated.add(Number(metadata.port));
  }
  return allocated;
}

async function findAvailablePort(env = process.env) {
  const start = Math.max(1024, Number(env.FREELANCER_WORKSPACE_PORT_START) || 32000);
  const end = Math.min(65535, Number(env.FREELANCER_WORKSPACE_PORT_END) || 32999);
  const allocated = await allocatedWorkspacePorts(env);
  for (let port = start; port <= end; port += 1) {
    if (!allocated.has(port) && await canListen(port)) return port;
  }
  throw new Error('No freelancer workspace ports are available.');
}

function publicUrl(metadata, env = process.env) {
  const configured = normalizeText(env.FREELANCER_WORKSPACE_PUBLIC_BASE_URL, 400).replace(/\/+$/g, '');
  if (configured) return `${configured}/${metadata.workspaceId}/`;
  const bindAddress = normalizeText(env.FREELANCER_WORKSPACE_BIND_ADDRESS, 80) || '127.0.0.1';
  return `https://${bindAddress}:${metadata.port}/`;
}

async function writeMetadata(rootDir, metadata) {
  await mkdir(path.join(rootDir, 'config'), { recursive: true, mode: 0o700 });
  const target = metadataPath(rootDir);
  await writeFile(target, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  await chmod(target, 0o600).catch(() => {});
}

function statusFromInspect(result) {
  if (!result.ok) return 'missing';
  const status = normalizeText(result.stdout, 40).toLowerCase();
  if (status === 'true') return 'running';
  if (status === 'false') return 'stopped';
  return 'unknown';
}

function createFreelancerWorkspaceRuntime({ env = process.env, run = defaultRun, now = () => new Date() } = {}) {
  async function resolve(workspaceId) {
    const id = validateWorkspaceId(workspaceId);
    const rootDir = path.join(workspaceRoot(env), id);
    const existing = await readMetadata(rootDir);
    return { id, rootDir, existing };
  }

  async function status(workspaceId) {
    const { id, existing } = await resolve(workspaceId);
    if (!existing) return { ok: true, workspaceId: id, status: 'not_provisioned' };
    const inspect = await run('docker', ['inspect', '-f', '{{.State.Running}}', existing.containerName]);
    return {
      ok: true,
      workspaceId: id,
      status: statusFromInspect(inspect),
      url: publicUrl(existing, env),
      createdAt: existing.createdAt,
      lastStartedAt: existing.lastStartedAt || existing.createdAt,
    };
  }

  async function provision(workspaceId, options = {}) {
    const { id, rootDir, existing } = await resolve(workspaceId);
    if (existing) return status(id);
    const port = await findAvailablePort(env);
    const createdAt = now().toISOString();
    const metadata = {
      version: 1,
      workspaceId: id,
      containerName: containerNameForWorkspace(id),
      rootDir,
      port,
      timezone: normalizeText(options.timezone, 80) || 'America/Los_Angeles',
      password: randomBytes(24).toString('base64url'),
      createdAt,
      lastStartedAt: createdAt,
    };
    await writeMetadata(rootDir, metadata);
    const result = await run('docker', buildDockerRunArgs(metadata, env));
    if (!result.ok) throw new Error(`Workspace container failed to start: ${normalizeText(result.stderr, 1000)}`);
    return status(id);
  }

  async function start(workspaceId) {
    const { id, rootDir, existing } = await resolve(workspaceId);
    if (!existing) throw new Error('Workspace is not provisioned.');
    const result = await run('docker', ['start', existing.containerName]);
    if (!result.ok) throw new Error(`Workspace failed to start: ${normalizeText(result.stderr, 1000)}`);
    existing.lastStartedAt = now().toISOString();
    await writeMetadata(rootDir, existing);
    return status(id);
  }

  async function stop(workspaceId) {
    const { id, existing } = await resolve(workspaceId);
    if (!existing) return { ok: true, workspaceId: id, status: 'not_provisioned' };
    const result = await run('docker', ['stop', '--time', '20', existing.containerName]);
    if (!result.ok && !/No such container/i.test(result.stderr)) {
      throw new Error(`Workspace failed to stop: ${normalizeText(result.stderr, 1000)}`);
    }
    return status(id);
  }

  async function session(workspaceId) {
    const { id, existing } = await resolve(workspaceId);
    if (!existing) throw new Error('Workspace is not provisioned.');
    const current = await status(id);
    return {
      ...current,
      username: 'freelancer',
      password: existing.password,
      warning: 'Treat these desktop credentials like a password. They are not stored in portal state.',
    };
  }

  return { status, provision, start, stop, session };
}

module.exports = {
  DEFAULT_IMAGE,
  buildDockerRunArgs,
  containerNameForWorkspace,
  createFreelancerWorkspaceRuntime,
  validateWorkspaceId,
};
