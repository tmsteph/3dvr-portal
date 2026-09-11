function normalizeText(value) {
  return String(value || '').trim();
}

function serviceConfig(config = process.env) {
  const baseUrl = normalizeText(config.NEWSLETTER_STORE_URL).replace(/\/$/, '');
  const token = normalizeText(config.NEWSLETTER_STORE_TOKEN);
  return baseUrl && token ? { baseUrl, token } : null;
}

function crmConfigured(config = process.env) {
  return Boolean(serviceConfig(config) || normalizeText(config.DATABASE_URL));
}

async function serviceGet(path, params = {}, config = process.env, fetchImpl = fetch) {
  const selected = serviceConfig(config);
  if (!selected) throw new Error('CRM store service is not configured.');
  const url = new URL(`${selected.baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${selected.token}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('CRM contact was not found.');
    throw new Error(`CRM store returned ${response.status}.`);
  }
  return response.json();
}

async function withPool(action, config = process.env) {
  const connectionString = normalizeText(config.DATABASE_URL);
  if (!connectionString) throw new Error('DATABASE_URL is not configured for the SQL CRM connector.');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    return await action(pool);
  } finally {
    await pool.end();
  }
}

function safeContact(row = {}) {
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

async function crmSummary({ config = process.env, fetchImpl = fetch } = {}) {
  if (serviceConfig(config)) return serviceGet('/v1/crm/summary', {}, config, fetchImpl);
  return withPool(async (pool) => {
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
  }, config);
}

async function searchCrmContacts({ query = '', limit = 20, includeSuppressed = false, config = process.env, fetchImpl = fetch } = {}) {
  const term = normalizeText(query);
  const selectedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  if (serviceConfig(config)) {
    return serviceGet('/v1/crm/search', {
      q: term,
      limit: selectedLimit,
      include_suppressed: Boolean(includeSuppressed),
    }, config, fetchImpl);
  }
  return withPool(async (pool) => {
    const values = [];
    const clauses = [];
    if (!includeSuppressed) clauses.push('suppressed = FALSE');
    if (term) {
      values.push(`%${term}%`);
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
      query: term,
      includeSuppressed: Boolean(includeSuppressed),
      returned: result.rows.length,
      contacts: result.rows.map(safeContact),
    };
  }, config);
}

async function readCrmContact({ contactId, activityLimit = 20, config = process.env, fetchImpl = fetch } = {}) {
  const id = normalizeText(contactId);
  if (!id) throw new Error('contactId is required.');
  const selectedLimit = Math.max(1, Math.min(100, Number(activityLimit) || 20));
  if (serviceConfig(config)) {
    return serviceGet(`/v1/crm/contacts/${encodeURIComponent(id)}`, {
      activity_limit: selectedLimit,
    }, config, fetchImpl);
  }
  return withPool(async (pool) => {
    const [contact, activities] = await Promise.all([
      pool.query(`SELECT contact_id, record_type, name, company, email, phone, website, status,
        source, consent_status, suppressed, suppression_reason, created_at, updated_at
        FROM crm_contacts WHERE contact_id = $1 LIMIT 1`, [id]),
      pool.query(`SELECT activity_id, activity_type, channel, status, occurred_at, subject, source, created_at
        FROM crm_activities WHERE contact_id = $1
        ORDER BY occurred_at DESC LIMIT $2`, [id, selectedLimit]),
    ]);
    if (!contact.rows.length) throw new Error(`CRM contact not found: ${id}`);
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
  }, config);
}

module.exports = {
  crmConfigured,
  crmSummary,
  readCrmContact,
  safeContact,
  searchCrmContacts,
  serviceConfig,
  serviceGet,
};
