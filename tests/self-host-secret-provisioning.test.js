import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('self-host production preserves and loads the protected runtime secret file', async () => {
  const workflow = await readFile(new URL('../.github/workflows/self-host-production.yml', import.meta.url), 'utf8');

  assert.ok(workflow.includes('No runtime secret updates supplied; preserving server configuration.'));
  assert.ok(workflow.includes('portal-secrets.update'));
  assert.ok(workflow.includes('touch "$secrets_env"'));
  assert.ok(workflow.includes('grep -v "^${key}=" "$next"'));
  assert.ok(workflow.includes('printf \'%s\\n\' "$line" >> "$next"'));
  assert.ok(workflow.includes('GOOGLE_OAUTH_CLIENT_ID'));
  assert.ok(workflow.includes('GOOGLE_OAUTH_CLIENT_SECRET'));

  const deploy = await readFile(new URL('../scripts/ops/deploy-self-host-portal.sh', import.meta.url), 'utf8');
  assert.ok(deploy.includes('secrets_env="$config_dir/portal-secrets.env"'));
  assert.ok(deploy.includes('EnvironmentFile=-$secrets_env'));
  assert.ok(deploy.includes('[ -f "$secrets_env" ] && . "$secrets_env"'));
  assert.ok(deploy.includes('THREEDVR_LEGACY_API_ORIGIN-https://3dvr-portal.vercel.app'));
  assert.doesNotMatch(deploy, /for key in OPENAI_API_KEY/);
});
