const DEFAULT_LOAN_PERSON = 'Thomas Stephens';
const peers = window.__GUN_PEERS__ || [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];

function createGun() {
  if (typeof Gun !== 'function') return null;
  try {
    return Gun({ peers });
  } catch (error) {
    console.warn('Standings Gun init failed; retrying without browser storage.', error);
    try {
      return Gun({ peers, radisk: false, localStorage: false });
    } catch (fallbackError) {
      console.warn('Standings Gun fallback failed.', fallbackError);
      return null;
    }
  }
}

const gun = createGun();
const primaryRoot = gun?.get?.('3dvr-portal')?.get?.('finance')?.get?.('standings');
const legacyRoot = gun?.get?.('finance')?.get?.('standings');
const standingSources = [primaryRoot, legacyRoot].filter(Boolean);
const entries = new Map();
let financing = { loaded: false, fundingCents: 0, repaymentsCents: 0, depositsCents: 0, loans: [], updatedAt: null };

const $ = id => document.getElementById(id);
const form = $('standing-form');
const personInput = $('standing-person');
const amountInput = $('standing-amount');
const dateInput = $('standing-date');
const kindInput = $('standing-kind');
const noteInput = $('standing-note');
const receivableEl = $('standings-receivable');
const payableEl = $('standings-payable');
const netEl = $('standings-net');
const statusEl = $('standings-status');
const peopleEl = $('standings-people');
const peopleEmpty = $('standings-people-empty');
const historyEl = $('standings-history');
const historyEmpty = $('standings-history-empty');
const loanFundingEl = $('loan-funding');
const loanRepaymentsEl = $('loan-repayments');
const loanDepositsEl = $('loan-deposits');
const loanStatusEl = $('loan-status');
const loanRefresh = $('loan-refresh');

dateInput.value = new Date().toISOString().slice(0, 10);

function currency(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
}

function formatDate(value) {
  const stamp = Date.parse(value || '');
  if (!Number.isFinite(stamp)) return value || 'Unknown date';
  return new Date(stamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function cleanRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const record = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (key !== '_' && typeof value !== 'function') record[key] = value;
  });
  return record;
}

function signedChange(entry) {
  const cents = Math.max(0, Math.round(Number(entry.amountCents) || 0));
  if (entry.kind === 'person_owes_company' || entry.kind === 'company_repaid_person') return cents;
  if (entry.kind === 'person_repaid_company' || entry.kind === 'company_owes_person') return -cents;
  return Number(entry.changeCents) || 0;
}

function labelForKind(kind) {
  return {
    person_owes_company: 'Person received company money',
    person_repaid_company: 'Person paid / credited 3DVR',
    company_owes_person: 'Person covered a company cost',
    company_repaid_person: '3DVR reimbursed person'
  }[kind] || 'Standing adjustment';
}

function personKey(name) {
  return String(name || '').trim().toLocaleLowerCase();
}

function buildStandings() {
  const byPerson = new Map();
  if (financing.fundingCents > 0) {
    byPerson.set(personKey(DEFAULT_LOAN_PERSON), {
      name: DEFAULT_LOAN_PERSON,
      balanceCents: financing.fundingCents,
      lastActivity: financing.updatedAt,
      derivedFundingCents: financing.fundingCents,
      entryCount: 0
    });
  }
  entries.forEach(entry => {
    const name = String(entry.person || '').trim();
    if (!name) return;
    const key = personKey(name);
    const existing = byPerson.get(key) || { name, balanceCents: 0, lastActivity: null, derivedFundingCents: 0, entryCount: 0 };
    existing.balanceCents += signedChange(entry);
    existing.entryCount += 1;
    const activity = entry.date || entry.createdAt;
    if (!existing.lastActivity || Date.parse(activity || 0) > Date.parse(existing.lastActivity || 0)) existing.lastActivity = activity;
    byPerson.set(key, existing);
  });
  return Array.from(byPerson.values()).sort((a, b) => Math.abs(b.balanceCents) - Math.abs(a.balanceCents));
}

