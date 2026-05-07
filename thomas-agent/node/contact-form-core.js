const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_NAME = 'Thomas';
const DEFAULT_FIRST_NAME = 'Thomas';
const DEFAULT_LAST_NAME = 'Stephens';
const DEFAULT_COMPANY = '3DVR';
const DEFAULT_EMAIL = process.env.THREEDVR_OUTREACH_EMAIL || '3dvr.tech@gmail.com';
const DEFAULT_PHONE = process.env.THREEDVR_OUTREACH_PHONE || '';
const DEFAULT_NEW_CLIENT = 'Yes';
const DEFAULT_MAX_WAIT_MS = Number(process.env.THREEDVR_FORM_MAX_WAIT_MS || 15000);

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

function normalizeLeadUrl(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (/^(https?:\/\/|file:\/\/|data:)/i.test(text)) return text;
  return '';
}

function siteUrlForLead(lead) {
  return normalizeLeadUrl(lead.contact) || normalizeLeadUrl(lead.link);
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

function elementIsVisible(element) {
  if (element.hidden) return false;
  if (element.getAttribute?.('type') === 'hidden') return false;
  if (element.getAttribute?.('aria-hidden') === 'true') return false;
  if (typeof element.getClientRects !== 'function') return true;
  return element.getClientRects().length > 0;
}

function scoreDescriptorForTarget(descriptor, target) {
  if (descriptor.disabled) return Number.NEGATIVE_INFINITY;
  if (descriptor.readonly && target !== 'message') return Number.NEGATIVE_INFINITY;
  if (/^(checkbox|radio)$/i.test(descriptor.type || '') && target !== 'consent' && target !== 'submit') {
    return Number.NEGATIVE_INFINITY;
  }

  const text = textForDescriptor(descriptor);
  let score = 0;

  if (/password|file|credit card|card number|card|payment|login|sign in|account/i.test(text)) {
    return Number.NEGATIVE_INFINITY;
  }

  if (descriptor.tag === 'select' && target !== 'consent' && target !== 'submit') {
    const selectTargetHints = {
      firstName: /first name|given name|forename|first/i,
      lastName: /last name|surname|family name|last/i,
      name: /full name|your name|contact name|name/i,
      email: /email|e-mail/i,
      company: /company|business|organization|organisation|firm|company name/i,
      phone: /phone|telephone|mobile|cell|tel/i,
      message: /message|comments?|enquir|inquir|details?|how can we help|tell us/i,
      newClient: /new client|new customer|existing client|returning client|customer status/i,
    };
    if (!selectTargetHints[target]?.test(text)) {
      return Number.NEGATIVE_INFINITY;
    }
  }

  if (target === 'firstName') {
    if (/phone|telephone|mobile|cell|fax/i.test(text)) return Number.NEGATIVE_INFINITY;
    if (/first name|given name|forename|first/i.test(text)) score += 70;
    if (/autocomplete given-name/.test(text) || descriptor.autocomplete === 'given-name' || descriptor.autocomplete === 'name') score += 30;
  } else if (target === 'lastName') {
    if (/phone|telephone|mobile|cell|fax/i.test(text)) return Number.NEGATIVE_INFINITY;
    if (/last name|surname|family name|last/i.test(text)) score += 70;
    if (/autocomplete family-name/.test(text) || descriptor.autocomplete === 'family-name') score += 30;
  } else if (target === 'name') {
    if (/first name|last name|surname|family name|phone|telephone|mobile|cell|fax/i.test(text)) return 0;
    if (/full name|your name|contact name|name/i.test(text)) score += 60;
    if (/autocomplete name/.test(text) || descriptor.autocomplete === 'name') score += 30;
  } else if (target === 'email') {
    if (/phone|telephone|mobile|cell|fax/i.test(text)) return 0;
    if (/email|e-mail/i.test(text)) score += 60;
    if (descriptor.type === 'email' || descriptor.autocomplete === 'email') score += 35;
    if (/placeholder/.test(text)) score += 5;
  } else if (target === 'company') {
    if (!/company|business|organization|organisation|firm/i.test(text)) return 0;
    if (/phone|telephone|mobile|cell|fax/i.test(text)) return 0;
    if (/company|business|organization|organisation|firm|company name/i.test(text)) score += 60;
    if (descriptor.autocomplete === 'organization') score += 25;
  } else if (target === 'phone') {
    if (/email|e-mail/i.test(text)) return 0;
    if (/phone|telephone|mobile|cell|tel/i.test(text)) score += 60;
    if (descriptor.type === 'tel' || descriptor.autocomplete === 'tel') score += 35;
  } else if (target === 'message') {
    if (/message|comments?|enquir|inquir|details?|how can we help|tell us/i.test(text)) score += 70;
    if (descriptor.tag === 'textarea') score += 35;
    if (/textarea/.test(text)) score += 20;
  } else if (target === 'submit') {
    if (/send|submit|contact|request|book|continue|apply|next|send message/i.test(text)) score += 80;
    if (descriptor.type === 'submit') score += 30;
  } else if (target === 'consent') {
    if (/terms|consent|agree|opt in|optin|privacy|disclaimer/i.test(text)) score += 80;
    if (/checkbox|radio/i.test(descriptor.type || '')) score += 20;
  } else if (target === 'newClient') {
    if (/new client|new customer|existing client|returning client|customer status/i.test(text)) score += 80;
    if (descriptor.tag === 'select') score += 25;
    if (/checkbox|radio/i.test(descriptor.type || '')) score += 20;
  }

  if (/^input/.test(descriptor.tag) && target === 'message') score -= 10;
  if (/first name|last name/i.test(text) && target !== 'name') score -= 20;
  if (descriptor.required && score > 0) score += 5;
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
    visible: elementIsVisible(element),
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
    visible: !element.hidden
      && element.getAttribute('type') !== 'hidden'
      && element.getAttribute('aria-hidden') !== 'true'
      && (typeof element.getClientRects !== 'function' || element.getClientRects().length > 0),
  })));
}

