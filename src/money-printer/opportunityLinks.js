function text(value) {
  return String(value ?? '').trim();
}

function paramsFromSearch(search = '') {
  if (search instanceof URLSearchParams) return search;
  const raw = text(search);
  return new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
}

export function parseOpportunityCaptureContext(search = '') {
  const params = paramsFromSearch(search);
  return {
    personId: text(params.get('crmRecordId')),
    organizationId: text(params.get('organizationId')),
    crmName: text(params.get('crmName')),
  };
}

export function buildOpportunityCaptureHref(record = {}, basePath = '../money-printer/') {
  const params = new URLSearchParams();
  const personId = text(record.id || record.crmRecordId);
  const organizationId = text(record.groupId || record.organizationId);
  const crmName = text(record.name || record.crmName);

  if (personId) params.set('crmRecordId', personId);
  if (organizationId) params.set('organizationId', organizationId);
  if (crmName) params.set('crmName', crmName);

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
