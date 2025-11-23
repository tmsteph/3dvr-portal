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

// Chrome can throw when localStorage is blocked (third-party cookies disabled). Retry with storage-less config
// so finance still connects to the shared portal graph instead of falling back to the offline stub.
function createFinanceGun() {
  if (typeof Gun !== 'function') {
    return null;
  }

  const peers = window.__GUN_PEERS__ || [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun'
  ];

  try {
    return Gun({ peers });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (/storage|quota|blocked|third-party/i.test(message)) {
      console.warn('Retrying Gun init for finance without localStorage (likely blocked cookies)', err);
      try {
        return Gun({ peers, radisk: false, localStorage: false });
      } catch (fallbackErr) {
        console.warn('Finance Gun fallback init failed', fallbackErr);
      }
    } else {
      console.warn('Finance Gun init failed unexpectedly', err);
    }
  }

  return null;
}

const gunContext = ensureGunContext(
  createFinanceGun,
  'finance'
);
const gun = gunContext.gun;

function attemptFinanceReconnection() {
  const refreshed = ensureGunContext(createFinanceGun, 'finance-retry');
  if (refreshed && !refreshed.isStub && refreshed.gun && !refreshed.gun.__isGunStub) {
    try {
      window.location.reload();
    } catch (err) {
      console.warn('Finance reload after Gun reconnection failed', err);
    }
    return true;
  }
  return false;
}

if (gunContext.isStub) {
  const retryDelays = [500, 1500, 3000];
  retryDelays.forEach(delay => {
    setTimeout(() => {
      if (attemptFinanceReconnection()) {
        return;
      }
    }, delay);
  });
  const onFocus = () => {
    attemptFinanceReconnection();
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      attemptFinanceReconnection();
    }
  });
}

// Finance data now lives under 3dvr-portal/finance to align with the shared workspace graph. We
// still read and write legacy finance/<*> nodes so older clients can participate while migrating.
const portalRoot = gun && typeof gun.get === 'function'
  ? gun.get('3dvr-portal')
  : createLocalGunNodeStub();
const financeRoot = portalRoot && typeof portalRoot.get === 'function'
  ? portalRoot.get('finance')
  : createLocalGunNodeStub();
const legacyFinanceRoot = gun && typeof gun.get === 'function'
  ? gun.get('finance')
  : createLocalGunNodeStub();

// Ethereum payments live under finance/ethereum to keep on-chain transfers in the shared graph.
const ethereumRoot = financeRoot && typeof financeRoot.get === 'function'
  ? financeRoot.get('ethereum')
  : createLocalGunNodeStub();
const legacyEthereumRoot = legacyFinanceRoot && typeof legacyFinanceRoot.get === 'function'
  ? legacyFinanceRoot.get('ethereum')
  : createLocalGunNodeStub();

function buildSourceList(primary, legacy) {
  const sources = [];
  if (primary) {
    sources.push(primary);
  }
  if (legacy && legacy !== primary) {
    sources.push(legacy);
  }
  if (sources.length === 0) {
    sources.push(createLocalGunNodeStub());
  }
  return sources;
}

const financeLedgerSources = buildSourceList(
  financeRoot && typeof financeRoot.get === 'function' ? financeRoot.get('expenditures') : null,
  legacyFinanceRoot && typeof legacyFinanceRoot.get === 'function' ? legacyFinanceRoot.get('expenditures') : null
);
const financePayablesSources = buildSourceList(
  financeRoot && typeof financeRoot.get === 'function' ? financeRoot.get('payables') : null,
  legacyFinanceRoot && typeof legacyFinanceRoot.get === 'function' ? legacyFinanceRoot.get('payables') : null
);
const ethereumConfigSources = buildSourceList(
  ethereumRoot && typeof ethereumRoot.get === 'function' ? ethereumRoot.get('config') : null,
  legacyEthereumRoot && typeof legacyEthereumRoot.get === 'function' ? legacyEthereumRoot.get('config') : null
);
const ethereumPaymentsSources = buildSourceList(
  ethereumRoot && typeof ethereumRoot.get === 'function' ? ethereumRoot.get('payments') : null,
  legacyEthereumRoot && typeof legacyEthereumRoot.get === 'function' ? legacyEthereumRoot.get('payments') : null
);

function forEachSource(sources, callback) {
  sources.forEach((source, index) => {
    if (source && typeof callback === 'function') {
      callback(source, index);
    }
  });
}

