import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

test('admin portal exposes an agent operations control surface', async () => {
  const adminUrl = new URL('../admin/index.html', import.meta.url);
  assert.equal(await fileExists(adminUrl), true, 'admin/index.html should exist');

  const html = await readFile(adminUrl, 'utf8');
  assert.match(html, /Agent Operations/);
  assert.match(html, /id="agent-ops-card"/);
  assert.match(html, /id="agent-session-status"/);
  assert.match(html, /id="agent-session-alias"/);
  assert.match(html, /id="agent-session-profile"/);
  assert.match(html, /id="agent-session-reason"/);
  assert.match(html, /id="agent-host"/);
  assert.match(html, /id="agent-user"/);
  assert.match(html, /id="agent-port"/);
  assert.match(html, /id="agent-path"/);
  assert.match(html, /id="agent-service"/);
  assert.match(html, /id="agent-branch"/);
  assert.match(html, /id="agent-refresh-session"/);
  assert.match(html, /id="agent-save-config"/);
  assert.match(html, /id="agent-copy-ssh"/);
  assert.match(html, /id="agent-copy-deploy"/);
  assert.match(html, /id="agent-copy-restart"/);
  assert.match(html, /id="agent-copy-logs"/);
  assert.match(html, /id="agent-copy-heartbeat"/);
  assert.match(html, /id="agent-runtime-status"/);
  assert.match(html, /id="agent-runtime-host"/);
  assert.match(html, /id="agent-runtime-state"/);
  assert.match(html, /id="agent-runtime-beat"/);
  assert.match(html, /id="agent-runtime-inbox"/);
  assert.match(html, /id="agent-runtime-outreach"/);
  assert.match(html, /id="agent-runtime-process"/);
  assert.match(html, /portal-agent-ops-config/);
  assert.match(html, /portalRoot\.get\('agentOps'\)/);
  assert.match(html, /function ensureAgentOpsOwnerKey\(\)/);
  assert.match(html, /function persistAgentOpsConfig\(config = \{\}\)/);
  assert.match(html, /fetch\('\/api\/session'/);
  assert.match(html, /Copy deploy/);
  assert.match(html, /Copy restart/);
  assert.match(html, /Copy logs/);
  assert.match(html, /Copy heartbeat/);
  assert.match(html, /DigitalOcean host/);
  assert.match(html, /Saved host details to the portal account/);
  assert.match(html, /3dvr-agent/);
});

test('portal home links to the agent ops dashboard', async () => {
  const portalIndex = new URL('../index.html', import.meta.url);
  assert.equal(await fileExists(portalIndex), true, 'index.html should exist');

  const html = await readFile(portalIndex, 'utf8');
  assert.match(html, /href="\/admin\/"/);
  assert.match(html, /Agent Ops/);
  assert.match(html, /portal session, control the 3dvr-agent/);
});
