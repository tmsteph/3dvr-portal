import nodemailer from 'nodemailer';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function normalizeAlias(value) {
  const raw = normalizeText(value);
  if (!raw) return '';

  if (raw.includes('@')) {
    const [localPart, domainPart = ''] = raw.split('@');
    const local = localPart.replace(/\s+/g, '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!local) return '';

    const domain = domainPart.replace(/\s+/g, '');
    const domainLower = domain.toLowerCase();
    if (!domain || domainLower === '3dvr' || domainLower === '3dvr.tech') {
      return `${local}@3dvr`;
    }
    return '';
  }

  const local = raw.replace(/\s+/g, '').replace(/[^a-zA-Z0-9._-]/g, '');
  return local ? `${local}@3dvr` : '';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMessage(value = '') {
  const escaped = escapeHtml(normalizeText(value));
  return escaped.replace(/\n/g, '<br>');
}

function normalizeRecipientList(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const emails = list
    .map(entry => normalizeEmail(entry))
    .filter(Boolean);

  return Array.from(new Set(emails));
}

function normalizeAliasList(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const aliases = list
    .map(entry => normalizeAlias(entry))
    .filter(Boolean);

  return Array.from(new Set(aliases));
}

function parseEmailList(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const emails = list
    .map(entry => normalizeEmail(entry))
    .filter(Boolean);

  return Array.from(new Set(emails));
}

function resolveTeamRecipients(config = process.env) {
  const configured = parseEmailList(config.ACCOUNT_RECOVERY_TEAM_EMAILS);
  if (configured.length) return configured;

  const fallback = normalizeEmail(config.GMAIL_USER);
  return fallback ? [fallback] : [];
}

function resolvePortalOrigin(config = process.env) {
  const origin = normalizeText(config.PORTAL_PUBLIC_ORIGIN);
  if (!origin) return 'https://3dvr-portal.vercel.app';
  return origin.endsWith('/') ? origin.slice(0, -1) : origin;
}

function createTransport(config = process.env) {
  if (!config.GMAIL_USER || !config.GMAIL_APP_PASSWORD) {
    throw new Error('Email transport is not configured.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.GMAIL_USER,
      pass: config.GMAIL_APP_PASSWORD
    }
  });
}

function buildReminderEmailContent(event = {}) {
  const title = event.title || 'Upcoming event';
  const description = event.description || '';
  const reminderMessage = event.reminderMessage || '';
  const link = event.reminderLink || event.link || '';
  const timeZone = event.timeZone || 'UTC';

  const start = event.start ? new Date(event.start) : null;
  const end = event.end ? new Date(event.end) : null;

  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone
  });

  const startLabel = start && !Number.isNaN(start.getTime()) ? formatter.format(start) : 'Start time not set';
  const endLabel = end && !Number.isNaN(end.getTime()) ? formatter.format(end) : null;

  return {
    subject: `Reminder: ${title}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">${title}</h2>
        <p style="margin: 0 0 12px;">${startLabel}${endLabel ? ` – ${endLabel}` : ''}</p>
        ${description ? `<p style="margin: 0 0 12px;">${escapeHtml(description)}</p>` : ''}
        ${reminderMessage ? `<p style="margin: 0 0 12px;">${formatMessage(reminderMessage)}</p>` : ''}
        ${link ? `<p style="margin: 0 0 12px;"><a href="${link}" target="_blank" rel="noreferrer noopener">Join / view event</a></p>` : ''}
        <p style="margin: 0; color: #555;">This reminder was scheduled in the 3DVR Calendar Hub.</p>
      </div>
    `
  };
}

function buildLookupEmailHtml({ alias, aliases, signInUrl, resetUrl }) {
  const accountItems = aliases.length
    ? aliases.map(item => `<li><code>${escapeHtml(item)}</code></li>`).join('')
    : `<li><code>${escapeHtml(alias)}</code></li>`;

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">Your 3DVR account details</h2>
      <p>We received an account lookup request for this email.</p>
      <p>Known account aliases:</p>
      <ul>${accountItems}</ul>
      <p>Sign in: <a href="${signInUrl}">${signInUrl}</a></p>
      <p>If you forgot your password, request an admin reset: <a href="${resetUrl}">${resetUrl}</a></p>
    </div>
  `;
}

function buildAdminResetIssuedHtml({ alias, username, temporaryPassword, issuedBy, signInUrl }) {
  const issuer = escapeHtml(issuedBy || 'an admin');
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">Temporary 3DVR credentials</h2>
      <p>${issuer} issued a temporary reset for your account.</p>
      <p><strong>Username:</strong> ${escapeHtml(username)}</p>
      <p><strong>Alias:</strong> ${escapeHtml(alias)}</p>
      <p><strong>Temporary password:</strong> ${escapeHtml(temporaryPassword)}</p>
      <p>Sign in now and rotate your password right away: <a href="${signInUrl}">${signInUrl}</a></p>
    </div>
  `;
}

function buildAdminResetRequestHtml({ email, alias, aliases, requestedUsername }) {
  const aliasText = aliases.length
    ? aliases.map(item => escapeHtml(item)).join(', ')
    : alias
      ? escapeHtml(alias)
      : 'none provided';

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">Account recovery request</h2>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Alias candidates:</strong> ${aliasText}</p>
      <p><strong>Preferred new username:</strong> ${escapeHtml(requestedUsername || 'not provided')}</p>
    </div>
  `;
}

function buildAdminResetRequestAckHtml({ resetUrl }) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">Recovery request received</h2>
      <p>We sent your request to the admin team.</p>
      <p>When temporary credentials are ready, you will get another email.</p>
      <p>You can also follow up from the recovery page: <a href="${resetUrl}">${resetUrl}</a></p>
    </div>
  `;
}

