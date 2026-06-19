import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const pageDir = new URL('../money-printer/', import.meta.url);
const srcDir = new URL('../src/money-printer/', import.meta.url);
const rootDir = new URL('../', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe('money-printer MVP', () => {
  it('ships the route page with required founder control room sections', async () => {
    const indexUrl = new URL('index.html', pageDir);
    assert.equal(await fileExists(indexUrl), true, 'money-printer/index.html should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /<title>money-printer \| 3DVR Portal<\/title>/);
    assert.match(html, /An open-source AI venture engine for turning ideas into operating businesses\./);
    assert.match(html, /Give it the mission\. Give it the tools\. It starts building\./);
    assert.match(html, /Find pain\. Generate offers\. Launch experiments\. Compound toward cashflow\./);
    assert.match(html, /Purpose → Movement → Project → Business → Automations → Community/);
    assert.match(html, /3DVR helps independent builders turn purpose into operating businesses\./);
    assert.match(html, /Not magic\. Relentless opportunity loops\./);
    assert.match(html, /id="missionInput"/);
    assert.match(html, /Generate Money Machine/);
    assert.match(html, /Money Printer Dashboard/);
    assert.match(html, /AI \/ Runtime Status/);
    assert.match(html, /npm run money-printer -- ai-status/);
    assert.match(html, /Opportunity Engine/);
    assert.match(html, /Founder Command Brief/);
    assert.match(html, /Bot Dashboard/);
    assert.match(html, /Autonomy Zones/);
    assert.match(html, /Connect Tools/);
    assert.match(html, /src="\.\/app\.js"/);
  });

  it('defines reusable core modules, bot prompts, scoring helpers, and connector methods', async () => {
    const moduleNames = [
      'moneyPrinterCore.js',
      'moneyPrinterTypes.js',
      'moneyPrinterBots.js',
      'moneyPrinterPrompts.js',
      'moneyPrinterScoring.js',
      'moneyPrinterExperiments.js',
      'moneyPrinterConnectors.js',
      'moneyPrinterStorage.js',
      'moneyPrinterData.js',
      'ToolConnector.js'
    ];
    for (const moduleName of moduleNames) {
      assert.equal(await fileExists(new URL(moduleName, srcDir)), true, `${moduleName} should exist`);
    }

    const core = await readFile(new URL('moneyPrinterCore.js', srcDir), 'utf8');
    [
      'createDefaultBusinessConfig',
      'updateBusinessConfigFromMission',
      'generateMoneyIdeas',
      'scoreBusinessIdea',
      'promoteIdeaToExperiment',
      'generateValidationTest',
      'runBotLoop',
      'generateFounderCommandBrief',
      'getNextBestMoneyAction',
      'summarizePortfolio',
      'killOrScaleExperiment'
    ].forEach(name => assert.match(core, new RegExp(`function ${name}|${name}\\s*[,}]`)));

    const bots = await readFile(new URL('moneyPrinterBots.js', srcDir), 'utf8');
    assert.match(bots, /Executive Agent/);
    assert.match(bots, /Opportunity Scanner Bot/);
    assert.match(bots, /Business Idea Generator Bot/);
    assert.match(bots, /Market Research Bot/);
    assert.match(bots, /Validation Bot/);
    assert.match(bots, /Kill-or-Scale Bot/);
    assert.match(bots, /System Improvement Bot/);

    const prompts = await readFile(new URL('moneyPrinterPrompts.js', srcDir), 'utf8');
    assert.match(prompts, /Given the business config/);
    assert.match(prompts, /service-first, software-later/);

    const connector = await readFile(new URL('moneyPrinterConnectors.js', srcDir), 'utf8');
    assert.match(connector, /class AgentToolConnector/);
    assert.match(connector, /createIssue/);
    assert.match(connector, /createBranch/);
    assert.match(connector, /openPullRequest/);
    assert.match(connector, /createPreviewDeployment/);
    assert.match(connector, /writeCrmNote/);
    assert.match(connector, /draftEmail/);
    assert.match(connector, /readRevenue/);
    assert.match(connector, /readAnalytics/);
  });

  it('exposes a browser-free core API for future CLI and daemon reuse', async () => {
    const core = await import(new URL('moneyPrinterCore.js', srcDir));
    const required = [
      'createDefaultBusinessConfig',
      'updateBusinessConfigFromMission',
      'generateMoneyIdeas',
      'scoreBusinessIdea',
      'promoteIdeaToExperiment',
      'generateValidationTest',
      'runBotLoop',
      'generateFounderCommandBrief',
      'getNextBestMoneyAction',
      'summarizePortfolio',
      'killOrScaleExperiment'
    ];
    required.forEach(name => assert.equal(typeof core[name], 'function', `${name} should be exported`));

    const state = core.createMoneyMachineState({}, 'Help local service businesses book more calls.');
    assert.equal(state.ideas.length, 5);
    assert.match(state.businessConfig.mission, /local service businesses/);
    assert.match(core.runBotLoop('executive-agent', state).title, /Executive Agent/);
  });

  it('documents mock connector environment variables without secrets', async () => {
    const envUrl = new URL('.env.example', rootDir);
    assert.equal(await fileExists(envUrl), true, '.env.example should exist');

    const env = await readFile(envUrl, 'utf8');
    [
      'GITHUB_TOKEN',
      'GITHUB_OWNER',
      'GITHUB_REPO',
      'VERCEL_TOKEN',
      'VERCEL_PROJECT_ID',
      'VERCEL_TEAM_ID',
      'CRM_API_KEY',
      'EMAIL_API_KEY',
      'STRIPE_SECRET_KEY',
      'ANALYTICS_API_KEY',
      'CALENDAR_API_KEY',
      'DOCS_API_KEY'
    ].forEach(name => assert.match(env, new RegExp(`^${name}=`, 'm')));
  });
});
