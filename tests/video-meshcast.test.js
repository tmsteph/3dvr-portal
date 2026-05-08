import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const meshcastUrl = new URL('../portal.3dvr.tech/video/meshcast.html', import.meta.url);
const indexUrl = new URL('../portal.3dvr.tech/video/index.html', import.meta.url);
const joinUrl = new URL('../portal.3dvr.tech/video/join.html', import.meta.url);

const expectedUrl = 'https://vdo.ninja/?room=3dvrtech&meshcast=&codec=h264&meshcastbitrate=80&meshcastaudiobitrate=24&fps=5&scale=180&stereo=0&buffer=20&showlabels=&clearnames=&labelsuggestion=&denoise=0&echocancellation=1&autogain=0&noap=&volumecontrol=';

test('meshcast preset page ships the working vdo ninja link', async () => {
  const html = await readFile(meshcastUrl, 'utf8');

  assert.match(html, /<title>3dvr\.tech Meshcast Meeting<\/title>/);
  assert.match(html, /<h1>Meshcast Meeting<\/h1>/);
  assert.match(html, /working link/i);
  assert.match(html, /The trailing `utm_source` tracking text was removed\./);
  assert.match(html, /const url = 'https:\/\/vdo\.ninja\/\?room=3dvrtech&meshcast=&codec=h264&meshcastbitrate=80&meshcastaudiobitrate=24&fps=5&scale=180&stereo=0&buffer=20&showlabels=&clearnames=&labelsuggestion=&denoise=0&echocancellation=1&autogain=0&noap=&volumecontrol='/);
  assert.match(html, /Open meeting/);
  assert.match(html, /Copy link/);
});

test('video hub surfaces the meshcast preset entrypoint', async () => {
  const indexHtml = await readFile(indexUrl, 'utf8');
  const joinHtml = await readFile(joinUrl, 'utf8');

  assert.match(indexHtml, /href="\/portal\.3dvr\.tech\/video\/meshcast\.html"/);
  assert.match(indexHtml, /Meshcast Meeting/);
  assert.match(joinHtml, /href="\/portal\.3dvr\.tech\/video\/meshcast\.html"/);
  assert.match(joinHtml, /Meshcast Meeting/);
  assert.ok(expectedUrl.includes('volumecontrol='));
});
