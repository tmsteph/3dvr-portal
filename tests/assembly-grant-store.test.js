import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createWorkspaceGrant,
  listWorkspaceGrants,
  revokeWorkspaceGrant,
} from '../services/newsletter-store/assembly-grants.mjs';

class FakePool {
  constructor() {
    this.grants = new Map();
    this.events = [];
    this.transactions = [];
  }

  async query(sql, params = []) {
    const query = String(sql).replace(/\s+/g, ' ').trim();
    if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
      this.transactions.push(query);
      return { rows: [], rowCount: 0 };
    }

    if (query.startsWith('INSERT INTO assembly_workspace_grants')) {
      const [grantId, workspaceId, principalId, profile, issuedBy, sourceType, sourceId, grantedAt, revokedAt] = params;
      if (this.grants.has(grantId)) return { rows: [], rowCount: 0 };
      const duplicateSource = [...this.grants.values()].some(row => row.source_type === sourceType && row.source_id === sourceId);
      if (duplicateSource) throw new Error('duplicate source');
      const row = {
        grant_id: grantId,
        workspace_id: workspaceId,
        principal_id: principalId,
        profile,
        issued_by: issuedBy,
        source_type: sourceType,
        source_id: sourceId,
        granted_at: grantedAt,
        revoked_at: revokedAt,
      };
      this.grants.set(grantId, row);
      return { rows: [row], rowCount: 1 };
    }

    if (query.startsWith('SELECT * FROM assembly_workspace_grants WHERE grant_id =')) {
      const row = this.grants.get(params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (query.startsWith('UPDATE assembly_workspace_grants')) {
      const [grantId, revokedAt] = params;
      const row = this.grants.get(grantId);
      if (!row || row.revoked_at != null) return { rows: [], rowCount: 0 };
      row.revoked_at = revokedAt;
      return { rows: [row], rowCount: 1 };
    }

    if (query.startsWith('INSERT INTO assembly_access_events')) {
      const [eventId, workspaceId, actorPrincipalId, targetPrincipalId, grantId, eventType, details, occurredAt] = params;
      this.events.push({ eventId, workspaceId, actorPrincipalId, targetPrincipalId, grantId, eventType, details: JSON.parse(details), occurredAt });
      return { rows: [], rowCount: 1 };
    }

    if (query.startsWith('SELECT * FROM assembly_workspace_grants WHERE workspace_id =')) {
      const workspaceId = params[0];
      const filtersPrincipal = query.includes('principal_id =');
      const principalId = filtersPrincipal ? params[1] : '';
      const activeOnly = query.includes('revoked_at IS NULL');
      const rows = [...this.grants.values()]
        .filter(row => row.workspace_id === workspaceId)
        .filter(row => !principalId || row.principal_id === principalId)
        .filter(row => !activeOnly || row.revoked_at == null);
      return { rows, rowCount: rows.length };
    }

    throw new Error(`Unexpected SQL in fake pool: ${query}`);
  }
}

function grant(overrides = {}) {
  return {
    grantId: 'grant_1',
    workspaceId: 'asm_1',
    principalId: 'sea:person',
    profile: 'editor',
    issuedBy: 'sea:owner',
    sourceInviteId: 'invite_1',
    grantedAt: 1000,
    revokedAt: null,
    ...overrides,
  };
}

test('grant creation is transactional, audited, and idempotent', async () => {
  const pool = new FakePool();
  const created = await createWorkspaceGrant(pool, grant());
  assert.equal(created.grantId, 'grant_1');
  assert.equal(created.sourceType, 'invite');
  assert.equal(pool.events.length, 1);
  assert.equal(pool.events[0].eventType, 'grant-created');
  assert.deepEqual(pool.transactions, ['BEGIN', 'COMMIT']);

  const replayed = await createWorkspaceGrant(pool, grant());
  assert.equal(replayed.grantId, 'grant_1');
  assert.equal(pool.events.length, 1, 'idempotent replay must not duplicate audit event');

  await assert.rejects(
    createWorkspaceGrant(pool, grant({ profile: 'viewer' })),
    /different attributes/,
  );
});

test('active grant listing and revocation preserve history', async () => {
  const pool = new FakePool();
  await createWorkspaceGrant(pool, grant());
  assert.equal((await listWorkspaceGrants(pool, { workspaceId: 'asm_1', principalId: 'sea:person' })).length, 1);

  const revoked = await revokeWorkspaceGrant(pool, {
    grantId: 'grant_1',
    actorPrincipalId: 'sea:owner',
    revokedAt: 2000,
    reason: 'Access no longer needed',
  });
  assert.equal(revoked.revokedAt, 2000);
  assert.equal(pool.events.at(-1).eventType, 'grant-revoked');
  assert.equal(pool.events.at(-1).details.reason, 'Access no longer needed');
  assert.equal((await listWorkspaceGrants(pool, { workspaceId: 'asm_1' })).length, 0);
  assert.equal((await listWorkspaceGrants(pool, { workspaceId: 'asm_1', includeRevoked: true })).length, 1);

  await revokeWorkspaceGrant(pool, {
    grantId: 'grant_1',
    actorPrincipalId: 'sea:owner',
    revokedAt: 3000,
  });
  assert.equal(pool.events.filter(event => event.eventType === 'grant-revoked').length, 1);
});

test('grant store rejects unsupported profiles and source types', async () => {
  const pool = new FakePool();
  await assert.rejects(createWorkspaceGrant(pool, grant({ profile: 'super-admin' })), /Unsupported grant profile/);
  await assert.rejects(createWorkspaceGrant(pool, grant({ sourceType: 'public-link', sourceId: 'x' })), /Unsupported grant source type/);
});

test('schema keeps Assembly grants private, revocable, indexed, and audited', async () => {
  const schema = await readFile(new URL('../services/newsletter-store/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS assembly_workspace_grants/);
  assert.match(schema, /profile IN \('owner', 'editor', 'viewer'\)/);
  assert.match(schema, /WHERE revoked_at IS NULL/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS assembly_access_events/);
  assert.match(schema, /GRANT SELECT, INSERT, UPDATE ON assembly_workspace_grants TO newsletter_store/);
  assert.match(schema, /GRANT SELECT, INSERT ON assembly_access_events TO newsletter_store/);
  assert.doesNotMatch(schema, /GRANT[^;]*DELETE[^;]*assembly_workspace_grants/);
});
