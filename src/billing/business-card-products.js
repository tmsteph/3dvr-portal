export const MAX_ARTWORK_BYTES = 2_500_000;
export const BUSINESS_TIME_ZONE = 'America/Los_Angeles';

export const BUSINESS_CARD_PRODUCTS = Object.freeze({
  'standard-250': Object.freeze({
    id: 'standard-250',
    name: '250 Business Cards',
    quantity: 250,
    quality: 'Standard 16pt',
    sides: 'Two-sided',
    priceCents: 7800,
    currency: 'usd',
    businessDays: 2,
  }),
});

function dateOnlyInTimeZone(input, timeZone = BUSINESS_TIME_ZONE) {
  const source = new Date(input);
  if (Number.isNaN(source.getTime())) throw new Error('Invalid date');

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(source);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 12));
}

export function addBusinessDays(input, days, timeZone = BUSINESS_TIME_ZONE) {
  const date = dateOnlyInTimeZone(input, timeZone);
  let remaining = Math.max(0, Number.parseInt(days, 10) || 0);

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date;
}

export function publicBusinessCardProducts(now = new Date()) {
  return Object.values(BUSINESS_CARD_PRODUCTS).map(product => ({
    id: product.id,
    name: product.name,
    quantity: product.quantity,
    quality: product.quality,
    sides: product.sides,
    priceCents: product.priceCents,
    currency: product.currency,
    businessDays: product.businessDays,
    estimatedReadyDate: addBusinessDays(now, product.businessDays).toISOString().slice(0, 10),
  }));
}

function hasExpectedSignature(type, content) {
  if (type === 'image/png') {
    return content.length >= 8
      && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (type === 'image/jpeg') {
    return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  }
  if (type === 'application/pdf') {
    return content.length >= 5 && content.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  return false;
}

export function decodeArtworkFile(input = {}) {
  const rawName = String(input.name || '').trim();
  const name = rawName.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, '-').slice(0, 180);
  const type = String(input.type || '').trim().toLowerCase();
  const data = String(input.data || '').trim();
  const side = String(input.side || '').trim().toLowerCase();
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);

  if (!['front', 'back'].includes(side)) throw new Error('Artwork side must be front or back.');
  if (!name) throw new Error(`Add a file name for the ${side} artwork.`);
  if (!allowedTypes.has(type)) throw new Error('Artwork must be a JPG, PNG, or PDF.');
  if (!data || !/^[A-Za-z0-9+/=\s]+$/.test(data)) throw new Error(`The ${side} artwork could not be read.`);

  const content = Buffer.from(data, 'base64');
  if (!content.length) throw new Error(`The ${side} artwork is empty.`);
  if (!hasExpectedSignature(type, content)) {
    throw new Error(`The ${side} file does not match its JPG, PNG, or PDF type.`);
  }

  return { side, name, type, content, size: content.length };
}
