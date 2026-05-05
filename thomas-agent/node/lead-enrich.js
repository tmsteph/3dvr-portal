const fs = require('fs');
const path = require('path');
const { applyRouteToVariant, routeFromContact } = require('./lead-route');

const LEADS_FILE = process.env.THREEDVR_LEADS_FILE || path.join(__dirname, '..', 'leads.csv');
const OUTPUT_LABEL = process.env.THREEDVR_ENRICH_OUTPUT_LABEL || LEADS_FILE;
const DEFAULT_LIMIT = Number(process.env.THREEDVR_ENRICH_LIMIT || 25);
const DEFAULT_TIMEOUT_MS = Number(process.env.THREEDVR_ENRICH_TIMEOUT_MS || 9000);

const CONTACT_PATH_PATTERN = /(contact|about|connect|booking|book|appointments?|consult|estimate|quote|start|hire|support)/i;
const SKIP_EMAIL_PATTERN = /(example\.com|domain\.com|sentry\.io|wixpress\.com|squarespace\.com|schema\.org|wordpress\.org|your@email)/i;

function usage() {
  console.log(`Usage:
  ask-enrich [--name "Business Name"] [--limit 25] [--refresh] [--dry-run]

Examples:
  ask-enrich
  ask-enrich --limit 10
  ask-enrich --name "Dark Horse Coffee Roasters" --refresh

Environment:
  THREEDVR_LEADS_FILE       leads CSV path
  THREEDVR_ENRICH_LIMIT     default row limit
  THREEDVR_ENRICH_TIMEOUT_MS per-request timeout in milliseconds`);
}

function parseArgs(argv) {
  const options = {
    name: '',
    limit: DEFAULT_LIMIT,
    refresh: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--name') {
      options.name = argv[++index] || '';
    } else if (arg === '--limit') {
      options.limit = Number(argv[++index] || DEFAULT_LIMIT);
    } else if (arg === '--refresh') {
      options.refresh = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      options.name = [arg, ...argv.slice(index + 1)].join(' ');
      break;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(Math.trunc(options.limit), 250)) : DEFAULT_LIMIT;
  return options;
}

function parseCsvLine(line) {
  return line.split(',');
}

