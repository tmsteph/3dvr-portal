import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('homepage desktop scroll is not blocked by overscroll or automatic search focus', async () => {
  const [globalCss, homeHtml] = await Promise.all([
    readFile(new URL('../styles/global.css', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);

  assert.match(globalCss, /overscroll-behavior-x:\s*none;/);
  assert.match(globalCss, /overscroll-behavior-y:\s*auto;/);
  assert.doesNotMatch(
    globalCss,
    /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)[\s\S]*?overscroll-behavior:\s*none;/
  );

  assert.match(homeHtml, /window\.location\.hash !== '#appSearch'/);
  assert.match(homeHtml, /window\.addEventListener\('keydown'/);
  assert.match(homeHtml, /focusSearch\(\)/);
});
