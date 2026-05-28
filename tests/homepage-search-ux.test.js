import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('homepage search shortcuts stay scoped to one top-level control per viewport', async () => {
  const [navbarJs, indexCss] = await Promise.all([
    readFile(new URL('../navbar.js', import.meta.url), 'utf8'),
    readFile(new URL('../index-style.css', import.meta.url), 'utf8'),
  ]);

  assert.match(navbarJs, /className = 'top-buttons__search-shortcut'/);
  assert.match(navbarJs, /topButtons\.insertAdjacentElement\('afterbegin', searchLink\)/);
  assert.doesNotMatch(navbarJs, /querySelector\('\.hero-actions'\)/);
  assert.doesNotMatch(navbarJs, /className = 'cta primary'/);

  assert.match(
    indexCss,
    /@media \(min-width: 721px\) \{[\s\S]*?\.top-nav__primary \{[\s\S]*?display: none;/
  );
  assert.match(
    indexCss,
    /@media \(max-width: 720px\) \{[\s\S]*?\.top-nav \.top-buttons a\.top-buttons__search-shortcut \{[\s\S]*?display: none;/
  );
});

test('homepage app search can find People Log by CRM keywords', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /data-app-keywords="[^"]*\bcrm\b[^"]*"/);
  assert.match(html, /<span class="app-card__title">People Log<\/span>/);
  assert.match(html, /card\.dataset\.appKeywords/);
  assert.match(html, /keywordIncludesQuery/);
});
