import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('digital twin is a dashboard over existing 3DVR capabilities', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../digital-twin/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../digital-twin/app.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /Your Digital Twin/);
  assert.match(html, /id="twin-chat-form"/);
  assert.match(html, /href="\/work-agent\//);
  assert.match(html, /href="\/access\//);
  assert.match(html, /href="\/finance\//);
  assert.match(html, /href="\/workboard\//);
  assert.match(html, /data-policy="work"/);
  assert.match(html, /data-policy="money"/);
  assert.match(app, /3dvr\.digitalTwin\.profile\.v1/);
  assert.match(app, /3dvr\.operator\.prefill\.v1/);
  assert.match(app, /sessionStorage\.setItem/);
});

test('operator consumes the dashboard prefill through its normal action pipeline', async () => {
  const operator = await readFile(new URL('../operator/app.js', import.meta.url), 'utf8');
  assert.match(operator, /3dvr\.operator\.prefill\.v1/);
  assert.match(operator, /consumeOperatorPrefill/);
  assert.match(operator, /form\.requestSubmit\(\)/);
});