function writeRecordToSources(sources, identifier, record, label) {
  if (!identifier) {
    return;
  }
  forEachSource(sources, (source, index) => {
    const node = source && typeof source.get === 'function' ? source.get(identifier) : null;
    if (node && typeof node.put === 'function') {
      node.put(record, ack => {
        if (index === 0 && ack && ack.err) {
          console.warn(`Failed to persist ${label || 'record'} to primary finance node`, ack.err);
        }
      });
    }
  });
}

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
const outstandingAmount = document.getElementById('outstanding-amount');
const nextPayable = document.getElementById('next-payable');

const payableForm = document.getElementById('payable-form');
const payeeInput = document.getElementById('payee');
const payableAmountInput = document.getElementById('payable-amount');
const dueDateInput = document.getElementById('due-date');
const payableNotesInput = document.getElementById('payable-notes');
const payablesList = document.getElementById('payables-list');
const payablesEmptyState = document.getElementById('payables-empty');

const ethStatus = document.getElementById('eth-status');
const ethConnectButton = document.getElementById('eth-connect');
const ethAccountLabel = document.getElementById('eth-account');
const ethNetworkLabel = document.getElementById('eth-network');
const ethDestinationInput = document.getElementById('eth-destination');
const ethAmountInput = document.getElementById('eth-amount');
const ethNoteInput = document.getElementById('eth-note');
const ethPaymentForm = document.getElementById('eth-payment-form');
const ethMessage = document.getElementById('eth-message');
const ethPaymentLog = document.getElementById('eth-payment-log');
const ethLogEmpty = document.getElementById('eth-log-empty');

const entries = new Map();
const payables = new Map();
const ethPayments = new Map();
const ethState = {
  account: null,
  chainId: null,
  destinationFromConfig: ''
};
const numberFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2
});

if (dateInput) {
  dateInput.value = defaultDate();
}

if (dueDateInput) {
  dueDateInput.value = defaultDate();
}

if (form) {
  form.addEventListener('submit', handleSubmit);
}
forEachSource(financeLedgerSources, source => {
  if (source && typeof source.map === 'function' && typeof source.map().on === 'function') {
    source.map().on(handleLedgerUpdate);
  }
});

if (payableForm) {
  payableForm.addEventListener('submit', handlePayableSubmit);
}
forEachSource(financePayablesSources, source => {
  if (source && typeof source.map === 'function' && typeof source.map().on === 'function') {
    source.map().on(handlePayableUpdate);
  }
});

if (ethConnectButton) {
  ethConnectButton.addEventListener('click', connectMetaMask);
}
if (ethPaymentForm) {
  ethPaymentForm.addEventListener('submit', handleEthPaymentSubmit);
}
forEachSource(ethereumConfigSources, source => {
  if (source && typeof source.on === 'function') {
    source.on(handleEthereumConfigUpdate);
  }
});
forEachSource(ethereumPaymentsSources, source => {
  if (source && typeof source.map === 'function' && typeof source.map().on === 'function') {
    source.map().on(handleEthPaymentUpdate);
  }
});

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

initializeEthStatus();

function initializeEthStatus() {
  if (!ethStatus) {
    return;
  }
  if (!ensureEthereumAvailability()) {
    return;
  }

  updateEthStatus('MetaMask detected. Connect to log an on-chain payment.');
  try {
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
    window.ethereum.request({ method: 'eth_accounts' }).then(handleAccountsChanged).catch(() => {});
    window.ethereum.request({ method: 'eth_chainId' }).then(handleChainChanged).catch(() => {});
  } catch (err) {
    console.warn('Unable to subscribe to MetaMask events for finance', err);
  }
}

function handleEthereumConfigUpdate(raw) {
  const record = sanitizeRecord(raw);
  if (!record) {
    return;
  }
  if (record.destination && typeof record.destination === 'string') {
    ethState.destinationFromConfig = record.destination;
    if (ethDestinationInput && !ethDestinationInput.value) {
      ethDestinationInput.value = record.destination;
    }
  }
}

function ensureEthereumAvailability() {
  if (typeof window === 'undefined' || !window.ethereum) {
    updateEthStatus('Install MetaMask to send Ethereum payments.', 'error');
    return false;
  }
  return true;
}

function updateEthStatus(message, tone) {
  if (!ethStatus) {
    return;
  }
  ethStatus.textContent = message;
  ethStatus.classList.remove('eth-status--error', 'eth-status--success');
  if (tone === 'error') {
    ethStatus.classList.add('eth-status--error');
  } else if (tone === 'success') {
    ethStatus.classList.add('eth-status--success');
  }
}

function handleAccountsChanged(accounts) {
  const nextAccount = Array.isArray(accounts) && accounts.length ? accounts[0] : null;
  ethState.account = nextAccount;
  if (ethAccountLabel) {
    ethAccountLabel.textContent = nextAccount ? shortenAddress(nextAccount) : 'Not connected';
  }
}

