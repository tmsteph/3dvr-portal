import assert from 'node:assert/strict';
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
