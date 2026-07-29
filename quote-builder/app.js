import {
  QUOTE_STATUS_OPTIONS,
  buildCrmQuoteFields,
  calculateQuoteTotals,
  centsToMoney,
  normalizeQuoteItem,
  quoteFromGunData,
  quoteToGunData,
  sanitizeQuote,
} from './quote-model.js';

const gun = Gun(window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun']);
const user = gun.user();
const crmRoot = gun.get('3dvr-crm');
const quotesRoot = gun.get('3dvr-portal').get('quotes');
const crmIndex = Object.create(null);
const quoteIndex = Object.create(null);
const state = {
  id: '',
  created: '',
  paymentUrl: '',
  stripeSessionId: '',
  handledRequestedRecord: false,
};
const requestedCrmRecordId = new URLSearchParams(window.location.search).get('crmRecordId') || '';

const byId = id => document.getElementById(id);
const workspace = byId('workspace');
const signedOut = byId('signed-out');
const lineItems = byId('line-items');
const statusMessage = byId('status-message');
const paymentResult = byId('payment-result');
const paymentLink = byId('payment-link');

function stored(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function currentPub() {
  return String(user?._?.sea?.pub || user?.is?.pub || '').trim();
}

async function waitForSession(timeoutMs = 2500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (currentPub() && user?._?.sea) return true;
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }
  return false;
}

async function restoreSession() {
  const alias = stored('alias').trim();
  const password = stored('password');
  const signedIn = stored('signedIn') === 'true';

  try {
    user.recall({ sessionStorage: true, localStorage: true });
  } catch {}

  if (signedIn && alias && password && !(await waitForSession(500))) {
    await new Promise(resolve => user.auth(alias, password, () => resolve()));
  }

  const ready = signedIn && alias && await waitForSession();
  workspace.hidden = !ready;
  signedOut.hidden = ready;
  return ready;
}

function makeId(prefix = 'quote') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeReference() {
  const now = new Date();
  return `Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-5)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function put(node, data) {
  return new Promise((resolve, reject) => {
    node.put(data, ack => {
      if (ack?.err) reject(new Error(ack.err));
      else resolve(ack);
    });
  });
}

function addLineItem(item = {}) {
  const normalized = normalizeQuoteItem(item);
  const row = document.createElement('div');
  row.className = 'line-item';
  row.dataset.itemId = normalized.id;
  row.innerHTML = `
    <label class="description">Description
      <input data-field="description" maxlength="160" value="${escapeHtml(normalized.description)}" placeholder="Custom printed shirts">
    </label>
    <label>Qty
      <input data-field="quantity" type="number" min="1" step="1" value="${normalized.quantity}">
    </label>
    <label>Sale price
      <span class="money-input"><span>$</span><input data-field="unitPrice" type="number" min="0" step="0.01" value="${(normalized.unitPriceCents / 100).toFixed(2)}"></span>
    </label>
    <label>Our cost <small>private</small>
      <span class="money-input"><span>$</span><input data-field="unitCost" type="number" min="0" step="0.01" value="${(normalized.unitCostCents / 100).toFixed(2)}"></span>
    </label>
    <button class="remove-item" type="button" aria-label="Remove line item">Remove</button>
  `;
  row.querySelectorAll('input').forEach(input => input.addEventListener('input', renderPreview));
  row.querySelector('.remove-item').addEventListener('click', () => {
    row.remove();
    if (!lineItems.children.length) addLineItem();
    renderPreview();
  });
  lineItems.append(row);
}

function readItems() {
  return Array.from(lineItems.querySelectorAll('.line-item')).map(row => normalizeQuoteItem({
    id: row.dataset.itemId,
    description: row.querySelector('[data-field="description"]').value,
    quantity: row.querySelector('[data-field="quantity"]').value,
    unitPrice: row.querySelector('[data-field="unitPrice"]').value,
    unitCost: row.querySelector('[data-field="unitCost"]').value,
  }));
}

function readQuote() {
  return sanitizeQuote({
    id: state.id || makeId(),
    created: state.created,
    reference: byId('reference').value,
    crmRecordId: byId('crm-record').value,
    customerName: byId('customer-name').value,
    customerEmail: byId('customer-email').value,
    status: byId('quote-status').value,
    items: readItems(),
    taxRate: byId('tax-rate').value,
    shipping: byId('shipping').value,
    artworkNotes: byId('artwork-notes').value,
    terms: byId('terms').value,
    paymentUrl: state.paymentUrl,
    stripeSessionId: state.stripeSessionId,
  });
}

function renderPreview() {
  const quote = readQuote();
  const totals = calculateQuoteTotals(quote);
  byId('preview-reference').textContent = quote.reference || 'Draft quote';
  byId('preview-date').textContent = new Date(quote.created).toLocaleDateString();
  byId('preview-customer').textContent = quote.customerName || 'Choose a customer';
  byId('preview-email').textContent = quote.customerEmail;
  byId('preview-items').innerHTML = totals.items.filter(item => item.description).map(item => `
    <tr>
      <td>${escapeHtml(item.description)}</td>
      <td>${item.quantity}</td>
      <td>${centsToMoney(item.unitPriceCents)}</td>
      <td>${centsToMoney(item.quantity * item.unitPriceCents)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">Add products or services to this quote.</td></tr>';
  byId('preview-subtotal').textContent = centsToMoney(totals.subtotalCents);
  byId('preview-tax').textContent = centsToMoney(totals.taxCents);
  byId('preview-tax-row').hidden = totals.taxCents === 0;
  byId('preview-shipping').textContent = centsToMoney(totals.shippingCents);
  byId('preview-shipping-row').hidden = totals.shippingCents === 0;
  byId('preview-total').textContent = centsToMoney(totals.totalCents);
  byId('preview-notes').textContent = quote.artworkNotes;
  byId('preview-notes-wrap').hidden = !quote.artworkNotes;
  byId('preview-terms').textContent = quote.terms;
  byId('internal-cost').textContent = centsToMoney(totals.internalCostCents);
  byId('internal-margin').textContent = centsToMoney(totals.marginCents);
}

function fillQuote(input = {}) {
  const quote = sanitizeQuote(input);
  state.id = quote.id;
  state.created = quote.created;
  state.paymentUrl = quote.paymentUrl;
  state.stripeSessionId = quote.stripeSessionId;
  byId('crm-record').value = quote.crmRecordId;
  byId('customer-name').value = quote.customerName;
  byId('customer-email').value = quote.customerEmail;
  byId('reference').value = quote.reference || makeReference();
  byId('quote-status').value = quote.status;
  byId('tax-rate').value = quote.taxRate;
  byId('shipping').value = (quote.shippingCents / 100).toFixed(2);
  byId('artwork-notes').value = quote.artworkNotes;
  byId('terms').value = quote.terms || 'Quote valid for 14 days. Production begins after artwork approval and payment.';
  lineItems.innerHTML = '';
  (quote.items.length ? quote.items : [{}]).forEach(addLineItem);
  paymentLink.value = quote.paymentUrl;
  byId('preview-payment').href = quote.paymentUrl;
  paymentResult.hidden = !quote.paymentUrl;
  renderPreview();
}

function resetQuote() {
  state.id = '';
  state.created = '';
  state.paymentUrl = '';
  state.stripeSessionId = '';
  byId('saved-quotes').value = '';
  fillQuote({
    reference: makeReference(),
    status: 'Draft',
    terms: 'Quote valid for 14 days. Production begins after artwork approval and payment.',
    items: [{}],
  });
  byId('crm-record').value = '';
  statusMessage.textContent = '';
}

function renderCrmOptions() {
  const current = byId('crm-record').value;
  const records = Object.values(crmIndex)
    .filter(record => record && String(record.recordType || 'person') === 'person')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  byId('crm-record').innerHTML = '<option value="">Choose a customer</option>' + records
    .map(record => `<option value="${escapeHtml(record.id)}">${escapeHtml(record.name || record.email || record.id)}</option>`)
    .join('');
  byId('crm-record').value = current;
}

function renderQuoteOptions() {
  const current = byId('saved-quotes').value;
  const quotes = Object.values(quoteIndex)
    .filter(Boolean)
    .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  byId('saved-quotes').innerHTML = '<option value="">New quote</option>' + quotes
    .map(quote => `<option value="${escapeHtml(quote.id)}">${escapeHtml(quote.reference || 'Quote')} — ${escapeHtml(quote.customerName || 'Customer')} — ${centsToMoney(quote.totalCents)}</option>`)
    .join('');
  byId('saved-quotes').value = current;
}

async function saveQuote({ message = 'Quote saved to CRM.' } = {}) {
  const quote = readQuote();
  if (!quote.customerName) throw new Error('Choose or enter a customer name.');
  if (!quote.items.some(item => item.description && item.unitPriceCents > 0)) {
    throw new Error('Add at least one priced line item.');
  }

  state.id = quote.id;
  state.created = quote.created;
  await put(quotesRoot.get(quote.id), quoteToGunData(quote));
  quoteIndex[quote.id] = quote;

  if (quote.crmRecordId && crmIndex[quote.crmRecordId]) {
    const crmUpdate = {
      ...buildCrmQuoteFields(quote),
      id: quote.crmRecordId,
    };
    await put(crmRoot.get(quote.crmRecordId), crmUpdate);
    crmIndex[quote.crmRecordId] = { ...crmIndex[quote.crmRecordId], ...crmUpdate };
  }

  renderQuoteOptions();
  byId('saved-quotes').value = quote.id;
  statusMessage.textContent = message;
  return quote;
}

async function buildAuth() {
  const alias = stored('alias').trim();
  const pub = currentPub();
  if (!alias || !pub || !user?._?.sea) throw new Error('Sign in again to create a payment link.');
  return {
    portalAlias: alias,
    portalPub: pub,
    authPub: pub,
    authProof: await Gun.SEA.sign({
      scope: 'stripe-billing',
      action: 'custom-payment',
      alias,
      pub,
      origin: window.location.origin,
      iat: Date.now(),
    }, user._.sea),
  };
}

async function createPaymentLink() {
  let quote = readQuote();
  if (quote.totalCents < 100) throw new Error('The quote total must be at least $1.');

  statusMessage.textContent = 'Creating secure Stripe checkout…';
  byId('create-payment').disabled = true;
  try {
    quote = await saveQuote({ message: '' });
    const auth = await buildAuth();
    const response = await fetch('/api/stripe/custom-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: quote.customerName,
        customerEmail: quote.customerEmail,
        amount: (quote.totalCents / 100).toFixed(2),
        description: `3DVR quote ${quote.reference}`,
        reference: quote.reference,
        quoteId: quote.id,
        crmRecordId: quote.crmRecordId,
        collectCustomerEmail: !quote.customerEmail,
        ...auth,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not create the payment link.');

    state.paymentUrl = body.url;
    state.stripeSessionId = body.id;
    byId('quote-status').value = 'Payment link created';
    quote = await saveQuote({ message: 'Payment link created and saved to CRM.' });
    paymentLink.value = body.url;
    byId('preview-payment').href = body.url;
    paymentResult.hidden = false;
  } finally {
    byId('create-payment').disabled = false;
  }
}

function applyCrmRecord(id) {
  const record = crmIndex[id];
  if (!record) return;
  byId('crm-record').value = id;
  byId('customer-name').value = record.name || '';
  byId('customer-email').value = record.email || '';
  if (record.quoteId && quoteIndex[record.quoteId]) {
    byId('saved-quotes').value = record.quoteId;
    fillQuote(quoteIndex[record.quoteId]);
  }
  renderPreview();
}

function presetPedriAndChester() {
  Object.values(crmIndex).forEach(record => {
    const name = String(record?.name || '').trim().toLowerCase();
    if (name === 'pedri' && !state.id) {
      // Pricing confirmed July 29, 2026: retail follows the MOO quote; 4over stays private.
      quoteIndex['pedri-draft'] ||= sanitizeQuote({
        id: 'pedri-draft',
        reference: 'PEDRI-001',
        crmRecordId: record.id,
        customerName: record.name,
        customerEmail: record.email,
        status: 'Draft',
        items: [
          { description: 'Custom printed shirts', quantity: 6, unitPrice: 30, unitCost: 0 },
          { description: 'Two-sided business cards (200 + 50 bonus)', quantity: 1, unitPrice: 78, unitCost: 12 },
        ],
        artworkNotes: 'Business cards: 200 requested; provide the full 250-card production run as a bonus. Confirm shirt sizes, garment color, and artwork before production.',
        terms: 'Quote valid for 14 days. Production begins after artwork approval and payment.',
      });
    }
    if (name === 'chester' && !state.id) {
      quoteIndex['chester-draft'] ||= sanitizeQuote({
        id: 'chester-draft',
        reference: 'CHESTER-001',
        crmRecordId: record.id,
        customerName: record.name,
        customerEmail: record.email,
        status: 'Draft',
        items: [
          { description: 'Two-sided business cards (50 + 50 bonus)', quantity: 1, unitPrice: 0, unitCost: 6 },
        ],
        artworkNotes: 'Front: black scribble logo with the confirmed statement. Back: skull artwork. Confirm final proof and the previously promised MOO-based sale price.',
        terms: 'Quote valid for 14 days. Production begins after artwork approval and payment.',
      });
    }
  });
}

function bindEvents() {
  ['customer-name', 'customer-email', 'reference', 'quote-status', 'tax-rate', 'shipping', 'artwork-notes', 'terms']
    .forEach(id => byId(id).addEventListener('input', renderPreview));
  byId('crm-record').addEventListener('change', event => applyCrmRecord(event.target.value));
  byId('saved-quotes').addEventListener('change', event => {
    if (!event.target.value) resetQuote();
    else fillQuote(quoteIndex[event.target.value]);
  });
  byId('add-item').addEventListener('click', () => {
    addLineItem();
    renderPreview();
  });
  byId('new-quote').addEventListener('click', resetQuote);
  byId('save-quote').addEventListener('click', async () => {
    try {
      await saveQuote();
    } catch (error) {
      statusMessage.textContent = error.message;
    }
  });
  byId('print-quote').addEventListener('click', () => window.print());
  byId('create-payment').addEventListener('click', async () => {
    try {
      await createPaymentLink();
    } catch (error) {
      statusMessage.textContent = error.message;
    }
  });
  byId('copy-payment').addEventListener('click', async () => {
    await navigator.clipboard.writeText(paymentLink.value);
    byId('copy-payment').textContent = 'Copied';
    window.setTimeout(() => { byId('copy-payment').textContent = 'Copy link'; }, 1600);
  });
}

async function init() {
  QUOTE_STATUS_OPTIONS.forEach(status => {
    byId('quote-status').add(new Option(status, status));
  });
  bindEvents();
  resetQuote();
  if (!(await restoreSession())) return;

  crmRoot.map().on((data, id) => {
    if (!id) return;
    if (data) crmIndex[id] = { ...crmIndex[id], ...data, id };
    else delete crmIndex[id];
    renderCrmOptions();
    presetPedriAndChester();
    renderQuoteOptions();
    if (requestedCrmRecordId === id && !state.handledRequestedRecord) {
      applyCrmRecord(id);
      if (!crmIndex[id]?.quoteId) state.handledRequestedRecord = true;
    }
  });

  quotesRoot.map().on((data, id) => {
    if (!id) return;
    if (data) quoteIndex[id] = quoteFromGunData({ ...quoteIndex[id], ...data, id });
    else delete quoteIndex[id];
    renderQuoteOptions();
    if (
      requestedCrmRecordId
      && !state.handledRequestedRecord
      && crmIndex[requestedCrmRecordId]?.quoteId === id
    ) {
      applyCrmRecord(requestedCrmRecordId);
      state.handledRequestedRecord = true;
    }
  });
}

void init();
