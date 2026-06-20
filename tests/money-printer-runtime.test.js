import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  generateStructuredIdeasWithModel,
  getModelProviderStatus,
  runBotWithModel
} from '../src/money-printer/moneyPrinterModelProvider.js';
import {
  formatMoneyPrinterFounderDoctrine,
  MONEY_PRINTER_FOUNDER_DOCTRINE
} from '../src/money-printer/moneyPrinterFounderDoctrine.js';
import {
  buildWeakSignalOperations,
  extractWeakSignalsFromText,
  scoreWeakSignal
} from '../src/money-printer/moneyPrinterWeakSignals.js';
import {
  addMoneyPrinterOperations,
  autoApproveMoneyPrinterOperations,
  approveMoneyPrinterOperation,
  createConnectorOperationPlan,
  executeMoneyPrinterOperation
} from '../src/money-printer/moneyPrinterOperations.js';
import { createGithubIssue } from '../src/money-printer/moneyPrinterGithubConnector.js';

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../scripts/money-printer-cli.mjs', import.meta.url));

async function createTempWorkspace() {
  return mkdtemp(path.join(tmpdir(), 'money-printer-runtime-'));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function runCli(cwd, args = [], env = {}) {
  return execFileAsync(process.execPath, [cliPath, ...args], {
    cwd,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NO_COLOR: '1',
      ...env
    }
  });
}

