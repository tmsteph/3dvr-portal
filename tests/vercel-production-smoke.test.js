import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production policy has one canonical deploy lane', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const workflow = await read('.github/workflows/vercel-production-prebuilt.yml');
  assert.equal(config.git?.deploymentEnabled, false);
  assert.equal('ignoreCommand' in config, false);
  assert.match(workflow, /push:/);
  assert.match(workflow, /- main/);
  assert.match(workflow, /VERCEL_PROJECT_ID: prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch/);
  assert.match(workflow, /portal\.3dvr\.tech/);
  assert.match(workflow, /data-portal-swirl-logo/);
  assert.match(workflow, /homeOperatorForm/);
});
