const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const DEFAULT_SERVER_URL = process.env.THREEDVR_YOLO_SERVER_URL || 'http://127.0.0.1:8080';
const DEFAULT_MODEL = process.env.THREEDVR_YOLO_MODEL || 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M';
const DEFAULT_LLAMA_SERVER = process.env.THREEDVR_LLAMA_SERVER_BIN || path.join(process.env.HOME || '', 'llama.cpp', 'build', 'bin', 'llama-server');
const DEFAULT_REPO = process.env.THREEDVR_YOLO_REPO || path.resolve(__dirname, '..', '..');

function usage() {
  console.log(`Usage:
  ask-yolo [--repo path] [--file path] [--apply] [--commit] [--push] "task"
  ask-yolo [--apply] README.md "Improve the install section"

Examples:
  ask-yolo --file README.md "Add a short note about ask-form"
  ask-yolo --apply --commit thomas-agent/scripts/ask-next "Make the wording clearer"

Defaults:
  Without --apply, ask-yolo writes a .yolo-new preview file and prints a diff.
  With --apply, ask-yolo replaces the target after validation.
  Commit and push require explicit --commit and --push flags.`);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    file: '',
    task: '',
    apply: false,
    commit: false,
    push: false,
    startServer: true,
    help: false,
    serverUrl: DEFAULT_SERVER_URL,
    model: DEFAULT_MODEL,
    llamaServer: DEFAULT_LLAMA_SERVER,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') {
      options.repo = argv[++index] || '';
    } else if (arg === '--file') {
      options.file = argv[++index] || '';
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--commit') {
      options.commit = true;
    } else if (arg === '--push') {
      options.push = true;
    } else if (arg === '--no-start-server') {
      options.startServer = false;
    } else if (arg === '--server-url') {
      options.serverUrl = (argv[++index] || '').replace(/\/+$/, '');
    } else if (arg === '--model') {
      options.model = argv[++index] || '';
    } else if (arg === '--llama-server') {
      options.llamaServer = argv[++index] || '';
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (!options.file && positional.length >= 2) {
    options.file = positional.shift();
  }
  if (!options.task && positional.length >= 1) {
    options.task = positional.join(' ');
  }
  if (!options.file) {
    options.file = 'README.md';
  }

  options.repo = path.resolve(options.repo || DEFAULT_REPO);
  options.serverUrl = (options.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  return options;
}

function say(message) {
  console.log(`[ask-yolo] ${message}`);
}

function resolveTarget(repo, target) {
  const repoPath = path.resolve(repo);
  const targetPath = path.resolve(repoPath, target);
  const relative = path.relative(repoPath, targetPath);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Target must stay inside repo: ${target}`);
  }
  if (relative.startsWith('.git/') || relative === '.git') {
    throw new Error('Refusing to edit .git contents.');
  }
  if (relative.startsWith('node_modules/') || relative === 'node_modules') {
    throw new Error('Refusing to edit node_modules.');
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Target file does not exist: ${targetPath}`);
  }
  if (!fs.statSync(targetPath).isFile()) {
    throw new Error(`Target is not a file: ${targetPath}`);
  }

  return {
    repoPath,
    targetPath,
    relative,
  };
}

function stripCodeFences(text) {
  return String(text || '')
    .replace(/```(?:python|javascript|js|json|toml|md|html|bash|sh)?/gi, '')
    .replace(/```/g, '');
}

function cleanModelOutput(text, targetPath = '') {
  let output = stripCodeFences(text)
    .replace(/-----BEGIN SOLUTION-----/g, '')
    .replace(/-----END SOLUTION-----/g, '')
    .replace(/-----BEGIN FILE-----/g, '')
    .replace(/-----END FILE-----/g, '')
    .trim();

  if (/\.html?$/i.test(targetPath)) {
    const lower = output.toLowerCase();
    const doctypeIndex = lower.indexOf('<!doctype html>');
    const htmlIndex = lower.indexOf('<html');
    const begin = doctypeIndex >= 0 ? doctypeIndex : htmlIndex;
    if (begin >= 0) {
      output = output.slice(begin);
    }
    if (!output.toLowerCase().includes('</html>')) {
      output += '\n</html>';
    }
    const end = output.toLowerCase().indexOf('</html>');
    if (end >= 0) {
      output = output.slice(0, end + 7);
    }
  }

  return `${output.trim()}\n`;
}

function buildEditPrompt({ task, relative, original }) {
  return `You are editing one real project file.

STRICT RULES:
- Return ONLY the complete final contents of the target file.
- Do not explain your changes.
- Do not include markdown fences.
- Do not output placeholders.
- Preserve the file's purpose unless the task explicitly changes it.
- Keep syntax valid for the file type.

Task: ${task}

Target file path: ${relative}

Current file contents begin below:
-----BEGIN FILE-----
${original}
-----END FILE-----

Return ONLY the complete final file contents.`;
}

