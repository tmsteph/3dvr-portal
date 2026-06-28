import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { runMarketPulseCycle } from '../growth/market-pulse.js';
import { buildMetaMarketExperimentPlan } from '../growth/meta-graph.js';
import {
  createMetaMarketGunClient,
  runMetaMarketWorkerOnce
} from '../growth/meta-market-worker.js';
import { runAutopilotCycle } from '../money/autopilot.js';
import {
  appendMoneyPrinterEvent,
  ensureMoneyPrinterWorkspace,
  getMoneyPrinterWorkspacePaths,
  writeJsonFile
} from './moneyPrinterFileStorage.js';
import { loadMoneyPrinterEnv } from './moneyPrinterEnv.js';
import { runMoneyPrinterSupervisor } from '../../scripts/money-printer-supervisor.mjs';

const DEFAULT_MARKETS = [
  'owner-led service businesses that need clearer lead follow-up',
  'local home service businesses with quote follow-up leaks',
  'freelancers and small agencies trying to turn inquiries into paid projects'
];

const DEFAULT_KEYWORDS = [
  'lead follow up',
  'quote follow-up',
  'client onboarding',
  'small business automation',
  'website launch help',
  'crm setup'
];

const DEFAULT_CHANNELS = ['reddit', 'hackernews', 'linkedin', 'email'];
const DEFAULT_CONTACTS_PATH = '~/.config/3dvr/outreach-contacts.csv';
const DEFAULT_SUPPRESSION_PATH = '~/.config/3dvr/outreach-suppression.csv';
const WARM_CONTACT_SOURCES = ['warm', 'manual', 'customer', 'subscriber', 'inbound', 'referral'];
const COMPLIANT_B2B_SOURCES = ['public-business', 'business-directory', 'manual-research', 'event', 'conference', 'linkedin'];
const COMPLIANT_B2B_BASES = ['can-spam-b2b', 'us-b2b-commercial', 'public-business-contact', 'direct-business-interest'];
const BUSINESS_RECIPIENT_TYPES = ['business', 'corporate', 'company', 'role', 'work'];

function nowIso() {
  return new Date().toISOString();
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const cleaned = String(value ?? '').replace(/[^\d.]/g, '').trim();
  if (!cleaned) return fallback;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitList(value, fallback = []) {
  const items = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  const fallbackItems = Array.isArray(fallback) ? fallback : [];
  return items.length ? items : [...fallbackItems];
}

function expandHome(filePath, env = process.env) {
  const normalized = String(filePath || '').trim();
  if (!normalized) return '';
  if (normalized === '~') return env.HOME || '';
  if (normalized.startsWith('~/')) {
    return path.join(env.HOME || '', normalized.slice(2));
  }
  return normalized;
}

function resolveOwnerEmail(env = process.env) {
  return String(
    env.AUTO_BUSINESS_OWNER_EMAIL
    || env.MONEY_PRINTER_OWNER_EMAIL
    || env.STRIPE_LOG_EMAIL
    || env.GMAIL_USER
    || ''
  ).trim();
}

function resolveLegalName(env = process.env) {
  return String(
    env.AUTO_BUSINESS_LEGAL_NAME
    || env.COMPANY_LEGAL_NAME
    || env.BUSINESS_NAME
    || '3DVR'
  ).trim();
}

function resolvePhysicalAddress(env = process.env) {
  return String(env.AUTO_BUSINESS_PHYSICAL_ADDRESS || env.BUSINESS_PHYSICAL_ADDRESS || '').trim();
}

function resolveUnsubscribeEmail(env = process.env) {
  return String(
    env.AUTO_BUSINESS_UNSUBSCRIBE_EMAIL
    || env.UNSUBSCRIBE_EMAIL
    || env.AUTO_BUSINESS_OWNER_EMAIL
    || env.GMAIL_USER
    || ''
  ).trim();
}

function resolveUnsubscribeUrl(env = process.env) {
  return String(env.AUTO_BUSINESS_UNSUBSCRIBE_URL || env.UNSUBSCRIBE_URL || '').trim();
}

function resolveFacebookLink(env = process.env) {
  return String(
    env.AUTO_BUSINESS_FACEBOOK_LINK
    || env.AUTO_BUSINESS_MARKET_LINK
    || env.MONEY_AUTOPILOT_CHECKOUT_URL
    || env.STRIPE_CHECKOUT_URL
    || 'https://portal.3dvr.tech/forge/'
  ).trim();
}

function createMailTransport(env = process.env) {
  const gmailUser = String(env.GMAIL_USER || '').trim();
  const gmailPass = String(env.GMAIL_APP_PASSWORD || '').trim();
  if (gmailUser && gmailPass) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass
      }
    });
  }

  const smtpHost = String(env.SMTP_HOST || '').trim();
  const smtpUser = String(env.SMTP_USER || '').trim();
  const smtpPass = String(env.SMTP_PASSWORD || env.SMTP_PASS || '').trim();
  if (!smtpHost || !smtpUser || !smtpPass) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(env.SMTP_PORT || 587),
    secure: parseBoolean(env.SMTP_SECURE, false),
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
}

function hasMailConfig(env = process.env) {
  const gmailUser = String(env.GMAIL_USER || '').trim();
  const gmailPass = String(env.GMAIL_APP_PASSWORD || '').trim();
  if (gmailUser && gmailPass && resolveMailFrom(env)) return true;

  const smtpHost = String(env.SMTP_HOST || '').trim();
  const smtpUser = String(env.SMTP_USER || '').trim();
  const smtpPass = String(env.SMTP_PASSWORD || env.SMTP_PASS || '').trim();
  return Boolean(smtpHost && smtpUser && smtpPass && resolveMailFrom(env));
}

