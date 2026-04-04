import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('crm ships a sales cockpit with moves, drafts, and timeline support', async () => {
  const crmHtml = await readFile(new URL('../crm/index.html', import.meta.url), 'utf8');
  const crmJs = await readFile(new URL('../crm/app.js', import.meta.url), 'utf8');

  assert.match(crmHtml, /Today's Sales Moves/);
  assert.match(crmHtml, /Follow up today/);
  assert.match(crmHtml, /Hot leads with no draft/);
  assert.match(crmHtml, /Warm leads going quiet/);
  assert.match(crmHtml, /Replies needing response/);
  assert.match(crmHtml, /id="crmDetailDrafts"/);
  assert.match(crmHtml, /id="crmDetailTimeline"/);
  assert.match(crmHtml, /id="crmDetailSalesNote"/);

  assert.match(crmJs, /const CRM_DRAFTS_NODE_PATH = \['3dvr-portal', 'crm-outreach-drafts'\]/);
  assert.match(crmJs, /const SALES_STALE_DAYS = 7/);
  assert.match(crmJs, /function renderSalesMoves\(\)/);
  assert.match(crmJs, /function saveLeadDraft\(/);
  assert.match(crmJs, /function renderDraftCards\(/);
  assert.match(crmJs, /function renderTimeline\(/);
  assert.match(crmJs, /function generateOutreachDraft\(/);
  assert.match(crmJs, /window\.crmOutreach && typeof window\.crmOutreach\.generateDraft === 'function'/);
  assert.match(crmJs, /Mock generate/);
});
