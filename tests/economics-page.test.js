import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const portalRoot = new URL('../', import.meta.url);

describe('3DVR economics page', () => {
  it('frames economics around coordination, abundance, scarcity, and ownership', async () => {
    const page = await readFile(new URL('economics/index.html', portalRoot), 'utf8');

    assert.match(page, /Economics from first principles/);
    assert.match(page, /What does an economy actually need to do\?/);
    assert.match(page, /Money is one coordination technology/);
    assert.match(page, /Digital abundance changes the problem/);
    assert.match(page, /Open source is an economic structure/);
    assert.match(page, /AI makes ownership harder to ignore/);
    assert.match(page, /A 3DVR working hypothesis/);
    assert.match(page, /Questions worth keeping open/);
    assert.match(page, /who owns that productivity gain/i);
  });
});
