import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { launchConfiguredPlaywrightBrowser, resolvePlaywrightBrowser } from './browser-targets.mjs';

const execFileAsync = promisify(execFile);
const host = '127.0.0.1';
const requestedPort = Number.parseInt(process.env.PLAYWRIGHT_CAPTURE_PORT ?? '0', 10);
let rootDir = resolve(process.cwd());
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'], ['.webm', 'video/webm'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'],
]);

function printHelp() {
  console.log(`Usage: npm run visual:capture -- [options]\n\n--url <url|path>  --duration <6s>  --interval <500ms>\n--width <1280>    --height <720>   --browser <chromium>\n--name <label>    --output <dir>   --root <dir>    --seed <number>\n--full-page       --no-video\n`);
}
function parseTime(value, label) {
  const match = String(value ?? '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(ms|s)?$/);
  assert(match, `${label} must look like 500ms, 2s, or 2000`);
  const ms = Number.parseFloat(match[1]) * (match[2] === 's' ? 1000 : 1);
  assert(Number.isFinite(ms) && ms >= 0, `${label} must be non-negative`);
  return Math.round(ms);
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  assert(Number.isInteger(parsed) && parsed > 0, `${label} must be a positive integer`);
  return parsed;
}

function parseArgs(argv) {
  const options = {
    url: process.env.VISUAL_CAPTURE_URL || '/',
    durationMs: parseTime(process.env.VISUAL_CAPTURE_DURATION || '6s', 'duration'),
    intervalMs: parseTime(process.env.VISUAL_CAPTURE_INTERVAL || '500ms', 'interval'),
    width: parsePositiveInteger(process.env.VISUAL_CAPTURE_WIDTH || '1280', 'width'),
    height: parsePositiveInteger(process.env.VISUAL_CAPTURE_HEIGHT || '720', 'height'),
    browser: process.env.PLAYWRIGHT_BROWSER || 'chromium',
    name: process.env.VISUAL_CAPTURE_NAME || '', output: process.env.VISUAL_CAPTURE_OUTPUT || '',
    root: process.env.VISUAL_CAPTURE_ROOT || process.cwd(), seed: null,
    fullPage: false, video: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => { index += 1; assert(index < argv.length, `${arg} requires a value`); return argv[index]; };
    if (arg === '--url') options.url = next();
    else if (arg === '--duration') options.durationMs = parseTime(next(), 'duration');
    else if (arg === '--interval') options.intervalMs = parseTime(next(), 'interval');
    else if (arg === '--width') options.width = parsePositiveInteger(next(), 'width');
    else if (arg === '--height') options.height = parsePositiveInteger(next(), 'height');
    else if (arg === '--browser') options.browser = next();
    else if (arg === '--name') options.name = next();
    else if (arg === '--output') options.output = next();
    else if (arg === '--root') options.root = next();
    else if (arg === '--seed') options.seed = parsePositiveInteger(next(), 'seed');
    else if (arg === '--full-page') options.fullPage = true;
    else if (arg === '--no-video') options.video = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  assert(options.intervalMs > 0, 'interval must be greater than zero');
  assert(options.durationMs >= options.intervalMs, 'duration must be at least one interval');
  return options;
}

function slugify(value) {
  return String(value || 'capture').toLowerCase().replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'capture';
}

function timestampForPath(date = new Date()) { return date.toISOString().replace(/[:.]/g, '-'); }
function isRemoteUrl(value) { return /^https?:\/\//i.test(String(value)); }
function resolveSafePath(pathname) {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const absolutePath = resolve(rootDir, `.${normalized}`);
  if (absolutePath !== rootDir && !absolutePath.startsWith(`${rootDir}${sep}`)) return null;
  return absolutePath;
}

function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const rawPath = request.url ? new URL(request.url, `http://${host}`).pathname : '/';
      const filePath = resolveSafePath(rawPath);
      if (!filePath) { response.writeHead(403); response.end('Forbidden'); return; }
      let targetPath = filePath;
      const fileInfo = await stat(filePath).catch(() => null);
      if (fileInfo?.isDirectory()) targetPath = join(filePath, 'index.html');
      const content = await readFile(targetPath);
      const contentType = mimeTypes.get(extname(targetPath).toLowerCase()) || 'application/octet-stream';
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': contentType });
      response.end(content);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
}
async function listen(server, port) {
  await new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(port, host, () => { server.removeListener('error', rejectServer); resolveServer(); });
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'Expected local capture server address');
  return address.port;
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

async function findFfmpeg() {
  const candidates = process.env.FFMPEG_PATH ? [process.env.FFMPEG_PATH, 'ffmpeg'] : ['ffmpeg'];
  const cacheDir = join(homedir(), '.cache', 'ms-playwright');
  const entries = await readdir(cacheDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('ffmpeg-')) {
      candidates.push(join(cacheDir, entry.name, 'ffmpeg-linux'), join(cacheDir, entry.name, 'ffmpeg'));
    }
  }
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ['-version'], { timeout: 3000 });
      return candidate;
    } catch {
      // Try the next known system or Playwright ffmpeg location.
    }
  }
  throw new Error('Video frame extraction needs ffmpeg. Install Playwright browsers or set FFMPEG_PATH.');
}

