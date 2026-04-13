export const CONTACT_IMPORT_ACCEPT = '.csv,.vcf,text/csv,text/vcard,text/x-vcard';
export const CONTACT_PICKER_PROPERTIES = Object.freeze(['name', 'email', 'tel']);

function normalizeText(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

function firstFilledValue(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeText(entry);
      if (normalized) return normalized;
    }
    return '';
  }
  return normalizeText(value);
}

function safeTimestamp(now = new Date()) {
  if (typeof now === 'string' && normalizeText(now)) {
    return now;
  }
  const date = now instanceof Date ? now : new Date(now);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function createImportId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function mergeCommaSeparatedValues(...values) {
  const seen = new Set();
  const output = [];
  values.forEach(value => {
    String(value || '')
      .split(/[,\n;]/)
      .map(token => token.trim())
      .filter(Boolean)
      .forEach(token => {
        const key = token.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        output.push(token);
      });
  });
  return output.join(', ');
}

function deriveDisplayName(raw = {}) {
  const name = normalizeText(raw.name);
  if (name) return name;

  const firstName = normalizeText(raw.firstName);
  const lastName = normalizeText(raw.lastName);
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (combined) return combined;

  const email = normalizeText(raw.email);
  if (email.includes('@')) {
    return email.split('@')[0];
  }

  return normalizeText(raw.phone);
}

function normalizeTagValue(value = '') {
  return mergeCommaSeparatedValues(String(value || '').replace(/\s*:::\s*/g, ', '));
}

function normalizePhoneValue(value = '') {
  return firstFilledValue(value);
}

function normalizeEmailValue(value = '') {
  return firstFilledValue(value);
}

export function normalizeImportedContact(raw = {}, options = {}) {
  const now = safeTimestamp(options.now);
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : createImportId;
  const name = deriveDisplayName(raw);
  const email = normalizeEmailValue(raw.email);
  const phone = normalizePhoneValue(raw.phone || raw.tel);
  if (!(name || email || phone)) {
    return null;
  }

  return {
    id: normalizeText(raw.id) || idFactory(),
    name,
    email,
    phone,
    company: firstFilledValue(raw.company || raw.organization),
    role: firstFilledValue(raw.role || raw.title),
    tags: normalizeTagValue(raw.tags || raw.categories),
    status: normalizeText(raw.status),
    nextFollowUp: normalizeText(raw.nextFollowUp),
    notes: normalizeText(raw.notes || raw.note),
    created: normalizeText(raw.created) || now,
    updated: normalizeText(raw.updated) || now,
    lastContacted: normalizeText(raw.lastContacted),
    activityCount: Number.isFinite(Number(raw.activityCount)) ? Number(raw.activityCount) : 0,
    source: normalizeText(options.source || raw.source),
  };
}

export function buildImportMatchKeys(record = {}) {
  const output = [];
  const email = normalizeEmailValue(record.email).toLowerCase();
  if (email) {
    output.push(`email:${email}`);
  }

  const phoneDigits = normalizePhoneValue(record.phone || record.tel).replace(/\D+/g, '');
  if (phoneDigits) {
    output.push(`phone:${phoneDigits}`);
  }

  const name = deriveDisplayName(record).toLowerCase();
  const company = firstFilledValue(record.company || record.organization).toLowerCase();
  if (name) {
    output.push(`name:${name}`);
  }
  if (name && company) {
    output.push(`name-company:${name}::${company}`);
  }

  return output;
}

export function buildImportedCrmRecord(raw = {}, options = {}) {
  const imported = normalizeImportedContact(raw, options);
  if (!imported) return null;
  const timestamp = normalizeText(imported.updated) || safeTimestamp(options.now);

  return {
    id: normalizeText(options.recordId) || imported.id,
    recordType: 'person',
    name: imported.name,
    email: imported.email,
    phone: imported.phone,
    company: imported.company,
    role: imported.role,
    tags: mergeCommaSeparatedValues(imported.tags, options.tags || 'source/phone-import'),
    status: normalizeText(options.status) || 'Warm - Awareness',
    warmth: normalizeText(options.warmth) || 'warm',
    fit: normalizeText(options.fit),
    urgency: normalizeText(options.urgency),
    nextFollowUp: normalizeText(options.nextFollowUp),
    notes: imported.notes,
    created: normalizeText(options.created) || imported.created || timestamp,
    updated: timestamp,
    lastContacted: normalizeText(options.lastContacted),
    activityCount: Number.isFinite(Number(options.activityCount)) ? Number(options.activityCount) : 0,
    source: normalizeText(options.source) || imported.source || 'Phone import',
    contactId: normalizeText(options.contactId),
    nextBestAction: normalizeText(options.nextBestAction) || 'Review fit and draft the first outreach.',
    objection: normalizeText(options.objection),
    lastSignal: normalizeText(options.lastSignal) || 'Imported from phone contacts',
    replyCount: Number.isFinite(Number(options.replyCount)) ? Number(options.replyCount) : 0,
    lastReplyAt: normalizeText(options.lastReplyAt),
  };
}

const CRM_CONTACT_LINK_TAG = 'source/contacts-workspace';
const SUPPORTED_CRM_STATUSES = new Set([
  'Warm - Awareness',
  'Warm - Discovery',
  'Warm - Invited',
  'Warm - Follow-up',
  'Lead',
  'Prospect',
  'Active',
  'Negotiating',
  'Won',
  'Lost',
]);

function normalizeLinkedCrmStatus(value = '') {
  const normalized = normalizeText(value);
  return SUPPORTED_CRM_STATUSES.has(normalized) ? normalized : 'Warm - Awareness';
}

function deriveWarmthFromStatus(status = '') {
  const normalized = normalizeText(status).toLowerCase();
  if (normalized === 'active' || normalized === 'negotiating' || normalized === 'won') {
    return 'hot';
  }
  if (normalized === 'lead' || normalized === 'prospect' || normalized === 'lost') {
    return 'cold';
  }
  return 'warm';
}

export function buildContactCrmRecord(raw = {}, options = {}) {
  const imported = normalizeImportedContact(raw, options);
  if (!imported) return null;

  const status = normalizeLinkedCrmStatus(options.status || imported.status);
  const tags = mergeCommaSeparatedValues(imported.tags, options.tags || CRM_CONTACT_LINK_TAG);

  return buildImportedCrmRecord(imported, {
    ...options,
    status,
    warmth: normalizeText(options.warmth) || deriveWarmthFromStatus(status),
    tags,
    nextFollowUp: normalizeText(options.nextFollowUp) || imported.nextFollowUp,
    notes: normalizeText(options.notes) || imported.notes,
    created: normalizeText(options.created) || imported.created,
    lastContacted: normalizeText(options.lastContacted) || imported.lastContacted,
    activityCount: Number.isFinite(Number(options.activityCount))
      ? Number(options.activityCount)
      : imported.activityCount,
    nextBestAction: normalizeText(options.nextBestAction) || 'Review the contact and draft the next outreach.',
    lastSignal: normalizeText(options.lastSignal) || 'Linked from contacts workspace',
    source: normalizeText(options.source) || imported.source || 'Contacts workspace',
    contactId: normalizeText(options.contactId) || imported.id,
  });
}

function decodeQuotedPrintable(value = '') {
  const source = String(value || '').replace(/=\r?\n/g, '');
  const bytes = [];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '=' && /^[0-9A-F]{2}$/i.test(source.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(source.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(source.charCodeAt(index));
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

export function decodeVCard(value = '', metadata = '') {
  let result = String(value || '');
  if (/ENCODING=QUOTED-PRINTABLE/i.test(metadata)) {
    result = decodeQuotedPrintable(result);
  }
  return result
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function unfoldVCard(cardText = '') {
  const lines = String(cardText || '').split(/\r?\n/);
  const output = [];
  lines.forEach(line => {
    if (!line) return;
    if ((line.startsWith(' ') || line.startsWith('\t')) && output.length) {
      output[output.length - 1] += line.slice(1);
      return;
    }
    output.push(line);
  });
  return output;
}

function parseStructuredName(value = '') {
  const [lastName, firstName] = String(value || '').split(';').map(part => part.trim());
  return {
    firstName: firstName || '',
    lastName: lastName || '',
  };
}

function normalizeVCardPropertyName(keyPart = '') {
  const rawKey = normalizeText(keyPart).split(';')[0] || '';
  return rawKey.split('.').pop().toUpperCase();
}

export function parseVCard(text = '', options = {}) {
  const cards = String(text || '').match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) || [];
  return cards
    .map(card => {
      const data = { emails: [], phones: [], tags: '' };
      unfoldVCard(card).forEach(line => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex === -1) return;
        const keyPart = line.slice(0, separatorIndex);
        const value = line.slice(separatorIndex + 1);
        const propertyName = normalizeVCardPropertyName(keyPart);
        const decoded = decodeVCard(value, keyPart);

        if (propertyName === 'FN' && !data.name) {
          data.name = decoded;
        }
        if (propertyName === 'N' && !data.name) {
          Object.assign(data, parseStructuredName(decoded));
        }
        if (propertyName === 'EMAIL' && decoded) {
          data.emails.push(decoded);
        }
        if (propertyName === 'TEL' && decoded) {
          data.phones.push(decoded);
        }
        if (propertyName === 'ORG' && !data.company) {
          data.company = decoded.split(';').map(part => part.trim()).filter(Boolean)[0] || '';
        }
        if ((propertyName === 'TITLE' || propertyName === 'ROLE') && !data.role) {
          data.role = decoded;
        }
        if (propertyName === 'NOTE') {
          data.notes = data.notes ? `${data.notes}\n\n${decoded}` : decoded;
        }
        if (propertyName === 'CATEGORIES') {
          data.tags = mergeCommaSeparatedValues(data.tags, decoded);
        }
      });

      data.email = firstFilledValue(data.emails);
      data.phone = firstFilledValue(data.phones);
      return normalizeImportedContact(data, options);
    })
    .filter(Boolean);
}

export function csvSplit(line = '') {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current.trim());
  return result;
}

export function parseCSVContacts(text = '', options = {}) {
  const rows = String(text || '')
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0);
  if (!rows.length) return [];

  const columns = csvSplit(rows.shift())
    .map(value => value.trim().toLowerCase());

  return rows
    .map(row => {
      const values = csvSplit(row);
      const data = {};

      columns.forEach((column, index) => {
        const value = values[index] || '';
        const normalizedColumn = column.replace(/\s+\d+\s*-\s*/g, ' ').trim();
        if (['name', 'full name'].includes(normalizedColumn)) data.name = value;
        if (['first name', 'firstname', 'given name'].includes(normalizedColumn)) data.firstName = value;
        if (['last name', 'lastname', 'surname', 'family name'].includes(normalizedColumn)) data.lastName = value;
        if (normalizedColumn.includes('email') || normalizedColumn.includes('e-mail')) data.email = value;
        if (
          normalizedColumn.includes('phone')
          || normalizedColumn.includes('mobile')
          || normalizedColumn.includes('telephone')
        ) {
          data.phone = value;
        }
        if (
          ['company', 'organization', 'organisation', 'org', 'organization name', 'organisation name']
            .includes(normalizedColumn)
        ) {
          data.company = value;
        }
        if (
          ['title', 'job title', 'position', 'role', 'organization title', 'organisation title']
            .includes(normalizedColumn)
        ) {
          data.role = value;
        }
        if (normalizedColumn.includes('note')) data.notes = value;
        if (normalizedColumn.includes('tag') || normalizedColumn.includes('label') || normalizedColumn.includes('group membership')) {
          data.tags = mergeCommaSeparatedValues(data.tags, value);
        }
      });

      return normalizeImportedContact(data, options);
    })
    .filter(Boolean);
}

