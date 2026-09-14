export const ALIGNMENT_PROFILE_SCHEMA_VERSION = 1;
export const ALIGNMENT_PROFILE_GUN_NODE = 'alignment-profile-v1';

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being',
  'build', 'can', 'care', 'change', 'could', 'from', 'have', 'help', 'into', 'just',
  'like', 'make', 'more', 'need', 'next', 'people', 'really', 'small', 'some', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'this', 'those', 'want',
  'what', 'when', 'where', 'which', 'with', 'would', 'your'
]);

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function tokenize(value = '') {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ''))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function clampScore(value, fallback = 50) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}

export function normalizeAlignmentProfile(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    schemaVersion: ALIGNMENT_PROFILE_SCHEMA_VERSION,
    source: cleanText(source.source) || 'unknown',
    keywords: unique(Array.isArray(source.keywords) ? source.keywords.map((item) => cleanText(item).toLowerCase()) : []).slice(0, 32),
    focusAreas: unique(Array.isArray(source.focusAreas) ? source.focusAreas.map(cleanText) : []).slice(0, 8),
    people: unique(Array.isArray(source.people) ? source.people.map(cleanText) : []).slice(0, 8),
    projects: unique(Array.isArray(source.projects) ? source.projects.map(cleanText) : []).slice(0, 8),
    nextMoves: unique(Array.isArray(source.nextMoves) ? source.nextMoves.map(cleanText) : []).slice(0, 8),
    updatedAt: timestamp(source.updatedAt)
  };
}

export function buildAlignmentProfileFromPurposeState(state = {}) {
  const answers = Array.isArray(state.answers) ? state.answers.map(cleanText) : [];
  const attention = answers[1] || '';
  const people = answers[2] || '';
  const project = answers[3] || '';
  const move = answers[4] || '';
  const keywords = unique([
    ...tokenize(attention),
    ...tokenize(project),
    ...tokenize(people),
    ...tokenize(move)
  ]).slice(0, 32);

  return normalizeAlignmentProfile({
    source: 'purpose-map',
    keywords,
    focusAreas: attention ? [attention] : [],
    people: people ? [people] : [],
    projects: project ? [project] : [],
    nextMoves: move ? [move] : [],
    updatedAt: state.updatedAt || new Date().toISOString()
  });
}

function opportunityText(opportunity = {}) {
  const signals = Array.isArray(opportunity.signals) ? opportunity.signals : [];
  return [
    opportunity.title,
    opportunity.problem,
    opportunity.audience,
    opportunity.solution,
    opportunity.mvp,
    ...(Array.isArray(opportunity.alignmentTags) ? opportunity.alignmentTags : []),
    ...signals.flatMap((signal) => [signal.need, signal.buyerWords, ...(Array.isArray(signal.skills) ? signal.skills : [])])
  ].filter(Boolean).join(' ');
}

export function scoreOpportunityAlignment(opportunity = {}, profile = {}) {
  const normalized = normalizeAlignmentProfile(profile);
  if (!normalized.keywords.length) return 50;

  const terms = new Set(tokenize(opportunityText(opportunity)));
  if (!terms.size) return 35;
  const matched = normalized.keywords.filter((keyword) => terms.has(keyword));
  const coverage = matched.length / normalized.keywords.length;
  const breadth = Math.min(1, matched.length / 4);
  return clampScore(35 + (coverage * 40) + (breadth * 25), 50);
}

export function applyAlignmentProfile(opportunity = {}, profile = {}) {
  return {
    ...opportunity,
    alignmentScore: scoreOpportunityAlignment(opportunity, profile),
    alignmentProfileSource: normalizeAlignmentProfile(profile).source
  };
}
