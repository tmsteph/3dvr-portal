import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const appDir = new URL('../attention-visualized/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('attention visualized app ships the interactive lesson structure', async () => {
  const htmlUrl = new URL('index.html', appDir);
  assert.equal(await fileExists(htmlUrl), true);

  const html = await readFile(htmlUrl, 'utf8');
  assert.match(html, /Attention Visualized \| 3DVR Portal/);
  assert.match(html, /Attention Is All You Need, explained for builders/);
  assert.match(html, /id="tokenInput"/);
  assert.match(html, /id="focusToken"/);
  assert.match(html, /id="temperature"/);
  assert.match(html, /id="headMix"/);
  assert.match(html, /id="attentionCanvas"/);
  assert.match(html, /id="heatmap"/);
  assert.match(html, /Attention\(Q, K, V\) = softmax/);
  assert.match(html, /Tiny attention in JavaScript/);
  assert.match(html, /Attention as human focus/);
  assert.match(html, /href="\/app-manifests\/attention-visualized\.webmanifest"/);
  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
  assert.match(html, /<script defer src="\/issue-launcher\.js"><\/script>/);
});

test('attention visualized app includes focused styling, browser logic, and app manifest', async () => {
  const css = await readFile(new URL('styles.css', appDir), 'utf8');
  const js = await readFile(new URL('app.js', appDir), 'utf8');
  const manifest = await readFile(new URL('../app-manifests/attention-visualized.webmanifest', import.meta.url), 'utf8');

  assert.match(css, /\.attention-hero/);
  assert.match(css, /\.network-preview/);
  assert.match(css, /\.lab-layout/);
  assert.match(css, /\.heatmap-row/);
  assert.match(css, /@media \(max-width: 860px\)/);

  assert.match(js, /function tokenize/);
  assert.match(js, /function softmax/);
  assert.match(js, /function buildMatrix/);
  assert.match(js, /function drawCanvas/);
  assert.match(js, /function renderHeatmap/);
  assert.match(js, /temperature\.addEventListener\('input', render\)/);

  assert.match(manifest, /3DVR Attention Visualized/);
  assert.match(manifest, /"start_url": "\/attention-visualized\/\?source=pwa"/);
  assert.match(manifest, /"scope": "\/attention-visualized\/"/);
});

test('portal homepage links to attention visualized near Learn', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const learnIndex = html.indexOf('>Learn<');
  const attentionIndex = html.indexOf('>Attention Visualized<');
  const logicIndex = html.indexOf('>Logic Lab<');

  assert.ok(learnIndex !== -1, 'Learn app card should still be listed');
  assert.ok(attentionIndex !== -1, 'Attention Visualized app card should be listed');
  assert.ok(logicIndex !== -1, 'Logic Lab app card should still be listed');
  assert.ok(learnIndex < attentionIndex, 'Attention Visualized should render after Learn');
  assert.ok(attentionIndex < logicIndex, 'Attention Visualized should render before Logic Lab');
  assert.match(html, /href="attention-visualized\/"/);
  assert.match(html, /See self-attention, softmax, Q\/K\/V, and tiny JavaScript attention in one browser lab\./);
});

test('README lists attention visualized as an installable learning app', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /\[Attention Visualized\]\(https:\/\/3dvr-portal\.vercel\.app\/attention-visualized\/\)/);
});
