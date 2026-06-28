import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('3DVR Forge product route', () => {
  it('ships a guest-first Forge landing and conversation shell', async () => {
    const html = await readFile(new URL('../forge/index.html', import.meta.url), 'utf8');

    assert.match(html, /<title>3DVR Forge \| Turn frustration into a project<\/title>/);
    assert.match(html, /href="\.\.\/index\.html">Portal<\/a>/);
    assert.match(html, /href="\.\.\/launch-room\/">Launch Room<\/a>/);
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
    assert.match(html, /src="\/gun-init\.js"/);
    assert.match(html, /3DVR Forge/);
    assert.match(html, /Turn your frustration into a project\./);
    assert.match(html, /Rant, ramble, complain, dream, or describe the thing you can't stop thinking about\./);
    assert.match(html, /Enter the Forge/);
    assert.match(html, /What(?:&rsquo;|’)s been bothering you lately\?/);
    assert.match(html, /data-forge-form/);
    assert.match(html, /data-forge-answer/);
    assert.match(html, /data-brief-output/);
    assert.match(html, /Make test message/);
    assert.match(html, /Make Codex prompt/);
    assert.match(html, /Make landing page copy/);
    assert.match(html, /Make 7-day checklist/);
    assert.doesNotMatch(html, /sign[- ]?in/i);
    assert.doesNotMatch(html, /create an account/i);
  });

  it('uses the Forge API first and keeps local fallback behavior', async () => {
    const app = await readFile(new URL('../forge/app.js', import.meta.url), 'utf8');

    assert.match(app, /import \{ readDefaultSecret \} from '\.\.\/web-builder-app\/defaults\.js'/);
    assert.match(app, /const STORAGE_KEY = '3dvr\.forge\.session\.v1'/);
    assert.match(app, /const FORGE_MODEL = 'gpt-4\.1-mini'/);
    assert.match(app, /SHARED_DEFAULTS_WAIT_MS/);
    assert.match(app, /INTRO: 'intro'/);
    assert.match(app, /INITIAL: 'initial'/);
    assert.match(app, /FOLLOWUPS: 'followups'/);
    assert.match(app, /GENERATING: 'generating'/);
    assert.match(app, /BRIEF: 'brief'/);
    assert.match(app, /subscribeToSharedDefaults/);
    assert.match(app, /waitForSharedSecret\('openai'/);
    assert.match(app, /readDefaultSecret\(data, 'openai'\)/);
    assert.match(app, /fetch\('\/api\/openai-site'/);
    assert.match(app, /forge:\s*true/);
    assert.match(app, /requestForge\('followups'/);
    assert.match(app, /requestForge\('brief'/);
    assert.match(app, /function chooseFollowUps\(initial\)/);
    assert.match(app, /function buildMockMovementBrief\(currentSession\)/);
    assert.match(app, /normalizeFollowUpsResponse/);
    assert.match(app, /normalizeBriefResponse/);
    assert.match(app, /local fallback brief was generated/);
    assert.match(app, /Who else has this problem\?/);
    assert.match(app, /What have you already tried\?/);
    assert.match(app, /What would a tiny version look like in 7 days\?/);
    assert.match(app, /What skills or resources do you already have\?/);
    assert.match(app, /Do you want this to become a tool, service, community, content project, or business\?/);

    [
      'Project Name',
      'Core Frustration',
      'Audience',
      'Project Concept',
      'Tiny 7-Day Experiment',
      'First 3 Actions',
      'Test Message',
      'Codex Build Prompt',
      'Reality Check',
    ].forEach((section) => {
      assert.match(app, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    assert.match(app, /Good raw material\. Too vague right now/);
    assert.match(app, /This is probably not a startup yet\. It is a test\./);
    assert.match(app, /Do not build an app yet/);
    assert.match(app, /navigator\.clipboard\.writeText/);
    assert.match(app, /type: 'text\/markdown'/);
    assert.match(app, /window\.localStorage\.setItem\(STORAGE_KEY/);
  });

  it('keeps the Forge CSS mobile-safe and free from viewport-width overflow traps', async () => {
    const css = await readFile(new URL('../forge/styles.css', import.meta.url), 'utf8');

    assert.match(css, /html,\s*body\s*\{\s*overflow-x:\s*hidden;/);
    assert.match(css, /\.forge-shell\s*\{\s*width:\s*min\(100%,\s*1180px\);/);
    assert.match(css, /\.forge-workspace\s*\{\s*display:\s*grid;/);
    assert.match(css, /min-width:\s*0/);
    assert.match(css, /@media \(min-width: 940px\)/);
    assert.match(css, /@media \(max-width: 640px\)/);
    assert.doesNotMatch(css, /width:\s*100vw/);
    assert.doesNotMatch(css, /(^|[;{]\s*)min-width:\s*\d{3,}px/m);
  });

  it('promotes Forge from the portal without changing the workshop default', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

    assert.match(html, /data-view-mode="workshop" data-active-room=""/);
    assert.match(html, /<a href="forge\/">Forge<\/a>/);
    assert.match(html, /href="forge\/" class="cta primary">Enter the Forge<\/a>/);
    assert.match(html, /href="forge\/" class="app-card" data-app-keywords="[^"]*\bfrustration\b[^"]*\bmovement brief\b[^"]*"/);
    assert.match(html, /<span class="app-card__title">3DVR Forge<\/span>/);
    assert.match(html, /Rant, reflect, and turn messy thoughts into a Movement Brief and 7-day test\./);
    assert.match(html, /projects:\s*\[[\s\S]*?'3DVR Forge'/);
  });
});
