const fs = require('fs');
const os = require('os');
const path = require('path');
const dns = require('node:dns').promises;
const { getOAuthAccessToken } = require('./oauth-connection');
const { createGmailTransport } = require('./gmail-transport');
const { validateCommercialOutreach } = require('./outreach-compliance');

const DEFAULT_TRANSPORT = normalizeText(
  process.env.THREEDVR_OUTREACH_EMAIL_TRANSPORT
  || process.env.THREEDVR_AUTOPILOT_EMAIL_TRANSPORT
  || 'portal'
).toLowerCase();
const DEFAULT_PORTAL_EMAIL_ENDPOINT = normalizeText(
  process.env.THREEDVR_OUTREACH_EMAIL_ENDPOINT
  || process.env.THREEDVR_AUTOPILOT_EMAIL_ENDPOINT
  || 'https://portal.3dvr.tech/api/calendar/reminder-email'
);
const DEFAULT_PORTAL_EMAIL_TOKEN = normalizeText(
  process.env.THREEDVR_OUTREACH_EMAIL_TOKEN
  || process.env.THREEDVR_AUTOPILOT_EMAIL_TOKEN
  || process.env.AGENT_OPERATOR_EMAIL_TOKEN
  || readOptionalFile(process.env.THREEDVR_OUTREACH_EMAIL_TOKEN_FILE)
  || readOptionalFile(process.env.THREEDVR_AUTOPILOT_EMAIL_TOKEN_FILE)
  || readOptionalFile(path.join(os.homedir(), '.3dvr-agent-operator-email-token'))
);
const DEFAULT_GMAIL_USER = normalizeEmail(process.env.GMAIL_USER) || '3dvr.tech@gmail.com';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  const email = normalizeText(value).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function readOptionalFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    return normalizeText(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return '';
  }
}

function usage() {
  console.error('Usage: node send-outreach-email.js --to lead@example.com --subject "Quick idea" --text "Message body"');
}

function parseArgs(argv) {
  const options = {
    to: '',
    subject: '',
    text: '',
    probeOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--to') {
      options.to = argv[++index] || '';
    } else if (arg === '--subject') {
      options.subject = argv[++index] || '';
    } else if (arg === '--text') {
      options.text = argv[++index] || '';
    } else if (arg === '--probe') {
      options.probeOnly = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.to = normalizeEmail(options.to);
  options.subject = normalizeText(options.subject);
  options.text = String(options.text || '').trim();
  return options;
}

function normalizeDomain(value) {
  return normalizeText(value).toLowerCase().replace(/^www\./, '');
}

async function probeRecipientAddress(to, { resolveMxImpl = dns.resolveMx } = {}) {
  const email = normalizeEmail(to);
  if (!email) {
    return { ok: false, reason: 'Recipient email address is invalid.' };
  }

  const domain = normalizeDomain(email.split('@')[1] || '');
  if (!domain) {
    return { ok: false, reason: 'Recipient email domain is missing.' };
  }

  try {
    const records = await resolveMxImpl(domain);
    if (Array.isArray(records) && records.length > 0) {
      return {
        ok: true,
        domain,
        records,
      };
    }
  } catch (error) {
    return {
      ok: false,
      domain,
      reason: error?.code === 'ENOTFOUND'
        ? `No MX records found for ${domain}.`
        : error?.message || `Unable to resolve MX records for ${domain}.`,
    };
  }

  return {
    ok: false,
    domain,
    reason: `No MX records found for ${domain}.`,
  };
}

async function sendViaPortal(options) {
  if (!DEFAULT_PORTAL_EMAIL_ENDPOINT) {
    throw new Error('THREEDVR_OUTREACH_EMAIL_ENDPOINT is not configured.');
  }
  if (!DEFAULT_PORTAL_EMAIL_TOKEN) {
    throw new Error('THREEDVR_OUTREACH_EMAIL_TOKEN is not configured.');
  }

  const senderEmail = DEFAULT_GMAIL_USER;
  const response = await fetch(DEFAULT_PORTAL_EMAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEFAULT_PORTAL_EMAIL_TOKEN}`,
    },
    body: JSON.stringify({
      mode: 'lead-outreach',
      to: [options.to],
      subject: options.subject,
      headline: 'Quick note from 3dvr.tech',
      text: options.text,
      senderName: 'Thomas at 3dvr.tech',
      senderEmail,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Portal outreach email failed: ${response.status}`);
  }
}

async function probeAndReport(options) {
  const probe = await probeRecipientAddress(options.to);
  if (!probe.ok) {
    throw new Error(probe.reason || 'Recipient email probe failed.');
  }

  return probe;
}

async function sendViaGmail(options) {
  const authMode = normalizeText(process.env.THREEDVR_GMAIL_AUTH).toLowerCase();
  const configuredUser = DEFAULT_GMAIL_USER;
  const pass = normalizeText(process.env.GMAIL_APP_PASSWORD);

  if (authMode === 'oauth' || !pass) {
    const connection = await getOAuthAccessToken('google');
    const user = connection.email || configuredUser;
    if (!(user && connection.accessToken)) {
      throw new Error('Google OAuth connection is missing an email or access token.');
    }
    const transport = createGmailTransport(process.env, {
      type: 'OAuth2',
      user,
      accessToken: connection.accessToken,
    });

    await transport.sendMail({
      from: `"Thomas @ 3dvr.tech" <${user}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });
    return;
  }

  const user = configuredUser;
  if (!pass) {
    throw new Error('GMAIL_APP_PASSWORD or a Google OAuth connection is required for Gmail outreach email.');
  }

  const transport = createGmailTransport(process.env, { user, pass });

  await transport.sendMail({
    from: `"Thomas @ 3dvr.tech" <${user}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
  });
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message || error);
    usage();
    process.exit(1);
  }

  if (options.help) {
    usage();
    return;
  }

  if (options.probeOnly && !options.to) {
    usage();
    process.exit(1);
  }

  if (!options.probeOnly && !(options.to && options.subject && options.text)) {
    usage();
    process.exit(1);
  }

  if (!options.probeOnly) {
    const compliance = validateCommercialOutreach(options.text);
    if (!compliance.ok) {
      throw new Error(`Commercial outreach blocked: ${compliance.errors.join(' ')}`);
    }
  }

  const probe = await probeAndReport(options);
  if (options.probeOnly) {
    console.log(`Probe OK for ${options.to} (${probe.domain})`);
    return;
  }

  if (DEFAULT_TRANSPORT === 'gmail') {
    await sendViaGmail(options);
  } else if (DEFAULT_TRANSPORT === 'auto') {
    try {
      await sendViaPortal(options);
    } catch (error) {
      await sendViaGmail(options);
      console.warn(error.message || error);
    }
  } else {
    await sendViaPortal(options);
  }

  console.log(`Sent outreach email to ${options.to}`);
}

module.exports = {
  probeRecipientAddress,
  probeAndReport,
  sendViaGmail,
  sendViaPortal,
  validateCommercialOutreach,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