function resolveMailFrom(env = process.env) {
  const explicit = String(env.AUTO_BUSINESS_FROM_EMAIL || env.MAIL_FROM || '').trim();
  if (explicit) return explicit;
  const gmailUser = String(env.GMAIL_USER || '').trim();
  if (gmailUser) return `"3DVR Auto-Business" <${gmailUser}>`;
  const smtpUser = String(env.SMTP_USER || '').trim();
  return smtpUser ? `"3DVR Auto-Business" <${smtpUser}>` : '';
}

function credentialStatus(env = process.env) {
  const ownerEmail = resolveOwnerEmail(env);
  const outreachContactsPath = expandHome(env.AUTO_BUSINESS_CONTACTS_FILE || DEFAULT_CONTACTS_PATH, env);
  const physicalAddress = resolvePhysicalAddress(env);
  const unsubscribeEmail = resolveUnsubscribeEmail(env);
  const unsubscribeUrl = resolveUnsubscribeUrl(env);
  return {
    openai: {
      ok: Boolean(String(env.OPENAI_API_KEY || '').trim()),
      accepted: ['OPENAI_API_KEY'],
      missing: ['OPENAI_API_KEY'],
      help: 'Create an OpenAI API key in the OpenAI platform dashboard, then add OPENAI_API_KEY=sk-... to ~/.config/3dvr/money-printer.env.'
    },
    ownerEmail: {
      ok: Boolean(ownerEmail),
      accepted: ['AUTO_BUSINESS_OWNER_EMAIL', 'MONEY_PRINTER_OWNER_EMAIL', 'STRIPE_LOG_EMAIL', 'GMAIL_USER'],
      missing: ['AUTO_BUSINESS_OWNER_EMAIL, MONEY_PRINTER_OWNER_EMAIL, STRIPE_LOG_EMAIL, or GMAIL_USER'],
      help: 'Set AUTO_BUSINESS_OWNER_EMAIL to the inbox that should receive every auto-business report, or reuse STRIPE_LOG_EMAIL/GMAIL_USER from the existing portal mail setup.'
    },
    mail: {
      ok: hasMailConfig(env),
      accepted: ['GMAIL_USER + GMAIL_APP_PASSWORD', 'SMTP_HOST + SMTP_USER + SMTP_PASSWORD'],
      missing: ['GMAIL_USER + GMAIL_APP_PASSWORD', 'or SMTP_HOST + SMTP_USER + SMTP_PASSWORD'],
      help: 'For Gmail, enable 2-Step Verification, create an app password for Mail, then set GMAIL_USER and GMAIL_APP_PASSWORD. Any SMTP provider can use SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and optional SMTP_SECURE=true.'
    },
    github: {
      ok: Boolean(String(env.GITHUB_TOKEN || env.MONEY_AUTOPILOT_GH_TOKEN || env.GH_PAT || '').trim()),
      accepted: ['GITHUB_TOKEN', 'MONEY_AUTOPILOT_GH_TOKEN', 'GH_PAT'],
      missing: ['GITHUB_TOKEN or MONEY_AUTOPILOT_GH_TOKEN'],
      help: 'Create a GitHub fine-grained token for this repository with Issues and Contents write access. Add it as GITHUB_TOKEN for task/issues or MONEY_AUTOPILOT_GH_TOKEN for offer publishing.'
    },
    vercel: {
      ok: Boolean(String(env.VERCEL_TOKEN || env.MONEY_AUTOPILOT_VERCEL_TOKEN || '').trim()),
      accepted: ['VERCEL_TOKEN', 'MONEY_AUTOPILOT_VERCEL_TOKEN'],
      missing: ['VERCEL_TOKEN'],
      help: 'Create a Vercel account token, then set VERCEL_TOKEN. Add VERCEL_PROJECT_ID for inspection and MONEY_AUTOPILOT_VERCEL_PROJECT_NAME if auto-publishing offer pages to Vercel.'
    },
    checkout: {
      ok: Boolean(String(env.MONEY_AUTOPILOT_CHECKOUT_URL || env.STRIPE_CHECKOUT_URL || '').trim()),
      accepted: ['MONEY_AUTOPILOT_CHECKOUT_URL', 'STRIPE_CHECKOUT_URL'],
      missing: ['MONEY_AUTOPILOT_CHECKOUT_URL or STRIPE_CHECKOUT_URL'],
      help: 'Set this to the paid checkout or billing URL the generated offer pages should use. STRIPE_SECRET_KEY/price IDs can power portal billing, but the auto-offer pages still need a destination URL.'
    },
    facebookPage: {
      ok: Boolean(String(env.META_PAGE_ID || '').trim() && String(env.META_PAGE_ACCESS_TOKEN || '').trim()),
      accepted: ['META_PAGE_ID + META_PAGE_ACCESS_TOKEN'],
      missing: ['META_PAGE_ID', 'META_PAGE_ACCESS_TOKEN'],
      help: 'Connect a Facebook Page through Meta Graph API. Use a server-side Page access token with page posting permissions; do not automate a personal Android Facebook session.'
    },
    outreachContacts: {
      ok: Boolean(String(env.AUTO_BUSINESS_CONTACTS_FILE || '').trim()),
      accepted: ['AUTO_BUSINESS_CONTACTS_FILE'],
      missing: ['AUTO_BUSINESS_CONTACTS_FILE'],
      help: `Put contacts in ${outreachContactsPath}. CSV columns: email,name,company,optIn,source,recipientType,legalBasis,country.`
    },
    senderCompliance: {
      ok: Boolean(physicalAddress && (unsubscribeUrl || unsubscribeEmail)),
      accepted: [
        'AUTO_BUSINESS_PHYSICAL_ADDRESS or BUSINESS_PHYSICAL_ADDRESS',
        'AUTO_BUSINESS_UNSUBSCRIBE_URL or UNSUBSCRIBE_URL',
        'AUTO_BUSINESS_UNSUBSCRIBE_EMAIL or UNSUBSCRIBE_EMAIL'
      ],
      missing: ['AUTO_BUSINESS_PHYSICAL_ADDRESS', 'AUTO_BUSINESS_UNSUBSCRIBE_URL or AUTO_BUSINESS_UNSUBSCRIBE_EMAIL'],
      help: 'Commercial outreach requires a real sender identity, a valid physical postal address, and a simple opt-out path in every message.'
    }
  };
}

