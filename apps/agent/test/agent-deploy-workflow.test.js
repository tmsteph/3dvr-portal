import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Prevent a PR merge from silently restarting the live DigitalOcean worker
// or consuming old tasks. This test runs in the existing Agent Checks suite.
const workflow = readFileSync(new URL('../../../.github/workflows/agent.yml', import.meta.url), 'utf8');

test('worker deployment requires a deliberate main-branch manual approval', () => {
  const deployJob = workflow.match(/^  deploy-digitalocean-worker:\n([\s\S]*?)(?=^  [a-zA-Z][\w-]*:|$(?![\s\S]))/m);
  assert.ok(deployJob, 'deploy job must remain present for explicitly approved operations');

  const condition = deployJob[1].match(/^    if: (.+)$/m)?.[1];
  assert.equal(condition,
    "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.deploy_digitalocean_worker == true",
    'a push/merge must never automatically deploy or start the worker');

  const manualInput = workflow.match(/^      deploy_digitalocean_worker:\n((?:^        .+\n)*)/m)?.[1];
  assert.ok(manualInput, 'workflow must expose an explicit deployment approval input');
  assert.match(manualInput, /^        type: boolean$/m);
  assert.match(manualInput, /^        required: true$/m);
  assert.match(manualInput, /^        default: false$/m);
  assert.match(workflow, /^  push:\n/m, 'normal CI on push must remain enabled');
});
