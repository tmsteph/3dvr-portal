import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexUrl = new URL('../index.html', import.meta.url);

describe('auth entrypoints', () => {
  it('sends the homepage auth modal directly to the canonical sign-in page', async () => {
    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /window\.location\.href='\/sign-in\.html'/);
    assert.doesNotMatch(html, /window\.location\.href='\/auth\/sign-in\.html'/);
  });
});
