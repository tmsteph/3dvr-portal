const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const askMessage = path.join(root, 'thomas-agent', 'scripts', 'ask-message');
const askSend = path.join(root, 'thomas-agent', 'scripts', 'ask-send');
const {
  buildLocalOutreachDraft,
  buildLlmOutreachDraft,
  buildOutreachDraft,
} = require('../thomas-agent/node/outreach-draft');

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      env: {
        ...process.env,
        ...env,
      },
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

test('default outreach message is problem-led and not price-forward', async () => {
  const { stdout } = await run(askMessage, ['a']);

  assert.match(stdout, /I'm Thomas with 3DVR/);
  assert.match(stdout, /Are you running into any .* problems right now/);
  assert.match(stdout, /I just wanted to introduce myself/);
  assert.doesNotMatch(stdout, /\$20|\$50|month|Launch in 3 Days/i);
  assert.doesNotMatch(stdout, /Hey[,\u2014-]/);
  assert.doesNotMatch(stdout, /noticed|looking at|looked at|specific note|small .*detail/i);
});

test('ask-send uses a softer subject and first-touch body', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-leads-'));
  const leads = path.join(tmp, 'leads.csv');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nAcme Studio,https://example.com,mailto:owner@example.com,new,10,test,now\n',
  );

  try {
    const { stdout } = await run(askSend, ['--dry-run'], {
      THREEDVR_LEADS_FILE: leads,
    });

    assert.match(stdout, /Question for Acme Studio/);
    assert.match(stdout, /Route: email/);
    assert.match(stdout, /Hi Acme Studio team/);
    assert.match(stdout, /I'm Thomas with 3DVR/);
    assert.match(stdout, /Are you running into any .* problems right now/);
    assert.doesNotMatch(stdout, /Quick idea for/);
    assert.doesNotMatch(stdout, /noticed|looking at|specific note/i);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('ask-send --template forces the deterministic template copy', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-leads-'));
  const leads = path.join(tmp, 'leads.csv');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nAcme Studio,https://example.com,mailto:owner@example.com,new,10,test,now\n',
  );

  try {
    const { stdout } = await run(askSend, ['--template', '--dry-run'], {
      THREEDVR_LEADS_FILE: leads,
      THREEDVR_OUTREACH_MESSAGE_MODE: 'local',
    });

    assert.match(stdout, /I'm Thomas with 3DVR/);
    assert.match(stdout, /Are you running into any .* problems right now/);
    assert.match(stdout, /Route: email/);
    assert.doesNotMatch(stdout, /local model/i);
    assert.doesNotMatch(stdout, /Hey Thomas/i);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('ask-send can open a Gmail draft and copy the full email', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-leads-'));
  const leads = path.join(tmp, 'leads.csv');
  const openLog = path.join(tmp, 'open.log');
  const clipboardLog = path.join(tmp, 'clipboard.txt');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nAcme Studio,https://example.com,mailto:owner@example.com,new,10,test,now\n',
  );

  try {
    const { stdout } = await run(askSend, ['--gmail-draft'], {
      THREEDVR_LEADS_FILE: leads,
      THREEDVR_OPEN_URL_LOG: openLog,
      THREEDVR_CLIPBOARD_LOG: clipboardLog,
    });
    const opened = await readFile(openLog, 'utf8');
    const copied = await readFile(clipboardLog, 'utf8');

    assert.match(stdout, /Draft mode: gmail/);
    assert.match(stdout, /Copied full email draft to clipboard/);
    assert.match(stdout, /Route: email/);
    assert.match(opened, /^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=owner%40example\.com&su=Question%20for%20Acme%20Studio&body=/);
    assert.match(copied, /To: owner@example\.com/);
    assert.match(copied, /Subject: Question for Acme Studio/);
    assert.match(copied, /I'm Thomas with 3DVR/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('uses mocked LLM outreach replies when OpenAI is configured', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.THREEDVR_OUTREACH_LLM_MODEL;
  process.env.OPENAI_API_KEY = 'test_key';
  process.env.THREEDVR_OUTREACH_LLM_MODEL = 'gpt-5';
  const calls = [];

  const draft = await buildLlmOutreachDraft({
    name: 'Acme Studio',
    site: 'https://example.com',
    contact: 'mailto:owner@example.com',
  }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  text: 'Hi Acme Studio team,\n\nI\'m Thomas with 3DVR. We help small businesses clean up websites and follow-up systems so the next step is clearer.\n\nIs there anything in your website or customer flow that feels harder than it should right now?\n\nIf not, no problem.\n\nThomas\n3DVR',
                }),
              },
            }],
          };
        },
      };
    },
  });

  process.env.OPENAI_API_KEY = previousKey || '';
  process.env.THREEDVR_OUTREACH_LLM_MODEL = previousModel || '';

  assert.equal(draft.source, 'openai');
  assert.match(draft.text, /Hi Acme Studio team/);
  assert.match(draft.text, /Thomas\n3DVR/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /chat\/completions/);
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.model, 'gpt-5');
  assert.equal(request.response_format.type, 'json_object');
});