function render() {
  const standings = buildStandings();
  const receivable = standings.reduce((sum, item) => sum + Math.max(item.balanceCents, 0), 0);
  const payable = standings.reduce((sum, item) => sum + Math.max(-item.balanceCents, 0), 0);
  receivableEl.textContent = currency(receivable);
  payableEl.textContent = currency(payable);
  netEl.textContent = currency(receivable - payable);
  statusEl.textContent = entries.size
    ? `${entries.size} internal ledger entr${entries.size === 1 ? 'y' : 'ies'} plus verified Stripe loan evidence.`
    : financing.fundingCents > 0
      ? `Stripe funding is provisionally assigned to ${DEFAULT_LOAN_PERSON}; no manual internal adjustments are recorded yet.`
      : 'No internal standing entries are recorded yet.';

  peopleEl.innerHTML = '';
  if (!standings.length) {
    peopleEmpty.hidden = false;
    peopleEl.append(peopleEmpty);
  } else {
    peopleEmpty.hidden = true;
    standings.forEach(item => {
      const card = document.createElement('article');
      card.className = 'finance-entry';
      card.setAttribute('role', 'listitem');
      const header = document.createElement('div');
      header.className = 'finance-entry__header';
      const titleGroup = document.createElement('div');
      titleGroup.className = 'finance-entry__title-group';
      const title = document.createElement('h3');
      title.className = 'finance-entry__title';
      title.textContent = item.name;
      const meta = document.createElement('p');
      meta.className = 'finance-entry__meta';
      meta.textContent = item.balanceCents > 0 ? 'Owes 3DVR' : item.balanceCents < 0 ? '3DVR owes them' : 'Settled';
      titleGroup.append(title, meta);
      const amount = document.createElement('span');
      amount.className = `finance-entry__amount ${item.balanceCents > 0 ? 'finance-entry__amount--negative' : item.balanceCents < 0 ? 'finance-entry__amount--positive' : 'finance-entry__amount--neutral'}`;
      amount.textContent = currency(Math.abs(item.balanceCents));
      header.append(titleGroup, amount);
      const notes = document.createElement('p');
      notes.className = 'finance-entry__notes';
      const parts = [];
      if (item.derivedFundingCents > 0) parts.push(`${currency(item.derivedFundingCents)} verified Stripe funding provisionally assigned from the financing ledger`);
      if (item.entryCount) parts.push(`${item.entryCount} manual ledger entr${item.entryCount === 1 ? 'y' : 'ies'}`);
      if (item.lastActivity) parts.push(`Latest ${formatDate(item.lastActivity)}`);
      notes.textContent = parts.join(' • ');
      card.append(header, notes);
      peopleEl.append(card);
    });
  }
  renderHistory();
}

function renderHistory() {
  historyEl.innerHTML = '';
  const list = Array.from(entries.values()).sort((a, b) => Date.parse(b.date || b.createdAt || 0) - Date.parse(a.date || a.createdAt || 0));
  if (!list.length) {
    historyEmpty.hidden = false;
    historyEl.append(historyEmpty);
    return;
  }
  historyEmpty.hidden = true;
  list.forEach(entry => {
    const card = document.createElement('article');
    card.className = 'finance-entry';
    const header = document.createElement('div');
    header.className = 'finance-entry__header';
    const titleGroup = document.createElement('div');
    titleGroup.className = 'finance-entry__title-group';
    const title = document.createElement('h3');
    title.className = 'finance-entry__title';
    title.textContent = entry.person || 'Unknown person';
    const meta = document.createElement('p');
    meta.className = 'finance-entry__meta';
    meta.textContent = `${labelForKind(entry.kind)} • ${formatDate(entry.date || entry.createdAt)}`;
    titleGroup.append(title, meta);
    const amount = document.createElement('span');
    const change = signedChange(entry);
    amount.className = `finance-entry__amount ${change > 0 ? 'finance-entry__amount--negative' : 'finance-entry__amount--positive'}`;
    amount.textContent = `${change > 0 ? '+' : '−'}${currency(Math.abs(change))}`;
    header.append(titleGroup, amount);
    const notes = document.createElement('p');
    notes.className = 'finance-entry__notes';
    notes.textContent = entry.note || 'No note supplied.';
    card.append(header, notes);
    historyEl.append(card);
  });
}

