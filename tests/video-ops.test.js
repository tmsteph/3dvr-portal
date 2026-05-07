import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const opsUrl = new URL('../portal.3dvr.tech/video/ops.html', import.meta.url);
const indexUrl = new URL('../portal.3dvr.tech/video/index.html', import.meta.url);
const launcherUrl = new URL('../portal.3dvr.tech/video/smart-launcher.html', import.meta.url);

test('meeting ops page ships a unified test and hosting workflow', async () => {
  const html = await readFile(opsUrl, 'utf8');

  assert.match(html, /<title>3dvr\.tech Meeting Ops<\/title>/);
  assert.match(html, /<h1>Meeting Ops<\/h1>/);
  assert.match(html, /Session Builder/);
  assert.match(html, /Workflow/);
  assert.match(html, /Live meeting/);
  assert.match(html, /Two-tab Chrome test/);
  assert.match(html, /Two-device loopback test/);
  assert.match(html, /Travel \/ weak data/);
  assert.match(html, /Launch Pack/);
  assert.match(html, /Host \/ Director/);
  assert.match(html, /Guest \/ Participant/);
  assert.match(html, /Crunched Fallback/);
  assert.match(html, /Front camera test:/);
  assert.match(html, /Back camera test:/);
  assert.match(html, /function buildLauncherUrl/);
  assert.match(html, /\/portal\.3dvr\.tech\/video\/smart-launcher\.html\?/);
  assert.match(html, /Copy guest pack/);
  assert.match(html, /Copy host pack/);
  assert.match(html, /Copy preflight checklist/);
});

test('video landing pages link into meeting ops', async () => {
  const indexHtml = await readFile(indexUrl, 'utf8');
  const launcherHtml = await readFile(launcherUrl, 'utf8');

  assert.match(indexHtml, /href="\/portal\.3dvr\.tech\/video\/ops\.html"/);
  assert.match(indexHtml, /Meeting Ops/);
  assert.match(launcherHtml, /href="\/portal\.3dvr\.tech\/video\/ops\.html"/);
  assert.match(launcherHtml, /Meeting Ops/);
});
