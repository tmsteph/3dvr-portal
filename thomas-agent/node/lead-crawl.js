const fs = require('fs');
const path = require('path');
const { applyRouteToVariant, routeFromContact } = require('./lead-route');

const DEFAULT_LOCATION = process.env.THREEDVR_LEAD_LOCATION || 'San Diego, CA';
const DEFAULT_CATEGORY = process.env.THREEDVR_LEAD_CATEGORY || 'service';
const DEFAULT_LIMIT = Number(process.env.THREEDVR_LEAD_LIMIT || 25);
const DEFAULT_RADIUS_KM = Number(process.env.THREEDVR_LEAD_RADIUS_KM || 8);
const DEFAULT_TIMEOUT_MS = Number(process.env.THREEDVR_LEAD_TIMEOUT_MS || 7000);
const DEFAULT_SOURCE = String(process.env.THREEDVR_LEAD_SOURCE || 'overpass').trim().toLowerCase();
const LEADS_FILE = process.env.THREEDVR_LEADS_FILE
  || path.join(__dirname, '..', 'leads.csv');
const OVERPASS_ENDPOINTS = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]);
const CHAIN_NAME_PATTERN = /\b(starbucks|mcdonald'?s|subway|cvs|rite aid|walgreens|walmart|target|costco|dunkin|7-eleven|shell|chevron|arco|jack in the box|taco bell|burger king|wendy'?s)\b/i;
const SEARCH_CATEGORY_TERMS = Object.freeze({
  coffee: Object.freeze(['coffee shop', 'independent cafe']),
  food: Object.freeze(['local restaurant', 'catering company']),
  service: Object.freeze(['auto repair', 'hair salon', 'landscaping service', 'cleaning service']),
  professional: Object.freeze(['law office', 'accounting firm', 'consulting firm', 'real estate agency']),
  health: Object.freeze(['dental office', 'physical therapy clinic', 'wellness practice']),
});
const BLOCKED_SEARCH_HOST_PATTERN = /(^|\.)(?:ca\.gov|sandiego\.gov|sdcounty\.ca\.gov|yelp\.com|yellowpages\.com|bbb\.org|facebook\.com|instagram\.com|linkedin\.com|wikipedia\.org|indeed\.com|mapquest\.com|chamberofcommerce\.com|angi\.com|thumbtack\.com|expertise\.com)$/i;
const BLOCKED_SEARCH_TITLE_PATTERN = /\b(?:official website|city of|county of|directory|top \d+|best \d+|near me|jobs?|reviews?|government|department|agency services)\b/i;

const CATEGORY_PRESETS = Object.freeze({
  coffee: Object.freeze([
    'node["amenity"="cafe"]',
    'way["amenity"="cafe"]',
    'node["shop"="coffee"]',
    'way["shop"="coffee"]',
  ]),
  food: Object.freeze([
    'node["amenity"="restaurant"]',
    'way["amenity"="restaurant"]',
    'node["amenity"="cafe"]',
    'way["amenity"="cafe"]',
  ]),
  service: Object.freeze([
    'node["shop"="hairdresser"]',
    'way["shop"="hairdresser"]',
    'node["shop"="car_repair"]',
    'way["shop"="car_repair"]',
    'node["craft"]',
    'way["craft"]',
    'node["office"="company"]',
    'way["office"="company"]',
  ]),
  professional: Object.freeze([
    'node["office"="lawyer"]',
    'way["office"="lawyer"]',
    'node["office"="accountant"]',
    'way["office"="accountant"]',
    'node["office"="consulting"]',
    'way["office"="consulting"]',
    'node["office"="estate_agent"]',
    'way["office"="estate_agent"]',
  ]),
  health: Object.freeze([
    'node["amenity"="dentist"]',
    'way["amenity"="dentist"]',
    'node["amenity"="clinic"]',
    'way["amenity"="clinic"]',
    'node["healthcare"]',
    'way["healthcare"]',
  ]),
});

