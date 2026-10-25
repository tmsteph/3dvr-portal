import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCampaignTask, queueCampaignResearch } from '../growth-operator/campaigns.js';

const operatorDir = new URL('../growth-operator/', import.meta.url);

test('growth operator exposes simple campaign presets for common money paths', async () => {
  const html = await readFile(new URL('index.html', operatorDir), 'utf8');
  const js = await readFile(new URL('campaigns.js', operatorDir), 'utf8');

  assert.match(html, /What do you want to get paid for\?/);
  assert.match(html, /data-campaign="av-freelance"/);
  assert.match(html, /data-campaign="web-design"/);
  assert.match(html, /data-campaign="lead-generation"/);
  assert.match(html, /data-campaign="market-research"/);
  assert.match(html, /data-campaign="my-skill"/);
  assert.match(html, /id="campaignFindButton"/);
  assert.match(html, /type="module" src="campaigns\.js"/);

  assert.match(js, /CAMPAIGN_PRESETS = Object\.freeze/);
  assert.match(js, /'av-freelance'/);
  assert.match(js, /'web-design'/);
  assert.match(js, /'lead-generation'/);
  assert.match(js, /'market-research'/);
  assert.match(js, /'my-skill'/);
});

test('campaign research reuses the existing CRM and outbound pipeline with conservative outreach rules', async () => {
  const js = await readFile(new URL('campaigns.js', operatorDir), 'utf8');

  assert.match(js, /maximum 10 prospects/);
  assert.match(js, /Research public information only/);
  assert.match(js, /Never guess or synthesize private contact addresses/);
  assert.match(js, /Do not send messages or blast generic lists from this research task/);
  assert.match(js, /existing campaign caps/);
  assert.match(js, /unified 3dvr-crm records/);
  assert.match(js, /existing Growth Operator \/ outreach pipeline/);
  assert.match(js, /queueOperatorTask/);
  assert.match(js, /watchOperatorTask/);
  assert.match(js, /queueTask\(\{ text: task\.task, title:/);
  assert.doesNotMatch(js, /queueRoot\?\.get\('tasks'\)/);
  assert.doesNotMatch(js, /putGun\(/);
  const task = buildCampaignTask('web-design');
  assert.equal(task.backend, 'codex');
  assert.equal(task.requiredCapabilities, 'codex');
  assert.equal(task.riskClass, 'draft');
  assert.match(task.task, /do not write CRM records/);
  assert.match(task.task, /do not send messages/);
});

test('my skill campaign carries Launch Room context into the money path', async () => {
  const js = await readFile(new URL('campaigns.js', operatorDir), 'utf8');
  const modes = await readFile(new URL('../launch-room/modes.js', import.meta.url), 'utf8');

  assert.match(js, /3dvr\.launch-room\.movement-brief\.v1/);
  assert.match(js, /function loadLaunchRoomBrief/);
  assert.match(js, /First audience:/);
  assert.match(js, /Tiny first project:/);
  assert.match(js, /setCampaignSeed/);
  assert.match(js, /campaignSeed = 'false'/);
  assert.match(modes, /Make this earn money/);
  assert.match(modes, /growth-operator\/\?campaign=my-skill/);
});

test('Growth campaign research requires a trackable signed Operator receipt and waits for worker evidence', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const status = { textContent: '' };
  globalThis.window = { localStorage: { getItem: () => '' } };
  globalThis.document = { getElementById: () => status };
  try {
    let submission, watched;
    const receipt = await queueCampaignResearch('web-design', {
      queueTask: async action => {
        submission = action;
        return { taskId: 'operator-http:task-safe123456', confirmed: true };
      },
      watchTask: (id, options) => { watched = { id, options }; },
    });
    assert.equal(receipt.confirmed, true);
    assert.match(submission.title, /Web design prospect research/);
    assert.match(submission.text, /Research public information only/);
    assert.equal(watched.id, receipt.taskId);
    assert.match(status.textContent, /Waiting for a verified result/);
    watched.options.onUpdate({ status: 'running' });
    assert.match(status.textContent, /running in Operator/);
    watched.options.onUpdate({ status: 'completed' });
    assert.match(status.textContent, /Review the result in Operator/);
    assert.doesNotMatch(status.textContent, /CRM records saved|messages sent successfully/);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('ambiguous Operator acknowledgement never claims research queued or retries', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const status = { textContent: '' };
  globalThis.window = { localStorage: { getItem: () => '' } };
  globalThis.document = { getElementById: () => status };
  try {
    let submissions = 0, watches = 0;
    const receipt = await queueCampaignResearch('market-research', {
      queueTask: async () => {
        submissions += 1;
        return { taskId: 'operator-http:task-unknown123456', confirmed: false, message: 'Checking delivery. Do not retry.' };
      },
      watchTask: () => { watches += 1; },
    });
    assert.equal(receipt.confirmed, false);
    assert.equal(submissions, 1);
    assert.equal(watches, 1);
    assert.match(status.textContent, /Checking delivery/);
    assert.doesNotMatch(status.textContent, /research queued|research accepted/);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
