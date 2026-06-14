import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  hasEncryptedDefault,
  listAvailableDefaultTargets,
  readDefaultSecret
} from '../web-builder-app/defaults.js';

test('readDefaultSecret prefers plain shared default fields', () => {
  const record = {
    apiKey: ' sk-plain ',
    openaiApiKey: 'sk-fallback'
  };

  assert.equal(readDefaultSecret(record, 'openai'), 'sk-plain');
});

test('readDefaultSecret falls back to alternate field names', () => {
  const record = {
    openaiApiKey: 'sk-alt'
  };

  assert.equal(readDefaultSecret(record, 'openai'), 'sk-alt');
});

test('hasEncryptedDefault detects string and object cipher payloads', () => {
  assert.equal(hasEncryptedDefault({ apiKeyCipher: 'SEA{...}' }, 'openai'), true);
  assert.equal(hasEncryptedDefault({ vercelTokenCipher: { ct: '...' } }, 'vercel'), true);
  assert.equal(hasEncryptedDefault({ githubTokenCipher: '' }, 'github'), false);
});

test('listAvailableDefaultTargets supports plain-only mode', () => {
  const record = {
    apiKey: 'sk-plain',
    githubTokenCipher: 'SEA{...}'
  };

  assert.deepEqual(
    listAvailableDefaultTargets(record, { includePlain: true, includeCipher: false }),
    ['openai']
  );
});

test('listAvailableDefaultTargets supports cipher-only mode', () => {
  const record = {
    apiKey: 'sk-plain',
    vercelTokenCipher: { ct: '...' }
  };

  assert.deepEqual(
    listAvailableDefaultTargets(record, { includePlain: false, includeCipher: true }),
    ['vercel']
  );
});

test('web builder waits for shared defaults before missing-key warning', async () => {
  const app = await readFile(new URL('../web-builder-app/app.js', import.meta.url), 'utf8');

  assert.match(app, /DEFAULTS_LOAD_TIMEOUT_MS/);
  assert.match(app, /readDefaultsConfig\(timeoutMs\)/);
  assert.match(app, /hasDefaultRecord\(data\)/);
  assert.match(app, /await loadDefaultsWithOptions\(\{ force: false, silent: true, timeoutMs: DEFAULTS_LOAD_TIMEOUT_MS \}\)/);
});
