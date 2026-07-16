const { appendContactFooter } = require('./contact-footer');

function normalizeText(value) {
  return String(value || '').trim();
}

function buildCommercialFooter(config = process.env) {
  const postalAddress = normalizeText(config.THREEDVR_OUTREACH_POSTAL_ADDRESS);
  const optOutText = normalizeText(config.THREEDVR_OUTREACH_OPT_OUT_TEXT)
    || 'To opt out of future messages, reply unsubscribe or stop.';
  return [
    'Business offer from 3dvr.tech.',
    postalAddress ? `Postal address: ${postalAddress}` : '',
    optOutText,
  ].filter(Boolean).join('\n');
}

function finalizeCommercialOutreach(text, config = process.env) {
  const body = appendContactFooter(text, {
    website: config.THREEDVR_CONTACT_WEBSITE || 'https://3dvr.tech',
    email: config.GMAIL_USER || '3dvr.tech@gmail.com',
    phone: config.THREEDVR_OUTREACH_PHONE || '',
  });
  const footer = buildCommercialFooter(config);
  if (body.includes(footer)) return body;
  return `${body}\n\n${footer}`;
}

function validateCommercialOutreach(text, config = process.env) {
  const body = String(text || '');
  const postalAddress = normalizeText(config.THREEDVR_OUTREACH_POSTAL_ADDRESS);
  const errors = [];
  if (!postalAddress) {
    errors.push('THREEDVR_OUTREACH_POSTAL_ADDRESS is required for commercial email.');
  } else if (!body.includes(postalAddress)) {
    errors.push('Commercial email is missing the configured postal address.');
  }
  if (!/\b(?:advertisement|commercial (?:message|offer)|business offer|solicitation)\b/i.test(body)) {
    errors.push('Commercial email is missing a clear business-offer disclosure.');
  }
  if (!/\b(opt out|unsubscribe|stop)\b/i.test(body)) {
    errors.push('Commercial email is missing a clear opt-out method.');
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  buildCommercialFooter,
  finalizeCommercialOutreach,
  validateCommercialOutreach,
};
