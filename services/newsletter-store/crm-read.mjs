function text(value) {
  return String(value || '').trim();
}

function limit(value, fallback = 20) {
  const parsed = Number.parseInt(value, 10);
  return Math.max(1, Math.min(100, Number.isFinite(parsed) ? parsed : fallback));
}

export function safeContact(row = {}) {
  return {
    contactId: row.contact_id,
    recordType: row.record_type,
    name: row.name || '',
    company: row.company || '',
    email: row.email || '',
    phone: row.phone || '',
    website: row.website || '',
    status: row.status || '',
    source: row.source || '',
    consentStatus: row.consent_status || 'unknown',
    suppressed: Boolean(row.suppressed),
    suppressionReason: row.suppression_reason || '',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export async function crmSummary(pool) {
  const [totals, statuses, recent] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE suppressed = TRUE)::int AS suppressed,
      COUNT(*) FILTER (WHERE email IS NOT NULL AND email <> '')::int AS with_email
      FROM crm_contacts`),
    pool.query(`SELECT COALESCE(NULLIF(status, ''), 'unknown') AS status, COUNT(*)::int AS count
      FROM crm_contacts GROUP BY 1 ORDER BY count DESC, status ASC LIMIT 25`),
    pool.query(`SELECT contact_id, record_type, name, company, email, phone, website, status,
      source, consent_status, suppressed, suppression_reason, created_at, updated_at
      FROM crm_contacts ORDER BY updated_at DESC NULLS LAST LIMIT 10`),
  ]);
  return {
    backend: 'postgres',
    table: 'crm_contacts',
    total: totals.rows[0]?.total || 0,
    suppressed: totals.rows[0]?.suppressed || 0,
    withEmail: totals.rows[0]?.with_email || 0,
    statusCounts: statuses.rows,
    recentlyUpdated: recent.rows.map(safeContact),
  };
}

export async function searchCrmContacts(pool, input = {}) {
  const query = text(input.query);
  const selectedLimit = limit(input.limit);
  const includeSuppressed = input.includeSuppressed === true;
  const values = [];
  const clauses = [];
  if (!includeSuppressed) clauses.push('suppressed = FALSE');
  if (query) {
    values.push(`%${query}%`);
    const slot = `$${values.length}`;
    clauses.push(`(name ILIKE ${slot} OR company ILIKE ${slot} OR email ILIKE ${slot} OR website ILIKE ${slot} OR status ILIKE ${slot})`);
  }
  values.push(selectedLimit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(`SELECT contact_id, record_type, name, company, email, phone, website, status,
    source, consent_status, suppressed, suppression_reason, created_at, updated_at
    FROM crm_contacts ${where}
    ORDER BY updated_at DESC NULLS LAST, name ASC NULLS LAST
    LIMIT $${values.length}`, values);
  return {
    backend: 'postgres',
    query,
    includeSuppressed,
    returned: result.rows.length,
    contacts: result.rows.map(safeContact),
  };
}

export async function readCrmContact(pool, input = {}) {
  const contactId = text(input.contactId);
  if (!contactId) throw new Error('contactId is required.');
  const activityLimit = limit(input.activityLimit);
  const [contact, activities] = await Promise.all([
    pool.query(`SELECT contact_id, record_type, name, company, email, phone, website, status,
      source, consent_status, suppressed, suppression_reason, created_at, updated_at
      FROM crm_contacts WHERE contact_id = $1 LIMIT 1`, [contactId]),
    pool.query(`SELECT activity_id, activity_type, channel, status, occurred_at, subject, source, created_at
      FROM crm_activities WHERE contact_id = $1
      ORDER BY occurred_at DESC LIMIT $2`, [contactId, activityLimit]),
  ]);
  if (!contact.rows.length) return null;
  return {
    backend: 'postgres',
    contact: safeContact(contact.rows[0]),
    activities: activities.rows.map(row => ({
      activityId: row.activity_id,
      activityType: row.activity_type,
      channel: row.channel || '',
      status: row.status || '',
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
      subject: row.subject || '',
      source: row.source || '',
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    })),
  };
}