function handleChainChanged(chainId) {
  if (!chainId) {
    return;
  }
  ethState.chainId = typeof chainId === 'string' ? chainId : String(chainId);
  if (ethNetworkLabel) {
    ethNetworkLabel.textContent = chainNameFromId(ethState.chainId);
  }
}

async function connectMetaMask() {
  if (!ensureEthereumAvailability()) {
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    handleAccountsChanged(accounts);
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    handleChainChanged(chainId);
    updateEthStatus('Connected to MetaMask. You can now send an Ethereum payment.', 'success');
  } catch (err) {
    const message = err && err.code === 4001
      ? 'Connection request rejected in MetaMask.'
      : 'MetaMask connection failed. Please retry.';
    updateEthStatus(message, 'error');
    if (ethMessage) {
      ethMessage.textContent = '';
    }
  }
}

function ethToWei(amount) {
  if (amount === undefined || amount === null) {
    return null;
  }
  const value = String(amount).trim();
  if (!value) {
    return null;
  }
  if (!/^\d*(\.\d*)?$/.test(value)) {
    return null;
  }
  const [whole, fraction = ''] = value.split('.');
  const paddedFraction = (fraction || '').slice(0, 18).padEnd(18, '0');
  try {
    const wei = BigInt(whole || '0') * 10n ** 18n + BigInt(paddedFraction || '0');
    return wei;
  } catch (err) {
    console.warn('Unable to convert ETH amount to wei', err);
    return null;
  }
}

function formatEthFromWei(weiValue) {
  if (weiValue === undefined || weiValue === null) {
    return '0';
  }
  let wei = weiValue;
  if (typeof wei === 'string') {
    try {
      wei = BigInt(wei);
    } catch (err) {
      return '0';
    }
  }
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  if (!fraction) {
    return whole.toString();
  }
  return `${whole}.${fraction.slice(0, 6)}`;
}

function shortenAddress(address) {
  if (!address || typeof address !== 'string') {
    return 'Not connected';
  }
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function chainNameFromId(chainId) {
  const normalized = typeof chainId === 'string' && chainId.startsWith('0x')
    ? parseInt(chainId, 16).toString()
    : String(chainId || '');
  const known = {
    '1': 'Ethereum Mainnet',
    '5': 'Goerli',
    '11155111': 'Sepolia',
    '137': 'Polygon',
    '8453': 'Base',
    '10': 'Optimism',
    '42161': 'Arbitrum One'
  };
  return known[normalized] || `Chain ${normalized || 'unknown'}`;
}

async function handleEthPaymentSubmit(event) {
  event.preventDefault();

  if (!ethAmountInput || !ethDestinationInput) {
    return;
  }

  if (!ensureEthereumAvailability()) {
    return;
  }

  if (!ethState.account) {
    await connectMetaMask();
    if (!ethState.account) {
      return;
    }
  }

  const destination = ethDestinationInput.value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(destination)) {
    ethDestinationInput.focus();
    if (ethMessage) {
      ethMessage.textContent = 'Enter a valid Ethereum address (0x…).';
    }
    return;
  }

  const weiValue = ethToWei(ethAmountInput.value);
  if (!weiValue || weiValue <= 0) {
    ethAmountInput.focus();
    if (ethMessage) {
      ethMessage.textContent = 'Enter an amount greater than 0 ETH.';
    }
    return;
  }

  const note = ethNoteInput ? ethNoteInput.value.trim() : '';

  try {
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: ethState.account,
        to: destination,
        value: `0x${weiValue.toString(16)}`
      }]
    });

    const createdAt = new Date().toISOString();
    const amountEth = formatEthFromWei(weiValue);
    if (ethMessage) {
      ethMessage.textContent = `Submitted ${amountEth} ETH. Confirm in MetaMask.`;
    }
    updateEthStatus('Payment submitted to MetaMask. Check your wallet to confirm.', 'success');

    const txId = txHash || (typeof Gun !== 'undefined' && Gun.text && typeof Gun.text.random === 'function'
      ? Gun.text.random(18)
      : Math.random().toString(36).slice(2, 12));
    writeRecordToSources(ethereumPaymentsSources, txId, {
      txHash: txHash || null,
      from: ethState.account,
      to: destination,
      amountEth,
      wei: weiValue.toString(),
      chainId: ethState.chainId,
      note,
      createdAt
    }, 'ethereum payment');

    if (ethPaymentForm) {
      ethPaymentForm.reset();
    }
    if (ethDestinationInput && ethState.destinationFromConfig) {
      ethDestinationInput.value = ethState.destinationFromConfig;
    }
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    updateEthStatus('MetaMask declined or hit an error.', 'error');
    if (ethMessage) {
      ethMessage.textContent = `Transaction failed: ${message}`;
    }
  }
}

