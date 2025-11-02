'use strict';

const gun = Gun(['https://gun-relay-3dvr.fly.dev/gun']);
const financeLedger = gun.get('finance').get('expenditures');
// The finance ledger keeps expenditures under finance/expenditures/<entryId> so
// CRM, contacts, and finance can all read from the same Gun graph.

const form = document.getElementById('expenditure-form');
const amountInput = document.getElementById('amount');
const dateInput = document.getElementById('date');
const categoryInput = document.getElementById('category');
const paymentInput = document.getElementById('payment-method');
const notesInput = document.getElementById('notes');
const ledgerList = document.getElementById('finance-ledger');
const emptyState = document.getElementById('finance-empty');
const totalAmount = document.getElementById('total-amount');
const latestEntry = document.getElementById('latest-entry');

const entries = new Map();
const numberFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2
});

dateInput.value = defaultDate();

form.addEventListener('submit', handleSubmit);
financeLedger.map().on(handleLedgerUpdate);

function defaultDate() {
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

function sanitizeRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const cleaned = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === '_' || typeof value === 'function') {
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}

function handleLedgerUpdate(data, key) {
  if (!key || key === '_') {
    return;
  }

  if (!data) {
    entries.delete(key);
    renderEntries();
    return;
  }

  const record = sanitizeRecord(data);
  if (!record) {
    entries.delete(key);
    renderEntries();
    return;
  }

  entries.set(key, {
    ...record,
    id: key
  });
  renderEntries();
}

function handleSubmit(event) {
  event.preventDefault();

  const amount = normalizeAmount(amountInput.value);
  if (amount <= 0) {
    amountInput.focus();
    amountInput.setCustomValidity('Please enter an amount greater than 0.');
    amountInput.reportValidity();
    return;
  }
  amountInput.setCustomValidity('');

  const entryId = Gun.text.random(16);
  const now = new Date();
  const record = {
    amount,
    date: dateInput.value || defaultDate(),
    category: categoryInput.value.trim() || 'General expenditure',
    paymentMethod: paymentInput.value.trim() || 'Unspecified',
    notes: notesInput.value.trim(),
    createdAt: now.toISOString()
  };

  financeLedger.get(entryId).put(record);
  form.reset();
  dateInput.value = record.date;
}

function normalizeAmount(value) {
  const numeric = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
}

function renderEntries() {
  if (!ledgerList) {
    return;
  }

  const sorted = Array.from(entries.values()).sort((a, b) => {
    const aStamp = Date.parse(a.date || a.createdAt || 0);
    const bStamp = Date.parse(b.date || b.createdAt || 0);
    if (Number.isNaN(aStamp) || Number.isNaN(bStamp)) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    return bStamp - aStamp;
  });

  ledgerList.innerHTML = '';

  if (sorted.length === 0) {
    emptyState.hidden = false;
    ledgerList.append(emptyState);
    totalAmount.textContent = numberFormatter.format(0);
    latestEntry.textContent = 'No entries yet';
    return;
  }

  emptyState.hidden = true;

  let total = 0;
  sorted.forEach(entry => {
    const container = document.createElement('article');
    container.className = 'finance-entry flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-inner shadow-black/20';
    container.setAttribute('role', 'listitem');

    const header = document.createElement('header');
    header.className = 'flex items-start justify-between gap-3';

    const title = document.createElement('h3');
    title.className = 'text-lg font-semibold text-white';
    title.textContent = entry.category || 'General expenditure';

    const amountLabel = document.createElement('span');
    amountLabel.className = 'text-base font-semibold text-sky-300';
    amountLabel.textContent = numberFormatter.format(normalizeAmount(entry.amount));

    header.append(title, amountLabel);

    const meta = document.createElement('p');
    meta.className = 'text-xs uppercase tracking-[0.26em] text-slate-400';
    const date = entry.date ? new Date(entry.date) : new Date(entry.createdAt || Date.now());
    const formattedDate = Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString();
    const method = entry.paymentMethod ? entry.paymentMethod : 'Unspecified method';
    meta.textContent = `${formattedDate} • Paid with ${method}`;

    container.append(header, meta);

    if (entry.notes) {
      const notes = document.createElement('p');
      notes.className = 'text-sm leading-relaxed text-slate-200';
      notes.textContent = entry.notes;
      container.append(notes);
    }

    ledgerList.append(container);
    total += normalizeAmount(entry.amount);
  });

  totalAmount.textContent = numberFormatter.format(total);
  const latest = sorted[0];
  if (latest) {
    const latestDate = latest.date ? new Date(latest.date) : new Date(latest.createdAt || Date.now());
    const formatted = Number.isNaN(latestDate.getTime()) ? 'Recently logged' : latestDate.toLocaleDateString();
    latestEntry.textContent = `${formatted} • ${numberFormatter.format(normalizeAmount(latest.amount))}`;
  }
}
