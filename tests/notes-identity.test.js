import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const notesUrl = new URL('../notes/index.html', import.meta.url);

describe('notes identity storage', () => {
  it('scopes notes to signed-in users or guest ids instead of writing new notes to shared roots', async () => {
    const html = await readFile(notesUrl, 'utf8');

    assert.match(html, /<script src="\/auth-identity\.js"><\/script>/);
    assert.match(html, /function resolveNotesWorkspace\(\)/);
    assert.match(html, /activeUser\.get\('noteFolders'\)/);
    assert.match(html, /activeUser\.get\('notes'\)/);
    assert.match(html, /portalRoot\.get\('notesUsers'\)\.get\(userKey\)/);
    assert.match(html, /gun\.get\('3dvr-guests'\)\.get\(guestId\)/);
    assert.match(html, /const folderSources = uniqueSources\(\[foldersPrimary\]\)/);
    assert.match(html, /const noteSources = uniqueSources\(\[notesPrimary\]\)/);
    assert.match(html, /const folderReadSources = uniqueSources\(\[foldersPrimary, foldersSharedLegacy, foldersLegacy\]\)/);
    assert.match(html, /const noteReadSources = uniqueSources\(\[notesPrimary, notesSharedLegacy, notesLegacy\]\)/);
    assert.match(html, /folderReadSources\.forEach\(registerFolderSnapshot\)/);
    assert.match(html, /noteReadSources\.forEach\(\(source\) =>/);
  });
});
