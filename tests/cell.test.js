import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../cell/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('cell hub', () => {
  it('ships the cell concept page in its own directory', async () => {
    const indexUrl = new URL('index.html', baseDir);
    assert.equal(await fileExists(indexUrl), true, 'index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /Cell Network \| 3dvr Portal/);
    assert.match(html, /Build a <span class="accent">cell unit<\/span> that crosses all lines\./);
    assert.match(html, /Create a Cell/);
    assert.match(html, /id="cellForm"/);
    assert.match(html, /id="previewTitle"/);
    assert.match(html, /id="previewTags"/);
    assert.match(html, /Cell Builder/);
    assert.match(html, /Core(?:<br\s*\/?>)?Cell/);
    assert.ok(!html.includes('Node Builder'), 'the page should be branded as Cell, not Node');
  });

  it('registers the Cell workspace in the portal app grid', async () => {
    const portalIndex = new URL('../index.html', baseDir);
    assert.equal(await fileExists(portalIndex), true, 'root index.html should exist');

    const html = await readFile(portalIndex, 'utf8');
    const calendarIndex = html.indexOf('>Calendar<');
    const cellIndex = html.indexOf('>Cell<');
    const chatIndex = html.indexOf('>Chat<');
    assert.ok(calendarIndex !== -1, 'Calendar app card should still be present');
    assert.ok(cellIndex !== -1, 'Cell app card should be listed on the portal');
    assert.ok(chatIndex !== -1, 'Chat app card should still be present');
    assert.ok(calendarIndex < cellIndex, 'Cell should appear after Calendar');
    assert.ok(cellIndex < chatIndex, 'Cell should appear before Chat');
    assert.match(html, /href="cell\/(?:index\.html)?"/);
  });
});
