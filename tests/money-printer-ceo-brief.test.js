import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildCeoMarketBriefMarkdown,
  generateCeoMarketBrief
} from '../src/money-printer/ceoMarketBrief.js';
import { runCeoMarketBrief } from '../scripts/money-printer-ceo-brief.mjs';

test('CEO market brief picks a money-facing offer and review-gated drafts', () => {
  const brief = generateCeoMarketBrief({ date: '2026-07-07T00:00:00.000Z' });

  assert.equal(brief.role, 'operator-ceo');
  assert.match(brief.decision, /owner-led local service businesses/);
  assert.equal(brief.offer.name, '3DVR Quick Desk');
  assert.match(brief.offer.promise, /found, contacted, followed up/);
  assert.equal(brief.reviewQueueDrafts.length, 3);
  assert.equal(brief.reviewQueueDrafts.every(item => item.requiresReview), true);
  assert.equal(brief.reviewQueueDrafts.every(item => item.canAutoSend === false), true);
  assert.equal(brief.reviewQueueDrafts.some(item => item.riskLevel === 'YELLOW'), true);
  assert.match(brief.blockedActions.join('\n'), /Do not send cold outreach automatically/);
});

test('CEO market brief markdown is concise and approval oriented', () => {
  const markdown = buildCeoMarketBriefMarkdown(generateCeoMarketBrief({
    date: '2026-07-07T00:00:00.000Z'
  }));

  assert.match(markdown, /Money Printer CEO Market Brief/);
  assert.match(markdown, /## Decision/);
  assert.match(markdown, /## Offer/);
  assert.match(markdown, /## Review Queue Drafts/);
  assert.match(markdown, /action: review before sending/);
  assert.doesNotMatch(markdown, /send automatically/i);
});

test('CEO market brief CLI writes ignored local reports', async () => {
  const root = await mkdtemp(path.join(tmpdir(), '3dvr-ceo-brief-'));
  try {
    const result = await runCeoMarketBrief({
      root,
      date: '2026-07-07T00:00:00.000Z'
    });
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    const markdown = await readFile(result.markdownPath, 'utf8');

    assert.equal(json.offer.name, '3DVR Quick Desk');
    assert.match(markdown, /Money Printer CEO Market Brief/);
    assert.match(result.markdownPath, /\.money-printer\/operator\/ceo-market-brief-latest\.md$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
