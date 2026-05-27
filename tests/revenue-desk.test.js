import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const baseDir = new URL('../revenue-desk/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

test('revenue desk ships a founder operating surface for profitability', async () => {
  const html = await readFile(new URL('index.html', baseDir), 'utf8');

  assert.equal(await fileExists(new URL('index.html', baseDir)), true);
  assert.equal(await fileExists(new URL('style.css', baseDir)), true);
  assert.equal(await fileExists(new URL('app.js', baseDir)), true);
  assert.match(html, /Revenue Desk \| 3dvr portal/);
  assert.match(html, /<h1>Revenue Desk<\/h1>/);
  assert.match(html, /Run the company from one revenue move\./);
  assert.match(html, /Log conversation/);
  assert.match(html, /Open Marketing/);
  assert.match(html, /Money now/);
  assert.match(html, /Run Money AI/);
  assert.match(html, /href="\.\.\/money-ai\/"/);
  assert.match(html, /href="\.\.\/sales\/marketing\.html"/);
  assert.match(html, /id="money-now"/);
  assert.match(html, /id="moneyMoveTitle"/);
  assert.match(html, /id="moneyDraft"/);
  assert.match(html, /id="copyMoneyDraftButton"/);
  assert.match(html, /id="runMoneyLoopButton"/);
  assert.match(html, /id="moneyLoopStatus"/);
  assert.match(html, /id="moneyOpportunityList"/);
  assert.match(html, /3dvr-portal\/money-ai/);
  assert.match(html, /Move one real conversation forward/);
  assert.match(html, /Use latest capture/);
  assert.match(html, /Queue agent brief/);
  assert.match(html, /id="nextMoveBody"/);
  assert.match(html, /id="automationStatus"/);
  assert.match(html, /id="prefillFromCaptureButton"/);
  assert.match(html, /data-agent-brief-button/);
  assert.match(html, /id="revenueForm"/);
  assert.match(html, /data-plan-input="starter"/);
  assert.match(html, /id="customSprintRevenue"/);
  assert.match(html, /id="stripeMrrValue"/);
  assert.match(html, /id="stripeSubscriberValue"/);
  assert.match(html, /id="stripeBalanceValue"/);
  assert.match(html, /id="stripeSyncStatus"/);
  assert.match(html, /id="stripeRefreshButton"/);
  assert.match(html, /3dvr-portal\/finance\/stripe\/metrics\/latest/);
  assert.match(html, /id="proposalForm"/);
  assert.match(html, /id="proposalDrawer"/);
  assert.match(html, /id="proposalBoard"/);
  assert.match(html, /3dvr-portal\/revenue-desk\/state/);
  assert.match(html, /3dvr-portal\/proposals/);
  assert.match(html, /docs\/path-to-profitability\.md/);
  assert.match(html, /docs\/market-research-2026\.md/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /type="module" src="app\.js"/);
});

test('revenue desk backs metrics, proposals, and agent daily briefs with Gun', async () => {
  const js = await readFile(new URL('app.js', baseDir), 'utf8');

  assert.match(js, /REVENUE_NODE = 'revenue-desk'/);
  assert.match(js, /PROPOSALS_NODE = 'proposals'/);
  assert.match(js, /MEMORY_CAPTURE_NODE = 'memoryCapture'/);
  assert.match(js, /TOUCH_LOG_NODE = 'crm-touch-log'/);
  assert.match(js, /MONEY_LOOP_STORAGE_KEY/);
  assert.match(js, /MONEY_AI_TOKEN_STORAGE_KEY/);
  assert.match(js, /formatSyncTimestamp/);
  assert.match(js, /stripeMetricsRoot/);
  assert.match(js, /moneyAiRoot/);
  assert.match(js, /finance'\)\.get\('stripe'\)\.get\('metrics'\)\.get\('latest'\)/);
  assert.match(js, /fetch\('\/api\/stripe\/metrics'\)/);
  assert.match(js, /fetch\('\/api\/money\/loop'/);
  assert.match(js, /refreshStripeTotals/);
  assert.match(js, /applyStripeMetricsPatch/);
  assert.match(js, /formatStripeTotals/);
  assert.match(js, /getLatestCapture/);
  assert.match(js, /buildMoneyAction/);
  assert.match(js, /billingPlanUrl/);
  assert.match(js, /planFromOffer/);
  assert.match(js, /renderMoneyNow/);
  assert.match(js, /runMoneyLoopNow/);
  assert.match(js, /copyMoneyDraft/);
  assert.match(js, /persistMoneyLoopRun/);
  assert.match(js, /get\('money-ai'\)/);
  assert.match(js, /prefillProposalFromLatestCapture/);
  assert.match(js, /AGENT_OWNER_ALIAS = '3dvr-managed'/);
  assert.match(js, /REVENUE_STORAGE_KEY/);
  assert.match(js, /PROPOSAL_STORAGE_KEY/);
  assert.match(js, /planCounts/);
  assert.match(js, /customSprintRevenue/);
  assert.match(js, /revenueRoot\.get\('state'\)/);
  assert.match(js, /proposalRoot\.get\(proposal\.id\)/);
  assert.match(js, /agentOps/);
  assert.match(js, /buildAgentDailyBriefTask/);
  assert.match(js, /top 5 people to follow up with/);
  assert.match(js, /calculateMrr/);
  assert.match(js, /getMilestone/);
});

test('revenue desk is discoverable from the portal and sales hub', async () => {
  const portalHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const salesHtml = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');

  assert.match(portalHtml, /href="revenue-desk\/"/);
  assert.match(portalHtml, /<span class="app-card__title">Revenue Desk<\/span>/);
  assert.match(portalHtml, /Run the daily founder loop: follow-ups, proposals, billing, and one revenue move\./);
  assert.match(portalHtml, /Open Revenue Desk/);
  assert.match(salesHtml, /href="\.\.\/revenue-desk\/"/);
  assert.match(salesHtml, /Revenue Desk/);

  const startIndex = portalHtml.indexOf('>Start Here<');
  const revenueIndex = portalHtml.indexOf('>Revenue Desk<');
  const agentIndex = portalHtml.indexOf('>Agent Ops<');

  assert.ok(startIndex !== -1, 'Start Here app card should be listed');
  assert.ok(revenueIndex !== -1, 'Revenue Desk app card should be listed');
  assert.ok(agentIndex !== -1, 'Agent Ops app card should be listed');
  assert.ok(startIndex < revenueIndex, 'Revenue Desk should render after Start Here');
  assert.ok(revenueIndex < agentIndex, 'Revenue Desk should render before Agent Ops');
});
