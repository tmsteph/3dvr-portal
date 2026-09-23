import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const notesUrl = new URL('../notes/index.html', import.meta.url);
const homeUrl = new URL('../index.html', import.meta.url);

test('master notes exposes durable capture spaces and quick inbox capture', async () => {
  const html = await readFile(notesUrl, 'utf8');
  assert.match(html, /Master Notes/);
  assert.match(html, /id="quick-capture-form"/);
  assert.match(html, /const DEFAULT_FOLDER_NAME = 'Inbox'/);
  for (const label of ['Now', 'Projects', 'Ideas', 'Decisions', 'People & commitments', 'Reference', 'Someday \/ Maybe']) {
    assert.match(html, new RegExp(`name: '${label}'`));
  }
  assert.match(html, /capturedFrom: 'portal-master-notes'/);
  assert.match(html, /rememberDurableCapture/);
  assert.match(html, /organismRemember: true/);
});

test('portal launcher exposes Master Notes', async () => {
  const html = await readFile(homeUrl, 'utf8');
  assert.match(html, /href="\/notes\/".*<strong>Master Notes<\/strong>/);
});
