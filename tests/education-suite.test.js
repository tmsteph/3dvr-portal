import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const suiteDir = new URL('../education-suite/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('education suite ships the browser-first web design lab', async () => {
  const indexUrl = new URL('index.html', suiteDir);
  assert.equal(await fileExists(indexUrl), true);

  const html = await readFile(indexUrl, 'utf8');
  assert.match(html, /Education Suite: Web Design Lab \| 3DVR Portal/);
  assert.match(html, /Interactive web design lab/);
  assert.match(html, /id="sitePreview"/);
  assert.match(html, /id="spacingRange"/);
  assert.match(html, /id="radiusRange"/);
  assert.match(html, /id="typeRange"/);
  assert.match(html, /id="headlineInput"/);
  assert.match(html, /id="cssOutput"/);
  assert.match(html, /Copy CSS/);
  assert.match(html, /HTML structure, CSS layout, responsive design, accessibility/);
  assert.match(html, /href="\/app-manifests\/education-suite\.webmanifest"/);
  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
  assert.match(html, /<script defer src="\/issue-launcher\.js"><\/script>/);
});

test('education suite documents the plan for the full curriculum', async () => {
  const html = await readFile(new URL('index.html', suiteDir), 'utf8');

  assert.match(html, /Python in the browser/);
  assert.match(html, /Programming languages/);
  assert.match(html, /Databases/);
  assert.match(html, /Cloud systems/);
  assert.match(html, /Capstone builder track/);
  assert.match(html, /Pyodide locally, cloud workers for packages and long jobs/);
  assert.match(html, /SQLite in WASM, IndexedDB, optional hosted Postgres labs/);
  assert.match(html, /ephemeral sandboxes, GitHub-backed project history/);
});

test('education suite includes focused styling, browser logic, and manifest metadata', async () => {
  const css = await readFile(new URL('styles.css', suiteDir), 'utf8');
  const js = await readFile(new URL('app.js', suiteDir), 'utf8');
  const manifest = await readFile(new URL('../app-manifests/education-suite.webmanifest', import.meta.url), 'utf8');

  assert.match(css, /\.builder-grid/);
  assert.match(css, /\.site-preview/);
  assert.match(css, /\.segmented-control/);
  assert.match(css, /\.roadmap-grid/);
  assert.match(css, /@media \(max-width: 680px\)/);

  assert.match(js, /const themes =/);
  assert.match(js, /function contrastRatio/);
  assert.match(js, /function buildCss/);
  assert.match(js, /function render/);
  assert.match(js, /navigator\.clipboard\.writeText/);

  assert.match(manifest, /3DVR Education Suite/);
  assert.match(manifest, /"start_url": "\/education-suite\/\?source=pwa"/);
  assert.match(manifest, /"scope": "\/education-suite\/"/);
});

test('portal homepage and README link to the education suite', async () => {
  const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const learnIndex = homepage.indexOf('>Learn<');
  const suiteIndex = homepage.indexOf('>Education Suite<');
  const attentionIndex = homepage.indexOf('>Attention Visualized<');

  assert.ok(learnIndex !== -1, 'Learn app card should still be listed');
  assert.ok(suiteIndex !== -1, 'Education Suite app card should be listed');
  assert.ok(attentionIndex !== -1, 'Attention Visualized app card should still be listed');
  assert.ok(learnIndex < suiteIndex, 'Education Suite should render after Learn');
  assert.ok(suiteIndex < attentionIndex, 'Education Suite should render before Attention Visualized');
  assert.match(homepage, /href="education-suite\/"/);
  assert.match(homepage, /Practice web design now, then follow the roadmap into Python, languages, databases, and cloud labs\./);
  assert.match(readme, /\[Education Suite\]\(https:\/\/3dvr-portal\.vercel\.app\/education-suite\/\)/);
});
