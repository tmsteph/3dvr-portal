import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('portal customer journey pages', () => {
  it('gives the portal home a clear concrete entry path', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /Pick one clear starting point/);
    assert.match(html, /Open Life for a daily check-in\./);
    assert.match(html, /Daily check-in/);
    assert.match(html, /Small group/);
    assert.match(html, /Browse apps/);
    assert.match(html, /Choose the kind of help you need/);
    assert.match(html, /Start Your Thing/);
    assert.match(html, /Log how you feel, what happened today, and what matters tomorrow\./);
  });

  it('keeps the free trial page tied to the portal account journey', async () => {
    const html = await readFile(new URL('../free-trial.html', import.meta.url), 'utf8');
    assert.match(html, /Find your passions and organize your life/);
    assert.match(html, /Create or use one portal account/);
    assert.match(html, /Send free-plan link/);
    assert.match(html, /Sign in or create account/);
    assert.match(html, /Open billing center/);
  });

  it('turns the start page into a concrete onboarding-first decision hub', async () => {
    const html = await readFile(new URL('../start/index.html', import.meta.url), 'utf8');
    assert.match(html, /Pick one clear starting point/);
    assert.match(html, /If you feel lost, open Life\./);
    assert.match(html, /Choose what you need today/);
    assert.match(html, /Open Life/);
    assert.match(html, /Open Cell/);
    assert.match(html, /Open Projects/);
    assert.match(html, /Use them in this order/);
    assert.match(html, /Life: 3-minute check-in/);
    assert.match(html, /Cell: weekly support group/);
    assert.match(html, /Projects: launch real work/);
    assert.match(html, /Already have a plan or account\?/);
    assert.match(html, /Open the page you actually need/);
    assert.match(html, /mailto:3dvr\.tech@gmail\.com/);
    assert.match(html, /href="\.\.\/sign-in\.html">Open sign-in<\/a>/);
  });
});
