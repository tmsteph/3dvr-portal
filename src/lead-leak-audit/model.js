export const clean = (value, limit = 1000) => String(value || '').trim().slice(0, limit);

export const BUSINESS_TYPES = ['Contractor / trades', 'Law office', 'Home services', 'Other local service business'];

export function normalizeAuditRequest(input = {}) {
  const request = {};
  request.business = clean(input.business, 200);
  request.name = clean(input.name, 200);
  request.email = clean(input.email, 254).toLowerCase();
  request.website = clean(input.website, 300);
  request.phone = clean(input.phone, 60);
  request.businessType = BUSINESS_TYPES.includes(input.businessType) ? input.businessType : 'Other local service business';
  request.note = clean(input.note, 3000);
  request.leaks = Array.isArray(input.leaks)
    ? input.leaks.slice(0, 6).map(value => clean(value, 200)).filter(Boolean)
    : [];
  request.leadsPerMonth = clean(input.leadsPerMonth, 40);
  request.valuePerJob = clean(input.valuePerJob, 40);
  if (!request.business || !request.name || !request.email || !request.phone) {
    throw new Error('Complete the required fields so we know where to audit and where to send the report.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) throw new Error('Enter a valid email address.');
  return request;
}

export function notifyEmail(config = process.env) {
  const value = String(config.LEAD_LEAK_AUDIT_NOTIFY_EMAIL || '3dvrtech@gmail.com').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : '3dvrtech@gmail.com';
}

export function auditNotification(request) {
  const leaks = request.leaks.length
    ? request.leaks.map(title => '  - ' + title).join('\n')
    : '  - (did not run the self-check)';
  const body = [
    'New Lead Leak Audit request from the portal form.',
    '',
    'Business: ' + request.business,
    'Name: ' + request.name,
    'Email: ' + request.email,
    'Type: ' + request.businessType,
    'Website: ' + (request.website || '(none / not sure)'),
    'Number customers call: ' + request.phone,
    '',
    'Self-check leaks they spotted (' + request.leaks.length + ' of 6):',
    leaks,
    '',
    'Estimator inputs: ~' + (request.leadsPerMonth || '?') + ' leads/mo, ~$' + (request.valuePerJob || '?') + ' per job',
    'What they suspect is leaking: ' + (request.note || '(nothing specific)'),
    '',
    'Reply to ' + request.email + ' within 1 business day to confirm the audit is on.'
  ].join('\n');
  return { subject: 'Free Lead Leak Audit request: ' + request.business, body };
}
