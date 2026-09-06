import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('self-host runtime exposes native API coverage and migration telemetry', async () => {
  const server = await read('scripts/self-host-server.mjs');

  for (const modulePath of [
    "../api/calendar/[provider].js",
    "../api/calendar/reminder-email.js",
    "../api/github-publish.js",
    "../api/growth/homepage-hero-cron.js",
    "../api/money/autopilot-cron.js",
    "../api/money/loop.js",
    "../api/openai-site.js",
    "../api/session.js",
    "../api/stripe/[route].js",
    "../api/trial.js",
    "../api/webhooks/stripe.js",
  ]) assert.match(server, new RegExp(modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  for (const route of [
    '/api/calendar/', '/api/calendar/reminder-email', '/api/github-publish',
    '/api/growth/homepage-hero-cron', '/api/money/autopilot-cron', '/api/money/loop',
    '/api/openai-site', '/api/session', '/api/stripe/', '/api/trial', '/webhooks/stripe',
  ]) assert.ok(server.includes(route), `missing native route ${route}`);

  assert.match(server, /__3dvr-readiness/);
  assert.match(server, /legacyFallbackRequests/);
  assert.match(server, /X-3DVR-API-Backend/);
  assert.match(server, /cutoverReady: environment\.ok && !legacyApiFallback/);
  assert.match(server, /runStripeWebhook/);
});

test('readiness checker can hard-fail any Vercel dependency before cutover', async () => {
  const checker = await read('scripts/ops/check-self-host-readiness.mjs');
  assert.match(checker, /--require-no-legacy/);
  assert.match(checker, /legacy Vercel API fallback is still enabled/);
  assert.match(checker, /legacyFallbackRequestCount/);
  assert.match(checker, /cutover readiness failed/);
  assert.match(checker, /private-files-hidden/);
  assert.match(checker, /host-routing/);
});

test('edge migration is manual, staged, verified, and rollback-capable', async () => {
  const workflow = await read('.github/workflows/migrate-portal-ovh-edge.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.match(workflow, /default: stage/);
  assert.match(workflow, /confirm.*portal\.3dvr\.tech|portal\.3dvr\.tech.*confirm/s);
  assert.match(workflow, /--require-no-legacy/);
  assert.match(workflow, /VERCEL_ORIGIN_CNAME: cname\.vercel-dns\.com\./);
  assert.match(workflow, /Roll DNS back to Vercel if cutover verification fails/);

  const readiness = workflow.indexOf('Verify the intended self-host release and readiness');
  const edge = workflow.indexOf('Prove OVH port 80 works from outside before any DNS change');
  const dns = workflow.indexOf('Point canonical portal DNS at OVH');
  const rollback = workflow.indexOf('Roll DNS back to Vercel if cutover verification fails');
  assert.ok(readiness >= 0 && edge > readiness && dns > edge && rollback > dns);
});

test('self-host operating mode is explicit and reversible', async () => {
  const mode = await read('scripts/ops/configure-self-host-mode.sh');
  const deploy = await read('scripts/ops/deploy-self-host-portal.sh');
  assert.match(mode, /shadow\)/);
  assert.match(mode, /independent\)/);
  assert.match(mode, /THREEDVR_LEGACY_API_ORIGIN=/);
  assert.match(deploy, /portal-settings\.env/);
  const settingsLoad = deploy.indexOf('. "$settings_env"');
  const legacyDefault = deploy.indexOf('legacy_api_origin="${THREEDVR_LEGACY_API_ORIGIN-https://3dvr-portal.vercel.app}"');
  assert.ok(settingsLoad >= 0 && legacyDefault > settingsLoad, 'settings must load before the fallback default is resolved');
});