async function healthCheck(serverUrl) {
  try {
    const response = await fetch(`${serverUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer(options) {
  if (await healthCheck(options.serverUrl)) {
    say('llama-server ready');
    return null;
  }

  if (!options.startServer) {
    throw new Error(`llama-server is not reachable at ${options.serverUrl}`);
  }
  if (!options.llamaServer || !fs.existsSync(options.llamaServer)) {
    throw new Error(`llama-server binary not found: ${options.llamaServer}`);
  }

  say('starting llama-server');
  const child = spawn(options.llamaServer, [
    '-hf',
    options.model,
    '--host',
    '127.0.0.1',
    '--port',
    new URL(options.serverUrl).port || '8080',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  for (let index = 0; index < 30; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await healthCheck(options.serverUrl)) {
      say('llama-server ready');
      return child;
    }
  }

  throw new Error('llama-server did not become ready in time');
}

async function requestCompletion({ serverUrl, prompt, stream = false }) {
  const response = await fetch(`${serverUrl}/completion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      n_predict: 1800,
      temperature: 0.2,
      repeat_penalty: 1.25,
      stream,
    }),
  });

  if (!response.ok) {
    throw new Error(`completion failed: HTTP ${response.status}`);
  }

  if (!stream) {
    const data = await response.json();
    return data.content || data.response || '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const chunk = line.slice(6).trim();
      if (!chunk || chunk === '[DONE]') continue;
      try {
        const data = JSON.parse(chunk);
        const text = data.content || '';
        if (text) {
          process.stdout.write(text);
          parts.push(text);
        }
      } catch {
        // llama.cpp streams occasional non-JSON control lines; ignore them.
      }
    }
  }
  if (parts.length) process.stdout.write('\n');
  return parts.join('');
}

async function validateOutput({ original, output, targetPath, tmpPath }) {
  if (!output.trim()) {
    throw new Error('Validation failed: empty model output.');
  }
  if (output.trim().length < Math.max(80, Math.floor(original.trim().length / 5))) {
    throw new Error('Validation failed: output is suspiciously small.');
  }
  if (output.trim() === original.trim()) {
    throw new Error('No meaningful changes produced.');
  }

  const ext = path.extname(targetPath).toLowerCase();
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    const check = spawnSync(process.execPath, ['--check', tmpPath], { encoding: 'utf8' });
    if (check.status !== 0) {
      throw new Error(`Validation failed:\n${check.stderr || check.stdout}`);
    }
  }
  if (ext === '.json') {
    JSON.parse(output);
  }
}

function runGit(repo, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
  return result;
}

function printDiff(oldPath, newPath) {
  spawnSync('git', ['--no-pager', 'diff', '--no-index', '--', oldPath, newPath], {
    stdio: 'inherit',
  });
}

async function runYolo(argv = process.argv.slice(2), runtime = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    usage();
    return 0;
  }
  if (!options.task) {
    throw new Error('Missing task. Run `ask-yolo --help` for usage.');
  }

  const target = resolveTarget(options.repo, options.file);
  const original = await fsPromises.readFile(target.targetPath, 'utf8');
  const prompt = buildEditPrompt({
    task: options.task,
    relative: target.relative,
    original,
  });

  say(`target: ${target.relative}`);
  say(`prompt size: ${prompt.length} chars`);

  if (!runtime.skipServer) {
    await ensureServer(options);
  }

  const raw = runtime.completion !== undefined
    ? runtime.completion
    : await requestCompletion({ serverUrl: options.serverUrl, prompt, stream: path.extname(target.targetPath).toLowerCase() === '.html' });
  const output = cleanModelOutput(raw, target.targetPath);
  const tmpPath = `${target.targetPath}.yolo-new`;
  await fsPromises.writeFile(tmpPath, output, 'utf8');
  await validateOutput({
    original,
    output,
    targetPath: target.targetPath,
    tmpPath,
  });

  if (!options.apply) {
    say(`preview written: ${tmpPath}`);
    if (runtime.printDiff !== false) {
      printDiff(target.targetPath, tmpPath);
    }
    return {
      applied: false,
      tmpPath,
      targetPath: target.targetPath,
    };
  }

  await fsPromises.writeFile(target.targetPath, output, 'utf8');
  say(`applied: ${target.relative}`);

  if (options.commit) {
    runGit(target.repoPath, ['add', target.relative]);
    runGit(target.repoPath, ['commit', '-m', `ask-yolo: update ${target.relative}`]);
    say('committed changes');
  }

  if (options.push) {
    runGit(target.repoPath, ['push'], { stdio: 'inherit' });
    say('pushed branch');
  }

  return {
    applied: true,
    tmpPath,
    targetPath: target.targetPath,
  };
}

module.exports = {
  buildEditPrompt,
  cleanModelOutput,
  ensureServer,
  parseArgs,
  requestCompletion,
  resolveTarget,
  runYolo,
  stripCodeFences,
  validateOutput,
};

if (require.main === module) {
  runYolo().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