function usage() {
  console.log(`Usage:
  ask-crawl [--location "San Diego, CA"] [--category coffee|food|service|professional|health] [--limit 25] [--radius-km 8] [--dry-run] [--include-chains] [--source overpass|search|auto]

Examples:
  ask-crawl --location "San Diego, CA" --category service --limit 30
  ask-crawl --location "La Mesa, CA" --category professional --limit 20
  ask-crawl --category coffee --limit 15 --radius-km 5
  ask-crawl --source search --location "San Diego, CA" --category professional --limit 20

Environment:
  THREEDVR_LEAD_LOCATION  default location
  THREEDVR_LEAD_CATEGORY  default category
  THREEDVR_LEAD_LIMIT     default limit
  THREEDVR_LEAD_RADIUS_KM default radius
  THREEDVR_LEAD_TIMEOUT_MS per-endpoint timeout in milliseconds
  THREEDVR_LEAD_SOURCE    overpass | search | auto
  THREEDVR_LEADS_FILE     output CSV path`);
}

function parseArgs(argv) {
  const options = {
    location: DEFAULT_LOCATION,
    category: DEFAULT_CATEGORY,
    limit: DEFAULT_LIMIT,
    radiusKm: DEFAULT_RADIUS_KM,
    source: DEFAULT_SOURCE,
    dryRun: false,
    includeChains: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--location' || arg === '--near') {
      options.location = argv[++index] || '';
    } else if (arg === '--category' || arg === '--type') {
      options.category = argv[++index] || '';
    } else if (arg === '--limit') {
      options.limit = Number(argv[++index] || DEFAULT_LIMIT);
    } else if (arg === '--radius-km' || arg === '--radius') {
      options.radiusKm = Number(argv[++index] || DEFAULT_RADIUS_KM);
    } else if (arg === '--source') {
      options.source = String(argv[++index] || DEFAULT_SOURCE).trim().toLowerCase();
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--include-chains') {
      options.includeChains = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      options.location = [arg, ...argv.slice(index + 1)].join(' ');
      break;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.category = String(options.category || DEFAULT_CATEGORY).toLowerCase().trim();
  options.limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(Math.trunc(options.limit), 100)) : DEFAULT_LIMIT;
  options.radiusKm = Number.isFinite(options.radiusKm)
    ? Math.max(1, Math.min(Number(options.radiusKm), 40))
    : DEFAULT_RADIUS_KM;
  if (!['overpass', 'search', 'auto'].includes(options.source)) {
    throw new Error(`Unsupported source "${options.source}". Use overpass, search, or auto.`);
  }

  return options;
}

function cleanCsvField(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#64;|&commat;/g, '@')
    .replace(/\s+/g, ' ');
}

function normalizeUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  if (/^[^@\s]+\.[a-z]{2,}(\/.*)?$/i.test(url)) return `https://${url}`;
  return url;
}

function getTag(tags = {}, keys = []) {
  for (const key of keys) {
    if (tags[key]) return tags[key];
  }
  return '';
}

function leadFromElement(element, category) {
  const tags = element.tags || {};
  const name = cleanCsvField(tags.name || tags.brand || tags.operator || '');
  if (!name) return null;

  const website = normalizeUrl(getTag(tags, ['contact:website', 'website', 'url']));
  const email = getTag(tags, ['contact:email', 'email']);
  const phone = getTag(tags, ['contact:phone', 'phone']);
  const contact = email ? `mailto:${email}` : (website || phone);
  const link = website || '';

  if (!link && !contact && !phone) {
    return null;
  }

  const route = routeFromContact({ contact, link });

  return {
    name,
    link: cleanCsvField(link),
    contact: cleanCsvField(contact),
    status: 'new',
    date: new Date().toISOString().slice(0, 10),
    variant: applyRouteToVariant(`osm-${category}`, route),
  };
}

