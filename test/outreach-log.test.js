const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  appendOutreachLog,
  archiveGroupKey,
  formatArchiveGroupHeading,
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
      experiment: 'exp-1',
      variant: 'a',
      transport: 'portal',
      mode: 'opener',
    }, { filePath: logPath });

    const entries = readOutreachLog({ filePath: logPath });

    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'Acme Studio');
    assert.equal(entries[0].subject, 'Question for Acme Studio');
    assert.equal(entries[0].body, 'Hello there');
    assert.equal(entries[0].experiment, 'exp-1');
    assert.equal(entries[0].variant, 'a');
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

test('ask-track sent grouped archives entries by route and source', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-outreach-grouped-'));
  const logPath = path.join(tmp, 'outreach-log.ndjson');

  try {
    appendOutreachLog({
      kind: 'email',
      status: 'sent',
      source: 'template',
      name: 'Template Lead',
      route: 'email',
      body: 'Template body',
    }, { filePath: logPath });
    appendOutreachLog({
      kind: 'email',
      status: 'sent',
      source: 'local',
      name: 'Local Lead',
      route: 'email',
      body: 'Local body',
    }, { filePath: logPath });
    appendOutreachLog({
      kind: 'form',
      status: 'submitted',
      source: 'template',
      name: 'Form Lead',
      route: 'form',
      body: 'Form body',
    }, { filePath: logPath });

    const output = execFileSync(askTrack, ['sent', 'grouped'], {
      env: {
        ...process.env,
        THREEDVR_OUTREACH_LOG_FILE: logPath,
      },
      encoding: 'utf8',
    });

    assert.match(output, /email \| email \| template \(1\)/);
    assert.match(output, /email \| email \| local \(1\)/);
    assert.match(output, /form \| form \| template \(1\)/);
    assert.match(output, /Template body/);
    assert.match(output, /Local body/);
    assert.match(output, /Form body/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ask-track failures shows non-success log entries', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-outreach-failures-'));
  const logPath = path.join(tmp, 'outreach-log.ndjson');

  try {
    appendOutreachLog({
      kind: 'email',
      status: 'probe_failed',
      source: 'template',
      name: 'Probe Lead',
      route: 'email',
      note: 'deliverability probe failed',
      body: 'Probe body',
    }, { filePath: logPath });
    appendOutreachLog({
      kind: 'form',
      status: 'send_failed',
      source: 'local',
      name: 'Form Lead',
      route: 'form',
      note: 'send command failed',
      body: 'Form body',
    }, { filePath: logPath });

    const output = execFileSync(askTrack, ['failures', '1'], {
      env: {
        ...process.env,
        THREEDVR_OUTREACH_LOG_FILE: logPath,
      },
      encoding: 'utf8',
    });

    assert.match(output, /Form Lead/);
    assert.match(output, /send_failed/);
    assert.doesNotMatch(output, /Probe Lead/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ask-track failed updates the lead status with a stable temp file', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-outreach-failed-'));
  const leadsPath = path.join(tmp, 'leads.csv');
  writeFileSync(
    leadsPath,
    'name,link,contact,status,date,variant\nBad Lead,https://bad.example,mailto:bad@example.com,new,2026-05-06,opener\n',
  );

  try {
    const output = execFileSync(askTrack, ['failed', 'Bad Lead'], {
      env: {
        ...process.env,
        THREEDVR_LEADS_FILE: leadsPath,
      },
      encoding: 'utf8',
    });
    const leadsText = readFileSync(leadsPath, 'utf8');

    assert.match(output, /Failed: Bad Lead/);
    assert.match(leadsText, /Bad Lead,https:\/\/bad\.example,mailto:bad@example\.com,failed,2026-05-06,opener/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ask-track variant updates the lead variant without changing status', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), '3dvr-outreach-variant-'));
  const leadsPath = path.join(tmp, 'leads.csv');
  writeFileSync(
    leadsPath,
    'name,link,contact,status,date,variant\nVariant Lead,https://variant.example,mailto:v@example.com,new,2026-05-06,\n',
  );

  try {
    const output = execFileSync(askTrack, ['variant', 'Variant Lead', 'b'], {
      env: {
        ...process.env,
        THREEDVR_LEADS_FILE: leadsPath,
      },
      encoding: 'utf8',
    });
    const leadsText = readFileSync(leadsPath, 'utf8');

    assert.match(output, /Variant: Variant Lead \(b\)/);
    assert.match(leadsText, /Variant Lead,https:\/\/variant\.example,mailto:v@example\.com,new,2026-05-06,b/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('parseLimit falls back when the input is not numeric', () => {
  assert.equal(parseLimit('15', 20), 15);
  assert.equal(parseLimit('nope', 20), 20);
});

test('archive helpers include kind, route, and source in the group key', () => {
  assert.equal(
    archiveGroupKey({ kind: 'email', route: 'email', source: 'template' }),
    'email::email::template',
  );
  assert.equal(
    formatArchiveGroupHeading({ kind: 'form', route: 'form', source: 'local' }, 2),
    'form | form | local (2)',
  );
});
