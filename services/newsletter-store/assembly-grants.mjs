import { randomUUID } from 'node:crypto';

const PROFILES = new Set(['owner', 'editor', 'viewer']);
const SOURCE_TYPES = new Set(['invite', 'bootstrap', 'admin']);

function text(value, label, max = 500) {
  const result = String(value || '').trim().slice(0, max);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function dateValue(value, label) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid.`);
  return date;
}

function rowToGrant(row = {}) {
  return {
    grantId: row.grant_id,
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
    profile: row.profile,
    issuedBy: row.issued_by,
    sourceType: row.source_type,
    sourceId: row.source_id,
    grantedAt: new Date(row.granted_at).getTime(),
    revokedAt: row.revoked_at == null ? null : new Date(row.revoked_at).getTime(),
  };
}

function normalizeGrant(input = {}) {
  const profile = text(input.profile, 'Grant profile', 32);
  if (!PROFILES.has(profile)) throw new Error(`Unsupported grant profile: ${profile}`);
  const sourceType = String(input.sourceType || 'invite').trim();
  if (!SOURCE_TYPES.has(sourceType)) throw new Error(`Unsupported grant source type: ${sourceType}`);
  const sourceId = input.sourceId || input.sourceInviteId;
  return {
    grantId: text(input.grantId, 'Grant ID', 220),
    workspaceId: text(input.workspaceId, 'Workspace ID', 220),
    principalId: text(input.principalId, 'Principal ID', 500),
    profile,
    issuedBy: text(input.issuedBy, 'Grant issuer', 500),
    sourceType,
    sourceId: text(sourceId, 'Grant source ID', 220),
    grantedAt: dateValue(input.grantedAt, 'Grant timestamp'),
    revokedAt: input.revokedAt == null ? null : dateValue(input.revokedAt, 'Grant revocation timestamp'),
  };
}

async function inTransaction(pool, action) {
  const client = typeof pool?.connect === 'function' ? await pool.connect() : pool;
  if (!client?.query) throw new Error('Postgres client is required.');
  const release = client !== pool && typeof client.release === 'function' ? () => client.release() : () => {};
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    release();
  }
}

async function insertEvent(client, input) {
  const eventId = text(input.eventId || `assembly-event-${randomUUID()}`, 'Event ID', 220);
  const workspaceId = text(input.workspaceId, 'Event workspace ID', 220);
  const actorPrincipalId = text(input.actorPrincipalId, 'Event actor principal ID', 500);
  const eventType = text(input.eventType, 'Event type', 120);
  const targetPrincipalId = input.targetPrincipalId ? text(input.targetPrincipalId, 'Event target principal ID', 500) : null;
  const grantId = input.grantId ? text(input.grantId, 'Event grant ID', 220) : null;
  const occurredAt = dateValue(input.occurredAt, 'Event timestamp');
  const details = input.details && typeof input.details === 'object' ? input.details : {};
  await client.query(`
    INSERT INTO assembly_access_events
      (event_id, workspace_id, actor_principal_id, target_principal_id, grant_id, event_type, details, occurred_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
  `, [eventId, workspaceId, actorPrincipalId, targetPrincipalId, grantId, eventType, JSON.stringify(details), occurredAt.toISOString()]);
  return eventId;
}

function sameGrant(a, b) {
  return a.grantId === b.grantId &&
    a.workspaceId === b.workspaceId &&
    a.principalId === b.principalId &&
    a.profile === b.profile &&
    a.issuedBy === b.issuedBy &&
    a.sourceType === b.sourceType &&
    a.sourceId === b.sourceId &&
    a.grantedAt === b.grantedAt &&
    a.revokedAt === b.revokedAt;
}

export async function createWorkspaceGrant(pool, input = {}) {
  const grant = normalizeGrant(input);
  return inTransaction(pool, async client => {
    const inserted = await client.query(`
      INSERT INTO assembly_workspace_grants
        (grant_id, workspace_id, principal_id, profile, issued_by, source_type, source_id, granted_at, revoked_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (grant_id) DO NOTHING
      RETURNING *
    `, [
      grant.grantId,
      grant.workspaceId,
      grant.principalId,
      grant.profile,
      grant.issuedBy,
      grant.sourceType,
      grant.sourceId,
      grant.grantedAt.toISOString(),
      grant.revokedAt?.toISOString() || null,
    ]);

    if (!inserted.rows.length) {
      const existingResult = await client.query('SELECT * FROM assembly_workspace_grants WHERE grant_id = $1', [grant.grantId]);
      if (!existingResult.rows.length) throw new Error('Grant could not be created.');
      const existing = rowToGrant(existingResult.rows[0]);
      const comparable = { ...grant, grantedAt: grant.grantedAt.getTime(), revokedAt: grant.revokedAt?.getTime() ?? null };
      if (!sameGrant(existing, comparable)) throw new Error('Grant ID already exists with different attributes.');
      return existing;
    }

    const created = rowToGrant(inserted.rows[0]);
    await insertEvent(client, {
      workspaceId: created.workspaceId,
      actorPrincipalId: created.issuedBy,
      targetPrincipalId: created.principalId,
      grantId: created.grantId,
      eventType: 'grant-created',
      occurredAt: created.grantedAt,
      details: { profile: created.profile, sourceType: created.sourceType, sourceId: created.sourceId },
    });
    return created;
  });
}

export async function revokeWorkspaceGrant(pool, input = {}) {
  const grantId = text(input.grantId, 'Grant ID', 220);
  const actorPrincipalId = text(input.actorPrincipalId, 'Revocation actor principal ID', 500);
  const revokedAt = dateValue(input.revokedAt, 'Grant revocation timestamp');
  const reason = String(input.reason || '').trim().slice(0, 500);

  return inTransaction(pool, async client => {
    const result = await client.query(`
      UPDATE assembly_workspace_grants
      SET revoked_at = $2, updated_at = NOW()
      WHERE grant_id = $1 AND revoked_at IS NULL
      RETURNING *
    `, [grantId, revokedAt.toISOString()]);

    if (!result.rows.length) {
      const existingResult = await client.query('SELECT * FROM assembly_workspace_grants WHERE grant_id = $1', [grantId]);
      if (!existingResult.rows.length) throw new Error('Workspace grant not found.');
      return rowToGrant(existingResult.rows[0]);
    }

    const revoked = rowToGrant(result.rows[0]);
    await insertEvent(client, {
      workspaceId: revoked.workspaceId,
      actorPrincipalId,
      targetPrincipalId: revoked.principalId,
      grantId: revoked.grantId,
      eventType: 'grant-revoked',
      occurredAt: revokedAt,
      details: reason ? { reason } : {},
    });
    return revoked;
  });
}

export async function listWorkspaceGrants(pool, input = {}) {
  if (!pool?.query) throw new Error('Postgres client is required.');
  const workspaceId = text(input.workspaceId, 'Workspace ID', 220);
  const principalId = input.principalId ? text(input.principalId, 'Principal ID', 500) : '';
  const includeRevoked = input.includeRevoked === true;
  const limit = Math.max(1, Math.min(200, Number(input.limit) || 100));
  const values = [workspaceId];
  const clauses = ['workspace_id = $1'];
  if (principalId) {
    values.push(principalId);
    clauses.push(`principal_id = $${values.length}`);
  }
  if (!includeRevoked) clauses.push('revoked_at IS NULL');
  values.push(limit);
  const result = await pool.query(`
    SELECT * FROM assembly_workspace_grants
    WHERE ${clauses.join(' AND ')}
    ORDER BY granted_at DESC
    LIMIT $${values.length}
  `, values);
  return result.rows.map(rowToGrant);
}

export async function appendAssemblyAccessEvent(pool, input = {}) {
  return inTransaction(pool, client => insertEvent(client, input));
}
