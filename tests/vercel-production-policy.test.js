import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Vercel Git auto-deploys stay disabled', async () => {
  const config = JSON.parse(await read('vercel.json'));
  assert.equal(config.git?.deploymentEnabled, false);
  assert.equal('ignoreCommand' in config, false);
});

test('GitHub Actions owns canonical production deployment', async () => {
  const workflow = await read('.github/workflows/vercel-production-prebuilt.yml');
  assert.match(workflow, /push:/);
  assert.match(workflow, /- main/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /VERCEL_ORG_ID: team_xxJGO7S7h1ZP4BHidYV0CX9Z/);
  assert.match(workflow, /VERCEL_PROJECT_ID: prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch/);
  assert.match(workflow, /vercel deploy --prebuilt --prod/);
  assert.match(workflow, /https:\/\/portal\.3dvr\.tech\//);
  assert.match(workflow, /data-portal-swirl-logo/);
  assert.match(workflow, /homeOperatorForm/);
});