test('uses mocked local model outreach replies', async () => {
  const previousMode = process.env.THREEDVR_OUTREACH_MESSAGE_MODE;
  process.env.THREEDVR_OUTREACH_MESSAGE_MODE = 'local';
  const calls = [];

  const draft = await buildLocalOutreachDraft({
    name: 'Acme Studio',
    site: 'https://example.com',
    contact: 'mailto:owner@example.com',
  }, {
    commandExistsImpl: () => true,
    fileExistsImpl: () => true,
    runCommandImpl: async (command, args, options) => {
      calls.push({ command, args, options });
      return JSON.stringify({
        text: 'Hi Acme Studio team,\n\nI\'m Thomas with 3DVR. We help small businesses clean up websites and follow-up systems so the next step is easier.\n\nIs there anything about your site or customer flow that feels harder than it should right now?\n\nThomas\n3DVR',
      });
    },
  });

  process.env.THREEDVR_OUTREACH_MESSAGE_MODE = previousMode || '';

  assert.equal(draft.source, 'local');
  assert.match(draft.text, /Hi Acme Studio team/);
  assert.match(draft.text, /Thomas\n3DVR/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes('--single-turn'));
  assert.ok(calls[0].args.includes('--simple-io'));
  assert.equal(calls[0].args[calls[0].args.indexOf('--temp') + 1], '0.35');
});

test('auto outreach mode falls back to template when OpenAI is unavailable', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousMode = process.env.THREEDVR_OUTREACH_MESSAGE_MODE;
  delete process.env.OPENAI_API_KEY;
  process.env.THREEDVR_OUTREACH_MESSAGE_MODE = 'auto';

  const draft = await buildOutreachDraft({
    name: 'Acme Studio',
    site: 'https://example.com',
    contact: 'mailto:owner@example.com',
  });

  process.env.OPENAI_API_KEY = previousKey || '';
  process.env.THREEDVR_OUTREACH_MESSAGE_MODE = previousMode || '';

  assert.equal(draft.source, 'template');
  assert.match(draft.text, /Hi Acme Studio team/);
  assert.match(draft.text, /I'm Thomas with 3DVR/);
});

test('ask-send prints form routes and opens the contact page', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-leads-'));
  const leads = path.join(tmp, 'leads.csv');
  const openLog = path.join(tmp, 'open.log');
  const clipboardLog = path.join(tmp, 'clipboard.txt');
  await writeFile(
    leads,
    'name,link,contact,status,date,variant\nAcme Studio,https://example.com,https://example.com/contact,new,2026-05-05,route=form\n',
  );

  try {
    const { stdout } = await run(askSend, ['Acme Studio'], {
      THREEDVR_LEADS_FILE: leads,
      THREEDVR_OPEN_URL_LOG: openLog,
      THREEDVR_CLIPBOARD_LOG: clipboardLog,
    });
    const opened = await readFile(openLog, 'utf8');
    const copied = await readFile(clipboardLog, 'utf8');

    assert.match(stdout, /Route: form/);
    assert.match(stdout, /Copied message to clipboard/);
    assert.match(stdout, /Opening contact page:/);
    assert.match(opened, /^https:\/\/example\.com\/contact\s*$/);
    assert.match(copied, /I'm Thomas with 3DVR/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
