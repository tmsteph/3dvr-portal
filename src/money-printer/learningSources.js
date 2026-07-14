import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function walk(directory) {
  const files = [];
  let entries = [];
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return files; throw error; }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

export function parseEmbeddedJson(text = '') {
  const source = String(text);
  for (let index = source.indexOf('{'); index >= 0; index = source.indexOf('{', index + 1)) {
    try { return JSON.parse(source.slice(index)); } catch { /* skip command chatter */ }
  }
  return null;
}

export function parseCsv(text = '') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text).replace(/\r\n/g, '\n');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && quoted && source[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if (char === '\n' && !quoted) { row.push(field); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers = [], ...body] = rows.filter(item => item.some(value => value !== ''));
  return body.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function cents(value) {
  const normalized = String(value || '').replace(/[^\d.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function positive(value) {
  return /^(1|true|yes|positive|qualified|interested|replied|booked|active|paid)$/i.test(String(value || '').trim());
}

function slug(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54) || 'market-opportunity';
}

function fingerprint(value = '') {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function deriveEvidence({ autopilot = null, outbound = null, outcomes = [], marketPulse = null } = {}) {
  const queue = Array.isArray(outbound?.queue) ? outbound.queue : [];
  const sentFromQueue = queue.filter(item => item.lastContactedAt || item.contactedAt || /sent|contacted/i.test(item.status || '')).length;
  const sentFromDispatch = Number(outbound?.dispatch?.sentCount || 0);
  const replies = outcomes.filter(item => positive(item.replyStatus)).length;
  const calls = outcomes.filter(item => /booked|scheduled/i.test(item.replyStatus || item.notes || '')).length;
  const customers = outcomes.filter(item => positive(item.subscriptionStatus) || /customer|paid/i.test(item.keepLiveDecision || '')).length;
  const revenueCents = outcomes.reduce((sum, item) => sum + cents(item.revenue), 0);
  const analyticsAvailable = Boolean(autopilot?.analytics?.enabled && Number.isFinite(Number(autopilot?.analytics?.sessions)));
  const researchAvailable = Boolean(marketPulse?.runId);

  const signals = {
    ...(analyticsAvailable ? { visits: Number(autopilot.analytics.sessions) } : {}),
    outreach_sent: Math.max(sentFromQueue, sentFromDispatch),
    qualified_replies: replies,
    calls_booked: calls,
    customers,
    revenue_cents: revenueCents
  };
  const researchCore = researchAvailable ? {
    market: marketPulse.market || '',
    signals_analyzed: Number(marketPulse.signalsAnalyzed || 0),
    fit_score: Number(marketPulse.marketFit?.score || 0),
    verdict: marketPulse.marketFit?.verdict || '',
    strongest_channel: marketPulse.marketFit?.strongestChannel || '',
    opportunity: marketPulse.topOpportunity || {},
    next_action: marketPulse.marketFit?.nextAction || '',
    warnings: Array.isArray(marketPulse.warnings) ? marketPulse.warnings.slice(0, 8) : []
  } : null;
  const research = researchCore ? {
    latest_run_id: marketPulse.runId,
    observed_at: marketPulse.generatedAt || '',
    fingerprint: fingerprint(JSON.stringify(researchCore)),
    ...researchCore
  } : null;
  const experiment = research?.opportunity?.title ? {
    id: `market-${slug(research.opportunity.title)}`,
    title: research.opportunity.title,
    hypothesis: research.opportunity.problem || `Market Pulse found a ${research.verdict || 'promising'} demand signal.`,
    metric: 'qualified_replies',
    confidence: Math.min(1, Math.max(0, research.fit_score / 100)),
    effort: 2,
    risk: 'GREEN',
    status: 'research',
    evidence_run_id: research.latest_run_id
  } : null;

  return {
    source: 'github-actions-evidence',
    observed_at: marketPulse?.generatedAt || outbound?.generatedAt || autopilot?.generatedAt || new Date().toISOString(),
    signals,
    research,
    experiment,
    sources: {
      analytics: {
        available: analyticsAvailable,
        run_id: autopilot?.runId || '',
        reason: analyticsAvailable
          ? `${autopilot.analytics.source || 'analytics'} session count imported`
          : 'analytics source or session count unavailable'
      },
      outbound: { available: Boolean(outbound), run_id: outbound?.autopilotRunId || '', queue_size: queue.length },
      revenue: { available: outcomes.length > 0, rows: outcomes.length, reason: outcomes.length ? 'outbound outcome tracker imported' : 'outcome tracker unavailable' },
      research: { available: researchAvailable, run_id: marketPulse?.runId || '', signals_analyzed: Number(marketPulse?.signalsAnalyzed || 0) }
    }
  };
}

export async function collectLearningEvidence(evidenceDir) {
  if (!evidenceDir) return null;
  const files = await walk(evidenceDir);
  let autopilot = null;
  let outbound = null;
  let marketPulse = null;
  let outcomes = [];
  for (const file of files) {
    const basename = path.basename(file);
    const content = await readFile(file, 'utf8');
    if (basename === 'outcome-tracker.csv') outcomes = parseCsv(content);
    if (basename !== 'latest.json') continue;
    const parsed = parseEmbeddedJson(content);
    if (!parsed) continue;
    if (parsed.runId?.startsWith('market-pulse-')) marketPulse = parsed;
    else if (Array.isArray(parsed.queue) && parsed.dispatch) outbound = parsed;
    else if (parsed.runId?.startsWith('money-')) autopilot = parsed;
  }
  return deriveEvidence({ autopilot, outbound, outcomes, marketPulse });
}
