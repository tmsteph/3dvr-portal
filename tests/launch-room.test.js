import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('launch room ships a local-first Movement Brief flow', async () => {
  const html = await readFile(new URL('../launch-room/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../launch-room/app.js', import.meta.url), 'utf8');

  assert.match(html, /3DVR Launch Room/);
  assert.match(html, /Purpose → Vision → Movement → Project/);
  assert.match(html, /id="movementName"/);
  assert.match(html, /id="worldPain"/);
  assert.match(html, /id="worldWish"/);
  assert.match(html, /id="firstAudience"/);
  assert.match(html, /id="tinyProject"/);
  assert.match(html, /Movement Brief/);
  assert.match(html, /Launch Checklist/);
  assert.match(html, /Next 3 Actions/);

  assert.match(app, /STORAGE_KEY = '3dvr\.launch-room\.movement-brief\.v1'/);
  assert.match(app, /function buildBrief/);
  assert.match(app, /localStorage/);
  assert.match(app, /replaceChildren/);
});
