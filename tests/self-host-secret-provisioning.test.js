import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('self-host deploy preserves server secrets when Actions has no secret updates', async () => {
  const workflow = await readFile(new URL('../.github/workflows/self-host-production.yml', import.meta.url), 'utf8');

  assert.match(workflow, /No runtime secret updates supplied; preserving the server configuration\./);
  assert.doesNotMatch(workflow, /No OpenAI or AI Gateway API key is configured for Operator/);
  assert.match(workflow, /portal-secrets\.update/);
  assert.match(workflow, /touch "\$secrets_env"/);
  assert.match(workflow, /grep -v "\^\$\{key\}=" "\$next"/);
  assert.match(workflow, /printf '%s\\n' "\$line" >> "\$next"/);
  assert.match(workflow, /GOOGLE_OAUTH_CLIENT_ID/);
  assert.match(workflow, /GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.match(workflow, /GMAIL_USER/);
  assert.match(workflow, /GMAIL_APP_PASSWORD/);
  assert.match(workflow, /TARGET_ROLE: \$\{\{ steps\.resolve\.outputs\.role \}\}/);
  assert.match(workflow, /THREEDVR_CONTROL_NODE='\$control_node'/);

  const deploy = await readFile(new URL('../scripts/ops/deploy-self-host-portal.sh', import.meta.url), 'utf8');
  assert.match(deploy, /GOOGLE_OAUTH_CLIENT_ID/);
  assert.match(deploy, /GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.match(deploy, /GMAIL_USER/);
  assert.match(deploy, /GMAIL_APP_PASSWORD/);
  assert.match(deploy, /THREEDVR_OUTREACH_SUPPRESSION_ENFORCED=true/);
  assert.match(deploy, /THREEDVR_OUTREACH_REQUIRE_PERSONAL_SENT_CHECK=true/);
  assert.match(deploy, /chown debian:debian "\$common_env"/);
  assert.match(deploy, /THREEDVR_CONTROL_NODE=\$\{THREEDVR_CONTROL_NODE:-\}/);
  assert.match(deploy, /bash "\$current\/ops\/secrets-broker\/install\.sh"/);
  assert.match(deploy, /Secrets broker provisioning did not create/);
  assert.match(deploy, /portal\.token/);

  const installer = await readFile(new URL('../ops/secrets-broker/install.sh', import.meta.url), 'utf8');
  assert.match(installer, /bitwarden-sdk-create\.js/);
  assert.match(installer, /@bitwarden\/sdk-napi@1\.0\.0/);
});
