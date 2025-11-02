const gun = Gun({ peers: ['https://gun-relay-3dvr.fly.dev/gun'] });
const financeUser = gun.user();

// The finance ledger stores entries at ~<financeUserPub>/finance/expenditures/<entryId>.
// Every record is synced through the shared finance guest identity so updates persist
// across sessions while remaining readable to collaborators.
const FINANCE_ALIAS = 'finance-ledger-guest';
const FINANCE_PASS = 'finance-ledger-guest-pass';
const PENDING_STORAGE_KEY = 'finance:pendingEntries';
const RECONNECT_DELAY = 5000;

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
const statusBanner = document.getElementById('finance-status');

const numberFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const entries = new Map();
const pendingEntries = new Map();

let ledgerNode = null;
let ledgerSubscription = null;
let reconnectTimer = null;

dateInput.value = defaultDate();

function setStatus(message, tone = 'neutral') {
  if (!statusBanner) {
    return;
  }

  statusBanner.textContent = message;
  statusBanner.classList.remove(
    'finance-status--success',
    'finance-status--error',
    'finance-status--warning',
  );

  if (tone === 'success' || tone === 'error' || tone === 'warning') {
    statusBanner.classList.add(`finance-status--${tone}`);
  }
}

function defaultDate() {
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

function normalizeAmount(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100) / 100;
}

function persistPendingState() {
  if (pendingEntries.size === 0) {
    localStorage.removeItem(PENDING_STORAGE_KEY);
    return;
  }

  const serialized = Object.fromEntries(pendingEntries.entries());
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(serialized));
}

function hydratePendingEntries() {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([key, record]) => {
      pendingEntries.set(key, record);
      entries.set(key, { ...record, pending: true });
    });
    renderEntries();
  } catch (error) {
    console.error('Failed to load pending finance entries', error);
    localStorage.removeItem(PENDING_STORAGE_KEY);
  }
}

function ensureFinanceIdentity() {
  return new Promise((resolve, reject) => {
    function authenticate() {
      financeUser.auth(FINANCE_ALIAS, FINANCE_PASS, ack => {
        if (ack?.err) {
          if (/no\s+user|not\s+found/i.test(ack.err)) {
            financeUser.create(FINANCE_ALIAS, FINANCE_PASS, createAck => {
              if (createAck?.err && !/already/i.test(createAck.err)) {
                reject(new Error(createAck.err));
                return;
              }
              authenticate();
            });
            return;
          }
          reject(new Error(ack.err));
          return;
        }
        resolve(ack);
      });
    }

    authenticate();
  });
}

function subscribeToLedger(node) {
  if (ledgerSubscription) {
    ledgerSubscription.off();
  }

  ledgerSubscription = node.map().on((data, key) => {
    if (!key || key === '_') {
      return;
    }

    if (!data || (typeof data.amount === 'undefined' && !data.notes && !data.category)) {
      entries.delete(key);
      pendingEntries.delete(key);
      persistPendingState();
      renderEntries();
      return;
    }

    const entry = { ...data };
    if (pendingEntries.has(key)) {
      pendingEntries.delete(key);
      persistPendingState();
    }
    entries.set(key, entry);
    renderEntries();
  });
}

function connectToLedger() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  ensureFinanceIdentity()
    .then(() => {
      ledgerNode = financeUser.get('finance').get('expenditures');
      subscribeToLedger(ledgerNode);
      setStatus('Connected to the shared finance ledger.', 'success');
      syncPendingEntries();
    })
    .catch(error => {
      console.error('Unable to authenticate finance guest identity', error);
      setStatus('Offline mode: entries are saved locally and will sync automatically.', 'warning');
      reconnectTimer = setTimeout(connectToLedger, RECONNECT_DELAY);
    });
}

function syncPendingEntries() {
  if (!ledgerNode) {
    return;
  }

  pendingEntries.forEach((record, entryId) => {
    writeEntry(entryId, record, { announce: false });
  });
}

function writeEntry(entryId, record, { announce } = { announce: true }) {
  if (!ledgerNode) {
    setStatus('Offline mode: saved locally, will sync when reconnected.', 'warning');
    return;
  }

  ledgerNode.get(entryId).put(record, ack => {
    if (ack && ack.err) {
      console.error('Failed to persist expenditure', ack.err);
      setStatus('Unable to sync right now. Entries remain queued locally.', 'warning');
      return;
    }

    if (pendingEntries.has(entryId)) {
      pendingEntries.delete(entryId);
      persistPendingState();
    }

    const existing = entries.get(entryId);
    if (existing) {
      entries.set(entryId, { ...existing, pending: false });
      renderEntries();
    }

    if (announce) {
      setStatus('Expenditure synced to the finance ledger.', 'success');
    }
  });
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
    if (entry.pending) {
      container.dataset.pending = 'true';
    } else {
      delete container.dataset.pending;
    }

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
    const payment = entry.paymentMethod || 'unspecified method';
    const pendingSuffix = entry.pending ? ' • Pending sync' : '';
    meta.textContent = `${formattedDate} • Paid with ${payment}${pendingSuffix}`;

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
    const pendingSuffix = latestRecord.pending ? ' (pending)' : '';
    latestEntry.textContent = `${formatted} • ${numberFormatter.format(normalizeAmount(latestRecord.amount))}${pendingSuffix}`;
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

  entries.set(entryId, { ...record, pending: true });
  pendingEntries.set(entryId, record);
  persistPendingState();
  renderEntries();

  writeEntry(entryId, record, { announce: true });

  form.reset();
  dateInput.value = record.date;
}

form.addEventListener('submit', handleSubmit);
window.addEventListener('online', () => {
  setStatus('Network restored. Reconnecting to finance ledger…', 'warning');
  connectToLedger();
});
window.addEventListener('offline', () => {
  setStatus('Offline mode: entries will sync once you are reconnected.', 'warning');
});

hydratePendingEntries();
connectToLedger();

if (!ledgerNode) {
  setStatus('Connecting to the finance ledger…', 'warning');
}
