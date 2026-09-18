const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function parseRecipientLine(line = '') {
  const raw = String(line || '').trim();
  if (!raw) return null;
  const bracket = raw.match(/^(.*?)\s*<([^<>]+)>\s*$/);
  const email = normalizeEmail(bracket ? bracket[2] : raw.split(/[;,\s]+/).find(part => part.includes('@')));
  if (!EMAIL_RE.test(email)) return null;
  const name = String(bracket ? bracket[1] : '').trim().replace(/^["']|["']$/g, '');
  return { email, name };
}

export function parseRecipients(value = '') {
  const seen = new Set();
  const recipients = [];
  String(value || '')
    .split(/[\r\n]+/)
    .flatMap(line => line.includes(',') && !line.includes('<') ? line.split(',') : [line])
    .forEach(line => {
      const recipient = parseRecipientLine(line);
      if (!recipient || seen.has(recipient.email)) return;
      seen.add(recipient.email);
      recipients.push(recipient);
    });
  return recipients;
}

export function firstName(name = '') {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

export function personalize(body = '', recipient = {}) {
  return String(body || '')
    .replace(/{{\s*first_name\s*}}/gi, firstName(recipient.name))
    .replace(/{{\s*name\s*}}/gi, String(recipient.name || '').trim() || 'there')
    .replace(/{{\s*email\s*}}/gi, normalizeEmail(recipient.email));
}

export function buildCommercialFooter({
  businessName = '',
  postalAddress = '',
  optOutText = 'To opt out of future emails, reply unsubscribe or stop.'
} = {}) {
  const name = String(businessName || '').trim();
  const address = String(postalAddress || '').trim();
  const optOut = String(optOutText || '').trim()
    || 'To opt out of future emails, reply unsubscribe or stop.';
  return [
    name ? `Business offer from ${name}.` : 'Business offer.',
    address ? `Postal address: ${address}` : '',
    optOut,
  ].filter(Boolean).join('\n');
}

export function composeMessage({
  body = '',
  recipient = {},
  businessName = '',
  postalAddress = '',
  optOutText = ''
} = {}) {
  const message = personalize(body, recipient).trim();
  const footer = buildCommercialFooter({ businessName, postalAddress, optOutText });
  return `${message}\n\n---\n${footer}`.trim();
}

export function validateCampaign({
  subject = '',
  body = '',
  businessName = '',
  postalAddress = '',
  recipients = [],
  sourceAcknowledged = false
} = {}) {
  const errors = [];
  if (!String(subject || '').trim()) errors.push('Add a subject.');
  if (!String(body || '').trim()) errors.push('Write the email.');
  if (!String(businessName || '').trim()) errors.push('Add the business or sender name.');
  if (!String(postalAddress || '').trim()) errors.push('Add the business postal address.');
  if (!Array.isArray(recipients) || !recipients.length) errors.push('Add at least one valid recipient.');
  if (!sourceAcknowledged) errors.push('Confirm that these are legitimate contacts, not a purchased or scraped spam list.');
  return { ok: errors.length === 0, errors };
}

export function filterSuppressed(recipients = [], suppressedEmails = []) {
  const suppressed = new Set((suppressedEmails || []).map(normalizeEmail).filter(Boolean));
  return (recipients || []).filter(recipient => !suppressed.has(normalizeEmail(recipient.email)));
}

export function campaignDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function remainingDailyAllowance(sentToday = 0, dailyCap = 25) {
  const cap = Math.max(1, Math.min(100, Number(dailyCap) || 25));
  return Math.max(0, cap - Math.max(0, Number(sentToday) || 0));
}
