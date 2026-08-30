import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Vercel Git keeps production closed by default and allows explicit preview bridge branches', async () => {
  const config = JSON.parse(await read('vercel.json'));
  assert.deepEqual(config.git?.deploymentEnabled, {
    '**': false,
    main: false,
    'preview-pr-*': true,
  });
  assert.equal(config.ignoreCommand, undefined);
});

test('GitHub Actions production workflow is manual fallback only', async () => {
  const workflow = await read('.github/workflows/vercel-production-prebuilt.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.doesNotMatch(workflow, /\n\s*pull_request:/);
  assert.match(workflow, /VERCEL_ORG_ID: team_KXuVUd00RMnDsjoqwdREcZ7J/);
  assert.match(workflow, /VERCEL_PROJECT_ID: prj_V49UqQXH0kmkYcL0NZFBkklzsbuy/);

  const budgetGuard = workflow.indexOf('node --test tests/vercel-function-budget.test.js');
  const productionDeploy = workflow.indexOf('vercel deploy --prebuilt --prod');
  assert.ok(budgetGuard >= 0, 'production workflow must enforce the Vercel function budget');
  assert.ok(productionDeploy > budgetGuard, 'function-budget guard must run before production deploy');

  assert.match(workflow, /https:\/\/portal\.3dvr\.tech\//);
  assert.match(workflow, /data-portal-swirl-logo/);
  assert.match(workflow, /homeOperatorForm/);
});
