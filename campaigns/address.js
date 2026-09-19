const STREET_SUFFIXES = new Map([
  ['street', 'St'], ['st', 'St'], ['road', 'Rd'], ['rd', 'Rd'],
  ['avenue', 'Ave'], ['ave', 'Ave'], ['boulevard', 'Blvd'], ['blvd', 'Blvd'],
  ['drive', 'Dr'], ['dr', 'Dr'], ['lane', 'Ln'], ['ln', 'Ln'],
  ['court', 'Ct'], ['ct', 'Ct'], ['highway', 'Hwy'], ['hwy', 'Hwy'],
  ['parkway', 'Pkwy'], ['pkwy', 'Pkwy'], ['trail', 'Trl'], ['trl', 'Trl'],
  ['terrace', 'Ter'], ['ter', 'Ter'], ['place', 'Pl'], ['pl', 'Pl'],
  ['circle', 'Cir'], ['cir', 'Cir'], ['way', 'Way']
]);

const PRESERVE_UPPER = new Set(['PO', 'PMB', 'NE', 'NW', 'SE', 'SW', 'N', 'S', 'E', 'W', 'TT']);

function titleWord(word = '') {
  const raw = String(word || '');
  if (!raw) return raw;
  const bare = raw.replace(/[.,]/g, '');
  const upper = bare.toUpperCase();
  if (PRESERVE_UPPER.has(upper)) return raw.replace(bare, upper);
  const suffix = STREET_SUFFIXES.get(bare.toLowerCase());
  if (suffix) return raw.replace(bare, suffix);
  if (/^\d/.test(bare) || /[A-Z].*[A-Z]/.test(bare)) return raw;
  return raw.replace(bare, bare.charAt(0).toUpperCase() + bare.slice(1).toLowerCase());
}

function titleSegment(segment = '') {
  return String(segment || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(titleWord)
    .join(' ');
}

export function formatPostalAddress(value = '') {
  let text = String(value || '')
    .replace(/[\r\n]+/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,+/g, ',')
    .trim();

  if (!text) return '';

  text = text.replace(/\b(\d{5})[ -]?(\d{4})\b/g, '$1-$2');

  // Handle common "street suffix + city, ST ZIP" input where the street/city comma was omitted.
  text = text.replace(
    /\b(St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Hwy|Highway|Pkwy|Parkway|Trl|Trail|Ter|Terrace|Pl|Place|Cir|Circle|Way|TT)\.?\s+([A-Za-z][A-Za-z .'-]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/i,
    (_match, suffix, city, state, zip) => {
      const normalizedSuffix = PRESERVE_UPPER.has(String(suffix).toUpperCase())
        ? String(suffix).toUpperCase()
        : (STREET_SUFFIXES.get(String(suffix).toLowerCase()) || titleWord(suffix));
      return `${normalizedSuffix}, ${titleSegment(city)}, ${String(state).toUpperCase()} ${zip}`;
    }
  );

  const parts = text.split(',').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return '';

  const formatted = parts.map((part, index) => {
    const stateZip = part.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (stateZip) return `${stateZip[1].toUpperCase()} ${stateZip[2]}`;
    if (/^\d{5}(?:-\d{4})?$/.test(part)) return part;
    if (/^P\.?O\.?\s+Box\b/i.test(part)) {
      return part.replace(/^P\.?O\.?\s+Box\b/i, 'PO Box');
    }
    return titleSegment(part);
  });

  return formatted.join(', ');
}

export function normalizePostalAddressInput(input) {
  if (!input) return '';
  const formatted = formatPostalAddress(input.value);
  input.value = formatted;
  return formatted;
}
