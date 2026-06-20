import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseEnvLine(line = '') {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const separator = trimmed.indexOf('=');
  if (separator <= 0) return null;

  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

export function loadLocalEnv({ cwd = process.cwd(), override = false } = {}) {
  const path = resolve(cwd, '.env.local');
  if (!existsSync(path)) {
    return { loaded: false, path, keys: [] };
  }

  const keys = [];
  const content = readFileSync(path, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed) return;
    const [key, value] = parsed;
    if (!override && process.env[key] != null) return;
    process.env[key] = value;
    keys.push(key);
  });

  return { loaded: true, path, keys };
}
