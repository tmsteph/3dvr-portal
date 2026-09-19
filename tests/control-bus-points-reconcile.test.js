import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Portal points reconcile is bounded and max-preserving', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/control-bus.yml', import.meta.url),
    'utf8'
  );

  assert.match(workflow, /portal_points_reconcile/);
  assert.match(workflow, /Math\.max\(\.\.\.numbers\)/);
  assert.match(workflow, /userStatsByPub/);
  assert.match(workflow, /userStats/);
  assert.match(workflow, /localPoints/);
  assert.doesNotMatch(
    workflow.slice(
      workflow.indexOf('portal_points_reconcile)'),
      workflow.indexOf('portal_points_status)')
    ),
    /Page\.navigate|page\.goto|\.click\(/
  );
});
