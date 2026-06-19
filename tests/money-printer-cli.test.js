import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../scripts/money-printer-cli.mjs', import.meta.url));

async function createTempWorkspace() {
  return mkdtemp(path.join(tmpdir(), 'money-printer-cli-'));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function runCli(cwd, args = []) {
  return execFileAsync(process.execPath, [cliPath, ...args], {
    cwd,
    env: {
      ...process.env,
      NO_COLOR: '1'
    }
  });
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

describe('money-printer CLI', () => {
  it('initializes a file workspace and runs the core operator commands', async () => {
    const cwd = await createTempWorkspace();
    try {
      const workspaceDir = path.join(cwd, '.money-printer');
      const businessPath = path.join(workspaceDir, 'business.json');
      const ideasPath = path.join(workspaceDir, 'ideas.json');
      const experimentsPath = path.join(workspaceDir, 'experiments.json');
      const reportsDir = path.join(workspaceDir, 'reports');
      const eventsPath = path.join(workspaceDir, 'logs', 'events.jsonl');

      const init = await runCli(cwd, ['init']);
      assert.match(init.stdout, /Money Printer workspace/);
      assert.equal(await exists(businessPath), true);
      assert.equal(await exists(ideasPath), true);
      assert.equal(await exists(experimentsPath), true);
      assert.equal(await exists(reportsDir), true);

      const mission = await runCli(cwd, [
        'mission',
        'Launch an AI web agency for local service businesses'
      ]);
      assert.match(mission.stdout, /Mission updated/);
      assert.match((await readJson(businessPath)).mission, /AI web agency/);

      const ideas = await runCli(cwd, ['ideas', '--count', '5', '--save']);
      assert.match(ideas.stdout, /Generated 5 scored ideas/);
      const savedIdeas = await readJson(ideasPath);
      assert.equal(savedIdeas.length, 5);
      assert.ok(savedIdeas[0].id);

      const promote = await runCli(cwd, ['promote', savedIdeas[0].id]);
      assert.match(promote.stdout, /Promoted/);
      const experiments = await readJson(experimentsPath);
      assert.equal(experiments.length, 1);
      assert.equal(experiments[0].status, 'Idea');

      const brief = await runCli(cwd, ['brief']);
      assert.match(brief.stdout, /Founder Command Brief/);
      assert.match(brief.stdout, /Next Best Money Action/);

      const run = await runCli(cwd, ['run', 'executive']);
      assert.match(run.stdout, /Executive Agent decision/);
      assert.match(run.stdout, /buyer outreach/);

      const status = await runCli(cwd, ['status']);
      assert.match(status.stdout, /Money Printer Status/);
      assert.match(status.stdout, /Ideas Generated: 5/);
      assert.match(status.stdout, /Experiments Active: 1/);

      const daemon = await runCli(cwd, ['daemon', '--once']);
      assert.match(daemon.stdout, /Daemon dry-run cycle completed once/);
      assert.equal(await exists(eventsPath), true);
      assert.match(await readFile(eventsPath, 'utf8'), /daemon --once/);

      const reportFiles = await import('node:fs/promises')
        .then(fs => fs.readdir(reportsDir));
      assert.equal(reportFiles.length, 1);
      const report = await readJson(path.join(reportsDir, reportFiles[0]));
      assert.equal(report.mode, 'dry-run');
      assert.match(report.botOutput.title, /Executive Agent/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
