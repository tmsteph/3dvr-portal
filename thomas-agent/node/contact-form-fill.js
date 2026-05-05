const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const { buildOutreachDraft } = require('./outreach-draft');
const { readRows } = require('./lead-enrich');
const { routeFromContact, routeLabel } = require('./lead-route');

const DEFAULT_NAME = 'Thomas';
const DEFAULT_COMPANY = '3DVR';
const DEFAULT_EMAIL = process.env.THREEDVR_OUTREACH_EMAIL || '3dvr.tech@gmail.com';
const DEFAULT_PHONE = process.env.THREEDVR_OUTREACH_PHONE || '';
const DEFAULT_MAX_WAIT_MS = Number(process.env.THREEDVR_FORM_MAX_WAIT_MS || 15000);

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

function normalizeText(value) {
  return String(value || '').trim();
}

function usage() {
  console.log(`Usage:
  ask-form ["Business Name"] [--name "Business Name"] [--dry-run] [--submit] [--offer] [--mark]

Examples:
  ask-form "Dark Horse Coffee Roasters"
  ask-form --dry-run "Dark Horse Coffee Roasters"
  ask-form --submit "Dark Horse Coffee Roasters"

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

function cleanCsvField(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLeadUrl(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (/^(https?:\/\/|file:\/\/|data:)/i.test(text)) return text;
  return '';
}

function siteUrlForLead(lead) {
  return normalizeLeadUrl(lead.contact) || normalizeLeadUrl(lead.link);
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
      route: routeLabelForLead(row),
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

function buildOutreachMessage(lead, options = {}) {
  const mode = options.offer ? 'offer' : 'opener';
  if (mode === 'offer') {
    return Promise.resolve(`${lead.name ? `Hi ${lead.name} team,\n\n` : ''}I'm Thomas with 3DVR. We help small businesses clean up websites and follow-up systems so the next step is clearer.\n\nIs there anything in your current process that feels harder than it should right now?\n\nThomas\n3DVR`);
  }

  return buildOutreachDraft({
    name: lead.name,
    site: lead.link,
    contact: lead.contact,
  }).then((draft) => draft.text);
}

function textForDescriptor(descriptor) {
  return [
    descriptor.labelText,
    descriptor.ariaLabel,
    descriptor.placeholder,
    descriptor.name,
    descriptor.id,
    descriptor.autocomplete,
    descriptor.type,
    descriptor.tag,
  ].filter(Boolean).join(' ').toLowerCase();
}

function scoreDescriptorForTarget(descriptor, target) {
  if (descriptor.disabled) return Number.NEGATIVE_INFINITY;
  if (descriptor.readonly && target !== 'message') return Number.NEGATIVE_INFINITY;

  const text = textForDescriptor(descriptor);
  let score = 0;

  if (/password|file|credit card|card number|card|payment|login|sign in|account/i.test(text)) {
    return Number.NEGATIVE_INFINITY;
  }

  if (target === 'name') {
    if (/first name|last name|surname|family name/i.test(text)) return 0;
    if (/full name|your name|contact name|name/i.test(text)) score += 60;
    if (/autocomplete name/.test(text) || descriptor.autocomplete === 'name') score += 30;
    if (descriptor.tag === 'input' || descriptor.tag === 'textarea') score += 10;
  } else if (target === 'email') {
    if (/email|e-mail/i.test(text)) score += 60;
    if (descriptor.type === 'email' || descriptor.autocomplete === 'email') score += 35;
    if (/placeholder/.test(text)) score += 5;
  } else if (target === 'company') {
    if (/company|business|organization|organisation|firm|company name/i.test(text)) score += 60;
    if (descriptor.autocomplete === 'organization') score += 25;
  } else if (target === 'phone') {
    if (/phone|telephone|mobile|cell|tel/i.test(text)) score += 60;
    if (descriptor.type === 'tel' || descriptor.autocomplete === 'tel') score += 35;
  } else if (target === 'message') {
    if (/message|comments?|enquir|inquir|details?|how can we help|tell us/i.test(text)) score += 70;
    if (descriptor.tag === 'textarea') score += 35;
    if (/textarea/.test(text)) score += 20;
  } else if (target === 'submit') {
    if (/send|submit|contact|request|book|continue|apply|next|send message/i.test(text)) score += 80;
    if (descriptor.type === 'submit') score += 30;
  }

  if (/^input/.test(descriptor.tag) && target === 'message') score -= 10;
  if (/first name|last name/i.test(text) && target !== 'name') score -= 20;
  if (descriptor.required) score += 5;
  return score;
}

