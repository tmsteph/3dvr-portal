import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SOURCE_NAME = 'digitalocean-agent-v1';

function clean(value) {
  return String(value ?? '').trim();
}

function digest(value, length = 24) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function parseCsvRows(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    if (row.some(value => value !== '')) rows.push(row);
  }
  if (rows.length < 1) return [];
  const headers = rows.shift().map(clean);
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, clean(values[index])])));
}

function parseContactRoute(value) {
  const route = clean(value);
  if (!route) return { email: '', phone: '' };
  const email = route.replace(/^mailto:/i, '').split(/[?\s]/)[0];
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email: email.toLowerCase(), phone: '' };
  const phone = route.replace(/^tel:/i, '').replace(/[^+\d]/g, '');
  return phone.length >= 7 ? { email: '', phone } : { email: '', phone: '' };
}

function suppressionFrom(raw) {
  const evidence = [raw.status, raw.note, raw.subject].map(clean).join(' ').toLowerCase();
  if (/\b(unsubscribe|opt[ -]?out|do not contact|not interested|stop contacting)\b/.test(evidence)) {
    return { suppressed: true, reason: 'historical opt-out or negative response', consentStatus: 'declined' };
  }
  if (/\b(bounce|bounced|invalid recipient|mailbox unavailable)\b/.test(evidence)) {
    return { suppressed: true, reason: 'historical delivery failure', consentStatus: 'unknown' };
  }
  return { suppressed: false, reason: '', consentStatus: 'unknown' };
}

function contactIdentity(raw) {
  const { email, phone } = parseContactRoute(raw.contact);
  const website = clean(raw.link || raw.site).replace(/\/$/, '');
  const name = clean(raw.name);
  const key = email || phone || website.toLowerCase() || name.toLowerCase();
  return { id: `contact-${digest(key || JSON.stringify(raw))}`, email, phone, website, name };
}

export function buildMigration(leadsCsv, outreachNdjson) {
  const leadRows = parseCsvRows(leadsCsv);
  const eventRows = outreachNdjson.split(/\n/).map(clean).filter(Boolean).map(line => JSON.parse(line));
  const contactMap = new Map();
  const lookup = new Map();
  const duplicates = [];

  for (const raw of leadRows) {
    const identity = contactIdentity(raw);
    const suppression = suppressionFrom(raw);
    if (contactMap.has(identity.id)) duplicates.push({ id: identity.id, name: identity.name });
    const existing = contactMap.get(identity.id) || {};
    const contact = {
      contactId: identity.id,
      recordType: 'company',
      name: identity.name || existing.name || '',
      company: identity.name || existing.company || '',
      email: identity.email || existing.email || '',
      phone: identity.phone || existing.phone || '',
      website: identity.website || existing.website || '',
      status: clean(raw.status) || existing.status || 'lead',
      source: SOURCE_NAME,
      consentStatus: suppression.consentStatus,
      suppressed: suppression.suppressed || existing.suppressed || false,
      suppressionReason: suppression.reason || existing.suppressionReason || '',
      rawData: { ...(existing.rawData || {}), lead: raw }
    };
    contactMap.set(identity.id, contact);
    [contact.email, contact.phone, contact.website.toLowerCase(), contact.name.toLowerCase()]
      .filter(Boolean).forEach(key => lookup.set(key, identity.id));
  }

  let contactsFromActivities = 0;
  const activities = eventRows.map((raw, index) => {
    const identity = contactIdentity(raw);
    let contactId = contactMap.has(identity.id)
      ? identity.id
      : [identity.email, identity.phone, identity.website.toLowerCase(), identity.name.toLowerCase()]
          .map(key => lookup.get(key)).find(Boolean) || null;
    const suppression = suppressionFrom(raw);
    if (!contactId && (identity.name || identity.email || identity.phone || identity.website)) {
      contactId = identity.id;
      const contact = {
        contactId,
        recordType: 'company',
        name: identity.name,
        company: identity.name,
        email: identity.email,
        phone: identity.phone,
        website: identity.website,
        status: 'lead',
        source: SOURCE_NAME,
        consentStatus: suppression.consentStatus,
        suppressed: suppression.suppressed,
        suppressionReason: suppression.reason,
        rawData: { activityOrigin: raw }
      };
      contactMap.set(contactId, contact);
      [contact.email, contact.phone, contact.website.toLowerCase(), contact.name.toLowerCase()]
        .filter(Boolean).forEach(key => lookup.set(key, contactId));
      contactsFromActivities += 1;
    }
    if (contactId && suppression.suppressed) {
      const contact = contactMap.get(contactId);
      contactMap.set(contactId, {
        ...contact,
        suppressed: true,
        suppressionReason: suppression.reason,
        consentStatus: suppression.consentStatus
      });
    }
    const occurredAt = new Date(raw.timestamp || 0);
    const safeTime = Number.isNaN(occurredAt.getTime()) ? new Date(0) : occurredAt;
    const activityKey = [safeTime.toISOString(), raw.kind, raw.status, raw.contact, raw.subject, raw.name, index].join('|');
    return {
      activityId: `activity-${digest(activityKey)}`,
      contactId,
      activityType: clean(raw.kind) || 'outreach',
      channel: clean(raw.route || raw.transport),
      status: clean(raw.status),
      occurredAt: safeTime.toISOString(),
      subject: clean(raw.subject),
      body: clean(raw.body),
      source: SOURCE_NAME,
      rawData: raw
    };
  });

  const contacts = [...contactMap.values()];
  const unmatchedActivities = activities.filter(activity => !activity.contactId).length;
  const rawRecords = [
    ...leadRows.map((raw, index) => ({ sourceRecordId: `lead-${index + 1}-${digest(JSON.stringify(raw), 12)}`, recordKind: 'lead', rawData: raw })),
    ...eventRows.map((raw, index) => ({ sourceRecordId: `activity-${index + 1}-${digest(JSON.stringify(raw), 12)}`, recordKind: 'activity', rawData: raw }))
  ];
  const sourceHash = digest(JSON.stringify(rawRecords), 64);
  return {
    sourceName: SOURCE_NAME,
    sourceHash,
    contacts,
    activities,
    rawRecords,
    report: {
      leadsSeen: leadRows.length,
      contactsPrepared: contacts.length,
      duplicateLeads: duplicates.length,
      contactsFromActivities,
      activitiesSeen: eventRows.length,
      activitiesPrepared: activities.length,
      unmatchedActivities,
      suppressedContacts: contacts.filter(contact => contact.suppressed).length,
      sourceHash
    }
  };
}

