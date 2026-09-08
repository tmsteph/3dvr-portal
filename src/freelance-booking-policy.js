export const FREELANCE_BOOKING_POLICY = Object.freeze([
  {
    id: 'rest-target',
    level: 'target',
    title: 'Aim for 4 workdays / 3 days off',
    summary: 'Protect family and recovery time when the income mix supports it.',
  },
  {
    id: 'rest-minimum',
    level: 'hard',
    title: 'Minimum 2 real days off each week',
    summary: 'Prefer consecutive days. Do not fill every open square just to stay busy.',
  },
  {
    id: 'outside-first',
    level: 'priority',
    title: 'Union and better freelance work beat Encore',
    summary: 'Encore is the stable fallback, not the booking target.',
  },
  {
    id: 'encore-window',
    level: 'hard',
    title: 'Protect Encore inside 14 days',
    summary: 'Confirmed Encore shifts inside the next two weeks are treated as real conflicts.',
  },
  {
    id: 'encore-soft',
    level: 'priority',
    title: 'Ignore distant Encore onesies / twosies for availability',
    summary: 'More than 14 days out, a week with only 1–2 Encore days stays open to better union or freelance work.',
  },
  {
    id: 'release-first',
    level: 'hard',
    title: 'Never assume Encore released a date',
    summary: 'When better work wins a conflict, request the release or time off before calling it resolved.',
  },
  {
    id: 'rate-quality',
    level: 'priority',
    title: 'Optimize income per day, not days worked',
    summary: 'Outside work should meaningfully beat the Encore baseline or create a valuable long-term relationship.',
  },
  {
    id: 'role-priority',
    level: 'priority',
    title: 'Lead with specialist AV roles',
    summary: 'A1 / A2 / audio systems / RF first; then V1, V2, Graphics, Camera, and technical lead work.',
  },
  {
    id: 'relationships',
    level: 'system',
    title: 'Warm relationships before endless cold applications',
    summary: 'Track PMs, crew leads, rosters, last touch, rates, and the next action in one place.',
  },
  {
    id: 'sync',
    level: 'system',
    title: 'Refresh availability every 3 days',
    summary: 'Reconcile Lighthouse, confirmed outside work, protected rest, and IATSE availability.',
  },
]);

