import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('growth lab page ships the homepage experiment dashboard and Gun wiring', async () => {
  const html = await readFile(new URL('../sales/analytics.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../sales/analytics.js', import.meta.url), 'utf8');

  assert.match(html, /Growth Lab/);
  assert.match(html, /Track what visitors do, hear what they say, and promote the winner\./);
  assert.match(html, /background cron/);
  assert.match(html, /id="growthCurrentWinner"/);
  assert.match(html, /id="growthAutoMode"/);
  assert.match(html, /id="growthTotalViews"/);
  assert.match(html, /id="growthTotalClicks"/);
  assert.match(html, /id="growthTotalFeedback"/);
  assert.match(html, /id="growthFeedbackList"/);
  assert.match(html, /id="growthEventList"/);
  assert.match(html, /id="setWinnerClarity"/);
  assert.match(html, /id="setWinnerTraction"/);
  assert.match(html, /id="clearWinner"/);
  assert.match(html, /id="toggleAutoMode"/);
  assert.match(html, /src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
  assert.match(html, /type="module" src="\.\/analytics\.js"/);

  assert.match(js, /from '\.\.\/src\/growth\/homepage-hero\.js'/);
  assert.match(js, /function maybeAutoPromote/);
  assert.match(js, /writeConfig\(configNode/);
});