function handleEthPaymentUpdate(data, key) {
  if (!key || key === '_') {
    return;
  }

  if (!data) {
    ethPayments.delete(key);
    renderEthPayments();
    return;
  }

  const record = sanitizeRecord(data);
  if (!record) {
    ethPayments.delete(key);
    renderEthPayments();
    return;
  }

  ethPayments.set(key, {
    ...record,
    id: key
  });
  renderEthPayments();
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

function handlePayableUpdate(data, key) {
  if (!key || key === '_') {
    return;
  }

  if (!data) {
    payables.delete(key);
    renderPayables();
    return;
  }

  const record = sanitizeRecord(data);
  if (!record) {
    payables.delete(key);
    renderPayables();
    return;
  }

  payables.set(key, {
    ...record,
    id: key
  });
  renderPayables();
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

  writeRecordToSources(financeLedgerSources, entryId, record, 'ledger entry');
  form.reset();
  dateInput.value = record.date;
}

function handlePayableSubmit(event) {
  event.preventDefault();

  if (!payeeInput || !payableAmountInput || !dueDateInput || !payableNotesInput) {
    return;
  }

  const payee = payeeInput.value.trim();
  if (!payee) {
    payeeInput.focus();
    payeeInput.setCustomValidity('Please enter who the payment is for.');
    payeeInput.reportValidity();
    return;
  }
  payeeInput.setCustomValidity('');

  const amount = normalizeAmount(payableAmountInput.value);
  if (amount <= 0) {
    payableAmountInput.focus();
    payableAmountInput.setCustomValidity('Please enter an amount greater than 0.');
    payableAmountInput.reportValidity();
    return;
  }
  payableAmountInput.setCustomValidity('');

  const payableId = typeof Gun !== 'undefined' && Gun.text && typeof Gun.text.random === 'function'
    ? Gun.text.random(16)
    : Math.random().toString(36).slice(2, 10);
  const now = new Date();
  const record = {
    payee,
    amount,
    dueDate: dueDateInput.value || defaultDate(),
    notes: payableNotesInput.value.trim(),
    createdAt: now.toISOString(),
    settledAt: null
  };

  writeRecordToSources(financePayablesSources, payableId, record, 'payable');

  payableForm.reset();
  payeeInput.focus();
  dueDateInput.value = record.dueDate;
}

function renderEthPayments() {
  if (!ethPaymentLog) {
    return;
  }

  const sorted = Array.from(ethPayments.values()).sort((a, b) => {
    const aStamp = Date.parse(a.createdAt || 0);
    const bStamp = Date.parse(b.createdAt || 0);
    if (Number.isNaN(aStamp) || Number.isNaN(bStamp)) {
      return 0;
    }
    return bStamp - aStamp;
  });

  ethPaymentLog.innerHTML = '';

  if (sorted.length === 0) {
    if (ethLogEmpty) {
      ethLogEmpty.hidden = false;
      ethPaymentLog.append(ethLogEmpty);
    }
    return;
  }

  if (ethLogEmpty) {
    ethLogEmpty.hidden = true;
  }

  sorted.forEach(payment => {
    const container = document.createElement('article');
    container.className = 'eth-log__item';
    container.setAttribute('role', 'listitem');

    const meta = document.createElement('p');
    meta.className = 'eth-log__meta';
    const amount = payment.amountEth || formatEthFromWei(payment.wei || payment.amountWei || 0);
    const chainLabel = chainNameFromId(payment.chainId);
    const created = payment.createdAt ? new Date(payment.createdAt) : null;
    const createdLabel = created && !Number.isNaN(created.getTime())
      ? created.toLocaleString()
      : 'Recently logged';
    meta.textContent = `${amount} ETH → ${shortenAddress(payment.to)} • ${chainLabel} • ${createdLabel}`;
    container.append(meta);

    if (payment.note) {
      const note = document.createElement('p');
      note.className = 'eth-log__meta';
      note.textContent = payment.note;
      container.append(note);
    }

    const hash = payment.txHash || payment.id;
    if (hash) {
      const hashLine = document.createElement('p');
      hashLine.className = 'eth-log__hash';
      hashLine.textContent = `Tx: ${hash}`;
      container.append(hashLine);
    }

    ethPaymentLog.append(container);
  });
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

function renderPayables() {
  if (!payablesList) {
    return;
  }

  const sorted = Array.from(payables.values()).sort((a, b) => {
    const aSettled = Boolean(a.settledAt);
    const bSettled = Boolean(b.settledAt);
    if (aSettled !== bSettled) {
      return aSettled ? 1 : -1;
    }
    const aStamp = Date.parse(a.dueDate || a.createdAt || 0);
    const bStamp = Date.parse(b.dueDate || b.createdAt || 0);
    if (Number.isNaN(aStamp) || Number.isNaN(bStamp)) {
      const aCreated = Date.parse(a.createdAt || 0);
      const bCreated = Date.parse(b.createdAt || 0);
      if (Number.isNaN(aCreated) || Number.isNaN(bCreated)) {
        return 0;
      }
      return aCreated - bCreated;
    }
    return aStamp - bStamp;
  });

  payablesList.innerHTML = '';

  if (sorted.length === 0) {
    if (payablesEmptyState) {
      payablesEmptyState.hidden = false;
      payablesList.append(payablesEmptyState);
    }
    if (outstandingAmount) {
      outstandingAmount.textContent = numberFormatter.format(0);
    }
    if (nextPayable) {
      nextPayable.textContent = 'No payables logged';
    }
    return;
  }

  if (payablesEmptyState) {
    payablesEmptyState.hidden = true;
  }

  let outstandingTotal = 0;
  let upcoming = null;

  sorted.forEach(entry => {
    const container = document.createElement('article');
    container.className = 'finance-entry finance-payable';
    if (entry.settledAt) {
      container.classList.add('finance-payable--settled');
    }
    container.setAttribute('role', 'listitem');

    const header = document.createElement('div');
    header.className = 'finance-entry__header';

    const title = document.createElement('h3');
    title.className = 'finance-entry__title';
    title.textContent = entry.payee || 'Unnamed payee';

    const amountLabel = document.createElement('span');
    amountLabel.className = 'finance-entry__amount';
    amountLabel.textContent = numberFormatter.format(normalizeAmount(entry.amount));

    header.append(title, amountLabel);

    const meta = document.createElement('p');
    meta.className = 'finance-entry__meta';
    const dueDate = entry.dueDate ? new Date(entry.dueDate) : new Date(entry.createdAt || Date.now());
    const formattedDue = Number.isNaN(dueDate.getTime()) ? 'No due date' : dueDate.toLocaleDateString();
    if (entry.settledAt) {
      const settledDate = new Date(entry.settledAt);
      const formattedSettled = Number.isNaN(settledDate.getTime()) ? 'Settled' : `Settled ${settledDate.toLocaleDateString()}`;
      meta.textContent = `${formattedDue} • ${formattedSettled}`;
    } else {
      meta.textContent = `${formattedDue} • Pending payment`;
    }

    container.append(header, meta);

    if (entry.notes) {
      const notes = document.createElement('p');
      notes.className = 'finance-entry__notes';
      notes.textContent = entry.notes;
      container.append(notes);
    }

    if (!entry.settledAt) {
      const actions = document.createElement('div');
      actions.className = 'finance-payable__actions';
      const settleButton = document.createElement('button');
      settleButton.type = 'button';
      settleButton.className = 'finance-button finance-button--secondary';
      settleButton.textContent = 'Mark as paid';
      settleButton.addEventListener('click', () => {
        markPayableSettled(entry.id);
      });
      actions.append(settleButton);
      container.append(actions);
      if (!upcoming) {
        upcoming = entry;
      }
      outstandingTotal += normalizeAmount(entry.amount);
    }

    payablesList.append(container);
  });

  if (outstandingAmount) {
    outstandingAmount.textContent = numberFormatter.format(outstandingTotal);
  }

  if (nextPayable) {
    if (!upcoming) {
      nextPayable.textContent = 'All payables settled';
    } else {
      const dueDate = upcoming.dueDate ? new Date(upcoming.dueDate) : new Date(upcoming.createdAt || Date.now());
      const formattedDue = Number.isNaN(dueDate.getTime()) ? 'Due soon' : dueDate.toLocaleDateString();
      nextPayable.textContent = `${upcoming.payee || 'Unnamed payee'} • ${formattedDue} • ${numberFormatter.format(normalizeAmount(upcoming.amount))}`;
    }
  }
}

function markPayableSettled(identifier) {
  if (!identifier) {
    return;
  }

  const entry = payables.get(identifier);
  if (!entry) {
    return;
  }

  const { id, ...rest } = entry;
  if (rest.settledAt) {
    return;
  }

  writeRecordToSources(financePayablesSources, id, {
    ...rest,
    settledAt: new Date().toISOString()
  }, 'payable settlement');
}
