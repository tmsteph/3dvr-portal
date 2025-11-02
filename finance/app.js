const GUN_PEERS = ['https://gun-relay-3dvr.fly.dev/gun'];
const scoreSystem = window.ScoreSystem || {};
const ensureGunContext = typeof scoreSystem.ensureGun === 'function'
  ? scoreSystem.ensureGun(
      () => (typeof Gun === 'function' ? Gun({ peers: GUN_PEERS }) : null),
      { label: 'finance ledger' },
    )
  : (() => {
      if (typeof Gun !== 'function') {
        return { gun: null, user: null, isStub: true };
      }
      const instance = Gun({ peers: GUN_PEERS });
      return { gun: instance, user: instance.user(), isStub: false };
    })();

const gun = ensureGunContext.gun;
const financeUser = ensureGunContext.user;
const usingGunStub = !gun || ensureGunContext.isStub;

if (typeof scoreSystem.ensureGuestIdentity === 'function') {
  try {
    scoreSystem.ensureGuestIdentity();
  } catch (error) {
    console.warn('Finance ledger: unable to ensure guest identity', error);
  }
}

// The finance ledger stores entries at finance/expenditures/<entryId> on the shared
// graph. When authentication is available we sign updates with a shared guest identity
// so collaborators see consistent history across sessions and devices.
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

if (financeUser && typeof scoreSystem.recallUserSession === 'function') {
  try {
    scoreSystem.recallUserSession(financeUser, { useLocal: true, useSession: true });
  } catch (error) {
    console.warn('Finance ledger: unable to recall previous session', error);
  }
}

let ledgerNode = null;
let ledgerSubscription = null;
let reconnectTimer = null;
let identityReady = false;

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

function readStoredPendingEntries() {
  try {
    return localStorage.getItem(PENDING_STORAGE_KEY);
  } catch (error) {
    console.warn('Finance ledger: unable to read pending entries from storage', error);
    return null;
  }
}

function writeStoredPendingEntries(serialized) {
  try {
    localStorage.setItem(PENDING_STORAGE_KEY, serialized);
  } catch (error) {
    console.warn('Finance ledger: unable to persist pending entries', error);
  }
}

function clearStoredPendingEntries() {
  try {
    localStorage.removeItem(PENDING_STORAGE_KEY);
  } catch (error) {
    console.warn('Finance ledger: unable to clear pending entries', error);
  }
}

function persistPendingState() {
  if (pendingEntries.size === 0) {
    clearStoredPendingEntries();
    return;
  }

  const serialized = Object.fromEntries(pendingEntries.entries());
  writeStoredPendingEntries(JSON.stringify(serialized));
}

function hydratePendingEntries() {
  const raw = readStoredPendingEntries();
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([key, record]) => {
      pendingEntries.set(key, record);
      entries.set(key, { ...withWriterMetadata(record), pending: true });
    });
    renderEntries();
  } catch (error) {
    console.error('Failed to load pending finance entries', error);
    clearStoredPendingEntries();
  }
}

function getCurrentAlias() {
  return financeUser?._?.sea?.alias || financeUser?.is?.alias || '';
}

function getCurrentPub() {
  return financeUser?.is?.pub || financeUser?._?.sea?.pub || '';
}

function withWriterMetadata(record) {
  const alias = getCurrentAlias();
  const pub = getCurrentPub();
  const payload = {
    ...record,
    updatedAt: Date.now(),
  };

  if (alias) {
    payload.writerAlias = alias;
  }
  if (pub) {
    payload.writerPub = pub;
  }

  return payload;
}

function ensureFinanceIdentity() {
  if (!financeUser || usingGunStub) {
    return Promise.reject(new Error('Finance identity unavailable'));
  }

  const existingPub = getCurrentPub();
  if (existingPub) {
    return Promise.resolve({ alias: getCurrentAlias(), pub: existingPub });
  }

  return new Promise((resolve, reject) => {
    function authenticate() {
      try {
        financeUser.auth(FINANCE_ALIAS, FINANCE_PASS, ack => {
          if (ack?.err) {
            if (/no\s+user|not\s+found/i.test(ack.err)) {
              try {
                financeUser.create(FINANCE_ALIAS, FINANCE_PASS, createAck => {
                  if (createAck?.err && !/already/i.test(createAck.err)) {
                    reject(new Error(createAck.err));
                    return;
                  }
                  authenticate();
                });
              } catch (creationError) {
                reject(creationError);
              }
              return;
            }
            reject(new Error(ack.err));
            return;
          }
          resolve({ alias: FINANCE_ALIAS, pub: getCurrentPub() });
        });
      } catch (authError) {
        reject(authError);
      }
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

    if (!data || typeof data !== 'object') {
      entries.delete(key);
      pendingEntries.delete(key);
      persistPendingState();
      renderEntries();
      return;
    }

    const entry = { ...data };
    delete entry._;
    if (
      typeof entry.amount === 'undefined'
      && !entry.notes
      && !entry.category
    ) {
      entries.delete(key);
      pendingEntries.delete(key);
      persistPendingState();
      renderEntries();
      return;
    }

    if (pendingEntries.has(key)) {
      pendingEntries.delete(key);
      persistPendingState();
    }
    entry.pending = false;
    if (!entry.createdAt) {
      entry.createdAt = entry.updatedAt || Date.now();
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

  identityReady = false;

  if (!gun || usingGunStub) {
    setStatus('Offline mode: entries are saved locally and will sync automatically.', 'warning');
    return;
  }

  ledgerNode = gun.get('finance').get('expenditures');
  subscribeToLedger(ledgerNode);
  setStatus('Connecting to the finance ledger…', 'warning');

  ensureFinanceIdentity()
    .then(() => {
      identityReady = true;
      setStatus('Connected to the shared finance ledger.', 'success');
      syncPendingEntries();
    })
    .catch(error => {
      console.error('Unable to authenticate finance identity', error);
      setStatus('Offline mode: entries are saved locally and will sync automatically.', 'warning');
      reconnectTimer = setTimeout(connectToLedger, RECONNECT_DELAY);
    });
}

function syncPendingEntries() {
  if (!ledgerNode || !identityReady) {
    return;
  }

  pendingEntries.forEach((record, entryId) => {
    writeEntry(entryId, record, { announce: false });
  });
}

function writeEntry(entryId, record, { announce } = { announce: true }) {
  if (!ledgerNode || !identityReady) {
    setStatus('Offline mode: saved locally, will sync when reconnected.', 'warning');
    return;
  }

  const payload = withWriterMetadata(record);

  ledgerNode.get(entryId).put(payload, ack => {
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
    const nextEntry = existing ? { ...existing, ...payload, pending: false } : { ...payload, pending: false };
    entries.set(entryId, nextEntry);
    renderEntries();

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
    const writer = entry.writerAlias
      || (entry.writerPub ? `pub ${String(entry.writerPub).slice(0, 8)}…` : '');
    const originSuffix = writer ? ` • Logged by ${writer}` : '';
    meta.textContent = `${formattedDate} • Paid with ${payment}${pendingSuffix}${originSuffix}`;

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

  entries.set(entryId, { ...withWriterMetadata(record), pending: true });
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