export function parseContactFileText(text = '', filename = '', options = {}) {
  const lowerName = String(filename || '').toLowerCase();
  if (lowerName.endsWith('.vcf') || /BEGIN:VCARD/i.test(text)) {
    return parseVCard(text, options);
  }
  return parseCSVContacts(text, options);
}

export function supportsDeviceContactPicker(navigatorLike = globalThis.navigator) {
  return Boolean(
    navigatorLike
    && navigatorLike.contacts
    && typeof navigatorLike.contacts.select === 'function'
  );
}

export function normalizePickedContacts(entries = [], options = {}) {
  return (Array.isArray(entries) ? entries : [])
    .map(entry => normalizeImportedContact({
      name: firstFilledValue(entry?.name),
      email: firstFilledValue(entry?.email),
      phone: firstFilledValue(entry?.tel || entry?.phone),
      company: firstFilledValue(entry?.organization || entry?.company),
      role: firstFilledValue(entry?.role || entry?.title),
      source: options.source || 'Phone import',
    }, options))
    .filter(Boolean);
}

export async function pickDeviceContacts({
  navigatorLike = globalThis.navigator,
  multiple = true,
  source = 'Phone import',
  now,
  idFactory,
} = {}) {
  if (!supportsDeviceContactPicker(navigatorLike)) {
    throw new Error('Phone contact picker is not available in this browser.');
  }

  const selected = await navigatorLike.contacts.select(CONTACT_PICKER_PROPERTIES, { multiple });
  return normalizePickedContacts(selected, { source, now, idFactory });
}