function handleStandingUpdate(raw, id) {
  if (!id || id === '_') return;
  if (!raw) entries.delete(id);
  else {
    const record = cleanRecord(raw);
    if (record) entries.set(id, { ...record, id });
  }
  render();
}

standingSources.forEach(source => source?.map?.().on?.(handleStandingUpdate));

form.addEventListener('submit', event => {
  event.preventDefault();
  const person = personInput.value.trim();
  const amountCents = Math.round(Number(amountInput.value) * 100);
  if (!person || !Number.isFinite(amountCents) || amountCents <= 0) return;
  const id = typeof Gun !== 'undefined' && Gun.text?.random ? Gun.text.random(18) : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const record = {
    person,
    amountCents,
    kind: kindInput.value,
    date: dateInput.value || new Date().toISOString().slice(0, 10),
    note: noteInput.value.trim(),
    createdAt: new Date().toISOString()
  };
  if (!standingSources.length) {
    statusEl.textContent = 'The shared Gun ledger is unavailable, so this entry was not saved.';
    statusEl.classList.add('finance-helper--error');
    return;
  }
  standingSources.forEach((source, index) => source.get(id).put(record, ack => {
    if (index === 0 && ack?.err) {
      statusEl.textContent = `Could not save standing entry: ${ack.err}`;
      statusEl.classList.add('finance-helper--error');
    }
  }));
  form.reset();
  dateInput.value = record.date;
});

function totalsCents(totals) {
  if (!totals || typeof totals !== 'object') return 0;
  return Object.values(totals).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

async function fetchFinancing() {
  loanRefresh.disabled = true;
  loanRefresh.textContent = 'Refreshing…';
  loanStatusEl.classList.remove('finance-helper--error');
  loanStatusEl.textContent = 'Reconciling Stripe financing movements…';
  try {
    const response = await fetch('/api/stripe/financing');
    if (!response.ok) throw new Error(`Stripe API responded with ${response.status}`);
    const payload = await response.json();
    financing = {
      loaded: true,
      fundingCents: totalsCents(payload.summary?.funding),
      repaymentsCents: totalsCents(payload.summary?.repayments),
      depositsCents: totalsCents(payload.summary?.paydownDeposits),
      loans: Array.isArray(payload.loans) ? payload.loans : [],
      updatedAt: payload.updatedAt || new Date().toISOString()
    };
    loanFundingEl.textContent = currency(financing.fundingCents);
    loanRepaymentsEl.textContent = currency(financing.repaymentsCents);
    loanDepositsEl.textContent = currency(financing.depositsCents);
    const loanIds = financing.loans.map(loan => loan.loanId).filter(Boolean);
    const unmatched = financing.loans.some(loan => !loan.loanId);
    if (financing.fundingCents > 0) {
      loanStatusEl.textContent = `${loanIds.length ? `${loanIds.length} Stripe loan${loanIds.length === 1 ? '' : 's'} found. ` : ''}${currency(financing.fundingCents)} verified as financing funding; ${currency(financing.repaymentsCents)} has been classified as repayments.${unmatched ? ' Some financing rows still need review.' : ''}`;
    } else {
      loanStatusEl.textContent = `Financing activity exists, but no transaction is yet safely classified as original loan funding. Do not book a personal balance from the old “financing in” total.`;
    }
    render();
  } catch (error) {
    loanStatusEl.textContent = `Unable to load financing evidence: ${error.message}`;
    loanStatusEl.classList.add('finance-helper--error');
  } finally {
    loanRefresh.disabled = false;
    loanRefresh.textContent = 'Refresh evidence';
  }
}

loanRefresh.addEventListener('click', fetchFinancing);
fetchFinancing();
render();
