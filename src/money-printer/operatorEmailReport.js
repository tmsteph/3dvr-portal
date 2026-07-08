import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadMoneyPrinterEnv } from './moneyPrinterEnv.js';
import { buildOperatorReportEmailHtml } from './operatorReportEmailTemplate.js';

export { buildOperatorReportEmailHtml } from './operatorReportEmailTemplate.js';

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

function resolvePortalEmailEndpoint(env = {}) {
  return clean(
    env.OPERATOR_REPORT_EMAIL_ENDPOINT
    || env.MONEY_PRINTER_OPERATOR_EMAIL_ENDPOINT
    || env.PORTAL_OPERATOR_REPORT_EMAIL_ENDPOINT
  );
}

function resolvePortalEmailToken(env = {}) {
  return clean(
    env.OPERATOR_REPORT_EMAIL_TOKEN
    || env.AGENT_OPERATOR_EMAIL_TOKEN
    || env.THREEDVR_AUTOPILOT_EMAIL_TOKEN
  );
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

async function sendViaPortalEndpoint({
  endpoint,
  token,
  report,
  text,
  subject,
  to,
  fetchImpl = fetch
}) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Operator-Token': token } : {})
    },
    body: JSON.stringify({
      mode: 'operator-alert',
      to: [to].filter(Boolean),
      subject,
      summary: buildOperatorReportSummary(report),
      text,
      actionItems: buildOperatorReportActionItems(report),
      commands: [
        'systemctl status money-printer-operator.timer',
        'journalctl -u money-printer-operator.service -n 100 -f',
        'tail -f /var/log/3dvr/money-printer-operator.log'
      ],
      metadata: {
        command: report.command || '',
        risk: report.selfReview?.risk || '',
        merged: report.merge?.merged ? 'yes' : 'no',
        pr: report.pr?.url || ''
      }
    })
  });

  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || responseText || `portal endpoint returned ${response.status}`);
  }

  return payload || { ok: true };
}

function buildOperatorReportSummary(report = {}) {
  const risk = clean(report.selfReview?.risk || 'unknown');
  const pr = clean(report.pr?.url);
  const merged = report.merge?.merged ? 'merged' : 'not merged';
  const intent = clean(report.impact?.intent || report.selfReview?.intent);
  const whatChanged = clean(report.impact?.whatChanged || report.selfReview?.whatChanged);
  const whyItMatters = clean(report.impact?.whyItMatters || report.selfReview?.whyItMatters);
  const detail = [
    intent ? `Intent: ${intent}` : '',
    whatChanged ? `Changed: ${whatChanged}` : '',
    whyItMatters ? `Why: ${whyItMatters}` : ''
  ].filter(Boolean).join(' ');
  if (pr) {
    return `Money Printer finished a ${risk} run and ${merged}. ${detail} PR: ${pr}`.replace(/\s+/g, ' ').trim();
  }
  return `Money Printer finished a ${risk} run with no PR URL recorded. ${detail}`.replace(/\s+/g, ' ').trim();
}

function buildOperatorReportActionItems(report = {}) {
  const risk = clean(report.selfReview?.risk || 'unknown');
  if (risk === 'GREEN' && report.merge?.merged) {
    return ['No action needed. The safe GREEN change was handled.'];
  }
  if (risk === 'YELLOW') {
    return ['Review the PR before merging.', report.pr?.url ? `Open PR: ${report.pr.url}` : 'Check the latest operator report.'];
  }
  if (risk === 'RED') {
    return ['Do not merge automatically.', 'Review the blocked change and decide whether to skip, rewrite, or rerun.'];
  }
  return ['Check the latest operator report.'];
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
  const portalEndpoint = resolvePortalEmailEndpoint(env);
  const portalToken = resolvePortalEmailToken(env);
  if (portalEndpoint) {
    result.config = {
      ...result.config,
      transport: 'portal-endpoint'
    };
  }

  if (!config.ok && !portalEndpoint) {
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
    result.reason = portalEndpoint ? 'dry-run portal endpoint' : 'dry-run';
    result.logPath = await appendEmailLog(rootDir, {
      status: 'dry-run',
      reason: result.reason,
      reportPath,
      config: {
        ...result.config,
        transport: portalEndpoint ? 'portal-endpoint' : result.config.transport
      }
    });
    return result;
  }

  result.attempted = true;
  try {
    if (portalEndpoint) {
      await sendViaPortalEndpoint({
        endpoint: portalEndpoint,
        token: portalToken,
        report: options.report || {},
        text: body,
        subject: options.subject || '[3DVR Money Printer] Operator report',
        to: config.to || clean(env.OPERATOR_EMAIL_TO),
        fetchImpl: options.fetchImpl
      });
      result.sent = true;
      result.reason = 'sent via portal endpoint';
      result.logPath = await appendEmailLog(rootDir, {
        status: 'sent',
        reason: result.reason,
        reportPath,
        config: result.config
      });
      return result;
    }

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
