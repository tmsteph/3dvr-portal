import { randomUUID } from 'node:crypto';

const SLUG_PATTERN = /^[a-z0-9-]{1,48}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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

export function createCleaningNetworkService(options = {}) {
  const config = options.config || process.env;
  const mailTransport = options.mailTransport;
  const idFactory = options.idFactory;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const limiter = options.rateLimiter || createCleaningRateLimiter();

  async function sendMail(message) {
    if (!mailTransport?.sendMail) throw new Error('Mail transport is unavailable.');
    return mailTransport.sendMail(message);
  }

  function getPartnerProfile(req, res) {
    const profile = getPublicCleaningPartner(config, req.query?.partner);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
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

    const partner = resolvePartner(config, body.partner);
    const destination = destinationFor(config, partner);
    if (!destination) return res.status(503).json({ error: 'Cleaning requests are temporarily unavailable.' });

    const createdAt = now().toISOString();
    const id = requestId('cln', idFactory);
    const record = {
      type: 'cleaning-lead',
      requestId: id,
      partner: partner.partner,
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
        text: formatLeadText(record, partner.name),
        headers: {
          'X-3DVR-Request-Type': 'cleaning-lead',
          'X-3DVR-Request-ID': id,
          'X-3DVR-Request-Source': record.source,
        },
      });
      console.log(`Cleaning lead queued: ${id} partner=${partner.partner} archived=${Boolean(archive)}`);
      return res.status(200).json({ success: true, requestId: id, partner: partner.partner, partnerName: partner.name });
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
      currentWebsite: normalizePublicUrl(body.currentWebsite),
      desiredSlug: normalizeSlug(body.desiredSlug || companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), ''),
      notes: cleanLongText(body.notes, 3000),
      source: cleanLine(body.source || 'cleaning-network:partner-interest', 160),
      createdAt: now().toISOString(),
    };
    try {
      await sendMail({
        from: `"3DVR Cleaning Network" <${config.GMAIL_USER}>`,
        to: destination,
        replyTo: email,
        subject: `[Cleaning Partner ${id}] ${companyName}`,
        text: JSON.stringify(record, null, 2),
        headers: {
          'X-3DVR-Request-Type': 'cleaning-partner-interest',
          'X-3DVR-Request-ID': id,
        },
      });
      console.log(`Cleaning partner request queued: ${id}`);
      return res.status(200).json({ success: true, requestId: id });
    } catch (error) {
      console.error('Cleaning partner request email failed:', error.message);
      return res.status(503).json({ error: 'Partner requests are temporarily unavailable.' });
    }
  }

  return { getPartnerProfile, handleLead, handlePartnerInterest };
}
