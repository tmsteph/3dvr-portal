const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const nodemailer = require('nodemailer');

const {
  autopilotRunsNode,
  autopilotStateNode,
  slugify,
} = require('./gun-db');

const execFileAsync = promisify(execFile);

const ROOT = path.join(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const LEADS_FILE = process.env.THREEDVR_LEADS_FILE || path.join(ROOT, 'leads.csv');
const STATE_DIR = process.env.THREEDVR_AUTOPILOT_STATE_DIR || path.join(ROOT, 'state');
const STATE_FILE = process.env.THREEDVR_AUTOPILOT_STATE_FILE || path.join(STATE_DIR, 'autopilot-state.json');
const DEFAULT_TOKEN_FILE = process.env.THREEDVR_AUTOPILOT_EMAIL_TOKEN_FILE || path.join(os.homedir(), '.3dvr-agent-operator-email-token');
const DEFAULT_LOCATIONS = splitList(process.env.THREEDVR_AUTOPILOT_LOCATIONS || process.env.THREEDVR_LEAD_LOCATION || 'La Mesa, CA;San Diego, CA');
const DEFAULT_CATEGORIES = splitList(process.env.THREEDVR_AUTOPILOT_CATEGORIES || process.env.THREEDVR_LEAD_CATEGORY || 'professional;service');
const DEFAULT_INTERVAL_MINUTES = parseInteger(process.env.THREEDVR_AUTOPILOT_INTERVAL_MINUTES, 360);
const DEFAULT_MIN_NEW_LEADS = parseInteger(process.env.THREEDVR_AUTOPILOT_MIN_NEW_LEADS, 5);
const DEFAULT_NOTIFY_NEW_LEADS = parseInteger(process.env.THREEDVR_AUTOPILOT_NOTIFY_NEW_LEADS, 3);
const DEFAULT_ENRICH_LIMIT = parseInteger(process.env.THREEDVR_AUTOPILOT_ENRICH_LIMIT, 10);
const DEFAULT_CRAWL_LIMIT = parseInteger(process.env.THREEDVR_AUTOPILOT_CRAWL_LIMIT, 10);
const DEFAULT_RADIUS_KM = parseInteger(process.env.THREEDVR_AUTOPILOT_RADIUS_KM, 8);
const DEFAULT_EMAIL_MODE = String(process.env.THREEDVR_AUTOPILOT_EMAIL_MODE || 'action').trim().toLowerCase();
const DEFAULT_EMAIL_COOLDOWN_HOURS = parseInteger(process.env.THREEDVR_AUTOPILOT_EMAIL_COOLDOWN_HOURS, 12);
const DEFAULT_EMAIL_TRANSPORT = String(process.env.THREEDVR_AUTOPILOT_EMAIL_TRANSPORT || 'portal').trim().toLowerCase();
const DEFAULT_AUTO_SEND = /^(1|true|yes|on)$/i.test(String(process.env.THREEDVR_AUTOPILOT_AUTO_SEND || '').trim());
const DEFAULT_AUTO_SEND_LIMIT = parseInteger(process.env.THREEDVR_AUTOPILOT_AUTO_SEND_LIMIT, 1);
const DEFAULT_NOTIFY_EMAIL = normalizeEmail(
  process.env.THREEDVR_AUTOPILOT_NOTIFY_EMAIL
  || process.env.GMAIL_USER
  || '3dvr.tech@gmail.com'
);
const DEFAULT_PORTAL_EMAIL_ENDPOINT = normalizeText(
  process.env.THREEDVR_AUTOPILOT_EMAIL_ENDPOINT
  || 'https://portal.3dvr.tech/api/calendar/reminder-email'
);
const DEFAULT_PORTAL_EMAIL_TOKEN = normalizeText(
  process.env.THREEDVR_AUTOPILOT_EMAIL_TOKEN
  || process.env.AGENT_OPERATOR_EMAIL_TOKEN
  || readOptionalFile(DEFAULT_TOKEN_FILE)
);
const DEFAULT_OPENAI_COST_LIMIT_USD = parseNumber(process.env.THREEDVR_AUTOPILOT_OPENAI_COST_LIMIT_USD, null);
const DEFAULT_OPENAI_COST_WINDOW_DAYS = parseInteger(process.env.THREEDVR_AUTOPILOT_OPENAI_COST_WINDOW_DAYS, 1);
const DEFAULT_CODEX_PROBE = String(process.env.THREEDVR_AUTOPILOT_CODEX_PROBE || 'auth').trim().toLowerCase();
const DEFAULT_CODEX_REPO = process.env.THREEDVR_AUTOPILOT_CODEX_REPO || path.join(os.homedir(), '3dvr-agent');

function splitList(value) {
  return String(value || '')
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  const email = normalizeText(value).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function readOptionalFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    return normalizeText(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return '';
  }
}

function usage() {
  console.log(`Usage:
  ask-autopilot [--dry-run] [--no-email] [--status-probe auth|codex|off]

Examples:
  ask-autopilot
  ask-autopilot --dry-run
  ask-autopilot --status-probe codex

Environment:
  THREEDVR_AUTOPILOT_LOCATIONS           semicolon/comma separated locations
  THREEDVR_AUTOPILOT_CATEGORIES          semicolon/comma separated categories
  THREEDVR_AUTOPILOT_MIN_NEW_LEADS       crawl when new leads drop below this
  THREEDVR_AUTOPILOT_NOTIFY_NEW_LEADS    email when at least this many new leads need review
  THREEDVR_AUTOPILOT_CRAWL_LIMIT         max leads to add per crawl
  THREEDVR_AUTOPILOT_ENRICH_LIMIT        max leads to enrich per run
  THREEDVR_AUTOPILOT_RADIUS_KM           crawl radius
  THREEDVR_AUTOPILOT_NOTIFY_EMAIL        escalation target
  THREEDVR_AUTOPILOT_EMAIL_MODE          action | always | never
  THREEDVR_AUTOPILOT_EMAIL_COOLDOWN_HOURS dedupe window for repeated emails
  THREEDVR_AUTOPILOT_EMAIL_TRANSPORT     portal | auto | gmail
  THREEDVR_AUTOPILOT_AUTO_SEND           true to send first-touch email automatically for mailto leads
  THREEDVR_AUTOPILOT_AUTO_SEND_LIMIT     max automated outreach sends per run
  THREEDVR_AUTOPILOT_EMAIL_ENDPOINT      portal email relay endpoint
  THREEDVR_AUTOPILOT_EMAIL_TOKEN         shared token for portal email relay
  THREEDVR_AUTOPILOT_EMAIL_TOKEN_FILE    optional file path for shared relay token
  THREEDVR_AUTOPILOT_OPENAI_COST_LIMIT_USD optional daily spend ceiling
  THREEDVR_AUTOPILOT_CODEX_PROBE         auth | codex | off
  OPENAI_ADMIN_KEY                       required for OpenAI costs checks
  GMAIL_USER / GMAIL_APP_PASSWORD        optional fallback for direct email alerts`);
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    noEmail: false,
    statusProbe: DEFAULT_CODEX_PROBE,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-email') {
      options.noEmail = true;
    } else if (arg === '--status-probe') {
      options.statusProbe = String(argv[++index] || DEFAULT_CODEX_PROBE).trim().toLowerCase();
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!['auth', 'codex', 'off'].includes(options.statusProbe)) {
    throw new Error(`Unsupported status probe "${options.statusProbe}". Use auth, codex, or off.`);
  }

  return options;
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadState() {
  ensureStateDir();
  if (!fs.existsSync(STATE_FILE)) {
    return {
      version: 1,
      comboStats: {},
      email: {
        lastHash: '',
        lastSentAt: '',
      },
    };
  }

  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {
      version: 1,
      comboStats: {},
      email: {
        lastHash: '',
        lastSentAt: '',
      },
    };
  }
}

