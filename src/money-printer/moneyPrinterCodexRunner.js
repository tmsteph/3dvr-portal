import { execFile } from 'node:child_process';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateCodexPromptWithModel } from './moneyPrinterModelProvider.js';
import { getMoneyPrinterWorkspacePaths } from './moneyPrinterFileStorage.js';

const execFileAsync = promisify(execFile);

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export async function detectCodexCli(options = {}) {
  try {
    const result = await execFileAsync(options.command || 'codex', ['--version'], {
      timeout: options.timeoutMs || 5000,
      maxBuffer: 1024 * 128
    });
    return {
      available: true,
      command: options.command || 'codex',
      version: String(result.stdout || result.stderr || '').trim()
    };
  } catch (error) {
    return {
      available: false,
      command: options.command || 'codex',
      message: error?.code === 'ENOENT' ? 'codex CLI was not found on PATH.' : error.message
    };
  }
}

export function getCodexRunnerStatus(options = {}, env = process.env) {
  return {
    allowCodexExec: parseBoolean(options.allowExec ?? env.MONEY_PRINTER_ALLOW_CODEX_EXEC, false),
    command: options.command || 'codex'
  };
}

function safePromptFileName(label = 'codex-prompt', date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  const safeLabel = String(label || 'codex-prompt')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${stamp}-${safeLabel || 'codex-prompt'}.md`;
}

export async function saveCodexPrompt(rootDir = process.cwd(), prompt = '', options = {}) {
  const paths = getMoneyPrinterWorkspacePaths(rootDir);
  const promptDir = path.join(paths.workspaceDir, 'codex-prompts');
  await mkdir(promptDir, { recursive: true });
  const filePath = path.join(promptDir, safePromptFileName(options.label || options.bot || 'codex-prompt'));
  const content = [
    '# Money Printer Codex Prompt',
    '',
    `Generated: ${new Date().toISOString()}`,
    options.bot ? `Bot: ${options.bot}` : '',
    '',
    String(prompt || '').trim(),
    ''
  ].filter(line => line !== '').join('\n');
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

async function appendCodexLog(rootDir = process.cwd(), entry = {}) {
  const paths = getMoneyPrinterWorkspacePaths(rootDir);
  await mkdir(paths.logsDir, { recursive: true });
  const logPath = path.join(paths.logsDir, 'codex.jsonl');
  const event = {
    timestamp: new Date().toISOString(),
    ...entry
  };
  await appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8');
  return {
    event,
    path: logPath
  };
}

export async function generateAndSaveCodexPrompt(rootDir = process.cwd(), state = {}, options = {}) {
  const result = options.prompt
    ? { prompt: options.prompt, aiMode: 'manual' }
    : await generateCodexPromptWithModel(state, {
      ...options,
      rootDir
    });
  const promptPath = await saveCodexPrompt(rootDir, result.prompt, {
    label: options.bot || 'money-printer-codex',
    bot: options.bot
  });
  await appendCodexLog(rootDir, {
    action: 'prompt',
    bot: options.bot || '',
    promptPath,
    aiMode: result.aiMode || 'mock',
    model: result.model || ''
  });
  return {
    ...result,
    promptPath
  };
}

export async function runCodexPrompt(rootDir = process.cwd(), state = {}, options = {}) {
  const status = getCodexRunnerStatus(options, options.env || process.env);
  const detection = await detectCodexCli(options);
  const promptResult = await generateAndSaveCodexPrompt(rootDir, state, options);

  if (!options.execute) {
    const log = await appendCodexLog(rootDir, {
      action: 'run',
      status: 'skipped',
      reason: 'Pass --execute to invoke Codex.',
      promptPath: promptResult.promptPath
    });
    return {
      ok: false,
      status: 'skipped',
      detection,
      ...promptResult,
      message: 'Codex prompt saved. Pass --execute to invoke Codex.',
      logPath: log.path
    };
  }

  if (!status.allowCodexExec) {
    const log = await appendCodexLog(rootDir, {
      action: 'run',
      status: 'skipped',
      reason: 'MONEY_PRINTER_ALLOW_CODEX_EXEC is not true.',
      promptPath: promptResult.promptPath
    });
    return {
      ok: false,
      status: 'skipped',
      detection,
      ...promptResult,
      message: 'Codex execution blocked until MONEY_PRINTER_ALLOW_CODEX_EXEC=true.',
      logPath: log.path
    };
  }

  if (!detection.available) {
    const log = await appendCodexLog(rootDir, {
      action: 'run',
      status: 'skipped',
      reason: detection.message,
      promptPath: promptResult.promptPath
    });
    return {
      ok: false,
      status: 'skipped',
      detection,
      ...promptResult,
      message: detection.message,
      logPath: log.path
    };
  }

  try {
    const result = await execFileAsync(detection.command, ['exec', promptResult.prompt], {
      cwd: rootDir,
      timeout: options.timeoutMs || 10 * 60 * 1000,
      maxBuffer: 1024 * 1024
    });
    const log = await appendCodexLog(rootDir, {
      action: 'run',
      status: 'executed',
      promptPath: promptResult.promptPath,
      stdout: result.stdout.slice(-4000),
      stderr: result.stderr.slice(-4000)
    });
    return {
      ok: true,
      status: 'executed',
      detection,
      ...promptResult,
      stdout: result.stdout,
      stderr: result.stderr,
      logPath: log.path
    };
  } catch (error) {
    const log = await appendCodexLog(rootDir, {
      action: 'run',
      status: 'failed',
      promptPath: promptResult.promptPath,
      message: error.message
    });
    return {
      ok: false,
      status: 'failed',
      detection,
      ...promptResult,
      message: error.message,
      logPath: log.path
    };
  }
}
