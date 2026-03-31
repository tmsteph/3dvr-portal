import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sales research desk keeps current market signals tied to action', async () => {
  const salesHubHtml = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');
  const html = await readFile(new URL('../sales/research.html', import.meta.url), 'utf8');

  assert.match(salesHubHtml, /Market Research/);
  assert.match(salesHubHtml, /Open research desk/);
  assert.match(html, /Market Research Desk/);
  assert.match(html, /Snapshot: March 30, 2026/);
  assert.match(html, /497,046/);
  assert.match(html, /30,438/);
  assert.match(html, /36\.2M/);
  assert.match(html, /45\.9%/);
  assert.match(html, /Reaching customers and growing sales was the most common operational challenge/);
  assert.match(html, /Professional services/);
  assert.match(html, /Construction and local service/);
  assert.match(html, /Health, support, and other local services/);
  assert.match(html, /First 15 interviews/);
  assert.match(html, /Log real conversations, not vague intentions/);
  assert.match(html, /Open pro interview draft/);
  assert.match(html, /Open local interview draft/);
  assert.match(html, /Open support-team draft/);
  assert.match(html, /Schedule the next interview/);
  assert.match(html, /id="scheduleInterviewForm"/);
  assert.match(html, /id="scheduledInterviewList"/);
  assert.match(html, /Open calendar draft/);
  assert.match(html, /id="interviewLogForm"/);
  assert.match(html, /id="interviewSprintStatus"/);
  assert.match(html, /First 3 today/);
  assert.match(html, /One real conversation per segment/);
  assert.match(html, /id="interviewMinimumStatus"/);
  assert.match(html, /These picks are inferred from Census, SBA, and Fed data plus current 3dvr offers\./);
  assert.match(html, /https:\/\/www\.census\.gov\/econ\/bfs\/pdf\/historic\/bfs_2025m12\.pdf/);
  assert.match(html, /https:\/\/advocacy\.sba\.gov\/wp-content\/uploads\/2025\/06\/United_States_2025-State-Profile\.pdf/);
  assert.match(html, /https:\/\/www\.fedsmallbusiness\.org\/2026-report-on-employer-firms/);
});
