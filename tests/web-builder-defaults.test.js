import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeDefaults } from '../src/web-builder/defaults.js';

test('summarizeDefaults returns empty defaults when no data is present', () => {
  const result = summarizeDefaults();

  assert.deepEqual(result.defaults, { openai: '', vercel: '', github: '' });
  assert.equal(result.hasPublic, false);
  assert.equal(result.hasEncrypted, false);
});

test('summarizeDefaults detects public defaults', () => {
  const result = summarizeDefaults({ apiKey: 'sk-test', vercelToken: 'vercel', githubToken: 'ghp' });

  assert.deepEqual(result.defaults, { openai: 'sk-test', vercel: 'vercel', github: 'ghp' });
  assert.equal(result.hasPublic, true);
  assert.equal(result.hasEncrypted, false);
});

test('summarizeDefaults flags encrypted defaults', () => {
  const result = summarizeDefaults({ apiKeyCipher: 'cipher', vercelTokenCipher: 'cipher' });

  assert.deepEqual(result.defaults, { openai: '', vercel: '', github: '' });
  assert.equal(result.hasPublic, false);
  assert.equal(result.hasEncrypted, true);
});