async function geocodeLocation(location) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', location);

  const response = await fetch(url, {
    headers: {
      'User-Agent': '3dvr-agent/1.0 (lead research; 3dvr.tech)',
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status}`);
  }

  const results = await response.json();
  if (!Array.isArray(results) || !results.length || !results[0].boundingbox) {
    throw new Error(`No geocoding result for ${location}`);
  }

  const lat = Number(results[0].lat);
  const lon = Number(results[0].lon);
  const [south, north, west, east] = results[0].boundingbox.map(Number);
  return {
    label: results[0].display_name || location,
    lat,
    lon,
    bbox: { south, west, north, east },
  };
}

function bboxFromRadius(lat, lon, radiusKm) {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));

  return {
    south: lat - latDelta,
    west: lon - lonDelta,
    north: lat + latDelta,
    east: lon + lonDelta,
  };
}

function buildOverpassQuery(category, bbox, limit) {
  const preset = CATEGORY_PRESETS[category];
  if (!preset) {
    throw new Error(`Unsupported category "${category}". Use: ${Object.keys(CATEGORY_PRESETS).join(', ')}`);
  }

  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const selectors = preset.map((selector) => `${selector}(${box});`).join('\n');

  return `[out:json][timeout:12];
(
${selectors}
);
out tags center ${Math.max(limit * 4, 50)};`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOverpass(query) {
  const errors = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': '3dvr-agent/1.0 (lead research; 3dvr.tech)',
        },
        body: new URLSearchParams({ data: query }),
      });

      if (!response.ok) {
        errors.push(`${endpoint} -> ${response.status}`);
        continue;
      }

      const payload = await response.json();
      return Array.isArray(payload.elements) ? payload.elements : [];
    } catch (error) {
      errors.push(`${endpoint} -> ${error.message}`);
    }
  }

  throw new Error(`Overpass failed on all endpoints: ${errors.join('; ')}
Try again in a minute, or narrow the search:
  ask-crawl --location "La Mesa, CA" --category professional --limit 10 --radius-km 5`);
}

function buildSearchQueries(location, category) {
  const base = String(location || '').trim();
  const terms = SEARCH_CATEGORY_TERMS[category] || [category];
  const queries = terms.map((term) => `"${term}" "${base}" -directory -jobs -reviews`);
  return [...new Set(queries.filter(Boolean))];
}

function resolveSearchResultUrl(href) {
  const raw = String(href || '').trim();
  if (!raw) return '';
  const absolute = raw.startsWith('//') ? `https:${raw}` : raw;
  try {
    const parsed = new URL(absolute);
    if (/(^|\.)duckduckgo\.com$/i.test(parsed.hostname)) {
      const target = parsed.searchParams.get('uddg');
      return target ? normalizeUrl(decodeURIComponent(target)) : '';
    }
    return normalizeUrl(parsed.toString());
  } catch {
    return '';
  }
}

function isLikelyBusinessSearchResult(title, url) {
  const name = cleanCsvField(title);
  if (!name || BLOCKED_SEARCH_TITLE_PATTERN.test(name)) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host.endsWith('.gov') || host.endsWith('.edu')) return false;
    if (BLOCKED_SEARCH_HOST_PATTERN.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function parseDuckDuckGoResults(html) {
  const results = [];
  const seen = new Set();
  const matches = [...String(html || '').matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

  for (const match of matches) {
    const href = match[1] || '';
    const title = cleanCsvField(stripHtml(match[2] || ''));
    const url = resolveSearchResultUrl(href);
    if (!url || !isLikelyBusinessSearchResult(title, url)) continue;
    const key = `${title.toLowerCase()}|${url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ name: title, link: normalizeUrl(url), contact: normalizeUrl(url), status: 'new', date: new Date().toISOString().slice(0, 10), variant: 'search-seed' });
  }

  return results;
}

