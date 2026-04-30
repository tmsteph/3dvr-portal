const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
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

test('default outreach message is permission-based and not price-forward', async () => {
  const { stdout } = await run(askMessage, ['a']);

  assert.match(stdout, /If it would be useful, I can send over the specific note/);
  assert.match(stdout, /If not, no problem/);
  assert.doesNotMatch(stdout, /\$20|\$50|month|Launch in 3 Days/i);
  assert.doesNotMatch(stdout, /Hey[,\u2014-]/);
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

    assert.match(stdout, /Small site note for Acme Studio/);
    assert.match(stdout, /Hi Acme Studio team/);
    assert.match(stdout, /If it would be useful, I can send over the specific note/);
    assert.doesNotMatch(stdout, /Quick idea for/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