async function extractVideoFrames(videoPath, framesDir, options) {
  const ffmpeg = await findFfmpeg();
  const frames = [];
  let sequence = 0;
  for (let scheduledMs = 0; scheduledMs <= options.durationMs; scheduledMs += options.intervalMs) {
    const videoMs = Math.max(0, options.startOffsetMs + scheduledMs);
    const fileName = `frame-${String(sequence).padStart(4, '0')}-${String(scheduledMs).padStart(6, '0')}ms.png`;
    const outputPath = join(framesDir, fileName);
    await execFileAsync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', (videoMs / 1000).toFixed(3), '-i', videoPath,
      '-frames:v', '1', outputPath,
    ], { timeout: 30000 });
    const extracted = await stat(outputPath).catch(() => null);
    if (!extracted?.isFile() || extracted.size === 0) continue;
    frames.push({ sequence, scheduledMs, actualMs: scheduledMs, path: `frames/${fileName}`, source: 'video' });
    sequence += 1;
  }
  return frames;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function buildReportHtml(manifest) {
  const frames = manifest.frames.map((frame) => `
    <figure><img src="${escapeHtml(frame.path)}" loading="lazy" alt="Frame at ${frame.actualMs}ms">
    <figcaption>${frame.actualMs} ms</figcaption></figure>`).join('');
  const video = manifest.video
    ? `<section><h2>Video</h2><video src="${escapeHtml(manifest.video)}" controls playsinline></video></section>` : '';
  const errors = [...manifest.pageErrors, ...manifest.console.filter((event) => event.type === 'error')];
  const errorItems = errors.length
    ? errors.map((event) => `<li>${escapeHtml(event.text || event.message || JSON.stringify(event))}</li>`).join('')
    : '<li>None captured</li>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(manifest.name)} visual capture</title><style>
  :root{color-scheme:dark;font-family:system-ui;background:#111;color:#eee}body{margin:0;padding:24px}header,section{max-width:1200px;margin:0 auto 28px}
  h1,h2{margin:0 0 12px}p{color:#bbb}code{overflow-wrap:anywhere}video{width:100%;max-height:70vh;background:#000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
  figure{margin:0;background:#1a1a1a;border-radius:10px;overflow:hidden}img{width:100%;display:block}figcaption{padding:8px 10px;color:#aaa;font-variant-numeric:tabular-nums}.stats{display:flex;flex-wrap:wrap;gap:16px}
  </style></head><body><header><h1>${escapeHtml(manifest.name)}</h1><p><code>${escapeHtml(manifest.url)}</code></p>
  <div class="stats"><span>${manifest.viewport.width}×${manifest.viewport.height}</span><span>${manifest.frames.length} frames</span>
  <span>${manifest.performance.rafFpsDuringCapture.toFixed(1)} rAF FPS during capture</span><span>${manifest.durationMs} ms</span></div></header>${video}
  <section><h2>Timeline</h2><div class="grid">${frames}</div></section><section><h2>Captured errors</h2><ul>${errorItems}</ul></section></body></html>`;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) { printHelp(); process.exit(0); }
assert(Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort < 65536,
  'PLAYWRIGHT_CAPTURE_PORT must be between 0 and 65535');

rootDir = resolve(options.root);
const startedAt = new Date();
const label = options.name || slugify(options.url);
const outputDir = resolve(options.output || join('.tmp', 'visual-captures', `${timestampForPath(startedAt)}-${slugify(label)}`));
const framesDir = join(outputDir, 'frames');
const rawVideoDir = join(outputDir, 'video');
await mkdir(framesDir, { recursive: true });
if (options.video) await mkdir(rawVideoDir, { recursive: true });

let server;
let browser;
let context;
let page;
let videoHandle;
let frames = [];
const consoleEvents = [];
const pageErrors = [];
let targetUrl = options.url;
let browserTarget;
let videoSessionStartedAt = 0;
let captureStartedAt = 0;

try {
  if (!isRemoteUrl(options.url)) {
    const pathname = options.url.startsWith('/') ? options.url : `/${options.url}`;
    server = createStaticServer();
    const localPort = await listen(server, requestedPort);
    targetUrl = `http://${host}:${localPort}${pathname}`;
  }

  browserTarget = resolvePlaywrightBrowser(options.browser, 'chromium');
  browser = await launchConfiguredPlaywrightBrowser(browserTarget);
  context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    ...(options.video ? { recordVideo: { dir: rawVideoDir, size: { width: options.width, height: options.height } } } : {}),
  });
  if (options.seed !== null) {
    await context.addInitScript((seed) => {
      let state = seed >>> 0;
      Math.random = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
      };
    }, options.seed);
  }
  videoSessionStartedAt = Date.now();
  page = await context.newPage();
  page.on('console', (message) => {
    consoleEvents.push({ atMs: Date.now() - startedAt.getTime(), type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push({ atMs: Date.now() - startedAt.getTime(), message: error.message });
  });
  const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  assert(!response || response.ok(), `Expected ${targetUrl} to load successfully`);
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  await page.evaluate(() => {
    const state = { startedAt: performance.now(), lastAt: null, frames: 0, totalDelta: 0, maxDelta: 0 };
    window.__visualCapturePerf = state;
    const tick = (now) => {
      if (state.lastAt !== null) {
        const delta = now - state.lastAt;
        state.totalDelta += delta;
        state.maxDelta = Math.max(state.maxDelta, delta);
      }
      state.lastAt = now;
      state.frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  videoHandle = options.video ? page.video() : null;
  captureStartedAt = Date.now();
  if (options.video) {
    await delay(options.durationMs);
  } else {
    let sequence = 0;
    for (let scheduledMs = 0; scheduledMs <= options.durationMs; scheduledMs += options.intervalMs) {
      const waitMs = captureStartedAt + scheduledMs - Date.now();
      if (waitMs > 0) await delay(waitMs);
      const actualMs = Date.now() - captureStartedAt;
      const fileName = `frame-${String(sequence).padStart(4, '0')}-${String(actualMs).padStart(6, '0')}ms.png`;
      await page.screenshot({ path: join(framesDir, fileName), fullPage: options.fullPage, animations: 'allow' });
      frames.push({ sequence, scheduledMs, actualMs, path: `frames/${fileName}`, source: 'page' });
      sequence += 1;
    }
  }

  const perf = await page.evaluate(() => window.__visualCapturePerf || null);
  const elapsedPerfMs = perf ? Math.max(1, perf.lastAt - perf.startedAt) : 1;
  const measuredFrames = perf?.frames || 0;
  const measuredDeltas = Math.max(0, measuredFrames - 1);
  const performanceSummary = {
    measuredFrames,
    rafFpsDuringCapture: measuredDeltas * 1000 / elapsedPerfMs,
    averageFrameMs: measuredDeltas ? perf.totalDelta / measuredDeltas : 0,
    worstFrameMs: perf?.maxDelta || 0,
  };

  const title = await page.title();
  const finalUrl = page.url();
  await context.close();
  context = null;

  let videoPath = null;
  if (videoHandle) {
    const rawPath = await videoHandle.path();
    const finalPath = join(outputDir, 'capture.webm');
    await rename(rawPath, finalPath);
    videoPath = relative(outputDir, finalPath).replaceAll('\\', '/');
    frames = await extractVideoFrames(finalPath, framesDir, {
      startOffsetMs: captureStartedAt - videoSessionStartedAt,
      durationMs: options.durationMs,
      intervalMs: options.intervalMs,
    });
  }

  const manifest = {
    formatVersion: 1,
    name: label,
    requestedUrl: options.url,
    url: finalUrl,
    title,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: options.durationMs,
    intervalMs: options.intervalMs,
    viewport: { width: options.width, height: options.height },
    fullPage: options.fullPage,
    captureMode: options.video ? 'video+extracted-frames' : 'direct-screenshots',
    browser: browserTarget.displayName,
    root: rootDir,
    seed: options.seed,
    video: videoPath,
    frames,
    performance: performanceSummary,
    console: consoleEvents,
    pageErrors,
  };
  await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outputDir, 'index.html'), `${buildReportHtml(manifest)}\n`);

  console.log(`Visual capture complete: ${outputDir}`);
  console.log(`Frames: ${frames.length} | rAF FPS: ${performanceSummary.rafFpsDuringCapture.toFixed(1)} | Errors: ${pageErrors.length}`);
  console.log(`Report: ${join(outputDir, 'index.html')}`);
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await closeServer(server).catch(() => {});
}
