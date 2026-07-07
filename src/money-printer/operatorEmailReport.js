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

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function button(label, href, color = '#0f766e') {
  if (!href) return '';
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:8px 8px 0 0;padding:12px 16px;border-radius:8px;background:${color};color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(label)}</a>`;
}

function mailtoUrl({ to, subject, body }) {
  if (!to) return '';
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
}

function summarizeReport(report = {}) {
  const risk = clean(report.selfReview?.risk || 'unknown');
  const merged = Boolean(report.merge?.merged);
  const prUrl = clean(report.pr?.url);
  const failed = Boolean(report.emailReport?.failed);
  const blocked = risk === 'RED' || (report.pr?.blocked) || failed;
  const needsReview = risk === 'YELLOW' || (prUrl && !merged);
  const actionRequired = blocked || needsReview;
  return {
    risk,
    merged,
    prUrl,
    actionRequired,
    headline: actionRequired ? 'Action needed' : 'No action needed',
    status: blocked ? 'Blocked' : needsReview ? 'Review needed' : 'Handled',
    summary: blocked
      ? 'Money Printer stopped or hit a failure that needs Thomas.'
      : needsReview
        ? 'Money Printer prepared something that needs human review before it moves.'
        : 'Money Printer completed the safe loop and handled the GREEN change.',
    color: blocked ? '#b91c1c' : needsReview ? '#b45309' : '#0f766e'
  };
}

export function buildOperatorReportEmailHtml({ report = {}, text = '', to = '' } = {}) {
  const summary = summarizeReport(report);
  const repoUrl = 'https://github.com/tmsteph/3dvr-portal';
  const actionsUrl = `${repoUrl}/actions`;
  const portalUrl = 'https://portal.3dvr.tech/money-printer/';
  const replyUrl = mailtoUrl({
    to,
    subject: `Money Printer report: ${summary.status}`,
    body: [
      `I reviewed the Money Printer report.`,
      `Risk: ${summary.risk}`,
      summary.prUrl ? `PR: ${summary.prUrl}` : '',
      '',
      'Decision / note:'
    ].filter(Boolean).join('\n')
  });

  const primaryButtons = [
    button(summary.prUrl && !summary.merged ? 'Review PR' : summary.prUrl ? 'Open PR' : '', summary.prUrl, summary.color),
    button('Open Money Printer', portalUrl, '#1d4ed8'),
    button('View GitHub Actions', actionsUrl, '#334155'),
    button('Reply with decision', replyUrl, '#6d28d9')
  ].join('');

  const verification = Array.isArray(report.verification?.commands)
    ? report.verification.commands.map(item => `<li>${escapeHtml(item.command)}: <strong>${item.ok ? 'pass' : 'fail'}</strong></li>`).join('')
    : '<li>No verification commands recorded.</li>';

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:24px;">
      <div style="border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;padding:20px;">
        <p style="margin:0 0 8px;color:#475569;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">3DVR Money Printer</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;">${escapeHtml(summary.headline)}</h1>
        <div style="display:inline-block;margin:0 0 16px;padding:6px 10px;border-radius:999px;background:${summary.color};color:#ffffff;font-weight:700;">${escapeHtml(summary.status)} · ${escapeHtml(summary.risk)}</div>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${escapeHtml(summary.summary)}</p>
        <div>${primaryButtons}</div>
      </div>

      <div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;padding:20px;">
        <h2 style="margin:0 0 12px;font-size:18px;">Run Summary</h2>
        <ul style="margin:0;padding-left:20px;line-height:1.7;">
          <li>Command: <strong>${escapeHtml(report.command || 'unknown')}</strong></li>
          <li>Auto-merge allowed: <strong>${report.selfReview?.autoMergeAllowed ? 'yes' : 'no'}</strong></li>
          <li>Merged: <strong>${summary.merged ? 'yes' : 'no'}</strong></li>
          <li>Branch: <strong>${escapeHtml(report.branch || '')}</strong></li>
        </ul>
      </div>

      <div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;padding:20px;">
        <h2 style="margin:0 0 12px;font-size:18px;">Checks</h2>
        <ul style="margin:0;padding-left:20px;line-height:1.7;">${verification}</ul>
      </div>

      <details style="margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;padding:16px;">
        <summary style="cursor:pointer;font-weight:700;">Plain report</summary>
        <pre style="white-space:pre-wrap;font-size:13px;line-height:1.5;color:#334155;">${escapeHtml(text)}</pre>
      </details>
    </div>
  </body>
</html>`;
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
      text: body,
      html: buildOperatorReportEmailHtml({
        report: options.report || {},
        text: body,
        to: config.to
      })
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
