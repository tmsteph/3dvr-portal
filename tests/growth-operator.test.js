import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const baseDir = new URL('../growth-operator/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

test('growth operator ships a separate lead, email, support, and delivery app', async () => {
  const html = await readFile(new URL('index.html', baseDir), 'utf8');

  assert.equal(await fileExists(new URL('index.html', baseDir)), true);
  assert.equal(await fileExists(new URL('style.css', baseDir)), true);
  assert.equal(await fileExists(new URL('app.js', baseDir)), true);
  assert.match(html, /Growth Operator \| 3dvr portal/);
  assert.match(html, /<h1>Growth Operator<\/h1>/);
  assert.match(html, /Find likely-fit leads, prepare email, handle support, and keep delivery moving/);
  assert.match(html, /id="findLeadsButton"/);
  assert.match(html, /id="supportTriageButton"/);
  assert.match(html, /id="deliveryPassButton"/);
  assert.match(html, /id="operatorForm"/);
  assert.match(html, /id="operatorEmailToken"/);
  assert.match(html, /id="operatorQueue"/);
  assert.match(html, /id="leadQueueCount"/);
  assert.match(html, /id="readyEmailCount"/);
  assert.match(html, /id="supportQueueCount"/);
  assert.match(html, /id="deliveryQueueCount"/);
  assert.match(html, /\/api\/calendar\/reminder-email/);
  assert.match(html, /3dvr-portal\/growthOperator\/items/);
  assert.match(html, /sprint fit-check leads/);
  assert.match(html, /3dvr-audience-tests\/v1/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /type="module" src="app\.js"/);
});

test('growth operator app queues agent work and can send approved outreach through mail route', async () => {
  const js = await readFile(new URL('app.js', baseDir), 'utf8');

  assert.match(js, /OPERATOR_NODE = 'growthOperator'/);
  assert.match(js, /PROJECT_LEAD_BRIEF_KEY = '3dvr\.growthOperator\.project-lead-brief\.v1'/);
  assert.match(js, /projectUpdatesRoot = portalRoot \? portalRoot\.get\('projectLaunchpad'\)\.get\('updates'\) : null/);
  assert.match(js, /projectSlug: normalizeText\(value\.projectSlug\)/);
  assert.match(js, /source: state\.projectLeadBrief\?\.projectSlug \? `project:\$\{state\.projectLeadBrief\.projectSlug\}`/);
  assert.match(js, /function markCustomer/);
  assert.match(js, /function deliveryItemFromCustomer/);
  assert.match(js, /id: `delivery-\$\{item\.id\}`/);
  assert.match(js, /lane: 'delivery'/);
  assert.match(js, /First delivery item created/);
  assert.match(js, /function markDelivered/);
  assert.match(js, /Mark delivery to \$\{item\.name\} complete\?/);
  assert.match(js, /it does not send a message/);
  assert.match(js, /title: `First delivery completed: \$\{item\.name\}`/);
  assert.match(js, /data-action=\"delivered\"/);
  assert.match(js, /Capture the outcome/);
  assert.match(js, /Mark \$\{item\.name\} as a customer\?/);
  assert.match(js, /it does not charge them or send a message/);
  assert.match(js, /title: `First customer: \$\{item\.name\}`/);
  assert.match(js, /data-action=\"customer\"/);
  assert.match(js, /function hydrateProjectLeadBrief/);
  assert.match(js, /sessionStorage\.getItem\(PROJECT_LEAD_BRIEF_KEY\)/);
  assert.match(js, /Review the target, then use Find leads when you want research queued/);
  assert.match(js, /Find 10 likely-fit people or organizations for this project/);
  assert.match(js, /Do not contact them; return candidates and draft next steps for review/);
  assert.match(js, /AGENT_OWNER_ALIAS = '3dvr-managed'/);
  assert.match(js, /AUDIENCE_LEAD_SOURCES = Object\.freeze/);
  assert.match(js, /key: 'forge-revenue-sprint'/);
  assert.match(js, /key: 'lead-rescue-sprint'/);
  assert.match(js, /key: 'freelance-portfolio-validation-sprint'/);
  assert.match(js, /key: 'client-onboarding-sprint'/);
  assert.match(js, /key: 'offer-audit'/);
  assert.match(js, /audienceRoot = gun \? gun\.get\('3dvr-audience-tests'\)\.get\('v1'\) : null/);
  assert.match(js, /function normalizeAudienceLead/);
  assert.match(js, /source: `audience:\$\{source\.key\}`/);
  assert.match(js, /subscribeAudienceLeads/);
  assert.match(js, /itemsRoot\.get\(lead\.id\), lead/);
  assert.match(js, /portalRoot\.get\('agentOps'\)\.get\(AGENT_OWNER_ALIAS\)\.get\('taskQueue'\)/);
  assert.match(js, /buildAgentTask/);
  assert.match(js, /find-leads/);
  assert.match(js, /support-triage/);
  assert.match(js, /delivery-pass/);
  assert.match(js, /Do not mass email/);
  assert.match(js, /wait for approval before sending/);
  assert.match(js, /fetch\('\/api\/calendar\/reminder-email'/);
  assert.match(js, /mode: 'lead-outreach'/);
  assert.match(js, /Authorization: `Bearer \$\{token\}`/);
  assert.match(js, /billingPlanUrl/);
  assert.match(js, /buildDraft/);
  assert.match(js, /itemsRoot\.map\(\)\.on/);
});

test('growth operator is discoverable from the simplified portal and email operator', async () => {
  const portalHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const emailOperatorHtml = await readFile(new URL('../email-operator/index.html', import.meta.url), 'utf8');

  assert.match(portalHtml, /href="\/growth-operator\/\?campaign=my-skill"/);
  assert.match(portalHtml, /<strong>Make money<\/strong>/);
  assert.match(portalHtml, /href="\/growth-operator\/"[^>]*><strong>Growth Operator<\/strong>/);
  assert.match(portalHtml, /Pick a money path, find leads, and run outreach\./);
  assert.match(emailOperatorHtml, /href="..\/growth-operator\/"/);

  const revenueIndex = portalHtml.indexOf('<strong>Revenue Desk</strong>');
  const growthIndex = portalHtml.indexOf('<strong>Growth Operator</strong>');
  const forgeIndex = portalHtml.indexOf('<strong>Forge</strong>');

  assert.ok(revenueIndex !== -1, 'Revenue Desk app should be listed');
  assert.ok(growthIndex !== -1, 'Growth Operator app should be listed');
  assert.ok(forgeIndex !== -1, 'Forge app should be listed');
  assert.ok(revenueIndex < growthIndex, 'Growth Operator should render after Revenue Desk');
  assert.ok(growthIndex < forgeIndex, 'Growth Operator should render before Forge');
});
