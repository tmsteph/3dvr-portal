import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/migrate-portal-do-edge.yml', import.meta.url),
  'utf8'
);

test('DigitalOcean cutover proves the edge before changing DNS', () => {
  const prove = workflow.indexOf('- name: Prove DigitalOcean HTTP edge externally');
  const dns = workflow.indexOf('- name: Point canonical portal DNS at DigitalOcean');
  assert.ok(prove >= 0);
  assert.ok(dns > prove);
  assert.match(workflow, /http:\/\/\$DO_HOST\/__3dvr-edge-health/);
  assert.match(workflow, /operatorApi!==\"native\"/);
});

test('DigitalOcean cutover keeps Vercel only as legacy API fallback', () => {
  assert.match(workflow, /LEGACY_API_ORIGIN=https:\/\/3dvr-portal\.vercel\.app/);
  assert.match(workflow, /vercel@59\.11\.7 dns update/);
  assert.match(workflow, /--type A --value '\$DO_HOST'/);
  assert.match(workflow, /Automatic rollback to Vercel backup/);
});
