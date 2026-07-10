import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runAutopilotCycle } from '../../src/money/autopilot.js';
import {
  DEFAULT_OUTBOUND_PROSPECTS,
  buildOutboundQueue,
  buildOutboundSummary,
  dispatchOutboundWebhook,
  outcomeTrackerToCsv,
  parseProspectsCsv,
  queueToCsv
} from '../../src/money/outboundAutopilot.js';
import { sendTelegramBrief } from '../../src/money/operatorBrief.js';

function parseArgs(argv = []) {
  const args = {
    prospects: '',
    mode: process.env.MONEY_OUTBOUND_MODE || 'approval-required',
    dailyCap: process.env.MONEY_OUTBOUND_DAILY_CAP || '3',
    out: '',
    queueOut: '',
    outcomesOut: '',
    summaryOut: '',
    telegramOut: '',
    deliveryOut: '',
    dispatchOut: '',
    sendTelegram: '',
    dryRun: ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const hasValue = argv[index + 1] && !argv[index + 1].startsWith('--');
    args[key] = hasValue ? argv[index + 1] : 'true';
    if (hasValue) index += 1;
  }

  return args;
}

function parseBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

async function writeOutput(pathname, payload, { json = true } = {}) {
  const absolute = resolve(pathname);
  await mkdir(dirname(absolute), { recursive: true });
  const body = json ? `${JSON.stringify(payload, null, 2)}\n` : payload;
  await writeFile(absolute, body, 'utf8');
  return absolute;
}

async function loadProspects(pathname) {
  if (!pathname) return DEFAULT_OUTBOUND_PROSPECTS.slice();
  const content = await readFile(resolve(pathname), 'utf8');
  if (pathname.endsWith('.json')) {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : parsed.prospects || [];
  }
  return parseProspectsCsv(content);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args.dryRun ? parseBool(args.dryRun) : undefined;
  const now = new Date();
  const [autopilot, prospects] = await Promise.all([
    runAutopilotCycle({ dryRun }),
    loadProspects(args.prospects)
  ]);

  const queue = buildOutboundQueue({
    prospects,
    autopilot,
    mode: args.mode,
    dailyCap: args.dailyCap,
    now
  });
  const dispatch = await dispatchOutboundWebhook({
    queue,
    webhookUrl: process.env.MONEY_OUTBOUND_SENDER_WEBHOOK_URL || '',
    token: process.env.MONEY_OUTBOUND_SENDER_WEBHOOK_TOKEN || ''
  });
  const summary = buildOutboundSummary({
    queue,
    mode: args.mode,
    dispatch,
    now
  });

  const outputs = {};
  const payload = {
    generatedAt: now.toISOString(),
    mode: args.mode,
    dailyCap: Number(args.dailyCap) || 3,
    autopilotRunId: autopilot.runId,
    dispatch,
    queue
  };

  if (args.out) outputs.out = await writeOutput(args.out, payload);
  if (args.queueOut) outputs.queue = await writeOutput(args.queueOut, queueToCsv(queue), { json: false });
  if (args.outcomesOut) outputs.outcomes = await writeOutput(args.outcomesOut, outcomeTrackerToCsv(queue), { json: false });
  if (args.summaryOut) outputs.summary = await writeOutput(args.summaryOut, summary, { json: false });
  if (args.telegramOut) outputs.telegram = await writeOutput(args.telegramOut, `${summary}\n`, { json: false });
  if (args.dispatchOut) outputs.dispatch = await writeOutput(args.dispatchOut, dispatch);

  let telegram = {
    attempted: false,
    sent: false,
    skipped: true,
    failed: false,
    reason: 'telegram delivery not requested'
  };

  if (parseBool(args.sendTelegram, false)) {
    telegram = await sendTelegramBrief({
      text: summary,
      dryRun: parseBool(process.env.MONEY_OPERATOR_TELEGRAM_DRY_RUN, false)
    });
  }

  if (args.deliveryOut) outputs.delivery = await writeOutput(args.deliveryOut, telegram);

  console.log('Outbound Autopilot');
  console.log(`Mode: ${args.mode}`);
  console.log(`Prospects scored: ${queue.length}`);
  console.log(`Top prospect: ${queue[0]?.name || queue[0]?.segment || 'none'}`);
  console.log(`Dispatch: ${dispatch.reason}`);
  console.log(`Telegram: ${telegram.sent ? 'sent' : telegram.reason}`);
  Object.entries(outputs).forEach(([label, filePath]) => console.log(`${label}: ${filePath}`));
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