async function applyMigration(pool, migration) {
  const client = await pool.connect();
  const runId = `import-${migration.sourceHash.slice(0, 24)}`;
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO crm_import_runs (run_id, source_name, source_hash, dry_run, report)
      VALUES ($1, $2, $3, FALSE, $4::jsonb)
      ON CONFLICT (run_id) DO UPDATE SET report = EXCLUDED.report, completed_at = NULL`,
      [runId, migration.sourceName, migration.sourceHash, JSON.stringify(migration.report)]);
    for (const record of migration.rawRecords) {
      await client.query(`INSERT INTO crm_raw_records (source_name, source_record_id, record_kind, content_hash, raw_data)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (source_name, source_record_id) DO UPDATE SET
          content_hash = EXCLUDED.content_hash, raw_data = EXCLUDED.raw_data, last_seen_at = NOW()`,
        [migration.sourceName, record.sourceRecordId, record.recordKind, digest(JSON.stringify(record.rawData), 64), JSON.stringify(record.rawData)]);
    }
    for (const contact of migration.contacts) {
      await client.query(`INSERT INTO crm_contacts
        (contact_id, record_type, name, company, email, phone, website, status, source, consent_status, suppressed, suppression_reason, raw_data)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
        ON CONFLICT (contact_id) DO UPDATE SET
          name = COALESCE(NULLIF(crm_contacts.name, ''), EXCLUDED.name),
          company = COALESCE(NULLIF(crm_contacts.company, ''), EXCLUDED.company),
          email = COALESCE(NULLIF(crm_contacts.email, ''), EXCLUDED.email),
          phone = COALESCE(NULLIF(crm_contacts.phone, ''), EXCLUDED.phone),
          website = COALESCE(NULLIF(crm_contacts.website, ''), EXCLUDED.website),
          suppressed = crm_contacts.suppressed OR EXCLUDED.suppressed,
          suppression_reason = COALESCE(NULLIF(crm_contacts.suppression_reason, ''), EXCLUDED.suppression_reason),
          consent_status = CASE WHEN crm_contacts.consent_status = 'declined' THEN 'declined' ELSE EXCLUDED.consent_status END,
          raw_data = crm_contacts.raw_data || EXCLUDED.raw_data,
          updated_at = NOW()`,
        [contact.contactId, contact.recordType, contact.name || null, contact.company || null, contact.email || null,
          contact.phone || null, contact.website || null, contact.status || null, contact.source, contact.consentStatus,
          contact.suppressed, contact.suppressionReason || null, JSON.stringify(contact.rawData)]);
    }
    for (const activity of migration.activities) {
      await client.query(`INSERT INTO crm_activities
        (activity_id, contact_id, activity_type, channel, status, occurred_at, subject, body, source, raw_data)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
        ON CONFLICT (activity_id) DO UPDATE SET raw_data = crm_activities.raw_data || EXCLUDED.raw_data`,
        [activity.activityId, activity.contactId, activity.activityType, activity.channel || null, activity.status || null,
          activity.occurredAt, activity.subject || null, activity.body || null, activity.source, JSON.stringify(activity.rawData)]);
    }
    await client.query('UPDATE crm_import_runs SET completed_at = NOW() WHERE run_id = $1', [runId]);
    await client.query('COMMIT');
    return { ...migration.report, applied: true, runId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  const leadsIndex = argv.indexOf('--leads');
  const eventsIndex = argv.indexOf('--events');
  const leadsPath = leadsIndex >= 0 ? argv[leadsIndex + 1] : './leads.csv';
  const eventsPath = eventsIndex >= 0 ? argv[eventsIndex + 1] : './outreach-log.ndjson';
  const [leadsCsv, outreachNdjson] = await Promise.all([fs.readFile(leadsPath, 'utf8'), fs.readFile(eventsPath, 'utf8')]);
  const migration = buildMigration(leadsCsv, outreachNdjson);
  if (!apply) {
    console.log(JSON.stringify({ ...migration.report, applied: false, mode: 'dry-run' }, null, 2));
    return;
  }
  const databaseUrl = clean(process.env.DATABASE_URL);
  if (!databaseUrl) throw new Error('DATABASE_URL is required with --apply.');
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    console.log(JSON.stringify(await applyMigration(pool, migration), null, 2));
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
