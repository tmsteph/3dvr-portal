const DEFAULT_LOAN_PERSON = 'Thomas Stephens';
const STRIPE_LOAN_OPENING_KIND = 'stripe_loan_opening';
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
const portalRoot = gun?.get?.('3dvr-portal');
const primaryRoot = portalRoot?.get?.('finance')?.get?.('standings');
const portalStatsRoot = portalRoot?.get?.('userStats');
const legacyRoot = gun?.get?.('finance')?.get?.('standings');
const standingSources = [primaryRoot, legacyRoot].filter(Boolean);
const entries = new Map();
const portalStats = new Map();
let financing = { loaded: false, fundingCents: 0, repaymentsCents: 0, depositsCents: 0, loans: [], updatedAt: null };
let contributions = { loaded: false, contributors: [], totalCents: 0, successfulPaymentCount: 0, startAt: null, updatedAt: null };
let accountBalance = { loaded: false, availableCents: 0, pendingCents: 0, updatedAt: null };

function stripeOpeningCents() {
  const explicit = Array.from(entries.values())
    .filter(entry => entry.kind === STRIPE_LOAN_OPENING_KIND && personKey(entry.person) === personKey(DEFAULT_LOAN_PERSON))
    .reduce((sum, entry) => sum + Math.max(0, signedChange(entry)), 0);
  return explicit || financing.fundingCents;
}

function defaultLoanContributor() {
  return contributions.contributors.find(contributor =>
    personKey(contributor.name) === personKey(DEFAULT_LOAN_PERSON)
    || (Array.isArray(contributor.portalAliases) && contributor.portalAliases.includes('tmsteph@3dvr'))
  ) || null;
}

function stripePersonalPaymentCreditCents() {
  return Math.min(stripeOpeningCents(), Math.max(0, Number(defaultLoanContributor()?.amountCents) || 0));
}

function loanReceivableCents() {
  return Math.max(0, stripeOpeningCents() - stripePersonalPaymentCreditCents());
}


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
const contributionTotalEl = $('contribution-total');
const portalPointsTotalEl = $('portal-points-total');
const projectedAccountValueEl = $('projected-account-value');
const pointDollarRatioEl = $('point-dollar-ratio');
const contributionStatusEl = $('contribution-status');
const contributionPeopleEl = $('contribution-people');
const contributionPeopleEmpty = $('contribution-people-empty');

dateInput.value = new Date().toISOString().slice(0, 10);

function currency(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
}

function formatPoints(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatPercent(value) {
  return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function usdCents(totals) {
  if (!totals || typeof totals !== 'object') return 0;
  return Number(totals.USD ?? totals.usd ?? 0) || 0;
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
  if (entry.kind === STRIPE_LOAN_OPENING_KIND) return Number(entry.changeCents) || cents;
  if (entry.kind === 'person_owes_company' || entry.kind === 'company_repaid_person') return cents;
  if (entry.kind === 'person_repaid_company' || entry.kind === 'company_owes_person') return -cents;
  return Number(entry.changeCents) || 0;
}

function labelForKind(kind) {
  return {
    person_owes_company: 'Person received company money',
    person_repaid_company: 'Person paid / credited 3DVR',
    company_owes_person: 'Person covered a company cost',
    company_repaid_person: '3DVR reimbursed person',
    [STRIPE_LOAN_OPENING_KIND]: 'Verified Stripe loan opening'
  }[kind] || 'Standing adjustment';
}

function personKey(name) {
  return String(name || '').trim().toLocaleLowerCase();
}

function buildStandings() {
  const byPerson = new Map();
  const hasExplicitStripeOpening = Array.from(entries.values())
    .some(entry => entry.kind === STRIPE_LOAN_OPENING_KIND);
  if (financing.fundingCents > 0 && !hasExplicitStripeOpening) {
    byPerson.set(personKey(DEFAULT_LOAN_PERSON), {
      name: DEFAULT_LOAN_PERSON,
      balanceCents: financing.fundingCents,
      lastActivity: financing.updatedAt,
      derivedFundingCents: financing.fundingCents,
      stripePersonalPaymentCreditCents: 0,
      entryCount: 0
    });
  }
  entries.forEach(entry => {
    const name = String(entry.person || '').trim();
    if (!name) return;
    const key = personKey(name);
    const existing = byPerson.get(key) || { name, balanceCents: 0, lastActivity: null, derivedFundingCents: 0, stripePersonalPaymentCreditCents: 0, entryCount: 0 };
    existing.balanceCents += signedChange(entry);
    existing.entryCount += 1;
    const activity = entry.date || entry.createdAt;
    if (!existing.lastActivity || Date.parse(activity || 0) > Date.parse(existing.lastActivity || 0)) existing.lastActivity = activity;
    byPerson.set(key, existing);
  });

  const opening = stripeOpeningCents();
  const credit = stripePersonalPaymentCreditCents();
  if (opening > 0 && credit > 0) {
    const key = personKey(DEFAULT_LOAN_PERSON);
    const existing = byPerson.get(key) || { name: DEFAULT_LOAN_PERSON, balanceCents: opening, lastActivity: financing.updatedAt, derivedFundingCents: opening, stripePersonalPaymentCreditCents: 0, entryCount: 0 };
    existing.balanceCents -= credit;
    existing.stripePersonalPaymentCreditCents = credit;
    if (!existing.lastActivity || Date.parse(financing.updatedAt || 0) > Date.parse(existing.lastActivity || 0)) existing.lastActivity = financing.updatedAt;
    byPerson.set(key, existing);
  }

  return Array.from(byPerson.values()).sort((a, b) => Math.abs(b.balanceCents) - Math.abs(a.balanceCents));
}

function render() {
  renderLoanStatus();
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
      if (item.derivedFundingCents > 0) parts.push(`${currency(item.derivedFundingCents)} verified Stripe advance`);
      if (item.stripePersonalPaymentCreditCents > 0) parts.push(`${currency(item.stripePersonalPaymentCreditCents)} personal Stripe payments credited against the advance`);
      if (item.entryCount) parts.push(`${item.entryCount} manual ledger entr${item.entryCount === 1 ? 'y' : 'ies'}`);
      if (item.lastActivity) parts.push(`Latest ${formatDate(item.lastActivity)}`);
      notes.textContent = parts.join(' • ');
      card.append(header, notes);
      peopleEl.append(card);
    });
  }
  renderContributionPoints();
  renderHistory();
}

