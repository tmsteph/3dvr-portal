'use strict';

function createLocalGunSubscriptionStub() {
  return {
    off() {}
  };
}

function createLocalGunNodeStub() {
  const node = {
    __isGunStub: true,
    get() {
      return createLocalGunNodeStub();
    },
    put(_value, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
      }
      return node;
    },
    once(callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback(undefined), 0);
      }
      return node;
    },
    map() {
      return {
        __isGunStub: true,
        on() {
          return createLocalGunSubscriptionStub();
        }
      };
    },
    on() {
      return createLocalGunSubscriptionStub();
    },
    off() {}
  };
  return node;
}

function createLocalGunUserStub() {
  const node = createLocalGunNodeStub();
  return {
    ...node,
    is: null,
    _: {},
    recall() {},
    auth(_alias, _password, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
      }
    },
    leave() {},
    create(_alias, _password, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
      }
    }
  };
}

function createGunStub() {
  return {
    __isGunStub: true,
    get() {
      return createLocalGunNodeStub();
    },
    user() {
      return createLocalGunUserStub();
    }
  };
}

function ensureGunContext(factory, label) {
  const ensureGun = window.ScoreSystem && typeof window.ScoreSystem.ensureGun === 'function'
    ? window.ScoreSystem.ensureGun.bind(window.ScoreSystem)
    : null;
  if (ensureGun) {
    return ensureGun(factory, { label });
  }
  let instance = null;
  if (typeof factory === 'function') {
    try {
      instance = factory();
    } catch (err) {
      console.warn(`Failed to initialize ${label || 'gun'} instance`, err);
    }
  }
  if (instance) {
    const resolvedUser = typeof instance.user === 'function'
      ? instance.user()
      : createLocalGunUserStub();
    return {
      gun: instance,
      user: resolvedUser,
      isStub: !!instance.__isGunStub
    };
  }
  console.warn(`Gun.js is unavailable for ${label || 'finance'}; using offline stub.`);
  const stub = createGunStub();
  return {
    gun: stub,
    user: stub.user(),
    isStub: true
  };
}

const gunContext = ensureGunContext(
  () => (typeof Gun === 'function' ? Gun(['https://gun-relay-3dvr.fly.dev/gun']) : null),
  'finance'
);
const gun = gunContext.gun;
const financeLedger = gun && typeof gun.get === 'function'
  ? gun.get('finance').get('expenditures')
  : createLocalGunNodeStub();

if (window.ScoreSystem && typeof window.ScoreSystem.ensureGuestIdentity === 'function') {
  try {
    window.ScoreSystem.ensureGuestIdentity();
  } catch (err) {
    console.warn('Failed to ensure finance guest identity', err);
  }
}

// finance/expenditures/<entryId> remains the shared ledger node used across the portal.
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

if (dateInput) {
  dateInput.value = defaultDate();
}

if (form) {
  form.addEventListener('submit', handleSubmit);
}
if (financeLedger && typeof financeLedger.map === 'function' && typeof financeLedger.map().on === 'function') {
  financeLedger.map().on(handleLedgerUpdate);
}

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

  if (!amountInput || !dateInput || !categoryInput || !paymentInput || !notesInput) {
    return;
  }

  const amount = normalizeAmount(amountInput.value);
  if (amount <= 0) {
    amountInput.focus();
    amountInput.setCustomValidity('Please enter an amount greater than 0.');
    amountInput.reportValidity();
    return;
  }
  amountInput.setCustomValidity('');

  const entryId = typeof Gun !== 'undefined' && Gun.text && typeof Gun.text.random === 'function'
    ? Gun.text.random(16)
    : Math.random().toString(36).slice(2, 10);
  const now = new Date();
  const record = {
    amount,
    date: dateInput.value || defaultDate(),
    category: categoryInput.value.trim() || 'General expenditure',
    paymentMethod: paymentInput.value.trim() || 'Unspecified',
    notes: notesInput.value.trim(),
    createdAt: now.toISOString()
  };

  const entryNode = typeof financeLedger.get === 'function' ? financeLedger.get(entryId) : null;
  if (entryNode && typeof entryNode.put === 'function') {
    entryNode.put(record);
  }
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
    if (emptyState) {
      emptyState.hidden = false;
      ledgerList.append(emptyState);
    }
    if (totalAmount) {
      totalAmount.textContent = numberFormatter.format(0);
    }
    if (latestEntry) {
      latestEntry.textContent = 'No entries yet';
    }
    return;
  }

  if (emptyState) {
    emptyState.hidden = true;
  }

  let total = 0;
  sorted.forEach(entry => {
    const container = document.createElement('article');
    container.className = 'finance-entry';
    container.setAttribute('role', 'listitem');

    const header = document.createElement('div');
    header.className = 'finance-entry__header';

    const title = document.createElement('h3');
    title.className = 'finance-entry__title';
    title.textContent = entry.category || 'General expenditure';

    const amountLabel = document.createElement('span');
    amountLabel.className = 'finance-entry__amount';
    amountLabel.textContent = numberFormatter.format(normalizeAmount(entry.amount));

    header.append(title, amountLabel);

    const meta = document.createElement('p');
    meta.className = 'finance-entry__meta';
    const date = entry.date ? new Date(entry.date) : new Date(entry.createdAt || Date.now());
    const formattedDate = Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString();
    const method = entry.paymentMethod ? entry.paymentMethod : 'Unspecified method';
    meta.textContent = `${formattedDate} • Paid with ${method}`;

    container.append(header, meta);

    if (entry.notes) {
      const notes = document.createElement('p');
      notes.className = 'finance-entry__notes';
      notes.textContent = entry.notes;
      container.append(notes);
    }

    ledgerList.append(container);
    total += normalizeAmount(entry.amount);
  });

  if (totalAmount) {
    totalAmount.textContent = numberFormatter.format(total);
  }
  const latest = sorted[0];
  if (latest) {
    const latestDate = latest.date ? new Date(latest.date) : new Date(latest.createdAt || Date.now());
    const formatted = Number.isNaN(latestDate.getTime()) ? 'Recently logged' : latestDate.toLocaleDateString();
    if (latestEntry) {
      latestEntry.textContent = `${formatted} • ${numberFormatter.format(normalizeAmount(latest.amount))}`;
    }
  }
}
