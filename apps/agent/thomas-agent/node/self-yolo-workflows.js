const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline/promises');
const { spawnSync } = require('node:child_process');

const {
  applySearchReplacePatch,
  ensureServer,
  requestCompletion,
} = require('./yolo-agent');

const DEFAULT_REPO = process.env.THREEDVR_SELF_YOLO_REPO || path.join(os.homedir(), '3dvr-agent');
const DEFAULT_SERVER_URL = process.env.THREEDVR_YOLO_SERVER_URL || 'http://127.0.0.1:8080';
const DEFAULT_MODEL = process.env.THREEDVR_YOLO_MODEL || 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M';
const DEFAULT_LLAMA_SERVER = process.env.THREEDVR_LLAMA_SERVER_BIN || path.join(process.env.HOME || '', 'llama.cpp', 'build', 'bin', 'llama-server');

const ALLOWED = new Set([
  'self_yolo/cli.py',
  'self_yolo/yolo_app.py',
  'self_yolo/yolo_new_site.py',
  'self_yolo/self_update_agent.py',
  'self_yolo/self_yolo_agent.py',
  'self_yolo/self_yolo_loop.py',
  'self_yolo/rollback.py',
  'pyproject.toml',
  'README.md',
]);

function say(prefix, message) {
  console.log(`[${prefix}] ${message}`);
}

function rule(prefix, title = '') {
  const bar = '='.repeat(56);
  if (title) {
    console.log(`\n${bar}\n[${prefix}] ${title}\n${bar}`);
  } else {
    console.log(`\n${bar}`);
  }
}

