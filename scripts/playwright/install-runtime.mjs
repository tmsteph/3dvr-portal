import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';

const DEFAULT_BROWSERS = ['chromium', 'firefox'];

export function parseBrowserTargets(value = '', fallback = DEFAULT_BROWSERS) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return [...fallback];
  }
  const targets = normalized.split(/\s+/).map(item => item.trim()).filter(Boolean);
  return targets.length ? Array.from(new Set(targets)) : [...fallback];
}

export function isTermuxRuntime(env = process.env, platform = process.platform) {
  if (platform === 'android') return true;
  const termuxVersion = typeof env.TERMUX_VERSION === 'string' ? env.TERMUX_VERSION.trim() : '';
  if (termuxVersion) return true;
  const prefix = typeof env.PREFIX === 'string' ? env.PREFIX : '';
  return prefix.includes('/com.termux/');
}

export function shouldInstallWithDeps(
  env = process.env,
  platform = process.platform,
  canInstallDeps = true
) {
  const forceFlag = typeof env.PLAYWRIGHT_INSTALL_DEPS === 'string'
    ? env.PLAYWRIGHT_INSTALL_DEPS.trim().toLowerCase()
    : '';
  if (forceFlag === '0' || forceFlag === 'false' || forceFlag === 'no') {
    return false;
  }
  if (forceFlag === '1' || forceFlag === 'true' || forceFlag === 'yes') {
    return true;
  }
  return platform === 'linux' && canInstallDeps;
}

export function buildInstallArgs({ browsers = DEFAULT_BROWSERS, withDeps = false } = {}) {
  const args = ['playwright', 'install'];
  if (withDeps) {
    args.push('--with-deps');
  }
  args.push(...browsers);
  return args;
}

function runNpx(args) {
  const result = spawnSync('npx', args, {
    stdio: 'inherit',
    env: process.env
  });
  return typeof result.status === 'number' ? result.status : 1;
}

function canInstallLinuxDepsWithSudo() {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    return true;
  }
  const sudoProbe = spawnSync('sudo', ['-n', 'true'], {
    stdio: 'ignore',
    env: process.env
  });
  return sudoProbe.status === 0;
}

export function installPlaywrightRuntime() {
  if (isTermuxRuntime()) {
    throw new Error(
      'Detected Termux runtime. Use `npm run playwright:install` to install browsers inside Debian proot.'
    );
  }

  const browsers = parseBrowserTargets(process.env.PLAYWRIGHT_BROWSERS);
  const withDeps = shouldInstallWithDeps(
    process.env,
    process.platform,
    canInstallLinuxDepsWithSudo()
  );
  if (!withDeps && process.platform === 'linux') {
    console.info('Skipping --with-deps because sudo is unavailable in this environment.');
  }
  let status = runNpx(buildInstallArgs({ browsers, withDeps }));
  if (status === 0 || !withDeps) {
    return status;
  }

  console.warn('Playwright install with --with-deps failed. Retrying without system dependency install.');
  status = runNpx(buildInstallArgs({ browsers, withDeps: false }));
  return status;
}

const isMainModule = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  try {
    const status = installPlaywrightRuntime();
    process.exit(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
