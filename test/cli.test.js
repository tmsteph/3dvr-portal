const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const cli = path.join(__dirname, '..', 'thomas-agent', 'scripts', '3dvr');

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(cli, args, {
      env: {
        ...process.env,
        THREEDVR_OAUTH_FILE: path.join(__dirname, '.tmp-oauth-test.json'),
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

function runCliInteractive(input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, [], {
      env: {
        ...process.env,
        THREEDVR_OAUTH_FILE: path.join(__dirname, '.tmp-oauth-test.json'),
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        const error = new Error(`3dvr exited with ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

test('help exposes install, setup, connect, and email aliases', async () => {
  const { stdout } = await runCli(['--help']);

  assert.match(stdout, /3dvr setup\s+first-run setup checklist/);
  assert.match(stdout, /3dvr install\s+install\/update instructions/);
  assert.match(stdout, /3dvr connect \[gmail\]\s+connect email with portal OAuth/);
  assert.match(stdout, /3dvr outreach next\s+same as 3dvr next/);
  assert.match(stdout, /3dvr outreach sent\s+same as 3dvr contacted/);
  assert.match(stdout, /3dvr email connect\s+same as 3dvr auth login google/);
  assert.match(stdout, /Do not set Gmail app passwords/i);
});

test('install command gives npm and OAuth-first setup path', async () => {
  const { stdout } = await runCli(['install']);

  assert.match(stdout, /npm install -g 3dvr-agent/);
  assert.match(stdout, /npm link/);
  assert.match(stdout, /3dvr setup/);
  assert.match(stdout, /3dvr connect/);
  assert.match(stdout, /Email auth is OAuth-first/);
});

test('guided menu accepts commands and stays open until quit', async () => {
  const { stdout } = await runCliInteractive('help\nq\n');

  assert.match(stdout, /Commands also work here: `next`, `contacted`, `sent-next`, `inbox check`, `status`\./);
  assert.match(stdout, /3dvr CLI v1/);
  assert.ok((stdout.match(/Welcome to 3dvr/g) || []).length >= 2);
});

test('sent-next marks the last shown lead and advances to the next one', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-cli-'));
  const leads = path.join(tmp, 'leads.csv');
  const sessionFile = path.join(tmp, 'session.env');
  const openLog = path.join(tmp, 'open.log');
  await writeFile(
    leads,
    'name,link,contact,status,score,source,updated\nAlpha Studio,https://alpha.example,mailto:alpha@example.com,new,20,test,now\nBeta Studio,https://beta.example,mailto:beta@example.com,new,10,test,now\n',
  );

  try {
    const { stdout } = await runCliInteractive('1\n8\nq\n', {
      THREEDVR_LEADS_FILE: leads,
      THREEDVR_SESSION_FILE: sessionFile,
      THREEDVR_OPEN_URL_LOG: openLog,
    });
    const leadsText = await readFile(leads, 'utf8');

    assert.match(stdout, /Name: Alpha Studio/);
    assert.match(stdout, /Contacted: Alpha Studio/);
    assert.match(stdout, /Name: Beta Studio/);
    assert.match(leadsText, /Alpha Studio,https:\/\/alpha\.example,mailto:alpha@example\.com,contacted/);
    assert.match(leadsText, /Beta Studio,https:\/\/beta\.example,mailto:beta@example\.com,new/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
