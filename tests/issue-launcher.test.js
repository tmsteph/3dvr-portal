import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = new URL('../', import.meta.url);

async function collectHtmlFiles(dirUrl, files = []) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'tests' || entry.name.startsWith('.git')) continue;
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl);
    if (entry.isDirectory()) {
      await collectHtmlFiles(entryUrl, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(entryUrl);
    }
  }
  return files;
}

test('issue launcher ships a GitHub issue helper for the portal repo', async () => {
  const source = await readFile(new URL('../issue-launcher.js', import.meta.url), 'utf8');

  assert.match(source, /tmsteph/);
  assert.match(source, /3dvr-portal/);
  assert.match(source, /issues\/new/);
  assert.match(source, /Report portal issue/);
  assert.match(source, /Page feedback/);
  assert.match(source, /Create an issue from this page/);
  assert.match(source, /Page context/);
  assert.match(source, /- Path:/);
  assert.match(source, /- URL:/);
  assert.match(source, /Current page:/);
});

test('portal html pages include the shared issue launcher', async () => {
  const htmlFiles = await collectHtmlFiles(repoRoot);
  assert.ok(htmlFiles.length > 100, 'expected to inspect the portal html entry points');

  for (const fileUrl of htmlFiles) {
    const html = await readFile(fileUrl, 'utf8');
    const relativePath = path.relative(new URL('../', import.meta.url).pathname, fileUrl.pathname);
    const issueLauncherDisabled = /data-issue-launcher="off"|<meta[^>]+name="portal:issue-launcher"[^>]+content="off"/.test(html);

    if (issueLauncherDisabled) {
      continue;
    }

    assert.match(
      html,
      /<script[^>]+src="\/issue-launcher\.js"[^>]*><\/script>/,
      `expected issue launcher include in ${relativePath}`
    );
  }
});
