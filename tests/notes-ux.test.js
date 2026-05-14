import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('notes page ships the focused UX layer and visible creation path', async () => {
  const html = await readFile(new URL('../notes/index.html', import.meta.url), 'utf8');

  assert.match(html, /href="\.\/styles\.css\?v=notes-ux-20260514"/);
  assert.match(html, /id="active-space-label"/);
  assert.match(html, /id="active-note-label"/);
  assert.match(html, /id="notes-sync-status"/);
  assert.match(html, /id="notes-save-status"/);
  assert.match(html, /id="actionbar-new-note"/);
  assert.match(html, /id="empty-new-note"/);
  assert.match(html, /Capture the next useful thought/);
  assert.match(html, /findFolderByNormalizedName\(normalizeFolderName\(DEFAULT_FOLDER_NAME\)\)/);
  assert.match(html, /optimisticNote/);
  assert.match(html, /Offline draft/);
  assert.match(html, /currentNoteId/);
  assert.doesNotMatch(html, /id="new-note-button" disabled/);
});

test('notes UX CSS overrides stale global note-title rules', async () => {
  const css = await readFile(new URL('../notes/styles.css', import.meta.url), 'utf8');

  assert.match(css, /body\.notes-page #note-title\.note-title/);
  assert.match(css, /background:\s*transparent/);
  assert.match(css, /border-bottom:\s*0/);
  assert.match(css, /\.notes-actionbar/);
  assert.match(css, /position:\s*static/);
  assert.match(css, /\.empty-state__actions/);
  assert.match(css, /Saved to sync queue|notes-save-status/);
});
