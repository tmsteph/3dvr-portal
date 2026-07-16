const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  completeDraftRequest,
  enqueueDraftRequest,
  listRequests,
  loadReadyDraft,
} = require('../thomas-agent/node/outreach-draft-queue');

const config = {
  GMAIL_USER: '3dvr.tech@gmail.com',
  THREEDVR_OUTREACH_POSTAL_ADDRESS: '123 Main St, San Diego, CA 92101',
};

test('queues one idempotent lead brief with an opaque personalized preview link', () => {
  const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-draft-queue-'));
  try {
    const lead = { name: 'Acme Studio', link: 'https://acme.example', contact: 'mailto:owner@acme.example' };
    const first = enqueueDraftRequest(lead, { queueDir, campaignId: 'campaign-1' });
    const second = enqueueDraftRequest(lead, { queueDir, campaignId: 'campaign-1' });
    assert.equal(first.id, second.id);
    assert.equal(listRequests('pending', { queueDir }).length, 1);
    assert.match(first.preview.url, /^https:\/\/portal\.3dvr\.tech\/free-page\/preview\/\?r=lead-/);
    assert.doesNotMatch(first.preview.url, /owner%40|owner@/);
  } finally {
    fs.rmSync(queueDir, { recursive: true, force: true });
  }
});

test('accepts and revalidates a compliant Codex draft for the exact recipient', () => {
  const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-draft-queue-'));
  try {
    const lead = { name: 'Acme Studio', link: 'https://acme.example', contact: 'mailto:owner@acme.example' };
    const request = enqueueDraftRequest(lead, { queueDir });
    const text = `Hi Acme Studio team,\n\nI put together a simple direction for a clearer one-page site: ${request.preview.url}\n\nIf it feels useful, I can build the first draft at no cost, with no obligation to keep it.\n\nThomas\n3dvr.tech`;
    completeDraftRequest(request.id, { text, source: 'codex' }, { queueDir, config });
    const draft = loadReadyDraft(lead, { queueDir, config });
    assert.equal(draft.source, 'queue-codex');
    assert.match(draft.text, /Business offer from 3dvr\.tech/);
    assert.match(draft.text, /reply unsubscribe or stop/i);
    assert.equal(draft.previewUrl, request.preview.url);
  } finally {
    fs.rmSync(queueDir, { recursive: true, force: true });
  }
});

test('rejects drafts that omit the preview or try to set another recipient', () => {
  const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-draft-queue-'));
  try {
    const lead = { name: 'Acme Studio', link: 'https://acme.example', contact: 'mailto:owner@acme.example' };
    const request = enqueueDraftRequest(lead, { queueDir });
    assert.throws(() => completeDraftRequest(request.id, {
      text: 'To: other@example.com\nHi Acme Studio team,\n\nThomas\n3dvr.tech',
    }, { queueDir, config }), /missing the exact personalized preview URL|cannot set email recipients/);
  } finally {
    fs.rmSync(queueDir, { recursive: true, force: true });
  }
});

test('ask-send consumes a ready queued draft in dry-run mode without sending', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-draft-send-'));
  const queueDir = path.join(tmp, 'queue');
  const leadsFile = path.join(tmp, 'leads.csv');
  try {
    const lead = { name: 'Acme Studio', link: 'https://acme.example', contact: 'mailto:owner@acme.example' };
    fs.writeFileSync(leadsFile, 'name,link,contact,status,date,variant\nAcme Studio,https://acme.example,mailto:owner@acme.example,new,2026-07-16,a\n');
    const request = enqueueDraftRequest(lead, { queueDir });
    const text = `Hi Acme Studio team,\n\nI made a simple direction for a clearer page: ${request.preview.url}\n\nIf it is useful, I can build the first draft at no cost, with no obligation to keep it.\n\nThomas\n3dvr.tech`;
    completeDraftRequest(request.id, { text, source: 'codex' }, { queueDir, config });

    const output = execFileSync(path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-send'), ['--dry-run', 'Acme Studio'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        THREEDVR_LEADS_FILE: leadsFile,
        THREEDVR_OUTREACH_DRAFT_QUEUE_DIR: queueDir,
        THREEDVR_OUTREACH_MESSAGE_MODE: 'queue',
        THREEDVR_OUTREACH_POSTAL_ADDRESS: config.THREEDVR_OUTREACH_POSTAL_ADDRESS,
      },
    });

    assert.match(output, /OUTREACH READY/);
    assert.match(output, new RegExp(request.preview.recipientId));
    assert.match(output, /Dry run: not opening or copying/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