function summarizeCredentialStatus(status = {}) {
  return Object.entries(status).map(([key, item]) => ({
    key,
    ok: Boolean(item.ok),
    accepted: Array.isArray(item.accepted) ? item.accepted : [],
    missing: item.ok ? [] : item.missing,
    help: item.ok ? '' : item.help
  }));
}

function errorMessage(error) {
  return error?.message || String(error || 'unknown error');
}

function failedStep(name, error, defaults = {}) {
  const message = errorMessage(error);
  return {
    ...defaults,
    ok: false,
    step: name,
    error: message,
    warnings: [
      ...(Array.isArray(defaults.warnings) ? defaults.warnings : []),
      `${name} failed: ${message}`
    ]
  };
}

async function runAutoBusinessStep(name, work, defaults = {}) {
  try {
    const result = await work();
    return {
      ok: true,
      ...result
    };
  } catch (error) {
    return failedStep(name, error, defaults);
  }
}

function missingCredentials(status = {}) {
  return Object.entries(status)
    .filter(([, item]) => !item.ok)
    .map(([key, item]) => ({
      key,
      missing: item.missing,
      help: item.help
    }));
}

function pickMarket(markets = DEFAULT_MARKETS, date = new Date()) {
  const list = Array.isArray(markets) && markets.length ? markets : DEFAULT_MARKETS;
  const slot = Math.floor(date.getTime() / (1000 * 60 * 60 * 8));
  return list[slot % list.length];
}

function resolveAutoBusinessConfig(options = {}, env = process.env) {
  const markets = splitList(options.markets || env.AUTO_BUSINESS_MARKETS, DEFAULT_MARKETS);
  const market = options.market || env.AUTO_BUSINESS_MARKET || pickMarket(markets);
  const dryRun = parseBoolean(options.dryRun ?? env.AUTO_BUSINESS_DRY_RUN, false);
  const outreachEnabled = parseBoolean(options.outreachEnabled ?? env.AUTO_BUSINESS_OUTREACH_ENABLED, false);
  const outreachDailyLimit = Math.max(0, Math.min(
    parseNumber(options.outreachDailyLimit ?? env.AUTO_BUSINESS_OUTREACH_DAILY_LIMIT, 3),
    parseNumber(env.AUTO_BUSINESS_OUTREACH_MAX_CAP, 10)
  ));

  return {
    market,
    markets,
    keywords: splitList(options.keywords || env.AUTO_BUSINESS_KEYWORDS, DEFAULT_KEYWORDS),
    channels: splitList(options.channels || env.AUTO_BUSINESS_CHANNELS, DEFAULT_CHANNELS),
    budget: parseNumber(options.budget ?? env.AUTO_BUSINESS_WEEKLY_BUDGET, 150),
    signalLimit: parseNumber(options.signalLimit ?? env.AUTO_BUSINESS_SIGNAL_LIMIT, 24),
    ai: options.ai ?? parseBoolean(env.AUTO_BUSINESS_AI, true),
    dryRun,
    executeApproved: parseBoolean(options.executeApproved ?? env.AUTO_BUSINESS_EXECUTE_APPROVED, true),
    autoApproveGreen: parseBoolean(options.autoApproveGreen ?? env.AUTO_BUSINESS_AUTO_APPROVE_GREEN, true),
    marketPulseDryRun: parseBoolean(options.marketPulseDryRun ?? env.AUTO_BUSINESS_MARKET_PULSE_DRY_RUN, false),
    autopilotDryRun: parseBoolean(options.autopilotDryRun ?? env.AUTO_BUSINESS_AUTOPILOT_DRY_RUN, dryRun),
    emailReports: parseBoolean(options.emailReports ?? env.AUTO_BUSINESS_EMAIL_REPORTS, true),
    outreachEnabled,
    outreachMode: String(options.outreachMode || env.AUTO_BUSINESS_OUTREACH_MODE || 'warm').trim().toLowerCase(),
    outreachDailyLimit,
    contactsFile: expandHome(options.contactsFile || env.AUTO_BUSINESS_CONTACTS_FILE || DEFAULT_CONTACTS_PATH, env),
    suppressionFile: expandHome(options.suppressionFile || env.AUTO_BUSINESS_SUPPRESSION_FILE || DEFAULT_SUPPRESSION_PATH, env),
    ownerEmail: resolveOwnerEmail(env),
    legalName: resolveLegalName(env),
    physicalAddress: resolvePhysicalAddress(env),
    unsubscribeEmail: resolveUnsubscribeEmail(env),
    unsubscribeUrl: resolveUnsubscribeUrl(env),
    facebookQueueEnabled: parseBoolean(options.facebookQueueEnabled ?? env.AUTO_BUSINESS_FACEBOOK_QUEUE_ENABLED, false),
    facebookAutoApprove: parseBoolean(options.facebookAutoApprove ?? env.AUTO_BUSINESS_FACEBOOK_AUTO_APPROVE, false),
    facebookRunWorker: parseBoolean(options.facebookRunWorker ?? env.AUTO_BUSINESS_FACEBOOK_RUN_WORKER, false),
    facebookDryRun: parseBoolean(options.facebookDryRun ?? env.AUTO_BUSINESS_FACEBOOK_DRY_RUN, true),
    facebookLimit: Math.max(1, Math.min(
      parseNumber(options.facebookLimit ?? env.AUTO_BUSINESS_FACEBOOK_LIMIT, 1),
      5
    )),
    facebookPageId: String(options.facebookPageId || env.META_PAGE_ID || '').trim(),
    facebookLink: resolveFacebookLink(env)
  };
}

