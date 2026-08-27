import { mkdir, readFile, stat, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildMetrics,
  createDefaultBusinessConfig,
  refreshMoneyPrinterState
} from './moneyPrinterCore.js';
import {
  createDefaultExecutiveProfile,
  createExecutiveFeedback,
  normalizeExecutiveProfile
} from './moneyPrinterExecutiveMemory.js';

// File storage for money-printer-cli and the future server daemon.
// Keep browser localStorage in moneyPrinterStorage.js; this module is Node-only by design.

export const DEFAULT_MONEY_PRINTER_WORKSPACE = '.money-printer';

export function getMoneyPrinterWorkspacePaths(rootDir = process.cwd()) {
  const workspaceDir = path.resolve(rootDir, DEFAULT_MONEY_PRINTER_WORKSPACE);
  const executiveDir = path.join(workspaceDir, 'executive');
  return {
    rootDir: path.resolve(rootDir),
    workspaceDir,
    businessPath: path.join(workspaceDir, 'business.json'),
    ideasPath: path.join(workspaceDir, 'ideas.json'),
    experimentsPath: path.join(workspaceDir, 'experiments.json'),
    weakSignalsPath: path.join(workspaceDir, 'weak-signals.json'),
    executiveDir,
    executivePath: path.join(executiveDir, 'profile.json'),
    executiveFeedbackPath: path.join(executiveDir, 'feedback.jsonl'),
    executiveDecisionsPath: path.join(executiveDir, 'decisions.jsonl'),
    reportsDir: path.join(workspaceDir, 'reports'),
    logsDir: path.join(workspaceDir, 'logs'),
    eventsPath: path.join(workspaceDir, 'logs', 'events.jsonl')
  };
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function readJsonFile(filePath, fallbackValue = null) {
  if (!(await exists(filePath))) {
    return fallbackValue;
  }

  const raw = await readFile(filePath, 'utf8');
  if (!raw.trim()) {
    return fallbackValue;
  }

  return JSON.parse(raw);
}

export async function readJsonLines(filePath, limit = 50) {
  if (!(await exists(filePath))) return [];
  const raw = await readFile(filePath, 'utf8');
  const rows = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const parsed = [];
  for (const row of rows) {
    try {
      parsed.push(JSON.parse(row));
    } catch {
      // Ignore malformed historical lines instead of breaking the operator.
    }
  }
  return Number.isFinite(Number(limit)) && Number(limit) > 0 ? parsed.slice(-Number(limit)) : parsed;
}

export async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function ensureMoneyPrinterWorkspace(rootDir = process.cwd()) {
  const paths = getMoneyPrinterWorkspacePaths(rootDir);
  await mkdir(paths.workspaceDir, { recursive: true });
  await mkdir(paths.reportsDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
  await mkdir(paths.executiveDir, { recursive: true });

  const created = [];
  const defaults = [
    [paths.businessPath, createDefaultBusinessConfig()],
    [paths.ideasPath, []],
    [paths.experimentsPath, []],
    [paths.weakSignalsPath, []],
    [paths.executivePath, createDefaultExecutiveProfile()]
  ];

  for (const [filePath, value] of defaults) {
    if (!(await exists(filePath))) {
      await writeJsonFile(filePath, value);
      created.push(filePath);
    }
  }

  return {
    paths,
    created
  };
}

export async function loadMoneyPrinterWorkspace(rootDir = process.cwd()) {
  const { paths } = await ensureMoneyPrinterWorkspace(rootDir);
  const businessConfig = await readJsonFile(paths.businessPath, createDefaultBusinessConfig());
  const ideas = await readJsonFile(paths.ideasPath, []);
  const experiments = await readJsonFile(paths.experimentsPath, []);
  const weakSignals = await readJsonFile(paths.weakSignalsPath, []);
  const executiveProfile = normalizeExecutiveProfile(
    await readJsonFile(paths.executivePath, createDefaultExecutiveProfile())
  );
  const executiveFeedback = await readJsonLines(paths.executiveFeedbackPath, 24);
  const executiveDecisions = await readJsonLines(paths.executiveDecisionsPath, 24);
  const refreshedState = refreshMoneyPrinterState({
    mission: businessConfig.mission,
    businessConfig,
    ideas: Array.isArray(ideas) ? ideas : [],
    experiments: Array.isArray(experiments) ? experiments : [],
    weakSignals: Array.isArray(weakSignals) ? weakSignals : [],
    botOutputs: {}
  });
  const state = {
    ...refreshedState,
    executiveProfile,
    executiveFeedback,
    executiveDecisions
  };

  return {
    paths,
    state,
    businessConfig: state.businessConfig,
    ideas: state.ideas,
    experiments: state.experiments,
    weakSignals: state.weakSignals || [],
    executiveProfile,
    executiveFeedback,
    executiveDecisions,
    metrics: buildMetrics(state)
  };
}


export async function saveExecutiveProfile(rootDir = process.cwd(), profile = {}) {
  const { paths } = await ensureMoneyPrinterWorkspace(rootDir);
  const normalized = normalizeExecutiveProfile(profile);
  await writeJsonFile(paths.executivePath, normalized);
  return { profile: normalized, path: paths.executivePath };
}

export async function appendExecutiveFeedback(rootDir = process.cwd(), feedback = {}) {
  const { paths } = await ensureMoneyPrinterWorkspace(rootDir);
  const entry = createExecutiveFeedback(feedback);
  await appendFile(paths.executiveFeedbackPath, `${JSON.stringify(entry)}\n`, 'utf8');
  return { entry, path: paths.executiveFeedbackPath };
}

export async function appendExecutiveDecision(rootDir = process.cwd(), decision = {}) {
  const { paths } = await ensureMoneyPrinterWorkspace(rootDir);
  const timestamp = String(decision.timestamp || new Date().toISOString());
  const entry = {
    id: String(decision.id || `decision-${timestamp.replace(/[:.]/g, '-')}`),
    timestamp,
    decision: String(decision.decision || decision.summary || '').trim(),
    why: String(decision.why || '').trim(),
    nextAction: String(decision.nextAction || '').trim(),
    whatNotToDo: Array.isArray(decision.whatNotToDo) ? decision.whatNotToDo.map(String).filter(Boolean) : [],
    confidence: Number.isFinite(Number(decision.confidence)) ? Number(decision.confidence) : null,
    bot: String(decision.bot || 'executive-agent'),
    model: String(decision.model || ''),
    source: String(decision.source || 'operator-cycle')
  };
  if (!entry.decision) throw new Error('Executive decision text is required.');
  await appendFile(paths.executiveDecisionsPath, `${JSON.stringify(entry)}\n`, 'utf8');
  return { entry, path: paths.executiveDecisionsPath };
}

export async function saveBusinessConfig(rootDir = process.cwd(), businessConfig) {
  const { paths } = await ensureMoneyPrinterWorkspace(rootDir);
  await writeJsonFile(paths.businessPath, businessConfig);
  return paths.businessPath;
}

export async function saveIdeas(rootDir = process.cwd(), ideas = []) {
  const { paths } = await ensureMoneyPrinterWorkspace(rootDir);
  await writeJsonFile(paths.ideasPath, ideas);
  return paths.ideasPath;
}

export async function saveExperiments(rootDir = process.cwd(), experiments = []) {
  const { paths } = await ensureMoneyPrinterWorkspace(rootDir);
  await writeJsonFile(paths.experimentsPath, experiments);
  return paths.experimentsPath;
}

export function createReportFileName(label = 'report', date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  const safeLabel = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
  return `${stamp}-${safeLabel}.json`;
}

export async function writeMoneyPrinterReport(rootDir = process.cwd(), label = 'report', report = {}) {
  const { paths } = await ensureMoneyPrinterWorkspace(rootDir);
  const reportPath = path.join(paths.reportsDir, createReportFileName(label));
  await writeJsonFile(reportPath, report);
  return reportPath;
}

export async function appendMoneyPrinterEvent(rootDir = process.cwd(), entry = {}) {
  const { paths } = await ensureMoneyPrinterWorkspace(rootDir);
  const event = {
    timestamp: new Date().toISOString(),
    command: entry.command || entry.bot || 'money-printer',
    bot: entry.bot || null,
    inputSummary: entry.inputSummary || '',
    outputSummary: entry.outputSummary || '',
    nextAction: entry.nextAction || '',
    ...entry
  };
  await appendFile(paths.eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
  return {
    event,
    path: paths.eventsPath
  };
}
