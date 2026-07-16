function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  const email = normalizeText(value).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function buildContactFooter({
  website = process.env.THREEDVR_CONTACT_WEBSITE || 'https://3dvr.tech',
  email = process.env.GMAIL_USER || '3dvr.tech@gmail.com',
  phone = process.env.THREEDVR_OUTREACH_PHONE || '',
} = {}) {
  const lines = [
    `Website: ${normalizeText(website) || 'https://3dvr.tech'}`,
    `Email: ${normalizeEmail(email) || '3dvr.tech@gmail.com'}`,
  ];

  const normalizedPhone = normalizeText(phone);
  if (normalizedPhone) {
    lines.push(`Phone: ${normalizedPhone}`);
  }

  return lines.join('\n');
}

function appendContactFooter(text, options = {}) {
  const body = String(text || '').trim();
  const footer = buildContactFooter(options);
  if (!body) return footer;
  if (body.includes(footer)) return body;
  return `${body}\n\n${footer}`;
}

module.exports = {
  appendContactFooter,
  buildContactFooter,
};
