import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

function parseArgs(argv) {
  const options = { baseline: '', candidate: '', output: '', threshold: 0.1 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => { index += 1; assert(index < argv.length, `${arg} requires a value`); return argv[index]; };
    if (arg === '--baseline') options.baseline = next();
    else if (arg === '--candidate') options.candidate = next();
    else if (arg === '--output') options.output = next();
    else if (arg === '--threshold') options.threshold = Number.parseFloat(next());
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log('Usage: npm run visual:compare -- --baseline <capture> --candidate <capture> --output <dir>');
}
async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function frameKey(frame, index) {
  return Number.isFinite(frame.scheduledMs) ? frame.scheduledMs : index;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function consoleErrors(manifest) {
  const console = (manifest.console || []).filter((event) => event.type === 'error');
  return [...(manifest.pageErrors || []), ...console];
}

async function compareFrame(baselinePath, candidatePath, diffPath, threshold) {
  const baseline = PNG.sync.read(await readFile(baselinePath));
  const candidate = PNG.sync.read(await readFile(candidatePath));
  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    return { compatible: false, width: candidate.width, height: candidate.height, diffPixels: null, ratio: 1 };
  }
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const diffPixels = pixelmatch(baseline.data, candidate.data, diff.data, baseline.width, baseline.height, {
    threshold,
    includeAA: false,
  });
  await writeFile(diffPath, PNG.sync.write(diff));
  return {
    compatible: true,
    width: baseline.width,
    height: baseline.height,
    diffPixels,
    ratio: diffPixels / (baseline.width * baseline.height),
  };
}
function buildHtml(result) {
  const rows = result.frames.map((frame) => `
    <section class="frame">
      <h2>${frame.scheduledMs} ms · ${(frame.ratio * 100).toFixed(2)}% changed</h2>
      <div class="grid">
        <figure><img src="${escapeHtml(frame.baseline)}"><figcaption>Baseline</figcaption></figure>
        <figure><img src="${escapeHtml(frame.candidate)}"><figcaption>Candidate</figcaption></figure>
        ${frame.diff ? `<figure><img src="${escapeHtml(frame.diff)}"><figcaption>Diff</figcaption></figure>` : ''}
      </div>
    </section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(result.name)} visual regression</title><style>
  :root{color-scheme:dark;font-family:system-ui;background:#0d1117;color:#e6edf3}body{margin:0;padding:24px}main{max-width:1400px;margin:auto}
  .stats{display:flex;gap:18px;flex-wrap:wrap;color:#9da7b3}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  figure{margin:0;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden}img{display:block;width:100%}figcaption{padding:8px}.frame{margin:28px 0}
  @media(max-width:800px){.grid{grid-template-columns:1fr}}
  </style></head><body><main><h1>${escapeHtml(result.name)}</h1>
  <div class="stats"><span>mean ${(result.summary.meanRatio * 100).toFixed(2)}%</span><span>max ${(result.summary.maxRatio * 100).toFixed(2)}%</span>
  <span>${result.summary.changedFrames}/${result.summary.totalFrames} frames over 1%</span></div>${rows}</main></body></html>`;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) { printHelp(); process.exit(0); }
assert(options.baseline, '--baseline is required');
assert(options.candidate, '--candidate is required');
assert(options.output, '--output is required');
assert(Number.isFinite(options.threshold) && options.threshold >= 0 && options.threshold <= 1, '--threshold must be 0..1');
const baselineDir = resolve(options.baseline);
const candidateDir = resolve(options.candidate);
const outputDir = resolve(options.output);
const diffDir = join(outputDir, 'diffs');
await mkdir(diffDir, { recursive: true });
const baselineManifest = await readJson(join(baselineDir, 'manifest.json'));
const candidateManifest = await readJson(join(candidateDir, 'manifest.json'));

const baselineFrames = new Map((baselineManifest.frames || []).map((frame, index) => [frameKey(frame, index), frame]));
const candidateFrames = new Map((candidateManifest.frames || []).map((frame, index) => [frameKey(frame, index), frame]));
const keys = [...candidateFrames.keys()].filter((key) => baselineFrames.has(key)).sort((a, b) => a - b);
assert(keys.length > 0, 'No matching frames found between captures');

const frames = [];
for (const [index, key] of keys.entries()) {
  const baselineFrame = baselineFrames.get(key);
  const candidateFrame = candidateFrames.get(key);
  const diffName = `diff-${String(index).padStart(4, '0')}-${String(key).padStart(6, '0')}ms.png`;
  const comparison = await compareFrame(
    join(baselineDir, baselineFrame.path),
    join(candidateDir, candidateFrame.path),
    join(diffDir, diffName),
    options.threshold,
  );
  frames.push({
    scheduledMs: key,
    baseline: `../baseline/${baselineFrame.path}`,
    candidate: `../candidate/${candidateFrame.path}`,
    diff: comparison.compatible ? `diffs/${diffName}` : null,
    ...comparison,
  });
}
const baselineErrors = consoleErrors(baselineManifest);
const candidateErrors = consoleErrors(candidateManifest);
const baselineErrorText = new Set(baselineErrors.map((entry) => entry.text || entry.message || JSON.stringify(entry)));
const newCandidateErrors = candidateErrors.filter((entry) => !baselineErrorText.has(entry.text || entry.message || JSON.stringify(entry)));
const ratios = frames.map((frame) => frame.ratio);
const summary = {
  totalFrames: frames.length,
  changedFrames: frames.filter((frame) => frame.ratio >= 0.01).length,
  meanRatio: ratios.reduce((sum, value) => sum + value, 0) / ratios.length,
  maxRatio: Math.max(...ratios),
  baselineErrors: baselineErrors.length,
  candidateErrors: candidateErrors.length,
  newCandidateErrors: newCandidateErrors.length,
  baselineRafFps: baselineManifest.performance?.rafFpsDuringCapture ?? null,
  candidateRafFps: candidateManifest.performance?.rafFpsDuringCapture ?? null,
};
const topFrames = [...frames].sort((a, b) => b.ratio - a.ratio).slice(0, 4);
const result = {
  formatVersion: 1,
  name: candidateManifest.name || baselineManifest.name || 'visual-regression',
  baseline: { manifest: '../baseline/manifest.json', url: baselineManifest.requestedUrl },
  candidate: { manifest: '../candidate/manifest.json', url: candidateManifest.requestedUrl },
  pixelmatchThreshold: options.threshold,
  summary,
  frames,
  topFrames,
  errors: {
    baseline: baselineErrors,
    candidate: candidateErrors,
    newCandidate: newCandidateErrors,
  },
};
await writeFile(join(outputDir, 'comparison.json'), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(join(outputDir, 'index.html'), `${buildHtml(result)}\n`);
console.log(`Visual comparison complete: ${outputDir}`);
console.log(`Mean ${(summary.meanRatio * 100).toFixed(2)}% | Max ${(summary.maxRatio * 100).toFixed(2)}% | ${summary.changedFrames}/${summary.totalFrames} frames >1%`);
