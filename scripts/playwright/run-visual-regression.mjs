import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = { baselineRoot: '', candidateRoot: process.cwd(), output: '.tmp/visual-regression', config: 'visual-regression.config.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => { index += 1; assert(index < argv.length, `${arg} requires a value`); return argv[index]; };
    if (arg === '--baseline-root') options.baselineRoot = next();
    else if (arg === '--candidate-root') options.candidateRoot = next();
    else if (arg === '--output') options.output = next();
    else if (arg === '--config') options.config = next();
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log('Usage: npm run visual:regression -- --baseline-root <dir> [--candidate-root <dir>]');
}
async function run(script, args) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [join(scriptDir, script), ...args], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 1024 * 1024 * 8,
    timeout: 10 * 60 * 1000,
  });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}

function captureArgs(root, output, scenario) {
  return [
    '--root', root,
    '--url', scenario.url,
    '--duration', scenario.duration || '4s',
    '--interval', scenario.interval || '500ms',
    '--width', String(scenario.width || 1280),
    '--height', String(scenario.height || 720),
    '--seed', String(scenario.seed || 1337),
    '--name', scenario.name,
    '--output', output,
  ];
}

function verdictFromMarkdown(markdown) {
  const match = markdown.match(/\b(PASS|WARN|FAIL)\b/i);
  return match ? match[1].toUpperCase() : 'REVIEW';
}
const options = parseArgs(process.argv.slice(2));
if (options.help) { printHelp(); process.exit(0); }
assert(options.baselineRoot, '--baseline-root is required');
const baselineRoot = resolve(options.baselineRoot);
const candidateRoot = resolve(options.candidateRoot);
const outputRoot = resolve(options.output);
const config = JSON.parse(await readFile(resolve(options.config), 'utf8'));
assert(Array.isArray(config.scenarios) && config.scenarios.length, 'Visual regression config needs scenarios');
await mkdir(outputRoot, { recursive: true });

const results = [];
for (const scenario of config.scenarios) {
  console.log(`\n=== ${scenario.name} ===`);
  const scenarioDir = join(outputRoot, scenario.name);
  const baselineDir = join(scenarioDir, 'baseline');
  const candidateDir = join(scenarioDir, 'candidate');
  const reportDir = join(scenarioDir, 'report');
  await mkdir(reportDir, { recursive: true });

  await run('capture.mjs', captureArgs(baselineRoot, baselineDir, scenario));
  await run('capture.mjs', captureArgs(candidateRoot, candidateDir, scenario));
  await run('compare-captures.mjs', ['--baseline', baselineDir, '--candidate', candidateDir, '--output', reportDir]);
  await run('ai-review-capture.mjs', ['--comparison', join(reportDir, 'comparison.json')]);

  const comparison = JSON.parse(await readFile(join(reportDir, 'comparison.json'), 'utf8'));
  const aiReview = await readFile(join(reportDir, 'ai-review.md'), 'utf8');
  results.push({ scenario, comparison, aiReview, verdict: verdictFromMarkdown(aiReview) });
}
const table = results.map(({ scenario, comparison, verdict }) => {
  const summary = comparison.summary;
  return `| ${scenario.name} | ${verdict} | ${(summary.meanRatio * 100).toFixed(2)}% | ${(summary.maxRatio * 100).toFixed(2)}% | +${summary.newCandidateErrors}/${summary.candidateErrors} |`;
}).join('\n');
const reviews = results.map(({ scenario, aiReview }) => `## ${scenario.name}\n\n${aiReview.replace(/^# AI visual review\s*/i, '').trim()}`).join('\n\n');
const summaryMarkdown = `# Visual regression review\n\n| Scenario | AI | Mean diff | Max diff | New/total errors |\n| --- | --- | ---: | ---: | ---: |\n${table}\n\n${reviews}\n`;
await writeFile(join(outputRoot, 'summary.md'), summaryMarkdown);
await writeFile(join(outputRoot, 'summary.json'), `${JSON.stringify(results.map(({ scenario, comparison, verdict }) => ({
  name: scenario.name,
  url: scenario.url,
  verdict,
  summary: comparison.summary,
})), null, 2)}\n`);
console.log(`\nVisual regression suite complete: ${outputRoot}`);
