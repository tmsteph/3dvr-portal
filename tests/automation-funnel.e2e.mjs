import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { openFunnelStore } from '../src/automation-funnel/store.js';
import '../src/auth/sea.js';
import SEA from 'gun/sea.js';

const temp = mkdtempSync(join(tmpdir(), '3dvr-funnel-e2e-'));
const pair = await SEA.pair();
const port = 5371;
const origin = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['scripts/self-host-server.mjs'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PORTAL_ORIGIN: origin,
    AUTOMATION_FUNNEL_DB: join(temp, 'state', 'leads.sqlite'), THREEDVR_OPERATOR_OWNER_PUBS: pair.pub }, stdio: 'pipe'
});
let output = '';
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { output += data; });
async function post(body) {
  const res = await fetch(origin + '/api/automation-funnel', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
async function owner(action, data = {}, selectedPair = pair) {
  const requestId = crypto.randomUUID();
  const proof = { scope: 'automation-funnel', pub: selectedPair.pub, alias: 'test', origin, iat: Date.now(), action, requestId, data: JSON.stringify(data) };
  const authProof = await SEA.sign(proof, selectedPair);
  return post({ action, data, requestId, authPub: selectedPair.pub, authProof: typeof authProof === 'string' ? authProof : JSON.stringify(authProof) });
}
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(origin + '/__3dvr-health')).ok) break; } catch {}
    if (i === 59) throw new Error('Server failed to start: ' + output.slice(-1200));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal((await fetch(origin + '/automation-help/')).status, 200);
  assert.equal((await post({ action: 'list' })).status, 401);
  assert.equal((await owner('list', {}, await SEA.pair())).status, 403);
  const submitted = await post({ lead: { name: 'Test Buyer', business: 'Example Test Company', email: 'buyer@example.test',
    problem: 'Intake is stuck', stack: 'n8n', impact: '2 hours a day', budget: '600-1499', authority: 'yes', timeline: 'this-month', consent: true } });
  assert.equal(submitted.status, 201);
  let listed = await owner('list');
  assert.equal(listed.status, 200); assert.equal(listed.body.leads.length, 1);
  const lead = listed.body.leads[0];
  assert.equal(lead.score, 10);
  assert.equal((await owner('update', { id: lead.id, version: lead.version, lead: { stage: 'replied', nextAction: 'Agree diagnostic scope' } })).status, 200);
  assert.equal((await owner('update', { id: lead.id, version: lead.version, lead: { stage: 'lost' } })).status, 409);
  const draft = await owner('draft', { id: lead.id });
  assert.equal(draft.status, 200); assert.match(draft.body.draft.body, /\$200 diagnostic/);
  assert.equal((await fetch(origin + '/src/automation-funnel/store.js')).status, 404);
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(origin + '/automation-help/');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: temp + '/intake-' + width + '.png', fullPage: true });
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(origin + '/automation-help/');
    await page.getByLabel('Your name', { exact: true }).fill('Mobile Buyer');
    await page.getByLabel('Business', { exact: true }).fill('Mobile Test Co');
    await page.getByLabel('Email', { exact: true }).fill('mobile@example.test');
    await page.getByLabel('What should happen, and what happens today?').fill('Connect our existing automation');
    await page.getByLabel('Approved budget').selectOption('200-599');
    await page.getByLabel('Can you approve the project?').selectOption('yes');
    await page.locator('input[name=consent]').check();
    await page.getByRole('button', { name: 'Send inquiry' }).click();
    await page.locator('#status.success').waitFor();
    assert.match(await page.locator('#status').innerText(), /inquiry is saved/);
    const admin = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await admin.route('https://cdn.jsdelivr.net/npm/gun/**', async route => {
      const sea = route.request().url().endsWith('sea.js');
      const path = '/opt/3dvr-portal-production/current/node_modules/gun/' + (sea ? 'sea.js' : 'gun.js');
      await route.fulfill({ path, contentType: 'text/javascript' });
    });
    await admin.addInitScript(testPair => {
      sessionStorage.setItem('pair', JSON.stringify(testPair));
      sessionStorage.setItem('recall', 'true');
      window.__DISABLE_GUN_DEFAULT_PEERS__ = true;
    }, pair);
    await admin.goto(origin + '/growth-desk/funnel.html');
    await admin.locator('#workspace:not([hidden])').waitFor({ timeout: 15000 });
    assert.equal(await admin.locator('.lead').count(), 2);
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await admin.locator('.draft-button').first().click();
    await admin.locator('.draft:not([hidden])').waitFor();
    await admin.screenshot({ path: temp + '/pipeline-mobile.png', fullPage: true });
    await page.close(); await admin.close();
  } finally { await browser.close(); }
  // Independent reopened connection proves persistence beyond handler memory.
  const reopened = openFunnelStore(join(temp, 'state', 'leads.sqlite'));
  assert.equal(reopened.list().length, 2); reopened.close();
  console.log(JSON.stringify({ ok: true, checks: 'HTTP, signed owner/non-owner, intake, updates, conflict, draft, private paths, durable reopen, mobile form and owner pipeline', screenshots: temp }));
} finally {
  child.kill('SIGTERM');
}
