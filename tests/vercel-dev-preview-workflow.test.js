import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel Dev Preview workflow starts cleanly and gates deploy steps inside the job', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/vercel-dev-preview.yml', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(workflow, /runs-on:\s*ubuntu-latest[\s\S]{0,120}if:\s*\$\{\{\s*env\.VERCEL_TOKEN/);
  assert.doesNotMatch(workflow, /SHOULD_ALIAS:\s*\$\{\{\s*\n/);
  assert.match(workflow, /id:\s*config/);
  assert.match(workflow, /can_deploy=true/);
  assert.match(workflow, /can_deploy=false/);
  assert.match(workflow, /node-version:\s*20/);
  assert.match(workflow, /if:\s*\$\{\{\s*steps\.config\.outputs\.can_deploy == 'true'\s*\}\}/);
  assert.match(workflow, /Skipping Vercel Dev Preview because one or more Vercel secrets are not configured/);
});
