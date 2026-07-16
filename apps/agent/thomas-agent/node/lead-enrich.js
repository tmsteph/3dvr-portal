const fs = require('fs');
const path = require('path');
const { applyRouteToVariant, routeFromContact } = require('./lead-route');

const LEADS_FILE = process.env.THREEDVR_LEADS_FILE || path.join(__dirname, '..', 'leads.csv');
const OUTPUT_LABEL = process.env.THREEDVR_ENRICH_OUTPUT_LABEL || LEADS_FILE;
const DEFAULT_LIMIT = Number(process.env.THREEDVR_ENRICH_LIMIT || 25);
const DEFAULT_TIMEOUT_MS = Number(process.env.THREEDVR_ENRICH_TIMEOUT_MS || 9000);
const DEFAULT_MAX_PAGES = Number(process.env.THREEDVR_ENRICH_MAX_PAGES || 4);

const CONTACT_PATH_PATTERN = /(contact|about|connect|booking|book|appointments?|consult|estimate|quote|start|hire|support)/i;
const CONTACT_PAGE_HINTS = [
  '/contact',
  '/contact-us',
  '/about',
  '/booking',
  '/estimate',
  '/quote',
  '/consultation',
];
const SKIP_EMAIL_PATTERN = /(sentry\.io|wixpress\.com|squarespace\.com|schema\.org|wordpress\.org|your@email|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|webmaster|administrator)/i;
const SKIP_CONTACT_URL_PATTERN = /(?:\/wp-content\/|\/wp-json\/|\/feed\/|\/cdn-cgi\/|contact-form-7\/includes\/css\/|[./](?:css|js|json|xml|txt|pdf|jpe?g|png|gif|svg|webp|ico|woff2?|ttf|eot)(?:[?#]|$))/i;

function usage() {
  console.log(`Usage:
  ask-enrich [--name "Business Name"] [--limit 25] [--refresh] [--prefer-form] [--dry-run]

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
    preferForm: false,
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
    } else if (arg === '--prefer-form') {
      options.preferForm = true;
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

function normalizeText(value) {
  return String(value || '').trim();
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

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#64;|&commat;/gi, '@')
    .replace(/&#46;|&period;/gi, '.');
}

function decodeObfuscatedText(value) {
  let text = decodeHtmlEntities(value);

  try {
    text = decodeURIComponent(text);
  } catch {
    // Leave the original text intact when it is not valid percent-encoded input.
  }

  return text
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
    .replace(/\s*\[\s*at\s*\]\s*/gi, '@')
    .replace(/\s*\(\s*at\s*\)\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
    .replace(/\s*\(\s*dot\s*\)\s*/gi, '.')
    .replace(/\s+dot\s+/gi, '.');
}

function sameHost(url, base) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') === new URL(base).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
}

function isLikelyContactPageUrl(url) {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) return false;
  return !SKIP_CONTACT_URL_PATTERN.test(value);
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

function isPlaceholderEmail(email) {
  const lower = normalizeEmailCandidate(email);
  if (!lower || SKIP_EMAIL_PATTERN.test(lower)) return true;
  const [local = '', domain = ''] = lower.split('@');
  if (!local || !domain) return true;
  if (/^(example|sample|test|placeholder|yourname|youremail|info|hello|contact|support|sales|team|admin|office|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|webmaster|administrator)$/i.test(local)) return true;
  if (/^(sentry\.io|wixpress\.com|squarespace\.com|schema\.org|wordpress\.org)$/i.test(domain)) return true;
  if (/^(assets?|cdn|static|analytics?|tracking|pixels?)$/i.test(local)) return true;
  return false;
}

function emailDomainMatches(emailDomain, siteHost) {
  const left = normalizeText(emailDomain).toLowerCase().replace(/^www\./, '');
  const right = normalizeText(siteHost).toLowerCase().replace(/^www\./, '');
  if (!left || !right) return false;
  if (left === right) return true;
  return right.endsWith(`.${left}`) || left.endsWith(`.${right}`);
}

function emailScore(email, baseUrl = '') {
  const lower = normalizeEmailCandidate(email);
  if (isPlaceholderEmail(lower)) return Number.NEGATIVE_INFINITY;

  let score = 0;
  const host = siteHost(baseUrl);
  const domain = lower.split('@')[1] || '';
  const local = lower.split('@')[0] || '';

  score += 10;
  if (host && emailDomainMatches(domain, host)) score += 100;
  if (/^mailto:/.test(lower)) score += 20;
  if (/^(info|hello|contact|support|sales|team|office|bookings?|appointments?|events?)$/.test(local)) score += 5;
  if (/^(owner|director|founder|ceo|hello)$/i.test(local)) score += 3;

  return score;
}

function siteHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeEmailCandidate(email) {
  return normalizeText(email)
    .toLowerCase()
    .replace(/^mailto:/i, '')
    .split('?')[0]
    .replace(/^['"]|['"]$/g, '');
}

function rankEmails(emails, baseUrl = '') {
  const unique = [...new Set(emails.map(normalizeEmailCandidate).filter(Boolean))];
  return unique
    .filter((email) => !isPlaceholderEmail(email))
    .sort((left, right) => {
      const scoreDiff = emailScore(right, baseUrl) - emailScore(left, baseUrl);
      if (scoreDiff !== 0) return scoreDiff;
      return left.localeCompare(right);
    });
}

function extractEmails(html, baseUrl = '') {
  const decoded = decodeObfuscatedText(stripHtml(html));
  const emails = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return rankEmails(emails, baseUrl);
}

function extractMailto(html) {
  const matches = [...String(html || '').matchAll(/href=["']\s*(mailto:[^"']+)["']/gi)];
  const emails = matches
    .map((match) => normalizeEmailCandidate(decodeObfuscatedText(match[1])))
    .filter((email) => email && !isPlaceholderEmail(email));
  const ranked = rankEmails(emails);
  return ranked[0] ? `mailto:${ranked[0]}` : '';
}

function extractLinks(html, base) {
  const matches = [...String(html || '').matchAll(/href=["']([^"']+)["']/gi)];
  const links = [];
  const seen = new Set();

  for (const match of matches) {
    const url = normalizeUrl(match[1], base);
    if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) continue;
    if (!sameHost(url, base)) continue;
    if (!isLikelyContactPageUrl(url)) continue;
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

async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
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
    .map((url) => ({ url, score: isLikelyContactPageUrl(url) && CONTACT_PATH_PATTERN.test(url) ? scoreContactLink(url) : 0 }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.url || '';
}

function collectCandidatePages(html, baseUrl, maxPages = DEFAULT_MAX_PAGES) {
  const limit = Number.isFinite(Number(maxPages)) ? Math.max(1, Math.trunc(Number(maxPages))) : DEFAULT_MAX_PAGES;
  const candidateUrls = [];
  const seen = new Set();

  function add(url) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidateUrls.push(url);
  }

  add(baseUrl);

  const linkedPages = extractLinks(html, baseUrl)
    .filter((url) => CONTACT_PATH_PATTERN.test(url))
    .sort((left, right) => scoreContactLink(right) - scoreContactLink(left));

  for (const url of linkedPages) add(url);

  for (const pathName of CONTACT_PAGE_HINTS) {
    const hintUrl = new URL(pathName, baseUrl).toString();
    if (isLikelyContactPageUrl(hintUrl)) add(hintUrl);
  }

  return candidateUrls.slice(0, limit);
}

function bestPageRoute(page) {
  if (page.mailto) {
    return {
      contact: page.mailto,
      source: 'email',
      detail: page.url,
      score: 1000 + emailScore(page.mailto, page.url),
    };
  }

  if (page.emails.length) {
    const contact = `mailto:${page.emails[0]}`;
    return {
      contact,
      source: 'email',
      detail: page.url,
      score: 1000 + emailScore(contact, page.url),
    };
  }

  if (page.form) {
    return { contact: page.url, source: 'form', detail: page.form, score: 500 };
  }

  if (page.url) {
    return { contact: page.url, source: 'contact-page', detail: page.url, score: 100 };
  }

  return { contact: '', source: 'site', detail: '', score: 0 };
}

function routePriority(route) {
  switch (routeFromSource(route)) {
    case 'email':
      return 3;
    case 'form':
      return 2;
    case 'contact-page':
      return 1;
    default:
      return 0;
  }
}

function routeScore(route, contact = '', baseUrl = '') {
  switch (routeFromSource(route)) {
    case 'email':
      return 1000 + emailScore(contact, baseUrl);
    case 'form':
      return 500;
    case 'contact-page':
      return 100;
    default:
      return 0;
  }
}

function routeFromSource(source) {
  if (source === 'contact-page-unverified') return 'contact-page';
  if (source === 'skip-no-url') return 'site';
  return source || 'site';
}

function normalizeRouteFromSource(source) {
  if (source === 'contact-page-unverified') return 'contact-page';
  if (source === 'skip-no-url') return 'site';
  return source || 'site';
}

async function enrichLead(row, options = {}) {
  const baseUrl = normalizeUrl(row.link || row.contact);
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    return { contact: row.contact, source: 'skip-no-url', detail: '' };
  }

  const maxPages = Number.isFinite(Number(options.maxPages)) ? Math.max(1, Math.trunc(Number(options.maxPages))) : DEFAULT_MAX_PAGES;
  const fetchImpl = options.fetchImpl || fetch;
  const home = await fetchWithTimeout(baseUrl, options.timeoutMs || DEFAULT_TIMEOUT_MS, fetchImpl);
  const candidateUrls = collectCandidatePages(home.html, home.url, maxPages);
  let bestResult = { contact: row.contact || baseUrl, source: 'site', detail: home.url, score: 0 };

  for (const url of candidateUrls) {
    try {
      const page = url === home.url ? home : await fetchWithTimeout(url, options.timeoutMs || DEFAULT_TIMEOUT_MS, fetchImpl);
      const candidate = {
        url: page.url,
        mailto: extractMailto(page.html),
        emails: extractEmails(page.html, home.url),
        form: extractForms(page.html, page.url),
      };
      const result = bestPageRoute(candidate);
      if (result.score > bestResult.score) {
        bestResult = result;
      }
    } catch (error) {
      const result = { contact: url, source: 'contact-page-unverified', detail: error.message, score: 0 };
      if (result.score > bestResult.score) {
        bestResult = result;
      }
    }
  }

  if (bestResult.source !== 'site') {
    return bestResult;
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

function currentRouteStrength(row) {
  const route = routeFromContact({
    contact: row.contact || '',
    link: row.link || '',
    variant: row.variant || '',
  });
  return routeScore(route, row.contact || '', row.link || row.contact || '');
}

function decideEnrichmentUpdate(row, result, options = {}) {
  const route = classifyRoute(result, row);
  const sourceRoute = normalizeRouteFromSource(result.source);
  const nextRoute = sourceRoute === 'site' && route ? route : (sourceRoute || route);
  const currentStrength = currentRouteStrength(row);
  const nextStrength = routeScore(nextRoute, result.contact || '', row.link || result.contact || '');
  const allowDowngrade = Boolean(options.refresh && options.preferForm);
  const shouldReplaceContact = Boolean(result.contact) && (
    nextStrength > currentStrength ||
    allowDowngrade ||
    !row.contact
  );
  const currentRoute = routeFromContact({
    contact: row.contact || '',
    link: row.link || '',
    variant: row.variant || '',
  });
  const nextVariant = applyRouteToVariant(row.variant, shouldReplaceContact ? nextRoute : currentRoute);

  return {
    route,
    sourceRoute,
    nextRoute,
    currentRoute,
    currentStrength,
    nextStrength,
    shouldReplaceContact,
    nextVariant,
  };
}

function shouldEnrich(row, options) {
  if (options.name && row.name !== options.name) return false;
  if (!row.link && !row.contact) return false;
  if (options.refresh) return true;
  return !row.contact
    || /^https?:\/\/[^/]+\/?$/i.test(row.contact)
    || (row.contact.startsWith('http') && !isLikelyContactPageUrl(row.contact));
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
      const result = await enrichLead(row, { maxPages: options.maxPages });
      const { shouldReplaceContact, nextVariant } = decideEnrichmentUpdate(row, result, options);
      const contactChanged = shouldReplaceContact && result.contact !== row.contact;
      const variantChanged = nextVariant !== row.variant;

      if (contactChanged || variantChanged) {
        console.log(`${row.name}: ${row.contact || '-'} -> ${shouldReplaceContact ? result.contact : row.contact} (${result.source})`);
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

module.exports = {
  CONTACT_PAGE_HINTS,
  DEFAULT_MAX_PAGES,
  decodeHtmlEntities,
  decodeObfuscatedText,
  emailDomainMatches,
  emailScore,
  extractEmails,
  extractForms,
  extractLinks,
  extractMailto,
  isPlaceholderEmail,
  normalizeEmailCandidate,
  normalizeRouteFromSource,
  normalizeText,
  enrichLead,
  collectCandidatePages,
  currentRouteStrength,
  decideEnrichmentUpdate,
  classifyRoute,
  shouldEnrich,
  routePriority,
  bestPageRoute,
  rankEmails,
  readRows,
  writeRows,
  parseArgs,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
