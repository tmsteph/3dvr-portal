export const MAX_ARTWORK_BYTES = 2_500_000;

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

export function addBusinessDays(input, days) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');

  let remaining = Math.max(0, Number.parseInt(days, 10) || 0);
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const weekday = date.getDay();
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

export function decodeArtworkFile(input = {}) {
  const name = String(input.name || '').trim().slice(0, 180);
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

  return { side, name, type, content, size: content.length };
}