function csvRows(raw = '') {
  return String(raw || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

function parseCsvContacts(raw = '') {
  const rows = csvRows(raw);
  if (!rows.length) return [];
  const header = rows[0].split(',').map(item => item.trim().toLowerCase());
  const hasHeader = header.includes('email');
  const fields = hasHeader ? header : ['email', 'name', 'company', 'optin', 'source', 'recipienttype', 'legalbasis', 'country'];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows.map(row => {
    const values = row.split(',').map(item => item.trim());
    return fields.reduce((contact, field, index) => {
      contact[field] = values[index] || '';
      return contact;
    }, {});
  });
}

async function readContacts(filePath = '') {
  if (!filePath) return [];
  try {
    const raw = await readFile(filePath, 'utf8');
    if (filePath.endsWith('.json')) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    return parseCsvContacts(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function normalizeContact(contact = {}) {
  const email = String(contact.email || contact.Email || '').trim().toLowerCase();
  const name = String(contact.name || contact.Name || '').trim();
  const company = String(contact.company || contact.Company || '').trim();
  const source = String(contact.source || contact.Source || '').trim();
  const recipientType = String(contact.recipientType || contact.recipienttype || contact.type || contact.Type || '').trim();
  const legalBasis = String(contact.legalBasis || contact.legalbasis || contact.basis || contact.Basis || '').trim();
  const country = String(contact.country || contact.Country || contact.jurisdiction || contact.Jurisdiction || '').trim();
  const optIn = parseBoolean(contact.optIn ?? contact.optin ?? contact['opt-in'] ?? contact.warm, false);
  const unsubscribed = parseBoolean(contact.unsubscribed ?? contact.unsubscribe ?? contact.optOut ?? contact.optout, false);
  return {
    email,
    name,
    company,
    source,
    recipientType,
    legalBasis,
    country,
    optIn,
    unsubscribed
  };
}

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase();
}

function isWarmContact(contact = {}) {
  return Boolean(contact.optIn || WARM_CONTACT_SOURCES.includes(normalizeKey(contact.source)));
}

function isUsJurisdiction(value = '') {
  return ['us', 'usa', 'u.s.', 'u.s.a.', 'united states', 'united states of america'].includes(normalizeKey(value));
}

function isCompliantB2bContact(contact = {}, config = {}) {
  if (config.outreachMode !== 'compliant-b2b') return false;
  if (!config.physicalAddress || (!config.unsubscribeUrl && !config.unsubscribeEmail)) return false;
  return Boolean(
    isUsJurisdiction(contact.country)
    && BUSINESS_RECIPIENT_TYPES.includes(normalizeKey(contact.recipientType))
    && COMPLIANT_B2B_BASES.includes(normalizeKey(contact.legalBasis))
    && COMPLIANT_B2B_SOURCES.includes(normalizeKey(contact.source))
  );
}

function canSendToContact(contact = {}, config = {}, suppressionEmails = new Set()) {
  if (!contact.email || !contact.email.includes('@')) {
    return { ok: false, reason: 'invalid email' };
  }
  if (contact.unsubscribed || suppressionEmails.has(contact.email)) {
    return { ok: false, reason: 'suppressed or unsubscribed' };
  }
  if (isWarmContact(contact)) {
    return { ok: true, reason: 'warm or opt-in contact' };
  }
  if (isCompliantB2bContact(contact, config)) {
    return { ok: true, reason: 'compliant b2b contact' };
  }
  return { ok: false, reason: 'missing opt-in, warm source, or compliant-b2b metadata' };
}

function dateKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function slugify(value = '', fallback = 'market') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function topOpportunities({ marketPulse, autopilot } = {}) {
  const seen = new Set();
  return [
    autopilot?.topOpportunity,
    marketPulse?.topOpportunity,
    ...(Array.isArray(autopilot?.opportunities) ? autopilot.opportunities : []),
    ...(Array.isArray(marketPulse?.opportunities) ? marketPulse.opportunities : [])
  ].filter(Boolean).filter(opportunity => {
    const key = slugify(opportunity.id || opportunity.title || opportunity.problem);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMarketResearchSummary({ config, marketPulse, autopilot } = {}) {
  const selectedMarket = autopilot?.market || marketPulse?.profile?.market || config.market;
  const marketSelection = autopilot?.marketSelection || {};
  const candidates = Array.isArray(marketSelection.candidates)
    ? marketSelection.candidates.slice(0, 5)
    : [];
  const opportunities = topOpportunities({ marketPulse, autopilot }).slice(0, 5);

  return {
    selectedMarket,
    configuredMarket: config.market,
    selectionMode: marketSelection.mode || (config.market ? 'configured-or-rotating' : 'rotating'),
    sourceSignals: Number(marketSelection.sourceSignals || marketPulse?.signalsAnalyzed || 0),
    selectedCandidate: marketSelection.selected || null,
    candidates,
    topOpportunity: opportunities[0] || null,
    opportunities,
    researchQuestions: [
      `Who in ${selectedMarket} loses money because this problem is unresolved?`,
      'What exact workaround are they already paying for with time, tools, contractors, or missed sales?',
      'What is the smallest paid offer 3DVR can test this week?'
    ]
  };
}

function buildFacebookMarketMessage({ market, opportunity, link } = {}) {
  const problem = opportunity?.problem || `keeping follow-up, launch work, and customer momentum organized for ${market}`;
  const solution = opportunity?.solution || 'a small 3DVR setup that turns a messy project into a page, follow-up loop, and next actions';
  const cta = link ? `\n\nI am collecting signal here: ${link}` : '';
  return [
    `Question for people running ${market}:`,
    '',
    `Where does this break first in the real week: ${problem}`,
    '',
    `I am testing whether ${solution} is useful enough to pay for.`,
    '',
    'What would make this worth a serious look: faster lead follow-up, clearer offer page, less admin, or a better first project plan?',
    cta
  ].join('\n');
}

function buildFacebookMarketJobs({ config, marketResearch } = {}) {
  const market = marketResearch.selectedMarket || config.market;
  const opportunities = marketResearch.opportunities?.length
    ? marketResearch.opportunities
    : [marketResearch.topOpportunity].filter(Boolean);
  const approvedAt = config.facebookAutoApprove ? nowIso() : '';

  return opportunities.slice(0, config.facebookLimit).map((opportunity, index) => {
    const experimentId = `auto-business-${slugify(market)}-${slugify(opportunity?.title || `probe-${index + 1}`)}`;
    const message = buildFacebookMarketMessage({
      market,
      opportunity,
      link: config.facebookLink
    });

    return {
      id: experimentId,
      experimentId,
      status: config.facebookAutoApprove ? 'approved' : 'draft',
      channel: 'facebook-page',
      integration: 'meta_graph_api',
      market,
      opportunityId: opportunity?.id || '',
      opportunityTitle: opportunity?.title || '',
      message,
      link: config.facebookLink,
      pageId: config.facebookPageId,
      approvedAt,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      metaGraph: buildMetaMarketExperimentPlan({
        experimentId,
        pageId: config.facebookPageId || '{page-id}',
        message,
        link: config.facebookLink
      })
    };
  });
}

async function runFacebookMarketPosts({ config, env, marketResearch }) {
  const jobs = buildFacebookMarketJobs({ config, marketResearch });
  const result = {
    queueEnabled: config.facebookQueueEnabled,
    autoApprove: config.facebookAutoApprove,
    runWorker: config.facebookRunWorker,
    dryRun: config.facebookDryRun,
    pageIdConfigured: Boolean(config.facebookPageId),
    link: config.facebookLink,
    drafted: jobs.length,
    queued: 0,
    jobs,
    worker: null,
    reason: ''
  };

  if (!jobs.length) {
    result.reason = 'No market opportunity was strong enough to draft a Facebook Page post.';
    return result;
  }

  if (!config.facebookQueueEnabled) {
    result.reason = 'Facebook job queue disabled. Set AUTO_BUSINESS_FACEBOOK_QUEUE_ENABLED=true to queue drafts for the Meta worker.';
    return result;
  }

  const client = await createMetaMarketGunClient({
    gunPeers: splitList(env.GROWTH_GUN_PEERS, [])
  });

  for (const job of jobs) {
    await client.writeJobUpdate(job.id, job);
    result.queued += 1;
  }

  if (!config.facebookRunWorker) {
    result.reason = 'Facebook jobs queued. Set AUTO_BUSINESS_FACEBOOK_RUN_WORKER=true to publish/measure approved jobs during this cycle.';
    return result;
  }

  result.worker = await runMetaMarketWorkerOnce({
    client,
    env,
    dryRun: config.facebookDryRun,
    limit: config.facebookLimit
  });
  result.reason = config.facebookDryRun
    ? 'Facebook worker dry-run complete.'
    : 'Facebook worker live run complete.';
  return result;
}

async function readOutreachLedger(paths) {
  const ledgerPath = path.join(paths.workspaceDir, 'outreach-ledger.json');
  try {
    const parsed = JSON.parse(await readFile(ledgerPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? { ledgerPath, ledger: parsed } : { ledgerPath, ledger: {} };
  } catch {
    return { ledgerPath, ledger: {} };
  }
}

async function writeOutreachLedger(ledgerPath, ledger) {
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

function parseSuppressionRows(raw = '') {
  return csvRows(raw)
    .flatMap(row => row.split(','))
    .map(item => item.trim().toLowerCase())
    .filter(item => item.includes('@'));
}

async function readSuppressionEmails(filePath = '') {
  if (!filePath) return new Set();
  try {
    const raw = await readFile(filePath, 'utf8');
    if (filePath.endsWith('.json')) {
      const parsed = JSON.parse(raw);
      const emails = Array.isArray(parsed)
        ? parsed.map(item => typeof item === 'string' ? item : item?.email)
        : Object.keys(parsed || {});
      return new Set(emails.map(item => String(item || '').trim().toLowerCase()).filter(item => item.includes('@')));
    }
    return new Set(parseSuppressionRows(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    throw error;
  }
}

function buildComplianceFooter(config = {}) {
  const lines = [
    '',
    '--',
    config.legalName || '3DVR'
  ];
  if (config.physicalAddress) {
    lines.push(config.physicalAddress);
  }
  const optOutParts = [];
  if (config.unsubscribeUrl) optOutParts.push(`unsubscribe here: ${config.unsubscribeUrl}`);
  if (config.unsubscribeEmail) optOutParts.push(`reply STOP or email ${config.unsubscribeEmail}`);
  if (optOutParts.length) {
    lines.push(`Opt out: ${optOutParts.join(' or ')}.`);
  }
  return lines.join('\n');
}

function buildOutreachMessage({ contact, market, topOpportunity, config }) {
  const name = contact.name ? ` ${contact.name}` : '';
  const title = topOpportunity?.title || '3DVR Forge Sprint';
  const problem = topOpportunity?.problem || `keeping leads, follow-up, and launch work organized for ${market}`;
  const solution = topOpportunity?.solution || 'a focused setup sprint that turns one messy project into a paid test, landing page, and follow-up loop';
  const firstName = name.trim().split(/\s+/)[0] || 'there';
  return {
    subject: `Quick 3DVR launch sprint idea for ${contact.company || 'your project'}`,
    text: [
      `Hi ${firstName},`,
      '',
      `I am testing ${title} for ${market}. The problem I am checking is: ${problem}`,
      '',
      `The useful version is simple: ${solution}`,
      '',
      'Would it be useful if I sent you the one-page version and a direct setup option?',
      '',
      'If this is not relevant, use the opt-out note below and I will not follow up.',
      buildComplianceFooter(config)
    ].join('\n')
  };
}

async function runWarmOutreach({ config, env, paths, topOpportunity, market }) {
  const result = {
    enabled: config.outreachEnabled,
    attempted: 0,
    sent: 0,
    skipped: 0,
    reason: '',
    contactsFile: config.contactsFile,
    suppressionFile: config.suppressionFile,
    messages: []
  };

  if (!config.outreachEnabled) {
    result.reason = 'AUTO_BUSINESS_OUTREACH_ENABLED is not true.';
    return result;
  }

  const transport = createMailTransport(env);
  const from = resolveMailFrom(env);
  if (!transport || !from) {
    result.reason = 'Mail transport is not configured.';
    return result;
  }
  if (!config.physicalAddress || (!config.unsubscribeUrl && !config.unsubscribeEmail)) {
    result.reason = 'Sender compliance is not configured. Set AUTO_BUSINESS_PHYSICAL_ADDRESS plus AUTO_BUSINESS_UNSUBSCRIBE_EMAIL or AUTO_BUSINESS_UNSUBSCRIBE_URL.';
    return result;
  }

  const contacts = (await readContacts(config.contactsFile)).map(normalizeContact);
  const suppressionEmails = await readSuppressionEmails(config.suppressionFile);
  const eligibility = contacts.map(contact => ({
    contact,
    decision: canSendToContact(contact, config, suppressionEmails)
  }));
  const eligible = eligibility.filter(item => item.decision.ok).map(item => item.contact);
  result.skipped = eligibility.filter(item => !item.decision.ok).length;
  result.skippedReasons = eligibility
    .filter(item => !item.decision.ok)
    .reduce((counts, item) => {
      counts[item.decision.reason] = (counts[item.decision.reason] || 0) + 1;
      return counts;
    }, {});
  if (!eligible.length) {
    result.reason = config.outreachMode === 'compliant-b2b'
      ? 'No warm, opt-in, or compliant-b2b contacts found.'
      : 'No warm/opt-in contacts found.';
    return result;
  }

  const { ledgerPath, ledger } = await readOutreachLedger(paths);
  const today = dateKey();
  const todaySent = Number(ledger.daily?.[today]?.sent || 0);
  const remaining = Math.max(0, config.outreachDailyLimit - todaySent);
  if (!remaining) {
    result.reason = 'Daily outreach limit already reached.';
    return result;
  }

  const byEmail = ledger.contacts || {};
  const candidates = eligible.filter(contact => {
    const last = byEmail[contact.email]?.lastSentAt || '';
    if (!last) return true;
    const elapsed = Date.now() - Date.parse(last);
    return Number.isNaN(elapsed) || elapsed > 1000 * 60 * 60 * 24 * 30;
  }).slice(0, remaining);

  for (const contact of candidates) {
    const message = buildOutreachMessage({ contact, market, topOpportunity, config });
    result.attempted += 1;
    try {
      await transport.sendMail({
        from,
        to: contact.email,
        subject: message.subject,
        text: message.text
      });
      result.sent += 1;
      result.messages.push({ email: contact.email, subject: message.subject, status: 'sent' });
      byEmail[contact.email] = {
        lastSentAt: nowIso(),
        subject: message.subject,
        source: contact.source || ''
      };
    } catch (error) {
      result.skipped += 1;
      result.messages.push({ email: contact.email, subject: message.subject, status: 'failed', error: error.message });
    }
  }

  ledger.contacts = byEmail;
  ledger.daily = {
    ...(ledger.daily || {}),
    [today]: {
      sent: todaySent + result.sent,
      updatedAt: nowIso()
    }
  };
  await writeOutreachLedger(ledgerPath, ledger);

  if (!result.reason) {
    result.reason = result.sent
      ? `${config.outreachMode === 'compliant-b2b' ? 'Compliant B2B' : 'Warm'} outreach sent.`
      : 'No new eligible contacts after dedupe.';
  }
  return result;
}

function buildCritique({ supervisor, marketPulse, autopilot, facebook, outreach, missing }) {
  const topOpportunity = autopilot?.topOpportunity || marketPulse?.topOpportunity || {};
  const warnings = [
    ...(supervisor?.warnings || []),
    ...(autopilot?.warnings || []),
    ...(marketPulse?.warnings || [])
  ];
  return {
    strongestSignal: topOpportunity.title || 'No strong opportunity yet.',
    weakestAssumption: topOpportunity.problem
      ? `We still need proof that buyers will pay for: ${topOpportunity.problem}`
      : 'The loop needs stronger buyer evidence before scaling.',
    likelyFailureMode: outreach?.sent
      ? 'Reply quality may be weak if the audience is too broad or the first line is not specific enough.'
      : 'No distribution happens until eligible contacts, owner email, mail credentials, sender address, and opt-out details are configured.',
    selfImprovement: supervisor?.codexPromptPath
      ? `Review or run the generated Codex prompt at ${supervisor.codexPromptPath}.`
      : 'Generate and ship one smaller offer-page improvement next cycle.',
    nextMoneyMove: facebook?.queued
      ? 'Watch the Facebook Page probe for comments, clicks, and repeated pain language.'
      : autopilot?.executionChecklist?.[0]
      || supervisor?.nextBestMoneyAction
      || marketPulse?.marketFit?.nextAction
      || 'Pick one reachable buyer segment and send a paid test offer.',
    warnings,
    missingCredentials: missing
  };
}

function formatOwnerEmail(report = {}) {
  const missing = report.credentials?.missing || [];
  const failures = [report.supervisor, report.marketPulse, report.autopilot, report.facebook, report.outreach]
    .filter(item => item && item.ok === false);
  const lines = [
    '3DVR auto-business cycle complete.',
    '',
    `Market: ${report.config.market}`,
    `Selected market: ${report.marketResearch?.selectedMarket || report.config.market}`,
    `Top opportunity: ${report.autopilot?.topOpportunity?.title || report.marketPulse?.topOpportunity?.title || 'none'}`,
    `Signals analyzed: ${report.autopilot?.signalsAnalyzed || 0} autopilot / ${report.marketPulse?.signalsAnalyzed || 0} market pulse`,
    `Facebook Page jobs: ${report.facebook?.queued || 0} queued / ${report.facebook?.drafted || 0} drafted (${report.facebook?.reason || 'not run'})`,
    `Outreach: ${report.outreach?.sent || 0} sent (${report.outreach?.reason || 'not run'})`,
    `Next money move: ${report.critique?.nextMoneyMove || 'none'}`,
    '',
    'Critique:',
    `- Strongest signal: ${report.critique?.strongestSignal || ''}`,
    `- Weakest assumption: ${report.critique?.weakestAssumption || ''}`,
    `- Likely failure mode: ${report.critique?.likelyFailureMode || ''}`,
    `- Self-improvement: ${report.critique?.selfImprovement || ''}`,
    '',
    `Latest report: ${report.paths?.latestReportPath || ''}`,
    `Supervisor report: ${report.supervisor?.latestPath || ''}`,
    `Autopilot run: ${report.autopilot?.runId || ''}`,
    `Market pulse run: ${report.marketPulse?.runId || ''}`,
    ''
  ];

  if (failures.length) {
    lines.push('Subsystems that need attention:');
    failures.forEach(item => {
      lines.push(`- ${item.step || 'step'}: ${item.error || 'failed'}`);
    });
    lines.push('');
  }

  if (missing.length) {
    lines.push('Credentials or setup still needed:');
    missing.forEach(item => {
      lines.push(`- ${item.key}: ${item.missing.join(', ')}`);
      lines.push(`  ${item.help}`);
    });
    lines.push('');
  }

  if (Array.isArray(report.outreach?.messages) && report.outreach.messages.length) {
    lines.push('Outreach messages:');
    report.outreach.messages.forEach(item => {
      lines.push(`- ${item.status}: ${item.email} / ${item.subject}${item.error ? ` (${item.error})` : ''}`);
    });
    lines.push('');
  }

  if (Array.isArray(report.facebook?.jobs) && report.facebook.jobs.length) {
    lines.push('Facebook Page post drafts:');
    report.facebook.jobs.forEach(item => {
      lines.push(`- ${item.status}: ${item.market} / ${item.opportunityTitle || item.experimentId}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

async function sendOwnerReport({ env, config, report }) {
  const result = {
    attempted: false,
    sent: false,
    reason: ''
  };
  if (!config.emailReports) {
    result.reason = 'email reports disabled';
    return result;
  }
  const transport = createMailTransport(env);
  const from = resolveMailFrom(env);
  if (!transport || !from || !config.ownerEmail) {
    result.reason = 'owner email or mail credentials missing';
    return result;
  }

  result.attempted = true;
  await transport.sendMail({
    from,
    to: config.ownerEmail,
    subject: `[3DVR auto-business] ${report.autopilot?.topOpportunity?.title || report.config.market}`,
    text: formatOwnerEmail(report)
  });
  result.sent = true;
  result.reason = 'sent';
  return result;
}

export async function checkAutoBusinessSetup(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const env = options.env || process.env;
  const envLoad = await loadMoneyPrinterEnv(rootDir, env);
  const config = resolveAutoBusinessConfig(options, env);
  const credentials = credentialStatus(env);
  const missing = missingCredentials(credentials);

  return {
    checkedAt: nowIso(),
    rootDir,
    envFilesLoaded: envLoad.loadedFiles,
    keysLoaded: envLoad.keysLoaded.sort(),
    ready: {
      coreAi: credentials.openai.ok,
      ownerEmail: credentials.ownerEmail.ok,
      mailReports: credentials.ownerEmail.ok && credentials.mail.ok,
      checkout: credentials.checkout.ok,
      facebookPagePosting: credentials.facebookPage.ok,
      outreach: credentials.mail.ok && credentials.outreachContacts.ok && credentials.senderCompliance.ok
    },
    config: {
      market: config.market,
      emailReports: config.emailReports,
      outreachEnabled: config.outreachEnabled,
      outreachMode: config.outreachMode,
      outreachDailyLimit: config.outreachDailyLimit,
      contactsFile: config.contactsFile,
      suppressionFile: config.suppressionFile,
      facebookQueueEnabled: config.facebookQueueEnabled,
      facebookAutoApprove: config.facebookAutoApprove,
      facebookRunWorker: config.facebookRunWorker,
      facebookDryRun: config.facebookDryRun,
      facebookPageIdConfigured: Boolean(config.facebookPageId),
      facebookLinkConfigured: Boolean(config.facebookLink)
    },
    credentials: summarizeCredentialStatus(credentials),
    missing
  };
}

export async function runAutoBusinessCycle(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const env = options.env || process.env;
  await loadMoneyPrinterEnv(rootDir, env);
  const workspace = await ensureMoneyPrinterWorkspace(rootDir);
  const paths = getMoneyPrinterWorkspacePaths(rootDir);
  const config = resolveAutoBusinessConfig(options, env);
  const credentials = credentialStatus(env);
  const missing = missingCredentials(credentials);

  const startedAt = nowIso();
  const supervisor = await runAutoBusinessStep('money-printer-supervisor', () => runMoneyPrinterSupervisor({
    rootDir,
    ai: config.ai,
    autoApproveGreen: config.autoApproveGreen,
    executeApproved: config.executeApproved
  }), {
    mode: config.ai ? 'openai-or-fallback' : 'mock',
    model: '',
    nextBestMoneyAction: 'Fix supervisor setup, then rerun the auto-business cycle.',
    operationsAddedThisCycle: 0,
    executedApprovedCount: 0
  });

  const marketPulse = await runAutoBusinessStep('market-pulse', () => runMarketPulseCycle({
    market: config.market,
    keywords: config.keywords,
    channels: config.channels,
    limit: config.signalLimit,
    dryRun: config.marketPulseDryRun,
    gunPeers: splitList(env.GROWTH_GUN_PEERS, [])
  }), {
    runId: '',
    signalsAnalyzed: 0,
    opportunities: [],
    topOpportunity: null,
    marketFit: {
      nextAction: 'Fix market pulse setup or network access, then rerun.'
    }
  });

  const autopilot = await runAutoBusinessStep('money-autopilot', () => runAutopilotCycle({
    env,
    market: config.market,
    keywords: config.keywords,
    channels: config.channels,
    budget: config.budget,
    limit: config.signalLimit,
    dryRun: config.autopilotDryRun,
    autoDiscover: true
  }), {
    runId: '',
    market: config.market,
    signalsAnalyzed: 0,
    opportunities: [],
    topOpportunity: marketPulse.topOpportunity || null,
    executionChecklist: ['Fix autopilot setup, then rerun the offer loop.'],
    artifacts: {}
  });

  const marketResearch = buildMarketResearchSummary({
    config,
    marketPulse,
    autopilot
  });

  const facebook = await runAutoBusinessStep('facebook-market-posts', () => runFacebookMarketPosts({
    config,
    env,
    marketResearch
  }), {
    queueEnabled: config.facebookQueueEnabled,
    autoApprove: config.facebookAutoApprove,
    runWorker: config.facebookRunWorker,
    dryRun: config.facebookDryRun,
    pageIdConfigured: Boolean(config.facebookPageId),
    link: config.facebookLink,
    drafted: 0,
    queued: 0,
    jobs: [],
    worker: null,
    reason: 'Facebook market post step did not complete.'
  });

  const outreach = await runAutoBusinessStep('warm-outreach', () => runWarmOutreach({
    config,
    env,
    paths,
    topOpportunity: autopilot.topOpportunity || marketPulse.topOpportunity,
    market: autopilot.market || config.market
  }), {
    enabled: config.outreachEnabled,
    attempted: 0,
    sent: 0,
    skipped: 0,
    reason: 'Warm outreach did not complete.',
    contactsFile: config.contactsFile,
    suppressionFile: config.suppressionFile,
    messages: []
  });

  const critique = buildCritique({
    supervisor,
    marketPulse,
    autopilot,
    facebook,
    outreach,
    missing
  });

  const report = {
    startedAt,
    finishedAt: nowIso(),
    rootDir,
    config: {
      market: config.market,
      keywords: config.keywords,
      channels: config.channels,
      budget: config.budget,
      signalLimit: config.signalLimit,
      ai: config.ai,
      dryRun: config.dryRun,
      selectedMarket: marketResearch.selectedMarket,
      outreachEnabled: config.outreachEnabled,
      outreachMode: config.outreachMode,
      outreachDailyLimit: config.outreachDailyLimit,
      contactsFile: config.contactsFile,
      suppressionFile: config.suppressionFile,
      facebookQueueEnabled: config.facebookQueueEnabled,
      facebookAutoApprove: config.facebookAutoApprove,
      facebookRunWorker: config.facebookRunWorker,
      facebookDryRun: config.facebookDryRun,
      facebookLimit: config.facebookLimit,
      facebookPageIdConfigured: Boolean(config.facebookPageId),
      facebookLink: config.facebookLink
    },
    credentials: {
      status: credentials,
      missing
    },
    supervisor,
    marketResearch,
    marketPulse,
    autopilot: {
      ...autopilot,
      artifacts: {
        offerHtmlLength: String(autopilot.artifacts?.offerHtml || '').length
      }
    },
    facebook,
    outreach,
    critique,
    paths: {
      workspaceDir: workspace.paths.workspaceDir
    }
  };

  const latestReportPath = path.join(paths.reportsDir, 'auto-business-latest.json');
  await writeJsonFile(latestReportPath, report);
  const timestampedReportPath = await writeJsonFile(
    path.join(paths.reportsDir, `auto-business-${startedAt.replace(/[:.]/g, '-')}.json`),
    report
  );
  report.paths.latestReportPath = latestReportPath;
  report.paths.timestampedReportPath = timestampedReportPath;
  await writeJsonFile(latestReportPath, report);

  let ownerEmail;
  try {
    ownerEmail = await sendOwnerReport({ env, config, report });
  } catch (error) {
    ownerEmail = {
      attempted: true,
      sent: false,
      reason: `owner email failed: ${errorMessage(error)}`,
      error: errorMessage(error)
    };
  }
  report.ownerEmail = ownerEmail;
  await writeJsonFile(latestReportPath, report);

  await appendMoneyPrinterEvent(rootDir, {
    command: 'auto-business',
    inputSummary: config.market,
    outputSummary: `${autopilot.opportunities?.length || 0} opportunities, ${facebook.queued || 0} Facebook job(s) queued, ${outreach.sent || 0} outreach sent, ${missing.length} setup gaps.`,
    nextAction: critique.nextMoneyMove,
    aiMode: supervisor.mode || '',
    model: supervisor.model || ''
  });

  return report;
}
