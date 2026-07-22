import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Danny dictionary ships a complete lookup surface', async () => {
  const html = await readFile(new URL('../danny/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../danny/app.js', import.meta.url), 'utf8');
  assert.match(html, /Danny's Dictionary/);
  assert.match(html, /wordInput/);
  assert.match(html, /definitions/);
  assert.match(html, /synonyms/);
  assert.match(html, /etymology/);
  assert.match(app, /api\.dictionaryapi\.dev/);
  assert.match(app, /en\.wiktionary\.org\/w\/api\.php/);
  assert.match(app, /fetchEtymology/);
  assert.match(app, /fallbackExample/);
  assert.match(app, /fetchWiktionaryEntry\(word\)/);
  assert.match(app, /STYLE\|SCRIPT\|NOSCRIPT/);
  assert.match(app, /etymologySection\(text\) \|\| renderedEtymology/);
});

test('Danny dictionary is routed from the custom subdomain', async () => {
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  assert.match(vercel, /danny\.3dvr\.tech/);
  assert.match(vercel, /\/danny\/index\.html/);
  assert.match(vercel, /"destination": "\/danny\/"/);
});
