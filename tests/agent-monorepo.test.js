import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('agent stays isolated inside the portal monorepo', async () => {
  const [rootPackageText, agentPackageText, workflow, vercelIgnore] = await Promise.all([
    read('package.json'),
    read('apps/agent/package.json'),
    read('.github/workflows/agent.yml'),
    read('.vercelignore'),
  ]);
  const rootPackage = JSON.parse(rootPackageText);
  const agentPackage = JSON.parse(agentPackageText);

  assert.equal(rootPackage.scripts.test, 'node --test tests/*.test.js tests/supabase/*.test.js');
  assert.equal(rootPackage.scripts['test:agent'], 'npm --prefix apps/agent test');
  assert.equal(rootPackage.scripts['test:all'], 'npm test && npm run test:agent');
  assert.equal(agentPackage.repository.url, 'git+https://github.com/tmsteph/3dvr-portal.git');
  assert.equal(agentPackage.repository.directory, 'apps/agent');
  assert.match(workflow, /working-directory: apps\/agent/);
  assert.match(workflow, /cache-dependency-path: apps\/agent\/package-lock\.json/);
  assert.match(workflow, /- "apps\/agent\/\*\*"/);
  assert.match(vercelIgnore, /^apps\/agent\/$/m);
});

test('installer and documentation point to the monorepo without changing the portal root', async () => {
  const [installer, readme, design] = await Promise.all([
    read('apps/agent/install.sh'),
    read('apps/agent/README.md'),
    read('docs/future-portal-agent-monorepo.md'),
  ]);

  assert.match(installer, /https:\/\/github\.com\/tmsteph\/3dvr-portal\.git/);
  assert.match(installer, /REPO_SUBDIR="apps\/agent"/);
  assert.match(installer, /THREEDVR_REPO_DIR/);
  assert.match(readme, /3dvr-portal\/apps\/agent/);
  assert.doesNotMatch(readme, /github\.com\/tmsteph\/3dvr-agent/);
  assert.match(design, /Status: implemented July 16, 2026/);
  assert.match(design, /Vercel excludes `apps\/agent`/);
});
