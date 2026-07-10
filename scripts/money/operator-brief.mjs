import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runAutopilotCycle } from '../../src/money/autopilot.js';
import {
  buildMoneyOperatorBrief,
  leadQueueToCsv,
  sendTelegramBrief
} from '../../src/money/operatorBrief.js';

function parseArgs(argv = []) {
  const args = {
    out: '',
    briefOut: '',
    queueOut: '',
    telegramOut: '',
    deliveryOut: '',
    dryRun: '',
    mode: 'auto',
    sendTelegram: ''
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args.dryRun
    ? parseBool(args.dryRun)
    : undefined;

  const autopilot = await runAutopilotCycle({ dryRun });
  const brief = buildMoneyOperatorBrief({
    autopilot,
    mode: args.mode || process.env.MONEY_OPERATOR_BRIEF_MODE || 'auto'
  });

  const outputs = {};
  if (args.out) outputs.autopilot = await writeOutput(args.out, autopilot);
  if (args.briefOut) outputs.brief = await writeOutput(args.briefOut, brief.markdown, { json: false });
  if (args.queueOut) outputs.queue = await writeOutput(args.queueOut, leadQueueToCsv(brief.leadQueue), { json: false });
  if (args.telegramOut) outputs.telegram = await writeOutput(args.telegramOut, `${brief.telegramText}\n`, { json: false });

  let delivery = {
    attempted: false,
    sent: false,
    skipped: true,
    failed: false,
    reason: 'telegram delivery not requested'
  };

  if (parseBool(args.sendTelegram, false)) {
    delivery = await sendTelegramBrief({
      text: brief.telegramText,
      dryRun: parseBool(process.env.MONEY_OPERATOR_TELEGRAM_DRY_RUN, false)
    });
  }

  if (args.deliveryOut) outputs.delivery = await writeOutput(args.deliveryOut, delivery);

  console.log(`Money operator brief: ${brief.title}`);
  console.log(`Autopilot run: ${autopilot.runId}`);
  console.log(`Top opportunity: ${autopilot.topOpportunity?.title || 'none'}`);
  console.log(`One thing: ${brief.oneThing}`);
  console.log(`Telegram: ${delivery.sent ? 'sent' : delivery.reason}`);

  Object.entries(outputs).forEach(([label, filePath]) => {
    console.log(`${label}: ${filePath}`);
  });
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