function inspectDescriptorFromElement(element, index) {
  const labelText = element.labels ? Array.from(element.labels).map((label) => label.textContent || '').join(' ').trim() : '';
  return {
    index,
    tag: String(element.tagName || '').toLowerCase(),
    type: String(element.getAttribute?.('type') || '').toLowerCase(),
    name: String(element.getAttribute?.('name') || ''),
    id: String(element.getAttribute?.('id') || ''),
    placeholder: String(element.getAttribute?.('placeholder') || ''),
    autocomplete: String(element.getAttribute?.('autocomplete') || ''),
    ariaLabel: String(element.getAttribute?.('aria-label') || ''),
    labelText,
    required: Boolean(element.required || element.hasAttribute?.('required')),
    disabled: Boolean(element.disabled || element.hasAttribute?.('disabled')),
    readonly: Boolean(element.readOnly || element.hasAttribute?.('readonly')),
  };
}

async function inspectFormFields(page) {
  return page.locator('input, textarea, select').evaluateAll((elements) => elements.map((element, index) => ({
    index,
    tag: String(element.tagName || '').toLowerCase(),
    type: String(element.getAttribute('type') || '').toLowerCase(),
    name: String(element.getAttribute('name') || ''),
    id: String(element.getAttribute('id') || ''),
    placeholder: String(element.getAttribute('placeholder') || ''),
    autocomplete: String(element.getAttribute('autocomplete') || ''),
    ariaLabel: String(element.getAttribute('aria-label') || ''),
    labelText: element.labels ? Array.from(element.labels).map((label) => label.textContent || '').join(' ').trim() : '',
    required: Boolean(element.required || element.hasAttribute('required')),
    disabled: Boolean(element.disabled || element.hasAttribute('disabled')),
    readonly: Boolean(element.readOnly || element.hasAttribute('readonly')),
  })));
}

function planFieldAssignments(fields, lead, message) {
  const targets = [
    { key: 'name', value: DEFAULT_NAME },
    { key: 'email', value: DEFAULT_EMAIL },
    { key: 'company', value: DEFAULT_COMPANY },
    { key: 'phone', value: DEFAULT_PHONE },
    { key: 'message', value: message },
  ];

  const assignments = [];
  const usedIndexes = new Set();

  for (const target of targets) {
    if (!target.value) continue;
    let best = null;

    for (const field of fields) {
      if (usedIndexes.has(field.index)) continue;
      const score = scoreDescriptorForTarget(field, target.key);
      if (score <= 0) continue;
      if (!best || score > best.score) {
        best = { ...field, score };
      }
    }

    if (best) {
      usedIndexes.add(best.index);
      assignments.push({
        index: best.index,
        role: target.key,
        value: target.value,
        label: best.labelText || best.ariaLabel || best.placeholder || best.name || best.id || best.tag,
      });
    }
  }

  const unmatchedRequired = fields.filter((field) => field.required && !usedIndexes.has(field.index));

  return {
    assignments,
    unmatchedRequired,
  };
}

function planSubmitControl(fields) {
  let best = null;
  for (const field of fields) {
    const score = scoreDescriptorForTarget(field, 'submit');
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { ...field, score };
    }
  }
  return best;
}

function hasDangerFields(fields) {
  return fields.some((field) => /password|file|credit card|card number|payment|login|sign in|account/i.test(textForDescriptor(field)));
}

function sameHost(left, right) {
  try {
    return new URL(left).host === new URL(right).host;
  } catch {
    return false;
  }
}

