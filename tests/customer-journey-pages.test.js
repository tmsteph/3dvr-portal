import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('portal customer journey pages', () => {
  it('gives the portal home a clear direction-community-build entry path', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /Find your direction inside the portal/);
    assert.match(html, /Start with Life if things feel unclear\./);
    assert.match(html, /Start with Life/);
    assert.match(html, /Join a Cell/);
    assert.match(html, /Browse apps/);
    assert.match(html, /Start with the part you need right now/);
    assert.match(html, /Start Your Thing/);
  });

  it('keeps the free trial page tied to the portal account journey', async () => {
    const html = await readFile(new URL('../free-trial.html', import.meta.url), 'utf8');
    assert.match(html, /Find your passions and organize your life/);
    assert.match(html, /Create or use one portal account/);
    assert.match(html, /Send free-plan link/);
    assert.match(html, /Sign in or create account/);
    assert.match(html, /Open billing center/);
  });

  it('turns the start page into an onboarding-first decision hub', async () => {
    const html = await readFile(new URL('../start/index.html', import.meta.url), 'utf8');
    assert.match(html, /Get clear, join community, and start your thing/);
    assert.match(html, /Start with Life for\s+direction, join a Cell for accountability/);
    assert.match(html, /Choose the help you need right now/);
    assert.match(html, /Open Life/);
    assert.match(html, /Open Cell/);
    assert.match(html, /Open Projects/);
    assert.match(html, /Build momentum in order/);
    assert.match(html, /Already have a plan or account\?/);
    assert.match(html, /Open the page you actually need/);
    assert.match(html, /mailto:3dvr\.tech@gmail\.com/);
    assert.match(html, /href="\.\.\/sign-in\.html">Open sign-in<\/a>/);
  });
});
