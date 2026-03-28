import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('portal customer journey pages', () => {
  it('gives the portal home a clear new-vs-returning entry path', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /Choose your path into the portal/);
    assert.match(html, /New here\? Choose a plan, create your account, and continue inside the portal\./);
    assert.match(html, /New here\? Start here/);
    assert.match(html, /Manage billing/);
    assert.match(html, /Browse apps/);
  });

  it('keeps the free trial page tied to the portal account journey', async () => {
    const html = await readFile(new URL('../free-trial.html', import.meta.url), 'utf8');
    assert.match(html, /Start free inside the portal/);
    assert.match(html, /Create or use one portal account/);
    assert.match(html, /Send free-plan link/);
    assert.match(html, /Sign in or create account/);
    assert.match(html, /Open billing center/);
  });

  it('turns the start page into a simple decision hub', async () => {
    const html = await readFile(new URL('../start/index.html', import.meta.url), 'utf8');
    assert.match(html, /Choose your next step/);
    assert.match(html, /Pick a plan on 3dvr\.tech, create one portal account, and continue here\./);
    assert.match(html, /Choose a plan/);
    assert.match(html, /Already have a plan\?/);
    assert.match(html, /Open the page you actually need/);
    assert.match(html, /mailto:3dvr\.tech@gmail\.com/);
    assert.match(html, /href="\.\.\/calendar\/index\.html">Open calendar<\/a>/);
    assert.doesNotMatch(html, /cal\.com\/3dvr\/intro/);
  });
});
