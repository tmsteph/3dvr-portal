const { finishProjection, getProspect, pendingProjections } = require('./revenue-ledger');
const { buildLeadId, writeCrmSync } = require('./crm-sync');

function remoteProjectionRoots() {
  const Gun = require('gun');
  const gun = Gun({
    peers: [process.env.THREEDVR_GUN_RELAY || 'wss://gun-relay-3dvr.fly.dev/gun'],
    radisk: false,
    localStorage: false,
  });
  return {
    crmRoot: gun.get('3dvr-crm'),
    touchRoot: gun.get(process.env.THREEDVR_GUN_PORTAL_ROOT || '3dvr-portal').get('crm-touch-log'),
  };
}

function recordFor(prospect, event, now) {
  const crmStatus = {
    prospect: 'Lead', verified: 'Lead', drafted: 'Lead', eligible: 'Lead',
    sent: 'Warm - Follow-up', replied: 'Warm - Discovery', bounced: 'Lost',
    failed: 'Lost', suppressed: 'Closed',
  }[prospect.state] || 'Lead';
  return {
    id: buildLeadId({ name: prospect.name, contact: prospect.contact, link: prospect.source_url }),
    recordType: 'person',
    name: prospect.name,
    company: prospect.name,
    email: /@/.test(prospect.contact) ? prospect.contact.replace(/^mailto:/i, '') : '',
    status: crmStatus,
    canonicalState: prospect.state,
    source: '3dvr-revenue-ledger',
    campaignId: prospect.campaign_id,
    lastSignal: `Canonical revenue state: ${prospect.state}`,
    nextBestAction: ['bounced', 'suppressed'].includes(prospect.state) ? 'Do not contact.' : 'Follow the canonical revenue state machine.',
    created: prospect.created_at,
    updated: now,
    canonicalEventId: event.id,
  };
}

function touchFor(prospect, event, now) {
  const recordId = buildLeadId({ name: prospect.name, contact: prospect.contact, link: prospect.source_url });
  return {
    id: `revenue-event-${event.id}`,
    recordId,
    crmRecordId: recordId,
    contactName: prospect.name,
    type: 'note',
    touchType: event.type,
    summary: `${event.from_state || 'import'} -> ${event.to_state}`,
    source: '3dvr-revenue-ledger',
    created: event.created_at,
    updated: now,
  };
}

async function projectPendingCrm(db, options = {}) {
  const write = options.write || writeCrmSync;
  const writeOptions = options.writeOptions || (options.write ? {} : remoteProjectionRoots());
  const rows = pendingProjections(db, options.limit || 100);
  const result = { attempted: rows.length, succeeded: 0, failed: 0, errors: [] };
  for (const row of rows) {
    const prospect = getProspect(db, row.prospect_id);
    const event = db.prepare('SELECT * FROM revenue_events WHERE id = ?').get(row.event_id);
    try {
      if (!(prospect && event)) throw new Error('Projection references missing canonical data');
      const now = new Date().toISOString();
      const response = await write({ records: [recordFor(prospect, event, now)], touches: [touchFor(prospect, event, now)] }, writeOptions);
      if (response?.errors?.length) throw new Error(response.errors.join('; '));
      finishProjection(db, { id: row.id, status: 'succeeded' });
      result.succeeded += 1;
    } catch (error) {
      const message = String(error?.message || error);
      finishProjection(db, { id: row.id, status: 'failed', error: message });
      result.failed += 1;
      result.errors.push(message);
    }
  }
  return result;
}

module.exports = { projectPendingCrm, recordFor, remoteProjectionRoots, touchFor };
