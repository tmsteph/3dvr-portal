import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const workflowUrl = new URL('../examples/n8n/lead-intake-reliability.json', import.meta.url);
const docUrl = new URL('../docs/agent-revenue/n8n-lead-intake-proof.md', import.meta.url);

async function loadWorkflow() {
  return JSON.parse(await readFile(workflowUrl, 'utf8'));
}

test('n8n proof is import-shaped and disarmed', async () => {
  const workflow = await loadWorkflow();
  const names = new Set(workflow.nodes.map((node) => node.name));

  assert.equal(workflow.active, false);
  assert.equal(workflow.name, '3DVR Lead Intake Reliability Demo');
  assert.equal(workflow.nodes.length, 8);
  assert.ok(names.has('Webhook'));
  assert.ok(names.has('Validate + Dedupe'));
  assert.ok(names.has('Prepare CRM Mutation'));
  assert.equal(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.httpRequest'), false);
});

test('n8n proof makes duplicate and validation behavior explicit', async () => {
  const workflow = await loadWorkflow();
  const validate = workflow.nodes.find((node) => node.name === 'Validate + Dedupe');
  const code = validate?.parameters?.jsCode || '';

  assert.match(code, /leadId is required/);
  assert.match(code, /idempotencyKey/);
  assert.match(code, /\$getWorkflowStaticData\('global'\)/);
  assert.match(code, /24 \* 60 \* 60 \* 1000/);
  assert.match(code, /duplicate/);
});