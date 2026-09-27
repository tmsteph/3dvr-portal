import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/manual-workforce-reconcile.yml', 'utf8');

test('manual workforce reconcile requires an explicit desired availability payload', () => {
  assert.match(workflow, /\.desired \| type == "object"/);
  assert.match(workflow, /desired_b64/);
  assert.doesNotMatch(workflow, /"2026-09-26":"Booked"/);
  assert.doesNotMatch(workflow, /"2026-10-27":"All Day"/);
});

test('manual reconcile restarts the general lane only when CDP is unhealthy', () => {
  assert.match(workflow, /if ! curl -fsS --max-time 2 http:\/\/127\.0\.0\.1:9222\/json\/version/);
  assert.match(workflow, /systemctl restart 3dvr-browser-lane@general\.service/);
  const restartIndex = workflow.indexOf('systemctl restart 3dvr-browser-lane@general.service');
  const healthIndex = workflow.indexOf('if ! curl -fsS --max-time 2 http://127.0.0.1:9222/json/version');
  assert.ok(healthIndex >= 0 && healthIndex < restartIndex);
});
