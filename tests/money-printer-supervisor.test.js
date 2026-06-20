import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addMoneyPrinterOperations } from '../src/money-printer/moneyPrinterOperations.js';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const supervisorPath = fileURLToPath(new URL('../scripts/money-printer-supervisor.mjs', import.meta.url));

async function createTempWorkspace() {
  return mkdtemp(path.join(tmpdir(), 'money-printer-supervisor-'));
}

function runSupervisor(cwd, args = [], env = {}) {
  return spawnSync(process.execPath, [supervisorPath, ...args], {
    cwd,
    env: {
      ...process.env,
      OPENAI_API_KEY: '',
      MONEY_PRINTER_AI_MODE: '',
      ...env
    },
    encoding: 'utf8'
  });
}

describe('money-printer supervisor', () => {
  it('writes a health report without revealing secrets or running a daemon cycle', async () => {
    const cwd = await createTempWorkspace();
    try {
      const result = runSupervisor(cwd, ['--health-only', '--json'], {
        GITHUB_TOKEN: 'github-secret',
        GITHUB_OWNER: 'tmsteph',
        GITHUB_REPO: '3dvr-portal',
        VERCEL_TOKEN: 'vercel-secret',
        VERCEL_PROJECT_ID: 'prj_test'
      });

      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout, /github-secret|vercel-secret/);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.healthOnly, true);
      assert.equal(payload.runtime.githubConfigured, true);
      assert.equal(payload.runtime.vercelConfigured, true);
      assert.equal(payload.guardrails.sendsEmail, false);
      assert.equal(payload.guardrails.movesMoney, false);
      assert.equal(existsSync(path.join(cwd, '.money-printer', 'reports', 'supervisor-latest.json')), true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('dedupes repeated connector operations across scheduled cycles', async () => {
    const cwd = await createTempWorkspace();
    try {
      const operation = {
        provider: 'github',
        action: 'createIssue',
        title: 'Repeatable scheduled operation',
        summary: 'Do not add this twice.',
        risk: 'yellow',
        payload: { title: 'Repeatable scheduled operation', body: 'Same payload.' }
      };

      const first = await addMoneyPrinterOperations(cwd, [operation]);
      const second = await addMoneyPrinterOperations(cwd, [operation]);
      assert.equal(first.added.length, 1);
      assert.equal(second.added.length, 0);

      const operations = JSON.parse(await readFile(path.join(cwd, '.money-printer', 'operations.json'), 'utf8'));
      assert.equal(operations.length, 1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('documents and templates the DigitalOcean timer install path', async () => {
    const [doc, service, timer, packageJson] = await Promise.all([
      readFile(path.join(rootDir, 'docs', 'digitalocean-money-printer-supervisor.md'), 'utf8'),
      readFile(path.join(rootDir, 'ops', 'systemd', 'money-printer-supervisor.service'), 'utf8'),
      readFile(path.join(rootDir, 'ops', 'systemd', 'money-printer-supervisor.timer'), 'utf8'),
      readFile(path.join(rootDir, 'package.json'), 'utf8')
    ]);

    assert.match(doc, /not a fully autonomous company/i);
    assert.match(doc, /MONEY_PRINTER_ALLOW_CODEX_EXEC=false/);
    assert.match(service, /money-printer:supervisor/);
    assert.match(timer, /OnUnitActiveSec=6h/);
    assert.match(packageJson, /"money-printer:supervisor"/);
  });
});
