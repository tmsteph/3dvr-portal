import nodemailer from 'nodemailer';

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMessage(value = '') {
  const escaped = escapeHtml(value.trim());
  return escaped.replace(/\n/g, '<br>');
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeRecipientList(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const emails = list
    .map(entry => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter(Boolean)
    .filter(entry => /.+@.+\..+/.test(entry));
  return Array.from(new Set(emails));
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

function buildEmailContent(event = {}) {
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

export default async function handler(req, res) {
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
    transport = createTransport(process.env);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Email transport is not configured.' });
  }

  const content = buildEmailContent(event);

  try {
    await transport.sendMail({
      from: `"3DVR Calendar" <${process.env.GMAIL_USER}>`,
      to: recipients,
      subject: content.subject,
      html: content.html
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Failed to send reminder email', err);
    return res.status(500).json({ error: err.message || 'Unable to send reminder email.' });
  }
}