export function createCalendarReminderEmailHandler(options = {}) {
  const {
    config = process.env,
    mailTransport
  } = options;

  function getTransport() {
    return mailTransport || createTransport(config);
  }

  return async function calendarReminderEmailHandler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const recipients = normalizeRecipientList(req.body?.recipients);
    const event = req.body?.event || {};

    if (!recipients.length) {
      return res.status(400).json({ error: 'At least one recipient is required.' });
    }

    let transport;
    try {
      transport = getTransport();
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Email transport is not configured.' });
    }

    const content = buildReminderEmailContent(event);

    try {
      await transport.sendMail({
        from: `"3DVR Calendar" <${config.GMAIL_USER}>`,
        to: recipients,
        subject: content.subject,
        html: content.html
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Failed to send reminder email', err);
      return res.status(500).json({ error: err.message || 'Unable to send reminder email.' });
    }
  };
}

export function createAccountRecoveryEmailHandler(options = {}) {
  const {
    config = process.env,
    mailTransport
  } = options;

  function getTransport() {
    return mailTransport || createTransport(config);
  }

  return async function accountRecoveryEmailHandler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      const teamRecipients = resolveTeamRecipients(config);
      return res.status(200).json({
        mailConfigured: Boolean(config.GMAIL_USER && config.GMAIL_APP_PASSWORD),
        teamRecipientsConfigured: teamRecipients.length > 0
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let transport;
    try {
      transport = getTransport();
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Email transport is not configured.' });
    }

    const mode = normalizeText(req.body?.mode || 'lookup').toLowerCase();
    const email = normalizeEmail(req.body?.email);
    const alias = normalizeAlias(req.body?.alias);
    const aliases = normalizeAliasList(req.body?.aliases);
    const requestedUsername = normalizeText(req.body?.requestedUsername);
    const username = normalizeText(req.body?.username);
    const temporaryPassword = normalizeText(req.body?.temporaryPassword);
    const issuedBy = normalizeText(req.body?.issuedBy);

    if (!email) {
      return res.status(400).json({ error: 'A valid recovery email is required.' });
    }

    const portalOrigin = resolvePortalOrigin(config);
    const signInUrl = `${portalOrigin}/sign-in.html`;
    const resetUrl = `${portalOrigin}/password-reset.html`;

    const sender = config.GMAIL_USER || 'no-reply@3dvr.tech';
    const from = `"3DVR Portal Accounts" <${sender}>`;

    try {
      if (mode === 'lookup') {
        if (!alias && !aliases.length) {
          return res.status(400).json({ error: 'Alias details are required for lookup emails.' });
        }

        await transport.sendMail({
          from,
          to: email,
          subject: 'Your 3DVR account sign-in details',
          html: buildLookupEmailHtml({
            alias,
            aliases,
            signInUrl,
            resetUrl
          })
        });

        return res.status(200).json({
          success: true,
          mode,
          alias: alias || aliases[0]
        });
      }

      if (mode === 'admin-reset-request') {
        const teamRecipients = resolveTeamRecipients(config);
        if (!teamRecipients.length) {
          return res.status(500).json({ error: 'Team notification email is not configured.' });
        }

        await transport.sendMail({
          from,
          to: teamRecipients,
          subject: '3DVR account recovery request',
          html: buildAdminResetRequestHtml({
            email,
            alias,
            aliases,
            requestedUsername
          })
        });

        await transport.sendMail({
          from,
          to: email,
          subject: '3DVR recovery request received',
          html: buildAdminResetRequestAckHtml({ resetUrl })
        });

        return res.status(200).json({
          success: true,
          mode
        });
      }

      if (mode === 'admin-reset-issued') {
        if (!alias || !username || temporaryPassword.length < 6) {
          return res.status(400).json({
            error: 'Alias, username, and a temporary password (6+ chars) are required.'
          });
        }

        await transport.sendMail({
          from,
          to: email,
          subject: 'Your temporary 3DVR credentials',
          html: buildAdminResetIssuedHtml({
            alias,
            username,
            temporaryPassword,
            issuedBy,
            signInUrl
          })
        });

        return res.status(200).json({
          success: true,
          mode,
          alias
        });
      }

      return res.status(400).json({
        error: 'Unsupported recovery mode. Use lookup, admin-reset-request, or admin-reset-issued.'
      });
    } catch (error) {
      return res.status(500).json({
        error: error.message || 'Unable to send recovery email.'
      });
    }
  };
}

export function createUnifiedEmailHandler(options = {}) {
  const {
    config = process.env,
    mailTransport
  } = options;

  const calendarHandler = createCalendarReminderEmailHandler({ config, mailTransport });
  const accountRecoveryHandler = createAccountRecoveryEmailHandler({ config, mailTransport });

  return async function unifiedEmailHandler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS' || req.method === 'GET') {
      return accountRecoveryHandler(req, res);
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const mode = normalizeText(req.body?.mode).toLowerCase();
    if (mode === 'lookup' || mode === 'admin-reset-request' || mode === 'admin-reset-issued') {
      return accountRecoveryHandler(req, res);
    }

    return calendarHandler(req, res);
  };
}

const handler = createUnifiedEmailHandler();
export default handler;
