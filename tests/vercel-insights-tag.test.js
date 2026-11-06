import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const insightsTagPattern = /<script defer src="\/_vercel\/insights\/script\.js"><\/script>/g;

function listTrackedHtmlFiles() {
  const stdout = execFileSync('git', ['-C', repoRoot, 'ls-files', '*.html'], { encoding: 'utf8' }).trim();
  return stdout ? stdout.split('\n') : [];
}

test('tracked html files do not include the retired vercel insights tag', () => {
  const failures = [];

  for (const relativePath of listTrackedHtmlFiles()) {
    const absolutePath = path.join(repoRoot, relativePath);
    const source = readFileSync(absolutePath, 'utf8');
    const matches = source.match(insightsTagPattern) || [];

    if (matches.length !== 0) {
      failures.push(`${relativePath}: expected 0 insights tags, found ${matches.length}`);
    }
  }

  assert.deepEqual(failures, []);
});
