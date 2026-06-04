import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Gun backup operations include host archive, known roots, and repo-safe outputs', async () => {
  const [manifestRaw, packageRaw, gitignore, archiveScript, snapshotScript, runbook, runbookIndex] =
    await Promise.all([
      readFile(new URL('../ops/gun/portal-gun-roots.json', import.meta.url), 'utf8'),
      readFile(new URL('../package.json', import.meta.url), 'utf8'),
      readFile(new URL('../.gitignore', import.meta.url), 'utf8'),
      readFile(new URL('../ops/gun/archive-rad.sh', import.meta.url), 'utf8'),
      readFile(new URL('../scripts/gun/backup-known-roots.mjs', import.meta.url), 'utf8'),
      readFile(new URL('../ops/control-plane/home/RUNBOOKS/portal-gunjs-backups.md', import.meta.url), 'utf8'),
      readFile(new URL('../ops/control-plane/home/RUNBOOKS/README.md', import.meta.url), 'utf8')
    ]);

  const manifest = JSON.parse(manifestRaw);
  const packageJson = JSON.parse(packageRaw);
  const rootNames = new Set(manifest.roots.map(root => root.name));
  const rootPaths = manifest.roots.map(root => root.path.join('/'));

  assert.equal(manifest.version, 1);
  assert.ok(rootNames.has('portal'));
  assert.ok(rootNames.has('crm'));
  assert.ok(rootNames.has('guests'));
  assert.ok(rootNames.has('ai'));
  assert.ok(rootPaths.includes('3dvr-portal'));
  assert.ok(rootPaths.includes('3dvr-crm'));
  assert.ok(rootPaths.includes('3dvr-guests'));
  assert.ok(manifest.roots.some(root => root.sensitive), 'manifest should mark sensitive roots');

  assert.equal(packageJson.scripts['gun:backup'], 'node scripts/gun/backup-known-roots.mjs');
  assert.match(gitignore, /^backups\/$/m);

  assert.match(snapshotScript, /gun\/lib\/server\.js/);
  assert.match(snapshotScript, /GUN_BACKUP_PEERS/);
  assert.match(snapshotScript, /GUN_BACKUP_ROOTS/);
  assert.match(snapshotScript, /--root/);
  assert.match(snapshotScript, /portal-gun-known-roots-/);
  assert.match(snapshotScript, /sha256/);
  assert.match(snapshotScript, /radisk:\s*false/);
  assert.match(snapshotScript, /localStorage:\s*false/);

  assert.match(archiveScript, /GUN_RAD_DIR/);
  assert.match(archiveScript, /portal-gun-rad-/);
  assert.match(archiveScript, /sha256sum|shasum/);
  assert.match(archiveScript, /GUN_BACKUP_RCLONE_REMOTE/);
  assert.match(archiveScript, /GUN_BACKUP_STOP_SERVICE/);

  assert.match(runbook, /authoritative backup/i);
  assert.match(runbook, /known root snapshots/i);
  assert.match(runbook, /Off-host copy is required/i);
  assert.match(runbook, /Weekly restore drill/i);
  assert.match(runbookIndex, /portal-gunjs-backups\.md/);
});