function planFieldAssignments(fields, lead, message) {
  const hasSplitNameFields = fields.some((field) => field.visible !== false && (scoreDescriptorForTarget(field, 'firstName') > 0 || scoreDescriptorForTarget(field, 'lastName') > 0));
  const targets = [];

  if (hasSplitNameFields) {
    targets.push(
      { key: 'firstName', value: DEFAULT_FIRST_NAME },
      { key: 'lastName', value: DEFAULT_LAST_NAME },
    );
  } else {
    targets.push({ key: 'name', value: DEFAULT_NAME });
  }

  targets.push(
    { key: 'email', value: DEFAULT_EMAIL },
    { key: 'company', value: DEFAULT_COMPANY },
    { key: 'phone', value: DEFAULT_PHONE },
    { key: 'message', value: message },
    { key: 'newClient', value: DEFAULT_NEW_CLIENT },
  );

  const assignments = [];
  const usedIndexes = new Set();

  for (const target of targets) {
    if (!target.value) continue;
    let best = null;

    for (const field of fields) {
      if (field.visible === false) continue;
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

  for (const field of fields) {
    if (field.visible === false) continue;
    if (usedIndexes.has(field.index)) continue;
    if (!/^(checkbox|radio)$/i.test(field.type || '')) continue;
    const score = scoreDescriptorForTarget(field, 'consent');
    if (score <= 0) continue;
    assignments.push({
      index: field.index,
      role: 'consent',
      kind: 'check',
      value: true,
      label: field.labelText || field.ariaLabel || field.placeholder || field.name || field.id || field.tag,
    });
    usedIndexes.add(field.index);
    break;
  }

  const unmatchedRequired = fields.filter((field) => field.required && field.visible !== false && !usedIndexes.has(field.index));

  return {
    assignments,
    unmatchedRequired,
  };
}

function planSubmitControl(fields) {
  let best = null;
  for (const field of fields) {
    if (field.visible === false) continue;
    const score = scoreDescriptorForTarget(field, 'submit');
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { ...field, score };
    }
  }
  return best;
}

function hasDangerFields(fields) {
  return fields.some((field) => field.visible !== false && /password|file|credit card|card number|payment|login|sign in|account/i.test(textForDescriptor(field)));
}

function sameHost(left, right) {
  try {
    const normalizeHost = (value) => new URL(value).hostname.replace(/^www\./, '').toLowerCase();
    return normalizeHost(left) === normalizeHost(right);
  } catch {
    return false;
  }
}

async function buildScreenshotPath(leadName, screenshotPath) {
  if (screenshotPath) return screenshotPath;
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), '3dvr-form-'));
  return path.join(dir, `${cleanCsvField(leadName || 'lead').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'lead'}.png`);
}

module.exports = {
  DEFAULT_COMPANY,
  DEFAULT_EMAIL,
  DEFAULT_MAX_WAIT_MS,
  DEFAULT_NAME,
  DEFAULT_FIRST_NAME,
  DEFAULT_LAST_NAME,
  DEFAULT_NEW_CLIENT,
  DEFAULT_PHONE,
  buildScreenshotPath,
  cleanCsvField,
  hasDangerFields,
  inspectDescriptorFromElement,
  inspectFormFields,
  normalizeLeadUrl,
  normalizeText,
  planFieldAssignments,
  planSubmitControl,
  sameHost,
  scoreDescriptorForTarget,
  siteUrlForLead,
  textForDescriptor,
};
