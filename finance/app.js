const gun = Gun(['https://gun-relay-3dvr.fly.dev/gun']);

// finance/expenditures/<entryId> stores normalized expenditure records for the 3dvr portal.
const financeExpendituresNode = gun.get('finance').get('expenditures');

const form = document.getElementById('expenditure-form');
const amountInput = document.getElementById('amount');
const dateInput = document.getElementById('date');
const categoryInput = document.getElementById('category');
const paymentMethodInput = document.getElementById('payment-method');
const notesInput = document.getElementById('notes');
const list = document.getElementById('finance-ledger');
const emptyState = document.getElementById('finance-empty');
const totalAmount = document.getElementById('total-amount');
const latestEntry = document.getElementById('latest-entry');

const numberFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const entries = new Map();

function defaultDate() {
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

dateInput.value = defaultDate();

function normalizeAmount(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100) / 100;
}

function renderEntries() {
  const sortedEntries = Array.from(entries.entries()).sort(([, a], [, b]) => {
    const aDate = Date.parse(a.date || 0);
    const bDate = Date.parse(b.date || 0);
    if (!Number.isNaN(bDate - aDate) && bDate !== aDate) {
      return bDate - aDate;
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  list.innerHTML = '';

  if (sortedEntries.length === 0) {
    list.append(emptyState);
    emptyState.hidden = false;
    totalAmount.textContent = numberFormatter.format(0);
    latestEntry.textContent = 'No entries yet';
    return;
  }

  emptyState.hidden = true;

  let total = 0;
  sortedEntries.forEach(([key, entry]) => {
    const normalizedAmount = normalizeAmount(entry.amount);
    total += normalizedAmount;

    const container = document.createElement('article');
    container.className = 'finance-entry';
    container.dataset.key = key;

    const header = document.createElement('header');
    const title = document.createElement('h3');
    title.textContent = entry.category || 'General expenditure';

    const amount = document.createElement('span');
    amount.className = 'amount';
    amount.textContent = numberFormatter.format(normalizedAmount);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const date = entry.date ? new Date(entry.date) : new Date(entry.createdAt || Date.now());
    const formattedDate = Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString();
    meta.textContent = `${formattedDate} • Paid with ${entry.paymentMethod || 'unspecified method'}`;

    header.append(title, amount);
    container.append(header, meta);

    if (entry.notes) {
      const notes = document.createElement('p');
      notes.textContent = entry.notes;
      container.append(notes);
    }

    list.append(container);
  });

  totalAmount.textContent = numberFormatter.format(total);

  const [latest] = sortedEntries;
  const latestRecord = latest?.[1];
  if (latestRecord) {
    const latestDate = latestRecord.date ? new Date(latestRecord.date) : new Date(latestRecord.createdAt || Date.now());
    const formatted = Number.isNaN(latestDate.getTime()) ? 'Recently logged' : latestDate.toLocaleDateString();
    latestEntry.textContent = `${formatted} • ${numberFormatter.format(normalizeAmount(latestRecord.amount))}`;
  }
}

function handleSubmit(event) {
  event.preventDefault();

  const amountValue = normalizeAmount(amountInput.value);
  if (amountValue <= 0) {
    amountInput.focus();
    amountInput.setCustomValidity('Please enter an amount greater than 0.');
    amountInput.reportValidity();
    return;
  }
  amountInput.setCustomValidity('');

  const record = {
    amount: amountValue,
    date: dateInput.value || defaultDate(),
    category: categoryInput.value.trim() || 'General expenditure',
    paymentMethod: paymentMethodInput.value.trim() || 'Unspecified',
    notes: notesInput.value.trim(),
    createdAt: Date.now(),
  };

  const entryId = Gun.text.random(16);
  financeExpendituresNode.get(entryId).put(record, ack => {
    if (ack.err) {
      console.error('Failed to persist expenditure', ack.err);
      return;
    }
    form.reset();
    dateInput.value = record.date;
  });
}

form.addEventListener('submit', handleSubmit);

financeExpendituresNode.map().on((data, key) => {
  if (!key || key === '_') {
    return;
  }

  if (!data || (typeof data.amount === 'undefined' && !data.notes && !data.category)) {
    entries.delete(key);
    renderEntries();
    return;
  }

  entries.set(key, data);
  renderEntries();
});
