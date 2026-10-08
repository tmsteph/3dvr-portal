import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readlink, rm, stat, utimes, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const source = await readFile(new URL('../scripts/ops/deploy-self-host-portal.sh', import.meta.url), 'utf8');
const fn = name => {
  const start = source.indexOf(name + '() {');
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n}', start) + 2);
};
for (const status of [5, 143]) {
  test('exit ' + status + ' after promotion restores link, environment, and backend', async () => {
    const base = await mkdtemp(join(tmpdir(), 'portal-rollback-'));
    try {
      const old = join(base, 'old');
      const next = join(base, 'next');
      await mkdir(old); await mkdir(next);
      await writeFile(join(base, 'backup.env'), 'OLD_ENV=1\n');
      await writeFile(join(base, 'portal.env'), 'NEW_ENV=1\n');
      const script = [
        'set -euo pipefail', 'base="$1"', 'current="$base/current"',
        'previous_release="$base/old"', 'previous_env="$base/backup.env"',
        'portal_env="$base/portal.env"', 'had_previous_env=true',
        'candidate_pid=""', 'promoted=true', 'validated=false',
        fn('atomic_current'), fn('rollback_live'), fn('finish_deploy'),
        'cleanup_candidate() { :; }',
        'restart_live_service() { printf restarted > "$base/restarted"; }',
        'atomic_current "$base/next"',
        'trap finish_deploy EXIT', 'exit ' + status
      ].join('\n');
      const run = spawnSync('bash', ['-c', script, '--', base], { encoding:'utf8' });
      assert.equal(run.status, status, run.stderr);
      assert.equal(await readlink(join(base, 'current')), old);
      assert.equal(await readFile(join(base, 'portal.env'), 'utf8'), 'OLD_ENV=1\n');
      assert.equal(await readFile(join(base, 'restarted'), 'utf8'), 'restarted');
    } finally { await rm(base, { recursive:true, force:true }); }
  });
}
test('successful transaction keeps promoted release', async () => {
  const base = await mkdtemp(join(tmpdir(), 'portal-success-'));
  try {
    await mkdir(join(base, 'next'));
    const script = [
      'set -euo pipefail', 'base="$1"', 'current="$base/current"',
      'previous_env="$base/backup.env"', 'promoted=true', 'validated=true',
      fn('atomic_current'), fn('finish_deploy'),
      'cleanup_candidate() { :; }', 'rollback_live() { exit 99; }',
      'atomic_current "$base/next"', 'trap finish_deploy EXIT'
    ].join('\n');
    const run = spawnSync('bash', ['-c', script, '--', base], { encoding:'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(await readlink(join(base, 'current')), join(base, 'next'));
  } finally { await rm(base, { recursive:true, force:true }); }
});
test('privileged deploy Git fetch preserves source-account ownership', { skip: process.getuid?.() !== 0 }, async () => {
  const base = await mkdtemp(join(tmpdir(), 'portal-git-owner-'));
  try {
    const repo = join(base, 'source');
    const remote = join(base, 'remote.git');
    await mkdir(repo);
    const setup = spawnSync('bash', ['-c', 'set -e; chmod 755 "$1"; git init -q --initial-branch=main "$1/source"; git -C "$1/source" -c user.name=test -c user.email=test@example.invalid commit --allow-empty -qm initial; git clone -q --bare "$1/source" "$1/remote.git"; git -C "$1/source" remote add origin "$1/remote.git"; chown -R nobody:nogroup "$1/source" "$1/remote.git"', '--', base], { encoding:'utf8' });
    assert.equal(setup.status, 0, setup.stderr);
    const run = spawnSync('bash', ['-c', 'set -euo pipefail\nrepo="$1"\nsource_owner=nobody\n' + fn('git_repo') + '\ngit_repo fetch origin main', '--', repo], { encoding:'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal((await stat(join(repo,'.git/FETCH_HEAD'))).uid, (await stat(repo)).uid);
  } finally { await rm(base, { recursive:true, force:true }); }
});

test('retention preserves current, previous, recent releases, and non-release data', async () => {
  const base = await mkdtemp(join(tmpdir(), 'portal-retention-'));
  try {
    for (let i=0;i<9;i++) {
      const path=join(base,String(i).repeat(40));
      await mkdir(path);
      await utimes(path,100+i,100+i);
    }
    await mkdir(join(base,'operator-data'));
    const run=spawnSync('bash',['-c','set -euo pipefail\nreleases="$1"\nrelease="$1/'+ '8'.repeat(40) +'"\nprevious_release="$1/'+ '0'.repeat(40) +'"\n'+fn('prune_releases')+'\nprune_releases','--',base],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const names=await readdir(base);
    assert.ok(names.includes('0'.repeat(40)));
    assert.ok(names.includes('8'.repeat(40)));
    assert.ok(names.includes('operator-data'));
    assert.ok(!names.includes('1'.repeat(40)) && !names.includes('2'.repeat(40)));
    assert.equal(names.length,8);
  } finally { await rm(base,{recursive:true,force:true}); }
});