function parseArgs(argv, defaults = {}) {
  const options = {
    repo: defaults.repo || DEFAULT_REPO,
    target: '',
    task: '',
    preview: false,
    rounds: 3,
    repoMode: 'repo',
    root: defaults.root || '',
    targetPath: '',
    help: false,
    startServer: true,
    serverUrl: DEFAULT_SERVER_URL,
    model: DEFAULT_MODEL,
    llamaServer: DEFAULT_LLAMA_SERVER,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') {
      options.repo = argv[++index] || '';
    } else if (arg === '--root') {
      options.root = argv[++index] || '';
    } else if (arg === '--target') {
      options.targetPath = argv[++index] || '';
    } else if (arg === '--preview' || arg === '-p') {
      options.preview = true;
    } else if (arg === '--rounds') {
      options.rounds = Number.parseInt(argv[++index] || '3', 10);
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

  if (!options.targetPath && positional.length >= 2) {
    options.targetPath = positional.shift();
  }
  if (!options.task && positional.length >= 1) {
    options.task = positional.join(' ');
  }
  if (!options.targetPath) {
    options.targetPath = 'README.md';
  }

  options.repo = path.resolve(options.repo || DEFAULT_REPO);
  options.root = path.resolve(options.root || os.homedir());
  options.targetPath = String(options.targetPath);
  options.serverUrl = (options.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  if (!Number.isFinite(options.rounds) || options.rounds < 1) {
    options.rounds = 3;
  }
  return options;
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
  if (!ALLOWED.has(relative)) {
    throw new Error(`Target not allowed.\n - ${Array.from(ALLOWED).sort().join('\n - ')}`);
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
    .replace(/```/g, '')
    .replace(/-----BEGIN SOLUTION-----/g, '')
    .replace(/-----END SOLUTION-----/g, '')
    .replace(/-----BEGIN SECTION-----/g, '')
    .replace(/-----END SECTION-----/g, '');
}

function cleanText(text) {
  return `${stripCodeFences(text).trim()}\n`;
}

function dedupeMarkdownSections(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  const seenBlocks = new Set();
  let block = [];

  const flushBlock = () => {
    if (!block.length) return;
    const joined = block.join('\n').trim();
    const key = joined.slice(0, 400);
    if (joined && !seenBlocks.has(key)) {
      seenBlocks.add(key);
      out.push(...block, '');
    }
    block = [];
  };

  for (const line of lines) {
    if (line.trim() === '---' || line.startsWith('# ')) {
      flushBlock();
    }
    block.push(line);
  }
  flushBlock();
  return `${out.join('\n').trim()}\n`;
}

function extractMarkdownSection(text, sectionName) {
  const lines = String(text || '').split(/\r?\n/);
  const target = String(sectionName || '').trim().toLowerCase();
  let start = null;
  let end = null;

  for (let index = 0; index < lines.length; index += 1) {
    const stripped = lines[index].trim();
    if (stripped.startsWith('## ') && stripped.slice(3).trim().toLowerCase() === target) {
      start = index;
      continue;
    }
    if (start !== null && stripped.startsWith('## ')) {
      end = index;
      break;
    }
  }

  if (start === null) {
    return null;
  }
  if (end === null) {
    end = lines.length;
  }

  return {
    before: lines.slice(0, start).join('\n').trimEnd(),
    section: lines.slice(start, end).join('\n').trim(),
    after: lines.slice(end).join('\n').trimStart(),
  };
}

function buildPrompt({ target, task, original, sectionName }) {
  if (target === 'README.md' && sectionName) {
    return `You are editing exactly one section of README.md.

STRICT RULES:
- Return ONLY a JSON object with keys "search" and "replace".
- Choose one short exact substring from this section for "search".
- Put the replacement text in "replace".
- Do not explain.
- Do not use markdown fences.
- Keep valid markdown.
- Make the smallest useful edit that satisfies the task.

Task: ${task}

Section name: ${sectionName}

Current section contents begin below:
-----BEGIN SECTION-----
${original}
-----END SECTION-----

Return ONLY the JSON object.
`;
  }

  return `You are editing a real project file.

STRICT RULES:
- Return ONLY a JSON object with keys "search" and "replace".
- Choose one short exact substring from the current file for "search".
- Put the replacement text in "replace".
- Do not describe the file.
- Do not explain your changes.
- Do not output placeholders.
- Do not use markdown fences.
- Do not repeat sections.
- Keep the file valid for its file type.
- Make the smallest useful edit that satisfies the task.
- Preserve the existing purpose unless the task explicitly changes it.

Task: ${task}

Target file path: ${target}

Current file contents begin below:
-----BEGIN FILE-----
${original}
-----END FILE-----

Return ONLY the JSON object.
`;
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

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} ${args.join(' ')} failed`);
  }
  return result;
}

async function ensureSelfServer(options) {
  await ensureServer({
    serverUrl: options.serverUrl,
    startServer: options.startServer,
    llamaServer: options.llamaServer,
    model: options.model,
  });
}

async function requestModelOutput({ options, prompt, stream }, runtime = {}) {
  if (runtime.completion !== undefined) {
    return runtime.completion;
  }
  return requestCompletion({
    serverUrl: options.serverUrl,
    prompt,
    stream,
  });
}

function printDiff(oldPath, newPath) {
  spawnSync('git', ['--no-pager', 'diff', '--no-index', '--', oldPath, newPath], {
    stdio: 'inherit',
  });
}

function validateOutput({ original, output, targetPath, tmpPath }) {
  if (!output.trim()) {
    throw new Error('Failed: empty response');
  }
  if (output.trim().length < Math.max(40, Math.floor(original.trim().length / 4))) {
    throw new Error('Validation failed: output too small.');
  }
  if (output.trim() === original.trim()) {
    throw new Error('No meaningful changes.');
  }

  if (targetPath.endsWith('.py')) {
    const check = spawnSync(process.env.PYTHON || 'python3', ['-m', 'py_compile', tmpPath], {
      encoding: 'utf8',
    });
    if (check.status !== 0) {
      throw new Error(`Validation failed:\n${check.stderr || check.stdout}`);
    }
  }
}

async function runSelfYoloAgent(argv = process.argv.slice(2), runtime = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(`Usage:
  self-yolo-agent [--preview] [file] "task"

Examples:
  self-yolo-agent "Improve the README installation section"
  self-yolo-agent self_yolo/cli.py "Make the help text shorter"
  self-yolo-agent --preview README.md "Improve the Commands section"`);
    return 0;
  }
  if (!options.task) {
    throw new Error('Usage: self-yolo-agent [--preview] [file] "task"');
  }

  if (!runtime.skipServer) {
    await ensureSelfServer(options);
  }
  const target = resolveTarget(options.repo, options.targetPath);
  const original = await fsPromises.readFile(target.targetPath, 'utf8');

  let sectionName = null;
  let sectionBefore = null;
  let sectionAfter = null;
  let workingOriginal = original;

  if (target.relative === 'README.md') {
    const loweredTask = options.task.toLowerCase();
    if (loweredTask.includes('section')) {
      const markers = ['installation', 'commands', 'features', 'usage', 'notes', 'license'];
      for (const marker of markers) {
        if (loweredTask.includes(marker)) {
          sectionName = marker[0].toUpperCase() + marker.slice(1);
          break;
        }
      }
      if (sectionName) {
        const extracted = extractMarkdownSection(original, sectionName);
        if (!extracted) {
          throw new Error(`section not found: ${sectionName}`);
        }
        sectionBefore = extracted.before;
        workingOriginal = extracted.section;
        sectionAfter = extracted.after;
      }
    }

    const risky = ['rewrite', 'full', 'entire', 'from scratch'].some((token) => loweredTask.includes(token));
    if (risky || original.length > 800) {
      throw new Error('blocked: full README rewrites are unreliable with this model');
    }
  }

  say('self-yolo-agent', `target: ${target.relative}`);
  say('self-yolo-agent', `file size: ${workingOriginal.length} chars`);

  const prompt = buildPrompt({
    target: target.relative,
    task: options.task,
    original: workingOriginal,
    sectionName,
  });
  say('self-yolo-agent', `prompt size: ${prompt.length} chars`);
  rule('self-yolo-agent', 'MODEL OUTPUT');

  const raw = await requestModelOutput({ options, prompt, stream: false }, runtime);
  let out = applySearchReplacePatch(workingOriginal, raw);
  if (target.relative === 'README.md' && sectionName) {
    const pieces = [];
    if (sectionBefore) pieces.push(sectionBefore.trimEnd());
    pieces.push(out.trim());
    if (sectionAfter) pieces.push(sectionAfter.trimStart());
    out = `${pieces.filter(Boolean).join('\n\n').trim()}\n`;
  }

  const tmpPath = `${target.targetPath}.new`;
  const bakPath = `${target.targetPath}.bak`;
  await fsPromises.writeFile(bakPath, original, 'utf8');
  await fsPromises.writeFile(tmpPath, out, 'utf8');
  validateOutput({
    original,
    output: out,
    targetPath: target.targetPath,
    tmpPath,
  });

  if (runtime.preview !== false && options.preview) {
    rule('self-yolo-agent', 'DIFF PREVIEW');
    printDiff(target.targetPath, tmpPath);
    if (runtime.confirm) {
      const approved = await runtime.confirm();
      if (!approved) {
        say('self-yolo-agent', 'cancelled');
        await fsPromises.unlink(tmpPath).catch(() => {});
        return { applied: false, preview: true, cancelled: true, tmpPath };
      }
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = String(await rl.question('\n[self-yolo-agent] apply these changes? [y/N] ')).trim().toLowerCase();
      rl.close();
      if (!['y', 'yes'].includes(answer)) {
        say('self-yolo-agent', 'cancelled');
        await fsPromises.unlink(tmpPath).catch(() => {});
        return { applied: false, preview: true, cancelled: true, tmpPath };
      }
    }
  } else if (options.preview) {
    rule('self-yolo-agent', 'DIFF PREVIEW');
    printDiff(target.targetPath, tmpPath);
  }

  await fsPromises.copyFile(tmpPath, target.targetPath);
  if (target.relative.endsWith('.py')) {
    const finalCheck = spawnSync(process.env.PYTHON || 'python3', ['-m', 'py_compile', target.targetPath], {
      encoding: 'utf8',
    });
    if (finalCheck.status !== 0) {
      await fsPromises.copyFile(bakPath, target.targetPath);
      throw new Error(`final syntax check failed:\n${finalCheck.stderr || finalCheck.stdout}`);
    }
  }

  const git = runtime.runGit || runGit;
  const command = runtime.runCommand || runCommand;

  git(target.repoPath, ['add', target.relative]);
  const commitRes = git(target.repoPath, ['commit', '-m', `self-yolo-agent: improve ${target.relative}`], {
    stdio: 'pipe',
  });
  if (commitRes.stdout || commitRes.stderr) {
    say('self-yolo-agent', (commitRes.stdout || commitRes.stderr).trim());
  }

  const pushRes = git(target.repoPath, ['push'], { stdio: 'pipe' });
  if (pushRes.stdout || pushRes.stderr) {
    say('self-yolo-agent', (pushRes.stdout || pushRes.stderr).trim());
  }

  const reinstallRes = command('pip', ['install', '--break-system-packages', '-e', target.repoPath], {
    stdio: 'pipe',
  });
  if (reinstallRes.stdout || reinstallRes.stderr) {
    say('self-yolo-agent', (reinstallRes.stdout || reinstallRes.stderr).trim());
  }

  rule('self-yolo-agent', 'DONE');
  say('self-yolo-agent', `updated ${target.relative}`);
  return {
    applied: true,
    tmpPath,
    targetPath: target.targetPath,
  };
}

async function runSelfYoloLoop(argv = process.argv.slice(2), runtime = {}) {
  const args = Array.from(argv);
  if (args[0] === '-h' || args[0] === '--help') {
    console.log(`Usage:
  self-yolo-loop "task" [rounds]

Examples:
  self-yolo-loop "Improve the README installation section"
  self-yolo-loop "Update the CLI help" 5`);
    return 0;
  }
  const task = args[0] || '';
  if (!task) {
    throw new Error('Usage: self-yolo-loop "task" [rounds]');
  }

  const rounds = Number.isFinite(Number.parseInt(args[1] || '3', 10))
    ? Math.max(1, Number.parseInt(args[1] || '3', 10))
    : 3;
  for (let index = 1; index <= rounds; index += 1) {
    console.log(`\n${'='.repeat(56)}\n[self-yolo-loop] round ${index}/${rounds}\n${'='.repeat(56)}`);
    const result = runtime.runAgent
      ? await runtime.runAgent(task, index)
      : await runSelfYoloAgent([task], { ...runtime, preview: false });
    if (result && result.returncode && result.returncode !== 0) {
      console.log(`[self-yolo-loop] stopped on round ${index} (error)`);
      return result.returncode;
    }
    console.log(`[self-yolo-loop] completed round ${index}`);
    if (index < rounds) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n[self-yolo-loop] done after ${rounds} rounds`);
  return 0;
}

async function runSelfUpdateAgent(argv = process.argv.slice(2), runtime = {}) {
  const options = parseArgs(argv, { repo: DEFAULT_REPO });
  if (options.help) {
    console.log(`Usage:
  self-update-agent [--repo path]

Examples:
  self-update-agent
  self-update-agent --repo ~/3dvr-agent`);
    return 0;
  }

  const repo = options.repo;
  const git = runtime.runGit || runGit;
  const command = runtime.runCommand || runCommand;
  say('self-update-agent', 'syncing repo...');
  git(repo, ['add', '.'], { stdio: 'pipe' });
  git(repo, ['commit', '-m', 'self-update-agent'], { stdio: 'pipe' });
  say('self-update-agent', 'pushing...');
  const pushResult = git(repo, ['push'], { stdio: 'pipe' });
  if (pushResult.stdout || pushResult.stderr) {
    console.log(pushResult.stdout || pushResult.stderr);
  }
  say('self-update-agent', 'reinstalling package...');
  const reinstall = command('pip', ['install', '--break-system-packages', '-e', repo], { stdio: 'pipe' });
  if (reinstall.stdout || reinstall.stderr) {
    console.log(reinstall.stdout || reinstall.stderr);
  }
  say('self-update-agent', 'done.');
  return 0;
}

async function runRollbackAgent(argv = process.argv.slice(2), runtime = {}) {
  const options = parseArgs(argv, { repo: process.cwd() });
  if (options.help) {
    console.log(`Usage:
  rollback-agent [--repo path] [target]

Examples:
  rollback-agent
  rollback-agent HEAD~1`);
    return 0;
  }

  const target = options.task || 'HEAD~1';
  const repo = options.repo || process.cwd();
  console.log(`[rollback] resetting ${repo} to ${target}`);
  const git = runtime.runGit || runGit;
  git(repo, ['reset', '--hard', target], { stdio: 'inherit' });
  console.log('[rollback] done');
  return 0;
}

module.exports = {
  ALLOWED,
  buildPrompt,
  cleanText,
  dedupeMarkdownSections,
  extractMarkdownSection,
  parseArgs,
  resolveTarget,
  runRollbackAgent,
  runSelfUpdateAgent,
  runSelfYoloAgent,
  runSelfYoloLoop,
  stripCodeFences,
};

if (require.main === module) {
  const subcommand = process.argv[2] || 'agent';
  const args = process.argv.slice(3);
  const dispatch = {
    agent: runSelfYoloAgent,
    loop: runSelfYoloLoop,
    update: runSelfUpdateAgent,
    rollback: runRollbackAgent,
  }[subcommand];

  if (!dispatch) {
    console.error(`Unknown workflow: ${subcommand}`);
    process.exit(1);
  }

  dispatch(args).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