async function fillContactForm(page, lead, message, options = {}) {
  const targetUrl = options.targetUrl || siteUrlForLead(lead);
  if (!targetUrl) {
    throw new Error(`No usable page URL for ${lead.name}. Use ask-send for direct email leads.`);
  }

  if (typeof page.goto === 'function') {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  }

  const fields = await inspectFormFields(page);
  const formCount = await page.locator('form').count();
  if (formCount === 0) {
    throw new Error(`No form found on ${targetUrl}`);
  }

  const plan = planFieldAssignments(fields, lead, message);
  const fieldLocator = page.locator('input, textarea, select');
  const filled = [];

  for (const assignment of plan.assignments) {
    const locator = fieldLocator.nth(assignment.index);
    await locator.fill(assignment.value);
    filled.push(assignment);
  }

  const screenshotPath = options.screenshotPath || await fsPromises.mkdtemp(path.join(os.tmpdir(), '3dvr-form-'))
    .then((dir) => path.join(dir, `${cleanCsvField(lead.name || 'lead').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'lead'}.png`));

  if (typeof page.screenshot === 'function') {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  const result = {
    route: 'form',
    targetUrl,
    screenshotPath,
    filled,
    submitted: false,
    blocked: '',
    unmatchedRequired: plan.unmatchedRequired,
  };

  if (!options.submit) {
    return result;
  }

  if (hasDangerFields(fields)) {
    result.blocked = 'dangerous fields present';
    throw new Error('Refusing to submit: password, payment, or file-upload fields are present.');
  }

  if (plan.unmatchedRequired.length > 0) {
    result.blocked = 'unmatched required fields';
    throw new Error(`Refusing to submit: required fields remain unknown (${plan.unmatchedRequired.map((field) => field.labelText || field.name || field.id || field.index).join(', ')})`);
  }

  if (options.leadSiteUrl && !sameHost(targetUrl, options.leadSiteUrl)) {
    result.blocked = 'third-party host';
    throw new Error(`Refusing to submit a third-party form at ${targetUrl}. Review it manually first.`);
  }

  const submitFields = await page.locator('button, input[type="submit"], input[type="button"]').evaluateAll((elements) => elements.map((element, index) => ({
    index,
    tag: String(element.tagName || '').toLowerCase(),
    type: String(element.getAttribute('type') || '').toLowerCase(),
    text: String(element.textContent || element.getAttribute('value') || '').trim(),
    ariaLabel: String(element.getAttribute('aria-label') || ''),
    name: String(element.getAttribute('name') || ''),
    id: String(element.getAttribute('id') || ''),
    labelText: element.labels ? Array.from(element.labels).map((label) => label.textContent || '').join(' ').trim() : '',
    disabled: Boolean(element.disabled || element.hasAttribute('disabled')),
  })));

  const submitPlan = planSubmitControl(submitFields);
  if (!submitPlan) {
    throw new Error(`Could not find a safe submit control on ${targetUrl}`);
  }

  await page.locator('button, input[type="submit"], input[type="button"]').nth(submitPlan.index).click();
  if (typeof page.waitForLoadState === 'function') {
    await page.waitForLoadState('networkidle', { timeout: DEFAULT_MAX_WAIT_MS }).catch(() => {});
  }
  result.submitted = true;
  return result;
}

async function buildLeadMessage(lead, options = {}) {
  if (options.offer) {
    return `${lead.name ? `Hi ${lead.name} team,\n\n` : ''}I'm Thomas with 3DVR. We help small businesses clean up websites and follow-up systems so the next step is clearer.\n\nIs there anything in your current process that feels harder than it should right now?\n\nThomas\n3DVR`;
  }

  const draft = await buildOutreachDraft({
    name: lead.name,
    site: lead.link,
    contact: lead.contact,
  });
  return draft.text;
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

  const message = await buildLeadMessage(lead, { offer: options.offer });
  const pageUrl = siteUrlForLead(lead);
  if (!pageUrl) {
    throw new Error(`Lead "${lead.name}" does not include a page URL to open.`);
  }

  const browserTool = runtime.playwright || loadPlaywright();
  const executablePath = runtime.executablePath || process.env.THREEDVR_PLAYWRIGHT_EXECUTABLE_PATH || '';
  const browser = runtime.browser || (runtime.page ? null : await browserTool.chromium.launch({
    headless: runtime.headless !== undefined ? runtime.headless : true,
    executablePath: executablePath || undefined,
  }));
  const context = runtime.context || (runtime.page ? null : await browser.newContext());
  const page = runtime.page || await context.newPage();

  const result = await fillContactForm(page, lead, message, {
    submit: options.submit && !options.dryRun,
    leadSiteUrl: lead.link || lead.contact || '',
    targetUrl: pageUrl,
    screenshotPath: runtime.screenshotPath,
  });

  const route = routeLabelForLead({ ...lead, contact: result.targetUrl });

  console.log('FORM READY');
  console.log(`Name: ${lead.name}`);
  console.log(`Site: ${lead.link}`);
  console.log(`Contact: ${lead.contact}`);
  console.log(`Route: ${result.route}`);
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

  if (!runtime.browser && browser && typeof browser.close === 'function') {
    await browser.close();
  }
  if (!runtime.context && context && typeof context.close === 'function') {
    await context.close();
  }

  return result;
}

module.exports = {
  buildLeadMessage,
  fillContactForm,
  hasDangerFields,
  inspectDescriptorFromElement,
  inspectFormFields,
  loadPlaywright,
  normalizeLeadUrl,
  parseArgs,
  pickLead,
  planFieldAssignments,
  planSubmitControl,
  routeLabelForLead,
  runFormCommand,
  scoreDescriptorForTarget,
  siteUrlForLead,
  textForDescriptor,
};

if (require.main === module) {
  runFormCommand().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
