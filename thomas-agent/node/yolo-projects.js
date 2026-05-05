const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  cleanModelOutput,
  ensureServer,
  requestCompletion,
} = require('./yolo-agent');

const DEFAULT_SERVER_URL = process.env.THREEDVR_YOLO_SERVER_URL || 'http://127.0.0.1:8080';
const DEFAULT_MODEL = process.env.THREEDVR_YOLO_MODEL || 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M';
const DEFAULT_LLAMA_SERVER = process.env.THREEDVR_LLAMA_SERVER_BIN || path.join(process.env.HOME || '', 'llama.cpp', 'build', 'bin', 'llama-server');
const DEFAULT_APP_REPO = process.env.THREEDVR_YOLO_SITE_REPO || path.join(os.homedir(), '3dvr-site');
const DEFAULT_NEW_SITE_ROOT = process.env.THREEDVR_YOLO_NEW_SITE_ROOT || os.homedir();

function say(prefix, message) {
  console.log(`[${prefix}] ${message}`);
}

function rule(title = '') {
  const bar = '='.repeat(56);
  console.log(`\n${bar}\n${title}\n${bar}`);
}

function parseCommonArgs(argv, defaults) {
  const options = {
    repo: defaults.repo || '',
    root: defaults.root || '',
    name: '',
    prompt: '',
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

  if (!options.name && positional.length >= 1) {
    options.name = positional.shift();
  }
  if (!options.prompt && positional.length >= 1) {
    options.prompt = positional.join(' ');
  }

  options.repo = path.resolve(options.repo || defaults.repo || DEFAULT_APP_REPO);
  options.root = path.resolve(options.root || defaults.root || DEFAULT_NEW_SITE_ROOT);
  options.serverUrl = (options.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  return options;
}

function buildAppPrompt({ name, prompt }) {
  return `Return ONLY valid complete HTML.
Do not use markdown fences.
Start with <!DOCTYPE html>.
End with </html>.
Use inline CSS only.
Use a dark modern design.
Do not invent broken internal links.

Page topic: ${prompt}
Path: /apps/${name}
`;
}

function buildSitePrompt({ name, prompt }) {
  return `Return ONLY valid complete HTML.
Do not use markdown fences.
Start with <!DOCTYPE html>.
End with </html>.
Use inline CSS only.
Use a dark modern design.
Do not invent broken internal links.

Site name: ${name}
Topic: ${prompt}
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

async function generateHtml({ options, prompt, prefix }, runtime = {}) {
  if (!runtime.skipServer) {
    await ensureServer({
      serverUrl: options.serverUrl,
      startServer: options.startServer,
      llamaServer: options.llamaServer,
      model: options.model,
    });
  }

  const completion = runtime.completion !== undefined
    ? runtime.completion
    : await requestCompletion({
      serverUrl: options.serverUrl,
      prompt,
      stream: true,
    });

  const html = cleanModelOutput(completion, 'index.html');
  if (!html.trim()) {
    throw new Error('Validation failed: empty model output.');
  }

  if (runtime.printDiff === false) {
    say(prefix, 'model output captured');
  }

  return html;
}

async function runYoloApp(argv = process.argv.slice(2), runtime = {}) {
  const options = parseCommonArgs(argv, { repo: DEFAULT_APP_REPO });
  if (options.help) {
    console.log(`Usage:
  ask-yolo-app [--repo path] "app-name" "prompt"

Examples:
  ask-yolo-app dark-horse "A dark, modern coffee shop landing page"
  ask-yolo-app --repo ~/3dvr-site acme-dashboard "A dashboard for a contractor app"`);
    return 0;
  }
  if (!options.name || !options.prompt) {
    throw new Error('Missing app name or prompt. Run `ask-yolo-app --help` for usage.');
  }

  const repoPath = options.repo;
  const appDir = path.join(repoPath, 'apps', options.name);
  const filePath = path.join(appDir, 'index.html');
  await fsPromises.mkdir(appDir, { recursive: true });

  const prompt = buildAppPrompt({ name: options.name, prompt: options.prompt });
  say('yolo-app', `target: apps/${options.name}/index.html`);
  say('yolo-app', `prompt size: ${prompt.length} chars`);

  const html = await generateHtml({ options, prompt, prefix: 'yolo-app' }, runtime);
  await fsPromises.writeFile(filePath, html, 'utf8');
  say('yolo-app', `created ${filePath}`);

  const git = runtime.runGit || runGit;
  git(repoPath, ['add', path.relative(repoPath, filePath)]);
  git(repoPath, ['commit', '-m', `Add app ${options.name}`]);
  say('yolo-app', 'committed changes');
  if (runtime.push !== false) {
    git(repoPath, ['push']);
    say('yolo-app', 'pushing...');
    say('yolo-app', 'deployed via Vercel (git push)');
  }

  return {
    repoPath,
    filePath,
    html,
  };
}

async function runYoloNewSite(argv = process.argv.slice(2), runtime = {}) {
  const options = parseCommonArgs(argv, { root: DEFAULT_NEW_SITE_ROOT });
  if (options.help) {
    console.log(`Usage:
  ask-yolo-new-site [--root path] "site-name" "prompt"

Examples:
  ask-yolo-new-site dark-horse "A clean coffee shop website"
  ask-yolo-new-site --root ~/projects dark-horse "A clean coffee shop website"`);
    return 0;
  }
  if (!options.name || !options.prompt) {
    throw new Error('Missing site name or prompt. Run `ask-yolo-new-site --help` for usage.');
  }

  const repoDir = path.join(options.root, options.name);
  if (fs.existsSync(repoDir)) {
    throw new Error(`Directory already exists: ${repoDir}`);
  }

  say('yolo-new-site', `creating repo dir: ${repoDir}`);
  await fsPromises.mkdir(repoDir, { recursive: false });

  const prompt = buildSitePrompt({ name: options.name, prompt: options.prompt });
  say('yolo-new-site', `prompt size: ${prompt.length} chars`);
  const html = await generateHtml({ options, prompt, prefix: 'yolo-new-site' }, runtime);

  await fsPromises.writeFile(path.join(repoDir, 'index.html'), html, 'utf8');
  await fsPromises.writeFile(
    path.join(repoDir, 'README.md'),
    `# ${options.name}\n\nGenerated by ask-yolo-new-site.\n`,
    'utf8',
  );

  const git = runtime.runGit || runGit;
  const command = runtime.runCommand || runCommand;

  say('yolo-new-site', 'initializing git...');
  git(repoDir, ['init']);
  git(repoDir, ['branch', '-M', 'main']);
  git(repoDir, ['add', '.']);
  git(repoDir, ['commit', '-m', 'Initial site']);

  say('yolo-new-site', 'creating GitHub repo...');
  command('gh', ['repo', 'create', options.name, '--public', '--source=.', '--remote=origin', '--push'], {
    cwd: repoDir,
  });

  say('yolo-new-site', 'created GitHub repo');
  say('yolo-new-site', `deploy with: cd ~/${options.name} && vercel --prod`);

  return {
    repoDir,
    html,
  };
}

module.exports = {
  buildAppPrompt,
  buildSitePrompt,
  runYoloApp,
  runYoloNewSite,
};
