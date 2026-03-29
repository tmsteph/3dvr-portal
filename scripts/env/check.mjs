#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_KEYS = [
  'PORTAL_ORIGIN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
];

function parseArgs(argv) {
  const result = {
    file: null,
    keys: [...REQUIRED_KEYS],
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file' && argv[index + 1]) {
      result.file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--file=')) {
      result.file = arg.slice('--file='.length);
      continue;
    }

    if (arg === '--keys' && argv[index + 1]) {
      result.keys = argv[index + 1]
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg.startsWith('--keys=')) {
      result.keys = arg
        .slice('--keys='.length)
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);
    }
  }

  return result;
}

function parseEnvText(text) {
  const values = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

async function loadFileConfig(filePath) {
  if (!filePath) {
    if (existsSync(resolve(process.cwd(), '.env.local'))) {
      filePath = '.env.local';
    } else if (existsSync(resolve(process.cwd(), '.env'))) {
      filePath = '.env';
    } else {
      return {};
    }
  }

  const resolved = resolve(process.cwd(), filePath);
  if (!existsSync(resolved)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  return parseEnvText(await readFile(resolved, 'utf8'));
}

function isPresent(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return false;
  }

  return !/^replace_me/i.test(text) && !/^changeme/i.test(text);
}

async function main() {
  const { file, keys } = parseArgs(process.argv);
  const fileConfig = await loadFileConfig(file);
  const config = { ...process.env, ...fileConfig };
  const missing = keys.filter((key) => !isPresent(config[key]));

  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Env check passed for ${keys.length} keys${file ? ` from ${file}` : ''}.`);
}

await main();
