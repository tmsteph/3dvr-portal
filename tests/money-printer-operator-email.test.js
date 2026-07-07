import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildOperatorReportEmailHtml,
  resolveOperatorEmailConfig,
  sendOperatorReportEmail
} from '../src/money-printer/operatorEmailReport.js';

async function withTempRoot(fn) {
  const root = await mkdtemp(path.join(tmpdir(), '3dvr-operator-email-'));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeReport(root) {
  const reportPath = path.join(root, '.money-printer', 'operator', 'thomas-email-latest.md');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, '# Money Printer Operator Report\n\nNo secrets here.\n', 'utf8');
  return reportPath;
}

test('operator report email skips cleanly when config is missing', async () => {
  await withTempRoot(async root => {
    const reportPath = await writeReport(root);
    const result = await sendOperatorReportEmail({
      rootDir: root,
      reportPath,
      env: {
        HOME: root
      }
    });

    assert.equal(result.sent, false);
    assert.equal(result.skipped, true);
    assert.match(result.reason, /email config missing/);
    assert.match(result.reason, /OPERATOR_EMAIL_TO/);
    const log = await readFile(result.logPath, 'utf8');
    assert.match(log, /"status":"skipped"/);
  });
});

test('operator report email supports dry-run without sending', async () => {
  await withTempRoot(async root => {
    const reportPath = await writeReport(root);
    let sendCalled = false;
    const result = await sendOperatorReportEmail({
      rootDir: root,
      reportPath,
      dryRun: true,
      env: {
        HOME: root,
        OPERATOR_EMAIL_TO: 'thomas@example.com',
        OPERATOR_EMAIL_FROM: 'operator@example.com',
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'operator@example.com',
        SMTP_PASS: 'secret-value'
      },
      transport: {
        async sendMail() {
          sendCalled = true;
        }
      }
    });

    assert.equal(sendCalled, false);
    assert.equal(result.sent, false);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'dry-run');
    assert.equal(result.config.to, 'thomas@example.com');
    assert.equal(result.config.from, 'operator@example.com');
    assert.equal(result.config.transport, 'smtp');
    assert.deepEqual(result.config.missing, []);
  });
});

test('operator report email sends report body through provided transport', async () => {
  await withTempRoot(async root => {
    const reportPath = await writeReport(root);
    const sent = [];
    const result = await sendOperatorReportEmail({
      rootDir: root,
      reportPath,
      env: {
        HOME: root,
        OPERATOR_EMAIL_TO: 'thomas@example.com',
        GMAIL_USER: '3dvr.tech@gmail.com',
        GMAIL_APP_PASSWORD: 'gmail-secret-value'
      },
      nodemailerImporter: async () => ({
        createTransport() {
          return {
            async sendMail(message) {
              sent.push(message);
            }
          };
        }
      })
    });

    assert.equal(result.sent, true);
    assert.equal(result.reason, 'sent');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'thomas@example.com');
    assert.match(sent[0].from, /3DVR Money Printer/);
    assert.match(sent[0].text, /Money Printer Operator Report/);
    assert.match(sent[0].html, /Open Money Printer/);
    assert.match(sent[0].html, /Reply with decision/);
  });
});

test('operator email config and logs never expose secret values', async () => {
  const config = resolveOperatorEmailConfig({
    OPERATOR_EMAIL_TO: 'thomas@example.com',
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'operator@example.com',
    SMTP_PASS: 'do-not-print-this-secret'
  });

  assert.equal(JSON.stringify(config.missing).includes('do-not-print-this-secret'), false);

  await withTempRoot(async root => {
    const reportPath = await writeReport(root);
    const result = await sendOperatorReportEmail({
      rootDir: root,
      reportPath,
      dryRun: true,
      env: {
        HOME: root,
        OPERATOR_EMAIL_TO: 'thomas@example.com',
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'operator@example.com',
        SMTP_PASS: 'do-not-print-this-secret'
      }
    });
    const log = await readFile(result.logPath, 'utf8');
    assert.equal(log.includes('do-not-print-this-secret'), false);
  });
});

test('operator report email html highlights actions when review is needed', () => {
  const html = buildOperatorReportEmailHtml({
    to: 'thomas@example.com',
    text: '# plain report',
    report: {
      command: 'propose',
      branch: 'codex/example',
      selfReview: {
        risk: 'YELLOW',
        autoMergeAllowed: false
      },
      pr: {
        url: 'https://github.com/tmsteph/3dvr-portal/pull/999'
      },
      merge: {
        merged: false
      },
      verification: {
        commands: [{ command: 'node --test tests/example.test.js', ok: true }]
      }
    }
  });

  assert.match(html, /Please review this/);
  assert.match(html, /One thing to do/);
  assert.match(html, /Review PR/);
  assert.match(html, /https:\/\/github\.com\/tmsteph\/3dvr-portal\/pull\/999/);
  assert.match(html, /mailto:thomas%40example\.com/);
});

test('operator report email html says no action is needed for merged green runs', () => {
  const html = buildOperatorReportEmailHtml({
    to: 'thomas@example.com',
    text: '# plain report',
    report: {
      command: 'propose',
      selfReview: {
        risk: 'GREEN',
        autoMergeAllowed: true
      },
      pr: {
        url: 'https://github.com/tmsteph/3dvr-portal/pull/1000'
      },
      merge: {
        merged: true
      }
    }
  });

  assert.match(html, /Handled\. No action needed\./);
  assert.match(html, /Nothing\. You can ignore this email/);
  assert.match(html, /Open PR/);
});
