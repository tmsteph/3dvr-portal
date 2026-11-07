import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => access(new URL(`../${path}`, import.meta.url));

test('System hub presents the kit Thomas named', async () => {
  const html = await read('system/index.html');

  assert.match(html, /<title>The System — One Kit for Living Anywhere \| 3DVR<\/title>/);
  assert.match(html, /id="pageTitle">One kit for living anywhere\./);
  for (const module of ['Backpack', 'Tent', 'Desk', 'E-bike', 'Car', 'Yurt']) {
    assert.match(html, new RegExp(`<h3>${module}</h3>`), `hub names the ${module} module`);
  }
  // Nothing is for sale and unfinished modules say so plainly.
  assert.match(html, /Nothing here is for sale/);
  assert.match(html, /Being gathered/);
});

test('System hub links to the module pages that already exist', async () => {
  const html = await read('system/index.html');

  assert.match(html, /href="\/everyday-life\/portable-room\/"/);
  assert.match(html, /href="desk\/"/);
  assert.match(html, /href="\/life-utility-vehicle\/"/);
  assert.match(html, /href="\/linen\/"/);
  assert.match(html, /href="\/everyday-life\/"/);
  assert.match(html, /href="\/open-source\/"/);
  assert.match(html, /href="\.\.\/index\.html"/);
});

test('Desk page carries the Hyatt reference and the open questions', async () => {
  const html = await read('system/desk/index.html');

  assert.match(html, /<title>The Desk — Universal Travel Standing Desk \| The System · 3DVR<\/title>/);
  assert.match(html, /src="assets\/hyatt-rolling-stand\.jpg"/);
  await exists('system/desk/assets/hyatt-rolling-stand.jpg');
  assert.match(html, /Manchester Grand Hyatt/);
  assert.match(html, /Height adjustment/);
  assert.match(html, /Pack-flat breakdown/);
  assert.match(html, /No prototype yet/);
});

test('Desk page links back to the hub and to the backpack it also lives in', async () => {
  const html = await read('system/desk/index.html');

  assert.match(html, /href="\.\.\/">Back to The System/);
  assert.match(html, /href="\/everyday-life\/portable-room\/"/);
});

test('Homepage apps list carries The System', async () => {
  const html = await read('index.html');

  assert.match(html, /<a class="app-link" href="\/system\/" data-app="[^"]*"><strong>The System<\/strong><span>One kit for living anywhere/);
});

test('Everyday Life and the Portable Room point at The System', async () => {
  const [hub, room] = await Promise.all([
    read('everyday-life/index.html'),
    read('everyday-life/portable-room/index.html')
  ]);

  assert.match(hub, /href="\/system\/">Open The System/);
  assert.match(room, /href="\/system\/desk\/"/);
});
