import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('fresh workspace state yields to an existing cloud record', async () => {
  const source = await read('workspace/main.js');

  assert.match(
    source,
    /return \{ version: 1, updatedAt: 0, updatedBy: deviceId, projects: \[newProject\(\)\] \};/,
    'fresh state must not look newer than persisted cloud state'
  );

  assert.match(
    source,
    /if \(remoteUpdatedAt >= localUpdatedAt\)/,
    'initial sync must prefer an equal-or-newer cloud record'
  );
});

test('relay timeout never auto-saves empty startup state', async () => {
  const source = await read('workspace/main.js');
  const workspaceStart = source.indexOf('async function startWorkspace()');
  const timeoutStart = source.indexOf('setTimeout(() => {', workspaceStart);
  const timeoutEnd = source.indexOf('}, 4500);', timeoutStart);

  assert.notEqual(workspaceStart, -1);
  assert.notEqual(timeoutStart, -1);
  assert.notEqual(timeoutEnd, -1);

  const timeoutBlock = source.slice(timeoutStart, timeoutEnd);
  assert.doesNotMatch(timeoutBlock, /\bsave\s*\(/, 'timeout must not overwrite unknown remote state');
});

test('production uses main-only native Vercel Git', async () => {
  const workflow = await read('.github/workflows/vercel-production-prebuilt.yml');
  const vercelConfig = JSON.parse(await read('vercel.json'));

  assert.equal(vercelConfig.git?.deploymentEnabled?.main, true);
  assert.equal(vercelConfig.git?.deploymentEnabled?.['*'], false);
  assert.equal('ignoreCommand' in vercelConfig, false);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /VERCEL_ORG_ID: team_xxJGO7S7h1ZP4BHidYV0CX9Z/);
  assert.match(workflow, /VERCEL_PROJECT_ID: prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch/);
  assert.match(workflow, /vercel deploy --prebuilt --prod/);
  assert.match(workflow, /https:\/\/portal\.3dvr\.tech\//);
  assert.doesNotMatch(workflow, /German worker/i);
});

test('preview workflow is opt-in and targets the portal Vercel project', async () => {
  const workflow = await read('.github/workflows/vercel-dev-preview.yml');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /- labeled/);
  assert.match(workflow, /vercel-preview/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.match(workflow, /VERCEL_ORG_ID: team_xxJGO7S7h1ZP4BHidYV0CX9Z/);
  assert.match(workflow, /VERCEL_PROJECT_ID: prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch/);
});

test('workspace and Codex Cloud link to each other', async () => {
  const workspace = await read('workspace/index.html');
  const codexCloud = await read('codex-cloud/index.html');

  assert.match(workspace, /href="\.\.\/codex-cloud\/"/);
  assert.match(codexCloud, /href="\/workspace\/"/);
});
