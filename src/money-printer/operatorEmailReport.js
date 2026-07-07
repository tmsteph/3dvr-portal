import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadMoneyPrinterEnv } from './moneyPrinterEnv.js';

function clean(value) {
  return String(value || '').trim();
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function redactConfig(config = {}) {
  return {
    to: config.to || '',
    from: config.from || '',
    transport: config.transport || '',
    missing: config.missing || []
  };
}

function resolveFrom(env = {}) {
  const explicit = clean(env.OPERATOR_EMAIL_FROM || env.MONEY_PRINTER_OPERATOR_EMAIL_FROM);
  if (explicit) return explicit;
  const gmailUser = clean(env.GMAIL_USER);
  if (gmailUser) return `"3DVR Money Printer" <${gmailUser}>`;
  const smtpUser = clean(env.SMTP_USER);
  if (smtpUser) return `"3DVR Money Printer" <${smtpUser}>`;
  return clean(env.MAIL_FROM || env.AUTO_BUSINESS_FROM_EMAIL);
}

export function resolveOperatorEmailConfig(env = {}) {
  const to = clean(
    env.OPERATOR_EMAIL_TO
    || env.MONEY_PRINTER_OPERATOR_EMAIL_TO
    || env.MONEY_PRINTER_OWNER_EMAIL
    || env.AUTO_BUSINESS_OWNER_EMAIL
    || env.STRIPE_LOG_EMAIL
    || env.GMAIL_USER
  );
  const from = resolveFrom(env);
  const gmailUser = clean(env.GMAIL_USER);
  const gmailPass = clean(env.GMAIL_APP_PASSWORD);
  const smtpHost = clean(env.SMTP_HOST);
  const smtpUser = clean(env.SMTP_USER);
  const smtpPass = clean(env.SMTP_PASS || env.SMTP_PASSWORD);
  const smtpPort = Number(env.SMTP_PORT || 587);
  const smtpSecure = parseBool(env.SMTP_SECURE, false);
  const missing = [];

  if (!to) missing.push('OPERATOR_EMAIL_TO or MONEY_PRINTER_OWNER_EMAIL');
  if (!from) missing.push('OPERATOR_EMAIL_FROM or GMAIL_USER/SMTP_USER');

  if (gmailUser && gmailPass) {
    return {
      ok: Boolean(to && from),
      to,
      from,
      transport: 'gmail',
      missing,
      nodemailerOptions: {
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass
        }
      }
    };
  }

  if (smtpHost && smtpUser && smtpPass) {
    return {
      ok: Boolean(to && from),
      to,
      from,
      transport: 'smtp',
      missing,
      nodemailerOptions: {
        host: smtpHost,
        port: Number.isFinite(smtpPort) ? smtpPort : 587,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      }
    };
  }

  missing.push('GMAIL_USER + GMAIL_APP_PASSWORD or SMTP_HOST + SMTP_USER + SMTP_PASS');
  return {
    ok: false,
    to,
    from,
    transport: '',
    missing,
    nodemailerOptions: null
  };
}

async function defaultNodemailerImporter() {
  return import('nodemailer');
}

async function appendEmailLog(rootDir, entry = {}) {
  const dir = path.join(rootDir, '.money-printer', 'operator');
  await mkdir(dir, { recursive: true });
  const logPath = path.join(dir, 'email-report-log.jsonl');
  await appendFile(logPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry
  })}\n`, 'utf8');
  return logPath;
}

export async function sendOperatorReportEmail(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportPath = path.resolve(rootDir, options.reportPath || '.money-printer/operator/thomas-email-latest.md');
  const env = options.env || process.env;
  await loadMoneyPrinterEnv(rootDir, env);

  const result = {
    attempted: false,
    sent: false,
    skipped: false,
    failed: false,
    dryRun: parseBool(options.dryRun ?? env.OPERATOR_EMAIL_DRY_RUN, false),
    reportPath,
    logPath: '',
    reason: '',
    config: null
  };

  let body = '';
  try {
    body = await readFile(reportPath, 'utf8');
  } catch (error) {
    result.skipped = true;
    result.reason = `report file unavailable: ${error.code || error.message}`;
    result.logPath = await appendEmailLog(rootDir, {
      status: 'skipped',
      reason: result.reason,
      reportPath
    });
    return result;
  }

  const config = resolveOperatorEmailConfig(env);
  result.config = redactConfig(config);

  if (!config.ok) {
    result.skipped = true;
    result.reason = `email config missing: ${config.missing.join(', ')}`;
    result.logPath = await appendEmailLog(rootDir, {
      status: 'skipped',
      reason: result.reason,
      reportPath,
      config: result.config
    });
    return result;
  }

  if (result.dryRun) {
    result.skipped = true;
    result.reason = 'dry-run';
    result.logPath = await appendEmailLog(rootDir, {
      status: 'dry-run',
      reason: result.reason,
      reportPath,
      config: result.config
    });
    return result;
  }

  result.attempted = true;
  try {
    const imported = await (options.nodemailerImporter || defaultNodemailerImporter)();
    const nodemailer = imported.default || imported;
    const transport = options.transport || nodemailer.createTransport(config.nodemailerOptions);
    await transport.sendMail({
      from: config.from,
      to: config.to,
      subject: options.subject || '[3DVR Money Printer] Operator report',
      text: body
    });
    result.sent = true;
    result.reason = 'sent';
    result.logPath = await appendEmailLog(rootDir, {
      status: 'sent',
      reason: result.reason,
      reportPath,
      config: result.config
    });
    return result;
  } catch (error) {
    result.failed = true;
    result.reason = `send failed: ${error.message}`;
    result.logPath = await appendEmailLog(rootDir, {
      status: 'failed',
      reason: result.reason,
      reportPath,
      config: result.config
    });
    return result;
  }
}