function cleanCsvField(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No leads file found at ${filePath}. Run ask-crawl first.`);
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines.shift() || 'name,link,contact,status,date,variant';
  const rows = lines.map((line) => {
    const [name = '', link = '', contact = '', status = '', date = '', variant = ''] = parseCsvLine(line);
    return { name, link, contact, status, date, variant };
  });

  return { header, rows };
}

function writeRows(filePath, rows) {
  const output = ['name,link,contact,status,date,variant'];
  for (const row of rows) {
    output.push([
      row.name,
      row.link,
      row.contact,
      row.status,
      row.date,
      row.variant,
    ].map(cleanCsvField).join(','));
  }
  fs.writeFileSync(filePath, `${output.join('\n')}\n`);
}

function normalizeUrl(value, base) {
  const raw = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw) || /^tel:/i.test(raw)) return '';
  if (/^mailto:/i.test(raw)) return raw;
  try {
    return new URL(raw, base).toString();
  } catch {
    return '';
  }
}

function sameHost(url, base) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') === new URL(base).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
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

function extractEmails(html) {
  const decoded = String(html || '')
    .replace(/&#64;|&commat;|\s+\[at\]\s+|\s+\(at\)\s+/gi, '@')
    .replace(/\s+\[dot\]\s+|\s+\(dot\)\s+/gi, '.');
  const emails = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(emails.map((email) => email.toLowerCase()))]
    .filter((email) => !SKIP_EMAIL_PATTERN.test(email));
}

function extractMailto(html) {
  const matches = [...String(html || '').matchAll(/href=["']\s*(mailto:[^"']+)["']/gi)];
  for (const match of matches) {
    const value = match[1].trim();
    const email = value.replace(/^mailto:/i, '').split('?')[0].toLowerCase();
    if (email && !SKIP_EMAIL_PATTERN.test(email)) return `mailto:${email}`;
  }
  return '';
}

function extractLinks(html, base) {
  const matches = [...String(html || '').matchAll(/href=["']([^"']+)["']/gi)];
  const links = [];
  const seen = new Set();

  for (const match of matches) {
    const url = normalizeUrl(match[1], base);
    if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) continue;
    if (!sameHost(url, base)) continue;
    seen.add(url);
    links.push(url);
  }

  return links;
}

function extractForms(html, pageUrl) {
  const forms = [...String(html || '').matchAll(/<form\b[\s\S]*?<\/form>/gi)];
  for (const form of forms) {
    const block = form[0];
    const actionMatch = block.match(/\baction=["']([^"']*)["']/i);
    const action = normalizeUrl(actionMatch ? actionMatch[1] : pageUrl, pageUrl) || pageUrl;
    const methodMatch = block.match(/\bmethod=["']([^"']*)["']/i);
    const method = methodMatch ? methodMatch[1].toLowerCase() : 'get';
    const text = stripHtml(block).toLowerCase();
    if (method === 'post' || /(name|email|message|phone|contact|submit|send)/i.test(text)) {
      return action;
    }
  }
  return '';
}

async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': '3dvr-agent/1.0 (contact enrichment; 3dvr.tech)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/html|text/i.test(contentType)) throw new Error(`non-HTML ${contentType}`);
    return {
      url: response.url || url,
      html: await response.text(),
    };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function scoreContactLink(url) {
  const lower = url.toLowerCase();
  if (/\/contact\b|contact-us|contact_/i.test(lower)) return 100;
  if (/book|appointment|consult|quote|estimate/i.test(lower)) return 85;
  if (/connect|start|hire/i.test(lower)) return 75;
  if (/about/i.test(lower)) return 45;
  return 0;
}

function chooseContactPage(links) {
  return links
    .map((url) => ({ url, score: CONTACT_PATH_PATTERN.test(url) ? scoreContactLink(url) : 0 }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.url || '';
}

function normalizeRouteFromSource(source) {
  if (source === 'contact-page-unverified') return 'contact-page';
  if (source === 'skip-no-url') return 'site';
  return source || 'site';
}

async function enrichLead(row) {
  const baseUrl = normalizeUrl(row.link || row.contact);
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    return { contact: row.contact, source: 'skip-no-url', detail: '' };
  }

  const pages = [];
  const home = await fetchWithTimeout(baseUrl);
  pages.push(home);

  const mailto = extractMailto(home.html);
  if (mailto) return { contact: mailto, source: 'email', detail: home.url };

  const homeEmails = extractEmails(home.html);
  if (homeEmails.length) return { contact: `mailto:${homeEmails[0]}`, source: 'email', detail: home.url };

  const links = extractLinks(home.html, home.url);
  const contactPage = chooseContactPage(links);
  if (contactPage) {
    try {
      const page = await fetchWithTimeout(contactPage);
      pages.push(page);
      const pageMailto = extractMailto(page.html);
      if (pageMailto) return { contact: pageMailto, source: 'email', detail: page.url };

      const pageEmails = extractEmails(page.html);
      if (pageEmails.length) return { contact: `mailto:${pageEmails[0]}`, source: 'email', detail: page.url };

      const pageForm = extractForms(page.html, page.url);
      if (pageForm) return { contact: page.url, source: 'form', detail: pageForm };

      return { contact: page.url, source: 'contact-page', detail: page.url };
    } catch (error) {
      return { contact: contactPage, source: 'contact-page-unverified', detail: error.message };
    }
  }

  const homeForm = extractForms(home.html, home.url);
  if (homeForm) return { contact: home.url, source: 'form', detail: homeForm };

  return { contact: row.contact || baseUrl, source: 'site', detail: home.url };
}

function classifyRoute(result, row) {
  return routeFromContact({
    contact: result.contact || row.contact || '',
    link: row.link || '',
    variant: row.variant || '',
  });
}

function shouldEnrich(row, options) {
  if (options.name && row.name !== options.name) return false;
  if (!row.link && !row.contact) return false;
  if (options.refresh) return true;
  return !row.contact || /^https?:\/\/[^/]+\/?$/i.test(row.contact);
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

  const { rows } = readRows(LEADS_FILE);
  let checked = 0;
  let changed = 0;

  for (const row of rows) {
    if (!shouldEnrich(row, options)) continue;
    if (checked >= options.limit) break;
    checked += 1;

    try {
      const result = await enrichLead(row);
      const route = classifyRoute(result, row);
      const sourceRoute = normalizeRouteFromSource(result.source);
      const nextRoute = sourceRoute === 'site' && route ? route : (sourceRoute || route);
      const nextVariant = applyRouteToVariant(row.variant, nextRoute);
      const contactChanged = result.contact && result.contact !== row.contact;
      const variantChanged = nextVariant !== row.variant;

      if (contactChanged || variantChanged) {
        console.log(`${row.name}: ${row.contact || '-'} -> ${result.contact} (${result.source})`);
        if (contactChanged) {
          row.contact = result.contact;
        }
        row.variant = nextVariant;
        changed += 1;
      } else {
        console.log(`${row.name}: kept ${row.contact || result.contact || '-'} (${result.source})`);
      }
    } catch (error) {
      console.log(`${row.name}: enrich failed (${error.message})`);
    }
  }

  if (!options.dryRun) {
    writeRows(LEADS_FILE, rows);
  }

  console.log(`Checked: ${checked}`);
  console.log(`Updated: ${changed}`);
  console.log(`Output: ${options.dryRun ? 'dry run only' : OUTPUT_LABEL}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
