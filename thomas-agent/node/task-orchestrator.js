const { execFile, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const { claimLease, markHandled, releaseLease, writeHeartbeat } = require('./agent-ops');

const DEFAULT_REPO = process.env.THREEDVR_AGENT_TASK_REPO || path.resolve(__dirname, '..', '..');
const DEFAULT_TIMEOUT_MS = parseInteger(process.env.THREEDVR_AGENT_TASK_TIMEOUT_MS, 10 * 60 * 1000);
const DEFAULT_OPENAI_MODEL = process.env.THREEDVR_AGENT_TASK_OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-5';
const DEFAULT_CLAUDE_MODEL = process.env.THREEDVR_AGENT_TASK_CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const DEFAULT_THINKING = process.env.THREEDVR_AGENT_TASK_THINKING || 'high';
const HIGH_RISK_PATTERN = /\b(send|email|dm|sms|post|publish|deploy|merge|push|delete|remove|rm\s+-rf|reset\s+--hard|payment|charge|refund|purchase|buy|invoice|stripe|bank|payroll|credential|secret|token|password)\b/i;
const CODE_PATTERN = /\b(code|repo|github|pull request|pr\b|commit|test|bug|fix|refactor|file|function|typescript|javascript|node|python|css|html)\b/i;
const SALES_PATTERN = /\b(lead|sales|outreach|reply|inbox|customer|client|prospect|invoice|proposal|close)\b/i;

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function usage() {
  console.log(`Usage:
  agent-task [--backend auto|codex|openclaw|claude|claude-cli|claude-api|openai|shell] [--execute] [--unsafe] "task"
  agent-task --backend codex --execute "Fix failing tests and open a PR"
  agent-task --backend openclaw --execute "Research this inbox request and draft the next step"
  agent-task --backend shell --execute --unsafe "npm test"

Defaults:
  Dry-run is the default. The agent prints the exact prompt and command/request it would send.
  --execute actually runs the selected backend.
  --unsafe is required for side-effecting, money-moving, or arbitrary shell tasks.

Environment:
  OPENAI_API_KEY                         enables the OpenAI Responses backend
  ANTHROPIC_API_KEY                      enables the Claude Messages backend
  THREEDVR_AGENT_TASK_OPENAI_MODEL       default ${DEFAULT_OPENAI_MODEL}
  THREEDVR_AGENT_TASK_CLAUDE_MODEL       default ${DEFAULT_CLAUDE_MODEL}
  THREEDVR_AGENT_TASK_BACKEND            default auto
  THREEDVR_AGENT_TASK_TIMEOUT_MS         default ${DEFAULT_TIMEOUT_MS}`);
}

function parseArgs(argv) {
  const options = {
    backend: process.env.THREEDVR_AGENT_TASK_BACKEND || 'auto',
    repo: DEFAULT_REPO,
    task: '',
    execute: false,
    unsafe: false,
    json: false,
    help: false,
    model: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    thinking: DEFAULT_THINKING,
    printPrompt: true,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--backend') {
      options.backend = normalizeText(argv[++index]).toLowerCase();
    } else if (arg === '--repo') {
      options.repo = argv[++index] || '';
    } else if (arg === '--model') {
      options.model = argv[++index] || '';
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = parseInteger(argv[++index], DEFAULT_TIMEOUT_MS);
    } else if (arg === '--thinking') {
      options.thinking = normalizeText(argv[++index]) || DEFAULT_THINKING;
    } else if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--unsafe') {
      options.unsafe = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--no-print-prompt') {
      options.printPrompt = false;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  options.repo = path.resolve(options.repo || DEFAULT_REPO);
  options.task = normalizeText(positional.join(' '));
  return options;
}

function classifyTask(task) {
  const text = normalizeText(task);
  return {
    kind: CODE_PATTERN.test(text) ? 'code' : SALES_PATTERN.test(text) ? 'sales' : 'general',
    highRisk: HIGH_RISK_PATTERN.test(text),
    needsTools: /\b(browser|website|gmail|calendar|file|terminal|shell|server|digital ocean|vps|deploy|repo|github)\b/i.test(text),
  };
}

function commandExists(command, execFileImpl = execFile) {
  return new Promise((resolve) => {
    execFileImpl('sh', ['-lc', `command -v ${shellQuote(command)}`], (error, stdout) => {
      resolve(!error && Boolean(normalizeText(stdout)));
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function detectCapabilities({ env = process.env, commandExistsImpl = commandExists } = {}) {
  const [codex, openclaw, claudeCli] = await Promise.all([
    commandExistsImpl('codex'),
    commandExistsImpl('openclaw'),
    commandExistsImpl('claude'),
  ]);
  return {
    codex,
    openclaw,
    claudeCli,
    openaiApi: Boolean(env.OPENAI_API_KEY),
    claudeApi: Boolean(env.ANTHROPIC_API_KEY),
  };
}

function pickBackend(options, classification, capabilities) {
  const requested = normalizeText(options.backend || 'auto').toLowerCase();
  if (requested && requested !== 'auto') {
    return requested === 'claude' ? (capabilities.claudeCli ? 'claude-cli' : 'claude-api') : requested;
  }
  if (classification.kind === 'code' && capabilities.codex) return 'codex';
  if (classification.needsTools && capabilities.openclaw) return 'openclaw';
  if (capabilities.claudeCli) return 'claude-cli';
  if (capabilities.claudeApi) return 'claude-api';
  if (capabilities.openaiApi) return 'openai';
  if (capabilities.openclaw) return 'openclaw';
  if (capabilities.codex) return 'codex';
  return 'none';
}

function systemInstruction(classification) {
  return [
    'You are 3DVR Agent, an operator inside the 3DVR ecosystem.',
    'Portal is the durable browser control plane. Local/server agents execute work that browsers and mobile apps cannot.',
    'Print concrete actions, assumptions, and results. Do not hide side effects.',
    'For sales work, prioritize ethical outreach, clear buyer value, and user approval before sending messages or spending money.',
    'For code work, prefer a worktree, pull/merge often, run tests, commit scoped changes, and avoid overwriting other agents.',
    classification.highRisk
      ? 'This task appears high risk. Ask for confirmation before irreversible, financial, credential, publishing, or external-message side effects.'
      : 'If the task has external side effects, stop and ask for confirmation before doing them.',
  ].join('\n');
}

function buildPrompt(task, options, classification) {
  return [
    systemInstruction(classification),
    '',
    `Task kind: ${classification.kind}`,
    `Working repo: ${options.repo}`,
    '',
    'User task:',
    task,
  ].join('\n');
}

function backendCommand(backend, prompt, options) {
  if (backend === 'codex') {
    return { command: 'codex', args: ['exec', prompt] };
  }
  if (backend === 'openclaw') {
    return { command: 'openclaw', args: ['agent', '--message', prompt, '--thinking', options.thinking || DEFAULT_THINKING] };
  }
  if (backend === 'claude-cli') {
    return { command: 'claude', args: ['-p', prompt] };
  }
  if (backend === 'shell') {
    return { command: 'sh', args: ['-lc', options.task] };
  }
  return null;
}

function describeCommand(commandSpec) {
  if (!commandSpec) return '';
  return [commandSpec.command, ...commandSpec.args.map(shellQuote)].join(' ');
}

async function runProcess(commandSpec, options, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(commandSpec.command, commandSpec.args, {
      cwd: options.repo,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`backend timed out after ${Math.round(options.timeoutMs / 1000)}s`));
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

async function callOpenAI(prompt, options, { fetchImpl = fetch, env = process.env } = {}) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
  const model = options.model || DEFAULT_OPENAI_MODEL;
  const body = { model, input: prompt };
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI Responses request failed: ${response.status}`);
  }
  return {
    ok: true,
    model,
    stdout: payload.output_text || extractOpenAIText(payload),
    raw: payload,
  };
}

function extractOpenAIText(payload) {
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

async function callClaude(prompt, options, { fetchImpl = fetch, env = process.env } = {}) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const model = options.model || DEFAULT_CLAUDE_MODEL;
  const body = {
    model,
    max_tokens: 4096,
    system: systemInstruction(classifyTask(options.task)),
    messages: [{ role: 'user', content: prompt }],
  };
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Claude Messages request failed: ${response.status}`);
  }
  return {
    ok: true,
    model,
    stdout: (payload.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n').trim(),
    raw: payload,
  };
}

function taskId(task) {
  return crypto.createHash('sha256').update(normalizeText(task)).digest('hex').slice(0, 24);
}

async function runAgentTask(argv = process.argv.slice(2), hooks = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    usage();
    return { ok: true, help: true };
  }
  if (!options.task) {
    throw new Error('Usage: agent-task "task"');
  }

  const classification = classifyTask(options.task);
  const capabilities = hooks.capabilities || await detectCapabilities({
    env: hooks.env || process.env,
    commandExistsImpl: hooks.commandExistsImpl,
  });
  const backend = pickBackend(options, classification, capabilities);
  const prompt = buildPrompt(options.task, options, classification);
  const id = taskId(options.task);

  if (backend === 'none') {
    throw new Error('No executor available. Install codex/openclaw/claude or set OPENAI_API_KEY/ANTHROPIC_API_KEY.');
  }
  if (classification.highRisk && !options.unsafe) {
    return printAndReturn({
      ok: false,
      skipped: true,
      reason: 'high-risk task requires --unsafe plus --execute',
      backend,
      classification,
      prompt,
      options,
    });
  }
  if (backend === 'shell' && !options.unsafe) {
    return printAndReturn({
      ok: false,
      skipped: true,
      reason: 'shell backend requires --unsafe',
      backend,
      classification,
      prompt,
      options,
    });
  }

  const commandSpec = backendCommand(backend, prompt, options);
  if (!options.execute) {
    return printAndReturn({
      ok: true,
      dryRun: true,
      backend,
      classification,
      prompt,
      command: commandSpec ? describeCommand(commandSpec) : apiDescription(backend, options),
      options,
    });
  }

  await writeHeartbeat('task-orchestrator', {
    status: 'running',
    metadata: { backend, kind: classification.kind, taskId: id },
  }).catch(() => {});
  const lease = await claimLease(`task:${id}`, { ttlMs: Math.max(options.timeoutMs, 60_000) });
  if (!lease.acquired) {
    return printAndReturn({
      ok: false,
      skipped: true,
      reason: `task lease held by ${lease.ownerDeviceId || 'another agent'}`,
      backend,
      classification,
      prompt,
      options,
    });
  }

  try {
    printDispatch({ backend, classification, prompt, command: commandSpec ? describeCommand(commandSpec) : apiDescription(backend, options), options });
    let result;
    if (backend === 'openai') {
      result = await callOpenAI(prompt, options, hooks);
      if (result.stdout) console.log(result.stdout);
    } else if (backend === 'claude-api') {
      result = await callClaude(prompt, options, hooks);
      if (result.stdout) console.log(result.stdout);
    } else {
      result = await runProcess(commandSpec, options, hooks.spawnImpl || spawn);
    }
    if (result.ok) {
      await markHandled('agent-task', id, { backend, kind: classification.kind }).catch(() => {});
    }
    return { ok: Boolean(result.ok), backend, classification, result };
  } finally {
    await releaseLease(`task:${id}`, lease.lease?.token).catch(() => {});
  }
}

function apiDescription(backend, options) {
  if (backend === 'openai') return `POST https://api.openai.com/v1/responses model=${options.model || DEFAULT_OPENAI_MODEL}`;
  if (backend === 'claude-api') return `POST https://api.anthropic.com/v1/messages model=${options.model || DEFAULT_CLAUDE_MODEL}`;
  return backend;
}

function printDispatch({ backend, classification, prompt, command, options }) {
  if (options.json) return;
  console.log(`[agent-task] backend: ${backend}`);
  console.log(`[agent-task] kind: ${classification.kind}${classification.highRisk ? ' high-risk' : ''}`);
  if (command) console.log(`[agent-task] dispatch: ${command}`);
  if (options.printPrompt) {
    console.log('[agent-task] message begin');
    console.log(prompt);
    console.log('[agent-task] message end');
  }
}

function printAndReturn(result) {
  if (result.options?.json) {
    console.log(JSON.stringify({
      ok: result.ok,
      skipped: result.skipped,
      dryRun: result.dryRun,
      reason: result.reason,
      backend: result.backend,
      classification: result.classification,
      command: result.command,
      prompt: result.prompt,
    }, null, 2));
    return result;
  }
  if (result.reason) console.log(`[agent-task] ${result.reason}`);
  printDispatch(result);
  if (result.dryRun) console.log('[agent-task] dry-run only; add --execute to run.');
  return result;
}

if (require.main === module) {
  runAgentTask().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  classifyTask,
  detectCapabilities,
  pickBackend,
  buildPrompt,
  backendCommand,
  describeCommand,
  callOpenAI,
  callClaude,
  taskId,
  runAgentTask,
};
