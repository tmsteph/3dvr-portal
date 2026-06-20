import { mkdir, readFile, stat, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildMetrics,
  createDefaultBusinessConfig,
  refreshMoneyPrinterState
} from './moneyPrinterCore.js';

// File storage for money-printer-cli and the future server daemon.
// Keep browser localStorage in moneyPrinterStorage.js; this module is Node-only by design.

export const DEFAULT_MONEY_PRINTER_WORKSPACE = '.money-printer';

export function getMoneyPrinterWorkspacePaths(rootDir = process.cwd()) {
  const workspaceDir = path.resolve(rootDir, DEFAULT_MONEY_PRINTER_WORKSPACE);
  return {
    rootDir: path.resolve(rootDir),
    workspaceDir,
    businessPath: path.join(workspaceDir, 'business.json'),
    ideasPath: path.join(workspaceDir, 'ideas.json'),
    experimentsPath: path.join(workspaceDir, 'experiments.json'),
    weakSignalsPath: path.join(workspaceDir, 'weak-signals.json'),
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

  const created = [];
  const defaults = [
    [paths.businessPath, createDefaultBusinessConfig()],
    [paths.ideasPath, []],
    [paths.experimentsPath, []],
    [paths.weakSignalsPath, []]
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
  const state = refreshMoneyPrinterState({
    mission: businessConfig.mission,
    businessConfig,
    ideas: Array.isArray(ideas) ? ideas : [],
    experiments: Array.isArray(experiments) ? experiments : [],
    weakSignals: Array.isArray(weakSignals) ? weakSignals : [],
    botOutputs: {}
  });

  return {
    paths,
    state,
    businessConfig: state.businessConfig,
    ideas: state.ideas,
    experiments: state.experiments,
    weakSignals: state.weakSignals || [],
    metrics: buildMetrics(state)
  };
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
