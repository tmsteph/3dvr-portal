const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  appendOutreachLog,
  formatOutreachLogEntry,
  parseLimit,
  readOutreachLog,
} = require('../thomas-agent/node/outreach-log');

const askTrack = path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-track');

test('appendOutreachLog normalizes records and readOutreachLog returns them', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-outreach-log-'));
  const logPath = path.join(tmp, 'outreach-log.ndjson');

  try {
    const written = appendOutreachLog({
      kind: 'email',
      status: 'sent',
      source: 'template',
      name: 'Acme Studio',
      site: 'https://example.com',
      contact: 'mailto:owner@example.com',
      route: 'email',
      subject: 'Question for Acme Studio',
      body: 'Hello there',
      transport: 'portal',
      mode: 'opener',
    }, { filePath: logPath });

    const entries = readOutreachLog({ filePath: logPath });

    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'Acme Studio');
    assert.equal(entries[0].subject, 'Question for Acme Studio');
    assert.equal(entries[0].body, 'Hello there');
    assert.equal(written.status, 'sent');
    assert.match(formatOutreachLogEntry(written), /Acme Studio/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ask-track sent shows recent log entries and respects the limit', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-outreach-view-'));
  const logPath = path.join(tmp, 'outreach-log.ndjson');

  try {
    appendOutreachLog({
      kind: 'email',
      status: 'sent',
      source: 'template',
      name: 'First Lead',
      route: 'email',
      body: 'First body',
    }, { filePath: logPath });
    appendOutreachLog({
      kind: 'form',
      status: 'submitted',
      source: 'template',
      name: 'Second Lead',
      route: 'form',
      body: 'Second body',
    }, { filePath: logPath });

    const output = execFileSync(askTrack, ['sent', '1'], {
      env: {
        ...process.env,
        THREEDVR_OUTREACH_LOG_FILE: logPath,
      },
      encoding: 'utf8',
    });

    assert.match(output, /Second Lead/);
    assert.match(output, /Second body/);
    assert.doesNotMatch(output, /First Lead/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('parseLimit falls back when the input is not numeric', () => {
  assert.equal(parseLimit('15', 20), 15);
  assert.equal(parseLimit('nope', 20), 20);
});
