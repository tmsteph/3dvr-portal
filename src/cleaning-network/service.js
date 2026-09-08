import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const SLUG_PATTERN = /^[a-z0-9-]{1,48}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SERVICES = Object.freeze([
  'Home cleaning',
  'Move in / move out',
  'Office / commercial',
  'Rental turnover',
]);
const DEFAULT_PROFILE = Object.freeze({
  partner: 'network',
  name: 'Cleaning Network',
  intro: 'Tell us what needs cleaning, where it is, and when you want it done. A local cleaning team can follow up with availability and a quote.',
  serviceArea: '',
  publicPhone: '',
  website: '',
  configured: false,
});

function cleanLine(value, maxLength = 180) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanLongText(value, maxLength = 3000) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanStringList(value, { maxItems = 8, maxLength = 100 } = {}) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanLine(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function parseServicesInput(value) {
  if (Array.isArray(value)) return cleanStringList(value);
  return cleanStringList(String(value || '').split(/[,;\n]+/));
}

function previewSecret(config) {
  return cleanLine(config.CLEANING_PREVIEW_SECRET || config.GMAIL_APP_PASSWORD, 240);
}

function encodePreviewToken(profile, secret) {
  if (!secret) return '';
  const payload = Buffer.from(JSON.stringify(profile)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodePreviewToken(token, secret) {
  if (!secret || !token || String(token).length > 4000) return null;
  const [payload, signature, extra] = String(token).split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const expiresAt = cleanLine(raw.expiresAt, 40);
    const services = parseServicesInput(raw.services);
    return {
      partner: normalizeSlug(raw.partner, 'preview'),
      name: cleanLine(raw.name, 100),
      intro: cleanLine(raw.intro, 420),
      serviceArea: cleanLine(raw.serviceArea, 160),
      publicPhone: '',
      website: normalizePublicUrl(raw.website),
      logoUrl: normalizePublicUrl(raw.logoUrl),
      heroImageUrl: normalizePublicUrl(raw.heroImageUrl),
      services: services.length ? services : DEFAULT_SERVICES,
      accent: normalizeHexColor(raw.accent),
      accentDark: normalizeHexColor(raw.accentDark),
      configured: true,
      preview: true,
      expiresAt,
    };
  } catch {
    return null;
  }
}

function normalizeEmail(value) {
  const email = cleanLine(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeSlug(value, fallback = 'network') {
  const slug = cleanLine(value || fallback, 48).toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : fallback;
}

function parseObject(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizePublicUrl(value, { stripQuery = false } = {}) {
  const raw = cleanLine(value, 500);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (stripQuery) {
      url.search = '';
      url.hash = '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeHexColor(value) {
  const color = cleanLine(value, 7);
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '';
}

function humanizeSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function validIsoDate(value) {
  if (!value) return true;
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requestId(prefix, idFactory) {
  const raw = cleanLine(typeof idFactory === 'function' ? idFactory() : randomUUID(), 80)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  return `${prefix}_${(raw || Date.now().toString(36)).slice(0, 18)}`;
}

function clientIp(req) {
  const forwarded = cleanLine(req?.headers?.['x-forwarded-for'], 180);
  if (forwarded) return forwarded.split(',')[0].trim();
  return cleanLine(req?.headers?.['x-real-ip'] || req?.socket?.remoteAddress || 'unknown', 100);
}

export function createCleaningRateLimiter({ limit = 8, windowMs = 10 * 60 * 1000, nowMs = () => Date.now() } = {}) {
  const buckets = new Map();
  return function check(key) {
    const now = Number(nowMs());
    const floor = now - windowMs;
    const recent = (buckets.get(key) || []).filter(stamp => stamp > floor);
    if (recent.length >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      buckets.set(key, recent);
      return { ok: false, retryAfterSeconds };
    }
    recent.push(now);
    buckets.set(key, recent);
    if (buckets.size > 500) {
      for (const [bucketKey, stamps] of buckets.entries()) {
        if (!stamps.some(stamp => stamp > floor)) buckets.delete(bucketKey);
      }
    }
    return { ok: true, retryAfterSeconds: 0 };
  };
}

function resolvePartner(config, rawPartner) {
  const requested = normalizeSlug(rawPartner);
  const partners = parseObject(config.CLEANING_PARTNERS_JSON);
  const legacyEmails = parseObject(config.CLEANING_PARTNER_EMAILS_JSON);
  const raw = partners[requested] && typeof partners[requested] === 'object' ? partners[requested] : null;
  const legacyEmail = normalizeEmail(legacyEmails[requested]);
  const configured = Boolean(raw || legacyEmail || requested === 'network');
  const resolved = configured ? requested : 'network';
  const profile = raw || (resolved === 'network' ? {} : null) || {};
  const name = cleanLine(profile.name || (resolved === 'network' ? DEFAULT_PROFILE.name : humanizeSlug(resolved)), 100);
  const email = normalizeEmail(profile.email) || legacyEmail;
  const services = cleanStringList(profile.services);
  return {
    requestedPartner: requested,
    partner: resolved,
    configured: Boolean(raw || legacyEmail),
    name,
    intro: cleanLine(profile.intro || DEFAULT_PROFILE.intro, 420),
    serviceArea: cleanLine(profile.serviceArea, 160),
    publicPhone: cleanLine(profile.publicPhone, 80),
    website: normalizePublicUrl(profile.website),
    logoUrl: normalizePublicUrl(profile.logoUrl),
    heroImageUrl: normalizePublicUrl(profile.heroImageUrl),
    services: services.length ? services : DEFAULT_SERVICES,
    accent: normalizeHexColor(profile.accent),
    accentDark: normalizeHexColor(profile.accentDark),
    email,
  };
}

export function getPublicCleaningPartner(config = {}, rawPartner = 'network') {
  const profile = resolvePartner(config, rawPartner);
  return {
    partner: profile.partner,
    name: profile.name,
    intro: profile.intro,
    serviceArea: profile.serviceArea,
    publicPhone: profile.publicPhone,
    website: profile.website,
    logoUrl: profile.logoUrl,
    heroImageUrl: profile.heroImageUrl,
    services: profile.services,
    accent: profile.accent,
    accentDark: profile.accentDark,
    configured: profile.configured,
  };
}

function destinationFor(config, partner) {
  return partner.email
    || normalizeEmail(config.CLEANING_LEAD_EMAIL_TO)
    || normalizeEmail(config.OPERATOR_EMAIL_TO)
    || normalizeEmail(config.GMAIL_USER);
}

function archiveFor(config, destination) {
  const archive = normalizeEmail(config.CLEANING_LEAD_ARCHIVE_EMAIL)
    || normalizeEmail(config.OPERATOR_EMAIL_TO)
    || normalizeEmail(config.GMAIL_USER);
  return archive && archive !== destination ? archive : '';
}

function applyRateLimit(req, res, limiter, lane) {
  const result = limiter(`${lane}:${clientIp(req)}`);
  if (result.ok) return false;
  res.setHeader('Retry-After', String(result.retryAfterSeconds));
  res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  return true;
}

function formatLeadText(record, partnerName) {
  const lines = [
    `Cleaning request ${record.requestId}`,
    `Partner: ${partnerName} (${record.partner})`,
    `Preview partner: ${record.previewPartner || '—'}`,
    `Name: ${record.name}`,
    `Email: ${record.email || '—'}`,
    `Phone: ${record.phone || '—'}`,
    `Address: ${record.address || '—'}`,
    `Postal code: ${record.postalCode}`,
    `Service: ${record.serviceType}`,
    `Property: ${record.propertyType || '—'}`,
    `Bedrooms / bathrooms: ${record.bedrooms || '—'} / ${record.bathrooms || '—'}`,
    `Approx. square feet: ${record.squareFeet || '—'}`,
    `Frequency: ${record.frequency || '—'}`,
    `Preferred date: ${record.preferredDate || '—'}`,
    `Pets: ${record.pets || '—'}`,
    `Notes: ${record.notes || '—'}`,
    `Source: ${record.source}`,
    '',
    'Machine-readable record:',
    JSON.stringify(record, null, 2),
  ];
  return lines.join('\n');
}

function formatLeadConfirmationText(record, partnerName) {
  const firstName = cleanLine(record.name, 120).split(/\s+/)[0] || 'there';
  return [
    `Hi ${firstName},`,
    '',
    `We received your ${record.serviceType} request.`,
    `Reference: ${record.requestId}`,
    `ZIP / postal code: ${record.postalCode}`,
    ...(record.preferredDate ? [`Preferred date: ${record.preferredDate}`] : []),
    '',
    `${partnerName} will follow up with availability and a quote.`,
    'No payment has been taken.',
    '',
    'Reply to this email if you need to change anything.',
  ].join('\n');
}

function createTextbeltSmsSender(config, fetchImpl = globalThis.fetch) {
  return async ({ phone, message }) => {
    const enabled = String(config.CLEANING_SMS_ENABLED ?? 'true').toLowerCase();
    if (['false', '0', 'off'].includes(enabled)) {
      return { attempted: false, sent: false };
    }
    if (typeof fetchImpl !== 'function') return { attempted: false, sent: false };
    const key = cleanLine(config.TEXTBELT_API_KEY || 'textbelt', 240);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetchImpl('https://textbelt.com/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message, key }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      return {
        attempted: true,
        sent: Boolean(response.ok && payload.success),
        quotaRemaining: Number.isFinite(Number(payload.quotaRemaining)) ? Number(payload.quotaRemaining) : undefined,
        error: cleanLine(payload.error, 200),
      };
    } catch (error) {
      return { attempted: true, sent: false, error: cleanLine(error?.message, 200) };
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createCleaningNetworkService(options = {}) {
  const config = options.config || process.env;
  const mailTransport = options.mailTransport;
  const idFactory = options.idFactory;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const limiter = options.rateLimiter || createCleaningRateLimiter();
  const smsSender = typeof options.smsSender === 'function'
    ? options.smsSender
    : createTextbeltSmsSender(config, options.fetchImpl);

  async function sendMail(message) {
    if (!mailTransport?.sendMail) throw new Error('Mail transport is unavailable.');
    return mailTransport.sendMail(message);
  }

  function getPartnerProfile(req, res) {
    const profile = getPublicCleaningPartner(config, req.query?.partner);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, ...profile });
  }

  function getPreviewProfile(req, res) {
    const profile = decodePreviewToken(req.query?.token, previewSecret(config));
    if (!profile) return res.status(400).json({ error: 'This cleaning preview link is invalid.' });
    const expiresAtMs = Date.parse(profile.expiresAt || '');
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now().getTime()) {
      return res.status(410).json({ error: 'This cleaning preview link has expired.' });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ ok: true, ...profile });
  }

  async function handleLead(req, res) {
    const body = req.body || {};
    if (cleanLine(body.companyWebsite, 200)) return res.status(200).json({ success: true });
    if (applyRateLimit(req, res, limiter, 'lead')) return res;

    const name = cleanLine(body.name, 120);
    const email = normalizeEmail(body.email);
    const phone = cleanLine(body.phone, 80);
    const postalCode = cleanLine(body.postalCode, 24);
    const serviceType = cleanLine(body.serviceType, 120);
    const preferredDate = cleanLine(body.preferredDate, 20);
    if (!name || (!email && !phone) || !postalCode || !serviceType) {
      return res.status(400).json({ error: 'Add your name, contact info, postal code, and cleaning service.' });
    }
    if (!validIsoDate(preferredDate)) {
      return res.status(400).json({ error: 'Choose a valid preferred date.' });
    }
    if (!config.GMAIL_USER || !config.GMAIL_APP_PASSWORD) {
      return res.status(503).json({ error: 'Cleaning requests are temporarily unavailable.' });
    }

    const decodedPreview = decodePreviewToken(body.previewToken, previewSecret(config));
    const previewExpiresAtMs = decodedPreview ? Date.parse(decodedPreview.expiresAt || '') : NaN;
    const previewProfile = decodedPreview && Number.isFinite(previewExpiresAtMs) && previewExpiresAtMs > now().getTime()
      ? decodedPreview
      : null;
    // Preview pages are intentionally unapproved: keep their leads in the network/operator inbox.
    const partner = resolvePartner(config, previewProfile ? 'network' : body.partner);
    const destination = destinationFor(config, partner);
    if (!destination) return res.status(503).json({ error: 'Cleaning requests are temporarily unavailable.' });

    const createdAt = now().toISOString();
    const id = requestId('cln', idFactory);
    const record = {
      type: 'cleaning-lead',
      requestId: id,
      partner: partner.partner,
      previewPartner: previewProfile?.partner || '',
      name,
      email,
      phone,
      address: cleanLine(body.address, 240),
      postalCode,
      serviceType,
      propertyType: cleanLine(body.propertyType, 120),
      bedrooms: cleanLine(body.bedrooms, 20),
      bathrooms: cleanLine(body.bathrooms, 20),
      squareFeet: cleanLine(body.squareFeet, 30),
      frequency: cleanLine(body.frequency, 80),
      preferredDate,
      pets: cleanLine(body.pets, 180),
      notes: cleanLongText(body.notes, 3000),
      source: cleanLine(body.source || `cleaning-network:${partner.partner}`, 160),
      pageUrl: normalizePublicUrl(body.pageUrl, { stripQuery: true }),
      referrer: normalizePublicUrl(body.referrer, { stripQuery: true }),
      utmSource: cleanLine(body.utmSource, 100),
      utmMedium: cleanLine(body.utmMedium, 100),
      utmCampaign: cleanLine(body.utmCampaign, 140),
      createdAt,
    };
    const archive = archiveFor(config, destination);
    try {
      await sendMail({
        from: `"3DVR Cleaning Network" <${config.GMAIL_USER}>`,
        to: destination,
        ...(archive ? { bcc: archive } : {}),
        replyTo: email || config.GMAIL_USER,
        subject: `[Cleaning Lead ${id}] ${serviceType} · ${postalCode}`,
        text: formatLeadText(record, previewProfile?.name || partner.name),
        headers: {
          'X-3DVR-Request-Type': 'cleaning-lead',
          'X-3DVR-Request-ID': id,
          'X-3DVR-Request-Source': record.source,
        },
      });
      const partnerName = previewProfile?.name || partner.name;
      const confirmationTasks = [];
      if (email) {
        confirmationTasks.push((async () => {
          try {
            await sendMail({
              from: `"${partnerName}" <${config.GMAIL_USER}>`,
              to: email,
              replyTo: normalizeEmail(config.CLEANING_CUSTOMER_REPLY_TO) || normalizeEmail(config.GMAIL_USER),
              subject: `We received your cleaning request · ${id}`,
              text: formatLeadConfirmationText(record, partnerName),
              headers: {
                'X-3DVR-Request-Type': 'cleaning-lead-confirmation',
                'X-3DVR-Request-ID': id,
              },
            });
            return { channel: 'email', sent: true };
          } catch (error) {
            console.error(`Cleaning confirmation email failed: ${id}`, error.message);
            return { channel: 'email', sent: false };
          }
        })());
      }
      if (phone) {
        confirmationTasks.push((async () => {
          try {
            const sms = await smsSender({
              phone,
              message: `Cleaning request ${id} received: ${cleanLine(serviceType, 42)}. We'll follow up with availability and a quote. No payment taken.`,
              requestId: id,
            });
            if (sms?.attempted && !sms?.sent) {
              console.warn(`Cleaning SMS confirmation not sent: ${id} ${sms.error || 'provider unavailable'}`);
            }
            return { channel: 'sms', sent: Boolean(sms?.sent) };
          } catch (error) {
            console.warn(`Cleaning SMS confirmation failed safely: ${id} ${error?.message || 'provider unavailable'}`);
            return { channel: 'sms', sent: false };
          }
        })());
      }
      const confirmationResults = await Promise.all(confirmationTasks);
      const confirmationEmailSent = confirmationResults.some(result => result.channel === 'email' && result.sent);
      const smsConfirmationSent = confirmationResults.some(result => result.channel === 'sms' && result.sent);
      console.log(`Cleaning lead queued: ${id} partner=${partner.partner} archived=${Boolean(archive)} confirmationEmail=${confirmationEmailSent} sms=${smsConfirmationSent}`);
      return res.status(200).json({
        success: true,
        requestId: id,
        partner: partner.partner,
        partnerName,
        confirmationEmailSent,
        smsConfirmationSent,
      });
    } catch (error) {
      console.error('Cleaning request email failed:', error.message);
      return res.status(503).json({ error: 'Cleaning requests are temporarily unavailable.' });
    }
  }

  async function handlePartnerInterest(req, res) {
    const body = req.body || {};
    if (cleanLine(body.companyWebsite, 200)) return res.status(200).json({ success: true });
    if (applyRateLimit(req, res, limiter, 'partner')) return res;

    const companyName = cleanLine(body.companyName, 140);
    const contactName = cleanLine(body.contactName, 120);
    const email = normalizeEmail(body.email);
    const phone = cleanLine(body.phone, 80);
    const serviceArea = cleanLine(body.serviceArea, 180);
    const budget = cleanLine(body.budget, 40);
    const authority = cleanLine(body.authority, 40);
    const need = cleanLine(body.need, 60);
    const timing = cleanLine(body.timing, 40);
    const qualificationScore = [
      ['1000-2499', '2500-plus'].includes(budget),
      ['owner', 'decision-maker'].includes(authority),
      ['more-leads', 'better-funnel', 'multi-company'].includes(need),
      ['now', '30-days'].includes(timing),
    ].filter(Boolean).length;
    const qualified = qualificationScore === 4;
    if (!companyName || !contactName || !email || !serviceArea) {
      return res.status(400).json({ error: 'Add the company, contact name, email, and service area.' });
    }
    if (!config.GMAIL_USER || !config.GMAIL_APP_PASSWORD) {
      return res.status(503).json({ error: 'Partner requests are temporarily unavailable.' });
    }
    const destination = normalizeEmail(config.CLEANING_PARTNER_INTEREST_EMAIL_TO)
      || normalizeEmail(config.OPERATOR_EMAIL_TO)
      || normalizeEmail(config.GMAIL_USER);
    if (!destination) return res.status(503).json({ error: 'Partner requests are temporarily unavailable.' });

    const id = requestId('clp', idFactory);
    const record = {
      type: 'cleaning-partner-interest',
      requestId: id,
      companyName,
      contactName,
      email,
      phone,
      serviceArea,
      budget,
      authority,
      need,
      timing,
      qualificationScore,
      qualified,
      services: cleanLine(body.services, 500),
      currentWebsite: normalizePublicUrl(body.currentWebsite),
      desiredSlug: normalizeSlug(body.desiredSlug || companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), ''),
      notes: cleanLongText(body.notes, 3000),
      source: cleanLine(body.source || 'cleaning-network:partner-interest', 160),
      pageUrl: normalizePublicUrl(body.pageUrl, { stripQuery: true }),
      referrer: normalizePublicUrl(body.referrer, { stripQuery: true }),
      utmSource: cleanLine(body.utmSource, 100),
      utmMedium: cleanLine(body.utmMedium, 100),
      utmCampaign: cleanLine(body.utmCampaign, 140),
      createdAt: now().toISOString(),
    };
    const expiresAt = new Date(now().getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString();
    const previewPartner = record.desiredSlug || `preview-${id.replace(/[^a-z0-9]/g, '').slice(-12)}`;
    const services = parseServicesInput(record.services);
    const previewToken = encodePreviewToken({
      partner: previewPartner,
      name: companyName,
      intro: `Request a cleaning quote from ${companyName}.`,
      serviceArea,
      website: record.currentWebsite,
      services: services.length ? services : DEFAULT_SERVICES,
      expiresAt,
    }, previewSecret(config));
    const previewUrl = previewToken
      ? `https://portal.3dvr.tech/cleaning-network/?preview=${encodeURIComponent(previewToken)}`
      : '';
    record.previewUrl = previewUrl;
    record.previewExpiresAt = expiresAt;
    try {
      await sendMail({
        from: `"3DVR Cleaning Network" <${config.GMAIL_USER}>`,
        to: destination,
        replyTo: email,
        subject: `[${qualified ? 'QUALIFIED ' : ''}Cleaning Partner ${id}] ${companyName}`,
        text: JSON.stringify(record, null, 2),
        headers: {
          'X-3DVR-Request-Type': 'cleaning-partner-interest',
          'X-3DVR-Request-ID': id,
          'X-3DVR-Qualification': qualified ? 'qualified' : 'unqualified',
        },
      });
      console.log(`Cleaning partner request queued: ${id} qualified=${qualified} score=${qualificationScore}/4`);
      return res.status(200).json({ success: true, requestId: id, previewUrl, previewExpiresAt: expiresAt, qualified, qualificationScore });
    } catch (error) {
      console.error('Cleaning partner request email failed:', error.message);
      return res.status(503).json({ error: 'Partner requests are temporarily unavailable.' });
    }
  }

  return { getPartnerProfile, getPreviewProfile, handleLead, handlePartnerInterest };
}
