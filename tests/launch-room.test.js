import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('launch room ships a local-first Movement Brief flow', async () => {
  const html = await readFile(new URL('../launch-room/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../launch-room/app.js', import.meta.url), 'utf8');

  const promptOrder = [
    'What are you tired of seeing in the world?',
    'What do you wish existed instead?',
    'Who would you help first?',
    'What tiny version could exist this week?',
    'What should we call this movement?'
  ];

  assert.match(html, /3DVR Launch Room/);
  assert.match(html, /Purpose → Vision → Movement → Project/);
  assert.match(html, /Most people don’t need another productivity app/);
  promptOrder.forEach(prompt => assert.notEqual(html.indexOf(prompt), -1));
  assert.deepEqual(
    promptOrder.map(prompt => html.indexOf(prompt)).sort((left, right) => left - right),
    promptOrder.map(prompt => html.indexOf(prompt))
  );
  assert.match(html, /id="movementName"/);
  assert.match(html, /id="worldPain"/);
  assert.match(html, /id="worldWish"/);
  assert.match(html, /id="firstAudience"/);
  assert.match(html, /id="tinyProject"/);
  assert.match(html, /People feel stuck in work that drains them/);
  assert.match(html, /Generate My Movement Brief/);
  assert.match(html, /Copy Brief/);
  assert.match(html, /Download Markdown/);
  assert.match(html, /Build Launch Page/);
  assert.match(html, /Movement Brief/);
  assert.match(html, /Launch Checklist/);
  assert.match(html, /Next 3 Actions/);
  assert.match(html, /Launch Page Draft/);
  assert.match(html, /Hero headline/);
  assert.match(html, /Short subheadline/);
  assert.match(html, /Mission section/);
  assert.match(html, /Who this is for/);
  assert.match(html, /First invitation \/ call to action/);
  assert.match(html, /Simple contact CTA/);
  assert.match(html, /Copy Launch Page/);

  assert.match(app, /STORAGE_KEY = '3dvr\.launch-room\.movement-brief\.v1'/);
  assert.match(app, /function buildBrief/);
  assert.match(app, /function briefToMarkdown/);
  assert.match(app, /function buildLaunchPage/);
  assert.match(app, /function launchPageToMarkdown/);
  assert.match(app, /function renderLaunchPage/);
  assert.match(app, /Built with 3DVR Launch Room/);
  assert.match(app, /navigator\.clipboard\.writeText/);
  assert.match(app, /type: 'text\/markdown'/);
  assert.match(app, /localStorage/);
  assert.match(app, /replaceChildren/);
});
