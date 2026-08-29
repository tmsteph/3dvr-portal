import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { test } from 'node:test';

const API_ROOT = new URL('../api/', import.meta.url);
const HOBBY_FUNCTION_LIMIT = 12;

async function listApiEntries(dir = API_ROOT) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === '_lib') continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
    if (entry.isDirectory()) files.push(...await listApiEntries(child));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(child);
  }

  return files;
}

test('Portal stays within the Vercel Hobby serverless function budget', async () => {
  const entries = await listApiEntries();
  const names = entries.map(url => relative(new URL('..', API_ROOT).pathname, url.pathname)).sort();

  assert.ok(
    entries.length <= HOBBY_FUNCTION_LIMIT,
    `Portal has ${entries.length} API entry files; Vercel Hobby allows ${HOBBY_FUNCTION_LIMIT}.\n${names.join('\n')}`
  );
});

test('Workboard GitHub feed uses the shared session function', async () => {
  const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrite = vercelConfig.rewrites.find(item => item.source === '/api/workboard/github');

  assert.deepEqual(rewrite, {
    source: '/api/workboard/github',
    destination: '/api/session?route=workboard-github'
  });
});
