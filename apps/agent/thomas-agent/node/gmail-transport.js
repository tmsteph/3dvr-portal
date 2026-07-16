const nodemailer = require('nodemailer');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  const email = normalizeText(value).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function buildGmailTransportOptions(config = process.env, authOverride = null) {
  const user = normalizeEmail(config.GMAIL_USER) || '3dvr.tech@gmail.com';
  const pass = normalizeText(config.GMAIL_APP_PASSWORD);
  const host = normalizeText(config.THREEDVR_GMAIL_SMTP_HOST || 'smtp.gmail.com');
  const port = parseInteger(config.THREEDVR_GMAIL_SMTP_PORT, 587);
  const secure = parseBoolean(config.THREEDVR_GMAIL_SMTP_SECURE, port === 465);
  const requireTLS = parseBoolean(config.THREEDVR_GMAIL_SMTP_REQUIRE_TLS, port === 587);
  const rejectUnauthorized = parseBoolean(config.THREEDVR_GMAIL_SMTP_REJECT_UNAUTHORIZED, true);

  const auth = authOverride || ((user && pass) ? { user, pass } : null);
  if (!auth) {
    throw new Error('Gmail auth is not configured.');
  }

  const options = {
    host,
    port,
    secure,
    auth,
  };

  if (requireTLS) {
    options.requireTLS = true;
  }

  if (port === 587) {
    options.tls = { rejectUnauthorized };
  }

  return options;
}

function createGmailTransport(config = process.env, authOverride = null) {
  return nodemailer.createTransport(buildGmailTransportOptions(config, authOverride));
}

module.exports = {
  buildGmailTransportOptions,
  createGmailTransport,
};
