import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import {
  analyzeBitBalance,
  buildRunRecord,
  countBitsFromUint32Array,
  escapeCsvValue,
  makeRandomBitSample,
  runRecordToCsv,
} from '../intention-lab/intention-lab.js';

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

test('countBitsFromUint32Array counts only the requested bits', () => {
  const words = new Uint32Array([
    0xffffffff,
    0x00000000,
    0x0000000f,
  ]);

  assert.equal(countBitsFromUint32Array(words, 32), 32);
  assert.equal(countBitsFromUint32Array(words, 64), 32);
  assert.equal(countBitsFromUint32Array(words, 68), 36);
});

test('analyzeBitBalance returns neutral statistics for a balanced 1024-bit sample', () => {
  const result = analyzeBitBalance(512, 1024);

  assert.equal(result.ones, 512);
  assert.equal(result.zeros, 512);
  assert.equal(result.expectedOnes, 512);
  assert.equal(result.difference, 0);
  assert.equal(result.zScore, 0);
  assert.ok(result.pTwoTailed > 0.999);
  assert.match(result.interpretation, /does not prove intention caused the result/i);
});

test('analyzeBitBalance returns a positive z-score when ones exceed expected value', () => {
  const result = analyzeBitBalance(600, 1024);

  assert.equal(result.ones, 600);
  assert.ok(result.difference > 0);
  assert.ok(result.zScore > 0);
  assert.ok(result.pTwoTailed < 1);
});

test('makeRandomBitSample rejects unsupported bit counts and does not use Math.random', () => {
  const cryptoProvider = {
    getRandomValues(words) {
      words.fill(0xffffffff);
      return words;
    },
  };

  assert.throws(() => makeRandomBitSample(128, cryptoProvider), /bitCount must be one of/);
  const sample = makeRandomBitSample(256, cryptoProvider);
  assert.equal(sample.bitCount, 256);
  assert.equal(sample.ones, 256);
  assert.equal(sample.zeros, 0);
});

test('buildRunRecord includes required fields and neutral RNG source', () => {
  const run = buildRunRecord({
    id: 'run-test',
    mode: 'intention-more-ones',
    intention: {
      statement: 'Call one customer',
      thought: 'Calm action compounds',
      desiredState: 'steady',
      nextAction: 'Send the message',
    },
    preState: { calm: 2, focus: 3, energy: 4, mood: 2 },
    grounding: { seconds: 60, completed: true },
    rng: { bitCount: 1024, ones: 512 },
    postState: { calm: 4, focus: 4, energy: 4, mood: 3 },
    action: { status: 'planned', note: 'Message drafted' },
    notes: 'One small run',
    safetyAcknowledged: true,
  }, {
    id: 'guest_123',
    alias: 'Guest',
    isGuest: true,
  });

  assert.equal(run.id, 'run-test');
  assert.equal(run.app, 'intention-lab');
  assert.equal(run.version, 1);
  assert.equal(run.author.id, 'guest_123');
  assert.equal(run.author.isGuest, true);
  assert.equal(run.mode, 'intention-more-ones');
  assert.equal(run.rng.source, 'browser-crypto-getRandomValues');
  assert.equal(run.rng.bitCount, 1024);
  assert.equal(run.action.status, 'planned');
  assert.equal(run.safetyAcknowledged, true);
});

test('CSV export escapes commas, newlines, and quotes safely', () => {
  assert.equal(escapeCsvValue('plain'), 'plain');
  assert.equal(escapeCsvValue('a,b'), '"a,b"');
  assert.equal(escapeCsvValue('line\nbreak'), '"line\nbreak"');
  assert.equal(escapeCsvValue('say "yes"'), '"say ""yes"""');

  const csv = runRecordToCsv(buildRunRecord({
    id: 'csv-test',
    intention: { statement: 'Call, write, ship', nextAction: 'Say "yes"' },
    notes: 'first line\nsecond line',
    rng: { bitCount: 1024, ones: 512 },
  }, { id: 'guest_csv', isGuest: true }));

  assert.match(csv, /"Call, write, ship"/);
  assert.match(csv, /"Say ""yes"""/);
  assert.match(csv, /"first line\nsecond line"/);
});

test('Intention Lab ships the standalone app, manifest, and portal integrations', async () => {
  const appDir = new URL('../intention-lab/', import.meta.url);
  assert.equal(await fileExists(new URL('index.html', appDir)), true);
  assert.equal(await fileExists(new URL('intention-lab.css', appDir)), true);
  assert.equal(await fileExists(new URL('intention-lab.js', appDir)), true);
  assert.equal(await fileExists(new URL('../app-manifests/intention-lab.webmanifest', import.meta.url)), true);

  const html = await readFile(new URL('index.html', appDir), 'utf8');
  const js = await readFile(new URL('intention-lab.js', appDir), 'utf8');
  const manifest = await readFile(new URL('../app-manifests/intention-lab.webmanifest', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /Intention Lab \| 3DVR Portal/);
  assert.match(html, /Attention selects\. Thought rehearses\. The body shifts\. Action manifests\./);
  assert.match(html, /Not proof of mind-over-matter/);
  assert.match(html, /crypto\.getRandomValues/);
  assert.match(html, /id="rngResults"/);
  assert.match(html, /id="recentRuns"/);
  assert.match(html, /<meta name="analytics" content="disabled">/);
  assert.doesNotMatch(html, /_vercel\/insights/);

  assert.match(js, /window\.ScoreSystem\.ensureGun/);
  assert.match(js, /window\.ScoreSystem\.ensureGuestIdentity/);
  assert.match(js, /get\('3dvr-portal'\)\.get\('intention-lab'\)/);
  assert.match(js, /const runsNode = state\.gunRoot\.get\('runs'\)/);
  assert.match(js, /runsNode\.get\(run\.id\)\.put\(run/);
  assert.match(js, /get\('authors'\)\.get\(run\.author\.id\)\.get\('runs'\)/);
  assert.match(js, /get\('science'\)\.get\('runs'\)\.get\(run\.id\)\.put\(summary\)/);
  assert.doesNotMatch(js, /Math\.random/);

  assert.match(manifest, /3DVR Intention Lab/);
  assert.match(manifest, /"start_url": "\/intention-lab\/\?source=pwa"/);
  assert.match(manifest, /"scope": "\/intention-lab\/"/);

  assert.match(portal, /href="intention-lab\/"/);
  assert.match(portal, />Intention Lab</);
  assert.match(portal, /data-app-tier="experimental"/);
});