function portalPointRecordForContributor(contributor) {
  const aliases = Array.isArray(contributor?.portalAliases)
    ? contributor.portalAliases.map(alias => String(alias || '').trim().toLowerCase()).filter(Boolean)
    : [];
  for (const alias of aliases) {
    const exact = portalStats.get(alias);
    if (exact) return exact;
  }
  const name = personKey(contributor?.name);
  if (!name) return null;
  return Array.from(portalStats.values()).find(record => personKey(record.username) === name) || null;
}

function portalPointsTotal() {
  return Array.from(portalStats.values()).reduce((sum, record) => sum + Math.max(0, Math.round(Number(record.points) || 0)), 0);
}

function renderContributionPoints() {
  const receivable = loanReceivableCents();
  const totalPoints = portalPointsTotal();
  const currentCashCents = Math.max(0, accountBalance.availableCents + accountBalance.pendingCents);
  const projectedAccountValueCents = currentCashCents + receivable;
  const dollarsPerPoint = totalPoints > 0 && accountBalance.loaded
    ? (projectedAccountValueCents / 100) / totalPoints
    : null;

  contributionTotalEl.textContent = contributions.loaded ? currency(contributions.totalCents) : '—';
  portalPointsTotalEl.textContent = formatPoints(totalPoints);
  projectedAccountValueEl.textContent = accountBalance.loaded ? currency(projectedAccountValueCents) : '—';
  pointDollarRatioEl.textContent = dollarsPerPoint === null ? '—' : `${currency(dollarsPerPoint * 100)} / point`;

  if (!contributions.loaded) {
    contributionStatusEl.textContent = 'Loading Stripe payments and portal points…';
  } else {
    const period = contributions.startAt ? ` since ${formatDate(contributions.startAt)}` : '';
    const cashNote = accountBalance.loaded ? ` Live Stripe cash is ${currency(currentCashCents)}.` : ' Live Stripe cash is unavailable.';
    contributionStatusEl.textContent = `${contributions.successfulPaymentCount} successful USD payment${contributions.successfulPaymentCount === 1 ? '' : 's'}${period}, totaling ${currency(contributions.totalCents)}.${cashNote} ${formatPoints(totalPoints)} existing portal points are used unchanged. Projected valuation adds Thomas’s ${currency(receivable)} receivable as restored cash; payments do not mint points.`;
  }

  contributionPeopleEl.innerHTML = '';
  const rows = [];
  const usedPortalAliases = new Set();

  contributions.contributors.forEach(contributor => {
    const pointRecord = portalPointRecordForContributor(contributor);
    if (pointRecord?.alias) usedPortalAliases.add(String(pointRecord.alias).trim().toLowerCase());
    rows.push({
      name: pointRecord?.username || contributor.name || contributor.aggregateKey || 'Unknown contributor',
      contributor,
      pointRecord
    });
  });

  portalStats.forEach(record => {
    const alias = String(record.alias || '').trim().toLowerCase();
    if (alias && usedPortalAliases.has(alias)) return;
    const matchedByName = rows.some(row => row.pointRecord && personKey(row.pointRecord.username) === personKey(record.username));
    if (matchedByName) return;
    rows.push({ name: record.username || record.alias || 'Portal user', contributor: null, pointRecord: record });
  });

  if (!rows.length) {
    contributionPeopleEmpty.hidden = false;
    contributionPeopleEl.append(contributionPeopleEmpty);
    return;
  }

  contributionPeopleEmpty.hidden = true;
  rows
    .sort((a, b) => {
      const pointDelta = (Number(b.pointRecord?.points) || 0) - (Number(a.pointRecord?.points) || 0);
      if (pointDelta) return pointDelta;
      return (Number(b.contributor?.amountCents) || 0) - (Number(a.contributor?.amountCents) || 0);
    })
    .forEach(row => {
      const points = Math.max(0, Math.round(Number(row.pointRecord?.points) || 0));
      const share = totalPoints > 0 ? points / totalPoints : 0;
      const projectedValueCents = dollarsPerPoint === null ? null : Math.round(points * dollarsPerPoint * 100);
      const contributor = row.contributor;

      const card = document.createElement('article');
      card.className = 'finance-entry';
      card.setAttribute('role', 'listitem');
      const header = document.createElement('div');
      header.className = 'finance-entry__header';
      const titleGroup = document.createElement('div');
      titleGroup.className = 'finance-entry__title-group';
      const title = document.createElement('h3');
      title.className = 'finance-entry__title';
      title.textContent = row.name;
      const meta = document.createElement('p');
      meta.className = 'finance-entry__meta';
      meta.textContent = row.pointRecord
        ? `${formatPoints(points)} portal points • ${formatPercent(share)} of portal points`
        : 'No linked portal points found';
      titleGroup.append(title, meta);
      const amount = document.createElement('span');
      amount.className = 'finance-entry__amount finance-entry__amount--positive';
      amount.textContent = contributor ? currency(contributor.amountCents) : '$0.00';
      header.append(titleGroup, amount);

      const notes = document.createElement('p');
      notes.className = 'finance-entry__notes';
      const noteParts = [];
      if (contributor) noteParts.push(`${contributor.paymentCount || 0} successful Stripe payment${contributor.paymentCount === 1 ? '' : 's'}`);
      else noteParts.push('No linked Stripe payments in this period');
      if (projectedValueCents !== null && row.pointRecord) noteParts.push(`${currency(projectedValueCents)} implied value at projected account value`);
      if (row.pointRecord?.alias) noteParts.push(`Portal ${row.pointRecord.alias}`);
      const emails = Array.isArray(contributor?.emails) ? contributor.emails.filter(Boolean) : [];
      if (emails.length) noteParts.push(emails.join(' + '));
      notes.textContent = noteParts.join(' • ');
      card.append(header, notes);
      contributionPeopleEl.append(card);
    });
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

function handlePortalStatsUpdate(raw, id) {
  if (!id || id === '_') return;
  const aliasKey = String(id || '').trim().toLowerCase();
  if (!raw) {
    portalStats.delete(aliasKey);
  } else {
    const record = cleanRecord(raw);
    if (record) {
      const alias = String(record.alias || id || '').trim();
      const points = Math.max(0, Math.round(Number(record.points) || 0));
      portalStats.set(aliasKey, {
        ...record,
        alias,
        username: String(record.username || alias || '').trim(),
        points
      });
    }
  }
  render();
}

portalStatsRoot?.map?.().on?.(handlePortalStatsUpdate);

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

function renderLoanStatus() {
  if (!financing.loaded) {
    loanStatusEl.textContent = 'Loading Stripe financing history…';
    return;
  }
  if (financing.fundingCents <= 0) {
    loanStatusEl.textContent = 'Financing activity exists, but no transaction is safely classified as the original loan funding.';
    return;
  }

  const loanIds = financing.loans.map(loan => loan.loanId).filter(Boolean);
  const unmatched = financing.loans.some(loan => !loan.loanId);
  const personalCredit = stripePersonalPaymentCreditCents();
  const principalRemaining = loanReceivableCents();
  const abovePrincipal = Math.max(0, financing.repaymentsCents - stripeOpeningCents());
  const personalPart = contributions.loaded
    ? ` ${currency(personalCredit)} of payments attributable to ${DEFAULT_LOAN_PERSON} are credited against the internal advance, leaving ${currency(principalRemaining)} owed to 3DVR.`
    : ' Waiting for the contribution ledger before calculating the internal receivable.';
  loanStatusEl.textContent = `${loanIds.length ? `${loanIds.length} Stripe loan${loanIds.length === 1 ? '' : 's'} found. ` : ''}${currency(financing.fundingCents)} verified advance; ${currency(financing.repaymentsCents)} has been repaid to Stripe from account activity.${personalPart}${abovePrincipal ? ` ${currency(abovePrincipal)} was paid above principal as financing cost.` : ''}${unmatched ? ' Some financing rows still need review.' : ''}`;
}

async function fetchFinancing() {
  loanStatusEl.classList.remove('finance-helper--error');
  try {
    const response = await fetch('/api/stripe/financing');
    if (!response.ok) throw new Error(`Stripe API responded with ${response.status}`);
    const payload = await response.json();
    const classifiedFunding = totalsCents(payload.summary?.funding);
    const payoutFunding = Array.isArray(payload.transactions)
      ? payload.transactions.reduce((sum, row) => {
          const isFlexLoanPayout = row?.type === 'financing_payout' && row?.sourceObject === 'flex_loan_payout';
          return sum + (isFlexLoanPayout ? Math.max(0, Number(row.net) || Number(row.amount) || 0) : 0);
        }, 0)
      : 0;
    financing = {
      loaded: true,
      fundingCents: classifiedFunding || payoutFunding,
      repaymentsCents: totalsCents(payload.summary?.repayments),
      depositsCents: totalsCents(payload.summary?.paydownDeposits),
      loans: Array.isArray(payload.loans) ? payload.loans : [],
      updatedAt: payload.updatedAt || new Date().toISOString()
    };
    loanFundingEl.textContent = currency(financing.fundingCents);
    loanRepaymentsEl.textContent = currency(financing.repaymentsCents);
    loanDepositsEl.textContent = currency(financing.depositsCents);
    render();
  } catch (error) {
    loanStatusEl.textContent = `Unable to load financing evidence: ${error.message}`;
    loanStatusEl.classList.add('finance-helper--error');
    throw error;
  }
}

async function fetchContributions() {
  contributionStatusEl.classList.remove('finance-helper--error');
  try {
    const response = await fetch('/api/stripe/contributions');
    if (!response.ok) throw new Error(`Stripe API responded with ${response.status}`);
    const payload = await response.json();
    contributions = {
      loaded: true,
      contributors: Array.isArray(payload.contributors) ? payload.contributors : [],
      totalCents: Math.max(0, Number(payload.totalCents) || 0),
      successfulPaymentCount: Math.max(0, Number(payload.successfulPaymentCount) || 0),
      startAt: payload.startAt || null,
      updatedAt: payload.updatedAt || new Date().toISOString()
    };
    render();
  } catch (error) {
    contributionStatusEl.textContent = `Unable to load Stripe payment ledger: ${error.message}`;
    contributionStatusEl.classList.add('finance-helper--error');
    throw error;
  }
}

async function fetchAccountBalance() {
  try {
    const response = await fetch('/api/stripe/metrics');
    if (!response.ok) throw new Error(`Stripe API responded with ${response.status}`);
    const payload = await response.json();
    accountBalance = {
      loaded: true,
      availableCents: usdCents(payload.available),
      pendingCents: usdCents(payload.pending),
      updatedAt: new Date().toISOString()
    };
    render();
  } catch (error) {
    accountBalance = { ...accountBalance, loaded: false };
    render();
    throw error;
  }
}

async function refreshAccountData() {
  loanRefresh.disabled = true;
  loanRefresh.textContent = 'Refreshing…';
  await Promise.allSettled([fetchFinancing(), fetchContributions(), fetchAccountBalance()]);
  loanRefresh.disabled = false;
  loanRefresh.textContent = 'Refresh account data';
  render();
}

loanRefresh.addEventListener('click', refreshAccountData);
refreshAccountData();
render();
