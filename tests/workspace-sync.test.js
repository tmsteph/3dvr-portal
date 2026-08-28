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

test('production uses main plus opt-in Vercel preview bridges with a default deny rule', async () => {
  const workflow = await read('.github/workflows/vercel-production-prebuilt.yml');
  const vercelConfig = JSON.parse(await read('vercel.json'));

  assert.equal(vercelConfig.git?.deploymentEnabled?.main, true);
  assert.equal(vercelConfig.git?.deploymentEnabled?.['preview-pr-*'], true);
  assert.equal(vercelConfig.git?.deploymentEnabled?.['**'], false);
  assert.equal(vercelConfig.ignoreCommand, undefined);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /VERCEL_ORG_ID: team_xxJGO7S7h1ZP4BHidYV0CX9Z/);
  assert.match(workflow, /VERCEL_PROJECT_ID: prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch/);
  assert.match(workflow, /vercel deploy --prebuilt --prod/);
  assert.match(workflow, /https:\/\/portal\.3dvr\.tech\//);
  assert.doesNotMatch(workflow, /German worker/i);
});

test('preview workflow is opt-in, token-free, and cleans up its bridge branch', async () => {
  const workflow = await read('.github/workflows/vercel-dev-preview.yml');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /- labeled/);
  assert.match(workflow, /- unlabeled/);
  assert.match(workflow, /- synchronize/);
  assert.match(workflow, /- reopened/);
  assert.match(workflow, /- closed/);
  assert.match(workflow, /vercel-preview/);
  assert.match(workflow, /preview-pr-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /git push --force origin/);
  assert.match(workflow, /git push origin --delete/);
  assert.match(workflow, /head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /3dvr-portal-git-preview-pr-/);
  assert.match(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /VERCEL_TOKEN/);
  assert.doesNotMatch(workflow, /VERCEL_PROJECT_ID/);
  assert.doesNotMatch(workflow, /VERCEL_ORG_ID/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
});

test('workspace and Codex Cloud link to each other', async () => {
  const workspace = await read('workspace/index.html');
  const codexCloud = await read('codex-cloud/index.html');

  assert.match(workspace, /href="\.\.\/codex-cloud\/"/);
  assert.match(codexCloud, /href="\/workspace\/"/);
});