async function fetchSearchSeeds(location, category, limit) {
  const queries = buildSearchQueries(location, category);
  const seeds = [];
  const seen = new Set();

  for (const query of queries) {
    const url = new URL('https://html.duckduckgo.com/html/');
    url.searchParams.set('q', query);
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'User-Agent': '3dvr-agent/1.0 (lead research; 3dvr.tech)',
        Accept: 'text/html,application/xhtml+xml',
      },
    }, DEFAULT_TIMEOUT_MS);
    if (!response.ok) continue;
    const html = await response.text();
    for (const lead of parseDuckDuckGoResults(html)) {
      const key = `${lead.name.toLowerCase().trim()}|${lead.link.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push(lead);
      if (seeds.length >= limit) return seeds;
    }
  }

  return seeds;
}

function readExistingKeys(filePath) {
  if (!fs.existsSync(filePath)) {
    return new Set();
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).slice(1);
  const keys = new Set();

  for (const line of lines) {
    if (!line.trim()) continue;
    const [name = '', link = ''] = line.split(',');
    keys.add(`${name.toLowerCase().trim()}|${link.toLowerCase().trim()}`);
    keys.add(name.toLowerCase().trim());
  }

  return keys;
}

function ensureLeadsFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, 'name,link,contact,status,date,variant\n');
  }
}

function appendLeads(filePath, leads) {
  ensureLeadsFile(filePath);
  const rows = leads.map((lead) => [
    lead.name,
    lead.link,
    lead.contact,
    lead.status,
    lead.date,
    lead.variant,
  ].map(cleanCsvField).join(','));

  if (rows.length) {
    fs.appendFileSync(filePath, `${rows.join('\n')}\n`);
  }
}

function dedupeLeads(leads, existingKeys, limit, { includeChains = false } = {}) {
  const seen = new Set();
  const output = [];

  for (const lead of leads) {
    if (!includeChains && CHAIN_NAME_PATTERN.test(lead.name)) {
      continue;
    }
    const nameKey = lead.name.toLowerCase().trim();
    const compositeKey = `${nameKey}|${lead.link.toLowerCase().trim()}`;
    if (seen.has(compositeKey) || seen.has(nameKey) || existingKeys.has(compositeKey) || existingKeys.has(nameKey)) {
      continue;
    }
    seen.add(compositeKey);
    seen.add(nameKey);
    output.push(lead);
    if (output.length >= limit) break;
  }

  return output;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
  }

  if (options.help) {
    usage();
    return;
  }

  console.log(`Crawling ${options.category} leads near ${options.location}...`);
  const place = await geocodeLocation(options.location);
  const bbox = bboxFromRadius(place.lat, place.lon, options.radiusKm);
  const query = buildOverpassQuery(options.category, bbox, options.limit);
  let leads = [];
  let sourceUsed = 'overpass';
  try {
    if (options.source === 'search') {
      sourceUsed = 'search';
      leads = await fetchSearchSeeds(options.location, options.category, options.limit);
    } else {
      const elements = await fetchOverpass(query);
      leads = elements.map((element) => leadFromElement(element, options.category)).filter(Boolean);
    }
  } catch (error) {
    if (options.source === 'auto') {
      sourceUsed = 'search';
      leads = await fetchSearchSeeds(options.location, options.category, options.limit);
    } else {
      throw error;
    }
  }
  const existingKeys = readExistingKeys(LEADS_FILE);
  const uniqueLeads = dedupeLeads(leads, existingKeys, options.limit, {
    includeChains: options.includeChains,
  });

  if (!options.dryRun) {
    appendLeads(LEADS_FILE, uniqueLeads);
  }

  console.log(`Location: ${place.label}`);
  console.log(`Radius: ${options.radiusKm}km`);
  console.log(`Source: ${sourceUsed}`);
  console.log(`Found usable leads: ${uniqueLeads.length}`);
  console.log(`Output: ${options.dryRun ? 'dry run only' : LEADS_FILE}`);
  for (const lead of uniqueLeads) {
    console.log(`- ${lead.name} -> ${lead.contact || lead.link}`);
  }

  if (!uniqueLeads.length) {
    console.log('Try a broader category, a nearby city, or ask-crawl --source search --location "San Diego, CA" --category professional');
  }
}

module.exports = {
  buildSearchQueries,
  isLikelyBusinessSearchResult,
  parseDuckDuckGoResults,
  resolveSearchResultUrl,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
