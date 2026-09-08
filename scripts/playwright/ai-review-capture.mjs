import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const options = { comparison: '', output: '', maxFrames: 2, model: process.env.VISUAL_REVIEW_MODEL || 'gpt-5.6-luna' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => { index += 1; assert(index < argv.length, `${arg} requires a value`); return argv[index]; };
    if (arg === '--comparison') options.comparison = next();
    else if (arg === '--output') options.output = next();
    else if (arg === '--max-frames') options.maxFrames = Number.parseInt(next(), 10);
    else if (arg === '--model') options.model = next();
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log('Usage: npm run visual:ai-review -- --comparison <comparison.json> [--output ai-review.md]');
}

function outputText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  return (payload.output || []).flatMap((item) => item.content || [])
    .map((part) => part.text || part.output_text || '').filter(Boolean).join('\n').trim();
}
async function imagePart(baseDir, label, relativePath) {
  const bytes = await readFile(resolve(baseDir, relativePath));
  return [
    { type: 'input_text', text: label },
    { type: 'input_image', image_url: `data:image/png;base64,${bytes.toString('base64')}` },
  ];
}

function buildPrompt(comparison) {
  const summary = comparison.summary || {};
  const candidateErrors = comparison.errors?.candidate || [];
  const newCandidateErrors = comparison.errors?.newCandidate || [];
  return [
    'Review this before/after visual regression for a web animation, 3D scene, or gameplay experience.',
    'Focus on regressions, rendering failures, animation discontinuities, camera/layout problems, missing objects, flicker, and accidental visual changes.',
    'Do not flag a change merely because pixels differ; infer whether the candidate still looks coherent and intentional.',
    `Mean pixel change: ${((summary.meanRatio || 0) * 100).toFixed(2)}%.`,
    `Max pixel change: ${((summary.maxRatio || 0) * 100).toFixed(2)}%.`,
    `Baseline console/page errors: ${summary.baselineErrors || 0}. Candidate: ${summary.candidateErrors || 0}. New candidate errors: ${summary.newCandidateErrors || 0}.`,
    newCandidateErrors.length ? `New candidate errors: ${newCandidateErrors.map((entry) => entry.text || entry.message).join(' | ')}` : 'New candidate errors: none.',
    candidateErrors.length ? `All candidate errors: ${candidateErrors.map((entry) => entry.text || entry.message).join(' | ')}` : 'All candidate errors: none captured.',
    'Return concise Markdown with: Verdict (PASS/WARN/FAIL), What changed, Suspicious frames, and Next action.',
  ].join('\n');
}

const options = parseArgs(process.argv.slice(2));
if (options.help) { printHelp(); process.exit(0); }
assert(options.comparison, '--comparison is required');
assert(Number.isInteger(options.maxFrames) && options.maxFrames > 0, '--max-frames must be positive');
const comparisonPath = resolve(options.comparison);
const baseDir = dirname(comparisonPath);
const outputPath = resolve(options.output || `${baseDir}/ai-review.md`);
const comparison = JSON.parse(await readFile(comparisonPath, 'utf8'));
if (!process.env.OPENAI_API_KEY) {
  await writeFile(outputPath, '# AI visual review\n\nSkipped: `OPENAI_API_KEY` is not configured for this run. The comparison artifact is still available for human or agent review.\n');
  console.log(`AI review skipped: ${outputPath}`);
  process.exit(0);
}

const content = [{ type: 'input_text', text: buildPrompt(comparison) }];
const frames = (comparison.topFrames || []).slice(0, options.maxFrames);
for (const frame of frames) {
  content.push({ type: 'input_text', text: `Frame ${frame.scheduledMs} ms — ${(frame.ratio * 100).toFixed(2)}% changed` });
  content.push(...await imagePart(baseDir, 'Baseline frame', frame.baseline));
  content.push(...await imagePart(baseDir, 'Candidate frame', frame.candidate));
  if (frame.diff) content.push(...await imagePart(baseDir, 'Pixel diff', frame.diff));
}

let response;
try {
  response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      input: [{ role: 'user', content }],
      max_output_tokens: 1800,
    }),
  });
} catch (error) {
  await writeFile(outputPath, `# AI visual review\n\nUnavailable: network request failed: ${error.message}\n`);
  console.warn(`AI visual review network failure: ${outputPath}`);
  process.exit(0);
}
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  const message = payload.error?.message || response.statusText || 'unknown API error';
  await writeFile(outputPath, `# AI visual review\n\nUnavailable: OpenAI review returned ${response.status}: ${message}\n`);
  console.warn(`AI visual review unavailable: ${outputPath}`);
  process.exit(0);
}
const review = outputText(payload);
if (!review) {
  await writeFile(outputPath, '# AI visual review\n\nUnavailable: the review response contained no text.\n');
  console.warn(`AI visual review empty: ${outputPath}`);
  process.exit(0);
}
await writeFile(outputPath, `# AI visual review\n\n_Model: ${options.model}_\n\n${review}\n`);
console.log(`AI visual review complete: ${outputPath}`);
