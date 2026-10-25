import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
const workflow = await readFile(new URL('../.github/workflows/self-host-production.yml', import.meta.url), 'utf8');
const deploy = await readFile(new URL('../scripts/ops/deploy-self-host-portal.sh', import.meta.url), 'utf8');
test('all main merges trigger exact serialized deployment', () => {
  assert.match(workflow.split('\npermissions:')[0], /push:\s+branches: \[main\]/);
  assert.doesNotMatch(workflow.split('\npermissions:')[0], /paths:/);
  assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /Superseded deployment/);
  assert.doesNotMatch(workflow, /pick "\$FALLBACK_HOST"/);
});
test('Git is unprivileged and releases use the host lock', () => {
  assert.match(workflow, /chown -R --no-dereference.*SOURCE_USER/);
  assert.match(workflow, /git\(\) \{ runuser -u "\$SOURCE_USER"/);
  assert.match(deploy, /runuser -u "\$source_owner" -- \/usr\/bin\/git/);
  assert.match(deploy, /git_repo archive "\$sha"/);
  assert.match(deploy, /flock -w 900 9/);
  assert.doesNotMatch(workflow, /chmod.*777|safe\.directory.*\*/);
});
test('canonical failure remains inside the rollback transaction', () => {
  assert.match(deploy, /trap finish_deploy EXIT/);
  assert.match(deploy, /mv -Tf "\$base\/\.current-\$\$" "\$current"/);
  const promotion = deploy.indexOf('atomic_current "$release"');
  const check = deploy.indexOf('if ! public_portal_ready "$canonical_portal_url" || ! validate_critical_routes');
  assert.ok(promotion > deploy.indexOf('trap finish_deploy EXIT'));
  assert.ok(check > promotion && deploy.indexOf('validated=true') > check);
  assert.match(deploy, /if \[ "\$promoted" = true \] && \[ "\$validated" != true \]; then\s+rollback_live/);
  assert.match(deploy, /validate_critical_routes "\$candidate_url"/);
  assert.match(workflow, /cmp index\.html \/tmp\/homepage\.html/);
  assert.match(workflow, /cmp needle-edge\/index\.html \/tmp\/needle\.html/);
});
test('no undeployed main timestamp commit or hidden acceptance failure', () => {
  assert.doesNotMatch(workflow, /Publish Organism bridge pointer|branch=main/);
  assert.match(workflow, /JOB_STATUS: \$\{\{ job.status \}\}/);
  assert.match(workflow, /if \[ "\$JOB_STATUS" = success \]/);
  assert.match(workflow, /Remove temporary deployment credentials\s+if: always\(\)/);
});

test('tracker OpenBao helper is atomically installed and verified before service startup', async () => {
  const trackerInstall = await readFile(
    new URL('../scripts/ops/install-mark-chat-tracker.sh', import.meta.url),
    'utf8'
  );
  assert.match(workflow, /bash "\$source_repo\/scripts\/ops\/install-mark-chat-tracker\.sh" "\$source_repo"/);
  assert.match(trackerInstall, /source_openbao_helper="\$ROOT\/apps\/agent\/connectors\/secrets\/openbao\.js"/);
  assert.match(trackerInstall, /installed_openbao_helper="\/opt\/3dvr\/secrets-broker\/openbao\.js"/);
  assert.match(trackerInstall, /\[ -L "\$installed_openbao_helper" \]/);
  assert.match(trackerInstall, /mktemp \/opt\/3dvr\/secrets-broker\/\.openbao\.js\./);
  assert.match(trackerInstall, /mv -Tf "\$helper_tmp" "\$installed_openbao_helper"/);
  const parity = trackerInstall.lastIndexOf('cmp -s "$source_openbao_helper" "$installed_openbao_helper"');
  const start = trackerInstall.indexOf('systemctl start 3dvr-mark-chat-tracker.service');
  assert.ok(parity >= 0 && start > parity, 'exact source/runtime parity must precede service start');
  assert.doesNotMatch(trackerInstall, /systemctl restart (?:openbao|3dvr-secrets-broker)/);
  assert.equal(spawnSync('bash', ['-n', new URL('../scripts/ops/install-mark-chat-tracker.sh', import.meta.url).pathname]).status, 0);
  assert.match(trackerInstall, /for component in \/ \/opt \/opt\/3dvr \/opt\/3dvr\/secrets-broker "\$installed_openbao_helper"/);
  assert.match(trackerInstall, /stat -c '%u'/);
  assert.match(trackerInstall, /8#\$mode & 0022/);
  assert.match(trackerInstall, /stat -c '%a'.*installed_openbao_helper/);
  const checks = [...trackerInstall.matchAll(/^verify_privileged_helper_path$/gm)].map((match) => match.index);
  assert.equal(checks.length, 2, 'trust boundary must be checked before and after parity/atomic replacement');
  const firstCmp = trackerInstall.indexOf('if ! cmp -s "$source_openbao_helper" "$installed_openbao_helper"');
  const firstInstall = trackerInstall.indexOf('install -d -o root -g root -m 0755 /opt/3dvr/mark-chat-tracker');
  assert.ok(checks[0] < firstCmp && checks[0] < firstInstall, 'reject unsafe ancestors before any /opt writes');
  assert.ok(checks[1] > parity && checks[1] < start, 'recheck path after replacement and before tracker startup');
});

test('equal-byte OpenBao helper rejects a writable non-root ancestor', async (t) => {
  const trackerInstall = await readFile(
    new URL('../scripts/ops/install-mark-chat-tracker.sh', import.meta.url), 'utf8'
  );
  const dir = await mkdtemp(join(tmpdir(), '3dvr-openbao-unsafe-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const brokerDir = join(dir, 'secrets-broker');
  await mkdir(brokerDir);
  const installed = join(brokerDir, 'openbao.js');
  const source = join(dir, 'source-openbao.js');
  await writeFile(installed, 'identical approved bytes');
  await writeFile(source, 'identical approved bytes');
  await chmod(installed, 0o644);
  await chmod(dir, 0o777);
  assert.equal(spawnSync('cmp', ['-s', source, installed]).status, 0);

  const functionSource = trackerInstall.match(/^verify_privileged_helper_path\(\) \{[\s\S]*?^\}/m)?.[0];
  assert.ok(functionSource, 'installer must expose a bounded path verifier');
  const originalChain = 'for component in / /opt /opt/3dvr /opt/3dvr/secrets-broker "$installed_openbao_helper"; do';
  assert.ok(functionSource.includes(originalChain));
  const fixtureChain = `for component in / "${dir}" "${brokerDir}" "$installed_openbao_helper"; do`;
  const script = [
    'set -euo pipefail',
    `installed_openbao_helper="${installed}"`,
    functionSource.replace(originalChain, fixtureChain),
    'verify_privileged_helper_path',
  ].join('\n');
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
  assert.equal(result.status, 6, result.stderr);
  assert.match(result.stderr, /unsafe ownership or write permissions/);
});
