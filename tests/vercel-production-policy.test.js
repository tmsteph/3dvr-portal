import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Vercel Git keeps native production deploys main-only', async () => {
  const config = JSON.parse(await read('vercel.json'));
  assert.deepEqual(config.git?.deploymentEnabled, {
    '**': false,
    main: true,
  });
  assert.equal(config.ignoreCommand, undefined);
});

test('GitHub Actions production fallback is manual or narrowly triggerable from main', async () => {
  const workflow = await read('.github/workflows/vercel-production-prebuilt.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /\n\s*push:/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /ops\/vercel-production-trigger\.txt/);
  assert.doesNotMatch(workflow, /\n\s*pull_request:/);
  assert.match(workflow, /VERCEL_ORG_ID: team_xxJGO7S7h1ZP4BHidYV0CX9Z/);
  assert.match(workflow, /VERCEL_PROJECT_ID: prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch/);

  const budgetGuard = workflow.indexOf('node --test tests/vercel-function-budget.test.js');
  const productionDeploy = workflow.indexOf('vercel deploy --prebuilt --prod');
  assert.ok(budgetGuard >= 0, 'production workflow must enforce the Vercel function budget');
  assert.ok(productionDeploy > budgetGuard, 'function-budget guard must run before production deploy');

  assert.match(workflow, /https:\/\/portal\.3dvr\.tech\//);
  assert.match(workflow, /data-portal-swirl-logo/);
  assert.match(workflow, /homeOperatorForm/);
});
