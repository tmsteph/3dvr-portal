import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('homepage restores the interactive portal spinner as navigation', async () => {
  const homepage = await read('index.html');

  assert.match(homepage, /<script src="\/portal-swirl-logo\.js" defer><\/script>/);
  assert.match(homepage, /data-portal-swirl-logo/);
  assert.match(homepage, /data-spinner-nav-toggle/);
  assert.match(homepage, /href="\/life\/"[^>]*>Day<\/a>/);
  assert.match(homepage, /href="\/growth-desk\/"[^>]*>Work<\/a>/);
  assert.match(homepage, /href="\/forge\/"[^>]*>Build<\/a>/);
  assert.match(homepage, /data-spinner-open-apps[^>]*>Apps<\/button>/);
  assert.match(homepage, /aria-expanded="false"/);
});
