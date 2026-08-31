const CLOSED_CLIENT_STATUSES = new Set(['lost']);
const ACTIVE_CLIENT_STATUSES = new Set(['active', 'won']);

export const FREELANCE_GIG_STATUSES = Object.freeze([
  'Lead',
  'Quoted',
  'Booked',
  'Completed',
  'Cancelled',
]);

export const FREELANCE_PAYMENT_STATUSES = Object.freeze([
  'Not invoiced',
  'Invoiced',
  'Paid',
]);

export function normalizeDateKey(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 10);
}

export function normalizeFreelanceClient(record = {}) {
  return {
    ...record,
    id: String(record.id || '').trim(),
    name: String(record.name || '').trim(),
    company: String(record.company || '').trim(),
    email: String(record.email || '').trim(),
    phone: String(record.phone || '').trim(),
    status: String(record.status || 'Lead').trim() || 'Lead',
    warmth: String(record.warmth || '').trim().toLowerCase(),
    freelanceRole: String(record.freelanceRole || '').trim(),
    freelanceRate: String(record.freelanceRate || '').trim(),
    source: String(record.source || '').trim(),
    nextBestAction: String(record.nextBestAction || '').trim(),
    nextFollowUp: normalizeDateKey(record.nextFollowUp || record.nextFollowup || ''),
    lastContacted: String(record.lastContacted || '').trim(),
    notes: String(record.notes || '').trim(),
  };
}

export function normalizeFreelanceGig(record = {}) {
  return {
    ...record,
    id: String(record.id || '').trim(),
    clientId: String(record.clientId || '').trim(),
    clientName: String(record.clientName || '').trim(),
    title: String(record.title || '').trim(),
    role: String(record.role || '').trim(),
    venue: String(record.venue || '').trim(),
    startDate: normalizeDateKey(record.startDate || record.date || ''),
    endDate: normalizeDateKey(record.endDate || record.startDate || record.date || ''),
    rate: String(record.rate || '').trim(),
    status: String(record.status || 'Booked').trim() || 'Booked',
    paymentStatus: String(record.paymentStatus || 'Not invoiced').trim() || 'Not invoiced',
    notes: String(record.notes || '').trim(),
  };
}

export function isClientClosed(record = {}) {
  return CLOSED_CLIENT_STATUSES.has(String(record.status || '').trim().toLowerCase());
}

export function isClientActive(record = {}) {
  return ACTIVE_CLIENT_STATUSES.has(String(record.status || '').trim().toLowerCase());
}

export function isFollowUpDue(record = {}, today = new Date()) {
  const date = normalizeDateKey(record.nextFollowUp || record.nextFollowup || '');
  const todayKey = normalizeDateKey(today instanceof Date ? today.toISOString() : today);
  return Boolean(date && todayKey && date <= todayKey && !isClientClosed(record));
}

export function getClientPriority(record = {}, today = new Date()) {
  const client = normalizeFreelanceClient(record);
  let score = 0;
  if (isFollowUpDue(client, today)) score += 100;
  if (client.warmth === 'hot') score += 60;
  if (client.warmth === 'warm') score += 25;
  if (String(client.status).toLowerCase() === 'negotiating') score += 45;
  if (client.nextBestAction) score += 12;
  if (!client.lastContacted) score += 10;
  return score;
}

function compareClientPriority(a, b, today) {
  const delta = getClientPriority(b, today) - getClientPriority(a, today);
  if (delta !== 0) return delta;
  const aFollow = a.nextFollowUp || '9999-12-31';
  const bFollow = b.nextFollowUp || '9999-12-31';
  if (aFollow !== bFollow) return aFollow.localeCompare(bFollow);
  return a.name.localeCompare(b.name);
}

function isUpcomingGig(gig, todayKey) {
  const status = gig.status.toLowerCase();
  return Boolean(
    gig.startDate
    && gig.startDate >= todayKey
    && status !== 'cancelled'
    && status !== 'lead'
  );
}

function isUnpaidGig(gig) {
  const status = gig.status.toLowerCase();
  const payment = gig.paymentStatus.toLowerCase();
  return status === 'completed' && payment !== 'paid';
}

export function buildFreelancerDashboard({ clients = [], gigs = [], today = new Date() } = {}) {
  const todayKey = normalizeDateKey(today instanceof Date ? today.toISOString() : today);
  const cleanClients = clients
    .map(normalizeFreelanceClient)
    .filter(client => client.id && client.name);
  const cleanGigs = gigs
    .map(normalizeFreelanceGig)
    .filter(gig => gig.id);

  const dueClients = cleanClients
    .filter(client => isFollowUpDue(client, todayKey))
    .sort((a, b) => compareClientPriority(a, b, todayKey));

  const activeClients = cleanClients
    .filter(client => isClientActive(client))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pipelineClients = cleanClients
    .filter(client => !isClientClosed(client))
    .sort((a, b) => compareClientPriority(a, b, todayKey));

  const upcomingGigs = cleanGigs
    .filter(gig => isUpcomingGig(gig, todayKey))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const unpaidGigs = cleanGigs
    .filter(isUnpaidGig)
    .sort((a, b) => b.endDate.localeCompare(a.endDate));

  return {
    todayKey,
    clients: cleanClients,
    gigs: cleanGigs,
    dueClients,
    activeClients,
    pipelineClients,
    upcomingGigs,
    unpaidGigs,
    metrics: {
      clients: cleanClients.length,
      due: dueClients.length,
      active: activeClients.length,
      booked: upcomingGigs.filter(gig => gig.status.toLowerCase() === 'booked').length,
      unpaid: unpaidGigs.length,
    },
  };
}
