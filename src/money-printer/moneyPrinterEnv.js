import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function parseMoneyPrinterEnvLine(line = '') {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
    return null;
  }

  const splitAt = trimmed.indexOf('=');
  const key = trimmed.slice(0, splitAt).trim();
  let value = trimmed.slice(splitAt + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function getMoneyPrinterEnvFilePaths(rootDir = process.cwd(), env = process.env) {
  const homeDir = env.HOME || os.homedir();
  const candidates = [
    path.resolve(rootDir, '.env'),
    homeDir ? path.resolve(homeDir, '.config', '3dvr', 'money-printer.env') : '',
    path.resolve(rootDir, '.env.local')
  ];

  if (env.MONEY_PRINTER_ENV_FILE) {
    candidates.push(path.resolve(env.MONEY_PRINTER_ENV_FILE));
  }

  return [...new Set(candidates.filter(Boolean))];
}

export async function loadMoneyPrinterEnv(rootDir = process.cwd(), env = process.env) {
  const merged = {};
  const loadedFiles = [];

  for (const filePath of getMoneyPrinterEnvFilePaths(rootDir, env)) {
    if (!existsSync(filePath)) continue;
    loadedFiles.push(filePath);
    const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/);
    for (const line of lines) {
      const entry = parseMoneyPrinterEnvLine(line);
      if (entry) {
        merged[entry[0]] = entry[1];
      }
    }
  }

  for (const [key, value] of Object.entries(merged)) {
    if (env[key] === undefined || env[key] === '') {
      env[key] = value;
    }
  }

  return {
    loadedFiles,
    keysLoaded: Object.keys(merged)
  };
}
