import nodemailer from 'nodemailer';

const SITE = Object.freeze({
  id: 'sd-day-traders',
  name: 'SD Day Traders',
  origin: 'https://sd-day-traders.3dvr.tech',
  organizer: 'gamboaesai@gmail.com',
});

function text(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function email(value) {
  const normalized = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function header(req, name) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(req?.headers || {})) {
    if (key.toLowerCase() === target) return Array.isArray(value) ? value[0] : String(value || '');
  }
  return '';
}

function idempotencyKey(req) {
  const value = text(header(req, 'idempotency-key'), 160);
  return /^[A-Za-z0-9._:-]{16,160}$/.test(value) ? value : '';
}

function setCors(req, res) {
  const origin = text(header(req, 'origin'), 300);
  if (origin === SITE.origin) res.setHeader('Access-Control-Allow-Origin', SITE.origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
}

function createTransport(config) {
  const user = email(config.GMAIL_USER);
  const pass = text(config.GMAIL_APP_PASSWORD, 500);
  if (!user || !pass) throw new Error('Booking email transport is not configured.');
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

function requestDetails(body) {
  const name = text(body?.name, 100);
  const customerEmail = email(body?.email);
  const topic = text(body?.topic, 120);
  const date = text(body?.date, 10);
  const time = text(body?.time, 5);
  const timeZone = text(body?.timeZone, 80);
  const summary = text(body?.summary, 600);

  if (!name || !customerEmail || !topic) return { error: 'Name, email, and consultation focus are required.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { error: 'A valid requested date and time are required.' };
  }

  return { name, customerEmail, topic, date, time, timeZone, summary };
}

function organizerText(details) {
  return [
    'New SD Day Traders consultation request',
    '',
    `Name: ${details.name}`,
    `Email: ${details.customerEmail}`,
    `Requested Pacific slot: ${details.date} ${details.time} PT`,
    `Customer timezone: ${details.timeZone || 'not supplied'}`,
    `Focus: ${details.topic}`,
    details.summary ? `Customer display: ${details.summary}` : '',
    '',
    'This is a request, not a confirmed appointment.',
    'Reply to the customer to confirm or propose another time until the Calendar approval backend is enabled.',
  ].filter(Boolean).join('\n');
}

function customerText(details) {
  return [
    `Hi ${details.name},`,
    '',
    'We received your SD Day Traders consultation request.',
    `Requested slot: ${details.date} ${details.time} PT`,
    `Focus: ${details.topic}`,
    '',
    'Esai will review the request before the appointment is confirmed.',
    'You do not need to send another email.',
  ].join('\n');
}

export function createBookingRequestHandler(options = {}) {
  const config = options.config || process.env;
  const suppliedTransport = options.mailTransport;

  return async function bookingRequestHandler(req, res) {
    setCors(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const origin = text(header(req, 'origin'), 300);
    if (origin !== SITE.origin) return res.status(403).json({ error: 'Booking origin is not allowed.' });

    const key = idempotencyKey(req);
    if (!key) return res.status(400).json({ error: 'A valid Idempotency-Key header is required.' });

    if (text(req.body?.website, 200)) {
      return res.status(202).json({ success: true, pending: true });
    }

    const details = requestDetails(req.body || {});
    if (details.error) return res.status(400).json({ error: details.error });

    let transport;
    try {
      transport = suppliedTransport || createTransport(config);
    } catch (error) {
      return res.status(503).json({ error: error.message || 'Booking email is unavailable.' });
    }

    const sender = email(config.GMAIL_USER) || 'no-reply@3dvr.tech';
    const organizerMessage = {
      from: `"SD Day Traders Booking" <${sender}>`,
      to: SITE.organizer,
      replyTo: details.customerEmail,
      subject: `Consultation request — ${details.date} ${details.time} PT — ${details.name}`,
      text: organizerText(details),
      messageId: `<sddt-organizer-${key}@3dvr.tech>`,
    };

    try {
      const organizerReceipt = await transport.sendMail(organizerMessage);
      let customerWarning = null;
      try {
        await transport.sendMail({
          from: `"SD Day Traders" <${sender}>`,
          to: details.customerEmail,
          replyTo: SITE.organizer,
          subject: 'We received your SD Day Traders consultation request',
          text: customerText(details),
          messageId: `<sddt-customer-${key}@3dvr.tech>`,
        });
      } catch (error) {
        customerWarning = 'customer_ack_failed';
        console.error('SDDT customer acknowledgement failed', error);
      }

      return res.status(200).json({
        success: true,
        pending: true,
        requestId: key,
        providerMessageId: organizerReceipt?.messageId || undefined,
        warnings: customerWarning ? [customerWarning] : [],
      });
    } catch (error) {
      console.error('SDDT organizer booking email failed', error);
      return res.status(500).json({ error: 'Unable to deliver the booking request.' });
    }
  };
}

const handler = createBookingRequestHandler();
export default handler;