describe('money-printer model runtime', () => {
  it('formats the founder doctrine around offers, users, and manual validation', () => {
    const doctrine = formatMoneyPrinterFounderDoctrine();
    assert.ok(MONEY_PRINTER_FOUNDER_DOCTRINE.length >= 6);
    assert.match(doctrine, /urgent pain/);
    assert.match(doctrine, /manual audits|manual user recruitment|manual concierge/);
    assert.match(doctrine, /90\/10 solution/);
    assert.match(doctrine, /paid-pilot|paid pilot/);
  });

  it('scores weak social posts before direct outreach', () => {
    const signal = {
      platform: 'linkedin',
      title: 'How do you fix SaaS onboarding emails?',
      text: 'Does anyone know a good way to fix onboarding emails? We are stuck in spreadsheets, replies are manual, and I would pay for a done-for-me setup before demo week.',
      comments: 12,
      reactions: 30
    };

    const score = scoreWeakSignal(signal);
    assert.equal(score.stage, 'offer-test');
    assert.ok(score.score >= 76);
    assert.ok(score.indicators.includes('question'));
    assert.ok(score.indicators.includes('buying-intent'));

    const extracted = extractWeakSignalsFromText(`${signal.text}\n\nLow signal brand update. We launched a new feature.`, {
      platform: 'linkedin',
      market: 'early-stage SaaS'
    });
    assert.equal(extracted.length, 2);
    const operations = buildWeakSignalOperations(extracted, { market: 'early-stage SaaS' });
    assert.ok(operations.some(operation => /weak signal/i.test(operation.title)));
    assert.match(operations[0].payload.body, /Draft public comment/);
    assert.match(operations[0].payload.body, /Interview questions/);
    assert.match(operations[0].payload.body, /Do not send DMs or offers automatically/);
  });

  it('falls back to mock mode when OpenAI mode is requested without a key', async () => {
    const status = getModelProviderStatus({}, {
      MONEY_PRINTER_AI_MODE: 'openai',
      OPENAI_API_KEY: ''
    });
    assert.equal(status.mode, 'mock');
    assert.equal(status.openAiKeyPresent, false);

    const result = await generateStructuredIdeasWithModel({
      businessConfig: { mission: 'Help local service businesses book more calls.' }
    }, {
      ai: true,
      env: {
        MONEY_PRINTER_AI_MODE: 'openai',
        OPENAI_API_KEY: ''
      },
      count: 2
    });
    assert.equal(result.aiMode, 'mock');
    assert.equal(result.ideas.length, 2);
  });

  it('logs invalid model JSON and falls back to mock bot output', async () => {
    const cwd = await createTempWorkspace();
    try {
      const fetchImpl = async () => ({
        ok: true,
        json: async () => ({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'this is not json' }]
            }
          ]
        })
      });

      const result = await runBotWithModel('executive-agent', {
        businessConfig: { mission: 'Make useful tools for local operators.' },
        ideas: [],
        experiments: []
      }, {
        rootDir: cwd,
        ai: true,
        fetchImpl,
        env: {
          MONEY_PRINTER_AI_MODE: 'openai',
          OPENAI_API_KEY: 'sk-test-not-real'
        }
      });

      assert.equal(result.modelFallback, true);
      assert.match(result.title, /Executive Agent/);
      assert.equal(await exists(result.rawOutputPath), true);
      assert.match(await readFile(result.rawOutputPath, 'utf8'), /this is not json/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('ideas --ai works in mock fallback mode without OPENAI_API_KEY', async () => {
    const cwd = await createTempWorkspace();
    try {
      const result = await runCli(cwd, ['ideas', '--ai', '--count', '3', '--json'], {
        MONEY_PRINTER_AI_MODE: 'openai',
        OPENAI_API_KEY: ''
      });
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.aiMode, 'mock');
      assert.equal(payload.ideas.length, 3);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('ai-status does not reveal secrets', async () => {
    const cwd = await createTempWorkspace();
    try {
      const secret = 'sk-secret-value-that-must-not-print';
      const result = await runCli(cwd, ['ai-status'], {
        MONEY_PRINTER_AI_MODE: 'openai',
        OPENAI_API_KEY: secret,
        GITHUB_TOKEN: 'github-secret',
        GITHUB_OWNER: 'tmsteph',
        GITHUB_REPO: '3dvr-portal',
        VERCEL_TOKEN: 'vercel-secret',
        VERCEL_PROJECT_ID: 'prj_test'
      });
      assert.doesNotMatch(result.stdout, new RegExp(secret));
      assert.doesNotMatch(result.stdout, /github-secret|vercel-secret/);
      assert.match(result.stdout, /OpenAI key: present/);
      assert.match(result.stdout, /GitHub: configured/);
      assert.match(result.stdout, /Vercel: configured/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('loads local Money Printer config from .env.local without printing secrets', async () => {
    const cwd = await createTempWorkspace();
    try {
      await writeFile(path.join(cwd, '.env.local'), [
        'MONEY_PRINTER_AI_MODE=openai',
        'OPENAI_API_KEY=sk-local-secret',
        'GITHUB_TOKEN=github-local-secret',
        'GITHUB_OWNER=tmsteph',
        'GITHUB_REPO=3dvr-portal',
        'VERCEL_TOKEN=vercel-local-secret',
        'VERCEL_PROJECT_ID=prj_local'
      ].join('\n'));

      const result = await runCli(cwd, ['ai-status', '--json']);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.aiMode, 'openai');
      assert.equal(payload.openAiKeyPresent, true);
      assert.equal(payload.github.configured, true);
      assert.equal(payload.vercel.configured, true);
      assert.doesNotMatch(result.stdout, /sk-local-secret|github-local-secret|vercel-local-secret/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('operations approve updates operations.json', async () => {
    const cwd = await createTempWorkspace();
    try {
      const added = await addMoneyPrinterOperations(cwd, [{
        provider: 'github',
        action: 'createIssue',
        title: 'Test issue operation',
        summary: 'Create a local approval test issue.',
        risk: 'yellow',
        payload: { title: 'Test issue operation', body: 'Local test only.' }
      }]);
      const operationId = added.added[0].id;
      const approved = await approveMoneyPrinterOperation(cwd, operationId);
      assert.equal(approved.status, 'approved');

      const operations = await readJson(path.join(cwd, '.money-printer', 'operations.json'));
      assert.equal(operations[0].id, operationId);
      assert.equal(operations[0].status, 'approved');
      assert.ok(operations[0].approvedAt);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('normalizes model-style connector operations into executable task issues', () => {
    const operation = createConnectorOperationPlan({
      provider: 'codex',
      action: 'drafting content',
      title: 'Draft outreach messages for validation sprint',
      summary: 'Prepare useful first-touch messages for human review.',
      risk: 'green',
      payload: {
        segment: 'Webflow freelancers'
      }
    });

    assert.equal(operation.provider, 'github');
    assert.equal(operation.action, 'createIssue');
    assert.equal(operation.risk, 'green');
    assert.equal(operation.sourceProvider, 'codex');
    assert.equal(operation.sourceAction, 'drafting content');
    assert.equal(operation.payload.title, 'Draft outreach messages for validation sprint');
    assert.match(operation.payload.body, /Source model operation: codex\.drafting content/);
  });

  it('auto-approves only bounded green safe operations', async () => {
    const cwd = await createTempWorkspace();
    try {
      await addMoneyPrinterOperations(cwd, [
        {
          provider: 'github',
          action: 'createIssue',
          title: 'Green task one',
          summary: 'Can become a GitHub issue.',
          risk: 'green',
          payload: { title: 'Green task one', body: 'Safe.' }
        },
        {
          provider: 'github',
          action: 'createIssue',
          title: 'Green task two',
          summary: 'Can become a GitHub issue later.',
          risk: 'green',
          payload: { title: 'Green task two', body: 'Safe.' }
        },
        {
          provider: 'github',
          action: 'createIssue',
          title: 'Yellow task',
          summary: 'Needs local approval.',
          risk: 'yellow',
          payload: { title: 'Yellow task', body: 'Review first.' }
        }
      ]);

      const approved = await autoApproveMoneyPrinterOperations(cwd, {
        autoApproveGreen: true,
        max: 1
      });

      assert.equal(approved.length, 1);
      assert.equal(approved[0].title, 'Green task one');

      const operations = await readJson(path.join(cwd, '.money-printer', 'operations.json'));
      assert.equal(operations.filter(operation => operation.status === 'approved').length, 1);
      assert.equal(operations.filter(operation => operation.status === 'planned').length, 2);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('operations execute blocks when env flags are missing', async () => {
    const cwd = await createTempWorkspace();
    try {
      const added = await addMoneyPrinterOperations(cwd, [{
        provider: 'github',
        action: 'createIssue',
        title: 'Blocked issue operation',
        summary: 'Should not execute without env flags.',
        risk: 'yellow',
        payload: { title: 'Blocked issue operation', body: 'Local test only.' }
      }]);
      const operationId = added.added[0].id;
      await approveMoneyPrinterOperation(cwd, operationId);
      const result = await executeMoneyPrinterOperation(cwd, operationId, {
        execute: true,
        env: {
          GITHUB_TOKEN: '',
          GITHUB_OWNER: '',
          GITHUB_REPO: '',
          MONEY_PRINTER_ALLOW_GITHUB_WRITE: ''
        }
      });
      assert.equal(result.status, 'skipped');
      assert.match(result.result.message, /GitHub issue creation blocked/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('GitHub issue execution is blocked without MONEY_PRINTER_ALLOW_GITHUB_WRITE=true', async () => {
    const result = await createGithubIssue({
      execute: true,
      title: 'Blocked issue',
      body: 'Should not be sent.',
      env: {
        GITHUB_TOKEN: 'ghp_not_real',
        GITHUB_OWNER: 'tmsteph',
        GITHUB_REPO: '3dvr-portal',
        MONEY_PRINTER_ALLOW_GITHUB_WRITE: 'false'
      }
    });

    assert.equal(result.status, 'skipped');
    assert.match(result.message, /MONEY_PRINTER_ALLOW_GITHUB_WRITE=true/);
  });

  it('daemon --once --ai writes a report in mock fallback mode', async () => {
    const cwd = await createTempWorkspace();
    try {
      const result = await runCli(cwd, ['daemon', '--once', '--ai'], {
        MONEY_PRINTER_AI_MODE: 'openai',
        OPENAI_API_KEY: ''
      });
      assert.match(result.stdout, /Daemon dry-run cycle completed once/);
      assert.match(result.stdout, /AI mode: mock/);

      const reportsDir = path.join(cwd, '.money-printer', 'reports');
      const reports = await readdir(reportsDir);
      assert.equal(reports.length, 1);
      const report = await readJson(path.join(reportsDir, reports[0]));
      assert.equal(report.aiMode, 'mock');
      assert.ok(report.connectorOperationsPlanned.length >= 1);
      assert.ok(report.codexPromptPath);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('Codex prompt generation writes a prompt file', async () => {
    const cwd = await createTempWorkspace();
    try {
      const result = await runCli(cwd, ['codex', 'prompt', '--bot', 'website-builder', '--json'], {
        OPENAI_API_KEY: ''
      });
      const payload = JSON.parse(result.stdout);
      assert.equal(await exists(payload.promptPath), true);
      assert.match(await readFile(payload.promptPath, 'utf8'), /Money Printer Codex Prompt/);
      assert.match(await readFile(payload.promptPath, 'utf8'), /Do not deploy or merge without explicit approval/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('weak-signals import saves signals and prepares operation plans', async () => {
    const cwd = await createTempWorkspace();
    try {
      const postsPath = path.join(cwd, 'posts.txt');
      await writeFile(postsPath, [
        'How do you fix SaaS onboarding emails? We are stuck in spreadsheets and manual follow-up. Would pay for a done-for-me setup before demo week.',
        '',
        'Anyone know a checklist for client onboarding? Our current manual process is chaos and clients keep asking for status updates.'
      ].join('\n'));

      const result = await runCli(cwd, [
        'weak-signals',
        'import',
        '--file',
        postsPath,
        '--source',
        'linkedin',
        '--market',
        'early-stage SaaS',
        '--save',
        '--operations',
        '--json'
      ]);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.signals.length, 2);
      assert.ok(payload.operations.length >= 1);
      assert.equal(await exists(path.join(cwd, '.money-printer', 'weak-signals.json')), true);
      const operations = await readJson(path.join(cwd, '.money-printer', 'operations.json'));
      assert.ok(operations.some(operation => operation.payload?.labels?.includes('weak-signal')));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
