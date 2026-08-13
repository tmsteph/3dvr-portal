import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const text = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('3DVR data resilience', () => {
  it('makes Postgres the durable business ledger and Gun the realtime layer', async () => {
    const policy = await text('docs/data-storage-policy.md');
    assert.match(policy, /Postgres is the durable business ledger/);
    assert.match(policy, /GunJS is the realtime\/local-first synchronization layer/);
    assert.match(policy, /Object storage holds files and large binary assets/);
    assert.match(policy, /CRM contacts and activities/);
    assert.match(policy, /orders and fulfillment state/);
  });

  it('validates Postgres dumps before publishing them', async () => {
    const backup = await text('ops/postgres/backup.sh');
    assert.match(backup, /pg_dump/);
    assert.match(backup, /--format=custom/);
    assert.match(backup, /pg_restore --list "\$tmp"/);
    assert.match(backup, /sha256sum|shasum/);
    assert.doesNotMatch(backup, /echo .*DATABASE_URL/);
  });

  it('schedules persistent nightly backups without coupling Gun to the relay host', async () => {
    const pgTimer = await text('ops/systemd/3dvr-postgres-backup.timer');
    const gunTimer = await text('ops/systemd/3dvr-gun-snapshot.timer');
    const gunService = await text('ops/systemd/3dvr-gun-snapshot.service');
    assert.match(pgTimer, /Persistent=true/);
    assert.match(gunTimer, /Persistent=true/);
    assert.match(gunService, /gun-relay-3dvr\.fly\.dev/);
    assert.match(gunService, /backup-known-roots\.mjs/);
    assert.match(gunService, /GUN_BACKUP_OUT_DIR=\/var\/backups\/3dvr\/gun-snapshots/);
  });

  it('does not describe Gun as the canonical CRM ledger anymore', async () => {
    const runbook = await text('ops/control-plane/home/RUNBOOKS/portal-gunjs-backups.md');
    assert.doesNotMatch(runbook, /GunJS as the source of truth for shared app state, CRM records/);
    assert.match(runbook, /not.*canonical ledger for CRM/i);
  });
});
