import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('market research memo turns current sources into the revenue operating path', async () => {
  const memo = await readFile(new URL('../docs/market-research-2026.md', import.meta.url), 'utf8');

  assert.match(memo, /3dvr Market Research - May 27, 2026/);
  assert.match(memo, /503,171/);
  assert.match(memo, /28,479/);
  assert.match(memo, /36\.2 million/);
  assert.match(memo, /45\.9 percent/);
  assert.match(memo, /reaching customers and growing sales/i);
  assert.match(memo, /Owner-Led Local Services/);
  assert.match(memo, /Professional Services And Creators/);
  assert.match(memo, /Product Resellers And Side-Hustle Ecommerce/);
  assert.match(memo, /Personal Tech Department/);
  assert.match(memo, /Open Future Computing/);
  assert.match(memo, /Spatial Design And 3D Visualization/);
  assert.match(memo, /Revenue Desk/);
  assert.match(memo, /Market Research Desk/);
  assert.match(memo, /CRM/);
  assert.match(memo, /Memory Capture/);
  assert.match(memo, /Market Lab/);
  assert.match(memo, /3dvr-agent should become the operator/);
  assert.match(memo, /https:\/\/www\.census\.gov\/econ\/bfs\/current\/index\.html/);
  assert.match(memo, /https:\/\/advocacy\.sba\.gov\/wp-content\/uploads\/2025\/06\/United_States_2025-State-Profile\.pdf/);
  assert.match(memo, /https:\/\/www\.fedsmallbusiness\.org\/2026-report-on-employer-firms/);
});
