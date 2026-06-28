import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const rootDir = new URL('../', import.meta.url);

function appCardHrefs(html) {
  return Array.from(html.matchAll(/<a\s+([\s\S]*?class="app-card"[\s\S]*?)>/g))
    .map((match) => match[1].match(/href="([^"]+)"/)?.[1])
    .filter(Boolean);
}

async function routeExists(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return true;

  const clean = href.split(/[?#]/)[0];
  const rel = clean.startsWith('/') ? clean.slice(1) : clean;
  const candidates = [
    rel,
    rel.endsWith('/') ? `${rel}index.html` : `${rel}.html`,
    rel.endsWith('/') ? rel : `${rel}/index.html`,
  ];

  for (const candidate of candidates) {
    try {
      await access(new URL(candidate, rootDir), constants.F_OK);
      return true;
    } catch {
      // Try the next route shape.
    }
  }

  return false;
}

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

test('homepage app search can find CRM by CRM keywords', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /data-app-keywords="[^"]*\bcrm\b[^"]*"/);
  assert.match(html, /<span class="app-card__title">CRM<\/span>/);
  assert.match(html, /card\.dataset\.appKeywords/);
  assert.match(html, /keywordIncludesQuery/);
});

test('homepage app dock has lane filters and generated search context', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /class="app-lane-filter"/);
  assert.match(html, /data-app-lane-filter="money"/);
  assert.match(html, /data-app-lane-filter="work"/);
  assert.match(html, /data-app-lane-filter="projects"/);
  assert.match(html, /data-app-lane-filter="experimental"/);
  assert.match(html, /const roomSearchTerms =/);
  assert.match(html, /card\.dataset\.appSearchText = searchableParts/);
  assert.match(html, /const shouldHideCardForLane =/);
  assert.match(html, /searchTextIncludesQuery/);
});

test('homepage app dock does not ship dead local app routes', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const missing = [];

  for (const href of appCardHrefs(html)) {
    if (!(await routeExists(href))) {
      missing.push(href);
    }
  }

  assert.deepEqual(missing, []);
});

test('homepage app search can find Forge by project-shaping keywords', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /href="forge\/" class="app-card" data-app-keywords="[^"]*\bfrustration\b[^"]*\bcodex prompt\b[^"]*"/
  );
  assert.match(html, /<span class="app-card__title">3DVR Forge<\/span>/);
  assert.match(html, /Movement Brief and 7-day test/);
});

test('homepage app search can find Forge Sprint by paid offer keywords', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /<a[\s\S]*?data-app-keywords="[^"]*\bpaid\b[^"]*\boffer\b[^"]*\brevenue\b[^"]*"[\s\S]*?<span class="app-card__title">Forge Sprint<\/span>/
  );
  assert.match(html, /Start paid sprint/);
});

test('homepage app search can find the manifestation practice', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /href="meditation\/affirmations\.html#manifestationHeading" class="app-card" data-app-keywords="[^"]*\bmanifestation\b[^"]*"/
  );
  assert.match(html, /<span class="app-card__title">Manifestation Practice<\/span>/);
  assert.match(html, /wish, outcome, obstacle, and if\/then plan/);
});

test('homepage top navigation keeps Games one click away', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /<nav class="top-buttons" id="landingQuickLinks"[\s\S]*?<a href="games\.html">Games<\/a>/
  );
});

test('homepage top navigation keeps Forge one click away', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /<nav class="top-buttons" id="landingQuickLinks"[\s\S]*?<a href="forge\/">Forge<\/a>/
  );
});
