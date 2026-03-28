import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const insightsTag = '<script defer src="/_vercel/insights/script.js"></script>';
const insightsTagPattern = /<script defer src="\/_vercel\/insights\/script\.js"><\/script>/g;
const closingHeadPattern = /<\/head>/i;

function listTrackedHtmlFiles() {
  const stdout = execFileSync('git', ['-C', repoRoot, 'ls-files', '*.html'], { encoding: 'utf8' }).trim();
  return stdout ? stdout.split('\n') : [];
}

test('tracked html files include one vercel insights tag before the closing head', () => {
  const failures = [];

  for (const relativePath of listTrackedHtmlFiles()) {
    const absolutePath = path.join(repoRoot, relativePath);
    const source = readFileSync(absolutePath, 'utf8');
    const matches = source.match(insightsTagPattern) || [];

    if (matches.length !== 1) {
      failures.push(`${relativePath}: expected 1 insights tag, found ${matches.length}`);
      continue;
    }

    const headMatch = closingHeadPattern.exec(source);
    if (!headMatch) {
      failures.push(`${relativePath}: missing </head>`);
      continue;
    }

    const scriptIndex = source.indexOf(insightsTag);
    if (scriptIndex > headMatch.index) {
      failures.push(`${relativePath}: insights tag must appear before </head>`);
    }
  }

  assert.deepEqual(failures, []);
});