export const DEFAULT_FREELANCE_SOURCES = Object.freeze([
  { id: 'iatse-122', priority: 1, name: 'IATSE Local 122', kind: 'Union', status: 'Active', login: 'Ready', onboarding: 'Active', rate: 'Union / call rate', lastAction: 'Availability portal connected', nextAction: 'Sync availability every 3 days', url: 'https://member.iatse.io/avail' },
  { id: 'avlancer', priority: 2, name: 'AVLancer', kind: 'Staffing portal', status: 'Verify', login: 'Verify', onboarding: 'Verify', rate: '', lastAction: 'Signup work started', nextAction: 'Confirm account and finish roster profile' },
  { id: 'lasso-crew', priority: 3, name: 'Lasso Crew', kind: 'Staffing portal', status: 'Verify', login: 'Verify', onboarding: 'Verify', rate: '', lastAction: 'Application automation used', nextAction: 'Confirm roster status and available calls' },
  { id: 'turnkey', priority: 4, name: 'TurnKey', kind: 'Production company', status: 'Applied', login: 'N/A', onboarding: 'Applied', rate: '', lastAction: 'Application submitted', nextAction: 'Follow up and watch for crew calls' },
  { id: 'show-imaging', priority: 5, name: 'Show Imaging', kind: 'Production company', status: 'Target', login: 'N/A', onboarding: 'Reconnect', rate: '', lastAction: '', nextAction: 'Re-engage roster / production contacts' },
  { id: 'creative-technology', priority: 6, name: 'Creative Technology', kind: 'Production company', status: 'Warm', login: 'N/A', onboarding: 'Outreach', rate: '', lastAction: 'Direct outreach sent', nextAction: 'Continue follow-up with production contacts' },
  { id: 'hands-on-labor', priority: 7, name: 'Hands On Labor', kind: 'Staffing company', status: 'Known', login: 'N/A', onboarding: 'Contacted', rate: '~$35/hr stagehand', lastAction: 'In-person contact', nextAction: 'Use selectively when rate / schedule makes sense' },
  { id: 'show-ready-avs', priority: 8, name: 'Show Ready / AVS', kind: 'Staffing / production', status: 'Verify', login: 'Verify', onboarding: 'Verify', rate: '', lastAction: '', nextAction: 'Confirm current roster and login status' },
  { id: 'power-plus', priority: 9, name: 'Power Plus', kind: 'Production company', status: 'Research', login: 'N/A', onboarding: 'Research', rate: '', lastAction: '', nextAction: 'Find crew contact and onboarding path' },
  { id: 'vario', priority: 10, name: 'Vario', kind: 'Production company', status: 'Research', login: 'N/A', onboarding: 'Research', rate: '', lastAction: '', nextAction: 'Find crew contact and onboarding path' },
  { id: 'rhodes-av', priority: 11, name: 'Rhodes AudioVisual', kind: 'Production company', status: 'Research', login: 'N/A', onboarding: 'Research', rate: '', lastAction: '', nextAction: 'Find crew contact and onboarding path' },
  { id: 'cvw', priority: 12, name: 'CVW', kind: 'Production company', status: 'Research', login: 'N/A', onboarding: 'Research', rate: '', lastAction: '', nextAction: 'Confirm local freelance opportunities' },
  { id: 'summit', priority: 13, name: 'Summit', kind: 'Production company', status: 'Research', login: 'N/A', onboarding: 'Research', rate: '', lastAction: '', nextAction: 'Confirm local freelance opportunities' },
  { id: 'sd-showdown', priority: 14, name: 'SD Showdown', kind: 'Production company', status: 'Verify', login: 'N/A', onboarding: 'Reconnect', rate: '', lastAction: 'Ownership changed', nextAction: 'Find current contact and roster path' },
  { id: 'nationwide', priority: 15, name: 'Nationwide', kind: 'Staffing / production', status: 'Research', login: 'Verify', onboarding: 'Research', rate: '', lastAction: '', nextAction: 'Confirm portal / crew onboarding path' },
  { id: 'old-globe', priority: 16, name: 'The Old Globe', kind: 'Direct employer', status: 'Watch', login: 'N/A', onboarding: 'Opportunity watch', rate: '', lastAction: '', nextAction: 'Watch technical production openings' },
  { id: 'encore', priority: 99, name: 'Encore', kind: 'Fallback employer', status: 'Fallback', login: 'Ready', onboarding: 'Active', rate: '~$34/hr baseline', lastAction: 'Lighthouse connected', nextAction: 'Keep as stability floor; do not let distant onesies block better work', url: 'https://lighthouse2.psav.com/' },
]);

export function normalizeFreelanceSource(record = {}) {
  return {
    id: String(record.id || '').trim(),
    priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : 50,
    name: String(record.name || '').trim(),
    kind: String(record.kind || 'Other').trim() || 'Other',
    status: String(record.status || 'Research').trim() || 'Research',
    login: String(record.login || 'Verify').trim() || 'Verify',
    onboarding: String(record.onboarding || 'Research').trim() || 'Research',
    rate: String(record.rate || '').trim(),
    lastAction: String(record.lastAction || '').trim(),
    nextAction: String(record.nextAction || '').trim(),
    url: String(record.url || '').trim(),
    updatedAt: String(record.updatedAt || '').trim(),
  };
}

export function mergeFreelanceSources(overrides = []) {
  const merged = new Map(DEFAULT_FREELANCE_SOURCES.map(source => [source.id, normalizeFreelanceSource(source)]));
  overrides.forEach(record => {
    const normalized = normalizeFreelanceSource(record);
    if (!normalized.id || !normalized.name) return;
    const baseline = merged.get(normalized.id) || {};
    merged.set(normalized.id, normalizeFreelanceSource({ ...baseline, ...record }));
  });
  return [...merged.values()].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}
