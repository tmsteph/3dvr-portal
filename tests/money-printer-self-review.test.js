import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  RISK_LEVELS,
  buildSelfReviewMarkdown,
  classifyChange,
  classifyPath,
  describeChangeIntent,
  isSecretLikePath
} from '../scripts/money-printer-self-review.mjs';

test('classifies documentation and tests as green when checks pass', () => {
  const review = classifyChange({
    testsPassed: true,
    files: [
      { path: 'docs/money-printer-automerge.md', status: 'M', additions: 12, deletions: 0 },
      { path: 'tests/money-printer-self-review.test.js', status: 'M', additions: 10, deletions: 0 }
    ],
    commands: ['node --test tests/money-printer-self-review.test.js']
  });

  assert.equal(review.risk, RISK_LEVELS.GREEN);
  assert.equal(review.autoMergeAllowed, true);
  assert.equal(review.safetyChecks.testsPassed, true);
});

test('blocks billing, deployment, sending, auth, and deletion paths as red', () => {
  const redPaths = [
    'api/stripe/[route].js',
    'billing/app.js',
    'vercel.json',
    '.github/workflows/deploy.yml',
    'api/calendar/reminder-email.js',
    'auth/sign-in.html'
  ];

  for (const filePath of redPaths) {
    assert.equal(classifyPath({ path: filePath, status: 'M' }).risk, RISK_LEVELS.RED, filePath);
  }

  assert.equal(classifyPath({ path: 'docs/old.md', status: 'D' }).risk, RISK_LEVELS.RED);
});

test('marks approval logic and automerge scripts as yellow', () => {
  const review = classifyChange({
    testsPassed: true,
    files: [
      { path: 'src/money-printer/messageReview.js', status: 'M', additions: 8, deletions: 2 },
      { path: 'scripts/money-printer-operator.mjs', status: 'M', additions: 20, deletions: 0 }
    ]
  });

  assert.equal(review.risk, RISK_LEVELS.YELLOW);
  assert.equal(review.autoMergeAllowed, false);
  assert.match(review.reasons.join('\n'), /approval logic|automation|needs human review/i);
});

test('blocks green auto-merge when tests are missing or the change is too large', () => {
  const noTests = classifyChange({
    testsPassed: false,
    files: [{ path: 'docs/update.md', status: 'M', additions: 2, deletions: 0 }]
  });
  assert.equal(noTests.risk, RISK_LEVELS.YELLOW);
  assert.equal(noTests.autoMergeAllowed, false);

  const tooManyFiles = classifyChange({
    testsPassed: true,
    files: Array.from({ length: 7 }, (_, index) => ({
      path: `docs/update-${index}.md`,
      status: 'M',
      additions: 1,
      deletions: 0
    }))
  });
  assert.equal(tooManyFiles.risk, RISK_LEVELS.YELLOW);
  assert.equal(tooManyFiles.autoMergeAllowed, false);
});

test('detects secret-like paths and renders the required self-review sections', () => {
  assert.equal(isSecretLikePath('.env.local'), true);
  assert.equal(isSecretLikePath('docs/readme.md'), false);

  const review = classifyChange({
    summary: 'Test summary',
    testsPassed: true,
    files: [{ path: 'docs/update.md', status: 'M', additions: 1, deletions: 0 }],
    commands: ['node --test tests/money-printer-self-review.test.js']
  });
  const markdown = buildSelfReviewMarkdown(review);

  assert.match(markdown, /Money Printer Self Review/);
  assert.match(markdown, /## Intent/);
  assert.match(markdown, /## What Changed/);
  assert.match(markdown, /## Why It Matters/);
  assert.match(markdown, /Risk Classification/);
  assert.match(markdown, /Auto-Merge Decision/);
  assert.match(markdown, /Safety Checks/);
  assert.match(markdown, /Rollback Plan/);
  assert.match(markdown, /Next Suggested Action/);
});

test('renders descriptive intent for Money Printer operator changes', () => {
  const review = classifyChange({
    testsPassed: true,
    files: [
      { path: 'scripts/money-printer-operator.mjs', status: 'M', additions: 10, deletions: 2 },
      { path: 'tests/money-printer-self-review.test.js', status: 'M', additions: 3, deletions: 0 }
    ],
    commands: ['node --test tests/money-printer-self-review.test.js']
  });
  const markdown = buildSelfReviewMarkdown(review);

  assert.match(describeChangeIntent(review.files), /explains its own work/i);
  assert.match(markdown, /Improve how Money Printer explains its own work before Thomas reviews or receives a report\./);
  assert.match(markdown, /Updated 2 files in Money Printer operator scripts and test coverage\./);
  assert.match(markdown, /operator report becomes easier to skim/i);
});

test('operator proposal commits only the reviewed safe improvement', () => {
  const source = readFileSync(new URL('../scripts/money-printer-operator.mjs', import.meta.url), 'utf8');

  assert.match(source, /self-review-latest\.md/);
  assert.match(source, /ensureProposalBranch\(rootDir, options\)/);
  assert.match(source, /git\(rootDir, \['switch', '-c', nextBranch\]\)/);
  assert.match(source, /out: selfReviewPath/);
  assert.match(source, /intent: report\.impact\.intent/);
  assert.match(source, /whatChanged: report\.impact\.whatChanged/);
  assert.match(source, /whyItMatters: report\.impact\.whyItMatters/);
  assert.doesNotMatch(source, /outPath: selfReviewPath/);
  assert.match(source, /\['add', 'docs\/money-printer-operator-report\.md'\]/);
  assert.doesNotMatch(source, /\['add', 'docs\/money-printer-operator-report\.md', 'SELF_REVIEW\.md'\]/);
});
