import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('CRM exposes the parallel flow interface from the classic cockpit', async () => {
  const html = await read('crm/index.html');
  assert.match(html, /href="\.\/flow\.html"/);
  assert.match(html, /Flow view/);
});

test('CRM Flow ships a today-first parallel interface', async () => {
  const html = await read('crm/flow.html');
  const css = await read('crm/flow.css');
  const js = await read('crm/flow.js');

  assert.match(html, /CRM Flow/);
  assert.match(html, /Today-first sales flow/);
  assert.match(html, /id="todayList"/);
  assert.match(html, /id="spotlightCard"/);
  assert.match(html, /id="pipelineBoard"/);
  assert.match(html, /id="opportunityMap"/);
  assert.match(html, /id="quickAddForm"/);
  assert.match(html, /id="leadDrawer"/);
  assert.match(html, /data-drawer-action="mark-won"/);
  assert.match(html, /https:\/\/unpkg\.com\/lucide@latest/);

  assert.match(css, /\.flow-workbench/);
  assert.match(css, /\.pipeline-board/);
  assert.match(css, /\.spotlight-card/);
  assert.match(css, /@media \(max-width: 780px\)/);

  assert.match(js, /const crmRecords = gun\.get\('3dvr-crm'\)/);
  assert.match(js, /const touchLogRoot = portalRoot\.get\('crm-touch-log'\)/);
  assert.match(js, /buildCrmRelationshipBoard/);
  assert.match(js, /function getLeadScore\(/);
  assert.match(js, /function renderSpotlight\(/);
  assert.match(js, /function renderPipeline\(/);
  assert.match(js, /function handleQuickAddSubmit\(event\)/);
  assert.match(js, /function logTouch\(id\)/);
  assert.match(js, /function markWon\(id\)/);
  assert.match(js, /data-flow-action="log-touch"/);
  assert.match(js, /window\.crmFlow/);
});
