import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('alive dashboard exposes the complete runtime organism', async () => {
  const pageUrl = new URL('../alive/index.html', import.meta.url);
  assert.equal(await fileExists(pageUrl), true, 'alive/index.html should exist');

  const html = await readFile(pageUrl, 'utf8');
  assert.match(html, /3DVR Alive/);
  assert.match(html, /data-organ="inbox"/);
  assert.match(html, /data-organ="outreach"/);
  assert.match(html, /data-organ="worker"/);
  assert.match(html, /data-organ="router"/);
  assert.match(html, /data-organ="supervisor"/);
  assert.match(html, /STALE_AFTER_MS = 180000/);
  assert.match(html, /state = 'ALIVE'/);
  assert.match(html, /state = 'DEGRADED'/);
  assert.match(html, /state = 'OFFLINE'/);
  assert.match(html, /gun\.get\('3dvr-portal'\)\.get\('agentOps'\)\.get\(ownerAlias\)\.get\('runtime'\)/);
  assert.match(html, /runtimeNode\.get\(name\)\.on/);
  assert.match(html, /href="\/admin\/"/);
  assert.match(html, /href="\/context-hq\/"/);
});
