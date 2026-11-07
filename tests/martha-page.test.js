import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => access(new URL(`../${path}`, import.meta.url));

test('Martha page introduces the assistant, staff not cast', async () => {
  const html = await read('martha/index.html');

  assert.match(html, /<title>Martha — The Assistant Behind the Portal<\/title>/);
  assert.match(html, /Staff, not cast/);
  assert.match(html, /runs the portal, watches the servers/);
  assert.match(html, /id="workTitle">What I do\./);
  assert.match(html, /id="galleryTitle">Fun photos\./);
});

test('Martha page gallery ships its photos as local assets', async () => {
  const html = await read('martha/index.html');
  const assets = [
    'martha/assets/martha-avatar.webp',
    'martha/assets/martha-navy-ball.webp',
    'martha/assets/martha-console.webp',
    'martha/assets/martha-food-forest.webp',
    'martha/assets/martha-desk.webp'
  ];

  for (const asset of assets) {
    assert.ok(html.includes(`src="assets/${asset.split('/').pop()}"`), `page references ${asset}`);
    await exists(asset);
  }

  // Gallery photos and the buddy portrait lazy-load; only the hero is eager.
  const lazyCount = (html.match(/loading="lazy"/g) || []).length;
  assert.equal(lazyCount, 5);
});

test('Martha page names 3DVR Bot as her buddy and links to his cast page', async () => {
  const html = await read('martha/index.html');

  assert.match(html, /id="buddyTitle">3DVR Bot keeps me company\./);
  assert.match(html, /src="\.\.\/characters\/assets\/3dvr-bot\.svg"/);
  assert.match(html, /<a class="button button--quiet" href="\.\.\/characters\/">Meet 3DVR Bot/);
  await exists('characters/assets/3dvr-bot.svg');
});

test('Martha page links back to the girls and the portal home', async () => {
  const html = await read('martha/index.html');

  assert.match(html, /href="\.\.\/3dvr-girl\/"/);
  assert.match(html, /href="\.\.\/index\.html"/);
});

test('Girl world page links to Martha as staff, not cast', async () => {
  const [html, css] = await Promise.all([
    read('3dvr-girl/index.html'),
    read('3dvr-girl/styles.css')
  ]);

  assert.match(html, /class="cast-strip__staff" href="\.\.\/martha\/">Martha &middot; the assistant<\/a>/);
  assert.match(html, /Meet Martha, the assistant who runs this place\./);
  assert.match(html, /<a class="button" href="\.\.\/martha\/">/);
  assert.match(css, /\.cast-strip__staff \{/);
  assert.match(css, /\.staff-card \{/);
});
