export const EXECUTIVE_PROFILE_VERSION = 1;

export const DEFAULT_EXECUTIVE_PROFILE = Object.freeze({
  version: EXECUTIVE_PROFILE_VERSION,
  name: '3DVR Executive Constitution',
  role: 'Model-independent CEO/COO operating layer for 3DVR.',
  mission: 'Build open, human-scale computing and business systems that increase ordinary people\'s agency.',
  northStar: 'Turn purpose into useful open systems, sustainable revenue, and community-owned capability.',
  currentDirection: 'Make 3DVR useful enough to run real work and earn trust before expanding the platform.',
  strategicPriorities: [
    'Create useful, revenue-connected outcomes for real people and small businesses.',
    'Unify Operator, CRM, calendar, communications, projects, and knowledge into one coherent system.',
    'Build open personal computing that can swap models and providers without losing the user\'s memory, tools, or control.'
  ],
  taste: [
    'Prefer obvious, glanceable interfaces over clever or dense ones.',
    'Prefer working systems and real user outcomes over extra copy, demos, or speculative features.',
    'Prefer open standards, interoperability, self-hosting, and user ownership over lock-in.',
    'Prefer one strong path through a product over many competing choices.',
    'Prefer warm, human language and concrete actions over corporate jargon.',
    'Prefer service-first validation and manual learning before expensive automation.',
    'Prefer systems that become simpler as capability increases.'
  ],
  antiPatterns: [
    'Do not build a broad platform before proving the next concrete user outcome.',
    'Do not add dashboards, settings, or explanatory copy when the action can be made obvious instead.',
    'Do not confuse activity, code volume, or generated ideas with progress.',
    'Do not chase a new model or framework when the surrounding system is the bottleneck.',
    'Do not trade customer trust, reversibility, or user control for short-term automation.',
    'Do not let many weak experiments crowd out one strong revenue or learning loop.'
  ],
  decisionRubric: [
    { id: 'user-value', weight: 25, question: 'Does this solve a real, current user problem?' },
    { id: 'mission-fit', weight: 20, question: 'Does this move 3DVR toward open, human-scale agency?' },
    { id: 'learning-or-revenue', weight: 20, question: 'Does this create measurable learning, trust, or revenue soon?' },
    { id: 'simplicity', weight: 15, question: 'Is this the smallest coherent move with a clear path for the user?' },
    { id: 'leverage', weight: 10, question: 'Will this make future useful work easier or more reusable?' },
    { id: 'reversibility', weight: 5, question: 'Can we undo or correct this safely?' },
    { id: 'openness', weight: 5, question: 'Does this preserve portability, interoperability, and user ownership?' }
  ],
  authority: {
    green: 'May execute bounded, reversible internal work and prepare drafts without asking.',
    yellow: 'May investigate and prepare, but requires review before external commitments, sends, or consequential writes.',
    red: 'Never execute unattended: moving money, deleting user data, DNS changes, irreversible production changes, legal commitments, or mass outreach.'
  }
});

function stringList(value, fallback = []) {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [...fallback];
}

export function createDefaultExecutiveProfile() {
  return JSON.parse(JSON.stringify(DEFAULT_EXECUTIVE_PROFILE));
}

export function normalizeExecutiveProfile(value = {}) {
  const fallback = createDefaultExecutiveProfile();
  return {
    ...fallback,
    ...(value && typeof value === 'object' ? value : {}),
    version: EXECUTIVE_PROFILE_VERSION,
    name: String(value?.name || fallback.name).trim(),
    role: String(value?.role || fallback.role).trim(),
    mission: String(value?.mission || fallback.mission).trim(),
    northStar: String(value?.northStar || fallback.northStar).trim(),
    currentDirection: String(value?.currentDirection || fallback.currentDirection).trim(),
    strategicPriorities: stringList(value?.strategicPriorities, fallback.strategicPriorities),
    taste: stringList(value?.taste, fallback.taste),
    antiPatterns: stringList(value?.antiPatterns, fallback.antiPatterns),
    decisionRubric: Array.isArray(value?.decisionRubric) && value.decisionRubric.length
      ? value.decisionRubric.map(item => ({
        id: String(item?.id || '').trim(),
        weight: Number(item?.weight || 0),
        question: String(item?.question || '').trim()
      })).filter(item => item.id && item.question)
      : fallback.decisionRubric,
    authority: {
      ...fallback.authority,
      ...(value?.authority && typeof value.authority === 'object' ? value.authority : {})
    }
  };
}

export function formatExecutiveProfile(profile = DEFAULT_EXECUTIVE_PROFILE) {
  const value = normalizeExecutiveProfile(profile);
  return [
    `${value.name}`,
    `Role: ${value.role}`,
    `Mission: ${value.mission}`,
    `North star: ${value.northStar}`,
    `Current direction: ${value.currentDirection}`,
    'Strategic priorities:',
    ...value.strategicPriorities.map((item, index) => `${index + 1}. ${item}`),
    'Taste:',
    ...value.taste.map(item => `- ${item}`),
    'Avoid:',
    ...value.antiPatterns.map(item => `- ${item}`),
    'Decision rubric:',
    ...value.decisionRubric.map(item => `- ${item.weight}% ${item.question}`),
    'Authority:',
    `- GREEN: ${value.authority.green}`,
    `- YELLOW: ${value.authority.yellow}`,
    `- RED: ${value.authority.red}`
  ].join('\n');
}

export function createExecutiveFeedback({ kind = 'note', text = '', reason = '', source = 'founder' } = {}, now = new Date()) {
  const normalizedKind = ['approve', 'reject', 'prefer', 'avoid', 'note'].includes(String(kind).toLowerCase())
    ? String(kind).toLowerCase()
    : 'note';
  const normalizedText = String(text || '').trim();
  if (!normalizedText) throw new Error('Executive feedback text is required.');
  return {
    id: `feedback-${now.toISOString().replace(/[:.]/g, '-')}`,
    timestamp: now.toISOString(),
    kind: normalizedKind,
    text: normalizedText,
    reason: String(reason || '').trim(),
    source: String(source || 'founder').trim() || 'founder'
  };
}

export function formatRecentExecutiveFeedback(feedback = []) {
  if (!feedback.length) return 'No founder taste feedback recorded yet.';
  return feedback
    .slice(-12)
    .map(item => `- [${String(item.kind || 'note').toUpperCase()}] ${item.text}${item.reason ? ` — ${item.reason}` : ''}`)
    .join('\n');
}
