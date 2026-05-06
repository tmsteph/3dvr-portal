const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const { buildOutreachDraft } = require('./outreach-draft');
const { readRows } = require('./lead-enrich');
const { appendOutreachLog } = require('./outreach-log');
const { routeFromContact, routeLabel } = require('./lead-route');
const {
  DEFAULT_MAX_WAIT_MS,
  buildScreenshotPath,
  normalizeLeadUrl,
  planFieldAssignments,
  siteUrlForLead,
} = require('./contact-form-core');
const { ADAPTERS, selectAdapter } = require('./form-adapters');

const DEFAULT_NAME = 'Thomas';
const DEFAULT_COMPANY = '3DVR';
const DEFAULT_EMAIL = process.env.THREEDVR_OUTREACH_EMAIL || '3dvr.tech@gmail.com';
const DEFAULT_PHONE = process.env.THREEDVR_OUTREACH_PHONE || '';

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (firstError) {
    try {
      return require('playwright-core');
    } catch {
      throw new Error('Playwright is not installed. Run `npm install playwright` or `npm install playwright-core`.');
    }
  }
}

function resolveBrowserExecutablePath(runtime = {}) {
  const explicit = runtime.executablePath
    || process.env.THREEDVR_PLAYWRIGHT_EXECUTABLE_PATH
    || process.env.PLAYWRIGHT_CHROMIUM_PATH
    || '';
  if (explicit) {
    return explicit;
  }

  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function usage() {
  console.log(`Usage:
  ask-form ["Business Name"] [--name "Business Name"] [--dry-run] [--submit] [--offer] [--mark] [--template]

Examples:
  ask-form "Dark Horse Coffee Roasters"
  ask-form --dry-run "Dark Horse Coffee Roasters"
  ask-form --submit "Dark Horse Coffee Roasters"

Dry run previews the form route and draft without launching a browser.

Environment:
  THREEDVR_LEADS_FILE       leads CSV path
  THREEDVR_OUTREACH_EMAIL   email address to place in the form
  THREEDVR_OUTREACH_PHONE   optional phone number to place in the form
  THREEDVR_FORM_MAX_WAIT_MS max wait time for page navigation and actions`);
}

function parseArgs(argv) {
  const options = {
    name: '',
    dryRun: false,
    submit: false,
    offer: false,
    mark: false,
    template: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--name') {
      options.name = argv[++index] || '';
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--submit') {
      options.submit = true;
    } else if (arg === '--offer') {
      options.offer = true;
    } else if (arg === '--mark') {
      options.mark = true;
    } else if (arg === '--template') {
      options.template = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (!arg.startsWith('-') && !options.name) {
      options.name = [arg, ...argv.slice(index + 1)].join(' ');
      break;
    } else if (!arg.startsWith('-')) {
      options.name = [options.name, arg].filter(Boolean).join(' ');
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function routeLabelForLead(lead) {
  return routeLabel(routeFromContact({ contact: lead.contact || '', link: lead.link || '', variant: lead.variant || '' }));
}

function pickLead(rows, name = '') {
  const named = normalizeText(name);
  if (named) {
    return rows.find((row) => row.name === named) || null;
  }

  const ranked = rows
    .filter((row) => row.status === 'new' && (row.contact || row.link))
    .map((row, index) => ({
      row,
      index,
      priority: (() => {
        const route = routeLabelForLead(row);
        if (route === 'form') return 40;
        if (route === 'contact-page') return 30;
        if (route === 'site') return 20;
        if (route === 'email') return 10;
        return 0;
      })(),
    }))
    .sort((left, right) => right.priority - left.priority || right.index - left.index);

  return ranked[0]?.row || null;
}

async function buildLeadMessageDraft(lead, options = {}) {
  if (options.offer) {
    return {
      source: 'manual-offer',
      text: `${lead.name ? `Hi ${lead.name} team,\n\n` : ''}I'm Thomas with 3DVR. We help small businesses clean up websites and follow-up systems so the next step is clearer.\n\nIs there anything in your current process that feels harder than it should right now?\n\nThomas\n3DVR`,
    };
  }

  const draft = await buildOutreachDraft({
    name: lead.name,
    site: lead.link,
    contact: lead.contact,
  }, {
    mode: options.messageMode,
  });
  return draft;
}

async function buildLeadMessage(lead, options = {}) {
  const draft = await buildLeadMessageDraft(lead, options);
  return draft.text;
}

async function fillContactForm(page, lead, message, options = {}) {
  const targetUrl = options.targetUrl || siteUrlForLead(lead);
  const maxWaitMs = options.maxWaitMs || DEFAULT_MAX_WAIT_MS;
  if (!targetUrl) {
    throw new Error(`No usable page URL for ${lead.name}. Use ask-send for direct email leads.`);
  }

  if (typeof page.goto === 'function') {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: maxWaitMs });
  }

  const html = typeof page.content === 'function' ? await page.content() : '';
  const adapter = options.adapter || selectAdapter({ pageUrl: targetUrl, html, lead });
  if (!adapter) {
    throw new Error(`No supported form adapter found for ${targetUrl}`);
  }

  const result = await adapter.fill({
    page,
    lead,
    message,
    options: {
      ...options,
      targetUrl,
      leadSiteUrl: lead.link || lead.contact || '',
      maxWaitMs,
      submit: Boolean(options.submit),
    },
  });

  return {
    ...result,
    adapterId: result.adapterId || adapter.id,
  };
}

async function runFormCommand(argv = process.argv.slice(2), runtime = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    usage();
    return 0;
  }

  const leadsFile = process.env.THREEDVR_LEADS_FILE || path.join(__dirname, '..', 'leads.csv');
  const { rows } = readRows(leadsFile);
  const lead = pickLead(rows, options.name);
  if (!lead) {
    throw new Error('No usable lead found for form outreach.');
  }

  const draft = await buildLeadMessageDraft(lead, {
    offer: options.offer,
    messageMode: options.template ? 'template' : undefined,
  });
  const message = draft.text;
  const pageUrl = siteUrlForLead(lead);
  if (!pageUrl) {
    throw new Error(`Lead "${lead.name}" does not include a page URL to open.`);
  }

  const route = routeLabelForLead({ ...lead, contact: pageUrl });
  if (options.dryRun && !runtime.page && !runtime.browser && !runtime.context) {
    console.log('FORM PREVIEW');
    console.log(`Name: ${lead.name}`);
    console.log(`Site: ${lead.link}`);
    console.log(`Contact: ${lead.contact}`);
    console.log(`Route: ${route}`);
    console.log(`Adapter: preview`);
    console.log(`Target: ${pageUrl}`);
    console.log('Mode: preview');
    console.log();
    console.log(message);
    console.log();
    console.log('Filled fields: none');
    console.log('Screenshot: not captured');
    console.log('Submitted: no');
    return {
      adapterId: 'preview',
      route,
      targetUrl: pageUrl,
      screenshotPath: '',
      filled: [],
      submitted: false,
      preview: true,
    };
  }

  let browser = runtime.browser || null;
  let context = runtime.context || null;
  let page = runtime.page || null;

  if (!page) {
    const browserTool = runtime.playwright || loadPlaywright();
    const executablePath = resolveBrowserExecutablePath(runtime);
    const headlessEnv = process.env.THREEDVR_PLAYWRIGHT_HEADLESS;
    const defaultHeadless = headlessEnv === undefined
      ? true
      : !/^(0|false|no|off)$/i.test(String(headlessEnv).trim());
    try {
      browser = browser || await browserTool.chromium.launch({
        headless: runtime.headless !== undefined ? runtime.headless : defaultHeadless,
        executablePath: executablePath || undefined,
        args: runtime.args || ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } catch (error) {
      throw new Error([
        'Unable to launch a browser for ask-form.',
        'Install the full `playwright` package and browser binaries, or use `ask-form --dry-run` for a preview-only run.',
        executablePath ? `Configured executable path: ${executablePath}` : '',
        error?.message ? `Underlying error: ${error.message}` : '',
      ].filter(Boolean).join(' '));
    }
    context = context || await browser.newContext();
    page = await context.newPage();
  }

  const result = await fillContactForm(page, lead, message, {
    submit: options.submit && !options.dryRun,
    targetUrl: pageUrl,
    screenshotPath: runtime.screenshotPath,
    adapter: runtime.adapter,
    allowThirdPartyForm: route === 'form',
    draftSource: draft.source,
  });

  console.log('FORM READY');
  console.log(`Name: ${lead.name}`);
  console.log(`Site: ${lead.link}`);
  console.log(`Contact: ${lead.contact}`);
  console.log(`Route: ${result.route}`);
  console.log(`Adapter: ${result.adapterId || 'generic-html-form'}`);
  console.log(`Target: ${result.targetUrl}`);
  console.log(`Mode: ${options.submit && !options.dryRun ? 'submit' : 'review'}`);
  console.log();
  console.log(message);
  console.log();
  console.log(`Filled fields: ${result.filled.map((item) => `${item.role} -> ${item.label}`).join(', ') || 'none'}`);
  console.log(`Screenshot: ${result.screenshotPath}`);
  if (result.submitted) {
    console.log('Submitted: yes');
  } else {
    console.log('Submitted: no');
  }
  if (route !== 'form') {
    console.log(`Lead route: ${route}`);
  }

  if (options.mark && result.submitted && runtime.markLead !== false) {
    const track = runtime.track || path.join(__dirname, '..', 'scripts', 'ask-track');
    execFileSync(track, ['contact', lead.name, 'route=form'], { stdio: 'inherit' });
  }

  if (result.submitted) {
    appendOutreachLog({
      kind: 'form',
      status: 'submitted',
      source: draft.source || 'unknown',
      name: lead.name,
      site: lead.link,
      contact: lead.contact,
      route: result.route,
      body: message,
      adapter: result.adapterId || '',
      targetUrl: result.targetUrl,
      screenshotPath: result.screenshotPath,
      submitted: true,
      note: options.mark ? 'marked-contacted' : '',
    });
  }

  if (!runtime.browser && browser && typeof browser.close === 'function') {
    await browser.close();
  }
  if (!runtime.context && context && typeof context.close === 'function') {
    await context.close();
  }

  return result;
}

module.exports = {
  ADAPTERS,
  buildLeadMessage,
  buildLeadMessageDraft,
  buildScreenshotPath,
  fillContactForm,
  loadPlaywright,
  normalizeLeadUrl,
  normalizeText,
  parseArgs,
  pickLead,
  planFieldAssignments,
  resolveBrowserExecutablePath,
  routeLabelForLead,
  runFormCommand,
  selectAdapter,
  siteUrlForLead,
};

if (require.main === module) {
  runFormCommand().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
