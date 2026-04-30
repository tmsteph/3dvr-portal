const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const askMessage = path.join(root, 'thomas-agent', 'scripts', 'ask-message');
const askSend = path.join(root, 'thomas-agent', 'scripts', 'ask-send');

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
    assert.match(stdout, /Hi Acme Studio team/);
    assert.match(stdout, /I'm Thomas with 3DVR/);
    assert.match(stdout, /Are you running into any .* problems right now/);
    assert.doesNotMatch(stdout, /Quick idea for/);
    assert.doesNotMatch(stdout, /noticed|looking at|specific note/i);
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
    assert.match(opened, /^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=owner%40example\.com&su=Question%20for%20Acme%20Studio&body=/);
    assert.match(copied, /To: owner@example\.com/);
    assert.match(copied, /Subject: Question for Acme Studio/);
    assert.match(copied, /I'm Thomas with 3DVR/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