function saveState(state) {
  ensureStateDir();
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function readLeads(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [name = '', link = '', contact = '', status = '', date = '', variant = ''] = line.split(',');
      return { name, link, contact, status, date, variant };
    });
}

function countStatuses(rows) {
  const counts = {
    total: rows.length,
    new: 0,
    contacted: 0,
    nurture: 0,
    replied: 0,
    closed: 0,
    unenriched: 0,
  };

  for (const row of rows) {
    const status = normalizeText(row.status).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
    if (needsEnrichment(row)) {
      counts.unenriched += 1;
    }
  }

  return counts;
}

function needsEnrichment(row) {
  const link = normalizeText(row.link);
  const contact = normalizeText(row.contact);
  if (!link) return false;
  if (!contact) return true;
  if (contact === link) return true;
  return /^https?:\/\/[^/]+\/?$/i.test(contact);
}

function topLeadNames(rows, status, limit = 3) {
  return rows
    .filter((row) => normalizeText(row.status).toLowerCase() === status)
    .slice(0, limit)
    .map((row) => row.name)
    .filter(Boolean);
}

function outreachPriority(row) {
  const link = normalizeText(row.link);
  const contact = normalizeText(row.contact);
  if (/^mailto:/i.test(contact)) return 4;
  if (/^https?:\/\//i.test(contact)) return 3;
  if (/^https?:\/\//i.test(link)) return 2;
  if (contact) return 1;
  return 0;
}

function pickAutoSendLeads(rows, limit) {
  return rows
    .filter((row) => normalizeText(row.status).toLowerCase() === 'new')
    .filter((row) => /^mailto:/i.test(normalizeText(row.contact)))
    .sort((left, right) => {
      const dateCompare = normalizeText(right.date).localeCompare(normalizeText(left.date));
      if (dateCompare) return dateCompare;
      const priorityCompare = outreachPriority(right) - outreachPriority(left);
      if (priorityCompare) return priorityCompare;
      return normalizeText(left.name).localeCompare(normalizeText(right.name));
    })
    .slice(0, Math.max(0, limit));
}

function buildCombos(locations, categories) {
  const combos = [];
  for (const location of locations) {
    for (const category of categories) {
      const key = `${location} :: ${category}`;
      combos.push({ key, location, category });
    }
  }
  return combos;
}

function getComboScore(stat = {}) {
  const runs = Number(stat.runs || 0);
  const successes = Number(stat.successes || 0);
  const leadsAdded = Number(stat.leadsAdded || 0);
  const failures = Number(stat.failures || 0);
  if (!runs) return Number.POSITIVE_INFINITY;
  return (leadsAdded / runs) + (successes * 0.5) - failures;
}

function chooseCombo(combos, comboStats) {
  return combos
    .slice()
    .sort((left, right) => {
      const leftStat = comboStats[left.key] || {};
      const rightStat = comboStats[right.key] || {};
      const leftRuns = Number(leftStat.runs || 0);
      const rightRuns = Number(rightStat.runs || 0);
      if (leftRuns !== rightRuns) return leftRuns - rightRuns;
      return getComboScore(rightStat) - getComboScore(leftStat);
    })[0] || null;
}

function updateComboStat(state, combo, { leadsAdded = 0, ok = true, error = '' } = {}) {
  if (!combo) return;
  const current = state.comboStats[combo.key] || {
    location: combo.location,
    category: combo.category,
    runs: 0,
    successes: 0,
    failures: 0,
    leadsAdded: 0,
    lastRunAt: '',
    lastError: '',
  };

  current.runs += 1;
  current.lastRunAt = new Date().toISOString();
  current.leadsAdded += Math.max(0, Number(leadsAdded || 0));
  if (ok) {
    current.successes += 1;
    current.lastError = '';
  } else {
    current.failures += 1;
    current.lastError = error || 'unknown error';
  }

  state.comboStats[combo.key] = current;
}

async function runScript(scriptName, args = []) {
  const file = path.join(SCRIPTS_DIR, scriptName);
  try {
    const result = await execFileAsync(file, args, {
      cwd: ROOT,
      maxBuffer: 1024 * 1024 * 4,
      env: process.env,
    });
    return {
      ok: true,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      command: `${scriptName} ${args.join(' ')}`.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      error: error.message || 'command failed',
      command: `${scriptName} ${args.join(' ')}`.trim(),
    };
  }
}

function decodeJwtPayload(token) {
  try {
    const segments = String(token || '').split('.');
    if (segments.length < 2) return null;
    const payload = segments[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function readCodexAuthSummary() {
  const authPath = path.join(os.homedir(), '.codex', 'auth.json');
  if (!fs.existsSync(authPath)) {
    return {
      ok: false,
      mode: 'auth',
      reason: 'auth.json not found',
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const payload = decodeJwtPayload(raw?.tokens?.id_token);
    const auth = payload && payload['https://api.openai.com/auth']
      ? payload['https://api.openai.com/auth']
      : {};
    return {
      ok: true,
      mode: 'auth',
      authMode: raw.auth_mode || '',
      planType: auth.chatgpt_plan_type || '',
      activeUntil: auth.chatgpt_subscription_active_until || '',
      email: payload?.email || '',
      lastRefresh: raw.last_refresh || '',
    };
  } catch (error) {
    return {
      ok: false,
      mode: 'auth',
      reason: error.message || 'unable to parse auth.json',
    };
  }
}

function parseCodexStatusOutput(output) {
  const model = output.match(/model:\s*([^\n]+)/i)?.[1]?.trim() || '';
  const provider = output.match(/provider:\s*([^\n]+)/i)?.[1]?.trim() || '';
  const sessionId = output.match(/session id:\s*([^\n]+)/i)?.[1]?.trim() || '';
  const tokensUsed = Number((output.match(/tokens used\s*([\d,]+)/i)?.[1] || '0').replace(/,/g, ''));
  return { model, provider, sessionId, tokensUsed };
}

async function runCodexStatusProbe() {
  try {
    const result = await execFileAsync('codex', ['exec', '/status'], {
      cwd: DEFAULT_CODEX_REPO,
      maxBuffer: 1024 * 1024 * 4,
      timeout: 12000,
      env: process.env,
    });
    return {
      ok: true,
      mode: 'codex',
      ...parseCodexStatusOutput((result.stdout || '') + (result.stderr || '')),
    };
  } catch (error) {
    const combined = `${error.stdout || ''}\n${error.stderr || ''}`.trim();
    if (combined) {
      return {
        ok: true,
        mode: 'codex',
        ...parseCodexStatusOutput(combined),
      };
    }
    return {
      ok: false,
      mode: 'codex',
      reason: error.message || 'codex status probe failed',
    };
  }
}

async function readCodexSummary(mode) {
  if (mode === 'off') {
    return { ok: true, mode: 'off' };
  }
  if (mode === 'codex') {
    return runCodexStatusProbe();
  }
  return readCodexAuthSummary();
}

async function readOpenAiCosts() {
  const adminKey = normalizeText(process.env.OPENAI_ADMIN_KEY);
  if (!adminKey) {
    return { available: false, reason: 'OPENAI_ADMIN_KEY not set' };
  }

  const startTime = Math.floor(Date.now() / 1000) - (DEFAULT_OPENAI_COST_WINDOW_DAYS * 24 * 60 * 60);
  const url = new URL('https://api.openai.com/v1/organization/costs');
  url.searchParams.set('start_time', String(startTime));
  url.searchParams.set('limit', String(Math.max(DEFAULT_OPENAI_COST_WINDOW_DAYS, 1)));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAI costs request failed: ${response.status}`);
  }

  const payload = await response.json();
  const buckets = Array.isArray(payload?.data) ? payload.data : [];
  let totalUsd = 0;
  for (const bucket of buckets) {
    for (const result of Array.isArray(bucket?.results) ? bucket.results : []) {
      totalUsd += Number(result?.amount?.value || 0);
    }
  }

  return {
    available: true,
    totalUsd,
    currency: 'usd',
    limitUsd: DEFAULT_OPENAI_COST_LIMIT_USD,
    limitExceeded: Number.isFinite(DEFAULT_OPENAI_COST_LIMIT_USD)
      ? totalUsd >= DEFAULT_OPENAI_COST_LIMIT_USD
      : false,
    days: DEFAULT_OPENAI_COST_WINDOW_DAYS,
  };
}

function createMailTransport() {
  const user = normalizeEmail(process.env.GMAIL_USER);
  const pass = normalizeText(process.env.GMAIL_APP_PASSWORD);
  if (!(user && pass)) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

async function sendViaPortalEmail(email, summary, actions) {
  if (!DEFAULT_PORTAL_EMAIL_ENDPOINT) {
    return { ok: false, reason: 'portal email endpoint not configured' };
  }
  if (!DEFAULT_PORTAL_EMAIL_TOKEN) {
    return { ok: false, reason: 'portal email token not configured' };
  }

  const response = await fetch(DEFAULT_PORTAL_EMAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEFAULT_PORTAL_EMAIL_TOKEN}`,
    },
    body: JSON.stringify({
      mode: 'operator-alert',
      to: [DEFAULT_NOTIFY_EMAIL],
      subject: email.subject,
      text: email.text,
      summary: actions[0] || `Autopilot run ${summary.runId}`,
      actionItems: actions,
      commands: summary.commands,
      metadata: {
        runId: summary.runId,
        ranAt: summary.ranAt,
        counts: formatCounts(summary.counts),
        combo: summary.combo ? `${summary.combo.location} / ${summary.combo.category}` : 'none',
        codex: summary.codex?.mode
          ? summary.codex.ok
            ? `${summary.codex.mode} ok`
            : `${summary.codex.mode} issue: ${summary.codex.reason || 'unknown'}`
          : 'off',
        openAiSpend: summary.openAiCosts?.available
          ? `$${summary.openAiCosts.totalUsd.toFixed(2)} / ${summary.openAiCosts.days}d`
          : summary.openAiCosts?.reason || 'unavailable',
      },
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: payload?.error || `portal email request failed: ${response.status}`,
      status: response.status,
    };
  }

  return {
    ok: true,
    to: DEFAULT_NOTIFY_EMAIL,
    subject: email.subject,
    via: 'portal',
    status: response.status,
  };
}

async function sendViaLocalGmail(email) {
  const transport = createMailTransport();
  if (!transport) {
    return { ok: false, reason: 'gmail transport not configured' };
  }

  await transport.sendMail({
    from: `"3dvr-agent" <${process.env.GMAIL_USER}>`,
    to: DEFAULT_NOTIFY_EMAIL,
    subject: email.subject,
    text: email.text,
  });

  return {
    ok: true,
    to: DEFAULT_NOTIFY_EMAIL,
    subject: email.subject,
    via: 'gmail',
  };
}

function formatCounts(counts) {
  return `new=${counts.new}, contacted=${counts.contacted}, nurture=${counts.nurture}, replied=${counts.replied}, closed=${counts.closed}, unenriched=${counts.unenriched}`;
}

function buildActionItems(summary) {
  const actions = [];

  if (summary.counts.replied > 0) {
    actions.push(`Reply to warm leads: ${summary.topReplied.join(', ') || `${summary.counts.replied} replied lead(s)`}`);
  }
  if (Array.isArray(summary.autoSent) && summary.autoSent.length > 0) {
    const delivered = summary.autoSent.filter((entry) => entry.ok).map((entry) => entry.name);
    if (delivered.length) {
      actions.push(`Auto-sent first outreach to ${delivered.join(', ')}`);
    }
  }
  if (summary.counts.new >= DEFAULT_NOTIFY_NEW_LEADS) {
    actions.push(`Review/send new outreach: ${summary.topNew.join(', ') || `${summary.counts.new} new lead(s)`}`);
  }
  if (summary.counts.contacted > 0) {
    actions.push(`Check follow-ups for ${summary.counts.contacted} contacted lead(s)`);
  }
  if (summary.openAiCosts?.limitExceeded) {
    actions.push(`OpenAI spend guard hit: $${summary.openAiCosts.totalUsd.toFixed(2)} / $${summary.openAiCosts.limitUsd.toFixed(2)}`);
  }
  if (summary.codex?.mode === 'codex' && !summary.codex.ok) {
    actions.push(`Codex status probe failed: ${summary.codex.reason}`);
  }
  if (summary.errors.length) {
    actions.push(`Operator errors: ${summary.errors.join('; ')}`);
  }

  return actions;
}

function buildEmail(summary, actions) {
  const subject = actions.length
    ? `[3dvr-agent] action needed: ${actions[0]}`
    : `[3dvr-agent] operator summary ${summary.runId}`;

  const lines = [
    `3dvr-agent autopilot run: ${summary.runId}`,
    '',
    `Counts: ${formatCounts(summary.counts)}`,
    summary.combo ? `Lead source tested: ${summary.combo.location} / ${summary.combo.category}` : 'Lead source tested: none',
    summary.codex?.mode && summary.codex.mode !== 'off'
      ? `Codex: ${summary.codex.ok ? `${summary.codex.mode} ok` : `issue (${summary.codex.reason || 'unknown'})`}`
      : 'Codex: probe disabled',
    summary.openAiCosts?.available
      ? `OpenAI spend (${summary.openAiCosts.days}d): $${summary.openAiCosts.totalUsd.toFixed(2)}`
      : `OpenAI spend: unavailable (${summary.openAiCosts?.reason || 'not configured'})`,
    '',
  ];

  if (actions.length) {
    lines.push('Action needed:');
    actions.forEach((action) => lines.push(`- ${action}`));
    lines.push('');
  }

  if (summary.topNew.length) {
    lines.push(`Top new leads: ${summary.topNew.join(', ')}`);
  }
  if (summary.topReplied.length) {
    lines.push(`Warm leads: ${summary.topReplied.join(', ')}`);
  }
  if (summary.autoSent?.length) {
    lines.push(`Auto-sent outreach: ${summary.autoSent.filter((entry) => entry.ok).map((entry) => entry.name).join(', ') || 'none'}`);
  }
  if (summary.commands.length) {
    lines.push('');
    lines.push('Useful commands:');
    summary.commands.forEach((command) => lines.push(`- ${command}`));
  }

  return {
    subject,
    text: lines.join('\n'),
  };
}

function shouldSendEmail({ actions, state, dryRun, noEmail }) {
  if (dryRun || noEmail) {
    return { send: false, reason: 'dry-run or no-email' };
  }
  if (DEFAULT_EMAIL_MODE === 'never') {
    return { send: false, reason: 'email mode is never' };
  }
  if (DEFAULT_EMAIL_MODE === 'action' && !actions.length) {
    return { send: false, reason: 'no action required' };
  }

  const fingerprint = crypto
    .createHash('sha1')
    .update(JSON.stringify(actions))
    .digest('hex');
  const lastHash = normalizeText(state.email?.lastHash);
  const lastSentAt = normalizeText(state.email?.lastSentAt);
  const cooldownMs = DEFAULT_EMAIL_COOLDOWN_HOURS * 60 * 60 * 1000;

  if (lastHash && lastHash === fingerprint && lastSentAt) {
    const elapsed = Date.now() - new Date(lastSentAt).getTime();
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < cooldownMs) {
      return { send: false, reason: 'duplicate within cooldown', fingerprint };
    }
  }

  return { send: true, fingerprint };
}

async function sendEmail(summary, actions, state) {
  const decision = shouldSendEmail({
    actions,
    state,
    dryRun: summary.dryRun,
    noEmail: summary.noEmail,
  });
  if (!decision.send) {
    return { ok: false, skipped: true, reason: decision.reason };
  }

  const email = buildEmail(summary, actions);
  const transportMode = ['portal', 'auto', 'gmail'].includes(DEFAULT_EMAIL_TRANSPORT)
    ? DEFAULT_EMAIL_TRANSPORT
    : 'portal';

  let result = null;
  if (transportMode === 'portal' || transportMode === 'auto') {
    result = await sendViaPortalEmail(email, summary, actions);
    if (result.ok) {
      state.email = {
        lastHash: decision.fingerprint,
        lastSentAt: new Date().toISOString(),
      };
      return { ok: true, skipped: false, ...result };
    }

    if (transportMode === 'portal') {
      return { ok: false, skipped: true, reason: result.reason || 'portal email failed', via: 'portal' };
    }
  }

  result = await sendViaLocalGmail(email);
  if (!result.ok) {
    return { ok: false, skipped: true, reason: result.reason || 'email transport not configured', via: 'gmail' };
  }

  state.email = {
    lastHash: decision.fingerprint,
    lastSentAt: new Date().toISOString(),
  };

  return { ok: true, skipped: false, ...result };
}

function serializeAck(ack) {
  if (!ack || typeof ack !== 'object') return {};
  return {
    ok: ack.ok === undefined ? true : Boolean(ack.ok),
    err: ack.err || '',
  };
}

function gunSafe(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.reduce((output, item, index) => {
      output[`item_${index}`] = gunSafe(item);
      return output;
    }, {});
  }
  if (typeof value === 'object') {
    return Object.entries(value).reduce((output, [key, entry]) => {
      output[key] = gunSafe(entry);
      return output;
    }, {});
  }
  return value;
}

async function putGun(node, value) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, err: 'timeout' });
    }, 2000);

    node.put(gunSafe(value), (ack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(serializeAck(ack));
    });
  });
}

