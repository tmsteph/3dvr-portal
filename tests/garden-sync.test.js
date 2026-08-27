import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mergeGardenPayloads } from '../garden/sync.js';

const idea = (id, updatedAt, values = {}) => ({
  id,
  text: `Idea ${id}`,
  stage: 'seed',
  why: '',
  nextStep: '',
  focused: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt,
  ...values,
});

describe('Idea Garden encrypted sync', () => {
  it('merges ideas by newest update and keeps one newest focus', () => {
    const merged = mergeGardenPayloads(
      {
        ideas: [
          idea('a', '2026-08-26T10:00:00.000Z', { text: 'new local', focused: true }),
          idea('b', '2026-08-26T08:00:00.000Z'),
        ],
        deleted: [],
      },
      {
        ideas: [
          idea('a', '2026-08-26T09:00:00.000Z', { text: 'old remote' }),
          idea('c', '2026-08-26T11:00:00.000Z', { focused: true }),
        ],
        deleted: [],
      }
    );

    assert.equal(merged.ideas.find(item => item.id === 'a').text, 'new local');
    assert.deepEqual(new Set(merged.ideas.map(item => item.id)), new Set(['a', 'b', 'c']));
    assert.deepEqual(merged.ideas.filter(item => item.focused).map(item => item.id), ['c']);
  });

  it('uses deletion tombstones to prevent stale devices from resurrecting ideas', () => {
    const merged = mergeGardenPayloads(
      {
        ideas: [],
        deleted: [{ id: 'gone', deletedAt: '2026-08-26T12:00:00.000Z' }],
      },
      {
        ideas: [idea('gone', '2026-08-26T11:00:00.000Z')],
        deleted: [],
      }
    );

    assert.equal(merged.ideas.some(item => item.id === 'gone'), false);
    assert.equal(merged.deleted.find(item => item.id === 'gone').deletedAt, '2026-08-26T12:00:00.000Z');
  });

  it('allows a genuinely newer edit to win over an older tombstone', () => {
    const merged = mergeGardenPayloads(
      {
        ideas: [idea('return', '2026-08-26T13:00:00.000Z')],
        deleted: [],
      },
      {
        ideas: [],
        deleted: [{ id: 'return', deletedAt: '2026-08-26T12:00:00.000Z' }],
      }
    );

    assert.equal(merged.ideas.some(item => item.id === 'return'), true);
  });

  it('encrypts the whole payload and does not read a stored password', async () => {
    const source = await readFile(new URL('../garden/sync.js', import.meta.url), 'utf8');

    assert.match(source, /SEA\.encrypt\(serialized, secret\)/);
    assert.match(source, /SEA\.decrypt\(ciphertext, secret\)/);
    assert.match(source, /user\.get\(SYNC_NODE\)\.get\('garden'\)/);
    assert.match(source, /user\?\.recall\?\.\(\{ sessionStorage: true, localStorage: true \}\)/);
    assert.match(source, /verificationNode/);
    assert.match(source, /Encrypted and verified on your account/);
    assert.doesNotMatch(source, /getItem\(['"]password['"]\)/);
    assert.doesNotMatch(source, /user\.auth\(/);
  });
});