async function persistGunSummary(summary) {
  const runKey = `${Date.now()}-${slugify(summary.combo?.location || 'no-location')}-${slugify(summary.combo?.category || 'no-category')}`;
  const runsAck = await putGun(autopilotRunsNode().get(runKey), summary);
  const stateAck = await putGun(autopilotStateNode(), {
    lastRunAt: summary.ranAt,
    counts: summary.counts,
    actionRequired: summary.actionRequired,
    topNew: summary.topNew,
    topReplied: summary.topReplied,
    combo: summary.combo || null,
    openAiCosts: summary.openAiCosts,
    codex: summary.codex,
  });
  return { runKey, runsAck, stateAck };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
  }

  if (options.help) {
    usage();
    return;
  }

  const state = loadState();
  const errors = [];
  const beforeRows = readLeads(LEADS_FILE);
  const beforeCounts = countStatuses(beforeRows);
  const combos = buildCombos(DEFAULT_LOCATIONS, DEFAULT_CATEGORIES);
  const combo = beforeCounts.new < DEFAULT_MIN_NEW_LEADS ? chooseCombo(combos, state.comboStats || {}) : null;
  const commands = [];

  let crawlResult = null;
  if (combo) {
    const crawlArgs = [
      '--location', combo.location,
      '--category', combo.category,
      '--limit', String(DEFAULT_CRAWL_LIMIT),
      '--radius-km', String(DEFAULT_RADIUS_KM),
    ];
    if (options.dryRun) crawlArgs.push('--dry-run');
    crawlResult = await runScript('ask-crawl', crawlArgs);
    commands.push(`ask-crawl --location "${combo.location}" --category ${combo.category} --limit ${DEFAULT_CRAWL_LIMIT} --radius-km ${DEFAULT_RADIUS_KM}`);
    if (!crawlResult.ok) {
      errors.push(`crawl failed: ${crawlResult.error || crawlResult.stderr || 'unknown error'}`);
      updateComboStat(state, combo, { ok: false, error: crawlResult.error || crawlResult.stderr });
    }
  }

  const afterCrawlRows = readLeads(LEADS_FILE);
  const leadsAdded = Math.max(0, afterCrawlRows.length - beforeRows.length);
  if (combo && crawlResult?.ok) {
    updateComboStat(state, combo, { ok: true, leadsAdded });
  }

  const enrichNeeded = countStatuses(afterCrawlRows).unenriched;
  let enrichResult = null;
  if (enrichNeeded > 0) {
    const enrichArgs = ['--limit', String(DEFAULT_ENRICH_LIMIT)];
    if (options.dryRun) enrichArgs.push('--dry-run');
    enrichResult = await runScript('ask-enrich', enrichArgs);
    commands.push(`ask-enrich --limit ${DEFAULT_ENRICH_LIMIT}`);
    if (!enrichResult.ok) {
      errors.push(`enrich failed: ${enrichResult.error || enrichResult.stderr || 'unknown error'}`);
    }
  }

  const autoSent = [];
  if (DEFAULT_AUTO_SEND && !options.dryRun) {
    const candidates = pickAutoSendLeads(readLeads(LEADS_FILE), DEFAULT_AUTO_SEND_LIMIT);
    for (const candidate of candidates) {
      const sendResult = await runScript('ask-send', ['--auto', '--mark', candidate.name]);
      autoSent.push({
        name: candidate.name,
        ok: sendResult.ok,
        command: sendResult.command,
        stdout: (sendResult.stdout || '').trim(),
        stderr: (sendResult.stderr || '').trim(),
        error: sendResult.ok ? '' : (sendResult.error || sendResult.stderr || 'automatic outreach failed'),
      });
      commands.push(`ask-send --auto --mark "${candidate.name}"`);
      if (!sendResult.ok) {
        errors.push(`auto-send failed for ${candidate.name}: ${sendResult.error || sendResult.stderr || 'unknown error'}`);
      }
    }
  }

  const finalRows = readLeads(LEADS_FILE);
  const counts = countStatuses(finalRows);
  const topNew = topLeadNames(finalRows, 'new');
  const topReplied = topLeadNames(finalRows, 'replied');

  const codex = await readCodexSummary(options.statusProbe);
  let openAiCosts = { available: false, reason: 'cost checks disabled' };
  try {
    openAiCosts = await readOpenAiCosts();
  } catch (error) {
    openAiCosts = { available: false, reason: error.message || 'cost request failed' };
    errors.push(`openai cost check failed: ${openAiCosts.reason}`);
  }

  if (counts.replied > 0) {
    commands.push('ask-track reply "Lead Name"');
  }
  if (counts.new > 0) {
    commands.push('ask-next');
    commands.push('ask-send --enrich --mark "Lead Name"');
  }
  if (counts.contacted > 0) {
    commands.push('ask-track followup');
  }

  const summary = {
    runId: new Date().toISOString().replace(/[:.]/g, '-'),
    ranAt: new Date().toISOString(),
    dryRun: options.dryRun,
    noEmail: options.noEmail,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    leadsFile: LEADS_FILE,
    counts,
    beforeCounts,
    combo,
    leadsAdded,
    crawlResult: crawlResult
      ? { ok: crawlResult.ok, command: crawlResult.command, stdout: crawlResult.stdout.trim(), stderr: crawlResult.stderr.trim() }
      : null,
    enrichResult: enrichResult
      ? { ok: enrichResult.ok, command: enrichResult.command, stdout: enrichResult.stdout.trim(), stderr: enrichResult.stderr.trim() }
      : null,
    codex,
    openAiCosts,
    topNew,
    topReplied,
    autoSent,
    commands: Array.from(new Set(commands)),
    errors,
  };

  const actions = buildActionItems(summary);
  summary.actionRequired = actions.length > 0;
  summary.actionItems = actions;

  let emailResult = null;
  try {
    emailResult = await sendEmail(summary, actions, state);
  } catch (error) {
    emailResult = { ok: false, skipped: true, reason: error.message || 'email failed' };
    errors.push(`email failed: ${emailResult.reason}`);
  }
  summary.email = emailResult;

  saveState(state);

  let gunResult = null;
  if (options.dryRun) {
    gunResult = { ok: false, skipped: true, reason: 'dry run' };
  } else {
    try {
      gunResult = await persistGunSummary(summary);
    } catch (error) {
      gunResult = { ok: false, error: error.message || 'gun persist failed' };
      errors.push(`gun persist failed: ${gunResult.error}`);
    }
  }
  summary.gun = gunResult;

  console.log(`Autopilot run: ${summary.runId}`);
  console.log(`Counts: ${formatCounts(summary.counts)}`);
  if (combo) {
    console.log(`Combo: ${combo.location} / ${combo.category} (${leadsAdded} lead(s) added)`);
  } else {
    console.log('Combo: skipped (enough new leads in pipeline)');
  }
  if (summary.openAiCosts.available) {
    const limitText = Number.isFinite(summary.openAiCosts.limitUsd)
      ? ` / $${summary.openAiCosts.limitUsd.toFixed(2)}`
      : '';
    console.log(`OpenAI costs (${summary.openAiCosts.days}d): $${summary.openAiCosts.totalUsd.toFixed(2)}${limitText}`);
  } else {
    console.log(`OpenAI costs: ${summary.openAiCosts.reason}`);
  }
  if (summary.codex.mode !== 'off') {
    if (summary.codex.ok) {
      const planText = summary.codex.planType ? `, plan=${summary.codex.planType}` : '';
      const tokenText = Number.isFinite(summary.codex.tokensUsed) && summary.codex.tokensUsed > 0
        ? `, tokensUsed=${summary.codex.tokensUsed}`
        : '';
      console.log(`Codex: ${summary.codex.mode} ok${planText}${tokenText}`);
    } else {
      console.log(`Codex: ${summary.codex.reason}`);
    }
  }
  if (actions.length) {
    console.log('Action needed:');
    actions.forEach((action) => console.log(`- ${action}`));
  } else {
    console.log('Action needed: none');
  }
  if (summary.email) {
    console.log(`Email: ${summary.email.skipped ? `skipped (${summary.email.reason})` : `sent to ${summary.email.to}`}`);
  }
  if (summary.errors.length) {
    console.log('Errors:');
    summary.errors.forEach((error) => console.log(`- ${error}`));
  }
  setTimeout(() => process.exit(summary.errors.length ? 1 : 0), 50);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
